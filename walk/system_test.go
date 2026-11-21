package walk

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func buildSystemFile(t *testing.T, edit [2]string) (*Result, string) {
	t.Helper()
	dir := t.TempDir()
	if err := os.CopyFS(dir, os.DirFS("testdata")); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "system.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), edit[0]) {
		t.Fatalf("system.json has no %q", edit[0])
	}
	if err := os.WriteFile(path, []byte(strings.Replace(string(data), edit[0], edit[1], 1)), 0o644); err != nil {
		t.Fatal(err)
	}
	res, err := Build(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := res.Write(); err != nil {
		t.Fatal(err)
	}
	return res, dir
}

func TestBuildSystem(t *testing.T) {
	res, dir := buildSystemFile(t, [2]string{"", ""})
	if len(res.Errors) > 0 {
		t.Fatalf("errors %q", res.Errors)
	}
	if want := "3 boxes, 2 edges (1 imports checked), 3 types, commit unknown"; res.Summary != want {
		t.Errorf("summary = %q", res.Summary)
	}
	var sys struct {
		Boxes map[string]struct {
			Label string
			Pos   Point
			Types []string
		}
		Types map[string]struct{ Name string }
	}
	read(t, filepath.Join(dir, "system.built.json"), &sys)
	if b := sys.Boxes["store"]; b.Pos != (Point{X: 720, Y: 0}) || !slices.Equal(b.Types, []string{"store:Store", "store:Note"}) {
		t.Errorf("store box = %+v", b)
	}
	if sys.Boxes["caller"].Label != "caller" || sys.Types["app:Server"].Name != "app.Server" {
		t.Errorf("caller label %q, app:Server name %q", sys.Boxes["caller"].Label, sys.Types["app:Server"].Name)
	}
}

func TestBuildSystemErrors(t *testing.T) {
	for _, c := range []struct {
		name string
		edit [2]string
		want string
	}{
		{"invented import", [2]string{`{ "from": "app", "to": "store", "kind": "imports" }`, `{ "from": "store", "to": "app", "kind": "imports" }`},
			"edge store->app: store does not import app (no Go import of example.com/tiny/app in store)"},
		{"missing package dir", [2]string{`"pkg": "store"`, `"pkg": "stor"`}, `box store: package dir "stor" not found in the repo`},
		{"unknown type", [2]string{`"app:Server"`, `"app:Client"`}, "box app: type app:Client not found"},
		{"missing drill", [2]string{`"drill": "walk"`, `"drill": "talk"`}, `box app: drill "talk" is neither a scope nor a system view in `},
		{"missing child system", [2]string{`"drill": "walk"`, `"drill": "system:arch"`}, `box app: drill "system:arch" is neither a scope nor a system view in `},
		{"unknown box", [2]string{`"to": "app", "kind": "calls"`, `"to": "ap", "kind": "calls"`}, "edge caller->ap: unknown box"},
	} {
		t.Run(c.name, func(t *testing.T) {
			res, dir := buildSystemFile(t, c.edit)
			if !slices.ContainsFunc(res.Errors, func(e string) bool { return strings.HasPrefix(e, c.want) }) {
				t.Errorf("errors %q lack %q", res.Errors, c.want)
			}
			if _, err := os.Stat(filepath.Join(dir, "system.built.json")); err == nil {
				t.Error("system.built.json was written despite errors")
			}
		})
	}
}
