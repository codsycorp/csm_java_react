package web

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func runAdminSSRPipeline(html string, ctx *preprocessCtx) string {
	preprocessHTML(&html, ctx)
	finalizeThymeleafHTML(&html, ctx)
	injectIntoHTML(&html, buildScripts(
		map[string]any{"f_logo": ctx.Logo, "f_title": ctx.Title},
		map[string]any{"app_id": ctx.AppID},
		[]any{}, map[string]any{}, map[string]any{}, map[string]any{
			"site_name": ctx.SiteName, "url": ctx.Canonical, "title": ctx.Title,
		}, "",
	))
	return html
}

func visibleTextOutsideRoot(html string) string {
	// crude: body slice before #root, strip tags
	bodyStart := strings.Index(html, "<body")
	rootStart := strings.Index(html, `<div id="root"`)
	if bodyStart < 0 || rootStart <= bodyStart {
		return ""
	}
	frag := html[bodyStart:rootStart]
	re := regexp.MustCompile(`(?s)<script.*?</script>|<style.*?</style>|<[^>]+>`)
	text := re.ReplaceAllString(frag, " ")
	text = strings.Join(strings.Fields(text), " ")
	return text
}

func TestAdminIndexSSRNoStrayGT(t *testing.T) {
	candidates := []string{
		filepath.Join("..", "..", "..", "frontend-admin", "index.html"),
		filepath.Join("..", "..", "..", "frontend-admin", "dist", "index.html"),
	}
	var raw []byte
	var used string
	for _, p := range candidates {
		b, err := os.ReadFile(p)
		if err == nil {
			raw = b
			used = p
			break
		}
	}
	if raw == nil {
		t.Skip("admin index.html not found")
	}
	ctx := &preprocessCtx{
		Title:       "CSM Admin",
		Description: "Admin panel",
		Keywords:    "admin",
		Canonical:   "https://admin.csmbridge.net/login",
		Image:       "https://admin.csmbridge.net/logo.png",
		SiteName:    "https://admin.csmbridge.net",
		Logo:        "https://admin.csmbridge.net/logo.png",
		GSV:         "",
		GTag:        "",
		AppID:       "test_app",
	}
	html := runAdminSSRPipeline(string(raw), ctx)

	prefix := visibleTextOutsideRoot(html)
	if strings.Contains(prefix, ">") {
		t.Fatalf("file %s: stray > in visible body prefix %q", used, prefix)
	}
	for _, bad := range []string{"[[${", "th:text", "th:content", "th:href", "${meta."} {
		if strings.Contains(html, bad) {
			t.Errorf("file %s: unresolved thymeleaf fragment %q still in HTML", used, bad)
		}
	}
}

func TestMultiLineMetaReplaceNoOrphanGT(t *testing.T) {
	html := `<meta property="og:title"
    th:content="${meta.title2!=null ? meta.title2 : (meta.title!=null ? meta.title : meta.f_title)}" />
<meta property="og:image:alt"
    th:content="${meta.title2!=null ? meta.title2 : (meta.title!=null ? meta.title : meta.f_title)}" />`
	ctx := &preprocessCtx{Title: "T", Description: "D", Keywords: "K", Canonical: "https://x", Image: "https://x/i.png", SiteName: "https://x", Logo: "https://x/l.png"}
	preprocessHTML(&html, ctx)
	if strings.Contains(html, ">>") || strings.Contains(html, "> />") || strings.Contains(html, "> >") {
		t.Fatalf("orphan > after meta replace: %q", html)
	}
}

func TestOGImageDoesNotMatchOGImageAlt(t *testing.T) {
	html := `<meta property="og:image" th:content="img.png" />
<meta property="og:image:alt" th:content="alt text" />`
	ctx := &preprocessCtx{Title: "T", Description: "D", Keywords: "K", Canonical: "https://x", Image: "https://x/i.png", SiteName: "https://x", Logo: "https://x/l.png"}
	preprocessHTML(&html, ctx)
	if strings.Count(html, `content="https://x/i.png"`) != 1 {
		t.Fatalf("og:image replace clobbered og:image:alt: %q", html)
	}
	if !strings.Contains(html, `content="T"`) || strings.Contains(html, "th:content") {
		t.Fatalf("og:image:alt not resolved: %q", html)
	}
	if strings.Contains(html, ">>") || strings.Contains(html, "> />") {
		t.Fatalf("orphan > in output: %q", html)
	}
}
