package services

import (
	"encoding/json"
	"strings"
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
	if !ok2 {
		t.Fatal("cache entry should remain until TTL (retry-safe fetch)")
	}
}

func TestCodeStreamPartsCacheManifestAndMeta(t *testing.T) {
	jobID := "job-stream-cache-1"
	text := strings.Repeat("abc", 7000)
	CacheCodeStreamParts(jobID, text, "done")

	manifest, ok := GetCodeStreamManifest(jobID)
	if !ok {
		t.Fatal("expected manifest from cache")
	}
	if manifest["jobId"] != jobID {
		t.Fatalf("unexpected jobId: %+v", manifest)
	}
	if totalParts, _ := manifest["totalParts"].(int); totalParts < 2 {
		t.Fatalf("expected split into multiple parts, got %+v", manifest)
	}

	meta, ok := GetCodeStreamPartsMeta(jobID, 1, 2)
	if !ok {
		t.Fatal("expected meta from cache")
	}
	items, _ := meta["items"].([]map[string]any)
	if len(items) == 0 {
		t.Fatalf("expected meta items, got %+v", meta)
	}
}

func TestCodeStreamPartsCachePartContent(t *testing.T) {
	jobID := "job-stream-cache-2"
	text := "hello world " + strings.Repeat("x", 18000)
	CacheCodeStreamParts(jobID, text, "done")

	part1, ok := GetCodeStreamPartContent(jobID, 1)
	if !ok {
		t.Fatal("expected part 1")
	}
	if strings.TrimSpace(part1["content"].(string)) == "" {
		t.Fatalf("expected non-empty part content: %+v", part1)
	}

	if _, ok := GetCodeStreamPartContent(jobID, 9999); ok {
		t.Fatal("expected out-of-range part lookup to fail")
	}
}

func TestSanitizeMenuEditorPayloadRemovesTruncationMarker(t *testing.T) {
	broken := `{"menu":[{"id":"a","label":"A"}] /* ... editor truncated for server payload budget ... */ ,"children":[]}`
	got := SanitizeMenuEditorPayload(broken)
	if MenuEditorBaseHealth(got) == "truncated_or_invalid" {
		t.Fatalf("expected sanitized payload to be usable, got health truncated: %s", got)
	}
}

func TestResolveMenuEditEditorBasePrefersFull(t *testing.T) {
	trunc := `{"menu":[{"id":"a","label":"A"}] /* ... editor truncated for server payload budget ... */ broken`
	full := `{"menu":[{"id":"a","label":"A","children":[{"id":"b","label":"B"}]}]}`
	req := &CodeStreamRequest{CurrentCode: trunc, FullCurrentCode: full}
	got := ResolveMenuEditEditorBase(req)
	if CountMenuNodesFromDraft(got) != 2 {
		t.Fatalf("nodes=%d want 2 from full base: %s", CountMenuNodesFromDraft(got), got)
	}
}

func TestSafeMergeRejectsHallucinatedDemoMenu(t *testing.T) {
	base := `{"menu":[{"id":"sales","label":"Sales","children":[{"id":"sales@@@@@dvt","f_name":"dvt","f_types":"co"}]}]}`
	demo := `{"menu":[{"id":"root","label":"Danh mục","children":[{"id":"category1","label":"Danh mục 1","children":[{"id":"product1","label":"Sản phẩm 1"}]}]}]}`
	got := SafeMergeIncrementalMenuEdit(base, base, demo)
	if got != base {
		t.Fatalf("expected base preserved, got %s", got)
	}
}

func TestMenuEditorBaseHealthAllowsLooseJSONWithMenuSignals(t *testing.T) {
	broken := `{"menu":[{"id":"a","table":[{"f_name":"x","f_header":"Tên","f_types":"ed",}]}]}`
	if MenuEditorBaseHealth(broken) == "truncated_or_invalid" {
		t.Fatal("loose JSON with menu signals should not be truncated_or_invalid")
	}
	coerced := CoerceMenuEditorPayload(broken)
	if CountMenuNodesFromDraft(coerced) < 1 {
		t.Fatalf("expected coerced menu nodes, got: %s", coerced)
	}
}

