use std::collections::{HashMap, HashSet};

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

// Legacy flat bit layout (pre-v3) — mirrors Java PermissionBitfieldUtil
const ACTION_VIEW: u64 = 31;
const ACTION_CREATE: u64 = 33;
const ACTION_EDIT: u64 = 32;
const ACTION_DELETE: u64 = 34;
const ACTION_EXPORT: u64 = 35;
const DATA_SCOPE_OWNER: u64 = 41;
const DATA_SCOPE_DEPARTMENT: u64 = 42;
const DATA_SCOPE_BRANCH: u64 = 43;
const DATA_SCOPE_ALL: u64 = 44;

pub struct PermissionBitfieldUtil;

impl PermissionBitfieldUtil {
    pub const SCHEMA_V3: &'static str = "v3";

    pub fn build_bitfield(permissions: &[String], menus: &[String], dev: bool) -> u64 {
        let mut menu_mask = 0u64;
        let mut action_mask = 0u64;
        let mut scope_mask = 0u64;

        if dev {
            action_mask = set_mask_bit(action_mask, V3_ACTION_VIEW);
            action_mask = set_mask_bit(action_mask, V3_ACTION_CREATE);
            action_mask = set_mask_bit(action_mask, V3_ACTION_EDIT);
            action_mask = set_mask_bit(action_mask, V3_ACTION_DELETE);
            action_mask = set_mask_bit(action_mask, V3_ACTION_EXPORT);
            scope_mask = set_mask_bit(scope_mask, V3_SCOPE_ALL);
        }

        for raw in permissions {
            let token = normalize_token(raw);
            if token.is_empty() {
                continue;
            }
            match token.as_str() {
                "dev" | "admin" => {
                    action_mask = set_mask_bit(action_mask, V3_ACTION_VIEW);
                    action_mask = set_mask_bit(action_mask, V3_ACTION_CREATE);
                    action_mask = set_mask_bit(action_mask, V3_ACTION_EDIT);
                    action_mask = set_mask_bit(action_mask, V3_ACTION_DELETE);
                    action_mask = set_mask_bit(action_mask, V3_ACTION_EXPORT);
                    scope_mask = set_mask_bit(scope_mask, V3_SCOPE_ALL);
                }
                "user" => {
                    action_mask = set_mask_bit(action_mask, V3_ACTION_VIEW);
                    scope_mask = set_mask_bit(scope_mask, V3_SCOPE_OWNER);
                }
                "view" | "read" => action_mask = set_mask_bit(action_mask, V3_ACTION_VIEW),
                "create" | "add" | "insert" => {
                    action_mask = set_mask_bit(action_mask, V3_ACTION_CREATE)
                }
                "edit" | "update" | "write" => {
                    action_mask = set_mask_bit(action_mask, V3_ACTION_EDIT)
                }
                "delete" | "remove" => action_mask = set_mask_bit(action_mask, V3_ACTION_DELETE),
                "export" => action_mask = set_mask_bit(action_mask, V3_ACTION_EXPORT),
                "scope:owner" | "owner" => scope_mask = set_mask_bit(scope_mask, V3_SCOPE_OWNER),
                "scope:department" | "department" | "team" => {
                    scope_mask = set_mask_bit(scope_mask, V3_SCOPE_DEPARTMENT)
                }
                "scope:branch" | "branch" => scope_mask = set_mask_bit(scope_mask, V3_SCOPE_BRANCH),
                "scope:all" | "all" => scope_mask = set_mask_bit(scope_mask, V3_SCOPE_ALL),
                _ => {}
            }
        }

        for raw in menus {
            let token = normalize_token(raw);
            if token.is_empty() {
                continue;
            }
            if let Some(menu_index) = parse_menu_index(&token) {
                if menu_index <= 15 {
                    menu_mask = set_mask_bit(menu_mask, menu_index);
                }
            }
            match token.as_str() {
                "scope:owner" => scope_mask = set_mask_bit(scope_mask, V3_SCOPE_OWNER),
                "scope:department" | "scope:team" => {
                    scope_mask = set_mask_bit(scope_mask, V3_SCOPE_DEPARTMENT)
                }
                "scope:branch" => scope_mask = set_mask_bit(scope_mask, V3_SCOPE_BRANCH),
                "scope:all" => scope_mask = set_mask_bit(scope_mask, V3_SCOPE_ALL),
                _ => {}
            }
        }

        (menu_mask & V3_MENU_MASK) << V3_MENU_SHIFT
            | (action_mask & V3_ACTION_MASK) << V3_ACTION_SHIFT
            | (scope_mask & V3_SCOPE_MASK) << V3_SCOPE_SHIFT
            | (V3_RESERVED_SIGNATURE & 0xFFFF_FFFF)
    }

