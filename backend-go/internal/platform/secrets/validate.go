package secrets

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
)

var weakSecrets = []string{
	"change-me-to-a-strong-secretge",
	"changeme",
	"secret",
	"password",
	"jwt-secret",
}

// ValidateJWTSecret warns or fails startup when JWT secret is weak in production.
func ValidateJWTSecret(secret string, requireStrong bool) error {
	s := strings.TrimSpace(secret)
	if len(s) < 32 {
		msg := fmt.Sprintf("JWT_SECRET too short (%d chars); use >= 32 random bytes", len(s))
		if requireStrong {
			return errors.New(msg)
		}
		log.Printf("WARN secrets: %s", msg)
	}
	lower := strings.ToLower(s)
	for _, w := range weakSecrets {
		if lower == w {
			msg := "JWT_SECRET is a known weak default — rotate immediately"
			if requireStrong {
				return errors.New(msg)
			}
			log.Printf("WARN secrets: %s", msg)
			break
		}
	}
	return nil
}

// RequireStrongFromEnv returns true when CSM_REQUIRE_STRONG_JWT=1 or NODE_ENV=production.
func RequireStrongFromEnv() bool {
	if v := strings.ToLower(os.Getenv("CSM_REQUIRE_STRONG_JWT")); v == "1" || v == "true" || v == "yes" {
		return true
	}
	env := strings.ToLower(os.Getenv("CSM_ENV"))
	return env == "production" || env == "prod"
}
