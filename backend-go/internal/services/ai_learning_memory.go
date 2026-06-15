package services

import (
	"bufio"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"csm_server/backend-go/internal/config"
)

const (
	codeLearningMaxEntries   = 240
	codeLearningRequestMax   = 600
	codeLearningSummaryMax   = 6000
	codeLearningTargetMax    = 240
	codeLearningDefaultTopK  = 4
)

// CodeLearningEntry is one JSONL line in ai_code_learning_{appId}.jsonl.
type CodeLearningEntry struct {
	ID           string `json:"id"`
	CreatedAtMs  int64  `json:"createdAtMs"`
	RequestText  string `json:"requestText"`
	Summary      string `json:"summary"`
	ContextType  string `json:"contextType"`
	TargetFile   string `json:"targetFile"`
	PatchOpCount int    `json:"patchOpCount"`
	Digest       string `json:"digest"`
}

var learningMemoryLocks sync.Map // appId -> *sync.Mutex

func learningLock(appID string) *sync.Mutex {
	v, _ := learningMemoryLocks.LoadOrStore(safeAppIDForLearning(appID), &sync.Mutex{})
	return v.(*sync.Mutex)
}

func safeAppIDForLearning(appID string) string {
	s := strings.TrimSpace(appID)
	if s == "" {
		return "csm"
	}
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteByte('_')
		}
	}
	out := b.String()
	if out == "" {
		return "csm"
	}
	return out
}

func codeLearningPath(cfg config.AppConfig, appID string) string {
	return filepath.Join(cfg.AI.ContextDir, "ai_code_learning_"+safeAppIDForLearning(appID)+".jsonl")
}

// BuildLearningContextBlock retrieves top-K past successful edits (keyword + recency).
func BuildLearningContextBlock(cfg config.AppConfig, appID, requestText, contextType string, maxChars int) string {
	if maxChars <= 0 {
		maxChars = 10_000
	}
	entries, err := loadCodeLearningEntries(cfg, appID)
	if err != nil || len(entries) == 0 {
		return ""
	}
	query := strings.ToLower(strings.TrimSpace(requestText))
	if query == "" {
		return ""
	}

	type scored struct {
		entry CodeLearningEntry
		score float64
	}
	var ranked []scored
	for _, e := range entries {
		if contextType != "" && e.ContextType != "" && e.ContextType != contextType {
			continue
		}
		s := scoreLearningEntry(query, e)
		if s > 0 {
			ranked = append(ranked, scored{entry: e, score: s})
		}
	}
	if len(ranked) == 0 {
		// Fallback: most recent entries for same context type.
		for i := len(entries) - 1; i >= 0 && len(ranked) < codeLearningDefaultTopK; i-- {
			e := entries[i]
			if contextType == "" || e.ContextType == contextType || e.ContextType == "" {
				ranked = append(ranked, scored{entry: e, score: 0.1})
			}
		}
	}
	sort.Slice(ranked, func(i, j int) bool { return ranked[i].score > ranked[j].score })

	var sb strings.Builder
	sb.WriteString("## AUTO-LEARNED CODE FIXES (LOCAL MEMORY)\n")
	used := sb.Len()
	count := 0
	for _, item := range ranked {
		if count >= codeLearningDefaultTopK {
			break
		}
		block := formatLearningEntry(item.entry)
		if used+len(block) > maxChars {
			break
		}
		sb.WriteString(block)
		used += len(block)
		count++
	}
	if count == 0 {
		return ""
	}
	return truncateStr(sb.String(), maxChars)
}

func formatLearningEntry(e CodeLearningEntry) string {
	req := strings.TrimSpace(e.RequestText)
	sum := strings.TrimSpace(e.Summary)
	if req == "" && sum == "" {
		return ""
	}
	var sb strings.Builder
	sb.WriteString("\n### Past fix ")
	sb.WriteString(e.ID)
	sb.WriteByte('\n')
	if req != "" {
		sb.WriteString("- Request: ")
		sb.WriteString(req)
		sb.WriteByte('\n')
	}
	if sum != "" {
		sb.WriteString("- Outcome: ")
		sb.WriteString(sum)
		sb.WriteByte('\n')
	}
	return sb.String()
}

func scoreLearningEntry(query string, entry CodeLearningEntry) float64 {
	text := strings.ToLower(entry.RequestText + " " + entry.Summary)
	if text == "" {
		return 0
	}
	qTokens := tokenizeForLearning(query)
	if len(qTokens) == 0 {
		return 0
	}
	eTokens := tokenizeForLearning(text)
	if len(eTokens) == 0 {
		return 0
	}
	eSet := make(map[string]struct{}, len(eTokens))
	for _, t := range eTokens {
		eSet[t] = struct{}{}
	}
	matches := 0
	for _, t := range qTokens {
		if _, ok := eSet[t]; ok {
			matches++
		}
	}
	if matches == 0 {
		return 0
	}
	score := float64(matches) / float64(len(qTokens))
	// Recency boost (up to +0.3 for entries < 7 days).
	ageMs := time.Now().UnixMilli() - entry.CreatedAtMs
	if ageMs < 7*24*3600*1000 {
		score += 0.3 * (1 - float64(ageMs)/float64(7*24*3600*1000))
	}
	return score
}

