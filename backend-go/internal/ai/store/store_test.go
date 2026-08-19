package store

import (
	"path/filepath"
	"testing"
	"time"

	"csm_server/backend-go/internal/ai/domain"
	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
)

func TestRunPersistsAcrossRecordManagerRestart(t *testing.T) {
	cfg := testConfig(t.TempDir())
	records, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	platformStore := New(records)
	run := NewRun("request-1", "tenant-a", "seo-content-agent", "write article", 1)
	run.Status = domain.RunRunning
	if err := platformStore.SaveRun(run); err != nil {
		t.Fatal(err)
	}
	records.ShutdownAll()

	reopened, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.ShutdownAll()
	row, ok := New(reopened).GetRun(run.RunID)
	if !ok {
		t.Fatal("expected persisted run after restart")
	}
	if row["tenant_id"] != "tenant-a" || row["status"] != string(domain.RunRunning) {
		t.Fatalf("unexpected persisted run: %+v", row)
	}
}

func TestAgentRegistryIsTenantScoped(t *testing.T) {
	cfg := testConfig(t.TempDir())
	records, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer records.ShutdownAll()
	platformStore := New(records)
	for _, tenantID := range []string{"tenant-a", "tenant-b"} {
		if err := platformStore.SaveAgent(domain.AgentDefinition{
			AgentID: "seo-content-agent", TenantID: tenantID, Name: "SEO", Version: 1,
			Status: "active", PreferredMode: "local", MaxSteps: 10,
		}); err != nil {
			t.Fatal(err)
		}
	}
	rows := platformStore.ListAgents("tenant-a")
	if len(rows) != 1 || rows[0]["tenant_id"] != "tenant-a" {
		t.Fatalf("expected only tenant-a agent, got %+v", rows)
	}
}

func TestRunAndStepsAreTenantScoped(t *testing.T) {
	cfg := testConfig(t.TempDir())
	records, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer records.ShutdownAll()
	platformStore := New(records)
	run := NewRun("request-tenant", "tenant-a", "agent", "goal", 1)
	if err := platformStore.SaveRun(run); err != nil {
		t.Fatal(err)
	}
	if err := platformStore.SaveStep(domain.RunStep{
		RunID: run.RunID, TenantID: "tenant-a", StepID: "s01", Status: domain.StepSucceeded,
		IdempotencyKey: run.RunID + ":s01:1",
	}); err != nil {
		t.Fatal(err)
	}
	if _, ok := platformStore.GetRunForTenant("tenant-b", run.RunID); ok {
		t.Fatal("tenant-b must not read tenant-a run")
	}
	if steps := platformStore.ListStepsForRun("tenant-b", run.RunID); len(steps) != 0 {
		t.Fatalf("tenant-b must not read tenant-a steps: %+v", steps)
	}
	if _, ok := platformStore.GetRunForTenant("tenant-a", run.RunID); !ok {
		t.Fatal("tenant-a should read its run")
	}
	if steps := platformStore.ListStepsForRun("tenant-a", run.RunID); len(steps) != 1 {
		t.Fatalf("tenant-a should read its step: %+v", steps)
	}
}

func TestStepLeaseBlocksConcurrentWorkerAndRecoversAfterExpiry(t *testing.T) {
	cfg := testConfig(t.TempDir())
	records, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer records.ShutdownAll()
	platformStore := New(records)
	run := NewRun("lease-request", "tenant-a", "agent", "goal", 1)
	if err := platformStore.SaveRun(run); err != nil {
		t.Fatal(err)
	}
	if err := platformStore.SaveStep(domain.RunStep{
		RunID: run.RunID, TenantID: "tenant-a", StepID: "s01", Status: domain.StepPending,
	}); err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1_700_000_000, 0).UTC()
	if _, err := platformStore.AcquireStepLease("tenant-a", run.RunID, "s01", "worker-a", now, time.Minute); err != nil {
		t.Fatal(err)
	}
	if _, err := platformStore.AcquireStepLease("tenant-a", run.RunID, "s01", "worker-b", now.Add(30*time.Second), time.Minute); err == nil {
		t.Fatal("worker-b must not acquire an active lease")
	}
	recovered, err := platformStore.RecoverExpiredStepLeases("tenant-a", run.RunID, now.Add(2*time.Minute))
	if err != nil || recovered != 1 {
		t.Fatalf("expected one recovered lease: recovered=%d err=%v", recovered, err)
	}
	if _, err := platformStore.AcquireStepLease("tenant-a", run.RunID, "s01", "worker-b", now.Add(2*time.Minute), time.Minute); err != nil {
		t.Fatalf("worker-b should acquire recovered lease: %v", err)
	}
}

func testConfig(root string) config.AppConfig {
	return config.AppConfig{
		DataDir: root, NativeDataDir: filepath.Join(root, "native"),
		PebbleRoot:     filepath.Join(root, "native", "pebble"),
		VectorStoreDir: filepath.Join(root, "native", "vector"),
		EqIndexRoot:    filepath.Join(root, "native", "eq_index"), EqIndexMode: "memory",
	}
}
