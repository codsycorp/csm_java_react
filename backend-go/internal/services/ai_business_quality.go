package services

import (
	"strings"
)

// BusinessQAResult captures business-level completeness checks.
type BusinessQAResult struct {
	Phase                 string
	Score                 int
	Ready                 bool
	Checklist             map[string]bool
	Missing               []string
	Summary               string
	ClarificationQuestion string
}

func EvaluateBusinessSpecQuality(req *CodeStreamRequest, spec BusinessSpec) BusinessQAResult {
	check := map[string]bool{
		"has_goal":     strings.TrimSpace(spec.UserDelta) != "",
		"has_scope":    strings.TrimSpace(req.ContextType) != "",
		"has_entities": len(spec.Modules)+len(spec.Tables)+len(spec.Flows) > 0,
		"has_rules":    len(spec.Rules) > 0,
		"has_outcomes": len(spec.Outcomes) > 0,
	}

	missing := make([]string, 0, 5)
	if !check["has_goal"] {
		missing = append(missing, "Mục tiêu nghiệp vụ chưa rõ")
	}
	if !check["has_entities"] {
		missing = append(missing, "Thiếu đối tượng chính (module/bảng/luồng)")
	}
	if !check["has_rules"] {
		missing = append(missing, "Thiếu quy tắc nghiệp vụ hoặc điều kiện xử lý")
	}
	if !check["has_outcomes"] {
		missing = append(missing, "Thiếu tiêu chí kết quả mong muốn")
	}

	score := 48
	if check["has_goal"] {
		score += 12
	}
	if check["has_scope"] {
		score += 8
	}
	if check["has_entities"] {
		score += 14
	}
	if check["has_rules"] {
		score += 10
	}
	if check["has_outcomes"] {
		score += 8
	}
	if score > 100 {
		score = 100
	}

	ready := score >= 70
	summary := "Business spec đã đủ để thực thi tự động theo luồng nghiệp vụ."
	if !ready {
		summary = "Business spec chưa đủ chặt; hệ thống sẽ tự suy diễn an toàn và cần xác nhận các điểm thiếu."
	}
	question := buildSingleClarificationQuestion(missing)

	return BusinessQAResult{
		Phase:                 "preflight",
		Score:                 score,
		Ready:                 ready,
		Checklist:             check,
		Missing:               missing,
		Summary:               summary,
		ClarificationQuestion: question,
	}
}

func EvaluateBusinessExecutionQuality(req *CodeStreamRequest, spec BusinessSpec, plannedSteps int, stepOutputs []string, finalOutput string) BusinessQAResult {
	output := strings.ToLower(strings.TrimSpace(finalOutput))
	if output == "" && len(stepOutputs) > 0 {
		output = strings.ToLower(strings.TrimSpace(strings.Join(stepOutputs, "\n")))
	}

	check := map[string]bool{
		"has_result":        len(strings.TrimSpace(finalOutput)) >= 40,
		"has_step_coverage": len(stepOutputs) >= 1,
		"covers_entities":   outputCoversEntities(output, spec),
		"covers_outcomes":   outputCoversOutcomes(output, spec),
		"mentions_rules":    outputMentionsRules(output, spec),
	}

	missing := make([]string, 0, 5)
	if !check["has_result"] {
		missing = append(missing, "Kết quả đầu ra còn quá ngắn")
	}
	if plannedSteps > 1 && !check["has_step_coverage"] {
		missing = append(missing, "Thiếu bằng chứng thực thi theo từng bước")
	}
	if !check["covers_entities"] {
		missing = append(missing, "Chưa bám rõ đối tượng nghiệp vụ chính")
	}
	if !check["covers_outcomes"] {
		missing = append(missing, "Chưa khớp đầy đủ kết quả mong muốn")
	}
	if !check["mentions_rules"] {
		missing = append(missing, "Chưa thể hiện rõ điều kiện/quy tắc xử lý")
	}

	score := 50
	if check["has_result"] {
		score += 12
	}
	if check["has_step_coverage"] {
		score += 10
	}
	if check["covers_entities"] {
		score += 12
	}
	if check["covers_outcomes"] {
		score += 10
	}
	if check["mentions_rules"] {
		score += 6
	}
	if score > 100 {
		score = 100
	}

	ready := score >= 75
	summary := "Đầu ra đã bám nghiệp vụ đủ đầy, sẵn sàng dùng cho người dùng không kỹ thuật."
	if !ready {
		summary = "Đầu ra đã có hướng đúng nhưng cần bổ sung để đạt độ đầy đủ nghiệp vụ cao hơn."
	}

	return BusinessQAResult{
		Phase:                 "post_execution",
		Score:                 score,
		Ready:                 ready,
		Checklist:             check,
		Missing:               missing,
		Summary:               summary,
		ClarificationQuestion: "",
	}
}