func tokenizeForLearning(s string) []string {
	s = strings.ToLower(s)
	var tokens []string
	var cur strings.Builder
	flush := func() {
		if cur.Len() >= 2 {
			tokens = append(tokens, cur.String())
		}
		cur.Reset()
	}
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			cur.WriteRune(r)
		} else {
			flush()
		}
	}
	flush()
	return tokens
}

func loadCodeLearningEntries(cfg config.AppConfig, appID string) ([]CodeLearningEntry, error) {
	path := codeLearningPath(cfg, appID)
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	defer f.Close()

	var entries []CodeLearningEntry
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var e CodeLearningEntry
		if json.Unmarshal([]byte(line), &e) == nil && e.ID != "" {
			entries = append(entries, e)
		}
	}
	return entries, sc.Err()
}

// RecordSuccessfulCodeEdit persists a successful edit to JSONL (dedupe by digest).
func RecordSuccessfulCodeEdit(cfg config.AppConfig, appID, requestText, summary, contextType, targetFile string, patchOpCount int) error {
	if strings.TrimSpace(appID) == "" || patchOpCount <= 0 {
		if patchOpCount <= 0 && strings.TrimSpace(summary) == "" {
			return nil
		}
	}
	entry := buildLearningEntry(requestText, summary, contextType, targetFile, patchOpCount)
	if entry.Digest == "" {
		return nil
	}

	mu := learningLock(appID)
	mu.Lock()
	defer mu.Unlock()

	entries, err := loadCodeLearningEntries(cfg, appID)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.Digest == entry.Digest {
			return nil
		}
	}
	entries = append(entries, entry)
	if len(entries) > codeLearningMaxEntries {
		entries = entries[len(entries)-codeLearningMaxEntries:]
	}
	return rewriteCodeLearningFile(cfg, appID, entries)
}

func buildLearningEntry(requestText, summary, contextType, targetFile string, patchOpCount int) CodeLearningEntry {
	req := truncateStr(strings.TrimSpace(requestText), codeLearningRequestMax)
	sum := truncateStr(strings.TrimSpace(summary), codeLearningSummaryMax)
	target := truncateStr(strings.TrimSpace(targetFile), codeLearningTargetMax)
	if req == "" && sum == "" {
		return CodeLearningEntry{}
	}
	digestInput := req + "|" + contextType + "|" + target + "|" + sum
	h := sha256.Sum256([]byte(digestInput))
	digest := base64.URLEncoding.EncodeToString(h[:])
	id := "codelearn-" + digest[:12]
	return CodeLearningEntry{
		ID:           id,
		CreatedAtMs:  time.Now().UnixMilli(),
		RequestText:  req,
		Summary:      sum,
		ContextType:  contextType,
		TargetFile:   target,
		PatchOpCount: patchOpCount,
		Digest:       digest,
	}
}

func rewriteCodeLearningFile(cfg config.AppConfig, appID string, entries []CodeLearningEntry) error {
	path := codeLearningPath(cfg, appID)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	for _, e := range entries {
		b, err := json.Marshal(e)
		if err != nil {
			f.Close()
			os.Remove(tmp)
			return err
		}
		if _, err := f.Write(append(b, '\n')); err != nil {
			f.Close()
			os.Remove(tmp)
			return err
		}
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}

// RecordCodeEditFromCompletion records learning memory after a successful stream completion.
func RecordCodeEditFromCompletion(cfg config.AppConfig, req *CodeStreamRequest, completion map[string]any, rawResult string) {
	if req == nil {
		return
	}
	confirmed, _ := completion["flowConfirmedByLocal"].(bool)
	if !confirmed {
		return
	}
	patchCount := intFromAny(completion["patchOpCount"])
	textCount := intFromAny(completion["textEditsCount"])
	if patchCount <= 0 {
		textCount = intFromAny(completion["codeStreamTextEditsEmittedCount"])
	}
	if patchCount <= 0 && textCount <= 0 {
		return
	}
	if patchCount <= 0 {
		patchCount = textCount
	}
	summary := strings.TrimSpace(rawResult)
	if len(summary) > 400 {
		summary = summary[:400] + "…"
	}
	if summary == "" {
		summary = fmt.Sprintf("Successful %s edit with %d ops", req.ContextType, patchCount)
	}
	_ = RecordSuccessfulCodeEdit(cfg, req.AppID, req.Message, summary, req.ContextType, req.FlowType, patchCount)
}
