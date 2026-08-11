package web

import (
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"os"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
)

const ssrCacheTTL = 30 * time.Minute
const ssrShortCacheTTL = 90 * time.Second
const ssrMissCacheTTL = 30 * time.Second
const ssrShellCacheTTL = 10 * time.Minute
const ssrCategoryCacheTTL = 10 * time.Minute
const ssrSlowLogDefault = 1200 * time.Millisecond
const ssrDetailPrefixFallbackMaxSlugLen = 64

func routerRunActiveFilter() model.SearchFilter {
	return model.SearchFilter{Field: "run", FilterType: "in", Value: []any{1, "1", true}}
}

type ssrCacheEntry struct {
	data    string
	expires time.Time
}

type ssrInflightEntry struct {
	done chan string
}

type ssrShellCacheEntry struct {
	html    string
	expires time.Time
}

type ssrCategoryCacheEntry struct {
	categories         []any
	dynamicTemplates   map[string]any
	mainServiceCode    string
	defaultServiceCode string
	expires            time.Time
}

var ssrCache sync.Map
var ssrInflight sync.Map
var ssrShellCache sync.Map
var ssrCategoryCache sync.Map

type sitemapCacheEntry struct {
	body    string
	expires time.Time
}

var sitemapCache sync.Map

const sitemapCacheTTL = 5 * time.Minute

// CachedBuildSitemap avoids rebuilding sitemap XML on every crawler hit.
func CachedBuildSitemap(rm *data.RecordManager, host string) string {
	hostKey := strings.TrimSpace(host)
	if hostKey == "" {
		hostKey = "default"
	}
	if entry, ok := sitemapCache.Load(hostKey); ok {
		if ce, ok := entry.(*sitemapCacheEntry); ok && time.Now().Before(ce.expires) {
			return ce.body
		}
	}
	body := BuildSitemap(rm, host)
	sitemapCache.Store(hostKey, &sitemapCacheEntry{
		body:    body,
		expires: time.Now().Add(sitemapCacheTTL),
	})
	return body
}

type SSRContext struct {
	RM *data.RecordManager
}

type resolvedRoute struct {
	RPIndex          string
	AppID            string
	TblServices      string
	TblServiceDetail string
	FTitle           string
	FKeyword         string
	FLogo            string
	AppType          string
	Domain           string
	GSV              string
	GTag             string
}

type seoMeta struct {
	Title       string
	Description string
	Keywords    string
	Image       string
	Lang        string
	Slug        string
	FromService bool
}

func (s seoMeta) toRouteValue() map[string]any {
	return map[string]any{
		"title":       s.Title,
		"description": s.Description,
		"keywords":    s.Keywords,
		"image":       s.Image,
		"lang":        s.Lang,
		"slug":        s.Slug,
	}
}

type preprocessCtx struct {
	Title           string
	Description     string
	Keywords        string
	RobotsPolicy    string
	Canonical       string
	Image           string
	SiteName        string
	Logo            string
	GSV             string
	GTag            string
	AppID           string
	PageType        string // website | article
	Author          string
	PublishedAt     string
	ModifiedAt      string
	Lang            string
	PagePath        string
	BaseURL         string
	DefaultCategory string
	InitialData     map[string]any
	Categories      []any
}

func RenderPage(ctx SSRContext, uri, host, queryStr string, includeVisibleBody bool) string {
	host = resolveSSRHostForDev(host, queryStr)
	hostKey := host
	if hostKey == "" {
		hostKey = "default"
	}
	cacheKey := hostKey + ":" + uri
	if includeVisibleBody {
		cacheKey += ":visible=1"
	} else {
		cacheKey += ":visible=0"
	}
	normalizedQS := normalizeSSRCacheQuery(queryStr)
	if normalizedQS != "" {
		cacheKey += "?" + normalizedQS
	}

	if entry, ok := ssrCache.Load(cacheKey); ok {
		if ce, ok := entry.(*ssrCacheEntry); ok && time.Now().Before(ce.expires) {
			return ce.data
		}
	}

	inflight := &ssrInflightEntry{done: make(chan string, 1)}
	actual, loaded := ssrInflight.LoadOrStore(cacheKey, inflight)
	if loaded {
		if ce, ok := actual.(*ssrInflightEntry); ok {
			return <-ce.done
		}
	}

	html := buildSSRHTML(ctx, uri, host, queryStr, includeVisibleBody)
	cacheableQuery := normalizedQS == "" || isSafeSSRCacheQuery(queryStr)
	if cacheableQuery && shouldCacheSSRPage(uri, html) {
		ttl := resolveSSRCacheTTL(uri, html)
		ssrCache.Store(cacheKey, &ssrCacheEntry{
			data:    html,
			expires: time.Now().Add(ttl),
		})
	}
	inflight.done <- html
	close(inflight.done)
	ssrInflight.Delete(cacheKey)
	return html
}

func readSSRShellFile(filePath string) (string, error) {
	if entry, ok := ssrShellCache.Load(filePath); ok {
		if ce, ok := entry.(*ssrShellCacheEntry); ok && time.Now().Before(ce.expires) {
			return ce.html, nil
		}
	}
	raw, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	html := string(raw)
	ssrShellCache.Store(filePath, &ssrShellCacheEntry{html: html, expires: time.Now().Add(ssrShellCacheTTL)})
	return html, nil
}

func normalizeMetaText(raw string, maxLen int) string {
	return strings.TrimSpace(stripHTMLToText(raw, maxLen))
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func cloneAnySlice(in []any) []any {
	if len(in) == 0 {
		return []any{}
	}
	raw, err := json.Marshal(in)
	if err != nil {
		out := make([]any, len(in))
		copy(out, in)
		return out
	}
	out := []any{}
	if err := json.Unmarshal(raw, &out); err != nil {
		out := make([]any, len(in))
		copy(out, in)
		return out
	}
	return out
}

func cloneAnyMap(in map[string]any) map[string]any {
	if len(in) == 0 {
		return map[string]any{}
	}
	raw, err := json.Marshal(in)
	if err != nil {
		out := make(map[string]any, len(in))
		for k, v := range in {
			out[k] = v
		}
		return out
	}
	out := map[string]any{}
	if err := json.Unmarshal(raw, &out); err != nil {
		out := make(map[string]any, len(in))
		for k, v := range in {
			out[k] = v
		}
		return out
	}
	return out
}

// shouldCacheSSRPage keeps SSR pages cacheable; unstable/miss variants use short TTL.
func shouldCacheSSRPage(uri, html string) bool {
	if !looksLikeDetailURI(uri) {
		return true
	}
	return true
}

// resolveSSRCacheTTL uses shorter TTL for potentially transient empty/miss SSR states.
func resolveSSRCacheTTL(uri, html string) time.Duration {
	segs := pathSegmentCount(NormalizeURI(uri))
	if segs >= 2 && !strings.Contains(html, `"serviceDetail"`) {
		return ssrMissCacheTTL
	}
	if segs == 1 {
		if strings.Contains(html, `"serviceDetailList":[]`) || strings.Contains(html, `"serviceDetailList": []`) {
			return ssrShortCacheTTL
		}
	}
	return ssrCacheTTL
}

func pathSegmentCount(path string) int {
	trimmed := strings.TrimPrefix(path, "/")
	n := 0
	for _, s := range strings.Split(trimmed, "/") {
		if strings.TrimSpace(s) != "" {
			n++
		}
	}
	return n
}

func looksLikeDetailURI(uri string) bool {
	p := NormalizeURI(uri)
	trimmed := strings.TrimPrefix(p, "/")
	n := 0
	for _, s := range strings.Split(trimmed, "/") {
		if strings.TrimSpace(s) != "" {
			n++
		}
	}
	// /{service_code}/{slug} — primary detail URL shape
	if n >= 2 {
		return true
	}
	// /{slug} — slug-only detail (Java TRƯỜNG HỢP 2.5)
	return n == 1 && trimmed != "" && trimmed != "home"
}

func ResolveRPIndexPub(rm *data.RecordManager, host string) string {
	domain := DomainFromHost(host)
	if domain == "" {
		return ""
	}
	if route, ok := queryRoute(rm, []model.SearchFilter{
		model.EqFilter("domain_name", domain),
		model.EqFilter("f_case", ""),
		model.EqFilter("app_type", "web"),
		{Field: "rp_index", FilterType: "isnotnull"},
		{Field: "rp_index", FilterType: "noteq", Value: ""},
		routerRunActiveFilter(),
	}); ok {
		if rp := strings.Trim(strings.Trim(route.RPIndex, "/"), " "); rp != "" {
			return rp
		}
	}
	if route, ok := queryReactCatchAllRoute(rm, domain); ok {
		if rp := strings.Trim(strings.Trim(route.RPIndex, "/"), " "); rp != "" {
			return rp
		}
	}
	if route, ok := queryRoute(rm, []model.SearchFilter{
		model.EqFilter("domain_name", domain),
		model.EqFilter("app_type", "web"),
		{Field: "rp_index", FilterType: "isnotnull"},
		{Field: "rp_index", FilterType: "noteq", Value: ""},
		routerRunActiveFilter(),
	}); ok {
		if rp := strings.Trim(strings.Trim(route.RPIndex, "/"), " "); rp != "" {
			return rp
		}
	}
	if route, ok := queryRoute(rm, []model.SearchFilter{
		model.EqFilter("domain_name", domain),
		{Field: "rp_index", FilterType: "isnotnull"},
		{Field: "rp_index", FilterType: "noteq", Value: ""},
		routerRunActiveFilter(),
	}); ok {
		if rp := strings.Trim(strings.Trim(route.RPIndex, "/"), " "); rp != "" {
			return rp
		}
	}
	if rp := findRouterRPIndexByDomain(rm, domain); rp != "" {
		return rp
	}
	return ""
}

func findRouterRPIndexByDomain(rm *data.RecordManager, domain string) string {
	rows := rowsFrom(rm.Filter("csm", "sys_la_routers", model.SearchFilter{Operator: "AND", Conditions: []model.SearchFilter{
		routerRunActiveFilter(),
	}}))
	rows = filterRouterRowsByDomainAliases(rows, []model.SearchFilter{model.EqFilter("domain_name", domain)})
	bestScore := -1
	bestRP := ""
	for _, row := range rows {
		rp := strings.Trim(strings.Trim(recordStr(row, "rp_index"), "/"), " ")
		if rp == "" {
			continue
		}
		score := 0
		if strings.EqualFold(strings.TrimSpace(recordStr(row, "app_type")), "web") {
			score += 100
		}
		if strings.TrimSpace(recordStr(row, "app_id")) != "" {
			score += 20
		}
		if strings.TrimSpace(recordStr(row, "tbl_services")) != "" {
			score += 10
		}
		if strings.TrimSpace(recordStr(row, "tbl_service_detail")) != "" {
			score += 10
		}
		if strings.TrimSpace(recordStr(row, "f_title")) != "" {
			score += 5
		}
		if score > bestScore {
			bestScore = score
			bestRP = rp
		}
	}
	return bestRP
}

func BuildSitemap(rm *data.RecordManager, host string) string {
	domain := DomainFromHost(host)
	baseHost := host
	if baseHost == "" {
		baseHost = domain
	}
	baseURL := "https://" + baseHost

	var xml strings.Builder
	xml.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	xml.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)
	xml.WriteString(sitemapURLEntry(baseURL+"/", "", "daily", "1.0"))

	seen := map[string]struct{}{"/": {}}

	routeFilter := model.SearchFilter{
		Operator: "AND",
		Conditions: []model.SearchFilter{
			{Field: "domain_name", FilterType: "like", Value: domain},
			model.EqFilter("run", 1),
		},
	}
	routeRows := rowsFrom(rm.Filter("csm", "sys_la_routers", routeFilter))

	for _, row := range routeRows {
		appID := strings.TrimSpace(recordStr(row, "app_id"))
		tblServices := strings.TrimSpace(recordStr(row, "tbl_services"))
		tblDetail := strings.TrimSpace(recordStr(row, "tbl_service_detail"))
		if appID == "" {
			continue
		}

		likeDomain := model.SearchFilter{
			Field:      "domain",
			FilterType: "like",
			Value:      domain,
		}

		if tblServices != "" {
			catFilter := model.SearchFilter{
				Operator: "AND",
				Conditions: []model.SearchFilter{
					model.EqFilter("status", "active"),
					likeDomain,
				},
			}
			for _, r := range rowsFrom(rm.Filter(appID, tblServices, catFilter)) {
				slug := strings.Trim(strings.TrimSuffix(recordStr(r, "slug"), ".shtml"), " ")
				if slug == "" {
					continue
				}
				path := canonicalSEOPath("/" + slug)
				if _, ok := seen[path]; !ok {
					seen[path] = struct{}{}
					lm := extractDateOnly(resolveLastmodFromRow(r))
					xml.WriteString(sitemapURLEntry(baseURL+path, lm, "weekly", "0.8"))
				}
			}
		}

		if tblDetail != "" {
			detFilter := model.SearchFilter{
				Operator: "AND",
				Conditions: []model.SearchFilter{
					model.EqFilter("status", "active"),
					likeDomain,
				},
			}
			for _, r := range rowsFrom(rm.Filter(appID, tblDetail, detFilter)) {
				svcType := strings.TrimSpace(recordStr(r, "service_type"))
				slug := strings.Trim(strings.TrimSuffix(recordStr(r, "slug"), ".shtml"), " ")
				if slug == "" {
					continue
				}
				path := "/" + slug
				if svcType != "" {
					path = "/" + svcType + "/" + slug
				}
				path = canonicalSEOPath(path)
				if _, ok := seen[path]; !ok {
					seen[path] = struct{}{}
					lm := extractDateOnly(resolveLastmodFromRow(r))
					xml.WriteString(sitemapURLEntry(baseURL+path, lm, "weekly", "0.8"))
				}
			}
		}
	}

	xml.WriteString("\n</urlset>")
	return xml.String()
}

