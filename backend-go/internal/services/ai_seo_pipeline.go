package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/model"
)

var (
	seoVietnameseDiacriticsRe = regexp.MustCompile(
		`[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]`,
	)
	seoAntiAIPersonas  = []string{"investor", "family", "local_resident", "business_owner", "storyteller"}
	seoAntiAIPatterns  = []string{"investment_analysis", "family_story", "step_by_step_guide", "quick_tips", "landing_page"}
	seoAntiAISelling   = []string{"title_explicit", "content_subtle", "content_implicit"}
	seoRequiredFields  = []string{
		"title", "title_en", "title_zh",
		"description", "description_en", "description_zh",
		"content", "content_en", "content_zh",
		"keywords", "keywords_en", "keywords_zh",
		"excerpt", "excerpt_en", "excerpt_zh",
	}
	seoCoreLocaleFields = []string{"title", "content", "title_en", "content_en", "title_zh", "content_zh"}
	seoLocaleFields     = []string{
		"title_en", "title_zh",
		"description_en", "description_zh",
		"content_en", "content_zh",
		"keywords_en", "keywords_zh",
		"excerpt_en", "excerpt_zh",
	}
)

type seoCreativeParams struct {
	PersonaKey      string
	ContentPattern  string
	SellingIntent   string
	Hook            string
	Angle           string
	Tone            string
}

// EffectiveSeoArticleMaxTokens reads AI_SEO_ARTICLE_MAX_TOKENS (Java resolveSeoArticleOutputTokens).
func EffectiveSeoArticleMaxTokens(cfg config.AppConfig) uint32 {
	if v := seoEnvInt("AI_SEO_ARTICLE_MAX_TOKENS", 0); v > 0 {
		return uint32(max(768, v))
	}
	base := cfg.EffectiveLlamaMaxTokens()
	if base < 1536 {
		return 1536
	}
	return base
}

// EffectiveSeoLocaleTranslateMaxTokens reads AI_SEO_LOCALE_TRANSLATE_MAX_TOKENS.
func EffectiveSeoLocaleTranslateMaxTokens(cfg config.AppConfig) uint32 {
	if v := seoEnvInt("AI_SEO_LOCALE_TRANSLATE_MAX_TOKENS", 0); v > 0 {
		return uint32(max(256, v))
	}
	return 768
}

func seoLocaleTranslateMaxSourceChars() int {
	return max(400, seoEnvInt("AI_SEO_LOCALE_TRANSLATE_MAX_SOURCE_CHARS", 900))
}

// EffectiveSeoPromptMaxChars caps SEO input by context window (not output×3 — that truncated long LMKT prompts).
func EffectiveSeoPromptMaxChars(cfg config.AppConfig) int {
	if v := seoEnvInt("AI_SEO_MAX_PROMPT_CHARS", 0); v > 0 {
		return v
	}
	safe := MaxSafePromptChars(cfg)
	llamaCap := cfg.AI.LlamaMaxPromptChars
	if llamaCap <= 0 {
		llamaCap = 32_000
	}
	cap := min(safe, llamaCap)
	if cap < 8000 {
		return 8000
	}
	return cap
}

// SeoRequestContext returns a context for SEO HTTP handlers. AI_SEO_REQUEST_TIMEOUT_MS=0 → no deadline.
func SeoRequestContext() (context.Context, context.CancelFunc) {
	ms := seoEnvInt("AI_SEO_REQUEST_TIMEOUT_MS", 0)
	if ms <= 0 {
		return context.WithCancel(context.Background())
	}
	return context.WithTimeout(context.Background(), time.Duration(ms)*time.Millisecond)
}

func seoArticleRetryEnabled() bool {
	return seoEnvBool("AI_SEO_PIPELINE_ARTICLE_RETRY_ENABLED", true)
}

func seoLocaleTranslateFallbackEnabled() bool {
	return seoEnvBool("AI_SEO_LOCALE_TRANSLATE_FALLBACK_ON_INCOMPLETE", true)
}

