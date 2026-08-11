package web

import (
	"encoding/json"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"csm_server/backend-go/internal/cacheepoch"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/state"
)

func shouldInjectVisibleSSRBody(r *http.Request, query string) bool {
	override := strings.ToLower(strings.TrimSpace(QSParam(query, "ssr_visible")))
	switch override {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	}

	ua := strings.ToLower(strings.TrimSpace(r.Header.Get("User-Agent")))
	if ua == "" {
		return false
	}

	botMarkers := []string{
		"googlebot", "adsbot", "bingbot", "duckduckbot", "baiduspider", "yandexbot", "slurp", "applebot",
		"facebookexternalhit", "twitterbot", "linkedinbot", "telegrambot", "whatsapp", "discordbot",
		"crawler", "spider",
	}
	for _, marker := range botMarkers {
		if strings.Contains(ua, marker) {
			return true
		}
	}
	return false
}

func parseAliasTags(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}

	var values []string
	if err := json.Unmarshal([]byte(raw), &values); err == nil {
		aliases := make([]string, 0, len(values))
		for _, value := range values {
			if trimmed := strings.TrimSpace(value); trimmed != "" {
				aliases = append(aliases, trimmed)
			}
		}
		return aliases
	}

	aliases := make([]string, 0)
	for _, part := range strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == '|' || r == ';' || r == ' ' || r == '[' || r == ']' || r == '"' || r == '\''
	}) {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			aliases = append(aliases, trimmed)
		}
	}
	return aliases
}

func canonicalizeLangQuery(query string) (string, bool) {
	query = strings.TrimSpace(query)
	if query == "" {
		return "", false
	}
	vals, err := url.ParseQuery(query)
	if err != nil {
		return query, false
	}
	raw := strings.ToLower(strings.TrimSpace(vals.Get("hl")))
	if raw == "" {
		return vals.Encode(), false
	}

	changed := false
	switch {
	case strings.HasPrefix(raw, "vi"):
		vals.Del("hl")
		changed = true
	case strings.HasPrefix(raw, "en"):
		if raw != "en" {
			vals.Set("hl", "en")
			changed = true
		}
	case strings.HasPrefix(raw, "zh"):
		if raw != "zh" {
			vals.Set("hl", "zh")
			changed = true
		}
	default:
		vals.Del("hl")
		changed = true
	}

	encoded := vals.Encode()
	if !changed && encoded != query {
		return encoded, true
	}
	return encoded, changed
}

func canonicalizeNonLangQuery(query string) string {
	query = strings.TrimSpace(query)
	if query == "" {
		return ""
	}
	vals, err := url.ParseQuery(query)
	if err != nil {
		return query
	}
	vals.Del("hl")
	keys := make([]string, 0, len(vals))
	for k := range vals {
		if strings.TrimSpace(k) == "" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		encodedKey := url.QueryEscape(k)
		vs := vals[k]
		if len(vs) == 0 {
			parts = append(parts, encodedKey+"=")
			continue
		}
		for _, v := range vs {
			parts = append(parts, encodedKey+"="+url.QueryEscape(v))
		}
	}
	return strings.Join(parts, "&")
}

func resolveLangFromPath(path string) (string, string) {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" || trimmed == "/" {
		return "", "/"
	}
	if !strings.HasPrefix(trimmed, "/") {
		trimmed = "/" + trimmed
	}
	segments := strings.Split(strings.TrimPrefix(trimmed, "/"), "/")
	if len(segments) == 0 {
		return "", "/"
	}
	first := strings.ToLower(strings.TrimSpace(segments[0]))
	if first != "en" && first != "zh" && first != "vi" {
		return "", trimmed
	}
	if len(segments) == 1 {
		return first, "/"
	}
	return first, "/" + strings.Join(segments[1:], "/")
}

func localizedPath(path, lang string) string {
	path = NormalizeIncomingWebPath(path)
	if path == "" {
		path = "/"
	}
	lang = strings.ToLower(strings.TrimSpace(lang))
	if lang != "en" && lang != "zh" {
		return path
	}
	if path == "/" {
		return "/" + lang
	}
	return "/" + lang + path
}