func sitemapURLEntry(url, lastmod, changefreq, priority string) string {
	var s strings.Builder
	s.WriteString("\n  <url>\n    <loc>")
	s.WriteString(xmlEscape(url))
	s.WriteString("</loc>\n")
	if lastmod = strings.TrimSpace(lastmod); lastmod != "" {
		s.WriteString("    <lastmod>")
		s.WriteString(xmlEscape(lastmod))
		s.WriteString("</lastmod>\n")
	}
	s.WriteString("    <changefreq>")
	s.WriteString(changefreq)
	s.WriteString("</changefreq>\n    <priority>")
	s.WriteString(priority)
	s.WriteString("</priority>\n  </url>")
	return s.String()
}

func buildSSRHTML(ctx SSRContext, uri, host, queryStr string, includeVisibleBody bool) string {
	start := time.Now()
	profEnabled := isSSRStageProfileEnabled()
	slowThreshold := resolveSSRSlowLogThreshold()
	stageStart := start
	stageDurations := make(map[string]time.Duration, 8)
	markStage := func(name string) {
		stageDurations[name] = time.Since(stageStart)
		stageStart = time.Now()
	}
	defer func() {
		total := time.Since(start)
		if !profEnabled && total < slowThreshold {
			return
		}
		log.Printf(
			"SSR profile path=%s total_ms=%d slow_threshold_ms=%d stages=%s",
			uri,
			total.Milliseconds(),
			slowThreshold.Milliseconds(),
			formatSSRStageDurations(stageDurations),
		)
	}()

	host = resolveSSRHostForDev(host, queryStr)
	normalizedPath := NormalizeIncomingWebPath(uri)
	route := finalizeSSRRoute(resolveRoute(ctx.RM, host, normalizedPath), ctx.RM, host)
	isWebAppType := strings.EqualFold(strings.TrimSpace(route.AppType), "web")
	allowVisibleBody := includeVisibleBody && isWebAppType
	markStage("route")
	domain := route.Domain
	if domain == "" {
		domain = DomainFromHost(host)
	}

	rpIndex := route.RPIndex
	indexPath := "index.html"
	if rpIndex != "" {
		indexPath = rpIndex + "/index.html"
	}

	params := parseQS(queryStr)
	lang := resolveLang(params)
	robotsPolicy := "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
	if shouldNoIndexSSRQuery(params) {
		robotsPolicy = "noindex,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
	}

	protocol := "https"
	hostStr := host
	if hostStr == "" {
		hostStr = domain
	}
	baseURL := protocol + "://" + hostStr
	canonical := buildLocalizedURL(baseURL, normalizedPath, lang)

	categories := []any{}
	dynamicTemplates := map[string]any{}
	mainServiceCode := ""
	defaultServiceCode := ""
	if isWebAppType {
		categories, dynamicTemplates, mainServiceCode, defaultServiceCode =
			loadCategoriesFull(ctx.RM, route, domain, lang)
	}
	markStage("categories")

	pageTitle := route.FTitle
	if pageTitle == "" {
		pageTitle = "Trang web của tôi"
	}
	pageDescription := route.FKeyword
	if pageDescription == "" {
		pageDescription = "Mô tả mặc định"
	}
	pageKeywords := route.FKeyword
	ogImage := absoluteAssetURL(route.FLogo, protocol, hostStr)

	var seo *seoMeta
	if isWebAppType && route.AppID != "" && route.TblServices != "" && route.TblServiceDetail != "" {
		if s := resolveSEOForServiceRoute(ctx.RM, route, domain, normalizedPath, mainServiceCode, defaultServiceCode, lang); s != nil {
			seo = s
			if seo.Title != "" {
				pageTitle = seo.Title
			}
			if seo.FromService {
				// Keep category metadata strictly sourced from TblServices, without router fallback.
				pageDescription = seo.Description
				pageKeywords = seo.Keywords
			} else {
				if seo.Description != "" {
					pageDescription = seo.Description
				}
				if seo.Keywords != "" {
					pageKeywords = seo.Keywords
				}
			}
			if seo.Image != "" {
				ogImage = absoluteAssetURL(seo.Image, protocol, hostStr)
			}
		}
	}
	markStage("seo")
	// Fallback to sys_la_routers meta when no service/detail matched (Java behavior)
	if seo == nil {
		if route.FTitle != "" {
			pageTitle = route.FTitle
		}
		if route.FKeyword != "" {
			pageDescription = route.FKeyword
			pageKeywords = route.FKeyword
		}
		if route.FLogo != "" {
			ogImage = absoluteAssetURL(route.FLogo, protocol, hostStr)
		}
	}

	if ogImage == "" {
		ogImage = absoluteAssetURL("default_og_image.png", protocol, hostStr)
	}

	routeLogo := absoluteAssetURL(route.FLogo, protocol, hostStr)

	meta := map[string]any{
		"site_name":     baseURL,
		"url":           canonical,
		"gsv":           route.GSV,
		"gtag":          route.GTag,
		"title":         pageTitle,
		"title2":        pageTitle,
		"f_title":       pageTitle,
		"description":   pageDescription,
		"f_description": pageDescription,
		"keywords":      pageKeywords,
		"f_keyword":     pageKeywords,
		"image":         ogImage,
		"f_logo":        routeLogo,
		"og_image":      ogImage,
		"id":            route.AppID,
		"app_id":        route.AppID,
	}

	// Normalize SEO text fields to guarantee non-empty, crawler-safe meta output.
	pageTitle = firstNonEmpty(normalizeMetaText(pageTitle, 120), "Trang web của tôi")
	pageDescription = firstNonEmpty(
		normalizeMetaText(pageDescription, 220),
		normalizeMetaText(pageKeywords, 220),
		normalizeMetaText(pageTitle, 220),
		"Nội dung đang được cập nhật.",
	)
	pageKeywords = firstNonEmpty(normalizeMetaText(pageKeywords, 255), pageDescription)

	if seo != nil {
		seo.Title = pageTitle
		seo.Description = pageDescription
		seo.Keywords = pageKeywords
		if seo.Image == "" {
			seo.Image = ogImage
		}
	}

	ssrRoutes := map[string]any{}
	if isWebAppType {
		ssrRoutes[normalizedPath] = map[string]any{
			"title":       pageTitle,
			"description": pageDescription,
			"keywords":    pageKeywords,
			"image":       ogImage,
			"lang":        lang,
		}
		if seo != nil {
			ssrRoutes[normalizedPath] = seo.toRouteValue()
		}
	}

	initialData := map[string]any{
		"pageTitle":       pageTitle,
		"pageDescription": pageDescription,
		"pageKeywords":    pageKeywords,
		"canonicalUrl":    canonical,
		"ogImage":         ogImage,
		"currentPagePath": normalizedPath,
		"app_id":          route.AppID,
	}

	// Keep data hydration independent from static index availability: local/dev routes may omit rp_index.
	if isWebAppType && route.AppID != "" && route.TblServiceDetail != "" {
		listing := resolveServiceListing(ctx.RM, route, domain, normalizedPath, params, mainServiceCode, defaultServiceCode)
		enrichInitialData(initialData, listing, protocol, hostStr)
		applySpecialPageHint(initialData)
		if shouldApplyServiceCategorySeoOverrides(initialData) {
			cat := initialData["serviceCategory"].(map[string]any)
			pageTitle, pageDescription, pageKeywords, canonical, ogImage = applyServiceCategorySeoOverrides(cat, lang, pageTitle, pageDescription, pageKeywords, canonical, ogImage)
			pageTitle = firstNonEmpty(normalizeMetaText(pageTitle, 120), "Trang web của tôi")
			pageDescription = firstNonEmpty(
				normalizeMetaText(pageDescription, 220),
				normalizeMetaText(pageKeywords, 220),
				normalizeMetaText(pageTitle, 220),
				"Nội dung đang được cập nhật.",
			)
			pageKeywords = firstNonEmpty(normalizeMetaText(pageKeywords, 255), pageDescription)
			initialData["pageTitle"] = pageTitle
			initialData["pageDescription"] = pageDescription
			initialData["pageKeywords"] = pageKeywords
			initialData["canonicalUrl"] = canonical
			initialData["ogImage"] = ogImage
			meta["title"] = pageTitle
			meta["title2"] = pageTitle
			meta["f_title"] = pageTitle
			meta["description"] = pageDescription
			meta["f_description"] = pageDescription
			meta["keywords"] = pageKeywords
			meta["f_keyword"] = pageKeywords
			meta["image"] = ogImage
			meta["og_image"] = ogImage
			if seo == nil {
				seo = &seoMeta{Lang: lang, Title: pageTitle, Description: pageDescription, Keywords: pageKeywords, Image: ogImage}
			} else {
				seo.Title = pageTitle
				seo.Description = pageDescription
				seo.Keywords = pageKeywords
				seo.Image = ogImage
			}
			if isWebAppType {
				ssrRoutes[normalizedPath] = seo.toRouteValue()
			}
		}
		if _, ok := listing["serviceDetail"]; !ok && looksLikeDetailURI(normalizedPath) {
			log.Printf("SSR warn: detail URL %s (domain=%s app=%s table=%s) — no serviceDetail in listing",
				normalizedPath, domain, route.AppID, route.TblServiceDetail)
		}
	}
	allowVisibleBody = allowVisibleBody && hasVisibleSEOContent(initialData)
	markStage("listing")

	appConfig := map[string]any{"f_logo": route.FLogo, "f_title": pageTitle}
	if routeLogo := absoluteAssetURL(route.FLogo, protocol, hostStr); routeLogo != "" {
		appConfig["f_logo"] = routeLogo
	}
	scripts := buildScripts(appConfig, initialData, categories, ssrRoutes, dynamicTemplates, meta, defaultServiceCode)
	if monolith := buildMonolithBootstrapScript(ctx.RM, host, rpIndex); monolith != "" {
		scripts = monolith + scripts
	}
	markStage("scripts")

	preload := ""
	if strings.HasPrefix(ogImage, "http://") || strings.HasPrefix(ogImage, "https://") {
		preload = fmt.Sprintf(`<link rel="preload" as="image" href="%s" fetchpriority="high">`, htmlEsc(ogImage))
	}
	resourceHints := buildSSRResourceHints(ogImage, route.GTag)
	headHints := preload + resourceHints
	pageType := resolveSSRPageType(initialData)
	preCtx := &preprocessCtx{
		Title:           pageTitle,
		Description:     pageDescription,
		Keywords:        pageKeywords,
		RobotsPolicy:    robotsPolicy,
		Canonical:       canonical,
		Image:           ogImage,
		SiteName:        baseURL,
		Logo:            routeLogo,
		GSV:             route.GSV,
		GTag:            route.GTag,
		AppID:           route.AppID,
		PageType:        pageType,
		Author:          resolveSSRAuthor(initialData),
		PublishedAt:     resolveSSRPublishedAt(initialData),
		ModifiedAt:      resolveSSRModifiedAt(initialData),
		Lang:            lang,
		PagePath:        normalizedPath,
		BaseURL:         baseURL,
		DefaultCategory: defaultServiceCode,
		InitialData:     initialData,
		Categories:      categories,
	}

	filePath := ctx.RM.GetStaticFile(indexPath)
	if filePath == "" && rpIndex != "" {
		if p := ctx.RM.GetStaticFile(rpIndex + "/index.html"); p != "" {
			filePath = p
		}
	}
	if filePath == "" {
		if p := ctx.RM.GetStaticFile("index.html"); p != "" {
			filePath = p
		}
	}

	if filePath != "" {
		raw, err := readSSRShellFile(filePath)
		if err == nil {
			lowerFilePath := strings.ToLower(filePath)
			if strings.Contains(lowerFilePath, string(os.PathSeparator)+"frontend"+string(os.PathSeparator)+"index.html") || strings.Contains(lowerFilePath, string(os.PathSeparator)+"admin"+string(os.PathSeparator)+"index.html") {
				visibleBodyHTML := ""
				if allowVisibleBody {
					visibleBodyHTML = buildSSRVisibleBodyHTML(preCtx)
				}
				html, tplErr := renderPublicShellTemplate(raw, publicShellData{
					Lang:            lang,
					BaseURL:         baseURL,
					Title:           pageTitle,
					Description:     pageDescription,
					Keywords:        pageKeywords,
					Canonical:       canonical,
					Image:           ogImage,
					SiteName:        baseURL,
					Logo:            routeLogo,
					GSV:             route.GSV,
					GTag:            route.GTag,
					AppID:           route.AppID,
					PageType:        pageType,
					Preload:         template.HTML(headHints),
					StructuredData:  template.HTML(buildStructuredDataGraph(preCtx)),
					InjectedScripts: template.HTML(scripts),
				})
				if tplErr == nil {
					preprocessHTML(&html, preCtx)
					applySSRRobotsPolicy(&html, robotsPolicy)
					if allowVisibleBody {
						injectSSRVisibleBody(&html, visibleBodyHTML)
					}
					markStage("template")
					return html
				}
				log.Printf("SSR template render failed for %s: %v", filePath, tplErr)
			}

			html := raw
			preprocessHTML(&html, preCtx)
			finalizeThymeleafHTML(&html, &preprocessCtx{GTag: route.GTag})
			injectIntoHTML(&html, headHints+scripts)
			if allowVisibleBody {
				injectSSRVisibleBody(&html, buildSSRVisibleBodyHTML(preCtx))
			}
			markStage("template")
			return html
		}
	}

	log.Printf("SSR fallback (index.html not found for rp_index=%s)", rpIndex)
	markStage("fallback")
	return fallbackHTML(&preprocessCtx{
		Title:           pageTitle,
		Description:     pageDescription,
		Keywords:        pageKeywords,
		RobotsPolicy:    robotsPolicy,
		Canonical:       canonical,
		Image:           ogImage,
		SiteName:        baseURL,
		Logo:            routeLogo,
		GSV:             route.GSV,
		GTag:            route.GTag,
		AppID:           route.AppID,
		PageType:        resolveSSRPageType(initialData),
		Author:          resolveSSRAuthor(initialData),
		PublishedAt:     resolveSSRPublishedAt(initialData),
		ModifiedAt:      resolveSSRModifiedAt(initialData),
		Lang:            lang,
		PagePath:        normalizedPath,
		BaseURL:         baseURL,
		DefaultCategory: defaultServiceCode,
		InitialData:     initialData,
		Categories:      categories,
	}, uri, route.AppID, rpIndex, scripts, allowVisibleBody)
}

func isSSRStageProfileEnabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("SSR_PROFILE_STAGES")))
	switch v {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func resolveSSRSlowLogThreshold() time.Duration {
	raw := strings.TrimSpace(os.Getenv("SSR_SLOW_LOG_MS"))
	if raw == "" {
		return ssrSlowLogDefault
	}
	ms, err := strconv.Atoi(raw)
	if err != nil || ms <= 0 {
		return ssrSlowLogDefault
	}
	return time.Duration(ms) * time.Millisecond
}

func formatSSRStageDurations(stages map[string]time.Duration) string {
	if len(stages) == 0 {
		return "-"
	}
	ordered := []string{"route", "categories", "seo", "listing", "scripts", "template", "fallback"}
	parts := make([]string, 0, len(ordered))
	for _, key := range ordered {
		if d, ok := stages[key]; ok {
			parts = append(parts, fmt.Sprintf("%s=%dms", key, d.Milliseconds()))
		}
	}
	if len(parts) == 0 {
		return "-"
	}
	return strings.Join(parts, " ")
}

func resolveSSRHostForDev(host, queryStr string) string {
	domain := DomainFromHost(host)
	isLocalDomain := domain == "localhost" || domain == "127.0.0.1" || strings.HasSuffix(domain, ".local")
	if !isLocalDomain {
		return host
	}

	raw := strings.TrimSpace(QSParam(queryStr, "__host"))
	if raw == "" {
		raw = strings.TrimSpace(QSParam(queryStr, "ssr_host"))
	}
	if raw == "" {
		return host
	}

	raw = strings.ToLower(strings.TrimSpace(raw))
	raw = strings.TrimPrefix(raw, "http://")
	raw = strings.TrimPrefix(raw, "https://")
	raw = strings.TrimSuffix(raw, "/")
	if raw == "" {
		return host
	}

	for _, ch := range raw {
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '.' || ch == '-' || ch == ':' {
			continue
		}
		return host
	}

	return raw
}

func normalizeFCase(path string) string {
	fCase := strings.TrimSpace(strings.ReplaceAll(path, ".shtml", ""))
	if fCase == "/" {
		return ""
	}
	return fCase
}

func buildDomainCandidates(domain string) []string {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return nil
	}

	seen := map[string]struct{}{}
	out := make([]string, 0, 3)
	add := func(v string) {
		v = strings.ToLower(strings.TrimSpace(v))
		if v == "" {
			return
		}
		if _, ok := seen[v]; ok {
			return
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}

	add(domain)

	if strings.HasSuffix(domain, ".com.vn") {
		base := strings.TrimSuffix(domain, ".com.vn")
		if base != "" {
			add(base + ".vn")
		}
	} else if strings.HasSuffix(domain, ".vn") {
		base := strings.TrimSuffix(domain, ".vn")
		if base != "" && !strings.HasSuffix(base, ".com") {
			add(base + ".com.vn")
		}
	}

	return out
}

func resolveRoute(rm *data.RecordManager, host, path string) resolvedRoute {
	domain := DomainFromHost(host)
	if domain == "" {
		return resolvedRoute{}
	}

	domainCandidates := buildDomainCandidates(domain)
	if len(domainCandidates) == 0 {
		domainCandidates = []string{domain}
	}

	fCase := normalizeFCase(path)

	// Priority 1: exact domain + f_case (Java WebSpringController / Rust resolve_route)
	for _, candidate := range domainCandidates {
		if fCase == "" {
			if route, ok := queryRoute(rm, []model.SearchFilter{
				model.EqFilter("domain_name", candidate),
				model.EqFilter("f_case", fCase),
				model.EqFilter("app_type", "web"),
				routerRunActiveFilter(),
			}); ok {
				route.Domain = candidate
				return route
			}
		}
		if route, ok := queryRoute(rm, []model.SearchFilter{
			model.EqFilter("domain_name", candidate),
			model.EqFilter("f_case", fCase),
			routerRunActiveFilter(),
		}); ok {
			route.Domain = candidate
			return route
		}
	}

	// Priority 2: SSR React catch-all (f_case="" + rp_index)
	for _, candidate := range domainCandidates {
		if route, ok := queryReactCatchAllRoute(rm, candidate); ok {
			route.Domain = candidate
			return route
		}
	}

	// Priority 3a: domain + app_type=web
	for _, candidate := range domainCandidates {
		if route, ok := queryRoute(rm, []model.SearchFilter{
			model.EqFilter("domain_name", candidate),
			model.EqFilter("app_type", "web"),
			routerRunActiveFilter(),
		}); ok {
			route.Domain = candidate
			return route
		}
	}

	// Priority 3b: global default
	if route, ok := queryRoute(rm, []model.SearchFilter{
		model.EqFilter("domain_name", ""),
		model.EqFilter("f_case", "default"),
		routerRunActiveFilter(),
	}); ok {
		return route
	}

	return resolvedRoute{Domain: domain}
}

func queryReactCatchAllRoute(rm *data.RecordManager, domain string) (resolvedRoute, bool) {
	filter := model.SearchFilter{Operator: "AND", Conditions: []model.SearchFilter{
		model.EqFilter("domain_name", domain),
		model.EqFilter("f_case", ""),
		{Field: "rp_index", FilterType: "isnotnull"},
		{Field: "rp_index", FilterType: "noteq", Value: ""},
		routerRunActiveFilter(),
	}}
	rows := filterRouterRowsByDomainAliases(rowsFrom(rm.Filter("csm", "sys_la_routers", filter)), []model.SearchFilter{model.EqFilter("domain_name", domain)})
	if len(rows) == 0 {
		if altFilter, ok := rewriteRouterDomainEqToLike(filter); ok {
			rows = filterRouterRowsByDomainAliases(rowsFrom(rm.Filter("csm", "sys_la_routers", altFilter)), []model.SearchFilter{model.EqFilter("domain_name", domain)})
		}
	}
	if len(rows) == 0 {
		return resolvedRoute{}, false
	}
	return resolvedRouteFromRow(rows[0]), true
}

func mergeRouteForSPA(base, overlay resolvedRoute) resolvedRoute {
	out := base
	if overlay.FTitle != "" {
		out.FTitle = overlay.FTitle
	}
	if overlay.FKeyword != "" {
		out.FKeyword = overlay.FKeyword
	}
	if overlay.FLogo != "" {
		out.FLogo = overlay.FLogo
	}
	if overlay.GSV != "" {
		out.GSV = overlay.GSV
	}
	if overlay.GTag != "" {
		out.GTag = overlay.GTag
	}
	if strings.TrimSpace(overlay.AppID) != "" {
		out.AppID = overlay.AppID
	}
	if strings.TrimSpace(overlay.TblServices) != "" {
		out.TblServices = overlay.TblServices
	}
	if strings.TrimSpace(overlay.TblServiceDetail) != "" {
		out.TblServiceDetail = overlay.TblServiceDetail
	}
	return out
}

func finalizeSSRRoute(route resolvedRoute, rm *data.RecordManager, host string) resolvedRoute {
	domain := strings.TrimSpace(route.Domain)
	if domain == "" {
		domain = DomainFromHost(host)
	}
	route.Domain = domain

	if strings.TrimSpace(route.RPIndex) == "" {
		if pub := ResolveRPIndexPub(rm, host); pub != "" {
			route.RPIndex = pub
		}
	}

	// Dynamic tables/metadata from sys_la_routers catch-all when the selected route row is incomplete.
	// Do NOT copy rp_index from catch-all — Java shouldAttemptSSR uses only the selected route's rp_index.
	if catch, ok := queryReactCatchAllRoute(rm, domain); ok {
		if strings.TrimSpace(route.AppID) == "" {
			route.AppID = catch.AppID
		}
		if strings.TrimSpace(route.TblServices) == "" {
			route.TblServices = catch.TblServices
		}
		if strings.TrimSpace(route.TblServiceDetail) == "" {
			route.TblServiceDetail = catch.TblServiceDetail
		}
		if strings.TrimSpace(route.FTitle) == "" {
			route.FTitle = catch.FTitle
		}
		if strings.TrimSpace(route.FLogo) == "" {
			route.FLogo = catch.FLogo
		}
	}
	route.AppID = normalizeTableAppID(route.AppID)
	route.TblServices = normalizeTableName(route.AppID, route.TblServices)
	route.TblServiceDetail = normalizeTableName(route.AppID, route.TblServiceDetail)
	return route
}

// normalizeTableName strips accidental "{app_id}." prefix from tbl_services values.
func normalizeTableName(appID, table string) string {
	table = strings.TrimSpace(table)
	if table == "" {
		return ""
	}
	if appID != "" {
		prefix := strings.ToLower(appID) + "."
		if strings.HasPrefix(strings.ToLower(table), prefix) {
			return table[len(prefix):]
		}
	}
	if i := strings.Index(table, "."); i >= 0 {
		return table[i+1:]
	}
	return table
}

func normalizeTableAppID(appID string) string {
	return strings.TrimSpace(appID)
}

func queryRoute(rm *data.RecordManager, conditions []model.SearchFilter) (resolvedRoute, bool) {
	filter := model.SearchFilter{Operator: "AND", Conditions: conditions}
	rows := filterRouterRowsByDomainAliases(rowsFrom(rm.Filter("csm", "sys_la_routers", filter)), conditions)
	if len(rows) == 0 {
		if altFilter, ok := rewriteRouterDomainEqToLike(filter); ok {
			rows = filterRouterRowsByDomainAliases(rowsFrom(rm.Filter("csm", "sys_la_routers", altFilter)), conditions)
		}
	}
	if len(rows) == 0 {
		return resolvedRoute{}, false
	}
	return resolvedRouteFromRow(rows[0]), true
}

func filterRouterRowsByDomainAliases(rows []map[string]any, conditions []model.SearchFilter) []map[string]any {
	domain := routerDomainConditionValue(conditions)
	if domain == "" {
		return rows
	}
	filtered := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		if routerDomainMatches(recordStr(row, "domain_name"), domain) {
			filtered = append(filtered, row)
		}
	}
	return filtered
}

func routerDomainConditionValue(conditions []model.SearchFilter) string {
	for _, cond := range conditions {
		if strings.EqualFold(strings.TrimSpace(cond.Field), "domain_name") {
			ft := strings.ToLower(strings.TrimSpace(cond.FilterType))
			if ft != "eq" && ft != "like" {
				continue
			}
			return DomainFromHost(cond.ValueString())
		}
	}
	return ""
}

func rewriteRouterDomainEqToLike(filter model.SearchFilter) (model.SearchFilter, bool) {
	changed := false
	var rewrite func(model.SearchFilter) model.SearchFilter
	rewrite = func(current model.SearchFilter) model.SearchFilter {
		if len(current.Conditions) > 0 {
			for i := range current.Conditions {
				current.Conditions[i] = rewrite(current.Conditions[i])
			}
			return current
		}
		if strings.EqualFold(strings.TrimSpace(current.Field), "domain_name") && strings.EqualFold(strings.TrimSpace(current.FilterType), "eq") {
			current.FilterType = "like"
			changed = true
		}
		return current
	}
	return rewrite(filter), changed
}

func routerDomainMatches(rawDomain, requestedDomain string) bool {
	rawDomain = strings.ToLower(strings.TrimSpace(rawDomain))
	requestedDomain = strings.ToLower(strings.TrimSpace(requestedDomain))
	if rawDomain == "" || requestedDomain == "" {
		return false
	}
	for _, token := range strings.FieldsFunc(rawDomain, func(r rune) bool {
		return r == ',' || r == ';' || r == '|' || r == ' ' || r == '\n' || r == '\t' || r == '\r'
	}) {
		token = strings.TrimSpace(strings.TrimPrefix(token, "www."))
		if token == requestedDomain {
			return true
		}
	}
	return strings.TrimPrefix(rawDomain, "www.") == requestedDomain
}

