#!/usr/bin/env python3
"""
Bridge CSM AiMultimodalScannerService → llama-server OpenAI-compatible vision API.

Expected by Java (POST body JSON):
  { "prompt": "...", "imageBase64": "...", "mimeType": "image/jpeg" }

Returns:
  { "description": "..." }

Env:
  AI_LOCAL_VISION_LLAMA_URL  default http://127.0.0.1:8090/v1/chat/completions
  AI_LOCAL_VISION_PROXY_PORT default 8091
  AI_LOCAL_VISION_MODEL_NAME   default smolvlm
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


LLAMA_URL = os.environ.get(
    "AI_LOCAL_VISION_LLAMA_URL", "http://127.0.0.1:8090/v1/chat/completions"
)
PORT = int(os.environ.get("AI_LOCAL_VISION_PROXY_PORT", "8091"))
MODEL_NAME = os.environ.get("AI_LOCAL_VISION_MODEL_NAME", "smolvlm")


def call_llama(prompt: str, image_b64: str, mime: str) -> str:
    if not image_b64.strip():
        return ""
    mime = (mime or "image/jpeg").strip()
    payload = {
        "model": MODEL_NAME,
        "temperature": 0.1,
        "max_tokens": 512,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt or "Describe this image for software implementation."},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{image_b64}"},
                    },
                ],
            }
        ],
    }
    req = urllib.request.Request(
        LLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    choices = body.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(str(part.get("text") or ""))
        return "\n".join(p for p in parts if p).strip()
    return str(content or "").strip()


class VisionHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[vision-proxy] " + (fmt % args) + "\n")

    def _json_response(self, code: int, obj: dict) -> None:
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path in ("/", "/health"):
            self._json_response(200, {"ok": True, "llamaUrl": LLAMA_URL})
            return
        self._json_response(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length > 0 else b"{}"
            body = json.loads(raw.decode("utf-8") or "{}")
            prompt = str(body.get("prompt") or "")
            image_b64 = str(body.get("imageBase64") or body.get("image_base64") or "")
            mime = str(body.get("mimeType") or body.get("mime_type") or "image/jpeg")
            text = call_llama(prompt, image_b64, mime)
            self._json_response(200, {"description": text, "text": text, "content": text})
        except urllib.error.HTTPError as ex:
            detail = ex.read().decode("utf-8", errors="replace")
            self._json_response(502, {"ok": False, "error": "llama_http_error", "detail": detail[:800]})
        except Exception as ex:
            self._json_response(500, {"ok": False, "error": str(ex)})


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), VisionHandler)
    sys.stderr.write(f"[vision-proxy] listening http://127.0.0.1:{PORT} → {LLAMA_URL}\n")
    server.serve_forever()


if __name__ == "__main__":
    main()
