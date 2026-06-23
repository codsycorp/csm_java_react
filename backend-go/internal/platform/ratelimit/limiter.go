package ratelimit

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"csm_server/backend-go/internal/platform/metrics"
)

// Limiter is a per-key token bucket (e.g. client IP for auth endpoints).
type Limiter struct {
	mu      sync.Mutex
	entries map[string]*bucket
	max     int
	window  time.Duration
}

type bucket struct {
	count   int
	resetAt time.Time
}

func New(max int, window time.Duration) *Limiter {
	if max <= 0 {
		max = 120
	}
	if window <= 0 {
		window = time.Minute
	}
	return &Limiter{
		entries: make(map[string]*bucket),
		max:     max,
		window:  window,
	}
}

func (l *Limiter) Allow(key string) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.entries[key]
	if !ok || now.After(b.resetAt) {
		l.entries[key] = &bucket{count: 1, resetAt: now.Add(l.window)}
		return true
	}
	if b.count >= l.max {
		return false
	}
	b.count++
	return true
}

// AuthMiddleware rate-limits sensitive public auth paths.
func AuthMiddleware(l *Limiter, paths ...string) func(http.Handler) http.Handler {
	set := make(map[string]struct{}, len(paths))
	for _, p := range paths {
		set[p] = struct{}{}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			clean := strings.TrimPrefix(r.URL.Path, "/api")
			if _, ok := set[clean]; !ok {
				next.ServeHTTP(w, r)
				return
			}
			key := clientKey(r)
			if !l.Allow(key) {
				metrics.IncRateLimit()
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "60")
				w.WriteHeader(http.StatusTooManyRequests)
				_, _ = w.Write([]byte(`{"code":429,"success":false,"message":"Too many requests"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func clientKey(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i >= 0 {
		return host[:i]
	}
	return host
}
