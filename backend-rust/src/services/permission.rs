use std::sync::Arc;

use serde_json::{json, Map, Value};

use crate::data::RecordManager;
use crate::model::SearchFilter;

pub struct PermissionService {
    record_manager: Arc<RecordManager>,
}

impl PermissionService {
    pub fn new(record_manager: Arc<RecordManager>) -> Self {
        Self { record_manager }
    }

    pub fn list_roles(&self) -> Value {
        json!({ "code": 200, "success": true, "result": self.get_all_roles() })
    }

    pub fn get_all_roles(&self) -> Value {
        self.table_data("csm_roles")
    }

    pub fn get_all_permissions(&self) -> Value {
        self.table_data("csm_permissions")
    }

    pub fn get_all_departments(&self) -> Value {
        self.table_data("csm_depts")
    }

    pub fn get_department_tree(&self) -> Value {
        let depts = self.get_all_departments();
        json!({ "tree": depts })
    }

    pub fn get_user_permissions(&self, user_id: &str) -> Value {
        let filter = SearchFilter::eq("id", user_id);
        let user = self.record_manager.find("csm", "csm_accounts", &filter);
        json!({
            "permissions": user.get("permissions").cloned().unwrap_or(json!([])),
            "menusPermissions": user.get("menusPermissions").cloned().unwrap_or(json!([])),
        })
    }

    pub fn check_permission(&self, user_id: &str, permission_code: &str) -> Value {
        let perms = self.get_user_permissions(user_id);
        let allowed = perms
            .get("permissions")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().any(|p| p.as_str() == Some(permission_code)))
            .unwrap_or(false);
        json!({ "allowed": allowed, "permissionCode": permission_code })
    }

    pub fn get_user_departments(&self, user_id: &str) -> Value {
        let filter = SearchFilter::eq("user_id", user_id);
        let page = self.record_manager.filter("csm", "csm_user_depts", &filter);
        page.get("data").cloned().unwrap_or(json!([]))
    }

    pub fn get_role_permissions(&self, role_id: &str) -> Value {
        let filter = SearchFilter::eq("role_id", role_id);
        let page = self.record_manager.filter("csm", "csm_role_permissions", &filter);
        page.get("data").cloned().unwrap_or(json!([]))
    }

    pub fn add_role_permission(&self, role_id: &str, permission_id: &str) -> Value {
        let mut rec = Map::new();
        rec.insert("role_id".into(), json!(role_id));
        rec.insert("permission_id".into(), json!(permission_id));
        rec.insert("create_time".into(), json!(chrono::Utc::now().timestamp_millis()));
        let _ = self.record_manager.create_record("csm", "csm_role_permissions", rec, None);
        json!({ "success": true })
    }

    pub fn remove_role_permission(&self, role_id: &str, permission_id: &str) -> Value {
        let filter = SearchFilter {
            operator: "AND".into(),
            conditions: vec![
                SearchFilter::eq("role_id", role_id),
                SearchFilter::eq("permission_id", permission_id),
            ],
            ..Default::default()
        };
        let page = self.record_manager.filter("csm", "csm_role_permissions", &filter);
        if let Some(rows) = page.get("data").and_then(|v| v.as_array()) {
            for row in rows {
                if let Some(obj) = row.as_object() {
                    let _ = self.record_manager.delete_record("csm", "csm_role_permissions", obj);
                }
            }
        }
        json!({ "success": true })
    }

    pub fn assign_user_department_role(&self, user_id: &str, dept_id: &str, role_id: &str) -> Value {
        let mut rec = Map::new();
        rec.insert("user_id".into(), json!(user_id));
        rec.insert("dept_id".into(), json!(dept_id));
        rec.insert("role_id".into(), json!(role_id));
        rec.insert("create_time".into(), json!(chrono::Utc::now().timestamp_millis()));
        let _ = self.record_manager.create_record("csm", "csm_user_depts", rec, None);
        json!({ "success": true })
    }

    pub fn permission_matrix(&self) -> Value {
        json!({
            "roles": self.get_all_roles(),
            "permissions": self.get_all_permissions(),
            "rolePermissions": self.table_data("csm_role_permissions"),
        })
    }

    fn table_data(&self, table: &str) -> Value {
        let page = self.record_manager.filter("csm", table, &Default::default());
        page.get("data").cloned().unwrap_or(json!([]))
    }
}
