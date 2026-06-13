package security

import (
	"strings"

	"csm_server/backend-go/internal/api/paths"
)

// IsAPIRequest mirrors Rust is_api_request: api.* host, /api/* prefix, or direct AI paths.
// Bare paths (/login, /user-info, …) are handled separately in CatchAll with admin-host exclusion.
func IsAPIRequest(uri string, host string) bool {
	if strings.HasPrefix(host, "api.") {
		return true
	}
	if strings.HasPrefix(uri, "/api/") {
		return true
	}
	return paths.IsDirectAIPath(uri)
}
