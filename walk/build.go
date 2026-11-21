package walk

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"

	"github.com/bhanuprakaash/codewalk/scan"
)

const maxLines = 220

var (
	nodeKinds = []string{"start", "func", "type", "store", "outside", "you", "output", "exit"}
	edgeKinds = []string{"call", "when", "asks", "go", "stores"}
	lockText  = regexp.MustCompile(`\.R?Lock\(\)$`)
	typeName  = regexp.MustCompile(`^(\w+)\.(\w+)$`)

	headingMark = regexp.MustCompile(`^#+\s+`)
	prMissing   = regexp.MustCompile(`(?i)Could not resolve|no pull requests? found`)
)

type builder struct {
	sb      *storyboard
	repo    string
	outDir  string
	capDir  string
	scan    *scan.Result
	nodes   ordered[*Node]
	types   ordered[*Type]
	funcs   ordered[*Method]
	files   map[string][]string
	sources map[string]Source
	caps    map[string]json.RawMessage
	capErrs map[string]error
	res     *Result
}

// Build checks the storyboard (or system view) at sbPath and builds its walk. Problems with the
// file are in Result.Errors; the error return is for what stops the check itself (no file, no
// repo, no scan).
func Build(sbPath string) (*Result, error) {
	sbPath, err := filepath.Abs(sbPath)
	if err != nil {
		return nil, err
	}
	raw, err := os.ReadFile(sbPath)
	if err != nil {
		return nil, err
	}
	if IsSystem(sbPath) {
		return buildSystem(sbPath, raw)
	}
	var sb storyboard
	if err := json.Unmarshal(raw, &sb); err != nil {
		return nil, fmt.Errorf("%s: %w", sbPath, err)
	}
	outDir := filepath.Dir(sbPath)
	repo := sb.Repo
	if repo != "" && !filepath.IsAbs(repo) {
		repo = filepath.Join(outDir, repo)
	}
	if fi, err := os.Stat(repo); repo == "" || err != nil || !fi.IsDir() {
		return nil, fmt.Errorf("repo not found: %s", sb.Repo)
	}
	sc, err := scan.Scan(repo, sb.Scan)
	if err != nil {
		return nil, err
	}
	b := &builder{
		sb: &sb, repo: repo, outDir: outDir, scan: sc,
		files: map[string][]string{}, sources: map[string]Source{},
		caps: map[string]json.RawMessage{}, capErrs: map[string]error{},
		res: &Result{outPath: filepath.Join(outDir, "walk.json")},
	}
	if sb.Capture != "" {
		b.capDir = filepath.Join(outDir, sb.Capture)
	}
	b.build()
	return b.res, nil
}

func (b *builder) err(format string, a ...any) {
	b.res.Errors = append(b.res.Errors, fmt.Sprintf(format, a...))
}
func (b *builder) warn(format string, a ...any) {
	b.res.Warnings = append(b.res.Warnings, fmt.Sprintf(format, a...))
}

