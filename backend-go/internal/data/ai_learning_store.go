package data

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

const (
	aiLearningApp   = "_csm"
	aiLearningTable = "ai_learning"
)

// AILearningKind distinguishes menu vs code learning rows.
type AILearningKind string

const (
	AILearningKindMenu AILearningKind = "menu"
	AILearningKindCode AILearningKind = "code"
)

// AILearningEntry is one durable learning row in Pebble (_csm/ai_learning).
type AILearningEntry struct {
	ID           string `json:"id"`
	AppID        string `json:"app_id"`
	Kind         string `json:"kind"`
	Digest       string `json:"digest"`
	CreatedAtMs  int64  `json:"created_at_ms"`
	RequestText  string `json:"request_text"`
	Summary      string `json:"summary"`
	ContextType  string `json:"context_type,omitempty"`
	TargetFile   string `json:"target_file,omitempty"`
	PatchOpCount int    `json:"patch_op_count,omitempty"`
	MenuCount    int    `json:"menu_count,omitempty"`
}

// UpsertAILearningEntry writes one learning row to Pebble (sync commit, survives restart).
func (rm *RecordManager) UpsertAILearningEntry(entry AILearningEntry) error {
	if rm == nil {
		return fmt.Errorf("record manager unavailable")
	}
	entry.AppID = strings.TrimSpace(entry.AppID)
	entry.Kind = strings.TrimSpace(entry.Kind)
	entry.Digest = strings.TrimSpace(entry.Digest)
	entry.ID = strings.TrimSpace(entry.ID)
	if entry.AppID == "" || entry.Kind == "" || entry.Digest == "" || entry.ID == "" {
		return fmt.Errorf("invalid learning entry")
	}
	rec := map[string]any{
		"id":            entry.ID,
		"app_id":        entry.AppID,
		"kind":          entry.Kind,
		"digest":        entry.Digest,
		"created_at_ms": entry.CreatedAtMs,
		"request_text":  entry.RequestText,
		"summary":       entry.Summary,
		"context_type":  entry.ContextType,
		"target_file":   entry.TargetFile,
		"patch_op_count": entry.PatchOpCount,
		"menu_count":    entry.MenuCount,
	}
	_, err := rm.CreateRecord(aiLearningApp, aiLearningTable, rec, []string{"app_id", "kind", "digest"})
	return err
}

// ListAILearningEntries loads learning rows for an app/kind from Pebble (no in-RAM cache).
func (rm *RecordManager) ListAILearningEntries(appID string, kind AILearningKind) ([]AILearningEntry, error) {
	if rm == nil {
		return nil, fmt.Errorf("record manager unavailable")
	}
	appID = strings.TrimSpace(appID)
	if appID == "" {
		return nil, nil
	}
	kindStr := string(kind)
	var out []AILearningEntry
	err := rm.scanTable(aiLearningApp, aiLearningTable, func(_ string, raw []byte) error {
		var rec map[string]any
		if json.Unmarshal(raw, &rec) != nil {
			return nil
		}
		if strings.TrimSpace(fmt.Sprint(rec["app_id"])) != appID {
			return nil
		}
		if strings.TrimSpace(fmt.Sprint(rec["kind"])) != kindStr {
			return nil
		}
		out = append(out, mapToAILearningEntry(rec))
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAtMs < out[j].CreatedAtMs })
	return out, nil
}

// PruneAILearningEntries keeps only the newest maxKeep rows per app/kind on disk.
func (rm *RecordManager) PruneAILearningEntries(appID string, kind AILearningKind, maxKeep int) error {
	if rm == nil || maxKeep <= 0 {
		return nil
	}
	entries, err := rm.ListAILearningEntries(appID, kind)
	if err != nil || len(entries) <= maxKeep {
		return err
	}
	toDrop := entries[:len(entries)-maxKeep]
	for _, e := range toDrop {
		_ = rm.deleteAILearningEntry(e.AppID, e.Kind, e.Digest)
	}
	return nil
}

func (rm *RecordManager) deleteAILearningEntry(appID, kind, digest string) bool {
	if rm == nil {
		return false
	}
	found := false
	_ = rm.scanTable(aiLearningApp, aiLearningTable, func(storageKey string, raw []byte) error {
		var rec map[string]any
		if json.Unmarshal(raw, &rec) != nil {
			return nil
		}
		if fmt.Sprint(rec["app_id"]) == appID && fmt.Sprint(rec["kind"]) == kind && fmt.Sprint(rec["digest"]) == digest {
			found = rm.deleteAtStorageKey(aiLearningApp, aiLearningTable, storageKey)
			return errScanStop
		}
		return nil
	})
	return found
}

func mapToAILearningEntry(rec map[string]any) AILearningEntry {
	return AILearningEntry{
		ID:           strings.TrimSpace(fmt.Sprint(rec["id"])),
		AppID:        strings.TrimSpace(fmt.Sprint(rec["app_id"])),
		Kind:         strings.TrimSpace(fmt.Sprint(rec["kind"])),
		Digest:       strings.TrimSpace(fmt.Sprint(rec["digest"])),
		CreatedAtMs:  int64FromAny(rec["created_at_ms"]),
		RequestText:  strings.TrimSpace(fmt.Sprint(rec["request_text"])),
		Summary:      strings.TrimSpace(fmt.Sprint(rec["summary"])),
		ContextType:  strings.TrimSpace(fmt.Sprint(rec["context_type"])),
		TargetFile:   strings.TrimSpace(fmt.Sprint(rec["target_file"])),
		PatchOpCount: int(int64FromAny(rec["patch_op_count"])),
		MenuCount:    int(int64FromAny(rec["menu_count"])),
	}
}

func int64FromAny(v any) int64 {
	switch x := v.(type) {
	case float64:
		return int64(x)
	case int64:
		return x
	case int:
		return int64(x)
	case json.Number:
		n, _ := x.Int64()
		return n
	default:
		return 0
	}
}
