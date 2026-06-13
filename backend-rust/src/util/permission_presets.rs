use super::permission_bitfield::PermissionBitfieldUtil;

/// Expand Java/frontend permission preset tokens (editor, full_crud, ...).
pub fn expand_permission_presets(permissions: &[String]) -> Vec<String> {
    if permissions.is_empty() {
        return Vec::new();
    }
    let mut out = permissions.to_vec();
    for raw in permissions {
        match raw.trim().to_ascii_lowercase().as_str() {
            "viewer" => {
                out = PermissionBitfieldUtil::merge_unique_case_insensitive(&out, &["view".into()]);
            }
            "editor" => {
                out = PermissionBitfieldUtil::merge_unique_case_insensitive(
                    &out,
                    &["view".into(), "create".into(), "edit".into()],
                );
            }
            "full_crud" => {
                out = PermissionBitfieldUtil::merge_unique_case_insensitive(
                    &out,
                    &[
                        "view".into(),
                        "create".into(),
                        "edit".into(),
                        "delete".into(),
                    ],
                );
            }
            "full_crud_export" => {
                out = PermissionBitfieldUtil::merge_unique_case_insensitive(
                    &out,
                    &[
                        "view".into(),
                        "create".into(),
                        "edit".into(),
                        "delete".into(),
                        "export".into(),
                    ],
                );
            }
            "admin_full" => {
                out = PermissionBitfieldUtil::merge_unique_case_insensitive(
                    &out,
                    &[
                        "admin".into(),
                        "view".into(),
                        "create".into(),
                        "edit".into(),
                        "delete".into(),
                        "export".into(),
                        "scope:all".into(),
                    ],
                );
            }
            _ => {}
        }
    }
    out
}
