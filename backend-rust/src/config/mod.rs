use std::path::{Component, Path, PathBuf};

use anyhow::{Context, Result};

mod ai_paths;
mod ai_runtime_tune;

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone)]
pub struct SocketConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone)]
pub struct RedisConfig {
    pub host: String,
    pub port: u16,
    pub ttl_ms: u64,
}

#[derive(Debug, Clone)]
pub struct AuthRateLimitConfig {
    pub max_requests_per_minute: u32,
    pub window_ms: u64,
}

/// Runtime KV — Rust uses Pebble only (parity with Go production).
pub const KV_ENGINE_PEBBLE: &str = "pebble";

#[derive(Debug, Clone)]
pub struct GoogleIndexConfig {
    pub service_account_path: Option<PathBuf>,
    pub daily_limit: i32,
    pub work_dir: PathBuf,
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub socket: SocketConfig,
    pub data_dir: PathBuf,
    pub native_data_dir: PathBuf,
    pub pebble_root: PathBuf,
    pub pebble_legacy: Option<PathBuf>,
    pub kv_backup_dir: PathBuf,
    pub lucene_index_root: PathBuf,
    pub search_db_path: PathBuf,
    pub vector_store_dir: PathBuf,
    pub eq_index_mode: String,
    pub eq_index_root: PathBuf,
    pub vector_records_enabled: bool,
    pub startup_reindex: bool,
    pub startup_reindex_tables: Vec<String>,
    pub pebble_cache_mb: u32,
    pub pebble_memtable_mb: u32,
    pub pebble_index_memtable_mb: u32,
    pub google_index: GoogleIndexConfig,
    pub jwt_secret: String,
    pub redis: RedisConfig,
    pub auth_rate_limit: AuthRateLimitConfig,
    pub ai_local_llama_native_enabled: bool,
    pub ai_local_llama_preload_on_startup: bool,
    pub ai_local_llama_model_path: Option<PathBuf>,
    pub ai_local_llama_seo_model_path: Option<PathBuf>,
    pub ai_local_llama_embedding_model_path: Option<PathBuf>,
    pub ai_local_llama_context_window: u32,
    pub ai_local_llama_max_tokens: u32,
    pub ai_local_llama_max_prompt_chars: usize,
    pub ai_local_llama_threads: i32,
    pub ai_local_llama_temperature: f32,
    pub ai_local_llama_top_p: f32,
    pub ai_local_llama_top_k: i32,
    pub ai_local_llama_gpu_layers: u32,
    pub ai_local_llama_batch_size: u32,
    pub ai_local_llama_ubatch_size: u32,
    pub ai_local_llama_context_window_hard_cap: u32,
    pub ai_local_llama_use_mmap: bool,
    pub ai_local_llama_use_mlock: bool,
    pub ai_context_dir: PathBuf,
    pub ai_context_master_prompt_path: PathBuf,
    pub ai_context_code_master_prompt_path: PathBuf,
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        let data_dir = resolve_data_dir();
        let native_data_dir =
            env_path_or_default("CSM_NATIVE_DATA_DIR", data_dir.join("native"));
        let pebble_root = env_path_or_default("CSM_PEBBLE_ROOT", native_data_dir.join("pebble"));
        let pebble_legacy = resolve_pebble_legacy(&native_data_dir, &pebble_root);
        let kv_backup_dir = std::env::var("CSM_KV_BACKUP_DIR")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .map(|s| resolve_deploy_path(PathBuf::from(s)))
            .unwrap_or_else(|| env_path_or_default("ROCKSDB_BACKUP_DIR", data_dir.join("backups")));
        let lucene_index_root =
            env_path_or_default("LUCENE_INDEX_ROOT_DIR", data_dir.join("lucene_index"));
        let search_db_path =
            env_path_or_default("CSM_SEARCH_DB_PATH", native_data_dir.join("search").join("vectors.db"));
        let vector_store_dir = env_path_or_default(
            "CSM_VECTOR_DIR",
            native_data_dir.join("vector").join("qdrant"),
        );
        let eq_index_root = env_path_or_default("CSM_EQ_INDEX_ROOT", native_data_dir.join("eq_index"));
        let startup_reindex_tables = env_string_list(
            "CSM_STARTUP_REINDEX_TABLES",
            &[
                "csm/csm_accounts",
                "csm/csm_group_members",
                "csm/sys_autos",
            ],
        );
        let google_index_work_dir =
            env_path_or_default("GOOGLE_INDEX_WORK_DIR", data_dir.join("google_index"));
        let ai_context_dir = ai_paths::resolve_path_env(
            "AI_CONTEXT_DIR",
            &data_dir.join("ai_local"),
            &data_dir,
        );
        let ai_menu_prompt = ai_paths::resolve_prompt_path_env(
            "AI_MENU_MASTER_PROMPT_PATH",
            &ai_context_dir.join("ai_menu_master_prompt.md"),
            &data_dir,
        );
        let ai_code_prompt = ai_paths::resolve_prompt_path_env(
            "AI_CODE_MASTER_PROMPT_PATH",
            &ai_context_dir.join("ai_code_master_prompt.md"),
            &data_dir,
        );
        let default_model = data_dir.join("ai_local").join("model").join("model.gguf");
        let ai_model_path = Some(ai_paths::resolve_path_env(
            "AI_LOCAL_LLAMA_MODEL_PATH",
            &default_model,
            &data_dir,
        ));
        let ai_seo_model_path =
            ai_paths::resolve_optional_path_env("AI_LOCAL_LLAMA_SEO_MODEL_PATH", &data_dir);
        let ai_embedding_model_path =
            ai_paths::resolve_optional_path_env("AI_LOCAL_LLAMA_EMBEDDING_MODEL_PATH", &data_dir);

