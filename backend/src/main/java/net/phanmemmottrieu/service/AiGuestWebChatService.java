package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import net.phanmemmottrieu.model.ChatMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Iterator;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;

/**
 * Local AI lane for website guest chat (Socket.IO).
 * Sync inference only — waits for final reply text; never uses async job poll or code-stream SSE.
 */
@Service
public class AiGuestWebChatService {

    private static final Logger log = LoggerFactory.getLogger(AiGuestWebChatService.class);

    private static final String POLITE_GENERIC_WELCOME =
        "Chào anh/chị, em là tư vấn viên hỗ trợ. Anh/chị đang quan tâm thông tin nào để em hỗ trợ nhanh và đúng nhu cầu ạ? "
            + "Nếu thuận tiện, anh/chị để lại số điện thoại hoặc Zalo để bên em liên hệ lại.";

    @Autowired(required = false)
    private LlamaCppNativeService llamaCppNativeService;

    @Autowired(required = false)
    private ChatPersistenceService chatPersistenceService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<String, Long> lastInferenceByGuestKey = new ConcurrentHashMap<>();
    private volatile Semaphore inferenceSemaphore;

    @Value("${ai.guest-chat.enabled:true}")
    private boolean guestChatAiEnabled;

    @Value("${ai.guest-chat.max-concurrent:1}")
    private int maxConcurrentInferences;

    @Value("${ai.guest-chat.max-output-tokens:192}")
    private int maxOutputTokens;

    @Value("${ai.guest-chat.per-guest-cooldown-ms:45000}")
    private long perGuestCooldownMs;

    @Value("${ai.guest-chat.welcome-delay-ms:60000}")
    private long welcomeDelayMs;

    @Value("${ai.guest-chat.no-admin-reply-delay-ms:90000}")
    private long noAdminReplyDelayMs;

    @Value("${ai.guest-chat.welcome-cooldown-ms:86400000}")
    private long welcomeCooldownMs;

    @Value("${ai.guest-chat.system-prompt:Bạn là tư vấn viên website chuyên nghiệp. Trả lời ngắn gọn, lịch sự, đúng ngôn ngữ khách. Không markdown. Không nhắc AI/hệ thống/appId.}")
    private String guestChatSystemPrompt;

    /** Fail-fast when code/SEO lane already holds llama (avoid guest thread blocking on modelLock). */
    @Value("${ai.guest-chat.skip-when-worker-busy:true}")
    private boolean skipWhenWorkerBusy;

    /** Skip AI when JVM free heap below threshold (weak 5GB protection). 0 = disabled. */
    @Value("${ai.guest-chat.min-free-heap-mb:0}")
    private int minFreeHeapMb;

    /** Cap delayed welcome/no-reply tasks waiting on chatAiScheduler. */
    @Value("${ai.guest-chat.max-pending-scheduled:12}")
    private int maxPendingScheduled;

    private static final int GUEST_COOLDOWN_MAP_MAX_ENTRIES = 4096;

    public boolean isEnabled() {
        return guestChatAiEnabled;
    }

    public int getMaxConcurrentInferences() {
        return maxConcurrentInferences;
    }

    public int getMaxOutputTokens() {
        return maxOutputTokens;
    }

    public int getMaxPendingScheduled() {
        return Math.max(1, maxPendingScheduled);
    }

    /**
     * Returns true when too many guest AI jobs are already queued (welcome + no-admin-reply).
     */
    public boolean isSchedulingSaturated(int pendingWelcomeTasks, int pendingNoReplyTasks) {
        int pending = Math.max(0, pendingWelcomeTasks) + Math.max(0, pendingNoReplyTasks);
        return pending >= getMaxPendingScheduled();
    }

    public Map<String, Object> describeStatus(LlamaCppNativeService llama) {
        Map<String, Object> out = new HashMap<>();
        out.put("enabled", guestChatAiEnabled);
        out.put("maxConcurrent", maxConcurrentInferences);
        out.put("maxOutputTokens", maxOutputTokens);
        out.put("perGuestCooldownMs", perGuestCooldownMs);
        out.put("skipWhenWorkerBusy", skipWhenWorkerBusy);
        out.put("minFreeHeapMb", minFreeHeapMb);
        out.put("maxPendingScheduled", getMaxPendingScheduled());
        out.put("guestCooldownEntries", lastInferenceByGuestKey.size());
        if (llama != null) {
            out.put("workerInferenceInProgress", llama.isInferenceInProgress());
            out.put("workerInFlightCount", llama.getInFlightRequestCount());
            out.put("workerCircuitOpen", llama.isCircuitOpen());
            out.put("workerHealthy", llama.isHealthy());
        }
        return out;
    }