func (s *AiSeoService) runAntiAiOneShot(ctx context.Context, seoContext map[string]any, seoPipeline string) *model.StandardResponse {
	topic := paramString(seoContext, "topic", "")
	if topic == "" {
		topic = paramString(seoContext, "content", "")
	}
	if topic == "" {
		return seoErrorResponse("Thiếu topic/content trong seoContext", "SEO_LANE_MISSING_TOPIC")
	}
	industry := paramString(seoContext, "industry", "bat-dong-san")
	domainKey := paramString(seoContext, "domainKey", "lmkt")
	creative := resolveHeuristicCreativeFromContext(seoContext)
	prompt := buildCompactViOnlyArticlePrompt(industry, topic, domainKey, creative, seoContext)
	if seoPipeline == "seo_writer_2026" {
		prompt += seoWriter2026Extension()
	}
	prompt = PrepareLocalProviderPrompt(prompt, EffectiveSeoPromptMaxChars(s.cfg))

	raw, err := s.llama.CompleteWithTokens(ctx, prompt, EffectiveSeoArticleMaxTokens(s.cfg))
	if err != nil {
		return seoErrorResponse(fmt.Sprintf("Lỗi tạo bài SEO: %v", err), "")
	}
	merged := parseSeoArticleMap(raw)
	promotePartialSeoFields(merged)
	fillMissingSeoMetaFields(merged, domainKey, industry)

	if !hasRecoverableSeoContent(merged) && seoArticleRetryEnabled() {
		retryPrompt := buildCompactViOnlyArticlePrompt(industry, topic, domainKey, creative, seoContext) + `

[RETRY] JSON lần trước thiếu hoặc có dấu ... — viết LẠI đủ field tiếng Việt.
Cấm dùng ... hoặc bỏ trống field. content HTML ~350-500 từ.`
		retryPrompt = PrepareLocalProviderPrompt(retryPrompt, EffectiveSeoPromptMaxChars(s.cfg))
		retryRaw, retryErr := s.llama.CompleteWithTokens(ctx, retryPrompt, EffectiveSeoArticleMaxTokens(s.cfg))
		if retryErr == nil {
			retryParsed := parseSeoArticleMap(retryRaw)
			if scoreFilledSeoFields(retryParsed) > scoreFilledSeoFields(merged) {
				merged = retryParsed
				promotePartialSeoFields(merged)
				fillMissingSeoMetaFields(merged, domainKey, industry)
			}
		}
	}

	if !hasRecoverableSeoContent(merged) {
		return seoErrorResponse(
			"Model local chưa viết được bài tiếng Việt. Thử lại hoặc gửi prompt đầy đủ từ client.",
			"SEO_GENERATION_FAILED",
		)
	}

	s.ensureTrilingualLocalesForViFirst(ctx, merged)
	fillDerivedLocaleMetaFields(merged)
	if !hasMinimalTrilingualSeo(merged) {
		s.ensureTrilingualLocalesWithRetry(ctx, merged)
		fillDerivedLocaleMetaFields(merged)
	}

	if hasCompleteTrilingualSeo(merged) || hasMinimalTrilingualSeo(merged) {
		normalizeSeoFields(merged)
		return seoSuccessResponse(merged)
	}
	return seoErrorResponse(
		"Model local chưa dịch đủ EN/ZH sau bài tiếng Việt. Thử lại hoặc tăng AI_SEO_ARTICLE_MAX_TOKENS.",
		"SEO_GENERATION_FAILED",
	)
}

func (s *AiSeoService) finalizePromptSeoArticle(ctx context.Context, raw string) *model.StandardResponse {
	merged := parseSeoArticleMap(raw)
	promotePartialSeoFields(merged)
	fillMissingSeoMetaFields(merged, "lmkt", "bat-dong-san")

	if hasRecoverableSeoContent(merged) && needsLocaleTranslate(merged) && seoLocaleTranslateFallbackEnabled() {
		s.ensureTrilingualLocalesForViFirst(ctx, merged)
		fillDerivedLocaleMetaFields(merged)
	}

	if hasRecoverableSeoContent(merged) && (hasMinimalTrilingualSeo(merged) || hasCompleteTrilingualSeo(merged)) {
		normalizeSeoFields(merged)
		return seoSuccessResponse(merged)
	}
	return populateSeoResponse(raw)
}

