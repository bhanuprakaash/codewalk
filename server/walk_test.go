package server

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func do(h http.Handler, method, target, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, newRequest(method, target, body))
	return rec
}

func newRequest(method, target, body string) *http.Request {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req.Host = "127.0.0.1:47474"
	if method != http.MethodGet {
		req.Header.Set("Content-Type", "application/json")
	}
	return req
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestWalk(t *testing.T) {
	data := t.TempDir()
	writeFile(t, filepath.Join(data, "p/s/walk.json"), `{"title":"T",  "n":1}`)
	writeFile(t, filepath.Join(data, "p/empty/storyboard.json"), `{}`)
	h := Handler(data)

	tests := []struct {
		target string
		status int
		body   string
	}{
		{"/api/walk?project=p&scope=s", 200, `{"title":"T",  "n":1}`},
		{"/api/walk?project=p&scope=empty", 404, `{"error":"No walk for this scope yet. Run codewalk validate on its storyboard."}` + "\n"},
		{"/api/walk?project=p&scope=nope", 404, `{"error":"No such scope: p/nope."}` + "\n"},
		{"/api/walk?project=p&scope=..", 400, `{"error":"project and scope are required and must be plain names."}` + "\n"},
		{"/api/walk?project=../p&scope=s", 400, `{"error":"project and scope are required and must be plain names."}` + "\n"},
		{"/api/walk?project=p", 400, `{"error":"project and scope are required and must be plain names."}` + "\n"},
	}
	for _, tt := range tests {
		rec := do(h, "GET", tt.target, "")
		if rec.Code != tt.status || rec.Body.String() != tt.body {
			t.Errorf("%s: got %d %q, want %d %q", tt.target, rec.Code, rec.Body.String(), tt.status, tt.body)
		}
	}
}

func TestUser(t *testing.T) {
	data := t.TempDir()
	writeFile(t, filepath.Join(data, "p/s/walk.json"), `{}`)
	h := Handler(data)
	url := "/api/user?project=p&scope=s"

	if rec := do(h, "GET", url, ""); rec.Code != 200 || rec.Body.String() != "{}" {
		t.Fatalf("missing user.json: got %d %q, want 200 {}", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(data, "p/s/user.json")); err == nil {
		t.Fatal("GET created user.json")
	}

	user := func() string { b, _ := os.ReadFile(filepath.Join(data, "p/s/user.json")); return string(b) }
	patch := func(body string) {
		t.Helper()
		if rec := do(h, "PATCH", url, body); rec.Code != 204 {
			t.Fatalf("PATCH %s: got %d %q, want 204", body, rec.Code, rec.Body.String())
		}
	}
	patch(`{"positions":{"send":{"nodes":{"ui":{"x":1,"y":2}}}}}`)
	patch(`{"seenSha":"abc1234"}`)
	patch(`{"positions":{"recv":{"nodes":{}}},"notes":{"a":"one","b":"two"}}`)
	want := `{"notes":{"a":"one","b":"two"},"positions":{"recv":{"nodes":{}},"send":{"nodes":{"ui":{"x":1,"y":2}}}},"seenSha":"abc1234"}`
	if user() != want {
		t.Fatalf("user.json after patches: got %q, want %q", user(), want)
	}
	if rec := do(h, "GET", url, ""); rec.Body.String() != want {
		t.Fatalf("GET: got %q, want %q", rec.Body.String(), want)
	}
	patch(`{"notes":{"a":null},"positions":{"send":null}}`)
	patch(`{"notes":{"c":"three"}}`)
	want = `{"notes":{"b":"two","c":"three"},"positions":{"recv":{"nodes":{}}},"seenSha":"abc1234"}`
	if user() != want {
		t.Fatalf("user.json after delete: got %q, want %q", user(), want)
	}
	if entries, _ := os.ReadDir(filepath.Join(data, "p/s")); len(entries) != 2 {
		t.Fatalf("temp file left behind: %v", entries)
	}

	var wg sync.WaitGroup
	for i := range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			do(h, "PATCH", url, fmt.Sprintf(`{"notes":{"n%d":"x"}}`, i))
		}()
	}
	wg.Wait()
	for i := range 20 {
		if !strings.Contains(user(), fmt.Sprintf(`"n%d":"x"`, i)) {
			t.Fatalf("concurrent patch %d lost: %s", i, user())
		}
	}

	for _, bad := range []string{`not json`, `[1]`, `null`, ``, `{"notes":["x"]}`, `{"positions":null}`} {
		if rec := do(h, "PATCH", url, bad); rec.Code != 400 {
			t.Errorf("PATCH %q: got %d, want 400", bad, rec.Code)
		}
	}
	if rec := do(h, "PUT", url, `{}`); rec.Code != 404 {
		t.Errorf("PUT: got %d, want 404", rec.Code)
	}
	writeFile(t, filepath.Join(data, "p/s/user.json"), `{corrupt`)
	patch(`{"seenSha":"abc1234"}`)
	if user() != `{"seenSha":"abc1234"}` {
		t.Errorf("patch over a corrupt file: got %q", user())
	}
	if rec := do(h, "PATCH", "/api/user?project=p&scope=new", `{}`); rec.Code != 404 {
		t.Errorf("PATCH to a scope that does not exist: got %d, want 404", rec.Code)
	}
	if _, err := os.Stat(filepath.Join(data, "p/new")); err == nil {
		t.Error("PATCH created the scope directory")
	}
}

