package services

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
)

const (
	scopeMenu     = 0x01
	scopeCode     = 0x02
	scopeConfig   = 0x04
	scopeBusiness = 0x10

	tenantRAGDefaultTopK     = 6
	tenantRAGDefaultMaxChars = 5000
	tenantIngestDebounceMs   = 60_000
)

var tenantIngestLastMs sync.Map // appID -> int64

// TenantRAGCitation is one row for tool_search / rag_citations SSE.
type TenantRAGCitation struct {
	Source         string   `json:"source"`
	ChunkID        string   `json:"chunkId"`
	Summary        string   `json:"summary"`
	Score          float64  `json:"score"`
	SourceCategory string   `json:"sourceCategory"`
	MatchedTokens  []string `json:"matchedTokens"`
	Recent         bool     `json:"recent"`
	FreshnessScore float64  `json:"freshnessScore"`
	ContentExcerpt string   `json:"contentExcerpt"`
}

// TenantRAGResult bundles retrieval output for prompt + SSE.
type TenantRAGResult struct {
	Block       string
	LiveMenuDig string
	Query       string
	Hits        []TenantRAGCitation
	HitCount    int
	SourceCount int
	CharsUsed   int
	ScopeMask   int
	TopK        int
	MaxChars    int
}

// RunTenantRAG ingests scoped context, searches FTS, builds prompt block.
func RunTenantRAG(cfg config.AppConfig, rm *data.RecordManager, req *CodeStreamRequest) TenantRAGResult {
	return RunTenantRAGWithAuth(cfg, rm, req, RetrievalAuthAnonymous)
}

// RunTenantRAGWithAuth runs tenant RAG with ACL filtering on chunk tags.
func RunTenantRAGWithAuth(cfg config.AppConfig, rm *data.RecordManager, req *CodeStreamRequest, auth RetrievalAuthContext) TenantRAGResult {
	if rm == nil || req == nil {
		return TenantRAGResult{}
	}
	appID := strings.TrimSpace(req.AppID)
	if appID == "" {
		appID = "csm"
	}

	scopeMask := resolveScopeMask(req.ContextType)
	ingestTenantKnowledgeIfNeeded(rm, appID, auth)
	ingestScopedEditorContext(rm, appID, req)
	liveMenu := ingestLiveTenantMenu(rm, appID)

	query := buildSelfDirectedRetrievalQuery(req)
	topK := tenantRAGDefaultTopK
	maxChars := tenantRAGDefaultMaxChars

	var allHits []data.TenantRAGHit

	chunkHits, _ := rm.SearchTenantRAG(appID, query, scopeMask, topK*2)
	allHits = append(allHits, chunkHits...)

	if len(allHits) > 0 {
		allHits = rerankHitsWithEmbedding(allHits, query)
	}

	tableHits, _ := rm.SearchRecordsVectorForApp(appID, query, nil, topK)
	allHits = mergeTenantRAGHits(allHits, tableHits)

	ranked := rankAndTrimHits(filterHitsByACL(allHits, auth), query, topK, maxChars)
	citations := summarizeRAGHits(ranked, query)
	block := buildTenantRAGPromptBlock(ranked, liveMenu)

	sourceSet := map[string]struct{}{}
	for _, c := range citations {
		sourceSet[c.Source] = struct{}{}
	}

	return TenantRAGResult{
		Block:       block,
		LiveMenuDig: liveMenu,
		Query:       query,
		Hits:        citations,
		HitCount:    len(citations),
		SourceCount: len(sourceSet),
		CharsUsed:   len(block),
		ScopeMask:   scopeMask,
		TopK:        topK,
		MaxChars:    maxChars,
	}
}

func resolveScopeMask(contextType string) int {
	switch strings.ToLower(strings.TrimSpace(contextType)) {
	case "menu_json":
		return scopeMenu | scopeBusiness
	case "code", "frontend_code":
		return scopeCode | scopeBusiness
	default:
		return scopeBusiness
	}
}

