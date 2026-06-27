package services

import (
	"os"
	"regexp"
	"strconv"
	"strings"

	"csm_server/backend-go/internal/config"
)

// ExecutionPlanStep is one incremental step in the local agentic DAG.
type ExecutionPlanStep struct {
	StepID      int
	Action      string
	Scope       string
	Description string
	Focus       string
}

// ExecutionPlan is the full picture plan before step-by-step execution.
type ExecutionPlan struct {
	Reasoning string
	Steps     []ExecutionPlanStep
	Workspace string
}

func incrementalPlanMaxSteps() int {
	if v := strings.TrimSpace(os.Getenv("AI_LOCAL_INCREMENTAL_PLAN_MAX_STEPS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return 6
}

func incrementalPlanEnabled() bool {
	v := strings.TrimSpace(os.Getenv("AI_LOCAL_INCREMENTAL_PLAN_ENABLED"))
	if v == "" {
		return true
	}
	switch strings.ToLower(v) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

// ShouldUseIncrementalPlanExecute enables plan-then-execute for non-trivial local AI requests.
func ShouldUseIncrementalPlanExecute(cfg config.AppConfig, req *CodeStreamRequest, phase1 RunPhase1PipelineContext) bool {
	if !incrementalPlanEnabled() || req == nil {
		return false
	}
	if IsLineItemsPdfImport(req) {
		return false
	}
	if phase1.ResponseMode == "analyze" && shouldSkipIncrementalAnalyzeForConversationalIntent(req, phase1.Intent) {
		return false
	}
	if phase1.ResponseMode == "edit" && isMenuJSONContext(req.ContextType) {
		base := SanitizeMenuEditorPayload(ResolveMenuEditEditorBase(req))
		if IsEffectivelyEmptyMenuEditor(base) && !menuEditorHasTreeContent(base) {
			return false
		}
		return editTaskPlannerEnabled()
	}
	if phase1.ResponseMode == "analyze" && ShouldUseMapReduceAnalyze(cfg, req, phase1, len(req.FullCurrentCode)) {
		return false
	}
	msg := strings.TrimSpace(req.Message)
	if len(msg) < 12 {
		return false
	}
	return true
}

func shouldSkipIncrementalAnalyzeForConversationalIntent(req *CodeStreamRequest, intent LocalIntentClassification) bool {
	if req == nil {
		return false
	}
	msg := strings.TrimSpace(req.Message)
	if msg == "" {
		return false
	}
	if len(msg) > 1200 {
		return false
	}
	if shouldFallbackToAnalyzeQuestion(msg) {
		return true
	}
	typ := strings.ToUpper(strings.TrimSpace(intent.Type))
	action := strings.ToLower(strings.TrimSpace(intent.Action))
	next := strings.ToLower(strings.TrimSpace(intent.NextStep))
	if typ != "QUESTION" && typ != "GENERAL" {
		return false
	}
	if action != "ask" && action != "search" && next != "answer_direct" {
		return false
	}
	if intent.Confidence > 0 && intent.Confidence < 55 {
		return false
	}
	return true
}

// GenerateExecutionPlan builds a customer-facing step DAG from intent + workspace (Java AiExecutionPlannerService parity).
func GenerateExecutionPlan(req *CodeStreamRequest, responseMode, retrievedContext string) ExecutionPlan {
	workspace := "code"
	if isMenuJSONContext(req.ContextType) {
		workspace = "menu"
	}
	analyzeOnly := responseMode == "analyze"
	primary := inferPlanPrimaryTarget(req.Message, retrievedContext, workspace, req.CurrentCode)
	steps := synthesizeExecutionSteps(req.Message, workspace, analyzeOnly, primary, retrievedContext != "")
	max := incrementalPlanMaxSteps()
	if len(steps) > max {
		steps = steps[:max]
	}
	for i := range steps {
		steps[i].StepID = i + 1
	}
	reasoning := "Phân tích toàn cảnh yêu cầu khách hàng, neo vào editor hiện tại, rồi thực hiện từng bước nhỏ có kiểm chứng."
	if analyzeOnly {
		reasoning = "Đọc bức tranh toàn thể (menu/code + ngữ cảnh), lập luồng phân tích có bằng chứng, trả lời đủ yêu cầu khách hàng."
	}
	return ExecutionPlan{Reasoning: reasoning, Steps: steps, Workspace: workspace}
}

func synthesizeExecutionSteps(message, workspace string, analyzeOnly bool, primary string, hasRAG bool) []ExecutionPlanStep {
	var steps []ExecutionPlanStep
	if workspace == "menu" {
		steps = append(steps, ExecutionPlanStep{
			Action: "inspect", Scope: "menu_tree",
			Description: "Neo vào cây menu hiện tại, giữ parentId/children trước khi thay đổi",
			Focus:       "menu root, module nodes, table_name, trigger.fields",
		})
		if hasRAG {
			steps = append(steps, ExecutionPlanStep{
				Action: "search", Scope: "menu_context",
				Description: "Thu hẹp vùng menu bị ảnh hưởng bằng bằng chứng RAG: " + primary,
				Focus:       primary,
			})
		}
		action := "edit"
		descPrefix := "Chuẩn bị patch menu an toàn cho "
		if analyzeOnly {
			action = "analyze"
			descPrefix = "Phân tích node/bảng/trigger liên quan tới "
		}
		steps = append(steps, ExecutionPlanStep{
			Action: action, Scope: "menu_item",
			Description: descPrefix + primary,
			Focus:       primary + "; f_header; f_header_en; f_header_zh; f_types; f_cbo_query; f_cbo_list",
		})
		steps = append(steps, ExecutionPlanStep{
			Action: "analyze", Scope: "menu_schema",
			Description: "Kiểm tra contract menu: i18n header, combo co/coro, trigger keys, sibling nodes không bị đụng",
			Focus:       "f_types=co; label; label_en; icon; table schema",
		})
	} else {
		steps = append(steps, ExecutionPlanStep{
			Action: "inspect", Scope: "code",
			Description: "Neo vào currentCode và các symbol xung quanh: " + primary,
			Focus:       primary,
		})
		if hasRAG {
			steps = append(steps, ExecutionPlanStep{
				Action: "search", Scope: "context",
				Description: "Thu thập bằng chứng RAG liên quan tới " + primary,
				Focus:       primary,
			})
		}
		action := "edit"
		if analyzeOnly {
			action = "analyze"
		}
		steps = append(steps, ExecutionPlanStep{
			Action: action, Scope: "code",
			Description: map[bool]string{true: "Phân tích luồng xử lý và side effects quanh ", false: "Áp dụng thay đổi code cho "}[analyzeOnly] + primary,
			Focus:       primary,
		})
		steps = append(steps, ExecutionPlanStep{
			Action: map[bool]string{true: "analyze", false: "refactor"}[analyzeOnly], Scope: "code",
			Description: map[bool]string{
				true:  "Tổng hợp phát hiện theo từng bước, trích dẫn symbol/line cụ thể",
				false: "Xác minh patch an toàn, diff tối thiểu, chuẩn bị textEdits incremental",
			}[analyzeOnly],
			Focus: "verification",
		})
	}
	finalAction := "analyze"
	finalDesc := "Trả kết luận đầy đủ cho khách hàng, không mở rộng phạm vi ngoài yêu cầu"
	if !analyzeOnly {
		finalAction = "edit"
		finalDesc = "Trả ONLY JSON patch cuối (status+patches hoặc textEdits) — không markdown, không prose"
	}
	steps = append(steps, ExecutionPlanStep{
		Action: finalAction, Scope: workspace,
		Description: finalDesc,
		Focus:       "final_answer",
	})
	return steps
}

var quotedTargetPattern = regexp.MustCompile(`['"]([^'"]{3,80})['"]`)

func inferPlanPrimaryTarget(message, retrievedContext, workspace, currentContent string) string {
	if m := quotedTargetPattern.FindStringSubmatch(message); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	lower := strings.ToLower(message)
	for _, kw := range []string{"cột", "cot", "column", "f_types", "combo", "co ", "tiếng việt", "tieng viet", "header", "menu", "bảng", "bang", "table"} {
		if strings.Contains(lower, kw) {
			return kw
		}
	}
	if workspace == "menu" && strings.Contains(currentContent, "f_types") {
		return "trigger.fields / f_types combo columns"
	}
	if len(retrievedContext) > 0 {
		return "scoped retrieval hits"
	}
	return "active editor selection"
}
