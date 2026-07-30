package handlers

import (
	"context"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
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
	mu          sync.Mutex
	traffic     map[string]*trafficSceneState
}

func NewApiExtHandler(cfg config.AppConfig, httpClient *http.Client, googleIndex *services.GoogleIndexService, aiSeo *services.AiSeoService) *ApiExtHandler {
	return &ApiExtHandler{
		cfg: cfg, httpClient: httpClient, googleIndex: googleIndex, aiSeo: aiSeo,
		traffic: map[string]*trafficSceneState{},
	}
}

type trafficSceneState struct {
	Lanes  map[string]*laneSignState
	Tracks map[string]*vehicleTrackState
}

type laneSignState struct {
	Type      string
	SpeedKmh  float64
	DetectedY float64
	Detected  time.Time
}

type vehicleTrackState struct {
	LaneID      string
	LastY       float64
	LastSeen    time.Time
	LastAlertAt map[string]time.Time
}

type trafficDetection struct {
	TrackID    string
	Category   string
	Vehicle    string
	SignType   string
	SpeedKmh   float64
	Plate      string
	Confidence float64
	LaneID     string
	CenterY    float64
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

func (h *ApiExtHandler) HandleTrafficAnalyzeFrame(params map[string]any) *model.StandardResponse {
	cameraID := paramStr(params, "cameraId")
	if cameraID == "" {
		cameraID = "default"
	}
	now := time.Now()
	detections := parseTrafficDetections(params)
	laneCount := paramInt(params, "laneCount", 3)
	if laneCount < 1 {
		laneCount = 3
	}

	h.mu.Lock()
	scene := h.traffic[cameraID]
	if scene == nil {
		scene = &trafficSceneState{
			Lanes:  make(map[string]*laneSignState),
			Tracks: make(map[string]*vehicleTrackState),
		}
		h.traffic[cameraID] = scene
	}
	h.evictStaleScene(scene, now)

	for _, d := range detections {
		if d.Category != "sign" {
			continue
		}
		laneID := d.LaneID
		if laneID == "" {
			laneID = inferLaneID(0.5, laneCount)
		}
		state := &laneSignState{
			Type:      normalizeSignType(d.SignType),
			SpeedKmh:  d.SpeedKmh,
			DetectedY: d.CenterY,
			Detected:  now,
		}
		scene.Lanes[laneID] = state
	}

	alerts := make([]map[string]any, 0, 8)
	for _, d := range detections {
		if d.Category != "vehicle" {
			continue
		}
		laneID := d.LaneID
		if laneID == "" {
			laneID = inferLaneID(0.5, laneCount)
		}
		trackID := d.TrackID
		if trackID == "" {
			trackID = fmt.Sprintf("%s:%.0f", laneID, d.CenterY)
		}

		track := scene.Tracks[trackID]
		if track == nil {
			track = &vehicleTrackState{LaneID: laneID, LastSeen: now, LastAlertAt: map[string]time.Time{}}
			scene.Tracks[trackID] = track
		}

		if track.LaneID != "" && track.LaneID != laneID {
			alerts = appendIfRecent(alerts, h.maybeBuildAlert(now, track, "LANE_CHANGE", map[string]any{
				"severity": "info",
				"message":  fmt.Sprintf("Xe %s chuyển làn từ %s sang %s", d.Plate, track.LaneID, laneID),
				"laneFrom": track.LaneID,
				"laneTo":   laneID,
				"trackId":  trackID,
				"plate":    d.Plate,
				"vehicle":  d.Vehicle,
			}))
		}

		track.LaneID = laneID
		track.LastY = d.CenterY
		track.LastSeen = now

		if sign, ok := scene.Lanes[laneID]; ok {
			if shouldApplySignToVehicle(sign, d) {
				if sign.Type == "speed_limit" && sign.SpeedKmh > 0 && d.SpeedKmh > sign.SpeedKmh {
					over := math.Round((d.SpeedKmh-sign.SpeedKmh)*10) / 10
					alerts = appendIfRecent(alerts, h.maybeBuildAlert(now, track, "OVER_SPEED", map[string]any{
						"severity":     "high",
						"message":      fmt.Sprintf("Xe %s vượt tốc độ %.1f km/h (giới hạn %.0f)", d.Plate, d.SpeedKmh, sign.SpeedKmh),
						"trackId":      trackID,
						"plate":        d.Plate,
						"vehicle":      d.Vehicle,
						"laneId":       laneID,
						"currentSpeed": round1(d.SpeedKmh),
						"speedLimit":   sign.SpeedKmh,
						"overBy":       over,
					}))
				}
				if sign.Type == "stop" && d.SpeedKmh > 8 {
					alerts = appendIfRecent(alerts, h.maybeBuildAlert(now, track, "STOP_SIGN_VIOLATION", map[string]any{
						"severity":     "high",
						"message":      fmt.Sprintf("Xe %s không giảm tốc tại biển STOP (%.1f km/h)", d.Plate, d.SpeedKmh),
						"trackId":      trackID,
						"plate":        d.Plate,
						"vehicle":      d.Vehicle,
						"laneId":       laneID,
						"currentSpeed": round1(d.SpeedKmh),
					}))
				}
			}
		}
	}
	h.mu.Unlock()

	vehicles := make([]map[string]any, 0, 16)
	signs := make([]map[string]any, 0, 16)
	for _, d := range detections {
		if d.Category == "vehicle" {
			vehicles = append(vehicles, map[string]any{
				"trackId":      d.TrackID,
				"vehicleType":  d.Vehicle,
				"plate":        d.Plate,
				"laneId":       d.LaneID,
				"currentSpeed": round1(d.SpeedKmh),
				"confidence":   round2(d.Confidence),
			})
			continue
		}
		if d.Category == "sign" {
			signs = append(signs, map[string]any{
				"signType":   normalizeSignType(d.SignType),
				"speedLimit": round1(d.SpeedKmh),
				"laneId":     d.LaneID,
				"confidence": round2(d.Confidence),
			})
		}
	}

	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("message", "traffic frame analyzed")
	r.Set("cameraId", cameraID)
	r.Set("alerts", alerts)
	r.Set("vehicles", vehicles)
	r.Set("signs", signs)
	r.Set("stats", map[string]any{
		"vehicleCount": len(vehicles),
		"signCount":    len(signs),
		"alertCount":   len(alerts),
	})
	return r
}

func (h *ApiExtHandler) maybeBuildAlert(now time.Time, track *vehicleTrackState, key string, payload map[string]any) map[string]any {
	if track.LastAlertAt == nil {
		track.LastAlertAt = map[string]time.Time{}
	}
	if last, ok := track.LastAlertAt[key]; ok && now.Sub(last) < 2*time.Second {
		return nil
	}
	track.LastAlertAt[key] = now
	payload["code"] = key
	payload["time"] = now.UnixMilli()
	return payload
}

func appendIfRecent(alerts []map[string]any, alert map[string]any) []map[string]any {
	if alert == nil {
		return alerts
	}
	return append(alerts, alert)
}

func (h *ApiExtHandler) evictStaleScene(scene *trafficSceneState, now time.Time) {
	for laneID, s := range scene.Lanes {
		if now.Sub(s.Detected) > 25*time.Second {
			delete(scene.Lanes, laneID)
		}
	}
	for trackID, t := range scene.Tracks {
		if now.Sub(t.LastSeen) > 15*time.Second {
			delete(scene.Tracks, trackID)
		}
	}
}

func shouldApplySignToVehicle(sign *laneSignState, d trafficDetection) bool {
	if sign == nil {
		return false
	}
	// Vehicle is considered past the sign if its center moved below sign marker in image coordinates.
	if d.CenterY+0.01 < sign.DetectedY {
		return false
	}
	return true
}

func normalizeSignType(signType string) string {
	s := strings.ToLower(strings.TrimSpace(signType))
	if s == "" {
		return "unknown"
	}
	if strings.Contains(s, "stop") {
		return "stop"
	}
	if strings.Contains(s, "speed") || strings.Contains(s, "limit") || strings.Contains(s, "toc_do") || strings.Contains(s, "tocdo") {
		return "speed_limit"
	}
	if strings.Contains(s, "cam") || strings.Contains(s, "forbid") {
		return "prohibition"
	}
	if strings.Contains(s, "light") {
		return "traffic_light"
	}
	return s
}

func inferLaneID(centerXNorm float64, laneCount int) string {
	x := centerXNorm
	if x < 0 {
		x = 0
	}
	if x > 1 {
		x = 1
	}
	idx := int(math.Floor(x * float64(laneCount)))
	if idx >= laneCount {
		idx = laneCount - 1
	}
	return fmt.Sprintf("lane-%d", idx+1)
}

func parseTrafficDetections(params map[string]any) []trafficDetection {
	raw, ok := params["detections"]
	if !ok || raw == nil {
		return nil
	}
	list, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]trafficDetection, 0, len(list))
	for _, item := range list {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		category := strings.ToLower(paramStr(m, "category"))
		if category == "" {
			continue
		}
		trackID := paramStr(m, "trackId")
		vehicleType := paramStr(m, "vehicleType")
		signType := paramStr(m, "signType")
		plate := normalizePlate(paramStr(m, "plate"))
		confidence := max0(paramFloat(m, "confidence", 0.7))

		laneID := paramStr(m, "laneId")
		bbox := mapAny(m, "bbox")
		cxNorm := paramFloat(bbox, "centerXNorm", -1)
		cyNorm := paramFloat(bbox, "centerYNorm", -1)
		if laneID == "" && cxNorm >= 0 {
			laneID = inferLaneID(cxNorm, 3)
		}
		if laneID == "" {
			laneID = "lane-2"
		}
		if cyNorm < 0 {
			cyNorm = 0.5
		}

		speedKmh := paramFloat(m, "speedKmh", 0)
		if speedKmh <= 0 {
			speedKmh = paramFloat(m, "currentSpeed", 0)
		}
		if category == "sign" {
			if normalizeSignType(signType) == "speed_limit" {
				limit := paramFloat(m, "speedLimit", 0)
				if limit > 0 {
					speedKmh = limit
				} else {
					speedKmh = extractSpeedLimitFromText(signType)
				}
			}
		}

		out = append(out, trafficDetection{
			TrackID:    trackID,
			Category:   category,
			Vehicle:    defaultString(vehicleType, "unknown"),
			SignType:   signType,
			SpeedKmh:   speedKmh,
			Plate:      defaultString(plate, "N/A"),
			Confidence: confidence,
			LaneID:     laneID,
			CenterY:    cyNorm,
		})
	}
	return out
}

