package web

import "testing"

func TestMergeRouteForSPAPrefersCatchAllTables(t *testing.T) {
	catchAll := resolvedRoute{
		RPIndex:          "admin",
		AppID:            "csm",
		TblServices:      "web_services",
		TblServiceDetail: "web_service_detail",
		FTitle:           "Quản Lý Nội Bộ",
	}
	exact := resolvedRoute{
		FTitle:  "Login",
		FLogo:   "app_images/csm/icon.png",
		RPIndex: "",
		AppID:   "",
	}
	merged := mergeRouteForSPA(catchAll, exact)
	if merged.AppID != "csm" || merged.RPIndex != "admin" {
		t.Fatalf("expected catch-all SSR config, got %+v", merged)
	}
	if merged.FLogo != "app_images/csm/icon.png" {
		t.Fatalf("expected overlay logo, got %q", merged.FLogo)
	}
}

func TestFinalizeSSRRouteMergesCatchAllFromDB(t *testing.T) {
	rm, cleanup := pebbleDataAvailable(t)
	defer cleanup()

	route := finalizeSSRRoute(resolvedRoute{Domain: "phanmemmottrieu.net"}, rm, "phanmemmottrieu.net")
	if route.RPIndex == "" {
		t.Fatal("expected rp_index from router table")
	}
	if route.AppID == "" {
		t.Fatal("expected app_id from router table")
	}
	if route.TblServiceDetail != "web_service_detail" {
		t.Fatalf("expected tbl_service_detail from catch-all, got %q", route.TblServiceDetail)
	}
}

func TestNormalizeFCase(t *testing.T) {
	if got := normalizeFCase("/"); got != "" {
		t.Fatalf("/ should normalize to empty f_case, got %q", got)
	}
	if got := normalizeFCase("/login"); got != "/login" {
		t.Fatalf("expected /login, got %q", got)
	}
}

func TestPickBestResolvedRoutePrefersWebForPublicHost(t *testing.T) {
	rows := []map[string]any{
		{
			"rp_index":           "admin",
			"app_id":             "csm",
			"tbl_services":       "web_services",
			"tbl_service_detail": "web_service_detail",
			"app_type":           "admin",
			"domain_name":        "h-holding.vn",
			"f_title":            "Admin",
		},
		{
			"rp_index":           "web",
			"app_id":             "lmkt",
			"tbl_services":       "web_services",
			"tbl_service_detail": "web_service_detail",
			"app_type":           "web",
			"domain_name":        "h-holding.vn",
			"f_title":            "Website",
		},
	}

	route, ok := pickBestResolvedRoute(rows)
	if !ok {
		t.Fatal("expected a route to be selected")
	}
	if route.RPIndex != "web" {
		t.Fatalf("expected public host to prefer web route, got %q", route.RPIndex)
	}
}
