package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"csm_server/backend-go/internal/ai/artifact"
	aicontext "csm_server/backend-go/internal/ai/context"
	"csm_server/backend-go/internal/ai/domain"
	"csm_server/backend-go/internal/ai/orchestrator"
	"csm_server/backend-go/internal/ai/provider"
	"csm_server/backend-go/internal/ai/router"
	aistore "csm_server/backend-go/internal/ai/store"
	"csm_server/backend-go/internal/ai/verifier"
	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
)

type AiSeoService struct {
	cfg           config.AppConfig
	provider      provider.Provider
	cloudProvider provider.Provider
	router        *router.Registry
	verifier      *verifier.SeoArticle
	store         *aistore.Store
	artifacts     *artifact.Store
}

type seoProviderTokenizer struct{ provider provider.Provider }

func (tokenizer seoProviderTokenizer) Name() string { return tokenizer.provider.Name() }
func (tokenizer seoProviderTokenizer) CountTokens(text string) (int, error) {
	return tokenizer.provider.CountTokens(text)
}

func NewAiSeoService(cfg config.AppConfig, llama *LlamaService, records ...*data.RecordManager) *AiSeoService {
	localProvider := provider.FuncProvider{
		ProviderName: "local_llama", ModelName: StreamingModelLabel(cfg, llama),
		ContextSize:  int(cfg.EffectiveLlamaContextWindow()),
		TokenCounter: llama.CountTokens,
		IsAvailable:  llama.IsAvailable, CompleteFunc: llama.CompleteWithTokens,
	}
	var platformStore *aistore.Store
	if len(records) > 0 && records[0] != nil {
		platformStore = aistore.New(records[0])
	}
	var artifactStore *artifact.Store
	if len(records) > 0 && records[0] != nil {
		artifactStore = artifact.New(records[0])
	}
	cloud := provider.NewCloudProvider("cloud")
	reg := router.New(localProvider, cloud)
	return &AiSeoService{
		cfg: cfg, provider: localProvider, cloudProvider: cloud, router: reg, verifier: verifier.NewSeoArticle(),
		store: platformStore, artifacts: artifactStore,
	}
}

func (s *AiSeoService) Generate(ctx context.Context, params map[string]any) *model.StandardResponse {
	responseContract := resolveSeoResponseContract(params)
	plan := seoExecutionPlan(responseContract)
	validation := orchestrator.ValidatePlan(plan, nil, 10, 0)
	if !validation.Valid {
		response := model.NewResponse()
		response.Set("code", 200)
		response.Set("success", false)
		response.Set("status", "INCOMPLETE")
		response.Set("errorCode", "PLAN_VALIDATION_FAILED")
		response.Set("errors", validation.Errors)
		response.Set("missingRequirements", validation.MissingRequirements)
		response.Set("missingVerifierFor", validation.MissingVerifierFor)
		return response
	}
	ctx, tracker := s.beginSeoRun(ctx, params, plan)
	response := s.generate(ctx, params)
	s.finishSeoRun(tracker, response)
	if tracker != nil {
		response.Set("runId", tracker.run.RunID)
	}
	return response
}

func (s *AiSeoService) generate(ctx context.Context, params map[string]any) *model.StandardResponse {
	r := model.NewResponse()
	mode := paramString(params, "mode", "sync")
	if mode == "status" || mode == "cancel" {
		r.Set("code", 200)
		r.Set("success", false)
		r.Set("message", "async mode not supported in local backend")
		return r
	}

	seoPipeline := paramString(params, "seoPipeline", "")
	isOneShot := seoPipeline == "anti_ai_one_shot" || seoPipeline == "seo_article_one_shot" || seoPipeline == "seo_writer_2026"
	responseContract := resolveSeoResponseContract(params)
	seoContext := extractSeoContext(params)

	if isOneShot {
		if !s.provider.Available() {
			return localUnavailableResponse()
		}
		return s.runAntiAiOneShot(ctx, seoContext, seoPipeline)
	}

	prompt := paramString(params, "prompt", "")
	if prompt == "" {
		r.Set("code", 200)
		r.Set("success", false)
		r.Set("message", "Thiếu tham số 'prompt' để tạo nội dung AI.")
		return r
	}
	if !s.provider.Available() {
		return localUnavailableResponse()
	}
	prompt = PrepareLocalProviderPrompt(prompt, EffectiveSeoPromptMaxChars(s.cfg))
	raw, err := s.completeSEO(ctx, "article", prompt, EffectiveSeoArticleMaxTokens(s.cfg))
	if err != nil {
		r.Set("code", 200)
		r.Set("success", false)
		r.Set("message", fmt.Sprintf("Lỗi AI: %v", err))
		r.Set("errorCode", LocalProviderUnavailableCode)
		return r
	}
	if responseContract == "json" {
		return finalizeGenericJSON(raw)
	}
	return s.finalizePromptSeoArticle(ctx, raw)
}

