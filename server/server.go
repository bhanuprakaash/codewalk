package server

import (
	"encoding/json"
	"errors"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/bhanuprakaash/codewalk/web"
)

type project struct {
	Name string          `json:"name"`
	Info json.RawMessage `json:"info,omitempty"`
}

func Handler(dataDir string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/projects", func(w http.ResponseWriter, _ *http.Request) {
		projects, err := listProjects(dataDir)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(projects)
	})
	walkRoutes(mux, dataDir)
	treeRoutes(mux, dataDir)
	changeRoutes(mux, dataDir)
	mux.Handle("/api/", http.NotFoundHandler())
	mux.Handle("/", spa(web.FS()))
	return guard(mux)
}

var localHosts = []string{"codewalk.localhost", "localhost", "127.0.0.1"}

// guard keeps other web pages from driving the server through the browser: DNS rebinding changes
// the Host, and a cross-site form post carries a foreign Origin or a non-JSON content type.
func guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, port, err := net.SplitHostPort(r.Host)
		if err != nil {
			host, port = r.Host, ""
		}
		if !slices.Contains(localHosts, host) {
			writeError(w, http.StatusForbidden, "This host is not allowed.")
			return
		}
		switch r.Method {
		case http.MethodPost, http.MethodPut, http.MethodPatch:
			if mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); mt != "application/json" {
				writeError(w, http.StatusUnsupportedMediaType, "Send application/json.")
				return
			}
			if origin := r.Header.Get("Origin"); origin != "" {
				u, err := url.Parse(origin)
				if err != nil || u.Scheme != "http" || !slices.Contains(localHosts, u.Hostname()) || u.Port() != port {
					writeError(w, http.StatusForbidden, "This origin is not allowed.")
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

func spa(ui fs.FS) http.Handler {
	files := http.FileServerFS(ui)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/")
		if info, err := fs.Stat(ui, name); name == "" || err != nil || info.IsDir() {
			http.ServeFileFS(w, r, ui, "index.html")
			return
		}
		files.ServeHTTP(w, r)
	})
}

func listProjects(dataDir string) ([]project, error) {
	entries, err := os.ReadDir(dataDir)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	projects := []project{}
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		dir := filepath.Join(dataDir, e.Name())
		p := project{Name: e.Name()}
		if raw, err := os.ReadFile(filepath.Join(dir, "project.json")); err == nil && json.Valid(raw) {
			p.Info = raw
		}
		projects = append(projects, p)
	}
	return projects, nil
}
