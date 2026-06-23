package slo

import "time"

// BudgetTracker estimates remaining monthly error budget from in-process counters.
// Production should use Prometheus recording rules; this provides a local fallback gauge.
type BudgetTracker struct {
	target    float64
	window    time.Duration
	errors    int64
	total     int64
	lastReset time.Time
}

func NewBudgetTracker(target float64, window time.Duration) *BudgetTracker {
	if target <= 0 {
		target = 1 - APIAvailabilityTarget
	}
	if window <= 0 {
		window = 30 * 24 * time.Hour
	}
	return &BudgetTracker{target: target, window: window, lastReset: time.Now()}
}

func (b *BudgetTracker) RecordRequest(isError bool) {
	if b == nil {
		return
	}
	b.maybeReset()
	b.total++
	if isError {
		b.errors++
	}
}

func (b *BudgetTracker) Remaining() float64 {
	if b == nil || b.total == 0 {
		return 1
	}
	actual := float64(b.errors) / float64(b.total)
	remaining := 1.0 - (actual / b.target)
	if remaining < 0 {
		return 0
	}
	return remaining
}

func (b *BudgetTracker) maybeReset() {
	if time.Since(b.lastReset) >= b.window {
		b.errors = 0
		b.total = 0
		b.lastReset = time.Now()
	}
}
