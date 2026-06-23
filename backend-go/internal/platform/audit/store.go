package audit

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/cockroachdb/pebble"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/platform/governance"
	"csm_server/backend-go/internal/platform/metrics"
)

const auditKeyPrefix = "audit/"

// Event is an immutable audit record for data mutations (ISO 27001 traceability).
type Event struct {
	ID        string         `json:"id"`
	Timestamp string         `json:"timestamp"`
	ActorID   string         `json:"actor_id"`
	Actor     string         `json:"actor"`
	AppID     string         `json:"app_id"`
	Table     string         `json:"table"`
	Action    string         `json:"action"`
	RequestID string         `json:"request_id,omitempty"`
	ClientIP  string         `json:"client_ip,omitempty"`
	Meta      map[string]any `json:"meta,omitempty"`
}

// Store persists audit events in Pebble (_csm/audit).
type Store struct {
	db      *pebble.DB
	mu      sync.Mutex
	enabled bool
	retDays int
	seq     uint64
}

func OpenStore(cfg config.AppConfig) (*Store, error) {
	if !cfg.Platform.AuditEnabled {
		return &Store{enabled: false}, nil
	}
	dir := cfg.Platform.AuditDir
	if dir == "" {
		dir = cfg.NativeDataDir + "/audit"
	}
	if err := config.EnsureDir(dir); err != nil {
		return nil, err
	}
	db, err := pebble.Open(dir+"/audit.kv", &pebble.Options{})
	if err != nil {
		return nil, fmt.Errorf("audit store: %w", err)
	}
	s := &Store{
		db:      db,
		enabled: true,
		retDays: cfg.Platform.AuditRetentionDays,
	}
	return s, nil
}

func (s *Store) Enabled() bool { return s != nil && s.enabled }

func (s *Store) Record(ev Event) {
	if !s.Enabled() {
		return
	}
	if ev.Timestamp == "" {
		ev.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}
	if ev.ID == "" {
		s.mu.Lock()
		s.seq++
		ev.ID = fmt.Sprintf("%d-%d", time.Now().UnixNano(), s.seq)
		s.mu.Unlock()
	}
	if ev.Meta != nil {
		ev.Meta = governance.RedactMap(ev.Meta)
	}
	b, err := json.Marshal(ev)
	if err != nil {
		return
	}
	key := []byte(auditKeyPrefix + ev.Timestamp + "/" + ev.ID)
	s.mu.Lock()
	_ = s.db.Set(key, b, pebble.Sync)
	s.mu.Unlock()
	metrics.IncAudit(ev.Action)
}

func (s *Store) PurgeExpired() {
	if !s.Enabled() || s.retDays <= 0 {
		return
	}
	cutoff := time.Now().AddDate(0, 0, -s.retDays).UTC().Format(time.RFC3339Nano)
	iter, err := s.db.NewIter(&pebble.IterOptions{LowerBound: []byte(auditKeyPrefix)})
	if err != nil {
		return
	}
	defer iter.Close()
	var toDelete [][]byte
	for iter.First(); iter.Valid(); iter.Next() {
		k := string(iter.Key())
		if len(k) < len(auditKeyPrefix)+20 {
			continue
		}
		ts := k[len(auditKeyPrefix) : len(auditKeyPrefix)+len(cutoff)]
		if ts < cutoff[:min(len(ts), len(cutoff))] {
			toDelete = append(toDelete, append([]byte(nil), iter.Key()...))
		}
		if len(toDelete) >= 500 {
			break
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, k := range toDelete {
		_ = s.db.Delete(k, pebble.Sync)
	}
}

func (s *Store) Close() {
	if s == nil || s.db == nil {
		return
	}
	_ = s.db.Close()
	s.db = nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
