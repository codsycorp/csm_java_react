package services

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"

	"csm_server/backend-go/internal/config"
)

const mapReduceMaxSourceChars = 500_000

// MapReduceAnalyzeInput bundles a map-reduce analyze run.
type MapReduceAnalyzeInput struct {
	FullCode string
	Intent   LocalIntentClassification
}

// ShouldUseMapReduceAnalyze decides whether to run chunked analyze instead of single-shot.
func ShouldUseMapReduceAnalyze(cfg config.AppConfig, req *CodeStreamRequest, phase1 RunPhase1PipelineContext, fullCodeLen int) bool {
	if req == nil || phase1.ResponseMode != "analyze" {
		return false
	}
	ctxType := strings.ToLower(strings.TrimSpace(req.ContextType))
	if ctxType == "menu_json" {
		return false
	}
	if fullCodeLen < MapReduceMinCodeChars(cfg) {
		return false
	}
	if IsBroadAnalysisRequest(req.Message, phase1.Intent) {
		return true
	}
	lower := strings.ToLower(strings.TrimSpace(req.Message))
	if hasAnalyzeIntent(lower) && !hasEditIntent(lower) {
		return true
	}
	editorMax, _, _, _ := ConstrainedPromptSlotCaps(cfg)
	if fullCodeLen > editorMax {
		return true
	}
	return false
}

// MapReduceMinCodeChars returns minimum editor size before map-reduce activates.
func MapReduceMinCodeChars(cfg config.AppConfig) int {
	if v := mapReduceEnvInt("AI_LOCAL_ANALYZE_MAP_REDUCE_MIN_CODE_CHARS", 0); v > 0 {
		return max(8000, v)
	}
	if IsConstrained8GbTier(cfg) {
		return 12_000
	}
	return 30_000
}

// MapReduceChunkPlan returns chunk size, max chunks, and overlap for the active tier.
func MapReduceChunkPlan(cfg config.AppConfig) (chunkChars, maxChunks, overlap int) {
	ctx := int(cfg.EffectiveLlamaContextWindow())
	if IsConstrained8GbTier(cfg) {
		chunkChars = mapReduceEnvInt("AI_LOCAL_RUNTIME_WEAK_PROFILE_MAP_REDUCE_CHUNK_CHARS", 9000)
		maxChunks = mapReduceEnvInt("AI_LOCAL_RUNTIME_WEAK_PROFILE_MAP_REDUCE_MAX_CHUNKS", 5)
		overlap = 700
		return max(4000, chunkChars), max(2, maxChunks), overlap
	}
	if ctx >= 12_000 {
		return 14_000, 5, 1200
	}
	return 10_000, 4, 800
}

// MapReduceChunkMaxTokens caps per-chunk map output on constrained tiers.
func MapReduceChunkMaxTokens(cfg config.AppConfig) uint32 {
	if IsConstrained8GbTier(cfg) {
		return 384
	}
	return 512
}

// MapReduceSynthesisMaxTokens caps final synthesis output.
func MapReduceSynthesisMaxTokens(cfg config.AppConfig) uint32 {
	base := EffectiveInferenceMaxTokens(cfg, "analyze")
	if IsConstrained8GbTier(cfg) {
		if base < 512 {
			return 512
		}
		return base
	}
	if base < 1024 {
		return 1024
	}
	return base
}

// SplitMapReduceChunks splits text into overlapping chunks (Java splitMapReduceChunks parity).
func SplitMapReduceChunks(text string, chunkChars, maxChunks, overlapChars int) []string {
	source := strings.TrimSpace(text)
	if source == "" {
		return nil
	}
	safeChunk := max(4000, chunkChars)
	safeMax := max(1, maxChunks)
	safeOverlap := max(0, min(safeChunk/2, overlapChars))

	var out []string
	cursor := 0
	for cursor < len(source) && len(out) < safeMax {
		end := min(len(source), cursor+safeChunk)
		if end < len(source) {
			if newline := strings.LastIndex(source[cursor:end], "\n"); newline > safeChunk/2 {
				end = cursor + newline
			}
		}
		if end <= cursor {
			end = min(len(source), cursor+safeChunk)
		}
		chunk := strings.TrimSpace(source[cursor:end])
		if chunk != "" {
			out = append(out, chunk)
		}
		if end >= len(source) {
			break
		}
		cursor = max(cursor+1, end-safeOverlap)
	}
	return out
}