type seoRunContextKey struct{}

type seoRunTracker struct {
	mu    sync.Mutex
	run   domain.AgentRun
	steps []domain.RunStep
}

func (s *AiSeoService) beginSeoRun(ctx context.Context, params map[string]any, plan domain.ExecutionPlan) (context.Context, *seoRunTracker) {
	if s.store == nil || !s.store.Available() {
		return ctx, nil
	}
	seoContext := extractSeoContext(params)
	tenantID := paramString(params, "appId", paramString(params, "app_id", paramString(seoContext, "domainKey", "csm")))
	requestID := paramString(params, "requestId", paramString(params, "request_id", ""))
	goal := "Generate SEO content"
	if topic := strings.TrimSpace(paramString(seoContext, "topic", "")); topic != "" {
		goal = "Generate SEO content: " + truncateStr(topic, 200)
	}
	_ = s.store.SaveAgent(domain.AgentDefinition{
		AgentID: "seo-content-agent", TenantID: tenantID, Name: "SEO Content Agent",
		Version: 1, Status: "active", Skills: []string{"seo.write", "seo.translate", "seo.validate"},
		AllowedTools: []string{}, PreferredMode: "local", CloudAllowed: false, MaxSteps: 10,
	})
	run := aistore.NewRun(requestID, tenantID, "seo-content-agent", truncateStr(goal, 600), 0)
	planJSON, _ := json.Marshal(plan)
	run.PlanVersion = plan.Version
	run.PlanDigest = digestText(string(planJSON))
	run.Status = domain.RunRunning
	run.UpdatedAt = time.Now().UTC()
	_ = s.store.SaveRun(run)
	_ = s.store.SavePlan(tenantID, run.RunID, plan, run.PlanDigest)
	tracker := &seoRunTracker{run: run}
	return context.WithValue(ctx, seoRunContextKey{}, tracker), tracker
}

func resolveSeoResponseContract(params map[string]any) string {
	contract := strings.ToLower(strings.TrimSpace(paramString(params, "responseContract", "")))
	if contract == "json" || strings.EqualFold(paramString(params, "taskType", ""), "json") {
		return "json"
	}
	return "article"
}

