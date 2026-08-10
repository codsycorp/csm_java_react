package web

import "testing"

func TestShouldCacheSSRPage_EmptyCategoryListStillCachesForOneSegmentRoute(t *testing.T) {
	html := `<html><script>window.__INITIAL_REACT_DATA__={"serviceDetailList":[],"totalCount":0}</script></html>`
	if !shouldCacheSSRPage("/phan-mem", html) {
		t.Fatal("expected one-segment category listing page to be cacheable")
	}
	if ttl := resolveSSRCacheTTL("/phan-mem", html); ttl != ssrShortCacheTTL {
		t.Fatalf("expected short TTL for empty category list, got %v", ttl)
	}
}

func TestShouldCacheSSRPage_DetailWithDataStillCaches(t *testing.T) {
	html := `<html><script>window.__INITIAL_REACT_DATA__={"serviceDetail":{"id":"1"}}</script></html>`
	if !shouldCacheSSRPage("/phan-mem/tin-a", html) {
		t.Fatal("expected resolved detail page to be cacheable")
	}
}

func TestResolveSSRCacheTTL_DetailMissUsesVeryShortTTL(t *testing.T) {
	html := `<html><script>window.__INITIAL_REACT_DATA__={"serviceDetailList":[],"totalCount":0}</script></html>`
	if ttl := resolveSSRCacheTTL("/cho-thue-xe/tin-a", html); ttl != ssrMissCacheTTL {
		t.Fatalf("expected miss TTL for unresolved detail page, got %v", ttl)
	}
}
