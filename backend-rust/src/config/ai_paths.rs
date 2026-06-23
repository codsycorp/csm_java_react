//! AI / GGUF path resolution — mirrors `run-go-server.sh` `resolve_model_path` + Go `envPath`.

use std::path::{Component, Path, PathBuf};

/// Resolve a data-relative path the same way as Go launcher:
/// - absolute → unchanged
/// - `./csm_datas/...` → `$CSM_HOME/csm_datas/...`
/// - `./foo` → `$APP_DATA_DIR/foo`
/// - `foo` → `$APP_DATA_DIR/foo`
pub fn resolve_data_path(raw: &str, data_dir: &Path) -> PathBuf {
    let raw = raw.trim();
    if raw.is_empty() {
        return PathBuf::new();
    }
    let path = Path::new(raw);
    if path.is_absolute() {
        return normalize_path(path);
    }

    let csm_home = std::env::var("CSM_HOME")
        .ok()
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .unwrap_or_else(super::deploy_root);

    if let Some(rest) = raw.strip_prefix("./") {
        if let Some(suffix) = rest.strip_prefix("csm_datas/") {
            return normalize_path(&csm_home.join("csm_datas").join(suffix));
        }
        let suffix = rest.strip_prefix("csm_datas/").unwrap_or(rest);
        return normalize_path(&data_dir.join(suffix));
    }

    normalize_path(&data_dir.join(raw))
}

pub fn resolve_path_env(key: &str, default: &Path, data_dir: &Path) -> PathBuf {
    match std::env::var(key) {
        Ok(v) if !v.trim().is_empty() => resolve_data_path(&v, data_dir),
        _ => default.to_path_buf(),
    }
}

pub fn resolve_optional_path_env(key: &str, data_dir: &Path) -> Option<PathBuf> {
    std::env::var(key)
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|v| resolve_data_path(&v, data_dir))
}

pub fn resolve_prompt_path_env(key: &str, default: &Path, data_dir: &Path) -> PathBuf {
    let raw = std::env::var(key).ok().filter(|s| !s.trim().is_empty());
    let stripped = raw
        .as_deref()
        .map(|s| {
            s.strip_prefix("file:")
                .or_else(|| s.strip_prefix("classpath:"))
                .unwrap_or(s)
        })
        .unwrap_or(default.to_str().unwrap_or(""));
    resolve_data_path(stripped, data_dir)
}

/// Rewrite env vars so code reading `AI_LOCAL_LLAMA_*` paths sees absolute paths (Go shell parity).
pub fn normalize_ai_path_env_vars(data_dir: &Path) {
    for key in [
        "AI_LOCAL_LLAMA_MODEL_PATH",
        "AI_LOCAL_LLAMA_SEO_MODEL_PATH",
        "AI_LOCAL_LLAMA_EMBEDDING_MODEL_PATH",
        "AI_CONTEXT_DIR",
        "AI_MENU_MASTER_PROMPT_PATH",
        "AI_CODE_MASTER_PROMPT_PATH",
        "AI_CONTEXT_MASTER_PROMPT_PATH",
        "AI_CONTEXT_CODE_MASTER_PROMPT_PATH",
    ] {
        let Ok(raw) = std::env::var(key) else {
            continue;
        };
        if raw.trim().is_empty() {
            continue;
        }
        let resolved = resolve_data_path(&raw, data_dir);
        std::env::set_var(key, resolved.display().to_string());
    }
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}
