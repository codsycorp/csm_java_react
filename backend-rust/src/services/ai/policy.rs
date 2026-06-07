//! AI routing — Rust backend chỉ dùng llama.cpp local.

use crate::config::AppConfig;
use crate::services::llama_cpp::LlamaCppService;

pub const LOCAL_PROVIDER_UNAVAILABLE_CODE: &str = "LOCAL_PROVIDER_UNAVAILABLE";

pub fn streaming_model_label(config: &AppConfig) -> &'static str {
    let llama = LlamaCppService::new(config);
    if llama.is_available() {
        "llama.cpp"
    } else {
        "local_provider"
    }
}

pub fn local_pre_status(handled_locally: bool) -> &'static str {
    if handled_locally {
        "completed_local"
    } else {
        "local_context_ready"
    }
}

pub fn local_unavailable_message() -> &'static str {
    "Local AI provider chưa sẵn sàng"
}

pub fn local_unavailable_hint() -> &'static str {
    "Cấu hình AI_LOCAL_LLAMA_MODEL_PATH (GGUF) — inference chạy native trong Rust qua llama.cpp"
}
