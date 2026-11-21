package walk

import (
	"slices"
	"sort"
	"strings"

	"github.com/bhanuprakaash/codewalk/scan"
)

// Pattern is one Go pattern found in the scanned packages, with the symbols it appears in.
type Pattern struct {
	ID    string        `json:"id"`
	Name  string        `json:"name"`
	What  string        `json:"what"`
	Sites []PatternSite `json:"sites"`
}

type PatternSite struct {
	Symbol string `json:"symbol"`
	Label  string `json:"label"`
}

var patternInfo = []struct{ id, name, what string }{
	{"go-chan", "goroutine + channel", "Work runs in its own goroutine and hands results back over a channel, so the caller keeps going and reads them when ready."},
	{"select", "select", "Waits on several channels at once and acts on whichever is ready first: a result, a timeout or a cancel."},
	{"ctx-cancel", "context cancel", "Makes a child context it can cancel, so everything started under it stops when the work ends, times out or is called off."},
	{"mutex", "mutex-guarded state", "Fields are read and written only while the mutex is held, so concurrent calls never see half-updated state."},
	{"iface", "interface with several impls", "Callers depend on the interface, so any of these types can be swapped in without changing the callers."},
	{"sentinel", "sentinel errors checked with errors.Is", "A named error value that callers test with errors.Is, which still matches after the error was wrapped with more context."},
}

var cancelFuncs = []string{"context.WithCancel", "context.WithCancelCause", "context.WithTimeout", "context.WithDeadline"}

// findPatterns lists the patterns in sc, in patternInfo order, leaving out the ones not found.
func findPatterns(sc *scan.Result) []Pattern {
	sites := map[string][]PatternSite{}
	add := func(id, symbol, label string) {
		if !slices.ContainsFunc(sites[id], func(s PatternSite) bool { return s.Symbol == symbol }) {
			sites[id] = append(sites[id], PatternSite{symbol, label})
		}
	}
	dirOf := map[string]string{}
	dirs := make([]string, 0, len(sc.Packages))
	for d := range sc.Packages {
		dirs = append(dirs, d)
	}
	sort.Strings(dirs)
	for _, d := range slices.Backward(dirs) {
		dirOf[sc.Packages[d].Name] = d
	}
	sentinels := map[string]bool{}
	for _, d := range dirs {
		p := sc.Packages[d]
		for _, s := range p.Sentinels {
			sentinels[p.Name+"."+s.Name] = true
		}
	}
	for _, d := range dirs {
		p := sc.Packages[d]
		keys := make([]string, 0, len(p.Funcs))
		for k := range p.Funcs {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			f := p.Funcs[k]
			sym := d + ":" + k
			for _, g := range f.Gos {
				callee := p.Funcs[g.Callee]
				if pkg, rest, ok := strings.Cut(g.Callee, "."); ok && dirOf[pkg] != "" && sc.Packages[dirOf[pkg]].Funcs[rest] != nil {
					callee = sc.Packages[dirOf[pkg]].Funcs[rest]
				}
				if len(f.Chans) > 0 || (callee != nil && len(callee.Chans) > 0) {
					add("go-chan", sym, p.Name+"."+k)
				}
			}
			if len(f.Select) > 0 {
				add("select", sym, p.Name+"."+k)
			}
			for _, c := range f.Calls {
				if slices.Contains(cancelFuncs, c.Callee) {
					add("ctx-cancel", sym, p.Name+"."+k)
				}
			}
			for _, e := range f.ErrIs {
				name := e.Text
				if !strings.Contains(name, ".") {
					name = p.Name + "." + name
				}
				if sentinels[name] {
					add("sentinel", sym, p.Name+"."+k+" · "+strings.TrimPrefix(name, p.Name+"."))
				}
			}
		}
		names := make([]string, 0, len(p.Types))
		for n := range p.Types {
			names = append(names, n)
		}
		sort.Strings(names)
		for _, n := range names {
			var mus []string
			for _, fl := range p.Types[n].Fields {
				if t := strings.TrimPrefix(fl.Type, "*"); t == "sync.Mutex" || t == "sync.RWMutex" {
					mus = append(mus, fl.Name)
				}
			}
			if mus != nil {
				add("mutex", d+":"+n, p.Name+"."+n+" ("+strings.Join(mus, ", ")+")")
			}
		}
	}
	impls := map[string][]string{}
	for _, i := range sc.Implements {
		impls[i.Iface] = append(impls[i.Iface], i.Type)
	}
	ifaces := make([]string, 0, len(impls))
	for i := range impls {
		ifaces = append(ifaces, i)
	}
	sort.Strings(ifaces)
	for _, i := range ifaces {
		pkg, name, _ := strings.Cut(i, ".")
		if len(impls[i]) >= 2 && dirOf[pkg] != "" {
			add("iface", dirOf[pkg]+":"+name, i+" · "+strings.Join(impls[i], ", "))
		}
	}
	out := []Pattern{}
	for _, info := range patternInfo {
		if len(sites[info.id]) > 0 {
			out = append(out, Pattern{info.id, info.name, info.what, sites[info.id]})
		}
	}
	return out
}

// patterns finds the patterns and makes sure every site opens a card: a type card for types and
// methods, a func card for plain funcs.
func (b *builder) patterns() []Pattern {
	pats := findPatterns(b.scan)
	for _, p := range pats {
		for _, s := range p.Sites {
			dir, key, _ := strings.Cut(s.Symbol, ":")
			pk := b.scan.Packages[dir]
			switch f := pk.Funcs[key]; {
			case f == nil:
				b.addType(dir, key, "")
			case f.Recv != "":
				b.addType(dir, f.Recv, "")
			default:
				if _, ok := b.funcs.get(s.Symbol); !ok {
					b.funcs.set(s.Symbol, ptr(b.method(dir, key, f)))
				}
			}
		}
	}
	return pats
}

func ptr[T any](v T) *T { return &v }
