package handlers

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/services"
)

type ApiExtHandler struct {
	cfg         config.AppConfig
	httpClient  *http.Client
	googleIndex *services.GoogleIndexService
	aiSeo       *services.AiSeoService
}

func NewApiExtHandler(cfg config.AppConfig, httpClient *http.Client, googleIndex *services.GoogleIndexService, aiSeo *services.AiSeoService) *ApiExtHandler {
	return &ApiExtHandler{
		cfg: cfg, httpClient: httpClient, googleIndex: googleIndex, aiSeo: aiSeo,
	}
}

func (h *ApiExtHandler) HandleScrapeWeb(params map[string]any) *model.StandardResponse {
	link := paramStr(params, "link")
	if link == "" {
		link = paramStr(params, "url")
	}
	if link == "" {
		return model.ErrorResponse(400, "Missing 'link' parameter for web scraping.")
	}
	client, err := scrapeHTTPClient(h.httpClient, params)
	if err != nil {
		return model.ErrorResponse(500, "Invalid proxy configuration: "+err.Error())
	}
	req, err := http.NewRequest(http.MethodGet, link, nil)
	if err != nil {
		return model.ErrorResponse(500, "Internal server error during scraping: "+err.Error())
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; CSMBridge/1.0; +https://csmbridge.net)")
	resp, err := client.Do(req)
	if err != nil {
		return model.ErrorResponse(500, "Internal server error during scraping: "+err.Error())
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	html := string(body)
	r := model.NewResponse()
	if html == "" {
		r.Set("code", 500)
		r.Set("success", false)
		r.Set("message", fmt.Sprintf("Failed to retrieve content from %s", link))
		return r
	}
	if len(html) > 500_000 {
		html = html[:500_000]
	}
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("message", "Scraping successful")
	r.Set("data", html)
	return r
}

func (h *ApiExtHandler) HandleIndexGoogle(params map[string]any) *model.StandardResponse {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	props := h.googleIndex.HandleOperation(ctx, params)
	r := model.NewResponse()
	for k, v := range props {
		r.Set(k, v)
	}
	return r
}

func (h *ApiExtHandler) HandleExecuteJS(_ map[string]any) *model.StandardResponse {
	r := model.NewResponse()
	r.Set("success", false)
	r.Set("message", "execute-js-on-page requires headless browser sidecar")
	return r
}

func (h *ApiExtHandler) HandleAiGenerateSeoContent(params map[string]any) *model.StandardResponse {
	ctx, cancel := services.SeoRequestContext()
	defer cancel()
	return h.aiSeo.Generate(ctx, params)
}

func (h *ApiExtHandler) HandleAppsList(_ map[string]any) *model.StandardResponse {
	r := model.NewResponse()
	r.Set("success", true)
	r.Set("apps", []string{"csm", "web", "kqxs", "vpts"})
	return r
}

func scrapeHTTPClient(baseClient *http.Client, params map[string]any) (*http.Client, error) {
	proxyServer := paramStr(params, "proxyServer")
	if proxyServer == "" {
		return baseClient, nil
	}
	proxyURL := proxyServer
	if !strings.HasPrefix(proxyURL, "http://") && !strings.HasPrefix(proxyURL, "https://") {
		proxyURL = "http://" + proxyURL
	}
	u, err := url.Parse(proxyURL)
	if err != nil {
		return nil, err
	}
	username := paramStr(params, "proxyUsername")
	password := paramStr(params, "proxyPassword")
	if username != "" {
		u.User = url.UserPassword(username, password)
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if baseTransport, ok := baseClient.Transport.(*http.Transport); ok {
		transport = baseTransport.Clone()
	}
	transport.Proxy = http.ProxyURL(u)
	return &http.Client{Timeout: 900 * time.Second, Transport: transport}, nil
}
