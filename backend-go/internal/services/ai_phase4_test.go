package services

import (
	"testing"
)

func TestPassesRetrievalAuthFilterAdminSeesAll(t *testing.T) {
	auth := RetrievalAuthContext{IsAdminOrDev: true, FilterEnabled: true}
	if !PassesRetrievalAuthFilter("acl:admin,acl:tenant", auth) {
		t.Fatal("admin should pass all tags")
	}
}

func TestPassesRetrievalAuthFilterBlocksAdminTag(t *testing.T) {
	auth := RetrievalAuthContext{Authenticated: true, FilterEnabled: true}
	if PassesRetrievalAuthFilter("acl:admin", auth) {
		t.Fatal("non-admin should not see acl:admin chunks")
	}
}

func TestPassesRetrievalAuthFilterBranchScope(t *testing.T) {
	auth := RetrievalAuthContext{Authenticated: true, BranchID: "hn", FilterEnabled: true}
	if PassesRetrievalAuthFilter("acl:tenant,branch:sg", auth) {
		t.Fatal("branch mismatch should be filtered")
	}
	if !PassesRetrievalAuthFilter("acl:tenant,branch:hn", auth) {
		t.Fatal("matching branch should pass")
	}
}

func TestScanAttachmentsJSON(t *testing.T) {
	scan := ScanAttachments([]AiAttachment{{
		Name: "menu.json", MimeType: "application/json", Kind: "json",
		TextContent: `{"menu":[{"id":"a","label":"Test"}]}`,
	}}, "menu_json")
	if scan.TotalCount != 1 || scan.JSONCount != 1 {
		t.Fatalf("scan=%+v", scan)
	}
	if scan.CompactContext == "" {
		t.Fatal("expected compact context")
	}
}

func TestMultimodalRouteGuardBlocksImageWithoutVision(t *testing.T) {
	scan := ScanAttachments([]AiAttachment{{Name: "ui.png", MimeType: "image/png", Kind: "image"}}, "code")
	blocked, reason := MultimodalRouteGuard(scan, false)
	if !blocked || reason != "blocked_missing_local_vision" {
		t.Fatalf("blocked=%v reason=%s", blocked, reason)
	}
}

func TestParseAttachmentsFromParams(t *testing.T) {
	params := map[string]any{
		"attachments": []any{
			map[string]any{"name": "spec.md", "textContent": "# ERP spec", "kind": "markdown"},
		},
	}
	got := ParseAttachmentsFromParams(params)
	if len(got) != 1 || got[0].Name != "spec.md" {
		t.Fatalf("got %+v", got)
	}
}

func TestValidateModuleNodeSoftEmptyWhenPassed(t *testing.T) {
	roots := []any{map[string]any{"id": "mod1", "label": "Module", "type_form": 1, "table": []any{}}}
	if detail := validateModuleNodeSoft(roots, "mod1"); detail != "" {
		t.Fatalf("unexpected detail: %q", detail)
	}
}

func TestReplanGreenfieldModuleNodeRepairsTrigger(t *testing.T) {
	node := map[string]any{"id": "x", "label": "Bán hàng", "type_form": 1, "trigger": "bad"}
	replanGreenfieldModuleNode(node, "ERP bán hàng")
	tr, ok := node["trigger"].(map[string]any)
	if !ok {
		t.Fatal("replan should upgrade trigger to structured map")
	}
	if tr["load_db"] == nil {
		t.Fatal("expected grid trigger defaults after replan")
	}
	if node["label_en"] == nil {
		t.Fatal("expected deterministic i18n after replan")
	}
}