func ingestTenantKnowledgeIfNeeded(rm *data.RecordManager, appID string, auth RetrievalAuthContext) {
	now := time.Now().UnixMilli()
	if last, ok := tenantIngestLastMs.Load(appID); ok {
		if lastMs, ok := last.(int64); ok && now-lastMs < tenantIngestDebounceMs {
			return
		}
	}
	tenantIngestLastMs.Store(appID, now)

	orgMD := buildOrgSnapshotMarkdown(rm, appID)
	orgTags := EnrichRetrievalTagsWithACL([]string{"acl:tenant", "knowledge:tenant", "knowledge:org"}, auth)
	indexChunksTagged(rm, appID, "tenant_knowledge_org_snapshot", orgMD, scopeBusiness|scopeConfig, orgTags)

	rulesMD := tenantDomainRulesMarkdown()
	ruleTags := EnrichRetrievalTagsWithACL([]string{"acl:tenant", "knowledge:domain_rules", "knowledge:permissions"}, auth)
	indexChunksTagged(rm, appID, "tenant_knowledge_domain_rules", rulesMD, scopeBusiness|scopeConfig, ruleTags)
}

func indexChunksTagged(rm *data.RecordManager, appID, sourceName, markdown string, scopeMask int, tagStr string) {
	chunks := data.ChunkText(sourceName, markdown, 2200)
	_ = rm.DeleteTenantRAGSource(appID, sourceName)
	now := time.Now().UnixMilli()
	for i, chunk := range chunks {
		chunkID := fmt.Sprintf("%s_%s_%d", appID, sourceName, i)
		summary := truncateStr(chunk, 120)
		_ = rm.UpsertTenantRAGChunk(data.TenantRAGChunk{
			ChunkID: chunkID, AppID: appID, SourceName: sourceName,
			ScopeMask: scopeMask, ScopeTags: tagStr, Tags: tagStr,
			CreatedAtMs: now, Summary: summary, Structure: sourceName, Content: chunk,
		})
	}
}

func filterHitsByACL(hits []data.TenantRAGHit, auth RetrievalAuthContext) []data.TenantRAGHit {
	var out []data.TenantRAGHit
	for _, h := range hits {
		if PassesRetrievalAuthFilter(h.Tags, auth) {
			out = append(out, h)
		}
	}
	return out
}

func ingestScopedEditorContext(rm *data.RecordManager, appID string, req *CodeStreamRequest) {
	editor := strings.TrimSpace(req.CurrentCode)
	if editor == "" {
		return
	}
	if req.ContextType == "menu_json" {
		_ = rm.DeleteTenantRAGSource(appID, "dyn_ctx_currentMenu")
		indexChunks(rm, appID, "dyn_ctx_currentMenu", editor, scopeMenu,
			[]string{"scope_menu", "currentMenu"})
		return
	}
	_ = rm.DeleteTenantRAGSource(appID, "dyn_ctx_currentCode")
	indexChunks(rm, appID, "dyn_ctx_currentCode", editor, scopeCode,
		[]string{"scope_code", "currentCode"})
}

func ingestLiveTenantMenu(rm *data.RecordManager, appID string) string {
	rec := rm.Find(appID, "index", model.EqFilter("id", "menu"))
	if len(rec) == 0 {
		return ""
	}
	raw := extractIndexMenuPayload(rec)
	if raw == "" {
		return ""
	}
	digest := truncateStr(raw, 1200)
	indexChunks(rm, appID, "tenant_live_menu", raw, scopeMenu,
		[]string{"scope_menu", "live_menu", "index.menu"})
	return digest
}

func extractIndexMenuPayload(rec map[string]any) string {
	for _, key := range []string{"data", "struct", "menu", "content"} {
		if v, ok := rec[key]; ok {
			switch t := v.(type) {
			case string:
				if s := strings.TrimSpace(t); s != "" {
					return s
				}
			case []any:
				b, err := json.Marshal(map[string]any{"menu": t})
				if err == nil {
					return string(b)
				}
			case map[string]any:
				b, err := json.Marshal(t)
				if err == nil {
					return string(b)
				}
			}
		}
	}
	b, err := json.Marshal(rec)
	if err != nil {
		return ""
	}
	return string(b)
}

