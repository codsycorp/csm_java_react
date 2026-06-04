Place GGUF model files in `backend/csm_datas/ai_local/model/` (dev) or `csm_datas/ai_local/model/` (prod jar).

## Text worker — server production (8GB RAM / 4 CPU)

| File | Vai trò |
|------|---------|
| `qwen2.5-coder-7b-instruct-q4_k_m.gguf` | Code, menu JSON, SEO, guest chat |

Tải: `./scripts/download-ai-local-models.sh 8gb`

Config (`config.local-8gb.env` / `./run-server.sh`):

```
AI_LOCAL_LLAMA_MODEL_PATH=./csm_datas/ai_local/model/qwen2.5-coder-7b-instruct-q4_k_m.gguf
AI_LOCAL_LLAMA_SEO_MODEL_PATH=./csm_datas/ai_local/model/qwen2.5-coder-7b-instruct-q4_k_m.gguf
AI_LOCAL_LLAMA_SWAP_MODELS=false
```

## Text worker — dev M1 / strong (mặc định cùng 7B)

| File | Vai trò |
|------|---------|
| `qwen2.5-coder-7b-instruct-q4_k_m.gguf` | Code, SEO, guest chat |

Tải: `./scripts/download-ai-local-models.sh m1-16gb` hoặc `strong`

Legacy RAM thấp: `qwen2.5-coder-1.5b-instruct-q8_0.gguf` — `./scripts/download-ai-local-models.sh worker-1.5b`

Character cutout (Lane 5): `u2netp.onnx` — auto-downloaded on first use.

If `ai.local.llama.fail-fast=true` and the worker file is missing, startup fails with a clear error.