func TestCodeStreamCompletionRejectsIngestTruncatedMenu(t *testing.T) {
	req := &CodeStreamRequest{
		RequestID: "job_trunc", ContextType: "menu_json", ResponseMode: "edit",
		FullCurrentCodeOrigLen:   2_100_000,
		FullCurrentCodeTruncated: true,
	}
	complete := CodeStreamCompletion(req, `{"menu":[{"id":"x"}]}`, "", "local_provider", 1)
	gate, _ := complete["finalOutputGate"].(map[string]any)
	if gate == nil || gate["reasonCode"] != "menu_payload_truncated_at_ingest" {
		t.Fatalf("expected ingest truncation gate: %+v", complete)
	}
}

func TestCodeStreamCompletionRejectsSuspiciousShrink(t *testing.T) {
	large := `{"menu":[{"id":"m1","children":[{"id":"c` + strings.Repeat("x", 120_000) + `","label":"C"}]}]}`
	small := `{"menu":[{"id":"root","label":"Demo"}]}`
	req := &CodeStreamRequest{
		RequestID: "job_shrink", ContextType: "menu_json", ResponseMode: "edit",
		CurrentCode: large, FullCurrentCode: large, FullCurrentCodeOrigLen: len(large),
	}
	complete := CodeStreamCompletion(req, small, large, "local_provider", 1)
	gate, _ := complete["finalOutputGate"].(map[string]any)
	if gate == nil || gate["passed"] != false {
		t.Fatalf("expected shrink rejection: %+v", complete)
	}
}

func TestCodeStreamCompletionAcceptsIncrementalFullMenuWhenBaseTruncated(t *testing.T) {
	trunc := `{"menu":[{"id":"a","label":"A"}] /* ... editor truncated for server payload budget ... */ broken`
	base := `{"menu":[{"id":"m1","table":[{"f_name":"name","f_header":"Tên SP","f_header_en":"Product Name","f_types":"ed"}]}]}`
	fixed := `{"menu":[{"id":"m1","table":[{"f_name":"name","f_header":"Tên SP","f_header_en":"Product Name","f_header_vi":"Tên SP","f_types":"ed"}]}]}`
	req := &CodeStreamRequest{
		RequestID: "job_incr", ContextType: "menu_json", ResponseMode: "edit",
		CurrentCode: trunc, FullCurrentCode: base,
	}
	complete := CodeStreamCompletion(req, fixed, trunc, "local_provider", 100)
	gate, _ := complete["finalOutputGate"].(map[string]any)
	if gate == nil || gate["reasonCode"] == "menu_editor_json_truncated" {
		t.Fatalf("expected completion without truncation gate: %+v", complete)
	}
	if complete["menuEditorApplyReady"] != true {
		t.Fatalf("expected apply ready when result fixes menu: %+v", complete)
	}
}

func TestCodeStreamCompletionRejectsDemoMenuOnLargeBase(t *testing.T) {
	base := `{"menu":[{"id":"sales","label":"Sales","children":[{"id":"child1","label":"C1"},{"id":"child2","label":"C2"}]}]}`
	req := &CodeStreamRequest{
		RequestID: "job_demo", ContextType: "menu_json", ResponseMode: "edit",
		CurrentCode: base, FullCurrentCode: base,
	}
	demo := `{"menu":[{"id":"root","label":"Danh mục","children":[{"id":"category1","label":"Danh mục 1","children":[{"id":"product1","label":"Sản phẩm 1"}]}]}]}`
	complete := CodeStreamCompletion(req, demo, req.FullCurrentCode, "local_provider", 100)
	gate, _ := complete["finalOutputGate"].(map[string]any)
	if gate == nil || gate["passed"] != false {
		t.Fatalf("expected gate rejection: %+v", complete)
	}
}
