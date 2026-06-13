package services

import (
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// verifySidecarBinary ensures the binary runs on this host (Ubuntu 20.04 / glibc 2.31).
func verifySidecarBinary(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return fmt.Errorf("empty path")
	}
	for _, args := range [][]string{{"--version"}, {"--help"}, {"-h"}} {
		cmd := exec.Command(path, args...)
		out, err := cmd.CombinedOutput()
		combined := strings.TrimSpace(string(out))
		if err == nil {
			return nil
		}
		lower := strings.ToLower(combined + " " + err.Error())
		if strings.Contains(lower, "glibc") ||
			strings.Contains(lower, "not found") ||
			strings.Contains(lower, "no such file") ||
			strings.Contains(lower, "cannot execute") {
			return fmt.Errorf("incompatible with this OS: %s", truncateSidecarLog(combined, 300))
		}
	}
	return fmt.Errorf("llama-server smoke test failed for %s", path)
}

func truncateSidecarLog(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max]
}

// buildSidecarFromSource compiles llama-server on the host (Ubuntu 20.04 when prebuilts need glibc 2.32+).
func buildSidecarFromSource(target string) error {
	if _, err := exec.LookPath("git"); err != nil {
		return fmt.Errorf("git not found")
	}
	if _, err := exec.LookPath("g++"); err != nil {
		return fmt.Errorf("g++ not found")
	}

	workDir := filepath.Join(filepath.Dir(target), ".llama-build")
	_ = os.RemoveAll(workDir)
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return err
	}

	tag := strings.TrimSpace(os.Getenv("LLAMA_CPP_BUILD_TAG"))
	if tag == "" {
		tag = "b4895"
	}

	log.Printf("LlamaManaged: building llama-server from source (%s) — may take several minutes", tag)
	clone := exec.Command("git", "clone", "--depth", "1", "--branch", tag,
		"https://github.com/ggml-org/llama.cpp.git", workDir)
	if out, err := clone.CombinedOutput(); err != nil {
		return fmt.Errorf("git clone: %w (%s)", err, truncateSidecarLog(string(out), 200))
	}

	buildDir := filepath.Join(workDir, "build")
	var built string

	if _, err := exec.LookPath("cmake"); err == nil {
		cmakeCfg := exec.Command("cmake", workDir,
			"-B", buildDir,
			"-DCMAKE_BUILD_TYPE=Release",
			"-DLLAMA_BUILD_SERVER=ON",
			"-DBUILD_SHARED_LIBS=OFF",
		)
		cmakeCfg.Dir = workDir
		if out, err := cmakeCfg.CombinedOutput(); err != nil {
			log.Printf("LlamaManaged: cmake configure failed: %s", truncateSidecarLog(string(out), 400))
		} else {
			jobs := "2"
			if n := os.Getenv("LLAMA_CPP_BUILD_JOBS"); n != "" {
				jobs = n
			}
			cmakeBuild := exec.Command("cmake", "--build", buildDir, "--target", "llama-server", "-j", jobs)
			if out, err := cmakeBuild.CombinedOutput(); err != nil {
				log.Printf("LlamaManaged: cmake build failed: %s", truncateSidecarLog(string(out), 400))
			} else {
				for _, candidate := range []string{
					filepath.Join(buildDir, "bin", "llama-server"),
					filepath.Join(buildDir, "llama-server"),
				} {
					if info, statErr := os.Stat(candidate); statErr == nil && !info.IsDir() {
						built = candidate
						break
					}
				}
			}
		}
	}

	if built == "" {
		makeCmd := exec.Command("make", "-j", "2", "llama-server")
		makeCmd.Dir = workDir
		makeCmd.Env = append(os.Environ(), "LLAMA_SERVER=1")
		if out, err := makeCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("make llama-server: %w (%s)", err, truncateSidecarLog(string(out), 300))
		}
		for _, candidate := range []string{
			filepath.Join(workDir, "llama-server"),
			filepath.Join(workDir, "build", "bin", "llama-server"),
		} {
			if info, statErr := os.Stat(candidate); statErr == nil && !info.IsDir() {
				built = candidate
				break
			}
		}
	}

	if built == "" {
		return fmt.Errorf("build finished but llama-server binary not found under %s", workDir)
	}

	src, err := os.Open(built)
	if err != nil {
		return err
	}
	defer src.Close()

	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	dst, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		return err
	}
	if err := dst.Close(); err != nil {
		return err
	}
	log.Printf("LlamaManaged: built llama-server → %s", target)
	return verifySidecarBinary(target)
}

func sidecarStartArgSets(model, host string, port, ctxSize int, threads int32) [][]string {
	base := []string{
		"-m", model,
		"--host", host,
		"--port", fmt.Sprintf("%d", port),
		"-c", fmt.Sprintf("%d", ctxSize),
		"-t", fmt.Sprintf("%d", threads),
	}
	return [][]string{
		base,
		append(append([]string{}, base...), "--parallel", "1"),
	}
}
