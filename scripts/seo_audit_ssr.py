#!/usr/bin/env python3
import json
import re
import sys
import urllib.parse
import urllib.request

BASE = "http://localhost:9999"
HOST_OVERRIDE = "localhost:3333"
URLS = [
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
LANGS = ["vi", "en", "zh"]


def fetch_html(path: str, lang: str) -> str:
    qs = urllib.parse.urlencode({"__host": HOST_OVERRIDE, "hl": lang})
    url = f"{BASE}{path}?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "seo-audit/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", errors="ignore")


def has(pattern: str, html: str) -> bool:
    return re.search(pattern, html, re.I | re.S) is not None


def check(path: str, lang: str, html: str) -> dict:
    jsonld_blocks = re.findall(r"<script[^>]+type=\"application/ld\+json\"[^>]*>(.*?)</script>", html, re.I | re.S)
    jsonld_text = "\n".join(jsonld_blocks)
    return {
        "path": path,
        "lang": lang,
        "canonical": has(r"<link[^>]+rel=\"canonical\"[^>]+href=\"[^\"]+\"", html),
        "robots_strict": "max-image-preview:large" in html and "max-snippet:-1" in html,
        "hreflang": has(r"rel=\"alternate\"\s+hreflang=", html),
        "og_url": has(r"property=\"og:url\"", html),
        "jsonld": len(jsonld_blocks) > 0,
        "jsonld_website": '"@type": "WebSite"' in jsonld_text,
        "jsonld_breadcrumb": '"@type": "BreadcrumbList"' in jsonld_text,
        "jsonld_itemlist": '"@type": "ItemList"' in jsonld_text,
        "jsonld_faq": '"@type": "FAQPage"' in jsonld_text,
        "jsonld_article": '"@type": "Article"' in jsonld_text,
        "article_pub": "article:published_time" in html,
        "article_mod": "article:modified_time" in html,
    }


def main() -> int:
    results = []
    for path in URLS:
        for lang in LANGS:
            try:
                html = fetch_html(path, lang)
                results.append(check(path, lang, html))
            except Exception as e:
                results.append({"path": path, "lang": lang, "error": str(e)})

    failed = []
    for r in results:
        if "error" in r:
            failed.append(r)
            continue
        required = ["canonical", "robots_strict", "hreflang", "og_url", "jsonld", "jsonld_website", "jsonld_breadcrumb"]
        if any(not r.get(k, False) for k in required):
            failed.append(r)

    print(json.dumps({"total": len(results), "failed": len(failed), "results": results}, ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
