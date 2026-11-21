package walk

import (
	"bytes"
	"encoding/json"
	"errors"
)

type storyboard struct {
	Title     string
	Repo      string
	Scope     string
	Summary   string
	Scan      []string
	Capture   string
	Packages  packageRoles
	Types     []struct{ Symbol, Role string }
	Nodes     []nodeSpec
	Workflows []workflowSpec
	State     *stateSpec
}

type nodeSpec struct {
	ID, Kind, Symbol, Sentinel, Label, Pkg, Sub, What, Gotcha, Role string
	Why                                                             *struct{ Text, Source string }
}

type workflowSpec struct {
	ID, Title, Summary, Capture string
	Nodes                       []string
	Pos                         map[string][]float64
	Edges                       []edgeSpec
	Trace                       []stepSpec
	Whatifs                     []whatifSpec
}

type edgeSpec struct{ ID, From, To, Kind, Label, Cond, Skip, Match, Path string }

type stepSpec struct {
	At, Title, Does, Note, Jump string
	Stop                        *struct{ Path, Match, After string }
	Values                      []valueSpec
}

type valueSpec struct {
	Name, Type, Note, Dir, Capture, Basis string
	Constructed                           json.RawMessage
}

type whatifSpec struct {
	ID, Title, Summary, Capture, ForkAt string
	Trace                               []stepSpec
}

type stateSpec struct {
	Module     string
	Roots      json.RawMessage
	Watch      []json.RawMessage
	Shell      []json.RawMessage
	Goroutines json.RawMessage
}

type owner struct{ Owner, Name, Note string }

type packageRole struct{ Dir, Role string }

// packageRoles keeps the order of the "packages" object: it becomes the order of the overview.
type packageRoles []packageRole

func (p *packageRoles) UnmarshalJSON(data []byte) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	if _, err := dec.Token(); err != nil {
		return err
	}
	for dec.More() {
		k, err := dec.Token()
		if err != nil {
			return err
		}
		dir, ok := k.(string)
		if !ok {
			return errors.New(`"packages" must be an object`)
		}
		var role string
		if err := dec.Decode(&role); err != nil {
			return err
		}
		*p = append(*p, packageRole{dir, role})
	}
	return nil
}
