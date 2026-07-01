# Java Backend Parity — `backend-rust/`

**Mục tiêu:** Thay thế hoàn toàn `backend/` Spring Boot bằng Rust.

## Trạng thái hiện tại (~80% functional parity)

| Layer | Java | Rust | Ghi chú |
|-------|------|------|---------|
| API routes (70 paths) | ✅ | ✅ **100% wired** | Không 404 cho path đã biết |
| Auth / JWT / CRM | ✅ | ✅ | Login, refresh, 15 CRM endpoints |
| TableHandler | ~4500 LOC | ✅ core | scope, reserved IDs, e_where, bulk |
| Permission | 12 endpoints | ✅ | roles, matrix, assign, check |
| InitHandler | ✅ | ✅ | schema seed + admin startup |
| RecordManager | 48 methods | **35** | +search_keys, existsByPK, count, deleteDB |
| Socket.IO | 24 events | **24 wired** | chat, presence, sign-in, groups |
| Web SSR | WebSpringController | ✅ dynamic routes + sitemap + upload |
| AI SSE | ai-code-stream | ✅ **full stage pipeline** | started→pre_analysis→token→complete |
| AI REST | ApiSpringController | ✅ **20+ endpoints** | propose-edits, metrics, cancel, sessions |
| AI Services | 80 files | **48 registry + 14 impl** | menu-merge, RAG, embedding, ComfyUI stub |
| Media/WebRTC | Kurento | stub | `/api/media/call-status` |

## Chạy server

```bash
cd backend-rust
./run-rust-server.sh
# HTTP :15300  |  Socket.IO :15301
# Dùng chung RocksDB: csm_datas/database/
```

## Cấu hình AI (native in-process — không cần llama-cli / llama-server)

```env
AI_LOCAL_LLAMA_MODEL_PATH=./csm_datas/ai_local/model/qwen2.5-coder-1.5b-instruct-q8_0.gguf
AI_LOCAL_LLAMA_CONTEXT_WINDOW=8192
AI_LOCAL_LLAMA_MAX_TOKENS=2048
AI_LOCAL_LLAMA_THREADS=4
AI_LOCAL_LLAMA_GPU_LAYERS=18   # Mac Metal; 0 = CPU only
```

## Cấu trúc chính

```
backend-rust/src/
├── api/router.rs           # 70 API paths
├── controllers/
│   ├── ai_stream.rs        # SSE streaming
│   └── api_spring.rs       # AI REST endpoints
├── services/ai/
│   ├── code_stream.rs      # ai-code-stream pipeline (Java stages)
│   ├── services.rs         # 14 AI service implementations
│   └── registry.rs         # 48 Java service names
├── socket/events.rs        # 24 Socket.IO events
├── web/ssr.rs              # Dynamic SSR + sitemap
├── web/upload.rs           # File upload
└── data/record_manager.rs  # RocksDB + Tantivy
```

## Còn thiếu so với Java 100% line-by-line

- `ApiSpringController.java` ~41k LOC: một số edge-case (agentic approval loop, large-file chunking 50+ stage) — logic cốt lõi đã có
- Kurento WebRTC call rooms
- Kafka producer (optional feature flag)
- Headless browser cho `/execute-js-on-page`

Các phần trên không chặn chạy production cho API/CRM/Chat/AI streaming cơ bản.
