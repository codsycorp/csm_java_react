#!/usr/bin/env bash
# CSM Knowledge Pack — quét, nạp, export/import Lucene vector + learning memory
# để chép sang máy khác mà AI local không phải học lại từ đầu.
#
# Usage:
#   ./scripts/csm-knowledge-pack.sh status
#   ./scripts/csm-knowledge-pack.sh rebuild [--full-code] [--api http://127.0.0.1:15300]
#   ./scripts/csm-knowledge-pack.sh export [output.tar.gz]
#   ./scripts/csm-knowledge-pack.sh import path/to/csm-knowledge-pack.tar.gz
#   ./scripts/csm-knowledge-pack.sh verify path/to/csm-knowledge-pack.tar.gz
#
# Quy trình khuyến nghị:
#   1. Trên máy MẠNH: rebuild --full-code → export → copy file .tar.gz
#   2. Trên máy YẾU 5GB: import → restart backend (giữ AI_EMBEDDING_PROVIDER=hash nếu dim=128)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KNOWLEDGE_DIR="$REPO_ROOT/backend/csm_datas/ai_local"
PACK_STAGING="$REPO_ROOT/backend/csm_datas/.knowledge_pack_staging"
API_BASE="${CSM_API_BASE:-http://127.0.0.1:15300}"

log() { printf '[csm-knowledge-pack] %s\n' "$*"; }

curl_api() {
  local method="$1"
  local url="$2"
  local auth_args=()
  if [ -n "${CSM_AUTH_TOKEN:-}" ]; then
    auth_args=(-H "Authorization: Bearer ${CSM_AUTH_TOKEN}")
  fi
  local body http_code
  body="$(mktemp)"
  if [ "${#auth_args[@]}" -gt 0 ]; then
    http_code="$(curl -sS -o "$body" -w "%{http_code}" -X "$method" "${auth_args[@]}" "$url")"
  else
    http_code="$(curl -sS -o "$body" -w "%{http_code}" -X "$method" "$url")"
  fi
  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    cat "$body"
    rm -f "$body"
    return 0
  fi
  log "HTTP $http_code from $url"
  if [ -s "$body" ]; then
    cat "$body"
    echo ""
  fi
  rm -f "$body"
  if [ "$http_code" = "401" ]; then
    log "Hint: restart backend (Jwt filter permit /api/ai-local) or set CSM_AUTH_TOKEN=your_jwt"
  elif [ "$http_code" = "403" ]; then
    log "Hint: CSRF blocked — restart backend (Csrf filter skip /api/ai-local) or use logged-in X-CSRF-Token"
  fi
  return 1
}

resolve_knowledge_dir() {
  if [ -d "$KNOWLEDGE_DIR" ]; then
    echo "$KNOWLEDGE_DIR"
    return
  fi
  if [ -d "$REPO_ROOT/csm_datas/ai_local" ]; then
    echo "$REPO_ROOT/csm_datas/ai_local"
    return
  fi
  echo "$KNOWLEDGE_DIR"
}

write_manifest() {
  local dest_dir="$1"
  local embed_dim="${2:-128}"
  local embed_provider="${3:-hash}"
  cat > "$dest_dir/manifest.json" <<EOF
{
  "packVersion": "1.0",
  "createdAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "repo": "csm_server",
  "embeddingDimensions": ${embed_dim},
  "embeddingProvider": "${embed_provider}",
  "includes": [
    "ai_business_memory",
    "ai_local_assistant_index",
    "ai_menu_learning_*.jsonl",
    "ai_code_learning_*.jsonl",
    "author_style_dna.md",
    "ai_code_master_prompt.md",
    "ai_menu_master_prompt.md",
    "ai-assistant-instructions.md"
  ],
  "importNotes": "On weak-5gb keep AI_EMBEDDING_PROVIDER=hash when embeddingDimensions=128. Do not re-embed on import — copy Lucene dirs as-is."
}
EOF
}

