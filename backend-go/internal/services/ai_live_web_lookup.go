package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type LiveWebDecision struct {
	ShouldRun   bool
	QueryType   string
	Confidence  int
	Reason      string
	SearchQuery string
}

type LiveWebLookupResult struct {
	Enabled     bool
	Provider    string
	Query       string
	QueryType   string
	Reason      string
	Confidence  int
	Summary     string
	Block       string
	RetrievedAt string
	Error       string
}

type wttrResponse struct {
	CurrentCondition []struct {
		TempC       string `json:"temp_C"`
		FeelsLikeC  string `json:"FeelsLikeC"`
		Humidity    string `json:"humidity"`
		WeatherDesc []struct {
			Value string `json:"value"`
		} `json:"weatherDesc"`
	} `json:"current_condition"`
	Weather []struct {
		MaxTempC string `json:"maxtempC"`
		MinTempC string `json:"mintempC"`
		Hourly   []struct {
			ChanceOfRain string `json:"chanceofrain"`
			WeatherDesc  []struct {
				Value string `json:"value"`
			} `json:"weatherDesc"`
		} `json:"hourly"`
	} `json:"weather"`
}

type duckDuckGoResponse struct {
	AbstractText string `json:"AbstractText"`
	Heading      string `json:"Heading"`
	Answer       string `json:"Answer"`
	Results      []struct {
		Text string `json:"Text"`
	} `json:"Results"`
	RelatedTopics []struct {
		Text string `json:"Text"`
	} `json:"RelatedTopics"`
}

func ShouldRunLiveWebLookup(req *CodeStreamRequest, responseMode string, intent LocalIntentClassification) bool {
	return InferLiveWebDecision(req, responseMode, intent).ShouldRun
}

func InferLiveWebDecisionAdaptive(ctx context.Context, llama *LlamaService, req *CodeStreamRequest, responseMode string, intent LocalIntentClassification) LiveWebDecision {
	base := InferLiveWebDecision(req, responseMode, intent)
	if shouldSkipLiveWebArbitration(base) {
		return base
	}
	if llama == nil || !llama.IsAvailable() || req == nil {
		return base
	}
	if ctx == nil {
		ctx = context.Background()
	}
	prompt := buildLiveWebArbitrationPrompt(req, intent, base)
	raw, err := llama.CompleteWithTokens(ctx, prompt, 128)
	if err != nil {
		return base
	}
	llmDecision, ok := parseLiveWebDecisionJSON(raw)
	if !ok {
		return base
	}
	return mergeLiveWebDecision(base, llmDecision, req)
}

func shouldSkipLiveWebArbitration(base LiveWebDecision) bool {
	if base.Reason == "mode_not_analyze" || base.Reason == "edit_or_code_like" || base.Reason == "empty_message" {
		return true
	}
	if base.ShouldRun && base.Confidence >= 80 {
		return true
	}
	if !base.ShouldRun && base.Confidence <= 20 {
		return true
	}
	return false
}

func buildLiveWebArbitrationPrompt(req *CodeStreamRequest, intent LocalIntentClassification, base LiveWebDecision) string {
	msg := truncateStr(strings.TrimSpace(req.Message), 600)
	return "You are a strict intent arbiter for a local AI assistant.\n" +
		"Task: decide whether user request needs internet lookup.\n" +
		"Return JSON only: {\"needInternet\":true|false,\"queryType\":\"weather|general_facts|none\",\"confidence\":0..100,\"reason\":\"short_reason\",\"searchQuery\":\"normalized query\"}.\n" +
		"Rules:\n" +
		"- If user asks for latest/current/realtime/outside knowledge, prefer needInternet=true.\n" +
		"- If user asks to modify code or internal editor task, needInternet=false.\n" +
		"- Respect multilingual user input.\n" +
		"Context:\n" +
		"message=" + msg + "\n" +
		"intentType=" + strings.TrimSpace(intent.Type) + ", action=" + strings.TrimSpace(intent.Action) + ", nextStep=" + strings.TrimSpace(intent.NextStep) + "\n" +
		"baseDecision={shouldRun:" + fmt.Sprintf("%t", base.ShouldRun) + ", queryType:" + base.QueryType + ", confidence:" + fmt.Sprintf("%d", base.Confidence) + ", reason:" + base.Reason + "}.\n"
}

type liveWebDecisionJSON struct {
	NeedInternet bool   `json:"needInternet"`
	QueryType    string `json:"queryType"`
	Confidence   int    `json:"confidence"`
	Reason       string `json:"reason"`
	SearchQuery  string `json:"searchQuery"`
}

