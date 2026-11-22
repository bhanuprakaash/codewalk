package walk

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestCheckMap(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "page.html"), nil, 0o644)
	path := filepath.Join(dir, "x.map.json")
	os.WriteFile(path, []byte(`{
		"title": "x",
		"nodes": [
			{"id": "a", "kind": "service", "pos": [0, 0], "link": "page.html"},
			{"id": "b", "kind": "blob", "pos": [1, 0], "link": "gone.html"},
			{"id": "a", "kind": "db"}
		],
		"edges": [{"from": "a", "to": "b"}, {"from": "a", "to": "c", "kind": "zap"}],
		"flows": [{"id": "f", "title": "F", "steps": [
			{"at": "a->b", "title": "ok", "state": [{"of": "b", "name": "k"}]},
			{"at": "b->a", "title": "", "tone": "meh", "state": [{"of": "z", "name": ""}]}
		], "whatifs": [{"id": "w", "title": "W", "fork": 2, "steps": []}]}]
	}`), 0o644)
	got, err := CheckMap(path)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		`node "b": unknown kind "blob"`,
		`node "b": link "gone.html" does not exist`,
		`node "a" appears twice`,
		`node "a": pos must be [col, row]`,
		`edge "a->c": no node "c"`,
		`edge "a->c": unknown kind "zap"`,
		`flow f step 2 has no title`,
		`flow f step 2: at "b->a" is neither a node nor an edge`,
		`flow f step 2: tone "meh" is not ok, warn, bad or info`,
		`flow f step 2: a state item has no name`,
		`flow f step 2: state of "z" is not a node`,
		`flow "f" what-if "w": fork 2 is not a step of the flow`,
	}
	if !slices.Equal(got, want) {
		t.Errorf("got\n%q\nwant\n%q", got, want)
	}
}
