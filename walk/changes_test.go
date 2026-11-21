package walk

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

const srcA = `package p

// Kept is not touched but moves down.
func Kept() int { return 1 }

func Edited() int {
	return 1
}

func Gone() {}

type T struct{ A int }
`

const srcB = `package p

import "fmt"

// Kept is not touched but moves down.
func Kept() int { return 1 }

func Edited() int {
	fmt.Println("edited")
	return 2
}

type T struct{ A int }
`

func gitRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	git(t, dir, "init", "-q")
	return dir
}

func git(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"}, args...)...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return string(out)
}

func commit(t *testing.T, repo, src string) string {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(repo, "p"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "p", "p.go"), []byte(src), 0o644); err != nil {
		t.Fatal(err)
	}
	git(t, repo, "add", ".")
	git(t, repo, "commit", "-q", "-m", "c")
	sha, _ := sh(repo, "git", "rev-parse", "HEAD")
	return sha
}

func TestChanges(t *testing.T) {
	repo := gitRepo(t)
	a := commit(t, repo, srcA)
	b := commit(t, repo, srcB)
	got, err := Changes(repo, a, b, []string{"p:Kept", "p:Edited", "p:Gone", "p:T"})
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct{ symbol, state string }{
		{"p:Kept", ""},
		{"p:Edited", "changed"},
		{"p:Gone", "removed"},
		{"p:T", ""},
	} {
		if got[c.symbol].State != c.state {
			t.Errorf("%s: state %q, want %q", c.symbol, got[c.symbol].State, c.state)
		}
	}
	want := []string{"@@ -7 +9,2 @@", "-\treturn 1", "+\tfmt.Println(\"edited\")", "+\treturn 2"}
	if d := got["p:Edited"].Diff; len(d) != len(want) || d[0] != want[0] || d[3] != want[3] {
		t.Errorf("diff = %q, want %q", d, want)
	}
	if same, _ := Changes(repo, b, b, []string{"p:Edited"}); len(same) != 0 {
		t.Errorf("same commit: %v", same)
	}
}
