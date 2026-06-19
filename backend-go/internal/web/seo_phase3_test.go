package web

import (
	"strings"
	"testing"
)

func TestBuildLocalizedURL(t *testing.T) {
	tests := []struct {
		base, path, lang, want string
	}{
		{"https://example.com", "/dich-vu/slug", "vi", "https://example.com/dich-vu/slug"},
		{"https://example.com", "/dich-vu/slug", "en", "https://example.com/dich-vu/slug?hl=en"},
		{"https://example.com", "/", "zh", "https://example.com/?hl=zh"},
	}
	for _, tc := range tests {
		got := buildLocalizedURL(tc.base, tc.path, tc.lang)
		if got != tc.want {
			t.Fatalf("buildLocalizedURL(%q,%q,%q) = %q, want %q", tc.base, tc.path, tc.lang, got, tc.want)
		}
	}
}

func TestBuildHreflangLinks(t *testing.T) {
	links := buildHreflangLinks("https://example.com", "/ve-may-bay")
	if len(links) != 4 {
		t.Fatalf("expected 4 hreflang links, got %d", len(links))
	}
	byLang := map[string]string{}
	for _, l := range links {
		byLang[l.Lang] = l.Href
	}
	if byLang["vi"] != "https://example.com/ve-may-bay" {
		t.Fatalf("vi href: %s", byLang["vi"])
	}
	if byLang["en"] != "https://example.com/ve-may-bay?hl=en" {
		t.Fatalf("en href: %s", byLang["en"])
	}
	if byLang["x-default"] != byLang["vi"] {
		t.Fatalf("x-default should match vi")
	}
}

func TestBuildBreadcrumbListDetail(t *testing.T) {
	initial := map[string]any{
		"serviceCode": "dich-vu",
		"serviceDetail": map[string]any{
			"title":        "Vé máy bay giá rẻ",
			"service_type": "ve-may-bay",
		},
	}
	categories := []any{
		map[string]any{
			"service_code": "ve-may-bay",
			"category":     "Vé máy bay",
			"category_en":  "Flights",
		},
	}
	bc := buildBreadcrumbList("https://example.com", "/ve-may-bay/ve-re", "vi", "dich-vu", initial, categories)
	items, ok := bc["itemListElement"].([]map[string]any)
	if !ok {
		t.Fatalf("itemListElement type %T", bc["itemListElement"])
	}
	if len(items) != 4 {
		t.Fatalf("expected 4 crumbs, got %d", len(items))
	}
	if items[0]["name"] != "Trang chủ" {
		t.Fatalf("home label: %v", items[0]["name"])
	}
	if items[3]["name"] != "Vé máy bay giá rẻ" {
		t.Fatalf("detail title: %v", items[3]["name"])
	}
}

func TestBuildBreadcrumbListLmktDefaultCategory(t *testing.T) {
	categories := []any{
		map[string]any{
			"service_code": "bat-dong-san",
			"category":     "Bất động sản",
			"category_en":  "Real Estate",
		},
	}
	initial := map[string]any{
		"serviceCategory": map[string]any{
			"service_code": "can-ho",
			"category":     "Căn hộ",
		},
	}
	bc := buildBreadcrumbList("https://lmkt.vn", "/can-ho", "vi", "bat-dong-san", initial, categories)
	items := bc["itemListElement"].([]map[string]any)
	if items[1]["name"] != "Bất động sản" {
		t.Fatalf("services crumb should use category title, got %v", items[1]["name"])
	}
	if items[1]["item"] != "https://lmkt.vn/bat-dong-san" {
		t.Fatalf("services url: %v", items[1]["item"])
	}
}

func TestBuildBreadcrumbListCategory(t *testing.T) {
	initial := map[string]any{
		"serviceCategory": map[string]any{
			"service_code": "ve-may-bay",
			"category":     "Vé máy bay",
		},
	}
	bc := buildBreadcrumbList("https://example.com", "/ve-may-bay", "vi", "dich-vu", initial, nil)
	items := bc["itemListElement"].([]map[string]any)
	if len(items) != 3 {
		t.Fatalf("expected 3 crumbs, got %d", len(items))
	}
	if items[2]["name"] != "Vé máy bay" {
		t.Fatalf("category name: %v", items[2]["name"])
	}
}

func TestPreprocessHTMLHreflangAndLang(t *testing.T) {
	html := `<!DOCTYPE html>
<html lang="vi">
<head>
<meta property="og:locale" content="vi_VN" />
<script type="application/ld+json">{}</script>
</head>
<body></body>
</html>`
	ctx := &preprocessCtx{
		Title:           "Test",
		Description:     "Desc",
		Keywords:        "kw",
		Canonical:       "https://example.com/ve-may-bay",
		Image:           "https://example.com/og.png",
		SiteName:        "https://example.com",
		Logo:            "https://example.com/logo.png",
		Lang:            "en",
		PagePath:        "/ve-may-bay",
		BaseURL:         "https://example.com",
		DefaultCategory: "dich-vu",
		InitialData:     map[string]any{},
	}
	preprocessHTML(&html, ctx)
	if !strings.Contains(html, `lang="en"`) {
		t.Fatalf("expected html lang=en, got: %s", html)
	}
	if !strings.Contains(html, `hreflang="en"`) || !strings.Contains(html, `?hl=en`) {
		t.Fatalf("expected hreflang en link, got: %s", html)
	}
	if !strings.Contains(html, `og:locale:alternate`) {
		t.Fatalf("expected og:locale:alternate, got: %s", html)
	}
	if !strings.Contains(html, `"@graph"`) || !strings.Contains(html, `"BreadcrumbList"`) {
		t.Fatalf("expected @graph with BreadcrumbList, got: %s", html)
	}
}
