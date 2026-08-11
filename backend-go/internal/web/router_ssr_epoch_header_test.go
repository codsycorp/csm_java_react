package web

import (
	"net/http/httptest"
	"strconv"
	"testing"

	"csm_server/backend-go/internal/cacheepoch"
)

func TestSetSSREpochHeader_ReflectsCurrentEpoch(t *testing.T) {
	_ = cacheepoch.BumpSSRContentEpoch()
	want := strconv.FormatUint(cacheepoch.CurrentSSRContentEpoch(), 10)

	rr := httptest.NewRecorder()
	setSSREpochHeader(rr)

	if got := rr.Header().Get("X-SSR-Epoch"); got != want {
		t.Fatalf("expected X-SSR-Epoch=%q, got %q", want, got)
	}
}