func (b *builder) build() {
	sb := b.sb
	for _, t := range sb.Types {
		dir, name, _ := strings.Cut(t.Symbol, ":")
		if b.addType(dir, name, t.Role) == "" {
			b.err("type %s: not found", t.Symbol)
		}
	}
	for _, n := range sb.Nodes {
		b.addNode(n)
	}
	capturedAt := b.capRead("main", "captured-at")
	workflows := make([]Workflow, 0, len(sb.Workflows))
	for _, w := range sb.Workflows {
		workflows = append(workflows, b.workflow(w))
	}
	packages := make([]Package, 0, len(sb.Packages))
	for _, p := range sb.Packages {
		sp := b.scan.Packages[p.Dir]
		if sp == nil {
			b.err("packages: %s is not in \"scan\"", p.Dir)
		}
		pkg := Package{Dir: p.Dir, Name: p.Dir, Role: p.Role, Nodes: []string{}}
		if sp != nil {
			pkg.Name, pkg.Doc = sp.Name, sp.Doc
			if pkg.Name == "" {
				pkg.Name = p.Dir
			}
		}
		for _, n := range b.nodes.values() {
			if n.Pkg == p.Dir {
				pkg.Nodes = append(pkg.Nodes, n.ID)
			}
		}
		packages = append(packages, pkg)
	}
	if sb.State != nil && b.capDir != "" {
		b.state(workflows)
	}
	patterns := b.patterns()
	if len(b.res.Errors) > 0 {
		return
	}

	commit, dirty := "unknown", false
	if c, err := sh(b.repo, "git", "rev-parse", "HEAD"); err == nil {
		commit = c
		if st, err := sh(b.repo, append([]string{"git", "status", "--porcelain", "--untracked-files=no", "--"}, sb.Scan...)...); err == nil {
			dirty = st != ""
		}
	}
	capCommit := b.capRead("main", "commit")
	// a new commit (a merge, a docs change) matters only when the scanned packages differ from the capture's
	if capCommit != "" && capCommit != commit {
		args := append([]string{"git", "diff", "--quiet", capCommit, commit, "--"}, sb.Scan...)
		if _, err := sh(b.repo, args...); err != nil {
			b.warn("capture was taken at %s, the code in %s changed since (now %s): rerun the capture", short(capCommit), strings.Join(sb.Scan, ", "), short(commit))
		}
	}
	goroutines := sb.stateGoroutines()
	b.res.Walk = &Walk{
		GoroutineNotes: goroutines, Title: sb.Title, Scope: sb.Scope, Summary: sb.Summary, Repo: b.repo,
		Commit: commit, Dirty: dirty, CapturedAt: capturedAt, CapCommit: capCommit,
		Packages: packages, Nodes: b.nodes, Types: b.types, Funcs: b.funcs, Workflows: workflows, Patterns: patterns,
	}
	b.res.Summary = b.summary(workflows, commit, dirty)
}

func (sb *storyboard) stateGoroutines() json.RawMessage {
	if sb.State == nil || len(sb.State.Goroutines) == 0 || string(sb.State.Goroutines) == "null" {
		return json.RawMessage("{}")
	}
	return sb.State.Goroutines
}

func (b *builder) summary(workflows []Workflow, commit string, dirty bool) string {
	var steps, whatifs, captured, constructed, cited, inferred int
	count := func(trace []Step) {
		for _, s := range trace {
			for _, v := range s.Values {
				switch {
				case v.From == nil:
				case v.From.Kind == "captured":
					captured++
				case v.From.Kind == "constructed":
					constructed++
				}
			}
		}
	}
	for _, w := range workflows {
		steps += len(w.Trace)
		whatifs += len(w.Whatifs)
		count(w.Trace)
		for _, x := range w.Whatifs {
			count(x.Trace)
		}
	}
	for _, n := range b.nodes.values() {
		switch {
		case n.Why == nil:
		case n.Why.Source.Kind == "inferred":
			inferred++
		default:
			cited++
		}
	}
	d := ""
	if dirty {
		d = " (dirty)"
	}
	return fmt.Sprintf("%d nodes, %d types, %d workflows, %d trace steps, %d what-ifs (%d captured / %d constructed values), why: %d cited / %d inferred, commit %s%s",
		len(b.nodes.keys), len(b.types.keys), len(workflows), steps, whatifs, captured, constructed, cited, inferred, short(commit), d)
}

func short(sha string) string {
	if len(sha) > 7 {
		return sha[:7]
	}
	return sha
}

func sh(dir string, argv ...string) (string, error) {
	cmd := exec.Command(argv[0], argv[1:]...)
	cmd.Dir = dir
	out, err := cmd.Output()
	return strings.TrimSpace(string(out)), err
}

// lines returns a repo file's lines, or nil when it is not a file.
func (b *builder) lines(path string) []string {
	if ls, ok := b.files[path]; ok {
		return ls
	}
	var ls []string
	abs := filepath.Join(b.repo, path)
	if fi, err := os.Stat(abs); err == nil && fi.Mode().IsRegular() {
		if data, err := os.ReadFile(abs); err == nil {
			ls = strings.Split(string(data), "\n")
		}
	}
	b.files[path] = ls
	return ls
}

