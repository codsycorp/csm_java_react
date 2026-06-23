package embeddings

import (
	"context"
	"strings"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/platform/metrics"
)

// LlamaEmbedder is implemented by services.LlamaService.
type LlamaEmbedder interface {
	Embed(ctx context.Context, text string) ([]float32, error)
}

// Provider selects hash vs llama embeddings with automatic fallback.
type Provider struct {
	cfg    config.AppConfig
	llama  LlamaEmbedder
	dim    int
}

func NewProvider(cfg config.AppConfig, llama LlamaEmbedder) *Provider {
	dim := cfg.Platform.EmbeddingDimensions
	if dim <= 0 {
		dim = 384
	}
	return &Provider{cfg: cfg, llama: llama, dim: dim}
}

func (p *Provider) Embed(ctx context.Context, text string) ([]float32, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return make([]float32, p.dim), nil
	}
	mode := strings.ToLower(p.cfg.Platform.EmbeddingProvider)
	if mode == "" {
		mode = "auto"
	}
	switch mode {
	case "hash":
		return data.HashEmbed(text, p.dim), nil
	case "llama":
		return p.embedLlama(ctx, text)
	default: // auto
		if vec, err := p.embedLlama(ctx, text); err == nil && len(vec) > 0 {
			return vec, nil
		}
		return data.HashEmbed(text, p.dim), nil
	}
}

func (p *Provider) embedLlama(ctx context.Context, text string) ([]float32, error) {
	if p.llama == nil {
		return nil, context.Canceled
	}
	start := time.Now()
	vec, err := p.llama.Embed(ctx, text)
	if err != nil {
		metrics.ObserveLlama("embed_error", time.Since(start))
		return nil, err
	}
	metrics.ObserveLlama("embed_ok", time.Since(start))
	return vec, nil
}

// EmbedFunc adapts Provider to chromem-go embedding function signature.
func (p *Provider) EmbedFunc(ctx context.Context, text string) ([]float32, error) {
	return p.Embed(ctx, text)
}
