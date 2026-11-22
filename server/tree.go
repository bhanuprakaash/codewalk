package server

import (
	"encoding/json"
	"errors"
	"html"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
)

// entry is one folder or file of a project. A folder opens its entry files (in that order of
// preference: page, map, walk, system); its other pages and maps are listed as kids.
type entry struct {
	Name  string   `json:"name"`
	Path  string   `json:"path"`
	Kind  string   `json:"kind"`
	Title string   `json:"title,omitempty"`
	Entry []string `json:"entry,omitempty"`
	Kids  []entry  `json:"kids,omitempty"`
}

const pageCSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'none'; object-src 'none'; frame-ancestors 'self'"

func treeRoutes(mux *http.ServeMux, dataDir string) {
	mux.HandleFunc("GET /api/tree", func(w http.ResponseWriter, r *http.Request) {
		dir, ok := dirOf(w, r, dataDir, false)
		if !ok {
			return
		}
		root, err := listDir(dir, "", true)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		root.Name = r.URL.Query().Get("project")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(root)
	})

	// Pages, maps and whatever they reference, served as they are on disk. Pages are written by an
	// AI, so they never run scripts here: the CSP blocks them even when a page is opened directly.
	mux.HandleFunc("GET /files/{project}/{path...}", func(w http.ResponseWriter, r *http.Request) {
		full, err := inProject(dataDir, r.PathValue("project"), r.PathValue("path"))
		if err != nil {
			writeError(w, http.StatusNotFound, "No such file.")
			return
		}
		if st, err := os.Stat(full); err == nil && st.IsDir() {
			full = filepath.Join(full, "index.html")
		}
		f, err := os.Open(full)
		if err != nil {
			writeError(w, http.StatusNotFound, "No such file.")
			return
		}
		defer f.Close()
		st, err := f.Stat()
		if err != nil || !st.Mode().IsRegular() {
			writeError(w, http.StatusNotFound, "No such file.")
			return
		}
		w.Header().Set("Content-Security-Policy", pageCSP)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeContent(w, r, st.Name(), st.ModTime(), f)
	})
}

// inProject maps a project name and a slash path inside it to a real path, following symlinks.
// It fails for a path that is hidden, leaves the project, or does not exist.
func inProject(dataDir, project, rel string) (string, error) {
	if !plainName(project) || !localPath(rel) {
		return "", errors.New("not a plain path")
	}
	root, err := filepath.EvalSymlinks(filepath.Join(dataDir, project))
	if err != nil {
		return "", err
	}
	full, err := filepath.EvalSymlinks(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		return "", err
	}
	if back, err := filepath.Rel(root, full); err != nil || !filepath.IsLocal(back) {
		return "", errors.New("outside the project")
	}
	return full, nil
}

// localPath accepts "" (the folder itself) or a relative slash path with no hidden or ".." parts.
func localPath(rel string) bool {
	if rel == "" {
		return true
	}
	if strings.Contains(rel, `\`) || !filepath.IsLocal(filepath.FromSlash(rel)) {
		return false
	}
	for _, part := range strings.Split(strings.TrimSuffix(rel, "/"), "/") {
		if part == "" || strings.HasPrefix(part, ".") {
			return false
		}
	}
	return true
}

var systemChild = regexp.MustCompile(`^system-([^.]+)(\.built)?\.json$`)

func listDir(dir, rel string, root bool) (entry, error) {
	e := entry{Name: path.Base("/" + rel), Path: rel, Kind: "dir"}
	files, err := os.ReadDir(dir)
	if err != nil {
		return e, err
	}
	has := map[string]bool{}
	for _, f := range files {
		has[f.Name()] = !f.IsDir()
	}
	if has["walk.json"] || has["storyboard.json"] {
		e.Entry = []string{"walk"}
		return e, nil
	}
	if has["index.html"] {
		e.Entry = append(e.Entry, "page")
		e.Title = pageTitle(filepath.Join(dir, "index.html"))
	}
	if has["index.map.json"] {
		e.Entry = append(e.Entry, "map")
		if e.Title == "" {
			e.Title = mapTitle(filepath.Join(dir, "index.map.json"))
		}
	}
	if root && (has["system.json"] || has["system.built.json"]) {
		if len(e.Entry) == 0 {
			e.Entry = []string{"system"}
		} else {
			e.Kids = append(e.Kids, entry{Name: "system.json", Path: "system.json", Kind: "system", Title: "System"})
		}
	}
	seen := map[string]bool{}
	for _, f := range files {
		name, p := f.Name(), path.Join(rel, f.Name())
		switch {
		case strings.HasPrefix(name, "."):
		case f.IsDir():
			kid, err := listDir(filepath.Join(dir, name), p, false)
			if err != nil {
				return e, err
			}
			if len(kid.Entry) > 0 || len(kid.Kids) > 0 {
				e.Kids = append(e.Kids, kid)
			}
		case strings.HasSuffix(name, ".map.json") && name != "index.map.json":
			e.Kids = append(e.Kids, entry{Name: name, Path: p, Kind: "map", Title: mapTitle(filepath.Join(dir, name))})
		case strings.HasSuffix(name, ".html") && name != "index.html":
			e.Kids = append(e.Kids, entry{Name: name, Path: p, Kind: "page", Title: pageTitle(filepath.Join(dir, name))})
		case root && systemChild.MatchString(name):
			id := systemChild.FindStringSubmatch(name)[1]
			if !seen[id] {
				seen[id] = true
				e.Kids = append(e.Kids, entry{Name: "system-" + id + ".json", Path: "system-" + id + ".json", Kind: "system", Title: id})
			}
		}
	}
	return e, nil
}

var titleTag = regexp.MustCompile(`(?is)<title>(.*?)</title>`)

func pageTitle(file string) string {
	f, err := os.Open(file)
	if err != nil {
		return ""
	}
	defer f.Close()
	head, _ := io.ReadAll(io.LimitReader(f, 8<<10))
	if m := titleTag.FindSubmatch(head); m != nil {
		return strings.TrimSpace(html.UnescapeString(string(m[1])))
	}
	return ""
}

func mapTitle(file string) string {
	var m struct{ Title string }
	raw, err := os.ReadFile(file)
	if err == nil {
		json.Unmarshal(raw, &m)
	}
	return m.Title
}
