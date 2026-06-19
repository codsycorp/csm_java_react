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