    public long getWelcomeDelayMs() {
        return welcomeDelayMs;
    }

    public long getNoAdminReplyDelayMs() {
        return noAdminReplyDelayMs;
    }

    public long getWelcomeCooldownMs() {
        return welcomeCooldownMs;
    }

    public String fallbackWelcome(String preferredLocale) {
        return fallbackWelcomeByLocale(preferredLocale);
    }

    public String fallbackNoAdminReply(String guestMessage, String preferredLocale) {
        return fallbackNoAdminReplyByLanguage(guestMessage, preferredLocale);
    }

    public String buildWelcomePrompt(String appId, String guestPhone, String preferredLocale) {
        String guestDescription = (guestPhone == null || guestPhone.isBlank())
            ? "Khach moi chua de lai so dien thoai"
            : "Khach co phone=" + guestPhone;
        String localeName = humanLanguageName(preferredLocale);
        return "Ban la nhan vien cham soc khach hang website appId=" + appId + ". "
            + guestDescription + " vua mo cua so chat va chua gui tin nhan. "
            + "Hay viet DUY NHAT 1 tin nhan lich su, chuyen nghiep, than thien, ngan gon (toi da 180 ky tu). "
            + "Muc tieu: chao khach, hoi nhu cau can ho tro, sau do moi xin thong tin lien he mot cach tinh te. "
            + "BAT BUOC tra loi bang ngon ngu: " + localeName + ". "
            + "Xung ho tu nhien theo kieu em/anh chi, khong qua than mat. "
            + "TUYET DOI KHONG nhac den appId, ma app, ma he thong, thong tin ky thuat hoac noi bo. "
            + "KHONG dung placeholder nhu [Ten ban], [Ten cong ty]. "
            + "KHONG tu xung ten nhan vien/cong ty neu khong co du lieu xac thuc. "
            + "Khong nhac den AI, khong markdown, chi tra ve noi dung tin nhan.";
    }

    public String buildNoAdminReplyPrompt(
            String appId,
            String guestIdentity,
            String guestPhone,
            String guestMessage,
            String preferredLocale) {
        String sanitizedGuestMessage = guestMessage == null ? "" : guestMessage.replace('"', '\'').trim();
        if (sanitizedGuestMessage.length() > 400) {
            sanitizedGuestMessage = sanitizedGuestMessage.substring(0, 400);
        }
        String localeName = humanLanguageName(preferredLocale);
        String conversationContext = buildRecentGuestConversationContext(appId, guestIdentity, guestPhone, 8);

        return "Bạn là tư vấn viên chăm sóc khách hàng website appId=" + appId + ". "
            + "Khách vừa gửi tin nhắn nhưng chưa có admin phản hồi ngay. "
            + "Hãy viết DUY NHẤT 1 tin nhắn trả lời ngắn gọn, lịch sự, hữu ích (tối đa 220 ký tự), "
            + "phải bám sát ý khách đang hỏi và nối tiếp đúng ngữ cảnh hội thoại gần nhất. "
            + "Giữ giọng tư vấn chuyên nghiệp, không áp lực bán hàng. "
            + "QUAN TRỌNG: Trả lời bằng ĐÚNG ngôn ngữ này: " + localeName + ". "
            + "Không nhắc đến AI/hệ thống/appId/thông tin kỹ thuật nội bộ, không markdown. "
            + (conversationContext.isBlank() ? "" : "Ngữ cảnh hội thoại gần nhất:\n" + conversationContext + "\n")
            + "Tin nhắn khách: \"" + sanitizedGuestMessage + "\"";
    }

