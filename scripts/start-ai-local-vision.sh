#!/usr/bin/env bash
# Start local vision sidecar for CSM (weak-5gb friendly).
# Runs llama-server (SmolVLM2). Java backend calls OpenAI-compatible /v1/chat/completions directly.
#
# Usage:
#   ./scripts/start-ai-local-vision.sh           # SmolVLM2-256M-Video (default weak)
#   ./scripts/start-ai-local-vision.sh 500m    # SmolVLM2-500M-Video
#
# Then set in config.env:
#   AI_ORCHESTRATION_MULTIMODAL_VISION_ENABLED=true
#   AI_ORCHESTRATION_MULTIMODAL_VISION_ENDPOINT=http://127.0.0.1:8090/v1/chat/completions

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_DIR="$REPO_ROOT/backend/csm_datas/ai_local/model"
VARIANT="${1:-256m}"

LLAMA_PORT="${AI_LOCAL_VISION_LLAMA_PORT:-8090}"
THREADS="${AI_LOCAL_VISION_THREADS:-1}"
CTX="${AI_LOCAL_VISION_CTX:-4096}"

if ! command -v llama-server >/dev/null 2>&1; then
  echo "ERROR: llama-server not found. Install: brew install llama.cpp"
  exit 1
fi

case "$VARIANT" in
  256m|weak)
    MODEL="$MODEL_DIR/SmolVLM2-256M-Video-Instruct-Q8_0.gguf"
    MMPROJ="$MODEL_DIR/mmproj-SmolVLM2-256M-Video-Instruct-Q8_0.gguf"
    ;;
  500m|strong)
    MODEL="$MODEL_DIR/SmolVLM2-500M-Video-Instruct-Q8_0.gguf"
    MMPROJ="$MODEL_DIR/mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf"
    ;;
  qwen2vl2b)
    MODEL="$MODEL_DIR/Qwen2-VL-2B-Instruct-Q4_K_M.gguf"
    MMPROJ=""
    ;;
  *)
    echo "Unknown variant: $VARIANT (256m | 500m | qwen2vl2b)"
    exit 1
    ;;
esac

if [ ! -f "$MODEL" ]; then
  echo "ERROR: Missing model: $MODEL"
  echo "Run: ./scripts/download-ai-local-models.sh vision-weak"
  exit 1
fi

if [ -n "$MMPROJ" ] && [ ! -f "$MMPROJ" ]; then
  echo "ERROR: Missing mmproj: $MMPROJ"
  exit 1
fi

pkill -f "llama-server.*--port $LLAMA_PORT" 2>/dev/null || true
sleep 1

LLAMA_ARGS=(
  -m "$MODEL"
  --host 127.0.0.1
  --port "$LLAMA_PORT"
  -c "$CTX"
  -t "$THREADS"
  -ngl 0
)

if [ -n "$MMPROJ" ]; then
  LLAMA_ARGS+=(--mmproj "$MMPROJ")
fi

echo "Starting llama-server (vision) on :$LLAMA_PORT ..."
llama-server "${LLAMA_ARGS[@]}" &
LLAMA_PID=$!

cleanup() {
  kill "$LLAMA_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "Vision sidecar ready."
echo "  llama-server: http://127.0.0.1:${LLAMA_PORT}/"
echo "  chat API:     http://127.0.0.1:${LLAMA_PORT}/v1/chat/completions"
echo ""
echo "config.env:"
echo "  AI_ORCHESTRATION_MULTIMODAL_VISION_ENABLED=true"
echo "  AI_ORCHESTRATION_MULTIMODAL_VISION_ENDPOINT=http://127.0.0.1:${LLAMA_PORT}/v1/chat/completions"
echo ""
echo "Press Ctrl+C to stop."

wait "$LLAMA_PID"
