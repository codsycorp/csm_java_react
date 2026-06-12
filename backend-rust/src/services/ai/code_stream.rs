//! Full ai-code-stream pipeline — mirrors Java ApiSpringController SSE stages.

use std::pin::Pin;
use std::sync::LazyLock;

use dashmap::DashMap;
use futures_util::stream::{self, Stream, StreamExt};
use serde_json::{json, Map, Value};
use tokio::task::JoinHandle;
use tracing::info;

use crate::security::auth::AuthUser;
use crate::services::ai::local_prompt::{build_code_stream_local_prompt, resolve_response_mode};
use crate::services::ai::policy::{
    local_pre_status, local_unavailable_hint, local_unavailable_message, streaming_model_label,
};
use crate::services::llama_cpp::LlamaCppService;
use crate::state::AppState;

static ACTIVE_STREAMS: LazyLock<DashMap<String, JoinHandle<()>>> = LazyLock::new(DashMap::new);

pub struct CodeStreamRequest {
    pub request_id: String,
    pub app_id: String,
    pub flow_type: String,
    pub task_type: String,
    pub context_type: String,
    pub message: String,
    pub current_code: String,
    pub language: String,
    pub model: String,
    pub ui_lang: String,
    pub response_mode: String,
}

impl CodeStreamRequest {
    pub fn from_body(body: &Map<String, Value>, auth: &AuthUser) -> Result<Self, String> {
        let flow_type = body.get("flowType").and_then(|v| v.as_str()).unwrap_or("");
        if flow_type.is_empty() {
            return Err("missing_flow_type".into());
        }
        let context_type = body.get("contextType").and_then(|v| v.as_str()).unwrap_or("code");
        let expected = if flow_type == "menu_manager" { "menu_json" } else { "code" };
        if context_type != expected {
            return Err("flow_context_mismatch".into());
        }
        let requested_app = body
            .get("appId")
            .or_else(|| body.get("app_id"))
            .and_then(|v| v.as_str())
            .unwrap_or("csm");
        let app_id = if auth.dev {
            requested_app.to_string()
        } else {
            auth.app_id.clone()
        };
        Ok(Self {
            request_id: body
                .get("jobId")
                .and_then(|v| v.as_str())
                .map(String::from)
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            app_id,
            flow_type: flow_type.to_string(),
            task_type: body
                .get("taskType")
                .and_then(|v| v.as_str())
                .unwrap_or("edit")
                .to_string(),
            context_type: context_type.to_string(),
            message: truncate(body.get("message").and_then(|v| v.as_str()).unwrap_or(""), 32_000),
            current_code: truncate(
                body.get("currentCode").and_then(|v| v.as_str()).unwrap_or(""),
                500_000,
            ),
            language: body
                .get("language")
                .and_then(|v| v.as_str())
                .unwrap_or("javascript")
                .to_string(),
            model: body
                .get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("auto")
                .to_string(),
            ui_lang: body
                .get("uiLang")
                .or_else(|| body.get("ui_lang"))
                .or_else(|| body.get("uiLanguage"))
                .and_then(|v| v.as_str())
                .unwrap_or("vi")
                .to_string(),
            response_mode: body
                .get("responseMode")
                .or_else(|| body.get("response_mode"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        })
    }
}

pub fn ui_text(lang: &str, vi: &str, en: &str, zh: &str) -> String {
    match lang {
        "en" => en.to_string(),
        "zh" | "zh-CN" | "zh-TW" => zh.to_string(),
        _ => vi.to_string(),
    }
}

pub fn build_prompt(state: &AppState, req: &CodeStreamRequest) -> String {
    build_code_stream_local_prompt(&state.config, req)
}

pub async fn token_stream(
    state: &AppState,
    req: &CodeStreamRequest,
    prompt: &str,
) -> Pin<Box<dyn Stream<Item = String> + Send>> {
    let llama = LlamaCppService::new(&state.config);
    if llama.is_available() {
        if let Ok(s) = llama.stream_completion(prompt).await {
            return Box::pin(s);
        }
        tracing::warn!(
            "ai-code-stream: llama model present but stream failed requestId={}",
            req.request_id
        );
    } else {
        tracing::warn!(
            "ai-code-stream: local AI unavailable ({}) requestId={}",
            local_unavailable_hint(),
            req.request_id
        );
    }

    let hint = local_unavailable_hint();
    let unavailable = local_unavailable_message();
    Box::pin(stream::once(async move {
        format!("{unavailable}\n\n({hint})")
    }))
}

pub fn stage_event(stage: &str, data: Value) -> String {
    let mut obj = data.as_object().cloned().unwrap_or_default();
    obj.insert("stage".into(), json!(stage));
    serde_json::to_string(&obj).unwrap_or_else(|_| json!({"stage": stage}).to_string())
}

pub async fn run_pipeline(
    state: AppState,
    req: CodeStreamRequest,
    auth: AuthUser,
) -> Pin<Box<dyn Stream<Item = String> + Send>> {
    let rid = req.request_id.clone();
    let context_type = req.context_type.clone();
    let response_mode = resolve_response_mode(&req);
    let prompt = build_prompt(&state, &req);
    let prompt_chars = prompt.len();
    let pre = LocalPreAnalysis::skip();

    let started = stage_event(
        "started",
        json!({
            "requestId": rid,
            "flowType": req.flow_type,
            "taskType": req.task_type,
            "contextType": req.context_type,
            "appId": req.app_id,
            "model": req.model,
            "promptChars": prompt_chars,
        }),
    );

    let local_pre = stage_event(
        "local_pre_analysis",
        json!({
            "requestId": rid,
            "status": local_pre_status(pre.handled_locally),
            "attempted": pre.attempted,
            "handledLocally": pre.handled_locally,
            "reason_code": pre.reason_code,
            "localOnlyEnabled": true,
            "hasLocalContext": !pre.local_context.is_empty(),
        }),
    );

    let compression = stage_event(
        "context_compression",
        json!({
            "requestId": rid,
            "status": "orchestration_context_attached",
            "savedChars": pre.saved_chars,
        }),
    );

    let stream_start = stage_event(
        "streaming_started",
        json!({
            "requestId": rid,
            "model": streaming_model_label(&state.config),
            "estimatedTotalChars": prompt_chars / 4,
            "percent": 15,
        }),
    );

    let early = pre.early_response.clone();
    let handled_early = pre.handled_locally && !early.is_empty();

    info!(
        "ai-code-stream pipeline requestId={} appId={} responseMode={} promptChars={} llama={}",
        req.request_id,
        req.app_id,
        response_mode,
        prompt_chars,
        LlamaCppService::new(&state.config).is_available()
    );

    let _ = auth;

    // Java ApiSpringController emits stage=streaming/chunk + complete/fullResponse — not stage=token.
    Box::pin(async_stream::stream! {
        let t0 = std::time::Instant::now();

        yield started;
        yield local_pre;

        if handled_early {
            yield stage_event("early_finish", json!({"requestId": rid, "status": "running"}));
            yield stage_event(
                "streaming_started",
                json!({"requestId": rid, "model": "local_orchestration", "percent": 12}),
            );
            yield stage_event(
                "streaming",
                json!({
                    "requestId": rid,
                    "chunk": early,
                    "localProviderPrimary": true,
                }),
            );
            let elapsed = t0.elapsed().as_millis();
            yield stage_event(
                "complete",
                json!({
                    "requestId": rid,
                    "status": "ok",
                    "fullResponse": early,
                    "content": early,
                    "model": "local_orchestration",
                    "contextType": context_type,
                    "responseMode": "analyze",
                    "elapsedMs": elapsed,
                    "streamedChars": early.len(),
                }),
            );
            yield stage_event(
                "request_complete",
                json!({"requestId": rid, "elapsedMs": elapsed, "flow": "early_local"}),
            );
            return;
        }

        yield compression;
        yield stream_start;

        let mut full = String::new();
        let mut tokens = token_stream(&state, &req, &prompt).await;
        while let Some(piece) = tokens.next().await {
            if piece.is_empty() {
                continue;
            }
            full.push_str(&piece);
            yield stage_event(
                "streaming",
                json!({
                    "requestId": rid,
                    "chunk": piece,
                    "localProviderPrimary": true,
                    "attempt": 1,
                }),
            );
            let pct = (12 + full.len() / 120).min(95);
            yield stage_event(
                "streaming_progress",
                json!({
                    "requestId": rid,
                    "charsReceived": full.len(),
                    "percent": pct,
                }),
            );
        }

        let elapsed = t0.elapsed().as_millis();
        yield stage_event(
            "complete",
            json!({
                "requestId": rid,
                "status": "ok",
                "fullResponse": full,
                "contextType": context_type,
                "responseMode": response_mode,
                "elapsedMs": elapsed,
                "streamedChars": full.len(),
                "model": streaming_model_label(&state.config),
            }),
        );
        yield stage_event(
            "request_complete",
            json!({"requestId": rid, "elapsedMs": elapsed}),
        );

        info!(
            "ai-code-stream done requestId={} chars={} ms={}",
            rid,
            full.len(),
            elapsed
        );
    })
}

pub fn cancel_stream(request_id: &str) -> bool {
    if let Some((_, handle)) = ACTIVE_STREAMS.remove(request_id) {
        handle.abort();
        true
    } else {
        false
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        s.chars().take(max).collect()
    }
}

pub struct LocalPreAnalysis {
    pub attempted: bool,
    pub handled_locally: bool,
    pub reason_code: String,
    pub local_context: String,
    pub early_response: String,
    pub saved_chars: usize,
}

impl LocalPreAnalysis {
    pub fn skip() -> Self {
        Self {
            attempted: false,
            handled_locally: false,
            reason_code: "local_v2_skip_legacy_pre_analysis".into(),
            local_context: String::new(),
            early_response: String::new(),
            saved_chars: 0,
        }
    }
}
