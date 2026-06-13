package security

import (
	"strings"

	"csm_server/backend-go/internal/api/paths"
)

func IsAPIRequest(uri string, host string) bool {
	if strings.HasPrefix(host, "api.") {
		return true
	}
	if strings.HasPrefix(uri, "/api/") {
		return true
	}
	return paths.IsDirectAIPath(uri) || paths.IsBareAPIPath(uri)
}
