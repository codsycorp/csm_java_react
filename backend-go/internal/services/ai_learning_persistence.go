package services

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
)

func learningJournalEnabled() bool {
	v := strings.TrimSpace(os.Getenv("AI_LOCAL_LEARNING_JOURNAL_ENABLED"))
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

func learningJournalPath(cfg config.AppConfig, appID string, kind string) string {
	k := strings.ToLower(strings.TrimSpace(kind))
	if k == "" {
		k = "code"
	}
	return filepath.Join(cfg.AI.ContextDir, "ai_learning_journal_"+k+"_"+safeAppIDForLearning(appID)+".jsonl")
}

func appendLearningJournalLine(cfg config.AppConfig, appID string, kind string, payload any) error {
	if !learningJournalEnabled() {
		return nil
	}
	path := learningJournalPath(cfg, appID, kind)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := f.Write(append(b, '\n')); err != nil {
		return err
	}
	return nil
}

func appendCodeLearningJournal(cfg config.AppConfig, appID string, entry CodeLearningEntry) error {
	return appendLearningJournalLine(cfg, appID, "code", entry)
}

func appendMenuLearningJournal(cfg config.AppConfig, appID string, entry MenuLearningEntry) error {
	return appendLearningJournalLine(cfg, appID, "menu", entry)
}

func loadCodeLearningJournalEntries(cfg config.AppConfig, appID string) ([]CodeLearningEntry, error) {
	if !learningJournalEnabled() {
		return nil, nil
	}
	path := learningJournalPath(cfg, appID, "code")
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
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var e CodeLearningEntry
		if json.Unmarshal([]byte(line), &e) == nil && strings.TrimSpace(e.ID) != "" {
			entries = append(entries, e)
		}
	}
	return entries, sc.Err()
}

func loadMenuLearningJournalEntries(cfg config.AppConfig, appID string) ([]MenuLearningEntry, error) {
	if !learningJournalEnabled() {
		return nil, nil
	}
	path := learningJournalPath(cfg, appID, "menu")
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
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var e MenuLearningEntry
		if json.Unmarshal([]byte(line), &e) == nil && strings.TrimSpace(e.ID) != "" {
			entries = append(entries, e)
		}
	}
	return entries, sc.Err()
}

func learningUsesPebble(rm *data.RecordManager) bool {
	if rm == nil {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(os.Getenv("AI_LOCAL_LEARNING_STORE"))) {
	case "jsonl", "file":
		return false
	case "pebble", "database", "db":
		return true
	default:
		return true
	}
}

