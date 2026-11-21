// Package walk checks a storyboard against the code it describes and the runs captured from it,
// and builds the walk the explorer reads: every node, edge, citation and trace value resolved
// against the repo, with all code read from disk.
package walk

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/bhanuprakaash/codewalk/scan"
)

// Walk is the JSON written to walk.json.
type Walk struct {
	GoroutineNotes json.RawMessage  `json:"goroutineNotes"`
	Title          string           `json:"title"`
	Scope          string           `json:"scope"`
	Summary        string           `json:"summary"`
	Repo           string           `json:"repo"`
	Commit         string           `json:"commit"`
	Dirty          bool             `json:"dirty"`
	CapturedAt     string           `json:"capturedAt"`
	CapCommit      string           `json:"capCommit"`
	Packages       []Package        `json:"packages"`
	Nodes          ordered[*Node]   `json:"nodes"`
	Types          ordered[*Type]   `json:"types"`
	Funcs          ordered[*Method] `json:"funcs"`
	Workflows      []Workflow       `json:"workflows"`
	Patterns       []Pattern        `json:"patterns"`
}

type Package struct {
	Dir   string   `json:"dir"`
	Name  string   `json:"name"`
	Doc   string   `json:"doc"`
	Role  string   `json:"role"`
	Nodes []string `json:"nodes"`
}

// Node is a storyboard node plus what the scan and the files say about its symbol.
type Node struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"`
	Label  string `json:"label"`
	Sub    string `json:"sub"`
	What   string `json:"what"`
	Gotcha string `json:"gotcha"`
	Why    *Why   `json:"why,omitempty"`
	Pkg    string `json:"pkg"`
	Symbol string `json:"symbol,omitempty"`
	*Place
	Type string `json:"type,omitempty"`
	*FuncInfo
	Code *Slice `json:"code,omitempty"`
}

type Place struct {
	Path string `json:"path"`
	Line int    `json:"line"`
	Doc  string `json:"doc"`
}

type FuncInfo struct {
	Sig     string      `json:"sig"`
	Recv    string      `json:"recv,omitempty"`
	Errs    []scan.Site `json:"errs"`
	Gos     []scan.Site `json:"gos"`
	Locks   []string    `json:"locks"`
	Selects []scan.Site `json:"selects"`
	Calls   []scan.Site `json:"calls"`
	Range   [2]int      `json:"range"`
}

type Why struct {
	Text   string `json:"text"`
	Source Source `json:"source"`
}

type Source struct {
	Kind  string  `json:"kind"`
	Ref   string  `json:"ref,omitempty"`
	Title *string `json:"title,omitempty"`
}

// Slice is a run of lines from a file; HL holds the highlighted line ranges.
type Slice struct {
	Path  string   `json:"path"`
	Start int      `json:"start"`
	Lines []string `json:"lines"`
	HL    [][2]int `json:"hl,omitempty"`
}

type Type struct {
	Symbol        string       `json:"symbol"`
	Name          string       `json:"name"`
	Kind          string       `json:"kind"`
	Doc           string       `json:"doc"`
	Role          string       `json:"role"`
	Path          string       `json:"path"`
	Line          int          `json:"line"`
	Fields        []scan.Field `json:"fields"`
	Methods       []Method     `json:"methods"`
	ImplementedBy []string     `json:"implementedBy"`
	Code          Slice        `json:"code"`
}

type Method struct {
	Name    string      `json:"name"`
	Symbol  string      `json:"symbol"`
	Sig     string      `json:"sig"`
	Doc     string      `json:"doc"`
	Path    string      `json:"path"`
	Line    int         `json:"line"`
	Errs    []scan.Site `json:"errs"`
	Gos     []scan.Site `json:"gos"`
	Locks   []string    `json:"locks"`
	Selects []scan.Site `json:"selects"`
	Code    Slice       `json:"code"`
}

type Workflow struct {
	ID         string         `json:"id"`
	Title      string         `json:"title"`
	Summary    string         `json:"summary"`
	Capture    string         `json:"capture"`
	CapturedAt string         `json:"capturedAt"`
	Nodes      []string       `json:"nodes"`
	Pos        ordered[Point] `json:"pos"`
	Edges      []Edge         `json:"edges"`
	Trace      []Step         `json:"trace"`
	Whatifs    []Whatif       `json:"whatifs"`
}

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Edge struct {
	ID    string `json:"id"`
	From  string `json:"from"`
	To    string `json:"to"`
	Kind  string `json:"kind"`
	Label string `json:"label"`
	Cond  string `json:"cond"`
	Skip  string `json:"skip"`
	At    *Slice `json:"at,omitempty"`
}

