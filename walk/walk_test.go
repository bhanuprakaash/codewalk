package walk

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// build copies testdata to a temp dir (outputs land there, and the temp copy is not a git
// repo, so the commit is "unknown"), applies the edits to the storyboard text and builds it.
func build(t *testing.T, edits ...[2]string) (*Result, string) {
	t.Helper()
	dir := t.TempDir()
	if err := os.CopyFS(dir, os.DirFS("testdata")); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "walk", "storyboard.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, e := range edits {
		if !strings.Contains(text, e[0]) {
			t.Fatalf("storyboard has no %q", e[0])
		}
		text = strings.Replace(text, e[0], e[1], 1)
	}
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
	res, err := Build(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := res.Write(); err != nil {
		t.Fatal(err)
	}
	return res, filepath.Join(dir, "walk")
}

func TestBuild(t *testing.T) {
	res, dir := build(t)
	if len(res.Errors)+len(res.Warnings) > 0 {
		t.Fatalf("errors %q, warnings %q", res.Errors, res.Warnings)
	}
	want := "5 nodes, 3 types, 1 workflows, 2 trace steps, 0 what-ifs (2 captured / 1 constructed values), why: 0 cited / 1 inferred, commit unknown"
	if res.Summary != want {
		t.Errorf("summary = %q", res.Summary)
	}

	var walk struct {
		Nodes     map[string]struct{ Line int }
		Workflows []struct {
			Edges []struct {
				ID string
				At *struct {
					HL [][2]int
				}
			}
			Trace []struct {
				Values []struct {
					Value json.RawMessage
					From  struct{ Kind, Ref, At string }
				}
				State *struct{ Stop, Of int }
			}
		}
	}
	read(t, filepath.Join(dir, "walk.json"), &walk)
	if got := walk.Nodes["put"].Line; got != 28 {
		t.Errorf("put line = %d, want 28", got)
	}
	wf := walk.Workflows[0]
	if e := wf.Edges[1]; e.ID != "save->put" || e.At == nil || e.At.HL[0][0] != 31 {
		t.Errorf("edge save->put = %+v", e)
	}
	v := wf.Trace[1].Values[1]
	if string(v.Value) != `{"id":1,"text":"hello"}` || v.From.Kind != "captured" || v.From.Ref != "main/db.json#/notes/find:id=1" || v.From.At != "2026-01-02T03:04:05Z" {
		t.Errorf("captured value = %s from %+v", v.Value, v.From)
	}
	if s := wf.Trace[1].State; s == nil || s.Stop != 1 || s.Of != 1 {
		t.Errorf("state = %+v", s)
	}

	var spec struct{ Breakpoints []struct{ ID string } }
	read(t, filepath.Join(dir, "capture", "dlv-spec.json"), &spec)
	if len(spec.Breakpoints) != 1 || spec.Breakpoints[0].ID != "app/app.go:31" {
		t.Errorf("breakpoints = %+v", spec.Breakpoints)
	}
}

func TestBuildErrors(t *testing.T) {
	for _, c := range []struct {
		name string
		edit [2]string
		want string
	}{
		{"unknown symbol", [2]string{`"app:Server.Save"`, `"app:Server.Saved"`}, "node save: no Server.Saved in app"},
		{"unscanned package", [2]string{`"store:Store.Put"`, `"nope:Store.Put"`}, `node put: package nope is not in "scan"`},
		{"call not in code", [2]string{`{ "from": "save", "to": "put" }`, `{ "from": "put", "to": "flush" }`},
			`workflow save edge put->flush: Store.Put has no call to Store.Flush (add "match" when goscan cannot resolve the call)`},
		{"unknown id", [2]string{`"nodes": ["caller", "save"`, `"nodes": ["ghost", "caller", "save"`}, "workflow save: unknown node ghost"},
		{"bad capture pointer", [2]string{"request.json#/text", "request.json#/nope"}, "workflow save trace step 1 value 1: nothing at /nope"},
		{"find matches nothing", [2]string{"find:id=1", "find:id=2"}, "workflow save trace step 2 value 2: nothing at /notes/find:id=2"},
		{"missing capture file", [2]string{"request.json#/text", "gone.json#/text"}, "workflow save trace step 1 value 1: capture file main/gone.json not found"},
		{"match not found", [2]string{`"match": "ErrClosed"`, `"match": "ErrOpen"`}, `workflow save edge save->closed: "ErrOpen" not found in app/app.go:25-37`},
	} {
		t.Run(c.name, func(t *testing.T) {
			res, dir := build(t, c.edit)
			if !slices.Contains(res.Errors, c.want) {
				t.Errorf("errors %q lack %q", res.Errors, c.want)
			}
			if res.Walk != nil {
				t.Error("a walk was built despite errors")
			}
			if _, err := os.Stat(filepath.Join(dir, "walk.json")); err == nil {
				t.Error("walk.json was written despite errors")
			}
		})
	}
}

func read(t *testing.T, path string, v any) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, v); err != nil {
		t.Fatal(err)
	}
}
