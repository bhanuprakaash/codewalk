package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
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
	Handler(data).ServeHTTP(rec, newRequest(http.MethodGet, "/api/projects", ""))

	want := `[{"name":"alpha","info":{"name":"Alpha","repo":"/src/alpha"}},{"name":"beta"}]` + "\n"
	if rec.Code != http.StatusOK || rec.Body.String() != want {
		t.Fatalf("got %d %q, want 200 %q", rec.Code, rec.Body.String(), want)
	}
}

func TestHandler_MissingDataDir(t *testing.T) {
	rec := httptest.NewRecorder()
	req := newRequest(http.MethodGet, "/api/projects", "")
	Handler(filepath.Join(t.TempDir(), "none")).ServeHTTP(rec, req)

	if rec.Body.String() != "[]\n" {
		t.Fatalf("got %q, want []", rec.Body.String())
	}
}

func TestGuard(t *testing.T) {
	h := Handler(t.TempDir())
	tests := []struct {
		name, method, host, contentType, origin string
		status                                  int
	}{
		{"good host", "GET", "codewalk.localhost:47474", "", "", 200},
		{"localhost", "GET", "localhost:1", "", "", 200},
		{"foreign host", "GET", "evil.com", "", "", 403},
		{"foreign host with port", "GET", "evil.com:47474", "", "", 403},
		{"look-alike host", "GET", "127.0.0.1.evil.com:47474", "", "", 403},
		{"post without json", "POST", "localhost:47474", "text/plain", "", 415},
		{"put without content type", "PUT", "localhost:47474", "", "", 415},
		{"json with charset", "POST", "localhost:47474", "application/json; charset=utf-8", "http://localhost:47474", 400},
		{"foreign origin", "POST", "localhost:47474", "application/json", "http://evil.com:47474", 403},
		{"origin on another port", "POST", "localhost:47474", "application/json", "http://localhost:80", 403},
		{"https origin", "POST", "localhost:47474", "application/json", "https://localhost:47474", 403},
		{"good origin", "POST", "codewalk.localhost:47474", "application/json", "http://localhost:47474", 400},
	}
	for _, tt := range tests {
		target := "/api/projects"
		if tt.method != "GET" {
			target = "/api/ask"
		}
		req := httptest.NewRequest(tt.method, target, strings.NewReader("{}"))
		req.Host = tt.host
		if tt.contentType != "" {
			req.Header.Set("Content-Type", tt.contentType)
		}
		if tt.origin != "" {
			req.Header.Set("Origin", tt.origin)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != tt.status {
			t.Errorf("%s: got %d %q, want %d", tt.name, rec.Code, rec.Body.String(), tt.status)
		}
	}
}
