package services

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"csm_server/backend-go/internal/config"
)

// DiskCleanupConfig holds TTL settings for automatic disk cleanup.
type DiskCleanupConfig struct {
	Enabled        bool
	Interval       time.Duration
	AppImagesDir   string
	RenderTTL      time.Duration // ai-render-*, ai-character-*
	PDFExtractTTL  time.Duration // pdf_extract/*
	PDFReportTTL   time.Duration // *.pdf in app_images
	UploadTTL      time.Duration // uploads/* (original uploads)
	VideoTTL       time.Duration // *.mp4 in app_images
}

// DefaultDiskCleanupConfig returns sensible defaults for production.
func DefaultDiskCleanupConfig(dataDir string) DiskCleanupConfig {
	return DiskCleanupConfig{
		Enabled:       true,
		Interval:      6 * time.Hour,
		AppImagesDir:  filepath.Join(dataDir, "public", "app_images"),
		RenderTTL:     24 * time.Hour,
		PDFExtractTTL: 7 * 24 * time.Hour,
		PDFReportTTL:  30 * 24 * time.Hour,
		UploadTTL:     90 * 24 * time.Hour,
		VideoTTL:      48 * time.Hour,
	}
}

// LoadDiskCleanupConfigFromEnv reads cleanup settings from environment variables.
func LoadDiskCleanupConfigFromEnv(cfg config.AppConfig) DiskCleanupConfig {
	dataDir := cfg.DataDir
	if dataDir == "" {
		dataDir = "./backend/csm_datas"
	}
	dc := DefaultDiskCleanupConfig(dataDir)

	if v := os.Getenv("CSM_DISK_CLEANUP_ENABLED"); v != "" {
		dc.Enabled = v == "1" || strings.ToLower(v) == "true" || strings.ToLower(v) == "yes"
	}
	if v := os.Getenv("CSM_DISK_CLEANUP_INTERVAL_HOURS"); v != "" {
		if n, err := parseEnvInt(v); err == nil && n > 0 {
			dc.Interval = time.Duration(n) * time.Hour
		}
	}
	if v := os.Getenv("CSM_DISK_CLEANUP_RENDER_TTL_HOURS"); v != "" {
		if n, err := parseEnvInt(v); err == nil && n > 0 {
			dc.RenderTTL = time.Duration(n) * time.Hour
		}
	}
	if v := os.Getenv("CSM_DISK_CLEANUP_PDF_EXTRACT_TTL_HOURS"); v != "" {
		if n, err := parseEnvInt(v); err == nil && n > 0 {
			dc.PDFExtractTTL = time.Duration(n) * time.Hour
		}
	}
	if v := os.Getenv("CSM_DISK_CLEANUP_PDF_REPORT_TTL_HOURS"); v != "" {
		if n, err := parseEnvInt(v); err == nil && n > 0 {
			dc.PDFReportTTL = time.Duration(n) * time.Hour
		}
	}
	if v := os.Getenv("CSM_DISK_CLEANUP_UPLOAD_TTL_HOURS"); v != "" {
		if n, err := parseEnvInt(v); err == nil && n > 0 {
			dc.UploadTTL = time.Duration(n) * time.Hour
		}
	}
	if v := os.Getenv("CSM_DISK_CLEANUP_VIDEO_TTL_HOURS"); v != "" {
		if n, err := parseEnvInt(v); err == nil && n > 0 {
			dc.VideoTTL = time.Duration(n) * time.Hour
		}
	}
	return dc
}

// StartDiskCleanupScheduler launches a background goroutine that periodically
// removes stale files from app_images and deletes the legacy app_images_cache.
// It runs immediately on startup, then every cfg.Interval.
func StartDiskCleanupScheduler(cfg config.AppConfig) {
	dc := LoadDiskCleanupConfigFromEnv(cfg)
	if !dc.Enabled {
		log.Println("[disk-cleanup] disabled by CSM_DISK_CLEANUP_ENABLED=0")
		return
	}

	// Run once immediately on startup
	go runDiskCleanup(dc)

	ticker := time.NewTicker(dc.Interval)
	go func() {
		for range ticker.C {
			runDiskCleanup(dc)
		}
	}()
	log.Printf("[disk-cleanup] scheduler started, interval=%v, renderTTL=%v, pdfExtractTTL=%v, pdfReportTTL=%v, uploadTTL=%v, videoTTL=%v",
		dc.Interval, dc.RenderTTL, dc.PDFExtractTTL, dc.PDFReportTTL, dc.UploadTTL, dc.VideoTTL)
}

