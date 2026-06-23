package outbox

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/cockroachdb/pebble"
	"github.com/google/uuid"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/platform/metrics"
)

const (
	pendingPrefix  = "pending/"
	publishedPrefix = "published/"
)

// Message is a durable domain event awaiting delivery (transactional outbox).
type Message struct {
	ID         string         `json:"id"`
	Topic      string         `json:"topic"`
	Payload    map[string]any `json:"payload"`
	CreatedAt  string         `json:"created_at"`
	Attempts   int            `json:"attempts,omitempty"`
	PendingKey string         `json:"-"`
}

// Store persists outbox messages in Pebble for at-least-once delivery.
type Store struct {
	db      *pebble.DB
	mu      sync.Mutex
	enabled bool
}

func OpenStore(cfg config.AppConfig) (*Store, error) {
	if !cfg.Platform.OutboxEnabled {
		return &Store{enabled: false}, nil
	}
	dir := cfg.Platform.OutboxDir
	if dir == "" {
		dir = cfg.NativeDataDir + "/outbox"
	}
	if err := config.EnsureDir(dir); err != nil {
		return nil, err
	}
	db, err := pebble.Open(dir+"/outbox.kv", &pebble.Options{})
	if err != nil {
		return nil, fmt.Errorf("outbox store: %w", err)
	}
	return &Store{db: db, enabled: true}, nil
}

func (s *Store) Enabled() bool { return s != nil && s.enabled }

// Enqueue appends a message to the outbox (call after successful OLTP write).
func (s *Store) Enqueue(topic string, payload map[string]any) (string, error) {
	if !s.Enabled() {
		return "", nil
	}
	msg := Message{
		ID:        uuid.NewString(),
		Topic:     topic,
		Payload:   payload,
		CreatedAt: fmt.Sprintf("%020d", time.Now().UnixNano()),
	}
	key := []byte(pendingPrefix + msg.CreatedAt + "/" + msg.ID)
	msg.PendingKey = string(key)
	b, err := json.Marshal(msg)
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	err = s.db.Set(key, b, pebble.Sync)
	s.mu.Unlock()
	if err != nil {
		return "", err
	}
	metrics.IncOutboxEnqueued(topic)
	metrics.SetOutboxPending(s.countPending())
	return msg.ID, nil
}

// PendingBatch returns up to limit oldest pending messages.
func (s *Store) PendingBatch(limit int) ([]Message, error) {
	if !s.Enabled() || limit <= 0 {
		return nil, nil
	}
	iter, err := s.db.NewIter(&pebble.IterOptions{
		LowerBound: []byte(pendingPrefix),
		UpperBound: []byte(publishedPrefix),
	})
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	var out []Message
	for iter.First(); iter.Valid() && len(out) < limit; iter.Next() {
		var msg Message
		if err := json.Unmarshal(iter.Value(), &msg); err != nil {
			continue
		}
		msg.PendingKey = string(iter.Key())
		out = append(out, msg)
	}
	return out, nil
}

// MarkPublished moves a message from pending to published archive.
func (s *Store) MarkPublished(msg Message) error {
	if !s.Enabled() {
		return nil
	}
	b, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	pubKey := []byte(publishedPrefix + msg.CreatedAt + "/" + msg.ID)
	pendKey := []byte(msg.PendingKey)
	if msg.PendingKey == "" {
		pendKey = []byte(pendingPrefix + msg.CreatedAt + "/" + msg.ID)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	batch := s.db.NewBatch()
	if err := batch.Set(pubKey, b, nil); err != nil {
		batch.Close()
		return err
	}
	if err := batch.Delete(pendKey, nil); err != nil {
		batch.Close()
		return err
	}
	err = batch.Commit(pebble.Sync)
	if err != nil {
		return err
	}
	metrics.IncOutboxPublished(msg.Topic)
	metrics.SetOutboxPending(s.countPendingLocked())
	return nil
}

// MarkFailed increments attempt counter on pending message.
func (s *Store) MarkFailed(msg Message) error {
	if !s.Enabled() {
		return nil
	}
	msg.Attempts++
	b, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	key := []byte(pendingPrefix + msg.CreatedAt + "/" + msg.ID)
	s.mu.Lock()
	err = s.db.Set(key, b, pebble.Sync)
	s.mu.Unlock()
	if err == nil {
		metrics.IncOutboxFailed(msg.Topic)
	}
	return err
}

func (s *Store) countPending() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.countPendingLocked()
}

func (s *Store) countPendingLocked() int {
	if s.db == nil {
		return 0
	}
	iter, err := s.db.NewIter(&pebble.IterOptions{LowerBound: []byte(pendingPrefix), UpperBound: []byte(publishedPrefix)})
	if err != nil {
		return 0
	}
	defer iter.Close()
	n := 0
	for iter.First(); iter.Valid(); iter.Next() {
		n++
	}
	return n
}

func (s *Store) Close() {
	if s == nil || s.db == nil {
		return
	}
	_ = s.db.Close()
	s.db = nil
}
