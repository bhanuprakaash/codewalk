package server

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/bhanuprakaash/codewalk/walk"
)

type changes struct {
	Base    string                 `json:"base"`
	Head    string                 `json:"head"`
	Changes map[string]walk.Change `json:"changes"`
}

// changeRoutes serves what changed since the user last looked: per walk node with a symbol, or
// per package box of a system view when scope is left out.
func changeRoutes(mux *http.ServeMux, dataDir string) {
	var mu sync.Mutex
	cache := map[string]changes{}

	mux.HandleFunc("GET /api/changes", func(w http.ResponseWriter, r *http.Request) {
		dir, ok := dirOf(w, r, dataDir, false)
		if !ok {
			return
		}
		var built struct {
			Repo   string
			Commit string
			Nodes  map[string]struct{ Symbol string }
			Boxes  map[string]struct{ Pkg string }
		}
		name := "walk.json"
		if r.URL.Query().Get("scope") == "" {
			name = "system.built.json"
			if id := r.URL.Query().Get("id"); id != "" {
				if !plainName(id) {
					writeError(w, http.StatusBadRequest, "id must be a plain name.")
					return
				}
				name = "system-" + id + ".built.json"
			}
		}
		raw, err := os.ReadFile(filepath.Join(dir, name))
		if err == nil {
			err = json.Unmarshal(raw, &built)
		}
		if err != nil {
			writeError(w, fileStatus(err), "Nothing built here yet.")
			return
		}
		var user struct{ SeenSha string }
		if raw, err := os.ReadFile(filepath.Join(dir, "user.json")); err == nil {
			json.Unmarshal(raw, &user)
		}
		base := user.SeenSha
		if !isSha(base) {
			base = built.Commit
		}
		out, err := exec.Command("git", "-C", built.Repo, "rev-parse", "HEAD").Output()
		if err != nil || !isSha(base) {
			writeError(w, http.StatusConflict, "Cannot compare with the repo: it is gone or not a git repo.")
			return
		}
		head := strings.TrimSpace(string(out))
		res := changes{Base: base, Head: head, Changes: map[string]walk.Change{}}
		key := built.Repo + "|" + base + "|" + head + "|" + dir + "|" + name
		mu.Lock()
		cached, hit := cache[key]
		mu.Unlock()
		switch {
		case hit:
			res = cached
		case base == head:
		case built.Nodes != nil:
			var symbols []string
			for _, n := range built.Nodes {
				if n.Symbol != "" {
					symbols = append(symbols, n.Symbol)
				}
			}
			bySymbol, err := walk.Changes(built.Repo, base, head, symbols)
			if err != nil {
				writeError(w, http.StatusConflict, "Cannot compare "+short(base)+" with "+short(head)+" in the repo.")
				return
			}
			for id, n := range built.Nodes {
				if c, ok := bySymbol[n.Symbol]; ok && n.Symbol != "" {
					res.Changes[id] = c
				}
			}
		default:
			for id, b := range built.Boxes {
				if b.Pkg == "" {
					continue
				}
				files, err := walk.ChangedFiles(built.Repo, base, head, b.Pkg)
				if err != nil {
					writeError(w, http.StatusConflict, "Cannot compare "+short(base)+" with "+short(head)+" in the repo.")
					return
				}
				if files != nil {
					res.Changes[id] = walk.Change{State: "changed", Files: files}
				}
			}
		}
		mu.Lock()
		cache[key] = res
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(res)
	})
}

func short(sha string) string { return sha[:min(7, len(sha))] }

// isSha keeps user.json from passing options to git: base becomes a git argument.
func isSha(s string) bool {
	if len(s) < 7 || len(s) > 40 {
		return false
	}
	for _, c := range s {
		if !strings.ContainsRune("0123456789abcdef", c) {
			return false
		}
	}
	return true
}
