package cors

import (
	"net/http"
	"strings"

	chicors "github.com/go-chi/cors"
)

// Options builds chi CORS from an allowlist. Empty list keeps permissive dev behavior.
func Options(allowedOrigins []string) chicors.Options {
	origins := normalizeOrigins(allowedOrigins)
	if len(origins) == 0 {
		return chicors.Options{
			AllowOriginFunc: func(r *http.Request, origin string) bool { return true },
			AllowedMethods:  []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
			AllowedHeaders: []string{
				"Accept", "Authorization", "Content-Type", "X-CSRF-Token",
				"csm-token", "X-Refresh-Token", "csm-lang", "X-Client-Id", "X-Requested-With",
			},
			AllowCredentials: true,
			MaxAge:           3600,
		}
	}
	allowSet := make(map[string]struct{}, len(origins))
	for _, o := range origins {
		allowSet[o] = struct{}{}
	}
	return chicors.Options{
		AllowOriginFunc: func(r *http.Request, origin string) bool {
			if origin == "" {
				return false
			}
			_, ok := allowSet[strings.TrimSpace(origin)]
			return ok
		},
		AllowedMethods:  []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{
			"Accept", "Authorization", "Content-Type", "X-CSRF-Token",
			"csm-token", "X-Refresh-Token", "csm-lang", "X-Client-Id", "X-Requested-With",
		},
		AllowCredentials: true,
		MaxAge:           3600,
	}
}

func normalizeOrigins(in []string) []string {
	out := make([]string, 0, len(in))
	for _, o := range in {
		o = strings.TrimSpace(o)
		if o != "" {
			out = append(out, o)
		}
	}
	return out
}
