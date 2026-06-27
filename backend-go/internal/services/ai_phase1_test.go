package services

import (
	"os"
	"path/filepath"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestClassifyIntentHeuristicMenuContextFallbackEdit(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Thêm module bán hàng với bảng orders",
		CurrentCode: `{"menu":[{"id":"kho","label":"Kho"}]}`,
	}
	got := ClassifyIntentHeuristic(req)
	if got.Type != "EDIT_MENU" || got.ResponseMode != "edit" {
		t.Fatalf("got %+v want EDIT_MENU edit fallback", got)
	}
}

func TestClassifyIntentHeuristicMenuNoKeywordRouting(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Giải thích cấu trúc menu hiện tại",
		CurrentCode: `{"menu":[{"id":"kho","label":"Kho"}]}`,
	}
	got := ClassifyIntentHeuristic(req)
	if got.ResponseMode != "edit" {
		t.Fatalf("fallback should not keyword-route to analyze, got %s", got.ResponseMode)
	}
}

func TestClassifyIntentHeuristicQuestionInEditorKeepsEditFallback(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "code",
		Message:     "Xin chào bạn là ai? Bạn có thể làm gì cho tôi?",
		CurrentCode: "function demo() { return 1; }",
	}
	got := ClassifyIntentHeuristic(req)
	if got.ResponseMode != "edit" || got.Type != "EDIT_CODE" {
		t.Fatalf("got %+v want EDIT_CODE edit fallback", got)
	}
}

func TestClassifyIntentHeuristicQuestionWithoutEditorFallsBackAnalyze(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "none",
		Message:     "Bạn là ai?",
		CurrentCode: "",
	}
	got := ClassifyIntentHeuristic(req)
	if got.ResponseMode != "analyze" || got.NextStep != "answer_direct" {
		t.Fatalf("got %+v want analyze answer_direct", got)
	}
}

func TestClassifyIntentHeuristicEditQuestionStaysEdit(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "code",
		Message:     "Bạn sửa giúp tôi hàm này được không?",
		CurrentCode: "function demo() { return 1; }",
	}
	got := ClassifyIntentHeuristic(req)
	if got.ResponseMode != "edit" || got.Type != "EDIT_CODE" {
		t.Fatalf("got %+v want EDIT_CODE edit", got)
	}
}

func TestParseIntentClassifyJSONMenuBugEdit(t *testing.T) {
	raw := `{"type":"EDIT_MENU","action":"modify","responseMode":"edit","nextStep":"load_menu_context","contextKind":"menu","confidence":91,"reasoning":"User reports wrong i18n labels in open menu editor — needs patch."}`
	got := parseIntentClassifyJSON(raw)
	if got.Type != "EDIT_MENU" || got.ResponseMode != "edit" {
		t.Fatalf("got %+v want EDIT_MENU edit", got)
	}
}

func TestParseIntentClassifyJSONAnalyzeOnly(t *testing.T) {
	raw := "```json\n{\"type\":\"QUESTION\",\"action\":\"ask\",\"responseMode\":\"analyze\",\"nextStep\":\"load_menu_context\",\"contextKind\":\"menu\",\"confidence\":85,\"reasoning\":\"Explain structure only.\"}\n```"
	got := parseIntentClassifyJSON(raw)
	if got.ResponseMode != "analyze" {
		t.Fatalf("responseMode=%s want analyze", got.ResponseMode)
	}
}

func TestResolvePipelineResponseModePrefersLLMIntent(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Giải thích cấu trúc menu hiện tại",
	}
	intent := LocalIntentClassification{Type: "QUESTION", ResponseMode: "analyze", Confidence: 88}
	if got := ResolvePipelineResponseMode(req, intent); got != "analyze" {
		t.Fatalf("got %s want analyze from LLM intent", got)
	}
}

func TestResolvePipelineResponseModeExplicitClientWins(t *testing.T) {
	req := &CodeStreamRequest{ContextType: "menu_json", ResponseMode: "edit"}
	intent := LocalIntentClassification{Type: "QUESTION", ResponseMode: "analyze", Confidence: 88}
	if got := ResolvePipelineResponseMode(req, intent); got != "edit" {
		t.Fatalf("got %s want explicit client edit", got)
	}
}

