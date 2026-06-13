package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"csm_server/backend-go/internal/api/paths"
	"csm_server/backend-go/internal/handlers"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/security"
	"csm_server/backend-go/internal/state"
	"csm_server/backend-go/internal/web"
)

func CatchAll(st *state.AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uri := r.URL.Path
		host := extractHost(r.Header)
		query := r.URL.RawQuery

		if r.Method == http.MethodPost && (uri == "/upload" || uri == "/upload.shtml" || uri == "/api/upload") {
			if uri == "/upload.shtml" {
				web.HandleUploadSHTML(st, w, r)
			} else {
				web.HandleUpload(st, w, r)
			}
			return
		}

		if strings.HasPrefix(uri, "/app_images/") || strings.HasPrefix(uri, "/api/app_images/") {
			web.ServeAppImages(st, w, r, uri)
			return
		}

		isAdminHost := strings.HasPrefix(host, "admin.")
		isAPI := security.IsAPIRequest(uri, host) ||
			paths.IsDirectAIPath(uri) ||
			(!isAdminHost && paths.IsBareAPIPath(uri))

		if isAPI {
			clean := strings.TrimPrefix(uri, "/api")
			params := ParseRequestParams(r)
			params["_client_ip"] = security.ClientIPFromRequest(r)
			auth := security.AuthFromContext(r.Context())
			if r.Method == http.MethodPost && handlers.HandleStreamingAPI(handlers.StreamDeps{
				Config: st.Config,
				Llama:  st.Llama,
			}, w, r, clean, params, auth) {
				return
			}
			resp := DispatchAPI(st, r.Method, clean, params, auth)
			resp.Write(w)
			return
		}

		web.HandleWebPath(st, w, r, uri, host, query)
	}
}

func DispatchAPI(st *state.AppState, method, path string, params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	switch path {
	case "/create-default-data":
		return st.InitHandler.HandleCreateDefaultData()
	case "/user-info":
		return st.AuthHandler.HandleUserInfo(auth, params)
	case "/login":
		return st.AuthHandler.HandleLogin(params)
	case "/logout":
		return st.AuthHandler.HandleLogout(auth, params)
	case "/refresh-token":
		return st.AuthHandler.HandleRefreshToken(params)
	case "/register":
		return st.AuthHandler.HandleRegister(params)
	case "/create-sub-user":
		return st.AuthHandler.HandleCreateSubUser(params, auth)
	case "/get-async-routes":
		return st.AuthHandler.HandleGetAsyncRoutes(auth)

	case "/role-list":
		return st.RoleHandler.HandleRoleList(params)
	case "/role-item":
		return st.RoleHandler.HandleRoleItem(method, params)
	case "/role-menu":
		return st.RoleHandler.HandleRoleMenu()
	case "/menu-by-role-id":
		return st.MenuHandler.HandleMenuByRoleID(params)
	case "/menu-list":
		return st.MenuHandler.HandleMenuList(auth)
	case "/menu-item":
		return st.MenuHandler.HandleMenuItem(method, params)

	case "/notifications":
		return st.HomeHandler.HandleNotifications()
	case "/home":
		return st.HomeHandler.HandleHome()
	case "/home/pie":
		return st.HomeHandler.HandleHomePie()
	case "/home/line":
		return st.HomeHandler.HandleHomeLine(params)
	case "/home/googlebot":
		return st.HomeHandler.HandleGooglebotStats(params)
	case "/home/googlebot/delete":
		return st.HomeHandler.HandleGooglebotDelete(params)

	case "/restoredb":
		return st.TableHandler.RestoreDB(params)
	case "/backupdb":
		return st.TableHandler.BackupDB(params)
	case "/migrateKeys":
		return st.TableHandler.MigrateKeys(params)
	case "/create-table":
		return st.TableHandler.HandleCreateTable(params, auth)
	case "/drop-table":
		return st.TableHandler.HandleDropTable(params, auth)
	case "/get-table-data":
		return st.TableHandler.HandleGetTableData(params, auth)
	case "/update-table-data":
		return st.TableHandler.HandleUpdateTableData(params, auth)
	case "/bulk-update-table-data":
		return st.TableHandler.HandleBulkUpdate(params, auth)
	case "/update-table-data-index":
		return st.TableHandler.HandleIndexExisting(params)

	case "/seo":
		return st.SeoHandler.HandleSeo(params)
	case "/scrape-web":
		return st.ApiExtHandler.HandleScrapeWeb(params)
	case "/execute-js-on-page":
		return st.ApiExtHandler.HandleExecuteJS(params)
	case "/indexgoogle":
		return st.ApiExtHandler.HandleIndexGoogle(params)
	case "/ai-generate-seo-content":
		return st.ApiExtHandler.HandleAiGenerateSeoContent(params)
	case "/apps-list":
		return st.ApiExtHandler.HandleAppsList(params)

	case "/facebook/post":
		return st.SocialHandler.HandleFacebookPost(params)
	case "/facebook/post-with-images":
		return st.SocialHandler.HandleFacebookPostWithImages(params)
	case "/facebook/me":
		return st.SocialHandler.HandleFacebookMe(params)
	case "/facebook/exchange-token":
		return st.SocialHandler.HandleFacebookExchangeToken(params)
	case "/facebook/pages":
		return st.SocialHandler.HandleFacebookPages(params)
	case "/facebook/ads/campaign":
		return st.SocialHandler.HandleCreateAdCampaign(params, "facebook_ads", auth)
	case "/google/ads/campaign":
		return st.SocialHandler.HandleCreateAdCampaign(params, "google_ads", auth)

	case "/chat-history", "/chat-history-guest", "/chat-history-app",
		"/chat-guests-list", "/chat-mark-read",
		"/chat-mark-all-read", "/chat-delete-message":
		return model.NotImplemented(path + " (chat deferred)")

	case "/crm/customer":
		return st.CrmHandler.HandleCustomer(method, params, auth)
	case "/crm/customers":
		return st.CrmHandler.HandleCustomers(params, auth)
	case "/crm/customer/assign":
		return st.CrmHandler.HandleAssign(params, auth)
	case "/crm/customer/status":
		return st.CrmHandler.HandleStatus(params, auth)
	case "/crm/customer/purchase":
		return st.CrmHandler.HandlePurchase(params, auth)
	case "/crm/customer/contact":
		return st.CrmHandler.HandleContact(params, auth)
	case "/crm/birthdays":
		return st.CrmHandler.HandleBirthdays(params, auth)
	case "/crm/stats":
		return st.CrmHandler.HandleCrmStats(params, auth)
	case "/crm/website-stats":
		return st.CrmHandler.HandleWebsiteStats(params, auth)
	case "/crm/ads-stats":
		return st.CrmHandler.HandleAdsStats(params, auth)
	case "/crm/analytics":
		return st.CrmHandler.HandleAnalytics(params, auth)
	case "/crm/insights":
		return st.CrmHandler.HandleInsights(params, auth)
	default:
		if method == http.MethodPost && path == "/crm/ads" {
			return st.CrmHandler.HandleCreateAd(params, auth)
		}
		if path == "/crm/ads" {
			return st.CrmHandler.HandleGetAds(params, auth)
		}
		if strings.HasPrefix(path, "/ai-local") {
			return st.AiHandler.HandleAiLocal(path)
		}
		if isAiDispatchPath(path) {
			return st.AiHandler.HandleAiDispatch(path, params)
		}
		return model.ErrorResponse(404, "Unknown API path: "+path)
	}
}

