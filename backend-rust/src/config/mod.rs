use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

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

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub socket: SocketConfig,
    pub data_dir: PathBuf,
    pub rocksdb_root: PathBuf,
    pub rocksdb_backup: PathBuf,
    pub lucene_index_root: PathBuf,
    pub jwt_secret: String,
    pub redis: RedisConfig,
    pub auth_rate_limit: AuthRateLimitConfig,
    pub ai_local_llama_model_path: Option<PathBuf>,
    pub ai_local_llama_context_window: u32,
    pub ai_local_llama_max_tokens: u32,
    pub ai_local_llama_max_prompt_chars: usize,
    pub ai_local_llama_threads: i32,
    pub ai_local_llama_temperature: f32,
    pub ai_local_llama_top_p: f32,
    pub ai_local_llama_top_k: i32,
    pub ai_local_llama_gpu_layers: u32,
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        let data_dir = env_path("APP_DATA_DIR", "./csm_datas");
        let rocksdb_root = env_path("ROCKSDB_ROOT_DIR", &format!("{}/database", data_dir.display()));
        let rocksdb_backup = env_path("ROCKSDB_BACKUP_DIR", &format!("{}/backups", data_dir.display()));
        let lucene_index_root =
            env_path("LUCENE_INDEX_ROOT_DIR", &format!("{}/lucene_index", data_dir.display()));

        Ok(Self {
            server: ServerConfig {
                host: env_string("SERVER_HOST", "0.0.0.0"),
                port: env_u16("SERVER_PORT", 15300),
            },
            socket: SocketConfig {
                host: env_string("SOCKET_SERVER_HOST", "0.0.0.0"),
                port: env_u16("SOCKET_SERVER_PORT", 15301),
            },
            data_dir,
            rocksdb_root,
            rocksdb_backup,
            lucene_index_root,
            jwt_secret: env_string("JWT_SECRET", ""),
            redis: RedisConfig {
                host: env_string("REDIS_HOST", "localhost"),
                port: env_u16("REDIS_PORT", 6379),
                ttl_ms: env_u64("REDIS_TTL_MS", 600_000),
            },
            auth_rate_limit: AuthRateLimitConfig {
                max_requests_per_minute: env_u32("AUTH_RATE_LIMIT_MAX", 120),
                window_ms: env_u64("AUTH_RATE_LIMIT_WINDOW_MS", 60_000),
            },
            ai_local_llama_model_path: std::env::var("AI_LOCAL_LLAMA_MODEL_PATH")
                .ok()
                .map(PathBuf::from),
            ai_local_llama_context_window: env_u32("AI_LOCAL_LLAMA_CONTEXT_WINDOW", 8192),
            ai_local_llama_max_tokens: env_u32("AI_LOCAL_LLAMA_MAX_TOKENS", 2048),
            ai_local_llama_max_prompt_chars: env_usize("AI_LOCAL_LLAMA_MAX_PROMPT_CHARS", 32_000),
            ai_local_llama_threads: env_i32("AI_LOCAL_LLAMA_THREADS", 4),
            ai_local_llama_temperature: env_f32("AI_LOCAL_LLAMA_TEMPERATURE", 0.2),
            ai_local_llama_top_p: env_f32("AI_LOCAL_LLAMA_TOP_P", 0.9),
            ai_local_llama_top_k: env_i32("AI_LOCAL_LLAMA_TOP_K", 40),
            ai_local_llama_gpu_layers: env_u32("AI_LOCAL_LLAMA_GPU_LAYERS", default_gpu_layers()),
        })
    }

    pub fn llama_native_config(&self) -> crate::services::llama_native::NativeConfig {
        crate::services::llama_native::NativeConfig {
            model_path: self
                .ai_local_llama_model_path
                .clone()
                .unwrap_or_else(|| PathBuf::from("./csm_datas/ai_local/model/model.gguf")),
            context_window: self.ai_local_llama_context_window,
            max_tokens: self.ai_local_llama_max_tokens,
            max_prompt_chars: self.ai_local_llama_max_prompt_chars,
            threads: self.ai_local_llama_threads,
            temperature: self.ai_local_llama_temperature,
            top_p: self.ai_local_llama_top_p,
            top_k: self.ai_local_llama_top_k,
            gpu_layers: self.ai_local_llama_gpu_layers,
        }
    }
}

fn default_gpu_layers() -> u32 {
    if cfg!(target_os = "macos") {
        // 999 = offload all layers; Metal backend ignores values > actual layer count
        999
    } else {
        0
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
    PathBuf::from(env_string(key, default))
}

pub fn ensure_dir(path: &Path) -> Result<()> {
    if !path.exists() {
        std::fs::create_dir_all(path)
            .with_context(|| format!("Failed to create directory {}", path.display()))?;
    }
    Ok(())
}
