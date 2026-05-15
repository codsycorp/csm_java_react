package net.phanmemmottrieu.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class AiLocalWorkflowAdvisorService {

    private static final Pattern TOKEN_PATTERN = Pattern.compile("[\\p{L}\\p{N}_$.-]{3,}");
    private static final Pattern CODE_SIGNAL_PATTERN = Pattern.compile(
        "\\b(code|function|class|bug|fix|refactor|implement|menu|json|schema|api|endpoint|sql|java|javascript|typescript|vue|html|css|file|module|component|table|node|route|controller|service|patch|edit|update|modify|xoa|sua|them|chen|doi)\\b",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern OFF_TOPIC_PATTERN = Pattern.compile(
        "\\b(weather|news|joke|music|song|movie|travel|hotel|ticket|recipe|game|football|soccer|translate|dịch|thơ|poem|story|essay|du lịch)\\b",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern DIRECT_CONVERSATION_PATTERN = Pattern.compile(
        "\\b(hello|hi|xin chào|chào|cảm ơn|thank|bye|tạm biệt|goodbye|help|giúp)\\b",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private final AiExecutionPlannerService aiExecutionPlannerService;

    @Value("${ai.local.workflow.fast-direct.max-message-chars:320}")
    private int fastDirectMaxMessageChars;

    @Value("${ai.local.workflow.max-step-blueprints:6}")
    private int maxStepBlueprints;

    @Autowired
    public AiLocalWorkflowAdvisorService(@Autowired(required = false) AiExecutionPlannerService aiExecutionPlannerService) {
        this.aiExecutionPlannerService = aiExecutionPlannerService;
    }

    public WorkflowAdvice advise(WorkflowRequest request) {
        WorkflowRequest safeRequest = request == null ? WorkflowRequest.empty() : request.normalize();
        List<AttachmentInsight> attachmentInsights = analyzeAttachments(safeRequest.attachments());
        WorkflowAdvice.Builder builder = WorkflowAdvice.builder()
            .workspaceKind(resolveWorkspaceKind(safeRequest))
            .attachmentInsights(attachmentInsights)
            .weakMachineSafe(isWeakMachineSafeRequest(safeRequest));

        WorkflowPlanFactory factory = new WorkflowPlanDirector().selectFactory(builder.workspaceKind);
        factory.apply(builder, safeRequest, attachmentInsights);
        attachExecutionBlueprint(builder, safeRequest);
        return builder.build();
    }

    private void attachExecutionBlueprint(WorkflowAdvice.Builder builder, WorkflowRequest request) {
        if (aiExecutionPlannerService == null || builder.quickExit) {
            return;
        }
        String workspaceContext = "menu".equals(builder.workspaceKind) ? "menu" : "code";
        AiExecutionPlannerService.ExecutionPlan executionPlan = aiExecutionPlannerService.generatePlan(
            request.message(),
            workspaceContext,
            request.currentCode(),
            request.retrievalPlannerQuery()
        );
        if (executionPlan == null || executionPlan.steps == null || executionPlan.steps.isEmpty()) {
            return;
        }

        List<Map<String, Object>> steps = new ArrayList<>();
        int maxSteps = Math.max(1, maxStepBlueprints);
        for (int i = 0; i < executionPlan.steps.size() && steps.size() < maxSteps; i++) {
            AiExecutionPlannerService.ExecutionStep step = executionPlan.steps.get(i);
            if (step == null) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("stepId", step.stepId);
            item.put("action", String.valueOf(step.action == null ? "" : step.action));
            item.put("scope", String.valueOf(step.scope == null ? "" : step.scope));
            item.put("description", String.valueOf(step.description == null ? "" : step.description));
            item.put("estimatedMs", step.estimatedMs);
            if (step.targetPath != null && !step.targetPath.isBlank()) {
                item.put("targetPath", step.targetPath);
            }
            steps.add(Map.copyOf(item));
        }
        builder.executionBlueprint(steps);
    }

    private String resolveWorkspaceKind(WorkflowRequest request) {
        if (request.intent().needsMenuContext() || "menu_json".equalsIgnoreCase(request.contextType())) {
            return "menu";
        }
        if (request.intent().needsCodeContext()
            || "edit".equalsIgnoreCase(request.responseMode())
            || !request.currentCode().isBlank()) {
            return "code";
        }
        return "general";
    }

    private boolean isWeakMachineSafeRequest(WorkflowRequest request) {
        int attachmentChars = 0;
        for (Map<String, Object> attachment : request.attachments()) {
            String content = str(attachment.get("content"));
            attachmentChars += Math.min(50_000, content.length());
        }
        return request.currentCode().length() + attachmentChars <= 220_000;
    }

    private List<AttachmentInsight> analyzeAttachments(List<Map<String, Object>> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return List.of();
        }
        List<AttachmentInsight> insights = new ArrayList<>();
        for (Map<String, Object> attachment : attachments) {
            if (attachment == null || attachment.isEmpty()) {
                continue;
            }
            String name = firstNonBlank(attachment.get("name"), attachment.get("fileName"), attachment.get("filename"));
            String mime = firstNonBlank(attachment.get("mimeType"), attachment.get("mime_type"), attachment.get("type"));
            String role = firstNonBlank(attachment.get("contextRole"), attachment.get("kind"), attachment.get("category"));
            String content = str(attachment.get("content"));
            String summary = firstNonBlank(attachment.get("summary"), attachment.get("description"));
            String category = categorizeAttachment(name, mime, role, content, summary);
            List<String> keywords = extractTopTokens(firstNonBlank(summary, name, content), 6);
            boolean shouldIndex = shouldIndexAttachment(category, content, summary);
            insights.add(new AttachmentInsight(name, mime, category, role, keywords, shouldIndex, Math.max(content.length(), summary.length())));
        }
        return List.copyOf(insights);
    }

    private String categorizeAttachment(String name, String mime, String role, String content, String summary) {
        String combined = (name + " " + mime + " " + role + " " + summary).toLowerCase(Locale.ROOT);
        if (combined.contains("image") || mime.startsWith("image/")) {
            return "image_context";
        }
        if (combined.contains("menu") || combined.contains("trigger") || combined.contains("schema") || content.contains("\"parentId\"") || content.contains("\"type_form\"")) {
            return "menu_context";
        }
        if (combined.contains("code") || combined.contains("java") || combined.contains("typescript") || combined.contains("javascript") || content.contains("function ") || content.contains("class ")) {
            return "code_context";
        }
        if (combined.contains("md") || combined.contains("markdown") || combined.contains("business") || content.contains("# ")) {
            return "business_context";
        }
        if (content.startsWith("{") || content.startsWith("[")) {
            return "json_context";
        }
        return "reference_context";
    }

    private boolean shouldIndexAttachment(String category, String content, String summary) {
        if ("image_context".equals(category)) {
            return true;
        }
        int chars = Math.max(content.length(), summary.length());
        return chars >= 80 || "menu_context".equals(category) || "code_context".equals(category) || "business_context".equals(category);
    }

    private List<String> extractTopTokens(String text, int max) {
        if (max <= 0) {
            return List.of();
        }
        LinkedHashSet<String> out = new LinkedHashSet<>();
        Matcher matcher = TOKEN_PATTERN.matcher(str(text).toLowerCase(Locale.ROOT));
        while (matcher.find() && out.size() < max) {
            out.add(matcher.group());
        }
        return List.copyOf(out);
    }

    private RoutePlan decideGeneralRoute(WorkflowRequest request, List<AttachmentInsight> attachmentInsights) {
        boolean hasAttachments = attachmentInsights != null && !attachmentInsights.isEmpty();
        boolean hasCode = !request.currentCode().isBlank();
        boolean quickDirect = !"edit".equalsIgnoreCase(request.responseMode())
            && !hasAttachments
            && !hasCode
            && request.intent().canAnswerDirectlyWithoutContext()
            && request.message().length() <= Math.max(80, fastDirectMaxMessageChars);
        boolean offTopic = !quickDirect
            && !hasAttachments
            && !hasCode
            && looksOffTopic(request.message())
            && !request.intent().needsCodeContext()
            && !request.intent().needsMenuContext();

        if (offTopic) {
            return new RoutePlan("OFF_TOPIC_FAST_EXIT", Math.max(70, request.intent().confidence()), "off_topic_fast_reply", true, false);
        }
        if (quickDirect || looksLikeDirectConversation(request.message())) {
            return new RoutePlan("FAST_DIRECT_ANSWER", Math.max(60, request.intent().confidence()), "direct_question", true, false);
        }
        return new RoutePlan("GENERAL_ANALYSIS", Math.max(50, request.intent().confidence()), "default_analysis", false, true);
    }

    private boolean looksOffTopic(String message) {
        String normalized = Normalizer.normalize(str(message), Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "")
            .toLowerCase(Locale.ROOT);
        if (normalized.isBlank()) {
            return false;
        }
        if (CODE_SIGNAL_PATTERN.matcher(normalized).find()) {
            return false;
        }
        return OFF_TOPIC_PATTERN.matcher(normalized).find();
    }

    private boolean looksLikeDirectConversation(String message) {
        String normalized = str(message).toLowerCase(Locale.ROOT);
        return !normalized.isBlank() && DIRECT_CONVERSATION_PATTERN.matcher(normalized).find();
    }

    private List<String> buildIngestTargets(String workspaceKind, List<AttachmentInsight> attachmentInsights, boolean hasPrimarySurface) {
        LinkedHashSet<String> targets = new LinkedHashSet<>();
        if (hasPrimarySurface) {
            targets.add("menu".equals(workspaceKind) ? "current_menu" : "current_code");
        }
        for (AttachmentInsight attachmentInsight : attachmentInsights) {
            if (!attachmentInsight.shouldIndex()) {
                continue;
            }
            switch (attachmentInsight.category()) {
                case "menu_context" -> targets.add("menu_attachments");
                case "code_context" -> targets.add("code_attachments");
                case "business_context" -> targets.add("business_markdown");
                case "json_context" -> targets.add("json_attachments");
                case "image_context" -> targets.add("image_scan_summary");
                default -> targets.add("reference_attachments");
            }
        }
        return List.copyOf(targets);
    }

    private List<Map<String, Object>> buildEditOrAnalyzePlan(WorkflowRequest request, boolean menuContext) {
        List<Map<String, Object>> tools = new ArrayList<>();
        if (!request.retrievalPlannerQuery().isBlank()) {
            tools.add(tool("search_local_context", 1, Map.of(
                "query", truncate(request.retrievalPlannerQuery(), 240),
                "budget", request.currentCode().length() > 120_000 ? "weak_machine_bounded" : "bounded"
            )));
        }
        tools.add(tool(menuContext ? "analyze_menu_schema" : "analyze_code_scope", 2, Map.of(
            "reason", menuContext ? "menu_context_required" : "code_context_required"
        )));
        if ("edit".equalsIgnoreCase(request.responseMode())) {
            tools.add(tool("propose_structured_text_edits", 3, Map.of(
                "requireStructured", true,
                "maxTextEdits", 120,
                "budget", request.currentCode().length() > 120_000 ? "conservative" : "normal"
            )));
            tools.add(tool("validate_edit_contract", 4, Map.of(
                "checklistRequired", true,
                "providerStructuredRequired", true
            )));
        } else {
            tools.add(tool("synthesize_grounded_answer", 3, Map.of(
                "source", menuContext ? "menu_context" : "code_context"
            )));
        }
        if (request.message().length() > 180 || request.attachments().size() > 0 || tools.size() >= 3) {
            tools.add(tool("self_check_consistency", tools.size() + 1, Map.of("mode", "lightweight")));
        }
        return List.copyOf(tools);
    }

    private List<Map<String, Object>> buildGroundedAnswerPlan(WorkflowRequest request) {
        List<Map<String, Object>> tools = new ArrayList<>();
        if (!request.retrievalPlannerQuery().isBlank()) {
            tools.add(tool("search_local_context", 1, Map.of(
                "query", truncate(request.retrievalPlannerQuery(), 240),
                "budget", "minimal"
            )));
        }
        tools.add(tool("synthesize_grounded_answer", 2, Map.of("source", "general_context")));
        return List.copyOf(tools);
    }

    private Map<String, Object> tool(String intent, int priority, Map<String, Object> extras) {
        LinkedHashMap<String, Object> out = new LinkedHashMap<>();
        out.put("intent", intent);
        out.put("priority", priority);
        if (extras != null && !extras.isEmpty()) {
            out.putAll(extras);
        }
        return Map.copyOf(out);
    }

    private String truncate(String text, int maxChars) {
        String safe = str(text);
        if (safe.length() <= Math.max(8, maxChars)) {
            return safe;
        }
        return safe.substring(0, Math.max(8, maxChars - 1)) + "…";
    }

    private static String str(Object raw) {
        return String.valueOf(raw == null ? "" : raw).trim();
    }

    private static String firstNonBlank(Object... values) {
        if (values == null) {
            return "";
        }
        for (Object value : values) {
            String text = str(value);
            if (!text.isBlank()) {
                return text;
            }
        }
        return "";
    }

    private interface WorkflowPlanFactory {
        void apply(WorkflowAdvice.Builder builder, WorkflowRequest request, List<AttachmentInsight> attachmentInsights);
    }

    private final class WorkflowPlanDirector {
        private final WorkflowPlanFactory CODE = new CodeWorkflowPlanFactory();
        private final WorkflowPlanFactory MENU = new MenuWorkflowPlanFactory();
        private final WorkflowPlanFactory GENERAL = new GeneralWorkflowPlanFactory();

        private WorkflowPlanDirector() {
        }

        private WorkflowPlanFactory selectFactory(String workspaceKind) {
            if ("menu".equals(workspaceKind)) {
                return MENU;
            }
            if ("code".equals(workspaceKind)) {
                return CODE;
            }
            return GENERAL;
        }
    }

    private final class GeneralWorkflowPlanFactory implements WorkflowPlanFactory {
        @Override
        public void apply(WorkflowAdvice.Builder builder, WorkflowRequest request, List<AttachmentInsight> attachmentInsights) {
            RoutePlan route = decideGeneralRoute(request, attachmentInsights);
            builder.route(route)
                .quickExit(route.quickExit())
                .ingestTargets(List.of())
                .toolPlan(route.quickExit()
                    ? List.of(tool("respond_direct", 1, Map.of("budget", "minimal", "reason", route.reasonCode())))
                    : buildGroundedAnswerPlan(request));
        }
    }

    private final class CodeWorkflowPlanFactory implements WorkflowPlanFactory {
        @Override
        public void apply(WorkflowAdvice.Builder builder, WorkflowRequest request, List<AttachmentInsight> attachmentInsights) {
            builder.route(new RoutePlan("CODE_CONTEXT", Math.max(55, request.intent().confidence()), "code_context_required", false, true));
            builder.quickExit(false);
            builder.ingestTargets(buildIngestTargets("code", attachmentInsights, !request.currentCode().isBlank()));
            builder.toolPlan(buildEditOrAnalyzePlan(request, false));
        }
    }

    private final class MenuWorkflowPlanFactory implements WorkflowPlanFactory {
        @Override
        public void apply(WorkflowAdvice.Builder builder, WorkflowRequest request, List<AttachmentInsight> attachmentInsights) {
            builder.route(new RoutePlan("MENU_CONTEXT", Math.max(55, request.intent().confidence()), "menu_context_required", false, true));
            builder.quickExit(false);
            builder.ingestTargets(buildIngestTargets("menu", attachmentInsights, !request.currentCode().isBlank()));
            builder.toolPlan(buildEditOrAnalyzePlan(request, true));
        }
    }

    public record IntentSnapshot(String type, String action, int confidence, String nextStep, String contextKind) {
        public static IntentSnapshot unknown() {
            return new IntentSnapshot("GENERAL", "other", 0, "unknown", "none");
        }

        public boolean needsMenuContext() {
            return "load_menu_context".equalsIgnoreCase(str(nextStep)) || "menu".equalsIgnoreCase(str(contextKind));
        }

        public boolean needsCodeContext() {
            return "load_code_context".equalsIgnoreCase(str(nextStep)) || "code".equalsIgnoreCase(str(contextKind));
        }

        public boolean canAnswerDirectlyWithoutContext() {
            return "answer_direct".equalsIgnoreCase(str(nextStep)) && !needsMenuContext() && !needsCodeContext();
        }
    }

    public record WorkflowRequest(
        String message,
        String currentCode,
        String contextType,
        String responseMode,
        List<Map<String, Object>> attachments,
        String retrievalPlannerQuery,
        IntentSnapshot intent
    ) {
        public static WorkflowRequest empty() {
            return new WorkflowRequest("", "", "", "", List.of(), "", IntentSnapshot.unknown());
        }

        public WorkflowRequest normalize() {
            return new WorkflowRequest(
                str(message),
                String.valueOf(currentCode == null ? "" : currentCode),
                str(contextType),
                str(responseMode),
                attachments == null ? List.of() : List.copyOf(attachments),
                str(retrievalPlannerQuery),
                intent == null ? IntentSnapshot.unknown() : intent
            );
        }
    }

    public record RoutePlan(String routeName, int confidence, String reasonCode, boolean quickExit, boolean requiresDeepContext) {}

    public record AttachmentInsight(
        String name,
        String mimeType,
        String category,
        String role,
        List<String> keywords,
        boolean shouldIndex,
        int estimatedChars
    ) {}

    public record WorkflowAdvice(
        RoutePlan routePlan,
        List<Map<String, Object>> toolPlan,
        List<AttachmentInsight> attachmentInsights,
        List<String> ingestTargets,
        List<Map<String, Object>> executionBlueprint,
        String workspaceKind,
        boolean quickExit,
        boolean weakMachineSafe
    ) {
        public static Builder builder() {
            return new Builder();
        }

        public static final class Builder {
            private RoutePlan routePlan = new RoutePlan("GENERAL_ANALYSIS", 50, "default_analysis", false, true);
            private List<Map<String, Object>> toolPlan = List.of();
            private List<AttachmentInsight> attachmentInsights = List.of();
            private List<String> ingestTargets = List.of();
            private List<Map<String, Object>> executionBlueprint = List.of();
            private String workspaceKind = "general";
            private boolean quickExit;
            private boolean weakMachineSafe;

            private Builder() {
            }

            public Builder route(RoutePlan routePlan) {
                if (routePlan != null) {
                    this.routePlan = routePlan;
                }
                return this;
            }

            public Builder toolPlan(List<Map<String, Object>> toolPlan) {
                this.toolPlan = toolPlan == null ? List.of() : List.copyOf(toolPlan);
                return this;
            }

            public Builder attachmentInsights(List<AttachmentInsight> attachmentInsights) {
                this.attachmentInsights = attachmentInsights == null ? List.of() : List.copyOf(attachmentInsights);
                return this;
            }

            public Builder ingestTargets(List<String> ingestTargets) {
                this.ingestTargets = ingestTargets == null ? List.of() : List.copyOf(ingestTargets);
                return this;
            }

            public Builder executionBlueprint(List<Map<String, Object>> executionBlueprint) {
                this.executionBlueprint = executionBlueprint == null ? List.of() : List.copyOf(executionBlueprint);
                return this;
            }

            public Builder workspaceKind(String workspaceKind) {
                this.workspaceKind = str(workspaceKind).isBlank() ? "general" : str(workspaceKind).toLowerCase(Locale.ROOT);
                return this;
            }

            public Builder quickExit(boolean quickExit) {
                this.quickExit = quickExit;
                return this;
            }

            public Builder weakMachineSafe(boolean weakMachineSafe) {
                this.weakMachineSafe = weakMachineSafe;
                return this;
            }

            public WorkflowAdvice build() {
                return new WorkflowAdvice(
                    routePlan,
                    List.copyOf(toolPlan),
                    List.copyOf(attachmentInsights),
                    List.copyOf(ingestTargets),
                    List.copyOf(executionBlueprint),
                    workspaceKind,
                    quickExit,
                    weakMachineSafe
                );
            }
        }
    }
}