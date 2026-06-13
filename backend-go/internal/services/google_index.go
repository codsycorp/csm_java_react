package services

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"csm_server/backend-go/internal/config"
)

const (
	indexingAPIURL         = "https://indexing.googleapis.com/v3/urlNotifications:publish"
	searchConsoleSitesURL  = "https://www.googleapis.com/webmasters/v3/sites"
	urlInspectionURL       = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"
	googleTokenURL         = "https://oauth2.googleapis.com/token"
	scopeIndexing          = "https://www.googleapis.com/auth/indexing"
	scopeWebmasters        = "https://www.googleapis.com/auth/webmasters"
	googleQuotaStateFile   = "google-index-quota-state.json"
	maxGoogleRetries       = 3
	googleRetryDelayMs     = 1000
	delayBetweenRequestsMs = 500
)

type IndexingResult struct {
	Success      bool
	Message      string
	ResponseBody string
}

type SearchConsoleResult struct {
	IsIndexed bool
	Verdict   string
	Details   map[string]any
}

type quotaState struct {
	Date        string `json:"date"`
	Used        int32  `json:"used"`
	Limit       int32  `json:"limit"`
	LastUpdated int64  `json:"lastUpdated"`
}

type cachedToken struct {
	Token     string
	ExpiresAt time.Time
}

type GoogleIndexService struct {
	cfg                config.GoogleIndexConfig
	http               *http.Client
	queue              *GoogleIndexQueueService
	serviceAccount     map[string]any
	serviceAccountOnce sync.Once
	quotaMu            sync.Mutex
	quota              map[string]quotaState
	indexingTokenMu    sync.Mutex
	indexingToken      *cachedToken
	webmastersTokenMu  sync.Mutex
	webmastersToken    *cachedToken
}

func NewGoogleIndexService(cfg config.AppConfig, httpClient *http.Client) *GoogleIndexService {
	_ = os.MkdirAll(cfg.GoogleIndex.WorkDir, 0o755)
	svc := &GoogleIndexService{
		cfg:    cfg.GoogleIndex,
		http:   httpClient,
		queue:  NewGoogleIndexQueueService(cfg.GoogleIndex.WorkDir),
		quota:  make(map[string]quotaState),
	}
	svc.loadQuotaState()
	return svc
}

func (s *GoogleIndexService) HandleOperation(ctx context.Context, params map[string]any) map[string]any {
	op := strings.ToLower(paramString(params, "operation", "submit"))
	switch op {
	case "submit":
		return s.opSubmit(ctx, params)
	case "check":
		return s.opCheck(ctx, params)
	case "check-auto":
		return s.opCheckAuto(ctx, params)
	case "quota":
		return s.ok(s.getQuotaInfo(), "Quota information retrieved")
	case "sites":
		return s.opSites(ctx)
	case "add-to-queue":
		return s.opAddToQueue(params)
	case "add-batch-to-queue":
		return s.opAddBatch(params)
	case "queue-info":
		return s.opQueueInfo()
	case "queue-items":
		return s.opQueueItems(params)
	case "process-queue":
		return s.opProcessQueue(ctx, params)
	case "remove-from-queue":
		return s.opRemoveFromQueue(params)
	case "history":
		return s.opHistory(params)
	case "recent-history":
		return s.opRecentHistory(params)
	default:
		return s.err(400, fmt.Sprintf("Invalid operation: %s", op))
	}
}

func (s *GoogleIndexService) ok(data any, message string) map[string]any {
	return map[string]any{
		"code": 200, "success": true, "data": data, "message": message,
	}
}

func (s *GoogleIndexService) err(code int, message string) map[string]any {
	return map[string]any{
		"code": code, "success": false, "message": message,
	}
}