func pickBestResolvedRoute(rows []map[string]any) (resolvedRoute, bool) {
	if len(rows) == 0 {
		return resolvedRoute{}, false
	}
	bestScore := -1
	best := resolvedRoute{}

	for _, row := range rows {
		candidate := resolvedRouteFromRow(row)
		rp := strings.ToLower(strings.TrimSpace(candidate.RPIndex))
		score := 0

		if rp != "" {
			score += 10
		}

		if strings.EqualFold(strings.TrimSpace(candidate.AppType), "web") {
			score += 100
		}
		if strings.TrimSpace(candidate.AppID) != "" {
			score += 20
		}
		if strings.TrimSpace(candidate.TblServices) != "" {
			score += 10
		}
		if strings.TrimSpace(candidate.TblServiceDetail) != "" {
			score += 10
		}
		if strings.TrimSpace(candidate.FTitle) != "" {
			score += 5
		}

		if score > bestScore {
			bestScore = score
			best = candidate
		}
	}

	return best, true
}

func resolvedRouteFromRow(row map[string]any) resolvedRoute {
	s := func(k string) string { return strings.TrimSpace(recordStr(row, k)) }
	sTrim := func(k string) string { return strings.Trim(strings.Trim(s(k), "/"), " ") }
	appID := normalizeTableAppID(sTrim("app_id"))
	return resolvedRoute{
		RPIndex:          sTrim("rp_index"),
		AppID:            appID,
		TblServices:      normalizeTableName(appID, sTrim("tbl_services")),
		TblServiceDetail: normalizeTableName(appID, sTrim("tbl_service_detail")),
		FTitle:           s("f_title"),
		FKeyword:         s("f_keyword"),
		FLogo:            s("f_logo"),
		AppType:          s("app_type"),
		Domain:           s("domain_name"),
		GSV:              s("gsv"),
		GTag:             s("gtag"),
	}
}

func loadCategoriesFull(rm *data.RecordManager, route resolvedRoute, domain, lang string) ([]any, map[string]any, string, string) {
	if route.AppID == "" || route.TblServices == "" {
		return []any{}, map[string]any{}, "", ""
	}

	cacheKey := strings.Join([]string{route.AppID, route.TblServices, domain, lang}, "|")
	if entry, ok := ssrCategoryCache.Load(cacheKey); ok {
		if ce, ok := entry.(*ssrCategoryCacheEntry); ok && time.Now().Before(ce.expires) {
			return cloneAnySlice(ce.categories), cloneAnyMap(ce.dynamicTemplates), ce.mainServiceCode, ce.defaultServiceCode
		}
	}

	filter := model.SearchFilter{
		Operator: "AND",
		Conditions: []model.SearchFilter{
			model.EqFilter("status", "active"),
			{Field: "domain", FilterType: "like", Value: domain},
		},
	}
	rows := rowsFrom(rm.Filter(route.AppID, route.TblServices, filter))

	cats := make([]any, 0, len(rows))
	seen := map[string]struct{}{}
	dynamicCodeNames := make([]string, 0)
	mainServiceCode := ""
	defaultServiceCode := ""

	for _, obj := range rows {
		slug := recordStr(obj, "slug")
		serviceCode := recordStr(obj, "service_code")
		isService := recordBool(obj, "is_service")
		isGroupSlug := recordBool(obj, "is_group_slug")
		isGroupSlugDefault := recordBool(obj, "is_group_slug_default")
		groupSlug := recordStr(obj, "group_slug")

		if isGroupSlug && mainServiceCode == "" {
			mainServiceCode = serviceCode
		}
		if isGroupSlugDefault && !isGroupSlug {
			defaultServiceCode = serviceCode
		}

		keyPart := slug
		if serviceCode != "" {
			keyPart = serviceCode
		}
		isSvc := "0"
		if isService {
			isSvc = "1"
		}
		dedupKey := keyPart + "|" + groupSlug + "|" + isSvc
		if _, ok := seen[dedupKey]; ok {
			continue
		}
		seen[dedupKey] = struct{}{}

		dynamicCodeName := recordStr(obj, "dynamic_code_name")
		if dynamicCodeName != "" && !slices.Contains(dynamicCodeNames, dynamicCodeName) {
			dynamicCodeNames = append(dynamicCodeNames, dynamicCodeName)
		}

		category := recordStr(obj, "category")
		if lang != "vi" {
			if v := recordStr(obj, "category_"+lang); v != "" {
				category = v
			}
		}
		attributesDescription := recordStr(obj, "attributes_description")
		if lang != "vi" {
			if v := recordStr(obj, "attributes_description_"+lang); v != "" {
				attributesDescription = v
			}
		}

		cats = append(cats, map[string]any{
			"slug":                   slug,
			"service_code":           serviceCode,
			"category":               category,
			"category_en":            recordStr(obj, "category_en"),
			"category_zh":            recordStr(obj, "category_zh"),
			"tags":                   recordStr(obj, "tags"),
			"is_service":             isService,
			"is_group_slug":          isGroupSlug,
			"is_group_slug_default":  isGroupSlugDefault,
			"group_slug":             groupSlug,
			"color":                  recordStr(obj, "attributes_color"),
			"icon":                   recordStr(obj, "attributes_icon"),
			"attributes_priority":    obj["attributes_priority"],
			"description":            attributesDescription,
			"description_en":         recordStr(obj, "attributes_description_en"),
			"description_zh":         recordStr(obj, "attributes_description_zh"),
			"dynamicCodeName":        dynamicCodeName,
			"attributes_icon":        recordStr(obj, "attributes_icon"),
			"attributes_color":       recordStr(obj, "attributes_color"),
			"attributes_description": attributesDescription,
		})
	}

	// Compatibility adapter:
	// Keep database records unchanged, but normalize SSR category hierarchy to support
	// the target 4-menu layout on frontend-web (including older frontend builds).
	adaptCategoriesForTargetMenu(cats)
	dynamicTemplates := loadDynamicCodeTemplates(rm, dynamicCodeNames)

	ssrCategoryCache.Store(cacheKey, &ssrCategoryCacheEntry{
		categories:         cloneAnySlice(cats),
		dynamicTemplates:   cloneAnyMap(dynamicTemplates),
		mainServiceCode:    mainServiceCode,
		defaultServiceCode: defaultServiceCode,
		expires:            time.Now().Add(ssrCategoryCacheTTL),
	})

	return cats, dynamicTemplates, mainServiceCode, defaultServiceCode
}

func adaptCategoriesForTargetMenu(cats []any) {
	if len(cats) == 0 {
		return
	}

	hasSlug := map[string]bool{}
	for _, item := range cats {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		slug := strings.TrimSpace(recordStr(m, "slug"))
		if slug != "" {
			hasSlug[slug] = true
		}
	}

	bridgeParent := "hop-tac-kinh-doanh"
	legacyBridgeParent := "cau-noi-kinh-doanh-online"

	legacyBridgeChildren := map[string]struct{}{
		"phan-mem":        {},
		"bat-dong-san":    {},
		"lam-dep-my-pham": {},
		"cho-thue-xe":     {},
		"booking-online":  {},
	}

	if hasSlug[legacyBridgeParent] {
		for _, item := range cats {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			slug := strings.TrimSpace(recordStr(m, "slug"))
			if slug == legacyBridgeParent {
				m["slug"] = bridgeParent
				if strings.TrimSpace(recordStr(m, "service_code")) != "" {
					m["service_code"] = bridgeParent
				}
			}
			if strings.TrimSpace(recordStr(m, "group_slug")) == legacyBridgeParent {
				m["group_slug"] = bridgeParent
			}
		}
	}

	if hasSlug[bridgeParent] || hasSlug[legacyBridgeParent] {
		for _, item := range cats {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			slug := strings.TrimSpace(recordStr(m, "slug"))
			if _, ok := legacyBridgeChildren[slug]; ok {
				m["group_slug"] = bridgeParent
				continue
			}
			if strings.TrimSpace(recordStr(m, "group_slug")) == legacyBridgeParent {
				m["group_slug"] = bridgeParent
			}
		}
	}

}

func loadDynamicCodeTemplates(rm *data.RecordManager, codeNames []string) map[string]any {
	templates := make(map[string]any)
	for _, name := range codeNames {
		if name == "" {
			continue
		}
		filter := model.SearchFilter{
			Operator: "AND",
			Conditions: []model.SearchFilter{
				model.EqFilter("p_name", name),
				model.EqFilter("p_type", 0),
			},
		}
		rows := rowsFrom(rm.Filter("csm", "sys_autos", filter))
		if len(rows) == 0 {
			continue
		}
		pCode := strings.TrimSpace(recordStr(rows[0], "p_code"))
		if pCode == "" {
			continue
		}
		decrypted, err := rm.CsmDecrypt(pCode)
		if err != nil || decrypted == "" {
			continue
		}
		templates[name] = decrypted
	}
	return templates
}

func resolveLang(params map[string]string) string {
	lang := strings.ToLower(strings.TrimSpace(params["hl"]))
	if lang == "" {
		return "vi"
	}
	if i := strings.Index(lang, "-"); i >= 0 {
		lang = lang[:i]
	}
	switch lang {
	case "vi", "en", "zh":
		return lang
	default:
		return "vi"
	}
}

func absoluteAssetURL(path, protocol, host string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}
	return protocol + "://" + host + "/" + strings.TrimPrefix(path, "/")
}

func resolveDescriptionFromFields(rm *data.RecordManager, row map[string]any, lang string) string {
	description := ""
	if lang != "vi" {
		description = recordStr(row, "meta_description_"+lang)
	}
	if description == "" {
		description = recordStr(row, "meta_description")
	}
	if lang != "vi" {
		if description == "" {
			description = recordStr(row, "description_"+lang)
		}
	}
	if description == "" {
		description = recordStr(row, "description")
	}
	if description == "" && lang != "vi" {
		description = recordStr(row, "excerpt_"+lang)
	}
	if description == "" {
		description = recordStr(row, "excerpt")
	}
	if description == "" {
		content := ""
		if lang != "vi" {
			content = recordStr(row, "content_"+lang)
		}
		if content == "" {
			content = recordStr(row, "content")
		}
		if content != "" {
			description = stripHTMLToText(decryptWebContent(rm, content), 160)
		}
	}
	return description
}

func resolveServiceDescription(rm *data.RecordManager, row map[string]any, lang string) string {
	description := ""
	if lang != "vi" {
		description = recordStr(row, "meta_description_"+lang)
	}
	if description == "" {
		description = recordStr(row, "meta_description")
	}
	if lang != "vi" {
		if description == "" {
			description = recordStr(row, "attributes_description_"+lang)
		}
	}
	if description == "" {
		description = recordStr(row, "attributes_description")
	}
	if description == "" && lang != "vi" {
		description = recordStr(row, "summary_"+lang)
	}
	if description == "" {
		description = recordStr(row, "summary")
	}
	if description == "" {
		if attrs := recordStr(row, "attributes"); attrs != "" {
			description = stripHTMLToText(attrs, 160)
		}
	}
	if description == "" {
		content := ""
		if lang != "vi" {
			content = recordStr(row, "content_"+lang)
		}
		if content == "" {
			content = recordStr(row, "content")
		}
		if content != "" {
			description = stripHTMLToText(decryptWebContent(rm, content), 160)
		}
	}
	return description
}

