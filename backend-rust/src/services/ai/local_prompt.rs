//! Local prompt builder — mirrors Java `AiAssistantGatewayService.buildLocalMinimalPrompt`.

use std::path::Path;
use std::sync::{Mutex, OnceLock};

use tracing::warn;

use crate::config::AppConfig;

use super::code_stream::CodeStreamRequest;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiFlowIntent {
    MenuJson,
    FrontendCode,
    QuickQuestion,
    /// Return raw source code only — no JSON wrapper, no markdown fences, no explanations.
    RawCode,
}

const BASE_SYSTEM_MIN: &str = r#"You are CSM AI Assistant.
Follow the requested output contract exactly.
Return only valid JSON without markdown or explanation unless explicitly asked.
End immediately after the response.
"#;

const BASE_SYSTEM_ANALYZE_MIN: &str = r#"You are CSM AI Assistant.
Follow the requested output contract exactly.
Answer in plain text prose unless the contract explicitly requires JSON.
Never repeat internal blocks such as BUSINESS_CONTEXT, BUSINESS_COMPREHENSION, Steps, or Output contract.
End immediately after the response.
"#;

const BASE_SYSTEM_RAW_CODE_MIN: &str = r#"You are CSM Code Generator.
Follow the requested output contract exactly.
Return ONLY raw source code — nothing else.
End immediately after the last line of code.
"#;