func (s *AiSeoService) ensureTrilingualLocalesForViFirst(ctx context.Context, payload map[string]any) {
	if !seoLocaleTranslateFallbackEnabled() {
		return
	}
	if !hasRecoverableSeoContent(payload) {
		return
	}
	clearStaleLocaleCopies(payload)
	maxAttempts := max(1, seoEnvInt("AI_SEO_LOCALE_TRANSLATE_MAX_RETRIES", 2)+1)
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if hasMinimalTrilingualSeo(payload) {
			break
		}
		compact := attempt > 0
		s.translateSingleLocale(ctx, payload, "en", compact)
		s.translateSingleLocale(ctx, payload, "zh", compact)
	}
	if hasMinimalTrilingualSeo(payload) {
		return
	}
	clearStaleLocaleCopies(payload)
	raw, err := s.llama.CompleteWithTokens(ctx,
		PrepareLocalProviderPrompt(buildMinimalLocaleTranslatePrompt(payload), EffectiveSeoPromptMaxChars(s.cfg)),
		EffectiveSeoLocaleTranslateMaxTokens(s.cfg),
	)
	if err == nil {
		mergeLocaleTranslateFields(payload, parseLocaleTranslateMap(raw))
	}
}

func (s *AiSeoService) ensureTrilingualLocalesWithRetry(ctx context.Context, payload map[string]any) {
	s.ensureTrilingualLocalesForViFirst(ctx, payload)
	if countFilledLocaleFields(payload) >= len(seoLocaleFields) {
		return
	}
	if !needsLocaleTranslate(payload) {
		return
	}
	raw, err := s.llama.CompleteWithTokens(ctx,
		PrepareLocalProviderPrompt(buildMinimalLocaleTranslatePrompt(payload), EffectiveSeoPromptMaxChars(s.cfg)),
		EffectiveSeoLocaleTranslateMaxTokens(s.cfg),
	)
	if err == nil {
		mergeLocaleTranslateFields(payload, parseLocaleTranslateMap(raw))
	}
}

func (s *AiSeoService) translateSingleLocale(ctx context.Context, payload map[string]any, lang string, compact bool) {
	if !needsSingleLocaleTranslate(payload, lang) {
		return
	}
	var prompt string
	if compact {
		prompt = buildSingleLocaleTranslatePromptCompact(payload, lang)
	} else {
		prompt = buildSingleLocaleTranslatePrompt(payload, lang)
	}
	raw, err := s.llama.CompleteWithTokens(ctx,
		PrepareLocalProviderPrompt(prompt, EffectiveSeoPromptMaxChars(s.cfg)),
		EffectiveSeoLocaleTranslateMaxTokens(s.cfg),
	)
	if err == nil {
		mergeLocaleTranslateFields(payload, parseLocaleTranslateMap(raw))
	}
}

func resolveHeuristicCreativeFromContext(ctx map[string]any) seoCreativeParams {
	seed := paramString(ctx, "seed", fmt.Sprintf("%d", time.Now().UnixMilli()))
	topic := paramString(ctx, "topic", paramString(ctx, "content", ""))
	hash := seoContextHash(seed + "|" + topic)
	out := seoCreativeParams{
		PersonaKey:     pickFromList(seoAntiAIPersonas, hash, 0),
		ContentPattern: pickFromList(seoAntiAIPatterns, hash, 7),
		SellingIntent:  pickFromList(seoAntiAISelling, hash, 13),
	}
	if v := paramString(ctx, "personaKey", ""); v != "" {
		out.PersonaKey = v
	}
	if v := paramString(ctx, "contentPattern", ""); v != "" {
		out.ContentPattern = v
	}
	if v := paramString(ctx, "hook", ""); v != "" {
		out.Hook = v
	} else {
		out.Hook = defaultHookForPersona(out.PersonaKey, topic)
	}
	if v := paramString(ctx, "angle", ""); v != "" {
		out.Angle = v
	} else {
		out.Angle = defaultAngleForPersona(out.PersonaKey)
	}
	if v := paramString(ctx, "tone", ""); v != "" {
		out.Tone = v
	} else {
		out.Tone = defaultToneForPersona(out.PersonaKey)
	}
	return out
}

