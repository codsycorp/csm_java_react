package security

import (
	"testing"

	"csm_server/backend-go/internal/model"
)

func TestApplyAccountExpiryFromInput_ExplicitEpoch(t *testing.T) {
	target := map[string]any{"account_expiry_at": int64(1893456000000)}
	expiry, ok := ApplyAccountExpiryFromInput(target, nil)
	if !ok {
		t.Fatal("expected explicit expiry to be applied")
	}
	if expiry != int64(1893456000000) {
		t.Fatalf("expiry=%d want %d", expiry, int64(1893456000000))
	}
	if got, _ := target["accountExpiryAt"].(int64); got != expiry {
		t.Fatalf("camel alias not synced, got=%d want=%d", got, expiry)
	}
}

func TestApplyAccountExpiryFromInput_UsageDays(t *testing.T) {
	target := map[string]any{"account_expiry_days": 2}
	expiry, ok := ApplyAccountExpiryFromInput(target, nil)
	if !ok {
		t.Fatal("expected usage days to be applied")
	}
	if expiry <= 0 {
		t.Fatalf("expected positive expiry, got %d", expiry)
	}
	if got, _ := target["account_expiry_at"].(int64); got != expiry {
		t.Fatalf("stored expiry=%d want=%d", got, expiry)
	}
}

func TestAccountExpired(t *testing.T) {
	past := int64(1)
	future := int64(9999999999999)
	if !AccountExpired(model.User{AccountExpiryAt: &past}) {
		t.Fatal("expected past expiry to be expired")
	}
	if AccountExpired(model.User{AccountExpiryAt: &future}) {
		t.Fatal("expected far future expiry to be active")
	}
}

func TestValidateRequiredAccountExpiryOnCreate(t *testing.T) {
	if _, msg := ValidateRequiredAccountExpiryOnCreate(map[string]any{}, nil); msg == "" {
		t.Fatal("expected missing expiry to be rejected")
	}

	if _, msg := ValidateRequiredAccountExpiryOnCreate(map[string]any{"account_expiry_at": int64(1)}, nil); msg == "" {
		t.Fatal("expected past expiry to be rejected")
	}

	future := int64(9999999999999)
	expiry, msg := ValidateRequiredAccountExpiryOnCreate(map[string]any{"account_expiry_at": future}, nil)
	if msg != "" {
		t.Fatalf("unexpected validation error: %s", msg)
	}
	if expiry != future {
		t.Fatalf("expiry=%d want=%d", expiry, future)
	}
}