// IsBroadAnalysisRequest mirrors Java broad-analysis heuristic (fast path, no extra LLM).
func IsBroadAnalysisRequest(message string, intent LocalIntentClassification) bool {
	text := strings.TrimSpace(message)
	if text == "" {
		return false
	}
	if decision := detectBroadAnalysisHeuristic(text); decision != "" {
		return decision == "broad"
	}
	needsCode := intent.NeedsCodeContext() ||
		strings.EqualFold(intent.NextStep, "load_code_context")
	if !needsCode {
		return false
	}
	lower := strings.ToLower(text)
	if len(lower) >= 70 || countSentenceSeparators(lower) >= 2 {
		return true
	}
	return false
}

func (i LocalIntentClassification) NeedsCodeContext() bool {
	return i.ContextKind == "code" ||
		strings.EqualFold(i.NextStep, "load_code_context") ||
		strings.Contains(strings.ToUpper(i.Type), "CODE")
}

func detectBroadAnalysisHeuristic(message string) string {
	text := strings.ToLower(strings.TrimSpace(message))
	if text == "" {
		return ""
	}
	broadTokens := []string{
		"toan bo", "toàn bộ", "tong the", "tổng thể", "end-to-end", "toi uu tong the",
		"phan tich toan", "phân tích toàn", "luong xu ly", "luồng xử lý", "business logic",
		"kien truc", "kiến trúc", "dong du lieu", "dòng dữ liệu", "module lien quan", "module liên quan",
		"dang xu ly", "đang xử lý", "logic gi", "logic nao", "nhung logic",
	}
	narrowTokens := []string{
		"ham ", "hàm ", "function ", "method ", "class ", "dong ", "dòng ",
		"bug", "fix", "sua", "sửa", "refactor", "variable", "bien ", "biến ",
		"regex", "sql", "api ",
	}
	broadHits, narrowHits := 0, 0
	for _, t := range broadTokens {
		if strings.Contains(text, t) {
			broadHits++
		}
	}
	for _, t := range narrowTokens {
		if strings.Contains(text, t) {
			narrowHits++
		}
	}
	if broadHits >= 1 && narrowHits == 0 {
		return "broad"
	}
	if broadHits >= 2 && narrowHits <= 1 {
		return "broad"
	}
	if narrowHits >= 2 && broadHits == 0 {
		return "narrow"
	}
	if len(text) <= 40 && broadHits == 0 {
		return "narrow"
	}
	return ""
}

func countSentenceSeparators(text string) int {
	n := 0
	for _, ch := range text {
		switch ch {
		case '.', ';', ':', '!', '?':
			n++
		}
	}
	return n
}

func buildMapReduceChunkPrompt(cfg config.AppConfig, req *CodeStreamRequest, codeChunk string, chunkIndex, chunkTotal int) string {
	safeRequest := truncateStr(strings.TrimSpace(req.Message), 1200)
	safeChunk := truncateStr(codeChunk, 18_000)
	langRule := buildPromptLanguageBlock(req.UILang, safeRequest)

	var sb strings.Builder
	sb.WriteString("<|im_start|>system\n")
	sb.WriteString("Ban la AI phan tich code theo cach map-reduce.\n")
	sb.WriteString(langRule)
	sb.WriteString("Phan tich CHI chunk hien tai, khong suy dien vuot qua du lieu trong chunk.\n")
	sb.WriteString("Tra loi ngan gon nhung day du bang chung code cho: muc tieu, luong xu ly, thanh phan/ham, dieu kien/re nhanh, IO-side effects, rui ro.\n")
	sb.WriteString("\n")
	sb.WriteString("<|im_start|>user\n")
	sb.WriteString("YEU_CAU_GOC: ")
	sb.WriteString(safeRequest)
	sb.WriteString("\nCHUNK: ")
	sb.WriteString(strconv.Itoa(chunkIndex))
	sb.WriteString("/")
	sb.WriteString(strconv.Itoa(chunkTotal))
	sb.WriteString("\nCODE_CHUNK:\n")
	sb.WriteString(safeChunk)
	sb.WriteString("\n\n")
	sb.WriteString("<|im_start|>assistant\n")
	return ClampPromptForLocalProvider(cfg, sb.String(), req.ContextType, "analyze")
}

