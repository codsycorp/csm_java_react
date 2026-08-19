package services

import (
	"log"
	"os"
	"strings"

	"csm_server/backend-go/internal/config"
)

// llamaInferenceBackend is implemented by in-process native llama and isolated worker proxy.
type llamaInferenceBackend interface {
	ready() bool
	complete(prompt string, maxTokens uint32) (string, error)
	stream(prompt string, maxTokens uint32, onToken func(string) error) error
	tokenCount(text string) (int, error)
	shutdown()
	isLoaded() bool
	providerLabel() string
}

func shouldUseIsolatedLlama() bool {
	if IsLlamaWorkerMode() {
		return false
	}
	return envFlagTrueDefault("AI_LOCAL_LLAMA_ISOLATED", true)
}

func IsLlamaWorkerMode() bool {
	v := strings.TrimSpace(os.Getenv("CSM_LLAMA_WORKER"))
	return v == "1" || v == "true" || v == "yes"
}

func newLlamaInferenceBackend(cfg config.AppConfig) llamaInferenceBackend {
	native := newLlamaNativeBackend(cfg)
	if !shouldUseIsolatedLlama() || !native.ready() {
		return native
	}
	iso, err := newLlamaIsolatedBackend(cfg)
	if err != nil {
		log.Printf("LlamaService: isolated worker failed (%v) — falling back to in-process", err)
		return native
	}
	return iso
}

func envFlagTrueDefault(key string, def bool) bool {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	switch strings.ToLower(v) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return def
	}
}
