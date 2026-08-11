package web

import (
	"sync"
	"testing"
)

func countSyncMapEntries(sm *sync.Map) int {
	total := 0
	sm.Range(func(_, _ any) bool {
		total++
		return true
	})
	return total
}

func TestInvalidateSSRCacheOnTableMutation_DomainScoped(t *testing.T) {
	clearSyncMap(&ssrCache)
	clearSyncMap(&ssrCategoryCache)
	clearSyncMap(&sitemapCache)
	t.Cleanup(func() {
		clearSyncMap(&ssrCache)
		clearSyncMap(&ssrCategoryCache)
		clearSyncMap(&sitemapCache)
	})

	ssrCache.Store("example.com:/thong-ke-ket-qua-xo-so:visible=1", &ssrCacheEntry{})
	ssrCache.Store("another.com:/thong-ke-ket-qua-xo-so:visible=1", &ssrCacheEntry{})
	sitemapCache.Store("example.com", &sitemapCacheEntry{})
	sitemapCache.Store("another.com", &sitemapCacheEntry{})

	InvalidateSSRCacheOnTableMutation("web_service_detail", map[string]any{"domain": "www.example.com"})

	if got := countSyncMapEntries(&ssrCache); got != 1 {
		t.Fatalf("expected 1 ssrCache entry after scoped invalidate, got %d", got)
	}
	if got := countSyncMapEntries(&sitemapCache); got != 1 {
		t.Fatalf("expected 1 sitemapCache entry after scoped invalidate, got %d", got)
	}
}

func TestInvalidateSSRCacheOnTableMutation_GlobalFallback(t *testing.T) {
	clearSyncMap(&ssrCache)
	clearSyncMap(&ssrCategoryCache)
	clearSyncMap(&sitemapCache)
	t.Cleanup(func() {
		clearSyncMap(&ssrCache)
		clearSyncMap(&ssrCategoryCache)
		clearSyncMap(&sitemapCache)
	})

	ssrCache.Store("example.com:/a:visible=1", &ssrCacheEntry{})
	ssrCache.Store("another.com:/b:visible=1", &ssrCacheEntry{})
	ssrCategoryCache.Store("example.com", &ssrCategoryCacheEntry{})
	sitemapCache.Store("example.com", &sitemapCacheEntry{})

	InvalidateSSRCacheOnTableMutation("web_services", map[string]any{})

	if got := countSyncMapEntries(&ssrCache); got != 0 {
		t.Fatalf("expected empty ssrCache after global fallback, got %d", got)
	}
	if got := countSyncMapEntries(&ssrCategoryCache); got != 0 {
		t.Fatalf("expected empty ssrCategoryCache after global fallback, got %d", got)
	}
	if got := countSyncMapEntries(&sitemapCache); got != 0 {
		t.Fatalf("expected empty sitemapCache after global fallback, got %d", got)
	}
}

func TestInvalidateSSRCacheOnTableMutation_IgnoresUnrelatedTables(t *testing.T) {
	clearSyncMap(&ssrCache)
	t.Cleanup(func() { clearSyncMap(&ssrCache) })

	ssrCache.Store("example.com:/a:visible=1", &ssrCacheEntry{})
	InvalidateSSRCacheOnTableMutation("csm_accounts", map[string]any{"domain": "example.com"})

	if got := countSyncMapEntries(&ssrCache); got != 1 {
		t.Fatalf("expected unrelated table to keep cache intact, got %d", got)
	}
}
