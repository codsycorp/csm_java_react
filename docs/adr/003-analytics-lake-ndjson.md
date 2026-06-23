# ADR-003: Analytics Lake via NDJSON Partitions

## Status
Accepted

## Context
OLTP (Pebble) must not serve heavy analytics. Need cheap, replayable export for ClickHouse/DuckDB/BigQuery batch load.

## Decision
Append mutation events to **date-partitioned NDJSON** under `{DATA_DIR}/lake/events/YYYY/MM/DD/mutations.ndjson`.

## Consequences
- **Positive:** Zero extra infra; compatible with dbt, Spark, ClickHouse `file()` ingest
- **Negative:** Not real-time OLAP; compaction needed at scale
- **Trigger to revisit:** Lake >500GB OR sub-hour analytics SLA → ClickHouse cluster + Kafka connect