        let mut cfg = Self {
            server: ServerConfig {
                host: env_string("SERVER_HOST", "0.0.0.0"),
                port: env_u16("SERVER_PORT", 9999),
            },
            socket: SocketConfig {
                host: env_string("SOCKET_SERVER_HOST", "0.0.0.0"),
                port: env_u16("SOCKET_SERVER_PORT", 15301),
            },
            data_dir,
            native_data_dir,
            pebble_root,
            pebble_legacy,
            kv_backup_dir,
            lucene_index_root,
            search_db_path,
            vector_store_dir,
            eq_index_mode: env_string("CSM_EQ_INDEX_MODE", &default_eq_index_mode()),
            eq_index_root,
            vector_records_enabled: env_flag_true("CSM_VECTOR_RECORDS_ENABLED", !is_low_ram_profile()),
            startup_reindex: env_flag_true("CSM_STARTUP_REINDEX", true),
            startup_reindex_tables,
            pebble_cache_mb: env_u32("CSM_PEBBLE_CACHE_MB", default_pebble_cache_mb()),
            pebble_memtable_mb: env_u32("CSM_PEBBLE_MEMTABLE_MB", default_pebble_memtable_mb()),
            pebble_index_memtable_mb: env_u32(
                "CSM_PEBBLE_INDEX_MEMTABLE_MB",
                default_pebble_index_memtable_mb(),
            ),
            google_index: GoogleIndexConfig {
                service_account_path: std::env::var("GOOGLE_INDEX_SERVICE_ACCOUNT_PATH")
                    .ok()
                    .filter(|s| !s.trim().is_empty())
                    .map(|p| resolve_deploy_path(PathBuf::from(p))),
                daily_limit: env_i32("GOOGLE_INDEX_DAILY_LIMIT", 200),
                work_dir: google_index_work_dir,
            },
            jwt_secret: env_string("JWT_SECRET", "change-me-to-a-strong-secretge"),
            redis: RedisConfig {
                host: env_string("REDIS_HOST", "localhost"),
                port: env_u16("REDIS_PORT", 6379),
                ttl_ms: env_u64("REDIS_TTL_MS", 600_000),
            },
            auth_rate_limit: AuthRateLimitConfig {
                max_requests_per_minute: env_u32("AUTH_RATE_LIMIT_MAX", 120),
                window_ms: env_u64("AUTH_RATE_LIMIT_WINDOW_MS", 60_000),
            },
            ai_local_llama_native_enabled: env_flag_true("AI_LOCAL_LLAMA_NATIVE_ENABLED", true),
            ai_local_llama_preload_on_startup: env_flag_true(
                "AI_LOCAL_LLAMA_PRELOAD_ON_STARTUP",
                false,
            ),
            ai_local_llama_model_path: ai_model_path,
            ai_local_llama_seo_model_path: ai_seo_model_path,
            ai_local_llama_embedding_model_path: ai_embedding_model_path,
            ai_local_llama_context_window: env_u32("AI_LOCAL_LLAMA_CONTEXT_WINDOW", 8192),
            ai_local_llama_max_tokens: env_u32("AI_LOCAL_LLAMA_MAX_TOKENS", 768),
            ai_local_llama_max_prompt_chars: env_usize("AI_LOCAL_LLAMA_MAX_PROMPT_CHARS", 32_000),
            ai_local_llama_threads: env_i32("AI_LOCAL_LLAMA_THREADS", 4),
            ai_local_llama_temperature: env_f32("AI_LOCAL_LLAMA_TEMPERATURE", 0.2),
            ai_local_llama_top_p: env_f32("AI_LOCAL_LLAMA_TOP_P", 0.9),
            ai_local_llama_top_k: env_i32("AI_LOCAL_LLAMA_TOP_K", 40),
            ai_local_llama_gpu_layers: env_u32("AI_LOCAL_LLAMA_GPU_LAYERS", 0),
            ai_local_llama_batch_size: env_u32("AI_LOCAL_LLAMA_BATCH_SIZE", 512),
            ai_local_llama_ubatch_size: env_u32("AI_LOCAL_LLAMA_UBATCH_SIZE", 64),
            ai_local_llama_context_window_hard_cap: env_u32(
                "AI_LOCAL_LLAMA_CONTEXT_WINDOW_HARD_CAP",
                8192,
            ),
            ai_local_llama_use_mmap: env_flag_true("AI_LOCAL_LLAMA_USE_MMAP", true),
            ai_local_llama_use_mlock: env_flag_true("AI_LOCAL_LLAMA_USE_MLOCK", false),
            ai_context_dir,
            ai_context_master_prompt_path: ai_menu_prompt,
            ai_context_code_master_prompt_path: ai_code_prompt,
        };
        ai_runtime_tune::apply_ai_runtime_auto_tune(&mut cfg);
        Ok(cfg)
    }

    pub fn effective_llama_context_window(&self) -> u32 {
        self.ai_local_llama_context_window
            .min(self.ai_local_llama_context_window_hard_cap)
            .max(512)
    }

    pub fn effective_llama_max_tokens(&self) -> u32 {
        if self.ai_local_llama_max_tokens > 0 {
            self.ai_local_llama_max_tokens
        } else {
            768
        }
    }

    /// Mirrors Go `EffectiveLlamaBatchSize`.
    pub fn effective_llama_batch_size(&self) -> u32 {
        let mut batch = self.ai_local_llama_batch_size;
        if batch == 0 {
            batch = 512;
        }
        let ctx = self.effective_llama_context_window();
        if batch > ctx {
            return ctx;
        }
        if batch < 512 && ctx >= 512 {
            batch = 512;
        }
        batch
    }

    pub fn effective_code_stream_prompt_cap(&self) -> usize {
        let stream_cap = env_usize("AI_CODE_STREAM_MAX_PROMPT_CHARS", 52_000);
        stream_cap.min(self.ai_local_llama_max_prompt_chars.max(8_000))
    }

    /// Per-table Pebble KV root: `{pebble_root}/{app_id}/{table_name}/`.
    pub fn table_kv_root(&self) -> &Path {
        &self.pebble_root
    }

    pub fn kv_engine_name(&self) -> &'static str {
        KV_ENGINE_PEBBLE
    }

    pub fn uses_memory_eq_index(&self) -> bool {
        let mode = self.eq_index_mode.to_ascii_lowercase();
        mode == "memory" || mode.is_empty()
    }

    pub fn uses_pebble_eq_index(&self) -> bool {
        self.eq_index_mode.eq_ignore_ascii_case("pebble")
    }

    pub fn uses_eq_index(&self) -> bool {
        self.uses_memory_eq_index() || self.uses_pebble_eq_index()
    }

    pub fn eq_index_mode_effective(&self) -> &str {
        self.eq_index_mode.as_str()
    }

    /// Log resolved storage layout (parity with Go `run-go-server.sh` startup lines).
    pub fn log_storage_layout(&self) {
        tracing::info!("CSM_HOME={}", std::env::var("CSM_HOME").unwrap_or_else(|_| "(not set)".into()));
        tracing::info!("APP_DATA_DIR={}", self.data_dir.display());
        tracing::info!("CSM_NATIVE_DATA_DIR={}", self.native_data_dir.display());
        tracing::info!(
            "Pebble root {}/{{app_id}}/{{table_name}}/ (kv_engine={})",
            self.pebble_root.display(),
            KV_ENGINE_PEBBLE
        );
        if let Some(ref legacy) = self.pebble_legacy {
            tracing::info!("Pebble legacy read fallback: {}", legacy.display());
        }
        tracing::info!("KV backup dir: {}", self.kv_backup_dir.display());
        tracing::info!("Eq-index mode={} root={}", self.eq_index_mode_effective(), self.eq_index_root.display());
        tracing::info!("Vector store (qdrant-edge): {}", self.vector_store_dir.display());
        self.log_ai_layout();
    }

    pub fn log_ai_layout(&self) {
        tracing::info!(
            "AI native={} preload={} autoTune={}",
            self.ai_local_llama_native_enabled,
            self.ai_local_llama_preload_on_startup,
            env_flag_true("AI_LOCAL_RUNTIME_AUTO_TUNE", true),
        );
        if let Some(ref p) = self.ai_local_llama_model_path {
            tracing::info!("AI model: {}", p.display());
        }
        if let Some(ref p) = self.ai_local_llama_seo_model_path {
            tracing::info!("AI SEO model: {}", p.display());
        }
        if let Some(ref p) = self.ai_local_llama_embedding_model_path {
            tracing::info!("AI embedding model: {}", p.display());
        }
        tracing::info!(
            "AI ctx={} batch={} (effective {}) maxTok={} threads={} gpuLayers={}",
            self.ai_local_llama_context_window,
            self.ai_local_llama_batch_size,
            self.effective_llama_batch_size(),
            self.effective_llama_max_tokens(),
            self.ai_local_llama_threads,
            self.ai_local_llama_gpu_layers,
        );
        tracing::info!("AI context dir: {}", self.ai_context_dir.display());
    }

    #[cfg(feature = "local-ai")]
    pub fn llama_native_config(&self) -> crate::services::llama_native::NativeConfig {
        crate::services::llama_native::NativeConfig {
            model_path: self
                .ai_local_llama_model_path
                .clone()
                .unwrap_or_else(|| self.data_dir.join("ai_local").join("model").join("model.gguf")),
            context_window: self.effective_llama_context_window(),
            max_tokens: self.effective_llama_max_tokens(),
            max_prompt_chars: self.ai_local_llama_max_prompt_chars,
            threads: self.ai_local_llama_threads,
            temperature: self.ai_local_llama_temperature,
            top_p: self.ai_local_llama_top_p,
            top_k: self.ai_local_llama_top_k,
            gpu_layers: self.ai_local_llama_gpu_layers,
            batch_size: self.effective_llama_batch_size(),
            ubatch_size: self.ai_local_llama_ubatch_size,
            use_mmap: self.ai_local_llama_use_mmap,
            use_mlock: self.ai_local_llama_use_mlock,
        }
    }
}

