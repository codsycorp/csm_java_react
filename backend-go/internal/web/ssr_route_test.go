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

func TestEnrichRouteFromRPIndex(t *testing.T) {
	r := enrichRouteFromRPIndex(resolvedRoute{RPIndex: "admin"})
	if r.AppID != "csm" {
		t.Fatalf("admin rp_index should infer csm app_id, got %q", r.AppID)
	}
	r = enrichRouteFromRPIndex(resolvedRoute{RPIndex: "lmkt"})
	if r.AppID != "lmkt" {
		t.Fatalf("lmkt rp_index should infer lmkt app_id, got %q", r.AppID)
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
