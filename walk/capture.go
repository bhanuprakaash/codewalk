package walk

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var (
	sseEvent = regexp.MustCompile(`(?m)^event: (.*)$`)
	sseData  = regexp.MustCompile(`(?m)^data: (.*)$`)
)

// capRead reads a one-line file (captured-at, commit) of a scenario; "" when there is none.
func (b *builder) capRead(scenario, file string) string {
	if b.capDir == "" {
		return ""
	}
	data, err := os.ReadFile(filepath.Join(b.capDir, scenario, file))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// capFile returns a scenario's file as JSON: .json as is, .jsonl and .ndjson as a list of their
// lines, sse.txt as a list of {event, data}, anything else as a string. nil means no such file.
func (b *builder) capFile(scenario, name string) (json.RawMessage, error) {
	key := scenario + "/" + name
	if v, ok := b.caps[key]; ok {
		return v, b.capErrs[key]
	}
	v, err := readCapture(filepath.Join(b.capDir, scenario, name))
	b.caps[key], b.capErrs[key] = v, err
	return v, err
}

func readCapture(path string) (json.RawMessage, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	raw := string(data)
	switch {
	case strings.HasSuffix(path, ".json"):
		if !json.Valid(data) {
			return nil, fmt.Errorf("%s is not valid JSON", filepath.Base(path))
		}
		return data, nil
	case strings.HasSuffix(path, ".jsonl"), strings.HasSuffix(path, ".ndjson"):
		list := []json.RawMessage{}
		for i, l := range strings.Split(raw, "\n") {
			if l == "" {
				continue
			}
			if !json.Valid([]byte(l)) {
				return nil, fmt.Errorf("%s line %d is not valid JSON", filepath.Base(path), i+1)
			}
			list = append(list, json.RawMessage(l))
		}
		return marshalRaw(list)
	case strings.HasSuffix(path, "sse.txt"):
		type event struct {
			Event *string         `json:"event,omitempty"`
			Data  json.RawMessage `json:"data"`
		}
		list := []event{}
		for _, blk := range strings.Split(raw, "\n\n") {
			if !strings.Contains(blk, "event:") {
				continue
			}
			e := event{Data: json.RawMessage("null")}
			if m := sseEvent.FindStringSubmatch(blk); m != nil {
				e.Event = &m[1]
			}
			if m := sseData.FindStringSubmatch(blk); m != nil && m[1] != "" {
				if !json.Valid([]byte(m[1])) {
					return nil, fmt.Errorf("%s has data that is not valid JSON: %s", filepath.Base(path), m[1])
				}
				e.Data = json.RawMessage(m[1])
			}
			list = append(list, e)
		}
		return marshalRaw(list)
	}
	return marshalRaw(raw)
}

func marshalRaw(v any) (json.RawMessage, error) {
	b, err := marshal(v, false)
	return bytes.TrimSpace(b), err
}

// pick follows a pointer like "/0/data" or "/notes/find:id=1/text" through v: find:k=v
// takes the first list item whose (dotted) field k is v. ok is false when nothing is there; a
// null on the way ends the walk with null.
func pick(v json.RawMessage, ptr string) (json.RawMessage, bool) {
	for _, part := range strings.Split(ptr, "/") {
		if part == "" {
			continue
		}
		if string(bytes.TrimSpace(v)) == "null" {
			break
		}
		if list, ok := asList(v); ok && strings.HasPrefix(part, "find:") {
			k, val, _ := strings.Cut(strings.TrimPrefix(part, "find:"), "=")
			v = nil
			for _, x := range list {
				if jsString(field(x, strings.Split(k, "."))) == val {
					v = x
					break
				}
			}
		} else {
			v = field(v, []string{part})
		}
		if v == nil {
			return nil, false
		}
	}
	return v, true
}

func asList(v json.RawMessage) ([]json.RawMessage, bool) {
	var list []json.RawMessage
	if !bytes.HasPrefix(bytes.TrimSpace(v), []byte("[")) {
		return nil, false
	}
	return list, json.Unmarshal(v, &list) == nil
}

// field follows keys (object keys, list indexes) through v; nil when any is missing.
func field(v json.RawMessage, keys []string) json.RawMessage {
	for _, k := range keys {
		if v == nil {
			return nil
		}
		if list, ok := asList(v); ok {
			i, err := strconv.Atoi(k)
			if err != nil || i < 0 || i >= len(list) || strconv.Itoa(i) != k {
				return nil
			}
			v = list[i]
			continue
		}
		var m map[string]json.RawMessage
		if json.Unmarshal(v, &m) != nil {
			return nil
		}
		v = m[k]
	}
	return v
}

// jsString is how find: compares a value: strings as they are, numbers and booleans as written.
func jsString(v json.RawMessage) string {
	if v == nil {
		return "undefined"
	}
	var s string
	if json.Unmarshal(v, &s) == nil {
		return s
	}
	return string(bytes.TrimSpace(v))
}
