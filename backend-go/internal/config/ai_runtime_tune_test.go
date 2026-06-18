package config

import (
	"os"
	"testing"
)

func TestApplyAIRuntimeAutoTuneRespectsExplicitEnv(t *testing.T) {
	t.Setenv("AI_LOCAL_RUNTIME_AUTO_TUNE", "true")
	t.Setenv("AI_LOCAL_LLAMA_CONTEXT_WINDOW", "4096")
	t.Setenv("AI_LOCAL_LLAMA_BATCH_SIZE", "512")
	cfg := AppConfig{AI: AIConfig{
		LlamaNativeEnabled: true,
		LlamaContextWindow: 4096,
		LlamaBatchSize:     512,
	}}
	beforeTok := cfg.AI.LlamaMaxTokens
	ApplyAIRuntimeAutoTune(&cfg)
	if cfg.AI.LlamaContextWindow != 4096 {
		t.Fatalf("explicit ctx should win, got %d", cfg.AI.LlamaContextWindow)
	}
	if cfg.AI.LlamaBatchSize != 512 {
		t.Fatalf("explicit batch should win, got %d", cfg.AI.LlamaBatchSize)
	}
	if beforeTok == 0 && cfg.AI.LlamaMaxTokens == 0 {
		t.Fatal("expected auto-tune to fill max tokens when env unset")
	}
}

func TestApplyAIRuntimeAutoTuneFillsUnset(t *testing.T) {
	t.Setenv("AI_LOCAL_RUNTIME_AUTO_TUNE", "true")
	_ = os.Unsetenv("AI_LOCAL_LLAMA_CONTEXT_WINDOW")
	_ = os.Unsetenv("AI_LOCAL_LLAMA_BATCH_SIZE")
	_ = os.Unsetenv("AI_LOCAL_LLAMA_MAX_TOKENS")
	_ = os.Unsetenv("AI_LOCAL_LLAMA_MAX_PROMPT_CHARS")
	_ = os.Unsetenv("AI_LOCAL_LLAMA_THREADS")
	cfg := AppConfig{AI: AIConfig{LlamaNativeEnabled: true}}
	ApplyAIRuntimeAutoTune(&cfg)
	if cfg.AI.LlamaContextWindow < 8192 {
		t.Fatalf("expected tuned ctx >= 8192, got %d", cfg.AI.LlamaContextWindow)
	}
	if cfg.AI.LlamaBatchSize == 0 {
		t.Fatal("expected batch tuned")
	}
}
