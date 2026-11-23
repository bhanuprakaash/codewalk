package server

import (
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bhanuprakaash/codewalk/web"
)

// the UI's static.ts must name the same file for the same request; 20d2b197 is what it computes
func TestSnapKeyMatchesUI(t *testing.T) {
	q := url.Values{"project": {"system design"}, "map": {"caching/index.map.json"}}
	if got := snapKey("user", q); got != "20d2b197" {
		t.Fatalf("snapKey = %s, want 20d2b197", got)
	}
}

func TestExport(t *testing.T) {
	data, out := t.TempDir(), filepath.Join(t.TempDir(), "site")
	writeFiles(t, data, map[string]string{
		"sd/index.map.json":          `{"title":"Roadmap","nodes":[]}`,
		"sd/caching/index.html":      `<title>Caching</title>`,
		"sd/caching/index.map.json":  `{"title":"Caching map","nodes":[]}`,
		"sd/caching/index.user.json": `{"notes":{"box:a":"hi"}}`,
		"sd/.secret/x.html":          `hidden`,
		"sd/extra.map.json":          `{"title":"Extra","nodes":[]}`,
		"sd/extra.user.json":         `{"notes":{"box:b":"extra note"}}`,
		"go/run/walk.json":           `{"repo":"/r","nodes":{}}`,
		"go/system.built.json":       `{"boxes":"main"}`,
		"go/system-db.built.json":    `{"boxes":"db"}`,
	})
	if _, err := fs.Stat(web.FS(), "index.html"); err != nil {
		if Export(data, out) == nil {
			t.Fatal("exported with no UI built")
		}
		t.Skip("UI not built (make build): only the refusal is checked")
	}
	if err := Export(data, out); err != nil {
		t.Fatal(err)
	}
	read := func(rel string) string {
		raw, err := os.ReadFile(filepath.Join(out, rel))
		if err != nil {
			t.Fatal(err)
		}
		return string(raw)
	}
	snapOf := func(endpoint string, kv ...string) string {
		q := url.Values{}
		for i := 0; i < len(kv); i += 2 {
			q.Set(kv[i], kv[i+1])
		}
		return read("snap/" + snapKey(endpoint, q) + ".json")
	}
	if s := snapOf("projects"); !strings.Contains(s, `"sd"`) || !strings.Contains(s, `"go"`) {
		t.Errorf("projects = %s", s)
	}
	if s := snapOf("tree", "project", "sd"); !strings.Contains(s, `"caching"`) {
		t.Errorf("tree = %s", s)
	}
	if s := snapOf("user", "project", "sd", "map", "caching/index.map.json"); !strings.Contains(s, "hi") {
		t.Errorf("map user = %s", s)
	}
	if s := snapOf("walk", "project", "go", "scope", "run"); !strings.Contains(s, `"repo"`) {
		t.Errorf("walk = %s", s)
	}
	if s := snapOf("user", "project", "sd", "map", "extra.map.json"); !strings.Contains(s, "extra note") {
		t.Errorf("standalone map user = %s", s)
	}
	if s := snapOf("system", "project", "go"); !strings.Contains(s, "main") {
		t.Errorf("system = %s", s)
	}
	if s := snapOf("system", "project", "go", "id", "db"); !strings.Contains(s, "db") {
		t.Errorf("system db = %s", s)
	}
	if read("files/sd/caching/index.html") != `<title>Caching</title>` {
		t.Error("page not copied")
	}
	if _, err := os.Stat(filepath.Join(out, "files/sd/.secret")); err == nil {
		t.Error("hidden folder copied")
	}
	if !strings.Contains(read("index.html"), `<meta name="codewalk-static">`) {
		t.Error("index.html not marked static")
	}
	if !strings.Contains(read("_worker.js"), `"default-src 'self';`) {
		t.Error("worker CSP not filled in")
	}

	if err := Export(data, out); err != nil {
		t.Fatalf("re-export over a previous export: %v", err)
	}
	other := t.TempDir()
	writeFiles(t, other, map[string]string{"keep.txt": "mine"})
	if err := Export(data, other); err == nil {
		t.Error("exported over a folder that is not an export")
	}
	if err := Export(data, filepath.Join(data, "site")); err == nil {
		t.Error("exported into the data folder")
	}
}