func parseLiveWebDecisionJSON(raw string) (LiveWebDecision, bool) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return LiveWebDecision{}, false
	}
	if strings.HasPrefix(text, "```") {
		text = strings.TrimPrefix(text, "```json")
		text = strings.TrimPrefix(text, "```")
		text = strings.TrimSuffix(text, "```")
		text = strings.TrimSpace(text)
	}
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start < 0 || end <= start {
		return LiveWebDecision{}, false
	}
	jsonPart := text[start : end+1]
	var p liveWebDecisionJSON
	if err := json.Unmarshal([]byte(jsonPart), &p); err != nil {
		return LiveWebDecision{}, false
	}
	qType := strings.ToLower(strings.TrimSpace(p.QueryType))
	if qType != "weather" && qType != "general_facts" && qType != "none" {
		qType = "general_facts"
	}
	conf := p.Confidence
	if conf < 0 {
		conf = 0
	}
	if conf > 100 {
		conf = 100
	}
	return LiveWebDecision{
		ShouldRun:   p.NeedInternet,
		QueryType:   qType,
		Confidence:  conf,
		Reason:      strings.TrimSpace(p.Reason),
		SearchQuery: strings.TrimSpace(p.SearchQuery),
	}, true
}

func mergeLiveWebDecision(base, llm LiveWebDecision, req *CodeStreamRequest) LiveWebDecision {
	out := base
	if llm.Confidence >= 65 {
		out.ShouldRun = llm.ShouldRun
		if llm.QueryType != "" {
			out.QueryType = llm.QueryType
		}
		if llm.Reason != "" {
			out.Reason = "llm_arbitration:" + llm.Reason
		}
		out.Confidence = llm.Confidence
		if llm.SearchQuery != "" {
			out.SearchQuery = llm.SearchQuery
		}
	}
	if out.SearchQuery == "" && req != nil {
		out.SearchQuery = strings.TrimSpace(req.Message)
	}
	return out
}

func InferLiveWebDecision(req *CodeStreamRequest, responseMode string, intent LocalIntentClassification) LiveWebDecision {
	decision := LiveWebDecision{ShouldRun: false, QueryType: "none", Confidence: 0, Reason: "not_needed", SearchQuery: ""}
	if req == nil || normalizeResponseMode(responseMode) != "analyze" {
		decision.Reason = "mode_not_analyze"
		return decision
	}
	msgRaw := strings.TrimSpace(req.Message)
	msg := strings.ToLower(msgRaw)
	if msg == "" {
		decision.Reason = "empty_message"
		return decision
	}
	if messageHasCodeLikeSyntax(msg) || hasExplicitEditDirective(msg) {
		decision.Reason = "edit_or_code_like"
		return decision
	}

	score := 0.0
	if strings.EqualFold(intent.Action, "ask") || strings.EqualFold(intent.Action, "search") {
		score += 0.35
	}
	if strings.EqualFold(intent.NextStep, "answer_direct") {
		score += 0.2
	}
	if shouldFallbackToAnalyzeQuestion(msg) {
		score += 0.15
	}

	signals := getLiveWebSignalMatrix()
	hasInternetHint := containsAny(msg, signals.InternetHints...)
	hasRealtimeCue := containsAny(msg, append(signals.InternetHints, signals.RealtimeCues...)...)
	if hasRealtimeCue {
		score += 0.35
	}

	hasWeatherSignal := containsAny(msg, signals.WeatherSignals...)
	hasGeneralFactsSignal := containsAny(msg, signals.GeneralFactSignals...)
	if hasWeatherSignal {
		score += 0.45
		decision.QueryType = "weather"
	}
	if hasGeneralFactsSignal {
		score += 0.3
		if decision.QueryType == "none" {
			decision.QueryType = "general_facts"
		}
	}

	if !hasInternetHint && !hasWeatherSignal && !hasGeneralFactsSignal {
		decision.Reason = "no_external_knowledge_signal"
		decision.QueryType = "none"
		decision.Confidence = 0
		decision.SearchQuery = msgRaw
		return decision
	}

	if strings.Contains(msg, "?") || strings.Contains(msg, "？") {
		score += 0.1
	}

	conf := int(score * 100)
	if conf > 100 {
		conf = 100
	}
	if decision.QueryType == "none" {
		decision.QueryType = "general_facts"
	}
	decision.Confidence = conf
	decision.SearchQuery = msgRaw
	if conf >= 55 {
		decision.ShouldRun = true
		decision.Reason = "internet_context_needed"
	} else {
		decision.ShouldRun = false
		decision.Reason = "low_confidence"
	}
	return decision
}

func RunLiveWebLookup(req *CodeStreamRequest, decision LiveWebDecision) LiveWebLookupResult {
	if decision.QueryType == "weather" {
		return runWeatherLookup(req, decision)
	}
	return runGeneralWebLookup(req, decision)
}

