package handlers

import (
	"encoding/json"
	"hash/fnv"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"csm_server/backend-go/internal/model"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

var htmlTagRegex = regexp.MustCompile(`<[^>]+>`)

var cleanupStopwords = map[string]struct{}{
	"dich": {}, "vu": {}, "service": {}, "services": {},
	"du": {}, "an": {}, "project": {}, "projects": {},
	"the": {}, "and": {}, "for": {}, "with": {},
}

type normalizedRowBundle struct {
	ID          string
	Slug        string
	ServiceType string
	Domain      string
	Title       string
	Content     string
	ContentHash uint32
	Image       string
}

func isContentCleanupTable(table string) bool {
	t := strings.ToLower(strings.TrimSpace(table))
	if t == "" {
		return false
	}
	if strings.HasPrefix(t, "csm_") || strings.HasPrefix(t, "sys_") || t == "index" {
		return false
	}
	return true
}

func hasArticleLikePayload(row map[string]any) bool {
	if row == nil {
		return false
	}
	title := strings.TrimSpace(resolveTitleText(row))
	content := strings.TrimSpace(resolveContentText(row))
	if title == "" && content == "" {
		return false
	}
	if strings.TrimSpace(tableStringFromAny(row["slug"])) != "" {
		return true
	}
	if strings.TrimSpace(tableStringFromAny(row["service_type"])) != "" {
		return true
	}
	if strings.TrimSpace(tableStringFromAny(row["domain"])) != "" {
		return true
	}
	return false
}

func (h *TableHandler) validateIncomingCategoryConsistency(appID, table string, row map[string]any) string {
	if !isContentCleanupTable(table) || !hasArticleLikePayload(row) {
		return ""
	}
	serviceType := normalizeMatchText(tableStringFromAny(row["service_type"]))
	if serviceType == "" {
		return ""
	}

	candidates := h.loadContentCleanupCandidates(appID, table, row)
	knownServiceTypes := collectKnownServiceTypes(candidates, row)
	if mismatch, conflict := detectCategoryMismatch(row, knownServiceTypes); mismatch {
		if conflict != "" {
			return "Nội dung không khớp chuyên mục đã chọn (service_type=" + tableStringFromAny(row["service_type"]) + ", nghiêng về " + conflict + "). Đã chặn lưu để tránh đăng sai chuyên mục."
		}
		return "Nội dung không khớp chuyên mục đã chọn. Đã chặn lưu để tránh đăng sai chuyên mục."
	}
	return ""
}

func (h *TableHandler) autoCleanupContentRows(appID, table string, savedRow map[string]any, action string) map[string]any {
	if !isContentCleanupTable(table) || !hasArticleLikePayload(savedRow) {
		return nil
	}
	action = strings.ToLower(strings.TrimSpace(action))
	if action != "create" && action != "update" {
		return nil
	}

	candidates := h.loadContentCleanupCandidates(appID, table, savedRow)
	if len(candidates) == 0 {
		return nil
	}

	anchor := buildNormalizedRowBundle(savedRow)
	knownServiceTypes := collectKnownServiceTypes(candidates, savedRow)

	deleted := 0
	deletedDuplicate := 0
	deletedMismatch := 0
	failed := 0
	reasons := map[string]int{}

	for _, candidate := range candidates {
		if sameRowIdentity(anchor, buildNormalizedRowBundle(candidate)) {
			continue
		}
		if !domainOverlap(anchor.Domain, tableStringFromAny(candidate["domain"])) {
			continue
		}

		if mismatch, conflict := detectCategoryMismatch(candidate, knownServiceTypes); mismatch {
			if err := h.rm.DeleteRecord(appID, table, candidate); err != nil {
				failed++
				continue
			}
			deleted++
			deletedMismatch++
			reasonKey := "category_mismatch"
			if conflict != "" {
				reasonKey += ":" + conflict
			}
			reasons[reasonKey]++
			continue
		}

		isDup, reason := isDuplicateAgainstAnchor(anchor, candidate)
		if !isDup {
			continue
		}
		if err := h.rm.DeleteRecord(appID, table, candidate); err != nil {
			failed++
			continue
		}
		deleted++
		deletedDuplicate++
		reasons[reason]++
	}

	if deleted == 0 && failed == 0 {
		return nil
	}
	out := map[string]any{
		"checked":            len(candidates),
		"deleted":            deleted,
		"deleted_duplicates": deletedDuplicate,
		"deleted_mismatch":   deletedMismatch,
		"failed":             failed,
		"reasons":            reasons,
	}
	return out
}

func (h *TableHandler) loadContentCleanupCandidates(appID, table string, row map[string]any) []map[string]any {
	conds := []model.SearchFilter{model.EqFilter("status", "active")}
	if serviceType := strings.TrimSpace(tableStringFromAny(row["service_type"])); serviceType != "" {
		conds = append(conds, model.EqFilter("service_type", serviceType))
	}
	if domain := strings.TrimSpace(tableStringFromAny(row["domain"])); domain != "" {
		conds = append(conds, model.EqFilter("domain", domain))
	}
	rows := h.filterRowsForUpdate(appID, table, model.SearchFilter{Operator: "AND", Conditions: conds})
	if len(rows) > 0 {
		return rows
	}

	// Fallback khi domain lưu nhiều alias hoặc format không đồng nhất.
	fallback := []model.SearchFilter{model.EqFilter("status", "active")}
	if serviceType := strings.TrimSpace(tableStringFromAny(row["service_type"])); serviceType != "" {
		fallback = append(fallback, model.EqFilter("service_type", serviceType))
	}
	return h.filterRowsForUpdate(appID, table, model.SearchFilter{Operator: "AND", Conditions: fallback})
}

func resolveTitleText(row map[string]any) string {
	if row == nil {
		return ""
	}
	for _, key := range []string{"title", "attributes_title", "name", "headline", "subject"} {
		if v := strings.TrimSpace(tableStringFromAny(row[key])); v != "" {
			return v
		}
	}
	return ""
}

func resolveContentText(row map[string]any) string {
	if row == nil {
		return ""
	}
	for _, key := range []string{"content", "content_vi", "excerpt", "summary", "description", "attributes_description"} {
		if v := strings.TrimSpace(tableStringFromAny(row[key])); v != "" {
			return stripHTML(v)
		}
	}
	return ""
}

func resolvePrimaryImage(row map[string]any) string {
	if row == nil {
		return ""
	}
	for _, key := range []string{"thumbnail", "cover", "image", "featured_image", "avatar"} {
		if v := strings.TrimSpace(tableStringFromAny(row[key])); v != "" {
			return normalizeImageToken(v)
		}
	}
	if raw := row["images"]; raw != nil {
		switch v := raw.(type) {
		case []any:
			for _, item := range v {
				if token := normalizeImageToken(tableStringFromAny(item)); token != "" {
					return token
				}
			}
		case []string:
			for _, item := range v {
				if token := normalizeImageToken(item); token != "" {
					return token
				}
			}
		default:
			rawStr := strings.TrimSpace(tableStringFromAny(raw))
			if strings.HasPrefix(rawStr, "[") {
				arr := []string{}
				if json.Unmarshal([]byte(rawStr), &arr) == nil {
					for _, item := range arr {
						if token := normalizeImageToken(item); token != "" {
							return token
						}
					}
				}
			}
		}
	}
	return ""
}

func normalizeImageToken(raw string) string {
	v := strings.TrimSpace(strings.ToLower(raw))
	if v == "" {
		return ""
	}
	if q := strings.Index(v, "?"); q >= 0 {
		v = v[:q]
	}
	if h := strings.Index(v, "#"); h >= 0 {
		v = v[:h]
	}
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	// Tránh coi placeholder chung là tín hiệu trùng.
	if strings.Contains(v, "default") || strings.Contains(v, "placeholder") || strings.Contains(v, "no-image") {
		return ""
	}
	return v
}

func buildNormalizedRowBundle(row map[string]any) normalizedRowBundle {
	title := normalizeMatchText(resolveTitleText(row))
	content := normalizeMatchText(resolveContentText(row))
	bundle := normalizedRowBundle{
		ID:          strings.TrimSpace(tableStringFromAny(row["id"])),
		Slug:        normalizeMatchText(tableStringFromAny(row["slug"])),
		ServiceType: normalizeMatchText(tableStringFromAny(row["service_type"])),
		Domain:      strings.TrimSpace(tableStringFromAny(row["domain"])),
		Title:       title,
		Content:     content,
		Image:       resolvePrimaryImage(row),
	}
	if content != "" {
		bundle.ContentHash = hashText(content)
	}
	return bundle
}

func isDuplicateAgainstAnchor(anchor normalizedRowBundle, row map[string]any) (bool, string) {
	candidate := buildNormalizedRowBundle(row)
	if sameRowIdentity(anchor, candidate) {
		return false, ""
	}

	reasons := make([]string, 0, 4)
	if anchor.Title != "" && anchor.Title == candidate.Title && len(anchor.Title) >= 16 {
		reasons = append(reasons, "title")
	}
	if anchor.ContentHash != 0 && anchor.ContentHash == candidate.ContentHash && len(anchor.Content) >= 80 {
		reasons = append(reasons, "content")
	}
	if anchor.Image != "" && anchor.Image == candidate.Image {
		reasons = append(reasons, "image")
	}
	if anchor.Title != "" && anchor.Title == candidate.Title && anchor.ContentHash != 0 && anchor.ContentHash == candidate.ContentHash {
		reasons = append(reasons, "title_content")
	}
	if len(reasons) == 0 {
		return false, ""
	}
	sort.Strings(reasons)
	return true, strings.Join(reasons, "+")
}

func sameRowIdentity(a, b normalizedRowBundle) bool {
	if a.ID != "" && b.ID != "" && a.ID == b.ID {
		return true
	}
	if a.Slug != "" && b.Slug != "" && a.Slug == b.Slug && a.ServiceType == b.ServiceType && strings.EqualFold(strings.TrimSpace(a.Domain), strings.TrimSpace(b.Domain)) {
		return true
	}
	return false
}

func hashText(input string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(input))
	return h.Sum32()
}

