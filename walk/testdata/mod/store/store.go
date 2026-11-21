// Package store keeps notes in memory.
package store

import "errors"

var errEmpty = errors.New("empty note")

// Note is one saved line of text.
type Note struct {
	ID   int
	Text string
}

// Putter is anything that can keep a note.
type Putter interface {
	Put(text string) (Note, error)
}

// Store is an in-memory Putter.
type Store struct {
	notes []Note
}

// New makes an empty store.
func New() *Store { return &Store{} }

// Put keeps a note and gives it the next id.
func (s *Store) Put(text string) (Note, error) {
	if text == "" {
		return Note{}, errEmpty
	}
	n := Note{ID: len(s.notes) + 1, Text: text}
	s.notes = append(s.notes, n)
	return n, nil
}

// Flush would write the notes out.
func (s *Store) Flush() {}
