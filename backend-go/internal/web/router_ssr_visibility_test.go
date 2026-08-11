package web

import (
	"net/http/httptest"
	"testing"
)

func TestShouldInjectVisibleSSRBody_OnlyForKnownCrawlerUA(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36")
	if shouldInjectVisibleSSRBody(req, "") {
		t.Fatal("expected normal browser UA to not inject visible SSR body")
	}

	reqBot := httptest.NewRequest("GET", "/", nil)
	reqBot.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")
	if !shouldInjectVisibleSSRBody(reqBot, "") {
		t.Fatal("expected Googlebot UA to inject visible SSR body")
	}
}

func TestShouldInjectVisibleSSRBody_QueryOverrideWins(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh) Chrome/138.0 Safari/537.36")

	if !shouldInjectVisibleSSRBody(req, "ssr_visible=1") {
		t.Fatal("expected ssr_visible=1 to force injection")
	}
	if shouldInjectVisibleSSRBody(req, "ssr_visible=0") {
		t.Fatal("expected ssr_visible=0 to force disable injection")
	}
}
