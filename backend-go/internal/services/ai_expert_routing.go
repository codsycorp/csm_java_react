package services

import (
	"os"
	"sort"
	"strconv"
	"strings"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
)

// ExpertRoutingScore summarizes learned confidence from historical successful edits.
type ExpertRoutingScore struct {
	Enabled              bool
	ContextType          string
	SampleSize           int
	MatchedExamples      int
	CoverageScore        int
	RiskLevel            string
	RecommendedMode      string
	RecommendedRoute     string
	ShouldUseIncremental bool
	Reasoning            string
}

func expertRoutingEnabled() bool {
	v := strings.TrimSpace(os.Getenv("AI_LOCAL_EXPERT_ROUTING_ENABLED"))
	if v == "" {
		return true
	}
	switch strings.ToLower(v) {
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

func expertRoutingMinCoverageToTrust() int {
	if v := strings.TrimSpace(os.Getenv("AI_LOCAL_EXPERT_MIN_COVERAGE")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 30 && n <= 95 {
			return n
		}
	}
	return 60
}

func expertRoutingUseJournal() bool {
	v := strings.TrimSpace(os.Getenv("AI_LOCAL_EXPERT_USE_JOURNAL"))
	if v == "" {
		return true
	}
	switch strings.ToLower(v) {
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

func mergeCodeLearningUnique(primary []CodeLearningEntry, secondary []CodeLearningEntry) []CodeLearningEntry {
	if len(primary) == 0 && len(secondary) == 0 {
		return nil
	}
	out := make([]CodeLearningEntry, 0, len(primary)+len(secondary))
	seen := make(map[string]struct{}, len(primary)+len(secondary))
	for _, item := range append(primary, secondary...) {
		key := strings.TrimSpace(item.Digest)
		if key == "" {
			key = strings.TrimSpace(item.ID)
		}
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, item)
	}
	return out
}

func mergeMenuLearningUnique(primary []MenuLearningEntry, secondary []MenuLearningEntry) []MenuLearningEntry {
	if len(primary) == 0 && len(secondary) == 0 {
		return nil
	}
	out := make([]MenuLearningEntry, 0, len(primary)+len(secondary))
	seen := make(map[string]struct{}, len(primary)+len(secondary))
	for _, item := range append(primary, secondary...) {
		key := strings.TrimSpace(item.Digest)
		if key == "" {
			key = strings.TrimSpace(item.ID)
		}
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, item)
	}
	return out
}

// BuildExpertRoutingScore computes a lightweight expert score from local learning memory.
func BuildExpertRoutingScore(cfg config.AppConfig, rm *data.RecordManager, req *CodeStreamRequest, intent LocalIntentClassification, resolvedMode string) ExpertRoutingScore {
	base := ExpertRoutingScore{
		Enabled:              expertRoutingEnabled(),
		ContextType:          strings.TrimSpace(req.ContextType),
		RiskLevel:            "medium",
		RecommendedMode:      resolvedMode,
		RecommendedRoute:     "single_shot",
		ShouldUseIncremental: resolvedMode == "edit",
		Reasoning:            "Chưa đủ mẫu học để tăng độ chắc chắn.",
	}
	if !base.Enabled || req == nil || strings.TrimSpace(req.AppID) == "" {
		return base
	}
	query := strings.TrimSpace(req.Message)
	if query == "" {
		return base
	}

	type hit struct {
		score float64
	}
	var hits []hit

	if isMenuJSONContext(req.ContextType) {
		entries, err := loadMenuLearningEntries(cfg, rm, req.AppID)
		if err != nil {
			return base
		}
		if expertRoutingUseJournal() {
			if archived, err := loadMenuLearningJournalEntries(cfg, req.AppID); err == nil && len(archived) > 0 {
				entries = mergeMenuLearningUnique(entries, archived)
			}
		}
		base.SampleSize = len(entries)
		for _, entry := range entries {
			s := scoreMenuLearningEntry(strings.ToLower(query), entry)
			if s > 0 {
				hits = append(hits, hit{score: s})
			}
		}
	} else {
		entries, err := loadCodeLearningEntries(cfg, rm, req.AppID)
		if err != nil {
			return base
		}
		if expertRoutingUseJournal() {
			if archived, err := loadCodeLearningJournalEntries(cfg, req.AppID); err == nil && len(archived) > 0 {
				entries = mergeCodeLearningUnique(entries, archived)
			}
		}
		base.SampleSize = len(entries)
		for _, entry := range entries {
			if req.ContextType != "" && entry.ContextType != "" && entry.ContextType != req.ContextType {
				continue
			}
			s := scoreLearningEntry(strings.ToLower(query), entry)
			if s > 0 {
				hits = append(hits, hit{score: s})
			}
		}
	}

	if len(hits) == 0 {
		if base.SampleSize >= 12 && resolvedMode == "edit" {
			base.RecommendedRoute = "incremental_plan"
		}
		base.RiskLevel = "high"
		base.ShouldUseIncremental = resolvedMode == "edit" && base.SampleSize >= 12
		base.Reasoning = "Không tìm thấy mẫu gần giống trong learning memory; ưu tiên an toàn."
		return base
	}

	sort.Slice(hits, func(i, j int) bool { return hits[i].score > hits[j].score })
	top := hits[0].score
	if top < 0 {
		top = 0
	}
	if top > 1 {
		top = 1
	}

	coverage := int(top * 100)
	base.MatchedExamples = len(hits)
	base.CoverageScore = coverage

	switch {
	case coverage >= 80:
		base.RiskLevel = "low"
		base.RecommendedRoute = "incremental_plan"
		base.ShouldUseIncremental = resolvedMode == "edit"
		base.Reasoning = "Có mẫu vận hành gần tương tự với độ phủ cao; có thể xử lý theo luồng chuyên gia."
	case coverage >= expertRoutingMinCoverageToTrust():
		base.RiskLevel = "medium"
		base.RecommendedRoute = "incremental_plan"
		base.ShouldUseIncremental = resolvedMode == "edit"
		base.Reasoning = "Tìm thấy mẫu liên quan ở mức khá; nên chạy incremental có quality gate."
	default:
		base.RiskLevel = "high"
		base.RecommendedRoute = "single_shot"
		base.ShouldUseIncremental = false
		base.Reasoning = "Mẫu học có nhưng độ phủ thấp; nên ưu tiên review và giữ guardrail chặt."
	}

	if intent.Type == "QUESTION" && resolvedMode == "analyze" {
		base.RecommendedRoute = "answer_direct"
		base.ShouldUseIncremental = false
	}

	return base
}

// ExpertRoutingSSE emits a dedicated event so frontend can render expert confidence status.
func ExpertRoutingSSE(req *CodeStreamRequest, score ExpertRoutingScore) map[string]any {
	return map[string]any{
		"stage":                "expert_routing",
		"status":               "done",
		"requestId":            req.RequestID,
		"contextType":          score.ContextType,
		"sampleSize":           score.SampleSize,
		"matchedExamples":      score.MatchedExamples,
		"coverageScore":        score.CoverageScore,
		"riskLevel":            score.RiskLevel,
		"recommendedMode":      score.RecommendedMode,
		"recommendedRoute":     score.RecommendedRoute,
		"shouldUseIncremental": score.ShouldUseIncremental,
		"message":              score.Reasoning,
	}
}