func buildOrgSnapshotMarkdown(rm *data.RecordManager, appID string) string {
	var sb strings.Builder
	sb.WriteString("# Tenant org snapshot\n\n")
	for _, table := range []string{"csm_roles", "csm_depts", "csm_branches"} {
		result := rm.Filter(appID, table, model.SearchFilter{})
		rows := extractFilterRows(result)
		if len(rows) == 0 {
			continue
		}
		sb.WriteString("## ")
		sb.WriteString(table)
		sb.WriteByte('\n')
		limit := len(rows)
		if limit > 40 {
			limit = 40
		}
		for i := 0; i < limit; i++ {
			title, content := data.ExtractSearchText(rows[i])
			if title != "" {
				sb.WriteString("- ")
				sb.WriteString(title)
				if content != "" && content != title {
					sb.WriteString(": ")
					sb.WriteString(truncateStr(content, 200))
				}
				sb.WriteByte('\n')
			}
		}
		sb.WriteByte('\n')
	}
	return sb.String()
}

func extractFilterRows(result map[string]any) []map[string]any {
	if result == nil {
		return nil
	}
	for _, key := range []string{"rows", "data"} {
		raw, ok := result[key]
		if !ok {
			continue
		}
		switch arr := raw.(type) {
		case []map[string]any:
			return arr
		case []any:
			var out []map[string]any
			for _, item := range arr {
				if m, ok := item.(map[string]any); ok {
					out = append(out, m)
				}
			}
			return out
		}
	}
	return nil
}

func tenantDomainRulesMarkdown() string {
	return `# CSM domain rules (tenant RAG)
- Menu nodes use type_form: 0=folder, 1=form, 5=report.
- sys_autos rows keyed by p_name + p_type; p_code is DynamicCode runtime.
- Role dataScope controls row-level ACL (branch/dept).
- Combo fields cascade from parent lookup tables.
- Greenfield menu: scaffold folders first, then enrich modules incrementally.
`
}

func indexChunks(rm *data.RecordManager, appID, sourceName, markdown string, scopeMask int, tags []string) {
	chunks := data.ChunkText(sourceName, markdown, 2200)
	_ = rm.DeleteTenantRAGSource(appID, sourceName)
	now := time.Now().UnixMilli()
	tagStr := strings.Join(tags, ",")
	for i, chunk := range chunks {
		chunkID := fmt.Sprintf("%s_%s_%d", appID, sourceName, i)
		summary := truncateStr(chunk, 120)
		_ = rm.UpsertTenantRAGChunk(data.TenantRAGChunk{
			ChunkID: chunkID, AppID: appID, SourceName: sourceName,
			ScopeMask: scopeMask, ScopeTags: tagStr, Tags: tagStr,
			CreatedAtMs: now, Summary: summary, Structure: sourceName, Content: chunk,
		})
	}
}

func buildSelfDirectedRetrievalQuery(req *CodeStreamRequest) string {
	var parts []string
	msg := truncateStr(strings.TrimSpace(req.Message), 200)
	if msg != "" {
		parts = append(parts, msg)
	}
	if req.ContextType == "menu_json" {
		modules := extractMenuModuleLabels(req.CurrentCode)
		if len(modules) > 0 {
			parts = append(parts, "menu: "+strings.Join(modules[:min(8, len(modules))], ", "))
		}
	} else {
		symbols := extractCodeSymbols(req.CurrentCode)
		if len(symbols) > 0 {
			parts = append(parts, "symbols: "+strings.Join(symbols[:min(12, len(symbols))], ", "))
		}
	}
	parts = append(parts, "context="+req.ContextType, "task="+req.TaskType, "mode="+req.ResponseMode)
	out := strings.Join(parts, " | ")
	return truncateStr(out, 380)
}

