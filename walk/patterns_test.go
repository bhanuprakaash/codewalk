package walk

import (
	"testing"

	"github.com/bhanuprakaash/codewalk/scan"
)

func TestFindPatterns(t *testing.T) {
	sc, err := scan.Scan("testdata/pat", []string{"."})
	if err != nil {
		t.Fatal(err)
	}
	got := map[string][]PatternSite{}
	var order []string
	for _, p := range findPatterns(sc) {
		got[p.ID] = p.Sites
		order = append(order, p.ID)
	}
	for _, c := range []struct {
		id    string
		sites []PatternSite
	}{
		{"go-chan", []PatternSite{{".:Run", "pat.Run"}}},
		{"select", []PatternSite{{".:Run", "pat.Run"}}},
		{"ctx-cancel", []PatternSite{{".:Run", "pat.Run"}}},
		{"mutex", []PatternSite{{".:Cache", "pat.Cache (mu)"}}},
		{"iface", []PatternSite{{".:Shape", "pat.Shape · pat.Ci, pat.Sq"}}},
		{"sentinel", []PatternSite{{".:Check", "pat.Check · ErrGone"}}},
	} {
		if s := got[c.id]; len(s) != len(c.sites) || s[0] != c.sites[0] {
			t.Errorf("%s: sites %+v, want %+v", c.id, s, c.sites)
		}
	}
	if len(order) != 6 {
		t.Errorf("patterns %q, want 6", order)
	}

	tiny, err := scan.Scan("testdata/mod", []string{"app", "store"})
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, p := range findPatterns(tiny) {
		ids = append(ids, p.ID)
	}
	if len(ids) != 1 || ids[0] != "mutex" {
		t.Errorf("tiny module patterns %q, want only mutex (its goroutine sends on no channel)", ids)
	}
}