    /**
     * Generate a short guest-chat reply via local fast inference, with overload guards.
     */
    public String generateReply(String prompt, String fallbackText, String purpose, String guestKey) {
        if (prompt == null || prompt.isBlank()) {
            return fallbackText;
        }
        if (!guestChatAiEnabled) {
            log.debug("Guest chat AI disabled for {} — fallback", purpose);
            return fallbackText;
        }
        if (llamaCppNativeService == null || !llamaCppNativeService.isAvailable()) {
            log.warn("Local AI unavailable for {}: using fallback text", purpose);
            return fallbackText;
        }
        if (llamaCppNativeService.isCircuitOpen()) {
            log.warn("Local AI circuit open for {}: using fallback text", purpose);
            return fallbackText;
        }
        if (skipWhenWorkerBusy && llamaCppNativeService.isInferenceInProgress()) {
            log.info("Guest chat AI skipped — local worker busy (purpose={})", purpose);
            return fallbackText;
        }
        if (minFreeHeapMb > 0) {
            long freeHeapMb = Runtime.getRuntime().freeMemory() / (1024L * 1024L);
            if (freeHeapMb < minFreeHeapMb) {
                log.warn("Guest chat AI skipped — low free heap {}MB < {}MB (purpose={})",
                    freeHeapMb, minFreeHeapMb, purpose);
                return fallbackText;
            }
        }
        if (guestKey != null && isOnGuestCooldown(guestKey)) {
            log.info("Guest chat AI cooldown active for {} purpose={} — fallback", guestKey, purpose);
            return fallbackText;
        }

        Semaphore semaphore = resolveInferenceSemaphore();
        if (!semaphore.tryAcquire()) {
            log.warn("Guest chat AI saturated (maxConcurrent={}) for {} — fallback", maxConcurrentInferences, purpose);
            return fallbackText;
        }

        try {
            String aiRaw = llamaCppNativeService.generateContentFast(
                prompt,
                Math.max(64, maxOutputTokens),
                guestChatSystemPrompt);
            String text = extractAiText(aiRaw, fallbackText);
            if (guestKey != null && !guestKey.isBlank()) {
                lastInferenceByGuestKey.put(guestKey.trim(), System.currentTimeMillis());
                trimGuestCooldownMapIfNeeded();
            }
            return text;
        } catch (Exception e) {
            log.warn("Local AI generation failed for {}: {}", purpose, e.getMessage());
            return fallbackText;
        } finally {
            semaphore.release();
        }
    }

    public String sanitizeAutoReplyText(String messageText, String eventType, String preferredLocale) {
        if (messageText == null) {
            return "";
        }
        String normalized = messageText.replaceAll("\\s+", " ").trim();
        if (normalized.isEmpty()) {
            return normalized;
        }

        if (eventType == null || !eventType.startsWith("ai_auto_")) {
            return normalized;
        }

        String folded = Normalizer.normalize(normalized, Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "")
            .toLowerCase(Locale.ROOT);

        boolean hasBracketPlaceholder = normalized.matches(".*\\[[^\\]]{1,40}\\].*");
        boolean hasTemplateToken = folded.contains("ten ban")
            || folded.contains("ten cong ty")
            || folded.contains("name")
            || folded.contains("company");
        boolean hasTechnicalSelfIntro = folded.contains("appid")
            || folded.contains("app id")
            || folded.contains("nhan vien ho tro tu")
            || folded.contains("nhan vien ho tro den tu")
            || folded.contains("minh la nhan vien ho tro tu");
        boolean hasPromptLeakage = folded.contains("bat buoc")
            || folded.contains("duy nhat 1")
            || folded.contains("toi da")
            || folded.contains("khong markdown")
            || folded.contains("tra loi bang")
            || folded.contains("muc tieu:")
            || folded.contains("hay viet");

        if (hasBracketPlaceholder || hasTemplateToken || hasTechnicalSelfIntro || hasPromptLeakage) {
            if (eventType.startsWith("ai_auto_no_admin_reply")) {
                return fallbackNoAdminReplyByLanguage(null, preferredLocale);
            }
            return fallbackWelcomeByLocale(preferredLocale);
        }

        return normalized;
    }

    private Semaphore resolveInferenceSemaphore() {
        Semaphore current = inferenceSemaphore;
        if (current == null) {
            synchronized (this) {
                current = inferenceSemaphore;
                if (current == null) {
                    int permits = Math.max(1, maxConcurrentInferences);
                    inferenceSemaphore = new Semaphore(permits);
                    current = inferenceSemaphore;
                }
            }
        }
        return current;
    }

    private boolean isOnGuestCooldown(String guestKey) {
        if (perGuestCooldownMs <= 0 || guestKey == null || guestKey.isBlank()) {
            return false;
        }
        Long last = lastInferenceByGuestKey.get(guestKey.trim());
        return last != null && System.currentTimeMillis() - last < perGuestCooldownMs;
    }

