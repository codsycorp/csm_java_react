package handlers

import (
	"strings"
	"testing"

	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/security"
	"csm_server/backend-go/internal/util"
)

// TestAdminCreateSubUserGeneratesAppToken mirrors Java TableHandler admin sub-user creation:
// when an admin (main account in csm_accounts) creates a sub-user on csm_group_members,
// the backend must generate app_token = CsmEncrypt(appID_____loginID_____user_____0)
// using the admin's own app_id, persist app_id aligned with admin app scope, and seed canonical fields.
func TestAdminCreateSubUserGeneratesAppToken(t *testing.T) {
	rm := testLookupRecordManager(t)
	h := &TableHandler{rm: rm}
	access := &security.UserAccessContext{
		IsAdmin:                 true,
		IsDev:                   false,
		IsSubUser:               false,
		AppID:                   "myapp",
		Permissions:             []string{"admin", "scope:all", "view", "create", "edit", "delete"},
		OwnerCandidates:         []string{"admin-1"},
		ParentAccountCandidates: []string{"admin-1"},
	}

	out := map[string]any{}
	params := map[string]any{
		"app_id":  "myapp",
		"command": "create",
		"obj_update": map[string]any{
			"id":               "sub-1",
			"login_identifier": "sub1",
			"pass":             "rawpass123",
		},
	}
	result := h.handleUpdateOperation(out, params, "csm", "csm_group_members", model.SearchFilter{}, access)
	if success, _ := result["success"].(bool); !success {
		t.Fatalf("expected create success, got %v", result["message"])
	}

	row := rm.Find("csm", "csm_group_members", model.EqFilter("id", "sub-1"))
	if len(row) == 0 {
		t.Fatal("sub-user row not persisted")
	}

	// app_id on sub-user rows is aligned with admin login app context.
	if got, _ := row["app_id"].(string); got != "myapp" {
		t.Fatalf("app_id = %q, want myapp", got)
	}
	// parent_account_id forced from admin candidates
	if got, _ := row["parent_account_id"].(string); got != "admin-1" {
		t.Fatalf("parent_account_id = %q, want admin-1", got)
	}
	// app_token generated and decrypts to myapp_____sub1_____user_____0
	token, _ := row["app_token"].(string)
	if token == "" {
		t.Fatal("app_token not generated")
	}
	meta := util.ParseAppToken(rm, token)
	if meta.AppID != "myapp" || meta.LoginIdentifier != "sub1" || !util.IsSubUserRole(meta.Role) {
		t.Fatalf("app_token meta = %+v, want appID=myapp login=sub1 role=user", meta)
	}
	// Java: source_app_token defaults to empty string
	if got, _ := row["source_app_token"].(string); got != "" {
		t.Fatalf("source_app_token = %q, want empty", got)
	}
	// Canonical fields seeded from loginID (Java parity)
	if got, _ := row["username"].(string); got != "sub1" {
		t.Fatalf("username = %q, want sub1", got)
	}
	if got, _ := row["email"].(string); got != "sub1" {
		t.Fatalf("email = %q, want sub1", got)
	}
	if got, _ := row["full_name"].(string); got != "sub1" {
		t.Fatalf("full_name = %q, want sub1", got)
	}
	if got, ok := row["actived"].(bool); !ok || !got {
		t.Fatalf("actived = %v, want true", row["actived"])
	}
	// refresh fields default to app_token (Java parity)
	if got, _ := row["refresh"].(string); got != token {
		t.Fatalf("refresh = %q, want app_token", got)
	}
	if got, _ := row["refresh_token"].(string); got != token {
		t.Fatalf("refresh_token = %q, want app_token", got)
	}
	// login_version defaults to 0
	if v, ok := row["login_version"]; !ok {
		t.Fatal("login_version missing")
	} else if n, ok := model.IntFromAny(v); !ok || n != 0 {
		t.Fatalf("login_version = %v, want 0", v)
	}
	// permission schema seeded (Java: permissionBitfield/v3/dataScope)
	if got, _ := row["permissionSchemaVersion"].(string); got != "v3" {
		t.Fatalf("permissionSchemaVersion = %q, want v3", got)
	}
	if got, _ := row["permissionBitfield"].(string); got == "" {
		t.Fatal("permissionBitfield missing")
	}
	// pass encrypted as CsmEncrypt(loginID_____raw)
	wantPass := rm.CsmEncrypt("sub1_____rawpass123")
	if got, _ := row["pass"].(string); got != wantPass {
		t.Fatalf("pass not encrypted correctly (len=%d want %d)", len(got), len(wantPass))
	}
}

