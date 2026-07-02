package web

import "testing"

func TestShouldCacheSSRPage_SkipsEmptyCategoryList(t *testing.T) {
	html := `<html><script>window.__INITIAL_REACT_DATA__={"serviceDetailList":[],"totalCount":0}</script></html>`
	if shouldCacheSSRPage("/phan-mem", html) {
		t.Fatal("expected empty category listing page to skip cache")
	}
}

func TestShouldCacheSSRPage_DetailWithDataStillCaches(t *testing.T) {
	html := `<html><script>window.__INITIAL_REACT_DATA__={"serviceDetail":{"id":"1"}}</script></html>`
	if !shouldCacheSSRPage("/phan-mem/tin-a", html) {
		t.Fatal("expected resolved detail page to be cacheable")
	}
}
