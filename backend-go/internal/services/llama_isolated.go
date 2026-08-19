package services

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"csm_server/backend-go/internal/config"
)

const llamaWorkerReadyTimeout = 120 * time.Second
const llamaWorkerRequestTimeout = 15 * time.Minute

type llamaWorkerRequest struct {
	ID        uint64 `json:"id"`
	Op        string `json:"op"`
	Prompt    string `json:"prompt,omitempty"`
	MaxTokens uint32 `json:"maxTokens,omitempty"`
}

type llamaWorkerResponse struct {
	ID    uint64 `json:"id"`
	OK    bool   `json:"ok"`
	Text  string `json:"text,omitempty"`
	Token string `json:"token,omitempty"`
	Done  bool   `json:"done,omitempty"`
	Error string `json:"error,omitempty"`
	Ready bool   `json:"ready,omitempty"`
	Count int    `json:"count,omitempty"`
}

type llamaIsolatedBackend struct {
	cfg    config.AppConfig
	mu     sync.Mutex
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout *bufio.Scanner
	seq    atomic.Uint64
	loaded bool
}

func newLlamaIsolatedBackend(cfg config.AppConfig) (*llamaIsolatedBackend, error) {
	b := &llamaIsolatedBackend{cfg: cfg}
	if err := b.startWorker(); err != nil {
		return nil, err
	}
	return b, nil
}

func (b *llamaIsolatedBackend) ready() bool {
	if b == nil || !b.cfg.AI.LlamaNativeEnabled || b.cfg.AI.LlamaModelPath == "" {
		return false
	}
	if _, err := os.Stat(b.cfg.AI.LlamaModelPath); err != nil {
		return false
	}
	return true
}

func (b *llamaIsolatedBackend) providerLabel() string {
	return "llama.cpp-isolated"
}

func (b *llamaIsolatedBackend) isLoaded() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.loaded
}

func (b *llamaIsolatedBackend) startWorker() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	cmd := exec.Command(exe)
	cmd.Env = workerEnvFrom(os.Environ())
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		return err
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		return err
	}
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 8*1024*1024)
	deadline := time.Now().Add(llamaWorkerReadyTimeout)
	for time.Now().Before(deadline) {
		if !scanner.Scan() {
			break
		}
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var resp llamaWorkerResponse
		if err := json.Unmarshal([]byte(line), &resp); err != nil {
			continue
		}
		if resp.Ready {
			b.cmd = cmd
			b.stdin = stdin
			b.stdout = scanner
			b.loaded = true
			log.Printf("LlamaIsolated: worker ready (pid=%d)", cmd.Process.Pid)
			return nil
		}
		if resp.Error != "" {
			_ = stdin.Close()
			_ = cmd.Process.Kill()
			return fmt.Errorf("worker startup: %s", resp.Error)
		}
	}
	_ = stdin.Close()
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("worker ready timeout: %w", err)
	}
	return errors.New("worker ready timeout")
}

func workerEnvFrom(parent []string) []string {
	out := make([]string, 0, len(parent)+2)
	for _, kv := range parent {
		if strings.HasPrefix(kv, "CSM_LLAMA_WORKER=") {
			continue
		}
		if strings.HasPrefix(kv, "AI_LOCAL_LLAMA_ISOLATED=") {
			continue
		}
		out = append(out, kv)
	}
	out = append(out, "CSM_LLAMA_WORKER=1", "AI_LOCAL_LLAMA_ISOLATED=false")
	return out
}

func (b *llamaIsolatedBackend) complete(prompt string, maxTokens uint32) (string, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if err := b.ensureWorkerLocked(); err != nil {
		return "", err
	}
	id := b.seq.Add(1)
	req := llamaWorkerRequest{ID: id, Op: "complete", Prompt: prompt, MaxTokens: maxTokens}
	if err := b.writeRequest(req); err != nil {
		return "", err
	}
	resp, err := b.readResponseFor(id, llamaWorkerRequestTimeout, nil)
	if err != nil {
		return "", err
	}
	if !resp.OK {
		if resp.Error != "" {
			return "", errors.New(resp.Error)
		}
		return "", errors.New("llama worker complete failed")
	}
	return resp.Text, nil
}

func (b *llamaIsolatedBackend) tokenCount(text string) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if err := b.ensureWorkerLocked(); err != nil {
		return 0, err
	}
	id := b.seq.Add(1)
	if err := b.writeRequest(llamaWorkerRequest{ID: id, Op: "tokenize", Prompt: text}); err != nil {
		return 0, err
	}
	response, err := b.readResponseFor(id, llamaWorkerRequestTimeout, nil)
	if err != nil {
		return 0, err
	}
	if !response.OK {
		return 0, errors.New(response.Error)
	}
	return response.Count, nil
}

func (b *llamaIsolatedBackend) stream(prompt string, maxTokens uint32, onToken func(string) error) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if err := b.ensureWorkerLocked(); err != nil {
		return err
	}
	id := b.seq.Add(1)
	req := llamaWorkerRequest{ID: id, Op: "stream", Prompt: prompt, MaxTokens: maxTokens}
	if err := b.writeRequest(req); err != nil {
		return err
	}
	_, err := b.readResponseFor(id, llamaWorkerRequestTimeout, onToken)
	return err
}

func (b *llamaIsolatedBackend) writeRequest(req llamaWorkerRequest) error {
	line, err := json.Marshal(req)
	if err != nil {
		return err
	}
	line = append(line, '\n')
	if _, err := b.stdin.Write(line); err != nil {
		b.killWorkerLocked()
		return fmt.Errorf("worker write: %w", err)
	}
	return nil
}

func (b *llamaIsolatedBackend) readResponseFor(id uint64, timeout time.Duration, onToken func(string) error) (llamaWorkerResponse, error) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !b.stdout.Scan() {
			err := b.stdout.Err()
			b.killWorkerLocked()
			if err != nil {
				return llamaWorkerResponse{}, fmt.Errorf("llama worker exited: %w", err)
			}
			return llamaWorkerResponse{}, errors.New("llama worker exited unexpectedly")
		}
		line := strings.TrimSpace(b.stdout.Text())
		if line == "" {
			continue
		}
		var resp llamaWorkerResponse
		if err := json.Unmarshal([]byte(line), &resp); err != nil {
			continue
		}
		if resp.ID != id {
			continue
		}
		if resp.Token != "" && onToken != nil {
			if err := onToken(resp.Token); err != nil {
				return resp, err
			}
			continue
		}
		if resp.Done || resp.Text != "" || resp.Error != "" || !resp.OK {
			return resp, nil
		}
	}
	return llamaWorkerResponse{}, errors.New("llama worker request timeout")
}

func (b *llamaIsolatedBackend) ensureWorkerLocked() error {
	if b.cmd != nil && b.cmd.Process != nil && b.stdin != nil && b.stdout != nil {
		return nil
	}
	b.killWorkerLocked()
	return b.startWorker()
}

func (b *llamaIsolatedBackend) killWorkerLocked() {
	b.loaded = false
	if b.stdin != nil {
		_ = b.stdin.Close()
		b.stdin = nil
	}
	if b.cmd != nil && b.cmd.Process != nil {
		_ = b.cmd.Process.Kill()
		_, _ = b.cmd.Process.Wait()
	}
	b.cmd = nil
	b.stdout = nil
}

func (b *llamaIsolatedBackend) shutdown() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.stdin != nil && b.cmd != nil {
		id := b.seq.Add(1)
		_ = b.writeRequest(llamaWorkerRequest{ID: id, Op: "shutdown"})
	}
	b.killWorkerLocked()
}