func TestCode(t *testing.T) {
	data, repo := t.TempDir(), t.TempDir()
	writeFile(t, filepath.Join(data, "p/s/walk.json"), `{"repo":"`+repo+`"}`)
	writeFile(t, filepath.Join(repo, "a/b.go"), "l1\nl2\nl3\n")
	writeFile(t, filepath.Join(filepath.Dir(repo), "outside.txt"), "secret")
	h := Handler(data)

	rec := do(h, "GET", "/api/code?project=p&scope=s&path=a/b.go&line=2", "")
	want := `{"hl":[[2,2]],"lines":["l1","l2","l3",""],"path":"a/b.go","start":1}` + "\n"
	if rec.Code != 200 || rec.Body.String() != want {
		t.Errorf("got %d %q, want 200 %q", rec.Code, rec.Body.String(), want)
	}
	writeFile(t, filepath.Join(repo, ".git/config"), "[core]")
	writeFile(t, filepath.Join(repo, "big.txt"), strings.Repeat("x", 1<<20+1))
	for link, target := range map[string]string{
		"out.txt": filepath.Join(filepath.Dir(repo), "outside.txt"),
		"gitc":    ".git/config",
		"dir":     "a",
		"in.go":   "a/b.go",
	} {
		if err := os.Symlink(target, filepath.Join(repo, link)); err != nil {
			t.Fatal(err)
		}
	}
	for path, status := range map[string]int{
		"../outside.txt": 404, "/etc/hosts": 404, "a/missing.go": 404, "a": 404,
		".git/config": 404, ".GIT/config": 404, "a/../.git/config": 404, "out.txt": 404, "gitc": 404,
		"big.txt": 413, "in.go": 200, "dir/b.go": 200,
	} {
		if rec := do(h, "GET", "/api/code?project=p&scope=s&path="+path, ""); rec.Code != status {
			t.Errorf("path %q: got %d %q, want %d", path, rec.Code, rec.Body.String(), status)
		}
	}
}