func redirectCanonicalLocalizedPath(w http.ResponseWriter, r *http.Request, uri, query string) (string, string, bool) {
	canonicalQuery, _ := canonicalizeLangQuery(query)
	baseQuery := canonicalizeNonLangQuery(canonicalQuery)

	pathLang, basePath := resolveLangFromPath(uri)
	queryLang := ""
	if canonicalQuery != "" {
		queryLang = strings.ToLower(strings.TrimSpace(QSParam(canonicalQuery, "hl")))
	}
	if queryLang == "vi" {
		queryLang = ""
	}

	targetLang := pathLang
	if targetLang == "vi" {
		targetLang = ""
	}
	if queryLang != "" {
		targetLang = queryLang
	}

	targetPath := localizedPath(basePath, targetLang)
	target := targetPath
	if baseQuery != "" {
		target += "?" + baseQuery
	}

	currentPath := NormalizeIncomingWebPath(uri)
	currentTarget := currentPath
	if canonicalQuery != "" {
		currentTarget += "?" + canonicalQuery
	}
	if target != currentTarget {
		http.Redirect(w, r, target, http.StatusMovedPermanently)
		return "", "", true
	}

	normalizedQuery := baseQuery
	if targetLang == "en" || targetLang == "zh" {
		if normalizedQuery == "" {
			normalizedQuery = "hl=" + targetLang
		} else {
			normalizedQuery += "&hl=" + targetLang
		}
	}

	return basePath, normalizedQuery, false
}

func redirectCanonicalLangQuery(w http.ResponseWriter, r *http.Request, uri, query string) bool {
	canonicalQuery, changed := canonicalizeLangQuery(query)
	if !changed {
		return false
	}
	target := uri
	if canonicalQuery != "" {
		target += "?" + canonicalQuery
	}
	http.Redirect(w, r, target, http.StatusMovedPermanently)
	return true
}

func redirectCanonicalCategoryPath(st *state.AppState, w http.ResponseWriter, r *http.Request, uri, host, query string) bool {
	trimmed := strings.Trim(strings.TrimSpace(uri), "/")
	if trimmed == "" {
		return false
	}

	parts := strings.Split(trimmed, "/")
	if len(parts) == 0 {
		return false
	}
	alias := strings.TrimSpace(parts[0])
	if alias == "" {
		return false
	}

	route := finalizeSSRRoute(resolveRoute(st.RecordManager, host, uri), st.RecordManager, host)
	if route.AppID == "" || route.TblServices == "" {
		return false
	}

	filter := model.SearchFilter{
		Operator: "AND",
		Conditions: []model.SearchFilter{
			model.EqFilter("status", "active"),
			{Field: "domain", FilterType: "like", Value: route.Domain},
		},
	}

	rows := rowsFrom(st.RecordManager.Filter(route.AppID, route.TblServices, filter))
	for _, row := range rows {
		slug := strings.TrimSpace(recordStr(row, "slug"))
		serviceCode := strings.TrimSpace(recordStr(row, "service_code"))
		aliases := append([]string{}, parseAliasTags(recordStr(row, "tags"))...)
		if slug != "" {
			aliases = append(aliases, slug)
		}
		if serviceCode != "" {
			aliases = append(aliases, serviceCode)
		}

		matchedAlias := false
		for _, candidate := range aliases {
			if candidate == alias {
				matchedAlias = true
				break
			}
		}
		if !matchedAlias {
			continue
		}

		canonical := serviceCode
		if canonical == "" {
			canonical = slug
		}
		if canonical == "" || canonical == alias {
			return false
		}

		target := "/" + canonical
		if len(parts) > 1 {
			target += "/" + strings.Join(parts[1:], "/")
		}
		canonicalQuery, _ := canonicalizeLangQuery(query)
		lang := strings.ToLower(strings.TrimSpace(QSParam(canonicalQuery, "hl")))
		target = localizedPath(target, lang)
		queryWithoutLang := canonicalizeNonLangQuery(canonicalQuery)
		if queryWithoutLang != "" {
			target += "?" + queryWithoutLang
		}
		http.Redirect(w, r, target, http.StatusMovedPermanently)
		return true
	}

	return false
}

