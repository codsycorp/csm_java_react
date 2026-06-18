package services

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
)

const (
	menuLearningMaxEntries  = 240
	menuLearningRequestMax  = 600
	menuLearningSummaryMax  = 6000
	menuLearningDefaultTopK = 4
)

// MenuLearningEntry is one JSONL line in ai_menu_learning_{appId}.jsonl.
type MenuLearningEntry struct {
	ID          string `json:"id"`
	CreatedAtMs int64  `json:"createdAtMs"`
	RequestText string `json:"requestText"`
	Summary     string `json:"summary"`
	MenuCount   int    `json:"menuCount"`
	Digest      string `json:"digest"`
}

func menuLearningEnabled() bool {
	v := strings.TrimSpace(os.Getenv("AI_MENU_LEARNING_ENABLED"))
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

func codeLearningEnabled() bool {
	v := strings.TrimSpace(os.Getenv("AI_CODE_LEARNING_ENABLED"))
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

func menuLearningPath(cfg config.AppConfig, appID string) string {
	return filepath.Join(cfg.AI.ContextDir, "ai_menu_learning_"+safeAppIDForLearning(appID)+".jsonl")
}

func learningMaxCharsForTier(cfg config.AppConfig, requested int) int {
	if requested <= 0 {
		requested = 8000
	}
	if IsConstrained8GbTier(cfg) {
		if requested > 3500 {
			return 3500
		}
	}
	return requested
}

// BuildMenuLearningContextBlock retrieves top-K past successful menu fixes for this app.
func BuildMenuLearningContextBlock(cfg config.AppConfig, rm *data.RecordManager, appID, requestText string, maxChars int) string {
	if !menuLearningEnabled() {
		return ""
	}
	maxChars = learningMaxCharsForTier(cfg, maxChars)
	entries, err := loadMenuLearningEntries(cfg, rm, appID)
	if err != nil || len(entries) == 0 {
		return ""
	}
	query := strings.ToLower(strings.TrimSpace(requestText))
	if query == "" {
		return ""
	}

	type scored struct {
		entry MenuLearningEntry
		score float64
	}
	var ranked []scored
	for _, e := range entries {
		if s := scoreMenuLearningEntry(query, e); s > 0 {
			ranked = append(ranked, scored{entry: e, score: s})
		}
	}
	if len(ranked) == 0 {
		for i := len(entries) - 1; i >= 0 && len(ranked) < menuLearningDefaultTopK; i-- {
			ranked = append(ranked, scored{entry: entries[i], score: 0.1})
		}
	}
	sort.Slice(ranked, func(i, j int) bool { return ranked[i].score > ranked[j].score })

	var sb strings.Builder
	sb.WriteString("## AUTO-LEARNED MENU FIXES (LOCAL MEMORY)\n")
	sb.WriteString("Use these app-scoped, previously successful menu outcomes as correction memory.\n")
	used := sb.Len()
	count := 0
	for _, item := range ranked {
		if count >= menuLearningDefaultTopK {
			break
		}
		block := formatMenuLearningEntry(item.entry)
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

func formatMenuLearningEntry(e MenuLearningEntry) string {
	req := strings.TrimSpace(e.RequestText)
	sum := strings.TrimSpace(e.Summary)
	if req == "" && sum == "" {
		return ""
	}
	var sb strings.Builder
	sb.WriteString("\n### Learned menu fix ")
	sb.WriteString(e.ID)
	sb.WriteByte('\n')
	if req != "" {
		sb.WriteString("Request: ")
		sb.WriteString(req)
		sb.WriteByte('\n')
	}
	if sum != "" {
		sb.WriteString("Known-good result summary:\n")
		sb.WriteString(sum)
		sb.WriteByte('\n')
	}
	return sb.String()
}

func scoreMenuLearningEntry(query string, entry MenuLearningEntry) float64 {
	return scoreLearningEntry(query, CodeLearningEntry{
		RequestText: entry.RequestText,
		Summary:     entry.Summary,
		CreatedAtMs: entry.CreatedAtMs,
	})
}

func loadMenuLearningEntriesJSONL(cfg config.AppConfig, appID string) ([]MenuLearningEntry, error) {
	path := menuLearningPath(cfg, appID)
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	defer f.Close()
	var entries []MenuLearningEntry
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var e MenuLearningEntry
		if json.Unmarshal([]byte(line), &e) == nil && e.ID != "" {
			entries = append(entries, e)
		}
	}
	return entries, sc.Err()
}

// RecordSuccessfulMenuEdit persists a successful menu fix (Pebble DB by default).
func RecordSuccessfulMenuEdit(cfg config.AppConfig, rm *data.RecordManager, appID, requestText, menuJSON string) error {
	if !menuLearningEnabled() {
		return nil
	}
	summary := summarizeMenuLearningFromJSON(menuJSON)
	if summary == "" {
		return nil
	}
	entry := buildMenuLearningEntry(requestText, summary, CountMenuNodesFromDraft(menuJSON))
	if entry.Digest == "" {
		return nil
	}

	mu := learningLock(appID)
	mu.Lock()
	defer mu.Unlock()

	entries, err := loadMenuLearningEntries(cfg, rm, appID)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.Digest == entry.Digest {
			return nil
		}
	}
	return persistMenuLearningEntry(cfg, rm, appID, entry)
}

func buildMenuLearningEntry(requestText, summary string, menuCount int) MenuLearningEntry {
	req := truncateStr(strings.TrimSpace(requestText), menuLearningRequestMax)
	sum := truncateStr(strings.TrimSpace(summary), menuLearningSummaryMax)
	if req == "" && sum == "" {
		return MenuLearningEntry{}
	}
	return buildMenuLearningEntryFromParts(req, sum, menuCount)
}

func buildMenuLearningEntryFromParts(req, sum string, menuCount int) MenuLearningEntry {
	entry := buildLearningEntry(req, sum, "menu_json", "menu_manager", 1)
	return MenuLearningEntry{
		ID:          strings.Replace(entry.ID, "codelearn-", "menulearn-", 1),
		CreatedAtMs: entry.CreatedAtMs,
		RequestText: entry.RequestText,
		Summary:     entry.Summary,
		MenuCount:   menuCount,
		Digest:      entry.Digest,
	}
}

func rewriteMenuLearningFile(cfg config.AppConfig, appID string, entries []MenuLearningEntry) error {
	path := menuLearningPath(cfg, appID)
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

func summarizeMenuLearningFromJSON(menuJSON string) string {
	menuJSON = strings.TrimSpace(menuJSON)
	if menuJSON == "" {
		return ""
	}
	var root any
	if err := json.Unmarshal([]byte(menuJSON), &root); err != nil {
		return ""
	}
	menuList, _ := menuListFromRoot(root)
	if len(menuList) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("Critical rules:\n")
	sb.WriteString("- Preserve nested children and stable parentId/menu_id linkage.\n")
	sb.WriteString("- f_types=co needs f_cbo_query or f_cbo_list; f_header/f_header_en/f_header_zh for i18n columns.\n")
	sb.WriteString("- Use m_icon with Ant Design names when setting icons.\n")

	roots, relations, combos, headers := collectMenuLearningSignals(menuList)
	appendMenuLearningSection(&sb, "Root groups", roots)
	appendMenuLearningSection(&sb, "Parent-child relations", relations)
	appendMenuLearningSection(&sb, "Combo columns (f_types=co)", combos)
	appendMenuLearningSection(&sb, "i18n headers", headers)
	return truncateStr(strings.TrimSpace(sb.String()), menuLearningSummaryMax)
}

func collectMenuLearningSignals(menuList []any) (roots, relations, combos, headers []string) {
	seen := map[string]struct{}{}
	add := func(slot *[]string, s string) {
		s = strings.TrimSpace(s)
		if s == "" {
			return
		}
		if _, ok := seen[s]; ok {
			return
		}
		seen[s] = struct{}{}
		*slot = append(*slot, s)
	}
	var walk func([]any, string)
	walk = func(nodes []any, parent string) {
		for _, item := range nodes {
			node, ok := item.(map[string]any)
			if !ok {
				continue
			}
			label := firstNonBlankStr(node["label_vi"], node["label"], node["name"], node["id"])
			id := strings.TrimSpace(stringFromAny(node["id"]))
			if parent == "" {
				add(&roots, label)
			} else {
				add(&relations, parent+" → "+label)
			}
			if table, ok := node["table"].([]any); ok {
				for _, col := range table {
					row, ok := col.(map[string]any)
					if !ok {
						continue
					}
					fname := strings.TrimSpace(stringFromAny(row["f_name"]))
					ftype := strings.TrimSpace(stringFromAny(row["f_types"]))
					if fname != "" && ftype == "co" {
						add(&combos, id+"."+fname+" (co)")
					}
					h := strings.TrimSpace(stringFromAny(row["f_header"]))
					hen := strings.TrimSpace(stringFromAny(row["f_header_en"]))
					if fname != "" && (h != "" || hen != "") {
						add(&headers, fname+": vi="+h+" en="+hen)
					}
				}
			}
			if children, ok := node["children"].([]any); ok {
				walk(children, label)
			}
		}
	}
	walk(menuList, "")
	return
}

func appendMenuLearningSection(sb *strings.Builder, title string, items []string) {
	if len(items) == 0 {
		return
	}
	sb.WriteString("\n")
	sb.WriteString(title)
	sb.WriteString(":\n")
	for _, item := range items {
		sb.WriteString("- ")
		sb.WriteString(item)
		sb.WriteByte('\n')
	}
}

func firstNonBlankStr(vals ...any) string {
	for _, v := range vals {
		s := strings.TrimSpace(stringFromAny(v))
		if s != "" {
			return s
		}
	}
	return ""
}

// BuildLearningContextBlock retrieves past successful edits (menu or code) for the current request.
func BuildLearningContextBlock(cfg config.AppConfig, rm *data.RecordManager, appID, requestText, contextType string, maxChars int) string {
	maxChars = learningMaxCharsForTier(cfg, maxChars)
	if isMenuJSONContext(contextType) {
		return BuildMenuLearningContextBlock(cfg, rm, appID, requestText, maxChars)
	}
	if !codeLearningEnabled() {
		return ""
	}
	return buildCodeLearningContextBlock(cfg, rm, appID, requestText, contextType, maxChars)
}
