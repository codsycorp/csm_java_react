package services

import "testing"

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