func seoExecutionPlan(responseContract string) domain.ExecutionPlan {
	if responseContract == "json" {
		return domain.ExecutionPlan{
			Version: 1, Goal: "Generate valid JSON for the requested task",
			Requirements: []domain.Requirement{{
				ID: "REQ-JSON", Description: "Return a valid JSON object", Required: true,
				AcceptanceCriteria: []string{"output parses as a non-empty JSON object"},
			}},
			Steps: []domain.PlanStep{
				{ID: "json_generate", Sequence: 1, Type: "llm", Covers: []string{"REQ-JSON"}, InputSchema: "Prompt", OutputSchema: "JSONObject", Required: true},
				{ID: "json_verify", Sequence: 2, Type: "gate", DependsOn: []string{"json_generate"}, Covers: []string{"REQ-JSON"}, InputSchema: "JSONObject", OutputSchema: "GateResult", Required: true},
			},
		}
	}
	requirements := []domain.Requirement{
		{ID: "REQ-SEO-VI", Description: "Vietnamese HTML article", Required: true, AcceptanceCriteria: []string{"title and HTML content are complete"}},
		{ID: "REQ-SEO-EN", Description: "English locale", Required: true, AcceptanceCriteria: []string{"English title/content exist and differ from Vietnamese"}},
		{ID: "REQ-SEO-ZH", Description: "Chinese locale", Required: true, AcceptanceCriteria: []string{"Chinese title/content exist and differ from Vietnamese"}},
		{ID: "REQ-SEO-META", Description: "SEO metadata", Required: true, AcceptanceCriteria: []string{"title/description/keywords/excerpt metadata exists for all locales"}},
	}
	return domain.ExecutionPlan{
		Version: 1, Goal: "Generate a complete trilingual SEO article",
		Requirements: requirements,
		Steps: []domain.PlanStep{
			{ID: "article_vi", Sequence: 1, Type: "llm", Covers: []string{"REQ-SEO-VI"}, InputSchema: "SeoContext", OutputSchema: "VietnameseArticle", Required: true},
			{ID: "article_vi_gate", Sequence: 2, Type: "gate", DependsOn: []string{"article_vi"}, Covers: []string{"REQ-SEO-VI"}, InputSchema: "VietnameseArticle", OutputSchema: "GateResult", Required: true},
			{ID: "translate_en", Sequence: 3, Type: "llm", DependsOn: []string{"article_vi_gate"}, Covers: []string{"REQ-SEO-EN"}, InputSchema: "VietnameseArticle", OutputSchema: "EnglishArticle", Required: true},
			{ID: "translate_zh", Sequence: 4, Type: "llm", DependsOn: []string{"article_vi_gate"}, Covers: []string{"REQ-SEO-ZH"}, InputSchema: "VietnameseArticle", OutputSchema: "ChineseArticle", Required: true},
			{ID: "locale_gate", Sequence: 5, Type: "gate", DependsOn: []string{"translate_en", "translate_zh"}, Covers: []string{"REQ-SEO-EN", "REQ-SEO-ZH"}, InputSchema: "LocalizedArticle", OutputSchema: "GateResult", Required: true},
			{ID: "metadata_fill", Sequence: 6, Type: "compute", DependsOn: []string{"locale_gate"}, Covers: []string{"REQ-SEO-META"}, InputSchema: "LocalizedArticle", OutputSchema: "SeoMetadata", Required: true},
			{ID: "metadata_gate", Sequence: 7, Type: "gate", DependsOn: []string{"metadata_fill"}, Covers: []string{"REQ-SEO-META"}, InputSchema: "SeoMetadata", OutputSchema: "GateResult", Required: true},
		},
	}
}

func (s *AiSeoService) selectProvider(prompt string, maxTokens uint32) (provider.Provider, router.Decision, error) {
	if s.router == nil {
		return s.provider, router.Decision{Provider: s.provider.Name(), ContextWindow: int(s.cfg.EffectiveLlamaContextWindow())}, nil
	}
	inputTokens, _ := s.provider.CountTokens(prompt)
	decision, err := s.router.Route(context.Background(), router.ModelPolicy{
		Preferred: "local", MinimumQuality: 0.5, CloudAllowed: true,
	}, inputTokens, int(maxTokens), nil)
	if err != nil {
		return nil, decision, err
	}
	if decision.Provider == "cloud" && s.cloudProvider != nil && s.cloudProvider.Available() {
		return s.cloudProvider, decision, nil
	}
	return s.provider, decision, nil
}

