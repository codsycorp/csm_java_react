package services

import (
	"os"
	"regexp"
	"strconv"
	"strings"

	"csm_server/backend-go/internal/config"
)

var (
	localDataURLPattern = regexp.MustCompile(`data:[^;\s]+;base64,[A-Za-z0-9+/=\s]{200,}`)
	localBase64Line     = regexp.MustCompile(`(?m)^[A-Za-z0-9+/=]{500,}\s*$`)
)

// IsPromptBudgetDisabled turns off tier-based prompt/output clamps (8GB caps, slot shrink).
// Limits then follow only AI_LOCAL_LLAMA_* caps and llama context window (MaxSafePromptChars).
func IsPromptBudgetDisabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("AI_LOCAL_PROMPT_BUDGET_DISABLED")))
	if v == "true" || v == "1" || v == "yes" {
		return true
	}
	tier := localRuntimeTier()
	switch tier {
	case "max", "unlimited", "strong", "local-strong":
		return true
	}
	return false
}

func localRuntimeTier() string {
	tier := strings.ToLower(strings.TrimSpace(os.Getenv("AI_LOCAL_RUNTIME_TIER")))
	if tier == "" {
		tier = strings.ToLower(strings.TrimSpace(os.Getenv("CSM_LOCAL_PROFILE")))
	}
	return tier
}

// IsConstrained8GbTier mirrors Java balanced-8gb / ctx<=8192 production profile.
func IsConstrained8GbTier(cfg config.AppConfig) bool {
	if IsPromptBudgetDisabled() {
		return false
	}
	tier := localRuntimeTier()
	if strings.Contains(tier, "8gb") || tier == "balanced" || tier == "local-8gb" {
		return true
	}
	return cfg.EffectiveLlamaContextWindow() <= 8192
}

// MaxSafePromptChars estimates char budget from context window minus output reserve.
// Also capped by n_batch: go-nativeml/llama.cpp aborts (SIGABRT) if a single prefill step exceeds batch.
func MaxSafePromptChars(cfg config.AppConfig) int {
	ctx := int(cfg.EffectiveLlamaContextWindow())
	out := int(cfg.EffectiveLlamaMaxTokens())
	margin := 512
	if ctx <= 8192 {
		margin = 768
	}
	tokenBudget := ctx - out - margin
	if tokenBudget < 1024 {
		tokenBudget = 1024
	}
	// ~3 chars/token for code/json (conservative vs 4) to avoid KV overflow on 8GB.
	chars := tokenBudget * 3
	if !IsPromptBudgetDisabled() {
		if chars < 4000 {
			chars = 4000
		}
		batch := int(cfg.EffectiveLlamaBatchSize())
		if batch > 0 {
			batchChars := batch * 3
			if chars > batchChars {
				chars = batchChars
			}
		}
	}
	if chars < 1024 {
		return 1024
	}
	return chars
}

// EffectiveLocalPromptCap picks final prompt clamp (Java resolveEffectiveLocalPromptCap subset).
func EffectiveLocalPromptCap(cfg config.AppConfig, contextType, responseMode string) int {
	llamaCap := cfg.AI.LlamaMaxPromptChars
	if llamaCap <= 0 {
		llamaCap = 32_000
	}
	hardCap := min(llamaCap, MaxSafePromptChars(cfg))
	if IsConstrained8GbTier(cfg) {
		hardCap = min(hardCap, 18_000)
	}
	mode := strings.ToLower(strings.TrimSpace(responseMode))
	ctx := strings.ToLower(strings.TrimSpace(contextType))
	if mode == "edit" && (ctx == "code" || ctx == "frontend_code") && IsConstrained8GbTier(cfg) {
		hardCap = min(hardCap, 14_000)
	}
	if mode == "analyze" && ctx != "menu_json" {
		hardCap = min(hardCap, max(8000, hardCap/2))
		if IsConstrained8GbTier(cfg) {
			hardCap = min(hardCap, 9000)
		}
	}
	if hardCap < 1024 {
		return 1024
	}
	return hardCap
}

// EffectiveLocalPromptCapForPrintImport reserves output headroom for long HTML trigger returns.
func EffectiveLocalPromptCapForPrintImport(cfg config.AppConfig) int {
	llamaCap := cfg.AI.LlamaMaxPromptChars
	if llamaCap <= 0 {
		llamaCap = 48_000
	}
	ctx := int(cfg.EffectiveLlamaContextWindow())
	outReserve := int(codeStreamPrintImportMaxTokens())
	if outReserve < 2048 {
		outReserve = 2048
	}
	tokenBudget := ctx - outReserve - 512
	if tokenBudget < 2048 {
		tokenBudget = 2048
	}
	safeFromCtx := tokenBudget * 3
	hardCap := min(llamaCap, min(safeFromCtx, MaxSafePromptChars(cfg)))
	if IsConstrained8GbTier(cfg) {
		hardCap = min(hardCap, 28_000)
	}
	if hardCap < 4096 {
		return 4096
	}
	return hardCap
}

// SanitizeLocalInferencePrompt strips binary/base64 payloads that blow token counts (PDF import).
func SanitizeLocalInferencePrompt(prompt string) string {
	s := strings.TrimSpace(prompt)
	if s == "" {
		return s
	}
	s = localDataURLPattern.ReplaceAllString(s, "[attachment removed: local text model cannot read images]")
	s = localBase64Line.ReplaceAllString(s, "[base64 page removed]")
	if idx := strings.Index(s, "## Ảnh mẫu (base64)"); idx >= 0 {
		head := strings.TrimSpace(s[:idx])
		s = head + "\n\n[PDF sample images omitted — use layout presets or describe layout in text.]\n"
	}
	return s
}

