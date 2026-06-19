package web

import (
	"net/url"
	"regexp"
	"strings"

	"csm_server/backend-go/internal/data"
)

var webHTMLTagPattern = regexp.MustCompile(`(?i)<[a-z][\s\S]*>`)

// decryptWebContent decodes CSM-encrypted or legacy URL-encoded website HTML fields.
func decryptWebContent(rm *data.RecordManager, value string) string {
	value = strings.TrimSpace(value)
	if value == "" || rm == nil {
		return value
	}
	if webHTMLTagPattern.MatchString(value) {
		return value
	}
	if strings.Contains(value, "%") {
		if decoded, err := url.QueryUnescape(value); err == nil && decoded != "" {
			return decoded
		}
	}
	decrypted, err := rm.CsmDecrypt(value)
	if err != nil || strings.TrimSpace(decrypted) == "" {
		return value
	}
	return decrypted
}