type Step struct {
	At     string     `json:"at"`
	Title  string     `json:"title"`
	Does   string     `json:"does"`
	Note   string     `json:"note"`
	Jump   string     `json:"jump"`
	Stop   *Stop      `json:"stop"`
	Values []Value    `json:"values"`
	State  *StepState `json:"state,omitempty"`
}

type Stop struct {
	Path string `json:"path"`
	Line int    `json:"line"`
}

type Value struct {
	Name    string          `json:"name"`
	Type    string          `json:"type"`
	TypeRef *string         `json:"typeRef"`
	Note    string          `json:"note"`
	Dir     string          `json:"dir"`
	Value   json.RawMessage `json:"value,omitempty"`
	From    *From           `json:"from,omitempty"`
}

type From struct {
	Kind string  `json:"kind"`
	Ref  string  `json:"ref"`
	At   *string `json:"at,omitempty"`
}

type Whatif struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Summary    string `json:"summary"`
	Capture    string `json:"capture"`
	CapturedAt string `json:"capturedAt"`
	Fork       int    `json:"fork"`
	Trace      []Step `json:"trace"`
}

// StepState is the program's memory at the Delve stop that matches a step.
type StepState struct {
	Stop       int             `json:"stop"`
	Of         int             `json:"of"`
	At         json.RawMessage `json:"at,omitempty"`
	Goroutine  json.RawMessage `json:"goroutine,omitempty"`
	Fn         json.RawMessage `json:"fn,omitempty"`
	Items      []StateItem     `json:"items"`
	Goroutines json.RawMessage `json:"goroutines,omitempty"`
}

type StateItem struct {
	Owner string          `json:"owner"`
	Name  string          `json:"name"`
	Note  string          `json:"note"`
	Value json.RawMessage `json:"value"`
}

// Spec is the dlv-spec.json the capture script runs the program under Delve with.
type Spec struct {
	Module      string            `json:"module,omitempty"`
	Roots       json.RawMessage   `json:"roots,omitempty"`
	Watch       []json.RawMessage `json:"watch"`
	Shell       []json.RawMessage `json:"shell"`
	Breakpoints []Breakpoint      `json:"breakpoints"`
}

type Breakpoint struct {
	ID   string `json:"id"`
	File string `json:"file"`
	Line int    `json:"line"`
}

// Result is what Build found. Walk (or System, for a system view) is set only when there are no
// errors; Spec whenever the storyboard has a capture and a state.
type Result struct {
	Walk     *Walk
	System   *System
	Spec     *Spec
	Warnings []string
	Errors   []string
	Summary  string

	outPath, specPath string
}

// Write writes dlv-spec.json when there is a spec, and the built file when there are no errors.
func (r *Result) Write() error {
	if r.Spec != nil {
		if err := writeJSON(r.specPath, r.Spec, true); err != nil {
			return err
		}
	}
	if len(r.Errors) > 0 {
		return nil
	}
	if r.System != nil {
		return writeJSON(r.outPath, r.System, false)
	}
	return writeJSON(r.outPath, r.Walk, false)
}

func (r *Result) OutPath() string { return r.outPath }

func writeJSON(path string, v any, indent bool) error {
	b, err := marshal(v, indent)
	if err != nil {
		return err
	}
	return WriteFileAtomic(path, b)
}

func WriteFileAtomic(path string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err := tmp.Chmod(0o644); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// marshal encodes without HTML escaping; the output ends with a newline.
func marshal(v any, indent bool) ([]byte, error) {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if indent {
		enc.SetIndent("", " ")
	}
	err := enc.Encode(v)
	return b.Bytes(), err
}

// ordered is a map that marshals its keys in insertion order: the explorer lists nodes, types and
// captured values in the order the storyboard gave them.
type ordered[V any] struct {
	keys []string
	m    map[string]V
}

func (o *ordered[V]) set(k string, v V) {
	if o.m == nil {
		o.m = map[string]V{}
	}
	if _, ok := o.m[k]; !ok {
		o.keys = append(o.keys, k)
	}
	o.m[k] = v
}

func (o ordered[V]) get(k string) (V, bool) { v, ok := o.m[k]; return v, ok }

func (o ordered[V]) values() []V {
	out := make([]V, 0, len(o.keys))
	for _, k := range o.keys {
		out = append(out, o.m[k])
	}
	return out
}

func (o ordered[V]) MarshalJSON() ([]byte, error) {
	var b bytes.Buffer
	b.WriteByte('{')
	for i, k := range o.keys {
		if i > 0 {
			b.WriteByte(',')
		}
		kb, err := marshal(k, false)
		if err != nil {
			return nil, err
		}
		vb, err := marshal(o.m[k], false)
		if err != nil {
			return nil, err
		}
		b.Write(bytes.TrimSpace(kb))
		b.WriteByte(':')
		b.Write(bytes.TrimSpace(vb))
	}
	b.WriteByte('}')
	return b.Bytes(), nil
}
