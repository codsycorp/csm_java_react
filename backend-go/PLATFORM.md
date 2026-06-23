# CSM Go — Platform Engineering Guide

This document describes observability, security, SRE, governance, and deployment standards for `backend-go`.

## Architecture stance

| Choice | Rationale |
|--------|-----------|
| **Modular monolith** | Java parity, low ops overhead, embedded Pebble |
| **Event bus (in-memory)** | Decouple table mutations; upgrade path to Redis/NATS |
| **Local LLM + RAG** | Privacy, predictable cost; llama embeddings when `-tags llamacpp` |
| **Pebble audit store** | ISO 27001 traceability without external DB |

## Observability

### Endpoints

| Path | Purpose |
|------|---------|
| `GET /live` | Liveness — process up |
| `GET /ready` | Readiness — Pebble + dependencies |
| `GET /metrics` | Prometheus scrape |
| `GET /monitoring/health` | Legacy JSON health (backward compatible) |

### Environment

```env
CSM_STRUCTURED_LOGS=true
CSM_METRICS_ENABLED=true
CSM_METRICS_PATH=/metrics
CSM_SERVICE_NAME=csm-go
```

### Local Prometheus + Grafana

```bash
cd deploy/observability
docker compose up
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3000 (admin/admin)
```

### SLO targets (internal)

Defined in `internal/platform/slo/slo.go`:

- API availability: **99.9%**
- API p99 latency: **< 500ms** (non-AI)
- AI stream TTFB: **< 3s**
- AI error rate: **< 0.1%**

Alert rules: `deploy/observability/prometheus-rules.yml`

### Production Prometheus install

On the server (Ubuntu/Debian):

```bash
sudo ./deploy/observability/install-prometheus-production.sh
# custom target:
CSM_GO_HOST=127.0.0.1 CSM_GO_PORT=9999 sudo ./deploy/observability/install-prometheus-production.sh
```

Verify: `curl -s 'http://127.0.0.1:9090/api/v1/query?query=up{job="csm-go"}'`

## OpenTelemetry (distributed tracing)

```env
CSM_OTEL_ENABLED=true
CSM_OTEL_ENDPOINT=localhost:4318
CSM_OTEL_INSECURE=true
```

Local collector (with docker compose):

```bash
cd deploy/observability && docker compose up -d otel-collector
```

Traces export via OTLP HTTP to the collector (`otel-collector.yml`).

## Redis event bus

For multi-instance deployments:

```env
CSM_EVENT_BUS=redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# REDIS_PASSWORD=
# CSM_REDIS_EVENT_PREFIX=csm:events
```

- Publishes `table.mutation` and other topics to Redis Pub/Sub
- Falls back to in-memory if Redis is unreachable at startup
- `/ready` includes `redis` component when mode=redis

```env
CSM_ENV=production
CSM_REQUIRE_STRONG_JWT=1
JWT_SECRET=<32+ random bytes>
CSM_AUTH_RATE_LIMIT_ENABLED=true
AUTH_RATE_LIMIT_MAX=120
CSM_CORS_ALLOWED_ORIGINS=https://admin.csmbridge.net,https://api.csmbridge.net
```

- **Rate limiting** on `/login`, `/refresh-token`, `/register`
- **CORS allowlist** — empty = permissive dev mode
- **JWT validation** at startup when `CSM_REQUIRE_STRONG_JWT=1`

## Data governance

```env
CSM_AUDIT_ENABLED=true
CSM_AUDIT_RETENTION_DAYS=90
```

- All table **create/update/delete** writes audit events to Pebble (`native/audit/`)
- Passwords, tokens, API keys **redacted** in audit metadata
- Retention purge runs at startup

## AI / embeddings

```env
AI_EMBEDDING_PROVIDER=auto   # auto | hash | llama
AI_EMBEDDING_HASH_DIMENSIONS=384
```

- `auto`: llama embeddings when native build available, else hash fallback
- `llama`: requires `go build -tags llamacpp`
- Circuit breaker: `CSM_LLAMA_BREAKER_FAILURES=5`, `CSM_LLAMA_BREAKER_COOLDOWN_MS=30000`

## Cloud native

### Docker

```bash
docker build -f backend-go/Dockerfile -t csm-go:latest .
docker run --rm -p 9999:9999 -e APP_DATA_DIR=/data -v csm_datas:/data csm-go:latest
```

### Kubernetes probes

```yaml
livenessProbe:
  httpGet: { path: /live, port: 9999 }
readinessProbe:
  httpGet: { path: /ready, port: 9999 }
```

## IaC / GitOps

- **CI**: `.github/workflows/backend-go-ci.yml` — vet, test, build on PR
- **Terraform**: `deploy/terraform/csm-go/` — systemd env + secret rotation hook

## Incident response

1. Check `/ready` and `/metrics`
2. Grafana dashboards: error rate, p99, `csm_llama_requests_total`
3. Audit trail: Pebble keys under `native/audit/audit.kv`
4. Llama circuit breaker state: logs + `csm_llama_requests_total{result="error"}`

## Maturity checklist

| Area | Status |
|------|--------|
| Prometheus metrics | ✅ |
| Structured logs | ✅ |
| Liveness/readiness | ✅ |
| SLO alert rules | ✅ |
| Audit log + PII redaction | ✅ |
| Auth rate limiting | ✅ |
| CORS allowlist | ✅ |
| Llama circuit breaker | ✅ |
| Real embeddings (llama) | ✅ with `-tags llamacpp` |
| Docker + CI | ✅ |
| Terraform stub | ✅ |
| OpenTelemetry traces | ✅ (`CSM_OTEL_ENABLED`) |
| Redis event bus | ✅ (`CSM_EVENT_BUS=redis`) |
| Prometheus production install | ✅ `install-prometheus-production.sh` |
| Transactional outbox | ✅ (`CSM_OUTBOX_ENABLED`) |
| Analytics lake (NDJSON) | ✅ (`CSM_LAKE_EXPORT_ENABLED`) |
| Data lineage + catalog | ✅ |
| GDPR DSR export/erase | ✅ (`CSM_GDPR_DSR_ENABLED`) |
| SLO error budget metric | ✅ |
| Grafana + Loki stack | ✅ `deploy/observability/docker-compose.yml` |
| Kafka / ClickHouse cluster | 🔜 upgrade triggers in `BIGDATA.md` |
| GDPR DSR automation | ✅ API layer |
