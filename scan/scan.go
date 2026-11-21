// Package scan reads Go packages with go/parser and returns what codewalk needs: types with fields
// and doc comments, funcs and methods with signatures, the calls, goroutines, channel operations,
// locks and error returns inside each, sentinel errors, and which types implement which
// interfaces. Standard library only; calls are resolved through receiver and struct-field types,
// which covers a.cfg.Store.Save-style chains without full type checking.
package scan

import (
	"fmt"
	"go/ast"
	"go/doc"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
)

type (
	Field struct {
		Name string `json:"name"`
		Type string `json:"type"`
		Doc  string `json:"doc,omitempty"`
		Line int    `json:"line"`
	}
	Type struct {
		Name    string   `json:"name"`
		Kind    string   `json:"kind"`
		Doc     string   `json:"doc,omitempty"`
		File    string   `json:"file"`
		Line    int      `json:"line"`
		End     int      `json:"end"`
		Fields  []Field  `json:"fields,omitempty"`
		Methods []string `json:"methods,omitempty"`
	}
	Site struct {
		Callee string `json:"callee,omitempty"`
		Text   string `json:"text"`
		Line   int    `json:"line"`
		Cond   string `json:"cond,omitempty"`
		Mu     string `json:"mu,omitempty"`
		From   string `json:"from,omitempty"`
	}
	Func struct {
		Name   string `json:"name"`
		Recv   string `json:"recv,omitempty"`
		Sig    string `json:"sig"`
		Doc    string `json:"doc,omitempty"`
		File   string `json:"file"`
		Line   int    `json:"line"`
		End    int    `json:"end"`
		Calls  []Site `json:"calls,omitempty"`
		Gos    []Site `json:"gos,omitempty"`
		Errs   []Site `json:"errs,omitempty"`
		Chans  []Site `json:"chans,omitempty"`
		Locks  []Site `json:"locks,omitempty"`
		Select []Site `json:"selects,omitempty"`
		ErrIs  []Site `json:"errIs,omitempty"`
	}
	Sentinel struct {
		Name string `json:"name"`
		Text string `json:"text"`
		Line int    `json:"line"`
		File string `json:"file"`
	}
	Package struct {
		Name      string           `json:"name"`
		Dir       string           `json:"dir"`
		Doc       string           `json:"doc,omitempty"`
		Types     map[string]*Type `json:"types"`
		Funcs     map[string]*Func `json:"funcs"`
		Sentinels []Sentinel       `json:"sentinels,omitempty"`
		Imports   []string         `json:"imports,omitempty"`
	}
	Impl struct {
		Iface string `json:"iface"`
		Type  string `json:"type"`
	}
	Result struct {
		Module     string              `json:"module"`
		Packages   map[string]*Package `json:"packages"`
		Implements []Impl              `json:"implements"`
	}
)

type scanner struct {
	fset *token.FileSet
	repo string
	// srcOf holds each parsed file's bytes, for cutting source text out by position.
	srcOf map[string][]byte
	// fieldTypes["pkg.Type"]["field"] = "pkg.Type" of that field, for resolving selector chains.
	fieldTypes map[string]map[string]string
	methodSet  map[string]map[string]bool
	ifaces     map[string][]string
}

func (sc *scanner) src(n ast.Node) string {
	p, e := sc.fset.Position(n.Pos()), sc.fset.Position(n.End())
	b := sc.srcOf[p.Filename]
	s := string(b[p.Offset:e.Offset])
	if i := strings.Index(s, "\n"); i >= 0 {
		s = strings.TrimSpace(s[:i]) + " …"
	}
	return s
}
func (sc *scanner) line(n ast.Node) int    { return sc.fset.Position(n.Pos()).Line }
func (sc *scanner) rel(file string) string { r, _ := filepath.Rel(sc.repo, file); return r }

// typeName turns a type expression into "pkg.Type" (imports mapped to their package name).
func typeName(e ast.Expr, pkg string, imports map[string]string) string {
	switch t := e.(type) {
	case *ast.StarExpr:
		return typeName(t.X, pkg, imports)
	case *ast.Ident:
		return pkg + "." + t.Name
	case *ast.SelectorExpr:
		if x, ok := t.X.(*ast.Ident); ok {
			if p, ok := imports[x.Name]; ok {
				return p + "." + t.Sel.Name
			}
			return x.Name + "." + t.Sel.Name
		}
	case *ast.IndexExpr:
		return typeName(t.X, pkg, imports)
	}
	return ""
}

