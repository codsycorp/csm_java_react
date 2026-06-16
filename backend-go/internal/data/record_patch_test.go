package data

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/model"
)

func TestPatchRecordSessionFieldsFast(t *testing.T) {
	dir := t.TempDir()
	cfg := config.AppConfig{
		DataDir:        dir,
		NativeDataDir:  filepath.Join(dir, "native"),
		VectorStoreDir: filepath.Join(dir, "native", "vector", "chromem"),
		PebbleRoot:     filepath.Join(dir, "native", "pebble"),
	}
	_ = os.MkdirAll(cfg.NativeDataDir, 0o755)

	rm, err := NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer rm.ShutdownAll()

	appID := "csm"
	table := AccountsTableName()
	email := "fast-login@test.com"
	_, _ = rm.CreateRecord(appID, table, map[string]any{
		"id": email, "email": email, "username": "fastuser",
		"pass": "enc", "actived": true, "app_token": "tok-fast",
	}, []string{"app_token"})

	rm.warmAuthEqIndex()

	start := time.Now()
	rec := rm.Find(appID, table, model.EqFilter("email", email))
	if len(rec) == 0 {
		t.Fatal("expected account by email after warm index")
	}
	findMs := time.Since(start).Milliseconds()
	if findMs > 200 {
		t.Fatalf("Find(email) took %dms, want <200ms with warm eq-index", findMs)
	}

	rec["refresh_token"] = "new-refresh"
	start = time.Now()
	if err := rm.PatchRecord(appID, table, rec, []string{"app_token"}); err != nil {
		t.Fatal(err)
	}
	patchMs := time.Since(start).Milliseconds()
	if patchMs > 200 {
		t.Fatalf("PatchRecord session took %dms, want <200ms", patchMs)
	}
}

func AccountsTableName() string {
	return "csm_accounts"
}
