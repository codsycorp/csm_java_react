package services

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
)

type webLearningState struct {
	FetchedAtMs map[string]int64 `json:"fetchedAtMs"`
}

var (
	webLearningLocks            sync.Map // appID -> *sync.Mutex
	tagStripRE                  = regexp.MustCompile(`(?s)<[^>]+>`)
	scriptStripRE               = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	styleStripRE                = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	spaceCollapseRE             = regexp.MustCompile(`\s+`)
	defaultWebLearningAllowlist = []string{
		"https://go.dev/doc/",
		"https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference",
		"https://vuejs.org/guide/introduction.html",
	}
)

func webLearningLock(appID string) *sync.Mutex {
	v, _ := webLearningLocks.LoadOrStore(safeAppIDForLearning(appID), &sync.Mutex{})
	return v.(*sync.Mutex)
}

func webLearningEnabled() bool {
	v := strings.TrimSpace(os.Getenv("AI_LOCAL_WEB_LEARNING_ENABLED"))
	if v == "" {
		return true
	}
	switch strings.ToLower(v) {
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

func webLearningAllowlist() []string {
	raw := strings.TrimSpace(os.Getenv("AI_LOCAL_WEB_LEARNING_ALLOWLIST"))
	if raw == "" {
		out := make([]string, 0, len(defaultWebLearningAllowlist))
		out = append(out, defaultWebLearningAllowlist...)
		return out
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]struct{}{}
	for _, p := range parts {
		u := strings.TrimSpace(p)
		if u == "" {
			continue
		}
		if _, err := url.ParseRequestURI(u); err != nil {
			continue
		}
		if _, ok := seen[u]; ok {
			continue
		}
		seen[u] = struct{}{}
		out = append(out, u)
	}
	return out
}

func webLearningMaxSources() int {
	if v := strings.TrimSpace(os.Getenv("AI_LOCAL_WEB_LEARNING_MAX_SOURCES")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 1 && n <= 20 {
			return n
		}
	}
	return 3
}

func webLearningMinRefreshMs() int64 {
	if v := strings.TrimSpace(os.Getenv("AI_LOCAL_WEB_LEARNING_MIN_REFRESH_HOURS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 1 && n <= 720 {
			return int64(n) * int64(time.Hour/time.Millisecond)
		}
	}
	return int64(12 * time.Hour / time.Millisecond)
}

func webLearningStatePath(cfg config.AppConfig, appID string) string {
	return filepath.Join(cfg.AI.ContextDir, "ai_web_learning_state_"+safeAppIDForLearning(appID)+".json")
}

func loadWebLearningState(cfg config.AppConfig, appID string) webLearningState {
	path := webLearningStatePath(cfg, appID)
	b, err := os.ReadFile(path)
	if err != nil {
		return webLearningState{FetchedAtMs: map[string]int64{}}
	}
	var st webLearningState
	if json.Unmarshal(b, &st) != nil || st.FetchedAtMs == nil {
		return webLearningState{FetchedAtMs: map[string]int64{}}
	}
	return st
}

func saveWebLearningState(cfg config.AppConfig, appID string, st webLearningState) {
	if st.FetchedAtMs == nil {
		st.FetchedAtMs = map[string]int64{}
	}
	path := webLearningStatePath(cfg, appID)
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	b, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(path, b, 0o644)
}

func rankAllowlistBySeed(urls []string, seed string) []string {
	seed = strings.ToLower(strings.TrimSpace(seed))
	if seed == "" || len(urls) <= 1 {
		return urls
	}
	tokens := tokenizeForLearning(seed)
	type item struct {
		url   string
		score int
	}
	items := make([]item, 0, len(urls))
	for _, u := range urls {
		s := 0
		lu := strings.ToLower(u)
		for _, t := range tokens {
			if len(t) >= 3 && strings.Contains(lu, t) {
				s++
			}
		}
		items = append(items, item{url: u, score: s})
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].score > items[j].score })
	out := make([]string, 0, len(items))
	for _, it := range items {
		out = append(out, it.url)
	}
	return out
}

func hashURLToken(u string) string {
	h := sha1.Sum([]byte(u))
	return hex.EncodeToString(h[:])[:10]
}

func extractWebKnowledgeText(raw string, contentType string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if strings.Contains(ct, "html") || strings.Contains(raw, "<html") {
		raw = scriptStripRE.ReplaceAllString(raw, " ")
		raw = styleStripRE.ReplaceAllString(raw, " ")
		raw = tagStripRE.ReplaceAllString(raw, " ")
		raw = html.UnescapeString(raw)
	}
	raw = spaceCollapseRE.ReplaceAllString(raw, " ")
	return strings.TrimSpace(raw)
}

func scopeMaskForWebLearning(contextType string) int {
	ctx := strings.ToLower(strings.TrimSpace(contextType))
	switch ctx {
	case "menu_json":
		return scopeMenu | scopeBusiness
	case "code", "frontend_code":
		return scopeCode | scopeBusiness
	default:
		return scopeBusiness
	}
}

// MaybeAutoLearnFromInternet runs background allowlisted web ingestion into tenant RAG.
func MaybeAutoLearnFromInternet(cfg config.AppConfig, rm *data.RecordManager, appID, contextType, seed string) {
	if !webLearningEnabled() || rm == nil {
		return
	}
	allow := webLearningAllowlist()
	if len(allow) == 0 {
		return
	}
	appID = strings.TrimSpace(appID)
	if appID == "" {
		appID = "csm"
	}
	seed = truncateStr(strings.TrimSpace(seed), 2000)
	go autoLearnFromInternet(cfg, rm, appID, contextType, seed, allow)
}

func autoLearnFromInternet(cfg config.AppConfig, rm *data.RecordManager, appID, contextType, seed string, allowlist []string) {
	mu := webLearningLock(appID)
	mu.Lock()
	defer mu.Unlock()

	state := loadWebLearningState(cfg, appID)
	now := time.Now().UnixMilli()
	minRefresh := webLearningMinRefreshMs()
	maxSources := webLearningMaxSources()

	urls := rankAllowlistBySeed(allowlist, seed)
	fetched := 0
	client := &http.Client{Timeout: 12 * time.Second}
	for _, rawURL := range urls {
		if fetched >= maxSources {
			break
		}
		if last := state.FetchedAtMs[rawURL]; last > 0 && now-last < minRefresh {
			continue
		}

		req, err := http.NewRequest(http.MethodGet, rawURL, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "CSM-AI-Local-Learner/1.0")
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, 900*1024))
		_ = resp.Body.Close()
		if err != nil || resp.StatusCode < 200 || resp.StatusCode >= 300 {
			continue
		}
		text := extractWebKnowledgeText(string(body), resp.Header.Get("Content-Type"))
		if text == "" {
			continue
		}
		text = truncateStr(text, 18_000)
		if text == "" {
			continue
		}

		u, err := url.Parse(rawURL)
		host := "external"
		if err == nil && strings.TrimSpace(u.Hostname()) != "" {
			host = strings.ToLower(strings.TrimSpace(u.Hostname()))
		}
		sourceName := "tenant_web_" + host + "_" + hashURLToken(rawURL)
		payload := "# Web Knowledge\n- URL: " + rawURL + "\n- RetrievedAt: " + time.Now().Format(time.RFC3339) + "\n\n" + text
		indexChunks(rm, appID, sourceName, payload, scopeMaskForWebLearning(contextType), []string{"acl:tenant", "source:web", "host:" + host})
		state.FetchedAtMs[rawURL] = now
		fetched++
	}
	saveWebLearningState(cfg, appID, state)
}
