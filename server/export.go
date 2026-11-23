package server

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strconv"
	"strings"

	"github.com/bhanuprakaash/codewalk/web"
)

//go:embed export_worker.js
var exportWorker string

const exportMarker = ".codewalk-export"

// Export writes a read-only copy of the app to out, for a static host such as Cloudflare Pages:
// the UI, every project's files under files/, and each GET the UI makes saved under snap/ by
// snapKey. _worker.js asks for the password in the host's PASSWORD secret.
func Export(dataDir, out string) error {
	if _, err := fs.Stat(web.FS(), "index.html"); err != nil {
		return errors.New("the UI is not built into this binary: run make build first")
	}
	if err := prepareOut(dataDir, out); err != nil {
		return err
	}
	h := Handler(dataDir)
	get := func(endpoint string, q url.Values) ([]byte, bool) {
		r := httptest.NewRequest("GET", "/api/"+endpoint+"?"+q.Encode(), nil)
		r.Host = "localhost"
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Body.Bytes(), w.Code == http.StatusOK
	}
	save := func(endpoint string, q url.Values) error {
		body, ok := get(endpoint, q)
		if !ok {
			return nil
		}
		return writeOut(out, "snap/"+snapKey(endpoint, q)+".json", body)
	}

	body, _ := get("projects", url.Values{})
	if err := writeOut(out, "snap/"+snapKey("projects", url.Values{})+".json", body); err != nil {
		return err
	}
	projects, err := listProjects(dataDir)
	if err != nil {
		return err
	}
	for _, p := range projects {
		q := url.Values{"project": {p.Name}}
		if err := save("tree", q); err != nil {
			return err
		}
		body, ok := get("tree", q)
		var tree entry
		if !ok || json.Unmarshal(body, &tree) != nil {
			return fmt.Errorf("could not list %s", p.Name)
		}
		for _, s := range snapsOf(p.Name, tree) {
			if err := save(s.endpoint, s.q); err != nil {
				return err
			}
		}
		if err := copyProject(filepath.Join(dataDir, p.Name), filepath.Join(out, "files", p.Name)); err != nil {
			return err
		}
	}

	if err := fs.WalkDir(web.FS(), ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || p == ".keep" {
			return err
		}
		raw, err := fs.ReadFile(web.FS(), p)
		if err != nil {
			return err
		}
		if p == "index.html" {
			raw = []byte(strings.Replace(string(raw), "<head>", `<head><meta name="codewalk-static">`, 1))
		}
		return writeOut(out, p, raw)
	}); err != nil {
		return err
	}
	if err := writeOut(out, "_worker.js", []byte(strings.ReplaceAll(exportWorker, "'PAGE_CSP'", strconv.Quote(pageCSP)))); err != nil {
		return err
	}
	return writeOut(out, exportMarker, nil)
}

type snap struct {
	endpoint string
	q        url.Values
}

// snapsOf lists the GETs the UI makes for a project's tree, beside the tree itself.
func snapsOf(project string, root entry) []snap {
	var out []snap
	add := func(endpoint string, kv ...string) {
		q := url.Values{"project": {project}}
		for i := 0; i < len(kv); i += 2 {
			q.Set(kv[i], kv[i+1])
		}
		out = append(out, snap{endpoint, q})
	}
	add("user")
	var visit func(e entry)
	visit = func(e entry) {
		switch e.Kind {
		case "map":
			add("user", "map", e.Path)
		case "system":
			id := strings.TrimSuffix(strings.TrimPrefix(e.Path, "system-"), ".json")
			if e.Path == "system.json" {
				add("system")
			} else {
				add("system", "id", id)
			}
		case "dir":
			if slices.Contains(e.Entry, "map") {
				add("user", "map", path.Join(e.Path, "index.map.json"))
			}
			if slices.Contains(e.Entry, "walk") && e.Path != "" {
				add("walk", "scope", e.Path)
				add("user", "scope", e.Path)
			}
			if slices.Contains(e.Entry, "system") {
				add("system")
			}
		}
		for _, k := range e.Kids {
			visit(k)
		}
	}
	visit(root)
	return out
}

// snapKey names a saved GET: FNV-1a of the endpoint and its sorted, decoded params. The UI's
// static.ts computes the same from the URL it fetches.
func snapKey(endpoint string, q url.Values) string {
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	var b strings.Builder
	b.WriteString(endpoint)
	b.WriteString("?")
	for i, k := range keys {
		if i > 0 {
			b.WriteString("&")
		}
		b.WriteString(k)
		b.WriteString("=")
		b.WriteString(q.Get(k))
	}
	h := fnv.New32a()
	h.Write([]byte(b.String()))
	return fmt.Sprintf("%08x", h.Sum32())
}

// prepareOut empties a previous export at out, and refuses any other non-empty folder.
func prepareOut(dataDir, out string) error {
	absData, _ := filepath.Abs(dataDir)
	absOut, _ := filepath.Abs(out)
	if absOut == absData || strings.HasPrefix(absOut, absData+string(filepath.Separator)) {
		return errors.New("the export folder must be outside the data folder")
	}
	entries, err := os.ReadDir(out)
	if errors.Is(err, fs.ErrNotExist) {
		return os.MkdirAll(out, 0o755)
	}
	if err != nil {
		return err
	}
	if len(entries) == 0 {
		return nil
	}
	if _, err := os.Stat(filepath.Join(out, exportMarker)); err != nil {
		return fmt.Errorf("%s is not empty and is not a codewalk export", out)
	}
	for _, e := range entries {
		if err := os.RemoveAll(filepath.Join(out, e.Name())); err != nil {
			return err
		}
	}
	return nil
}

func copyProject(src, dst string) error {
	return filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		if rel != "." && strings.HasPrefix(d.Name(), ".") {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			return nil
		}
		raw, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		return writeOut(dst, filepath.ToSlash(rel), raw)
	})
}

func writeOut(root, rel string, raw []byte) error {
	full := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return err
	}
	return os.WriteFile(full, raw, 0o644)
}
