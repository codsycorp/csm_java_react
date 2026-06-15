package services

import (
	"context"
	"strings"
	"time"

	"csm_server/backend-go/internal/config"
)

const menuModuleEnrichMax = 16
const menuModuleReplanMaxAttempts = 1

// GreenfieldScaffoldResult is output of scaffold-first pipeline.
type GreenfieldScaffoldResult struct {
	Applied    bool
	MenuJSON   string
	ModelLabel string
	SSEEvents  []map[string]any
	GateReport MenuQualityReport
}

// TryGreenfieldScaffoldFirst runs Java scaffold-first path without main LLM worker.
func TryGreenfieldScaffoldFirst(cfg config.AppConfig, llama *LlamaService, req *CodeStreamRequest, phase1 RunPhase1PipelineContext) GreenfieldScaffoldResult {
	if !ShouldRunGreenfieldScaffoldFirst(req, phase1.BusinessSpec, phase1.ResponseMode) {
		return GreenfieldScaffoldResult{}
	}

	enriched := EnrichBusinessSpecForMenuGreenfield(phase1.BusinessSpec, req.Message)
	var events []map[string]any

	// menu_module_step — plan preview per planned row
	for i, row := range enriched.PlannedStructure {
		events = append(events, MenuModuleStepSSE(req, i+1, len(enriched.PlannedStructure), row))
	}

	scaffoldJSON := BuildGreenfieldMenuScaffoldJson(enriched, req.Message)
	scaffoldNodes := CountMenuNodesFromDraft(scaffoldJSON)
	events = append(events, MenuScaffoldAssembleSSE(req, scaffoldNodes))

	if scaffoldJSON == "" || scaffoldNodes < greenfieldScaffoldMinNodes {
		return GreenfieldScaffoldResult{SSEEvents: events}
	}

	events = append(events, AgentHandoffSSE(req, "Supervisor", "Executor", "module_enrich_start", "AD-R4 enrich leaf modules"))

	finalJSON := enrichGreenfieldMenuByModule(cfg, llama, scaffoldJSON, enriched, req, &events)
	report, gated := GateGreenfieldMenuForApply(finalJSON, req.Message)
	events = append(events, FinalOutputGateSSE(req, report, "greenfield_before_apply"))

	if !report.Passed || gated == "" {
		return GreenfieldScaffoldResult{Applied: false, SSEEvents: events, GateReport: report}
	}

	modelLabel := "local_scaffold_assemble"
	if len(collectEnrichableMenuLeaves(parseMenuRoots(gated))) > 0 {
		modelLabel = "local_scaffold_assemble+module_enrich"
	}
	return GreenfieldScaffoldResult{
		Applied: true, MenuJSON: gated, ModelLabel: modelLabel,
		SSEEvents: events, GateReport: report,
	}
}

func enrichGreenfieldMenuByModule(cfg config.AppConfig, llama *LlamaService, menuJSON string, spec BusinessSpec, req *CodeStreamRequest, events *[]map[string]any) string {
	roots := parseMenuRoots(menuJSON)
	if len(roots) == 0 {
		return menuJSON
	}
	leaves := collectEnrichableMenuLeaves(roots)
	if len(leaves) == 0 {
		return menuJSON
	}
	total := len(leaves)
	if total > menuModuleEnrichMax {
		total = menuModuleEnrichMax
	}

	for i := 0; i < total; i++ {
		node := leaves[i]
		index := i + 1
		moduleLabel := stringFromAny(node["label"])
		nodeID := stringFromAny(node["id"])
		typeForm := intFromAny(node["type_form"])

		*events = append(*events, MenuModuleEnrichSSE(req, index, total, moduleLabel, nodeID, typeForm, "running", false))
		applyDeterministicModuleI18n(node)
		applyGreenfieldCSMRules(node)

		usedLlm := false
		if llama != nil && llama.IsAvailable() {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			prompt := buildModuleEnrichPrompt(node, req.Message, spec)
			if raw, err := llama.CompleteWithTokens(ctx, prompt, 384); err == nil {
				if applyModuleEnrichPatch(node, CleanLocalModelOutput(raw)) {
					usedLlm = true
				}
			}
			cancel()
		}
		RepairMenuTreeInPlace(roots)

		gateDetail := validateModuleNodeSoft(roots, nodeID)
		replanAttempt := 0
		for gateDetail != "" && replanAttempt < menuModuleReplanMaxAttempts {
			replanAttempt++
			*events = append(*events, AgentHandoffSSE(req, "Reviewer", "Planner", "replan_module", gateDetail))
			*events = append(*events, MenuModuleEnrichSSE(req, index, total, moduleLabel, nodeID, typeForm, "replanning", false))
			replanGreenfieldModuleNode(node, req.Message)
			RepairMenuTreeInPlace(roots)
			gateDetail = validateModuleNodeSoft(roots, nodeID)
		}

		*events = append(*events, AgentHandoffSSE(req, "Executor", "Reviewer", "module_gate", "pass "+moduleLabel))
		status := "completed"
		if !usedLlm {
			status = "completed_deterministic"
		}
		*events = append(*events, MenuModuleEnrichSSE(req, index, total, moduleLabel, nodeID, typeForm, status, usedLlm))
	}
	applyGreenfieldCSMRulesToTree(roots)
	return wrapMenuFromRoots(roots)
}