func resolveSEOForServiceRoute(
	rm *data.RecordManager,
	route resolvedRoute,
	domain, normalizedPath, mainServiceCode, defaultServiceCode, lang string,
) *seoMeta {
	if route.AppID == "" || route.TblServices == "" || route.TblServiceDetail == "" {
		return nil
	}

	workingPath := strings.TrimSpace(normalizedPath)
	if strings.HasPrefix(workingPath, "/") {
		segs := make([]string, 0)
		for _, s := range strings.Split(workingPath[1:], "/") {
			if s != "" {
				segs = append(segs, s)
			}
		}
		if len(segs) > 0 {
			first := strings.ToLower(segs[0])
			if first == "en" || first == "zh" {
				if len(segs) > 1 {
					workingPath = "/" + strings.Join(segs[1:], "/")
				} else {
					workingPath = "/"
				}
			}
		}
	}

	pathNoExt := strings.ReplaceAll(workingPath, ".shtml", "")
	parts := make([]string, 0)
	for _, s := range strings.Split(pathNoExt, "/") {
		if s != "" {
			parts = append(parts, s)
		}
	}
	slug := ""
	if len(parts) > 0 {
		slug = strings.TrimSpace(parts[len(parts)-1])
	}
	// Java: if slug equals main_service_code, switch to default_service_code
	if slug == mainServiceCode && defaultServiceCode != "" {
		slug = defaultServiceCode
	}
	if slug == "" || slug == "com.chrome.devtools.json" {
		slug = "home"
	}
	domainLike := model.SearchFilter{Field: "domain", FilterType: "like", Value: domain}

	normalizeDescription := func(desc string) string {
		return strings.TrimSpace(stripHTMLToText(desc, 220))
	}

	// ── Priority 1: detail table (Java resolves detail BEFORE service) ──
	detailFilter := model.SearchFilter{
		Operator: "AND",
		Conditions: []model.SearchFilter{
			model.EqFilter("slug", slug),
			model.EqFilter("status", "active"),
			domainLike,
		},
	}
	if detail := rm.Find(route.AppID, route.TblServiceDetail, detailFilter); len(detail) > 0 {
		title := recordLangStr(detail, "title", lang)
		return &seoMeta{
			Title:       title,
			Keywords:    strings.TrimSpace(recordLangStr(detail, "keywords", lang)),
			Description: normalizeDescription(resolveDescriptionFromFields(rm, detail, lang)),
			Image:       recordStr(detail, "image"),
			Lang:        lang,
			Slug:        slug,
		}
	}

	// ── Priority 2: service table with is_service=true ──
	buildServiceMeta := func(row map[string]any) *seoMeta {
		// Java uses attributes_title first, then category (no meta_title/seo_title)
		title := recordLangStr(row, "attributes_title", lang)
		if title == "" {
			title = recordLangStr(row, "category", lang)
		}
		if title == "" {
			title = recordLangStr(row, "title", lang)
		}
		// Java uses attributes_keywords first
		keywords := strings.TrimSpace(recordLangStr(row, "attributes_keywords", lang))
		if keywords == "" {
			keywords = strings.TrimSpace(recordLangStr(row, "keywords", lang))
		}
		description := normalizeDescription(resolveServiceDescription(rm, row, lang))
		if description == "" {
			description = normalizeDescription(resolveDescriptionFromFields(rm, row, lang))
		}
		return &seoMeta{
			Title:       title,
			Keywords:    keywords,
			Description: description,
			Image:       recordStr(row, "image"),
			Lang:        lang,
			Slug:        slug,
			FromService: true,
		}
	}

	queryServiceBySlug := func(isService bool, withDomain bool) map[string]any {
		conds := []model.SearchFilter{
			model.EqFilter("status", "active"),
			model.EqFilter("slug", slug),
		}
		if isService {
			conds = append(conds, model.EqFilter("is_service", true))
		} else {
			conds = append(conds, model.EqFilter("is_service", false))
		}
		if withDomain && domain != "" {
			conds = append(conds, domainLike)
		}
		return rm.Find(route.AppID, route.TblServices, model.SearchFilter{Operator: "AND", Conditions: conds})
	}

	// Try is_service=true first (with domain, then without)
	if row := queryServiceBySlug(true, true); len(row) > 0 {
		return buildServiceMeta(row)
	}
	if row := queryServiceBySlug(true, false); len(row) > 0 {
		return buildServiceMeta(row)
	}

	// ── Priority 3: service table with is_service=false (non-service menu items) ──
	if row := queryServiceBySlug(false, true); len(row) > 0 {
		return buildServiceMeta(row)
	}
	if row := queryServiceBySlug(false, false); len(row) > 0 {
		return buildServiceMeta(row)
	}

	return nil
}

func resolveLegacyServiceCode(serviceCode, mainServiceCode, defaultServiceCode string) string {
	if mainServiceCode != "" && serviceCode == mainServiceCode && defaultServiceCode != "" {
		return defaultServiceCode
	}
	return serviceCode
}

func findActiveServiceDetail(rm *data.RecordManager, route resolvedRoute, domain, serviceCode, slug string) map[string]any {
	slug = strings.TrimSpace(slug)
	if slug == "" || route.AppID == "" || route.TblServiceDetail == "" {
		return nil
	}
	domainLike := model.SearchFilter{Field: "domain", FilterType: "like", Value: domain}

	// Java resolveServiceListingForRoute: filter(service_type + slug + status + domain like).rows[0]
	buildFilter := func(withDomain bool) model.SearchFilter {
		conds := make([]model.SearchFilter, 0, 4)
		if serviceCode != "" {
			conds = append(conds, model.EqFilter("service_type", serviceCode))
		}
		conds = append(conds, model.EqFilter("slug", slug), model.EqFilter("status", "active"))
		if withDomain && domain != "" {
			conds = append(conds, domainLike)
		}
		return model.SearchFilter{Operator: "AND", Conditions: conds}
	}

	if row := filterFirstRow(rm, route.AppID, route.TblServiceDetail, buildFilter(true)); len(row) > 0 {
		return row
	}
	if row := filterFirstRow(rm, route.AppID, route.TblServiceDetail, buildFilter(false)); len(row) > 0 {
		return row
	}
	// Numeric id in URL segment
	if _, err := strconv.Atoi(slug); err == nil {
		idConds := []model.SearchFilter{model.EqFilter("id", slug), model.EqFilter("status", "active")}
		if serviceCode != "" {
			idConds = append(idConds, model.EqFilter("service_type", serviceCode))
		}
		return filterFirstRow(rm, route.AppID, route.TblServiceDetail, model.SearchFilter{Operator: "AND", Conditions: idConds})
	}
	// Prefix fallback can be very expensive on long SEO slugs; keep it for short fallback candidates.
	if serviceCode != "" && shouldUseDetailSlugPrefixFallback(slug) {
		return findActiveServiceDetailBySlugPrefix(rm, route, domain, serviceCode, slug)
	}
	return nil
}

func shouldUseDetailSlugPrefixFallback(slug string) bool {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return false
	}
	return len(slug) <= ssrDetailPrefixFallbackMaxSlugLen
}

func findActiveServiceDetailBySlugPrefix(rm *data.RecordManager, route resolvedRoute, domain, serviceCode, detailSlug string) map[string]any {
	conds := []model.SearchFilter{
		model.EqFilter("service_type", serviceCode),
		model.EqFilter("status", "active"),
	}
	if domain != "" {
		conds = append(conds, model.SearchFilter{Field: "domain", FilterType: "like", Value: domain})
	}
	rows := rowsFrom(rm.Filter(route.AppID, route.TblServiceDetail, model.SearchFilter{Operator: "AND", Conditions: conds}))
	wantedPrefix := detailSlug + "-"
	for _, r := range rows {
		slugVal := strings.TrimSpace(recordStr(r, "slug"))
		if slugVal == "" {
			continue
		}
		if strings.EqualFold(slugVal, detailSlug) || strings.HasPrefix(strings.ToLower(slugVal), strings.ToLower(wantedPrefix)) {
			return r
		}
	}
	return nil
}

func resolveServiceListing(
	rm *data.RecordManager,
	route resolvedRoute,
	domain, path string,
	params map[string]string,
	mainServiceCode, defaultServiceCode string,
) map[string]any {
	out := make(map[string]any)

	page := 1
	if v, err := strconv.Atoi(params["page"]); err == nil && v >= 1 {
		page = v
	}
	pageSize := 12
	pageSizeStr := params["pageSize"]
	if pageSizeStr == "" {
		pageSizeStr = params["take"]
	}
	if n, err := strconv.Atoi(pageSizeStr); err == nil {
		if n < 1 {
			n = 1
		}
		if n > 100 {
			n = 100
		}
		pageSize = n
	}
	lang := params["hl"]
	lastKey := params["lastkey"]

	pathNoExt := strings.ReplaceAll(path, ".shtml", "")
	trimmed := strings.TrimPrefix(pathNoExt, "/")
	segs := make([]string, 0)
	for _, s := range strings.Split(trimmed, "/") {
		s = strings.TrimSpace(s)
		if s != "" {
			segs = append(segs, strings.ToLower(s))
		}
	}
	if len(segs) > 0 {
		firstSeg := segs[0]
		if firstSeg == "vi" || firstSeg == "en" || firstSeg == "zh" {
			if strings.TrimSpace(lang) == "" {
				lang = firstSeg
			}
			segs = segs[1:]
		}
	}
	if strings.TrimSpace(lang) == "" {
		lang = "vi"
	}
	lang = normalizeLangCode(lang)
	isHome := len(segs) == 0
	hasSingleSegmentCategory := false
	if len(segs) == 1 && route.TblServices != "" {
		candidate := resolveLegacyServiceCode(segs[0], mainServiceCode, defaultServiceCode)
		catFilter := model.SearchFilter{
			Operator: "AND",
			Conditions: []model.SearchFilter{
				model.EqFilter("slug", candidate),
				model.EqFilter("status", "active"),
				{Field: "domain", FilterType: "like", Value: domain},
			},
		}
		if cat := rm.Find(route.AppID, route.TblServices, catFilter); len(cat) > 0 {
			hasSingleSegmentCategory = true
		}
	}

	if isHome {
		filter := model.SearchFilter{
			Operator: "AND",
			Conditions: []model.SearchFilter{
				model.EqFilter("status", "active"),
				{Field: "domain", FilterType: "like", Value: domain},
				{
					Operator: "OR",
					Conditions: []model.SearchFilter{
						{Field: "active_home", FilterType: "in", Value: []any{1, "1", true}},
						{Field: "featured", FilterType: "in", Value: []any{1, "1", true}},
					},
				},
			},
		}
		rows := rowsFrom(rm.Filter(route.AppID, route.TblServiceDetail, filter))
		details := make([]any, 0, len(rows))
		for _, r := range rows {
			details = append(details, mapDetailLite(rm, r, lang))
		}
		out["homeDetailList"] = details
		return out
	}

	if len(segs) >= 2 {
		serviceCode := resolveLegacyServiceCode(segs[0], mainServiceCode, defaultServiceCode)
		detailSlug := segs[len(segs)-1]
		row := findActiveServiceDetail(rm, route, domain, serviceCode, detailSlug)
		if len(row) > 0 {
			curID := recordStr(row, "id")
			out["serviceDetail"] = mapDetailFullObj(rm, row, lang)
			out["serviceCode"] = serviceCode
			relatedTake := pageSize
			if relatedTake > 6 {
				relatedTake = 6
			}
			insertRelated(rm, route, domain, serviceCode, curID, lang, relatedTake, out)
			return out
		}
		if row = findActiveServiceDetail(rm, route, domain, "", detailSlug); len(row) > 0 {
			serviceType := recordStr(row, "service_type")
			curID := recordStr(row, "id")
			out["serviceDetail"] = mapDetailFullObj(rm, row, lang)
			out["serviceCode"] = serviceType
			if serviceType != "" {
				relatedTake := pageSize
				if relatedTake > 6 {
					relatedTake = 6
				}
				insertRelated(rm, route, domain, serviceType, curID, lang, relatedTake, out)
			}
			return out
		}
	}

	if len(segs) == 1 && !hasSingleSegmentCategory {
		slugOnly := segs[0]
		row := findActiveServiceDetail(rm, route, domain, "", slugOnly)
		if len(row) > 0 {
			serviceType := recordStr(row, "service_type")
			curID := recordStr(row, "id")
			out["serviceDetail"] = mapDetailFullObj(rm, row, lang)
			out["serviceCode"] = serviceType
			if serviceType != "" {
				relatedTake := pageSize
				if relatedTake > 6 {
					relatedTake = 6
				}
				insertRelated(rm, route, domain, serviceType, curID, lang, relatedTake, out)
			}
			return out
		}
	}

	slug := ""
	if len(segs) > 0 {
		slug = resolveLegacyServiceCode(segs[len(segs)-1], mainServiceCode, defaultServiceCode)
	}
	if slug == "" || route.TblServices == "" {
		return out
	}

	if serviceCodes, category, ok := resolveGroupCategory(rm, route, domain, slug, mainServiceCode, defaultServiceCode, lang); ok {
		detConds := []model.SearchFilter{
			{Field: "service_type", FilterType: "in", Value: serviceCodes},
			model.EqFilter("status", "active"),
			{Field: "domain", FilterType: "like", Value: domain},
		}

		if q := strings.TrimSpace(params["q"]); q != "" {
			detConds = append(detConds, model.SearchFilter{
				Operator: "OR",
				Conditions: []model.SearchFilter{
					{Field: "title", FilterType: "like", Value: q},
					{Field: "excerpt", FilterType: "like", Value: q},
					{Field: "keywords", FilterType: "like", Value: q},
				},
			})
		}

		for _, pair := range [][2]string{
			{"propertyType", "attributes_propertyType"},
			{"transactionType", "attributes_transactionType"},
			{"category", "attributes_category"},
			{"platform", "attributes_platform"},
			{"brand", "attributes_brand"},
			{"location", "attributes_location"},
			{"legalStatus", "attributes_legalStatus"},
			{"furnished", "attributes_furnished"},
		} {
			if v := strings.TrimSpace(params[pair[0]]); v != "" && v != "all" {
				detConds = append(detConds, model.SearchFilter{Field: pair[1], FilterType: "like", Value: v})
			}
		}

		for _, triple := range [][3]string{
			{"price_min", "attributes_price", "gte"},
			{"price_max", "attributes_price", "lte"},
			{"area_min", "attributes_area", "gte"},
			{"area_max", "attributes_area", "lte"},
		} {
			if v, err := strconv.ParseFloat(params[triple[0]], 64); err == nil {
				detConds = append(detConds, model.SearchFilter{Field: triple[1], FilterType: triple[2], Value: v})
			}
		}

		if shouldUseSSRListingFastPath(params, page, lastKey) {
			detFilter := model.SearchFilter{Operator: "AND", Conditions: detConds}
			if pageContent, _ := category["content"].(string); pageContent != "" {
				out["pageContent"] = pageContent
			}
			out["serviceCategory"] = category
			fillListingFromPagination(out, rm, route, detFilter, pageSize, lang)
			return out
		}

		allRows := rowsFrom(rm.Filter(route.AppID, route.TblServiceDetail, model.SearchFilter{Operator: "AND", Conditions: detConds}))
		slices.SortFunc(allRows, func(a, b map[string]any) int {
			return compareRelatedPostRowsDesc(a, b)
		})

		totalCount := len(allRows)
		startIndex := 0
		if lastKey != "" {
			found := false
			for i, r := range allRows {
				if recordStr(r, "id") == lastKey {
					startIndex = i + 1
					found = true
					break
				}
			}
			if !found {
				startIndex = 0
			}
		} else {
			startIndex = (page - 1) * pageSize
		}
		endIndex := startIndex + pageSize
		if endIndex > totalCount {
			endIndex = totalCount
		}

		pageRows := make([]any, 0, endIndex-startIndex)
		for _, r := range allRows[startIndex:endIndex] {
			pageRows = append(pageRows, mapDetailLite(rm, r, lang))
		}

		var nextCursor string
		if endIndex < totalCount && endIndex > 0 {
			nextCursor = recordStr(allRows[endIndex-1], "id")
		}

		pageComputed := 1
		if pageSize > 0 {
			pageComputed = startIndex/pageSize + 1
		}

		if pageContent, _ := category["content"].(string); pageContent != "" {
			out["pageContent"] = pageContent
		}
		out["serviceCategory"] = category
		out["serviceDetailList"] = pageRows
		out["totalCount"] = totalCount
		out["page"] = pageComputed
		out["pageSize"] = pageSize
		out["take"] = pageSize
		out["paginationMode"] = "cursor"
		if nextCursor != "" {
			out["nextCursor"] = nextCursor
			out["lastkey"] = nextCursor
		}
		return out
	}

	svcFilter := model.SearchFilter{
		Operator: "AND",
		Conditions: []model.SearchFilter{
			model.EqFilter("service_code", slug),
			model.EqFilter("status", "active"),
			{Field: "domain", FilterType: "like", Value: domain},
		},
	}
	service := rm.Find(route.AppID, route.TblServices, svcFilter)
	if len(service) == 0 {
		svcBySlugFilter := model.SearchFilter{
			Operator: "AND",
			Conditions: []model.SearchFilter{
				model.EqFilter("slug", slug),
				model.EqFilter("status", "active"),
				{Field: "domain", FilterType: "like", Value: domain},
			},
		}
		service = rm.Find(route.AppID, route.TblServices, svcBySlugFilter)
	}

	serviceCode := slug
	if len(service) > 0 {
		found := recordStr(service, "service_code")
		if found == "" {
			found = recordStr(service, "id")
			if found == "" {
				found = slug
			}
		}
		serviceCode = found
	}

	if len(service) > 0 {
		cat := mapServiceCategory(rm, service, lang)
		if pageContent, _ := cat["content"].(string); pageContent != "" {
			out["pageContent"] = pageContent
		}
		out["serviceCategory"] = cat
	}

	detConds := []model.SearchFilter{
		model.EqFilter("service_type", serviceCode),
		model.EqFilter("status", "active"),
		{Field: "domain", FilterType: "like", Value: domain},
	}

	if q := strings.TrimSpace(params["q"]); q != "" {
		detConds = append(detConds, model.SearchFilter{
			Operator: "OR",
			Conditions: []model.SearchFilter{
				{Field: "title", FilterType: "like", Value: q},
				{Field: "excerpt", FilterType: "like", Value: q},
				{Field: "keywords", FilterType: "like", Value: q},
			},
		})
	}

	for _, pair := range [][2]string{
		{"propertyType", "attributes_propertyType"},
		{"transactionType", "attributes_transactionType"},
		{"category", "attributes_category"},
		{"platform", "attributes_platform"},
		{"brand", "attributes_brand"},
		{"location", "attributes_location"},
		{"legalStatus", "attributes_legalStatus"},
		{"furnished", "attributes_furnished"},
	} {
		if v := strings.TrimSpace(params[pair[0]]); v != "" && v != "all" {
			detConds = append(detConds, model.SearchFilter{Field: pair[1], FilterType: "like", Value: v})
		}
	}

	for _, triple := range [][3]string{
		{"price_min", "attributes_price", "gte"},
		{"price_max", "attributes_price", "lte"},
		{"area_min", "attributes_area", "gte"},
		{"area_max", "attributes_area", "lte"},
	} {
		if v, err := strconv.ParseFloat(params[triple[0]], 64); err == nil {
			detConds = append(detConds, model.SearchFilter{Field: triple[1], FilterType: triple[2], Value: v})
		}
	}

	if shouldUseSSRListingFastPath(params, page, lastKey) {
		detFilter := model.SearchFilter{Operator: "AND", Conditions: detConds}
		fillListingFromPagination(out, rm, route, detFilter, pageSize, lang)
		return out
	}

	detFilter := model.SearchFilter{Operator: "AND", Conditions: detConds}
	allRows := rowsFrom(rm.Filter(route.AppID, route.TblServiceDetail, detFilter))

	slices.SortFunc(allRows, func(a, b map[string]any) int {
		return compareRelatedPostRowsDesc(a, b)
	})

	totalCount := len(allRows)
	startIndex := 0
	if lastKey != "" {
		found := false
		for i, r := range allRows {
			if recordStr(r, "id") == lastKey {
				startIndex = i + 1
				found = true
				break
			}
		}
		if !found {
			startIndex = 0
		}
	} else {
		startIndex = (page - 1) * pageSize
	}
	endIndex := startIndex + pageSize
	if endIndex > totalCount {
		endIndex = totalCount
	}

	pageRows := make([]any, 0, endIndex-startIndex)
	for _, r := range allRows[startIndex:endIndex] {
		pageRows = append(pageRows, mapDetailLite(rm, r, lang))
	}

	var nextCursor string
	if endIndex < totalCount && endIndex > 0 {
		nextCursor = recordStr(allRows[endIndex-1], "id")
	}

	pageComputed := 1
	if pageSize > 0 {
		pageComputed = startIndex/pageSize + 1
	}

	out["serviceDetailList"] = pageRows
	out["totalCount"] = totalCount
	out["page"] = pageComputed
	out["pageSize"] = pageSize
	out["take"] = pageSize
	out["paginationMode"] = "cursor"
	if nextCursor != "" {
		out["nextCursor"] = nextCursor
		out["lastkey"] = nextCursor
	}

	return out
}