func buildCompactViOnlyArticlePrompt(industry, topic, domainKey string, creative seoCreativeParams, ctx map[string]any) string {
	location := paramString(ctx, "location", "")
	uniqueSeed := fmt.Sprintf("[UNIQUE_%d]", time.Now().UnixMilli())
	suggestedTitle := suggestTitleFromTopic(topic, creative.PersonaKey, location)
	targetWords := seoEnvString("AI_SEO_ARTICLE_TARGET_WORDS_VI", "900-1200")
	avoidPhrases := "tránh \"vị trí đắc địa\""
	if domainKey != "lmkt" && strings.Contains(strings.ToLower(industry), "phanmem") {
		avoidPhrases = "CẤM keyword stuffing, \"gia công phần mềm\" chung chung"
	}
	return strings.TrimSpace(fmt.Sprintf(`[SYSTEM CONFIG]: %s | Persona_%s | Pattern_%s
[SOURCE_TEXT]: %s
[INDUSTRY]: %s

Viết bài SEO tiếng Việt. Trả CHỈ 1 JSON hợp lệ — KHÔNG markdown, KHÔNG giải thích.
CẤM dùng dấu ... hoặc bỏ trống field. Mỗi value phải là nội dung THẬT từ SOURCE_TEXT.

Keys (tiếng Việt only): title, description, content, keywords, excerpt, author, readTime, tags

- title: "%s" hoặc hay hơn (~55-80 ký tự, long-tail)
- content: HTML h3/h4/p, %s từ, %s
- keywords: 5-8 cụm long-tail
- description/excerpt: văn bản thuần từ bài
- author: "%s" | readTime: ước lượng số phút | tags: ["%s"]
- Hook: %s | Angle: %s | Giọng: %s

KHÔNG có title_en, content_en hay bất kỳ field _en/_zh nào trong JSON này.`,
		uniqueSeed, creative.PersonaKey, creative.ContentPattern,
		topic, industry,
		suggestedTitle, targetWords, avoidPhrases,
		domainKey, industry,
		creative.Hook, creative.Angle, creative.Tone,
	))
}

func seoWriter2026Extension() string {
	return `

[SEO_WRITER_2026 EXTENDED]
JSON keys bổ sung (optional): urlSlug, outline, faqSchemaJson, internalLinkSuggestions (array string).
content HTML: mở bài trả lời Search Intent trong 2 câu.`
}

func buildSingleLocaleTranslatePrompt(vi map[string]any, lang string) string {
	title := paramString(vi, "title", "")
	content := truncateForLocaleTranslate(paramString(vi, "content", paramString(vi, "html_content", "")))
	en := strings.EqualFold(lang, "en")
	titleKey, contentKey, langLabel := "title_zh", "content_zh", "Simplified Chinese (简体中文)"
	langWord := "Chinese"
	if en {
		titleKey, contentKey = "title_en", "content_en"
		langLabel = "English"
		langWord = "English"
	}
	return strings.TrimSpace(fmt.Sprintf(`[SEO_LOCALE_TRANSLATE]
Translate Vietnamese real-estate SEO to %s ONLY.
Return EXACTLY one JSON object with 2 keys: "%s", "%s".
NO markdown. NO explanation. NO ellipsis (...). NO Vietnamese characters in output.

Vietnamese title:
%s

Vietnamese content HTML:
%s

Rules:
- %s: professional %s headline, 55-80 chars, must differ from Vietnamese title
- %s: HTML (h3/h4/p), 2-5 paragraphs, natural %s translation (~120-200 words)`,
		langLabel, titleKey, contentKey,
		title, content,
		titleKey, langWord, contentKey, langWord,
	))
}

