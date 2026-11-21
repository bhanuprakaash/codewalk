package walk

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"

	"github.com/bhanuprakaash/codewalk/scan"
)

var (
	boxKinds       = []string{"ui", "service", "package", "store", "outside"}
	systemEdgeKind = []string{"calls", "http", "sse", "mcp", "imports", "stores"}
	systemFile     = regexp.MustCompile(`^system(-[\w-]+)?\.json$`)
)

type systemSpec struct {
	Title, Repo, Summary string
	Boxes                []boxSpec
	Edges                []systemEdgeSpec
}

type boxSpec struct {
	ID, Kind, Label, What, Icon, Pkg, Drill string
	Pos                                     []float64
	Types                                   []string
}

type systemEdgeSpec struct{ From, To, Kind, Label, What string }

// System is the JSON written to system.built.json (or system-<id>.built.json).
type System struct {
	Title   string         `json:"title"`
	Summary string         `json:"summary"`
	Repo    string         `json:"repo"`
	Commit  string         `json:"commit"`
	Boxes   ordered[*Box]  `json:"boxes"`
	Edges   []SystemEdge   `json:"edges"`
	Types   ordered[*Type] `json:"types"`
}

type Box struct {
	ID    string   `json:"id"`
	Kind  string   `json:"kind"`
	Label string   `json:"label"`
	What  string   `json:"what"`
	Icon  string   `json:"icon,omitempty"`
	Pkg   string   `json:"pkg,omitempty"`
	Types []string `json:"types,omitempty"`
	Drill string   `json:"drill,omitempty"`
	Pos   Point    `json:"pos"`
}

type SystemEdge struct {
	ID    string `json:"id"`
	From  string `json:"from"`
	To    string `json:"to"`
	Kind  string `json:"kind"`
	Label string `json:"label"`
	What  string `json:"what"`
}

// IsSystem reports whether path names a system view file rather than a storyboard.
func IsSystem(path string) bool { return systemFile.MatchString(filepath.Base(path)) }

