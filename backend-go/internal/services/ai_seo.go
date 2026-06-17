package services

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/model"
)

type AiSeoService struct {
	cfg   config.AppConfig
	llama *LlamaService
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
		return s.runAntiAiOneShot(ctx, seoContext, seoPipeline)
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
	prompt = PrepareLocalProviderPrompt(prompt, EffectiveSeoPromptMaxChars(s.cfg))
	raw, err := s.llama.CompleteWithTokens(ctx, prompt, EffectiveSeoArticleMaxTokens(s.cfg))
	if err != nil {
		r.Set("code", 200)
		r.Set("success", false)
		r.Set("message", fmt.Sprintf("Lỗi AI: %v", err))
		r.Set("errorCode", LocalProviderUnavailableCode)
		return r
	}
	return s.finalizePromptSeoArticle(ctx, raw)
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

func populateSeoResponse(raw string) *model.StandardResponse {
	r := model.NewResponse()
	data := parseSeoArticleMap(raw)
	if len(data) == 0 {
		cleaned := strings.TrimSpace(raw)
		r.Set("code", 200)
		r.Set("success", false)
		r.Set("message", "Model không trả về JSON hợp lệ.")
		r.Set("rawContent", truncate(cleaned, 2000))
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
		b, err := json.Marshal(t)
		if err == nil && len(b) > 2 {
			return string(b)
		}
		return fmt.Sprint(t)
	}
}