func shouldUseSSRListingFastPath(params map[string]string, page int, lastKey string) bool {
	if page != 1 {
		return false
	}
	if strings.TrimSpace(lastKey) != "" {
		return false
	}
	for _, key := range []string{
		"q",
		"propertyType",
		"transactionType",
		"category",
		"platform",
		"brand",
		"location",
		"legalStatus",
		"furnished",
		"price_min",
		"price_max",
		"area_min",
		"area_max",
	} {
		v := strings.TrimSpace(params[key])
		if v != "" && v != "all" {
			return false
		}
	}
	return true
}

func fillListingFromPagination(
	out map[string]any,
	rm *data.RecordManager,
	route resolvedRoute,
	filter model.SearchFilter,
	pageSize int,
	lang string,
) {
	res := rm.FilterFirstPageFast(route.AppID, route.TblServiceDetail, filter, pageSize)
	rows := rowsFrom(res)
	pageRows := make([]any, 0, len(rows))
	for _, r := range rows {
		pageRows = append(pageRows, mapDetailLite(rm, r, lang))
	}
	totalCount := len(pageRows)
	if raw := strings.TrimSpace(recordStr(res, "totalCount")); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v >= 0 {
			totalCount = v
		}
	}
	out["serviceDetailList"] = pageRows
	out["totalCount"] = totalCount
	out["page"] = 1
	out["pageSize"] = pageSize
	out["take"] = pageSize
	out["paginationMode"] = "cursor"
	next := strings.TrimSpace(recordStr(res, "nextCursor"))
	if next != "" {
		out["nextCursor"] = next
		out["lastkey"] = next
	}
}

func resolveGroupCategory(
	rm *data.RecordManager,
	route resolvedRoute,
	domain, slug, mainServiceCode, defaultServiceCode, lang string,
) ([]any, map[string]any, bool) {
	if route.AppID == "" || route.TblServices == "" || slug == "" {
		return nil, nil, false
	}
	if slug == mainServiceCode && defaultServiceCode != "" {
		slug = defaultServiceCode
	}
	groupFilter := model.SearchFilter{
		Operator: "AND",
		Conditions: []model.SearchFilter{
			model.EqFilter("slug", slug),
			model.EqFilter("is_group_slug", true),
			model.EqFilter("is_service", true),
			model.EqFilter("status", "active"),
			{Field: "domain", FilterType: "like", Value: domain},
		},
	}
	groupService := rm.Find(route.AppID, route.TblServices, groupFilter)
	if len(groupService) == 0 {
		return nil, nil, false
	}
	groupSlug := recordStr(groupService, "group_slug")
	if groupSlug == "" {
		return nil, nil, false
	}
	svcRows := rowsFrom(rm.Filter(route.AppID, route.TblServices, model.SearchFilter{
		Operator: "AND",
		Conditions: []model.SearchFilter{
			model.EqFilter("group_slug", groupSlug),
			model.EqFilter("is_group_slug_default", true),
			model.EqFilter("status", "active"),
			{Field: "domain", FilterType: "like", Value: domain},
		},
	}))
	serviceCodes := make([]any, 0, len(svcRows))
	seen := make(map[string]struct{}, len(svcRows))
	for _, row := range svcRows {
		code := recordStr(row, "service_code")
		if code == "" {
			continue
		}
		if _, ok := seen[code]; ok {
			continue
		}
		seen[code] = struct{}{}
		serviceCodes = append(serviceCodes, code)
	}
	if len(serviceCodes) == 0 {
		return nil, nil, false
	}
	return serviceCodes, mapServiceCategory(rm, groupService, lang), true
}

func insertRelated(
	rm *data.RecordManager,
	route resolvedRoute,
	domain, serviceType, curID, lang string,
	take int,
	out map[string]any,
) {
	if take <= 0 {
		take = 1
	}
	filter := model.SearchFilter{
		Operator: "AND",
		Conditions: []model.SearchFilter{
			model.EqFilter("service_type", serviceType),
			model.EqFilter("status", "active"),
			{Field: "domain", FilterType: "like", Value: domain},
		},
	}
	related := make([]any, 0, take)
	cursor := ""
	batchSize := take * 4
	if batchSize < 8 {
		batchSize = 8
	}
	for range 3 {
		page := rm.FilterWithPagination(route.AppID, route.TblServiceDetail, filter, cursor, 0, batchSize, nil)
		rows := rowsFrom(page)
		if len(rows) == 0 {
			break
		}
		for _, r := range rows {
			if recordStr(r, "id") == curID {
				continue
			}
			related = append(related, mapDetailLite(rm, r, lang))
			if len(related) >= take {
				break
			}
		}
		if len(related) >= take {
			break
		}
		next := strings.TrimSpace(recordStr(page, "nextCursor"))
		if next == "" || next == cursor {
			break
		}
		cursor = next
	}
	out["relatedDetailList"] = related
}

func normalizeLangCode(raw string) string {
	lang := strings.ToLower(strings.TrimSpace(raw))
	lang = strings.ReplaceAll(lang, "_", "-")
	switch lang {
	case "en", "zh", "vi":
		return lang
	case "en-us", "en-gb", "en-au", "en-ca", "en-sg":
		return "en"
	case "zh-cn", "zh-hans", "zh-sg":
		return "zh"
	case "zh-tw", "zh-hk", "zh-hant":
		return "zh"
	case "vi-vn":
		return "vi"
	default:
		return "vi"
	}
}

func localizedFieldValue(row map[string]any, base, lang string) string {
	lang = normalizeLangCode(lang)
	if lang != "vi" {
		if localized := recordStr(row, base+"_"+lang); localized != "" {
			return localized
		}
	}
	return recordStr(row, base)
}

func localizedWebContent(rm *data.RecordManager, row map[string]any, base, lang string) string {
	return decryptWebContent(rm, localizedFieldValue(row, base, lang))
}

func applySpecialPageHint(initialData map[string]any) {
	if initialData == nil {
		return
	}
	hasSpecial := false
	if detail, ok := initialData["serviceDetail"].(map[string]any); ok {
		hasSpecial = recordBool(detail, "is_special_page") || recordBool(detail, "special_page")
	}
	if !hasSpecial {
		if category, ok := initialData["serviceCategory"].(map[string]any); ok {
			hasSpecial = recordBool(category, "is_special_page") || recordBool(category, "special_page")
		}
	}
	if hasSpecial {
		initialData["isSpecialPage"] = true
	} else {
		delete(initialData, "isSpecialPage")
	}
}

func mapDetailLite(rm *data.RecordManager, row map[string]any, lang string) map[string]any {
	s := func(k string) string { return recordStr(row, k) }
	lang = normalizeLangCode(lang)

	m := map[string]any{
		"id":               s("id"),
		"domain":           s("domain"),
		"service_type":     s("service_type"),
		"title":            localizedWebContent(rm, row, "title", lang),
		"title_en":         s("title_en"),
		"title_zh":         s("title_zh"),
		"slug":             s("slug"),
		"excerpt":          localizedWebContent(rm, row, "excerpt", lang),
		"excerpt_en":       s("excerpt_en"),
		"excerpt_zh":       s("excerpt_zh"),
		"content_en":       s("content_en"),
		"content_zh":       s("content_zh"),
		"thumbnail":        s("thumbnail"),
		"cover":            s("cover"),
		"images":           s("images"),
		"videos":           s("videos"),
		"album":            s("album"),
		"video":            s("video"),
		"video_url":        s("video_url"),
		"tags":             s("tags"),
		"keywords":         localizedFieldValue(row, "keywords", lang),
		"meta_description": s("meta_description"),
		"featured":         recordBool(row, "featured"),
		"activeHome":       recordBool(row, "active_home"),
		"status":           s("status"),
		"author":           s("author"),
	}
	for k, v := range row {
		if strings.HasPrefix(k, "attributes_") || strings.HasPrefix(k, "specifications_") {
			m[k] = v
		}
	}
	if v, ok := row["publish_date"]; ok {
		m["publish_date"] = v
	}
	if v, ok := row["expiry_date"]; ok {
		m["expiry_date"] = v
	}
	return m
}