func buildSingleLocaleTranslatePromptCompact(vi map[string]any, lang string) string {
	title := paramString(vi, "title", "")
	plain := plainTextExcerpt(vi, "content", min(600, seoLocaleTranslateMaxSourceChars()))
	en := strings.EqualFold(lang, "en")
	titleKey, contentKey := "title_zh", "content_zh"
	langLabel := "Simplified Chinese"
	if en {
		titleKey, contentKey = "title_en", "content_en"
		langLabel = "English"
	}
	return strings.TrimSpace(fmt.Sprintf(`[SEO_LOCALE_TRANSLATE]
Translate to %s. Return ONLY JSON: {"%s":"...","%s":"..."}
NO Vietnamese in output. NO markdown.

VI title: %s
VI excerpt: %s`,
		langLabel, titleKey, contentKey, title, plain,
	))
}

func buildMinimalLocaleTranslatePrompt(vi map[string]any) string {
	title := paramString(vi, "title", "")
	content := truncateForLocaleTranslate(paramString(vi, "content", ""))
	desc := paramString(vi, "description", paramString(vi, "excerpt", ""))
	kw := keywordsToString(vi, "keywords")
	return strings.TrimSpace(fmt.Sprintf(`[SEO_LOCALE_TRANSLATE]
Translate Vietnamese SEO fields to English AND Simplified Chinese.
Return ONE JSON with keys:
title_en, title_zh, description_en, description_zh, content_en, content_zh, keywords_en, keywords_zh, excerpt_en, excerpt_zh
NO markdown. NO Vietnamese in _en/_zh fields.

VI title: %s
VI description: %s
VI keywords: %s
VI content HTML:
%s`,
		title, desc, kw, content,
	))
}

func parseSeoArticleMap(raw string) map[string]any {
	cleaned := strings.TrimSpace(raw)
	cleaned = strings.TrimPrefix(cleaned, "```json")
	cleaned = strings.TrimPrefix(cleaned, "```")
	cleaned = strings.TrimSuffix(cleaned, "```")
	cleaned = strings.TrimSpace(cleaned)
	if !strings.HasPrefix(cleaned, "{") {
		cleaned = "{" + cleaned
	}
	start := strings.Index(cleaned, "{")
	end := strings.LastIndex(cleaned, "}")
	if start < 0 || end < start {
		return map[string]any{}
	}
	var data map[string]any
	if json.Unmarshal([]byte(cleaned[start:end+1]), &data) != nil {
		return map[string]any{}
	}
	return data
}

func parseLocaleTranslateMap(raw string) map[string]any {
	return parseSeoArticleMap(raw)
}

func mergeLocaleTranslateFields(target, patch map[string]any) {
	if target == nil || patch == nil {
		return
	}
	for k, v := range patch {
		if isBlankSeoValue(v) {
			continue
		}
		if strings.HasSuffix(k, "_en") || strings.HasSuffix(k, "_zh") {
			if isBlankSeoValue(target[k]) {
				target[k] = v
			}
		}
	}
}

func promotePartialSeoFields(data map[string]any) {
	if data == nil {
		return
	}
	if paramString(data, "content", "") == "" {
		if v := paramString(data, "html_content", ""); v != "" {
			data["content"] = v
		}
	}
}

func fillMissingSeoMetaFields(data map[string]any, author, industry string) {
	if data == nil {
		return
	}
	if paramString(data, "author", "") == "" {
		data["author"] = author
	}
	if paramString(data, "readTime", "") == "" {
		if _, ok := data["readTime"]; !ok {
			data["readTime"] = 5
		}
	}
	if _, ok := data["tags"]; !ok {
		data["tags"] = []any{industry}
	}
	if paramString(data, "excerpt", "") == "" {
		if plain := plainTextExcerpt(data, "content", 120); plain != "" {
			data["excerpt"] = plain
		}
	}
	if paramString(data, "description", "") == "" {
		fillBlankFrom(data, "description", "excerpt")
	}
}