func (s *AiSeoService) completeSEO(ctx context.Context, task, prompt string, maxTokens uint32) (string, error) {
	selected, decision, routeErr := s.selectProvider(prompt, maxTokens)
	if routeErr != nil {
		return "", routeErr
	}
	packed, packErr := aicontext.Pack(
		seoProviderTokenizer{provider: selected},
		aicontext.Budget{
			ContextWindow: decision.ContextWindow,
			OutputReserve: int(maxTokens),
			SystemReserve: 256,
			SafetyMargin:  512,
		},
		[]aicontext.Section{{
			ID: "seo-request", Kind: "current_step", Priority: 100, Required: true, Content: prompt,
		}},
	)
	if packErr != nil {
		return "", packErr
	}
	prompt = packed.Text
	tracker, _ := ctx.Value(seoRunContextKey{}).(*seoRunTracker)
	stepSequence := 0
	stepID := ""
	startedAt := time.Now().UTC()
	if tracker != nil {
		tracker.mu.Lock()
		tracker.run.TotalSteps++
		stepSequence = tracker.run.TotalSteps
		tracker.run.CurrentStep = stepSequence
		tracker.run.UpdatedAt = startedAt
		stepID = fmt.Sprintf("step_%02d_%s", stepSequence, task)
		_ = s.store.SaveRun(tracker.run)
		_ = s.store.SaveStep(domain.RunStep{
			RunID: tracker.run.RunID, TenantID: tracker.run.TenantID,
			StepID: stepID, Sequence: stepSequence, Kind: task,
			Provider: selected.Name(), Status: domain.StepRunning, Attempt: 1,
			IdempotencyKey: tracker.run.RunID + ":" + stepID + ":1",
			InputChars:     len(prompt), ContextDigest: digestText(prompt), StartedAt: startedAt,
		})
		tracker.mu.Unlock()
	}

	completion, err := selected.Complete(ctx, provider.CompletionRequest{Prompt: prompt, MaxTokens: maxTokens, Task: task})
	if err == nil && (completion.FinishReason == provider.FinishReasonMaxTokens || completion.FinishReason == provider.FinishReasonContextLimit) {
		err = fmt.Errorf("provider output incomplete: finish_reason=%s", completion.FinishReason)
	}
	completedAt := time.Now().UTC()
	if tracker != nil {
		stepStatus := domain.StepCandidate
		errorText := ""
		errorCode := ""
		if err != nil {
			stepStatus = domain.StepFailed
			errorCode = "PROVIDER_ERROR"
			errorText = err.Error()
		}
		evidenceRefs := []string{}
		outputDigest := digestText(completion.Text)
		if s.artifacts != nil && strings.TrimSpace(completion.Text) != "" {
			savedArtifact, artifactErr := s.artifacts.Save(artifact.Artifact{
				TenantID: tracker.run.TenantID, RunID: tracker.run.RunID, StepID: stepID,
				ContentType: "application/json", Content: completion.Text,
			})
			if artifactErr == nil {
				evidenceRefs = append(evidenceRefs, "artifact://"+savedArtifact.ID)
				outputDigest = savedArtifact.Digest
			}
		}
		completedStep := domain.RunStep{
			RunID: tracker.run.RunID, TenantID: tracker.run.TenantID,
			StepID: stepID, Sequence: stepSequence, Kind: task,
			Provider: selected.Name(), Model: completion.Model, Status: stepStatus, Attempt: 1,
			IdempotencyKey: tracker.run.RunID + ":" + stepID + ":1",
			InputChars:     len(prompt), OutputChars: len(completion.Text), ErrorCode: errorCode,
			ErrorText: errorText, ContextDigest: digestText(prompt), OutputDigest: outputDigest,
			EvidenceRefs: evidenceRefs,
			StartedAt:    startedAt, CompletedAt: completedAt,
		}
		_ = s.store.SaveStep(completedStep)
		_ = s.store.RecordUsage(tracker.run.RunID, tracker.run.TenantID, tracker.run.AgentID, stepID, domain.Usage{
			Provider: selected.Name(), Model: completion.Model, InputChars: len(prompt),
			OutputChars: len(completion.Text), InputTokens: completion.InputTokens, OutputTokens: completion.OutputTokens,
			EstimatedTokens: (len(prompt) + len(completion.Text) + 3) / 4,
			FinishReason:    string(completion.FinishReason), ContextWindow: completion.ContextWindow,
			Duration: completedAt.Sub(startedAt), ProviderRequestID: completion.ProviderRequestID,
		})
		tracker.mu.Lock()
		tracker.steps = append(tracker.steps, completedStep)
		tracker.mu.Unlock()
	}
	return completion.Text, err
}