func (b *builder) slice(path string, start, end int, hl ...[2]int) Slice {
	ls := b.lines(path)
	e := min(end, start+maxLines-1, len(ls))
	out := Slice{Path: path, Start: start, Lines: []string{}, HL: hl}
	if start-1 < e {
		out.Lines = ls[start-1 : e]
	}
	return out
}

func (b *builder) withDocStart(path string, line int) int {
	ls := b.lines(path)
	s := line
	for s > 1 && s-2 < len(ls) && strings.HasPrefix(strings.TrimLeft(ls[s-2], " \t"), "//") {
		s--
	}
	return s
}

// findLine returns the first line in from..to holding needle, or 0 with an error when none does.
func (b *builder) findLine(path, needle string, from, to int, ctx string) int {
	ls := b.lines(path)
	var hits []int
	for i := from - 1; i < min(len(ls), to); i++ {
		if strings.Contains(ls[i], needle) {
			hits = append(hits, i+1)
		}
	}
	if len(hits) > 1 {
		strs := make([]string, len(hits))
		for i, h := range hits {
			strs[i] = fmt.Sprint(h)
		}
		b.warn("%s: %q matches lines %s; using %d", ctx, needle, strings.Join(strs, ", "), hits[0])
	}
	if len(hits) == 0 {
		end := "end"
		if to != math.MaxInt {
			end = fmt.Sprint(to)
		}
		b.err("%s: %q not found in %s:%d-%s", ctx, needle, path, from, end)
		return 0
	}
	return hits[0]
}

func (b *builder) source(spec, ctx string) Source {
	if s, ok := b.sources[spec]; ok {
		return s
	}
	out, err := b.resolveSource(spec, ctx)
	if err != nil {
		b.err("%s: source %s: %s", ctx, spec, strings.SplitN(err.Error(), "\n", 2)[0])
		out = Source{Kind: "inferred"}
	}
	b.sources[spec] = out
	return out
}

func (b *builder) resolveSource(spec, ctx string) (Source, error) {
	kind, ref, _ := strings.Cut(spec, ":")
	switch kind {
	case "inferred":
		return Source{Kind: "inferred"}, nil
	case "design":
		parts := strings.Split(ref, "#")
		p, h := parts[0], ""
		if len(parts) > 1 {
			h = parts[1]
		}
		ls := b.lines(p)
		if ls == nil {
			return Source{}, fmt.Errorf("no file %s", p)
		}
		hl := 0
		if h != "" {
			hl = slices.IndexFunc(ls, func(l string) bool {
				return strings.Contains(strings.ToLower(heading(l)), strings.ToLower(h))
			})
		}
		if hl < 0 {
			return Source{}, fmt.Errorf("no heading %q in %s", h, p)
		}
		title := ""
		if h != "" {
			title = heading(ls[hl])
		}
		return Source{Kind: "design", Ref: fmt.Sprintf("%s:%d", p, hl+1), Title: &title}, nil
	case "commit":
		subj, err := sh(b.repo, "git", "log", "-1", "--format=%h %s", ref)
		if err != nil {
			return Source{}, fmt.Errorf("Command failed: git log -1 --format=%%h %%s %s", ref)
		}
		sha, title, found := strings.Cut(subj, " ")
		if !found {
			title = subj
		}
		return Source{Kind: "commit", Ref: sha, Title: &title}, nil
	case "pr":
		cmd := exec.Command("gh", "pr", "view", ref, "--json", "title", "-q", ".title")
		cmd.Dir = b.repo
		out, err := cmd.Output()
		if err != nil {
			msg := err.Error()
			var ee *exec.ExitError
			if errors.As(err, &ee) && len(ee.Stderr) > 0 {
				msg = string(ee.Stderr)
			}
			if prMissing.MatchString(msg) {
				return Source{}, fmt.Errorf("PR #%s does not exist", ref)
			}
			b.warn("%s: PR #%s not checked (gh failed)", ctx, ref)
		}
		title := strings.TrimSpace(string(out))
		return Source{Kind: "pr", Ref: "#" + ref, Title: &title}, nil
	}
	return Source{}, fmt.Errorf("unknown source %q (design:, commit:, pr:, inferred)", kind)
}

