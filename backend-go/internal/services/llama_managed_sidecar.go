package services

import (
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"csm_server/backend-go/internal/config"
)

// managedSidecar runs llama-server as a child process of csm-go (no separate systemd unit).
// This is the recommended mode on Ubuntu 20.04 where in-process CGO llamacpp is unavailable.
type managedSidecar struct {
	cfg           config.AppConfig
	reachable     func() bool
	mu            sync.Mutex
	cmd           *exec.Cmd
	startedByUs   bool
	started       bool
	startErr      error
}

func newManagedSidecar(cfg config.AppConfig, reachable func() bool) *managedSidecar {
	return &managedSidecar{cfg: cfg, reachable: reachable}
}

func (m *managedSidecar) startAsync() {
	if m == nil || !m.cfg.AI.LlamaManagedSidecar {
		return
	}
	go func() {
		if err := m.ensureStarted(); err != nil {
			log.Printf("LlamaManaged: start failed: %v", err)
		}
	}()
}

func (m *managedSidecar) ensureStarted() error {
	if m == nil {
		return nil
	}
	m.mu.Lock()
	if m.started {
		err := m.startErr
		m.mu.Unlock()
		return err
	}
	m.mu.Unlock()

	if m.reachable != nil && m.reachable() {
		log.Printf("LlamaManaged: sidecar already reachable at %s", m.cfg.AI.LlamaServerURL)
		m.mu.Lock()
		m.started = true
		m.mu.Unlock()
		return nil
	}

	bin, err := resolveSidecarBinary(m.cfg)
	if err != nil {
		m.mu.Lock()
		m.started = true
		m.startErr = err
		m.mu.Unlock()
		return err
	}
	model := m.cfg.AI.LlamaModelPath
	if model == "" {
		err := fmt.Errorf("AI_LOCAL_LLAMA_MODEL_PATH is empty")
		m.mu.Lock()
		m.started = true
		m.startErr = err
		m.mu.Unlock()
		return err
	}
	if info, statErr := os.Stat(model); statErr != nil || info.IsDir() {
		err := fmt.Errorf("model not found: %s", model)
		m.mu.Lock()
		m.started = true
		m.startErr = err
		m.mu.Unlock()
		return err
	}

	host, port := sidecarHostPort(m.cfg)
	threads := m.cfg.AI.LlamaThreads
	if threads <= 0 {
		threads = 3
	}
	ctxSize := m.cfg.EffectiveLlamaContextWindow()

	args := []string{
		"-m", model,
		"--host", host,
		"--port", strconv.Itoa(port),
		"-c", strconv.FormatUint(uint64(ctxSize), 10),
		"-t", strconv.FormatInt(int64(threads), 10),
		"--parallel", "1",
	}

	cmd := exec.Command(bin, args...)
	cmd.Dir = filepath.Dir(model)
	cmd.Stdout = io.Writer(logWriter("llama-server"))
	cmd.Stderr = io.Writer(logWriter("llama-server"))
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	log.Printf("LlamaManaged: starting %s %s", bin, strings.Join(args, " "))
	if err := cmd.Start(); err != nil {
		m.mu.Lock()
		m.started = true
		m.startErr = err
		m.mu.Unlock()
		return err
	}

	m.mu.Lock()
	m.cmd = cmd
	m.startedByUs = true
	m.mu.Unlock()

	go m.waitProcess()

	if err := waitSidecarHTTP(m.cfg, m.reachable, 180*time.Second); err != nil {
		m.stop()
		m.mu.Lock()
		m.started = true
		m.startErr = err
		m.mu.Unlock()
		return err
	}

	log.Printf("LlamaManaged: ready at http://%s:%d", host, port)
	m.mu.Lock()
	m.started = true
	m.mu.Unlock()
	return nil
}

func (m *managedSidecar) waitProcess() {
	m.mu.Lock()
	cmd := m.cmd
	m.mu.Unlock()
	if cmd == nil {
		return
	}
	err := cmd.Wait()
	if err != nil {
		log.Printf("LlamaManaged: llama-server exited: %v", err)
	}
	m.mu.Lock()
	if m.cmd == cmd {
		m.cmd = nil
		m.startedByUs = false
	}
	m.mu.Unlock()
}

func (m *managedSidecar) stop() {
	if m == nil {
		return
	}
	m.mu.Lock()
	cmd := m.cmd
	startedByUs := m.startedByUs
	m.cmd = nil
	m.startedByUs = false
	m.mu.Unlock()
	if cmd == nil || !startedByUs || cmd.Process == nil {
		return
	}
	log.Printf("LlamaManaged: stopping llama-server (pid %d)", cmd.Process.Pid)
	_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
	done := make(chan struct{})
	go func() {
		_ = cmd.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(8 * time.Second):
		_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
}

func (m *managedSidecar) running() bool {
	if m == nil {
		return false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.startedByUs && m.cmd != nil && m.cmd.Process != nil
}

func resolveSidecarBinary(cfg config.AppConfig) (string, error) {
	candidates := []string{
		strings.TrimSpace(cfg.AI.LlamaServerBin),
		filepath.Join(cfg.DataDir, "bin", "llama-server"),
		"/usr/local/bin/llama-server",
	}
	if home := strings.TrimSpace(os.Getenv("CSM_HOME")); home != "" {
		candidates = append(candidates, filepath.Join(home, "csm_datas", "bin", "llama-server"))
	}
	if path, err := exec.LookPath("llama-server"); err == nil {
		candidates = append(candidates, path)
	}
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("llama-server binary not found (set AI_LOCAL_LLAMA_SERVER_BIN or run setup-llama-server-sidecar.sh --binary-only)")
}

func sidecarHostPort(cfg config.AppConfig) (string, int) {
	if cfg.AI.LlamaServerPort > 0 {
		return "127.0.0.1", cfg.AI.LlamaServerPort
	}
	base := strings.TrimSpace(cfg.AI.LlamaServerURL)
	if base == "" {
		return "127.0.0.1", 8888
	}
	if !strings.Contains(base, "://") {
		base = "http://" + base
	}
	u, err := url.Parse(base)
	if err != nil || u.Host == "" {
		return "127.0.0.1", 8888
	}
	host := u.Hostname()
	if host == "" {
		host = "127.0.0.1"
	}
	port := 8888
	if p := u.Port(); p != "" {
		if n, convErr := strconv.Atoi(p); convErr == nil {
			port = n
		}
	}
	return host, port
}

func waitSidecarHTTP(cfg config.AppConfig, reachable func() bool, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if reachable != nil && reachable() {
			return nil
		}
		time.Sleep(2 * time.Second)
	}
	host, port := sidecarHostPort(cfg)
	return fmt.Errorf("sidecar not healthy after %s (http://%s:%d)", timeout, host, port)
}

type logWriter string

func (p logWriter) Write(b []byte) (int, error) {
	text := strings.TrimSpace(string(b))
	if text != "" {
		log.Printf("%s: %s", string(p), text)
	}
	return len(b), nil
}
