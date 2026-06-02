package net.phanmemmottrieu.service;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;

/**
 * SYSTEM SEO WRITER 2026 — shared instructions for {@code /ai-generate-seo-content}.
 * Maps long-form SEO brief to JSON/HTML contract used by LMKT and simple html_content lane.
 */
@Component
public class AiSeoWriter2026Prompts {

    private static final Logger log = LoggerFactory.getLogger(AiSeoWriter2026Prompts.class);
    private static final String CLASSPATH_CORE = "ai/seo-writer-2026-system.txt";
    private static final String MARKER = "[seo_writer_2026]";

    @Value("${ai.seo.writer-2026.enabled:true}")
    private boolean writer2026Enabled;

    /** Apply 2026 rules to anti_ai_one_shot and generic seo_content (not only explicit pipeline). */
    @Value("${ai.seo.writer-2026.inject-all-lanes:true}")
    private boolean injectAllLanes;

    @Value("${ai.seo.writer-2026.system-prompt-file:}")
    private String externalPromptFile;

    private volatile String coreInstructions = "";

    @PostConstruct
    void loadCoreInstructions() {
        try {
            if (externalPromptFile != null && !externalPromptFile.isBlank()) {
                Path path = Path.of(externalPromptFile.trim());
                if (Files.isRegularFile(path)) {
                    coreInstructions = Files.readString(path, StandardCharsets.UTF_8).trim();
                    log.info("SEO Writer 2026: loaded system instructions from {}", path);
                    return;
                }
                log.warn("SEO Writer 2026: external file not found {}, using classpath", externalPromptFile);
            }
            ClassPathResource resource = new ClassPathResource(CLASSPATH_CORE);
            coreInstructions = StreamUtils.copyToString(resource.getInputStream(), StandardCharsets.UTF_8).trim();
            log.info("SEO Writer 2026: loaded classpath {}", CLASSPATH_CORE);
        } catch (Exception e) {
            log.warn("SEO Writer 2026: failed to load instructions — using minimal fallback: {}", e.getMessage());
            coreInstructions = "You are a Google SEO 2026 expert. Follow E-E-A-T, semantic SEO, mobile-first. "
                + "Return ONLY valid JSON per user schema. No AI clichés or keyword stuffing.";
        }
    }

    public boolean isWriter2026Enabled() {
        return writer2026Enabled;
    }

    public boolean isExplicitWriter2026Request(Map<String, Object> params, String prompt) {
        if (params != null) {
            String pipeline = str(params.get("seoPipeline")).toLowerCase(Locale.ROOT);
            if ("seo_writer_2026".equals(pipeline)) {
                return true;
            }
            String taskType = str(params.get("taskType")).toLowerCase(Locale.ROOT);
            if (taskType.contains("seo_writer_2026") || "seo_writer_2026".equals(taskType)) {
                return true;
            }
        }
        String p = str(prompt).toLowerCase(Locale.ROOT);
        return p.contains(MARKER) || p.contains("system seo writer 2026");
    }

    public boolean shouldApplyWriter2026(Map<String, Object> params, String prompt) {
        if (!writer2026Enabled) {
            return false;
        }
        if (isExplicitWriter2026Request(params, prompt)) {
            return true;
        }
        if (!injectAllLanes) {
            return false;
        }
        String p = str(prompt).toLowerCase(Locale.ROOT);
        if (p.contains("[creative_params_request]") || p.contains("[seo_locale_translate]")) {
            return false;
        }
        return p.contains("seo") || p.contains("html_content") || p.contains("\"content\"")
            || p.contains("viết bài") || p.contains("viet bai") || p.contains("chuẩn seo");
    }

    /** System prompt: simple 3-field JSON (title, description, html_content). */
    public String systemPromptForSimpleHtmlJson() {
        return coreInstructions + "\n\n"
            + "OUTPUT JSON keys (exactly): title, description, html_content. "
            + "html_content = full article HTML per rules above. "
            + "Optional keys if you can fit: urlSlug, outline, faqSchemaJson.";
    }

    /** System prompt: LMKT trilingual / content field lane. */
    public String systemPromptForLmktJson() {
        return coreInstructions + "\n\n"
            + "You write for LMKT / CSM technology & real-estate marketing automation. "
            + "Return ONE valid JSON object matching the user schema exactly. "
            + "When schema asks for content: use HTML (h2/h3/h4, table, ul/ol, FAQ section). "
            + "When schema asks for VI only: omit _en/_zh fields. "
            + "When schema asks trilingual: real EN/ZH translations, never copy Vietnamese. "
            + "Optional: urlSlug, outline, faqSchemaJson, internalLinkSuggestions (array of strings). "
            + "No markdown fences.";
    }

    /** Compact block appended to user/article prompts (model 1.5B — realistic word target). */
    public String userPromptBlock(String targetWordsVi) {
        String words = (targetWordsVi == null || targetWordsVi.isBlank()) ? "600-900" : targetWordsVi.trim();
        return """

            [%s]
            TARGET_WORDS (content/html_content body): %s từ tiếng Việt — ưu tiên cấu trúc E-E-A-T, không cố 8000 từ.
            Mỗi H2: intro + depth + ví dụ thực tế + kết luận ngắn.
            Bắt buộc trong HTML: ≥1 bảng HOẶC checklist, bullet list, FAQ cuối bài, CTA cuối bài.
            Cấm: "Trong thời đại số", "Ngày nay", "Hiện nay", "Có thể thấy rằng".
            """.formatted(MARKER.toUpperCase(Locale.ROOT), words).trim();
    }

    public String markerTag() {
        return MARKER;
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }
}
