package paths

import "strings"

var bareAPIPaths = map[string]struct{}{
	"/login":                    {},
	"/logout":                   {},
	"/refresh-token":            {},
	"/user-info":                {},
	"/register":                 {},
	"/create-sub-user":          {},
	"/get-async-routes":         {},
	"/role-list":                {},
	"/role-item":                {},
	"/role-menu":                {},
	"/menu-by-role-id":          {},
	"/menu-list":                {},
	"/menu-item":                {},
	"/notifications":            {},
	"/home":                     {},
	"/home/pie":                 {},
	"/home/line":                {},
	"/home/googlebot":           {},
	"/home/googlebot/delete":    {},
	"/restoredb":                {},
	"/backupdb":                 {},
	"/migrateKeys":              {},
	"/create-table":             {},
	"/drop-table":               {},
	"/get-table-data":           {},
	"/update-table-data":        {},
	"/bulk-update-table-data":   {},
	"/update-table-data-index":  {},
	"/seo":                      {},
	"/scrape-web":               {},
	"/execute-js-on-page":       {},
	"/indexgoogle":              {},
	"/create-default-data":      {},
	"/chat-history":             {},
	"/chat-history-guest":       {},
	"/chat-history-app":         {},
	"/apps-list":                {},
	"/chat-guests-list":         {},
	"/chat-mark-read":           {},
	"/chat-mark-all-read":       {},
	"/chat-delete-message":      {},
	"/ai-generate-seo-content":  {},
	"/aiAssistant-chat-stream":  {},
	"/ai/menu-merge":            {},
}

func IsBareAPIPath(uri string) bool {
	clean := strings.TrimPrefix(uri, "/api")
	if _, ok := bareAPIPaths[clean]; ok {
		return true
	}
	if strings.HasPrefix(clean, "/crm/") {
		return true
	}
	if strings.HasPrefix(clean, "/facebook/") || strings.HasPrefix(clean, "/google/") {
		return true
	}
	return false
}

func IsDirectAIPath(uri string) bool {
	clean := strings.TrimPrefix(uri, "/api")
	return strings.HasPrefix(clean, "/ai-local") ||
		strings.HasPrefix(clean, "/ai-code-stream") ||
		clean == "/aiAssistant-chat-stream" ||
		clean == "/ai/menu-merge"
}