func (s *GoogleIndexService) opSubmit(ctx context.Context, params map[string]any) map[string]any {
	urls := collectURLs(params)
	if len(urls) == 0 {
		return s.err(400, "Missing 'url' or 'urls' parameter")
	}
	if !s.checkQuotaAvailable(int32(len(urls))) {
		r := s.err(429, "Quota exceeded")
		r["data"] = s.getQuotaInfo()
		return r
	}
	action := paramString(params, "action", "publish")
	results := make([]map[string]any, 0, len(urls))
	successCount, failureCount := 0, 0
	for i, u := range urls {
		result := s.SubmitURLToGoogle(ctx, u, action)
		if result.Success {
			successCount++
		} else {
			failureCount++
		}
		results = append(results, map[string]any{
			"url": u, "success": result.Success, "message": result.Message, "response": result.ResponseBody,
		})
		if i+1 < len(urls) {
			time.Sleep(delayBetweenRequestsMs * time.Millisecond)
		}
	}
	summary := map[string]any{
		"total_submitted": len(urls),
		"success_count":   successCount,
		"failure_count":   failureCount,
		"quota":           s.getQuotaInfo(),
		"results":         results,
	}
	r := s.ok(summary, fmt.Sprintf("%d URLs submitted successfully", successCount))
	r["success"] = successCount > 0
	return r
}

func (s *GoogleIndexService) opCheck(ctx context.Context, params map[string]any) map[string]any {
	u := paramString(params, "url", "")
	if u == "" {
		return s.err(400, "Missing 'url' parameter")
	}
	result := s.CheckIndexingStatus(ctx, u)
	data := map[string]any{
		"url": u, "indexed": result.IsIndexed, "verdict": result.Verdict,
	}
	if result.Details != nil {
		data["details"] = result.Details
	}
	return s.ok(data, fmt.Sprintf("Indexing status: %s", result.Verdict))
}

func (s *GoogleIndexService) opCheckAuto(ctx context.Context, params map[string]any) map[string]any {
	u := paramString(params, "url", "")
	if u == "" {
		return s.err(400, "Missing 'url' parameter")
	}
	check := s.CheckIndexingStatus(ctx, u)
	data := map[string]any{
		"url": u,
		"checkStatus": map[string]any{
			"isIndexed": check.IsIndexed,
			"verdict":   check.Verdict,
			"details":   check.Details,
		},
		"publishResult": nil,
		"autoPublished": false,
	}
	message := fmt.Sprintf("Verdict: %s", check.Verdict)
	if strings.EqualFold(check.Verdict, "NEUTRAL") {
		publish := s.SubmitURLToGoogle(ctx, u, "publish")
		data["publishResult"] = map[string]any{
			"success": publish.Success, "message": publish.Message, "responseBody": publish.ResponseBody,
		}
		data["autoPublished"] = true
		if publish.Success {
			message = "URL chưa indexed, đã tự động gửi publish request"
		} else {
			message = fmt.Sprintf("Kiểm tra thành công nhưng publish thất bại: %s", publish.Message)
		}
	} else if strings.EqualFold(check.Verdict, "PASS") {
		message = "✅ URL đã được indexed"
	}
	data["message"] = message
	return s.ok(data, message)
}

func (s *GoogleIndexService) opSites(ctx context.Context) map[string]any {
	sites, err := s.GetSiteList(ctx)
	if err != nil {
		return s.err(500, fmt.Sprintf("Error: %v", err))
	}
	return s.ok(sites, fmt.Sprintf("Retrieved %d sites", len(sites)))
}

func (s *GoogleIndexService) opAddToQueue(params map[string]any) map[string]any {
	u := paramString(params, "url", "")
	if u == "" {
		return s.err(400, "Missing 'url' parameter")
	}
	action := paramString(params, "action", "publish")
	priority := int32(paramInt(params, "priority", 5))
	added := s.queue.AddToQueue(u, action, priority)
	msg := "Added to queue"
	if !added {
		msg = "Already in queue or recently submitted"
	}
	data := map[string]any{
		"url": u, "added": added, "message": msg, "queue_info": s.queue.GetQueueInfo(),
	}
	r := s.ok(data, msg)
	r["success"] = added
	return r
}

func (s *GoogleIndexService) opAddBatch(params map[string]any) map[string]any {
	urls := collectURLs(params)
	if len(urls) == 0 {
		return s.err(400, "Missing 'urls' parameter")
	}
	action := paramString(params, "action", "publish")
	priority := int32(paramInt(params, "priority", 5))
	results := s.queue.AddBatchToQueue(urls, action, priority)
	added := 0
	for _, ok := range results {
		if ok {
			added++
		}
	}
	data := map[string]any{
		"total": len(urls), "added": added, "skipped": len(urls) - added,
		"results": results, "queue_info": s.queue.GetQueueInfo(),
	}
	return s.ok(data, fmt.Sprintf("Added %d/%d URLs to queue", added, len(urls)))
}

