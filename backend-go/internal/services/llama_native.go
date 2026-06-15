//go:build llamacpp

package services

import (
	"errors"
	"fmt"
	"log"
	"os"
	"sync"

	"github.com/footprintai/go-nativeml/ggml/llamacpp"

	"csm_server/backend-go/internal/config"
)

var errNativeUnavailable = errors.New("native llama unavailable")

var llamaBackendOnce sync.Once

type llamaNativeBackend struct {
	cfg    config.AppConfig
	mu     sync.Mutex
	model  *llamacpp.Model
	ctx    *llamacpp.Context
	loaded bool
}

func newLlamaNativeBackend(cfg config.AppConfig) *llamaNativeBackend {
	if !cfg.AI.LlamaNativeEnabled {
		return &llamaNativeBackend{cfg: cfg}
	}
	if cfg.AI.LlamaModelPath == "" {
		return &llamaNativeBackend{cfg: cfg}
	}
	if _, err := os.Stat(cfg.AI.LlamaModelPath); err != nil {
		log.Printf("LlamaNative: model not found %s", cfg.AI.LlamaModelPath)
		return &llamaNativeBackend{cfg: cfg}
	}
	n := &llamaNativeBackend{cfg: cfg}
	if cfg.AI.LlamaPreloadOnStartup {
		if err := n.ensureLoaded(); err != nil {
			log.Printf("LlamaNative: preload failed: %v", err)
		}
	}
	return n
}

func (n *llamaNativeBackend) ready() bool {
	if n == nil || n.cfg.AI.LlamaModelPath == "" {
		return false
	}
	if _, err := os.Stat(n.cfg.AI.LlamaModelPath); err != nil {
		return false
	}
	return n.cfg.AI.LlamaNativeEnabled
}

func (n *llamaNativeBackend) providerLabel() string {
	return "llama.cpp-native"
}

func (n *llamaNativeBackend) ensureLoaded() error {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.ensureLoadedLocked()
}

func (n *llamaNativeBackend) ensureLoadedLocked() error {
	if n.loaded {
		return nil
	}
	llamaBackendOnce.Do(func() {
		llamacpp.Init()
	})
	log.Printf("LlamaNative: loading GGUF in-process: %s", n.cfg.AI.LlamaModelPath)
	model, err := llamacpp.LoadModel(
		n.cfg.AI.LlamaModelPath,
		llamacpp.WithGPULayers(int(n.cfg.AI.LlamaGPULayers)),
		llamacpp.WithMMap(n.cfg.AI.LlamaUseMmap),
		llamacpp.WithMLock(n.cfg.AI.LlamaUseMlock),
	)
	if err != nil {
		return fmt.Errorf("load model: %w", err)
	}
	ctx, err := model.NewContext(
		llamacpp.WithContextSize(int(n.cfg.EffectiveLlamaContextWindow())),
		llamacpp.WithBatchSize(int(n.cfg.AI.LlamaBatchSize)),
		llamacpp.WithThreads(int(n.cfg.AI.LlamaThreads)),
	)
	if err != nil {
		model.Close()
		return fmt.Errorf("create context: %w", err)
	}
	n.model = model
	n.ctx = ctx
	n.loaded = true
	log.Printf("LlamaNative: ready (ctx=%d threads=%d gpu_layers=%d mmap=%v)",
		n.cfg.EffectiveLlamaContextWindow(), n.cfg.AI.LlamaThreads, n.cfg.AI.LlamaGPULayers, n.cfg.AI.LlamaUseMmap)
	return nil
}

func (n *llamaNativeBackend) isLoaded() bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.loaded
}

func (n *llamaNativeBackend) complete(prompt string, maxTokens uint32) (string, error) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if err := n.ensureLoadedLocked(); err != nil {
		return "", err
	}
	prompt = truncateNativePrompt(prompt, MaxSafePromptChars(n.cfg))
	max := int(maxTokens)
	if max <= 0 {
		max = int(n.cfg.EffectiveLlamaMaxTokens())
	}
	return n.ctx.Generate(prompt,
		llamacpp.WithMaxTokens(max),
		llamacpp.WithTemperature(0.2),
		llamacpp.WithTopK(40),
		llamacpp.WithTopP(0.95),
	)
}

func (n *llamaNativeBackend) stream(prompt string, maxTokens uint32, onToken func(string) error) error {
	n.mu.Lock()
	defer n.mu.Unlock()
	if err := n.ensureLoadedLocked(); err != nil {
		return err
	}
	prompt = truncateNativePrompt(prompt, MaxSafePromptChars(n.cfg))
	max := int(maxTokens)
	if max <= 0 {
		max = int(n.cfg.EffectiveLlamaMaxTokens())
	}
	return n.ctx.GenerateStream(prompt, func(token string) bool {
		if err := onToken(token); err != nil {
			return false
		}
		return true
	},
		llamacpp.WithMaxTokens(max),
		llamacpp.WithTemperature(0.2),
		llamacpp.WithTopK(40),
		llamacpp.WithTopP(0.95),
	)
}

func (n *llamaNativeBackend) shutdown() {
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.ctx != nil {
		n.ctx.Close()
		n.ctx = nil
	}
	if n.model != nil {
		n.model.Close()
		n.model = nil
	}
	n.loaded = false
}

func truncateNativePrompt(prompt string, maxChars int) string {
	if maxChars <= 0 || len(prompt) <= maxChars {
		return prompt
	}
	return TruncateMiddle(prompt, maxChars)
}
