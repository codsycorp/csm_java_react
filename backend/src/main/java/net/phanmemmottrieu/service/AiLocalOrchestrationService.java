package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Local agentic orchestration layer inspired by Copilot Agent workflows:
 * - Build a lightweight plan (planner phase)
 * - Execute local tools (metadata/symbol scan/attachment digest)
 * - Return compressed tiered context for final LLM call
 */
@Service
public class AiLocalOrchestrationService {

    public static class OrchestrationResult {
        public boolean enabled;
        public int totalCharsBefore;
        public int totalCharsAfter;
        public int savedChars;
        public String routingTier = "solver_balanced";
        public String preferredModelHint = "";
        public String speculativeOperation = "none";
        public boolean speculativeExecuted;
        public List<String> planSteps = new ArrayList<>();
        public Map<String, Object> toolStats = new LinkedHashMap<>();
        public String compressedContextBlock = "";

        public static OrchestrationResult disabled() {
            OrchestrationResult out = new OrchestrationResult();
            out.enabled = false;
            return out;
        }
    }

    private static final Pattern TOKEN_PATTERN = Pattern.compile("[a-zA-Z0-9_\\-]{3,}");
    private static final Pattern CODE_SYMBOL_PATTERN = Pattern.compile(
        "(?m)^\\s*(?:public|private|protected)?\\s*(?:static\\s+)?(?:class|interface|enum|record|void|int|long|double|float|boolean|String|def|function)\\s+[A-Za-z_][A-Za-z0-9_]*.*$");

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AiSpeculativeExecutionService aiSpeculativeExecutionService;

    public AiLocalOrchestrationService(AiSpeculativeExecutionService aiSpeculativeExecutionService) {
        this.aiSpeculativeExecutionService = aiSpeculativeExecutionService;
    }

    @Value("${ai.orchestration.agentic.enabled:true}")
    private boolean enabled;

    @Value("${ai.orchestration.agentic.max-context-chars:22000}")
    private int maxContextChars;

    @Value("${ai.orchestration.agentic.max-code-symbols:40}")
    private int maxCodeSymbols;

    @Value("${ai.orchestration.agentic.max-attachment-items:8}")
    private int maxAttachmentItems;

    @Value("${ai.orchestration.agentic.max-intents:12}")
    private int maxIntents;

    @Value("${ai.orchestration.routing.matrix.enabled:true}")
    private boolean routingMatrixEnabled;

    @Value("${ai.orchestration.routing.matrix.planner-model:gemini-2.5-flash}")
    private String plannerModelHint;

    @Value("${ai.orchestration.routing.matrix.balanced-model:gemini-2.5-flash}")
    private String balancedModelHint;

    @Value("${ai.orchestration.routing.matrix.complex-model:gemini-2.5-pro}")
    private String complexModelHint;