func mapAny(params map[string]any, key string) map[string]any {
	v, ok := params[key]
	if !ok || v == nil {
		return map[string]any{}
	}
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

func paramFloat(params map[string]any, key string, def float64) float64 {
	v, ok := params[key]
	if !ok || v == nil {
		return def
	}
	switch t := v.(type) {
	case float64:
		return t
	case float32:
		return float64(t)
	case int:
		return float64(t)
	case int64:
		return float64(t)
	case string:
		if parsed, err := strconv.ParseFloat(strings.TrimSpace(t), 64); err == nil {
			return parsed
		}
	}
	return def
}

func extractSpeedLimitFromText(input string) float64 {
	s := strings.TrimSpace(input)
	if s == "" {
		return 0
	}
	num := ""
	for _, ch := range s {
		if ch >= '0' && ch <= '9' {
			num += string(ch)
		}
	}
	if num == "" {
		return 0
	}
	v, err := strconv.ParseFloat(num, 64)
	if err != nil {
		return 0
	}
	return v
}

func normalizePlate(plate string) string {
	s := strings.ToUpper(strings.TrimSpace(plate))
	s = strings.ReplaceAll(s, " ", "")
	return s
}

func defaultString(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}

func max0(v float64) float64 {
	if v < 0 {
		return 0
	}
	return v
}

func round1(v float64) float64 {
	return math.Round(v*10) / 10
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
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
