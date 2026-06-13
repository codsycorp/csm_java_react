package services

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"csm_server/backend-go/internal/config"
)

const sidecarDownloadTimeout = 5 * time.Minute

// Older tags first — prebuilt binaries after ~b6000 often require glibc 2.32+ (Ubuntu 22.04).
var sidecarReleaseTags = []string{
	"b4895", "b5273", "b5892", "b6187", "b7274", "b9562",
}
var sidecarArchiveNames = []string{
	"llama-%s-bin-ubuntu-x64.tar.gz",
	"llama-%s-bin-linux-x64.tar.gz",
	"llama-%s-bin-ubuntu-x64.zip",
}

func sidecarInstallPath(cfg config.AppConfig) string {
	if bin := strings.TrimSpace(cfg.AI.LlamaServerBin); bin != "" {
		return bin
	}
	return filepath.Join(cfg.DataDir, "bin", "llama-server")
}

func findExistingSidecarBinary(cfg config.AppConfig) (string, error) {
	candidates := []string{
		strings.TrimSpace(cfg.AI.LlamaServerBin),
		filepath.Join(cfg.DataDir, "bin", "llama-server"),
		"/usr/local/bin/llama-server",
	}
	if home := strings.TrimSpace(os.Getenv("CSM_HOME")); home != "" {
		candidates = append(candidates, filepath.Join(home, "csm_datas", "bin", "llama-server"))
	}
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		info, err := os.Stat(candidate)
		if err != nil || info.IsDir() {
			continue
		}
		_ = os.Chmod(candidate, 0o755)
		if err := verifySidecarBinary(candidate); err != nil {
			log.Printf("LlamaManaged: removing incompatible binary %s: %v", candidate, err)
			_ = os.Remove(candidate)
			continue
		}
		return candidate, nil
	}
	return "", fmt.Errorf("not found")
}

func bootstrapSidecarBinary(target string) error {
	if info, err := os.Stat(target); err == nil && !info.IsDir() {
		_ = os.Chmod(target, 0o755)
		if err := verifySidecarBinary(target); err == nil {
			return nil
		}
		log.Printf("LlamaManaged: replacing incompatible binary at %s", target)
		_ = os.Remove(target)
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}

	client := &http.Client{Timeout: sidecarDownloadTimeout}
	tagOverride := strings.TrimSpace(os.Getenv("LLAMA_CPP_RELEASE_TAG"))

	var tags []string
	if tagOverride != "" {
		tags = []string{tagOverride}
	} else {
		tags = append([]string{}, sidecarReleaseTags...)
	}

	var lastErr error
	for _, tag := range tags {
		for _, pattern := range sidecarArchiveNames {
			archive := fmt.Sprintf(pattern, tag)
			url := fmt.Sprintf("https://github.com/ggml-org/llama.cpp/releases/download/%s/%s", tag, archive)
			log.Printf("LlamaManaged: downloading %s", url)
			if err := downloadSidecarArchive(client, url, target); err != nil {
				lastErr = err
				log.Printf("LlamaManaged: download failed (%s): %v", archive, err)
				continue
			}
			if err := verifySidecarBinary(target); err != nil {
				lastErr = err
				log.Printf("LlamaManaged: binary from %s incompatible: %v", archive, err)
				_ = os.Remove(target)
				continue
			}
			log.Printf("LlamaManaged: installed llama-server → %s (%s)", target, archive)
			return nil
		}
	}

	log.Printf("LlamaManaged: prebuilt downloads failed (%v) — trying source build", lastErr)
	if err := buildSidecarFromSource(target); err != nil {
		if lastErr == nil {
			lastErr = err
		}
		return fmt.Errorf("bootstrap llama-server: %w", lastErr)
	}
	return nil
}

func downloadSidecarArchive(client *http.Client, url, target string) error {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	tmp, err := os.CreateTemp(filepath.Dir(target), "llama-server-*.download")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)

	if _, err := io.Copy(tmp, resp.Body); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}

	if strings.HasSuffix(strings.ToLower(url), ".zip") {
		return fmt.Errorf("zip archives require unzip on server")
	}

	f, err := os.Open(tmpPath)
	if err != nil {
		return err
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		if filepath.Base(hdr.Name) != "llama-server" {
			continue
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
		if err != nil {
			return err
		}
		if _, err := io.Copy(out, tr); err != nil {
			out.Close()
			return err
		}
		if err := out.Close(); err != nil {
			return err
		}
		return os.Chmod(target, 0o755)
	}
	return fmt.Errorf("llama-server not found in archive")
}
