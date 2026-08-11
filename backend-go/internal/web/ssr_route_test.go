package web

import (
	"strings"
	"testing"
)

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

func TestFinalizeSSRRouteDoesNotHardcodeDomainFallbacks(t *testing.T) {
	rm, cleanup := pebbleDataAvailable(t)
	defer cleanup()

	route := finalizeSSRRoute(resolvedRoute{Domain: "unknown-example.test"}, rm, "unknown-example.test")
	if route.AppID == "lmkt" || route.AppID == "wuweb" {
		t.Fatalf("expected no hardcoded app_id fallback, got %q", route.AppID)
	}
	if route.TblServices == "web_services" && route.AppID == "" {
		t.Fatalf("expected tables to stay dynamic, got %+v", route)
	}
}

func TestResolveRoute_HHoldingDomainsPreferWebShell(t *testing.T) {
	rm, cleanup := pebbleDataAvailable(t)
	defer cleanup()

	for _, host := range []string{"h-holding.vn", "h-holding.com.vn"} {
		route := resolveRoute(rm, host, "/")
		if route.RPIndex == "" {
			t.Fatalf("expected rp_index for host %s, got empty route=%+v", host, route)
		}
		if strings.EqualFold(strings.TrimSpace(route.AppType), "admin") || strings.EqualFold(strings.TrimSpace(route.RPIndex), "admin") {
			t.Fatalf("expected website shell for host %s, got admin-like route=%+v", host, route)
		}
	}
}

func TestBuildDomainCandidates_VnComVnFallback(t *testing.T) {
	fromVn := buildDomainCandidates("h-holding.vn")
	if len(fromVn) < 2 || fromVn[0] != "h-holding.vn" || fromVn[1] != "h-holding.com.vn" {
		t.Fatalf("unexpected .vn candidates: %#v", fromVn)
	}

	fromComVn := buildDomainCandidates("h-holding.com.vn")
	if len(fromComVn) < 2 || fromComVn[0] != "h-holding.com.vn" || fromComVn[1] != "h-holding.vn" {
		t.Fatalf("unexpected .com.vn candidates: %#v", fromComVn)
	}
}

func TestResolveRoute_RootPrefersWebWhenFCaseEmpty(t *testing.T) {
	rm := testSSRRecordManager(t)

	if _, err := rm.CreateRecord("csm", "sys_la_routers", map[string]any{
		"id":          "root-admin",
		"domain_name": "rootpref.test",
		"f_case":      "",
		"rp_index":    "admin",
		"app_type":    "admin",
		"run":         1,
	}, nil); err != nil {
		t.Fatalf("CreateRecord admin root row: %v", err)
	}
	if _, err := rm.CreateRecord("csm", "sys_la_routers", map[string]any{
		"id":          "root-web",
		"domain_name": "rootpref.test",
		"f_case":      "",
		"rp_index":    "web",
		"app_type":    "web",
		"run":         1,
	}, nil); err != nil {
		t.Fatalf("CreateRecord web root row: %v", err)
	}

	route := resolveRoute(rm, "rootpref.test", "/")
	if !strings.EqualFold(strings.TrimSpace(route.AppType), "web") {
		t.Fatalf("expected root path to prefer web app_type, got route=%+v", route)
	}
}

func TestResolveRPIndexPub_PrefersWebCatchAllBeforeGenericDomain(t *testing.T) {
	rm := testSSRRecordManager(t)

	if _, err := rm.CreateRecord("csm", "sys_la_routers", map[string]any{
		"id":                 "1",
		"domain_name":        "demo.test",
		"f_case":             "",
		"rp_index":           "admin",
		"app_type":           "admin",
		"app_id":             "csm",
		"tbl_services":       "web_services",
		"tbl_service_detail": "web_service_detail",
		"run":                1,
	}, nil); err != nil {
		t.Fatalf("CreateRecord admin row: %v", err)
	}
	if _, err := rm.CreateRecord("csm", "sys_la_routers", map[string]any{
		"id":                 "2",
		"domain_name":        "demo.test",
		"f_case":             "",
		"rp_index":           "web",
		"app_type":           "web",
		"app_id":             "demo",
		"tbl_services":       "web_services",
		"tbl_service_detail": "web_service_detail",
		"run":                1,
	}, nil); err != nil {
		t.Fatalf("CreateRecord web row: %v", err)
	}

	rp := ResolveRPIndexPub(rm, "demo.test")
	if rp != "web" {
		t.Fatalf("expected ResolveRPIndexPub to prefer web catch-all, got %q", rp)
	}
}
