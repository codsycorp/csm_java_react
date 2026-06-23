# ADR-002: Transactional Outbox as Event Backbone

## Status
Accepted

## Context
Table mutations must decouple downstream consumers (analytics lake, Redis bus, vector reindex) without dual-write races or lost events on crash.

## Decision
Implement **transactional outbox** in Pebble (`internal/platform/outbox/`). Mutations enqueue to outbox; worker publishes to event bus and lake exporter.

## Consequences
- **Positive:** At-least-once delivery, replay path, Kafka upgrade without API changes
- **Negative:** Slight latency (poll interval default 500ms) for async consumers
- **Upgrade path:** Replace worker publisher with Kafka producer; keep outbox as source of truth