func TestResolvePipelineResponseModeConversationalQuestionOverridesEdit(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType:  "code",
		ResponseMode: "edit",
		Message:      "Xin chào bạn là ai? Bạn có thể làm gì cho tôi?",
	}
	intent := LocalIntentClassification{Type: "QUESTION", Action: "ask", NextStep: "answer_direct", ResponseMode: "analyze", Confidence: 90}
	if got := ResolvePipelineResponseMode(req, intent); got != "analyze" {
		t.Fatalf("got %s want analyze for conversational question", got)
	}
}

func TestResolvePipelineResponseModeConversationalWeakIntentStillOverridesByContent(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType:  "code",
		ResponseMode: "edit",
		Message:      "Xin chào bạn là ai? Bạn có thể làm gì cho tôi?",
	}
	intent := LocalIntentClassification{Type: "QUESTION", Action: "ask", NextStep: "answer_direct", ResponseMode: "analyze", Confidence: 55}
	if got := ResolvePipelineResponseMode(req, intent); got != "analyze" {
		t.Fatalf("got %s want analyze for conversational message weakly linked to editor", got)
	}
}

func TestResolvePipelineResponseModeKeepsEditWhenMessageCodeLinkedAndWeakIntent(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType:  "code",
		ResponseMode: "edit",
		Message:      "Hãy kiểm tra function demo() đang lỗi ở đâu?",
		CurrentCode:  "function demo() { return 1; }",
	}
	intent := LocalIntentClassification{Type: "QUESTION", Action: "ask", NextStep: "answer_direct", ResponseMode: "analyze", Confidence: 55}
	if got := ResolvePipelineResponseMode(req, intent); got != "edit" {
		t.Fatalf("got %s want edit for code-linked message when intent confidence is low", got)
	}
}

func TestResolvePipelineResponseModeWeakLinkLowConfidenceEditIntentOverridesAnalyze(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType:  "code",
		ResponseMode: "edit",
		Message:      "Bạn hãy tìm hiểu cho tôi tin tức mới nhất về hệ thống ai local từ các nguồn tin đáng tin cậy hôm nay",
		CurrentCode:  "function normalizeUILanguage(rawLang) { return rawLang; }",
	}
	intent := LocalIntentClassification{Type: "EDIT_CODE", Action: "modify", NextStep: "load_code_context", ResponseMode: "edit", Confidence: 72}
	if got := ResolvePipelineResponseMode(req, intent); got != "analyze" {
		t.Fatalf("got %s want analyze for weakly linked non-code ask", got)
	}
}

func TestResolvePipelineResponseModeStrongEditIntentStillKeepsEdit(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType:  "code",
		ResponseMode: "edit",
		Message:      "Sửa bug validate email trong hàm processUser",
		CurrentCode:  "function processUser(email) { return validateEmail(email); }",
	}
	intent := LocalIntentClassification{Type: "EDIT_CODE", Action: "modify", NextStep: "load_code_context", ResponseMode: "edit", Confidence: 90}
	if got := ResolvePipelineResponseMode(req, intent); got != "edit" {
		t.Fatalf("got %s want edit for strong edit intent", got)
	}
}

func TestResolvePipelineResponseModeQuestionWeaklyLinkedOverridesClassifierEdit(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType:  "code",
		ResponseMode: "edit",
		Message:      "Bạn hãy tìm hiểu cho tôi tin tức mới nhất về hệ thống ai local từ các nguồn tin đáng tin cậy hôm nay?",
		CurrentCode:  "function normalizeUILanguage(rawLang) { var v = String(rawLang || '').toLowerCase(); return v || 'vi'; }",
	}
	intent := LocalIntentClassification{Type: "EDIT_CODE", Action: "other", NextStep: "load_code_context", ContextKind: "code", ResponseMode: "edit", Confidence: 90}
	if got := ResolvePipelineResponseMode(req, intent); got != "analyze" {
		t.Fatalf("got %s want analyze for semantically distant question", got)
	}
}

func TestResolvePipelineResponseModeQuestionWeaklyLinkedOverridesWithoutExplicitMode(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "code",
		Message:     "Bạn hãy tìm hiểu cho tôi tin tức mới nhất về hệ thống ai local từ các nguồn tin đáng tin cậy hôm nay?",
		CurrentCode: "function normalizeUILanguage(rawLang) { var v = String(rawLang || '').toLowerCase(); return v || 'vi'; }",
	}
	intent := LocalIntentClassification{Type: "EDIT_CODE", Action: "modify", NextStep: "load_code_context", ContextKind: "code", ResponseMode: "edit", Confidence: 90}
	if got := ResolvePipelineResponseMode(req, intent); got != "analyze" {
		t.Fatalf("got %s want analyze for semantically distant question without explicit mode", got)
	}
}

