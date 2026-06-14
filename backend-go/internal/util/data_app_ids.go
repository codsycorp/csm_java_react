package util

import "strings"

// ExcludeMenuAppFromDataAppIDs removes the home/menu app from supplemental data-app access (Java parity).
func ExcludeMenuAppFromDataAppIDs(apps []string, menuAppID string) []string {
	menu := strings.TrimSpace(menuAppID)
	if menu == "" {
		out := make([]string, 0, len(apps))
		for _, item := range apps {
			if value := strings.TrimSpace(item); value != "" {
				out = append(out, value)
			}
		}
		return out
	}
	out := make([]string, 0, len(apps))
	for _, item := range apps {
		value := strings.TrimSpace(item)
		if value == "" || strings.EqualFold(value, menu) {
			continue
		}
		out = append(out, value)
	}
	return out
}

// IntersectPreserveOrder keeps source order while filtering to allowed values (case-insensitive).
func IntersectPreserveOrder(source, allowed []string) []string {
	if len(source) == 0 || len(allowed) == 0 {
		return nil
	}
	allowedSet := make(map[string]struct{}, len(allowed))
	for _, item := range allowed {
		value := strings.TrimSpace(item)
		if value == "" {
			continue
		}
		allowedSet[strings.ToLower(value)] = struct{}{}
	}
	if len(allowedSet) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(source))
	out := make([]string, 0, len(source))
	for _, item := range source {
		value := strings.TrimSpace(item)
		if value == "" {
			continue
		}
		key := strings.ToLower(value)
		if _, ok := allowedSet[key]; !ok {
			continue
		}
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, value)
	}
	return out
}
