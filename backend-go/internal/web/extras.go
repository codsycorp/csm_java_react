package web

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/state"
)

func GenerateRobotsTxt(host string) string {
	txt := "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /upload.shtml\n\n"
	if host != "" {
		txt += fmt.Sprintf("Sitemap: https://%s/sitemap.xml\n", host)
		txt += fmt.Sprintf("Sitemap: https://%s/feed.xml\n", host)
	}
	return txt
}

func ServeFeedXML(st *state.AppState, w http.ResponseWriter, host string) {
	domain := DomainFromHost(host)
	baseURL := "https://" + host
	if host == "" {
		baseURL = "https://" + domain
	}

	feed := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>%s</title>
    <link>%s</link>
    <description>Latest content updates</description>
    <language>vi</language>
`, xmlEscape(domain), baseURL)

	itemCount := 0
	for _, cfg := range loadRouteConfigs(st, domain) {
		if cfg.tblDetail == "" {
			continue
		}
		filter := model.SearchFilter{
			Operator: "AND",
			Conditions: []model.SearchFilter{
				model.EqFilter("status", "active"),
				{Field: "domain", FilterType: "like", Value: domain},
			},
		}
		result := st.RecordManager.Filter(cfg.appID, cfg.tblDetail, filter)
		for _, row := range rowsFromAny(result) {
			if itemCount >= 50 {
				break
			}
			title := recordStr(row, "title")
			if title == "" {
				title = recordStr(row, "title_vi")
			}
			slug := strings.TrimSuffix(strings.TrimSpace(recordStr(row, "slug")), ".shtml")
			if title == "" || slug == "" {
				continue
			}
			svcType := recordStr(row, "service_type")
			var path string
			if svcType == "" {
				path = "/" + slug
			} else {
				path = "/" + svcType + "/" + slug
			}
			path = canonicalSEOPath(path)
			url := baseURL + path
			lastmod := extractDateOnly(resolveLastmodFromRow(row))
			feed += fmt.Sprintf("    <item>\n      <title><![CDATA[%s]]></title>\n      <link>%s</link>\n      <guid>%s</guid>\n", title, url, url)
			if lastmod != "" {
				feed += fmt.Sprintf("      <pubDate>%s</pubDate>\n", lastmod)
			}
			feed += "    </item>\n"
			itemCount++
			if itemCount >= 50 {
				break
			}
		}
		if itemCount >= 50 {
			break
		}
	}
	feed += "  </channel>\n</rss>"
	w.Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(feed))
}

type routeConfig struct {
	appID     string
	tblDetail string
}

func loadRouteConfigs(st *state.AppState, domain string) []routeConfig {
	filter := model.SearchFilter{
		Operator: "AND",
		Conditions: []model.SearchFilter{
			{Field: "domain_name", FilterType: "like", Value: domain},
			model.EqFilter("run", 1),
		},
	}
	result := st.RecordManager.Filter("csm", "sys_la_routers", filter)
	var out []routeConfig
	for _, row := range rowsFromAny(result) {
		appID := recordStr(row, "app_id")
		tblDetail := recordStr(row, "tbl_service_detail")
		if appID == "" {
			continue
		}
		out = append(out, routeConfig{appID: appID, tblDetail: tblDetail})
	}
	return out
}

func resolveVersionRPIndex(rm *data.RecordManager, host string) string {
	rpIndex := ResolveRPIndexPub(rm, host)
	if rpIndex != "" {
		return rpIndex
	}
	if strings.HasPrefix(DomainFromHost(host), "admin.") {
		for _, candidate := range []string{"admin/version.json", "version.json"} {
			if rm.GetStaticFile(candidate) != "" {
				return "admin"
			}
		}
	}
	return ""
}

func ServeVersionJSON(st *state.AppState, w http.ResponseWriter, host string) {
	rpIndex := resolveVersionRPIndex(st.RecordManager, host)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")

	if rpIndex != "" {
		if serveStaticBytes(st, rpIndex+"/version.json", w) {
			return
		}
	}
	if serveStaticBytes(st, "version.json", w) {
		return
	}
	if rpIndex != "" {
		idxPath := st.RecordManager.GetStaticFile(rpIndex + "/index.html")
		if idxPath != "" {
			if info, err := os.Stat(idxPath); err == nil {
				ms := info.ModTime().UnixMilli()
				w.WriteHeader(http.StatusOK)
				_, _ = fmt.Fprintf(w, `{"version":"%d"}`, ms)
				return
			}
		}
	}
	http.Error(w, "version.json not found", http.StatusNotFound)
}

func ServeManifestJSON(st *state.AppState, w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/manifest+json; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	if serveStaticBytes(st, "manifest.json", w) {
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"name":"CSM","short_name":"CSM","start_url":"/","display":"standalone","background_color":"#ffffff","theme_color":"#000000","icons":[]}`))
}