func buildSystem(path string, raw []byte) (*Result, error) {
	var spec systemSpec
	if err := json.Unmarshal(raw, &spec); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	projectDir := filepath.Dir(path)
	repo := spec.Repo
	if repo != "" && !filepath.IsAbs(repo) {
		repo = filepath.Join(projectDir, repo)
	}
	if fi, err := os.Stat(repo); repo == "" || err != nil || !fi.IsDir() {
		return nil, fmt.Errorf("repo not found: %s", spec.Repo)
	}
	res := &Result{outPath: filepath.Join(projectDir, strings.TrimSuffix(filepath.Base(path), ".json")+".built.json")}
	b := &builder{repo: repo, files: map[string][]string{}, res: res}

	var dirs []string
	add := func(dir string) {
		if !slices.Contains(dirs, dir) {
			dirs = append(dirs, dir)
		}
	}
	for _, bx := range spec.Boxes {
		if bx.Kind != "package" {
			continue
		}
		if fi, err := os.Stat(filepath.Join(repo, bx.Pkg)); bx.Pkg == "" || err != nil || !fi.IsDir() {
			b.err("box %s: package dir %q not found in the repo", bx.ID, bx.Pkg)
			continue
		}
		add(bx.Pkg)
		for _, t := range bx.Types {
			if dir, _, _ := strings.Cut(t, ":"); dir != "" {
				if fi, err := os.Stat(filepath.Join(repo, dir)); err == nil && fi.IsDir() {
					add(dir)
				}
			}
		}
	}
	sc, err := scan.Scan(repo, dirs)
	if err != nil {
		return nil, err
	}
	b.scan = sc

	sys := &System{Title: spec.Title, Summary: spec.Summary, Repo: repo, Edges: []SystemEdge{}}
	for _, bx := range spec.Boxes {
		ctx := "box " + bx.ID
		if _, dup := sys.Boxes.get(bx.ID); bx.ID == "" || dup {
			b.err("box id missing or duplicate: %s", bx.ID)
			continue
		}
		if !slices.Contains(boxKinds, bx.Kind) {
			b.err("%s: kind must be one of %s", ctx, strings.Join(boxKinds, ", "))
		}
		if len(bx.Pos) != 2 {
			b.err("%s: \"pos\" must be [col, row]", ctx)
			bx.Pos = []float64{0, 0}
		}
		out := &Box{ID: bx.ID, Kind: bx.Kind, Label: bx.Label, What: bx.What, Icon: bx.Icon, Pkg: bx.Pkg,
			Drill: bx.Drill, Pos: Point{X: bx.Pos[0] * 360, Y: bx.Pos[1] * 170}}
		if out.Label == "" {
			out.Label = bx.ID
		}
		for _, t := range bx.Types {
			dir, name, _ := strings.Cut(t, ":")
			if b.addType(dir, name, "") == "" {
				b.err("%s: type %s not found", ctx, t)
				continue
			}
			out.Types = append(out.Types, t)
		}
		if bx.Drill != "" && !drillExists(projectDir, bx.Drill) {
			b.err("%s: drill %q is neither a scope nor a system view in %s", ctx, bx.Drill, projectDir)
		}
		sys.Boxes.set(bx.ID, out)
	}
	imports := 0
	for _, e := range spec.Edges {
		ctx := fmt.Sprintf("edge %s->%s", e.From, e.To)
		from, okFrom := sys.Boxes.get(e.From)
		to, okTo := sys.Boxes.get(e.To)
		if !okFrom || !okTo {
			b.err("%s: unknown box", ctx)
			continue
		}
		if !slices.Contains(systemEdgeKind, e.Kind) {
			b.err("%s: kind must be one of %s", ctx, strings.Join(systemEdgeKind, ", "))
		}
		if e.Kind == "imports" {
			imports++
			if from.Kind != "package" || to.Kind != "package" {
				b.err("%s: an imports edge joins two package boxes", ctx)
			} else if p := sc.Packages[from.Pkg]; p == nil || !slices.Contains(p.Imports, sc.Module+"/"+to.Pkg) {
				b.err("%s: %s does not import %s (no Go import of %s/%s in %s)", ctx, from.Pkg, to.Pkg, sc.Module, to.Pkg, from.Pkg)
			}
		}
		id := e.From + "->" + e.To
		if slices.ContainsFunc(sys.Edges, func(x SystemEdge) bool { return x.ID == id }) {
			b.err("%s: duplicate edge", ctx)
		}
		sys.Edges = append(sys.Edges, SystemEdge{ID: id, From: e.From, To: e.To, Kind: e.Kind, Label: e.Label, What: e.What})
	}
	if len(res.Errors) > 0 {
		return res, nil
	}
	sys.Commit = "unknown"
	if c, err := sh(repo, "git", "rev-parse", "HEAD"); err == nil {
		sys.Commit = c
	}
	sys.Types = b.types
	res.System = sys
	res.Summary = fmt.Sprintf("%d boxes, %d edges (%d imports checked), %d types, commit %s",
		len(sys.Boxes.keys), len(sys.Edges), imports, len(sys.Types.keys), short(sys.Commit))
	return res, nil
}

// drillExists reports whether target names a scope folder or a system-<id>.json in projectDir.
func drillExists(projectDir, target string) bool {
	if id, ok := strings.CutPrefix(target, "system:"); ok {
		_, err := os.Stat(filepath.Join(projectDir, "system-"+id+".json"))
		return err == nil
	}
	if !filepath.IsLocal(target) || strings.ContainsAny(target, `/\`) {
		return false
	}
	for _, f := range []string{"storyboard.json", "walk.json"} {
		if _, err := os.Stat(filepath.Join(projectDir, target, f)); err == nil {
			return true
		}
	}
	return false
}