    public OrchestrationResult orchestrate(
        String appId,
        String message,
        String currentCode,
        List<Map<String, Object>> attachments,
        String contextType,
        String taskType,
        String responseMode,
        String language
    ) {
        if (!enabled) {
            return OrchestrationResult.disabled();
        }

        String safeMessage = String.valueOf(message == null ? "" : message).trim();
        String safeCode = String.valueOf(currentCode == null ? "" : currentCode);
        List<Map<String, Object>> safeAttachments = attachments == null ? List.of() : attachments;
        String safeContextType = String.valueOf(contextType == null ? "code" : contextType).trim().toLowerCase(Locale.ROOT);
        String safeTaskType = String.valueOf(taskType == null ? "" : taskType).trim().toLowerCase(Locale.ROOT);
        String safeMode = String.valueOf(responseMode == null ? "edit" : responseMode).trim().toLowerCase(Locale.ROOT);
        String safeLanguage = String.valueOf(language == null ? "" : language).trim().toLowerCase(Locale.ROOT);

        OrchestrationResult out = new OrchestrationResult();
        out.enabled = true;

        int messageChars = safeMessage.length();
        int codeChars = safeCode.length();
        int attachmentChars = estimateAttachmentTextChars(safeAttachments);
        out.totalCharsBefore = messageChars + codeChars + attachmentChars;

        List<String> planSteps = buildPlannerSteps(safeContextType, safeTaskType, safeMode, codeChars, attachmentChars);
        out.planSteps = planSteps;

        String routingTier = resolveRoutingTier(safeMessage, safeContextType, safeTaskType, safeMode, codeChars, attachmentChars);
        out.routingTier = routingTier;
        out.preferredModelHint = resolvePreferredModelHint(routingTier);
        out.toolStats.put("routingTier", out.routingTier);
        out.toolStats.put("preferredModelHint", out.preferredModelHint);

        LocalToolDigest digest = runLocalTools(safeMessage, safeCode, safeAttachments);
        out.toolStats = digest.stats;

        AiSpeculativeExecutionService.ExecutionResult speculative = aiSpeculativeExecutionService.run(
            safeMessage,
            safeCode,
            safeAttachments,
            safeContextType);
        out.speculativeOperation = speculative == null ? "none" : String.valueOf(speculative.operation == null ? "none" : speculative.operation);
        out.speculativeExecuted = speculative != null && speculative.executed;
        out.toolStats.put("routingTier", out.routingTier);
        out.toolStats.put("preferredModelHint", out.preferredModelHint);
        out.toolStats.put("speculativeExecuted", out.speculativeExecuted);
        out.toolStats.put("speculativeOperation", out.speculativeOperation);
        if (speculative != null && speculative.data != null && !speculative.data.isEmpty()) {
            out.toolStats.put("speculativeData", speculative.data);
        }

        String tier1 = buildTier1Metadata(appId, safeContextType, safeTaskType, safeMode, safeLanguage, safeAttachments.size());
        String tier2 = buildTier2RelevantContext(digest, safeContextType);
        String tier3 = buildTier3RuntimeOutput(digest);

        String combined = "## LOCAL_AGENTIC_ORCHESTRATION\\n"
            + "Mode: local_agentic_workflow\\n"
            + "ORCHESTRATION_ROUTING_TIER=" + out.routingTier + "\n"
            + "ORCHESTRATION_PREFERRED_MODEL=" + out.preferredModelHint + "\n"
            + "ORCHESTRATION_SPECULATIVE_OPERATION=" + out.speculativeOperation + "\n"
            + "Plan steps:\\n"
            + toNumberedLines(planSteps)
            + "\\n"
            + "### Tier 1: Metadata\\n" + tier1 + "\\n\\n"
            + "### Tier 2: Relevant Files/Signals\\n" + tier2 + "\\n\\n"
            + "### Tier 3: Runtime Tool Output (compressed)\\n" + tier3;

        String trimmed = truncateMiddle(combined, Math.max(4000, maxContextChars));
        out.compressedContextBlock = trimmed;
        out.totalCharsAfter = trimmed.length();
        out.savedChars = Math.max(0, out.totalCharsBefore - out.totalCharsAfter);
        out.toolStats.put("estimatedTokensBefore", estimateTokens(out.totalCharsBefore));
        out.toolStats.put("estimatedTokensAfter", estimateTokens(out.totalCharsAfter));
        out.toolStats.put("estimatedTokenSavings", Math.max(0, estimateTokens(out.totalCharsBefore) - estimateTokens(out.totalCharsAfter)));

        return out;
    }

    private List<String> buildPlannerSteps(
        String contextType,
        String taskType,
        String responseMode,
        int codeChars,
        int attachmentChars
    ) {
        List<String> steps = new ArrayList<>();
        steps.add("Plan request scope and choose low-cost local tools first");
        if (codeChars > 0) {
            steps.add("Run local code symbol scan to avoid sending full source blindly");
        }
        if (attachmentChars > 0) {
            steps.add("Run local attachment digest and JSON key extraction");
        }
        steps.add("Assemble tiered context (metadata -> relevant -> runtime output)");
        if ("menu_json".equals(contextType) || taskType.contains("menu")) {
            steps.add("Prioritize schema/table/trigger signals for menu grounding");
        }
        if ("analyze".equals(responseMode)) {
            steps.add("Favor explanation output and keep code payload minimal");
        }
        steps.add("Apply routing matrix hint for model selection (planner/balanced/complex)");
        return steps;
    }

