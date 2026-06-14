package services

import (
	"context"
	"fmt"
	"log"
	"os"

	"csm_server/backend-go/internal/config"
)

const (
	LocalProviderUnavailableCode = "LOCAL_PROVIDER_UNAVAILABLE"
)

type LlamaService struct {
	cfg    config.AppConfig
	native *llamaNativeBackend
}

func NewLlamaService(cfg config.AppConfig) *LlamaService {
	native := newLlamaNativeBackend(cfg)
	svc := &LlamaService{cfg: cfg, native: native}
	if native.ready() {
		log.Printf("LlamaService: native in-process llama.cpp enabled (%s)", cfg.AI.LlamaModelPath)
	} else if cfg.AI.LlamaNativeEnabled && svc.modelExists() {
		log.Printf("LlamaService: rebuild required — go build -tags llamacpp (scripts/build-go-linux-native.sh)")
	}
	return svc
}

func (l *LlamaService) Shutdown() {
	if l.native != nil {
		l.native.shutdown()
	}
}

func (l *LlamaService) UsesNative() bool {
	return l.native != nil && l.native.ready()
}

func (l *LlamaService) IsAvailable() bool {
	return l.UsesNative()
}

func (l *LlamaService) ModelOnDisk() bool {
	return l.modelExists()
}

func (l *LlamaService) modelExists() bool {
	if l.cfg.AI.LlamaModelPath == "" {
		return false
	}
	info, err := os.Stat(l.cfg.AI.LlamaModelPath)
	return err == nil && !info.IsDir()
}

func (l *LlamaService) Complete(ctx context.Context, prompt string) (string, error) {
	return l.CompleteWithTokens(ctx, prompt, l.cfg.EffectiveLlamaMaxTokens())
}

func (l *LlamaService) CompleteWithTokens(ctx context.Context, prompt string, maxTokens uint32) (string, error) {
	if !l.UsesNative() {
		return "", fmt.Errorf("%s: %s", LocalProviderUnavailableCode, l.statusHint())
	}
	text, err := l.native.complete(prompt, maxTokens)
	if err != nil {
		return "", err
	}
	return CleanLocalModelOutput(text), nil
}

func (l *LlamaService) IsModelLoaded() bool {
	return l.native != nil && l.native.isLoaded()
}

func (l *LlamaService) StreamCompletion(ctx context.Context, prompt string, onToken func(string) error) error {
	if !l.UsesNative() {
		return fmt.Errorf("%s: %s", LocalProviderUnavailableCode, l.statusHint())
	}
	return l.native.stream(prompt, l.cfg.EffectiveLlamaMaxTokens(), onToken)
}

func LocalUnavailableMessage() string {
	return "Local AI provider chưa sẵn sàng"
}

func LocalUnavailableHint() string {
	return "Build với scripts/build-go-linux-native.sh (-tags llamacpp). Kiểm tra: journalctl -u csm-go | grep LlamaNative"
}

func (l *LlamaService) StatusSummary() map[string]any {
	return map[string]any{
		"modelOnDisk":   l.ModelOnDisk(),
		"modelPath":     l.cfg.AI.LlamaModelPath,
		"nativeEnabled": l.cfg.AI.LlamaNativeEnabled,
		"nativeReady":   l.UsesNative(),
		"available":     l.IsAvailable(),
		"hint":          l.statusHint(),
	}
}

func (l *LlamaService) statusHint() string {
	if l.IsAvailable() {
		return "Inference: llama.cpp native (trong process Go)"
	}
	if !l.ModelOnDisk() {
		return "Thiếu file GGUF. Chạy scripts/download-ai-local-models.sh 8gb trên server."
	}
	if l.cfg.AI.LlamaNativeEnabled && !l.UsesNative() {
		return "Native chưa link — cần binary build với -tags llamacpp (scripts/build-go-linux-native.sh)."
	}
	return "Bật AI_LOCAL_LLAMA_NATIVE_ENABLED=true và deploy binary native."
}

func StreamingModelLabel(cfg config.AppConfig, llama *LlamaService) string {
	if llama != nil && llama.UsesNative() {
		return "llama.cpp-native"
	}
	return "local_provider"
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