func TestResolvePipelineResponseModeConversationalNoQuestionMarkOverridesEdit(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType:  "code",
		ResponseMode: "edit",
		Message:      "Hãy cho tôi biết thông tin thời tiết hôm nay ở Sài Gòn",
		CurrentCode:  "function normalizeUILanguage(rawLang) { return rawLang; }",
	}
	intent := LocalIntentClassification{Type: "EDIT_CODE", Action: "modify", NextStep: "load_code_context", ContextKind: "code", ResponseMode: "edit", Confidence: 90}
	if got := ResolvePipelineResponseMode(req, intent); got != "analyze" {
		t.Fatalf("got %s want analyze for conversational ask without question mark", got)
	}
}

func TestHasExplicitEditDirectiveContextAware(t *testing.T) {
	if hasExplicitEditDirective("Sửa như thế nào để hết lỗi đăng nhập?") {
		t.Fatal("expected how-to-fix question to not be treated as direct edit")
	}
	if !hasExplicitEditDirective("Sửa hàm validateEmail thành async và áp dụng trực tiếp") {
		t.Fatal("expected direct edit request to be treated as edit directive")
	}
}

func TestFuzzySymbolOverlapSnakeCaseCamelCase(t *testing.T) {
	if !fuzzySymbolOverlap("user", "user_id") {
		t.Fatal("expected fuzzy overlap for user and user_id")
	}
	if !fuzzySymbolOverlap("normalizeuilanguage", "normalizeUILanguage") {
		t.Fatal("expected fuzzy overlap for normalized camelCase symbol")
	}
}

func TestIntentRoutingScoresWithHistoryAddsEditInertia(t *testing.T) {
	req := &CodeStreamRequest{ContextType: "code", Message: "Thêm biến debug nữa"}
	intent := LocalIntentClassification{Type: "EDIT_CODE", Action: "modify", NextStep: "load_code_context", ContextKind: "code", ResponseMode: "edit", Confidence: 80}
	baseEdit, _, _ := intentRoutingScores(req, intent)
	withHistoryEdit, _, _ := intentRoutingScoresWithHistory(req, intent, SessionHistoryState{LastResponseMode: "edit", ConsecutiveEdits: 3, ContextSwitched: false})
	if withHistoryEdit <= baseEdit {
		t.Fatalf("expected history inertia to increase edit score: base=%.2f history=%.2f", baseEdit, withHistoryEdit)
	}
}

func TestShouldRunLiveWebLookupWeatherRequest(t *testing.T) {
	req := &CodeStreamRequest{ContextType: "code", Message: "Hãy cho tôi biết thông tin thời tiết hôm nay ở sài gòn"}
	intent := LocalIntentClassification{Type: "QUESTION", Action: "ask", NextStep: "answer_direct", ResponseMode: "analyze", Confidence: 88}
	if !ShouldRunLiveWebLookup(req, "analyze", intent) {
		t.Fatal("expected live web lookup for weather request")
	}
}

func TestShouldRunLiveWebLookupInternetHintOnly(t *testing.T) {
	req := &CodeStreamRequest{ContextType: "code", Message: "bạn lên internet xem giúp tôi tin này"}
	intent := LocalIntentClassification{Type: "QUESTION", Action: "ask", NextStep: "answer_direct", ResponseMode: "analyze", Confidence: 82}
	if !ShouldRunLiveWebLookup(req, "analyze", intent) {
		t.Fatal("expected live web lookup when user explicitly asks internet lookup")
	}
}

func TestShouldRunLiveWebLookupInternetHintOnlyButEditDirective(t *testing.T) {
	req := &CodeStreamRequest{ContextType: "code", Message: "bạn lên internet xem rồi sửa hàm validateEmail giúp tôi"}
	intent := LocalIntentClassification{Type: "EDIT_CODE", Action: "modify", NextStep: "load_code_context", ResponseMode: "edit", Confidence: 90}
	if ShouldRunLiveWebLookup(req, "analyze", intent) {
		t.Fatal("expected no live web lookup when request is not weather-specific")
	}
}

