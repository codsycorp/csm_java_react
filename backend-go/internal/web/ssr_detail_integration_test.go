package web

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
)

func pebbleDataAvailable(t *testing.T) (*data.RecordManager, func()) {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", "..", "backend", "csm_datas"))
	if err != nil {
		t.Skip(err)
	}
	if _, err := os.Stat(filepath.Join(root, "native", "pebble", "wuweb", "web_service_detail")); err != nil {
		t.Skip("local pebble data not available")
	}
	os.Setenv("APP_DATA_DIR", root)
	cfg := config.LoadFromEnv()
	rm, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatalf("RecordManager: %v", err)
	}
	return rm, func() { rm.ShutdownAll() }
}

func TestFindActiveServiceDetail_WuwebSample(t *testing.T) {
	rm, cleanup := pebbleDataAvailable(t)
	defer cleanup()

	route := resolvedRoute{
		AppID:            "wuweb",
		TblServiceDetail: "web_service_detail",
	}
	slug := "1150m2-nguyen-thi-thap-le-van-luong-q7-phan-tich-dong-tien-roi"
	serviceCode := "bat-dong-san"
	domain := "phanmemmottrieu.net"

	row := findActiveServiceDetail(rm, route, domain, serviceCode, slug)
	if len(row) == 0 {
		t.Fatal("expected detail row for wuweb sample slug")
	}
	if got := recordStr(row, "slug"); got != slug {
		t.Fatalf("slug mismatch: got %q", got)
	}
	if got := recordStr(row, "service_type"); got != serviceCode {
		t.Fatalf("service_type mismatch: got %q", got)
	}
}

func TestBuildSSRHTML_ServiceDetailInjected(t *testing.T) {
	rm, cleanup := pebbleDataAvailable(t)
	defer cleanup()

	slug := "1150m2-nguyen-thi-thap-le-van-luong-q7-phan-tich-dong-tien-roi"
	uri := "/bat-dong-san/" + slug + ".shtml"
	host := "phanmemmottrieu.net"
	ctx := SSRContext{RM: rm}

	html := buildSSRHTML(ctx, uri, host, "", true)
	if !strings.Contains(html, `"serviceDetail"`) {
		t.Fatalf("SSR HTML missing serviceDetail for %s", uri)
	}
	if !strings.Contains(html, `"currentPagePath":"/bat-dong-san/`+slug+`.shtml"`) &&
		!strings.Contains(html, `"currentPagePath": "/bat-dong-san/`+slug+`.shtml"`) {
		t.Fatalf("SSR HTML currentPagePath should keep .shtml like Java, got html snippet without expected path")
	}
	if !strings.Contains(html, `<main id="ssr-content"`) {
		t.Fatalf("SSR HTML missing visible body content block for %s", uri)
	}
	if !strings.Contains(html, `class="ssr-content__body"`) {
		t.Fatalf("SSR HTML missing rendered body section for %s", uri)
	}
	if !strings.Contains(html, slug) {
		t.Fatalf("SSR HTML missing slug %q", slug)
	}
}

func TestBuildSSRHTML_LmktServiceDetailInjected(t *testing.T) {
	rm, cleanup := pebbleDataAvailable(t)
	defer cleanup()

	slug := "1-chiet-khau-som-tai-sunshine-bay-retreat-vung-tau-phan-tich-dau-tu"
	uri := "/sunshine-bay-retreat-vung-tau/" + slug + ".shtml"
	host := "h-holding.vn"
	ctx := SSRContext{RM: rm}

	html := buildSSRHTML(ctx, uri, host, "", true)
	if !strings.Contains(html, `"serviceDetail"`) {
		t.Fatalf("SSR HTML missing serviceDetail for lmkt %s", uri)
	}

	htmlForUser := buildSSRHTML(ctx, uri, host, "", false)
	if strings.Contains(htmlForUser, `<main id="ssr-content"`) {
		t.Fatalf("SSR HTML for normal user should not inject visible body block for %s", uri)
	}
}