func runWeatherLookup(req *CodeStreamRequest, decision LiveWebDecision) LiveWebLookupResult {
	res := LiveWebLookupResult{Enabled: true, Provider: "wttr.in", Query: strings.TrimSpace(req.Message), QueryType: decision.QueryType, Reason: decision.Reason, Confidence: decision.Confidence, RetrievedAt: time.Now().Format(time.RFC3339)}
	city := "saigon"
	msg := strings.ToLower(strings.TrimSpace(req.Message))
	if containsAny(msg, "hà nội", "ha noi") {
		city = "hanoi"
	} else if containsAny(msg, "đà nẵng", "da nang") {
		city = "danang"
	}
	url := "https://wttr.in/" + city + "?format=j1"
	client := &http.Client{Timeout: 10 * time.Second}
	httpReq, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		res.Error = err.Error()
		res.Summary = "Không khởi tạo được truy vấn internet thời tiết."
		res.Block = buildLiveWebBlock(res)
		return res
	}
	httpReq.Header.Set("User-Agent", "CSM-AI-Local-LiveWeb/1.0")
	r, err := client.Do(httpReq)
	if err != nil {
		res.Error = err.Error()
		res.Summary = "Không truy cập được nguồn internet thời tiết tại thời điểm này."
		res.Block = buildLiveWebBlock(res)
		return res
	}
	defer r.Body.Close()
	if r.StatusCode < 200 || r.StatusCode >= 300 {
		res.Error = fmt.Sprintf("http_status_%d", r.StatusCode)
		res.Summary = "Nguồn thời tiết internet trả về lỗi, chưa thể xác nhận dữ liệu."
		res.Block = buildLiveWebBlock(res)
		return res
	}
	payload, err := io.ReadAll(io.LimitReader(r.Body, 350*1024))
	if err != nil {
		res.Error = err.Error()
		res.Summary = "Đọc dữ liệu thời tiết từ internet thất bại."
		res.Block = buildLiveWebBlock(res)
		return res
	}
	var parsed wttrResponse
	if err := json.Unmarshal(payload, &parsed); err != nil {
		res.Error = err.Error()
		res.Summary = "Dữ liệu internet thời tiết không đúng định dạng mong đợi."
		res.Block = buildLiveWebBlock(res)
		return res
	}
	if len(parsed.CurrentCondition) == 0 {
		res.Summary = "Nguồn internet thời tiết không trả về current condition."
		res.Block = buildLiveWebBlock(res)
		return res
	}
	cc := parsed.CurrentCondition[0]
	desc := ""
	if len(cc.WeatherDesc) > 0 {
		desc = strings.TrimSpace(cc.WeatherDesc[0].Value)
	}
	maxT, minT := "", ""
	tomorrowMax, tomorrowMin := "", ""
	tomorrowRain := ""
	tomorrowDesc := ""
	if len(parsed.Weather) > 0 {
		maxT = strings.TrimSpace(parsed.Weather[0].MaxTempC)
		minT = strings.TrimSpace(parsed.Weather[0].MinTempC)
	}
	if len(parsed.Weather) > 1 {
		tomorrowMax = strings.TrimSpace(parsed.Weather[1].MaxTempC)
		tomorrowMin = strings.TrimSpace(parsed.Weather[1].MinTempC)
		for _, h := range parsed.Weather[1].Hourly {
			if strings.TrimSpace(h.ChanceOfRain) != "" {
				tomorrowRain = strings.TrimSpace(h.ChanceOfRain)
				break
			}
		}
		if len(parsed.Weather[1].Hourly) > 0 && len(parsed.Weather[1].Hourly[0].WeatherDesc) > 0 {
			tomorrowDesc = strings.TrimSpace(parsed.Weather[1].Hourly[0].WeatherDesc[0].Value)
		}
	}
	res.Summary = fmt.Sprintf("%s hiện tại %s°C, cảm giác %s°C, độ ẩm %s%%, mô tả %s, cao/thấp hôm nay %s/%s°C.", strings.Title(city), strings.TrimSpace(cc.TempC), strings.TrimSpace(cc.FeelsLikeC), strings.TrimSpace(cc.Humidity), firstNonEmpty(desc, "N/A"), firstNonEmpty(maxT, "?"), firstNonEmpty(minT, "?"))
	if tomorrowMax != "" || tomorrowMin != "" || tomorrowRain != "" {
		res.Summary += fmt.Sprintf(" Dự báo ngày mai: cao/thấp %s/%s°C, khả năng mưa %s%%, mô tả %s.", firstNonEmpty(tomorrowMax, "?"), firstNonEmpty(tomorrowMin, "?"), firstNonEmpty(tomorrowRain, "?"), firstNonEmpty(tomorrowDesc, "N/A"))
	}
	res.Block = buildLiveWebBlock(res)
	return res
}

