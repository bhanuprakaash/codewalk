// Package pat holds one of each Go pattern codewalk looks for.
package pat

import (
	"context"
	"errors"
	"sync"
)

// ErrGone is returned for a key that is not there.
var ErrGone = errors.New("gone")

// Cache guards its map with a mutex.
type Cache struct {
	mu sync.Mutex
	m  map[string]int
}

// Get reads one key.
func (c *Cache) Get(k string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.m[k]
}

// Shape has two implementations.
type Shape interface{ Area() float64 }

type Sq struct{}

func (Sq) Area() float64 { return 1 }

type Ci struct{}

func (Ci) Area() float64 { return 2 }

// Run waits for a value or for ctx to end.
func Run(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	out := make(chan int)
	go produce(out)
	select {
	case v := <-out:
		_ = v
	case <-ctx.Done():
		return ctx.Err()
	}
	return nil
}

func produce(out chan<- int) { out <- 1 }

// Check reports whether err is ErrGone, even wrapped.
func Check(err error) bool { return errors.Is(err, ErrGone) }
