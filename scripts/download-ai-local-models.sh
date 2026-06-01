#!/usr/bin/env bash
# Download GGUF models for CSM AI Local
#
# TEXT WORKER (bắt buộc — 1 file duy nhất mọi máy, PHẦN Q master brief):
#   qwen2.5-coder-1.5b-instruct-q8_0.gguf
#
# Usage:
#   ./scripts/download-ai-local-models.sh worker     # default — Coder-1.5B Q8_0 (M1 + Linux 5GB + strong)
#   ./scripts/download-ai-local-models.sh server   # same worker → csm_datas/ (prod jar)
#   ./scripts/download-ai-local-models.sh m1-16gb  # same worker → backend/csm_datas/
#   ./scripts/download-ai-local-models.sh 5gb      # alias server
#   ./scripts/download-ai-local-models.sh strong   # worker + nomic embed + vision optional
#   ./scripts/download-ai-local-models.sh vision-weak
#   ./scripts/download-ai-local-models.sh embed
#   ./scripts/download-ai-local-models.sh list
#
# Legacy aliases (dual-3b, dual-3b, 3b) → worker 1.5B Q8_0 + warning

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSM_WORKER_GGUF="qwen2.5-coder-1.5b-instruct-q8_0.gguf"

resolve_model_dir() {
  case "${1:-server}" in
    5gb|weak|server|prod)
      echo "$REPO_ROOT/csm_datas/ai_local/model"
      ;;
    *)
      echo "$REPO_ROOT/backend/csm_datas/ai_local/model"
      ;;
  esac
}

PROFILE="${1:-worker}"
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

download_worker_1_5b_q8() {
  log "Text worker (single GGUF all machines): $CSM_WORKER_GGUF"
  download_hf "Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF" "$CSM_WORKER_GGUF"
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
  log "WARN: profile '$1' deprecated — CSM dùng 1 GGUF duy nhất: $CSM_WORKER_GGUF (PHẦN Q)"
}

case "$PROFILE" in
  worker|m1-16gb|m1-safe|m1|5gb|weak|server|prod)
    download_worker_1_5b_q8
    ;;
  dual-3b|3b|m1-1.5b)
    warn_legacy "$PROFILE"
    download_worker_1_5b_q8
    ;;
  strong|dev)
    log "Profile strong — worker 1.5B Q8_0 + nomic embed + vision optional"
    download_worker_1_5b_q8
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
  list)
    list_models
    exit 0
    ;;
  *)
    echo "Unknown profile: $PROFILE"
    echo "Profiles: worker | server | m1-16gb | 5gb | strong | vision-weak | vision-strong | embed | list"
    exit 1
    ;;
esac

list_models
log "Done."
