# Java / Rust / Go parity matrix

Legend: **Done** = implemented | **Partial** = basic/minimal | **Defer** = not started

## Auth

| Path | Go |
|------|-----|
| `/login` | Done |
| `/logout` | Done |
| `/refresh-token` | Done |
| `/user-info` | Done |
| `/register` | Done |
| `/create-sub-user` | Done |
| `/get-async-routes` | Done |

## Tables

| Path | Go |
|------|-----|
| `/get-table-data` | Done (ACL, filters, pagination, row filters) |
| `/update-table-data` | Done (create/update/delete, password change, merge) |
| `/create-table` | Done |
| `/drop-table` | Done (Pebble prefix delete) |
| `/bulk-update-table-data` | Done |
| `/update-table-data-index` | Done (FTS5 reindex via Pebble scan) |
| `/backupdb` | Partial (defer — backup Pebble dir manually) |
| `/restoredb` | Partial (defer) |
| `/migrateKeys` | Done (no-op for Pebble) |

## Menu / Role / Home

| Path | Go |
|------|-----|
| `/menu-list` | Done (`csm/index` → `menuList`, permission filter) |
| `/menu-by-role-id` | Done (`menuR`) |
| `/menu-item` | Done (POST/PUT/DELETE) |
| `/role-list` | Done (`roleList`) |
| `/role-item` | Done |
| `/role-menu` | Done |
| `/home*` | Done (mock stats like Java) |
| `/notifications` | Done (mock) |
| `/home/googlebot` | Done (read/delete visits) |
| `/create-default-data` | Done (+ auto-init on startup) |

## CRM

| Path | Go |
|------|-----|
| `/crm/*` | Done (customers, assign, status, purchase, contact, stats, ads) |

## Chat / AI / Social / Scrape

| Path | Go |
|------|-----|
| `/scrape-web` | Done (HTTP GET + proxy) |
| `/execute-js-on-page` | Done (stub — cần headless sidecar) |
| `/indexgoogle` | Done (submit/check/quota/queue/history — Google Indexing API) |
| `/ai-generate-seo-content` | Done (local llama native + SEO one-shot pipelines) |
| `/ai-local/health`, `/models`, `/services` | Done |
| `/ai-local/execute-local-plan` | Done (menu_json + code SSE completion) |
| `/ai-code-stream` | Done (menu merge + apply flags + knowledge prompts) |
| `/ai-code-stream/menu-editor-apply`, `/ai/menu-merge` | Done |
| `/facebook/*` | Done (post, post-with-images, me, exchange-token, pages) |
| `/facebook/ads/campaign`, `/google/ads/campaign` | Done (→ CRM create ad) |
| `/apps-list` | Done |
| `/chat-history*` | Defer |

## Web

| Path | Go |
|------|-----|
| Static / SPA | Basic |
| `/ssr/*` | Stub |
| `/seo` | Partial (returns empty meta; no Jsoup scrape) |

## Data layer

- **Runtime:** Pebble KV (`backend/csm_datas/native/pebble/csm.kv`)
- **Migrate:** `rocksdb_ldb scan` → Pebble (+ sqlite-vec offline)
- **Search at runtime:** FTS5 (`vectors.db` / `records_fts`) for `like` filters; Pebble full scan otherwise

## Remaining gaps vs Java

1. ~~Lucene/sqlite-vec wired into live table queries~~ → FTS5 wired for `like`; vector search (ai_chunks) still offline
2. Socket.IO real-time + chat HTTP endpoints
3. Full AI orchestration (RAG multimodal vision, agent harness quality-gate early audit — partial menu merge/apply parity added)
4. Web SSR (categories/tags/reviews)
5. SEO scrape via Jsoup in `/seo` handler ( `/scrape-web` works)
6. Pebble backup/restore API (use filesystem backup today)
7. ~~Native in-process llama~~ **Done** (`-tags llamacpp` + `go-nativeml`; giống Java JNI)