func (s *GoogleIndexService) opQueueInfo() map[string]any {
	return s.ok(map[string]any{
		"queue": s.queue.GetQueueInfo(),
		"quota": s.getQuotaInfo(),
	}, "Queue info retrieved")
}

func (s *GoogleIndexService) opQueueItems(params map[string]any) map[string]any {
	page := paramInt(params, "page", 0)
	if page < 0 {
		page = 0
	}
	pageSize := paramInt(params, "pageSize", 20)
	if pageSize < 1 {
		pageSize = 20
	}
	items := s.queue.GetQueueItems(page, pageSize)
	info := s.queue.GetQueueInfo()
	return s.ok(map[string]any{
		"items": items, "page": page, "pageSize": pageSize, "totalInQueue": info["total"],
	}, fmt.Sprintf("Retrieved %d queue items", len(items)))
}

func (s *GoogleIndexService) opProcessQueue(ctx context.Context, params map[string]any) map[string]any {
	batchSize := paramInt(params, "batchSize", 10)
	if batchSize < 1 {
		batchSize = 10
	}
	summary := s.ProcessBatchFromQueue(ctx, batchSize)
	return s.ok(summary, "Queue processing completed")
}

func (s *GoogleIndexService) opRemoveFromQueue(params map[string]any) map[string]any {
	u := paramString(params, "url", "")
	if u == "" {
		return s.err(400, "Missing 'url' parameter")
	}
	removed := s.queue.RemoveFromQueue(u)
	msg := "Removed from queue"
	if !removed {
		msg = "URL not found in queue"
	}
	r := s.ok(map[string]any{"url": u, "removed": removed}, msg)
	r["success"] = removed
	return r
}

func (s *GoogleIndexService) opHistory(params map[string]any) map[string]any {
	u := paramString(params, "url", "")
	if u == "" {
		return s.err(400, "Missing 'url' parameter")
	}
	history := s.queue.GetHistory(u)
	return s.ok(map[string]any{
		"url": u, "history": history, "count": len(history),
	}, fmt.Sprintf("Retrieved %d history entries", len(history)))
}

func (s *GoogleIndexService) opRecentHistory(params map[string]any) map[string]any {
	limit := paramInt(params, "limit", 50)
	if limit < 1 {
		limit = 50
	}
	history := s.queue.GetRecentHistory(limit)
	return s.ok(map[string]any{
		"history": history, "count": len(history),
	}, fmt.Sprintf("Retrieved %d recent history entries", len(history)))
}

func (s *GoogleIndexService) SubmitURLToGoogle(ctx context.Context, targetURL, action string) IndexingResult {
	if !s.reserveQuota(1) {
		return IndexingResult{Success: false, Message: "Quota exceeded"}
	}
	for attempt := 0; attempt < maxGoogleRetries; attempt++ {
		token, err := s.getAccessToken(ctx, scopeIndexing)
		if err != nil {
			return IndexingResult{Success: false, Message: err.Error()}
		}
		body, err := s.sendIndexingRequest(ctx, targetURL, action, token)
		if err == nil {
			return IndexingResult{Success: true, Message: "Submitted successfully", ResponseBody: body}
		}
		if attempt+1 < maxGoogleRetries {
			delay := time.Duration(googleRetryDelayMs*(1<<attempt)) * time.Millisecond
			time.Sleep(delay)
		} else {
			return IndexingResult{Success: false, Message: err.Error(), ResponseBody: err.Error()}
		}
	}
	return IndexingResult{Success: false, Message: "Failed after retries"}
}