func mapDetailFullObj(rm *data.RecordManager, row map[string]any, lang string) map[string]any {
	m := mapDetailLite(rm, row, lang)
	s := func(k string) string { return recordStr(row, k) }
	lang = normalizeLangCode(lang)
	m["content"] = localizedWebContent(rm, row, "content", lang)
	m["seo_meta"] = s("seo_meta")
	m["dien_thoai"] = s("dien_thoai")
	delete(m, "attributes")
	delete(m, "specifications")
	return m
}

func mapServiceCategory(rm *data.RecordManager, row map[string]any, lang string) map[string]any {
	s := func(k string) string { return recordStr(row, k) }
	lang = normalizeLangCode(lang)
	m := map[string]any{
		"id":             s("id"),
		"domain":         s("domain"),
		"name":           s("name"),
		"service_code":   s("service_code"),
		"slug":           s("slug"),
		"status":         s("status"),
		"icon":           s("icon"),
		"sort_order":     s("sort_order"),
		"seo_meta":       s("seo_meta"),
		"parent_id":      s("parent_id"),
		"content":        localizedWebContent(rm, row, "content", lang),
		"content_en":     s("content_en"),
		"content_zh":     s("content_zh"),
		"description":    localizedWebContent(rm, row, "description", lang),
		"description_en": s("description_en"),
		"description_zh": s("description_zh"),
		"category":       localizedFieldValue(row, "category", lang),
		"category_en":    s("category_en"),
		"category_zh":    s("category_zh"),
		"title":          localizedFieldValue(row, "title", lang),
		"title_en":       s("title_en"),
		"title_zh":       s("title_zh"),
	}
	if v, ok := row["attributes"]; ok {
		m["attributes"] = v
	}
	if v, ok := row["config"]; ok {
		m["config"] = v
	}
	if v, ok := row["updated_at"]; ok {
		m["updated_at"] = v
	}
	return m
}

func applyServiceCategorySeoOverrides(cat map[string]any, lang string, pageTitle, pageDescription, pageKeywords, canonical, ogImage string) (string, string, string, string, string) {
	if cat == nil {
		return pageTitle, pageDescription, pageKeywords, canonical, ogImage
	}

	catTitle := firstNonEmpty(recordStr(cat, "category"), recordStr(cat, "title"), recordStr(cat, "name"), pageTitle)
	catDescription := firstNonEmpty(recordStr(cat, "description"), pageDescription)
	catKeywords := firstNonEmpty(recordStr(cat, "keywords"), pageKeywords)
	catCanonical := canonical
	catImage := ogImage

	if seoMeta := parseCategorySeoMeta(cat["seo_meta"]); len(seoMeta) > 0 {
		if meta := chooseCategorySeoLangMeta(seoMeta, lang); len(meta) > 0 {
			catTitle = firstNonEmpty(meta["meta_title"], meta["title"], catTitle)
			catDescription = firstNonEmpty(meta["meta_description"], meta["description"], catDescription)
			catKeywords = firstNonEmpty(meta["keywords"], catKeywords)
			catCanonical = firstNonEmpty(meta["canonical"], catCanonical)
			catImage = firstNonEmpty(meta["og_image"], meta["ogImage"], catImage)
		}
	}

	return catTitle, catDescription, catKeywords, catCanonical, catImage
}

func parseCategorySeoMeta(raw any) map[string]map[string]string {
	if raw == nil {
		return nil
	}
	var payload map[string]any
	switch v := raw.(type) {
	case string:
		if strings.TrimSpace(v) == "" || v == "{}" {
			return nil
		}
		if err := json.Unmarshal([]byte(v), &payload); err != nil {
			return nil
		}
	case map[string]any:
		payload = v
	case map[string]string:
		out := make(map[string]map[string]string, len(v))
		for lang, item := range v {
			out[lang] = map[string]string{"meta_title": item}
		}
		return out
	default:
		return nil
	}
	if len(payload) == 0 {
		return nil
	}
	out := make(map[string]map[string]string, len(payload))
	for lang, item := range payload {
		fields := map[string]string{}
		switch m := item.(type) {
		case map[string]any:
			for key, val := range m {
				fields[key] = strings.TrimSpace(fmt.Sprint(val))
			}
		case map[string]string:
			for key, val := range m {
				fields[key] = strings.TrimSpace(val)
			}
		default:
			fields["meta_title"] = strings.TrimSpace(fmt.Sprint(m))
		}
		out[lang] = fields
	}
	return out
}

func chooseCategorySeoLangMeta(meta map[string]map[string]string, lang string) map[string]string {
	if len(meta) == 0 {
		return nil
	}
	if item, ok := meta["vi"]; ok && len(item) > 0 {
		return item
	}
	return nil
}

func shouldApplyServiceCategorySeoOverrides(initialData map[string]any) bool {
	if len(initialData) == 0 {
		return false
	}
	cat, ok := initialData["serviceCategory"].(map[string]any)
	if !ok || len(cat) == 0 {
		return false
	}
	if _, hasDetail := initialData["serviceDetail"]; hasDetail {
		return false
	}
	return true
}

func buildJSONLD(ctx *preprocessCtx) string {
	pageType := strings.TrimSpace(ctx.PageType)
	if pageType == "" {
		pageType = "WebPage"
	}
	if strings.EqualFold(pageType, "article") {
		jsonLD := map[string]any{
			"@context":         "https://schema.org",
			"@type":            "Article",
			"headline":         ctx.Title,
			"url":              ctx.Canonical,
			"description":      ctx.Description,
			"inLanguage":       "vi",
			"mainEntityOfPage": ctx.Canonical,
			"image":            ctx.Image,
			"publisher": map[string]any{
				"@type": "Organization",
				"name":  ctx.SiteName,
				"url":   ctx.SiteName,
				"logo": map[string]any{
					"@type": "ImageObject",
					"url":   ctx.Logo,
				},
			},
		}
		if ctx.Author != "" {
			jsonLD["author"] = map[string]any{"@type": "Person", "name": ctx.Author}
		}
		if ctx.PublishedAt != "" {
			jsonLD["datePublished"] = ctx.PublishedAt
			jsonLD["dateModified"] = ctx.PublishedAt
		}
		raw, err := json.MarshalIndent(jsonLD, "", "  ")
		if err != nil {
			return "{}"
		}
		return string(raw)
	}

	jsonLD := map[string]any{
		"@context":    "https://schema.org",
		"@type":       "WebPage",
		"headline":    ctx.Title,
		"url":         ctx.Canonical,
		"description": ctx.Description,
		"inLanguage":  "vi",
		"image": map[string]any{
			"@type":  "ImageObject",
			"url":    ctx.Image,
			"height": "1000",
			"width":  "1920",
		},
		"publisher": map[string]any{
			"@type": "Organization",
			"name":  ctx.SiteName,
			"url":   ctx.SiteName,
			"logo": map[string]any{
				"@type":  "ImageObject",
				"url":    ctx.Logo,
				"width":  "506",
				"height": "132",
			},
		},
	}
	raw, err := json.MarshalIndent(jsonLD, "", "  ")
	if err != nil {
		return "{}"
	}
	return string(raw)
}

func buildSSRVisibleBodyHTML(ctx *preprocessCtx) string {
	if ctx == nil {
		return ""
	}

	title := strings.TrimSpace(ctx.Title)
	description := strings.TrimSpace(ctx.Description)
	bodyHTML := ""

	if detail, ok := ctx.InitialData["serviceDetail"].(map[string]any); ok && len(detail) > 0 {
		bodyHTML = firstNonEmpty(
			recordStr(detail, "content"),
			recordStr(detail, "pageContent"),
			recordStr(ctx.InitialData, "pageContent"),
		)
	}
	if bodyHTML == "" {
		if cat, ok := ctx.InitialData["serviceCategory"].(map[string]any); ok && len(cat) > 0 {
			bodyHTML = firstNonEmpty(
				recordStr(cat, "content"),
				recordStr(cat, "pageContent"),
				recordStr(ctx.InitialData, "pageContent"),
			)
		}
	}
	if bodyHTML == "" {
		bodyHTML = recordStr(ctx.InitialData, "pageContent")
	}
	bodyHTML = strings.TrimSpace(stripBetween(stripBetween(bodyHTML, "<script", "</script>"), "<style", "</style>"))
	bodyText := normalizeMetaText(stripHTMLToText(bodyHTML, 5000), 5000)
	if bodyText == "" {
		return ""
	}

	var b strings.Builder
	b.WriteString(`<main id="ssr-content" class="ssr-content" aria-label="Nội dung chính">`)
	if title != "" {
		b.WriteString(`<header class="ssr-content__header"><h1 class="ssr-content__title">`)
		b.WriteString(htmlEsc(title))
		b.WriteString(`</h1>`)
		if description != "" {
			b.WriteString(`<p class="ssr-content__description">`)
			b.WriteString(htmlEsc(description))
			b.WriteString(`</p>`)
		}
		b.WriteString(`</header>`)
	}
	if bodyText != "" {
		b.WriteString(`<article class="ssr-content__body">`)
		b.WriteString(`<p>`)
		b.WriteString(htmlEsc(bodyText))
		b.WriteString(`</p>`)
		b.WriteString(`</article>`)
	}
	b.WriteString(`</main>`)
	return b.String()
}

func hasVisibleSEOContent(initialData map[string]any) bool {
	if len(initialData) == 0 {
		return false
	}

	if detail, ok := initialData["serviceDetail"].(map[string]any); ok && len(detail) > 0 {
		return true
	}
	if category, ok := initialData["serviceCategory"].(map[string]any); ok && len(category) > 0 {
		return true
	}
	if list, ok := initialData["serviceDetailList"].([]any); ok && len(list) > 0 {
		return true
	}
	if list, ok := initialData["homeDetailList"].([]any); ok && len(list) > 0 {
		return true
	}
	if content := strings.TrimSpace(recordStr(initialData, "pageContent")); content != "" {
		return true
	}

	return false
}

func injectSSRVisibleBody(html *string, bodyHTML string) {
	bodyHTML = strings.TrimSpace(bodyHTML)
	if bodyHTML == "" || html == nil {
		return
	}

	if strings.Contains(*html, "<!-- SSR_CONTENT_ANCHOR -->") {
		*html = strings.Replace(*html, "<!-- SSR_CONTENT_ANCHOR -->", bodyHTML, 1)
		return
	}

	lower := strings.ToLower(*html)
	if rootPos := strings.Index(lower, `<div id="root"`); rootPos >= 0 {
		*html = (*html)[:rootPos] + bodyHTML + "\n" + (*html)[rootPos:]
		return
	}

	if pos := strings.Index(lower, "<body"); pos >= 0 {
		if endRel := strings.Index((*html)[pos:], ">"); endRel >= 0 {
			tagEnd := pos + endRel + 1
			*html = (*html)[:tagEnd] + "\n" + bodyHTML + "\n" + (*html)[tagEnd:]
			return
		}
	}
	if pos := strings.Index(lower, "</body>"); pos >= 0 {
		*html = (*html)[:pos] + bodyHTML + "\n" + (*html)[pos:]
		return
	}
	*html += bodyHTML
}

func replaceScriptBlock(html *string, marker, newContent string) {
	lower := strings.ToLower(*html)
	pos := strings.Index(lower, marker)
	if pos < 0 {
		return
	}
	scriptStart := strings.LastIndex(lower[:pos], "<script")
	if scriptStart < 0 {
		scriptStart = pos
	}
	relEnd := strings.Index((*html)[scriptStart:], "</script>")
	if relEnd < 0 {
		return
	}
	end := scriptStart + relEnd + len("</script>")
	*html = (*html)[:scriptStart] + newContent + (*html)[end:]
}

func PreprocessHTML(html *string, ctx *preprocessCtx) {
	preprocessHTML(html, ctx)
}

