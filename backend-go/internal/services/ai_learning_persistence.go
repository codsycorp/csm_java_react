package services

import (
	"os"
	"strings"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
)

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
	if learningUsesPebble(rm) {
		if err := rm.UpsertAILearningEntry(codeEntryToPebble(entry, appID)); err != nil {
			return err
		}
		return rm.PruneAILearningEntries(appID, data.AILearningKindCode, codeLearningMaxEntries)
	}
	return appendCodeLearningJSONL(cfg, appID, entry)
}

func persistMenuLearningEntry(cfg config.AppConfig, rm *data.RecordManager, appID string, entry MenuLearningEntry) error {
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
