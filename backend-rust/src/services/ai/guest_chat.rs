use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde_json::Value;
use tracing::{info, warn};

use crate::services::chat::ChatPersistenceService;
use crate::services::llama_cpp::LlamaCppService;

const POLITE_GENERIC_WELCOME: &str = "Chào anh/chị, em là tư vấn viên hỗ trợ. Anh/chị đang quan tâm thông tin nào để em hỗ trợ nhanh và đúng nhu cầu ạ? \
Nếu thuận tiện, anh/chị để lại số điện thoại hoặc Zalo để bên em liên hệ lại.";

pub struct AiGuestWebChatService {
    llama: LlamaCppService,
    chat: Arc<ChatPersistenceService>,
    enabled: bool,
    max_output_tokens: u32,
    per_guest_cooldown_ms: i64,
    max_pending_scheduled: usize,
    system_prompt: String,
    last_inference_by_guest: Mutex<HashMap<String, i64>>,
    inference_semaphore: Mutex<usize>,
    max_concurrent: usize,
}

impl AiGuestWebChatService {
    pub fn new(llama: LlamaCppService, chat: Arc<ChatPersistenceService>) -> Self {
        Self {
            llama,
            chat,
            enabled: env_bool("AI_GUEST_CHAT_ENABLED", true),
            max_output_tokens: env_u32("AI_GUEST_CHAT_MAX_OUTPUT_TOKENS", 192),
            per_guest_cooldown_ms: env_i64("AI_GUEST_CHAT_PER_GUEST_COOLDOWN_MS", 45_000),
            max_pending_scheduled: env_usize("AI_GUEST_CHAT_MAX_PENDING_SCHEDULED", 12),
            system_prompt: std::env::var("AI_GUEST_CHAT_SYSTEM_PROMPT").unwrap_or_else(|_| {
                "Bạn là tư vấn viên website chuyên nghiệp. Trả lời ngắn gọn, lịch sự, đúng ngôn ngữ khách. Không markdown. Không nhắc AI/hệ thống/appId.".into()
            }),
            last_inference_by_guest: Mutex::new(HashMap::new()),
            inference_semaphore: Mutex::new(0),
            max_concurrent: env_usize("AI_GUEST_CHAT_MAX_CONCURRENT", 1),
        }
    }

    pub fn welcome_delay_ms(&self) -> u64 {
        env_u64("AI_GUEST_CHAT_WELCOME_DELAY_MS", 60_000)
    }

    pub fn no_admin_reply_delay_ms(&self) -> u64 {
        env_u64("AI_GUEST_CHAT_NO_ADMIN_REPLY_DELAY_MS", 90_000)
    }

    pub fn welcome_cooldown_ms(&self) -> i64 {
        env_i64("AI_GUEST_CHAT_WELCOME_COOLDOWN_MS", 86_400_000)
    }

    pub fn is_scheduling_saturated(&self, pending_welcome: usize, pending_no_reply: usize) -> bool {
        pending_welcome + pending_no_reply >= self.max_pending_scheduled
    }

    pub fn fallback_welcome(&self, preferred_locale: Option<&str>) -> String {
        fallback_welcome_by_locale(preferred_locale)
    }

    pub fn fallback_no_admin_reply(&self, _guest_message: &str, preferred_locale: Option<&str>) -> String {
        match normalize_locale(preferred_locale) {
            Some("en") => "I received your message. A consultant will reply shortly.".into(),
            Some("zh") => "已收到您的留言，顾问会尽快回复。".into(),
            _ => "Em đã nhận được tin nhắn của anh/chị. Tư vấn viên sẽ phản hồi sớm.".into(),
        }
    }

