package walk

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

// MapKinds are the node kinds a .map.json may use: the system-design kinds plus the walk kinds.
var MapKinds = []string{
	"client", "lb", "service", "cache", "db", "queue", "cdn", "worker", "external", "topic",
	"start", "func", "type", "store", "outside", "you", "output", "exit", "ui", "package",
}

var mapEdgeKinds = []string{"call", "when", "go", "stores", "asks"}

type mapFile struct {
	Title string `json:"title"`
	Nodes []struct {
		ID   string     `json:"id"`
		Kind string     `json:"kind"`
		Pos  *[]float64 `json:"pos"`
		Link string     `json:"link"`
	} `json:"nodes"`
	Edges []struct {
		ID   string `json:"id"`
		From string `json:"from"`
		To   string `json:"to"`
		Kind string `json:"kind"`
	} `json:"edges"`
	Flows []struct {
		ID      string    `json:"id"`
		Title   string    `json:"title"`
		Nodes   []string  `json:"nodes"`
		Steps   []mapStep `json:"steps"`
		Whatifs []struct {
			ID    string    `json:"id"`
			Title string    `json:"title"`
			Fork  int       `json:"fork"`
			Steps []mapStep `json:"steps"`
		} `json:"whatifs"`
	} `json:"flows"`
}

type mapStep struct {
	At    string `json:"at"`
	Title string `json:"title"`
	Tone  string `json:"tone"`
	State []struct {
		Of   string `json:"of"`
		Name string `json:"name"`
	} `json:"state"`
}

// CheckMap reads a .map.json and lists what is wrong with it: bad references, unknown kinds,
// missing positions, links to files that are not there. An empty list means the app can show it.
func CheckMap(path string) ([]string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var m mapFile
	if err := json.Unmarshal(raw, &m); err != nil {
		return []string{"not valid JSON: " + err.Error()}, nil
	}
	var errs []string
	bad := func(format string, a ...any) { errs = append(errs, fmt.Sprintf(format, a...)) }
	if m.Title == "" {
		bad("title is required")
	}
	nodes := map[string]bool{}
	for i, n := range m.Nodes {
		switch {
		case n.ID == "":
			bad("node %d has no id", i)
		case nodes[n.ID]:
			bad("node %q appears twice", n.ID)
		}
		nodes[n.ID] = true
		if !slices.Contains(MapKinds, n.Kind) {
			bad("node %q: unknown kind %q", n.ID, n.Kind)
		}
		if n.Pos == nil || len(*n.Pos) != 2 {
			bad("node %q: pos must be [col, row]", n.ID)
		}
		if n.Link != "" {
			if strings.Contains(n.Link, "://") || filepath.IsAbs(n.Link) {
				bad("node %q: link %q must be a relative path", n.ID, n.Link)
			} else if _, err := os.Stat(filepath.Join(filepath.Dir(path), n.Link)); err != nil {
				bad("node %q: link %q does not exist", n.ID, n.Link)
			}
		}
	}
	edges := map[string]bool{}
	for _, e := range m.Edges {
		id := e.ID
		if id == "" {
			id = e.From + "->" + e.To
		}
		if edges[id] {
			bad("edge %q appears twice; give one an id", id)
		}
		edges[id] = true
		for _, end := range []string{e.From, e.To} {
			if !nodes[end] {
				bad("edge %q: no node %q", id, end)
			}
		}
		if e.Kind != "" && !slices.Contains(mapEdgeKinds, e.Kind) {
			bad("edge %q: unknown kind %q", id, e.Kind)
		}
	}
	steps := func(where string, ss []mapStep) {
		for i, s := range ss {
			if s.Title == "" {
				bad("%s step %d has no title", where, i+1)
			}
			if !nodes[s.At] && !edges[s.At] {
				bad("%s step %d: at %q is neither a node nor an edge", where, i+1, s.At)
			}
			if s.Tone != "" && !slices.Contains([]string{"ok", "warn", "bad", "info"}, s.Tone) {
				bad("%s step %d: tone %q is not ok, warn, bad or info", where, i+1, s.Tone)
			}
			for _, x := range s.State {
				if x.Name == "" {
					bad("%s step %d: a state item has no name", where, i+1)
				}
				if x.Of != "" && !nodes[x.Of] {
					bad("%s step %d: state of %q is not a node", where, i+1, x.Of)
				}
			}
		}
	}
	flows := map[string]bool{}
	for _, f := range m.Flows {
		if f.ID == "" || flows[f.ID] {
			bad("flow %q: id is missing or appears twice", f.ID)
		}
		flows[f.ID] = true
		if f.Title == "" {
			bad("flow %q has no title", f.ID)
		}
		for _, id := range f.Nodes {
			if !nodes[id] {
				bad("flow %q: no node %q", f.ID, id)
			}
		}
		steps("flow "+f.ID, f.Steps)
		for _, w := range f.Whatifs {
			if w.ID == "" || w.Title == "" {
				bad("flow %q: a what-if needs an id and a title", f.ID)
			}
			if w.Fork < 0 || w.Fork >= len(f.Steps) {
				bad("flow %q what-if %q: fork %d is not a step of the flow", f.ID, w.ID, w.Fork)
			}
			steps("flow "+f.ID+" what-if "+w.ID, w.Steps)
		}
	}
	return errs, nil
}
