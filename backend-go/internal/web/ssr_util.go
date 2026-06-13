package web

import (
	"encoding/json"
	"math"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

func recordStr(row map[string]any, key string) string {
	v, ok := row[key]
	if !ok || v == nil {
		return ""
	}
	var s string
	switch t := v.(type) {
	case string:
		s = strings.TrimSpace(t)
	case float64:
		if math.Mod(t, 1) == 0 {
			s = strconv.FormatInt(int64(t), 10)
		} else {
			s = strconv.FormatFloat(t, 'f', -1, 64)
		}
	case int:
		s = strconv.Itoa(t)
	case int64:
		s = strconv.FormatInt(t, 10)
	case bool:
		s = strconv.FormatBool(t)
	default:
		return ""
	}
	if s == "" {
		return ""
	}
	return s
}

func recordLangStr(row map[string]any, base, lang string) string {
	if lang != "vi" {
		if localized := recordStr(row, base+"_"+lang); localized != "" {
			return localized
		}
	}
	return recordStr(row, base)
}

func recordBool(row map[string]any, key string) bool {
	v, ok := row[key]
	if !ok || v == nil {
		return false
	}
	switch t := v.(type) {
	case bool:
		return t
	case float64:
		return int64(t) == 1
	case int:
		return t == 1
	case int64:
		return t == 1
	case string:
		s := strings.TrimSpace(strings.ToLower(t))
		return s == "1" || s == "true"
	default:
		return false
	}
}

func rowsFrom(result map[string]any) []map[string]any {
	var raw []any
	if v, ok := result["rows"]; ok {
		raw, _ = v.([]any)
	} else if v, ok := result["data"]; ok {
		raw, _ = v.([]any)
	}
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func compareRelatedPostRowsDesc(a, b map[string]any) int {
	ta := resolveRelatedPostSortTS(a)
	tb := resolveRelatedPostSortTS(b)
	if ta != tb {
		if ta > tb {
			return -1
		}
		return 1
	}
	return compareIDDesc(a, b)
}

func compareIDDesc(a, b map[string]any) int {
	ida := recordIDStr(a)
	idb := recordIDStr(b)
	ia, errA := strconv.ParseInt(ida, 10, 64)
	ib, errB := strconv.ParseInt(idb, 10, 64)
	if errA == nil && errB == nil {
		if ia == ib {
			return 0
		}
		if ia > ib {
			return -1
		}
		return 1
	}
	return strings.Compare(idb, ida)
}

func recordIDStr(row map[string]any) string {
	if s := recordStr(row, "id"); s != "" {
		return s
	}
	return ""
}

func resolveRelatedPostSortTS(row map[string]any) int64 {
	for _, field := range []string{"publish_date", "updated_at", "created_at"} {
		if ts := parseDatetimeToEpochMillis(row[field]); ts > 0 {
			return ts
		}
	}
	return 0
}

const epochSecThreshold = 1_000_000_000_000

func epochFromRawNumber(raw int64) int64 {
	if raw > 0 && raw < epochSecThreshold {
		return raw * 1000
	}
	if raw < 0 {
		return 0
	}
	return raw
}

func parseDatetimeToEpochMillis(v any) int64 {
	if v == nil {
		return 0
	}
	switch t := v.(type) {
	case float64:
		return epochFromRawNumber(int64(t))
	case int:
		return epochFromRawNumber(int64(t))
	case int64:
		return epochFromRawNumber(t)
	case string:
		return parseDatetimeToEpochStr(t)
	default:
		return 0
	}
}

func parseDatetimeToEpochStr(s string) int64 {
	raw := strings.TrimSpace(s)
	if raw == "" {
		return 0
	}
	n := len(raw)
	if n >= 10 && n <= 13 && isAllDigits(raw) {
		if v, err := strconv.ParseInt(raw, 10, 64); err == nil {
			if n == 10 {
				return v * 1000
			}
			return v
		}
	}
	if ts, ok := parseISOInstant(raw); ok {
		return ts
	}
	if n <= 10 {
		if t, err := time.Parse("2006-01-02", raw); err == nil {
			return t.UnixMilli()
		}
	}
	for _, layout := range []string{"2006-01-02 15:04:05", "2006-01-02 15:04"} {
		if t, err := time.ParseInLocation(layout, raw, time.Local); err == nil {
			return t.UnixMilli()
		}
	}
	if ts, ok := parseCompactEpoch(raw); ok {
		return ts
	}
	return 0
}

func parseCompactEpoch(s string) (int64, bool) {
	if len(s) == 8 && isAllDigits(s) {
		if t, err := time.ParseInLocation("20060102", s, time.Local); err == nil {
			return t.UnixMilli(), true
		}
	}
	if len(s) == 14 && isAllDigits(s) {
		if t, err := time.ParseInLocation("20060102150405", s, time.Local); err == nil {
			return t.UnixMilli(), true
		}
	}
	return 0, false
}

func parseISOInstant(s string) (int64, bool) {
	layouts := []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04:05Z",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UnixMilli(), true
		}
	}
	return 0, false
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func resolveLastmodFromRow(row map[string]any) string {
	for _, key := range []string{"updated_at", "publish_date", "modified_at", "updatedAt", "created_at"} {
		if iso := toISODate(row[key]); iso != "" {
			return iso
		}
	}
	return ""
}

func toISODate(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case float64:
		ms := int64(t)
		if ms <= 0 {
			return ""
		}
		if ms < epochSecThreshold {
			ms *= 1000
		}
		return time.UnixMilli(ms).UTC().Format(time.RFC3339)
	case int:
		return toISODate(float64(t))
	case int64:
		return toISODate(float64(t))
	case string:
		raw := strings.TrimSpace(t)
		if raw == "" {
			return ""
		}
		if len(raw) == 8 && isAllDigits(raw) {
			if d, err := time.Parse("20060102", raw); err == nil {
				return d.Format("2006-01-02")
			}
		}
		if len(raw) == 14 && isAllDigits(raw) {
			if d, err := time.Parse("20060102150405", raw); err == nil {
				return d.UTC().Format(time.RFC3339)
			}
		}
		if isAllDigits(raw) {
			if ms, err := strconv.ParseInt(raw, 10, 64); err == nil {
				if len(raw) == 10 {
					ms *= 1000
				}
				if ms > 0 {
					return time.UnixMilli(ms).UTC().Format(time.RFC3339)
				}
			}
		}
		if _, ok := parseISOInstant(raw); ok {
			return raw
		}
		if ms := parseDatetimeToEpochStr(raw); ms > 0 {
			return time.UnixMilli(ms).UTC().Format(time.RFC3339)
		}
		return raw
	default:
		return ""
	}
}

