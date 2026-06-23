package secrets

import "testing"

func TestValidateJWTSecretWeakDefault(t *testing.T) {
	if err := ValidateJWTSecret("change-me-to-a-strong-secretge", false); err != nil {
		t.Fatalf("expected warn-only mode, got %v", err)
	}
	if err := ValidateJWTSecret("change-me-to-a-strong-secretge", true); err == nil {
		t.Fatal("expected error for weak secret in strict mode")
	}
}

func TestValidateJWTSecretShort(t *testing.T) {
	if err := ValidateJWTSecret("short", true); err == nil {
		t.Fatal("expected error for short secret")
	}
}