func TestAsk(t *testing.T) {
	data, repo, bin := t.TempDir(), t.TempDir(), t.TempDir()
	writeFile(t, filepath.Join(data, "p/s/walk.json"), `{"repo":"`+repo+`","scope":"run/","commit":"0123456789"}`)
	writeFile(t, filepath.Join(bin, "claude"), `#!/bin/sh
printf '%s\n' "$@" > "$0.argv"
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"'"$PWD"'/run/run.go"}},{"type":"text","text":"partial"}]}}'
printf '{"type":"result","result":"answered in %s","session_id":"s1"}\n' "$PWD"
`)
	if err := os.Chmod(filepath.Join(bin, "claude"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+":"+os.Getenv("PATH"))
	h := Handler(data)

	rec := do(h, "POST", "/api/ask?project=p&scope=s", `{"question":"why?","context":{"lines":["View: overview."]}}`)
	want := `{"step":"Read run/run.go"}` + "\n" +
		`{"text":"partial"}` + "\n" +
		`{"answer":"answered in ` + repo + `","done":true,"session":"s1"}` + "\n"
	if rec.Code != 200 || rec.Body.String() != want {
		t.Errorf("got %d %q, want 200 %q", rec.Code, rec.Body.String(), want)
	}
	if rec := do(h, "POST", "/api/ask?project=p&scope=s", `{"question":""}`); rec.Code != 400 {
		t.Errorf("empty question: got %d, want 400", rec.Code)
	}

	for _, session := range []string{"--model", "s1", "0123456789abcdef", "0123456789ab-cdef-0123-4567-89abcdef0123", "01234567-89AB-CDEF-0123-456789ABCDEF"} {
		body := `{"question":"why?","session":"` + session + `"}`
		if rec := do(h, "POST", "/api/ask?project=p&scope=s", body); rec.Code != 400 {
			t.Errorf("session %q: got %d, want 400", session, rec.Code)
		}
	}
	os.Remove(filepath.Join(bin, "claude.argv"))
	uuid := "01234567-89ab-cdef-0123-456789abcdef"
	if rec := do(h, "POST", "/api/ask?project=p&scope=s", `{"question":"--help","session":"`+uuid+`"}`); rec.Code != 200 {
		t.Fatalf("good session: got %d %q", rec.Code, rec.Body.String())
	}
	argv, _ := os.ReadFile(filepath.Join(bin, "claude.argv"))
	if !strings.Contains(string(argv), "\n--resume\n"+uuid+"\n--\n") || !strings.HasSuffix(string(argv), "Question: --help\n") {
		t.Errorf("argv = %q, want --resume %s and the prompt after --", argv, uuid)
	}
}

func TestSystem(t *testing.T) {
	data := t.TempDir()
	writeFile(t, filepath.Join(data, "p/system.built.json"), `{"title":"P"}`)
	writeFile(t, filepath.Join(data, "p/system-arch.built.json"), `{"title":"A"}`)
	writeFile(t, filepath.Join(data, "q/s/walk.json"), `{}`)
	h := Handler(data)

	tests := []struct {
		target string
		status int
		body   string
	}{
		{"/api/system?project=p", 200, `{"title":"P"}`},
		{"/api/system?project=p&id=arch", 200, `{"title":"A"}`},
		{"/api/system?project=q", 404, `{"error":"No system view here yet. Run codewalk validate on its system.json."}` + "\n"},
		{"/api/system?project=p&id=../x", 400, `{"error":"id must be a plain name."}` + "\n"},
		{"/api/system?project=..", 400, `{"error":"project and scope are required and must be plain names."}` + "\n"},
		{"/api/system?project=nope", 404, `{"error":"No such project: nope."}` + "\n"},
	}
	for _, tt := range tests {
		rec := do(h, "GET", tt.target, "")
		if rec.Code != tt.status || rec.Body.String() != tt.body {
			t.Errorf("%s: got %d %q, want %d %q", tt.target, rec.Code, rec.Body.String(), tt.status, tt.body)
		}
	}
	if rec := do(h, "PATCH", "/api/user?project=p", `{"positions":{}}`); rec.Code != 204 {
		t.Fatalf("PATCH project user.json: got %d", rec.Code)
	}
	if got, _ := os.ReadFile(filepath.Join(data, "p/user.json")); string(got) != `{"positions":{}}` {
		t.Errorf("project user.json = %q", got)
	}
}
