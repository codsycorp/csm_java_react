//! Full ai-code-stream pipeline — mirrors Java ApiSpringController SSE stages.

use std::pin::Pin;
use std::sync::LazyLock;

use dashmap::DashMap;
use futures_util::stream::{self, Stream, StreamExt};
use serde_json::{json, Map, Value};
use tokio::task::JoinHandle;
use tracing::info;

use crate::security::auth::AuthUser;
use crate::services::ai::policy::{local_pre_status, local_unavailable_hint, streaming_model_label};
use crate::services::ai::services::AiServices;
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
                .and_then(|v| v.as_str())
                .unwrap_or("vi")
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

pub fn build_prompt(req: &CodeStreamRequest) -> String {
    let services = AiServices::new();
    let rag = services.graph_rag.retrieve(&req.app_id, &req.message);
    format!(
        r#"You are CSM code assistant.
Flow: {flow}
Task: {task}
Context: {ctx}
Language: {lang}
App: {app}

[RETRIEVED_CONTEXT]
{rag}

[USER_MESSAGE]
{msg}

[CURRENT_CODE]
```
{code}
```

Respond with code or structured edits only."#,
        flow = req.flow_type,
        task = req.task_type,
        ctx = req.context_type,
        lang = req.language,
        app = req.app_id,
        rag = rag,
        msg = req.message,
        code = req.current_code,
    )
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
    }

    let hint = local_unavailable_hint();
    let msg = req.message.clone();
    Box::pin(stream::once(async move {
        format!("// {hint}\n// Message: {msg}\n")
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
    let prompt = build_prompt(&req);
    let prompt_chars = prompt.len();
    let orch = AiServices::new();
    let pre = orch.local_orchestration.pre_analyze(&req);

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

    if pre.handled_locally && !pre.early_response.is_empty() {
        let early = pre.early_response.clone();
        let rid2 = rid.clone();
        return Box::pin(stream::iter(vec![
            started,
            local_pre,
            stage_event("early_finish", json!({"requestId": rid2, "status": "running"})),
            stage_event(
                "complete",
                json!({
                    "requestId": rid2,
                    "content": early,
                    "model": "local_orchestration",
                }),
            ),
        ]));
    }

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

    let tokens = token_stream(&state, &req, &prompt).await;
    let rid3 = rid.clone();
    let token_events = tokens.map(move |token| {
        stage_event(
            "token",
            json!({
                "requestId": rid3,
                "token": token,
            }),
        )
    });

    let rid4 = rid.clone();
    let complete = stream::once(async move {
        stage_event(
            "complete",
            json!({
                "requestId": rid4,
                "status": "ok",
            }),
        )
    });

    let _ = auth;
    info!("ai-code-stream pipeline requestId={} appId={}", req.request_id, req.app_id);

    Box::pin(
        stream::iter(vec![started, local_pre, compression, stream_start])
            .chain(token_events)
            .chain(complete),
    )
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
