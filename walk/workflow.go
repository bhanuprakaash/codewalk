package walk

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/bhanuprakaash/codewalk/scan"
)

func (b *builder) value(spec valueSpec, ctx, scenario string) Value {
	out := Value{Name: spec.Name, Type: spec.Type, Note: spec.Note, Dir: spec.Dir}
	if ref := b.typeRef(spec.Type); ref != "" {
		out.TypeRef = &ref
	}
	if out.Dir != "" && out.Dir != "in" && out.Dir != "out" {
		b.err("%s: \"dir\" must be \"in\" or \"out\"", ctx)
	}
	switch {
	case spec.Capture != "":
		if b.capDir == "" {
			b.err("%s: \"capture\" set but the storyboard has no \"capture\" folder", ctx)
			return out
		}
		parts := strings.Split(spec.Capture, "#")
		file, ptr := parts[0], ""
		if len(parts) > 1 {
			ptr = parts[1]
		}
		v, err := b.capFile(scenario, file)
		if err != nil {
			b.err("%s: capture file %s/%s: %v", ctx, scenario, file, err)
			return out
		}
		if v == nil {
			b.err("%s: capture file %s/%s not found", ctx, scenario, file)
			return out
		}
		picked, ok := pick(v, ptr)
		if !ok {
			b.err("%s: nothing at %s", ctx, ptr)
		}
		at := b.capRead(scenario, "captured-at")
		out.Value, out.From = picked, &From{Kind: "captured", Ref: scenario + "/" + spec.Capture, At: &at}
	case spec.Constructed != nil:
		out.Value, out.From = spec.Constructed, &From{Kind: "constructed", Ref: spec.Basis}
	default:
		b.err("%s: value needs \"capture\" or \"constructed\"", ctx)
	}
	return out
}

func (b *builder) workflow(w workflowSpec) Workflow {
	ctx := "workflow " + w.ID
	ids := orEmpty(w.Nodes)
	for _, id := range ids {
		if _, ok := b.nodes.get(id); !ok {
			b.err("%s: unknown node %s", ctx, id)
		}
	}
	edges := make([]Edge, 0, len(w.Edges))
	for _, e := range w.Edges {
		edges = append(edges, b.edge(e, ctx, ids))
	}
	scenario := w.Capture
	if scenario == "" {
		scenario = "main"
	}
	trace := b.steps(w.Trace, ctx+" trace", scenario, edges)
	ends := func(at string) []string {
		if i := slices.IndexFunc(edges, func(e Edge) bool { return e.ID == at }); i >= 0 {
			return []string{edges[i].From, edges[i].To}
		}
		return []string{at}
	}
	// a what-if forks from a main-trace step and runs its own captured scenario
	whatifs := make([]Whatif, 0, len(w.Whatifs))
	for _, x := range w.Whatifs {
		xctx := fmt.Sprintf("%s what-if %s", ctx, x.ID)
		fork := slices.IndexFunc(trace, func(s Step) bool { return s.At == x.ForkAt })
		if fork < 0 {
			b.err("%s: forkAt %s is not the \"at\" of a step in the main trace", xctx, x.ForkAt)
		}
		if _, err := os.Stat(filepath.Join(b.capDir, x.Capture)); b.capDir == "" || err != nil {
			b.err("%s: no capture folder %s/%s (capture.sh <repo> %s)", xctx, b.sb.Capture, x.Capture, x.Capture)
		}
		t := b.steps(x.Trace, xctx, x.Capture, edges)
		if fork >= 0 && len(t) > 0 {
			from := ends(x.ForkAt)
			if !slices.ContainsFunc(ends(t[0].At), func(n string) bool { return slices.Contains(from, n) }) {
				b.err("%s: its first step must share a node with %s", xctx, x.ForkAt)
			}
		}
		title := x.Title
		if title == "" {
			title = x.ID
		}
		whatifs = append(whatifs, Whatif{ID: x.ID, Title: title, Summary: x.Summary, Capture: x.Capture,
			CapturedAt: b.capRead(x.Capture, "captured-at"), Fork: fork, Trace: t})
	}
	// every branch on the map has a what-if, a step of the main trace, or a written reason to skip it
	covered := map[string]bool{}
	for _, s := range trace {
		covered[s.At] = true
	}
	for _, x := range whatifs {
		for _, s := range x.Trace {
			covered[s.At] = true
		}
	}
	for _, e := range edges {
		to, _ := b.nodes.get(e.To)
		if (e.Kind == "when" || (to != nil && to.Kind == "exit")) && !covered[e.ID] && e.Skip == "" {
			b.warn("%s edge %s: a branch with no what-if and no \"skip\"", ctx, e.ID)
		}
	}
	return Workflow{ID: w.ID, Title: w.Title, Summary: w.Summary, Capture: scenario, CapturedAt: b.capRead(scenario, "captured-at"),
		Nodes: ids, Pos: layout(w, ids, edges), Edges: edges, Trace: trace, Whatifs: whatifs}
}