// Scan reads the packages in dirs (relative to repoDir) and returns what is in them.
func Scan(repoDir string, dirs []string) (*Result, error) {
	repo, err := filepath.Abs(repoDir)
	if err != nil {
		return nil, err
	}
	sc := &scanner{
		fset:       token.NewFileSet(),
		repo:       repo,
		srcOf:      map[string][]byte{},
		fieldTypes: map[string]map[string]string{},
		methodSet:  map[string]map[string]bool{},
		ifaces:     map[string][]string{},
	}
	out := &Result{Packages: map[string]*Package{}}
	if b, err := os.ReadFile(filepath.Join(repo, "go.mod")); err == nil {
		for _, l := range strings.Split(string(b), "\n") {
			if strings.HasPrefix(l, "module ") {
				out.Module = strings.TrimSpace(l[7:])
			}
		}
	}
	type parsed struct {
		pkg     *Package
		files   []*ast.File
		imports []map[string]string
	}
	var all []parsed
	for _, dir := range dirs {
		pkgs, err := parser.ParseDir(sc.fset, filepath.Join(repo, dir), func(fi os.FileInfo) bool { return !strings.HasSuffix(fi.Name(), "_test.go") }, parser.ParseComments)
		if err != nil {
			return nil, fmt.Errorf("scan %s: %w", dir, err)
		}
		for name, p := range pkgs {
			pk := &Package{Name: name, Dir: dir, Types: map[string]*Type{}, Funcs: map[string]*Func{}}
			pa := parsed{pkg: pk}
			names := make([]string, 0, len(p.Files))
			for fn := range p.Files {
				names = append(names, fn)
			}
			sort.Strings(names)
			for _, fn := range names {
				f := p.Files[fn]
				sc.srcOf[fn], _ = os.ReadFile(fn)
				imp := map[string]string{}
				for _, is := range f.Imports {
					path := strings.Trim(is.Path.Value, `"`)
					if !slices.Contains(pk.Imports, path) {
						pk.Imports = append(pk.Imports, path)
					}
					n := filepath.Base(path)
					if is.Name != nil {
						imp[is.Name.Name] = n
					} else {
						imp[n] = n
					}
				}
				pa.files = append(pa.files, f)
				pa.imports = append(pa.imports, imp)
				if f.Doc != nil && pk.Doc == "" {
					pk.Doc = doc.Synopsis(f.Doc.Text())
				}
			}
			sort.Strings(pk.Imports)
			all = append(all, pa)
			out.Packages[dir] = pk
		}
	}
	// pass 1: types, fields, method names, sentinels
	for _, pa := range all {
		pk := pa.pkg
		for fi, f := range pa.files {
			imp := pa.imports[fi]
			for _, d := range f.Decls {
				switch d := d.(type) {
				case *ast.GenDecl:
					for _, s := range d.Specs {
						switch s := s.(type) {
						case *ast.TypeSpec:
							t := &Type{Name: s.Name.Name, File: sc.rel(sc.fset.Position(s.Pos()).Filename), Line: sc.line(s), End: sc.fset.Position(s.End()).Line}
							if s.Doc != nil {
								t.Doc = strings.TrimSpace(s.Doc.Text())
							} else if d.Doc != nil && len(d.Specs) == 1 {
								t.Doc = strings.TrimSpace(d.Doc.Text())
							}
							key := pk.Name + "." + t.Name
							sc.fieldTypes[key] = map[string]string{}
							switch st := s.Type.(type) {
							case *ast.StructType:
								t.Kind = "struct"
								for _, fl := range st.Fields.List {
									ft := typeName(fl.Type, pk.Name, imp)
									text := strings.TrimSpace(fl.Doc.Text() + " " + fl.Comment.Text())
									tsrc := sc.src(fl.Type)
									if len(fl.Names) == 0 {
										t.Fields = append(t.Fields, Field{Name: tsrc, Type: tsrc, Doc: text, Line: sc.line(fl)})
										continue
									}
									for _, n := range fl.Names {
										t.Fields = append(t.Fields, Field{Name: n.Name, Type: tsrc, Doc: text, Line: sc.line(n)})
										sc.fieldTypes[key][n.Name] = ft
									}
								}
							case *ast.InterfaceType:
								t.Kind = "interface"
								for _, m := range st.Methods.List {
									for _, n := range m.Names {
										t.Methods = append(t.Methods, n.Name)
										t.Fields = append(t.Fields, Field{Name: n.Name, Type: sc.src(m.Type), Doc: strings.TrimSpace(m.Doc.Text()), Line: sc.line(n)})
									}
								}
								sc.ifaces[key] = t.Methods
							default:
								t.Kind = "type"
							}
							pk.Types[t.Name] = t
						case *ast.ValueSpec:
							for i, n := range s.Names {
								if strings.HasPrefix(n.Name, "Err") && i < len(s.Values) {
									pk.Sentinels = append(pk.Sentinels, Sentinel{Name: n.Name, Text: sc.src(s.Values[i]), Line: sc.line(n), File: sc.rel(sc.fset.Position(n.Pos()).Filename)})
								}
							}
						}
					}
				case *ast.FuncDecl:
					if d.Recv != nil && len(d.Recv.List) > 0 {
						r := typeName(d.Recv.List[0].Type, pk.Name, imp)
						if sc.methodSet[r] == nil {
							sc.methodSet[r] = map[string]bool{}
						}
						sc.methodSet[r][d.Name.Name] = true
					}
				}
			}
		}
	}
	// pass 2: funcs with their insides
	for _, pa := range all {
		pk := pa.pkg
		for fi, f := range pa.files {
			imp := pa.imports[fi]
			for _, d := range f.Decls {
				fd, ok := d.(*ast.FuncDecl)
				if !ok || fd.Body == nil {
					continue
				}
				fn := &Func{Name: fd.Name.Name, File: sc.rel(sc.fset.Position(fd.Pos()).Filename), Line: sc.line(fd), End: sc.fset.Position(fd.End()).Line}
				vars := map[string]string{} // local name -> pkg.Type
				key := fd.Name.Name
				if fd.Recv != nil && len(fd.Recv.List) > 0 {
					rt := typeName(fd.Recv.List[0].Type, pk.Name, imp)
					fn.Recv = strings.TrimPrefix(rt, pk.Name+".")
					key = fn.Recv + "." + fd.Name.Name
					for _, n := range fd.Recv.List[0].Names {
						vars[n.Name] = rt
					}
				}
				for _, p := range fd.Type.Params.List {
					for _, n := range p.Names {
						vars[n.Name] = typeName(p.Type, pk.Name, imp)
					}
				}
				if fd.Doc != nil {
					fn.Doc = strings.TrimSpace(fd.Doc.Text())
				}
				b := sc.srcOf[sc.fset.Position(fd.Pos()).Filename]
				full := func(n ast.Node) string {
					return string(b[sc.fset.Position(n.Pos()).Offset:sc.fset.Position(n.End()).Offset])
				}
				sig := fd.Name.Name + full(fd.Type.Params)
				if fd.Type.Results != nil {
					sig += " " + full(fd.Type.Results)
				}
				fn.Sig = strings.Join(strings.Fields(sig), " ")
				returnsErr := false
				if r := fd.Type.Results; r != nil && len(r.List) > 0 {
					if id, ok := r.List[len(r.List)-1].Type.(*ast.Ident); ok && id.Name == "error" {
						returnsErr = true
					}
				}
				resolve := func(call *ast.CallExpr) string {
					switch fx := call.Fun.(type) {
					case *ast.Ident:
						return fx.Name
					case *ast.SelectorExpr:
						var chain []string
						var e ast.Expr = fx
						for {
							if s, ok := e.(*ast.SelectorExpr); ok {
								chain = append([]string{s.Sel.Name}, chain...)
								e = s.X
								continue
							}
							break
						}
						root, ok := e.(*ast.Ident)
						if !ok {
							return ""
						}
						if p, ok := imp[root.Name]; ok && len(chain) == 1 {
							return p + "." + chain[0]
						}
						t := vars[root.Name]
						for _, sel := range chain[:len(chain)-1] {
							t = sc.fieldTypes[t][sel]
						}
						if t == "" {
							return ""
						}
						m := chain[len(chain)-1]
						if sc.methodSet[t][m] || len(sc.ifaces[t]) > 0 {
							return strings.TrimPrefix(t, pk.Name+".") + "." + m
						}
					}
					return ""
				}
				var stack []ast.Node
				lastErr := "" // the call that last assigned err, for "fails when <call> fails"
				ast.Inspect(fd.Body, func(n ast.Node) bool {
					if n == nil {
						stack = stack[:len(stack)-1]
						return true
					}
					stack = append(stack, n)
					inClosure := func() bool {
						for i := len(stack) - 2; i >= 0; i-- {
							if _, ok := stack[i].(*ast.FuncLit); ok {
								return true
							}
						}
						return false
					}
					cond := func() string {
						for i := len(stack) - 2; i >= 0; i-- {
							switch s := stack[i].(type) {
							case *ast.IfStmt:
								return sc.src(s.Cond)
							case *ast.CommClause:
								if s.Comm != nil {
									return "case " + sc.src(s.Comm)
								}
								return "default"
							case *ast.CaseClause:
								if len(s.List) > 0 {
									return "case " + sc.src(s.List[0])
								}
								return "default"
							case *ast.FuncLit:
								return ""
							}
						}
						return ""
					}
					switch s := n.(type) {
					case *ast.AssignStmt:
						for _, l := range s.Lhs {
							// an err set inside a closure is the closure's, not this func's
							if id, ok := l.(*ast.Ident); ok && id.Name == "err" && len(s.Rhs) > 0 && !inClosure() {
								lastErr = sc.src(s.Rhs[len(s.Rhs)-1])
							}
						}
						// remember locals made from a composite literal or &T{} so later calls resolve
						for i, l := range s.Lhs {
							id, ok := l.(*ast.Ident)
							if !ok || i >= len(s.Rhs) {
								continue
							}
							r := s.Rhs[i]
							if u, ok := r.(*ast.UnaryExpr); ok {
								r = u.X
							}
							if c, ok := r.(*ast.CompositeLit); ok {
								vars[id.Name] = typeName(c.Type, pk.Name, imp)
							}
						}
					case *ast.GoStmt:
						fn.Gos = append(fn.Gos, Site{Callee: resolve(s.Call), Text: sc.src(s.Call), Line: sc.line(s)})
					case *ast.CallExpr:
						if sel, ok := s.Fun.(*ast.SelectorExpr); ok && (sel.Sel.Name == "Lock" || sel.Sel.Name == "RLock" || sel.Sel.Name == "Unlock" || sel.Sel.Name == "RUnlock") && len(s.Args) == 0 {
							fn.Locks = append(fn.Locks, Site{Mu: sc.src(sel.X), Text: sc.src(s), Line: sc.line(s)})
							return true
						}
						callee := resolve(s)
						if callee == "errors.Is" && len(s.Args) == 2 {
							fn.ErrIs = append(fn.ErrIs, Site{Text: sc.src(s.Args[1]), Line: sc.line(s)})
						}
						fn.Calls = append(fn.Calls, Site{Callee: callee, Text: sc.src(s.Fun), Line: sc.line(s)})
					case *ast.SendStmt:
						fn.Chans = append(fn.Chans, Site{Text: sc.src(s), Line: sc.line(s), Cond: "send"})
					case *ast.UnaryExpr:
						if s.Op == token.ARROW {
							fn.Chans = append(fn.Chans, Site{Text: sc.src(s), Line: sc.line(s), Cond: "receive"})
						}
					case *ast.SelectStmt:
						for _, c := range s.Body.List {
							cc := c.(*ast.CommClause)
							t := "default"
							if cc.Comm != nil {
								t = sc.src(cc.Comm)
							}
							fn.Select = append(fn.Select, Site{Text: t, Line: sc.line(cc)})
						}
					case *ast.ReturnStmt:
						if returnsErr && len(s.Results) > 0 {
							last := s.Results[len(s.Results)-1]
							if id, ok := last.(*ast.Ident); !ok || id.Name != "nil" {
								// skip returns inside closures: they are not this func's exits
								if inClosure() {
									return true
								}
								site := Site{Text: sc.src(last), Line: sc.line(s), Cond: cond()}
								// "fails when <call> fails" only when what it returns is the err variable
								usesErr := false
								ast.Inspect(last, func(n ast.Node) bool {
									if id, ok := n.(*ast.Ident); ok && id.Name == "err" {
										usesErr = true
									}
									return !usesErr
								})
								if usesErr {
									site.From = lastErr
								}
								fn.Errs = append(fn.Errs, site)
							}
						}
					}
					return true
				})
				pk.Funcs[key] = fn
			}
		}
	}
	for iface, ms := range sc.ifaces {
		if len(ms) == 0 {
			continue
		}
		for t, set := range sc.methodSet {
			ok := true
			for _, m := range ms {
				ok = ok && set[m]
			}
			if ok && t != iface {
				out.Implements = append(out.Implements, Impl{Iface: iface, Type: t})
			}
		}
	}
	sort.Slice(out.Implements, func(i, j int) bool {
		return out.Implements[i].Iface+out.Implements[i].Type < out.Implements[j].Iface+out.Implements[j].Type
	})
	return out, nil
}
