package services

import (
	"os"
	"strings"

	"csm_server/backend-go/internal/config"
)

// IsConstrained8GbTier mirrors Java balanced-8gb / ctx<=8192 production profile.
func IsConstrained8GbTier(cfg config.AppConfig) bool {
	tier := strings.ToLower(strings.TrimSpace(os.Getenv("AI_LOCAL_RUNTIME_TIER")))
	if tier == "" {
		tier = strings.ToLower(strings.TrimSpace(os.Getenv("CSM_LOCAL_PROFILE")))
	}
	if strings.Contains(tier, "8gb") || tier == "balanced" || tier == "local-8gb" {
		return true
	}
	return cfg.EffectiveLlamaContextWindow() <= 8192
}

// MaxSafePromptChars estimates char budget from context window minus output reserve.
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
	if chars < 4000 {
		return 4000
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
	}
	return max(4000, hardCap)
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
	marker := "\n\n[... context truncated for 8GB local tier ...]\n\n"
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
