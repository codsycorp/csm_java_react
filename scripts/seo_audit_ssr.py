#!/usr/bin/env python3
import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from typing import Optional

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


def localized_path(path: str, lang: str) -> str:
    raw = (path or "/").strip()
    if not raw.startswith("/"):
        raw = "/" + raw
    if raw != "/":
        raw = raw.rstrip("/")
    if lang in {"en", "zh"}:
        if raw == "/":
            return f"/{lang}"
        return f"/{lang}{raw}"
    return raw


def expected_canonical(base: str, path: str, lang: str) -> str:
    return base.rstrip("/") + localized_path(path, lang)


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


def fetch_text(base: str, path: str, query: dict, timeout: int, headers: Optional[dict] = None) -> tuple[str, int, dict, int]:
    qs = urllib.parse.urlencode(query)
    url = f"{base}{path}"
    if qs:
        url = f"{url}?{qs}"
    request_headers = {"User-Agent": "seo-audit/2.0"}
    if headers:
        request_headers.update(headers)
    req = urllib.request.Request(url, headers=request_headers)
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8", errors="ignore")
        latency_ms = int((time.perf_counter() - t0) * 1000)
        headers = {k.lower(): v for (k, v) in resp.getheaders()}
        return body, int(resp.status), headers, latency_ms


def first_asset_path(html: str) -> str:
    match = re.search(r"<script[^>]+src=\"([^\"]*?/assets/[^\"]+\.(?:js|mjs))\"", html, re.I)
    if match:
        return match.group(1).strip()
    match = re.search(r"<link[^>]+href=\"([^\"]*?/assets/[^\"]+\.css)\"", html, re.I)
    if match:
        return match.group(1).strip()
    return ""


def check_asset_delivery(base: str, host_override: str, asset_path: str, timeout: int) -> dict:
    if not asset_path:
        return {
            "asset_path": "",
            "asset_status": 0,
            "asset_latency_ms": 0,
            "asset_content_encoding": "",
            "asset_cache_control": "",
            "asset_content_type": "",
            "asset_checks": {
                "asset_found_in_html": False,
                "asset_fetch_ok": False,
                "asset_compressed": False,
                "asset_cache_present": False,
                "asset_cache_immutable": False,
            },
            "asset_missing": ["asset_found_in_html", "asset_fetch_ok"],
        }

    normalized = asset_path if asset_path.startswith("/") else "/" + asset_path
    body, status, headers, latency_ms = fetch_text(
        base,
        normalized,
        {"__host": host_override},
        timeout,
        headers={"Accept-Encoding": "br, gzip"},
    )
    _ = body
    cache_control = headers.get("cache-control", "")
    content_encoding = headers.get("content-encoding", "")
    checks = {
        "asset_found_in_html": True,
        "asset_fetch_ok": status == 200,
        "asset_compressed": content_encoding.lower() in {"br", "gzip"},
        "asset_cache_present": bool(cache_control),
        "asset_cache_immutable": "immutable" in cache_control.lower() if "/assets/" in normalized else bool(cache_control),
    }
    required = [
        "asset_found_in_html",
        "asset_fetch_ok",
        "asset_compressed",
        "asset_cache_present",
        "asset_cache_immutable",
    ]
    missing = [k for k in required if not checks.get(k, False)]
    return {
        "asset_path": normalized,
        "asset_status": status,
        "asset_latency_ms": latency_ms,
        "asset_content_encoding": content_encoding,
        "asset_cache_control": cache_control,
        "asset_content_type": headers.get("content-type", ""),
        "asset_checks": checks,
        "asset_missing": missing,
    }


