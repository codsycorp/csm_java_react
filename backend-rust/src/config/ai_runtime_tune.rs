//! AI runtime auto-tune — mirrors `backend-go/internal/config/ai_runtime_tune.go`.

use std::sync::OnceLock;

use tracing::info;

use super::AppConfig;

struct AiRuntimeProfile {
    name: &'static str,
    ctx: u32,
    batch: u32,
    max_tokens: u32,
    max_prompt_chars: usize,
    threads: i32,
}

pub fn apply_ai_runtime_auto_tune(cfg: &mut AppConfig) {
    if !env_flag_true("AI_LOCAL_RUNTIME_AUTO_TUNE", true) {
        return;
    }
    if !cfg.ai_local_llama_native_enabled {
        return;
    }

    let ram_gib = detect_system_ram_gib();
    let cpus = std::thread::available_parallelism()
        .map(|n| n.get() as i32)
        .unwrap_or(1)
        .max(1);
    let p = pick_ai_runtime_profile(ram_gib, cpus);

    if !env_is_set("AI_LOCAL_LLAMA_CONTEXT_WINDOW") && p.ctx > 0 {
        cfg.ai_local_llama_context_window = p.ctx;
    }
    if !env_is_set("AI_LOCAL_LLAMA_BATCH_SIZE") && p.batch > 0 {
        cfg.ai_local_llama_batch_size = p.batch;
    }
    if !env_is_set("AI_LOCAL_LLAMA_MAX_TOKENS") && p.max_tokens > 0 {
        cfg.ai_local_llama_max_tokens = p.max_tokens;
    }
    if !env_is_set("AI_LOCAL_LLAMA_MAX_PROMPT_CHARS") && p.max_prompt_chars > 0 {
        cfg.ai_local_llama_max_prompt_chars = p.max_prompt_chars;
    }
    if !env_is_set("AI_LOCAL_LLAMA_THREADS") && p.threads > 0 {
        cfg.ai_local_llama_threads = p.threads;
    }

    info!(
        "AI runtime auto-tune: profile={} ram={:.1}GiB cpu={} ctx={} batch={} maxTok={} maxPromptChars={} threads={}",
        p.name,
        ram_gib,
        cpus,
        cfg.ai_local_llama_context_window,
        cfg.ai_local_llama_batch_size,
        cfg.ai_local_llama_max_tokens,
        cfg.ai_local_llama_max_prompt_chars,
        cfg.ai_local_llama_threads,
    );
}

pub fn apply_darwin_ai_shell_defaults() {
    if !cfg!(target_os = "macos") {
        return;
    }
    set_default_env("AI_LOCAL_LLAMA_GPU_LAYERS", "0");
    set_default_env("GGML_METAL", "0");
    set_default_env("AI_LOCAL_LLAMA_ISOLATED", "true");
    set_default_env("AI_LOCAL_RUNTIME_AUTO_TUNE", "true");

    if !env_flag_true("AI_LOCAL_RUNTIME_AUTO_TUNE", true) {
        set_default_env("AI_LOCAL_LLAMA_BATCH_SIZE", "512");
        set_default_env("AI_LOCAL_LLAMA_UBATCH_SIZE", "64");
        if !env_flag_true("AI_LOCAL_PROMPT_BUDGET_DISABLED", false) {
            set_default_env("AI_LOCAL_LLAMA_CONTEXT_WINDOW", "4096");
            clamp_env_u32_max("AI_LOCAL_LLAMA_CONTEXT_WINDOW", 4096);
            set_default_env("AI_LOCAL_LLAMA_MAX_PROMPT_CHARS", "32000");
            clamp_env_usize_max("AI_LOCAL_LLAMA_MAX_PROMPT_CHARS", 32_000);
        }
    }
}

pub fn apply_linux_ai_batch_floor() {
    if cfg!(target_os = "macos") {
        return;
    }
    if let Ok(v) = std::env::var("AI_LOCAL_LLAMA_BATCH_SIZE") {
        if let Ok(n) = v.parse::<u32>() {
            if n < 512 {
                std::env::set_var("AI_LOCAL_LLAMA_BATCH_SIZE", "512");
            }
        }
    }
}

fn pick_ai_runtime_profile(ram_gib: f64, cpus: i32) -> AiRuntimeProfile {
    if ram_gib < 9.0 {
        AiRuntimeProfile {
            name: "weak-8gb",
            ctx: 8192,
            batch: 512,
            max_tokens: 1024,
            max_prompt_chars: 24_000,
            threads: clamp_int(cpus, 2, 4),
        }
    } else if ram_gib < 17.0 {
        AiRuntimeProfile {
            name: "balanced-16gb",
            ctx: 8192,
            batch: 8192,
            max_tokens: 2048,
            max_prompt_chars: 48_000,
            threads: clamp_int(cpus, 4, 6),
        }
    } else if ram_gib < 32.0 {
        AiRuntimeProfile {
            name: "strong-24gb",
            ctx: 16_384,
            batch: 16_384,
            max_tokens: 4096,
            max_prompt_chars: 96_000,
            threads: clamp_int(cpus, 4, 8),
        }
    } else {
        AiRuntimeProfile {
            name: "max-32gb+",
            ctx: 32_768,
            batch: 32_768,
            max_tokens: 8192,
            max_prompt_chars: 200_000,
            threads: clamp_int(cpus, 6, 12),
        }
    }
}

fn detect_system_ram_gib() -> f64 {
    static RAM: OnceLock<f64> = OnceLock::new();
    *RAM.get_or_init(|| {
        #[cfg(target_os = "macos")]
        {
            if let Ok(out) = std::process::Command::new("sysctl")
                .args(["-n", "hw.memsize"])
                .output()
            {
                if let Ok(s) = String::from_utf8(out.stdout) {
                    if let Ok(bytes) = s.trim().parse::<u64>() {
                        if bytes > 0 {
                            return bytes as f64 / (1024.0 * 1024.0 * 1024.0);
                        }
                    }
                }
            }
        }
        #[cfg(target_os = "linux")]
        {
            if let Ok(text) = std::fs::read_to_string("/proc/meminfo") {
                for line in text.lines() {
                    if let Some(kb_str) = line.strip_prefix("MemTotal:") {
                        if let Some(kb) = kb_str.split_whitespace().next() {
                            if let Ok(kb) = kb.parse::<u64>() {
                                if kb > 0 {
                                    return kb as f64 / (1024.0 * 1024.0);
                                }
                            }
                        }
                        break;
                    }
                }
            }
        }
        8.0
    })
}

fn clamp_int(v: i32, lo: i32, hi: i32) -> i32 {
    v.clamp(lo, hi)
}

fn env_is_set(key: &str) -> bool {
    std::env::var(key)
        .ok()
        .is_some_and(|v| !v.trim().is_empty())
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

fn set_default_env(key: &str, value: &str) {
    if std::env::var(key).is_err() {
        std::env::set_var(key, value);
    }
}

fn clamp_env_u32_max(key: &str, max: u32) {
    if let Ok(v) = std::env::var(key) {
        if let Ok(n) = v.parse::<u32>() {
            if n > max {
                std::env::set_var(key, max.to_string());
            }
        }
    }
}

fn clamp_env_usize_max(key: &str, max: usize) {
    if let Ok(v) = std::env::var(key) {
        if let Ok(n) = v.parse::<usize>() {
            if n > max {
                std::env::set_var(key, max.to_string());
            }
        }
    }
}