func fillDerivedLocaleMetaFields(data map[string]any) {
	if data == nil {
		return
	}
	pairs := [][2]string{
		{"description_en", "excerpt_en"},
		{"description_zh", "excerpt_zh"},
	}
	for _, p := range pairs {
		if paramString(data, p[0], "") == "" {
			fillBlankFrom(data, p[0], p[1])
		}
	}
	for _, lang := range []string{"en", "zh"} {
		descKey := "description_" + lang
		if paramString(data, descKey, "") == "" {
			if plain := plainTextExcerpt(data, "content_"+lang, 160); plain != "" {
				data[descKey] = plain
			}
		}
		excerptKey := "excerpt_" + lang
		if paramString(data, excerptKey, "") == "" {
			fillBlankFrom(data, excerptKey, descKey)
		}
	}
	if paramString(data, "keywords_en", "") == "" && paramString(data, "title_en", "") != "" {
		data["keywords_en"] = paramString(data, "title_en", "")
	}
	if paramString(data, "keywords_zh", "") == "" && paramString(data, "title_zh", "") != "" {
		data["keywords_zh"] = paramString(data, "title_zh", "")
	}
}

func hasRecoverableSeoContent(data map[string]any) bool {
	if data == nil {
		return false
	}
	title := strings.TrimSpace(paramString(data, "title", ""))
	body := strings.TrimSpace(paramString(data, "content", paramString(data, "html_content", "")))
	return title != "" && body != "" && !strings.Contains(title, "...") && !strings.Contains(body, "...")
}

func hasMinimalTrilingualSeo(data map[string]any) bool {
	if !hasRecoverableSeoContent(data) {
		return false
	}
	for _, field := range seoCoreLocaleFields {
		if isBlankSeoValue(data[field]) {
			return false
		}
	}
	return !isCoreLocaleCopyViolation(data)
}

func hasCompleteTrilingualSeo(data map[string]any) bool {
	if !hasMinimalTrilingualSeo(data) {
		return false
	}
	for _, field := range seoRequiredFields {
		if isBlankSeoValue(data[field]) {
			return false
		}
	}
	return true
}

func needsLocaleTranslate(data map[string]any) bool {
	return !hasMinimalTrilingualSeo(data) || isCoreLocaleCopyViolation(data)
}

func needsSingleLocaleTranslate(data map[string]any, lang string) bool {
	titleKey := "title_" + lang
	contentKey := "content_" + lang
	if isBlankSeoValue(data[titleKey]) || isBlankSeoValue(data[contentKey]) {
		return true
	}
	if isSeoLocaleFieldCopyOfVi(titleKey, data[titleKey], data) ||
		isSeoLocaleFieldCopyOfVi(contentKey, data[contentKey], data) {
		return true
	}
	return lang == "en" && (containsVietnamese(data[titleKey]) || containsVietnamese(data[contentKey]))
}

func clearStaleLocaleCopies(data map[string]any) {
	for _, field := range append(append([]string{}, seoCoreLocaleFields...), seoLocaleFields...) {
		if field == "title" || field == "content" {
			continue
		}
		val := data[field]
		if isBlankSeoValue(val) {
			continue
		}
		if isSeoLocaleFieldCopyOfVi(field, val, data) ||
			(strings.HasSuffix(field, "_en") && containsVietnamese(val)) {
			delete(data, field)
		}
	}
}

func isCoreLocaleCopyViolation(data map[string]any) bool {
	for _, field := range seoCoreLocaleFields {
		if field == "title" || field == "content" {
			continue
		}
		if isSeoLocaleFieldCopyOfVi(field, data[field], data) {
			return true
		}
		if strings.HasSuffix(field, "_en") && containsVietnamese(data[field]) {
			return true
		}
	}
	return false
}

func isSeoLocaleFieldCopyOfVi(field string, val any, data map[string]any) bool {
	s := strings.TrimSpace(fmt.Sprint(val))
	if s == "" {
		return false
	}
	var viField string
	switch {
	case strings.HasSuffix(field, "_en"):
		viField = strings.TrimSuffix(field, "_en")
	case strings.HasSuffix(field, "_zh"):
		viField = strings.TrimSuffix(field, "_zh")
	default:
		return false
	}
	vi := strings.TrimSpace(paramString(data, viField, ""))
	if vi == "" {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(s), vi)
}

