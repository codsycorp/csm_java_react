package web

import (
	"os"
	"testing"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
)

func testSSRRecordManager(t *testing.T) *data.RecordManager {
	t.Helper()
	dir := t.TempDir()
	os.Setenv("APP_DATA_DIR", dir)
	cfg := config.LoadFromEnv()
	rm, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatalf("NewRecordManager: %v", err)
	}
	t.Cleanup(rm.ShutdownAll)
	return rm
}

func TestResolveServiceListing_GroupSlugIncludesDefaultGroupServices(t *testing.T) {
	rm := testSSRRecordManager(t)
	route := resolvedRoute{
		AppID:            "wuweb",
		TblServices:      "web_services",
		TblServiceDetail: "web_service_detail",
	}
	appID := route.AppID

	seed := func(table string, record map[string]any) {
		t.Helper()
		if _, err := rm.CreateRecord(appID, table, record, nil); err != nil {
			t.Fatalf("CreateRecord %s: %v", table, err)
		}
	}

	seed(route.TblServices, map[string]any{
		"id":                     "group-1",
		"slug":                   "phan-mem",
		"service_code":           "phan-mem-group",
		"group_slug":             "phan-mem",
		"is_group_slug":          true,
		"is_service":             true,
		"status":                 "active",
		"domain":                 "example.com",
		"category":               "Phan mem",
		"content":                "Tong hop tin phan mem",
		"attributes_description": "Nhom phan mem",
	})
	seed(route.TblServices, map[string]any{
		"id":                    "service-1",
		"slug":                  "phan-mem-ban-hang",
		"service_code":          "ban-hang",
		"group_slug":            "phan-mem",
		"is_group_slug_default": true,
		"is_service":            true,
		"status":                "active",
		"domain":                "example.com",
		"category":              "Ban hang",
	})
	seed(route.TblServices, map[string]any{
		"id":                    "service-2",
		"slug":                  "phan-mem-crm",
		"service_code":          "crm",
		"group_slug":            "phan-mem",
		"is_group_slug_default": true,
		"is_service":            true,
		"status":                "active",
		"domain":                "example.com",
		"category":              "CRM",
	})
	seed(route.TblServices, map[string]any{
		"id":                    "service-3",
		"slug":                  "phan-mem-erp",
		"service_code":          "erp",
		"group_slug":            "phan-mem",
		"is_group_slug_default": false,
		"is_service":            true,
		"status":                "active",
		"domain":                "example.com",
		"category":              "ERP",
	})

	seed(route.TblServiceDetail, map[string]any{
		"id":           "detail-1",
		"service_type": "ban-hang",
		"status":       "active",
		"domain":       "example.com",
		"slug":         "bai-viet-ban-hang",
		"title":        "Tin ban hang",
		"excerpt":      "Mo ta 1",
		"publish_date": "2026-06-01T10:00:00Z",
	})
	seed(route.TblServiceDetail, map[string]any{
		"id":           "detail-2",
		"service_type": "crm",
		"status":       "active",
		"domain":       "example.com",
		"slug":         "bai-viet-crm",
		"title":        "Tin crm",
		"excerpt":      "Mo ta 2",
		"publish_date": "2026-06-02T10:00:00Z",
	})
	seed(route.TblServiceDetail, map[string]any{
		"id":           "detail-3",
		"service_type": "erp",
		"status":       "active",
		"domain":       "example.com",
		"slug":         "bai-viet-erp",
		"title":        "Tin erp",
		"excerpt":      "Mo ta 3",
		"publish_date": "2026-06-03T10:00:00Z",
	})
	seed(route.TblServiceDetail, map[string]any{
		"id":           "detail-4",
		"service_type": "ban-hang",
		"status":       "active",
		"domain":       "other.com",
		"slug":         "khac-domain",
		"title":        "Tin khac domain",
		"excerpt":      "Mo ta 4",
	})

	listing := resolveServiceListing(rm, route, "example.com", "/phan-mem.shtml", nil, "", "")
	details, _ := listing["serviceDetailList"].([]any)
	if len(details) != 2 {
		t.Fatalf("expected 2 grouped details, got %d (%v)", len(details), listing)
	}
	first, _ := details[0].(map[string]any)
	if got := recordStr(first, "service_type"); got != "crm" {
		t.Fatalf("expected newest grouped detail first, got service_type=%q", got)
	}
	category, _ := listing["serviceCategory"].(map[string]any)
	if got := recordStr(category, "category"); got != "Phan mem" {
		t.Fatalf("expected group category metadata, got %q", got)
	}
	if got := recordStr(listing, "pageContent"); got != "Tong hop tin phan mem" {
		t.Fatalf("expected group page content, got %q", got)
	}
}

func TestResolveServiceListing_SingleSegmentCategoryPrefersListing(t *testing.T) {
	rm := testSSRRecordManager(t)
	route := resolvedRoute{
		AppID:            "wuweb",
		TblServices:      "web_services",
		TblServiceDetail: "web_service_detail",
	}
	appID := route.AppID

	seed := func(table string, record map[string]any) {
		t.Helper()
		if _, err := rm.CreateRecord(appID, table, record, nil); err != nil {
			t.Fatalf("CreateRecord %s: %v", table, err)
		}
	}

	seed(route.TblServices, map[string]any{
		"id":           "svc-kqxs",
		"slug":         "thong-ke-ket-qua-xo-so",
		"service_code": "kqxs",
		"is_service":   true,
		"status":       "active",
		"domain":       "example.com",
		"category":     "Thong ke KQXS",
		"content":      "Noi dung landing tu category",
	})

	// This detail slug matches category slug and used to incorrectly force detail mode.
	seed(route.TblServiceDetail, map[string]any{
		"id":           "detail-landing",
		"service_type": "kqxs",
		"status":       "active",
		"domain":       "example.com",
		"slug":         "thong-ke-ket-qua-xo-so",
		"title":        "Bai viet trung slug",
		"content":      "Noi dung bai viet",
	})
	seed(route.TblServiceDetail, map[string]any{
		"id":           "detail-2",
		"service_type": "kqxs",
		"status":       "active",
		"domain":       "example.com",
		"slug":         "bai-viet-kqxs-2",
		"title":        "Bai viet 2",
	})

	listing := resolveServiceListing(rm, route, "example.com", "/thong-ke-ket-qua-xo-so.shtml", nil, "", "")
	if _, ok := listing["serviceDetail"]; ok {
		t.Fatalf("expected listing mode for category slug, got serviceDetail payload: %v", listing["serviceDetail"])
	}
	details, _ := listing["serviceDetailList"].([]any)
	if len(details) == 0 {
		t.Fatalf("expected listing data for category slug, got none: %v", listing)
	}
	if got := recordStr(listing, "pageContent"); got != "Noi dung landing tu category" {
		t.Fatalf("expected category landing content, got %q", got)
	}
}