    private void trimGuestCooldownMapIfNeeded() {
        if (lastInferenceByGuestKey.size() <= GUEST_COOLDOWN_MAP_MAX_ENTRIES) {
            return;
        }
        long cutoff = System.currentTimeMillis() - Math.max(perGuestCooldownMs * 4L, 86_400_000L);
        for (Iterator<Map.Entry<String, Long>> it = lastInferenceByGuestKey.entrySet().iterator(); it.hasNext(); ) {
            Map.Entry<String, Long> entry = it.next();
            if (entry.getValue() == null || entry.getValue() < cutoff) {
                it.remove();
            }
        }
        if (lastInferenceByGuestKey.size() > GUEST_COOLDOWN_MAP_MAX_ENTRIES) {
            int toRemove = lastInferenceByGuestKey.size() - GUEST_COOLDOWN_MAP_MAX_ENTRIES;
            for (String key : lastInferenceByGuestKey.keySet()) {
                if (toRemove <= 0) {
                    break;
                }
                lastInferenceByGuestKey.remove(key);
                toRemove--;
            }
        }
    }

    private String buildRecentGuestConversationContext(
            String appId,
            String guestIdentity,
            String guestPhone,
            int maxMessages) {
        if (chatPersistenceService == null || appId == null || appId.isBlank()
            || guestIdentity == null || guestIdentity.isBlank()) {
            return "";
        }

        try {
            List<ChatMessage> history = chatPersistenceService.getHistoryByGuestIdentity(
                appId, guestIdentity, guestPhone, Math.max(12, maxMessages * 2));
            if (history == null || history.isEmpty()) {
                return "";
            }

            List<String> lines = new ArrayList<>();
            int start = Math.max(0, history.size() - Math.max(1, maxMessages));
            for (int i = start; i < history.size(); i++) {
                ChatMessage msg = history.get(i);
                if (msg == null) {
                    continue;
                }
                String text = safeSnippet(msg.getMessage(), 220);
                if (text.isBlank()) {
                    continue;
                }
                String eventType = msg.getEventType();
                if (eventType != null && eventType.startsWith("ai_auto_")) {
                    continue;
                }
                String speaker = Boolean.TRUE.equals(msg.getIsAdmin()) ? "Tu van vien" : "Khach";
                lines.add("- " + speaker + ": " + text);
            }

            return String.join("\n", lines);
        } catch (Exception e) {
            log.debug("Unable to build guest conversation context appId={}, guestIdentity={}: {}",
                appId, guestIdentity, e.getMessage());
            return "";
        }
    }

    private String extractAiText(String raw, String fallbackText) {
        if (raw == null || raw.isBlank()) {
            return fallbackText;
        }
        try {
            Map<?, ?> rawParsed = objectMapper.readValue(raw, Map.class);
            Map<String, Object> parsed = new HashMap<>();
            for (Map.Entry<?, ?> entry : rawParsed.entrySet()) {
                if (entry.getKey() != null) {
                    parsed.put(String.valueOf(entry.getKey()), entry.getValue());
                }
            }
            Object successObj = parsed.get("success");
            boolean success = !(successObj instanceof Boolean) || (Boolean) successObj;
            if (!success) {
                return fallbackText;
            }

            Object result = parsed.get("result");
            if (result instanceof String s && !s.isBlank()) {
                return s.trim();
            }

            if (result instanceof Map<?, ?> map) {
                Object text = map.get("message");
                if (text == null) {
                    text = map.get("text");
                }
                if (text == null) {
                    text = map.get("reply");
                }
                if (text instanceof String s && !s.isBlank()) {
                    return s.trim();
                }
                return objectMapper.writeValueAsString(map);
            }

            if (result != null) {
                return String.valueOf(result).trim();
            }
        } catch (Exception ignored) {
            // Plain text fallback
        }
        return raw.trim().isEmpty() ? fallbackText : raw.trim();
    }

    private static String safeSnippet(String text, int maxLen) {
        if (text == null) {
            return "";
        }
        String normalized = text.replaceAll("\\s+", " ").trim();
        if (normalized.length() <= maxLen) {
            return normalized;
        }
        return normalized.substring(0, maxLen);
    }

