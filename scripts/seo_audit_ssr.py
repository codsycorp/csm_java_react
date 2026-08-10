#!/usr/bin/env python3
import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request

DEFAULT_BASE = "http://localhost:9999"
DEFAULT_HOST_OVERRIDE = "localhost:3333"
DEFAULT_URLS = [
    "/phan-mem",
    "/bat-dong-san",
    "/lam-dep-my-pham",
    "/cho-thue-xe",
    "/booking-online",
    "/hop-tac-kinh-doanh",
    "/thong-ke-ket-qua-xo-so",
    "/phan-mem/dich-vu-viet-tool-theo-yeu-cau-tu-dong-hoa-quy-trinh-but-pha-doanh-thu-2026",
    "/bat-dong-san/3-bds-tp-hcm-dau-la-khoan-dau-tu-tot-nhat-nam-2024-phan-tich-roi-rui-ro",
]
DEFAULT_LANGS = ["vi", "en", "zh"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SSR SEO predeploy audit gate")
    parser.add_argument("--base", default=DEFAULT_BASE, help="Backend base URL, e.g. http://localhost:9999")
    parser.add_argument(
        "--host-override",
        default=DEFAULT_HOST_OVERRIDE,
        help="Host injected via __host query param so SSR resolves right domain config",
    )
    parser.add_argument("--langs", default=",".join(DEFAULT_LANGS), help="Comma-separated langs, e.g. vi,en,zh")
    parser.add_argument("--paths", default=",".join(DEFAULT_URLS), help="Comma-separated URL paths to audit")
    parser.add_argument("--timeout", type=int, default=20, help="HTTP timeout in seconds")
    parser.add_argument("--max-latency-ms", type=int, default=1200, help="Max allowed SSR latency per page")
    parser.add_argument(
        "--max-latency-detail-ms",
        type=int,
        default=2200,
        help="Max allowed SSR latency for detail pages (path depth >= 2)",
    )
    parser.add_argument(
        "--warmup-rounds",
        type=int,
        default=1,
        help="Warmup fetch rounds per page/lang before measuring latency",
    )
    parser.add_argument("--output", default="", help="Optional JSON report file")
    return parser.parse_args()


def normalize_list(raw: str) -> list[str]:
    items = [x.strip() for x in raw.split(",") if x.strip()]
    return items


def has(pattern: str, html: str) -> bool:
    return re.search(pattern, html, re.I | re.S) is not None


def fetch_text(base: str, path: str, query: dict, timeout: int) -> tuple[str, int, dict, int]:
    qs = urllib.parse.urlencode(query)
    url = f"{base}{path}"
    if qs:
        url = f"{url}?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "seo-audit/2.0"})
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8", errors="ignore")
        latency_ms = int((time.perf_counter() - t0) * 1000)
        headers = {k.lower(): v for (k, v) in resp.getheaders()}
        return body, int(resp.status), headers, latency_ms


def check_page(path: str, lang: str, html: str, status: int, headers: dict, latency_ms: int, max_latency_ms: int) -> dict:
    path_depth = len([s for s in path.split("/") if s.strip()])
    latency_budget = max_latency_ms if path_depth <= 1 else max(max_latency_ms, 2200)

    jsonld_blocks = re.findall(r"<script[^>]+type=\"application/ld\+json\"[^>]*>(.*?)</script>", html, re.I | re.S)
    jsonld_text = "\n".join(jsonld_blocks)
    meta_desc = has(r"<meta[^>]+name=\"description\"[^>]+content=\"[^\"]+\"", html)
    title_ok = has(r"<title>\s*[^<]{3,}\s*</title>", html)

    checks = {
        "status_200": status == 200,
        "canonical": has(r"<link[^>]+rel=\"canonical\"[^>]+href=\"[^\"]+\"", html),
        "robots_strict": "max-image-preview:large" in html and "max-snippet:-1" in html,
        "hreflang": has(r"rel=\"alternate\"\s+hreflang=", html),
        "og_url": has(r"property=\"og:url\"", html),
        "meta_description": meta_desc,
        "title_nonempty": title_ok,
        "jsonld": len(jsonld_blocks) > 0,
        "jsonld_website": '"@type": "WebSite"' in jsonld_text,
        "jsonld_breadcrumb": '"@type": "BreadcrumbList"' in jsonld_text,
        "jsonld_itemlist": '"@type": "ItemList"' in jsonld_text,
        "jsonld_faq": '"@type": "FAQPage"' in jsonld_text,
        "jsonld_article": '"@type": "Article"' in jsonld_text,
        "article_pub": "article:published_time" in html,
        "article_mod": "article:modified_time" in html,
        "latency_ok": latency_ms <= latency_budget,
        "html_content_type": "text/html" in headers.get("content-type", "").lower(),
    }

    required = [
        "status_200",
        "canonical",
        "robots_strict",
        "hreflang",
        "og_url",
        "meta_description",
        "title_nonempty",
        "jsonld",
        "jsonld_website",
        "jsonld_breadcrumb",
        "latency_ok",
        "html_content_type",
    ]
    missing = [k for k in required if not checks.get(k, False)]

    return {
        "path": path,
        "lang": lang,
        "status": status,
        "latency_ms": latency_ms,
        "latency_budget_ms": latency_budget,
        "content_type": headers.get("content-type", ""),
        "checks": checks,
        "required": required,
        "missing": missing,
    }


def check_robots(base: str, host_override: str, timeout: int) -> dict:
    body, status, headers, latency_ms = fetch_text(base, "/robots.txt", {"__host": host_override}, timeout)
    checks = {
        "status_200": status == 200,
        "contains_user_agent": "User-agent:" in body,
        "contains_sitemap": "Sitemap:" in body,
        "content_type_text": "text/plain" in headers.get("content-type", "").lower(),
    }
    required = ["status_200", "contains_user_agent", "contains_sitemap", "content_type_text"]
    missing = [k for k in required if not checks.get(k, False)]
    return {
        "name": "robots.txt",
        "status": status,
        "latency_ms": latency_ms,
        "checks": checks,
        "required": required,
        "missing": missing,
    }


def check_sitemap(base: str, host_override: str, timeout: int) -> dict:
    body, status, headers, latency_ms = fetch_text(base, "/sitemap.xml", {"__host": host_override}, timeout)
    checks = {
        "status_200": status == 200,
        "xml_like": "<?xml" in body or "<urlset" in body or "<sitemapindex" in body,
        "has_url_entries": "<url>" in body or "<sitemap>" in body,
        "content_type_xml": "xml" in headers.get("content-type", "").lower(),
    }
    required = ["status_200", "xml_like", "has_url_entries", "content_type_xml"]
    missing = [k for k in required if not checks.get(k, False)]
    return {
        "name": "sitemap.xml",
        "status": status,
        "latency_ms": latency_ms,
        "checks": checks,
        "required": required,
        "missing": missing,
    }


def main() -> int:
    args = parse_args()
    langs = normalize_list(args.langs)
    paths = normalize_list(args.paths)

    warmup_rounds = max(0, int(args.warmup_rounds))
    if warmup_rounds > 0:
        for _ in range(warmup_rounds):
            for path in paths:
                for lang in langs:
                    try:
                        fetch_text(
                            args.base,
                            path,
                            {"__host": args.host_override, "hl": lang},
                            args.timeout,
                        )
                    except Exception:
                        # Warmup is best-effort. Final measured pass will report failures.
                        pass

    page_results = []
    for path in paths:
        for lang in langs:
            try:
                html, status, headers, latency_ms = fetch_text(
                    args.base,
                    path,
                    {"__host": args.host_override, "hl": lang},
                    args.timeout,
                )
                page_results.append(
                    check_page(
                        path,
                        lang,
                        html,
                        status,
                        headers,
                        latency_ms,
                        args.max_latency_ms if len([s for s in path.split("/") if s.strip()]) <= 1 else args.max_latency_detail_ms,
                    )
                )
            except Exception as exc:
                page_results.append(
                    {
                        "path": path,
                        "lang": lang,
                        "error": str(exc),
                        "missing": ["fetch_ok"],
                    }
                )

    system_results = []
    for fn in (check_robots, check_sitemap):
        try:
            system_results.append(fn(args.base, args.host_override, args.timeout))
        except Exception as exc:
            system_results.append({"name": fn.__name__, "error": str(exc), "missing": ["fetch_ok"]})

    failed_pages = [r for r in page_results if r.get("missing")]
    failed_system = [r for r in system_results if r.get("missing")]

    summary = {
        "base": args.base,
        "host_override": args.host_override,
        "max_latency_ms": args.max_latency_ms,
        "max_latency_detail_ms": args.max_latency_detail_ms,
        "warmup_rounds": warmup_rounds,
        "totals": {
            "pages": len(page_results),
            "failed_pages": len(failed_pages),
            "system_checks": len(system_results),
            "failed_system_checks": len(failed_system),
        },
        "failed": {
            "pages": failed_pages,
            "system": failed_system,
        },
        "results": {
            "pages": page_results,
            "system": system_results,
        },
    }

    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            json.dump(summary, fh, ensure_ascii=False, indent=2)

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if (failed_pages or failed_system) else 0


if __name__ == "__main__":
    sys.exit(main())