func containsVietnamese(val any) bool {
	return seoVietnameseDiacriticsRe.MatchString(fmt.Sprint(val))
}

func scoreFilledSeoFields(data map[string]any) int {
	if data == nil {
		return 0
	}
	n := 0
	for _, field := range seoRequiredFields {
		if !isBlankSeoValue(data[field]) {
			n++
		}
	}
	return n
}

func countFilledLocaleFields(data map[string]any) int {
	n := 0
	for _, field := range seoLocaleFields {
		if !isBlankSeoValue(data[field]) {
			n++
		}
	}
	return n
}

func truncateForLocaleTranslate(text string) string {
	cap := seoLocaleTranslateMaxSourceChars()
	if len(text) <= cap {
		return text
	}
	return text[:cap]
}

func seoSuccessResponse(data map[string]any) *model.StandardResponse {
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", data)
	r.Set("provider", "local_provider")
	r.Set("message", "Thành công")
	return r
}

func seoErrorResponse(message, errorCode string) *model.StandardResponse {
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", false)
	r.Set("message", message)
	if errorCode != "" {
		r.Set("errorCode", errorCode)
	}
	return r
}

func pickFromList(items []string, hash, salt int) string {
	if len(items) == 0 {
		return ""
	}
	idx := (hash + salt) % len(items)
	if idx < 0 {
		idx += len(items)
	}
	return items[idx]
}

func seoContextHash(s string) int {
	h := 0
	for _, r := range s {
		h = 31*h + int(r)
	}
	if h < 0 {
		h = -h
	}
	return h
}

func defaultHookForPersona(personaKey, topic string) string {
	snippet := topic
	if len(snippet) > 40 {
		snippet = strings.TrimSpace(snippet[:40]) + "..."
	}
	switch personaKey {
	case "family":
		return "Gia đình tôi đang tìm " + snippet
	case "business_owner":
		return "Mở quán tại " + snippet
	case "local_resident":
		return "Sống lâu năm quanh " + snippet
	case "storyteller":
		return "Câu chuyện thật về " + snippet
	default:
		return "Góc nhìn đầu tư " + snippet
	}
}

func defaultAngleForPersona(personaKey string) string {
	switch personaKey {
	case "family":
		return "Trải nghiệm thực tế, ưu tiên không gian sống"
	case "business_owner":
		return "Tiềm năng kinh doanh và dòng khách"
	case "local_resident":
		return "Am hiểu khu vực, tiện ích hàng ngày"
	case "storyteller":
		return "Kể chuyện có nhân vật, có chi tiết cụ thể"
	default:
		return "Phân tích số liệu, so sánh và rủi ro"
	}
}

func defaultToneForPersona(personaKey string) string {
	switch personaKey {
	case "family":
		return "Ấm áp, gần gũi, thực tế"
	case "business_owner":
		return "Thực dụng, tập trung ROI"
	case "local_resident":
		return "Tự nhiên, như người trong cuộc"
	case "storyteller":
		return "Kể chuyện, có cảm xúc"
	default:
		return "Chuyên gia, có số liệu"
	}
}

func suggestTitleFromTopic(topic, personaKey, location string) string {
	base := strings.TrimSpace(topic)
	if len(base) > 60 {
		base = strings.TrimSpace(base[:60])
	}
	if location != "" && !strings.Contains(strings.ToLower(base), strings.ToLower(location)) {
		return base + " " + location
	}
	_ = personaKey
	return base
}

func isBlankSeoValue(v any) bool {
	if v == nil {
		return true
	}
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t) == ""
	case []any:
		return len(t) == 0
	case []string:
		return len(t) == 0
	default:
		return strings.TrimSpace(fmt.Sprint(v)) == ""
	}
}

func seoEnvInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func seoEnvString(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	return v
}

func seoEnvBool(key string, fallback bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	return v == "1" || v == "true" || v == "yes" || v == "on"
}