// heading is a markdown heading line without its #s; "" when the line is not a heading.
func heading(l string) string {
	if loc := headingMark.FindStringIndex(l); loc != nil {
		return l[loc[1]:]
	}
	return ""
}

func (b *builder) why(w *struct{ Text, Source string }, ctx string) *Why {
	if w == nil {
		return nil
	}
	src := w.Source
	if src == "" {
		src = "inferred"
	}
	return &Why{Text: w.Text, Source: b.source(src, ctx)}
}

func (b *builder) pkgName(dir string) string {
	if p := b.scan.Packages[dir]; p != nil {
		return p.Name
	}
	return ""
}

func (b *builder) sortedDirs() []string {
	dirs := make([]string, 0, len(b.scan.Packages))
	for d := range b.scan.Packages {
		dirs = append(dirs, d)
	}
	sort.Strings(dirs)
	return dirs
}

func uniqueLocks(sites []scan.Site) []string {
	out := []string{}
	for _, l := range sites {
		if lockText.MatchString(l.Text) && !slices.Contains(out, l.Mu) {
			out = append(out, l.Mu)
		}
	}
	return out
}

func orEmpty[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}

// addType registers the type's card and returns its symbol, or "" when the package has no such type.
func (b *builder) addType(dir, name, role string) string {
	sym := dir + ":" + name
	if t, ok := b.types.get(sym); ok {
		if role != "" {
			t.Role = role
		}
		return sym
	}
	p := b.scan.Packages[dir]
	if p == nil || p.Types[name] == nil {
		return ""
	}
	st := p.Types[name]
	t := &Type{Symbol: sym, Name: p.Name + "." + name, Kind: st.Kind, Doc: st.Doc, Role: role, Path: st.File, Line: st.Line,
		Fields: orEmpty(st.Fields), Methods: []Method{}, ImplementedBy: []string{},
		Code: b.slice(st.File, b.withDocStart(st.File, st.Line), st.End)}
	// every method with what its card needs, so any of them opens even when it is not on a map
	keys := make([]string, 0, len(p.Funcs))
	for k := range p.Funcs {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		f := p.Funcs[k]
		if !strings.HasPrefix(k, name+".") {
			continue
		}
		t.Methods = append(t.Methods, b.method(dir, k, f))
	}
	for _, i := range b.scan.Implements {
		if i.Iface == p.Name+"."+name {
			t.ImplementedBy = append(t.ImplementedBy, i.Type)
		}
	}
	b.types.set(sym, t)
	return sym
}

// method is what a method or func card shows; Name is the key after the receiver.
func (b *builder) method(dir, key string, f *scan.Func) Method {
	_, name, ok := strings.Cut(key, ".")
	if !ok {
		name = key
	}
	return Method{Name: name, Symbol: dir + ":" + key, Sig: f.Sig, Doc: f.Doc, Path: f.File, Line: f.Line,
		Errs: orEmpty(f.Errs), Gos: orEmpty(f.Gos), Locks: uniqueLocks(f.Locks), Selects: orEmpty(f.Select),
		Code: b.slice(f.File, b.withDocStart(f.File, f.Line), f.End)}
}

// typeRef turns "store.Note", "[]store.Note" or "*app.Server" into a type symbol when
// its package was scanned.
func (b *builder) typeRef(name string) string {
	m := typeName.FindStringSubmatch(strings.TrimLeft(name, "*[]"))
	if m == nil {
		return ""
	}
	for _, d := range b.sortedDirs() {
		if b.scan.Packages[d].Name == m[1] {
			return b.addType(d, m[2], "")
		}
	}
	return ""
}

