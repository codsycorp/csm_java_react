package governance

import "testing"

func TestRedactMapSensitiveKeys(t *testing.T) {
	out := RedactMap(map[string]any{
		"username": "alice",
		"password": "secret123",
		"nested": map[string]any{"api_key": "k"},
	})
	if out["password"] != "[REDACTED]" {
		t.Fatalf("password not redacted: %v", out["password"])
	}
	nested := out["nested"].(map[string]any)
	if nested["api_key"] != "[REDACTED]" {
		t.Fatalf("api_key not redacted")
	}
	if out["username"] != "alice" {
		t.Fatalf("username should remain")
	}
}