    /// Mirrors Java `toCompactToken` — base-36 uppercase.
    pub fn to_compact_token(bitfield: u64) -> String {
        to_base36_upper(bitfield)
    }

    pub fn parse_security_token(raw: Option<&str>) -> Option<u64> {
        let text = raw?.trim().replace('_', "");
        if text.is_empty() {
            return None;
        }

        if let Some(rest) = text.strip_prefix("b36:").or_else(|| text.strip_prefix("B36:")) {
            return u64::from_str_radix(rest, 36).ok().map(normalize_to_single_token);
        }

        if let Some(rest) = text.strip_prefix("b64:").or_else(|| text.strip_prefix("B64:")) {
            use base64::Engine;
            let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
                .decode(rest)
                .or_else(|_| base64::engine::general_purpose::STANDARD.decode(rest))
                .ok()?;
            if bytes.len() != 8 {
                return None;
            }
            let mut value = 0u64;
            for b in bytes {
                value = (value << 8) | u64::from(b);
            }
            return Some(normalize_to_single_token(value));
        }

        if let Some(rest) = text.strip_prefix("0x").or_else(|| text.strip_prefix("0X")) {
            return u64::from_str_radix(rest, 16)
                .ok()
                .map(normalize_to_single_token);
        }

        if text.chars().all(|c| c.is_ascii_digit()) {
            return text
                .parse::<u64>()
                .ok()
                .map(normalize_to_single_token);
        }

        if text.chars().all(|c| c.is_ascii_alphanumeric()) {
            return u64::from_str_radix(&text, 36)
                .ok()
                .map(normalize_to_single_token);
        }

        text.parse::<u64>().ok().map(normalize_to_single_token)
    }

    pub fn has_bit(bitfield: u64, bit_index: i32) -> bool {
        has_bit_v3(normalize_to_single_token(bitfield), bit_index)
    }

    pub fn permissions_from_bitfield(raw: Option<&str>) -> Vec<String> {
        let Some(token) = Self::parse_security_token(raw) else {
            return vec![];
        };
        let mut out = Vec::new();
        for (bit, label) in ACTION_BIT_TO_TOKEN.iter() {
            if Self::has_bit(token, *bit) {
                out.push(label.to_string());
            }
        }
        match resolve_data_scope_v3(token).as_str() {
            "ALL" => out.push("scope:all".into()),
            "BRANCH" => out.push("scope:branch".into()),
            "DEPARTMENT" => out.push("scope:department".into()),
            "OWNER" => out.push("scope:owner".into()),
            _ => {}
        }
        out
    }

    pub fn menus_from_bitfield(raw: Option<&str>) -> Vec<String> {
        let Some(token) = Self::parse_security_token(raw) else {
            return vec![];
        };
        let mut out = Vec::new();
        for (bit, label) in MENU_BIT_TO_TOKEN.iter() {
            if Self::has_bit(token, *bit) {
                out.push(label.to_string());
            }
        }
        out
    }

    pub fn merge_unique_case_insensitive(base: &[String], extra: &[String]) -> Vec<String> {
        let mut merged = Vec::new();
        let mut seen = HashSet::new();
        for value in base.iter().chain(extra.iter()) {
            let normalized = value.trim();
            if normalized.is_empty() {
                continue;
            }
            let key = normalized.to_ascii_lowercase();
            if seen.insert(key) {
                merged.push(normalized.to_string());
            }
        }
        merged
    }

    pub fn resolve_data_scope(bitfield: u64) -> String {
        resolve_data_scope_v3(normalize_to_single_token(bitfield))
    }
}

fn resolve_data_scope_v3(token: u64) -> String {
    let scope_mask = extract_v3_scope_mask(token);
    if has_mask_bit(scope_mask, V3_SCOPE_ALL) {
        return "ALL".into();
    }
    if has_mask_bit(scope_mask, V3_SCOPE_BRANCH) {
        return "BRANCH".into();
    }
    if has_mask_bit(scope_mask, V3_SCOPE_DEPARTMENT) {
        return "DEPARTMENT".into();
    }
    if has_mask_bit(scope_mask, V3_SCOPE_OWNER) {
        return "OWNER".into();
    }
    "NONE".into()
}