func preprocessHTML(html *string, ctx *preprocessCtx) {
	title := ctx.Title
	description := ctx.Description
	keywords := ctx.Keywords
	robotsPolicy := strings.TrimSpace(ctx.RobotsPolicy)
	if robotsPolicy == "" {
		robotsPolicy = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
	}
	canonical := ctx.Canonical
	image := ctx.Image
	siteName := ctx.SiteName
	logo := ctx.Logo

	twitterCard := "summary_large_image"
	if image == "" {
		twitterCard = "summary"
	}

	if start := strings.Index(*html, "<title"); start >= 0 {
		if endRel := strings.Index((*html)[start:], "</title>"); endRel >= 0 {
			end := start + endRel + len("</title>")
			*html = (*html)[:start] + "<title>" + htmlEsc(title) + "</title>" + (*html)[end:]
		}
	}

	replaceLinkHref(html, "canonical", canonical)
	replaceMetaContent(html, "description", description)
	replaceMetaContent(html, "keywords", keywords)
	replaceMetaContent(html, "google-site-verification", ctx.GSV)
	replaceMetaContent(html, "twitter:card", twitterCard)
	ensureMetaNameContent(html, "robots", robotsPolicy)
	ensureMetaNameContent(html, "googlebot", robotsPolicy)

	replaceOGContent(html, "og:url", canonical)
	replaceOGContent(html, "og:site_name", siteName)
	replaceOGContent(html, "og:title", title)
	replaceOGContent(html, "og:description", description)
	replaceOGContent(html, "og:image", image)
	replaceOGContent(html, "og:image:alt", title)
	replaceMetaContent(html, "twitter:title", title)
	replaceMetaContent(html, "twitter:description", description)
	replaceMetaContent(html, "twitter:image", image)

	if strings.EqualFold(ctx.PageType, "article") {
		replaceOGContent(html, "og:type", "article")
		if ctx.PublishedAt != "" {
			injectMetaProperty(html, "article:published_time", ctx.PublishedAt)
		}
		if ctx.ModifiedAt != "" {
			injectMetaProperty(html, "article:modified_time", ctx.ModifiedAt)
		}
		if ctx.Author != "" {
			injectMetaProperty(html, "article:author", ctx.Author)
		}
	} else {
		replaceOGContent(html, "og:type", "website")
	}

	replaceLinkHref(html, "icon", logo)
	replaceLinkHref(html, "apple-touch-icon", logo)

	lang := resolveLang(map[string]string{"hl": ctx.Lang})
	if lang == "" {
		lang = "vi"
	}
	replaceHTMLLang(html, lang)
	replaceOGContent(html, "og:locale", localeTag(lang))
	injectOGLocaleAlternates(html, lang)
	injectHreflangLinks(html, buildHreflangLinks(ctx.BaseURL, ctx.PagePath))

	if pos := strings.Index(*html, "<base "); pos >= 0 {
		if endRel := strings.Index((*html)[pos:], ">"); endRel >= 0 {
			end := pos + endRel + 1
			newBase := `<base href="` + htmlEsc(siteName) + `" />`
			*html = (*html)[:pos] + newBase + (*html)[end:]
		}
	}

	ldJSON := buildStructuredDataGraph(ctx)
	replaceScriptBlock(html, "application/ld+json",
		"<script type=\"application/ld+json\">\n"+ldJSON+"\n</script>")

	if ctx.GTag != "" {
		gtagSrc := "https://www.googletagmanager.com/gtag/js?id=" + htmlEsc(ctx.GTag)
		if pos := strings.Index(*html, "googletagmanager.com/gtag/js"); pos >= 0 {
			if scriptStart := strings.LastIndex((*html)[:pos], "<script"); scriptStart >= 0 {
				if relEnd := strings.Index((*html)[scriptStart:], "</script>"); relEnd >= 0 {
					end := scriptStart + relEnd + len("</script>")
					*html = (*html)[:scriptStart] + `<script async src="` + gtagSrc + `"></script>` + (*html)[end:]
				}
			}
		}
		gtagEsc := htmlEsc(ctx.GTag)
		*html = strings.ReplaceAll(*html, "/*[[${meta.gtag}]]*/ ''", "'"+gtagEsc+"'")
		*html = strings.ReplaceAll(*html, `/*[[${meta.gtag}]]*/ ""`, `"`+gtagEsc+`"`)
	}

	if pos := strings.Index(*html, "<body"); pos >= 0 {
		if endRel := strings.Index((*html)[pos:], ">"); endRel >= 0 {
			tagEnd := pos + endRel + 1
			newBody := `<body id="home" data-app-id="` + htmlEsc(ctx.AppID) + `">`
			*html = (*html)[:pos] + newBody + (*html)[tagEnd:]
		}
	}

	for _, attr := range []string{"th:name", "th:attr", "th:inline", "th:src", "th:content", "th:href", "th:text"} {
		stripThAttrs(html, attr)
	}
}

func ensureMetaNameContent(html *string, name, content string) {
	needle := `name="` + strings.ToLower(strings.TrimSpace(name)) + `"`
	if strings.Contains(strings.ToLower(*html), needle) {
		replaceMetaContent(html, name, content)
		return
	}
	injectMetaName(html, name, content)
}

func applySSRRobotsPolicy(html *string, robotsPolicy string) {
	robotsPolicy = strings.TrimSpace(robotsPolicy)
	if robotsPolicy == "" {
		return
	}
	ensureMetaNameContent(html, "robots", robotsPolicy)
	ensureMetaNameContent(html, "googlebot", robotsPolicy)
}

func buildScripts(appConfig, initialData map[string]any, categories any, ssrRoutes, dynamicTemplates, meta map[string]any, defaultServiceCode string) string {
	scripts := fmt.Sprintf(
		`<script>window.meta=%s;window.__INITIAL_DATA__=%s;window.menus=[];</script>`+
			`<script>window.__APP_CONFIG__=%s;</script>`+
			`<script>window.__INITIAL_REACT_DATA__=%s;</script>`+
			`<script>window.__SSR_WEBSITE_CATEGORIES__=%s;</script>`+
			`<script>window.__SSR_WEBSITE_ROUTES__=%s;</script>`+
			`<script>window.__SSR_DYNAMIC_CODE_TEMPLATES__=%s;</script>`,
		safeJSON(meta),
		safeJSON(initialData),
		safeJSON(appConfig),
		safeJSON(initialData),
		safeJSON(categories),
		safeJSON(ssrRoutes),
		safeJSON(dynamicTemplates),
	)
	if defaultServiceCode != "" {
		scripts += fmt.Sprintf(`<script>window.__SSR_DEFAULT_CATEGORY__=%q;</script>`, defaultServiceCode)
	}
	return scripts
}

func resolveSSRPageType(initialData map[string]any) string {
	if detail, ok := initialData["serviceDetail"].(map[string]any); ok && detail != nil {
		return "article"
	}
	return "website"
}

func resolveSSRAuthor(initialData map[string]any) string {
	detail, ok := initialData["serviceDetail"].(map[string]any)
	if !ok || detail == nil {
		return ""
	}
	return recordStr(detail, "author")
}

func resolveSSRPublishedAt(initialData map[string]any) string {
	detail, ok := initialData["serviceDetail"].(map[string]any)
	if !ok || detail == nil {
		return ""
	}
	for _, key := range []string{"publish_date", "created_at", "createdAt", "updated_at", "updatedAt"} {
		if iso := toISODate(detail[key]); iso != "" {
			return iso
		}
	}
	if iso := toISODate(resolveLastmodFromRow(detail)); iso != "" {
		return iso
	}
	if iso := resolveSSRDateFromRecordID(detail); iso != "" {
		return iso
	}
	return ""
}

func resolveSSRModifiedAt(initialData map[string]any) string {
	detail, ok := initialData["serviceDetail"].(map[string]any)
	if !ok || detail == nil {
		return ""
	}
	for _, key := range []string{"updated_at", "updatedAt", "modified_at", "publish_date", "created_at", "createdAt"} {
		if iso := toISODate(detail[key]); iso != "" {
			return iso
		}
	}
	if iso := toISODate(resolveLastmodFromRow(detail)); iso != "" {
		return iso
	}
	if iso := resolveSSRDateFromRecordID(detail); iso != "" {
		return iso
	}
	return ""
}

func resolveSSRDateFromRecordID(detail map[string]any) string {
	id := strings.TrimSpace(recordStr(detail, "id"))
	if id == "" {
		return ""
	}
	digits := strings.Builder{}
	for _, ch := range id {
		if ch >= '0' && ch <= '9' {
			digits.WriteRune(ch)
			if digits.Len() >= 13 {
				break
			}
		}
	}
	if digits.Len() < 10 {
		return ""
	}
	raw := digits.String()
	if len(raw) > 13 {
		raw = raw[:13]
	}
	if len(raw) == 12 || len(raw) == 11 {
		raw = raw[:10]
	}
	return toISODate(raw)
}

func injectIntoHTML(html *string, scripts string) {
	lower := strings.ToLower(*html)
	if pos := strings.Index(lower, "</head>"); pos >= 0 {
		*html = (*html)[:pos] + scripts + (*html)[pos:]
		return
	}
	if pos := strings.Index(lower, "</body>"); pos >= 0 {
		*html = (*html)[:pos] + scripts + (*html)[pos:]
		return
	}
	*html += scripts
}

func buildSSRResourceHints(ogImage, gtag string) string {
	hosts := map[string]struct{}{}

	if host := extractHostFromAbsoluteURL(ogImage); host != "" {
		hosts[host] = struct{}{}
	}
	if strings.TrimSpace(gtag) != "" {
		hosts["www.googletagmanager.com"] = struct{}{}
	}

	if len(hosts) == 0 {
		return ""
	}

	ordered := make([]string, 0, len(hosts))
	for host := range hosts {
		ordered = append(ordered, host)
	}
	slices.Sort(ordered)

	var b strings.Builder
	for _, host := range ordered {
		href := "https://" + host
		b.WriteString(`<link rel="dns-prefetch" href="//`)
		b.WriteString(htmlEsc(host))
		b.WriteString(`">`)
		b.WriteByte('\n')
		b.WriteString(`<link rel="preconnect" href="`)
		b.WriteString(htmlEsc(href))
		b.WriteString(`" crossorigin>`)
		b.WriteByte('\n')
	}
	return b.String()
}

func extractHostFromAbsoluteURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if !strings.HasPrefix(raw, "https://") && !strings.HasPrefix(raw, "http://") {
		return ""
	}
	raw = strings.TrimPrefix(raw, "https://")
	raw = strings.TrimPrefix(raw, "http://")
	if i := strings.Index(raw, "/"); i >= 0 {
		raw = raw[:i]
	}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if i := strings.Index(raw, ":"); i >= 0 {
		raw = raw[:i]
	}
	return strings.ToLower(raw)
}

func fallbackHTML(ctx *preprocessCtx, uri, appID, rpIndex, scripts string, includeVisibleBody bool) string {
	_ = uri
	title := ""
	description := ""
	keywords := ""
	canonical := ""
	image := ""
	lang := "vi"
	hreflang := ""
	structuredData := ""
	articleMeta := ""
	robots := "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
	if ctx != nil {
		if strings.TrimSpace(ctx.RobotsPolicy) != "" {
			robots = strings.TrimSpace(ctx.RobotsPolicy)
		}
		title = ctx.Title
		description = ctx.Description
		keywords = ctx.Keywords
		canonical = ctx.Canonical
		image = ctx.Image
		lang = resolveLang(map[string]string{"hl": ctx.Lang})
		if lang == "" {
			lang = "vi"
		}
		hreflang = renderHreflangLinks(buildHreflangLinks(ctx.BaseURL, ctx.PagePath))
		structuredData = buildStructuredDataGraph(ctx)
		if strings.EqualFold(ctx.PageType, "article") {
			if ctx.PublishedAt != "" {
				articleMeta += `<meta property="article:published_time" content="` + htmlEsc(ctx.PublishedAt) + `"/>` + "\n"
			}
			if ctx.ModifiedAt != "" {
				articleMeta += `<meta property="article:modified_time" content="` + htmlEsc(ctx.ModifiedAt) + `"/>` + "\n"
			}
			if ctx.Author != "" {
				articleMeta += `<meta property="article:author" content="` + htmlEsc(ctx.Author) + `"/>` + "\n"
			}
		}
	}

	moduleSrc := "/assets/main.js"
	if rpIndex = strings.Trim(strings.TrimSpace(rpIndex), "/"); rpIndex != "" {
		moduleSrc = "/" + rpIndex + "/assets/main.js"
	}
	bodyHTML := ""
	if includeVisibleBody {
		bodyHTML = buildSSRVisibleBodyHTML(ctx)
	}
	html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="%s">
<head>
  <meta charset="utf-8"/>
  <title>%s</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="description" content="%s"/>
  <meta name="keywords" content="%s"/>
  <meta name="robots" content="%s"/>
  <link rel="canonical" href="%s"/>
  <meta property="og:type" content="%s"/>
  <meta property="og:url" content="%s"/>
  <meta property="og:title" content="%s"/>
  <meta property="og:description" content="%s"/>
  <meta property="og:image" content="%s"/>
  <meta property="og:locale" content="%s"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="%s"/>
  <meta name="twitter:description" content="%s"/>
  <meta name="twitter:image" content="%s"/>
	%s
  %s
  <script type="application/ld+json">%s</script>
  %s
</head>
<body id="home" data-app-id="%s"><div id="root"></div><script type="module" src="%s"></script></body>
</html>`,
		htmlEsc(lang),
		htmlEsc(title),
		htmlEsc(description),
		htmlEsc(keywords),
		htmlEsc(robots),
		htmlEsc(canonical),
		htmlEsc(func() string {
			if ctx != nil && strings.EqualFold(ctx.PageType, "article") {
				return "article"
			}
			return "website"
		}()),
		htmlEsc(canonical),
		htmlEsc(title),
		htmlEsc(description),
		htmlEsc(image),
		htmlEsc(localeTag(lang)),
		htmlEsc(title),
		htmlEsc(description),
		htmlEsc(image),
		articleMeta,
		hreflang,
		structuredData,
		scripts,
		htmlEsc(appID),
		htmlEsc(moduleSrc),
	)
	if includeVisibleBody {
		injectSSRVisibleBody(&html, bodyHTML)
	}
	return html
}