func normalizeMatchText(input string) string {
	input = strings.TrimSpace(input)
	if input == "" {
		return ""
	}
	input = stripHTML(input)
	t := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)
	normalized, _, err := transform.String(t, input)
	if err == nil {
		input = normalized
	}
	input = strings.ToLower(strings.ReplaceAll(input, "đ", "d"))
	var b strings.Builder
	b.Grow(len(input))
	lastSpace := false
	for _, r := range input {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			lastSpace = false
			continue
		}
		if !lastSpace {
			b.WriteByte(' ')
			lastSpace = true
		}
	}
	return strings.TrimSpace(b.String())
}

func stripHTML(input string) string {
	if input == "" {
		return ""
	}
	plain := htmlTagRegex.ReplaceAllString(input, " ")
	plain = strings.ReplaceAll(plain, "&nbsp;", " ")
	plain = strings.Join(strings.Fields(plain), " ")
	return strings.TrimSpace(plain)
}

func collectKnownServiceTypes(rows []map[string]any, includeRow map[string]any) []string {
	set := map[string]struct{}{}
	add := func(raw string) {
		n := normalizeMatchText(raw)
		if n == "" {
			return
		}
		set[n] = struct{}{}
	}
	for _, row := range rows {
		add(tableStringFromAny(row["service_type"]))
	}
	if includeRow != nil {
		add(tableStringFromAny(includeRow["service_type"]))
	}
	out := make([]string, 0, len(set))
	for v := range set {
		out = append(out, v)
	}
	sort.Strings(out)
	return out
}

