#!/usr/bin/env bash
# Download GGUF models for CSM AI Local into backend/csm_datas/ai_local/model/
#
# Usage:
#   ./scripts/download-ai-local-models.sh 5gb            # weak server 1.5B (5GB RAM, 2 CPU)
#   ./scripts/download-ai-local-models.sh strong         # dev machine 32GB
#   ./scripts/download-ai-local-models.sh vision-weak    # SmolVLM2-256M video only
#   ./scripts/download-ai-local-models.sh embed          # nomic embed only
#   ./scripts/download-ai-local-models.sh dual-3b       # Coder-3B + Instruct-3B (M1 dual-lane)
#   ./scripts/download-ai-local-models.sh list           # show disk usage
#
# Requires: curl OR huggingface-cli (pip install huggingface_hub)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_DIR="$REPO_ROOT/backend/csm_datas/ai_local/model"
mkdir -p "$MODEL_DIR"

PROFILE="${1:-5gb}"

log() { printf '[download-ai-local-models] %s\n' "$*"; }

have_hf_cli() { command -v hf >/dev/null 2>&1 || command -v huggingface-cli >/dev/null 2>&1; }

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

download_reasoning_coder_3b() {
  download_hf "Qwen/Qwen2.5-Coder-3B-Instruct-GGUF" \
    "qwen2.5-coder-3b-instruct-q4_k_m.gguf"
}

download_reasoning_instruct_3b_seo() {
  download_hf "Qwen/Qwen2.5-3B-Instruct-GGUF" \
    "qwen2.5-3b-instruct-q4_k_m.gguf"
}

download_reasoning_1_5b() {
  download_hf "Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF" \
    "qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"
}

download_reasoning_0_5b() {
  download_hf "Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF" \
    "qwen2.5-coder-0.5b-instruct-q4_k_m.gguf"
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

case "$PROFILE" in
  dual-3b|m1|3b)
    log "Profile dual-3b — CODE Coder-3B + SEO Instruct-3B (Q4_K_M, ~4GB total)"
    download_reasoning_coder_3b
    download_reasoning_instruct_3b_seo
    ;;
  5gb|weak)
    log "Profile 5gb — reasoning 1.5B + vision SmolVLM2-256M-Video (sidecar, on-demand)"
    download_reasoning_1_5b
    download_vision_smolvlm256_video
    log "Optional: run with 'embed' profile for nomic (enable only when vision sidecar is stopped)"
    ;;
  strong|dev)
    log "Profile strong — reasoning 1.5B + nomic embed + Qwen2-VL-2B"
    download_reasoning_1_5b
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
  ultra)
    download_reasoning_0_5b
    download_reasoning_1_5b
    download_embed_nomic
    download_vision_smolvlm256_video
    download_vision_smolvlm500_video
    download_vision_qwen2vl_2b
    ;;
  list)
    list_models
    exit 0
    ;;
  *)
    echo "Unknown profile: $PROFILE"
    echo "Profiles: dual-3b | 5gb | strong | vision-weak | vision-strong | embed | ultra | list"
    exit 1
    ;;
esac

list_models
log "Done."
