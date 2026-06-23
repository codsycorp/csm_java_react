package outbox_test

import (
	"testing"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/platform/outbox"
)

func TestOutboxEnqueuePublish(t *testing.T) {
	dir := t.TempDir()
	cfg := config.AppConfig{
		NativeDataDir: dir,
		Platform: config.PlatformConfig{
			OutboxEnabled: true,
			OutboxDir:     dir + "/outbox",
		},
	}
	store, err := outbox.OpenStore(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	id, err := store.Enqueue("table.mutation", map[string]any{"app_id": "csm", "table": "sys_autos"})
	if err != nil {
		t.Fatal(err)
	}
	if id == "" {
		t.Fatal("expected event id")
	}
	msgs, err := store.PendingBatch(10)
	if len(msgs) != 1 {
		t.Fatalf("pending: %v %v", msgs, err)
	}
	t.Logf("pendingKey=%q", msgs[0].PendingKey)
	if err := store.MarkPublished(msgs[0]); err != nil {
		t.Fatalf("mark published: %v (pendingKey=%q)", err, msgs[0].PendingKey)
	}
	msgs, _ = store.PendingBatch(10)
	if len(msgs) != 0 {
		t.Fatalf("expected empty pending, got %d", len(msgs))
	}
}
