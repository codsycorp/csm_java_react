# CSM Go — Big Data & CTO Data Platform Guide

This document describes the **data platform layer** for CTO-grade architecture: transactional outbox, analytics lake, lineage, catalog, GDPR DSR, and capacity planning.

## Architecture

```
OLTP (Pebble) ──mutation──► Outbox ──worker──► Event Bus (memory/Redis)
                                │                    │
                                ├──► Lake (NDJSON)     └──► subscribers
                                └──► Lineage store
```

| Layer | Package | Purpose |
|-------|---------|---------|
| **Outbox** | `internal/platform/outbox` | At-least-once event delivery |
| **Lake** | `internal/platform/lake` | Date-partitioned NDJSON for OLAP |
| **Lineage** | `internal/platform/lineage` | Data flow traceability |
| **Catalog** | `internal/platform/catalog` | Dataset registry (PII tags) |
| **GDPR DSR** | `internal/platform/governance/dsr` | Export + erasure |
| **Capacity** | `internal/data/capacity` | Pebble footprint report |

## Environment

```env
CSM_DATA_PLATFORM_ENABLED=true
CSM_OUTBOX_ENABLED=true
CSM_OUTBOX_POLL_MS=500
CSM_LAKE_EXPORT_ENABLED=true
CSM_LAKE_EXPORT_DIR=/data/csm_datas/lake/events
CSM_LINEAGE_ENABLED=true
CSM_CATALOG_ENABLED=true
CSM_GDPR_DSR_ENABLED=true
CSM_EVENT_BUS=redis   # optional multi-instance
```

## Governance APIs (dev/admin)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/governance/capacity` | GET/POST | Pebble storage snapshot |
| `/api/governance/catalog` | GET/POST | Registered datasets |
| `/api/governance/lake-stats` | GET/POST | Lake export stats |
| `/api/governance/dsr/export` | POST | GDPR portability package |
| `/api/governance/dsr/erase` | POST | GDPR anonymization |
| `/api/governance/lineage/{eventId}` | GET/POST | Lineage edges |

## Capacity CLI

```bash
cd backend-go
go run ./cmd/csm-capacity-report
```

## Analytics ingest (ClickHouse example)

```sql
SELECT *
FROM file('{lake_root}/2026/06/23/mutations.ndjson', JSONEachRow);
```

## SLO & error budget

- Metric: `csm_error_budget_remaining_ratio` (1.0 = full budget)
- Alerts: `deploy/observability/prometheus-rules.yml`
- Dashboard: `deploy/observability/grafana/dashboards/csm-slo.json`

## ADRs

- [001 Modular Monolith](../docs/adr/001-modular-monolith.md)
- [002 Transactional Outbox](../docs/adr/002-transactional-outbox.md)
- [003 Analytics Lake](../docs/adr/003-analytics-lake-ndjson.md)

## Maturity vs CTO big-data checklist

| Capability | Status |
|------------|--------|
| Transactional outbox | ✅ |
| Event backbone (memory/Redis) | ✅ |
| Analytics lake (NDJSON) | ✅ |
| Data lineage | ✅ |
| Data catalog stub | ✅ |
| GDPR DSR export/erase | ✅ |
| Capacity planning | ✅ |
| SLO error budget metric | ✅ |
| Kafka / Flink | 🔜 when outbox lag > threshold |
| ClickHouse cluster | 🔜 when lake > 500GB |
| DataHub / OpenMetadata | 🔜 replace catalog JSON |
| Zero Trust / mTLS | 🔜 multi-service phase |

## Upgrade triggers

| Signal | Action |
|--------|--------|
| `csm_outbox_pending` > 1000 for 15m | Scale worker / add Kafka |
| Lake > 500GB | ClickHouse + compaction job |
| p99 API > 500ms with low CPU | Split OLTP vs OLAP read path |
| Multi-region requirement | Postgres + CRDT or event sourcing |
