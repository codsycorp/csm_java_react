#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"
CONFIG_FILE="$ROOT_DIR/config.env"
BACKEND_DIR="$ROOT_DIR/backend"

print_help() {
  cat <<'EOF'
Usage: ./local-comfyui-run.sh [--install-comfy] [--comfy-path PATH] [--model-path PATH]

This helper will:
  1) load config.env if present
  2) verify python3 and optional ComfyUI dependencies
  3) verify COMFYUI_INSTALL_PATH and LTX_VIDEO_MODEL
  4) launch the backend with local AI settings

Options:
  --install-comfy    install Python deps for ComfyUI if requirements.txt exists
  --comfy-path PATH  override ComfyUI install directory
  --model-path PATH  override LTX-Video model path
  --help             show this message
EOF
}

SCRIPT_COMFYUI_PATH=""
SCRIPT_LTX_VIDEO_MODEL=""
INSTALL_COMFY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-comfy)
      INSTALL_COMFY=true
      shift
      ;;
    --comfy-path)
      SCRIPT_COMFYUI_PATH="$2"
      shift 2
      ;;
    --model-path)
      SCRIPT_LTX_VIDEO_MODEL="$2"
      shift 2
      ;;
    --help)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      print_help
      exit 1
      ;;
  esac
done

if [[ -f "$CONFIG_FILE" ]]; then
  echo "Loading configuration from $CONFIG_FILE"
  set -a
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
  set +a
else
  echo "Warning: $CONFIG_FILE not found. Continuing with environment overrides."
fi

COMFYUI_PATH="${SCRIPT_COMFYUI_PATH:-${COMFYUI_INSTALL_PATH:-}}"
LTX_VIDEO_MODEL="${SCRIPT_LTX_VIDEO_MODEL:-${LTX_VIDEO_MODEL:-}}"

if [[ -z "$COMFYUI_PATH" ]]; then
  read -rp "Enter ComfyUI install path (COMFYUI_INSTALL_PATH): " COMFYUI_PATH
fi

if [[ -z "$LTX_VIDEO_MODEL" ]]; then
  read -rp "Enter LTX-Video model path (LTX_VIDEO_MODEL): " LTX_VIDEO_MODEL
fi

if [[ -z "$COMFYUI_PATH" ]]; then
  echo "Error: COMFYUI_INSTALL_PATH is required." >&2
  exit 1
fi

if [[ -z "$LTX_VIDEO_MODEL" ]]; then
  echo "Error: LTX_VIDEO_MODEL is required." >&2
  exit 1
fi

if [[ ! -d "$COMFYUI_PATH" ]]; then
  echo "Error: ComfyUI install path does not exist: $COMFYUI_PATH" >&2
  exit 1
fi

if [[ ! -f "$LTX_VIDEO_MODEL" ]]; then
  echo "Warning: LTX_VIDEO_MODEL file not found: $LTX_VIDEO_MODEL"
  read -rp "Continue anyway? [y/N]: " yn
  case "$yn" in
    [Yy]*) ;;
    *) echo "Aborted."; exit 1;;
  esac
fi

if [[ "$INSTALL_COMFY" == true ]]; then
  if command -v python3 >/dev/null 2>&1; then
    echo "Installing ComfyUI Python dependencies..."
    if [[ -f "$COMFYUI_PATH/requirements.txt" ]]; then
      python3 -m pip install -r "$COMFYUI_PATH/requirements.txt"
    else
      echo "No requirements.txt found in $COMFYUI_PATH. Skipping install."
    fi
  else
    echo "Error: python3 is not installed or not in PATH." >&2
    exit 1
  fi
fi

if ! command -v mvn >/dev/null 2>&1; then
  echo "Error: mvn is not installed or not in PATH." >&2
  exit 1
fi

cd "$BACKEND_DIR"

export COMFYUI_INSTALL_PATH="$COMFYUI_PATH"
export LTX_VIDEO_MODEL="$LTX_VIDEO_MODEL"
export AI_LOCAL_ONLY_ENABLED="true"
export AI_LOCAL_LLAMA_ENABLED="true"

echo
echo "=== Starting backend with local ComfyUI settings ==="
echo "COMFYUI_INSTALL_PATH=$COMFYUI_INSTALL_PATH"
echo "LTX_VIDEO_MODEL=$LTX_VIDEO_MODEL"
echo "AI_LOCAL_ONLY_ENABLED=$AI_LOCAL_ONLY_ENABLED"
echo "AI_LOCAL_LLAMA_ENABLED=$AI_LOCAL_LLAMA_ENABLED"
echo

set -x
mvn -DskipTests spring-boot:run