func TestShouldRunLiveWebLookupWeatherFollowUpTomorrowRain(t *testing.T) {
	req := &CodeStreamRequest{ContextType: "code", Message: "Ngày mai có mưa không?"}
	intent := LocalIntentClassification{Type: "QUESTION", Action: "ask", NextStep: "answer_direct", ResponseMode: "analyze", Confidence: 80}
	if !ShouldRunLiveWebLookup(req, "analyze", intent) {
		t.Fatal("expected live web lookup for weather follow-up question")
	}
}

func TestShouldRunLiveWebLookupNonWeatherTomorrowQuestion(t *testing.T) {
	req := &CodeStreamRequest{ContextType: "code", Message: "Ngày mai có cuộc họp không?"}
	intent := LocalIntentClassification{Type: "QUESTION", Action: "ask", NextStep: "answer_direct", ResponseMode: "analyze", Confidence: 80}
	if ShouldRunLiveWebLookup(req, "analyze", intent) {
		t.Fatal("expected no live web lookup for non-weather tomorrow question")
	}
}

func TestShouldRunLiveWebLookupNotForEdit(t *testing.T) {
	req := &CodeStreamRequest{ContextType: "code", Message: "thời tiết sài gòn"}
	intent := LocalIntentClassification{Type: "QUESTION", Action: "ask", NextStep: "answer_direct", ResponseMode: "analyze", Confidence: 80}
	if ShouldRunLiveWebLookup(req, "edit", intent) {
		t.Fatal("expected no live web lookup in edit mode")
	}
}

func TestInferLiveWebDecisionLatestNews(t *testing.T) {
	req := &CodeStreamRequest{ContextType: "code", Message: "Bạn lên internet tìm tin tức AI mới nhất hôm nay"}
	intent := LocalIntentClassification{Type: "QUESTION", Action: "search", NextStep: "answer_direct", ResponseMode: "analyze", Confidence: 86}
	d := InferLiveWebDecision(req, "analyze", intent)
	if !d.ShouldRun {
		t.Fatalf("expected shouldRun=true, got %+v", d)
	}
}

func TestParseLiveWebDecisionJSON(t *testing.T) {
	raw := "```json\n{\"needInternet\":true,\"queryType\":\"weather\",\"confidence\":77,\"reason\":\"realtime_weather\",\"searchQuery\":\"weather saigon today\"}\n```"
	d, ok := parseLiveWebDecisionJSON(raw)
	if !ok {
		t.Fatal("expected parse success")
	}
	if !d.ShouldRun || d.QueryType != "weather" || d.Confidence != 77 {
		t.Fatalf("unexpected parsed decision: %+v", d)
	}
}

func TestMergeLiveWebDecisionPrefersHighConfidenceLLM(t *testing.T) {
	base := LiveWebDecision{ShouldRun: false, QueryType: "none", Confidence: 30, Reason: "low_confidence", SearchQuery: ""}
	llm := LiveWebDecision{ShouldRun: true, QueryType: "general_facts", Confidence: 72, Reason: "latest_info", SearchQuery: "latest ai news"}
	req := &CodeStreamRequest{Message: "Tin AI mới nhất hôm nay"}
	out := mergeLiveWebDecision(base, llm, req)
	if !out.ShouldRun || out.QueryType != "general_facts" || out.Confidence != 72 {
		t.Fatalf("expected llm arbitration override, got %+v", out)
	}
}

func TestInferLiveWebDecisionAdaptiveFallbackWithoutLlama(t *testing.T) {
	req := &CodeStreamRequest{ContextType: "code", Message: "Ngày mai có mưa không?"}
	intent := LocalIntentClassification{Type: "QUESTION", Action: "ask", NextStep: "answer_direct", Confidence: 80}
	adaptive := InferLiveWebDecisionAdaptive(nil, nil, req, "analyze", intent)
	base := InferLiveWebDecision(req, "analyze", intent)
	if adaptive.ShouldRun != base.ShouldRun || adaptive.QueryType != base.QueryType {
		t.Fatalf("expected adaptive fallback equals base, adaptive=%+v base=%+v", adaptive, base)
	}
}

func TestResolvePipelineResponseModeAdaptiveOverrideWithStrongConsensus(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType:  "code",
		ResponseMode: "edit",
		Message:      "Bạn là ai và có thể hỗ trợ gì?",
	}
	intent := LocalIntentClassification{Type: "QUESTION", Action: "ask", NextStep: "answer_direct", ContextKind: "none", ResponseMode: "analyze", Confidence: 92}
	if got := ResolvePipelineResponseMode(req, intent); got != "analyze" {
		t.Fatalf("got %s want analyze with strong intent consensus", got)
	}
}

