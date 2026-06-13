package handlers

import (
	"testing"

	"csm_server/backend-go/internal/security"
)

func TestFilterRoutesByRoleAdminSystemAccess(t *testing.T) {
	routes := []any{
		map[string]any{
			"path": "/system",
			"handle": map[string]any{
				"roles": []any{"admin"},
			},
			"children": []any{
				map[string]any{
					"path": "/system/user",
					"handle": map[string]any{
						"roles": []any{"admin"},
					},
				},
				map[string]any{
					"path": "/system/developer",
					"handle": map[string]any{
						"roles": []any{"dev"},
					},
				},
			},
		},
		map[string]any{
			"path": "/dashboard",
			"handle": map[string]any{
				"roles": []any{"admin"},
			},
		},
	}

	auth := &security.AuthUser{
		Permissions:      []string{"admin", "view"},
		MenusPermissions: []string{"/dashboard"},
	}
	filtered := filterRoutesByRole(routes, auth)
	if len(filtered) != 2 {
		t.Fatalf("expected 2 routes, got %d", len(filtered))
	}

	system, ok := filtered[0].(map[string]any)
	if !ok || system["path"] != "/system" {
		t.Fatalf("expected /system route first, got %#v", filtered[0])
	}
	children, ok := system["children"].([]any)
	if !ok || len(children) != 1 {
		t.Fatalf("admin should see /system/user but not /system/developer, got %#v", system["children"])
	}
	child, ok := children[0].(map[string]any)
	if !ok || child["path"] != "/system/user" {
		t.Fatalf("expected /system/user child, got %#v", children[0])
	}
}

func TestFilterRoutesByRoleDevSeesAll(t *testing.T) {
	routes := []any{
		map[string]any{"path": "/system/developer"},
		map[string]any{"path": "/other"},
	}
	auth := &security.AuthUser{Dev: true}
	filtered := filterRoutesByRole(routes, auth)
	if len(filtered) != 2 {
		t.Fatalf("dev should see all routes, got %d", len(filtered))
	}
}
