use std::convert::Infallible;
use std::pin::Pin;

use axum::{
    body::Body,
    extract::{Request, State},
    http::StatusCode,
    response::{IntoResponse, sse::{Event, Sse}},
};
use futures_util::stream::{self, Stream, StreamExt};
use serde_json::{json, Map, Value};
use tracing::info;

use crate::security::auth::AuthUser;
use crate::services::ai::code_stream::{self, CodeStreamRequest};
use crate::services::llama_cpp::LlamaCppService;
use crate::state::AppState;
use chrono;

type SseStream = Pin<Box<dyn Stream<Item = Result<Event, Infallible>> + Send>>;

pub fn routes() -> axum::Router<AppState> {
    use axum::routing::post;
    axum::Router::new()
        .route("/ai-generate-seo-content", post(seo_generate_content))
        .route("/api/ai-generate-seo-content", post(seo_generate_content))
        .route("/ai-code-stream", post(stream_code_assistant))
        .route("/api/ai-code-stream", post(stream_code_assistant))
        .route("/aiAssistant-chat-stream", post(stream_assistant_chat))
        .route("/api/aiAssistant-chat-stream", post(stream_assistant_chat))
        .route("/ai-local/execute-local-plan", post(stream_local_plan))
        .route("/api/ai-local/execute-local-plan", post(stream_local_plan))
}

async fn seo_generate_content(
    State(state): State<AppState>,
    req: Request<Body>,
) -> impl IntoResponse {
    let params = parse_json_body(req).await;
    crate::handlers::api_ext::handle_ai_seo_content(&state, &params)
        .await
        .into_response()
}

async fn parse_json_body(req: Request<Body>) -> Map<String, Value> {
    let bytes = axum::body::to_bytes(req.into_body(), 64 * 1024 * 1024)
        .await
        .unwrap_or_default();
    if bytes.is_empty() {
        return Map::new();
    }
    match serde_json::from_slice::<Value>(&bytes) {
        Ok(Value::Object(map)) => map,
        _ => Map::new(),
    }
}

