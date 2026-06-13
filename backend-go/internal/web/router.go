package web

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/state"
)

func HandleWebPath(st *state.AppState, w http.ResponseWriter, r *http.Request, uri, host, query string) {
	publicRoot := filepath.Join(st.Config.DataDir, "public")
	candidates := []string{
		filepath.Join(publicRoot, strings.TrimPrefix(uri, "/")),
		filepath.Join(publicRoot, "admin", strings.TrimPrefix(uri, "/")),
	}
	for _, p := range candidates {
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			http.ServeFile(w, r, p)
			return
		}
	}
	// SPA fallback for admin hosts
	if strings.HasPrefix(host, "admin.") || uri == "/" || strings.HasPrefix(uri, "/login") {
		indexPaths := []string{
			filepath.Join(publicRoot, "admin", "index.html"),
			filepath.Join(publicRoot, "index.html"),
		}
		for _, p := range indexPaths {
			if _, err := os.Stat(p); err == nil {
				http.ServeFile(w, r, p)
				return
			}
		}
	}
	http.NotFound(w, r)
}

func ServeStatic(st *state.AppState, w http.ResponseWriter, r *http.Request, uri string) {
	path := filepath.Join(st.Config.DataDir, "public", strings.TrimPrefix(uri, "/api/"))
	if _, err := os.Stat(path); err != nil {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, path)
}

func ServeSSR(st *state.AppState, w http.ResponseWriter, r *http.Request, uri, host, query string) {
	resp := model.NewResponse()
	resp.Set("code", 501)
	resp.Set("success", false)
	resp.Set("message", "SSR endpoint "+uri+" — port from Java WebSpringController")
	resp.Write(w)
}
