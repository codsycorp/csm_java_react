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
	cfg     config.AppConfig
	client  *http.Client
	native  *llamaNativeBackend
	managed *managedSidecar
}

func NewLlamaService(cfg config.AppConfig, client *http.Client) *LlamaService {
	native := newLlamaNativeBackend(cfg)
	svc := &LlamaService{cfg: cfg, client: client, native: native}
	if native.ready() {
		log.Printf("LlamaService: native in-process llama.cpp enabled (%s)", cfg.AI.LlamaModelPath)
		return svc
	}
	if cfg.AI.LlamaManagedSidecar {
		svc.managed = newManagedSidecar(cfg, svc.serverReachable)
		if svc.modelExists() {
			log.Printf("LlamaService: managed llama-server (child process, no separate systemd unit)")
			svc.managed.startAsync()
		} else if cfg.AI.LlamaNativeEnabled {
			log.Printf("LlamaService: managed sidecar waiting for model at %s", cfg.AI.LlamaModelPath)
		}
	} else if cfg.AI.LlamaNativeEnabled {
		log.Printf("LlamaService: external sidecar expected at %s", cfg.AI.LlamaServerURL)
	}
	return svc
}

func (l *LlamaService) Shutdown() {
	if l.managed != nil {
		l.managed.stop()
	}
	if l.native != nil {
		l.native.shutdown()
	}
}

func (l *LlamaService) UsesManagedSidecar() bool {
	return l.managed != nil && l.managed.running()
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
	return "csm-go tự khởi động llama-server khi AI_LOCAL_LLAMA_MANAGED_SIDECAR=true (mặc định). Kiểm tra: journalctl -u csm-go | grep LlamaManaged"
}

func (l *LlamaService) StatusSummary() map[string]any {
	return map[string]any{
		"modelOnDisk":       l.ModelOnDisk(),
		"modelPath":         l.cfg.AI.LlamaModelPath,
		"nativeEnabled":     l.cfg.AI.LlamaNativeEnabled,
		"nativeReady":       l.UsesNative(),
		"managedSidecar":    l.cfg.AI.LlamaManagedSidecar,
		"managedRunning":    l.UsesManagedSidecar(),
		"sidecarURL":        l.completionBaseURL(),
		"sidecarReachable":  l.SidecarReachable(),
		"available":         l.IsAvailable(),
		"hint":              l.statusHint(),
	}
}

func (l *LlamaService) statusHint() string {
	if l.IsAvailable() {
		if l.UsesNative() {
			return "Inference: llama.cpp native (trong process Go)"
		}
		if l.UsesManagedSidecar() {
			return "Inference: llama-server do csm-go quản lý tại " + l.completionBaseURL()
		}
		return "Inference: llama-server external tại " + l.completionBaseURL()
	}
	if !l.ModelOnDisk() {
		return "Thiếu file GGUF. Chạy scripts/download-ai-local-models.sh 8gb trên server."
	}
	if l.cfg.AI.LlamaManagedSidecar {
		return "Model có trên disk — csm-go đang tải/build llama-server tương thích Ubuntu 20.04 (journalctl -u csm-go | grep LlamaManaged, ~2–6 phút)."
	}
	return "Bật AI_LOCAL_LLAMA_MANAGED_SIDECAR=true hoặc chạy llama-server tại " + l.completionBaseURL()
}

func StreamingModelLabel(cfg config.AppConfig, llama *LlamaService) string {
	if llama != nil && llama.UsesNative() {
		return "llama.cpp-native"
	}
	if llama != nil && llama.UsesManagedSidecar() {
		return "llama.cpp-managed"
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
