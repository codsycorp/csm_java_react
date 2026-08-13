package web

import (
	"net/url"
	"strings"
	"testing"

	"csm_server/backend-go/internal/data"
)

func TestDecryptWebContentPlainAndEncrypted(t *testing.T) {
	rm := &data.RecordManager{}
	plain := `<h1>Bán tòa nhà</h1><p>Nội dung chi tiết</p>`
	encrypted := rm.CsmEncrypt(plain)

	if got := decryptWebContent(rm, plain); got != plain {
		t.Fatalf("plain html changed: %q", got)
	}
	if got := decryptWebContent(rm, encrypted); got != plain {
		t.Fatalf("encrypted not decoded:\ngot  %q\nwant %q", got, plain)
	}
	legacy := url.QueryEscape(plain)
	if got := decryptWebContent(rm, legacy); !strings.Contains(got, "<h1>") {
		t.Fatalf("legacy url-encoded: %q", got)
	}
}

func TestSSRContentMappingsExposeDecryptedLocalizedHTML(t *testing.T) {
	rm := &data.RecordManager{}
	row := map[string]any{
		"id":           "service-1",
		"slug":         "service-1",
		"service_code": "service-1",
		"content":      rm.CsmEncrypt(`<article><h3>Noi dung VI</h3></article>`),
		"content_en":   rm.CsmEncrypt(`<article><h3>English content</h3></article>`),
		"content_zh":   rm.CsmEncrypt(`<article><h3>中文内容</h3></article>`),
	}

	category := mapServiceCategory(rm, row, "vi")
	for _, field := range []string{"content", "content_en", "content_zh"} {
		if !strings.Contains(recordStr(category, field), "<article>") {
			t.Fatalf("category %s was not decrypted: %q", field, recordStr(category, field))
		}
	}

	detail := mapDetailLite(rm, row, "vi")
	for _, field := range []string{"content_en", "content_zh"} {
		if !strings.Contains(recordStr(detail, field), "<article>") {
			t.Fatalf("detail %s was not decrypted: %q", field, recordStr(detail, field))
		}
	}
}
