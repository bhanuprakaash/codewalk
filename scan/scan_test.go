package scan

import (
	"slices"
	"testing"
)

func TestScan(t *testing.T) {
	res, err := Scan("../walk/testdata/mod", []string{"app", "store"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Module != "example.com/tiny" {
		t.Errorf("module = %q", res.Module)
	}
	save := res.Packages["app"].Funcs["Server.Save"]
	if save == nil {
		t.Fatal("no Server.Save")
	}
	if save.Sig != "Save(text string) (store.Note, error)" || save.Recv != "Server" {
		t.Errorf("sig %q, recv %q", save.Sig, save.Recv)
	}
	var callees []string
	for _, c := range save.Calls {
		callees = append(callees, c.Callee)
	}
	if !slices.Contains(callees, "store.Store.Put") {
		t.Errorf("calls %q lack store.Store.Put", callees)
	}
	if len(save.Gos) != 1 || save.Gos[0].Callee != "store.Store.Flush" {
		t.Errorf("gos = %+v", save.Gos)
	}
	if len(save.Locks) != 2 || save.Locks[0].Mu != "s.mu" {
		t.Errorf("locks = %+v", save.Locks)
	}
	if len(save.Errs) != 2 || save.Errs[0].Text != "ErrClosed" || save.Errs[0].Cond != "s.closed" || save.Errs[1].From != "s.notes.Put(text)" {
		t.Errorf("errs = %+v", save.Errs)
	}
	if s := res.Packages["app"].Sentinels; len(s) != 1 || s[0].Name != "ErrClosed" {
		t.Errorf("sentinels = %+v", s)
	}
	if want := []Impl{{Iface: "store.Putter", Type: "store.Store"}}; !slices.Equal(res.Implements, want) {
		t.Errorf("implements = %+v", res.Implements)
	}
}

func TestScanMissingDir(t *testing.T) {
	if _, err := Scan("../walk/testdata/mod", []string{"nope"}); err == nil {
		t.Fatal("want an error for a package dir that does not exist")
	}
}