func learningMigrateJSONLEnabled() bool {
	v := strings.TrimSpace(os.Getenv("AI_LOCAL_LEARNING_MIGRATE_JSONL"))
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

func codeEntryToPebble(e CodeLearningEntry, appID string) data.AILearningEntry {
	return data.AILearningEntry{
		ID:           e.ID,
		AppID:        appID,
		Kind:         string(data.AILearningKindCode),
		Digest:       e.Digest,
		CreatedAtMs:  e.CreatedAtMs,
		RequestText:  e.RequestText,
		Summary:      e.Summary,
		ContextType:  e.ContextType,
		TargetFile:   e.TargetFile,
		PatchOpCount: e.PatchOpCount,
	}
}

func menuEntryToPebble(e MenuLearningEntry, appID string) data.AILearningEntry {
	return data.AILearningEntry{
		ID:          e.ID,
		AppID:       appID,
		Kind:        string(data.AILearningKindMenu),
		Digest:      e.Digest,
		CreatedAtMs: e.CreatedAtMs,
		RequestText: e.RequestText,
		Summary:     e.Summary,
		MenuCount:   e.MenuCount,
		ContextType: "menu_json",
	}
}

func pebbleToCodeEntry(e data.AILearningEntry) CodeLearningEntry {
	return CodeLearningEntry{
		ID:           e.ID,
		CreatedAtMs:  e.CreatedAtMs,
		RequestText:  e.RequestText,
		Summary:      e.Summary,
		ContextType:  e.ContextType,
		TargetFile:   e.TargetFile,
		PatchOpCount: e.PatchOpCount,
		Digest:       e.Digest,
	}
}

func pebbleToMenuEntry(e data.AILearningEntry) MenuLearningEntry {
	return MenuLearningEntry{
		ID:          e.ID,
		CreatedAtMs: e.CreatedAtMs,
		RequestText: e.RequestText,
		Summary:     e.Summary,
		MenuCount:   e.MenuCount,
		Digest:      e.Digest,
	}
}

func maybeMigrateCodeLearningJSONL(cfg config.AppConfig, rm *data.RecordManager, appID string) {
	if !learningMigrateJSONLEnabled() || !learningUsesPebble(rm) {
		return
	}
	existing, _ := rm.ListAILearningEntries(appID, data.AILearningKindCode)
	if len(existing) > 0 {
		return
	}
	entries, err := loadCodeLearningEntriesJSONL(cfg, appID)
	if err != nil || len(entries) == 0 {
		return
	}
	for _, e := range entries {
		_ = rm.UpsertAILearningEntry(codeEntryToPebble(e, appID))
	}
}

func maybeMigrateMenuLearningJSONL(cfg config.AppConfig, rm *data.RecordManager, appID string) {
	if !learningMigrateJSONLEnabled() || !learningUsesPebble(rm) {
		return
	}
	existing, _ := rm.ListAILearningEntries(appID, data.AILearningKindMenu)
	if len(existing) > 0 {
		return
	}
	entries, err := loadMenuLearningEntriesJSONL(cfg, appID)
	if err != nil || len(entries) == 0 {
		return
	}
	for _, e := range entries {
		_ = rm.UpsertAILearningEntry(menuEntryToPebble(e, appID))
	}
}

func loadCodeLearningEntries(cfg config.AppConfig, rm *data.RecordManager, appID string) ([]CodeLearningEntry, error) {
	if learningUsesPebble(rm) {
		maybeMigrateCodeLearningJSONL(cfg, rm, appID)
		rows, err := rm.ListAILearningEntries(appID, data.AILearningKindCode)
		if err != nil {
			return nil, err
		}
		out := make([]CodeLearningEntry, 0, len(rows))
		for _, r := range rows {
			out = append(out, pebbleToCodeEntry(r))
		}
		return out, nil
	}
	return loadCodeLearningEntriesJSONL(cfg, appID)
}

func loadMenuLearningEntries(cfg config.AppConfig, rm *data.RecordManager, appID string) ([]MenuLearningEntry, error) {
	if learningUsesPebble(rm) {
		maybeMigrateMenuLearningJSONL(cfg, rm, appID)
		rows, err := rm.ListAILearningEntries(appID, data.AILearningKindMenu)
		if err != nil {
			return nil, err
		}
		out := make([]MenuLearningEntry, 0, len(rows))
		for _, r := range rows {
			out = append(out, pebbleToMenuEntry(r))
		}
		return out, nil
	}
	return loadMenuLearningEntriesJSONL(cfg, appID)
}

func persistCodeLearningEntry(cfg config.AppConfig, rm *data.RecordManager, appID string, entry CodeLearningEntry) error {
	if err := appendCodeLearningJournal(cfg, appID, entry); err != nil {
		return err
	}
	if learningUsesPebble(rm) {
		if err := rm.UpsertAILearningEntry(codeEntryToPebble(entry, appID)); err != nil {
			return err
		}
		return rm.PruneAILearningEntries(appID, data.AILearningKindCode, codeLearningMaxEntries)
	}
	return appendCodeLearningJSONL(cfg, appID, entry)
}

func persistMenuLearningEntry(cfg config.AppConfig, rm *data.RecordManager, appID string, entry MenuLearningEntry) error {
	if err := appendMenuLearningJournal(cfg, appID, entry); err != nil {
		return err
	}
	if learningUsesPebble(rm) {
		if err := rm.UpsertAILearningEntry(menuEntryToPebble(entry, appID)); err != nil {
			return err
		}
		return rm.PruneAILearningEntries(appID, data.AILearningKindMenu, menuLearningMaxEntries)
	}
	return appendMenuLearningJSONL(cfg, appID, entry)
}

func appendCodeLearningJSONL(cfg config.AppConfig, appID string, entry CodeLearningEntry) error {
	entries, err := loadCodeLearningEntriesJSONL(cfg, appID)
	if err != nil {
		return err
	}
	entries = append(entries, entry)
	if len(entries) > codeLearningMaxEntries {
		entries = entries[len(entries)-codeLearningMaxEntries:]
	}
	return rewriteCodeLearningFile(cfg, appID, entries)
}

func appendMenuLearningJSONL(cfg config.AppConfig, appID string, entry MenuLearningEntry) error {
	entries, err := loadMenuLearningEntriesJSONL(cfg, appID)
	if err != nil {
		return err
	}
	entries = append(entries, entry)
	if len(entries) > menuLearningMaxEntries {
		entries = entries[len(entries)-menuLearningMaxEntries:]
	}
	return rewriteMenuLearningFile(cfg, appID, entries)
}
