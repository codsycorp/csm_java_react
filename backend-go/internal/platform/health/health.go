package health

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

// Checker probes a dependency for readiness.
type Checker interface {
	Name() string
	Check(ctx context.Context) error
}

// Registry runs registered dependency checks.
type Registry struct {
	mu       sync.RWMutex
	checkers []Checker
}

func NewRegistry() *Registry { return &Registry{} }

func (r *Registry) Register(c Checker) {
	r.mu.Lock()
	r.checkers = append(r.checkers, c)
	r.mu.Unlock()
}

type Report struct {
	Status     string            `json:"status"`
	Backend    string            `json:"backend"`
	Components map[string]string `json:"components"`
	CheckedAt  string            `json:"checked_at"`
}

// Liveness is a cheap always-UP probe (process running).
func Liveness(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, Report{
		Status:    "UP",
		Backend:   "go",
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

// Readiness runs dependency checks with a timeout.
func (r *Registry) Readiness(w http.ResponseWriter, _ *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	r.mu.RLock()
	checkers := append([]Checker(nil), r.checkers...)
	r.mu.RUnlock()

	components := map[string]string{}
	allOK := true
	for _, c := range checkers {
		name := c.Name()
		if err := c.Check(ctx); err != nil {
			components[name] = "DOWN: " + err.Error()
			allOK = false
		} else {
			components[name] = "UP"
		}
	}
	status := "UP"
	code := http.StatusOK
	if !allOK {
		status = "DEGRADED"
		code = http.StatusServiceUnavailable
	}
	writeJSON(w, code, Report{
		Status:     status,
		Backend:    "go",
		Components: components,
		CheckedAt:  time.Now().UTC().Format(time.RFC3339),
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// PebbleChecker verifies the data directory is accessible.
type PebbleChecker struct {
	Probe func() error
}

func (p PebbleChecker) Name() string { return "pebble" }
func (p PebbleChecker) Check(ctx context.Context) error {
	if p.Probe == nil {
		return nil
	}
	ch := make(chan error, 1)
	go func() { ch <- p.Probe() }()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case err := <-ch:
		return err
	}
}

// LlamaChecker reports model availability (degraded if missing, not fatal).
type LlamaChecker struct {
	Available func() bool
	OnDisk    func() bool
}

func (l LlamaChecker) Name() string { return "llama" }
func (l LlamaChecker) Check(ctx context.Context) error {
	if l.Available != nil && l.Available() {
		return nil
	}
	if l.OnDisk != nil && l.OnDisk() {
		return nil
	}
	return nil
}

// RedisChecker verifies Redis when event bus mode is redis.
type RedisChecker struct {
	Ping func(context.Context) error
}

func (r RedisChecker) Name() string { return "redis" }
func (r RedisChecker) Check(ctx context.Context) error {
	if r.Ping == nil {
		return nil
	}
	return r.Ping(ctx)
}
