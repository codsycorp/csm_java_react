package verifier

import (
	"fmt"
	"strings"

	"csm_server/backend-go/internal/ai/domain"
)

// SeoArticle verifies the LMKT/auto-lmkt.js SEO contract.
type SeoArticle struct {
	RequiredFields []string
}

func NewSeoArticle() *SeoArticle {
	return &SeoArticle{
		RequiredFields: []string{
			"title", "title_en", "title_zh",
			"description", "description_en", "description_zh",
			"content", "content_en", "content_zh",
			"keywords", "keywords_en", "keywords_zh",
			"excerpt", "excerpt_en", "excerpt_zh",
			"attributes_title", "attributes_title_en", "attributes_title_zh",
			"attributes_description", "attributes_description_en", "attributes_description_zh",
			"attributes_keywords", "attributes_keywords_en", "attributes_keywords_zh",
		},
	}
}

func (v *SeoArticle) Evaluate(data map[string]any) domain.VerificationResult {
	results := []domain.RequirementResult{}
	missing := []string{}

	checks := []struct {
		id   string
		test func() bool
	}{
		{"REQ-SEO-VI", func() bool { return hasField(data, "title") && hasField(data, "content") }},
		{"REQ-SEO-EN", func() bool {
			return hasField(data, "title_en") && hasField(data, "content_en") && !isCopyOf(data, "title_en", "title") && !isCopyOf(data, "content_en", "content")
		}},
		{"REQ-SEO-ZH", func() bool {
			return hasField(data, "title_zh") && hasField(data, "content_zh") && !isCopyOf(data, "title_zh", "title") && !isCopyOf(data, "content_zh", "content")
		}},
		{"REQ-SEO-META", func() bool {
			for _, f := range v.RequiredFields {
				if !hasField(data, f) {
					return false
				}
			}
			return true
		}},
	}

	passed := true
	for _, c := range checks {
		ok := c.test()
		results = append(results, domain.RequirementResult{
			RequirementID: c.id,
			Passed:        ok,
			EvidenceRefs:  []string{},
			Reason:        "",
		})
		if !ok {
			passed = false
			missing = append(missing, c.id)
		}
	}

	score := 1.0
	if !passed {
		score = float64(len(checks)-len(missing)) / float64(len(checks))
	}

	return domain.VerificationResult{
		Passed:       passed,
		Score:        score,
		Requirements: results,
		Missing:      missing,
	}
}

func hasField(data map[string]any, key string) bool {
	if data == nil {
		return false
	}
	v, ok := data[key]
	if !ok {
		return false
	}
	s, ok := v.(string)
	if ok {
		return strings.TrimSpace(s) != "" && !strings.Contains(s, "...")
	}
	if v == nil {
		return false
	}
	return fmt.Sprint(v) != ""
}

func isCopyOf(data map[string]any, field, sourceField string) bool {
	f := strings.TrimSpace(fmt.Sprint(data[field]))
	s := strings.TrimSpace(fmt.Sprint(data[sourceField]))
	if f == "" || s == "" {
		return false
	}
	return strings.EqualFold(f, s)
}