func (s *GoogleIndexService) ProcessBatchFromQueue(ctx context.Context, batchSize int) map[string]any {
	available := s.getRemainingDailyQuota()
	if available <= 0 {
		return map[string]any{"success": false, "message": "No quota remaining", "processed": 0}
	}
	effective := batchSize
	if effective > int(available) {
		effective = int(available)
	}
	batch := s.queue.GetNextBatch(effective)
	if len(batch) == 0 {
		return map[string]any{"success": true, "message": "Queue is empty", "processed": 0}
	}
	successCount, failCount := 0, 0
	results := make([]map[string]any, 0, len(batch))
	for _, item := range batch {
		s.queue.MarkAsProcessing(item.URL)
		result := s.SubmitURLToGoogle(ctx, item.URL, item.Action)
		s.queue.MarkAsCompleted(item.URL, result.Success, result.Message)
		if result.Success {
			successCount++
		} else {
			failCount++
		}
		results = append(results, map[string]any{
			"url": item.URL, "success": result.Success, "message": result.Message,
		})
		time.Sleep(delayBetweenRequestsMs * time.Millisecond)
	}
	return map[string]any{
		"success": true, "processed": len(batch),
		"success_count": successCount, "fail_count": failCount,
		"remaining_quota": s.getRemainingDailyQuota(),
		"queue_info":      s.queue.GetQueueInfo(),
		"results":         results,
	}
}

func (s *GoogleIndexService) CheckIndexingStatus(ctx context.Context, targetURL string) SearchConsoleResult {
	token, err := s.getAccessToken(ctx, scopeWebmasters)
	if err != nil {
		return SearchConsoleResult{IsIndexed: false, Verdict: "EXCEPTION"}
	}
	body := map[string]any{
		"inspectionUrl": targetURL,
		"siteUrl":       deriveSiteURL(targetURL),
	}
	payload, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, urlInspectionURL, strings.NewReader(string(payload)))
	if err != nil {
		return SearchConsoleResult{IsIndexed: false, Verdict: "ERROR"}
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := s.http.Do(req)
	if err != nil {
		return SearchConsoleResult{IsIndexed: false, Verdict: "ERROR"}
	}
	defer resp.Body.Close()
	text, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return SearchConsoleResult{IsIndexed: false, Verdict: "ERROR"}
	}
	var parsed map[string]any
	if json.Unmarshal(text, &parsed) != nil {
		return SearchConsoleResult{IsIndexed: false, Verdict: "ERROR"}
	}
	inspection, _ := parsed["inspectionResult"].(map[string]any)
	indexStatus, _ := inspection["indexStatusResult"].(map[string]any)
	verdict := "UNKNOWN"
	if v, ok := indexStatus["verdict"].(string); ok {
		verdict = v
	}
	return SearchConsoleResult{
		IsIndexed: strings.EqualFold(verdict, "PASS"),
		Verdict:   verdict,
		Details:   indexStatus,
	}
}

func (s *GoogleIndexService) GetSiteList(ctx context.Context) ([]any, error) {
	token, err := s.getAccessToken(ctx, scopeWebmasters)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, searchConsoleSitesURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	text, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var parsed map[string]any
	if json.Unmarshal(text, &parsed) != nil {
		return nil, fmt.Errorf("invalid response")
	}
	if entries, ok := parsed["siteEntry"].([]any); ok {
		return entries, nil
	}
	return []any{}, nil
}

func (s *GoogleIndexService) getQuotaInfo() map[string]any {
	state := s.getTodayQuotaState()
	remaining := s.getRemainingDailyQuota()
	pct := 0
	if state.Limit > 0 {
		pct = int(state.Used * 100 / state.Limit)
	}
	return map[string]any{
		"daily_limit": state.Limit, "used_today": state.Used,
		"remaining": remaining, "last_reset_date": state.Date,
		"usage_percentage": pct,
	}
}

func (s *GoogleIndexService) checkQuotaAvailable(requested int32) bool {
	return s.getRemainingDailyQuota() >= requested
}

func (s *GoogleIndexService) getRemainingDailyQuota() int32 {
	state := s.getTodayQuotaState()
	remaining := state.Limit - state.Used
	if remaining < 0 {
		return 0
	}
	return remaining
}

