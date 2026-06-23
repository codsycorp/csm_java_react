//! Rebuild Rust secondary indexes from Go/Pebble KV (Tantivy, Qdrant vector, eq-index).
//!
//! Go runtime stores records in Pebble; Rust cannot reuse chromem vectors — this tool
//! scans each `{pebble_root}/{app}/{table}/` and calls `index_existing_records`.
//!
//! Usage:
//!   csm_migrate_go                    # all tables under pebble root
//!   csm_migrate_go --dry-run
//!   csm_migrate_go --only csm/sys_autos,csm/csm_accounts
//!   csm_migrate_go --app csm

use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::Arc;

use csm_server::config::AppConfig;
use csm_server::data::record_manager::RecordManager;

const DEFAULT_SKIP_APPS: &[&str] = &["fidovnemail"];

fn main() -> anyhow::Result<()> {
    csm_server::load_config_env();

    let mut dry_run = false;
    let mut only: Vec<(String, String)> = Vec::new();
    let mut app_filter: Option<String> = None;
    let mut skip_apps: HashSet<String> = DEFAULT_SKIP_APPS
        .iter()
        .map(|s| s.to_ascii_lowercase())
        .collect();

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--dry-run" => dry_run = true,
            "--only" => {
                let v = args.next().ok_or_else(|| anyhow::anyhow!("--only requires value"))?;
                only.extend(parse_table_specs(&v));
            }
            "--app" => {
                app_filter = Some(
                    args.next()
                        .ok_or_else(|| anyhow::anyhow!("--app requires value"))?,
                );
            }
            "--skip-apps" => {
                let v = args
                    .next()
                    .ok_or_else(|| anyhow::anyhow!("--skip-apps requires value"))?;
                skip_apps = v
                    .split(',')
                    .map(|s| s.trim().to_ascii_lowercase())
                    .filter(|s| !s.is_empty())
                    .collect();
            }
            "-h" | "--help" => {
                print_help();
                return Ok(());
            }
            other => anyhow::bail!("unknown argument: {other} (try --help)"),
        }
    }

    let config = AppConfig::from_env()?;
    config.log_storage_layout();

    let tables = if only.is_empty() {
        discover_tables(&config.pebble_root, app_filter.as_deref(), &skip_apps)?
    } else {
        only
    };

    if tables.is_empty() {
        println!("No tables to reindex under {}", config.pebble_root.display());
        return Ok(());
    }

    println!(
        "Reindex target: {} table(s) (dry_run={dry_run}, vector_dir={})",
        tables.len(),
        config.vector_store_dir.display()
    );

    if dry_run {
        for (app, table) in &tables {
            let path = config.pebble_root.join(app).join(table);
            let size = dir_size_bytes(&path).unwrap_or(0);
            println!("  would reindex {app}/{table} ({size} bytes on disk)");
        }
        return Ok(());
    }

    let rm = Arc::new(RecordManager::new(config.clone())?);
    rm.init()?;

    let mut ok = 0usize;
    let mut failed = 0usize;
    for (app, table) in &tables {
        let label = format!("{app}/{table}");
        match rm.index_existing_records(app, table) {
            Ok(n) => {
                println!("  OK {label}: indexed {n} records");
                ok += 1;
            }
            Err(e) => {
                eprintln!("  FAIL {label}: {e}");
                failed += 1;
            }
        }
    }

    println!();
    println!("Done: {ok} ok, {failed} failed (of {} tables)", tables.len());
    if failed > 0 {
        std::process::exit(1);
    }
    Ok(())
}

fn print_help() {
    println!(
        r#"csm_migrate_go — rebuild Rust indexes from Go Pebble KV

Options:
  --dry-run              List tables without writing indexes
  --only app/table,...   Reindex only these tables
  --app APP_ID           Limit discovery to one app
  --skip-apps a,b        Skip app dirs (default: fidovnemail)

Env: same as run-rust-server.sh (CSM_HOME, APP_DATA_DIR, CSM_PEBBLE_ROOT, CSM_VECTOR_DIR).
"#
    );
}

fn parse_table_specs(raw: &str) -> Vec<(String, String)> {
    raw.split(',')
        .filter_map(|part| {
            let part = part.trim();
            if part.is_empty() {
                return None;
            }
            let (app, table) = part.split_once('/')?;
            Some((app.trim().to_string(), table.trim().to_string()))
        })
        .collect()
}

fn discover_tables(
    pebble_root: &Path,
    app_filter: Option<&str>,
    skip_apps: &HashSet<String>,
) -> anyhow::Result<Vec<(String, String)>> {
    if !pebble_root.is_dir() {
        anyhow::bail!("pebble root not found: {}", pebble_root.display());
    }

    let mut out = Vec::new();
    for app_entry in fs::read_dir(pebble_root)? {
        let app_entry = app_entry?;
        if !app_entry.file_type()?.is_dir() {
            continue;
        }
        let app = app_entry.file_name().to_string_lossy().to_string();
        if app == "csm.kv" {
            continue;
        }
        if skip_apps.contains(&app.to_ascii_lowercase()) {
            continue;
        }
        if let Some(want) = app_filter {
            if !app.eq_ignore_ascii_case(want) {
                continue;
            }
        }

        for table_entry in fs::read_dir(app_entry.path())? {
            let table_entry = table_entry?;
            if !table_entry.file_type()?.is_dir() {
                continue;
            }
            let table = table_entry.file_name().to_string_lossy().to_string();
            if table.starts_with('.') {
                continue;
            }
            if !looks_like_pebble_table(&table_entry.path()) {
                continue;
            }
            out.push((app.clone(), table));
        }
    }

    out.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
    Ok(out)
}

fn looks_like_pebble_table(path: &Path) -> bool {
    let Ok(entries) = fs::read_dir(path) else {
        return false;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name == "CURRENT"
            || name == "MANIFEST"
            || name.ends_with(".sst")
            || name.ends_with(".log")
            || name == "LOCK"
        {
            return true;
        }
    }
    false
}

fn dir_size_bytes(path: &Path) -> std::io::Result<u64> {
    let mut total = 0u64;
    if path.is_file() {
        return Ok(fs::metadata(path)?.len());
    }
    if !path.is_dir() {
        return Ok(0);
    }
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let meta = entry.metadata()?;
        if meta.is_dir() {
            total = total.saturating_add(dir_size_bytes(&entry.path())?);
        } else {
            total = total.saturating_add(meta.len());
        }
    }
    Ok(total)
}