func (s *AiSeoService) finishSeoRun(tracker *seoRunTracker, response *model.StandardResponse) {
	if tracker == nil || response == nil {
		return
	}
	tracker.mu.Lock()
	defer tracker.mu.Unlock()
	tracker.run.Status = domain.RunSucceeded
	if !response.Success() {
		tracker.run.Status = domain.RunFailed
	}
	missing := stringSliceFromAny(response.Properties["missingRequirements"])
	tracker.run.CompletedSteps = 0
	for index := range tracker.steps {
		step := tracker.steps[index]
		if step.Status == domain.StepFailed {
			_ = s.store.SaveStep(step)
			continue
		}
		step.Verifier = domain.VerificationResult{
			Passed:  response.Success(),
			Score:   map[bool]float64{true: 1, false: 0}[response.Success()],
			Missing: missing,
		}
		if response.Success() {
			step.Status = domain.StepSucceeded
			tracker.run.CompletedSteps++
		} else {
			step.Status = domain.StepFailed
			step.ErrorCode = "FINAL_CONTRACT_REJECTED"
		}
		_ = s.store.SaveStep(step)
	}
	tracker.run.UpdatedAt = time.Now().UTC()
	_ = s.store.SaveRun(tracker.run)
}

func (s *AiSeoService) recordVerification(ctx context.Context, stepID string, v domain.VerificationResult) {
	tracker, _ := ctx.Value(seoRunContextKey{}).(*seoRunTracker)
	if tracker == nil || s.store == nil {
		return
	}
	tracker.mu.Lock()
	defer tracker.mu.Unlock()
	for i := range tracker.steps {
		if tracker.steps[i].StepID == stepID {
			tracker.steps[i].Verifier = v
			_ = s.store.SaveStep(tracker.steps[i])
			return
		}
	}
	// If no matching step exists, record a dedicated verifier step.
	tracker.run.TotalSteps++
	seq := tracker.run.TotalSteps
	_ = s.store.SaveStep(domain.RunStep{
		RunID: tracker.run.RunID, TenantID: tracker.run.TenantID,
		StepID: stepID, Sequence: seq, Kind: "verifier",
		Provider: "verifier", Status: map[bool]domain.StepStatus{true: domain.StepSucceeded, false: domain.StepFailed}[v.Passed],
		Verifier: v, StartedAt: time.Now().UTC(), CompletedAt: time.Now().UTC(),
	})
}

func digestText(text string) string {
	digest := sha256.Sum256([]byte(text))
	return "sha256:" + hex.EncodeToString(digest[:])
}

func stringSliceFromAny(value any) []string {
	switch items := value.(type) {
	case []string:
		return append([]string(nil), items...)
	case []any:
		out := make([]string, 0, len(items))
		for _, item := range items {
			if text := strings.TrimSpace(fmt.Sprint(item)); text != "" {
				out = append(out, text)
			}
		}
		return out
	default:
		return nil
	}
}

func localUnavailableResponse() *model.StandardResponse {
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", false)
	r.Set("message", LocalUnavailableMessage())
	r.Set("hint", LocalUnavailableHint())
	r.Set("errorCode", LocalProviderUnavailableCode)
	return r
}

func extractSeoContext(params map[string]any) map[string]any {
	out := map[string]any{}
	if nested, ok := params["seoContext"].(map[string]any); ok {
		for k, v := range nested {
			out[k] = v
		}
	}
	for _, key := range []string{
		"industry", "topic", "content", "domainKey", "property", "location",
		"business", "seed", "seoPipeline", "taskType", "prompt",
	} {
		if v, ok := params[key]; ok {
			out[key] = v
		}
	}
	return out
}

