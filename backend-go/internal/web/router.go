package web

import (
	"net/http"
	"strings"

	"csm_server/backend-go/internal/state"
)

func HandleWebPath(st *state.AppState, w http.ResponseWriter, r *http.Request, uri, host, query string) {
	uri = NormalizeURI(uri)

	switch uri {
	case "/robots.txt":
		writeText(w, http.StatusOK, "text/plain; charset=utf-8", GenerateRobotsTxt(host))
		return
	case "/sitemap.xml":
		writeText(w, http.StatusOK, "application/xml; charset=utf-8", BuildSitemap(st.RecordManager, host))
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
		if data, path, ok := readStaticFile(st, uri, rpIndex); ok {
			writeFileResponse(w, path, data)
			return
		}
		http.NotFound(w, r)
		return
	}

	ctx := SSRContext{RM: st.RecordManager}
	html := RenderPage(ctx, uri, host, query)
	writeText(w, http.StatusOK, "text/html; charset=utf-8", html)
}

func ServeStatic(st *state.AppState, w http.ResponseWriter, r *http.Request, uri string) {
	ServeAppImages(st, w, r, uri)
}

func ServeSSR(st *state.AppState, w http.ResponseWriter, r *http.Request, uri, host, query string) {
	ctx := SSRContext{RM: st.RecordManager}
	html := RenderPage(ctx, uri, host, query)
	writeText(w, http.StatusOK, "text/html; charset=utf-8", html)
}
