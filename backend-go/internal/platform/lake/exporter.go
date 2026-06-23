package lake

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/platform/lineage"
	"csm_server/backend-go/internal/platform/metrics"
	"csm_server/backend-go/internal/platform/outbox"
)

// Exporter appends outbox events to date-partitioned NDJSON files (analytics lake).
type Exporter struct {
	root    string
	lineage *lineage.Store
	enabled bool
}

func NewExporter(cfg config.AppConfig, lin *lineage.Store) (*Exporter, error) {
	if !cfg.Platform.LakeExportEnabled {
		return &Exporter{enabled: false}, nil
	}
	root := cfg.Platform.LakeExportDir
	if root == "" {
		root = filepath.Join(cfg.DataDir, "lake", "events")
	}
	if err := config.EnsureDir(root); err != nil {
		return nil, err
	}
	return &Exporter{root: root, lineage: lin, enabled: true}, nil
}

func (e *Exporter) Enabled() bool { return e != nil && e.enabled }

// OutboxHandler implements outbox.Handler — append to lake partition.
func (e *Exporter) OutboxHandler() outbox.Handler {
	return func(ctx context.Context, msg outbox.Message) error {
		return e.AppendEvent(ctx, msg.ID, msg.Topic, msg.Payload, msg.CreatedAt)
	}
}

func (e *Exporter) AppendEvent(ctx context.Context, eventID, topic string, payload map[string]any, createdAt string) error {
	if !e.Enabled() {
		return nil
	}
	ts, err := time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		ts = time.Now().UTC()
	}
	part := ts.Format("2006/01/02")
	dir := filepath.Join(e.root, part)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	file := filepath.Join(dir, "mutations.ndjson")
	row := map[string]any{
		"event_id": eventID,
		"topic":    topic,
		"payload":  payload,
		"ts":       ts.UTC().Format(time.RFC3339Nano),
	}
	b, err := json.Marshal(row)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(file, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := f.Write(append(b, '\n')); err != nil {
		return err
	}
	metrics.IncLakeExport(topic)
	if e.lineage != nil {
		_ = e.lineage.Record(lineage.Edge{
			SourceID:   eventID,
			SourceType: "outbox",
			Target:     file,
			TargetType: "lake",
			Meta:       map[string]any{"partition": part},
		})
	}
	return nil
}

// ListPartitions returns YYYY/MM/DD paths with export files.
func (e *Exporter) ListPartitions() ([]string, error) {
	if !e.Enabled() {
		return nil, nil
	}
	var parts []string
	err := filepath.Walk(e.root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if strings.HasSuffix(info.Name(), ".ndjson") {
			rel, _ := filepath.Rel(e.root, filepath.Dir(path))
			parts = append(parts, rel)
		}
		return nil
	})
	return parts, err
}

func (e *Exporter) Root() string { return e.root }

func (e *Exporter) Stats() map[string]any {
	if !e.Enabled() {
		return map[string]any{"enabled": false}
	}
	var files int
	var bytes int64
	_ = filepath.Walk(e.root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if strings.HasSuffix(info.Name(), ".ndjson") {
			files++
			bytes += info.Size()
		}
		return nil
	})
	return map[string]any{
		"enabled": true,
		"root":    e.root,
		"files":   files,
		"bytes":   bytes,
	}
}
