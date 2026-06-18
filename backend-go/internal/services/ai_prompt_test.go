package services

import (
	"strings"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestPrepareLocalProviderPromptAddsAssistantTurn(t *testing.T) {
	raw := "You are CSM AI Assistant.\n[USER_REQUEST]\nHello\n[/USER_REQUEST]"
	got := PrepareLocalProviderPrompt(raw, 32_000)
	if !containsAll(got, "<|im_start|>assistant", "Hello") {
		t.Fatalf("expected assistant turn marker, got: %q", got)
	}
}

func TestCleanLocalModelOutputStripsChatTemplate(t *testing.T) {
	raw := "<|im_start|>assistant\nXin chào! Tôi là CSM AI Assistant."
	got := CleanLocalModelOutput(raw)
	if got != "Xin chào! Tôi là CSM AI Assistant." {
		t.Fatalf("unexpected cleaned output: %q", got)
	}
}

func TestBuildMenuAnalyzePromptIncludesLargeEditor(t *testing.T) {
	t.Setenv("AI_LOCAL_RUNTIME_TIER", "balanced-8gb")
	bigMenu := `{"menu":[{"id":"ban","trigger":{"fields":[` + strings.Repeat(`{"f_name":"col","f_types":"co","f_header_en":"Name"},`, 400) + `]}}]}`
	cfg := config.AppConfig{
		AI: config.AIConfig{LlamaContextWindow: 8192, LlamaMaxTokens: 1024, LlamaMaxPromptChars: 32000, LlamaBatchSize: 8192},
	}
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Xem kỹ kiểu co tại sao không có giá trị khi chọn tiếng Việt",
		CurrentCode: bigMenu,
		ResponseMode: "analyze",
		UILang:      "vi",
	}
	prompt := BuildCodeStreamLocalPrompt(cfg, req)
	if !strings.Contains(prompt, "[ACTIVE_EDITOR_MENU_JSON]") {
		t.Fatal("menu analyze must include active editor even when >8k chars")
	}
	if !strings.Contains(prompt, "f_types=\"co\"") {
		t.Fatal("expected menu analyze contract mentioning f_types=co")
	}
}

func containsAll(s string, parts ...string) bool {
	for _, p := range parts {
		if p == "" || !containsStr(s, p) {
			return false
		}
	}
	return true
}

func containsStr(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && indexStr(s, sub) >= 0)
}

func indexStr(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