    private static String humanLanguageName(String localeCode) {
        String code = normalizeLocale(localeCode);
        if (code == null || code.isBlank()) {
            return "tiếng Việt";
        }
        return switch (code) {
            case "vi" -> "tiếng Việt";
            case "en" -> "English";
            case "zh" -> "中文";
            default -> code;
        };
    }

    static String normalizeLocale(String rawLocale) {
        if (rawLocale == null || rawLocale.isBlank()) {
            return null;
        }
        String locale = rawLocale.trim().toLowerCase(Locale.ROOT).replace('_', '-');
        if (locale.startsWith("vi")) {
            return "vi";
        }
        if (locale.startsWith("en")) {
            return "en";
        }
        if (locale.startsWith("zh")) {
            return "zh";
        }
        if (locale.startsWith("ja")) {
            return "ja";
        }
        if (locale.startsWith("ko")) {
            return "ko";
        }
        if (locale.startsWith("fr")) {
            return "fr";
        }
        if (locale.startsWith("de")) {
            return "de";
        }
        if (locale.startsWith("es")) {
            return "es";
        }
        if (locale.startsWith("ar")) {
            return "ar";
        }
        return locale;
    }

    private String fallbackWelcomeByLocale(String preferredLocale) {
        String code = normalizeLocale(preferredLocale);
        if ("en".equals(code)) {
            return "Hello, I am a support consultant. What information are you interested in so I can assist quickly and accurately? "
                + "If convenient, please leave your phone number or Zalo for follow-up.";
        }
        if ("zh".equals(code)) {
            return "您好，我是客服顾问。请问您目前想了解哪方面信息？我会尽快为您提供准确支持。若方便，请留下电话或Zalo，方便我们后续联系。";
        }
        return POLITE_GENERIC_WELCOME;
    }

    private String detectGuestLanguageHint(String text) {
        if (text == null || text.isBlank()) {
            return "vi";
        }

        String normalized = text.trim();

        if (normalized.matches(".*[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ].*")) {
            return "vi";
        }

        String folded = Normalizer.normalize(normalized, Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "")
            .toLowerCase(Locale.ROOT);

        if (folded.matches(".*\\b(xin chao|chao|toi|mua|gia|tu van|ho tro|bao nhieu|lien he|so dien thoai)\\b.*")) {
            return "vi";
        }
        if (normalized.matches(".*[\\u3040-\\u30ff].*")) {
            return "ja";
        }
        if (normalized.matches(".*[\\u4e00-\\u9fff].*")) {
            return "zh";
        }
        if (normalized.matches(".*[\\uac00-\\ud7af].*")) {
            return "ko";
        }
        if (normalized.matches(".*[\\u0600-\\u06ff].*")) {
            return "ar";
        }
        if (folded.matches(".*\\b(hola|gracias|precio|comprar)\\b.*")) {
            return "es";
        }
        if (folded.matches(".*\\b(bonjour|merci|prix|acheter)\\b.*")) {
            return "fr";
        }
        if (folded.matches(".*\\b(hallo|danke|preis|kaufen)\\b.*")) {
            return "de";
        }

        return "en";
    }

    private String fallbackNoAdminReplyByLanguage(String guestMessage, String preferredLocale) {
        String languageHint = normalizeLocale(preferredLocale);
        if (languageHint == null || languageHint.isBlank()) {
            languageHint = detectGuestLanguageHint(guestMessage);
        }
        if ("vi".equals(languageHint)) {
            return "Em đã nhận được tin nhắn của anh/chị. Tư vấn viên sẽ phản hồi sớm. "
                + "Trong lúc chờ, anh/chị có thể mô tả thêm nhu cầu để bên em hỗ trợ chính xác hơn.";
        }
        if ("es".equals(languageHint)) {
            return "Gracias por tu mensaje. Nuestro asesor responderá en breve. "
                + "Mientras tanto, puedes compartir más detalles de tu necesidad para ayudarte mejor.";
        }
        if ("fr".equals(languageHint)) {
            return "Merci pour votre message. Notre conseiller vous répondra rapidement. "
                + "En attendant, vous pouvez préciser votre besoin pour un meilleur accompagnement.";
        }
        if ("de".equals(languageHint)) {
            return "Danke für Ihre Nachricht. Unser Berater antwortet in Kürze. "
                + "In der Zwischenzeit können Sie Ihr Anliegen genauer beschreiben.";
        }
        return "Thanks for your message. Our consultant will reply shortly. "
            + "In the meantime, please share a bit more detail so we can support you better.";
    }
}
