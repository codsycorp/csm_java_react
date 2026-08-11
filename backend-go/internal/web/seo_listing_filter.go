package web

import (
	"net/url"
	"strings"
)

func hostFromBaseURL(baseURL string) string {
	raw := strings.TrimSpace(baseURL)
	if raw == "" {
		return ""
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(strings.ToLower(u.Hostname()))
}

func splitDomainTokens(domainList string) []string {
	replacer := strings.NewReplacer(";", ",", "|", ",")
	normalized := replacer.Replace(strings.TrimSpace(strings.ToLower(domainList)))
	parts := strings.Split(normalized, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		t := strings.TrimSpace(p)
		if t == "" {
			continue
		}
		if strings.Contains(t, ":") {
			t = strings.Split(t, ":")[0]
		}
		t = strings.TrimPrefix(t, "www.")
		if t != "" {
			out = append(out, t)
		}
	}
	return out
}

func domainTokensMatch(a, b string) bool {
	a = strings.TrimSpace(strings.ToLower(a))
	b = strings.TrimSpace(strings.ToLower(b))
	if a == "" || b == "" {
		return true
	}
	if a == b {
		return true
	}
	return strings.HasSuffix(a, "."+b) || strings.HasSuffix(b, "."+a)
}

func domainListMatches(domainList, expectedDomain string) bool {
	expected := splitDomainTokens(expectedDomain)
	actual := splitDomainTokens(domainList)
	if len(expected) == 0 || len(actual) == 0 {
		return true
	}
	for _, e := range expected {
		for _, a := range actual {
			if domainTokensMatch(a, e) {
				return true
			}
		}
	}
	return false
}

func resolveListingServiceType(listing map[string]any) string {
	if listing == nil {
		return ""
	}
	serviceType := strings.TrimSpace(recordStr(listing, "service_type"))
	if serviceType == "" {
		serviceType = strings.TrimSpace(recordStr(listing, "serviceCode"))
	}
	if serviceType == "" {
		if cat, ok := listing["serviceCategory"].(map[string]any); ok {
			serviceType = strings.TrimSpace(recordStr(cat, "service_code"))
		}
	}
	return strings.ToLower(serviceType)
}

func resolveListingDomain(listing map[string]any, host string) string {
	domain := strings.TrimSpace(recordStr(listing, "domain"))
	if domain == "" {
		if cat, ok := listing["serviceCategory"].(map[string]any); ok {
			domain = strings.TrimSpace(recordStr(cat, "domain"))
		}
	}
	if domain == "" {
		domain = strings.TrimSpace(host)
	}
	return strings.ToLower(domain)
}

func filterListingRowsForSEO(listing map[string]any, rows []any, host string) []any {
	if len(rows) == 0 {
		return nil
	}
	expectedServiceType := resolveListingServiceType(listing)
	expectedDomain := resolveListingDomain(listing, host)

	out := make([]any, 0, len(rows))
	seen := make(map[string]struct{}, len(rows))
	for _, item := range rows {
		row, ok := item.(map[string]any)
		if !ok || row == nil {
			continue
		}

		status := strings.ToLower(strings.TrimSpace(recordStr(row, "status")))
		if status != "" && status != "active" {
			continue
		}

		rowServiceType := strings.ToLower(strings.TrimSpace(recordStr(row, "service_type")))
		if expectedServiceType != "" && rowServiceType != "" && rowServiceType != expectedServiceType {
			continue
		}
		if expectedServiceType != "" && rowServiceType == "" {
			continue
		}

		rowDomain := strings.ToLower(strings.TrimSpace(recordStr(row, "domain")))
		if expectedDomain != "" && rowDomain != "" && !domainListMatches(rowDomain, expectedDomain) {
			continue
		}
		if expectedDomain != "" && rowDomain == "" {
			continue
		}

		id := strings.TrimSpace(recordStr(row, "id"))
		slug := strings.TrimSpace(recordStr(row, "slug"))
		dedupeKey := id
		if dedupeKey == "" {
			dedupeKey = rowServiceType + "|" + slug + "|" + strings.TrimSpace(recordStr(row, "title"))
		}
		if dedupeKey != "" {
			if _, exists := seen[dedupeKey]; exists {
				continue
			}
			seen[dedupeKey] = struct{}{}
		}

		out = append(out, row)
	}
	return out
}
