use std::sync::Arc;

use serde_json::{json, Map, Value};
use tracing::{info, warn};
use uuid::Uuid;

use crate::data::RecordManager;
use crate::model::{SearchFilter, StandardResponse};

pub struct InitHandler {
    record_manager: Arc<RecordManager>,
}

impl InitHandler {
    pub fn new(record_manager: Arc<RecordManager>) -> Self {
        Self { record_manager }
    }

    pub fn auto_init_default_data(&self) {
        match self.handle_create_default_data_internal() {
            Ok(_) => info!("InitHandler: default data initialized"),
            Err(e) => warn!("InitHandler: auto-init failed: {e}"),
        }
    }

    pub fn handle_create_default_data(&self) -> StandardResponse {
        match self.handle_create_default_data_internal() {
            Ok(msg) => {
                let mut r = StandardResponse::new();
                r.set("code", 200);
                r.set("success", true);
                r.set("message", msg);
                r
            }
            Err(e) => {
                let mut r = StandardResponse::new();
                r.set("code", 500);
                r.set("success", false);
                r.set("message", e.to_string());
                r
            }
        }
    }

    fn handle_create_default_data_internal(&self) -> anyhow::Result<String> {
        self.init_table_schema(
            "csm",
            "csm_ai_menu_requests",
            &["id"],
            &["id", "menu_name", "request_data", "created_at"],
            None,
        )?;
        self.init_table_schema(
            "csm",
            "csm_depts",
            &["id", "dept_code"],
            &[
                "id", "parent_dept_id", "dept_code", "dept_name", "dept_full_name", "description",
                "manager_user_id", "is_global", "status", "create_time", "update_time",
            ],
            None,
        )?;
        self.init_table_schema(
            "csm",
            "csm_roles",
            &["id", "role_code"],
            &[
                "id", "role_code", "role_name", "is_global", "department_id", "description",
                "status", "permissionBitfield", "permissionSchemaVersion", "dataScope",
                "create_time", "update_time",
            ],
            None,
        )?;
        self.init_table_schema(
            "csm",
            "csm_permissions",
            &["id", "permission_code"],
            &[
                "id", "permission_code", "permission_name", "resource", "action", "description",
                "category", "create_time",
            ],
            None,
        )?;
        self.init_table_schema(
            "csm",
            "csm_role_permissions",
            &["id", "role_id", "permission_id"],
            &["id", "role_id", "permission_id", "create_time"],
            None,
        )?;
        self.init_table_schema(
            "csm",
            "csm_user_depts",
            &["id", "user_id", "dept_id"],
            &[
                "id", "user_id", "dept_id", "is_sub_user", "role_id", "direct_permissions",
                "permissionBitfield", "permissionSchemaVersion", "dataScope", "branch_id",
                "status", "join_date", "create_time",
            ],
            None,
        )?;
        self.init_table_schema(
            "csm",
            "csm_user_roles",
            &["id", "user_id", "role_id"],
            &["id", "user_id", "role_id", "create_time"],
            None,
        )?;
        self.init_table_schema(
            "csm",
            "sys_autos",
            &["id", "p_name", "p_type"],
            &[
                "id", "p_name", "p_type", "auto_code", "description", "create_time",
                "update_time",
            ],
            Some(&["p_name", "p_type", "id"]),
        )?;
        self.init_table_schema(
            "csm",
            "routers",
            &["path"],
            &["path", "component", "layout", "handle", "children"],
            None,
        )?;
        self.init_table_schema("csm", "index", &["id"], &["id", "struct"], None)?;

        let first_user_init = self.init_user_schemas()?;
        if first_user_init {
            self.create_default_admin()?;
        }

        self.seed_system_menu_if_missing()?;
        Ok("Default data seed completed".into())
    }

    fn init_table_schema(
        &self,
        app_id: &str,
        table_name: &str,
        pk_fields: &[&str],
        fields: &[&str],
        search_fields: Option<&[&str]>,
    ) -> anyhow::Result<()> {
        let filter = SearchFilter::eq("id", table_name);
        let existing = self.record_manager.find(app_id, "index", &filter);
        if !existing.is_empty() {
            return Ok(());
        }
        let mut struct_map = Map::new();
        struct_map.insert("fieldsPK".into(), json!(pk_fields));
        struct_map.insert("fields".into(), json!(fields));
        if let Some(sf) = search_fields {
            struct_map.insert("fieldsSearch".into(), json!(sf));
        }
        let mut record = Map::new();
        record.insert("id".into(), json!(table_name));
        record.insert("struct".into(), Value::Object(struct_map));
        self.record_manager
            .create_record(app_id, "index", record, Some(vec!["id".into()]))?;
        Ok(())
    }

    fn init_user_schemas(&self) -> anyhow::Result<bool> {
        let filter = SearchFilter::eq("id", "csm_accounts");
        let existing = self.record_manager.find("csm", "index", &filter);
        if !existing.is_empty() {
            return Ok(false);
        }
        self.init_table_schema(
            "csm",
            "csm_accounts",
            &["id"],
            &[
                "id", "username", "email", "phoneNumber", "full_name", "user_address", "app_id",
                "app_token", "refresh_token", "refresh", "login_version", "pass", "roles",
                "permissions", "menusPermissions", "dev", "status", "create_time", "update_time",
            ],
            Some(&[
                "id", "email", "username", "phoneNumber", "app_token", "refresh_token", "refresh",
            ]),
        )?;
        self.init_table_schema(
            "csm",
            "csm_group_members",
            &["id"],
            &[
                "id", "parent_user_id", "login_identifier", "app_token", "refresh", "pass",
                "permissions", "menusPermissions", "status", "create_time",
            ],
            Some(&["id", "login_identifier", "app_token", "refresh"]),
        )?;
        Ok(true)
    }

    fn create_default_admin(&self) -> anyhow::Result<()> {
        let pass = self
            .record_manager
            .csm_encrypt("admin_____123456789admin");
        let app_token_raw = "csm|admin|admin|admin";
        let app_token = self.record_manager.csm_encrypt(app_token_raw);
        let mut admin = Map::new();
        admin.insert("id".into(), json!(Uuid::new_v4().to_string()));
        admin.insert("username".into(), json!("admin"));
        admin.insert("pass".into(), json!(pass));
        admin.insert("app_token".into(), json!(app_token));
        admin.insert("app_id".into(), json!("csm"));
        admin.insert("roles".into(), json!(["admin"]));
        admin.insert("permissions".into(), json!(["*"]));
        admin.insert("menusPermissions".into(), json!(["*"]));
        admin.insert("dev".into(), json!(true));
        admin.insert("login_version".into(), json!(1));
        self.record_manager
            .create_record("csm", "csm_accounts", admin, None)?;
        Ok(())
    }

    fn seed_system_menu_if_missing(&self) -> anyhow::Result<()> {
        let filter = SearchFilter::eq("id", "menuR");
        let existing = self.record_manager.find("csm", "index", &filter);
        if !existing.is_empty() {
            return Ok(());
        }
        let menu_id = Uuid::new_v4().to_string();
        let system_menu = json!([{
            "id": menu_id,
            "menuType": 0,
            "name": "common.menu.system"
        }]);
        let mut record = Map::new();
        record.insert("id".into(), json!("menuR"));
        record.insert("data".into(), system_menu);
        self.record_manager
            .create_record("csm", "index", record, Some(vec!["id".into()]))?;
        Ok(())
    }
}