func buildSingleClarificationQuestion(missing []string) string {
	if len(missing) == 0 {
		return ""
	}
	first := strings.ToLower(strings.TrimSpace(missing[0]))
	switch {
	case strings.Contains(first, "mục tiêu"):
		return "Mục tiêu cuối cùng bạn muốn hệ thống đạt được sau thao tác này là gì?"
	case strings.Contains(first, "đối tượng"):
		return "Bạn muốn áp dụng cho module hoặc bảng dữ liệu nào là chính?"
	case strings.Contains(first, "quy tắc"):
		return "Quy tắc xử lý quan trọng nhất mà hệ thống phải tuân theo là gì?"
	case strings.Contains(first, "kết quả"):
		return "Kết quả đầu ra bạn cần hiển thị hoặc lưu lại cụ thể là gì?"
	default:
		return "Bạn có thể mô tả thêm 1 ý quan trọng nhất để hệ thống xử lý đúng nghiệp vụ không?"
	}
}

func outputCoversEntities(output string, spec BusinessSpec) bool {
	for _, s := range append(append([]string{}, spec.Modules...), spec.Tables...) {
		t := strings.ToLower(strings.TrimSpace(s))
		if t != "" && strings.Contains(output, t) {
			return true
		}
	}
	for _, s := range spec.Flows {
		t := strings.ToLower(strings.TrimSpace(s))
		if t != "" && strings.Contains(output, t) {
			return true
		}
	}
	return len(spec.Modules)+len(spec.Tables)+len(spec.Flows) == 0
}

func outputCoversOutcomes(output string, spec BusinessSpec) bool {
	if len(spec.Outcomes) == 0 {
		return len(strings.TrimSpace(output)) >= 80
	}
	for _, s := range spec.Outcomes {
		t := strings.ToLower(strings.TrimSpace(s))
		if t != "" && strings.Contains(output, t) {
			return true
		}
	}
	return false
}

func outputMentionsRules(output string, spec BusinessSpec) bool {
	if len(spec.Rules) == 0 {
		return strings.Contains(output, "điều kiện") || strings.Contains(output, "if")
	}
	for _, s := range spec.Rules {
		t := strings.ToLower(strings.TrimSpace(s))
		if t != "" && strings.Contains(output, t) {
			return true
		}
	}
	return false
}

func BusinessQualityGateSSE(req *CodeStreamRequest, qa BusinessQAResult) map[string]any {
	return map[string]any{
		"stage":     "business_quality_gate",
		"status":    map[bool]string{true: "passed", false: "review"}[qa.Ready],
		"requestId": req.RequestID,
		"phase":     qa.Phase,
		"score":     qa.Score,
		"ready":     qa.Ready,
		"missing":   qa.Missing,
		"summary":   qa.Summary,
	}
}

func BusinessAutopilotSummarySSE(req *CodeStreamRequest, spec BusinessSpec, qa BusinessQAResult) map[string]any {
	return map[string]any{
		"stage":            "business_autopilot",
		"status":           "done",
		"requestId":        req.RequestID,
		"businessSummary":  firstNonEmpty(spec.DomainSummary, spec.ExistingBusinessSummary),
		"targetModules":    spec.Modules,
		"targetTables":     spec.Tables,
		"targetFlows":      spec.Flows,
		"expectedOutcomes": spec.Outcomes,
		"qaScore":          qa.Score,
		"ready":            qa.Ready,
		"message":          qa.Summary,
	}
}

func BusinessClarificationSSE(req *CodeStreamRequest, qa BusinessQAResult) map[string]any {
	if qa.Ready || strings.TrimSpace(qa.ClarificationQuestion) == "" {
		return nil
	}
	return map[string]any{
		"stage":     "business_clarification",
		"status":    "required",
		"requestId": req.RequestID,
		"question":  qa.ClarificationQuestion,
		"missing":   qa.Missing,
		"message":   "Thiếu một thông tin nghiệp vụ quan trọng trước khi tự động xử lý toàn bộ.",
	}
}
