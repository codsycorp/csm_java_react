package governance

import (
	"strings"
)

var sensitiveKeys = []string{
	"password", "pass", "f_pass", "token", "refresh_token", "secret",
	"api_key", "apikey", "authorization", "credit_card", "ssn",
}

// RedactMap removes PII/secrets from audit metadata (GDPR data minimization).
func RedactMap(in map[string]any) map[string]any {
	if in == nil {
		return nil
	}
	out := make(map[string]any, len(in))
	for k, v := range in {
		if isSensitiveKey(k) {
			out[k] = "[REDACTED]"
			continue
		}
		switch nested := v.(type) {
		case map[string]any:
			out[k] = RedactMap(nested)
		default:
			out[k] = v
		}
	}
	return out
}

func isSensitiveKey(key string) bool {
	lower := strings.ToLower(strings.TrimSpace(key))
	for _, s := range sensitiveKeys {
		if strings.Contains(lower, s) {
			return true
		}
	}
	return false
}

// RedactText masks common PII patterns in free text logs.
func RedactText(s string) string {
	// Email-like
	if i := strings.Index(s, "@"); i > 2 {
		return s[:2] + "***" + s[i:]
	}
	return s
}
