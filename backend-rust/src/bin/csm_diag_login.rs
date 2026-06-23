//! Login diagnostics — mirrors `backend-go/cmd/diag-login`.

use csm_server::config::AppConfig;
use csm_server::data::record_manager::RecordManager;
use serde_json::Value;

fn main() -> anyhow::Result<()> {
    csm_server::load_config_env();
    let config = AppConfig::from_env()?;
    let rm = RecordManager::new(config)?;
    rm.init()?;

    for table in ["csm_accounts", "csm_group_members"] {
        println!("=== {table} ===");
        let db = rm.get_db("csm", table)?;
        let mut count = 0usize;
        db.for_each_entry(|key, value| {
            let key_str = String::from_utf8_lossy(key);
            if key_str.starts_with("__meta_") {
                return Ok(());
            }
            count += 1;
            if count <= 5 {
                if let Ok(Value::Object(rec)) = serde_json::from_slice::<Value>(value) {
                    println!(
                        "  key={key_str} id={} user={} email={} login_identifier={}",
                        rec.get("id").unwrap_or(&Value::Null),
                        rec.get("username").unwrap_or(&Value::Null),
                        rec.get("email").unwrap_or(&Value::Null),
                        rec.get("login_identifier").unwrap_or(&Value::Null),
                    );
                }
            }
            Ok(())
        })?;
        println!("totalCount: {count}");
    }

    Ok(())
}
