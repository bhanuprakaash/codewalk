package server

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/bhanuprakaash/codewalk/walk"
)

type walkInfo struct {
	Repo   string `json:"repo"`
	Scope  string `json:"scope"`
	Commit string `json:"commit"`
}

func walkRoutes(mux *http.ServeMux, dataDir string) {
	mux.HandleFunc("GET /api/walk", func(w http.ResponseWriter, r *http.Request) {
		dir, ok := scopeDir(w, r, dataDir)
		if !ok {
			return
		}
		raw, err := os.ReadFile(filepath.Join(dir, "walk.json"))
		if err != nil {
			writeError(w, fileStatus(err), "No walk for this scope yet. Run codewalk validate on its storyboard.")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(raw)
	})

	mux.HandleFunc("GET /api/system", func(w http.ResponseWriter, r *http.Request) {
		dir, ok := dirOf(w, r, dataDir, false)
		if !ok {
			return
		}
		name, id := "system.built.json", r.URL.Query().Get("id")
		if id != "" {
			if !plainName(id) {
				writeError(w, http.StatusBadRequest, "id must be a plain name.")
				return
			}
			name = "system-" + id + ".built.json"
		}
		raw, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			writeError(w, fileStatus(err), "No system view here yet. Run codewalk validate on its "+strings.TrimSuffix(name, ".built.json")+".json.")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(raw)
	})

	mux.HandleFunc("GET /api/user", func(w http.ResponseWriter, r *http.Request) {
		dir, ok := dirOf(w, r, dataDir, false)
		if !ok {
			return
		}
		raw, err := os.ReadFile(filepath.Join(dir, "user.json"))
		if errors.Is(err, fs.ErrNotExist) {
			raw, err = []byte("{}"), nil
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(raw)
	})

	var userLocks sync.Map
	mux.HandleFunc("PATCH /api/user", func(w http.ResponseWriter, r *http.Request) {
		dir, ok := dirOf(w, r, dataDir, false)
		if !ok {
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 4<<20))
		var patch map[string]json.RawMessage
		if err != nil || json.Unmarshal(body, &patch) != nil || patch == nil {
			writeError(w, http.StatusBadRequest, "The patch must be a JSON object.")
			return
		}
		path := filepath.Join(dir, "user.json")
		lock, _ := userLocks.LoadOrStore(path, &sync.Mutex{})
		lock.(*sync.Mutex).Lock()
		defer lock.(*sync.Mutex).Unlock()
		doc := map[string]json.RawMessage{}
		raw, err := os.ReadFile(path)
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if json.Unmarshal(raw, &doc) != nil || doc == nil {
			doc = map[string]json.RawMessage{}
		}
		if err := mergeUser(doc, patch); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		out, _ := json.Marshal(doc)
		if err := walk.WriteFileAtomic(path, out); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("GET /api/code", func(w http.ResponseWriter, r *http.Request) {
		dir, ok := scopeDir(w, r, dataDir)
		if !ok {
			return
		}
		info, err := readWalkInfo(dir)
		if err != nil {
			writeError(w, fileStatus(err), "No walk for this scope yet.")
			return
		}
		path := r.URL.Query().Get("path")
		line, _ := strconv.Atoi(r.URL.Query().Get("line"))
		line = max(line, 1)
		if !filepath.IsLocal(path) {
			writeError(w, http.StatusNotFound, "No such file in the repo.")
			return
		}
		raw, err := os.ReadFile(filepath.Join(info.Repo, path))
		if err != nil {
			writeError(w, http.StatusNotFound, "No such file in the repo.")
			return
		}
		all := strings.Split(string(raw), "\n")
		start := max(line-10, 1)
		end := min(line+14, len(all))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"path": path, "start": start, "lines": all[min(start-1, end):end], "hl": [][2]int{{line, line}},
		})
	})

	mux.HandleFunc("POST /api/ask", func(w http.ResponseWriter, r *http.Request) { ask(w, r, dataDir) })
}

// scopeDir maps ?project=&scope= to <data>/<project>/<scope>. Both must be a single plain name,
// so a request can never reach outside the data dir.
func scopeDir(w http.ResponseWriter, r *http.Request, dataDir string) (string, bool) {
	return dirOf(w, r, dataDir, true)
}

// dirOf is scopeDir that also accepts a missing scope, meaning the project folder itself.
func dirOf(w http.ResponseWriter, r *http.Request, dataDir string, needScope bool) (string, bool) {
	project, scope := r.URL.Query().Get("project"), r.URL.Query().Get("scope")
	names := []string{project}
	if needScope || scope != "" {
		names = append(names, scope)
	}
	for _, name := range names {
		if !plainName(name) {
			writeError(w, http.StatusBadRequest, "project and scope are required and must be plain names.")
			return "", false
		}
	}
	dir := filepath.Join(dataDir, project, scope)
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		if scope == "" {
			writeError(w, http.StatusNotFound, "No such project: "+project+".")
		} else {
			writeError(w, http.StatusNotFound, "No such scope: "+project+"/"+scope+".")
		}
		return "", false
	}
	return dir, true
}

func plainName(name string) bool {
	return filepath.IsLocal(name) && !strings.ContainsAny(name, `/\`) && !strings.HasPrefix(name, ".")
}

func readWalkInfo(dir string) (walkInfo, error) {
	var info walkInfo
	raw, err := os.ReadFile(filepath.Join(dir, "walk.json"))
	if err == nil {
		err = json.Unmarshal(raw, &info)
	}
	return info, err
}

// mergeUser sets each top-level key of patch in doc. positions and notes merge one level deeper,
// and a null entry deletes it.
func mergeUser(doc, patch map[string]json.RawMessage) error {
	for k, v := range patch {
		if k != "positions" && k != "notes" {
			doc[k] = v
			continue
		}
		var entries, merged map[string]json.RawMessage
		if json.Unmarshal(v, &entries) != nil || entries == nil {
			return errors.New(k + " must be a JSON object.")
		}
		if json.Unmarshal(doc[k], &merged) != nil || merged == nil {
			merged = map[string]json.RawMessage{}
		}
		for name, entry := range entries {
			if string(entry) == "null" {
				delete(merged, name)
			} else {
				merged[name] = entry
			}
		}
		doc[k], _ = json.Marshal(merged)
	}
	return nil
}

func fileStatus(err error) int {
	if errors.Is(err, fs.ErrNotExist) {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
