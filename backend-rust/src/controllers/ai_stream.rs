use std::convert::Infallible;
use std::pin::Pin;

use axum::{
    body::Body,
    extract::{Request, State},
    http::StatusCode,
    response::sse::{Event, Sse},
    Json,
};
use futures_util::stream::{self, Stream, StreamExt};
use serde_json::{json, Map, Value};
use tracing::info;

use crate::security::auth::AuthUser;
use crate::services::ai::code_stream::{self, CodeStreamRequest};
use crate::services::llama_cpp::LlamaCppService;
use crate::state::AppState;

type SseStream = Pin<Box<dyn Stream<Item = Result<Event, Infallible>> + Send>>;

pub fn routes() -> axum::Router<AppState> {
    use axum::routing::post;
    axum::Router::new()
        .route("/ai-code-stream", post(stream_code_assistant))
        .route("/api/ai-code-stream", post(stream_code_assistant))
        .route("/aiAssistant-chat-stream", post(stream_assistant_chat))
        .route("/api/aiAssistant-chat-stream", post(stream_assistant_chat))
        .route("/ai-local/execute-local-plan", post(stream_local_plan))
        .route("/api/ai-local/execute-local-plan", post(stream_local_plan))
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
    Json(body): Json<Map<String, Value>>,
) -> Sse<SseStream> {
    let plan = body.get("plan").and_then(|v| v.as_str()).unwrap_or("execute plan");
    let llama = LlamaCppService::new(&state.config);
    let token_stream: Pin<Box<dyn Stream<Item = String> + Send>> = if llama.is_available() {
        match llama.stream_completion(plan).await {
            Ok(s) => Box::pin(s),
            Err(_) => Box::pin(stream::once(async { "error".into() })),
        }
    } else {
        Box::pin(stream::once(async { "local plan stub".into() }))
    };
    let sse_stream: SseStream = Box::pin(token_stream.map(|line| Ok(Event::default().data(line))));
    Sse::new(sse_stream)
}

fn blocked_sse(code: &str, message: &str) -> Sse<SseStream> {
    let evt = Event::default().json_data(json!({
        "stage": "blocked",
        "reason_code": code,
        "message": message
    })).unwrap();
    Sse::new(Box::pin(stream::once(async move { Ok(evt) })))
}
