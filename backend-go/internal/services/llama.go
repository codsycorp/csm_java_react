package services

import (
	"context"
	"fmt"
	"log"
	"os"
	"runtime"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/platform/circuitbreaker"
	"csm_server/backend-go/internal/platform/metrics"
)

const (
	LocalProviderUnavailableCode = "LOCAL_PROVIDER_UNAVAILABLE"
)

type LlamaService struct {
	cfg     config.AppConfig
	backend llamaInferenceBackend
	breaker *circuitbreaker.Breaker
}

func NewLlamaService(cfg config.AppConfig) *LlamaService {
	backend := newLlamaInferenceBackend(cfg)
	svc := &LlamaService{
		cfg:     cfg,
		backend: backend,
		breaker: circuitbreaker.New(
			cfg.Platform.LlamaBreakerFailures,
			time.Duration(cfg.Platform.LlamaBreakerCooldownMs)*time.Millisecond,
		),
	}
	switch {
	case backend.ready():
		log.Printf("LlamaService: %s enabled (%s)", backend.providerLabel(), cfg.AI.LlamaModelPath)
	case cfg.AI.LlamaNativeEnabled && svc.modelExists():
		log.Printf("LlamaService: model on disk but native unavailable — rebuild with go build -tags llamacpp (%s)", cfg.AI.LlamaModelPath)
	case cfg.AI.LlamaNativeEnabled && cfg.AI.LlamaModelPath != "":
		log.Printf("LlamaService: GGUF missing at %s — run: APP_DATA_DIR=<data> ./scripts/download-ai-local-models.sh 8gb", cfg.AI.LlamaModelPath)
	case !cfg.AI.LlamaNativeEnabled:
		log.Printf("LlamaService: AI_LOCAL_LLAMA_NATIVE_ENABLED=false")
	default:
		log.Printf("LlamaService: local AI not configured (set AI_LOCAL_LLAMA_MODEL_PATH)")
	}
	return svc
}

func (l *LlamaService) Shutdown() {
	if l.backend != nil {
		l.backend.shutdown()
	}
}

func (l *LlamaService) UsesNative() bool {
	return l.backend != nil && l.backend.ready()
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
	start := time.Now()
	var text string
	err := l.breaker.Run(func() error {
		var e error
		text, e = l.backend.complete(prompt, maxTokens)
		return e
	})
	if err != nil {
		metrics.ObserveLlama("error", time.Since(start))
		return "", err
	}
	metrics.ObserveLlama("ok", time.Since(start))
	return CleanLocalModelOutput(text), nil
}

func (l *LlamaService) IsModelLoaded() bool {
	return l.backend != nil && l.backend.isLoaded()
}

func (l *LlamaService) StreamCompletion(ctx context.Context, prompt string, onToken func(string) error) error {
	return l.StreamCompletionWithTokens(ctx, prompt, l.cfg.EffectiveLlamaMaxTokens(), onToken)
}

func (l *LlamaService) StreamCompletionWithTokens(ctx context.Context, prompt string, maxTokens uint32, onToken func(string) error) error {
	if !l.UsesNative() {
		return fmt.Errorf("%s: %s", LocalProviderUnavailableCode, l.statusHint())
	}
	start := time.Now()
	err := l.breaker.Run(func() error {
		return l.backend.stream(prompt, maxTokens, onToken)
	})
	if err != nil {
		metrics.ObserveLlama("stream_error", time.Since(start))
		return err
	}
	metrics.ObserveLlama("stream_ok", time.Since(start))
	return nil
}

// Embed returns a vector for RAG when the model supports embeddings.
func (l *LlamaService) Embed(ctx context.Context, text string) ([]float32, error) {
	if !l.UsesNative() || l.backend == nil {
		return nil, fmt.Errorf("%s: %s", LocalProviderUnavailableCode, l.statusHint())
	}
	start := time.Now()
	var vec []float32
	err := l.breaker.Run(func() error {
		var e error
		vec, e = l.backend.embed(text)
		return e
	})
	if err != nil {
		metrics.ObserveLlama("embed_error", time.Since(start))
		return nil, err
	}
	metrics.ObserveLlama("embed_ok", time.Since(start))
	return vec, nil
}

func LocalUnavailableMessage() string {
	return "Local AI provider chưa sẵn sàng"
}

func LocalUnavailableHint() string {
	if runtime.GOOS == "darwin" {
		return "Dev Mac: ./backend-go/run-go-server.sh hoặc ./scripts/build-go-darwin-native.sh rồi restart. Cần go build -tags llamacpp (CGO_ENABLED=1)."
	}
	return "Build với scripts/build-go-linux-native.sh (-tags llamacpp). Kiểm tra: journalctl -u csm-go | grep LlamaNative"
}

func (l *LlamaService) StatusSummary() map[string]any {
	return map[string]any{
		"modelOnDisk":   l.ModelOnDisk(),
		"modelPath":     l.cfg.AI.LlamaModelPath,
		"nativeEnabled": l.cfg.AI.LlamaNativeEnabled,
		"nativeReady":   l.UsesNative(),
		"provider":      providerLabelOrEmpty(l.backend),
		"available":     l.IsAvailable(),
		"hint":          l.statusHint(),
	}
}

func (l *LlamaService) statusHint() string {
	if l.IsAvailable() {
		if l.backend != nil && l.backend.providerLabel() == "llama.cpp-isolated" {
			return "Inference: llama.cpp isolated worker (SIGABRT không làm thoát HTTP server)"
		}
		return "Inference: llama.cpp native (trong process Go)"
	}
	if !l.ModelOnDisk() {
		return "Thiếu file GGUF. Chạy scripts/download-ai-local-models.sh 8gb trên server (1.5B Q8_0)."
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

func providerLabelOrEmpty(b llamaInferenceBackend) string {
	if b == nil {
		return ""
	}
	return b.providerLabel()
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
