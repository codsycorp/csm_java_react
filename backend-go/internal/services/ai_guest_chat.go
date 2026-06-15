package services

import (
	"context"
	"strings"
	"time"

	"csm_server/backend-go/internal/config"
)

// GuestChatReply generates a short local reply for socket guest chat.
func GuestChatReply(cfg config.AppConfig, llama *LlamaService, message, locale, appID string) string {
	msg := strings.TrimSpace(message)
	if msg == "" || llama == nil || !llama.IsAvailable() {
		return ""
	}
	lang := "Vietnamese"
	switch strings.ToLower(locale) {
	case "en":
		lang = "English"
	case "zh", "zh-cn":
		lang = "Chinese"
	}
	prompt := PrepareLocalProviderPrompt(strings.TrimSpace(`You are CSM guest web assistant for app `+appID+`.
Reply in `+lang+` in 2-4 short helpful sentences. No JSON. No code fences.
Guest: `+truncateStr(msg, 800)), 4000)
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	raw, err := llama.CompleteWithTokens(ctx, prompt, 192)
	if err != nil {
		return ""
	}
	return CleanLocalModelOutput(raw)
}
