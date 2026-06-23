package ratelimit

import (
	"testing"
	"time"
)

func TestLimiterBlocksAfterMax(t *testing.T) {
	lim := New(2, time.Minute)
	if !lim.Allow("ip1") || !lim.Allow("ip1") {
		t.Fatal("first two should pass")
	}
	if lim.Allow("ip1") {
		t.Fatal("third should be blocked")
	}
	if lim.Allow("ip2") {
		// different key ok
	} else {
		t.Fatal("different key should pass")
	}
}