func extractDateOnly(lastmod string) string {
	lastmod = strings.TrimSpace(lastmod)
	if lastmod == "" {
		return ""
	}
	if len(lastmod) == 10 && lastmod[4] == '-' && lastmod[7] == '-' {
		return lastmod
	}
	if len(lastmod) >= 10 && lastmod[4] == '-' && lastmod[7] == '-' {
		return lastmod[:10]
	}
	if len(lastmod) == 8 && isAllDigits(lastmod) {
		if d, err := time.Parse("20060102", lastmod); err == nil {
			return d.Format("2006-01-02")
		}
	}
	return lastmod
}

func stripHTMLToText(html string, maxLen int) string {
	html = strings.TrimSpace(html)
	if html == "" {
		return ""
	}
	html = stripBetween(html, "<script", "</script>")
	html = stripBetween(html, "<style", "</style>")
	var b strings.Builder
	inTag := false
	for _, r := range html {
		if r == '<' {
			inTag = true
			b.WriteRune(' ')
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			b.WriteRune(r)
		}
	}
	collapsed := strings.Join(strings.Fields(b.String()), " ")
	if maxLen <= 0 {
		return collapsed
	}
	if utf8.RuneCountInString(collapsed) <= maxLen {
		return collapsed
	}
	runes := []rune(collapsed)
	return string(runes[:maxLen]) + "..."
}

func stripBetween(s, startTag, endTag string) string {
	lower := strings.ToLower(s)
	for {
		start := strings.Index(lower, strings.ToLower(startTag))
		if start < 0 {
			return s
		}
		endRel := strings.Index(lower[start:], strings.ToLower(endTag))
		if endRel < 0 {
			return s
		}
		end := start + endRel + len(endTag)
		s = s[:start] + " " + s[end:]
		lower = strings.ToLower(s)
	}
}

func htmlEsc(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	return s
}

func removeAttribute(tag, name string) string {
	for {
		idx := -1
		patLen := 0
		for _, p := range []string{" " + name + `="`, name + `="`} {
			if i := strings.Index(tag, p); i >= 0 {
				idx = i
				patLen = len(p)
				break
			}
		}
		if idx < 0 {
			return tag
		}
		rest := tag[idx+patLen:]
		endQuote := strings.Index(rest, `"`)
		if endQuote < 0 {
			return tag
		}
		tag = tag[:idx] + tag[idx+patLen+endQuote+1:]
	}
}

func removeAttrSetContent(tag, val string) string {
	tag = removeAttribute(tag, "th:content")
	tag = removeAttribute(tag, "content")
	return strings.TrimSpace(tag) + ` content="` + htmlEsc(val) + `"`
}

func removeAttrSetHref(tag, href string) string {
	tag = removeAttribute(tag, "th:href")
	tag = removeAttribute(tag, "href")
	return strings.TrimSpace(tag) + ` href="` + htmlEsc(href) + `"`
}

func safeJSON(v any) string {
	raw, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return strings.ReplaceAll(string(raw), "</", "<\\/")
}

func parseQS(qs string) map[string]string {
	out := make(map[string]string)
	if qs == "" {
		return out
	}
	for _, part := range strings.Split(qs, "&") {
		k, v, ok := strings.Cut(part, "=")
		if !ok || k == "" {
			continue
		}
		if dec, err := url.QueryUnescape(v); err == nil {
			out[k] = dec
		} else {
			out[k] = v
		}
	}
	return out
}