func extractCodeSymbols(code string) []string {
	if code == "" {
		return nil
	}
	var out []string
	seen := map[string]struct{}{}
	for _, line := range strings.Split(code, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "function ") {
			name := strings.TrimSpace(strings.TrimPrefix(line, "function "))
			if idx := strings.Index(name, "("); idx > 0 {
				name = name[:idx]
			}
			addSymbol(&out, seen, name)
		}
		if strings.HasPrefix(line, "const ") || strings.HasPrefix(line, "let ") || strings.HasPrefix(line, "var ") {
			rest := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(strings.TrimPrefix(line, "const "), "let "), "var "))
			if idx := strings.Index(rest, "="); idx > 0 {
				addSymbol(&out, seen, strings.TrimSpace(rest[:idx]))
			}
		}
		if len(out) >= 16 {
			break
		}
	}
	return out
}

func addSymbol(out *[]string, seen map[string]struct{}, name string) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) < 2 {
		return
	}
	key := strings.ToLower(name)
	if _, ok := seen[key]; ok {
		return
	}
	seen[key] = struct{}{}
	*out = append(*out, name)
}

func buildFTSMatchFromQuery(query string) string {
	tokens := tokenizeForLearning(query)
	if len(tokens) == 0 {
		return ""
	}
	if len(tokens) > 10 {
		tokens = tokens[:10]
	}
	parts := make([]string, 0, len(tokens))
	for _, t := range tokens {
		if len(t) < 2 {
			continue
		}
		parts = append(parts, `"`+strings.ReplaceAll(t, `"`, `""`)+`"`)
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, " OR ")
}

func rerankHitsWithEmbedding(hits []data.TenantRAGHit, query string) []data.TenantRAGHit {
	qv := data.HashEmbed(query, 384)
	type scored struct {
		h     data.TenantRAGHit
		score float64
	}
	var ranked []scored
	for _, h := range hits {
		cv := data.HashEmbed(h.Summary+" "+h.Content, 384)
		sim := data.CosineSimilarity(qv, cv)
		score := h.Score + sim*0.45
		ranked = append(ranked, scored{h: h, score: score})
	}
	for i := 0; i < len(ranked); i++ {
		for j := i + 1; j < len(ranked); j++ {
			if ranked[j].score > ranked[i].score {
				ranked[i], ranked[j] = ranked[j], ranked[i]
			}
		}
	}
	out := make([]data.TenantRAGHit, len(ranked))
	for i, item := range ranked {
		h := item.h
		h.Score = item.score
		out[i] = h
	}
	return out
}

func mergeTenantRAGHits(primary, extra []data.TenantRAGHit) []data.TenantRAGHit {
	seen := map[string]struct{}{}
	var out []data.TenantRAGHit
	for _, h := range primary {
		if _, ok := seen[h.ChunkID]; ok {
			continue
		}
		seen[h.ChunkID] = struct{}{}
		out = append(out, h)
	}
	for _, h := range extra {
		if _, ok := seen[h.ChunkID]; ok {
			continue
		}
		seen[h.ChunkID] = struct{}{}
		out = append(out, h)
	}
	return out
}

func rankAndTrimHits(hits []data.TenantRAGHit, query string, topK, maxChars int) []data.TenantRAGHit {
	if len(hits) == 0 {
		return nil
	}
	qTokens := tokenizeForLearning(query)
	type scored struct {
		h     data.TenantRAGHit
		score float64
	}
	var ranked []scored
	for _, h := range hits {
		s := h.Score
		text := strings.ToLower(h.Summary + " " + h.Content)
		for _, t := range qTokens {
			if strings.Contains(text, t) {
				s += 0.15
			}
		}
		s += trustPriorityWeight(h)
		ageMs := time.Now().UnixMilli() - h.CreatedAtMs
		if ageMs < 3600_000 {
			s += 0.2
		}
		ranked = append(ranked, scored{h: h, score: s})
	}
	// Simple sort by score desc
	for i := 0; i < len(ranked); i++ {
		for j := i + 1; j < len(ranked); j++ {
			if ranked[j].score > ranked[i].score {
				ranked[i], ranked[j] = ranked[j], ranked[i]
			}
		}
	}
	var out []data.TenantRAGHit
	used := 0
	for _, item := range ranked {
		if len(out) >= topK {
			break
		}
		clen := len(item.h.Content)
		if used+clen > maxChars && len(out) > 0 {
			break
		}
		out = append(out, item.h)
		used += clen
	}
	return out
}

