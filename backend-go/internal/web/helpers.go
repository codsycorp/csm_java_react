package web

import (
	"encoding/json"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
)

var staticExtensions = map[string]struct{}{
	"js": {}, "css": {}, "png": {}, "jpg": {}, "jpeg": {}, "gif": {}, "svg": {}, "ico": {},
	"woff": {}, "woff2": {}, "ttf": {}, "eot": {}, "webp": {}, "mp4": {}, "webm": {}, "mov": {},
	"m4v": {}, "json": {}, "xml": {}, "map": {},
	"pdf": {}, "doc": {}, "docx": {}, "xls": {}, "xlsx": {}, "csv": {},
}

func HasStaticExtension(uri string) bool {
	lower := strings.ToLower(strings.SplitN(uri, "?", 2)[0])
	if i := strings.LastIndex(lower, "."); i >= 0 {
		ext := lower[i+1:]
		_, ok := staticExtensions[ext]
		return ok
	}
	return false
}

func QSParam(qs, key string) string {
	if qs == "" {
		return ""
	}
	for _, part := range strings.Split(qs, "&") {
		k, v, ok := strings.Cut(part, "=")
		if ok && k == key {
			dec, err := url.QueryUnescape(v)
			if err != nil {
				return v
			}
			return dec
		}
	}
	return ""
}

func DomainFromHost(host string) string {
	h := strings.TrimSpace(host)
	if h == "" {
		return ""
	}
	h = strings.ToLower(h)
	h = strings.TrimPrefix(h, "www.")
	if i := strings.Index(h, ":"); i >= 0 {
		h = h[:i]
	}
	return h
}

func NormalizeIncomingWebPath(uri string) string {
	if uri == "" {
		return "/"
	}
	if i := strings.Index(uri, "?"); i >= 0 {
		uri = uri[:i]
	}
	if i := strings.Index(uri, "#"); i >= 0 {
		uri = uri[:i]
	}
	if strings.HasPrefix(uri, "/api/app_images/") {
		uri = uri[4:]
	}
	if len(uri) > 1 && strings.HasSuffix(uri, "/") {
		uri = strings.TrimSuffix(uri, "/")
	}
	if uri == "" {
		return "/"
	}
	return uri
}

// NormalizeURI strips .shtml for internal path parsing (f_case, segment split).
func NormalizeURI(uri string) string {
	uri = NormalizeIncomingWebPath(uri)
	uri = strings.ReplaceAll(uri, ".shtml", "")
	if uri == "" {
		return "/"
	}
	return uri
}

func mimeFromPath(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".html", ".htm":
		return "text/html; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".js", ".mjs":
		return "application/javascript; charset=utf-8"
	case ".json":
		return "application/json; charset=utf-8"
	case ".xml":
		return "application/xml; charset=utf-8"
	case ".pdf":
		return "application/pdf"
	case ".doc":
		return "application/msword"
	case ".docx":
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	case ".xls":
		return "application/vnd.ms-excel"
	case ".xlsx":
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	case ".csv":
		return "text/csv; charset=utf-8"
	case ".svg":
		return "image/svg+xml"
	case ".webp":
		return "image/webp"
	case ".woff2":
		return "font/woff2"
	case ".woff":
		return "font/woff"
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	default:
		if strings.HasPrefix(ext, ".") {
			return "application/octet-stream"
		}
		return "application/octet-stream"
	}
}

func writeText(w http.ResponseWriter, status int, contentType, body string) {
	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}

func writeTextCached(w http.ResponseWriter, status int, contentType, body, cacheControl string) {
	w.Header().Set("Content-Type", contentType)
	if cacheControl != "" {
		w.Header().Set("Cache-Control", cacheControl)
	}
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	raw, _ := json.Marshal(v)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(raw)
}

func writeJSONError(w http.ResponseWriter, msg string) {
	writeJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": msg})
}

func xmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}