func (s *GoogleIndexService) reserveQuota(count int32) bool {
	today := todayDateString()
	s.quotaMu.Lock()
	defer s.quotaMu.Unlock()
	s.checkAndResetDailyQuotaLocked()
	state, ok := s.quota[today]
	if !ok {
		state = quotaState{Date: today, Used: 0, Limit: s.cfg.DailyLimit, LastUpdated: nowMs()}
	}
	if state.Used+count > state.Limit {
		return false
	}
	state.Used += count
	state.LastUpdated = nowMs()
	s.quota[today] = state
	s.saveQuotaStateLocked()
	return true
}

func (s *GoogleIndexService) getTodayQuotaState() quotaState {
	s.quotaMu.Lock()
	defer s.quotaMu.Unlock()
	s.checkAndResetDailyQuotaLocked()
	today := todayDateString()
	if state, ok := s.quota[today]; ok {
		return state
	}
	return quotaState{Date: today, Used: 0, Limit: s.cfg.DailyLimit, LastUpdated: nowMs()}
}

func (s *GoogleIndexService) checkAndResetDailyQuotaLocked() {
	today := todayDateString()
	if _, ok := s.quota[today]; ok {
		return
	}
	for date := range s.quota {
		if date < today {
			delete(s.quota, date)
		}
	}
	s.quota[today] = quotaState{
		Date: today, Used: 0, Limit: s.cfg.DailyLimit, LastUpdated: nowMs(),
	}
	s.saveQuotaStateLocked()
}

func (s *GoogleIndexService) sendIndexingRequest(ctx context.Context, targetURL, action, accessToken string) (string, error) {
	notifType := "URL_UPDATED"
	if strings.EqualFold(action, "remove") {
		notifType = "URL_REMOVED"
	}
	body := map[string]any{"url": targetURL, "type": notifType}
	payload, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, indexingAPIURL, strings.NewReader(string(payload)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := s.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	text, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return string(text), nil
	}
	if resp.StatusCode == 429 {
		s.syncQuotaFromError(string(text))
	}
	return "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, text)
}

func (s *GoogleIndexService) syncQuotaFromError(errorResponse string) {
	var parsed map[string]any
	if json.Unmarshal([]byte(errorResponse), &parsed) != nil {
		return
	}
	errObj, _ := parsed["error"].(map[string]any)
	code, _ := errObj["code"].(float64)
	if int(code) != 429 {
		return
	}
	today := todayDateString()
	s.quotaMu.Lock()
	defer s.quotaMu.Unlock()
	if state, ok := s.quota[today]; ok {
		state.Used = state.Limit
		state.LastUpdated = nowMs()
		s.quota[today] = state
		s.saveQuotaStateLocked()
	}
}

