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

	mux.HandleFunc("GET /api/user", func(w http.ResponseWriter, r *http.Request) {
		dir, ok := scopeDir(w, r, dataDir)
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

	mux.HandleFunc("PUT /api/user", func(w http.ResponseWriter, r *http.Request) {
		dir, ok := scopeDir(w, r, dataDir)
		if !ok {
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 4<<20))
		var doc map[string]json.RawMessage
		if err != nil || json.Unmarshal(body, &doc) != nil || doc == nil {
			writeError(w, http.StatusBadRequest, "user.json must be a JSON object.")
			return
		}
		if err := writeFileAtomic(filepath.Join(dir, "user.json"), body); err != nil {
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
	project, scope := r.URL.Query().Get("project"), r.URL.Query().Get("scope")
	for _, name := range []string{project, scope} {
		if !filepath.IsLocal(name) || strings.ContainsAny(name, `/\`) || strings.HasPrefix(name, ".") {
			writeError(w, http.StatusBadRequest, "project and scope are required and must be plain names.")
			return "", false
		}
	}
	dir := filepath.Join(dataDir, project, scope)
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		writeError(w, http.StatusNotFound, "No such scope: "+project+"/"+scope+".")
		return "", false
	}
	return dir, true
}

func readWalkInfo(dir string) (walkInfo, error) {
	var info walkInfo
	raw, err := os.ReadFile(filepath.Join(dir, "walk.json"))
	if err == nil {
		err = json.Unmarshal(raw, &info)
	}
	return info, err
}

func writeFileAtomic(path string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".user-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
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
