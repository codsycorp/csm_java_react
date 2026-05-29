Place GGUF model files in `backend/csm_datas/ai_local/model/`.

Dual-lane (default):

| Lane | Model | Config key |
|------|-------|------------|
| CODE (menu JSON, DynamicCode, ai-code-stream) | `qwen2.5-coder-3b-instruct-q4_k_m.gguf` | `ai.local.llama.model-path` |
| SEO (bài viết, dịch EN/ZH) | `qwen2.5-3b-instruct-q4_k_m.gguf` | `ai.local.llama.seo-model-path` |

M1/16GB: `ai.local.llama.swap-models-on-lane-change=true` — chỉ 1 GGUF trong RAM, tự swap khi đổi lane.

Character cutout (Lane 5 S1):
  u2netp.onnx  (~4.7MB, auto-downloaded to csm_datas/models/u2netp.onnx on first extract)

Environment variables:

  AI_LOCAL_LLAMA_MODEL_PATH      CODE lane .gguf
  AI_LOCAL_LLAMA_SEO_MODEL_PATH  SEO lane .gguf
  AI_LOCAL_LLAMA_SWAP_MODELS     true/false (default true on M1)

If ai.local.llama.fail-fast=true and the CODE model file is missing, backend startup will fail with a clear error.
SEO model missing → SEO API fails; code/menu still works.
