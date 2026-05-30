package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class AiMultimodalScannerService {

    public static final int SCOPE_MENU = 1;
    public static final int SCOPE_CODE = 1 << 1;
    public static final int SCOPE_UI_UX = 1 << 2;
    public static final int SCOPE_JSON_SCHEMA = 1 << 3;
    public static final int SCOPE_BUSINESS = 1 << 4;

    public record ScanDecision(
        String sourceId,
        String kind,
        boolean shouldIngest,
        int scopeMask,
        int priority,
        String reason,
        String technicalSummary
    ) {}

    public record ScanResult(
        boolean enabled,
        int attachmentCount,
        int imageCount,
        int jsonCount,
        int ingestCount,
        int aggregateScopeMask,
        List<ScanDecision> decisions,
        String compactContext,
        String ingestionMarkdown,
        List<String> planningHints
    ) {
        public static ScanResult disabled() {
            return new ScanResult(false, 0, 0, 0, 0, 0, List.of(), "", "", List.of());
        }
    }

    public static List<String> scopeTagsFromMask(int mask) {
        List<String> tags = new ArrayList<>();
        if ((mask & SCOPE_MENU) != 0) tags.add("scope_menu");
        if ((mask & SCOPE_CODE) != 0) tags.add("scope_code");
        if ((mask & SCOPE_UI_UX) != 0) tags.add("scope_ui_ux");
        if ((mask & SCOPE_JSON_SCHEMA) != 0) tags.add("scope_json_schema");
        if ((mask & SCOPE_BUSINESS) != 0) tags.add("scope_business");
        return tags;
    }

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AiLocalLlamaVisionClient aiLocalLlamaVisionClient;
    private final AiLocalLlamaVisionNativeService aiLocalLlamaVisionNativeService;

    public AiMultimodalScannerService(
        AiLocalLlamaVisionClient aiLocalLlamaVisionClient,
        @Autowired(required = false) AiLocalLlamaVisionNativeService aiLocalLlamaVisionNativeService
    ) {
        this.aiLocalLlamaVisionClient = aiLocalLlamaVisionClient;
        this.aiLocalLlamaVisionNativeService = aiLocalLlamaVisionNativeService;
    }

    @Value("${ai.orchestration.multimodal.scanner.enabled:true}")
    private boolean enabled;

    @Value("${ai.orchestration.multimodal.scanner.max-json-chars:160000}")
    private int maxJsonChars;

    @Value("${ai.orchestration.multimodal.scanner.max-image-base64-chars:2500000}")
    private int maxImageBase64Chars;

    @Value("${ai.orchestration.multimodal.scanner.max-decode-bytes:5000000}")
    private int maxImageDecodeBytes;

    @Value("${ai.orchestration.multimodal.scanner.max-json-key-samples:18}")
    private int maxJsonKeySamples;

    @Value("${ai.orchestration.multimodal.scanner.context-max-chars:16000}")
    private int scannerContextMaxChars;

    @Value("${ai.orchestration.multimodal.vision.enabled:false}")
    private boolean visionEnabled;

    @Value("${ai.orchestration.multimodal.vision.endpoint:}")
    private String visionEndpoint;

    @Value("${ai.orchestration.multimodal.vision.prompt:Describe this UI or diagram in technical terms useful for implementation. Mention layout, key controls, visual style tokens, and actionable IDs/selectors if visible.}")
    private String visionPrompt;

    public boolean isVisionRuntimeReady() {
        if (!visionEnabled) {
            return false;
        }
        if (aiLocalLlamaVisionNativeService != null && aiLocalLlamaVisionNativeService.isReady()) {
            return true;
        }
        return !String.valueOf(visionEndpoint == null ? "" : visionEndpoint).isBlank();
    }

    public ScanResult scan(
        String message,
        List<Map<String, Object>> attachments,
        String contextType,
        String taskType,
        String responseMode
    ) {
        if (!enabled) {
            return ScanResult.disabled();
        }

        List<Map<String, Object>> safeAttachments = attachments == null ? List.of() : attachments;
        String safeContextType = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase(Locale.ROOT);
        String safeTaskType = String.valueOf(taskType == null ? "" : taskType).trim().toLowerCase(Locale.ROOT);
        String safeResponseMode = String.valueOf(responseMode == null ? "" : responseMode).trim().toLowerCase(Locale.ROOT);
        String safeMessage = String.valueOf(message == null ? "" : message).trim();

        List<ScanDecision> decisions = new ArrayList<>();
        List<String> planningHints = new ArrayList<>();
        int imageCount = 0;
        int jsonCount = 0;
        int ingestCount = 0;
        int aggregateScopeMask = 0;

        for (int i = 0; i < safeAttachments.size(); i++) {
            Map<String, Object> att = safeAttachments.get(i);
            if (att == null) {
                continue;
            }
            String name = str(att.get("name"));
            String kind = str(att.get("kind")).toLowerCase(Locale.ROOT);
            if (kind.isBlank()) {
                kind = inferKind(name, str(att.get("mimeType")));
            }

            if ("json".equals(kind)) {
                jsonCount++;
                ScanDecision decision = analyzeJsonAttachment(att, i, safeContextType, safeTaskType, safeMessage);
                decisions.add(decision);
                if (decision.shouldIngest()) {
                    ingestCount++;
                    aggregateScopeMask |= Math.max(0, decision.scopeMask());
                }
                continue;
            }

            if ("image".equals(kind)) {
                imageCount++;
                ScanDecision decision = analyzeImageAttachment(att, i, safeContextType, safeTaskType, safeMessage);
                decisions.add(decision);
                if (decision.shouldIngest()) {
                    ingestCount++;
                    aggregateScopeMask |= Math.max(0, decision.scopeMask());
                }
            }
        }

        if (jsonCount > 0) {
            planningHints.add("Extract JSON schema deltas and map them to menu/code targets before editing");
        }
        if (imageCount > 0) {
            planningHints.add("Apply UI tokens from image scan (spacing/color/radius/layout) before generating patches");
        }
        if (!safeResponseMode.isBlank() && "edit".equals(safeResponseMode)) {
            planningHints.add("Emit structured edits first (SEARCH/REPLACE or textEdits), avoid full-file regeneration");
        }

        String compactContext = buildCompactContext(decisions, safeContextType, safeTaskType, safeResponseMode);
        String ingestionMarkdown = buildIngestionMarkdown(decisions, safeContextType, safeTaskType, safeMessage);

        if ("menu_json".equals(safeContextType) || safeTaskType.contains("menu")) {
            planningHints.add("Use menu-safe merge strategy and preserve base nodes for partial AI output");
        }

        return new ScanResult(
            true,
            safeAttachments.size(),
            imageCount,
            jsonCount,
            ingestCount,
            aggregateScopeMask,
            decisions,
            trimTo(compactContext, Math.max(3000, scannerContextMaxChars)),
            trimTo(ingestionMarkdown, Math.max(5000, scannerContextMaxChars * 2)),
            planningHints
        );
    }

    private ScanDecision analyzeJsonAttachment(
        Map<String, Object> att,
        int index,
        String contextType,
        String taskType,
        String message
    ) {
        String name = str(att.get("name"));
        String sourceId = "json:" + (name.isBlank() ? ("attachment_" + index) : name);
        String text = str(att.get("textContent"));
        String content = trimTo(text, Math.max(3000, maxJsonChars));

        int scopeMask = SCOPE_JSON_SCHEMA | SCOPE_BUSINESS;
        if ("menu_json".equals(contextType) || taskType.contains("menu")) {
            scopeMask |= SCOPE_MENU;
        }
        if (message.toLowerCase(Locale.ROOT).contains("code") || message.toLowerCase(Locale.ROOT).contains("hàm") || message.toLowerCase(Locale.ROOT).contains("ham")) {
            scopeMask |= SCOPE_CODE;
        }

        boolean shouldIngest = !content.isBlank();
        String reason = shouldIngest
            ? "JSON attachment provides explicit data schema/business entities for planner grounding"
            : "JSON attachment has no usable textContent";

        String summary = summarizeJson(content);
        int priority = (scopeMask & SCOPE_MENU) != 0 ? 90 : 80;
        return new ScanDecision(sourceId, "json", shouldIngest, scopeMask, priority, reason, summary);
    }

    private ScanDecision analyzeImageAttachment(
        Map<String, Object> att,
        int index,
        String contextType,
        String taskType,
        String message
    ) {
        String name = str(att.get("name"));
        String mimeType = str(att.get("mimeType"));
        String summary = str(att.get("summary"));
        String base64Data = resolveImageBase64(att);
        String sourceId = "image:" + (name.isBlank() ? ("attachment_" + index) : name);

        int scopeMask = SCOPE_UI_UX;
        if ("menu_json".equals(contextType) || taskType.contains("menu")) {
            scopeMask |= SCOPE_MENU;
        }
        if (message.toLowerCase(Locale.ROOT).contains("code") || message.toLowerCase(Locale.ROOT).contains("css")) {
            scopeMask |= SCOPE_CODE;
        }

        boolean hasImagePayload = !base64Data.isBlank() && base64Data.length() <= Math.max(120000, maxImageBase64Chars);
        String technicalSummary = summarizeImageFromMetadata(name, mimeType, summary, base64Data, hasImagePayload);

        if (hasImagePayload && visionEnabled && isVisionRuntimeReady()) {
            String visionText = invokeLocalVision(base64Data, mimeType);
            if (!visionText.isBlank()) {
                technicalSummary = technicalSummary + "\nVision: " + trimTo(visionText, 1200);
            }
        }

        boolean shouldIngest = !technicalSummary.isBlank();
        String reason = shouldIngest
            ? "Image converted to technical UI/diagram cues for implementation planning"
            : "Image has no usable metadata/base64 payload";
        int priority = 70;
        return new ScanDecision(sourceId, "image", shouldIngest, scopeMask, priority, reason, technicalSummary);
    }

    private String summarizeJson(String jsonText) {
        String text = String.valueOf(jsonText == null ? "" : jsonText).trim();
        if (text.isBlank()) {
            return "No JSON content";
        }
        try {
            JsonNode node = objectMapper.readTree(text);
            StringBuilder sb = new StringBuilder();
            if (node.isObject()) {
                List<String> keys = new ArrayList<>();
                node.fieldNames().forEachRemaining(keys::add);
                sb.append("Root=object; keyCount=").append(keys.size()).append("; keys=")
                    .append(String.join(", ", keys.subList(0, Math.min(keys.size(), Math.max(1, maxJsonKeySamples)))));
                sb.append("; deepSummary=").append(extractJsonTypeHints(node, 3, 20));
            } else if (node.isArray()) {
                sb.append("Root=array; length=").append(node.size());
                if (node.size() > 0) {
                    JsonNode first = node.get(0);
                    sb.append("; firstType=").append(resolveNodeType(first));
                    if (first != null && first.isObject()) {
                        List<String> keys = new ArrayList<>();
                        first.fieldNames().forEachRemaining(keys::add);
                        sb.append("; itemKeys=").append(String.join(", ", keys.subList(0, Math.min(keys.size(), 12))));
                    }
                }
            } else {
                sb.append("Root=").append(resolveNodeType(node)).append("; valuePreview=").append(trimTo(node.asText(), 180));
            }
            return trimTo(sb.toString(), 1800);
        } catch (Exception ex) {
            return "JSON parse fallback: chars=" + text.length() + "; preview=" + trimTo(compactWhitespace(text), 420);
        }
    }

    private String extractJsonTypeHints(JsonNode node, int maxDepth, int maxItems) {
        StringBuilder sb = new StringBuilder();
        collectJsonTypeHints(node, "root", 0, Math.max(1, maxDepth), Math.max(4, maxItems), new int[] {0}, sb);
        return sb.toString().trim();
    }

    private void collectJsonTypeHints(
        JsonNode node,
        String path,
        int depth,
        int maxDepth,
        int maxItems,
        int[] counter,
        StringBuilder sb
    ) {
        if (node == null || depth > maxDepth || counter[0] >= maxItems) {
            return;
        }
        if (sb.length() > 0) {
            sb.append(" | ");
        }
        sb.append(path).append("=").append(resolveNodeType(node));
        counter[0]++;

        if (counter[0] >= maxItems || depth == maxDepth) {
            return;
        }
        if (node.isObject()) {
            int idx = 0;
            for (String fieldName : iterable(node.fieldNames())) {
                if (idx++ >= 4) {
                    break;
                }
                collectJsonTypeHints(node.get(fieldName), path + "." + fieldName, depth + 1, maxDepth, maxItems, counter, sb);
                if (counter[0] >= maxItems) {
                    break;
                }
            }
            return;
        }
        if (node.isArray() && node.size() > 0) {
            collectJsonTypeHints(node.get(0), path + "[0]", depth + 1, maxDepth, maxItems, counter, sb);
        }
    }

    private String summarizeImageFromMetadata(
        String name,
        String mimeType,
        String summary,
        String base64Data,
        boolean hasPayload
    ) {
        StringBuilder sb = new StringBuilder();
        sb.append("Image=").append(name.isBlank() ? "unnamed" : name);
        if (!mimeType.isBlank()) {
            sb.append("; mime=").append(mimeType);
        }
        if (!summary.isBlank()) {
            sb.append("; uiHint=").append(trimTo(compactWhitespace(summary), 220));
        }

        if (hasPayload) {
            String dimension = extractImageDimensions(base64Data);
            if (!dimension.isBlank()) {
                sb.append("; dimension=").append(dimension);
            }
        } else if (!base64Data.isBlank()) {
            sb.append("; note=base64 too large for local decode");
        }

        if (summary.isBlank()) {
            sb.append("; technicalCue=Extract controls/layout/colors from screenshot before editing UI code");
        }
        return trimTo(sb.toString(), 1500);
    }

    private String extractImageDimensions(String base64Data) {
        try {
            if (base64Data == null || base64Data.isBlank()) {
                return "";
            }
            byte[] bytes = Base64.getDecoder().decode(base64Data);
            if (bytes.length <= 0 || bytes.length > Math.max(200000, maxImageDecodeBytes)) {
                return "";
            }
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(bytes));
            if (image == null) {
                return "";
            }
            return image.getWidth() + "x" + image.getHeight();
        } catch (Exception ex) {
            return "";
        }
    }

    private String invokeLocalVision(String base64Data, String mimeType) {
        String prompt = String.valueOf(visionPrompt == null ? "" : visionPrompt).trim();
        if (aiLocalLlamaVisionNativeService != null && aiLocalLlamaVisionNativeService.isReady()) {
            String nativeDescription = aiLocalLlamaVisionNativeService.describeImage(prompt, base64Data, mimeType);
            if (!nativeDescription.isBlank()) {
                return trimTo(nativeDescription, 1200);
            }
        }
        String description = aiLocalLlamaVisionClient.describeImage(prompt, base64Data, mimeType);
        return trimTo(description, 1200);
    }

    private String resolveImageBase64(Map<String, Object> att) {
        if (att == null) {
            return "";
        }
        String base64Data = str(att.get("base64Data"));
        if (!base64Data.isBlank()) {
            return base64Data;
        }
        String dataUrl = str(att.get("dataUrl"));
        if (dataUrl.startsWith("data:image/")) {
            int comma = dataUrl.indexOf(',');
            if (comma > 0 && comma + 1 < dataUrl.length()) {
                return dataUrl.substring(comma + 1).trim();
            }
        }
        return "";
    }

    private String buildCompactContext(List<ScanDecision> decisions, String contextType, String taskType, String responseMode) {
        if (decisions == null || decisions.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        sb.append("## MULTI_MODAL_SCANNER_CONTEXT\n");
        sb.append("contextType=").append(contextType)
            .append(", taskType=").append(taskType)
            .append(", responseMode=").append(responseMode)
            .append("\n");
        int idx = 1;
        for (ScanDecision decision : decisions) {
            if (decision == null) {
                continue;
            }
            sb.append(idx++)
                .append(") [")
                .append(decision.kind())
                .append("] ")
                .append(decision.sourceId())
                .append(" | ingest=")
                .append(decision.shouldIngest())
                .append(" | scope=")
                .append(scopeMaskToText(decision.scopeMask()))
                .append(" | priority=")
                .append(decision.priority())
                .append("\n");
            sb.append("   reason: ").append(trimTo(decision.reason(), 180)).append("\n");
            sb.append("   summary: ").append(trimTo(compactWhitespace(decision.technicalSummary()), 420)).append("\n");
        }
        return sb.toString().trim();
    }

    private String buildIngestionMarkdown(
        List<ScanDecision> decisions,
        String contextType,
        String taskType,
        String message
    ) {
        if (decisions == null || decisions.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        sb.append("## DYNAMIC MULTI-MODAL CONTEXT\n");
        sb.append("Use this as temporary in-session memory derived from image/json scanner.\n\n");
        sb.append("contextType: ").append(contextType).append("\n");
        sb.append("taskType: ").append(taskType).append("\n");
        sb.append("request: ").append(trimTo(compactWhitespace(message), 500)).append("\n\n");

        int count = 0;
        for (ScanDecision decision : decisions) {
            if (decision == null || !decision.shouldIngest()) {
                continue;
            }
            count++;
            sb.append("### Signal ").append(count).append("\n");
            sb.append("sourceId: ").append(decision.sourceId()).append("\n");
            sb.append("kind: ").append(decision.kind()).append("\n");
            sb.append("scope: ").append(scopeMaskToText(decision.scopeMask())).append("\n");
            sb.append("priority: ").append(decision.priority()).append("\n");
            sb.append("reason: ").append(trimTo(decision.reason(), 220)).append("\n");
            sb.append("summary: ").append(trimTo(compactWhitespace(decision.technicalSummary()), 1400)).append("\n\n");
        }
        return sb.toString().trim();
    }

    private String scopeMaskToText(int mask) {
        Set<String> scopes = new LinkedHashSet<>();
        if ((mask & SCOPE_MENU) != 0) scopes.add("menu");
        if ((mask & SCOPE_CODE) != 0) scopes.add("code");
        if ((mask & SCOPE_UI_UX) != 0) scopes.add("ui_ux");
        if ((mask & SCOPE_JSON_SCHEMA) != 0) scopes.add("json_schema");
        if ((mask & SCOPE_BUSINESS) != 0) scopes.add("business");
        if (scopes.isEmpty()) {
            scopes.add("general");
        }
        return String.join("|", scopes);
    }

    private String inferKind(String name, String mimeType) {
        String n = String.valueOf(name == null ? "" : name).trim().toLowerCase(Locale.ROOT);
        String m = String.valueOf(mimeType == null ? "" : mimeType).trim().toLowerCase(Locale.ROOT);
        if (m.startsWith("image/") || n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".webp")) {
            return "image";
        }
        if ("application/json".equals(m) || n.endsWith(".json")) {
            return "json";
        }
        return "text";
    }

    private String resolveNodeType(JsonNode node) {
        if (node == null || node.isNull()) return "null";
        if (node.isObject()) return "object";
        if (node.isArray()) return "array";
        if (node.isNumber()) return "number";
        if (node.isBoolean()) return "boolean";
        if (node.isTextual()) return "string";
        return "value";
    }

    private Iterable<String> iterable(java.util.Iterator<String> iterator) {
        List<String> out = new ArrayList<>();
        if (iterator == null) {
            return out;
        }
        iterator.forEachRemaining(out::add);
        return out;
    }

    private String str(Object raw) {
        return String.valueOf(raw == null ? "" : raw).trim();
    }

    private String trimTo(String text, int maxChars) {
        String source = String.valueOf(text == null ? "" : text).trim();
        int cap = Math.max(120, maxChars);
        if (source.length() <= cap) {
            return source;
        }
        return source.substring(0, cap);
    }

    private String compactWhitespace(String text) {
        return String.valueOf(text == null ? "" : text)
            .replace("\r", " ")
            .replace("\n", " ")
            .replaceAll("\\s+", " ")
            .trim();
    }
}