package circuitbreaker

import (
	"errors"
	"sync"
	"time"
)

var ErrOpen = errors.New("circuit breaker open")

// Breaker protects downstream calls (llama) from cascading failures.
type Breaker struct {
	mu           sync.Mutex
	maxFailures  int
	cooldown     time.Duration
	failures     int
	state        string
	openedAt     time.Time
}

func New(maxFailures int, cooldown time.Duration) *Breaker {
	if maxFailures <= 0 {
		maxFailures = 5
	}
	if cooldown <= 0 {
		cooldown = 30 * time.Second
	}
	return &Breaker{maxFailures: maxFailures, cooldown: cooldown, state: "closed"}
}

func (b *Breaker) Run(fn func() error) error {
	if err := b.before(); err != nil {
		return err
	}
	err := fn()
	b.after(err)
	return err
}

func (b *Breaker) before() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.state != "open" {
		return nil
	}
	if time.Since(b.openedAt) >= b.cooldown {
		b.state = "half-open"
		return nil
	}
	return ErrOpen
}

func (b *Breaker) after(err error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if err == nil {
		b.failures = 0
		b.state = "closed"
		return
	}
	b.failures++
	if b.failures >= b.maxFailures {
		b.state = "open"
		b.openedAt = time.Now()
	}
}

func (b *Breaker) State() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.state
}