fn is_low_ram_profile() -> bool {
    let profile = std::env::var("CSM_LOCAL_PROFILE")
        .or_else(|_| std::env::var("AI_LOCAL_MODE"))
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(
        profile.as_str(),
        "8gb" | "7b" | "local-8gb" | "weak" | "balanced-8gb"
    )
}

fn default_eq_index_mode() -> String {
    if is_low_ram_profile() {
        "pebble".to_string()
    } else {
        "memory".to_string()
    }
}

fn default_pebble_cache_mb() -> u32 {
    if is_low_ram_profile() { 32 } else { 64 }
}

fn default_pebble_memtable_mb() -> u32 {
    if is_low_ram_profile() { 8 } else { 32 }
}

fn default_pebble_index_memtable_mb() -> u32 {
    if is_low_ram_profile() { 4 } else { 8 }
}

/// Mirrors Go `resolveDataDir`.
fn resolve_data_dir() -> PathBuf {
    if let Ok(v) = std::env::var("APP_DATA_DIR") {
        if !v.trim().is_empty() {
            return resolve_deploy_path(PathBuf::from(v));
        }
    }
    for candidate in [
        "./backend/csm_datas",
        "../backend/csm_datas",
        "./csm_datas",
        "../csm_datas",
    ] {
        let resolved = resolve_deploy_path(PathBuf::from(candidate));
        if resolved.join("database").is_dir() {
            return resolved;
        }
    }
    resolve_deploy_path(PathBuf::from("./backend/csm_datas"))
}

