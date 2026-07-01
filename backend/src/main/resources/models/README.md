Place GGUF model files in `backend/csm_datas/ai_local/model/` (dev) or `csm_datas/ai_local/model/` (prod jar).

## Text worker — server production (8GB RAM / 4 CPU)

| File | Vai trò | RAM ước tính |
|------|---------|--------------|
| `qwen2.5-coder-1.5b-instruct-q8_0.gguf` | Code, menu JSON, SEO, guest chat, routing | ~1.6GB |

Tải mặc định: `./scripts/download-ai-local-models.sh 8gb`

Không cần tải model khác nếu bạn muốn thống nhất toàn bộ cấu hình.

Config (`config.local-8gb.env` / Go `./backend-go/run-go-server.sh`):

```
AI_LOCAL_LLAMA_MODEL_PATH=./csm_datas/ai_local/model/qwen2.5-coder-1.5b-instruct-q8_0.gguf
AI_LOCAL_LLAMA_SEO_MODEL_PATH=./csm_datas/ai_local/model/qwen2.5-coder-1.5b-instruct-q8_0.gguf
AI_LOCAL_LLAMA_CONTEXT_WINDOW=4096
AI_LOCAL_LLAMA_THREADS=3
```

## Text worker — dev M1 / strong

| File | Vai trò |
|------|---------|
| `qwen2.5-coder-1.5b-instruct-q8_0.gguf` | Code, SEO, guest chat, routing |

Tải: `./scripts/download-ai-local-models.sh m1-16gb` hoặc `strong`

Character cutout (Lane 5): `u2netp.onnx` — auto-downloaded on first use.

If `ai.local.llama.fail-fast=true` and the worker file is missing, startup fails with a clear error.
