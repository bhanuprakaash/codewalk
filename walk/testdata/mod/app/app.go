// Package app saves notes for callers.
package app

import (
	"errors"
	"sync"

	"example.com/tiny/store"
)

// ErrClosed is returned once the server stopped.
var ErrClosed = errors.New("server closed")

// Server saves notes until it is closed.
type Server struct {
	mu     sync.Mutex
	closed bool
	notes  *store.Store
}

// New makes a server with an empty store.
func New() *Server { return &Server{notes: store.New()} }

// Save keeps a note unless the server is closed.
func (s *Server) Save(text string) (store.Note, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return store.Note{}, ErrClosed
	}
	n, err := s.notes.Put(text)
	if err != nil {
		return store.Note{}, err
	}
	go s.notes.Flush()
	return n, nil
}
