Place GGUF model files in `backend/csm_datas/ai_local/model/` (dev) or `csm_datas/ai_local/model/` (prod jar).

## Text worker — **1 file duy nhất** (M1 + Linux 5GB + strong dev)

| File | Vai trò |
|------|---------|
| `qwen2.5-coder-1.5b-instruct-q8_0.gguf` | Code, menu JSON, SEO, guest chat |

Tải: `./scripts/download-ai-local-models.sh worker`

Config keys (cùng path cho CODE + SEO):

```
AI_LOCAL_LLAMA_MODEL_PATH=./csm_datas/ai_local/model/qwen2.5-coder-1.5b-instruct-q8_0.gguf
AI_LOCAL_LLAMA_SEO_MODEL_PATH=./csm_datas/ai_local/model/qwen2.5-coder-1.5b-instruct-q8_0.gguf
AI_LOCAL_LLAMA_SWAP_MODELS=false
```

Character cutout (Lane 5): `u2netp.onnx` — auto-downloaded on first use.

If `ai.local.llama.fail-fast=true` and the worker file is missing, startup fails with a clear error.
