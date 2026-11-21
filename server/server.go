package server

import (
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/bhanuprakaash/codewalk/web"
)

type project struct {
	Name   string          `json:"name"`
	Info   json.RawMessage `json:"info,omitempty"`
	Scopes []string        `json:"scopes"`
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
	mux.Handle("/api/", http.NotFoundHandler())
	mux.Handle("/", spa(web.FS()))
	return mux
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
		if p.Scopes, err = listScopes(dir); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, nil
}

func listScopes(projectDir string) ([]string, error) {
	entries, err := os.ReadDir(projectDir)
	if err != nil {
		return nil, err
	}
	scopes := []string{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		for _, f := range []string{"storyboard.json", "walk.json"} {
			if _, err := os.Stat(filepath.Join(projectDir, e.Name(), f)); err == nil {
				scopes = append(scopes, e.Name())
				break
			}
		}
	}
	return scopes, nil
}