func (b *builder) edge(e edgeSpec, wctx string, ids []string) Edge {
	ectx := fmt.Sprintf("%s edge %s->%s", wctx, e.From, e.To)
	a, _ := b.nodes.get(e.From)
	to, _ := b.nodes.get(e.To)
	out := Edge{ID: e.ID, From: e.From, To: e.To, Kind: e.Kind, Label: e.Label, Cond: e.Cond, Skip: e.Skip}
	if out.ID == "" {
		out.ID = e.From + "->" + e.To
	}
	if out.Kind == "" {
		out.Kind = "call"
	}
	if !slices.Contains(edgeKinds, out.Kind) {
		b.err("%s: kind must be one of %s", ectx, strings.Join(edgeKinds, ", "))
	}
	if a == nil || to == nil {
		b.err("%s: unknown node", ectx)
		return out
	}
	if !slices.Contains(ids, e.From) || !slices.Contains(ids, e.To) {
		b.err("%s: both ends must be in the workflow's nodes", ectx)
	}
	at := func(path string, line int) *Slice {
		s := b.slice(path, max(1, line-6), line+8, [2]int{line, line})
		return &s
	}
	switch {
	case e.Match != "":
		path := e.Path
		if path == "" && a.Place != nil {
			path = a.Path
		}
		inA := a.FuncInfo != nil && path == a.Path
		if path == "" || b.lines(path) == nil {
			b.err("%s: no file to search for %q (set \"path\")", ectx, e.Match)
		} else {
			from, upTo := 1, math.MaxInt
			if inA {
				from, upTo = a.Range[0], a.Range[1]
			}
			if ln := b.findLine(path, e.Match, from, upTo, ectx); ln > 0 {
				out.At = at(path, ln)
			}
		}
	case a.FuncInfo != nil && to.Symbol != "" && to.Type == "":
		bdir, bkey, _ := strings.Cut(to.Symbol, ":")
		want := bkey
		if bdir != a.Pkg {
			want = b.pkgName(bdir) + "." + bkey
		}
		sites := a.Calls
		if out.Kind == "go" {
			sites = append(slices.Clone(a.Gos), a.Calls...)
		}
		i := slices.IndexFunc(sites, func(s scan.Site) bool { return s.Callee == want })
		if i < 0 {
			b.err("%s: %s has no call to %s (add \"match\" when goscan cannot resolve the call)", ectx, a.Label, want)
		} else {
			out.At = at(a.Path, sites[i].Line)
		}
	case a.Symbol != "" && to.Symbol != "":
		b.err("%s: add \"match\" (text of the line that connects them)", ectx)
	}
	if out.Kind == "when" && out.Cond == "" {
		b.warn("%s: a \"when\" edge needs \"cond\"", ectx)
	}
	return out
}

func (b *builder) steps(list []stepSpec, tctx, scenario string, edges []Edge) []Step {
	out := make([]Step, 0, len(list))
	for i, s := range list {
		sctx := fmt.Sprintf("%s step %d", tctx, i+1)
		edge := slices.IndexFunc(edges, func(e Edge) bool { return e.ID == s.At })
		if _, ok := b.nodes.get(s.At); !ok && edge < 0 {
			b.err("%s: \"at\" must be a node or edge id of this workflow", sctx)
		}
		if s.Does == "" {
			b.warn("%s: no \"does\"", sctx)
		}
		// where Delve stops for this step: the edge's call site, or "stop" when that line is not where it runs
		var stop *Stop
		if edge >= 0 && edges[edge].At != nil {
			at := edges[edge].At
			stop = &Stop{Path: at.Path, Line: at.HL[0][0]}
		}
		if s.Stop != nil {
			p := s.Stop.Path
			from, upTo := 0, 0
			if b.lines(p) != nil {
				from = 1
				if s.Stop.After != "" {
					from = b.findLine(p, s.Stop.After, 1, math.MaxInt, sctx+" stop")
				}
			}
			ln := 0
			if from > 0 {
				upTo = math.MaxInt
				if s.Stop.After != "" {
					upTo = from + 20
				}
				ln = b.findLine(p, s.Stop.Match, from, upTo, sctx+" stop")
			}
			stop = nil
			if ln > 0 {
				stop = &Stop{Path: p, Line: ln}
			}
			if b.lines(p) == nil {
				b.err("%s stop: no file %s", sctx, p)
			}
		}
		values := make([]Value, 0, len(s.Values))
		for k, v := range s.Values {
			values = append(values, b.value(v, fmt.Sprintf("%s value %d", sctx, k+1), scenario))
		}
		out = append(out, Step{At: s.At, Title: s.Title, Does: s.Does, Note: s.Note, Jump: s.Jump, Stop: stop, Values: values})
	}
	return out
}

// layout gives each node a position: the storyboard's, else column = depth along call edges and
// row = order of appearance.
func layout(w workflowSpec, ids []string, edges []Edge) ordered[Point] {
	given := func(id string, i int) (float64, bool) {
		if p := w.Pos[id]; len(p) > i {
			return p[i], true
		}
		return 0, false
	}
	col := map[string]float64{}
	for _, id := range ids {
		col[id], _ = given(id, 0)
	}
	for range ids {
		for _, e := range edges {
			_, fixed := w.Pos[e.To]
			from, known := col[e.From]
			if fixed || e.Kind == "asks" || e.From == e.To || !known {
				continue
			}
			if c, ok := col[e.To]; ok && c < from+1 && from+1 < float64(len(ids)) {
				col[e.To] = from + 1
			}
		}
	}
	var pos ordered[Point]
	rows := map[float64]float64{}
	for _, id := range ids {
		c := col[id]
		r, ok := given(id, 1)
		if !ok {
			next, seen := rows[c]
			if !seen {
				next = -1
			}
			r = next + 1
			rows[c] = r
		}
		pos.set(id, Point{X: c * 360, Y: r * 170})
	}
	return pos
}
