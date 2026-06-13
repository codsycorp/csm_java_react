package services

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/model"
)

type AiSeoService struct {
	cfg    config.AppConfig
	llama  *LlamaService
}

func NewAiSeoService(cfg config.AppConfig, llama *LlamaService) *AiSeoService {
	return &AiSeoService{cfg: cfg, llama: llama}
}

func (s *AiSeoService) Generate(ctx context.Context, params map[string]any) *model.StandardResponse {
	r := model.NewResponse()
	mode := paramString(params, "mode", "sync")
	if mode == "status" || mode == "cancel" {
		r.Set("code", 200)
		r.Set("success", false)
		r.Set("message", "async mode not supported in local backend")
		return r
	}

	seoPipeline := paramString(params, "seoPipeline", "")
	isOneShot := seoPipeline == "anti_ai_one_shot" || seoPipeline == "seo_article_one_shot" || seoPipeline == "seo_writer_2026"
	seoContext := extractSeoContext(params)

	if isOneShot {
		if !s.llama.IsAvailable() {
			return localUnavailableResponse()
		}
		topic := paramString(seoContext, "topic", "")
		contentField := paramString(seoContext, "content", "")
		effectiveTopic := topic
		if effectiveTopic == "" {
			effectiveTopic = contentField
		}
		if effectiveTopic == "" {
			r.Set("code", 200)
			r.Set("success", false)
			r.Set("message", "Thiếu topic/content trong seoContext")
			r.Set("errorCode", "SEO_LANE_MISSING_TOPIC")
			return r
		}
		industry := paramString(seoContext, "industry", "bat-dong-san")
		location := paramString(seoContext, "location", "")
		domainKey := paramString(seoContext, "domainKey", "lmkt")
		business := paramString(seoContext, "business", "")
		persona, pattern, hook, angle, tone := resolveHeuristicCreativeParams(effectiveTopic, industry, location)
		prompt := buildSeoArticlePrompt(
			effectiveTopic, industry, domainKey, location, business,
			persona, pattern, hook, angle, tone, seoPipeline == "seo_writer_2026",
		)
		raw, err := s.llama.CompleteWithTokens(ctx, prompt, 0)
		if err != nil {
			r.Set("code", 200)
			r.Set("success", false)
			r.Set("message", fmt.Sprintf("Lỗi tạo bài SEO: %v", err))
			return r
		}
		return populateSeoResponse(raw)
	}

	prompt := paramString(params, "prompt", "")
	if prompt == "" {
		r.Set("code", 200)
		r.Set("success", false)
		r.Set("message", "Thiếu tham số 'prompt' để tạo nội dung AI.")
		return r
	}
	if !s.llama.IsAvailable() {
		return localUnavailableResponse()
	}
	raw, err := s.llama.Complete(ctx, prompt)
	if err != nil {
		r.Set("code", 200)
		r.Set("success", false)
		r.Set("message", fmt.Sprintf("Lỗi AI: %v", err))
		r.Set("errorCode", LocalProviderUnavailableCode)
		return r
	}
	return populateSeoResponse(raw)
}

func localUnavailableResponse() *model.StandardResponse {
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", false)
	r.Set("message", LocalUnavailableMessage())
	r.Set("hint", LocalUnavailableHint())
	r.Set("errorCode", LocalProviderUnavailableCode)
	return r
}

func extractSeoContext(params map[string]any) map[string]any {
	out := map[string]any{}
	if nested, ok := params["seoContext"].(map[string]any); ok {
		for k, v := range nested {
			out[k] = v
		}
	}
	for _, key := range []string{
		"industry", "topic", "content", "domainKey", "property", "location",
		"business", "seed", "seoPipeline", "taskType", "prompt",
	} {
		if v, ok := params[key]; ok {
			out[key] = v
		}
	}
	return out
}