/// Mirrors Go `resolvePebbleLegacy`.
fn resolve_pebble_legacy(native_dir: &Path, pebble_root: &Path) -> Option<PathBuf> {
    if let Ok(v) = std::env::var("CSM_PEBBLE_LEGACY") {
        if !v.trim().is_empty() {
            return Some(resolve_deploy_path(PathBuf::from(v)));
        }
    }
    if let Ok(v) = std::env::var("CSM_PEBBLE_PATH") {
        if !v.trim().is_empty() {
            return Some(resolve_deploy_path(PathBuf::from(v)));
        }
    }
    let candidate = pebble_root.join("csm.kv");
    if candidate.is_dir() {
        return Some(candidate);
    }
    let alt = native_dir.join("pebble").join("csm.kv");
    if alt.is_dir() {
        return Some(alt);
    }
    None
}

fn env_path_or_default(key: &str, default: PathBuf) -> PathBuf {
    std::env::var(key)
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|s| resolve_deploy_path(PathBuf::from(s)))
        .unwrap_or(default)
}

fn env_string_list(key: &str, default: &[&str]) -> Vec<String> {
    match std::env::var(key) {
        Ok(v) if !v.trim().is_empty() => v
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect(),
        _ => default.iter().map(|s| (*s).to_string()).collect(),
    }
}