    private String resolveRoutingTier(
        String message,
        String contextType,
        String taskType,
        String responseMode,
        int codeChars,
        int attachmentChars
    ) {
        if (!routingMatrixEnabled) {
            return "solver_balanced";
        }
        String text = String.valueOf(message == null ? "" : message).toLowerCase(Locale.ROOT);
        String ctx = String.valueOf(contextType == null ? "" : contextType).toLowerCase(Locale.ROOT);
        String task = String.valueOf(taskType == null ? "" : taskType).toLowerCase(Locale.ROOT);
        String mode = String.valueOf(responseMode == null ? "" : responseMode).toLowerCase(Locale.ROOT);

        boolean planningLike = mode.contains("analy")
            || text.contains("plan")
            || text.contains("tìm")
            || text.contains("search")
            || text.contains("phân tích")
            || text.contains("phan tich");
        if (planningLike && codeChars < 30000 && attachmentChars < 50000) {
            return "planner_fast";
        }

        boolean complex = text.contains("refactor")
            || text.contains("kiến trúc")
            || text.contains("kien truc")
            || text.contains("architecture")
            || text.contains("complex")
            || codeChars > 120000
            || attachmentChars > 180000;
        if (complex || "menu_json".equals(ctx) || task.contains("menu")) {
            return "solver_complex";
        }

        return "solver_balanced";
    }

    private String resolvePreferredModelHint(String routingTier) {
        String tier = String.valueOf(routingTier == null ? "" : routingTier).trim().toLowerCase(Locale.ROOT);
        if ("planner_fast".equals(tier)) {
            return String.valueOf(plannerModelHint == null ? "gemini-2.5-flash" : plannerModelHint).trim();
        }
        if ("solver_complex".equals(tier)) {
            return String.valueOf(complexModelHint == null ? "gemini-2.5-pro" : complexModelHint).trim();
        }
        return String.valueOf(balancedModelHint == null ? "gemini-2.5-flash" : balancedModelHint).trim();
    }

    private LocalToolDigest runLocalTools(String message, String code, List<Map<String, Object>> attachments) {
        LocalToolDigest digest = new LocalToolDigest();

        Set<String> intents = extractIntentKeywords(message, Math.max(4, maxIntents));
        digest.intentKeywords.addAll(intents);
        digest.stats.put("intentKeywords", intents.size());

        List<String> codeSymbols = extractCodeSymbols(code, Math.max(10, maxCodeSymbols));
        digest.codeSymbols.addAll(codeSymbols);
        digest.stats.put("codeSymbols", codeSymbols.size());

        AttachmentDigest attachmentDigest = buildAttachmentDigest(attachments, Math.max(1, maxAttachmentItems));
        digest.attachmentItems.addAll(attachmentDigest.items);
        digest.stats.putAll(attachmentDigest.stats);

        return digest;
    }

    private String buildTier1Metadata(
        String appId,
        String contextType,
        String taskType,
        String responseMode,
        String language,
        int attachmentCount
    ) {
        StringBuilder sb = new StringBuilder();
        sb.append("appId=").append(String.valueOf(appId == null ? "" : appId).trim()).append("\\n");
        sb.append("contextType=").append(contextType).append("\\n");
        sb.append("taskType=").append(taskType).append("\\n");
        sb.append("responseMode=").append(responseMode).append("\\n");
        sb.append("language=").append(language).append("\\n");
        sb.append("attachmentCount=").append(Math.max(0, attachmentCount));
        return sb.toString();
    }