def check_page(path: str, lang: str, html: str, status: int, headers: dict, latency_ms: int, max_latency_ms: int, asset_report: dict, base: str) -> dict:
    path_depth = len([s for s in path.split("/") if s.strip()])
    latency_budget = max_latency_ms if path_depth <= 1 else max(max_latency_ms, 2200)
    expected_can = expected_canonical(base, path, lang)
    canonical_match = re.search(r'<link[^>]+rel="canonical"[^>]+href="([^"]+)"', html, re.I | re.S)
    canonical_href = canonical_match.group(1).strip() if canonical_match else ""

    expected_hreflangs = {
        "vi": expected_canonical(base, path, "vi"),
        "en": expected_canonical(base, path, "en"),
        "zh": expected_canonical(base, path, "zh"),
    }
    hreflang_ok = all(
        f'hreflang="{k}"' in html and f'href="{v}"' in html
        for k, v in expected_hreflangs.items()
    )
    hreflang_ok = hreflang_ok and f'hreflang="x-default"' in html and f'href="{expected_hreflangs["vi"]}"' in html

    jsonld_blocks = re.findall(r"<script[^>]+type=\"application/ld\+json\"[^>]*>(.*?)</script>", html, re.I | re.S)
    jsonld_text = "\n".join(jsonld_blocks)
    meta_desc = has(r"<meta[^>]+name=\"description\"[^>]+content=\"[^\"]+\"", html)
    title_ok = has(r"<title>\s*[^<]{3,}\s*</title>", html)

    checks = {
        "status_200": status == 200,
        "canonical": bool(canonical_href),
        "canonical_exact": canonical_href == expected_can,
        "robots_strict": "max-image-preview:large" in html and "max-snippet:-1" in html,
        "hreflang": has(r"rel=\"alternate\"\s+hreflang=", html),
        "hreflang_expected": hreflang_ok,
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
        "asset_found_in_html": asset_report["asset_checks"]["asset_found_in_html"],
        "asset_fetch_ok": asset_report["asset_checks"]["asset_fetch_ok"],
        "asset_compressed": asset_report["asset_checks"]["asset_compressed"],
        "asset_cache_present": asset_report["asset_checks"]["asset_cache_present"],
        "asset_cache_immutable": asset_report["asset_checks"]["asset_cache_immutable"],
    }

    required = [
        "status_200",
        "canonical",
        "canonical_exact",
        "robots_strict",
        "hreflang",
        "hreflang_expected",
        "og_url",
        "meta_description",
        "title_nonempty",
        "jsonld",
        "jsonld_website",
        "jsonld_breadcrumb",
        "latency_ok",
        "html_content_type",
        "asset_found_in_html",
        "asset_fetch_ok",
        "asset_compressed",
        "asset_cache_present",
        "asset_cache_immutable",
    ]
    missing = [k for k in required if not checks.get(k, False)]

    return {
        "path": path,
        "resolved_path": localized_path(path, lang),
        "lang": lang,
        "status": status,
        "latency_ms": latency_ms,
        "latency_budget_ms": latency_budget,
        "content_type": headers.get("content-type", ""),
        "canonical_href": canonical_href,
        "expected_canonical": expected_can,
        "expected_hreflangs": expected_hreflangs,
        "asset": asset_report,
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


def check_sitemap(base: str, host_override: str, timeout: int, path: str, expect_index: bool = False) -> dict:
    body, status, headers, latency_ms = fetch_text(base, path, {"__host": host_override}, timeout)
    checks = {
        "status_200": status == 200,
        "xml_like": "<?xml" in body or "<urlset" in body or "<sitemapindex" in body,
        "has_url_entries": "<url>" in body or "<sitemap>" in body,
        "content_type_xml": "xml" in headers.get("content-type", "").lower(),
        "shape_match": ("<sitemapindex" in body) if expect_index else ("<urlset" in body),
    }
    required = ["status_200", "xml_like", "has_url_entries", "content_type_xml", "shape_match"]
    missing = [k for k in required if not checks.get(k, False)]
    return {
        "name": path,
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
                        req_path = localized_path(path, lang)
                        fetch_text(
                            args.base,
                            req_path,
                            {"__host": args.host_override},
                            args.timeout,
                        )
                    except Exception:
                        # Warmup is best-effort. Final measured pass will report failures.
                        pass

    page_results = []
    for path in paths:
        for lang in langs:
            try:
                req_path = localized_path(path, lang)
                html, status, headers, latency_ms = fetch_text(
                    args.base,
                    req_path,
                    {"__host": args.host_override},
                    args.timeout,
                )
                asset_path = first_asset_path(html)
                asset_report = check_asset_delivery(args.base, args.host_override, asset_path, args.timeout)
                page_results.append(
                    check_page(
                        path,
                        lang,
                        html,
                        status,
                        headers,
                        latency_ms,
                        args.max_latency_ms if len([s for s in path.split("/") if s.strip()]) <= 1 else args.max_latency_detail_ms,
                        asset_report,
                        args.base,
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
    sitemap_targets = [
        ("/sitemap.xml", True),
        ("/sitemap-pages.xml", False),
        ("/sitemap-categories.xml", False),
        ("/sitemap-details.xml", False),
    ]
    for fn in (check_robots,):
        try:
            system_results.append(fn(args.base, args.host_override, args.timeout))
        except Exception as exc:
            system_results.append({"name": fn.__name__, "error": str(exc), "missing": ["fetch_ok"]})
    for target, expect_index in sitemap_targets:
        try:
            system_results.append(check_sitemap(args.base, args.host_override, args.timeout, target, expect_index=expect_index))
        except Exception as exc:
            system_results.append({"name": target, "error": str(exc), "missing": ["fetch_ok"]})

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
