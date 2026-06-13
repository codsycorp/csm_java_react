package util

import "strings"

// ExpandPermissionPresets expands Java/frontend permission preset tokens (editor, full_crud, ...).
func ExpandPermissionPresets(permissions []string) []string {
	if len(permissions) == 0 {
		return permissions
	}
	out := append([]string{}, permissions...)
	for _, raw := range permissions {
		switch strings.ToLower(strings.TrimSpace(raw)) {
		case "viewer":
			out = MergeUniqueCaseInsensitive(out, []string{"view"})
		case "editor":
			out = MergeUniqueCaseInsensitive(out, []string{"view", "create", "edit"})
		case "full_crud":
			out = MergeUniqueCaseInsensitive(out, []string{"view", "create", "edit", "delete"})
		case "full_crud_export":
			out = MergeUniqueCaseInsensitive(out, []string{"view", "create", "edit", "delete", "export"})
		case "admin_full":
			out = MergeUniqueCaseInsensitive(out, []string{"admin", "view", "create", "edit", "delete", "export", "scope:all"})
		}
	}
	return out
}