func trustPriorityWeight(h data.TenantRAGHit) float64 {
	source := strings.ToLower(strings.TrimSpace(h.SourceName))
	tags := strings.ToLower(strings.TrimSpace(h.Tags))

	// Trust policy: internal/domain data > learned history > internet.
	if isInternetSource(source, tags) {
		return -0.75
	}
	if isInternalReferenceSource(source) {
		return 0.45
	}
	if strings.Contains(source, "learning") {
		return 0.2
	}
	if strings.HasPrefix(source, "dyn_ctx_") || source == "tenant_live_menu" {
		return 0.3
	}
	return 0
}

func isInternetSource(sourceName, tags string) bool {
	if strings.HasPrefix(sourceName, "tenant_web_") {
		return true
	}
	return strings.Contains(tags, "source:web")
}

func isInternalReferenceSource(sourceName string) bool {
	switch sourceName {
	case "tenant_knowledge_org_snapshot", "tenant_knowledge_domain_rules", "csm_roles", "csm_depts", "csm_branches", "sys_autos", "index":
		return true
	default:
		return false
	}
}

func summarizeRAGHits(hits []data.TenantRAGHit, query string) []TenantRAGCitation {
	qTokens := tokenizeForLearning(query)
	var out []TenantRAGCitation
	for _, h := range hits {
		cat := classifyHitSourceCategory(h.SourceName, h.ScopeMask)
		matched := matchQueryTokens(qTokens, h.Summary+" "+h.Content)
		recent := time.Now().UnixMilli()-h.CreatedAtMs < 3600_000
		out = append(out, TenantRAGCitation{
			Source:         readableHitSourceLabel(h.SourceName),
			ChunkID:        truncateStr(h.ChunkID, 48),
			Summary:        truncateStr(h.Summary, 120),
			Score:          roundScore(h.Score),
			SourceCategory: cat,
			MatchedTokens:  matched,
			Recent:         recent,
			FreshnessScore: computeFreshnessScore(h.CreatedAtMs),
			ContentExcerpt: truncateStr(h.Content, 220),
		})
	}
	return out
}

func classifyHitSourceCategory(sourceName string, scopeMask int) string {
	switch sourceName {
	case "dyn_ctx_currentMenu", "tenant_live_menu":
		return "current_menu"
	case "dyn_ctx_currentCode":
		return "current_code"
	case "tenant_knowledge_org_snapshot", "tenant_knowledge_domain_rules":
		return "reference_docs"
	default:
		if strings.HasPrefix(sourceName, "tenant_web_") {
			return "internet_knowledge"
		}
		if strings.Contains(sourceName, "learning") {
			return "learned_memory"
		}
		if strings.Contains(sourceName, "menu") || scopeMask&scopeMenu != 0 {
			return "menu_context"
		}
		if scopeMask&scopeCode != 0 {
			return "attachment_context"
		}
		return "general"
	}
}

func readableHitSourceLabel(sourceName string) string {
	switch sourceName {
	case "dyn_ctx_currentMenu":
		return "active_menu"
	case "dyn_ctx_currentCode":
		return "active_code"
	case "tenant_live_menu":
		return "live_app_menu"
	case "tenant_knowledge_org_snapshot":
		return "tenant_org_snapshot"
	case "tenant_knowledge_domain_rules":
		return "domain_rules"
	default:
		if strings.HasPrefix(sourceName, "tenant_web_") {
			return "internet_knowledge"
		}
		return sourceName
	}
}