    pub fn build_welcome_prompt(&self, app_id: &str, guest_phone: Option<&str>, preferred_locale: Option<&str>) -> String {
        let guest_description = guest_phone.filter(|s| !s.is_empty()).map_or(
            "Khach moi chua de lai so dien thoai".to_string(),
            |p| format!("Khach co phone={p}"),
        );
        let locale_name = human_language_name(preferred_locale);
        format!(
            "Ban la nhan vien cham soc khach hang website appId={app_id}. \
            {guest_description} vua mo cua so chat va chua gui tin nhan. \
            Hay viet DUY NHAT 1 tin nhan lich su, chuyen nghiep, than thien, ngan gon (toi da 180 ky tu). \
            Muc tieu: chao khach, hoi nhu cau can ho tro, sau do moi xin thong tin lien he mot cach tinh te. \
            BAT BUOC tra loi bang ngon ngu: {locale_name}. \
            Xung ho tu nhien theo kieu em/anh chi. \
            TUYET DOI KHONG nhac den appId, ma app, ma he thong. \
            Khong markdown, chi tra ve noi dung tin nhan."
        )
    }

    pub fn build_no_admin_reply_prompt(
        &self,
        app_id: &str,
        guest_identity: &str,
        guest_phone: Option<&str>,
        guest_message: &str,
        preferred_locale: Option<&str>,
    ) -> String {
        let mut sanitized = guest_message.replace('"', "'").trim().to_string();
        if sanitized.len() > 400 {
            sanitized.truncate(400);
        }
        let locale_name = human_language_name(preferred_locale);
        let context = self.build_recent_conversation_context(app_id, guest_identity, guest_phone, 8);
        format!(
            "Bạn là tư vấn viên chăm sóc khách hàng website appId={app_id}. \
            Khách vừa gửi tin nhắn nhưng chưa có admin phản hồi ngay. \
            Hãy viết DUY NHẤT 1 tin nhắn trả lời ngắn gọn, lịch sự (tối đa 220 ký tự), bám sát ý khách. \
            QUAN TRỌNG: Trả lời bằng ĐÚNG ngôn ngữ: {locale_name}. \
            Không nhắc AI/hệ thống/appId, không markdown. \
            {context}\
            Tin nhắn khách: \"{sanitized}\""
        )
    }

    fn build_recent_conversation_context(
        &self,
        app_id: &str,
        guest_identity: &str,
        guest_phone: Option<&str>,
        max_messages: usize,
    ) -> String {
        let history = self.chat.get_history_by_guest_identity(
            app_id,
            Some(guest_identity),
            guest_phone,
            max_messages.max(12),
        );
        if history.is_empty() {
            return String::new();
        }
        let mut lines = Vec::new();
        for msg in history.iter().rev().take(max_messages).rev() {
            let event_type = msg.get("eventType").and_then(|v| v.as_str()).unwrap_or("");
            if event_type.starts_with("ai_auto_") {
                continue;
            }
            let text = msg.get("message").and_then(|v| v.as_str()).unwrap_or("").trim();
            if text.is_empty() {
                continue;
            }
            let speaker = if msg.get("isAdmin").and_then(|v| v.as_bool()).unwrap_or(false) {
                "Tu van vien"
            } else {
                "Khach"
            };
            let snippet = if text.len() > 220 { &text[..220] } else { text };
            lines.push(format!("- {speaker}: {snippet}"));
        }
        if lines.is_empty() {
            String::new()
        } else {
            format!("Ngữ cảnh hội thoại gần nhất:\n{}\n", lines.join("\n"))
        }
    }

    pub async fn generate_reply(
        &self,
        prompt: &str,
        fallback_text: &str,
        purpose: &str,
        guest_key: Option<&str>,
    ) -> String {
        if prompt.trim().is_empty() {
            return fallback_text.to_string();
        }
        if !self.enabled {
            return fallback_text.to_string();
        }
        if !self.llama.is_available() {
            warn!("Guest chat AI unavailable for {purpose} — fallback");
            return fallback_text.to_string();
        }
        if let Some(gk) = guest_key.filter(|s| !s.is_empty()) {
            if self.is_on_guest_cooldown(gk) {
                info!("Guest chat cooldown active for {gk} purpose={purpose}");
                return fallback_text.to_string();
            }
        }

        {
            let mut active = self.inference_semaphore.lock().unwrap();
            if *active >= self.max_concurrent {
                warn!("Guest chat AI saturated for {purpose}");
                return fallback_text.to_string();
            }
            *active += 1;
        }

        let result = async {
            let full_prompt = format!("{}\n\n{}", self.system_prompt, prompt);
            match self
                .llama
                .complete_with_tokens(&full_prompt, self.max_output_tokens.max(64))
                .await
            {
                Ok(raw) => {
                    let text = extract_ai_text(&raw, fallback_text);
                    if let Some(gk) = guest_key.filter(|s| !s.is_empty()) {
                        self.last_inference_by_guest
                            .lock()
                            .unwrap()
                            .insert(gk.to_string(), chrono::Utc::now().timestamp_millis());
                    }
                    text
                }
                Err(e) => {
                    warn!("Guest chat AI failed for {purpose}: {e}");
                    fallback_text.to_string()
                }
            }
        }
        .await;

        *self.inference_semaphore.lock().unwrap() -= 1;
        result
    }

