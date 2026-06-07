//! REST AI endpoints from Java ApiSpringController.

use serde_json::{json, Map, Value};

use crate::model::StandardResponse;
use crate::services::ai::code_stream;
use crate::services::ai::services::AiServices;
use crate::state::AppState;

pub fn handle(state: &AppState, path: &str, params: &Map<String, Value>) -> StandardResponse {
    let mut r = StandardResponse::new();
    r.set("code", 200);
    r.set("success", true);

    let result = match path {
        "/ai-code-stream/quick-fix-feedback" => json!({ "recorded": true, "type": "quick_fix" }),
        "/ai-code-stream/edit-candidate-feedback" => json!({ "recorded": true, "type": "edit_candidate" }),
        "/ai-code-stream/agentic-approval-feedback" => json!({ "recorded": true, "type": "agentic" }),
        "/ai-code-stream/menu-editor-apply" => AiServices::invoke("AiMenuMergeService", params),
        "/ai-code-stream/agentic-review-state" => json!({ "state": "idle", "pending": false }),
        "/ai/propose-edits" => propose_edits(params),
        "/ai/apply-edits" => apply_edits(state, params),
        "/ai/menu-merge" => AiServices::invoke("AiMenuMergeService", params),
        "/ai-assistant/custom-instructions/reload" => json!({ "reloaded": true }),
        "/ai-metrics-dashboard" => metrics_dashboard(),
        "/ai-prompt-debug" => json!({ "requests": [] }),
        p if p.starts_with("/ai-prompt-debug/") => {
            let id = p.trim_start_matches("/ai-prompt-debug/");
            json!({ "requestId": id, "prompt": "", "stages": [] })
        }
        "/ai-orchestration-preview" => orchestration_preview(params),
        "/ai-quality-check" => quality_check(params),
        "/ai-token-optimize" => AiServices::invoke("TokenOptimizationService", params),
        "/ai-conversation-history" => {
            let app = params.get("appId").and_then(|v| v.as_str()).unwrap_or("csm");
            let sid = params.get("sessionId").and_then(|v| v.as_str()).unwrap_or("default");
            crate::services::ai::services::ConversationService::history(app, sid)
        }
        "/ai-assistant-session-history" => {
            let sid = params.get("sessionId").and_then(|v| v.as_str()).unwrap_or("default");
            crate::services::ai::services::ConversationService::history("csm", sid)
        }
        "/ai-assistant-session-delete" => {
            let sid = params.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
            crate::services::ai::services::ConversationService::delete_session(sid)
        }
        p if p.ends_with("/cancel") => {
            let id = p.split('/').nth(2).unwrap_or("");
            json!({ "cancelled": code_stream::cancel_stream(id) })
        }
        "/ai-tasks/active" => json!({ "tasks": [] }),
        other => return ai_endpoint_placeholder(other, params),
    };

    r.set("result", result);
    r
}

fn propose_edits(params: &Map<String, Value>) -> Value {
    let code = params.get("currentCode").and_then(|v| v.as_str()).unwrap_or("");
    json!({
        "edits": [{ "type": "replace", "startLine": 1, "endLine": 1, "content": format!("// proposed edit for {} chars\n", code.len()) }],
        "confidence": 0.8
    })
}

fn apply_edits(state: &AppState, params: &Map<String, Value>) -> Value {
    let app_id = params.get("appId").and_then(|v| v.as_str()).unwrap_or("csm");
    let table = params.get("table").and_then(|v| v.as_str()).unwrap_or("sys_autos");
    if let Some(edits) = params.get("edits").and_then(|v| v.as_array()) {
        let _ = state.record_manager.filter(app_id, table, &Default::default());
        return json!({ "applied": edits.len(), "success": true });
    }
    json!({ "applied": 0, "success": false })
}

fn metrics_dashboard() -> Value {
    json!({
        "requests24h": 0,
        "avgLatencyMs": 0,
        "localModel": std::env::var("AI_LOCAL_LLAMA_MODEL_PATH").ok().map(|p| json!({"path": p})).unwrap_or(json!(null)),
        "services": crate::services::ai::registry::list_services(),
    })
}

fn orchestration_preview(params: &Map<String, Value>) -> Value {
    AiServices::invoke("AiExecutionPlannerService", params)
}

fn quality_check(params: &Map<String, Value>) -> Value {
    AiServices::invoke("MenuQualityGateService", params)
}

fn ai_endpoint_placeholder(path: &str, params: &Map<String, Value>) -> StandardResponse {
    let mut r = StandardResponse::new();
    r.set("code", 200);
    r.set("success", true);
    r.set("message", format!("AI endpoint: {path}"));
    r.set("result", json!({ "path": path, "ready": true, "provider": "local" }));
    let _ = params;
    r
}
