package walk

import (
	"archive/tar"
	"bytes"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/bhanuprakaash/codewalk/scan"
)

// Change is what happened to a symbol between two commits.
type Change struct {
	State string   `json:"state"`
	Diff  []string `json:"diff,omitempty"`
	Files []string `json:"files,omitempty"`
}

var hunkHead = regexp.MustCompile(`^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@`)

type hunk struct {
	oldFile, file string
	old, new      [2]int
	oldN, newN    int
	label         string
	lines         []string
}

// Changes compares the symbols ("dir:Key") at base and head and returns the ones whose lines
// changed ("changed") or that are gone at head ("removed"). Unchanged symbols are left out.
func Changes(repo, base, head string, symbols []string) (map[string]Change, error) {
	var dirs []string
	for _, s := range symbols {
		dir, _, _ := strings.Cut(s, ":")
		if !slices.Contains(dirs, dir) {
			dirs = append(dirs, dir)
		}
	}
	before, err := scanAt(repo, base, dirs)
	if err != nil {
		return nil, err
	}
	after, err := scanAt(repo, head, dirs)
	if err != nil {
		return nil, err
	}
	hunks, err := diffHunks(repo, base, head, dirs)
	if err != nil {
		return nil, err
	}
	out := map[string]Change{}
	for _, s := range symbols {
		a, aok := symbolRange(before, s)
		b, bok := symbolRange(after, s)
		switch {
		case !bok:
			out[s] = Change{State: "removed"}
		case !aok:
			out[s] = Change{State: "changed"}
		default:
			var diff []string
			for _, h := range hunks {
				if (h.oldN > 0 && h.oldFile == a.file && overlaps(h.old, a.lines)) ||
					(h.newN > 0 && h.file == b.file && overlaps(h.new, b.lines)) {
					diff = append(diff, h.label)
					diff = append(diff, h.lines...)
				}
			}
			if diff != nil {
				out[s] = Change{State: "changed", Diff: diff}
			}
		}
	}
	return out, nil
}

// ChangedFiles lists the files under dir that differ between base and head.
func ChangedFiles(repo, base, head, dir string) ([]string, error) {
	out, err := sh(repo, "git", "diff", "--name-only", base, head, "--", dir)
	if err != nil || out == "" {
		return nil, err
	}
	return strings.Split(out, "\n"), nil
}

type span struct {
	file  string
	lines [2]int
}

func symbolRange(r *scan.Result, symbol string) (span, bool) {
	dir, key, _ := strings.Cut(symbol, ":")
	p := r.Packages[dir]
	if p == nil {
		return span{}, false
	}
	if f := p.Funcs[key]; f != nil {
		return span{f.File, [2]int{f.Line, f.End}}, true
	}
	if t := p.Types[key]; t != nil {
		return span{t.File, [2]int{t.Line, t.End}}, true
	}
	return span{}, false
}

func overlaps(a, b [2]int) bool { return a[0] <= b[1] && b[0] <= a[1] }

// scanAt scans dirs as they are at commit sha, read from git rather than the working tree.
func scanAt(repo, sha string, dirs []string) (*scan.Result, error) {
	tmp, err := os.MkdirTemp("", "codewalk-scan-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)
	var present []string
	for _, dir := range dirs {
		cmd := exec.Command("git", "archive", "--format=tar", sha, "--", dir)
		cmd.Dir = repo
		raw, err := cmd.Output()
		if err != nil {
			continue
		}
		if err := untar(raw, tmp); err != nil {
			return nil, err
		}
		present = append(present, dir)
	}
	return scan.Scan(tmp, present)
}

func untar(raw []byte, dst string) error {
	tr := tar.NewReader(bytes.NewReader(raw))
	for {
		h, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		if h.Typeflag != tar.TypeReg || !filepath.IsLocal(h.Name) {
			continue
		}
		path := filepath.Join(dst, h.Name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return err
		}
		b, err := io.ReadAll(tr)
		if err != nil {
			return err
		}
		if err := os.WriteFile(path, b, 0o644); err != nil {
			return err
		}
	}
}

func diffHunks(repo, base, head string, dirs []string) ([]hunk, error) {
	args := append([]string{"git", "diff", "-U0", "--no-color", "--no-renames", base, head, "--"}, dirs...)
	out, err := sh(repo, args...)
	if err != nil {
		return nil, err
	}
	var hunks []hunk
	var oldFile, newFile string
	header := false
	for _, l := range strings.Split(out, "\n") {
		switch {
		case strings.HasPrefix(l, "diff --git "):
			header = true
		case header && strings.HasPrefix(l, "--- "):
			oldFile = strings.TrimPrefix(strings.TrimPrefix(l, "--- "), "a/")
		case header && strings.HasPrefix(l, "+++ "):
			newFile = strings.TrimPrefix(strings.TrimPrefix(l, "+++ "), "b/")
		case strings.HasPrefix(l, "@@"):
			header = false
			m := hunkHead.FindStringSubmatch(l)
			if m == nil {
				continue
			}
			num := func(s string, def int) int {
				if s == "" {
					return def
				}
				n, _ := strconv.Atoi(s)
				return n
			}
			a, an, b, bn := num(m[1], 0), num(m[2], 1), num(m[3], 0), num(m[4], 1)
			hunks = append(hunks, hunk{oldFile: oldFile, file: newFile, label: m[0],
				old: [2]int{a, a + an - 1}, oldN: an, new: [2]int{b, b + bn - 1}, newN: bn})
		case !header && len(hunks) > 0 && (strings.HasPrefix(l, "+") || strings.HasPrefix(l, "-")):
			hunks[len(hunks)-1].lines = append(hunks[len(hunks)-1].lines, l)
		}
	}
	return hunks, nil
}
