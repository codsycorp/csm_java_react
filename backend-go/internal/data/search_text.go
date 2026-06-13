package data

import (
	"fmt"
	"strings"
)

var searchTextFields = []string{
	"name", "title", "summary", "content", "description", "body", "text",
	"email", "username", "full_name", "fullName", "phoneNumber", "note", "notes",
	"login_identifier", "tag", "tags", "path", "scope", "message", "comment",
}

// ExtractSearchText builds FTS title/content from a record (mirrors cmd/migrate).
func ExtractSearchText(record map[string]any) (title, content string) {
	var parts []string
	for _, f := range searchTextFields {
		v, ok := record[f]
		if !ok {
			continue
		}
		s := strings.TrimSpace(fmt.Sprint(v))
		if s == "" || s == "<nil>" {
			continue
		}
		if title == "" && (f == "name" || f == "title" || f == "username" || f == "email") {
			title = s
		}
		parts = append(parts, s)
	}
	content = strings.Join(parts, " ")
	if title == "" && len(parts) > 0 {
		title = trimRunes(parts[0], 120)
	}
	return title, content
}

func recordIDFromMap(record map[string]any, fallbackKey string) string {
	for _, k := range []string{"id", "chunkId", "chunk_id"} {
		if v, ok := record[k]; ok {
			return fmt.Sprint(v)
		}
	}
	return fallbackKey
}

func trimRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}