func TestIntentRoutingScoresSignalBalance(t *testing.T) {
	editReq := &CodeStreamRequest{ContextType: "code", Message: "sửa hàm này"}
	editIntent := LocalIntentClassification{Type: "EDIT_CODE", Action: "modify", NextStep: "load_code_context", ContextKind: "code", ResponseMode: "edit", Confidence: 88}
	editScore, analyzeScore, signalBalance := intentRoutingScores(editReq, editIntent)
	if editScore <= analyzeScore {
		t.Fatalf("expected edit score > analyze score, got edit=%.2f analyze=%.2f", editScore, analyzeScore)
	}
	if signalBalance >= 0 {
		t.Fatalf("expected negative signal balance for edit intent, got %d", signalBalance)
	}

	analyzeReq := &CodeStreamRequest{ContextType: "none", Message: "bạn là ai?"}
	analyzeIntent := LocalIntentClassification{Type: "QUESTION", Action: "ask", NextStep: "answer_direct", ContextKind: "none", ResponseMode: "analyze", Confidence: 88}
	editScore, analyzeScore, signalBalance = intentRoutingScores(analyzeReq, analyzeIntent)
	if analyzeScore <= editScore {
		t.Fatalf("expected analyze score > edit score, got edit=%.2f analyze=%.2f", editScore, analyzeScore)
	}
	if signalBalance <= 0 {
		t.Fatalf("expected positive signal balance for analyze intent, got %d", signalBalance)
	}
}

func TestClassifyIntentHeuristicGreenfield(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Tạo menu ERP bán hàng và kho",
		CurrentCode: `{"menu":[]}`,
	}
	got := ClassifyIntentHeuristic(req)
	if got.Type != "EDIT_MENU" || got.ResponseMode != "edit" {
		t.Fatalf("got %+v want EDIT_MENU edit", got)
	}
}

func TestReconcileResponseModeWithIntent(t *testing.T) {
	intent := LocalIntentClassification{Type: "EDIT_CODE", ResponseMode: "analyze"}
	if got := ReconcileResponseModeWithIntent(intent, "analyze"); got != "analyze" {
		t.Fatalf("got %s want analyze when client explicit", got)
	}
}

func TestLearningMemoryRecordAndRetrieve(t *testing.T) {
	dir := t.TempDir()
	cfg := config.AppConfig{AI: config.AIConfig{ContextDir: dir}}
	appID := "testapp"

	err := RecordSuccessfulCodeEdit(cfg, nil, appID, "fix timer leak", "replaced setInterval with cleanup", "code", "code_editor", 2)
	if err != nil {
		t.Fatal(err)
	}
	block := BuildLearningContextBlock(cfg, nil, appID, "timer leak fix", "code", 4000)
	if !containsStr(block, "timer leak") {
		t.Fatalf("expected learning block to contain request, got: %q", block)
	}

	err = RecordSuccessfulCodeEdit(cfg, nil, appID, "fix timer leak", "replaced setInterval with cleanup", "code", "code_editor", 2)
	if err != nil {
		t.Fatal(err)
	}
	entries, err := loadCodeLearningEntries(cfg, nil, appID)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("entries=%d want 1 (deduped)", len(entries))
	}
	path := filepath.Join(dir, "ai_code_learning_testapp.jsonl")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("jsonl file missing: %v", err)
	}
}

func TestComprehendBusinessHeuristicMenu(t *testing.T) {
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Thêm module CRM",
		CurrentCode: `{"menu":[{"id":"ban_hang","label":"Bán hàng","children":[{"id":"don","label":"Đơn hàng"}]}]}`,
	}
	spec := ComprehendBusinessHeuristic(req)
	if len(spec.Modules) < 2 {
		t.Fatalf("modules=%v want >=2", spec.Modules)
	}
	block := BuildComprehendPromptBlock(spec)
	if !containsStr(block, "BUSINESS_COMPREHENSION") {
		t.Fatalf("missing comprehend block")
	}
}