func resolveHeuristicCreativeParams(topic, _, location string) (string, string, string, string, string) {
	personas := []string{"investor", "family", "local_resident", "business_owner", "storyteller"}
	patterns := []string{"investment_analysis", "family_story", "step_by_step_guide", "quick_tips", "landing_page"}
	hash := len(topic) + len(location)
	persona := personas[hash%len(personas)]
	pattern := patterns[(hash+7)%len(patterns)]
	shortTopic := topic
	if len(shortTopic) > 40 {
		shortTopic = shortTopic[:40]
	}
	var hook, angle, tone string
	switch persona {
	case "family":
		hook = fmt.Sprintf("Gia đình tôi đang tìm %s", shortTopic)
		angle = "Trải nghiệm thực tế, ưu tiên không gian sống"
		tone = "Ấm áp, gần gũi, thực tế"
	case "business_owner":
		hook = fmt.Sprintf("Mở quán tại %s", shortTopic)
		angle = "Tiềm năng kinh doanh và dòng khách"
		tone = "Thực dụng, tập trung ROI"
	case "local_resident":
		hook = fmt.Sprintf("Sống lâu năm quanh %s", shortTopic)
		angle = "Am hiểu khu vực, tiện ích hàng ngày"
		tone = "Tự nhiên, như người trong cuộc"
	case "storyteller":
		hook = fmt.Sprintf("Câu chuyện thật về %s", shortTopic)
		angle = "Kể chuyện có nhân vật, có chi tiết cụ thể"
		tone = "Kể chuyện, có cảm xúc"
	default:
		hook = fmt.Sprintf("Góc nhìn đầu tư %s", shortTopic)
		angle = "Phân tích số liệu, so sánh và rủi ro"
		tone = "Chuyên gia, có số liệu"
	}
	return persona, pattern, hook, angle, tone
}

func buildSeoArticlePrompt(topic, industry, domainKey, location, business, persona, pattern, hook, angle, tone string, extended bool) string {
	seed := time.Now().UnixMilli()
	locationNote := ""
	if location != "" {
		locationNote = " tại " + location
	}
	businessNote := ""
	if business != "" {
		businessNote = "\nDoanh nghiệp: " + business
	}
	extendedHint := ""
	if extended {
		extendedHint = "\n- urlSlug: slug URL không dấu"
	}
	return fmt.Sprintf(`<|im_start|>system
Bạn là chuyên gia SEO. Nhiệm vụ: tạo bài viết SEO từ thông tin sản phẩm/dịch vụ.
Luôn trả về MỘT JSON object hợp lệ, không có markdown, không giải thích.
Seed: %d | Persona: %s | Pattern: %s

<|im_start|>user
Chủ đề: %s%s
Ngành: %s | Domain: %s%s
Hook: %s
Góc nhìn: %s
Giọng văn: %s

Viết bài SEO 3 ngôn ngữ (VI/EN/ZH). Trả về JSON với đúng các key sau:
- title: ~55-80 ký tự long-tail tiếng Việt
- title_en: English title (dịch thật, không placeholder)
- title_zh: 简体中文 title
- description: ~120-160 ký tự tiếng Việt, văn bản thuần
- description_en: English description
- description_zh: 简体中文 description
- content: HTML tiếng Việt ~350 từ, dùng thẻ <h3><h4><p>, số liệu cụ thể từ chủ đề
- content_en: HTML English ~120 words
- content_zh: HTML 简体中文 ~120 words
- keywords: mảng 5-7 cụm long-tail tiếng Việt
- keywords_en: mảng 5-7 cụm long-tail English
- keywords_zh: mảng 5-7 cụm long-tail 简体中文
- excerpt: ~100-120 ký tự tiếng Việt
- excerpt_en: English excerpt
- excerpt_zh: 简体中文 excerpt
- author: "%s"
- readTime: số phút đọc (integer)
- tags: mảng string tiếng Việt%s

Không dùng placeholder như "..." hay "tiếng Việt". Mỗi value phải là nội dung thật.

<|im_start|>assistant
{`, seed, persona, pattern, topic, locationNote, industry, domainKey, businessNote, hook, angle, tone, domainKey, extendedHint)
}

