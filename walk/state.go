package walk

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"slices"
)

type stop struct {
	ID         string                     `json:"id"`
	Watch      map[string]json.RawMessage `json:"watch"`
	T          json.RawMessage            `json:"t"`
	Goroutine  json.RawMessage            `json:"goroutine"`
	Fn         json.RawMessage            `json:"fn"`
	Goroutines json.RawMessage            `json:"goroutines"`
}

// state writes the spec the capture script runs the program under Delve with, then maps each
// recorded stop (state.jsonl, one line per stop) onto the trace step that stopped there.
func (b *builder) state(workflows []Workflow) {
	type run struct {
		id, scenario string
		trace        []Step
	}
	var runs []run
	for _, w := range workflows {
		runs = append(runs, run{w.ID, w.Capture, w.Trace})
		for _, x := range w.Whatifs {
			runs = append(runs, run{fmt.Sprintf("%s what-if %s", w.ID, x.ID), x.Capture, x.Trace})
		}
	}
	var bps ordered[Breakpoint]
	for _, r := range runs {
		for _, s := range r.trace {
			if s.Stop != nil {
				id := fmt.Sprintf("%s:%d", s.Stop.Path, s.Stop.Line)
				bps.set(id, Breakpoint{ID: id, File: filepath.Join(b.repo, s.Stop.Path), Line: s.Stop.Line})
			}
		}
	}
	st := b.sb.State
	b.res.Spec = &Spec{Module: st.Module, Roots: st.Roots, Watch: orEmpty(st.Watch), Shell: orEmpty(st.Shell), Breakpoints: orEmpty(bps.values())}
	b.res.specPath = filepath.Join(b.capDir, "dlv-spec.json")

	var owners []owner
	for _, raw := range slices.Concat(st.Watch, st.Shell) {
		var o owner
		if err := json.Unmarshal(raw, &o); err != nil {
			b.err("state: %v", err)
		}
		owners = append(owners, o)
	}
	for _, r := range runs {
		raw, err := b.capFile(r.scenario, "state.jsonl")
		if err != nil {
			b.err("state: capture %s/state.jsonl: %v", r.scenario, err)
			continue
		}
		if raw == nil {
			b.warn("no %s/%s/state.jsonl: run capture.sh to record state", b.sb.Capture, r.scenario)
			continue
		}
		var hits []stop
		if err := json.Unmarshal(raw, &hits); err != nil {
			b.err("state: capture %s/state.jsonl: %v", r.scenario, err)
			continue
		}
		b.mapStops(r.id, r.trace, hits, owners)
	}
}

func (b *builder) mapStops(id string, trace []Step, hits []stop, owners []owner) {
	cur := 0
	for i := range trace {
		s := &trace[i]
		if s.Stop == nil {
			continue
		}
		key := fmt.Sprintf("%s:%d", s.Stop.Path, s.Stop.Line)
		sctx := fmt.Sprintf("workflow %s step %d (%s)", id, i+1, s.At)
		at := func(from int) int {
			for j := from; j < len(hits); j++ {
				if hits[j].ID == key {
					return j
				}
			}
			return -1
		}
		k := at(cur)
		switch {
		case k >= 0:
			cur = k + 1
		case at(0) >= 0:
			k = at(0)
			b.warn("%s: in the real run it stopped here before the step before it (stop %d of %d); reorder or keep it with a reason", sctx, k+1, len(hits))
		default:
			b.warn("%s: Delve never stopped at %s", sctx, key)
			continue
		}
		h := hits[k]
		for _, o := range owners {
			var w struct{ Error, Expr string }
			if json.Unmarshal(h.Watch[o.Name], &w) == nil && w.Error != "" {
				expr := ""
				if w.Expr != "" {
					expr = fmt.Sprintf(" (%s)", w.Expr)
				}
				b.err("state %s: %s%s", o.Name, w.Error, expr)
			}
		}
		items := make([]StateItem, 0, len(owners))
		for _, o := range owners {
			v := h.Watch[o.Name]
			if v == nil {
				v = json.RawMessage("null")
			}
			items = append(items, StateItem{Owner: o.Owner, Name: o.Name, Note: o.Note, Value: v})
		}
		s.State = &StepState{Stop: k + 1, Of: len(hits), At: h.T, Goroutine: h.Goroutine, Fn: h.Fn, Items: items, Goroutines: h.Goroutines}
	}
}