func matchQueryTokens(tokens []string, text string) []string {
	lower := strings.ToLower(text)
	var matched []string
	for _, t := range tokens {
		if len(matched) >= 4 {
			break
		}
		if strings.Contains(lower, t) {
			matched = append(matched, t)
		}
	}
	return matched
}

func computeFreshnessScore(createdAtMs int64) float64 {
	if createdAtMs <= 0 {
		return 0.5
	}
	ageH := float64(time.Now().UnixMilli()-createdAtMs) / 3600_000.0
	if ageH < 1 {
		return 1.0
	}
	if ageH < 24 {
		return 0.85
	}
	if ageH < 168 {
		return 0.6
	}
	return 0.35
}

func roundScore(s float64) float64 {
	return float64(int(s*1000+0.5)) / 1000
}

func buildTenantRAGPromptBlock(hits []data.TenantRAGHit, liveMenuDigest string) string {
	var sb strings.Builder
	if liveMenuDigest != "" {
		sb.WriteString("[LIVE_APP_MENU]\n")
		sb.WriteString(liveMenuDigest)
		sb.WriteString("\n[/LIVE_APP_MENU]\n\n")
	}
	if len(hits) == 0 {
		return sb.String()
	}
	sb.WriteString("[TENANT_RAG]\n")
	for i, h := range hits {
		sb.WriteString(fmt.Sprintf("--- hit %d source=%s score=%.3f ---\n", i+1, h.SourceName, h.Score))
		if h.Summary != "" {
			sb.WriteString(h.Summary)
			sb.WriteByte('\n')
		}
		sb.WriteString(truncateStr(h.Content, 1800))
		sb.WriteString("\n\n")
	}
	sb.WriteString("[/TENANT_RAG]\n\n")
	return truncateStr(sb.String(), tenantRAGDefaultMaxChars)
}

// ToolSearchSSE builds tool_search completed event.
func ToolSearchSSE(req *CodeStreamRequest, rag TenantRAGResult) map[string]any {
	hitMaps := citationsToMaps(rag.Hits)
	return map[string]any{
		"stage":                "tool_search",
		"status":               "completed",
		"requestId":            req.RequestID,
		"message":              "Scoped FTS tenant RAG retrieval completed",
		"scopeMask":            rag.ScopeMask,
		"scopeSummary":         scopeSummary(req.ContextType, rag.ScopeMask),
		"retrievalTopK":        rag.TopK,
		"retrievalHitCount":    rag.HitCount,
		"retrievalSourceCount": rag.SourceCount,
		"retrievalMaxChars":    rag.MaxChars,
		"retrievalQuery":       rag.Query,
		"retrievalEngineLabel": "fts5_bm25_hash_hybrid",
		"retrievalHits":        hitMaps,
		"adaptiveReasons":      []string{"phase2_fts_hybrid"},
	}
}

// RagCitationsSSE builds rag_citations ready event.
func RagCitationsSSE(req *CodeStreamRequest, rag TenantRAGResult) map[string]any {
	return map[string]any{
		"stage":     "rag_citations",
		"status":    "ready",
		"requestId": req.RequestID,
		"phase":     "tool_search",
		"query":     rag.Query,
		"count":     rag.HitCount,
		"citations": citationsToMaps(rag.Hits),
		"message":   fmt.Sprintf("Tenant RAG: %d citations", rag.HitCount),
	}
}

func citationsToMaps(citations []TenantRAGCitation) []map[string]any {
	out := make([]map[string]any, 0, len(citations))
	for _, c := range citations {
		out = append(out, map[string]any{
			"source": c.Source, "chunkId": c.ChunkID, "summary": c.Summary,
			"score": c.Score, "sourceCategory": c.SourceCategory,
			"matchedTokens": c.MatchedTokens, "recent": c.Recent,
			"freshnessScore": c.FreshnessScore, "contentExcerpt": c.ContentExcerpt,
		})
	}
	return out
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
