package lineage

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/cockroachdb/pebble"
	"github.com/google/uuid"

	"csm_server/backend-go/internal/config"
)

const keyPrefix = "lineage/"

// Edge links a source event to a downstream artifact (lake file, index, bus topic).
type Edge struct {
	ID         string         `json:"id"`
	SourceID   string         `json:"source_id"`
	SourceType string         `json:"source_type"` // outbox | mutation | export
	Target     string         `json:"target"`
	TargetType string         `json:"target_type"` // event_bus | lake | vector | audit
	Meta       map[string]any `json:"meta,omitempty"`
	Timestamp  string         `json:"timestamp"`
}

// Store records data lineage for governance and GDPR audits.
type Store struct {
	db      *pebble.DB
	mu      sync.Mutex
	enabled bool
}

func OpenStore(cfg config.AppConfig) (*Store, error) {
	if !cfg.Platform.LineageEnabled {
		return &Store{enabled: false}, nil
	}
	dir := cfg.Platform.LineageDir
	if dir == "" {
		dir = cfg.NativeDataDir + "/lineage"
	}
	if err := config.EnsureDir(dir); err != nil {
		return nil, err
	}
	db, err := pebble.Open(dir+"/lineage.kv", &pebble.Options{})
	if err != nil {
		return nil, fmt.Errorf("lineage store: %w", err)
	}
	return &Store{db: db, enabled: true}, nil
}

func (s *Store) Enabled() bool { return s != nil && s.enabled }

func (s *Store) Record(edge Edge) error {
	if !s.Enabled() {
		return nil
	}
	if edge.ID == "" {
		edge.ID = uuid.NewString()
	}
	if edge.Timestamp == "" {
		edge.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}
	b, err := json.Marshal(edge)
	if err != nil {
		return err
	}
	key := []byte(keyPrefix + edge.Timestamp + "/" + edge.ID)
	s.mu.Lock()
	err = s.db.Set(key, b, pebble.Sync)
	s.mu.Unlock()
	return err
}

func (s *Store) BySource(sourceID string, limit int) ([]Edge, error) {
	if !s.Enabled() || sourceID == "" {
		return nil, nil
	}
	if limit <= 0 {
		limit = 100
	}
	iter, err := s.db.NewIter(&pebble.IterOptions{LowerBound: []byte(keyPrefix)})
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	var out []Edge
	for iter.Last(); iter.Valid() && len(out) < limit; iter.Prev() {
		var e Edge
		if json.Unmarshal(iter.Value(), &e) != nil {
			continue
		}
		if e.SourceID == sourceID {
			out = append(out, e)
		}
	}
	return out, nil
}

func (s *Store) Close() {
	if s == nil || s.db == nil {
		return
	}
	_ = s.db.Close()
	s.db = nil
}
