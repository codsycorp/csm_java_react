//! Login / account diagnostics — full KV scan (mirrors `backend-go/cmd/diag-login`).
//!
//! Usage:
//!   csm_find_login                         # list all accounts from database
//!   csm_find_login <login>                 # full scan + match login via find()
//!   csm_find_login <login> <password>      # + test FindByLoginAndPassword

use std::sync::Arc;

use csm_server::config::AppConfig;
use csm_server::data::record_manager::RecordManager;
use csm_server::model::SearchFilter;
use csm_server::services::user::UserService;
use serde_json::{Map, Value};

const MAX_LIST: usize = 40;

fn main() -> anyhow::Result<()> {
    csm_server::load_config_env();

    let mut args = std::env::args().skip(1);
    let login = args.next();
    let password = args.next();

    if args.next().is_some() {
        eprintln!("Usage: csm_find_login [login] [password]");
        std::process::exit(2);
    }

    let config = AppConfig::from_env()?;
    config.log_storage_layout();
    println!(
        "table_kv_root={}",
        config.table_kv_root().display()
    );

    let rm = Arc::new(RecordManager::new(config)?);
    rm.init()?;
    let us = UserService::new(rm.clone());

    let accounts = scan_table(&rm, "csm", "csm_accounts")?;
    println!("csm_accounts count: {}", accounts.len());
    for (i, (key, rec)) in accounts.iter().enumerate() {
        if i >= MAX_LIST {
            println!("... and {} more", accounts.len() - MAX_LIST);
            break;
        }
        println!(
            "  key={} id={} user={} email={} actived={} pass_len={}",
            key,
            field_str(rec.get("id")),
            field_str(rec.get("username")),
            field_str(rec.get("email")),
            field_str(rec.get("actived")),
            pass_len(rec),
        );
    }

    let subs = scan_table(&rm, "csm", "csm_group_members")?;
    println!("\ncsm_group_members count: {}", subs.len());
    for (i, (key, rec)) in subs.iter().enumerate() {
        if i >= 15 {
            println!("... and {} more", subs.len() - 15);
            break;
        }
        println!(
            "  sub key={} login_identifier={} actived={} pass_len={}",
            key,
            field_str(rec.get("login_identifier")),
            field_str(rec.get("actived")),
            pass_len(rec),
        );
    }

    if let Some(ref login_id) = login {
        println!("\n--- probe login={login_id:?} ---");
        probe_login(&rm, &us, &accounts, &subs, login_id, password.as_deref())?;
    }

    Ok(())
}

fn scan_table(
    rm: &RecordManager,
    app_id: &str,
    table_name: &str,
) -> anyhow::Result<Vec<(String, Map<String, Value>)>> {
    let db = rm.get_db(app_id, table_name)?;
    let mut rows = Vec::new();
    db.for_each_entry(|key, value| {
        let key_str = String::from_utf8_lossy(key);
        if key_str.starts_with("__meta_") {
            return Ok(());
        }
        if let Ok(Value::Object(map)) = serde_json::from_slice::<Value>(value) {
            rows.push((key_str.into_owned(), map));
        }
        Ok(())
    })?;
    Ok(rows)
}

fn probe_login(
    rm: &RecordManager,
    us: &UserService,
    accounts: &[(String, Map<String, Value>)],
    subs: &[(String, Map<String, Value>)],
    login_id: &str,
    password: Option<&str>,
) -> anyhow::Result<()> {
    let mut main_hits = 0usize;
    for (key, rec) in accounts {
        let user = field_str(rec.get("username"));
        let email = field_str(rec.get("email"));
        if user.eq_ignore_ascii_case(login_id)
            || email.eq_ignore_ascii_case(login_id)
            || user == login_id
            || email == login_id
        {
            main_hits += 1;
            println!(
                "  scan HIT key={key} user={user} email={email} actived={} pass_empty={}",
                field_str(rec.get("actived")),
                pass_len(rec) == 0
            );
        }
    }
    if main_hits == 0 {
        println!("  scan main: (no match)");
    }

    let mut sub_hits = 0usize;
    for (key, rec) in subs {
        let li = field_str(rec.get("login_identifier"));
        if li.eq_ignore_ascii_case(login_id) || li == login_id {
            sub_hits += 1;
            println!(
                "  scan sub HIT key={key} login_identifier={li} actived={} pass_empty={}",
                field_str(rec.get("actived")),
                pass_len(rec) == 0
            );
        }
    }
    if sub_hits == 0 {
        println!("  scan sub: (no match)");
    }

    for field in ["username", "email", "phoneNumber"] {
        let filter = SearchFilter::eq(field, login_id);
        let rec = rm.find("csm", "csm_accounts", &filter);
        println!(
            "  find({field}={login_id}): {}",
            if rec.is_empty() { "MISS" } else { "HIT" }
        );
    }

    let sub = rm.find(
        "csm",
        "csm_group_members",
        &SearchFilter::eq("login_identifier", login_id),
    );
    println!(
        "  find(login_identifier={login_id}): {}",
        if sub.is_empty() { "MISS" } else { "HIT" }
    );

    if let Some(pw) = password {
        match us.find_by_login_and_password(login_id, pw) {
            Some(u) => println!(
                "  login: OK id={:?} username={:?} email={:?}",
                u.id, u.username, u.email
            ),
            None => println!("  login: FAILED"),
        }
    }

    Ok(())
}

fn field_str(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

fn pass_len(rec: &Map<String, Value>) -> usize {
    rec.get("pass")
        .or_else(|| rec.get("password"))
        .and_then(|v| v.as_str())
        .map(str::len)
        .unwrap_or(0)
}
