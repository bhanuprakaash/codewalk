package server

import (
	"bufio"
	"bytes"
	"cmp"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os/exec"
	"strings"
)

type askRequest struct {
	Question string `json:"question"`
	Context  struct {
		Lines []string `json:"lines"`
	} `json:"context"`
	Session string `json:"session"`
}

type streamLine struct {
	Type    string `json:"type"`
	Message struct {
		Content []struct {
			Type  string `json:"type"`
			Text  string `json:"text"`
			Name  string `json:"name"`
			Input struct {
				FilePath string `json:"file_path"`
				Pattern  string `json:"pattern"`
				Path     string `json:"path"`
			} `json:"input"`
		} `json:"content"`
	} `json:"message"`
	Result    string `json:"result"`
	SessionID string `json:"session_id"`
	IsError   bool   `json:"is_error"`
}

func ask(w http.ResponseWriter, r *http.Request, dataDir string) {
	var body askRequest
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body) != nil || body.Question == "" {
		writeError(w, http.StatusBadRequest, "A question is required.")
		return
	}
	dir, ok := scopeDir(w, r, dataDir)
	if !ok {
		return
	}
	info, err := readWalkInfo(dir)
	if err != nil {
		writeError(w, fileStatus(err), "No walk for this scope yet.")
		return
	}

	system := fmt.Sprintf("You answer questions from a developer exploring a codewalk (an interactive map of the code with a trace of real captured data) of `%s` in this repo, at commit %s.\n"+
		"They know Go at a medium level. Answer first, in 2-5 plain sentences. Use the real names.\n"+
		"Cite code as repo-relative path:line (e.g. run/run.go:877). Read the code before you claim anything about it; if you could not check something, say so.\n"+
		"You are read-only: never suggest you changed anything.", info.Scope, info.Commit[:min(7, len(info.Commit))])
	args := []string{"-p", strings.Join(body.Context.Lines, "\n") + "\n\nQuestion: " + body.Question,
		"--model", "sonnet", "--output-format", "stream-json", "--verbose",
		"--allowedTools", "Read", "Grep", "Glob", "--permission-mode", "dontAsk", "--append-system-prompt", system}
	if body.Session != "" {
		args = append(args, "--resume", body.Session)
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-store")
	enc := json.NewEncoder(w)
	send := func(v map[string]any) {
		enc.Encode(v)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}

	cmd := exec.CommandContext(r.Context(), "claude", args...)
	cmd.Dir = info.Repo
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err == nil {
		err = cmd.Start()
	}
	if err != nil {
		send(map[string]any{"done": true, "error": "Claude Code could not start: " + err.Error()})
		return
	}

	var answer string
	finished := false
	lines := bufio.NewReader(stdout)
	for {
		raw, err := lines.ReadBytes('\n')
		var m streamLine
		if json.Unmarshal(raw, &m) == nil {
			switch m.Type {
			case "assistant":
				for _, c := range m.Message.Content {
					switch c.Type {
					case "tool_use":
						target := cmp.Or(c.Input.FilePath, c.Input.Pattern, c.Input.Path)
						send(map[string]any{"step": strings.TrimSpace(c.Name + " " + strings.ReplaceAll(target, info.Repo+"/", ""))})
					case "text":
						answer = c.Text
						send(map[string]any{"text": c.Text})
					}
				}
			case "result":
				if m.Result != "" {
					answer = m.Result
				}
				done := map[string]any{"done": true, "answer": answer, "session": m.SessionID}
				if m.IsError {
					done["error"] = answer
				}
				send(done)
				finished = true
			}
		}
		if err != nil {
			break
		}
	}
	if err := cmd.Wait(); err != nil && !finished && answer == "" {
		var exit *exec.ExitError
		code := -1
		if errors.As(err, &exit) {
			code = exit.ExitCode()
		}
		last := ""
		for _, l := range strings.Split(stderr.String(), "\n") {
			if l != "" {
				last = l
			}
		}
		send(map[string]any{"done": true, "error": fmt.Sprintf("Claude Code could not answer (exit %d). %s", code, last)})
	}
}