func (s *GoogleIndexService) getAccessToken(ctx context.Context, scope string) (string, error) {
	if scope == scopeIndexing {
		s.indexingTokenMu.Lock()
		if s.indexingToken != nil && time.Until(s.indexingToken.ExpiresAt) > 60*time.Second {
			token := s.indexingToken.Token
			s.indexingTokenMu.Unlock()
			return token, nil
		}
		s.indexingTokenMu.Unlock()
	} else {
		s.webmastersTokenMu.Lock()
		if s.webmastersToken != nil && time.Until(s.webmastersToken.ExpiresAt) > 60*time.Second {
			token := s.webmastersToken.Token
			s.webmastersTokenMu.Unlock()
			return token, nil
		}
		s.webmastersTokenMu.Unlock()
	}

	sa := s.loadServiceAccount()
	clientEmail, _ := sa["client_email"].(string)
	privateKeyPEM, _ := sa["private_key"].(string)
	if clientEmail == "" || privateKeyPEM == "" {
		return "", fmt.Errorf("Missing client_email or private_key in service account")
	}
	privateKey, err := parseRSAPrivateKey(privateKeyPEM)
	if err != nil {
		return "", err
	}
	now := time.Now().Unix()
	claims := jwt.MapClaims{
		"iss": clientEmail, "sub": clientEmail,
		"aud": googleTokenURL, "iat": now, "exp": now + 3600, "scope": scope,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	assertion, err := token.SignedString(privateKey)
	if err != nil {
		return "", err
	}
	form := url.Values{
		"grant_type": {"urn:ietf:params:oauth:grant-type:jwt-bearer"},
		"assertion":  {assertion},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, googleTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	text, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("Token exchange failed HTTP %d: %s", resp.StatusCode, text)
	}
	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if json.Unmarshal(text, &tokenResp) != nil || tokenResp.AccessToken == "" {
		return "", fmt.Errorf("invalid token response")
	}
	expiresIn := tokenResp.ExpiresIn
	if expiresIn < 300 {
		expiresIn = 300
	}
	cached := &cachedToken{
		Token:     tokenResp.AccessToken,
		ExpiresAt: time.Now().Add(time.Duration(expiresIn) * time.Second),
	}
	if scope == scopeIndexing {
		s.indexingTokenMu.Lock()
		s.indexingToken = cached
		s.indexingTokenMu.Unlock()
	} else {
		s.webmastersTokenMu.Lock()
		s.webmastersToken = cached
		s.webmastersTokenMu.Unlock()
	}
	return tokenResp.AccessToken, nil
}

func (s *GoogleIndexService) loadServiceAccount() map[string]any {
	s.serviceAccountOnce.Do(func() {
		data, err := os.ReadFile(s.cfg.ServiceAccountPath)
		if err != nil {
			s.serviceAccount = map[string]any{}
			return
		}
		var sa map[string]any
		if json.Unmarshal(data, &sa) != nil {
			s.serviceAccount = map[string]any{}
			return
		}
		s.serviceAccount = sa
	})
	if s.serviceAccount == nil {
		return map[string]any{}
	}
	return s.serviceAccount
}

func (s *GoogleIndexService) loadQuotaState() {
	path := s.cfg.WorkDir + "/" + googleQuotaStateFile
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var state quotaState
	if json.Unmarshal(data, &state) != nil {
		return
	}
	if state.Date == todayDateString() {
		s.quota[state.Date] = state
	}
}

func (s *GoogleIndexService) saveQuotaStateLocked() {
	today := todayDateString()
	state, ok := s.quota[today]
	if !ok {
		return
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(s.cfg.WorkDir+"/"+googleQuotaStateFile, data, 0o644)
}

func collectURLs(params map[string]any) []string {
	if u := paramString(params, "url", ""); u != "" {
		return []string{u}
	}
	v, ok := params["urls"]
	if !ok || v == nil {
		return nil
	}
	switch t := v.(type) {
	case []any:
		out := make([]string, 0, len(t))
		for _, item := range t {
			s := strings.TrimSpace(fmt.Sprint(item))
			if s != "" {
				out = append(out, s)
			}
		}
		return out
	case []string:
		out := make([]string, 0, len(t))
		for _, s := range t {
			s = strings.TrimSpace(s)
			if s != "" {
				out = append(out, s)
			}
		}
		return out
	case string:
		s := strings.TrimSpace(t)
		if s != "" {
			return []string{s}
		}
	}
	return nil
}

func deriveSiteURL(targetURL string) string {
	u, err := url.Parse(targetURL)
	if err != nil || u.Host == "" {
		return "https://www.phanmemmottrieu.net/"
	}
	return fmt.Sprintf("%s://%s/", u.Scheme, u.Host)
}

func todayDateString() string {
	return time.Now().Format("2006-01-02")
}

func paramString(params map[string]any, key, def string) string {
	v, ok := params[key]
	if !ok || v == nil {
		return def
	}
	s := strings.TrimSpace(fmt.Sprint(v))
	if s == "" {
		return def
	}
	return s
}

func paramInt(params map[string]any, key string, def int) int {
	v, ok := params[key]
	if !ok || v == nil {
		return def
	}
	switch t := v.(type) {
	case int:
		return t
	case int64:
		return int(t)
	case float64:
		return int(t)
	case string:
		var n int
		if _, err := fmt.Sscan(t, &n); err == nil {
			return n
		}
	}
	return def
}

func parseRSAPrivateKey(pemKey string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemKey))
	if block == nil {
		return nil, fmt.Errorf("invalid PEM block")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		key, err = x509.ParsePKCS1PrivateKey(block.Bytes)
		if err != nil {
			return nil, err
		}
	}
	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("not an RSA private key")
	}
	return rsaKey, nil
}
