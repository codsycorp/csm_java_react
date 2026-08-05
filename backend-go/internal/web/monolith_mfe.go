package web

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/state"
)

type monolithMFEManifest struct {
	Schema      string   `json:"schema"`
	App         string   `json:"app"`
	RPIndex     string   `json:"rpIndex"`
	RouteBase   string   `json:"routeBase"`
	Hydrate     bool     `json:"hydrate"`
	Entry       string   `json:"entry"`
	JS          []string `json:"js"`
	CSS         []string `json:"css"`
	GeneratedAt string   `json:"generatedAt"`
}

func loadMonolithMFEManifest(rm *data.RecordManager, rpIndex string) (*monolithMFEManifest, bool) {
	candidates := []string{rpIndex + "/mfe.manifest.json"}
	if rpIndex == "" {
		candidates = append(candidates, "mfe.manifest.json")
	}
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		path := rm.GetStaticFile(candidate)
		if path == "" {
			continue
		}
		raw, err := os.ReadFile(path)
		if err != nil || len(raw) == 0 {
			continue
		}
		var mf monolithMFEManifest
		if err := json.Unmarshal(raw, &mf); err != nil {
			continue
		}
		if strings.TrimSpace(mf.RPIndex) == "" {
			mf.RPIndex = rpIndex
		}
		return &mf, true
	}
	return nil, false
}

func buildMonolithRuntimeConfig(rm *data.RecordManager, host, activeRPIndex string) map[string]any {
	apps := []string{"admin", "web", "lmkt"}
	manifests := make(map[string]any)
	for _, app := range apps {
		if mf, ok := loadMonolithMFEManifest(rm, app); ok {
			manifests[app] = mf
		}
	}
	return map[string]any{
		"schema":        "csm.monolith.runtime.v1",
		"activeRPIndex": strings.TrimSpace(activeRPIndex),
		"host":          strings.TrimSpace(host),
		"manifests":     manifests,
	}
}

func buildMonolithBootstrapScript(rm *data.RecordManager, host, activeRPIndex string) string {
	cfg := buildMonolithRuntimeConfig(rm, host, activeRPIndex)
	raw, err := json.Marshal(cfg)
	if err != nil {
		return ""
	}
	payload := strings.ReplaceAll(string(raw), "</script>", "<\\/script>")
	return `<script>window.__CSM_MONOLITH__=` + payload + `;</script>`
}

func ServeMonolithManifest(st *state.AppState, w http.ResponseWriter, host, activeRPIndex string) {
	payload := buildMonolithRuntimeConfig(st.RecordManager, host, activeRPIndex)
	raw, err := json.Marshal(payload)
	if err != nil {
		http.Error(w, "failed to build monolith manifest", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=30")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(raw)
}
