#!/bin/bash
# Patch go-nativeml wrapper.cpp: chunked prompt prefill (batch=512 OK với prompt dài).
set -euo pipefail

GO_DIR="${1:?backend-go dir}"
cd "$GO_DIR"

SRC_DIR="$(go list -m -f '{{.Dir}}' github.com/footprintai/go-nativeml)"
CACHE_DIR="$GO_DIR/.cache/go-nativeml-patched"
WRAPPER="$CACHE_DIR/ggml/llamacpp/wrapper.cpp"

if [ -d "$CACHE_DIR" ]; then
    chmod -R u+w "$CACHE_DIR" 2>/dev/null || true
else
    mkdir -p "$(dirname "$CACHE_DIR")"
    cp -R "$SRC_DIR" "$CACHE_DIR"
    chmod -R u+w "$CACHE_DIR"
fi

if grep -q "Process prompt tokens in chunks of n_batch" "$WRAPPER" 2>/dev/null; then
    echo "[patch-nativeml] chunked prefill already applied"
else
    python3 - "$WRAPPER" <<'PY'
import sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
old = """    // Process prompt tokens in a single batch.
    llama_batch batch = llama_batch_init(n_tokens, 0, 1);
    for (int i = 0; i < n_tokens; i++) {
        batch.token[i]    = tokens[i];
        batch.pos[i]      = i;
        batch.n_seq_id[i] = 1;
        batch.seq_id[i][0] = 0;
        batch.logits[i]   = (i == n_tokens - 1) ? 1 : 0; // only compute logits for last token
    }
    batch.n_tokens = n_tokens;

    int rc = llama_decode(ctx, batch);
    llama_batch_free(batch);
    if (rc != 0) {
        common_sampler_free(smpl);
        set_error("llama_decode failed on prompt");
        return -1;
    }"""
new = """    // Process prompt tokens in chunks of n_batch (go-nativeml / llama.cpp limit).
    const int n_batch = (int) llama_n_batch(ctx);
    int rc = 0;
    for (int pos = 0; pos < n_tokens; ) {
        int chunk = n_tokens - pos;
        if (chunk > n_batch) {
            chunk = n_batch;
        }
        llama_batch batch = llama_batch_init(chunk, 0, 1);
        for (int i = 0; i < chunk; i++) {
            const int idx = pos + i;
            batch.token[i]    = tokens[idx];
            batch.pos[i]      = idx;
            batch.n_seq_id[i] = 1;
            batch.seq_id[i][0] = 0;
            batch.logits[i]   = (idx == n_tokens - 1) ? 1 : 0;
        }
        batch.n_tokens = chunk;
        rc = llama_decode(ctx, batch);
        llama_batch_free(batch);
        if (rc != 0) {
            common_sampler_free(smpl);
            set_error("llama_decode failed on prompt");
            return -1;
        }
        pos += chunk;
    }"""
if old not in text:
    raise SystemExit(f"[patch-nativeml] ERROR: wrapper.cpp pattern not found in {path}")
open(path, "w", encoding="utf-8").write(text.replace(old, new, 1))
print(f"[patch-nativeml] patched {path}")
PY
fi

if ! grep -q '^replace github.com/footprintai/go-nativeml ' go.mod 2>/dev/null; then
    go mod edit -replace="github.com/footprintai/go-nativeml=$CACHE_DIR"
    echo "[patch-nativeml] go.mod replace → $CACHE_DIR"
fi
