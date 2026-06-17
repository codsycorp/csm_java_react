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
	if route.RPIndex != "web" {
		t.Fatalf("expected rp_index from catch-all, got %q", route.RPIndex)
	}
	if route.AppID != "wuweb" {
		t.Fatalf("expected app_id from catch-all sys_la_routers, got %q", route.AppID)
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