func populateSeoResponse(raw string) *model.StandardResponse {
	r := model.NewResponse()
	cleaned := strings.TrimSpace(raw)
	cleaned = strings.TrimPrefix(cleaned, "```json")
	cleaned = strings.TrimPrefix(cleaned, "```")
	cleaned = strings.TrimSuffix(cleaned, "```")
	cleaned = strings.TrimSpace(cleaned)
	jsonCandidate := cleaned
	if !strings.HasPrefix(strings.TrimSpace(cleaned), "{") {
		jsonCandidate = "{" + cleaned
	}
	start := strings.Index(jsonCandidate, "{")
	end := strings.LastIndex(jsonCandidate, "}")
	if start < 0 || end < start {
		r.Set("code", 200)
		r.Set("success", false)
		r.Set("message", "Model không trả về JSON hợp lệ.")
		r.Set("rawContent", truncate(jsonCandidate, 2000))
		r.Set("errorCode", "SEO_PARSE_FAILED")
		return r
	}
	jsonStr := jsonCandidate[start : end+1]
	var data map[string]any
	if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
		r.Set("code", 200)
		r.Set("success", false)
		r.Set("message", "Model không trả về JSON hợp lệ.")
		r.Set("rawContent", truncate(jsonCandidate, 2000))
		r.Set("errorCode", "SEO_PARSE_FAILED")
		return r
	}
	hasTitle := paramString(data, "title", "") != ""
	hasContent := paramString(data, "content", "") != ""
	if !hasTitle || !hasContent {
		r.Set("code", 200)
		r.Set("success", false)
		r.Set("data", data)
		r.Set("errorCode", "SEO_GENERATION_FAILED")
		r.Set("message", "Model local không tạo được bài SEO đủ title và content.")
		return r
	}
	normalizeSeoFields(data)
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", data)
	r.Set("provider", "local_provider")
	r.Set("message", "Thành công")
	return r
}

var htmlTagRe = regexp.MustCompile(`<[^>]*>`)

func normalizeSeoFields(data map[string]any) {
	fillBlankFrom(data, "description", "excerpt")
	fillBlankFrom(data, "description_en", "excerpt_en")
	fillBlankFrom(data, "description_zh", "excerpt_zh")
	if paramString(data, "description", "") == "" {
		if plain := plainTextExcerpt(data, "content", 160); plain != "" {
			data["description"] = plain
		}
	}
	fillBlankFrom(data, "attributes_title", "title")
	fillBlankFrom(data, "attributes_title_en", "title_en")
	fillBlankFrom(data, "attributes_title_zh", "title_zh")
	fillBlankFrom(data, "attributes_description", "description")
	fillBlankFrom(data, "attributes_description_en", "description_en")
	fillBlankFrom(data, "attributes_description_zh", "description_zh")
	for _, pair := range [][2]string{
		{"keywords", "attributes_keywords"},
		{"keywords_en", "attributes_keywords_en"},
		{"keywords_zh", "attributes_keywords_zh"},
	} {
		if paramString(data, pair[1], "") == "" {
			if joined := keywordsToString(data, pair[0]); joined != "" {
				data[pair[1]] = joined
			}
		}
	}
	if _, ok := data["html_content"]; !ok {
		if v, ok := data["content"]; ok {
			data["html_content"] = v
		}
	}
	if _, ok := data["provider"]; !ok {
		data["provider"] = "local_provider"
	}
}

func fillBlankFrom(data map[string]any, target, source string) {
	if paramString(data, target, "") != "" {
		return
	}
	if v, ok := data[source]; ok && paramString(map[string]any{source: v}, source, "") != "" {
		data[target] = v
	}
}

func keywordsToString(data map[string]any, field string) string {
	v, ok := data[field]
	if !ok {
		return ""
	}
	switch t := v.(type) {
	case []any:
		parts := make([]string, 0, len(t))
		for _, item := range t {
			s := strings.TrimSpace(fmt.Sprint(item))
			if s != "" {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, ", ")
	case []string:
		return strings.Join(t, ", ")
	case string:
		return t
	default:
		return fmt.Sprint(t)
	}
}

func plainTextExcerpt(data map[string]any, field string, maxChars int) string {
	html := paramString(data, field, "")
	if html == "" {
		return ""
	}
	text := htmlTagRe.ReplaceAllString(html, " ")
	text = strings.Join(strings.Fields(text), " ")
	if text == "" {
		return ""
	}
	if len(text) > maxChars {
		return text[:maxChars]
	}
	return text
}
