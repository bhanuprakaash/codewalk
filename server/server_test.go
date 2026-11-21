package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestHandler_Projects(t *testing.T) {
	data := t.TempDir()
	write := func(rel, content string) {
		t.Helper()
		p := filepath.Join(data, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("alpha/project.json", `{"name":"Alpha","repo":"/src/alpha"}`)
	write("alpha/run/storyboard.json", `{}`)
	write("alpha/walk/walk.json", `{}`)
	write("alpha/capture/notes.txt", `not a scope`)
	write("beta/only/walk.json", `{}`)
	write("stray.txt", `not a project`)

	rec := httptest.NewRecorder()
	Handler(data).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/projects", nil))

	want := `[{"name":"alpha","info":{"name":"Alpha","repo":"/src/alpha"},"scopes":["run","walk"]},` +
		`{"name":"beta","scopes":["only"]}]` + "\n"
	if rec.Code != http.StatusOK || rec.Body.String() != want {
		t.Fatalf("got %d %q, want 200 %q", rec.Code, rec.Body.String(), want)
	}
}

func TestHandler_MissingDataDir(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	Handler(filepath.Join(t.TempDir(), "none")).ServeHTTP(rec, req)

	if rec.Body.String() != "[]\n" {
		t.Fatalf("got %q, want []", rec.Body.String())
	}
}