type symbolInfo struct {
	file      string
	line, end int
	doc       string
	fn        *scan.Func
}

// lookup finds "app:Server.Save" in the scan: a func or method first, then a type.
func (b *builder) lookup(symbol string) (dir, key string, info symbolInfo, isType bool, err error) {
	dir, key, _ = strings.Cut(symbol, ":")
	key, _, _ = strings.Cut(key, ":")
	p := b.scan.Packages[dir]
	if p == nil {
		return "", "", info, false, fmt.Errorf("package %s is not in \"scan\"", dir)
	}
	if f := p.Funcs[key]; f != nil {
		return dir, key, symbolInfo{f.File, f.Line, f.End, f.Doc, f}, false, nil
	}
	if t := p.Types[key]; t != nil {
		return dir, key, symbolInfo{t.File, t.Line, t.End, t.Doc, nil}, true, nil
	}
	return "", "", info, false, fmt.Errorf("no %s in %s", key, dir)
}

func (b *builder) addNode(n nodeSpec) {
	ctx := "node " + n.ID
	if _, dup := b.nodes.get(n.ID); n.ID == "" || dup {
		b.err("node id missing or duplicate: %s", n.ID)
		return
	}
	if !slices.Contains(nodeKinds, n.Kind) {
		b.err("%s: kind must be one of %s", ctx, strings.Join(nodeKinds, ", "))
	}
	out := &Node{ID: n.ID, Kind: n.Kind, Label: n.Label, Sub: n.Sub, What: n.What, Gotcha: n.Gotcha, Why: b.why(n.Why, ctx), Pkg: n.Pkg}
	switch {
	case n.Symbol != "":
		dir, key, f, isType, err := b.lookup(n.Symbol)
		if err != nil {
			b.err("%s: %v", ctx, err)
			return
		}
		out.Pkg = strings.SplitN(n.Symbol, ":", 2)[0]
		out.Symbol = n.Symbol
		out.Place = &Place{Path: f.file, Line: f.line, Doc: f.doc}
		if out.Label == "" {
			out.Label = key
		}
		if isType {
			out.Type = b.addType(dir, key, n.Role)
		} else {
			out.FuncInfo = &FuncInfo{Sig: f.fn.Sig, Errs: orEmpty(f.fn.Errs), Gos: orEmpty(f.fn.Gos), Locks: uniqueLocks(f.fn.Locks),
				Selects: orEmpty(f.fn.Select), Calls: orEmpty(f.fn.Calls), Range: [2]int{f.line, f.end}}
			if f.fn.Recv != "" {
				out.Recv = b.addType(dir, f.fn.Recv, "")
			}
		}
		code := b.slice(f.file, b.withDocStart(f.file, f.line), f.end)
		out.Code = &code
	case n.Sentinel != "":
		dir, name, _ := strings.Cut(n.Sentinel, ":")
		var found *scan.Sentinel
		if p := b.scan.Packages[dir]; p != nil {
			for i := range p.Sentinels {
				if p.Sentinels[i].Name == name {
					found = &p.Sentinels[i]
					break
				}
			}
		}
		if found == nil {
			b.err("%s: sentinel %s not found", ctx, n.Sentinel)
		} else {
			out.Pkg = dir
			if out.Label == "" {
				out.Label = name
			}
			out.Place = &Place{Path: found.File, Line: found.Line, Doc: found.Text}
			code := b.slice(found.File, max(1, found.Line-3), found.Line+3, [2]int{found.Line, found.Line})
			out.Code = &code
		}
	case n.Kind == "func" || n.Kind == "type":
		b.err("%s: needs \"symbol\"", ctx)
	}
	if out.Label == "" {
		out.Label = n.ID
	}
	if n.Kind != "type" && out.What == "" {
		b.warn("%s: no \"what\"", ctx)
	}
	b.nodes.set(n.ID, out)
}