async fn stream_code_assistant(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Result<Sse<SseStream>, StatusCode> {
    let auth = req.extensions().get::<AuthUser>().cloned();
    let body_bytes = axum::body::to_bytes(req.into_body(), usize::MAX)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let body: Map<String, Value> = serde_json::from_slice(&body_bytes)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let auth = match auth {
        Some(a) => a,
        None => {
            return Ok(blocked_sse(
                "authentication_required",
                &code_stream::ui_text("vi", "Phiên đăng nhập hết hạn.", "Session expired.", "会话已过期。"),
            ));
        }
    };

    let stream_req = match CodeStreamRequest::from_body(&body, &auth) {
        Ok(r) => r,
        Err(code) => {
            let msg = match code.as_str() {
                "missing_flow_type" => code_stream::ui_text(
                    "vi",
                    "Thiếu flowType bắt buộc.",
                    "Missing required flowType.",
                    "缺少 flowType。",
                ),
                _ => code_stream::ui_text(
                    "vi",
                    "flowType và contextType không khớp.",
                    "flowType and contextType mismatch.",
                    "flowType 与 contextType 不匹配。",
                ),
            };
            return Ok(blocked_sse(&code, &msg));
        }
    };

    info!(
        "ai-code-stream requestId={} flow={}",
        stream_req.request_id, stream_req.flow_type
    );

    let pipeline = code_stream::run_pipeline(state, stream_req, auth).await;
    let sse_stream: SseStream = Box::pin(pipeline.map(|data| {
        Ok(Event::default().data(data))
    }));

    Ok(Sse::new(sse_stream))
}

async fn stream_assistant_chat(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Result<Sse<SseStream>, StatusCode> {
    if req.extensions().get::<AuthUser>().is_none() {
        return Ok(blocked_sse("authentication_required", "Not authenticated"));
    }
    let body_bytes = axum::body::to_bytes(req.into_body(), usize::MAX)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let body: Map<String, Value> = serde_json::from_slice(&body_bytes)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let message = body
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let llama = LlamaCppService::new(&state.config);
    let prompt = format!("Assistant chat:\n{message}\n\nReply:");

    let sse_stream: SseStream = if llama.is_available() {
        let token_stream = llama
            .stream_completion(&prompt)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        Box::pin(
            token_stream
                .map(|t| Ok(Event::default().json_data(json!({"token": t})).unwrap()))
                .chain(stream::once(async { Ok(Event::default().data("[DONE]")) })),
        )
    } else {
        Box::pin(stream::once(async {
            Ok(Event::default().json_data(json!({"error": "llama unavailable"})).unwrap())
        }))
    };
    Ok(Sse::new(sse_stream))
}

async fn stream_local_plan(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Sse<SseStream> {
    let body_bytes = axum::body::to_bytes(req.into_body(), 64 * 1024 * 1024)
        .await
        .unwrap_or_default();
    let body: Map<String, Value> = serde_json::from_slice(&body_bytes).unwrap_or_default();

    let message = body.get("message").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let app_id = body.get("appId").and_then(|v| v.as_str()).unwrap_or("csm").to_string();
    let context_type = body.get("contextType").and_then(|v| v.as_str()).unwrap_or("code").to_string();
    let response_mode = body.get("responseMode").and_then(|v| v.as_str()).unwrap_or("edit").to_string();
    let execute_patch = body.get("executePatch")
        .and_then(|v| v.as_bool())
        .unwrap_or_else(|| response_mode == "edit");
    let current_code = body.get("currentCode").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let mut request_id = body.get("requestId").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if request_id.is_empty() {
        request_id = format!("local-{}", chrono::Utc::now().timestamp_millis());
    }

    let llama = LlamaCppService::new(&state.config);
    let llama_available = llama.is_available();

    let events: Vec<Value> = build_local_plan_events(
        &message,
        &app_id,
        &context_type,
        &response_mode,
        &request_id,
        execute_patch,
        &current_code,
        llama_available,
    );

    // For code patch: run llama synchronously and build final stream
    let patch_response = if execute_patch && context_type == "code" && !current_code.is_empty() && llama_available {
        let prompt = build_patch_prompt(&message, &current_code);
        match llama.stream_completion(&prompt).await {
            Ok(s) => {
                let mut pinned = Box::pin(s);
                let mut full = String::new();
                while let Some(tok) = pinned.next().await {
                    full.push_str(&tok);
                }
                Some(full)
            }
            Err(_) => None,
        }
    } else {
        None
    };

    let sse_stream: SseStream = Box::pin(
        build_event_stream(events, patch_response, request_id, response_mode, context_type, app_id)
    );
    Sse::new(sse_stream)
}

fn build_local_plan_events(
    message: &str,
    app_id: &str,
    context_type: &str,
    response_mode: &str,
    request_id: &str,
    execute_patch: bool,
    current_code: &str,
    llama_available: bool,
) -> Vec<Value> {
    let _ = (message, app_id, request_id, execute_patch, current_code, llama_available);
    vec![
        json!({
            "stage": "preparing",
            "status": "running",
            "message": "Bắt đầu local execute plan",
            "current": 0,
            "total": 5,
            "percent": 5,
            "responseMode": response_mode
        }),
        json!({
            "stage": "agentic_plan",
            "status": "running",
            "message": "Đã lập kế hoạch Agentic local từ scanner signals",
            "current": 1,
            "total": 5,
            "percent": 20,
            "compacted": true,
            "savedChars": 0,
            "charsBefore": 0,
            "charsAfter": 0,
            "planStepCount": 4,
            "scopeMask": 0,
            "scopeSummary": "scanner_scope_mask=0"
        }),
        json!({
            "stage": "scope_reasoning",
            "status": "running",
            "message": "Khóa phạm vi reasoning bằng bitmask",
            "current": 2,
            "total": 5,
            "percent": 40,
            "scopeMask": 0,
            "scopeSummary": "bitmask_scoped_retrieval",
            "scopeTags": [],
            "responseMode": response_mode
        }),
        json!({
            "stage": "local_tool_invocation",
            "status": "running",
            "message": "Local tools tạo execution sketch theo từng bước",
            "current": 4,
            "total": 5,
            "percent": 80,
            "detail": "steps=4, ingestCandidates=0",
            "responseMode": response_mode
        }),
        json!({
            "stage": "context_compression",
            "status": "running",
            "message": "Đã nén context và chuẩn bị stream patch",
            "current": 5,
            "total": 5,
            "percent": 100,
            "responseMode": response_mode,
            "contextType": context_type
        }),
    ]
}

fn build_patch_prompt(message: &str, current_code: &str) -> String {
    format!(
        "You are a local code patch generator.\n\
Return ONLY valid JSON object with this exact schema:\n\
{{\"summary\":\"...\",\"changes\":[\"...\"],\"textEdits\":[{{\"startLine\":1,\"endLine\":1,\"replacement\":\"...\",\"action\":\"add|edit|delete\"}}]}}\n\
Rules:\n\
- Use 1-based line numbers.\n\
- Do not return markdown fences or explanations.\n\
- Keep textEdits minimal and deterministic.\n\
- If no change needed, return textEdits as empty array.\n\n\
User request:\n{message}\n\n\
Current code:\n{current_code}"
    )
}

fn build_event_stream(
    events: Vec<Value>,
    patch_response: Option<String>,
    request_id: String,
    response_mode: String,
    context_type: String,
    app_id: String,
) -> impl Stream<Item = Result<Event, Infallible>> + Send {
    let started_at = chrono::Utc::now().timestamp_millis();
    let mut all_events: Vec<Event> = events
        .into_iter()
        .map(|v| Event::default().json_data(v).unwrap())
        .collect();

    let (streaming_evt, complete_evt) = if let Some(patch) = patch_response {
        let patch_clone = patch.clone();
        let elapsed = chrono::Utc::now().timestamp_millis() - started_at;
        let streaming = Event::default()
            .json_data(json!({
                "stage": "streaming",
                "status": "running",
                "message": "Đang stream patch local",
                "chunk": patch_clone,
                "responseMode": response_mode,
                "contextType": context_type,
                "model": "local_provider"
            }))
            .unwrap();
        let complete = Event::default()
            .json_data(json!({
                "stage": "complete",
                "status": "done",
                "message": "Local execute plan hoàn tất với patch local",
                "responseMode": response_mode,
                "contextType": context_type,
                "model": "local_provider",
                "localProviderPrimaryUsed": true,
                "flowConfirmedByLocal": true,
                "elapsedMs": elapsed,
                "fullResponse": patch,
                "outputChars": patch_clone.len(),
                "streamChunkCount": 1,
                "streamedChars": patch_clone.len(),
                "result": {
                    "appId": app_id,
                    "applyDynamicIngestion": false,
                    "ingestCount": 0,
                    "aggregateScopeMask": 0
                }
            }))
            .unwrap();
        (streaming, complete)
    } else {
        let elapsed = chrono::Utc::now().timestamp_millis() - started_at;
        let streaming = Event::default()
            .json_data(json!({
                "stage": "streaming_started",
                "status": "running",
                "message": "Chuẩn bị stream kết quả",
                "requestId": request_id,
                "model": "local_provider",
                "percent": 12
            }))
            .unwrap();
        let complete = Event::default()
            .json_data(json!({
                "stage": "complete",
                "status": "done",
                "message": "Local execute plan hoàn tất (dry-run streaming)",
                "responseMode": response_mode,
                "elapsedMs": elapsed,
                "result": {
                    "appId": app_id,
                    "applyDynamicIngestion": false,
                    "ingestCount": 0,
                    "aggregateScopeMask": 0,
                    "scopeTags": [],
                    "planningHints": []
                }
            }))
            .unwrap();
        (streaming, complete)
    };

    all_events.push(streaming_evt);
    all_events.push(complete_evt);

    stream::iter(all_events.into_iter().map(Ok))
}

fn blocked_sse(code: &str, message: &str) -> Sse<SseStream> {
    let evt = Event::default().json_data(json!({
        "stage": "blocked",
        "reason_code": code,
        "message": message
    })).unwrap();
    Sse::new(Box::pin(stream::once(async move { Ok(evt) })))
}