func buildModuleEnrichPrompt(node map[string]any, userMessage string, spec BusinessSpec) string {
	label := stringFromAny(node["label"])
	id := stringFromAny(node["id"])
	return PrepareLocalProviderPrompt(strings.TrimSpace(`You enrich ONE CSM menu module node.
Return ONLY JSON: {"label_en":"...","label_zh":"...","table_patches":[]}
Rules: keep id and structure; only improve i18n labels and f_header_en/zh.
Module id: `+id+`
Module label: `+label+`
USER_REQUEST: `+truncateStr(userMessage, 400)+`
Domain: `+truncateStr(spec.DomainSummary, 200)), 4000)
}

func applyModuleEnrichPatch(node map[string]any, raw string) bool {
	raw = cleanMarkdownFromJSON(strings.TrimSpace(raw))
	if raw == "" || !strings.Contains(raw, "{") {
		return false
	}
	// Lightweight parse without full JSON dependency on partial patches
	changed := false
	if idx := strings.Index(raw, `"label_en"`); idx >= 0 {
		if v := extractJSONStringValue(raw[idx:]); v != "" {
			node["label_en"] = v
			changed = true
		}
	}
	if idx := strings.Index(raw, `"label_zh"`); idx >= 0 {
		if v := extractJSONStringValue(raw[idx:]); v != "" {
			node["label_zh"] = v
			changed = true
		}
	}
	return changed
}

func extractJSONStringValue(fragment string) string {
	colon := strings.Index(fragment, ":")
	if colon < 0 {
		return ""
	}
	rest := strings.TrimSpace(fragment[colon+1:])
	if !strings.HasPrefix(rest, `"`) {
		return ""
	}
	rest = rest[1:]
	end := strings.Index(rest, `"`)
	if end < 0 {
		return ""
	}
	return rest[:end]
}

func validateModuleNodeSoft(roots []any, nodeID string) string {
	if nodeID == "" || len(roots) == 0 {
		return ""
	}
	report := ValidateMenuJSON(roots, "module_enrich")
	if report.Passed {
		return ""
	}
	var msgs []string
	for _, issue := range report.Issues {
		if issue.Severity != "error" {
			continue
		}
		if strings.Contains(issue.Path, nodeID) {
			msgs = append(msgs, issue.Message)
		}
		if len(msgs) >= 2 {
			break
		}
	}
	return strings.Join(msgs, "; ")
}

func replanGreenfieldModuleNode(node map[string]any, userMessage string) {
	if node == nil {
		return
	}
	_ = userMessage
	typeForm := intFromAny(node["type_form"])
	_ = stringFromAny(node["label"])
	delete(node, "trigger")
	upgradeMinimalTriggers(node, typeForm)
	applyGreenfieldCSMRules(node)
	applyDeterministicModuleI18n(node)
	if children, ok := node["children"].([]any); ok {
		for _, child := range children {
			if m, ok := child.(map[string]any); ok {
				replanGreenfieldModuleNode(m, userMessage)
			}
		}
	}
}

// MenuModuleStepSSE emits menu_module_step completed event.
func MenuModuleStepSSE(req *CodeStreamRequest, index, total int, row PlannedModuleRow) map[string]any {
	return map[string]any{
		"stage": "menu_module_step", "status": "completed", "requestId": req.RequestID,
		"moduleIndex": index, "moduleTotal": total, "module": row.Module,
		"typeForm": row.TypeForm, "legoPiece": row.LegoPiece,
		"tableNameHint": row.TableNameHint, "message": "Planned module " + row.Module,
	}
}

// MenuScaffoldAssembleSSE emits menu_scaffold_assemble event.
func MenuScaffoldAssembleSSE(req *CodeStreamRequest, menuNodes int) map[string]any {
	return map[string]any{
		"stage": "menu_scaffold_assemble", "status": "completed", "requestId": req.RequestID,
		"menuNodes": menuNodes, "assembler": "java_scaffold_parity_go",
		"message": "Ráp menu Lego — scaffold Java parity (Go)",
	}
}

// MenuModuleEnrichSSE emits menu_module_enrich lifecycle event.
func MenuModuleEnrichSSE(req *CodeStreamRequest, index, total int, module, nodeID string, typeForm int, status string, usedLlm bool) map[string]any {
	return map[string]any{
		"stage": "menu_module_enrich", "status": status, "requestId": req.RequestID,
		"moduleIndex": index, "moduleTotal": total, "module": module, "nodeId": nodeID,
		"typeForm": typeForm, "usedLlm": usedLlm,
		"message": module,
	}
}

// RetrievalQualityGateSSE emits retrieval_quality_gate after tenant RAG.
func RetrievalQualityGateSSE(req *CodeStreamRequest, rag TenantRAGResult) map[string]any {
	minChars := 1200
	retrievalChars := rag.CharsUsed
	passed := retrievalChars >= minChars || rag.HitCount >= 2
	status := "passed"
	if !passed {
		status = "low_evidence"
	}
	deficit := 0
	if retrievalChars < minChars {
		deficit = minChars - retrievalChars
	}
	return map[string]any{
		"stage": "retrieval_quality_gate", "status": status, "requestId": req.RequestID,
		"retrievalChars": retrievalChars, "retrievalMinChars": minChars,
		"retrievalQualityPassed": passed, "retrievalDeficit": deficit,
		"retrievalHitCount": rag.HitCount,
		"message": map[bool]string{true: "Tenant RAG evidence sufficient", false: "Low tenant RAG evidence"}[passed],
	}
}