fn is_security_token_v3(token: u64) -> bool {
    (token & 0xFFFF_FFFF) == (V3_RESERVED_SIGNATURE & 0xFFFF_FFFF)
}

fn normalize_to_single_token(token: u64) -> u64 {
    if is_security_token_v3(token) {
        return token;
    }

    let mut menu_mask = 0u64;
    for i in 0..=15 {
        if token & (1u64 << i) != 0 {
            menu_mask = set_mask_bit(menu_mask, i);
        }
    }

    let mut action_mask = 0u64;
    if token & (1u64 << ACTION_VIEW) != 0 {
        action_mask = set_mask_bit(action_mask, V3_ACTION_VIEW);
    }
    if token & (1u64 << ACTION_CREATE) != 0 {
        action_mask = set_mask_bit(action_mask, V3_ACTION_CREATE);
    }
    if token & (1u64 << ACTION_EDIT) != 0 {
        action_mask = set_mask_bit(action_mask, V3_ACTION_EDIT);
    }
    if token & (1u64 << ACTION_DELETE) != 0 {
        action_mask = set_mask_bit(action_mask, V3_ACTION_DELETE);
    }
    if token & (1u64 << ACTION_EXPORT) != 0 {
        action_mask = set_mask_bit(action_mask, V3_ACTION_EXPORT);
    }

    let mut scope_mask = 0u64;
    if token & (1u64 << DATA_SCOPE_OWNER) != 0 {
        scope_mask = set_mask_bit(scope_mask, V3_SCOPE_OWNER);
    }
    if token & (1u64 << DATA_SCOPE_DEPARTMENT) != 0 {
        scope_mask = set_mask_bit(scope_mask, V3_SCOPE_DEPARTMENT);
    }
    if token & (1u64 << DATA_SCOPE_BRANCH) != 0 {
        scope_mask = set_mask_bit(scope_mask, V3_SCOPE_BRANCH);
    }
    if token & (1u64 << DATA_SCOPE_ALL) != 0 {
        scope_mask = set_mask_bit(scope_mask, V3_SCOPE_ALL);
    }

    (menu_mask & V3_MENU_MASK) << V3_MENU_SHIFT
        | (action_mask & V3_ACTION_MASK) << V3_ACTION_SHIFT
        | (scope_mask & V3_SCOPE_MASK) << V3_SCOPE_SHIFT
        | (V3_RESERVED_SIGNATURE & 0xFFFF_FFFF)
}

fn has_bit_v3(token: u64, bit_index: i32) -> bool {
    if bit_index < 0 {
        return false;
    }
    if (0..=15).contains(&bit_index) {
        return has_mask_bit(extract_v3_menu_mask(token), bit_index as u64);
    }
    if (16..=30).contains(&bit_index) {
        return false;
    }
    match bit_index {
        x if x == ACTION_VIEW as i32 => has_mask_bit(extract_v3_action_mask(token), V3_ACTION_VIEW),
        x if x == ACTION_CREATE as i32 => {
            has_mask_bit(extract_v3_action_mask(token), V3_ACTION_CREATE)
        }
        x if x == ACTION_EDIT as i32 => has_mask_bit(extract_v3_action_mask(token), V3_ACTION_EDIT),
        x if x == ACTION_DELETE as i32 => {
            has_mask_bit(extract_v3_action_mask(token), V3_ACTION_DELETE)
        }
        x if x == ACTION_EXPORT as i32 => {
            has_mask_bit(extract_v3_action_mask(token), V3_ACTION_EXPORT)
        }
        x if x == DATA_SCOPE_OWNER as i32 => {
            has_mask_bit(extract_v3_scope_mask(token), V3_SCOPE_OWNER)
        }
        x if x == DATA_SCOPE_DEPARTMENT as i32 => {
            has_mask_bit(extract_v3_scope_mask(token), V3_SCOPE_DEPARTMENT)
        }
        x if x == DATA_SCOPE_BRANCH as i32 => {
            has_mask_bit(extract_v3_scope_mask(token), V3_SCOPE_BRANCH)
        }
        x if x == DATA_SCOPE_ALL as i32 => has_mask_bit(extract_v3_scope_mask(token), V3_SCOPE_ALL),
        _ => false,
    }
}