func populateSeoResponse(raw string) *model.StandardResponse {
	r := model.NewResponse()
	data := parseSeoArticleMap(raw)
	if len(data) == 0 {
		cleaned := strings.TrimSpace(raw)
		r.Set("code", 200)
		r.Set("success", false)
		r.Set("message", "Model không trả về JSON hợp lệ.")
		r.Set("rawContent", truncate(cleaned, 2000))
		r.Set("errorCode", "SEO_PARSE_FAILED")
		return r
	}
	hasTitle := paramString(data, "title", "") != ""
	hasContent := paramString(data, "content", "") != ""
	if !hasTitle || !hasContent {
		r.Set("code", 200)
		r.Set("success", false)
		r.Set("data", data)
		r.Set("errorCode", "SEO_GENERATION_FAILED")
		r.Set("message", "Model local không tạo được bài SEO đủ title và content.")
		return r
	}
	normalizeSeoFields(data)
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", data)
	r.Set("provider", "local_provider")
	r.Set("message", "Thành công")
	return r
}

func finalizeGenericJSON(raw string) *model.StandardResponse {
	data := parseSeoArticleMap(raw)
	if len(data) == 0 {
		response := model.NewResponse()
		response.Set("code", 200)
		response.Set("success", false)
		response.Set("status", "INCOMPLETE")
		response.Set("errorCode", "JSON_CONTRACT_FAILED")
		response.Set("message", "Model không trả về JSON object hợp lệ.")
		return response
	}
	response := model.NewResponse()
	response.Set("code", 200)
	response.Set("success", true)
	response.Set("data", data)
	response.Set("provider", "local_provider")
	response.Set("message", "Thành công")
	return response
}

var htmlTagRe = regexp.MustCompile(`<[^>]*>`)

func plainTextExcerpt(data map[string]any, field string, maxChars int) string {
	html := paramString(data, field, "")
	if html == "" {
		return ""
	}
	text := htmlTagRe.ReplaceAllString(html, " ")
	text = strings.Join(strings.Fields(text), " ")
	if text == "" {
		return ""
	}
	if len(text) > maxChars {
		return text[:maxChars]
	}
	return text
}

func normalizeSeoFields(data map[string]any) {
	fillBlankFrom(data, "description", "excerpt")
	fillBlankFrom(data, "description_en", "excerpt_en")
	fillBlankFrom(data, "description_zh", "excerpt_zh")
	if paramString(data, "description", "") == "" {
		if plain := plainTextExcerpt(data, "content", 160); plain != "" {
			data["description"] = plain
		}
	}
	fillBlankFrom(data, "attributes_title", "title")
	fillBlankFrom(data, "attributes_title_en", "title_en")
	fillBlankFrom(data, "attributes_title_zh", "title_zh")
	fillBlankFrom(data, "attributes_description", "description")
	fillBlankFrom(data, "attributes_description_en", "description_en")
	fillBlankFrom(data, "attributes_description_zh", "description_zh")
	for _, pair := range [][2]string{
		{"keywords", "attributes_keywords"},
		{"keywords_en", "attributes_keywords_en"},
		{"keywords_zh", "attributes_keywords_zh"},
	} {
		if paramString(data, pair[1], "") == "" {
			if joined := keywordsToString(data, pair[0]); joined != "" {
				data[pair[1]] = joined
			}
		}
	}
	if _, ok := data["html_content"]; !ok {
		if v, ok := data["content"]; ok {
			data["html_content"] = v
		}
	}
	if _, ok := data["provider"]; !ok {
		data["provider"] = "local_provider"
	}
}

func fillBlankFrom(data map[string]any, target, source string) {
	if paramString(data, target, "") != "" {
		return
	}
	if v, ok := data[source]; ok && paramString(map[string]any{source: v}, source, "") != "" {
		data[target] = v
	}
}

func keywordsToString(data map[string]any, field string) string {
	v, ok := data[field]
	if !ok {
		return ""
	}
	switch t := v.(type) {
	case []any:
		parts := make([]string, 0, len(t))
		for _, item := range t {
			s := strings.TrimSpace(fmt.Sprint(item))
			if s != "" {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, ", ")
	case []string:
		return strings.Join(t, ", ")
	case string:
		return t
	default:
		b, err := json.Marshal(t)
		if err == nil && len(b) > 2 {
			return string(b)
		}
		return fmt.Sprint(t)
	}
}