func detectCategoryMismatch(row map[string]any, knownServiceTypes []string) (bool, string) {
	own := normalizeMatchText(tableStringFromAny(row["service_type"]))
	if own == "" {
		return false, ""
	}
	title := normalizeMatchText(resolveTitleText(row))
	content := normalizeMatchText(resolveContentText(row))
	text := strings.TrimSpace(title + " " + content)
	if text == "" {
		return false, ""
	}
	ownTokens := categoryTokens(own)
	if containsAnyToken(text, ownTokens) {
		return false, ""
	}

	for _, other := range knownServiceTypes {
		other = normalizeMatchText(other)
		if other == "" || other == own {
			continue
		}
		if containsAnyToken(text, categoryTokens(other)) {
			return true, other
		}
	}
	return false, ""
}

func categoryTokens(serviceType string) []string {
	parts := strings.FieldsFunc(serviceType, func(r rune) bool {
		return r == '-' || r == '_' || unicode.IsSpace(r)
	})
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(strings.ToLower(p))
		if p == "" {
			continue
		}
		if _, blocked := cleanupStopwords[p]; blocked {
			continue
		}
		if len([]rune(p)) < 3 {
			continue
		}
		out = append(out, p)
	}
	return out
}

func containsAnyToken(text string, tokens []string) bool {
	if text == "" || len(tokens) == 0 {
		return false
	}
	for _, token := range tokens {
		if token == "" {
			continue
		}
		if strings.Contains(text, token) {
			return true
		}
	}
	return false
}

func domainOverlap(a, b string) bool {
	listA := parseDomainAliases(a)
	listB := parseDomainAliases(b)
	if len(listA) == 0 || len(listB) == 0 {
		return true
	}
	set := map[string]struct{}{}
	for _, item := range listA {
		set[item] = struct{}{}
	}
	for _, item := range listB {
		if _, ok := set[item]; ok {
			return true
		}
	}
	return false
}

func parseDomainAliases(raw string) []string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		p = strings.TrimPrefix(p, "http://")
		p = strings.TrimPrefix(p, "https://")
		p = strings.TrimPrefix(p, "www.")
		p = strings.TrimSuffix(p, "/")
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