fn extract_v3_menu_mask(token: u64) -> u64 {
    (token >> V3_MENU_SHIFT) & V3_MENU_MASK
}

fn extract_v3_action_mask(token: u64) -> u64 {
    (token >> V3_ACTION_SHIFT) & V3_ACTION_MASK
}

fn extract_v3_scope_mask(token: u64) -> u64 {
    (token >> V3_SCOPE_SHIFT) & V3_SCOPE_MASK
}

fn set_mask_bit(mask: u64, bit_position: u64) -> u64 {
    if bit_position > 62 {
        return mask;
    }
    mask | (1u64 << bit_position)
}

fn has_mask_bit(mask: u64, bit_position: u64) -> bool {
    if bit_position > 62 {
        return false;
    }
    (mask & (1u64 << bit_position)) != 0
}

fn normalize_token(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn parse_menu_index(token: &str) -> Option<u64> {
    if let Ok(index) = token.parse::<u64>() {
        if index <= 30 {
            return Some(index);
        }
    }
    if let Some(index) = known_menu_bits().get(token) {
        return Some(*index);
    }
    if let Some(rest) = token.strip_prefix("menu:") {
        if let Ok(index) = rest.parse::<u64>() {
            if index <= 30 {
                return Some(index);
            }
        }
    }
    None
}

fn known_menu_bits() -> HashMap<&'static str, u64> {
    HashMap::from([
        ("dashboard", 0),
        ("/dashboard", 0),
        ("home", 0),
        ("/home", 0),
        ("user", 1),
        ("/system/user", 1),
        ("role", 2),
        ("/system/role", 2),
        ("menu", 3),
        ("/system/menu", 3),
        ("dept", 4),
        ("/system/dept", 4),
        ("developer", 5),
        ("/system/developer", 5),
        ("broadcast", 6),
        ("/system/broadcast", 6),
        ("report", 7),
        ("/system/report", 7),
        ("crm", 8),
        ("/crm", 8),
    ])
}

fn to_base36_upper(mut value: u64) -> String {
    if value == 0 {
        return "0".to_string();
    }
    const ALPHABET: &[u8; 36] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let mut out = Vec::new();
    while value > 0 {
        let rem = (value % 36) as usize;
        out.push(ALPHABET[rem]);
        value /= 36;
    }
    out.iter().rev().map(|b| *b as char).collect()
}

const ACTION_BIT_TO_TOKEN: &[(i32, &str)] = &[
    (ACTION_VIEW as i32, "view"),
    (ACTION_CREATE as i32, "create"),
    (ACTION_EDIT as i32, "edit"),
    (ACTION_DELETE as i32, "delete"),
    (ACTION_EXPORT as i32, "export"),
];

const MENU_BIT_TO_TOKEN: &[(i32, &str)] = &[
    (0, "/home"),
    (1, "/system/user"),
    (2, "/system/role"),
    (3, "/system/menu"),
    (4, "/system/dept"),
    (5, "/system/developer"),
    (6, "/system/broadcast"),
    (7, "/system/report"),
    (8, "/crm"),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_paths_map_to_known_bits() {
        let bitfield = PermissionBitfieldUtil::build_bitfield(&[], &["/system/user".into(), "/crm".into()], false);
        assert!(PermissionBitfieldUtil::has_bit(bitfield, 1));
        assert!(PermissionBitfieldUtil::has_bit(bitfield, 8));
        assert!(!PermissionBitfieldUtil::has_bit(bitfield, 0));
    }

    #[test]
    fn compact_token_is_base36() {
        let bitfield = PermissionBitfieldUtil::build_bitfield(&["admin".into()], &[], false);
        let token = PermissionBitfieldUtil::to_compact_token(bitfield);
        assert!(token.chars().all(|c| c.is_ascii_alphanumeric()));
        assert_eq!(
            PermissionBitfieldUtil::parse_security_token(Some(&token)),
            Some(bitfield)
        );
    }

    #[test]
    fn menus_round_trip_from_bitfield() {
        let menus = vec!["/system/user".into(), "/crm".into()];
        let bitfield = PermissionBitfieldUtil::build_bitfield(&[], &menus, false);
        let token = PermissionBitfieldUtil::to_compact_token(bitfield);
        let decoded = PermissionBitfieldUtil::menus_from_bitfield(Some(&token));
        assert!(decoded.contains(&"/system/user".to_string()));
        assert!(decoded.contains(&"/crm".to_string()));
    }
}
