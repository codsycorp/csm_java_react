package services

import (
	"strings"
	"testing"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
)

func testLearningRecordManager(t *testing.T) (*data.RecordManager, config.AppConfig) {
	t.Helper()
	dir := t.TempDir()
	cfg := config.AppConfig{
		DataDir:         dir,
		NativeDataDir:   dir + "/native",
		PebbleRoot:      dir + "/native/pebble",
		VectorStoreDir:  dir + "/native/vector/chromem",
		EqIndexRoot:     dir + "/native/eq_index",
		EqIndexMode:     "memory",
		AI:              config.AIConfig{ContextDir: dir + "/ai_local"},
	}
	rm, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatalf("NewRecordManager: %v", err)
	}
	return rm, cfg
}

func TestMenuLearningMemoryRecordAndRetrieve(t *testing.T) {
	rm, cfg := testLearningRecordManager(t)
	appID := "banhang"
	menu := `{"menu":[{"id":"m1","label":"Sales","table":[{"f_name":"dvt","f_types":"co","f_header":"ĐVT","f_cbo_query":"{}"}]}]}`
	if err := RecordSuccessfulMenuEdit(cfg, rm, appID, "fix combo co column dvt", menu); err != nil {
		t.Fatalf("record: %v", err)
	}
	block := BuildMenuLearningContextBlock(cfg, rm, appID, "combo co dvt tieng viet", 4000)
	if block == "" {
		t.Fatal("expected menu learning block")
	}
	if !strings.Contains(block, "dvt") && !strings.Contains(block, "co") {
		t.Fatalf("expected combo signal in block: %q", block)
	}
	rows, err := rm.ListAILearningEntries(appID, data.AILearningKindMenu)
	if err != nil || len(rows) != 1 {
		t.Fatalf("pebble rows=%d err=%v", len(rows), err)
	}
}

func TestBuildLearningContextBlockRoutesMenu(t *testing.T) {
	rm, cfg := testLearningRecordManager(t)
	_ = RecordSuccessfulMenuEdit(cfg, rm, "csm", "fix header", `{"menu":[{"id":"1","label":"A"}]}`)
	block := BuildLearningContextBlock(cfg, rm, "csm", "fix header menu", "menu_json", 3000)
	if !strings.Contains(block, "MENU FIXES") {
		t.Fatalf("expected menu learning header, got %q", block)
	}
}

func TestRecordCodeEditFromCompletionMenu(t *testing.T) {
	rm, cfg := testLearningRecordManager(t)
	req := &CodeStreamRequest{
		AppID: "csm", ContextType: "menu_json", Message: "fix co column",
	}
	completion := map[string]any{
		"menuEditorApplyReady": true,
		"flowConfirmedByLocal": true,
		"mergeStats":           map[string]any{"edited": 2},
	}
	menu := `{"menu":[{"id":"m1","table":[{"f_name":"dvt","f_types":"co"}]}]}`
	RecordCodeEditFromCompletion(cfg, rm, req, completion, menu)
	rows, err := rm.ListAILearningEntries("csm", data.AILearningKindMenu)
	if err != nil || len(rows) == 0 {
		t.Fatalf("expected menu learning entry in pebble, err=%v len=%d", err, len(rows))
	}
}

func TestLearningDisabledByEnv(t *testing.T) {
	t.Setenv("AI_MENU_LEARNING_ENABLED", "false")
	rm, cfg := testLearningRecordManager(t)
	if err := RecordSuccessfulMenuEdit(cfg, rm, "csm", "x", `{"menu":[]}`); err != nil {
		t.Fatal(err)
	}
	rows, _ := rm.ListAILearningEntries("csm", data.AILearningKindMenu)
	if len(rows) > 0 {
		t.Fatal("expected no entries when disabled")
	}
}

func TestCodeLearningJSONLFallbackWithoutRM(t *testing.T) {
	dir := t.TempDir()
	cfg := config.AppConfig{AI: config.AIConfig{ContextDir: dir}}
	t.Setenv("AI_LOCAL_LEARNING_STORE", "jsonl")
	err := RecordSuccessfulCodeEdit(cfg, nil, "testapp", "fix timer", "ok", "code", "code_editor", 1)
	if err != nil {
		t.Fatal(err)
	}
	block := BuildLearningContextBlock(cfg, nil, "testapp", "timer fix", "code", 3000)
	if !strings.Contains(block, "timer") {
		t.Fatalf("jsonl fallback block: %q", block)
	}
}