// EffectiveInferenceMaxTokens picks output budget (analyze uses less on 8GB to avoid OOM).
func EffectiveInferenceMaxTokens(cfg config.AppConfig, responseMode string) uint32 {
	return EffectiveInferenceMaxTokensFromParams(cfg, responseMode, nil)
}

// EffectiveInferenceMaxTokensFromParams applies print-import boost when editorMetadata.source=LineItemsPdfImport.
func EffectiveInferenceMaxTokensFromParams(cfg config.AppConfig, responseMode string, params map[string]any) uint32 {
	base := effectiveInferenceMaxTokensBase(cfg, responseMode)
	if strings.ToLower(strings.TrimSpace(responseMode)) != "edit" {
		return base
	}
	if editorMetadataSource(params) == "LineItemsPdfImport" {
		cap := effectivePrintImportOutputCap(cfg)
		base := effectiveInferenceMaxTokensBase(cfg, responseMode)
		if cap > base {
			return cap
		}
		return base
	}
	return base
}

func effectivePrintImportOutputCap(cfg config.AppConfig) uint32 {
	want := codeStreamPrintImportMaxTokens()
	ctx := cfg.EffectiveLlamaContextWindow()
	// Reserve ≥2048 prompt tokens; allow long HTML return on small ctx (8192 → ~6144 out).
	maxByCtx := ctx
	if maxByCtx > 2048 {
		maxByCtx -= 2048
	} else {
		maxByCtx = 512
	}
	if want > maxByCtx {
		want = maxByCtx
	}
	return want
}

func editorMetadataSource(params map[string]any) string {
	if params == nil {
		return ""
	}
	raw, ok := params["editorMetadata"]
	if !ok {
		return ""
	}
	m, ok := raw.(map[string]any)
	if !ok {
		return ""
	}
	return strings.TrimSpace(paramString(m, "source", ""))
}

func effectiveInferenceMaxTokensBase(cfg config.AppConfig, responseMode string) uint32 {
	base := cfg.EffectiveLlamaMaxTokens()
	mode := strings.ToLower(strings.TrimSpace(responseMode))
	if mode == "analyze" && IsConstrained8GbTier(cfg) {
		if base > 512 {
			return 512
		}
		return base
	}
	// Print triggers / code patches need much more than 768 tok (full HTML return).
	if mode == "edit" && IsConstrained8GbTier(cfg) {
		editMax := codeStreamEditMaxTokens()
		cap := editMax
		ctxHalf := cfg.EffectiveLlamaContextWindow() / 2
		if cap > ctxHalf {
			cap = ctxHalf
		}
		if cap < base {
			return base
		}
		return cap
	}
	if IsConstrained8GbTier(cfg) && base > 768 {
		return 768
	}
	return base
}

func codeStreamEditMaxTokens() uint32 {
	v := strings.TrimSpace(os.Getenv("AI_CODE_STREAM_EDIT_MAX_TOKENS"))
	if v == "" {
		return 2048
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return 2048
	}
	return uint32(n)
}

func codeStreamPrintImportMaxTokens() uint32 {
	v := strings.TrimSpace(os.Getenv("AI_CODE_STREAM_PRINT_IMPORT_MAX_TOKENS"))
	if v == "" {
		if edit := codeStreamEditMaxTokens(); edit > 2048 {
			return edit
		}
		return 4096
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return 4096
	}
	return uint32(n)
}

// TruncateMiddle keeps system head + user tail when prompt exceeds cap (Java truncateMiddle parity).
func TruncateMiddle(text string, maxChars int) string {
	if maxChars <= 0 || len(text) <= maxChars {
		return text
	}
	if maxChars < 200 {
		return truncateStr(text, maxChars)
	}
	head := maxChars * 45 / 100
	tail := maxChars - head - 48
	if tail < 80 {
		tail = 80
		head = maxChars - tail - 48
	}
	if head < 80 {
		return truncateStr(text, maxChars)
	}
	marker := "\n\n[... context truncated to fit local model window ...]\n\n"
	return text[:head] + marker + text[len(text)-tail:]
}

// ClampPromptForLocalProvider applies tier-aware middle truncation before inference.
func ClampPromptForLocalProvider(cfg config.AppConfig, prompt, contextType, responseMode string) string {
	cap := EffectiveLocalPromptCap(cfg, contextType, responseMode)
	if len(prompt) <= cap {
		return prompt
	}
	return TruncateMiddle(prompt, cap)
}

// MaxOutgoingEditorChars caps editor code in request/ingest for tier.
func MaxOutgoingEditorChars(cfg config.AppConfig, contextType, responseMode string) int {
	if !IsConstrained8GbTier(cfg) {
		return 500_000
	}
	mode := strings.ToLower(strings.TrimSpace(responseMode))
	if mode == "analyze" {
		return 12_000
	}
	if strings.ToLower(strings.TrimSpace(contextType)) == "menu_json" {
		return 80_000
	}
	return 48_000
}

// ConstrainedPromptSlotCaps returns smaller injection budgets on 8GB tier.
func ConstrainedPromptSlotCaps(cfg config.AppConfig) (editorMax, ragMax, learningMax, workspaceMax int) {
	editorMax = 22_000
	ragMax = 5000
	learningMax = 8000
	workspaceMax = 4000
	if !IsConstrained8GbTier(cfg) {
		return
	}
	editorMax = 10_000
	ragMax = 2200
	learningMax = 2500
	workspaceMax = 1200
	return
}