fn env_i32(key: &str, default: i32) -> i32 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_usize(key: &str, default: usize) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_f32(key: &str, default: f32) -> f32 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_string(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

fn env_u16(key: &str, default: u16) -> u16 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_u32(key: &str, default: u32) -> u32 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_path(key: &str, default: &str) -> PathBuf {
    resolve_deploy_path(PathBuf::from(env_string(key, default)))
}

pub(crate) fn deploy_root() -> PathBuf {
    std::env::var("CSM_HOME")
        .map(PathBuf::from)
        .ok()
        .filter(|p| p.is_dir())
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."))
}

fn resolve_deploy_path(path: PathBuf) -> PathBuf {
    let base = deploy_root();
    let joined = if path.is_absolute() {
        path
    } else {
        base.join(path)
    };
    normalize_path(&joined)
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

pub fn skip_startup_db_init() -> bool {
    env_flag_true("CSM_SKIP_STARTUP_DB_INIT", false)
}

fn env_flag_true(key: &str, default: bool) -> bool {
    match std::env::var(key) {
        Ok(v) => {
            let v = v.trim().to_ascii_lowercase();
            v == "1" || v == "true" || v == "yes"
        }
        Err(_) => default,
    }
}

pub fn prepare_ai_env_defaults() {
    ai_runtime_tune::apply_darwin_ai_shell_defaults();
    ai_runtime_tune::apply_linux_ai_batch_floor();
    if let Ok(app_data) = std::env::var("APP_DATA_DIR") {
        ai_paths::normalize_ai_path_env_vars(Path::new(&app_data));
    }
}

pub fn ensure_dir(path: &Path) -> Result<()> {
    if !path.exists() {
        std::fs::create_dir_all(path)
            .with_context(|| format!("Failed to create directory {}", path.display()))?;
    }
    Ok(())
}