func TestPhase1PipelineProducesSSEEvents(t *testing.T) {
	cfg := config.AppConfig{AI: config.AIConfig{ContextDir: t.TempDir()}}
	req := &CodeStreamRequest{
		RequestID: "req-1", AppID: "csm", FlowType: "menu_manager",
		ContextType: "menu_json", TaskType: "menu_design",
		Message: "Thêm module kho", CurrentCode: `{"menu":[]}`,
	}
	ctx := PreparePhase1Pipeline(cfg, nil, nil, req, PipelineInput{})
	events := Phase1SSEEvents(req, ctx)
	if len(events) < 8 {
		t.Fatalf("events=%d want >=8", len(events))
	}
	stages := map[string]bool{}
	for _, e := range events {
		if s, ok := e["stage"].(string); ok {
			stages[s] = true
		}
	}
	for _, want := range []string{"intent_reasoning", "routing", "business_comprehend", "agentic_plan", "agent_handoff", "tool_search", "retrieval_quality_gate", "rag_citations"} {
		if !stages[want] {
			t.Fatalf("missing stage %s in %v", want, stages)
		}
	}
}

func TestBuildOrchestrationSnapshot(t *testing.T) {
	cfg := config.AppConfig{AI: config.AIConfig{ContextDir: t.TempDir()}}
	req := &CodeStreamRequest{
		ContextType: "code", Message: "Sửa hàm init", CurrentCode: "function init() {}",
	}
	intent := ClassifyIntentHeuristic(req)
	snap := BuildOrchestrationSnapshot(cfg, req, intent, "learning", "comprehend", req.CurrentCode, TenantRAGResult{})
	if len(snap.PlanSteps) < 5 {
		t.Fatalf("planSteps=%d want >=5", len(snap.PlanSteps))
	}
	if snap.RoutingTier == "" {
		t.Fatal("empty routing tier")
	}
}

func TestShouldQuickReplyForAnswerDirectAnalyze(t *testing.T) {
	intent := LocalIntentClassification{Type: "GENERAL", NextStep: "answer_direct", ContextKind: "none", ResponseMode: "analyze", Confidence: 88}
	if !ShouldQuickReply(intent, "analyze") {
		t.Fatal("expected quick reply for answer_direct analyze")
	}
}

func TestPreparePhase1PipelineQuickReplySkipsHeavyContext(t *testing.T) {
	cfg := config.AppConfig{AI: config.AIConfig{ContextDir: t.TempDir()}}
	req := &CodeStreamRequest{
		RequestID: "req-quick-1", AppID: "csm", FlowType: "code_editor",
		ContextType: "none", TaskType: "chat",
		Message: "Thời tiết hôm nay như nào?", CurrentCode: "",
	}
	ctx := PreparePhase1Pipeline(cfg, nil, nil, req, PipelineInput{})
	if !ShouldQuickReply(ctx.Intent, ctx.ResponseMode) {
		t.Fatalf("expected quick-reply phase1, got intent=%+v responseMode=%s", ctx.Intent, ctx.ResponseMode)
	}
	if ctx.LearningBlock != "" || ctx.ComprehendBlock != "" || ctx.TenantRAG.Block != "" {
		t.Fatalf("quick-reply should skip heavy context blocks, got learning=%d comprehend=%d rag=%d", len(ctx.LearningBlock), len(ctx.ComprehendBlock), len(ctx.TenantRAG.Block))
	}
	if ctx.Orchestration.RoutingTier != "planner_fast" {
		t.Fatalf("routing tier=%s want planner_fast", ctx.Orchestration.RoutingTier)
	}
}

func TestPhase1SSEEventsQuickReplyLightweight(t *testing.T) {
	cfg := config.AppConfig{AI: config.AIConfig{ContextDir: t.TempDir()}}
	req := &CodeStreamRequest{
		RequestID: "req-quick-2", AppID: "csm", FlowType: "code_editor",
		ContextType: "none", TaskType: "chat",
		Message: "Kể một câu chào ngắn", CurrentCode: "",
	}
	ctx := PreparePhase1Pipeline(cfg, nil, nil, req, PipelineInput{})
	events := Phase1SSEEvents(req, ctx)
	stages := map[string]bool{}
	for _, e := range events {
		if s, ok := e["stage"].(string); ok {
			stages[s] = true
		}
	}
	if !stages["intent_reasoning"] || !stages["routing"] || !stages["agentic_plan"] {
		t.Fatalf("missing quick-reply core stages: %v", stages)
	}
	if stages["business_comprehend"] || stages["tool_search"] || stages["rag_citations"] {
		t.Fatalf("quick-reply should not include heavy stages: %v", stages)
	}
}
