Place your GGUF model file in this folder.

Expected default file:
  qwen2.5-coder-1.5b-instruct-q4_k_m.gguf

Character cutout (Lane 5 S1):
  u2netp.onnx  (~4.7MB, auto-downloaded to csm_datas/models/u2netp.onnx on first extract)

Configured by environment variables (config.env) and application.properties:

  AI_LOCAL_LLAMA_MODEL_PATH      path to .gguf file
  AI_LOCAL_LLAMA_CONTEXT_WINDOW  8192  (runtime prompt budget ~29K chars)
  AI_LOCAL_LLAMA_MAX_TOKENS      512   (max output tokens per request)
  AI_LOCAL_LLAMA_RUNTIME_PROFILE balanced
  AI_LOCAL_LLAMA_THREADS         2     (effectiveThreads capped by CPU cores - 1)
  AI_LOCAL_LLAMA_BATCH_SIZE      64
  AI_LOCAL_LLAMA_UBATCH_SIZE     32
  ai.local.llama.gpu-layers      0     (CPU-only for weak machine)

If ai.local.llama.fail-fast=true and the file is missing, backend startup will fail with a clear error.

Strong machine overrides: see config.local-strong.env
  AI_LOCAL_LLAMA_CONTEXT_WINDOW=16384
  AI_LOCAL_LLAMA_MAX_TOKENS=1024
  AI_LOCAL_LLAMA_RUNTIME_PROFILE=balanced
  AI_LOCAL_LLAMA_THREADS=8
