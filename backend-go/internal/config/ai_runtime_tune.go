package config

import (
	"log"
	"os"
	"runtime"
)

type aiRuntimeProfile struct {
	name           string
	ctx            uint32
	batch          uint32
	maxTokens      uint32
	maxPromptChars int
	threads        int32
}

// ApplyAIRuntimeAutoTune fills unset AI_LOCAL_LLAMA_* knobs from detected RAM/CPU.
// Explicit env vars always win. Default on (AI_LOCAL_RUNTIME_AUTO_TUNE=true).
func ApplyAIRuntimeAutoTune(cfg *AppConfig) {
	if cfg == nil || !envFlagTrue("AI_LOCAL_RUNTIME_AUTO_TUNE", true) {
		return
	}
	if !cfg.AI.LlamaNativeEnabled {
		return
	}
	ramGiB := detectSystemRAMGiB()
	cpus := runtime.NumCPU()
	if cpus < 1 {
		cpus = 1
	}
	p := pickAIRuntimeProfile(ramGiB, cpus)
	if _, ok := os.LookupEnv("AI_LOCAL_LLAMA_CONTEXT_WINDOW"); !ok && p.ctx > 0 {
		cfg.AI.LlamaContextWindow = p.ctx
	}
	if _, ok := os.LookupEnv("AI_LOCAL_LLAMA_BATCH_SIZE"); !ok && p.batch > 0 {
		cfg.AI.LlamaBatchSize = p.batch
	}
	if _, ok := os.LookupEnv("AI_LOCAL_LLAMA_MAX_TOKENS"); !ok && p.maxTokens > 0 {
		cfg.AI.LlamaMaxTokens = p.maxTokens
	}
	if _, ok := os.LookupEnv("AI_LOCAL_LLAMA_MAX_PROMPT_CHARS"); !ok && p.maxPromptChars > 0 {
		cfg.AI.LlamaMaxPromptChars = p.maxPromptChars
	}
	if _, ok := os.LookupEnv("AI_LOCAL_LLAMA_THREADS"); !ok && p.threads > 0 {
		cfg.AI.LlamaThreads = p.threads
	}
	log.Printf(
		"AI runtime auto-tune: profile=%s ram=%.1fGiB cpu=%d ctx=%d batch=%d maxTok=%d maxPromptChars=%d threads=%d",
		p.name, ramGiB, cpus,
		cfg.AI.LlamaContextWindow, cfg.AI.LlamaBatchSize, cfg.AI.LlamaMaxTokens,
		cfg.AI.LlamaMaxPromptChars, cfg.AI.LlamaThreads,
	)
}

func pickAIRuntimeProfile(ramGiB float64, cpus int) aiRuntimeProfile {
	switch {
	case ramGiB < 9:
		return aiRuntimeProfile{
			name: "weak-8gb", ctx: 8192, batch: 512, maxTokens: 1024,
			maxPromptChars: 24_000, threads: int32(clampInt(cpus, 2, 4)),
		}
	case ramGiB < 17:
		// batch == ctx: go-nativeml prefill is single-batch; avoids SIGABRT on 16GB class machines.
		return aiRuntimeProfile{
			name: "balanced-16gb", ctx: 8192, batch: 8192, maxTokens: 2048,
			maxPromptChars: 48_000, threads: int32(clampInt(cpus, 4, 6)),
		}
	case ramGiB < 32:
		return aiRuntimeProfile{
			name: "strong-24gb", ctx: 16384, batch: 16384, maxTokens: 4096,
			maxPromptChars: 96_000, threads: int32(clampInt(cpus, 4, 8)),
		}
	default:
		return aiRuntimeProfile{
			name: "max-32gb+", ctx: 32768, batch: 32768, maxTokens: 8192,
			maxPromptChars: 200_000, threads: int32(clampInt(cpus, 6, 12)),
		}
	}
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
