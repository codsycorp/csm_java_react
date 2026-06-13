package services

import (
	"context"
	"strings"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestLiveLlamaAnalyzePrompt(t *testing.T) {
	cfg := config.LoadFromEnv()
	llama := NewLlamaService(cfg)
	if !llama.IsAvailable() {
		t.Skip("llama unavailable")
	}
	req := &CodeStreamRequest{
		RequestID: "probe", AppID: "csm", FlowType: "code_editor", TaskType: "code_assistant",
		ContextType: "code", Message: "Xin chào. Bạn là ai? Bạn có thể làm gì được cho tôi",
		UILang: "vi", ResponseMode: "analyze",
	}
	prompt := BuildCodeStreamLocalPrompt(cfg, req)
	if !strings.Contains(prompt, "<|im_start|>assistant") {
		t.Fatal("missing assistant marker")
	}
	text, err := llama.Complete(context.Background(), prompt)
	if err != nil {
		t.Fatalf("complete: %v", err)
	}
	cleaned := CleanLocalModelOutput(text)
	if len(cleaned) < 20 {
		t.Fatalf("too short: %q", cleaned)
	}
	sCount := strings.Count(cleaned, "s")
	if sCount > len(cleaned)/2 {
		t.Fatalf("degenerate output: %q", cleaned[:minInt(120, len(cleaned))])
	}
	t.Logf("ok len=%d head=%q", len(cleaned), cleaned[:minInt(120, len(cleaned))])
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