func HandleWebPath(st *state.AppState, w http.ResponseWriter, r *http.Request, uri, host, query string) {
	uri = NormalizeIncomingWebPath(uri)
	if normalizedURI, normalizedQuery, redirected := redirectCanonicalLocalizedPath(w, r, uri, query); redirected {
		return
	} else {
		uri = normalizedURI
		query = normalizedQuery
	}
	if redirectCanonicalCategoryPath(st, w, r, uri, host, query) {
		return
	}

	switch uri {
	case "/robots.txt":
		writeTextCached(w, http.StatusOK, "text/plain; charset=utf-8", GenerateRobotsTxt(host), "public, max-age=3600")
		return
	case "/sitemap.xml":
		writeTextCached(w, http.StatusOK, "application/xml; charset=utf-8", CachedBuildSitemap(st.RecordManager, host), "public, max-age=300")
		return
	case "/feed.xml":
		ServeFeedXML(st, w, host)
		return
	case "/version.json":
		ServeVersionJSON(st, w, host)
		return
	case "/manifest.json":
		ServeManifestJSON(st, w)
		return
	case "/mfe/manifest":
		rpIndex := ResolveRPIndexPub(st.RecordManager, host)
		if active := strings.TrimSpace(QSParam(query, "active")); active != "" {
			rpIndex = active
		}
		ServeMonolithManifest(st, w, host, rpIndex)
		return
	case "/page_struct_js.shtml":
		ServePageStructJS(st, w, query)
		return
	case "/ssr/categories":
		ServeSSRCategories(st, w, host)
		return
	case "/ssr/tags":
		ServeSSRTags(st, w, host, query)
		return
	case "/ssr/reviews":
		ServeSSRReviews(st, w, host, query)
		return
	case "/kqxs/station":
		ServeKqxsStation(st, w, query)
		return
	case "/kqxs/stations":
		ServeKqxsStations(st, w, query)
		return
	case "/kqxs/table-range":
		ServeKqxsTableRange(st, w, query)
		return
	case "/kqxs/tonghop":
		ServeKqxsTonghop(st, w, query)
		return
	case "/vpts":
		ServeVpts(st, w, query)
		return
	}

	if strings.HasPrefix(uri, "/images.shtml") {
		ServeImagesShtml(st, w, query)
		return
	}
	if strings.HasPrefix(uri, "/app_images/") {
		ServeAppImages(st, w, r, uri)
		return
	}

	if uri == "/upload.shtml" || uri == "/upload" {
		cmd := QSParam(query, "cmd")
		if cmd == "list" || cmd == "removeimg" {
			ServeUploadCmd(st, w, query)
			return
		}
	}

	if HasStaticExtension(uri) {
		rpIndex := ResolveRPIndexPub(st.RecordManager, host)
		if data, path, enc, ok := readStaticFile(st, uri, rpIndex, r.Header.Get("Accept-Encoding")); ok {
			writeFileResponse(w, path, data, enc)
			return
		}
		http.NotFound(w, r)
		return
	}

	ctx := SSRContext{RM: st.RecordManager}
	injectVisibleBody := shouldInjectVisibleSSRBody(r, query)
	if shouldNoIndexSSRQuery(parseQS(query)) {
		w.Header().Set("X-Robots-Tag", "noindex,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1")
	}
	setSSREpochHeader(w)
	w.Header().Add("Vary", "User-Agent")
	html := RenderPage(ctx, uri, host, query, injectVisibleBody)
	writeTextCached(w, http.StatusOK, "text/html; charset=utf-8", html, "public, max-age=60, stale-while-revalidate=300, stale-if-error=600")
}

func ServeStatic(st *state.AppState, w http.ResponseWriter, r *http.Request, uri string) {
	ServeAppImages(st, w, r, uri)
}

func ServeSSR(st *state.AppState, w http.ResponseWriter, r *http.Request, uri, host, query string) {
	uri = NormalizeIncomingWebPath(uri)
	if normalizedURI, normalizedQuery, redirected := redirectCanonicalLocalizedPath(w, r, uri, query); redirected {
		return
	} else {
		uri = normalizedURI
		query = normalizedQuery
	}
	if redirectCanonicalCategoryPath(st, w, r, uri, host, query) {
		return
	}
	ctx := SSRContext{RM: st.RecordManager}
	injectVisibleBody := shouldInjectVisibleSSRBody(r, query)
	if shouldNoIndexSSRQuery(parseQS(query)) {
		w.Header().Set("X-Robots-Tag", "noindex,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1")
	}
	setSSREpochHeader(w)
	w.Header().Add("Vary", "User-Agent")
	html := RenderPage(ctx, uri, host, query, injectVisibleBody)
	writeTextCached(w, http.StatusOK, "text/html; charset=utf-8", html, "public, max-age=60, stale-while-revalidate=300, stale-if-error=600")
}

func setSSREpochHeader(w http.ResponseWriter) {
	w.Header().Set("X-SSR-Epoch", strconv.FormatUint(cacheepoch.CurrentSSRContentEpoch(), 10))
}