func ServePageStructJS(st *state.AppState, w http.ResponseWriter, query string) {
	name := QSParam(query, "name")
	apt := QSParam(query, "apt")
	apd := QSParam(query, "apd")
	w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")

	if apt != "" && apd != "" {
		appID := apd
		if apd == "false" {
			appID = name
		}
		if appID != "" {
			filter := model.EqFilter("id", apt)
			result := st.RecordManager.Filter(appID, "index", filter)
			rows := rowsFromAny(result)
			if len(rows) > 0 {
				structB64 := recordStr(rows[0], "struct")
				if structB64 != "" {
					if bytes, err := base64.StdEncoding.DecodeString(structB64); err == nil {
						w.WriteHeader(http.StatusOK)
						_, _ = w.Write(bytes)
						return
					}
				}
			}
		}
	}

	if name == "" {
		w.WriteHeader(http.StatusOK)
		return
	}
	filter := model.SearchFilter{
		Operator: "AND",
		Conditions: []model.SearchFilter{
			model.EqFilter("p_name", name),
			model.EqFilter("p_type", 0),
		},
	}
	result := st.RecordManager.Filter("csm", "sys_autos", filter)
	rows := rowsFromAny(result)
	if len(rows) > 0 {
		pCode := recordStr(rows[0], "p_code")
		if pCode != "" {
			js, err := st.RecordManager.CsmDecrypt(pCode)
			if err != nil {
				js = pCode
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(js))
			return
		}
	}
	w.WriteHeader(http.StatusOK)
}

func ServeImagesShtml(st *state.AppState, w http.ResponseWriter, query string) {
	src := QSParam(query, "src")
	name := QSParam(query, "name")
	relPath := src
	if relPath == "" {
		relPath = name
	}
	if relPath == "" {
		http.Error(w, "src or name param required", http.StatusBadRequest)
		return
	}
	if strings.Contains(relPath, "..") {
		http.Error(w, "Invalid path", http.StatusForbidden)
		return
	}
	appID := QSParam(query, "app_id")
	relPath = strings.TrimPrefix(relPath, "/")
	var fileRel string
	if appID != "" {
		fileRel = "app_images/" + appID + "/" + relPath
	} else {
		fileRel = "app_images/" + relPath
	}
	path := st.RecordManager.GetStaticFile(fileRel)
	if path == "" {
		http.NotFound(w, nil)
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		http.NotFound(w, nil)
		return
	}
	mime := mimeFromPath(path)
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "public, max-age=2592000")
	w.Header().Set("ETag", fmt.Sprintf(`"%d-%s"`, len(data), path))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func ServeUploadCmd(st *state.AppState, w http.ResponseWriter, query string) {
	cmd := QSParam(query, "cmd")
	appID := QSParam(query, "app_id")
	dir := QSParam(query, "dir")
	name := QSParam(query, "name")
	if strings.Contains(appID, "..") || strings.Contains(dir, "..") || strings.Contains(name, "..") {
		writeJSONError(w, "Invalid path")
		return
	}

	switch cmd {
	case "list":
		sub := "app_images/" + appID
		if dir != "" {
			sub = "app_images/" + appID + "/" + strings.Trim(dir, "/")
		}
		base := filepath.Join(st.Config.DataDir, "public", sub)
		var files []map[string]string
		entries, err := os.ReadDir(base)
		if err == nil {
			for _, entry := range entries {
				fname := entry.Name()
				if strings.HasPrefix(fname, ".") {
					continue
				}
				ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(fname), "."))
				switch ext {
				case "jpg", "jpeg", "png", "gif", "webp", "svg", "mp4", "webm", "mov":
				default:
					continue
				}
				url := "/" + sub + "/" + fname
				files = append(files, map[string]string{"name": fname, "url": url})
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"success": true, "data": files, "rows": len(files),
		})
	case "removeimg":
		if name == "" {
			writeJSONError(w, "name param required")
			return
		}
		rel := "app_images/" + appID + "/" + strings.TrimPrefix(name, "/")
		path := filepath.Join(st.Config.DataDir, "public", rel)
		if err := os.Remove(path); err != nil {
			writeJSONError(w, "Failed to delete: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"success": true})
	default:
		writeJSONError(w, "Unknown cmd")
	}
}

func serveStaticBytes(st *state.AppState, rel string, w http.ResponseWriter) bool {
	path := st.RecordManager.GetStaticFile(rel)
	if path == "" {
		return false
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
	return true
}

func staticCacheControl(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".js", ".css", ".woff2", ".woff":
		return "public, max-age=31536000, immutable"
	default:
		return "public, max-age=86400"
	}
}

func writeFileResponse(w http.ResponseWriter, path string, data []byte) {
	w.Header().Set("Content-Type", mimeFromPath(path))
	w.Header().Set("Cache-Control", staticCacheControl(path))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func readStaticFile(st *state.AppState, uri, rpIndex string) ([]byte, string, bool) {
	rel := strings.TrimPrefix(uri, "/")
	if path := st.RecordManager.GetStaticFile(rel); path != "" {
		if data, err := os.ReadFile(path); err == nil {
			return data, path, true
		}
	}
	if rpIndex != "" {
		rpRel := rpIndex + "/" + rel
		if path := st.RecordManager.GetStaticFile(rpRel); path != "" {
			if data, err := os.ReadFile(path); err == nil {
				return data, path, true
			}
		}
	}
	publicRoot := filepath.Join(st.Config.DataDir, "public")
	for _, p := range []string{
		filepath.Join(publicRoot, rel),
		filepath.Join(publicRoot, "admin", rel),
	} {
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			if data, err := os.ReadFile(p); err == nil {
				return data, p, true
			}
		}
	}
	return nil, "", false
}

// ServeAppImages serves /app_images/* and /api/app_images/* paths.
func ServeAppImages(st *state.AppState, w http.ResponseWriter, r *http.Request, uri string) {
	rel := strings.TrimPrefix(uri, "/api/app_images/")
	rel = strings.TrimPrefix(rel, "/app_images/")
	if rel == "" || strings.Contains(rel, "..") {
		http.NotFound(w, r)
		return
	}
	path := st.RecordManager.GetStaticFile("app_images/" + rel)
	if path == "" {
		http.NotFound(w, r)
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	writeFileResponse(w, path, data)
}
