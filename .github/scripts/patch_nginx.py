"""
Surgical patch: insert AI location blocks before the first 'location / {'
in the server's existing nginx.conf.
Used as fallback when the full nginx.conf replacement fails nginx -t.
"""
import shutil
import sys

CONF = '/etc/nginx/nginx.conf'

with open(CONF) as fh:
    txt = fh.read()

if 'location = /ai-generate-seo-content' in txt:
    print('Already patched — skipping')
    sys.exit(0)

shutil.copy(CONF, CONF + '.bak')

AI_BLOCK = r"""
        # AI local SEO (no timeout — llama.cpp may be slow)
        location = /ai-generate-seo-content {
            proxy_pass http://127.0.0.1:9999;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $host;
            proxy_request_buffering off;
            proxy_buffering off;
            proxy_cache off;
            proxy_no_cache 1;
            proxy_cache_bypass 1;
            gzip off;
            proxy_connect_timeout 10s;
            proxy_send_timeout 86400s;
            proxy_read_timeout 86400s;
            send_timeout 86400s;
            add_header X-Accel-Buffering no always;
            add_header Cache-Control "no-store, no-cache" always;
        }
        location = /api/ai-generate-seo-content {
            proxy_pass http://127.0.0.1:9999;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $host;
            proxy_request_buffering off;
            proxy_buffering off;
            proxy_cache off;
            proxy_no_cache 1;
            proxy_cache_bypass 1;
            gzip off;
            proxy_connect_timeout 10s;
            proxy_send_timeout 86400s;
            proxy_read_timeout 86400s;
            send_timeout 86400s;
            add_header X-Accel-Buffering no always;
            add_header Cache-Control "no-store, no-cache" always;
        }"""

for marker in ['        location / {', '    location / {', '\tlocation / {']:
    idx = txt.find(marker)
    if idx != -1:
        txt = txt[:idx] + AI_BLOCK + '\n' + txt[idx:]
        with open(CONF, 'w') as fh:
            fh.write(txt)
        print('Surgical patch applied before: ' + repr(marker))
        sys.exit(0)

print('ERROR: could not find "location / {" marker in ' + CONF)
sys.exit(1)