cmd_status() {
  local dir
  dir="$(resolve_knowledge_dir)"
  log "Knowledge base: $dir"
  if command -v curl >/dev/null 2>&1; then
    if curl_api GET "$API_BASE/api/ai-local/knowledge/status" 2>/dev/null | python3 -m json.tool 2>/dev/null; then
      :
    else
      log "(backend API not reachable or error — offline dir scan only)"
    fi
  fi
  echo ""
  du -sh "$dir"/* 2>/dev/null || true
  ls -la "$dir"/ai_menu_learning_*.jsonl 2>/dev/null || log "(no menu learning files yet)"
  ls -la "$dir"/ai_code_learning_*.jsonl 2>/dev/null || log "(no code learning files yet)"
  if [ -f "$dir/author_style_dna.md" ]; then
    log "author_style_dna.md: present ($(wc -l < "$dir/author_style_dna.md") lines)"
  else
    log "author_style_dna.md: missing — copy template from repo and customize"
  fi
}

cmd_rebuild() {
  local full_code=true
  local api="$API_BASE"
  while [ $# -gt 0 ]; do
    case "$1" in
      --full-code) full_code=true; shift ;;
      --markdown-only) full_code=false; shift ;;
      --api) api="$2"; shift 2 ;;
      *) log "Unknown arg: $1"; exit 1 ;;
    esac
  done
  log "Trigger workspace rebuild fullCode=$full_code via $api"
  log "(full-code scan có thể mất vài phút — đợi backend log xong)"
  curl_api POST "$api/api/ai-local/knowledge/rebuild-workspace?fullCode=$full_code&appId=csm" | python3 -m json.tool
  log "Trigger tenant org snapshot ingest"
  curl_api POST "$api/api/ai-local/knowledge/ingest-tenant?appId=csm" | python3 -m json.tool
  log "Done. Run: ./scripts/csm-knowledge-pack.sh export"
}

cmd_export() {
  local dir out embed_dim embed_provider
  dir="$(resolve_knowledge_dir)"
  out="${1:-$REPO_ROOT/csm-knowledge-pack-$(date +%Y%m%d-%H%M%S).tar.gz}"
  embed_dim=128
  embed_provider=hash
  if command -v curl >/dev/null 2>&1; then
    embed_dim="$(curl_api GET "$API_BASE/api/ai-local/knowledge/status" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('embedding',{}).get('dimension',128))" 2>/dev/null || echo 128)"
    embed_provider="$(curl_api GET "$API_BASE/api/ai-local/knowledge/status" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('embedding',{}).get('resolvedProvider','hash'))" 2>/dev/null || echo hash)"
  fi
  rm -rf "$PACK_STAGING"
  mkdir -p "$PACK_STAGING/csm_datas/ai_local"
  write_manifest "$PACK_STAGING" "$embed_dim" "$embed_provider"
  for item in ai_business_memory ai_local_assistant_index author_style_dna.md \
    ai_code_master_prompt.md ai_menu_master_prompt.md ai-assistant-instructions.md; do
    if [ -e "$dir/$item" ]; then
      cp -R "$dir/$item" "$PACK_STAGING/csm_datas/ai_local/" 2>/dev/null || cp "$dir/$item" "$PACK_STAGING/csm_datas/ai_local/"
    fi
  done
  for f in "$dir"/ai_menu_learning_*.jsonl; do
    [ -f "$f" ] && cp "$f" "$PACK_STAGING/csm_datas/ai_local/"
  done
  for f in "$dir"/ai_code_learning_*.jsonl; do
    [ -f "$f" ] && cp "$f" "$PACK_STAGING/csm_datas/ai_local/"
  done
  tar -czf "$out" -C "$PACK_STAGING" .
  rm -rf "$PACK_STAGING"
  log "Exported: $out ($(du -h "$out" | awk '{print $1}'))"
  log "Copy to target machine and run: ./scripts/csm-knowledge-pack.sh import $out"
}

cmd_import() {
  local archive="${1:?usage: import path/to/pack.tar.gz}"
  local dir tmp
  dir="$(resolve_knowledge_dir)"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  tar -xzf "$archive" -C "$tmp"
  local manifest="$tmp/manifest.json"
  if [ ! -f "$manifest" ]; then
    log "ERROR: manifest.json missing in pack"
    exit 1
  fi
  log "Manifest:"
  python3 -m json.tool "$manifest"
  local pack_dim
  pack_dim="$(python3 -c "import json; print(json.load(open('$manifest')).get('embeddingDimensions',128))")"
  log "Pack embeddingDimensions=$pack_dim — target weak-5gb should use AI_EMBEDDING_PROVIDER=hash when dim=128"
  mkdir -p "$dir"
  cp -R "$tmp/csm_datas/ai_local/"* "$dir/"
  log "Imported into $dir"
  log "Restart backend. Verify: ./scripts/csm-knowledge-pack.sh status"
}

cmd_verify() {
  local archive="${1:?usage: verify path/to/pack.tar.gz}"
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  tar -xzf "$archive" -C "$tmp"
  python3 -m json.tool "$tmp/manifest.json"
  find "$tmp" -type f | head -40
  log "OK"
}

main() {
  local cmd="${1:-status}"
  shift || true
  case "$cmd" in
    status) cmd_status "$@" ;;
    rebuild) cmd_rebuild "$@" ;;
    export) cmd_export "$@" ;;
    import) cmd_import "$@" ;;
    verify) cmd_verify "$@" ;;
    *)
      echo "Usage: $0 {status|rebuild|export|import|verify}"
      exit 1
      ;;
  esac
}

main "$@"