func isAiDispatchPath(path string) bool {
	if path == "/aiAssistant-chat-stream" || path == "/ai/menu-merge" {
		return true
	}
	if strings.Contains(path, "ai-code-stream") {
		return true
	}
	if strings.HasPrefix(path, "/ai/") {
		return true
	}
	switch path {
	case "/ai-metrics-dashboard", "/ai-prompt-debug", "/ai-orchestration-preview",
		"/ai-quality-check", "/ai-token-optimize", "/ai-conversation-history",
		"/ai-assistant-session-history", "/ai-assistant-session-delete", "/ai-tasks/active":
		return true
	}
	if strings.HasPrefix(path, "/ai-prompt-debug/") {
		return true
	}
	if strings.HasPrefix(path, "/ai-assistant") {
		return true
	}
	return false
}

func ParseRequestParams(r *http.Request) map[string]any {
	params := make(map[string]any)
	params["_client_ip"] = security.ClientIPFromHeaders(r.Header)
	params["_user_agent"] = security.UserAgentFromHeaders(r.Header)
	params["_client_id"] = security.ClientIDFromHeaders(r.Header)
	params["_host"] = extractHost(r.Header)
	params["_origin"] = r.Header.Get("Origin")
	params["_referer"] = r.Header.Get("Referer")
	params["refreshTokenHeader"] = r.Header.Get("X-Refresh-Token")
	params["csm-token"] = firstNonEmpty(r.Header.Get("csm-token"), r.Header.Get("Authorization"))

	if c, err := r.Cookie("refreshToken"); err == nil {
		params["refreshToken"] = c.Value
	}

	if r.Method == http.MethodGet {
		for k, vals := range r.URL.Query() {
			if len(vals) == 1 {
				params[k] = vals[0]
			} else {
				params[k] = vals
			}
		}
		return params
	}

	body, err := io.ReadAll(r.Body)
	if err == nil && len(body) > 0 {
		var payload map[string]any
		if json.Unmarshal(body, &payload) == nil {
			for k, v := range payload {
				params[k] = v
			}
		}
	}
	return params
}

func MonitoringHealth() *model.StandardResponse {
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("status", "UP")
	r.Set("backend", "go")
	return r
}

func extractHost(h http.Header) string {
	if xf := h.Get("X-Forwarded-Host"); xf != "" {
		return strings.ToLower(xf)
	}
	if host := h.Get("Host"); host != "" {
		return strings.ToLower(host)
	}
	return ""
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		v = strings.TrimSpace(strings.TrimPrefix(v, "Bearer "))
		if v != "" {
			return v
		}
	}
	return ""
}
