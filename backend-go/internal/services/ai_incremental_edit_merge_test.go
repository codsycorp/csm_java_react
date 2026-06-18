package services

import (
	"strings"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestPickIncrementalEditPayloadPrefersPatches(t *testing.T) {
	outputs := []string{
		"### Step 1 prose findings",
		`{"status":"success","patches":[{"action":"edit","nodeId":"n1","after":{"label":"Fixed"}}]}`,
		"## Kết luận\nSome prose synthesis that should not win",
	}
	got := pickIncrementalEditPayload(outputs)
	if !strings.Contains(got, `"patches"`) {
		t.Fatalf("expected patches payload, got %q", got)
	}
}

func TestApplyMenuTableFieldTextEdits(t *testing.T) {
	base := `{"menu":[{"id":"m1","table":[{"id":"m1@@@@@dvt","f_name":"dvt","f_types":"co","f_cbo_query":""}]}]}`
	ai := `{"summary":"fix combo","textEdits":[{"id":"m1@@@@@dvt","f_name":"dvt","f_types":"co","f_cbo_query":"{\"query\":[]}"}]}`
	got := ApplyMenuTableFieldTextEdits(base, ai)
	if got == "" || !strings.Contains(got, "query") {
		t.Fatalf("expected merged menu with f_cbo_query, got %q", got)
	}
}

func TestMergeIncrementalMenuEditRejectsProse(t *testing.T) {
	base := `{"menu":[{"id":"m1","label":"A"}]}`
	prose := "## Kết luận\nEditor menu trống\n```json\n{\"menu\":[]}\n```"
	if got := MergeIncrementalMenuEdit(base, prose); got != "" && strings.HasPrefix(got, "##") {
		t.Fatalf("unexpected prose merge: %q", got)
	}
}

func TestShouldUseIncrementalPlanExecuteMenuEdit(t *testing.T) {
	cfg := configZero()
	req := &CodeStreamRequest{
		ContextType: "menu_json",
		Message:     "Cột combo co không có giá trị khi chọn tiếng Việt",
		CurrentCode: `{"menu":[{"id":"m1","table":[{"f_name":"dvt","f_types":"co"}]}]}`,
	}
	phase1 := RunPhase1PipelineContext{ResponseMode: "edit"}
	if !ShouldUseIncrementalPlanExecute(cfg, req, phase1) {
		t.Fatal("expected slice-based incremental for menu edit")
	}
	plan := PlanEditTask(req, "edit")
	if !plan.Enabled || len(plan.Slices) == 0 {
		t.Fatalf("expected edit task slices, got %+v", plan)
	}
}

func TestBuildMenuCompletionMergePreviewTableFieldNodeId(t *testing.T) {
	base := `{"menu":[{"id":"20140520121442160","table":[{"id":"20140520121442160@@@@@dvt","f_name":"dvt","f_types":"co","f_cbo_query":""}]}]}`
	ai := `{"status":"success","patches":[{"action":"edit","nodeId":"20140520121442160@@@@@dvt","after":{"f_name":"dvt","f_types":"co","f_cbo_query":"{\"query\":[]}"}}]}`
	preview := BuildMenuCompletionMergePreview(base, ai)
	if !strings.Contains(preview.MergedResponse, "f_cbo_query") {
		t.Fatalf("expected merged menu with f_cbo_query, got %q", preview.MergedResponse)
	}
	if preview.Edited < 1 {
		t.Fatalf("edited=%d want >=1", preview.Edited)
	}
	if !IsPublishableMenuDraft(preview.MergedResponse) {
		t.Fatal("merged response should be publishable menu draft")
	}
}

func configZero() config.AppConfig { return config.AppConfig{} }
