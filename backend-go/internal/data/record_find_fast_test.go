package data

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"csm_server/backend-go/internal/model"
)

func TestFindByEmail_SkipsFullTableScanOnAccounts(t *testing.T) {
	rm := testRecordManager(t)
	app, table := "csm", "csm_accounts"

	db, err := rm.tableDB(app, table)
	if err != nil {
		t.Fatalf("tableDB: %v", err)
	}

	targetEmail := "login-fast-test@example.com"
	target := map[string]any{
		"id":       "target-account-id",
		"email":    targetEmail,
		"username": "fastlogin",
		"actived":  true,
	}
	rawTarget, _ := json.Marshal(target)
	if err := db.Set([]byte("target-account-id"), rawTarget, nil); err != nil {
		t.Fatalf("seed target: %v", err)
	}

	for i := 0; i < 500; i++ {
		rec := map[string]any{
			"id":    fmt.Sprintf("noise-account-%d", i),
			"email": fmt.Sprintf("noise-%d@example.com", i),
		}
		raw, _ := json.Marshal(rec)
		key := fmt.Sprintf("noise-account-%d", i)
		if err := db.Set([]byte(key), raw, nil); err != nil {
			t.Fatalf("seed noise %d: %v", i, err)
		}
	}

	start := time.Now()
	found := rm.Find(app, table, model.EqFilter("email", targetEmail))
	elapsed := time.Since(start)

	if got := found["id"]; got != "target-account-id" {
		t.Fatalf("Find email id = %v, want target-account-id", got)
	}
	if elapsed > 2*time.Second {
		t.Fatalf("Find email took %v — likely full-table scan regression (want <2s)", elapsed)
	}
}

func TestFindByAppToken_UsesDirectKeyWithoutScan(t *testing.T) {
	rm := testRecordManager(t)
	app, table := "csm", "csm_accounts"

	token := "direct-token-abc123"
	record := map[string]any{
		"id":        "acct-direct",
		"app_token": token,
		"actived":   true,
	}
	raw, _ := json.Marshal(record)
	db, err := rm.tableDB(app, table)
	if err != nil {
		t.Fatalf("tableDB: %v", err)
	}
	base := urlEncodeKey(token)
	if err := db.Set([]byte(base), raw, nil); err != nil {
		t.Fatalf("seed direct key: %v", err)
	}

	for i := 0; i < 300; i++ {
		noise := map[string]any{"id": fmt.Sprintf("n%d", i), "app_token": fmt.Sprintf("other-%d", i)}
		rawNoise, _ := json.Marshal(noise)
		_ = db.Set([]byte(fmt.Sprintf("n%d", i)), rawNoise, nil)
	}

	start := time.Now()
	found := rm.Find(app, table, model.EqFilter("app_token", token))
	elapsed := time.Since(start)

	if got := found["id"]; got != "acct-direct" {
		t.Fatalf("Find app_token id = %v, want acct-direct", got)
	}
	if elapsed > 500*time.Millisecond {
		t.Fatalf("Find app_token took %v — direct key path should be fast", elapsed)
	}
}

func TestFindByCustomPK_StillScansOrphansOnSysAutosOnly(t *testing.T) {
	rm := testRecordManager(t)
	app, table := "csm", "sys_autos"

	autoLmkt := map[string]any{
		"id":     "orphan-only-id",
		"p_name": "broadcast_perf",
		"p_type": float64(0),
		"p_code": "ORPHAN-CODE-WINS",
	}
	rawLmkt, _ := json.Marshal(autoLmkt)
	db, err := rm.tableDB(app, table)
	if err != nil {
		t.Fatalf("tableDB: %v", err)
	}
	if err := db.Set([]byte("orphan-only-id"), rawLmkt, nil); err != nil {
		t.Fatalf("seed orphan: %v", err)
	}

	read := rm.FindByCustomPK(app, table, map[string]any{
		"p_name": "broadcast_perf",
		"p_type": float64(0),
	}, []string{"p_name", "p_type"})
	if got := read["id"]; got != "orphan-only-id" {
		t.Fatalf("sys_autos orphan scan id = %v, want orphan-only-id", got)
	}
}

func TestFindByEmail_DoesNotTriggerPKOrphanScanOnAccounts(t *testing.T) {
	rm := testRecordManager(t)
	app, table := "csm", "csm_accounts"

	// Email stored only under id-key, not as storage key — PK orphan scan must NOT be required for csm_accounts.
	email := "pk-orphan-skip@example.com"
	record := map[string]any{
		"id":    "email-by-id-key",
		"email": email,
	}
	raw, _ := json.Marshal(record)
	db, err := rm.tableDB(app, table)
	if err != nil {
		t.Fatalf("tableDB: %v", err)
	}
	if err := db.Set([]byte("email-by-id-key"), raw, nil); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// Without FTS, login falls back to scan — still must complete; main regression was minutes-long scan per PK probe.
	start := time.Now()
	found := rm.Find(app, table, model.EqFilter("email", email))
	elapsed := time.Since(start)

	if got := found["id"]; got != "email-by-id-key" {
		t.Fatalf("Find email id = %v, want email-by-id-key (got %v)", got, found)
	}
	if elapsed > 3*time.Second {
		t.Fatalf("Find email took %v on small table — check for repeated full scans", elapsed)
	}
}

func TestFindByUsername_FindsIdKeyedAccount(t *testing.T) {
	rm := testRecordManager(t)
	app, table := "csm", "csm_accounts"

	record := map[string]any{
		"id":       "user-by-id-key-only",
		"username": "idkeyuser",
		"email":    "idkey@example.com",
		"pass":     "encoded",
		"actived":  true,
	}
	raw, _ := json.Marshal(record)
	db, err := rm.tableDB(app, table)
	if err != nil {
		t.Fatalf("tableDB: %v", err)
	}
	if err := db.Set([]byte("user-by-id-key-only"), raw, nil); err != nil {
		t.Fatalf("seed: %v", err)
	}

	found := rm.Find(app, table, model.EqFilter("username", "idkeyuser"))
	if got := found["id"]; got != "user-by-id-key-only" {
		t.Fatalf("Find username id = %v, want user-by-id-key-only", got)
	}
}
