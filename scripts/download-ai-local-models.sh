#!/usr/bin/env bash
# Download GGUF models for CSM AI Local
#
# TEXT WORKER (mặc định): qwen2.5-coder-7b-instruct-q4_k_m.gguf
# Tùy chọn RAM thấp: qwen2.5-coder-1.5b-instruct-q8_0.gguf (profile worker-1.5b)
#
# Usage:
#   ./scripts/download-ai-local-models.sh            # default — 7B Q4_K_M
#   ./scripts/download-ai-local-models.sh 8gb       # prod/server → csm_datas/
#   ./scripts/download-ai-local-models.sh server   # alias 8gb
#   ./scripts/download-ai-local-models.sh m1-16gb  # dev M1 → backend/csm_datas/
#   ./scripts/download-ai-local-models.sh worker-1.5b  # legacy 1.5B Q8_0 only
#   ./scripts/download-ai-local-models.sh strong   # worker + nomic embed + vision optional
#   ./scripts/download-ai-local-models.sh vision-weak
#   ./scripts/download-ai-local-models.sh vision-qwen2vl-2b   # Qwen2-VL-2B Q4_K_M (sidecar strong)
#   ./scripts/download-ai-local-models.sh qwen2-vl-2b-server # → csm_datas/ (prod jar)
#   ./scripts/download-ai-local-models.sh embed
#   ./scripts/download-ai-local-models.sh list
#
# Legacy aliases (dual-3b, dual-3b, 3b) → worker 1.5B Q8_0 + warning

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSM_WORKER_GGUF_7B="qwen2.5-coder-7b-instruct-q4_k_m.gguf"
CSM_WORKER_GGUF_1_5B="qwen2.5-coder-1.5b-instruct-q8_0.gguf"

resolve_model_dir() {
  case "${1:-server}" in
    8gb|7b|server|prod)
      echo "$REPO_ROOT/csm_datas/ai_local/model"
      ;;
    *)
      echo "$REPO_ROOT/backend/csm_datas/ai_local/model"
      ;;
  esac
}

PROFILE="${1:-8gb}"
MODEL_DIR="$(resolve_model_dir "$PROFILE")"
mkdir -p "$MODEL_DIR"

log() { printf '[download-ai-local-models] %s\n' "$*"; }

download_hf() {
  local repo="$1"
  shift
  local files=("$@")
  if command -v hf >/dev/null 2>&1; then
    log "hf download $repo (${#files[@]} files) → $MODEL_DIR"
    hf download "$repo" "${files[@]}" --local-dir "$MODEL_DIR"
    return
  fi
  if command -v huggingface-cli >/dev/null 2>&1; then
    log "huggingface-cli download $repo (${#files[@]} files) → $MODEL_DIR"
    huggingface-cli download "$repo" "${files[@]}" --local-dir "$MODEL_DIR"
    return
  fi
  local base="https://huggingface.co/${repo}/resolve/main"
  for f in "${files[@]}"; do
    local dest="$MODEL_DIR/$f"
    if [ -f "$dest" ]; then
      log "skip (exists): $f"
      continue
    fi
    log "curl: $f"
    curl -L --fail --retry 3 --continue-at - \
      -o "$dest" \
      "${base}/${f}"
  done
}

download_worker_7b_q4() {
  log "Text worker (server 8GB): $CSM_WORKER_GGUF_7B"
  download_hf "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF" "$CSM_WORKER_GGUF_7B"
}

download_worker_1_5b_q8() {
  log "Text worker (dev / máy yếu): $CSM_WORKER_GGUF_1_5B"
  download_hf "Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF" "$CSM_WORKER_GGUF_1_5B"
}

download_embed_nomic() {
  download_hf "nomic-ai/nomic-embed-text-v1.5-GGUF" \
    "nomic-embed-text-v1.5.Q4_K_M.gguf"
}

download_vision_smolvlm256_video() {
  download_hf "ggml-org/SmolVLM2-256M-Video-Instruct-GGUF" \
    "SmolVLM2-256M-Video-Instruct-Q8_0.gguf" \
    "mmproj-SmolVLM2-256M-Video-Instruct-Q8_0.gguf"
}

download_vision_smolvlm500_video() {
  download_hf "ggml-org/SmolVLM2-500M-Video-Instruct-GGUF" \
    "SmolVLM2-500M-Video-Instruct-Q8_0.gguf" \
    "mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf"
}

download_vision_qwen2vl_2b() {
  download_hf "ggml-org/Qwen2-VL-2B-Instruct-GGUF" \
    "Qwen2-VL-2B-Instruct-Q4_K_M.gguf"
}

list_models() {
  log "Model directory: $MODEL_DIR"
  ls -lh "$MODEL_DIR"/*.gguf 2>/dev/null || log "(no .gguf files yet)"
}

warn_legacy() {
  log "WARN: profile '$1' deprecated — dùng $CSM_WORKER_GGUF_7B (worker-1.5b chỉ khi thiếu RAM)"
}

case "$PROFILE" in
  8gb|7b|server|prod)
    download_worker_7b_q4
    ;;
  worker-1.5b|m1-1.5b)
    download_worker_1_5b_q8
    ;;
  worker|m1-16gb|m1-safe|m1)
    download_worker_7b_q4
    ;;
  dual-3b|3b)
    warn_legacy "$PROFILE"
    download_worker_7b_q4
    ;;
  strong|dev)
    log "Profile strong — worker 7B Q4_K_M + nomic embed + vision optional"
    download_worker_7b_q4
    download_embed_nomic
    download_vision_qwen2vl_2b
    download_vision_smolvlm500_video
    ;;
  vision-weak)
    download_vision_smolvlm256_video
    ;;
  vision-strong)
    download_vision_smolvlm500_video
    download_vision_qwen2vl_2b
    ;;
  embed)
    download_embed_nomic
    ;;
  qwen2-vl-2b|vision-qwen2vl-2b)
    download_vision_qwen2vl_2b
    ;;
  qwen2-vl-2b-server|vision-qwen2vl-2b-server)
    MODEL_DIR="$REPO_ROOT/csm_datas/ai_local/model"
    mkdir -p "$MODEL_DIR"
    download_vision_qwen2vl_2b
    ;;
  list)
    list_models
    exit 0
    ;;
  *)
    echo "Unknown profile: $PROFILE"
    echo "Profiles: 8gb | server | m1-16gb | m1 | strong | worker-1.5b | vision-weak | vision-strong | qwen2-vl-2b | embed | list"
    exit 1
    ;;
esac

list_models
log "Done."
