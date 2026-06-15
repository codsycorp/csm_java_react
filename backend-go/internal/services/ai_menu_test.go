package services

import (
	"encoding/json"
	"testing"
)

func TestNormalizeMenuDraftJson(t *testing.T) {
	in := `{"menu":[{"id":"m1","label":"Sales","type_form":1}]}`
	got := NormalizeMenuDraftJson(in)
	if got == "" {
		t.Fatal("expected normalized menu json")
	}
	if CountMenuNodesFromDraft(got) != 1 {
		t.Fatalf("nodes=%d want 1", CountMenuNodesFromDraft(got))
	}
}

func TestDiffMergeTreesPreservesBaseNodes(t *testing.T) {
	old := `{"menu":[{"id":"a","label":"A","children":[{"id":"b","label":"B"}]}]}`
	newJSON := `{"menu":[{"id":"a","label":"A Updated"}]}`
	out, err := DiffMergeTrees(old, newJSON)
	if err != nil {
		t.Fatalf("merge: %v", err)
	}
	if out.Edited != 1 {
		t.Fatalf("edited=%d want 1", out.Edited)
	}
	if out.Deleted != 1 {
		t.Fatalf("deleted=%d want 1 (informational)", out.Deleted)
	}
	b, _ := json.Marshal(map[string]any{"menu": out.MergedMenu})
	merged := NormalizeMenuDraftJson(string(b))
	if CountMenuNodesFromDraft(merged) < 2 {
		t.Fatalf("base-preserving merge lost child nodes: %s", merged)
	}
}

func TestBuildMenuCompletionMergePreviewPatchEnvelope(t *testing.T) {
	base := `{"menu":[{"id":"n1","label":"Old","type_form":1}]}`
	ai := `{"status":"success","patches":[{"action":"edit","nodeId":"n1","after":{"label":"New"}}]}`
	preview := BuildMenuCompletionMergePreview(base, ai)
	if preview.MergedResponse == "" {
		t.Fatal("expected merged response")
	}
	if preview.Edited < 1 {
		t.Fatalf("edited=%d want >=1", preview.Edited)
	}
}

func TestBuildLineTextEdits(t *testing.T) {
	before := "line1\nline2\nline3"
	after := "line1\nLINE2\nline3"
	edits := BuildLineTextEdits(before, after)
	if len(edits) != 1 {
		t.Fatalf("edits=%d want 1", len(edits))
	}
	if edits[0].StartLine != 2 || edits[0].EndLine != 2 {
		t.Fatalf("unexpected line range: %+v", edits[0])
	}
}

func TestCodeStreamCompletionMenuEdit(t *testing.T) {
	req := &CodeStreamRequest{
		RequestID: "job_test", ContextType: "menu_json", ResponseMode: "edit",
	}
	base := `{"menu":[{"id":"n1","label":"Old","type_form":1}]}`
	ai := `{"status":"success","patches":[{"action":"edit","nodeId":"n1","after":{"label":"New"}}]}`
	complete := CodeStreamCompletion(req, ai, base, "local_provider", 100)
	if complete["menuEditorApplyReady"] != true {
		t.Fatalf("menuEditorApplyReady missing: %+v", complete)
	}
	if complete["flowConfirmedByLocal"] != true {
		t.Fatal("flowConfirmedByLocal missing")
	}
	full, _ := complete["fullResponse"].(string)
	if full == "" {
		t.Fatal("expected fullResponse")
	}
}

func TestMenuApplyCache(t *testing.T) {
	CacheMenuEditorApplyPayload("req-1", `{"menu":[]}`, map[string]any{"edited": 1})
	got, stats, ok := TakeMenuEditorApplyPayload("req-1")
	if !ok || got == "" {
		t.Fatal("cache miss")
	}
	if stats["edited"] != 1 {
		t.Fatalf("stats=%v", stats)
	}
	_, _, ok2 := TakeMenuEditorApplyPayload("req-1")
	if ok2 {
		t.Fatal("cache entry should be one-shot")
	}
}