func runDiskCleanup(dc DiskCleanupConfig) {
	start := time.Now()
	var totalDeleted int
	var totalFreed int64

	// 1. Delete legacy app_images_cache entirely (Java leftover, Go does not use it)
	cacheDir := filepath.Join(filepath.Dir(dc.AppImagesDir), "app_images_cache")
	if info, err := os.Stat(cacheDir); err == nil && info.IsDir() {
		size := dirSize(cacheDir)
		if err := os.RemoveAll(cacheDir); err != nil {
			log.Printf("[disk-cleanup] failed to remove legacy app_images_cache: %v", err)
		} else {
			totalDeleted++
			totalFreed += size
			log.Printf("[disk-cleanup] removed legacy app_images_cache (%d bytes)", size)
		}
	}

	// 2. Walk app_images and delete stale files
	if _, err := os.Stat(dc.AppImagesDir); err == nil {
		deleted, freed := cleanupAppImages(dc)
		totalDeleted += deleted
		totalFreed += freed
	}

	log.Printf("[disk-cleanup] completed in %v: deleted=%d files, freed=%d bytes (%.2f GB)",
		time.Since(start), totalDeleted, totalFreed, float64(totalFreed)/1024/1024/1024)
}

func cleanupAppImages(dc DiskCleanupConfig) (deleted int, freed int64) {
	now := time.Now()
	cutoffRender := now.Add(-dc.RenderTTL)
	cutoffPDFExtract := now.Add(-dc.PDFExtractTTL)
	cutoffPDFReport := now.Add(-dc.PDFReportTTL)
	cutoffUpload := now.Add(-dc.UploadTTL)
	cutoffVideo := now.Add(-dc.VideoTTL)

	_ = filepath.Walk(dc.AppImagesDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		name := strings.ToLower(info.Name())
		mod := info.ModTime()
		size := info.Size()
		rel, _ := filepath.Rel(dc.AppImagesDir, path)
		rel = strings.ToLower(rel)

		shouldDelete := false
		var reason string

		// AI render artifacts (ai-render-*, ai-character-*)
		if strings.HasPrefix(name, "ai-render-") || strings.HasPrefix(name, "ai-character-") {
			if mod.Before(cutoffRender) {
				shouldDelete = true
				reason = "ai-render"
			}
		}

		// PDF extract images
		if strings.Contains(rel, "pdf_extract") {
			if mod.Before(cutoffPDFExtract) {
				shouldDelete = true
				reason = "pdf_extract"
			}
		}

		// PDF reports
		if strings.HasSuffix(name, ".pdf") && !strings.Contains(rel, "pdf_extract") {
			if mod.Before(cutoffPDFReport) {
				shouldDelete = true
				reason = "pdf_report"
			}
		}

		// Uploaded original files in uploads/
		if strings.Contains(rel, "uploads") {
			if mod.Before(cutoffUpload) {
				shouldDelete = true
				reason = "upload"
			}
		}

		// Video files (ai-render-*.mp4, or any .mp4 in app_images)
		if strings.HasSuffix(name, ".mp4") || strings.HasSuffix(name, ".webm") || strings.HasSuffix(name, ".mov") {
			if mod.Before(cutoffVideo) {
				shouldDelete = true
				reason = "video"
			}
		}

		if shouldDelete {
			if err := os.Remove(path); err != nil {
				log.Printf("[disk-cleanup] failed to remove %s (%s): %v", rel, reason, err)
			} else {
				deleted++
				freed += size
			}
		}
		return nil
	})

	// Remove empty directories after cleanup
	removeEmptyDirs(dc.AppImagesDir)
	return deleted, freed
}

func removeEmptyDirs(root string) {
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || !info.IsDir() || path == root {
			return nil
		}
		entries, err := os.ReadDir(path)
		if err == nil && len(entries) == 0 {
			_ = os.Remove(path)
		}
		return nil
	})
}

func dirSize(path string) int64 {
	var size int64
	_ = filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	return size
}

func parseEnvInt(s string) (int, error) {
	var n int
	_, err := fmt.Sscanf(s, "%d", &n)
	return n, err
}
