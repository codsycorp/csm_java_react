#!/bin/bash

set -e

MODEL_PATH="/Volumes/Datas/CSM/JavaProjects/csm_server/backend/csm_datas/ai_local/model/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"

LLAMA_PORT="8888"
TABBY_PORT="8080"

CTX_SIZE="4096"
THREADS="1"
BATCH="32"
UBATCH="16"

USER_NAME="$(whoami)"
HOME_DIR="$HOME"

echo ""
echo "=================================================="
echo " TABBY + LLAMA AUTO INSTALL"
echo "=================================================="
echo ""

echo "User:  $USER_NAME"
echo "Home:  $HOME_DIR"
echo "Model: $MODEL_PATH"
echo ""

if [ ! -f "$MODEL_PATH" ]; then
  echo "ERROR: Không thấy model:"
  echo "$MODEL_PATH"
  exit 1
fi

echo "==> Dừng Ollama / AnythingLLM / service cũ..."

pkill -f ollama || true
pkill -f AnythingLLM || true
pkill -f "llm serve" || true
pkill -f llama-server || true
pkill -f "tabby serve" || true

if ! command -v brew >/dev/null 2>&1; then
  echo "ERROR: Chưa có Homebrew. Cài Homebrew trước rồi chạy lại."
  exit 1
fi

echo "==> Cài / kiểm tra llama.cpp..."

if ! command -v llama-server >/dev/null 2>&1; then
  brew install llama.cpp
fi

LLAMA_BIN="$(command -v llama-server)"

echo "==> Cài / kiểm tra Tabby..."

if ! brew list tabbyml/tabby/tabby >/dev/null 2>&1; then
  brew install tabbyml/tabby/tabby
fi

TABBY_PREFIX="$(brew --prefix tabbyml/tabby/tabby)"
TABBY_BIN="$TABBY_PREFIX/bin/tabby"

if [ ! -x "$TABBY_BIN" ]; then
  echo "ERROR: Không tìm thấy Tabby binary tại:"
  echo "$TABBY_BIN"
  echo ""
  echo "Thử kiểm tra:"
  echo "brew list tabbyml/tabby/tabby"
  exit 1
fi

echo ""
echo "llama-server: $LLAMA_BIN"
echo "tabby:        $TABBY_BIN"
echo ""

mkdir -p "$HOME_DIR/scripts"
mkdir -p "$HOME_DIR/.tabby"
mkdir -p "$HOME_DIR/Library/LaunchAgents"

echo "==> Tạo start-llama.sh..."

cat > "$HOME_DIR/scripts/start-llama.sh" <<EOF
#!/bin/bash

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

pkill -f llama-server || true
sleep 2

"$LLAMA_BIN" \\
  -m "$MODEL_PATH" \\
  --host 127.0.0.1 \\
  --port $LLAMA_PORT \\
  -c $CTX_SIZE \\
  -t $THREADS \\
  -b $BATCH \\
  -ub $UBATCH \\
  --no-mmap
EOF

chmod +x "$HOME_DIR/scripts/start-llama.sh"

echo "==> Tạo ~/.tabby/config.toml..."

cat > "$HOME_DIR/.tabby/config.toml" <<EOF
[model.chat.http]
kind = "openai/chat"
api_endpoint = "http://127.0.0.1:$LLAMA_PORT/v1"
api_key = "none"
model_name = "qwen-vl-3b"
EOF

echo "==> Tạo start-tabby.sh..."

cat > "$HOME_DIR/scripts/start-tabby.sh" <<EOF
#!/bin/bash

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

pkill -f "tabby serve" || true
sleep 10

"$TABBY_BIN" serve \\
  --device cpu \\
  --host 0.0.0.0 \\
  --port $TABBY_PORT
EOF

chmod +x "$HOME_DIR/scripts/start-tabby.sh"

echo "==> Tạo LaunchAgent llama..."

cat > "$HOME_DIR/Library/LaunchAgents/com.local.llama.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
"http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.local.llama</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$HOME_DIR/scripts/start-llama.sh</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/tmp/llama.stdout.log</string>

  <key>StandardErrorPath</key>
  <string>/tmp/llama.stderr.log</string>
</dict>
</plist>
EOF

echo "==> Tạo LaunchAgent tabby..."

cat > "$HOME_DIR/Library/LaunchAgents/com.local.tabby.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
"http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.local.tabby</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$HOME_DIR/scripts/start-tabby.sh</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/tmp/tabby.stdout.log</string>

  <key>StandardErrorPath</key>
  <string>/tmp/tabby.stderr.log</string>
</dict>
</plist>
EOF

echo "==> Reload launchctl..."

launchctl unload "$HOME_DIR/Library/LaunchAgents/com.local.llama.plist" 2>/dev/null || true
launchctl unload "$HOME_DIR/Library/LaunchAgents/com.local.tabby.plist" 2>/dev/null || true

sleep 2

launchctl load "$HOME_DIR/Library/LaunchAgents/com.local.llama.plist"
launchctl load "$HOME_DIR/Library/LaunchAgents/com.local.tabby.plist"

echo "==> Đợi service khởi động..."
sleep 15

echo ""
echo "=================================================="
echo " STATUS"
echo "=================================================="
echo ""

echo "Llama port:"
lsof -i :$LLAMA_PORT || true

echo ""
echo "Tabby port:"
lsof -i :$TABBY_PORT || true

echo ""
echo "Test Llama:"
curl -s "http://127.0.0.1:$LLAMA_PORT/v1/models" || true

echo ""
echo ""
echo "=================================================="
echo " DONE"
echo "=================================================="
echo ""
echo "Tabby URL:"
echo "http://127.0.0.1:$TABBY_PORT"
echo ""
echo "VSCode Tabby server:"
echo "http://127.0.0.1:$TABBY_PORT"
echo ""
echo "Logs:"
echo "tail -f /tmp/llama.stderr.log"
echo "tail -f /tmp/tabby.stderr.log"
echo ""
