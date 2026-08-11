package web

import (
	"encoding/json"
	"net/http"
	"strings"

	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/state"
)

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
		if query != "" {
			target += "?" + query
		}
		http.Redirect(w, r, target, http.StatusMovedPermanently)
		return true
	}

	return false
}

func HandleWebPath(st *state.AppState, w http.ResponseWriter, r *http.Request, uri, host, query string) {
	uri = NormalizeIncomingWebPath(uri)
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
	html := RenderPage(ctx, uri, host, query)
	writeTextCached(w, http.StatusOK, "text/html; charset=utf-8", html, "public, max-age=60, stale-while-revalidate=300, stale-if-error=600")
}

func ServeStatic(st *state.AppState, w http.ResponseWriter, r *http.Request, uri string) {
	ServeAppImages(st, w, r, uri)
}

func ServeSSR(st *state.AppState, w http.ResponseWriter, r *http.Request, uri, host, query string) {
	uri = NormalizeIncomingWebPath(uri)
	if redirectCanonicalCategoryPath(st, w, r, uri, host, query) {
		return
	}
	ctx := SSRContext{RM: st.RecordManager}
	html := RenderPage(ctx, uri, host, query)
	writeTextCached(w, http.StatusOK, "text/html; charset=utf-8", html, "public, max-age=60, stale-while-revalidate=300, stale-if-error=600")
}