func buildMapReduceSynthesisPrompt(cfg config.AppConfig, req *CodeStreamRequest, chunkAnalyses []string) string {
	safeRequest := truncateStr(strings.TrimSpace(req.Message), 1200)
	langRule := buildPromptLanguageBlock(req.UILang, safeRequest)

	var analyses strings.Builder
	idx := 1
	for _, analysis := range chunkAnalyses {
		safe := truncateStr(strings.TrimSpace(analysis), 4200)
		if safe == "" {
			continue
		}
		analyses.WriteString("### PHAN_TICH_CHUNK_")
		analyses.WriteString(strconv.Itoa(idx))
		analyses.WriteString("\n")
		analyses.WriteString(safe)
		analyses.WriteString("\n\n")
		idx++
	}

	var sb strings.Builder
	sb.WriteString("<|im_start|>system\n")
	sb.WriteString("Ban la AI tong hop ket qua map-reduce cho phan tich code.\n")
	sb.WriteString(langRule)
	sb.WriteString("Bat buoc tra loi du 6 muc: (1) muc tieu nghiep vu (2) luong xu ly chinh (3) thanh phan/ham quan trong (4) dieu kien/re nhanh/edge cases (5) du lieu vao-ra + side effects (6) rui ro + goi y cai thien.\n")
	sb.WriteString("Moi muc phai co bang chung cu the tu code (ten ham, ten bien, buoc xu ly).\n")
	sb.WriteString("\n")
	sb.WriteString("<|im_start|>user\n")
	sb.WriteString("YEU_CAU_GOC: ")
	sb.WriteString(safeRequest)
	sb.WriteString("\n\nKET_QUA_PHAN_TICH_THEO_CHUNK:\n")
	sb.WriteString(analyses.String())
	sb.WriteString("\n")
	sb.WriteString("<|im_start|>assistant\n")
	return ClampPromptForLocalProvider(cfg, sb.String(), req.ContextType, "analyze")
}

func condenseMapReduceSource(fullCode string, cfg config.AppConfig) string {
	source := strings.TrimSpace(fullCode)
	if source == "" {
		return ""
	}
	if len(source) > mapReduceMaxSourceChars {
		source = TruncateMiddle(source, mapReduceMaxSourceChars)
	}
	maxCondensed := 52_000
	if IsConstrained8GbTier(cfg) {
		maxCondensed = 36_000
	}
	if len(source) <= maxCondensed {
		return source
	}
	return TruncateMiddle(source, maxCondensed)
}

