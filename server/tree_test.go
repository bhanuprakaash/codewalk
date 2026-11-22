package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeFiles(t *testing.T, root string, files map[string]string) {
	t.Helper()
	for rel, content := range files {
		p := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func get(h http.Handler, target string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, newRequest(http.MethodGet, target, ""))
	return rec
}

func TestTree(t *testing.T) {
	data := t.TempDir()
	writeFiles(t, data, map[string]string{
		"sd/project.json":                 `{"name":"System design"}`,
		"sd/index.map.json":               `{"title":"Roadmap"}`,
		"sd/notes.txt":                    `ignored`,
		"sd/.hidden/index.html":           `ignored`,
		"sd/empty/readme.txt":             `no entry, no pages: left out`,
		"sd/caching/index.html":           `<html><title>Caching &amp; you</title>`,
		"sd/caching/index.map.json":       `{"title":"Caching map"}`,
		"sd/caching/index.user.json":      `{}`,
		"sd/caching/eviction.html":        `<title>Eviction</title>`,
		"sd/caching/deep/more.map.json":   `{"title":"More"}`,
		"code/system.json":                `{}`,
		"code/system-run.json":            `{}`,
		"code/system-run.built.json":      `{}`,
		"code/run/walk.json":              `{}`,
		"code/run/capture/main/state.txt": `not listed`,
		"code/nested/deep/walk.json":      `{}`,
		"both/index.html":                 `<title>Home</title>`,
		"both/system.built.json":          `{}`,
	})
	h := Handler(data)
	tests := []struct{ project, want string }{
		{"sd", `{"name":"sd","path":"","kind":"dir","title":"Roadmap","entry":["map"],"kids":[` +
			`{"name":"caching","path":"caching","kind":"dir","title":"Caching \u0026 you","entry":["page","map"],"kids":[` +
			`{"name":"deep","path":"caching/deep","kind":"dir","kids":[{"name":"more.map.json","path":"caching/deep/more.map.json","kind":"map","title":"More"}]},` +
			`{"name":"eviction.html","path":"caching/eviction.html","kind":"page","title":"Eviction"}]}]}`},
		{"code", `{"name":"code","path":"","kind":"dir","entry":["system"],"kids":[` +
			`{"name":"nested","path":"nested","kind":"dir","kids":[{"name":"deep","path":"nested/deep","kind":"dir","entry":["walk"]}]},` +
			`{"name":"run","path":"run","kind":"dir","entry":["walk"]},` +
			`{"name":"system-run.json","path":"system-run.json","kind":"system","title":"run"}]}`},
		{"both", `{"name":"both","path":"","kind":"dir","title":"Home","entry":["page"],"kids":[` +
			`{"name":"system.json","path":"system.json","kind":"system","title":"System"}]}`},
	}
	for _, tt := range tests {
		rec := get(h, "/api/tree?project="+tt.project)
		if got := strings.TrimSpace(rec.Body.String()); rec.Code != 200 || got != tt.want {
			t.Errorf("%s: got %d\n%s\nwant\n%s", tt.project, rec.Code, got, tt.want)
		}
	}
	if rec := get(h, "/api/tree?project=../x"); rec.Code != http.StatusBadRequest {
		t.Errorf("bad project: got %d", rec.Code)
	}
}

func TestFiles(t *testing.T) {
	base := t.TempDir()
	data := filepath.Join(base, "data")
	writeFiles(t, base, map[string]string{
		"secret.txt":                     "outside",
		"data/other/private.html":        "another project",
		"data/sd/index.html":             "<title>root</title>",
		"data/sd/caching/eviction.html":  "eviction",
		"data/sd/caching/.env":           "hidden",
		"data/sd/caching/index.map.json": `{"title":"m"}`,
	})
	if err := os.Symlink(filepath.Join(base, "secret.txt"), filepath.Join(data, "sd", "link.txt")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(data, "sd", "caching"), filepath.Join(data, "sd", "alias")); err != nil {
		t.Fatal(err)
	}
	h := Handler(data)
	tests := []struct {
		target string
		status int
		body   string
	}{
		{"/files/sd/caching/eviction.html", 200, "eviction"},
		{"/files/sd/alias/eviction.html", 200, "eviction"},
		{"/files/sd/", 200, "<title>root</title>"},
		{"/files/sd/caching/index.map.json", 200, `{"title":"m"}`},
		{"/files/sd/caching/.env", 404, ""},
		{"/files/sd/link.txt", 404, ""},
		{"/files/sd/../secret.txt", 404, ""},
		{"/files/sd/%2e%2e/secret.txt", 404, ""},
		{"/files/sd/..%2fother/private.html", 404, ""},
		{"/files/..%2fsecret.txt/x", 404, ""},
		{"/files/sd/caching/missing.html", 404, ""},
		{"/files/sd/caching", 404, ""},
	}
	for _, tt := range tests {
		rec := get(h, tt.target)
		// the mux cleans "..": a redirect never reaches the file handler, so count it as refused
		if (rec.Code == http.StatusMovedPermanently || rec.Code == http.StatusTemporaryRedirect) && tt.status == 404 {
			continue
		}
		if rec.Code != tt.status || tt.body != "" && rec.Body.String() != tt.body {
			t.Errorf("%s: got %d %q, want %d %q", tt.target, rec.Code, rec.Body.String(), tt.status, tt.body)
		}
		if rec.Code == 200 && !strings.Contains(rec.Header().Get("Content-Security-Policy"), "script-src 'none'") {
			t.Errorf("%s: no CSP blocking scripts", tt.target)
		}
	}
}

func TestUserBesideMap(t *testing.T) {
	data := t.TempDir()
	writeFiles(t, data, map[string]string{"sd/caching/index.map.json": `{}`, "sd/caching/page.html": ``})
	h := Handler(data)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, newRequest(http.MethodPatch, "/api/user?project=sd&map=caching/index.map.json", `{"notes":{"node:app":"hi"}}`))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("patch: got %d %s", rec.Code, rec.Body.String())
	}
	raw, err := os.ReadFile(filepath.Join(data, "sd", "caching", "index.user.json"))
	if err != nil || string(raw) != `{"notes":{"node:app":"hi"}}` {
		t.Fatalf("user file = %q, %v", raw, err)
	}
	for _, m := range []string{"caching/page.html", "../sd/caching/index.map.json", "caching/none.map.json"} {
		if rec := get(h, "/api/user?project=sd&map="+m); rec.Code != http.StatusNotFound {
			t.Errorf("map=%s: got %d", m, rec.Code)
		}
	}
}
