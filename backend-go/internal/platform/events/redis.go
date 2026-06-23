package events

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"csm_server/backend-go/internal/config"
)

const defaultRedisChannelPrefix = "csm:events"

// redisBus fans out events via Redis Pub/Sub while keeping in-process handlers.
type redisBus struct {
	client  *redis.Client
	local   *memoryBus
	prefix  string
	mu      sync.Mutex
	subs    map[string]context.CancelFunc
	closed  bool
}

func newRedisBus(cfg config.AppConfig) (*redisBus, error) {
	addr := fmt.Sprintf("%s:%d", cfg.Redis.Host, cfg.Redis.Port)
	opts := &redis.Options{
		Addr:         addr,
		Password:     cfg.Redis.Password,
		DB:           cfg.Redis.DB,
		DialTimeout:  3 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
	}
	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("redis ping %s: %w", addr, err)
	}
	prefix := strings.TrimSpace(cfg.Platform.RedisEventPrefix)
	if prefix == "" {
		prefix = defaultRedisChannelPrefix
	}
	log.Printf("EventBus: redis pub/sub at %s (prefix=%s)", addr, prefix)
	return &redisBus{
		client: client,
		local:  &memoryBus{handlers: make(map[string][]Handler)},
		prefix: prefix,
		subs:   make(map[string]context.CancelFunc),
	}, nil
}

func (b *redisBus) channel(topic string) string {
	return b.prefix + ":" + topic
}

func (b *redisBus) Publish(ctx context.Context, ev Event) {
	b.local.invoke(ctx, ev)
	if b.client == nil {
		return
	}
	payload, err := json.Marshal(ev)
	if err != nil {
		log.Printf("event bus redis marshal: %v", err)
		return
	}
	if err := b.client.Publish(ctx, b.channel(ev.Topic), payload).Err(); err != nil {
		log.Printf("event bus redis publish %s: %v", ev.Topic, err)
	}
}

func (b *redisBus) Subscribe(topic string, h Handler) {
	b.local.Subscribe(topic, h)
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed || b.subs[topic] != nil {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	b.subs[topic] = cancel
	go b.listen(ctx, topic)
}

func (b *redisBus) listen(ctx context.Context, topic string) {
	pubsub := b.client.Subscribe(ctx, b.channel(topic))
	defer func() { _ = pubsub.Close() }()
	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var ev Event
			if err := json.Unmarshal([]byte(msg.Payload), &ev); err != nil {
				log.Printf("event bus redis decode: %v", err)
				continue
			}
			b.local.invoke(ctx, ev)
		}
	}
}

func (b *redisBus) Close() error {
	b.mu.Lock()
	b.closed = true
	for _, cancel := range b.subs {
		cancel()
	}
	b.subs = nil
	b.mu.Unlock()
	if b.client != nil {
		return b.client.Close()
	}
	return nil
}

// RedisPing probes Redis for readiness checks.
func RedisPing(cfg config.AppConfig) error {
	if strings.ToLower(cfg.Platform.EventBusMode) != "redis" {
		return nil
	}
	addr := fmt.Sprintf("%s:%d", cfg.Redis.Host, cfg.Redis.Port)
	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	err := client.Ping(ctx).Err()
	_ = client.Close()
	return err
}
