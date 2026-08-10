# SEO Predeploy Checklist (frontend-web + backend-go)

This checklist runs a strict SSR SEO gate before deploying production.

## 1) Start services

- Backend Go should run on `http://localhost:9999`
- Frontend web host context should match `localhost:3333` (or your local mapped host)

Example:

```bash
# terminal 1
cd backend-go
./run-go-server.sh

# terminal 2
cd frontend-web
pnpm dev --host --port 3333
```

## 2) Run SEO gate

```bash
chmod +x scripts/seo_predeploy_check.sh
./scripts/seo_predeploy_check.sh
```

Optional custom environment:

```bash
SEO_AUDIT_BASE_URL=http://127.0.0.1:9999 \
SEO_AUDIT_HOST_OVERRIDE=localhost:3333 \
SEO_AUDIT_MAX_LATENCY_MS=1400 \
SEO_AUDIT_LANGS=vi,en,zh \
./scripts/seo_predeploy_check.sh
```

## 3) PASS criteria

For each URL x language pair, required checks:

- status is 200
- canonical link exists
- robots strict meta exists (`max-image-preview:large` and `max-snippet:-1`)
- hreflang links exist
- `og:url` exists
- meta description exists
- page title is non-empty
- JSON-LD exists with `WebSite` and `BreadcrumbList`
- response content-type is HTML
- latency <= configured threshold

System checks:

- `/robots.txt` returns 200, text/plain, includes `User-agent` and `Sitemap`
- `/sitemap.xml` returns 200, XML-like response, contains URL entries

## 4) Output artifacts

Reports are written to:

- `logs/seo/seo-audit-YYYYMMDD-HHMMSS.json`

Use this report in release evidence or CI logs.

## 5) Suggested release gate policy

- Block deployment if script exit code is non-zero
- Keep last 10 SEO audit reports as release evidence
- Review latency trend weekly and tighten threshold gradually