    private String buildTier2RelevantContext(LocalToolDigest digest, String contextType) {
        StringBuilder sb = new StringBuilder();
        if (!digest.intentKeywords.isEmpty()) {
            sb.append("intentKeywords: ").append(String.join(", ", digest.intentKeywords)).append("\\n");
        }
        if (!digest.codeSymbols.isEmpty()) {
            sb.append("codeSymbols:\\n");
            for (String line : digest.codeSymbols) {
                sb.append("- ").append(line).append("\\n");
            }
        }
        if (!digest.attachmentItems.isEmpty()) {
            sb.append("attachmentDigest:\\n");
            for (String item : digest.attachmentItems) {
                sb.append("- ").append(item).append("\\n");
            }
        }
        if ("menu_json".equals(contextType)) {
            sb.append("menuFocus: preserve schema consistency and avoid generating unknown entities\\n");
        }
        return sb.toString().trim();
    }

    private String buildTier3RuntimeOutput(LocalToolDigest digest) {
        Map<String, Object> runtime = new LinkedHashMap<>();
        runtime.put("stats", digest.stats);
        runtime.put("intents", digest.intentKeywords);
        runtime.put("codeSymbolCount", digest.codeSymbols.size());
        runtime.put("attachmentItemCount", digest.attachmentItems.size());
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(runtime);
        } catch (Exception ignored) {
            return String.valueOf(runtime);
        }
    }

    private Set<String> extractIntentKeywords(String message, int limit) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        Matcher m = TOKEN_PATTERN.matcher(String.valueOf(message == null ? "" : message).toLowerCase(Locale.ROOT));
        while (m.find()) {
            String token = String.valueOf(m.group(0) == null ? "" : m.group(0)).trim();
            if (token.isBlank()) {
                continue;
            }
            if (out.add(token) && out.size() >= Math.max(1, limit)) {
                break;
            }
        }
        return out;
    }

    private List<String> extractCodeSymbols(String code, int limit) {
        List<String> out = new ArrayList<>();
        if (code == null || code.isBlank()) {
            return out;
        }
        String source = code.length() > 300000 ? code.substring(0, 300000) : code;
        Matcher m = CODE_SYMBOL_PATTERN.matcher(source);
        while (m.find()) {
            String line = String.valueOf(m.group(0) == null ? "" : m.group(0)).trim();
            if (line.isEmpty()) {
                continue;
            }
            out.add(truncateLine(line, 160));
            if (out.size() >= Math.max(1, limit)) {
                break;
            }
        }
        return out;
    }

    private AttachmentDigest buildAttachmentDigest(List<Map<String, Object>> attachments, int limit) {
        AttachmentDigest out = new AttachmentDigest();
        if (attachments == null || attachments.isEmpty()) {
            out.stats.put("attachmentCount", 0);
            out.stats.put("attachmentTextChars", 0);
            return out;
        }

        int count = 0;
        int totalChars = 0;
        int jsonHints = 0;
        for (Map<String, Object> attachment : attachments) {
            if (attachment == null) {
                continue;
            }
            count++;
            String name = str(attachment.get("name"));
            String kind = str(attachment.get("kind"));
            String contextRole = str(attachment.get("contextRole"));
            boolean authoritative = toBool(attachment.get("authoritative"));
            int size = toInt(attachment.get("size"));
            String summary = str(attachment.get("summary"));
            String textContent = str(attachment.get("textContent"));
            int textChars = textContent.length();
            totalChars += textChars;

            StringBuilder line = new StringBuilder();
            line.append(name.isBlank() ? "(unnamed)" : name)
                .append(" | kind=").append(kind)
                .append(" | role=").append(contextRole)
                .append(" | auth=").append(authoritative)
                .append(" | size=").append(size)
                .append(" | textChars=").append(textChars);
            if (!summary.isBlank()) {
                line.append(" | summary=").append(truncateLine(summary, 120));
            }

            if (("json".equalsIgnoreCase(kind) || name.toLowerCase(Locale.ROOT).endsWith(".json")) && !textContent.isBlank()) {
                jsonHints++;
                String keys = extractJsonRootKeys(textContent, 8);
                if (!keys.isBlank()) {
                    line.append(" | rootKeys=").append(keys);
                }
            }

            if (out.items.size() < limit) {
                out.items.add(line.toString());
            }
        }

        out.stats.put("attachmentCount", count);
        out.stats.put("attachmentTextChars", totalChars);
        out.stats.put("jsonAttachmentHints", jsonHints);
        out.stats.put("attachmentItemsIncluded", out.items.size());
        return out;
    }

    private String extractJsonRootKeys(String text, int maxKeys) {
        try {
            JsonNode node = objectMapper.readTree(text);
            if (!node.isObject()) {
                return "";
            }
            List<String> keys = new ArrayList<>();
            node.fieldNames().forEachRemaining(keys::add);
            if (keys.isEmpty()) {
                return "";
            }
            return String.join(", ", keys.subList(0, Math.min(keys.size(), Math.max(1, maxKeys))));
        } catch (Exception ignored) {
            return "";
        }
    }

    private int estimateAttachmentTextChars(List<Map<String, Object>> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return 0;
        }
        int total = 0;
        for (Map<String, Object> item : attachments) {
            if (item == null) {
                continue;
            }
            String text = str(item.get("textContent"));
            total += text.length();
        }
        return total;
    }

    private int estimateTokens(int chars) {
        if (chars <= 0) {
            return 0;
        }
        return Math.max(1, (int) Math.ceil(chars / 4.0));
    }

    private String toNumberedLines(List<String> lines) {
        if (lines == null || lines.isEmpty()) {
            return "1. Build minimal context\\n2. Execute local tools\\n3. Send compressed results to model\\n";
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < lines.size(); i++) {
            sb.append(i + 1).append(". ").append(String.valueOf(lines.get(i) == null ? "" : lines.get(i)).trim()).append("\\n");
        }
        return sb.toString();
    }

    private String truncateMiddle(String text, int maxChars) {
        String source = String.valueOf(text == null ? "" : text);
        if (source.length() <= maxChars) {
            return source;
        }
        int safeMax = Math.max(200, maxChars);
        int head = (int) Math.floor(safeMax * 0.6);
        int tail = safeMax - head - 20;
        if (tail < 40) {
            tail = 40;
            head = Math.max(80, safeMax - tail - 20);
        }
        return source.substring(0, Math.min(source.length(), head))
            + "\\n... [LOCAL_ORCHESTRATION_TRUNCATED] ...\\n"
            + source.substring(Math.max(0, source.length() - tail));
    }

    private String truncateLine(String text, int maxLen) {
        String v = String.valueOf(text == null ? "" : text).trim();
        if (v.length() <= maxLen) {
            return v;
        }
        return v.substring(0, Math.max(0, maxLen - 3)) + "...";
    }

    private String str(Object raw) {
        return String.valueOf(raw == null ? "" : raw).trim();
    }

    private int toInt(Object raw) {
        if (raw instanceof Number n) {
            return Math.max(0, n.intValue());
        }
        try {
            return Math.max(0, Integer.parseInt(String.valueOf(raw == null ? "0" : raw).trim()));
        } catch (Exception ignored) {
            return 0;
        }
    }

    private boolean toBool(Object raw) {
        if (raw instanceof Boolean b) {
            return b;
        }
        String text = String.valueOf(raw == null ? "" : raw).trim().toLowerCase(Locale.ROOT);
        return "1".equals(text) || "true".equals(text) || "yes".equals(text) || "y".equals(text);
    }

    private static class LocalToolDigest {
        final Set<String> intentKeywords = new LinkedHashSet<>();
        final List<String> codeSymbols = new ArrayList<>();
        final List<String> attachmentItems = new ArrayList<>();
        final Map<String, Object> stats = new LinkedHashMap<>();
    }

    private static class AttachmentDigest {
        final List<String> items = new ArrayList<>();
        final Map<String, Object> stats = new LinkedHashMap<>();
    }
}