// TestAdminCreateSubUserIgnoresClientAppID is the real-world parity bug: the frontend
// grid sends app_id of the csm namespace inside obj_update. The backend must ignore that
// value, build app_token from the ADMIN's app_id, and persist row app_id as admin app_id.
func TestAdminCreateSubUserIgnoresClientAppID(t *testing.T) {
	rm := testLookupRecordManager(t)
	h := &TableHandler{rm: rm}
	access := &security.UserAccessContext{
		IsAdmin:                 true,
		IsDev:                   false,
		IsSubUser:               false,
		AppID:                   "myapp",
		OwnerCandidates:         []string{"admin-1"},
		ParentAccountCandidates: []string{"admin-1"},
	}

	out := map[string]any{}
	params := map[string]any{
		"app_id":  "csm", // request namespace for csm_group_members
		"command": "create",
		"obj_update": map[string]any{
			"id":               "sub-9",
			"login_identifier": "sub9",
			"app_id":           "csm", // client-supplied (wrong) app_id must be ignored
		},
	}
	result := h.handleUpdateOperation(out, params, "csm", "csm_group_members", model.SearchFilter{}, access)
	if success, _ := result["success"].(bool); !success {
		t.Fatalf("expected create success, got %v", result["message"])
	}
	row := rm.Find("csm", "csm_group_members", model.EqFilter("id", "sub-9"))
	if len(row) == 0 {
		t.Fatal("sub-user row not persisted")
	}
	if got, _ := row["app_id"].(string); got != "myapp" {
		t.Fatalf("row app_id = %q, want myapp (admin app scope)", got)
	}
	token, _ := row["app_token"].(string)
	meta := util.ParseAppToken(rm, token)
	if meta.AppID != "myapp" {
		t.Fatalf("app_token appID = %q, want myapp (admin's app, not client csm)", meta.AppID)
	}
}

// TestAdminCreateSubUserKeepsClientSuppliedAppToken ensures a valid pre-built app_token
// (e.g. from the /create-sub-user endpoint flow) is not overwritten.
func TestAdminCreateSubUserKeepsClientSuppliedAppToken(t *testing.T) {
	rm := testLookupRecordManager(t)
	h := &TableHandler{rm: rm}
	access := &security.UserAccessContext{
		IsAdmin:                 true,
		IsDev:                   false,
		IsSubUser:               false,
		AppID:                   "myapp",
		OwnerCandidates:         []string{"admin-1"},
		ParentAccountCandidates: []string{"admin-1"},
	}

	supplied := rm.CsmEncrypt(util.BuildRawToken("myapp", "sub2", "user", 0))
	out := map[string]any{}
	params := map[string]any{
		"app_id":  "myapp",
		"command": "create",
		"obj_update": map[string]any{
			"id":               "sub-2",
			"login_identifier": "sub2",
			"app_token":        supplied,
		},
	}
	result := h.handleUpdateOperation(out, params, "csm", "csm_group_members", model.SearchFilter{}, access)
	if success, _ := result["success"].(bool); !success {
		t.Fatalf("expected create success, got %v", result["message"])
	}
	row := rm.Find("csm", "csm_group_members", model.EqFilter("id", "sub-2"))
	if got, _ := row["app_token"].(string); got != supplied {
		t.Fatalf("app_token overwritten: got %q want supplied token", got)
	}
}

// TestSubUserCannotDeleteSubUser verifies Java parity: sub-users cannot delete
// rows on csm_group_members even for their own app scope.
func TestSubUserCannotDeleteSubUser(t *testing.T) {
	rm := testLookupRecordManager(t)
	h := &TableHandler{rm: rm}
	access := &security.UserAccessContext{
		IsAdmin:                 false,
		IsDev:                   false,
		IsSubUser:               true,
		AppID:                   "myapp",
		OwnerCandidates:         []string{"sub-1"},
		ParentAccountCandidates: []string{"admin-1"},
	}
	out := map[string]any{}
	params := map[string]any{
		"app_id":  "myapp",
		"command": "delete",
		"obj_update": map[string]any{
			"id": "sub-1",
		},
	}
	result := h.handleUpdateOperation(out, params, "csm", "csm_group_members", model.SearchFilter{}, access)
	if success, _ := result["success"].(bool); success {
		t.Fatal("expected delete to be blocked for sub-user")
	}
	msg, _ := result["message"].(string)
	if !strings.Contains(msg, "không có quyền xóa") {
		t.Fatalf("unexpected message: %q", msg)
	}
}
