package server

import (
	"encoding/json"
	"maps"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestChanges(t *testing.T) {
	data, repo := t.TempDir(), t.TempDir()
	git := func(args ...string) string {
		t.Helper()
		cmd := exec.Command("git", append([]string{"-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"}, args...)...)
		cmd.Dir = repo
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
		return strings.TrimSpace(string(out))
	}
	commit := func(src string) string {
		writeFile(t, filepath.Join(repo, "p/p.go"), src)
		git("add", ".")
		git("commit", "-q", "-m", "c")
		return git("rev-parse", "HEAD")
	}
	git("init", "-q")
	a := commit("package p\n\nfunc Kept() {}\n\nfunc Edited() int {\n\treturn 1\n}\n\nfunc Gone() {}\n")
	b := commit("package p\n\nfunc Kept() {}\n\nfunc Edited() int {\n\treturn 2\n}\n")
	writeFile(t, filepath.Join(data, "pr/s/walk.json"), `{"repo":"`+repo+`","commit":"`+a+`","nodes":{"k":{"symbol":"p:Kept"},"e":{"symbol":"p:Edited"},"g":{"symbol":"p:Gone"},"start":{}}}`)
	writeFile(t, filepath.Join(data, "pr/system.built.json"), `{"repo":"`+repo+`","commit":"`+a+`","boxes":{"p":{"pkg":"p"},"ui":{}}}`)
	h := Handler(data)

	states := func(target string) map[string]string {
		t.Helper()
		rec := do(h, "GET", target, "")
		var res changes
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil || rec.Code != 200 {
			t.Fatalf("%s: %d %s", target, rec.Code, rec.Body.String())
		}
		out := map[string]string{}
		for id, c := range res.Changes {
			out[id] = c.State
		}
		return out
	}
	for _, c := range []struct {
		target string
		want   map[string]string
	}{
		{"/api/changes?project=pr&scope=s", map[string]string{"e": "changed", "g": "removed"}},
		{"/api/changes?project=pr", map[string]string{"p": "changed"}},
	} {
		if got := states(c.target); !maps.Equal(got, c.want) {
			t.Errorf("%s: %v, want %v", c.target, got, c.want)
		}
	}

	if rec := do(h, "PATCH", "/api/user?project=pr&scope=s", `{"seenSha":"--output=x"}`); rec.Code != 204 {
		t.Fatalf("bad seenSha: %d", rec.Code)
	}
	if got := states("/api/changes?project=pr&scope=s"); !maps.Equal(got, map[string]string{"e": "changed", "g": "removed"}) {
		t.Errorf("bad seenSha falls back to the built commit: %v", got)
	}

	if rec := do(h, "PATCH", "/api/user?project=pr&scope=s", `{"seenSha":"`+b+`"}`); rec.Code != 204 {
		t.Fatalf("mark seen: %d", rec.Code)
	}
	if got := states("/api/changes?project=pr&scope=s"); len(got) != 0 {
		t.Errorf("after mark seen: %v", got)
	}
}
