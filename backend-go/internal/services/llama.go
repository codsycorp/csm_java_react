package services

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"csm_server/backend-go/internal/config"
)

const (
	LocalProviderUnavailableCode = "LOCAL_PROVIDER_UNAVAILABLE"
)

type LlamaService struct {
	cfg    config.AppConfig
	client *http.Client
	native *llamaNativeBackend
}

func NewLlamaService(cfg config.AppConfig, client *http.Client) *LlamaService {
	native := newLlamaNativeBackend(cfg)
	if native.ready() {
		log.Printf("LlamaService: native in-process llama.cpp enabled (%s)", cfg.AI.LlamaModelPath)
	} else if cfg.AI.LlamaNativeEnabled {
		log.Printf("LlamaService: native unavailable — HTTP sidecar fallback (%s)", cfg.AI.LlamaServerURL)
	}
	return &LlamaService{cfg: cfg, client: client, native: native}
}

func (l *LlamaService) Shutdown() {
	if l.native != nil {
		l.native.shutdown()
	}
}

func (l *LlamaService) UsesNative() bool {
	return l.native != nil && l.native.ready()
}

// IsAvailable reports whether inference can run now (native engine or llama-server sidecar).
// A GGUF file on disk alone is not enough — the CI/static binary has no in-process llama
// unless built with -tags llamacpp, and HTTP mode requires a reachable sidecar.
func (l *LlamaService) IsAvailable() bool {
	return l.UsesNative() || l.serverReachable()
}

func (l *LlamaService) ModelOnDisk() bool {
	return l.modelExists()
}

func (l *LlamaService) SidecarReachable() bool {
	return l.serverReachable()
}

func (l *LlamaService) modelExists() bool {
	if l.cfg.AI.LlamaModelPath == "" {
		return false
	}
	info, err := os.Stat(l.cfg.AI.LlamaModelPath)
	return err == nil && !info.IsDir()
}

func (l *LlamaService) serverReachable() bool {
	base := strings.TrimRight(l.completionBaseURL(), "/")
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/health", nil)
	if err != nil {
		return false
	}
	resp, err := l.client.Do(req)
	if err == nil {
		resp.Body.Close()
		return resp.StatusCode >= 200 && resp.StatusCode < 500
	}
	req, err = http.NewRequestWithContext(ctx, http.MethodGet, base+"/", nil)
	if err != nil {
		return false
	}
	resp, err = l.client.Do(req)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 500
}

func (l *LlamaService) Complete(ctx context.Context, prompt string) (string, error) {
	return l.CompleteWithTokens(ctx, prompt, l.cfg.EffectiveLlamaMaxTokens())
}

func (l *LlamaService) CompleteWithTokens(ctx context.Context, prompt string, maxTokens uint32) (string, error) {
	if l.UsesNative() {
		text, err := l.native.complete(prompt, maxTokens)
		if err == nil {
			return CleanLocalModelOutput(text), nil
		}
		log.Printf("LlamaService: native complete failed (%v) — trying sidecar", err)
	}
	return l.completeViaHTTP(ctx, prompt, maxTokens)
}

func (l *LlamaService) StreamCompletion(ctx context.Context, prompt string, onToken func(string) error) error {
	if l.UsesNative() {
		err := l.native.stream(prompt, l.cfg.EffectiveLlamaMaxTokens(), onToken)
		if err == nil {
			return nil
		}
		log.Printf("LlamaService: native stream failed (%v) — trying sidecar", err)
	}
	return l.streamViaHTTP(ctx, prompt, onToken)
}

func (l *LlamaService) completeViaHTTP(ctx context.Context, prompt string, maxTokens uint32) (string, error) {
	if !l.serverReachable() {
		return "", fmt.Errorf("llama-server sidecar unreachable at %s", l.completionBaseURL())
	}
	nPredict := int(maxTokens)
	if nPredict <= 0 {
		nPredict = -1
	}
	body := map[string]any{
		"prompt":      prompt,
		"n_predict":   nPredict,
		"stream":      false,
		"temperature": 0.2,
	}
	payload, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, l.completionBaseURL()+"/completion", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := l.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	text, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("llama HTTP %d: %s", resp.StatusCode, truncate(string(text), 500))
	}
	var parsed map[string]any
	if json.Unmarshal(text, &parsed) != nil {
		return strings.TrimSpace(string(text)), nil
	}
	if content, ok := parsed["content"].(string); ok {
		return content, nil
	}
	return strings.TrimSpace(string(text)), nil
}

func (l *LlamaService) streamViaHTTP(ctx context.Context, prompt string, onToken func(string) error) error {
	if !l.serverReachable() {
		return fmt.Errorf("llama-server sidecar unreachable at %s", l.completionBaseURL())
	}
	body := map[string]any{
		"prompt":      prompt,
		"n_predict":   int(l.cfg.EffectiveLlamaMaxTokens()),
		"stream":      true,
		"temperature": 0.2,
	}
	payload, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, l.completionBaseURL()+"/completion", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := l.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		text, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("llama stream HTTP %d: %s", resp.StatusCode, truncate(string(text), 500))
	}
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || line == "data: [DONE]" {
			continue
		}
		line = strings.TrimPrefix(line, "data: ")
		var chunk map[string]any
		if json.Unmarshal([]byte(line), &chunk) != nil {
			continue
		}
		content, _ := chunk["content"].(string)
		if content == "" {
			continue
		}
		if err := onToken(content); err != nil {
			return err
		}
	}
	return scanner.Err()
}

func (l *LlamaService) completionBaseURL() string {
	base := strings.TrimSpace(l.cfg.AI.LlamaServerURL)
	if base == "" {
		base = "http://127.0.0.1:8888"
	}
	base = strings.TrimRight(base, "/")
	if strings.HasSuffix(base, "/v1/chat/completions") {
		base = strings.TrimSuffix(base, "/v1/chat/completions")
	}
	if strings.HasSuffix(base, "/completion") {
		base = strings.TrimSuffix(base, "/completion")
	}
	return base
}

func LocalUnavailableMessage() string {
	return "Local AI provider chưa sẵn sàng"
}

func LocalUnavailableHint() string {
	return "Cần binary build -tags llamacpp (AI_LOCAL_LLAMA_NATIVE_ENABLED=true) hoặc chạy llama-server tại AI_LOCAL_LLAMA_SERVER_URL (mặc định :8888)"
}

func StreamingModelLabel(cfg config.AppConfig, llama *LlamaService) string {
	if llama != nil && llama.UsesNative() {
		return "llama.cpp-native"
	}
	if llama != nil && llama.IsAvailable() {
		return "llama.cpp-sidecar"
	}
	return "local_provider"
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
