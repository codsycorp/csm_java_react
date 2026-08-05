package services

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestDiskCleanupRemovesLegacyCache(t *testing.T) {
	tmp := t.TempDir()
	appImages := filepath.Join(tmp, "public", "app_images")
	cacheDir := filepath.Join(tmp, "public", "app_images_cache")

	if err := os.MkdirAll(filepath.Join(appImages, "csm"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(cacheDir, "csm"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cacheDir, "csm", "w480_q82_fmtwebp_v1_test.jpg"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	dc := DiskCleanupConfig{
		Enabled:       true,
		AppImagesDir:  appImages,
		RenderTTL:     time.Hour,
		PDFExtractTTL: time.Hour,
		PDFReportTTL:  time.Hour,
		UploadTTL:     time.Hour,
		VideoTTL:      time.Hour,
	}
	runDiskCleanup(dc)

	if _, err := os.Stat(cacheDir); !os.IsNotExist(err) {
		t.Fatal("expected app_images_cache to be removed")
	}
}

func TestDiskCleanupRemovesStaleRenderFiles(t *testing.T) {
	tmp := t.TempDir()
	appImages := filepath.Join(tmp, "public", "app_images")
	dir := filepath.Join(appImages, "csm")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}

	old := time.Now().Add(-25 * time.Hour)
	newFile := filepath.Join(dir, "ai-render-999.jpg")
	oldFile := filepath.Join(dir, "ai-render-111.jpg")

	if err := os.WriteFile(newFile, []byte("new"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(oldFile, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(oldFile, old, old); err != nil {
		t.Fatal(err)
	}

	dc := DiskCleanupConfig{
		Enabled:       true,
		AppImagesDir:  appImages,
		RenderTTL:     24 * time.Hour,
		PDFExtractTTL: 7 * 24 * time.Hour,
		PDFReportTTL:  30 * 24 * time.Hour,
		UploadTTL:     90 * 24 * time.Hour,
		VideoTTL:      48 * time.Hour,
	}
	runDiskCleanup(dc)

	if _, err := os.Stat(oldFile); !os.IsNotExist(err) {
		t.Fatal("expected old ai-render file to be deleted")
	}
	if _, err := os.Stat(newFile); err != nil {
		t.Fatal("expected new ai-render file to be kept")
	}
}

func TestDiskCleanupRemovesStalePDF(t *testing.T) {
	tmp := t.TempDir()
	appImages := filepath.Join(tmp, "public", "app_images")
	dir := filepath.Join(appImages, "csm")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}

	old := time.Now().Add(-31 * 24 * time.Hour)
	newPDF := filepath.Join(dir, "report-2025.pdf")
	oldPDF := filepath.Join(dir, "report-2024.pdf")

	if err := os.WriteFile(newPDF, []byte("new"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(oldPDF, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(oldPDF, old, old); err != nil {
		t.Fatal(err)
	}

	dc := DiskCleanupConfig{
		Enabled:       true,
		AppImagesDir:  appImages,
		RenderTTL:     24 * time.Hour,
		PDFExtractTTL: 7 * 24 * time.Hour,
		PDFReportTTL:  30 * 24 * time.Hour,
		UploadTTL:     90 * 24 * time.Hour,
		VideoTTL:      48 * time.Hour,
	}
	runDiskCleanup(dc)

	if _, err := os.Stat(oldPDF); !os.IsNotExist(err) {
		t.Fatal("expected old PDF to be deleted")
	}
	if _, err := os.Stat(newPDF); err != nil {
		t.Fatal("expected new PDF to be kept")
	}
}

func TestDiskCleanupRemovesStaleUploads(t *testing.T) {
	tmp := t.TempDir()
	appImages := filepath.Join(tmp, "public", "app_images")
	dir := filepath.Join(appImages, "uploads")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}

	old := time.Now().Add(-91 * 24 * time.Hour)
	newFile := filepath.Join(dir, "uuid-new.jpg")
	oldFile := filepath.Join(dir, "uuid-old.jpg")

	if err := os.WriteFile(newFile, []byte("new"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(oldFile, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(oldFile, old, old); err != nil {
		t.Fatal(err)
	}

	dc := DiskCleanupConfig{
		Enabled:       true,
		AppImagesDir:  appImages,
		RenderTTL:     24 * time.Hour,
		PDFExtractTTL: 7 * 24 * time.Hour,
		PDFReportTTL:  30 * 24 * time.Hour,
		UploadTTL:     90 * 24 * time.Hour,
		VideoTTL:      48 * time.Hour,
	}
	runDiskCleanup(dc)

	if _, err := os.Stat(oldFile); !os.IsNotExist(err) {
		t.Fatal("expected old upload to be deleted")
	}
	if _, err := os.Stat(newFile); err != nil {
		t.Fatal("expected new upload to be kept")
	}
}

func TestDiskCleanupKeepsRecentFiles(t *testing.T) {
	tmp := t.TempDir()
	appImages := filepath.Join(tmp, "public", "app_images")
	dir := filepath.Join(appImages, "csm")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}

	recent := filepath.Join(dir, "recent-image.jpg")
	if err := os.WriteFile(recent, []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}

	dc := DiskCleanupConfig{
		Enabled:       true,
		AppImagesDir:  appImages,
		RenderTTL:     24 * time.Hour,
		PDFExtractTTL: 7 * 24 * time.Hour,
		PDFReportTTL:  30 * 24 * time.Hour,
		UploadTTL:     90 * 24 * time.Hour,
		VideoTTL:      48 * time.Hour,
	}
	runDiskCleanup(dc)

	if _, err := os.Stat(recent); err != nil {
		t.Fatal("expected recent file to be kept")
	}
}
