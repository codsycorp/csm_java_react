use base64::Engine;

const V3_MENU_SHIFT: u64 = 48;
const V3_ACTION_SHIFT: u64 = 40;
const V3_SCOPE_SHIFT: u64 = 32;
const V3_MENU_MASK: u64 = 0xFFFF;
const V3_ACTION_MASK: u64 = 0xFF;
const V3_SCOPE_MASK: u64 = 0xFF;
const V3_RESERVED_SIGNATURE: u64 = 0x43534D33; // "CSM3"

const V3_ACTION_VIEW: u64 = 0;
const V3_ACTION_CREATE: u64 = 1;
const V3_ACTION_EDIT: u64 = 2;
const V3_ACTION_DELETE: u64 = 3;
const V3_ACTION_EXPORT: u64 = 4;

const V3_SCOPE_OWNER: u64 = 0;
const V3_SCOPE_DEPARTMENT: u64 = 1;
const V3_SCOPE_BRANCH: u64 = 2;
const V3_SCOPE_ALL: u64 = 3;

pub struct PermissionBitfieldUtil;

impl PermissionBitfieldUtil {
    pub const SCHEMA_V3: &'static str = "v3";

    pub fn build_bitfield(
        permissions: &[String],
        menus: &[String],
        dev: bool,
    ) -> u64 {
        let mut menu_mask = 0u64;
        let mut action_mask = 0u64;
        let mut scope_mask = 0u64;

        if dev {
            action_mask = set_bit(action_mask, V3_ACTION_VIEW);
            action_mask = set_bit(action_mask, V3_ACTION_CREATE);
            action_mask = set_bit(action_mask, V3_ACTION_EDIT);
            action_mask = set_bit(action_mask, V3_ACTION_DELETE);
            action_mask = set_bit(action_mask, V3_ACTION_EXPORT);
            scope_mask = set_bit(scope_mask, V3_SCOPE_ALL);
        }

        for raw in permissions {
            let token = raw.trim().to_lowercase();
            match token.as_str() {
                "dev" | "admin" => {
                    action_mask = set_bit(action_mask, V3_ACTION_VIEW);
                    action_mask = set_bit(action_mask, V3_ACTION_CREATE);
                    action_mask = set_bit(action_mask, V3_ACTION_EDIT);
                    action_mask = set_bit(action_mask, V3_ACTION_DELETE);
                    action_mask = set_bit(action_mask, V3_ACTION_EXPORT);
                    scope_mask = set_bit(scope_mask, V3_SCOPE_ALL);
                }
                "user" => {
                    action_mask = set_bit(action_mask, V3_ACTION_VIEW);
                    scope_mask = set_bit(scope_mask, V3_SCOPE_OWNER);
                }
                "view" | "read" => action_mask = set_bit(action_mask, V3_ACTION_VIEW),
                "create" => action_mask = set_bit(action_mask, V3_ACTION_CREATE),
                "edit" | "update" => action_mask = set_bit(action_mask, V3_ACTION_EDIT),
                "delete" => action_mask = set_bit(action_mask, V3_ACTION_DELETE),
                "export" => action_mask = set_bit(action_mask, V3_ACTION_EXPORT),
                "scope:owner" => scope_mask = set_bit(scope_mask, V3_SCOPE_OWNER),
                "scope:department" => scope_mask = set_bit(scope_mask, V3_SCOPE_DEPARTMENT),
                "scope:branch" => scope_mask = set_bit(scope_mask, V3_SCOPE_BRANCH),
                "scope:all" => scope_mask = set_bit(scope_mask, V3_SCOPE_ALL),
                _ => {}
            }
        }

        for (i, menu) in menus.iter().enumerate() {
            if i > 30 {
                break;
            }
            if !menu.trim().is_empty() {
                menu_mask = set_bit(menu_mask, i as u64);
            }
        }

        (menu_mask & V3_MENU_MASK) << V3_MENU_SHIFT
            | (action_mask & V3_ACTION_MASK) << V3_ACTION_SHIFT
            | (scope_mask & V3_SCOPE_MASK) << V3_SCOPE_SHIFT
            | V3_RESERVED_SIGNATURE
    }

    pub fn to_compact_token(bitfield: u64) -> String {
        let bytes = bitfield.to_be_bytes();
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
    }

    pub fn resolve_data_scope(bitfield: u64) -> String {
        let scope = (bitfield >> V3_SCOPE_SHIFT) & V3_SCOPE_MASK;
        match scope {
            x if x == V3_SCOPE_ALL => "all".into(),
            x if x == V3_SCOPE_BRANCH => "branch".into(),
            x if x == V3_SCOPE_DEPARTMENT => "department".into(),
            _ => "owner".into(),
        }
    }
}

fn set_bit(mask: u64, bit: u64) -> u64 {
    mask | (1u64 << bit)
}