    pub fn sanitize_auto_reply_text(
        &self,
        message_text: &str,
        event_type: &str,
        preferred_locale: Option<&str>,
    ) -> String {
        let normalized = message_text.split_whitespace().collect::<Vec<_>>().join(" ");
        if normalized.is_empty() {
            return normalized;
        }
        if !event_type.starts_with("ai_auto_") {
            return normalized;
        }

        let folded = normalized.to_lowercase();
        let bad = normalized.contains('[')
            || folded.contains("appid")
            || folded.contains("bat buoc")
            || folded.contains("duy nhat 1")
            || folded.contains("khong markdown")
            || folded.contains("hay viet");

        if bad {
            if event_type.starts_with("ai_auto_no_admin_reply") {
                return self.fallback_no_admin_reply("", preferred_locale);
            }
            return self.fallback_welcome(preferred_locale);
        }
        normalized
    }

    fn is_on_guest_cooldown(&self, guest_key: &str) -> bool {
        if self.per_guest_cooldown_ms <= 0 {
            return false;
        }
        let map = self.last_inference_by_guest.lock().unwrap();
        map.get(guest_key)
            .map(|ts| chrono::Utc::now().timestamp_millis() - ts < self.per_guest_cooldown_ms)
            .unwrap_or(false)
    }
}

fn extract_ai_text(raw: &str, fallback_text: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return fallback_text.to_string();
    }
    if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
        if parsed.get("success").and_then(|v| v.as_bool()) == Some(false) {
            return fallback_text.to_string();
        }
        if let Some(s) = parsed.get("result").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            return s.trim().to_string();
        }
        if let Some(obj) = parsed.get("result").and_then(|v| v.as_object()) {
            for key in ["message", "text", "reply"] {
                if let Some(s) = obj.get(key).and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                    return s.trim().to_string();
                }
            }
        }
    }
    trimmed.to_string()
}

fn fallback_welcome_by_locale(preferred_locale: Option<&str>) -> String {
    match normalize_locale(preferred_locale) {
        Some("en") => "Hello, I am a support consultant. What information are you interested in so I can assist quickly? \
If convenient, please leave your phone number or Zalo for follow-up."
            .into(),
        Some("zh") => "您好，我是客服顾问。请问您目前想了解哪方面信息？若方便，请留下电话或Zalo，方便我们后续联系。".into(),
        _ => POLITE_GENERIC_WELCOME.into(),
    }
}

fn human_language_name(locale: Option<&str>) -> &'static str {
    match normalize_locale(locale) {
        Some("en") => "English",
        Some("zh") => "中文",
        _ => "tiếng Việt",
    }
}

pub fn normalize_locale(raw: Option<&str>) -> Option<&'static str> {
    let locale = raw?.trim().to_lowercase().replace('_', "-");
    if locale.is_empty() {
        return None;
    }
    if locale.starts_with("vi") {
        return Some("vi");
    }
    if locale.starts_with("en") {
        return Some("en");
    }
    if locale.starts_with("zh") {
        return Some("zh");
    }
    None
}

fn env_bool(key: &str, default: bool) -> bool {
    std::env::var(key)
        .ok()
        .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"))
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

fn env_i64(key: &str, default: i64) -> i64 {
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