// RunMapReduceAnalyze executes map phase (per chunk) then reduce (synthesis).
func RunMapReduceAnalyze(
	ctx context.Context,
	cfg config.AppConfig,
	llama *LlamaService,
	req *CodeStreamRequest,
	fullCode string,
	writeSSE func(map[string]any),
	flush func(),
) (string, error) {
	if llama == nil || !llama.IsAvailable() {
		return "", fmt.Errorf("%s", LocalProviderUnavailableCode)
	}
	sourceCode := strings.TrimSpace(fullCode)
	if sourceCode == "" {
		return "", nil
	}

	condensed := condenseMapReduceSource(sourceCode, cfg)
	chunkChars, maxChunks, overlap := MapReduceChunkPlan(cfg)
	chunks := SplitMapReduceChunks(condensed, chunkChars, maxChunks, overlap)
	if len(chunks) == 0 {
		chunks = []string{TruncateMiddle(condensed, chunkChars)}
	}

	writeSSE(map[string]any{
		"stage": "context_compression", "status": "local_map_reduce_plan",
		"requestId": req.RequestID,
		"message": "Kích hoạt map-reduce local: phân tích theo nhiều chunk rồi tổng hợp để tránh thiếu ý.",
		"chunks": len(chunks), "sourceChars": len(sourceCode), "condensedChars": len(condensed),
		"chunkChars": chunkChars, "constrainedTier": IsConstrained8GbTier(cfg),
	})
	if flush != nil {
		flush()
	}

	chunkTokens := MapReduceChunkMaxTokens(cfg)
	var chunkAnalyses []string
	for i, chunk := range chunks {
		writeSSE(map[string]any{
			"stage": "waiting_gemini", "requestId": req.RequestID,
			"waitState": "local_map_reduce", "localPhase": "chunk_analysis",
			"chunkIndex": i + 1, "chunkTotal": len(chunks),
			"message": fmt.Sprintf("AI local đang phân tích chunk %d/%d", i+1, len(chunks)),
		})
		if flush != nil {
			flush()
		}

		prompt := buildMapReduceChunkPrompt(cfg, req, chunk, i+1, len(chunks))
		text, err := llama.CompleteWithTokens(ctx, prompt, chunkTokens)
		if err != nil {
			writeSSE(map[string]any{
				"stage": "error", "requestId": req.RequestID,
				"reason_code": "local_map_reduce_chunk_error",
				"chunkIndex": i + 1, "chunkTotal": len(chunks),
				"message": err.Error(), "promptChars": len(prompt),
			})
			if flush != nil {
				flush()
			}
			continue
		}
		cleaned := strings.TrimSpace(CleanLocalModelOutput(text))
		if cleaned != "" {
			chunkAnalyses = append(chunkAnalyses, TruncateMiddle(cleaned, 5000))
			writeSSE(map[string]any{
				"stage": "map_reduce_chunk_done", "requestId": req.RequestID,
				"chunkIndex": i + 1, "chunkTotal": len(chunks),
				"summaryChars": len(cleaned),
			})
			if flush != nil {
				flush()
			}
		}
	}

	if len(chunkAnalyses) == 0 {
		return "", fmt.Errorf("map-reduce: no chunk analyses produced")
	}

	writeSSE(map[string]any{
		"stage": "waiting_gemini", "requestId": req.RequestID,
		"waitState": "local_map_reduce", "localPhase": "synthesis",
		"message": "AI local đang tổng hợp kết quả từ các chunk để trả lời đầy đủ.",
	})
	if flush != nil {
		flush()
	}

	synthesisPrompt := buildMapReduceSynthesisPrompt(cfg, req, chunkAnalyses)
	synthesisTokens := MapReduceSynthesisMaxTokens(cfg)

	var full strings.Builder
	streamErr := llama.StreamCompletionWithTokens(ctx, synthesisPrompt, synthesisTokens, func(piece string) error {
		if piece == "" {
			return nil
		}
		full.WriteString(piece)
		writeSSE(map[string]any{
			"stage": "streaming", "requestId": req.RequestID,
			"chunk": piece, "localProviderPrimary": true, "mapReduce": true,
		})
		if flush != nil {
			flush()
		}
		return nil
	})

	result := strings.TrimSpace(CleanLocalModelOutput(full.String()))
	if streamErr != nil || result == "" {
		text, completeErr := llama.CompleteWithTokens(ctx, synthesisPrompt, synthesisTokens)
		if completeErr == nil {
			result = strings.TrimSpace(CleanLocalModelOutput(text))
		}
	}
	if result != "" {
		return result, nil
	}
	return strings.Join(chunkAnalyses, "\n\n"), nil
}

func mapReduceEnvInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
