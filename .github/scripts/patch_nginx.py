"""
Surgical patch: insert AI location blocks into the server block
that handles api.csmbridge.net / admin.csmbridge.net.
Used as fallback when the full nginx.conf replacement fails nginx -t.
"""
import shutil
import sys
import re

CONF = '/etc/nginx/nginx.conf'

with open(CONF) as fh:
    txt = fh.read()

# Find the server block that has api.csmbridge.net in server_name
sn_match = re.search(r'server_name\s+[^\n;]*api\.csmbridge\.net[^\n;]*;', txt)
if not sn_match:
    print('ERROR: No server block with api.csmbridge.net found in ' + CONF)
    sys.exit(1)

sn_start = sn_match.start()

# Find the end of this server block (next top-level 'server {' or end of file)
next_server = re.search(r'\n\s{0,4}server\s*\{', txt[sn_start + 1:])
server_block_end = sn_start + 1 + next_server.start() if next_server else len(txt)

server_block_txt = txt[sn_start:server_block_end]

# Check if AI blocks are already in THIS server block
if 'location = /ai-generate-seo-content' in server_block_txt:
    print('Already patched in api.csmbridge.net server block — skipping')
    sys.exit(0)

shutil.copy(CONF, CONF + '.bak')

AI_BLOCK = r"""
        # SEO sync lane: one HTTP holds until final JSON (no client job poll).
        location = /ai-generate-seo-content {
            proxy_pass http://backend_pool;
            proxy_http_version 1.1;
            proxy_pass_request_headers on;
            proxy_pass_request_body on;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $host;
            proxy_set_header X-Forwarded-Port $server_port;
            proxy_set_header Authorization $http_authorization;
            proxy_set_header Cookie $http_cookie;

            proxy_request_buffering off;
            proxy_buffering off;
            proxy_cache off;
            proxy_no_cache 1;
            proxy_cache_bypass 1;

            gzip off;
            chunked_transfer_encoding on;

            proxy_connect_timeout 10s;
            proxy_send_timeout 86400s;
            proxy_read_timeout 86400s;
            send_timeout 86400s;

            add_header X-Accel-Buffering no always;
            add_header Cache-Control "no-store, no-cache, max-age=0, must-revalidate, no-transform" always;
            add_header X-Cache-Status BYPASS always;
        }

        location = /api/ai-generate-seo-content {
            proxy_pass http://backend_pool;
            proxy_http_version 1.1;
            proxy_pass_request_headers on;
            proxy_pass_request_body on;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $host;
            proxy_set_header X-Forwarded-Port $server_port;
            proxy_set_header Authorization $http_authorization;
            proxy_set_header Cookie $http_cookie;

            proxy_request_buffering off;
            proxy_buffering off;
            proxy_cache off;
            proxy_no_cache 1;
            proxy_cache_bypass 1;

            gzip off;
            chunked_transfer_encoding on;

            proxy_connect_timeout 10s;
            proxy_send_timeout 86400s;
            proxy_read_timeout 86400s;
            send_timeout 86400s;

            add_header X-Accel-Buffering no always;
            add_header Cache-Control "no-store, no-cache, max-age=0, must-revalidate, no-transform" always;
            add_header X-Cache-Status BYPASS always;
        }"""

# Insert AI blocks before the first 'location / {' within this server block only
for marker in ['        location / {', '    location / {', '\tlocation / {']:
    idx = server_block_txt.find(marker)
    if idx != -1:
        abs_idx = sn_start + idx
        txt = txt[:abs_idx] + AI_BLOCK + '\n' + txt[abs_idx:]
        with open(CONF, 'w') as fh:
            fh.write(txt)
        print('Surgical patch applied in api.csmbridge.net block before: ' + repr(marker))
        sys.exit(0)

print('ERROR: could not find "location / {" in api.csmbridge.net server block')
sys.exit(1)