const RAW_CODE_CONTRACT: &str = r#"Return ONLY the raw source code.
No markdown fences (no ```). No JSON wrapper. No comments unless essential.
No explanations. Start with the very first line of code.
"#;

const QUICK_QUESTION_CONTRACT_MIN: &str = r#"You are CSM AI Assistant.
Answer the user's question directly in the same language as the user request (Vietnamese, English, or Chinese).
For code/debug questions: cite concrete symbols (functions, variables, timers, webview/process lifecycle).
Use at least 4 short bullet points covering: observed behavior, likely root cause, relevant code paths, suggested fix/check.
Do not output a single "reason:" line or JSON patch envelope.
No JSON unless the user explicitly asked for a patch.
No markdown code fences.
No random text.
End immediately after the answer.
"#;

const FRONTEND_CODE_CONTRACT_MIN: &str = r#"You are CSM Frontend Code Editor.

Return ONLY valid JSON textEdits in edit mode:
{
  "summary": "",
  "changes": [],
  "textEdits": []
}

Rules:
- startLine/endLine are 1-based line numbers in the FULL active editor file (not relative to REGION excerpts).
- action is add/edit/delete.
- No overlapping edits.
- Never paste prompt instructions, EDIT_RULES, or meta-comments into replacement code.
- Each textEdit should span at most 25 lines unless replacing a whole small function.
- For DynamicCode runtime: no import/export/require/module.exports.
- Use browser globals only: window, document, window.React, window.ReactDOM, window.antd, window.seft, window.csmApi.
- Keep code idempotent.
If unsafe to patch atomically, return empty textEdits and explain in summary.
"#;

static MASTER_MENU_PROMPT: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static MASTER_CODE_PROMPT: OnceLock<Mutex<Option<String>>> = OnceLock::new();

/// Same routing as Java, except menu/code **analyze** → prose Q&A contract (matches Java UX for menu_qa).
pub fn classify_local_intent(context_type: &str, response_mode: &str) -> AiFlowIntent {
    let ctx = context_type.trim().to_lowercase();
    let mode = response_mode.trim().to_lowercase();
    if mode == "raw_code" {
        return AiFlowIntent::RawCode;
    }
    if ctx == "menu_json" {
        if mode == "analyze" {
            return AiFlowIntent::QuickQuestion;
        }
        return AiFlowIntent::MenuJson;
    }
    if ctx == "code" || ctx == "frontend_code" {
        if mode == "analyze" {
            return AiFlowIntent::QuickQuestion;
        }
        return AiFlowIntent::FrontendCode;
    }
    if mode == "edit" {
        return AiFlowIntent::FrontendCode;
    }
    AiFlowIntent::QuickQuestion
}

pub fn resolve_response_mode(req: &CodeStreamRequest) -> String {
    if !req.response_mode.is_empty() {
        return req.response_mode.clone();
    }
    if req.task_type.contains("qa") || req.message.contains('?') {
        "analyze".into()
    } else {
        "edit".into()
    }
}

pub fn build_code_stream_local_prompt(config: &AppConfig, req: &CodeStreamRequest) -> String {
    let response_mode = resolve_response_mode(req);
    let intent = classify_local_intent(&req.context_type, &response_mode);

    let editor_cap = env_usize("AI_LOCAL_PROMPT_SLOT_ACTIVE_EDITOR_CHARS", 22_000);
    let mem_cap = env_usize("AI_LOCAL_PROMPT_SLOT_MEMORY_CHARS", 6_000);
    let req_cap = env_usize("AI_LOCAL_PROMPT_SLOT_USER_REQUEST_CHARS", 32_000);

    let safe_editor = trim_to_max(&req.current_code, editor_cap);
    let safe_req = trim_to_max(&req.message, req_cap);

    let mut prompt = build_local_minimal_prompt(
        config,
        intent,
        &safe_editor,
        "", // RAG wired when orchestration is ported
        "",
        &safe_req,
        &req.ui_lang,
    );

    // Optional session memory from per-app context file (Java loadAppContextFile).
    if let Some(ctx_block) = load_app_context_block(config, &req.app_id, mem_cap) {
        if !ctx_block.is_empty() {
            prompt = format!(
                "{prompt}\n\n[SESSION_MEMORY]\n{ctx_block}\n[/SESSION_MEMORY]"
            );
        }
    }

    prepare_local_provider_prompt(&prompt, config.effective_code_stream_prompt_cap())
}

fn build_local_minimal_prompt(
    config: &AppConfig,
    intent: AiFlowIntent,
    active_editor: &str,
    rag_context: &str,
    memory: &str,
    user_request: &str,
    ui_language: &str,
) -> String {
    let rag_cap = env_usize("AI_LOCAL_PROMPT_SLOT_RAG_CONTEXT_CHARS", 5_000);
    let mem_cap = env_usize("AI_LOCAL_PROMPT_SLOT_MEMORY_CHARS", 6_000);

    let contract = match intent {
        AiFlowIntent::MenuJson => {
            if is_effectively_empty_menu_editor(active_editor) {
                resolve_menu_greenfield_contract(config)
            } else {
                resolve_menu_json_contract(config)
            }
        }
        AiFlowIntent::FrontendCode => FRONTEND_CODE_CONTRACT_MIN.to_string(),
        AiFlowIntent::QuickQuestion => QUICK_QUESTION_CONTRACT_MIN.to_string(),
        AiFlowIntent::RawCode => RAW_CODE_CONTRACT.to_string(),
    };

    let safe_rag = trim_to_max(rag_context, rag_cap);
    let safe_mem = trim_to_max(memory, mem_cap);

    let base_system = match intent {
        AiFlowIntent::QuickQuestion => BASE_SYSTEM_ANALYZE_MIN,
        AiFlowIntent::RawCode => BASE_SYSTEM_RAW_CODE_MIN,
        _ => BASE_SYSTEM_MIN,
    };

    let mut sb = String::new();
    sb.push_str(base_system);
    sb.push_str("\n\n");
    sb.push_str(&build_prompt_language_block(ui_language, user_request));
    sb.push_str(&contract);
    sb.push('\n');

    match intent {
        AiFlowIntent::MenuJson => {
            if is_effectively_empty_menu_editor(active_editor) {
                sb.push_str(
                    r#"[GREENFIELD_EMPTY_MENU]
Current menu is EMPTY ({ "menu": [] }). Do NOT return patches or need_more_context.
Return ONLY one JSON object: { "menu": [ ...complete tree... ], "notes": [], "warnings": [] }
BUSINESS: build tree ONLY for modules in USER_REQUEST — no fixed ERP template.
Start with { and end with } — no markdown fences, no prose before/after JSON.
[/GREENFIELD_EMPTY_MENU]

"#,
                );
            } else if !active_editor.is_empty() {
                sb.push_str("[ACTIVE_EDITOR_MENU_JSON]\n");
                sb.push_str(active_editor);
                sb.push_str("\n[/ACTIVE_EDITOR_MENU_JSON]\n\n");
            }
        }
        AiFlowIntent::FrontendCode => {
            if !active_editor.is_empty() {
                sb.push_str("[ACTIVE_EDITOR_CODE]\n");
                sb.push_str(active_editor);
                sb.push_str("\n[/ACTIVE_EDITOR_CODE]\n\n");
            }
        }
        AiFlowIntent::QuickQuestion => {
            if !active_editor.is_empty() && active_editor.len() <= 8_000 {
                sb.push_str("[CONTEXT_SNIPPET]\n");
                sb.push_str(active_editor);
                sb.push_str("\n[/CONTEXT_SNIPPET]\n\n");
            }
        }
        AiFlowIntent::RawCode => {
            if !active_editor.is_empty() {
                sb.push_str("[CURRENT_CODE]\n");
                sb.push_str(active_editor);
                sb.push_str("\n[/CURRENT_CODE]\n\n");
            }
        }
    }

    if !safe_rag.is_empty() {
        sb.push_str("[RETRIEVED_CONTEXT]\n");
        sb.push_str(&safe_rag);
        sb.push_str("\n[/RETRIEVED_CONTEXT]\n\n");
    }
    if !safe_mem.is_empty() {
        sb.push_str("[SESSION_MEMORY]\n");
        sb.push_str(&safe_mem);
        sb.push_str("\n[/SESSION_MEMORY]\n\n");
    }

    sb.push_str("[USER_REQUEST]\n");
    sb.push_str(user_request);
    sb.push_str("\n[/USER_REQUEST]");
    sb
}

fn prepare_local_provider_prompt(prompt: &str, max_chars: usize) -> String {
    let mut prepared = prompt.trim().to_string();
    if prepared.is_empty() {
        return prepared;
    }
    if prepared.len() > max_chars {
        warn!(
            "local prompt clipped from {} to {} chars",
            prepared.len(),
            max_chars
        );
        prepared = trim_to_max(&prepared, max_chars);
    }
    if !prepared.contains("<|im_start|>assistant") {
        prepared.push_str("\n\n<|im_start|>assistant\n");
    }
    prepared
}

fn resolve_menu_json_contract(config: &AppConfig) -> String {
    let cap = env_usize("AI_LOCAL_PROMPT_SLOT_CONTRACT_CHARS", 8_000).max(6_000);
    let master = load_master_menu_prompt(config);
    if master.is_empty() {
        return menu_json_contract_fallback();
    }
    let mut combined = trim_to_max(&master, cap);
    if let Some(runtime) = load_knowledge_file(config, "ai_menu_runtime_compact.md", cap / 3) {
        if !runtime.is_empty() {
            combined = trim_to_max(&format!("{combined}\n\n{runtime}"), cap);
        }
    }
    combined
}

fn resolve_menu_greenfield_contract(config: &AppConfig) -> String {
    let cap = env_usize("AI_LOCAL_PROMPT_SLOT_CONTRACT_CHARS", 8_000).max(6_000);
    let mut parts: Vec<String> = Vec::new();
    for (file, max) in [
        ("ai_menu_structure_runtime.md", cap / 2),
        ("ai_menu_dev_workflow_compact.md", cap / 3),
        ("ai_menu_runtime_compact.md", cap / 4),
    ] {
        if let Some(text) = load_knowledge_file(config, file, max) {
            if !text.is_empty() {
                parts.push(text);
            }
        }
    }
    if parts.is_empty() {
        return resolve_menu_json_contract(config);
    }
    trim_to_max(&parts.join("\n\n"), cap)
}

fn menu_json_contract_fallback() -> String {
    r#"You are CSM Menu JSON Editor.
Return ONLY valid JSON with patches[] or full menu tree per USER_REQUEST.
Use status "need_more_context" with warnings when nodeId is missing.
Allowed patch actions: add, edit, delete.
"#
    .to_string()
}

fn load_master_menu_prompt(config: &AppConfig) -> String {
    cached_file(&MASTER_MENU_PROMPT, &config.ai_context_master_prompt_path)
}

fn load_master_code_prompt(config: &AppConfig) -> String {
    cached_file(&MASTER_CODE_PROMPT, &config.ai_context_code_master_prompt_path)
}

fn cached_file(slot: &OnceLock<Mutex<Option<String>>>, path: &Path) -> String {
    let lock = slot.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = lock.lock() {
        if let Some(cached) = guard.as_ref() {
            return cached.clone();
        }
    }
    let content = read_utf8_file(path).unwrap_or_default();
    if let Ok(mut guard) = lock.lock() {
        *guard = Some(content.clone());
    }
    content
}

fn load_knowledge_file(config: &AppConfig, name: &str, max_chars: usize) -> Option<String> {
    let path = config.ai_context_dir.join(name);
    let text = read_utf8_file(&path).ok()?;
    if text.is_empty() {
        return None;
    }
    Some(trim_to_max(text.trim(), max_chars.max(400)))
}

fn load_app_context_block(config: &AppConfig, app_id: &str, max_chars: usize) -> Option<String> {
    let safe_app = app_id.trim();
    if safe_app.is_empty() {
        return None;
    }
    let path = config
        .ai_context_dir
        .join("context")
        .join(format!("{safe_app}_session.md"));
    let text = read_utf8_file(&path).ok()?;
    if text.trim().is_empty() {
        return None;
    }
    Some(trim_to_max(text.trim(), max_chars.max(500)))
}

fn read_utf8_file(path: &Path) -> Result<String, std::io::Error> {
    std::fs::read_to_string(path)
}

fn is_effectively_empty_menu_editor(menu_json: &str) -> bool {
    let text = menu_json.trim();
    if text.is_empty() {
        return true;
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(text) {
        if let Some(menu) = v.get("menu").and_then(|m| m.as_array()) {
            return menu.is_empty();
        }
        return !v.as_object().is_some_and(|o| o.contains_key("menu"));
    }
    text.contains("\"menu\":[]") || text.contains("\"menu\": []")
}

fn build_prompt_language_block(ui_language: &str, user_request: &str) -> String {
    let lang = ui_language.trim().to_lowercase();
    let reply_hint = if user_request.chars().any(|c| {
        matches!(
            c,
            '\u{0103}'
                | '\u{0102}'
                | '\u{00E2}'
                | '\u{00C2}'
                | '\u{0111}'
                | '\u{0110}'
                | '\u{00EA}'
                | '\u{00CA}'
                | '\u{00F4}'
                | '\u{00D4}'
                | '\u{01A1}'
                | '\u{01A0}'
                | '\u{01B0}'
                | '\u{01AF}'
        )
    }) {
        "Vietnamese"
    } else if lang.starts_with("zh") {
        "Chinese"
    } else if lang.starts_with("en") {
        "English"
    } else {
        "Vietnamese"
    };
    format!("[PROMPT_LANGUAGE]\nReply in {reply_hint} unless the user explicitly requests another language.\n[/PROMPT_LANGUAGE]\n\n")
}

fn trim_to_max(text: &str, max: usize) -> String {
    if text.len() <= max {
        return text.to_string();
    }
    text.chars().take(max).collect()
}

fn env_usize(key: &str, default: usize) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

#[allow(dead_code)]
pub fn load_code_master_for_edit(config: &AppConfig) -> String {
    let cap = env_usize("AI_LOCAL_PROMPT_SLOT_CONTRACT_CHARS", 8_000).max(6_000);
    let master = load_master_code_prompt(config);
    if master.is_empty() {
        return FRONTEND_CODE_CONTRACT_MIN.to_string();
    }
    trim_to_max(&master, cap)
}