func runGeneralWebLookup(req *CodeStreamRequest, decision LiveWebDecision) LiveWebLookupResult {
	res := LiveWebLookupResult{Enabled: true, Provider: "duckduckgo_instant", Query: firstNonEmpty(strings.TrimSpace(decision.SearchQuery), strings.TrimSpace(req.Message)), QueryType: decision.QueryType, Reason: decision.Reason, Confidence: decision.Confidence, RetrievedAt: time.Now().Format(time.RFC3339)}
	q := res.Query
	endpoint := "https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=" + url.QueryEscape(q)
	client := &http.Client{Timeout: 10 * time.Second}
	httpReq, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		res.Error = err.Error()
		res.Summary = "Không khởi tạo được truy vấn internet tổng quát."
		res.Block = buildLiveWebBlock(res)
		return res
	}
	httpReq.Header.Set("User-Agent", "CSM-AI-Local-LiveWeb/1.0")
	r, err := client.Do(httpReq)
	if err != nil {
		res.Error = err.Error()
		res.Summary = "Không truy cập được nguồn internet tổng quát tại thời điểm này."
		res.Block = buildLiveWebBlock(res)
		return res
	}
	defer r.Body.Close()
	if r.StatusCode < 200 || r.StatusCode >= 300 {
		res.Error = fmt.Sprintf("http_status_%d", r.StatusCode)
		res.Summary = "Nguồn internet tổng quát trả về lỗi, chưa thể xác nhận dữ liệu."
		res.Block = buildLiveWebBlock(res)
		return res
	}
	payload, err := io.ReadAll(io.LimitReader(r.Body, 350*1024))
	if err != nil {
		res.Error = err.Error()
		res.Summary = "Đọc dữ liệu internet tổng quát thất bại."
		res.Block = buildLiveWebBlock(res)
		return res
	}
	var parsed duckDuckGoResponse
	if err := json.Unmarshal(payload, &parsed); err != nil {
		res.Error = err.Error()
		res.Summary = "Dữ liệu internet tổng quát không đúng định dạng mong đợi."
		res.Block = buildLiveWebBlock(res)
		return res
	}
	summary := firstNonEmpty(strings.TrimSpace(parsed.Answer), strings.TrimSpace(parsed.AbstractText))
	if summary == "" && len(parsed.Results) > 0 {
		summary = strings.TrimSpace(parsed.Results[0].Text)
	}
	if summary == "" && len(parsed.RelatedTopics) > 0 {
		summary = strings.TrimSpace(parsed.RelatedTopics[0].Text)
	}
	if summary == "" {
		summary = "Nguồn internet không trả về tóm tắt rõ ràng cho truy vấn này."
	}
	res.Summary = truncateStr(summary, 700)
	res.Block = buildLiveWebBlock(res)
	return res
}

func buildLiveWebBlock(res LiveWebLookupResult) string {
	var sb strings.Builder
	sb.WriteString("[LIVE_WEB_LOOKUP]\n")
	sb.WriteString("provider: ")
	sb.WriteString(firstNonEmpty(strings.TrimSpace(res.Provider), "unknown"))
	sb.WriteString("\nretrievedAt: ")
	sb.WriteString(firstNonEmpty(strings.TrimSpace(res.RetrievedAt), time.Now().Format(time.RFC3339)))
	sb.WriteString("\nquery: ")
	sb.WriteString(truncateStr(strings.TrimSpace(res.Query), 300))
	sb.WriteString("\nqueryType: ")
	sb.WriteString(firstNonEmpty(strings.TrimSpace(res.QueryType), "general_facts"))
	sb.WriteString("\nconfidence: ")
	sb.WriteString(fmt.Sprintf("%d", res.Confidence))
	sb.WriteString("\nreason: ")
	sb.WriteString(firstNonEmpty(strings.TrimSpace(res.Reason), "internet_context_needed"))
	sb.WriteString("\nsummary: ")
	sb.WriteString(truncateStr(strings.TrimSpace(res.Summary), 500))
	if strings.TrimSpace(res.Error) != "" {
		sb.WriteString("\nerror: ")
		sb.WriteString(truncateStr(strings.TrimSpace(res.Error), 220))
	}
	sb.WriteString("\n[/LIVE_WEB_LOOKUP]\n\n")
	return sb.String()
}

func LiveWebLookupSSE(req *CodeStreamRequest, live LiveWebLookupResult) map[string]any {
	status := "completed"
	if strings.TrimSpace(live.Error) != "" {
		status = "degraded"
	}
	return map[string]any{
		"stage":      "live_web_lookup",
		"status":     status,
		"requestId":  req.RequestID,
		"provider":   live.Provider,
		"query":      live.Query,
		"queryType":  live.QueryType,
		"confidence": live.Confidence,
		"reason":     live.Reason,
		"summary":    live.Summary,
		"error":      live.Error,
		"message":    "Live web lookup executed for real-time request",
	}
}
