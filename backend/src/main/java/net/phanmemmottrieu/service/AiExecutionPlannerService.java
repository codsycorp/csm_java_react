package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * AI Execution Planner Service
 * Generates and optimizes execution plans for code/menu operations.
 *
 * Key responsibilities:
 * 1. Parse AI-generated steps from response
 * 2. Deduplicate adjacent/overlapping steps
 * 3. Assign scope boundaries (line ranges, node IDs)
 * 4. Estimate execution time per step
 * 5. Optimize step sequencing for minimal rewrites
 *
 * @author Mr.Anh
 */
@Service
public class AiExecutionPlannerService {

    private static final Logger log = LoggerFactory.getLogger(AiExecutionPlannerService.class);

    @Value("${ai.execution.plan.enabled:true}")
    private boolean enabled;

    @Value("${ai.execution.plan.max-steps:8}")
    private int maxSteps;

    @Value("${ai.execution.plan.dedup.enabled:true}")
    private boolean dedupEnabled;

    @Value("${ai.execution.plan.step-merge-threshold:0.75}")
    private double stepMergeThreshold;

    // ── Data Model ──────────────────────────────────────────────────────

    public static class ExecutionStep {
        public int stepId;
        public String action;                    // add | edit | delete | analyze | refactor
        public String scope;                    // code, menu_item, menu_tree, config, etc
        public String description;              // what will happen
        public String targetPath;               // file path or node ID (optional)
        public List<Integer> affectedLines;     // line range (code) or node hierarchy (menu)
        public String complexity;               // simple | moderate | complex
        public long estimatedMs;                // execution time estimate
        public Map<String, Object> metadata;    // step-specific data

        public ExecutionStep(int stepId, String action, String scope, String description) {
            this.stepId = stepId;
            this.action = action;
            this.scope = scope;
            this.description = description;
            this.affectedLines = new ArrayList<>();
            this.metadata = new LinkedHashMap<>();
            this.complexity = "moderate";
            this.estimatedMs = 100;
        }

        @Override
        public String toString() {
            return String.format("Step %d [%s %s]: %s", stepId, action, scope, description);
        }

        public boolean canMergeWith(ExecutionStep other) {
            if (other == null) return false;
            // Same scope and similar action → can merge
            if (!this.scope.equals(other.scope)) return false;
            // Adjacent or same target → can merge
            return this.targetPath == null ||
                   other.targetPath == null ||
                   this.targetPath.equals(other.targetPath);
        }
    }

    public static class ExecutionPlan {
        public List<ExecutionStep> steps;
        public String workspaceContext;         // code | menu
        public long totalEstimatedMs;
        public int deduplicationCount;          // how many steps were merged
        public String optimizationNotes;

        public ExecutionPlan() {
            this.steps = new ArrayList<>();
            this.deduplicationCount = 0;
        }

        public int getStepCount() {
            return steps.size();
        }

        public void updateTotalEstimate() {
            totalEstimatedMs = steps.stream()
                .mapToLong(s -> s.estimatedMs)
                .sum();
        }
    }

    // ── Public API ──────────────────────────────────────────────────────

    /**
     * Generate execution plan from user message and context.
     *
     * @param message User request
     * @param workspaceContext "code" or "menu"
     * @param currentContent Code/menu JSON
     * @param retrievedContext Related context from RAG
     * @return ExecutionPlan with optimized, deduplicated steps
     */
    public ExecutionPlan generatePlan(
        String message,
        String workspaceContext,
        String currentContent,
        String retrievedContext
    ) {
        if (!enabled) {
            return new ExecutionPlan();
        }

        log.debug("Generating execution plan for: {} (workspace={})", 
                message.substring(0, Math.min(80, message.length())), workspaceContext);

        // Parse initial steps from message + context
        List<ExecutionStep> initialSteps = parseStepsFromContext(message, workspaceContext, currentContent, retrievedContext);

        // Assign scope boundaries
        assignScopeBoundaries(initialSteps, currentContent, workspaceContext);

        // Deduplicate adjacent steps
        List<ExecutionStep> optimizedSteps = initialSteps;
        int dedupCount = 0;
        if (dedupEnabled) {
            optimizedSteps = dedupAdjacentSteps(initialSteps);
            dedupCount = initialSteps.size() - optimizedSteps.size();
        }

        // Cap at max steps
        if (optimizedSteps.size() > maxSteps) {
            optimizedSteps = optimizedSteps.subList(0, maxSteps);
            log.warn("Plan truncated to {} steps (max={})", maxSteps, maxSteps);
        }

        // Renumber
        for (int i = 0; i < optimizedSteps.size(); i++) {
            optimizedSteps.get(i).stepId = i + 1;
        }

        // Estimate execution times
        estimateExecutionTimes(optimizedSteps, workspaceContext);

        // Build result
        ExecutionPlan plan = new ExecutionPlan();
        plan.steps = optimizedSteps;
        plan.workspaceContext = workspaceContext;
        plan.deduplicationCount = dedupCount;
        plan.updateTotalEstimate();
        plan.optimizationNotes = String.format(
            "Deduplicated %d steps, estimated total execution: %dms",
            dedupCount, plan.totalEstimatedMs
        );

        log.info("Execution plan generated: {} steps, total_estimate={}ms", 
                plan.getStepCount(), plan.totalEstimatedMs);

        return plan;
    }

    /**
     * Parse steps from LLM output or structured context
     */
    private List<ExecutionStep> parseStepsFromContext(
        String message,
        String workspaceContext,
        String currentContent,
        String retrievedContext
    ) {
        List<ExecutionStep> steps = extractExplicitSteps(message, workspaceContext);
        if (!steps.isEmpty()) {
            return steps;
        }
        return synthesizeStepsFromIntent(message, workspaceContext, currentContent, retrievedContext);
    }

    private List<ExecutionStep> extractExplicitSteps(String message, String workspaceContext) {
        List<ExecutionStep> steps = new ArrayList<>();
        String safeMessage = String.valueOf(message == null ? "" : message);
        Pattern stepPattern = Pattern.compile("(?i)(?:step\\s*[0-9]+|[0-9]+\\.)\\s*([^\\n]+)");
        Matcher matcher = stepPattern.matcher(safeMessage);

        int stepId = 1;
        while (matcher.find() && steps.size() < maxSteps) {
            String description = matcher.group(1).trim();
            if (description.isEmpty()) {
                continue;
            }
            String action = inferStepAction(description);
            String scope = inferStepScope(description, workspaceContext);
            steps.add(new ExecutionStep(stepId++, action, scope, description));
        }
        return steps;
    }

    private List<ExecutionStep> synthesizeStepsFromIntent(
        String message,
        String workspaceContext,
        String currentContent,
        String retrievedContext
    ) {
        String safeMessage = String.valueOf(message == null ? "" : message).trim();
        String safeWorkspace = String.valueOf(workspaceContext == null ? "code" : workspaceContext).trim().toLowerCase(Locale.ROOT);
        String safeCurrentContent = String.valueOf(currentContent == null ? "" : currentContent);
        String safeRetrievedContext = String.valueOf(retrievedContext == null ? "" : retrievedContext).trim();
        boolean analyzeOnly = isAnalyzeIntent(safeMessage);
        boolean hasRetrievedContext = !safeRetrievedContext.isEmpty();
        String primaryTarget = inferPrimaryTarget(safeMessage, safeRetrievedContext, safeWorkspace, safeCurrentContent);

        List<ExecutionStep> steps = new ArrayList<>();
        int stepId = 1;
        if ("menu".equals(safeWorkspace)) {
            steps.add(new ExecutionStep(
                stepId++,
                analyzeOnly ? "analyze" : "inspect",
                "menu_tree",
                "Anchor on current menu tree and preserve parentId hierarchy before changing anything"
            ));
            if (hasRetrievedContext) {
                steps.add(new ExecutionStep(
                    stepId++,
                    "search",
                    "menu_context",
                    "Use scoped Lucene evidence to narrow the impacted menu area for " + primaryTarget
                ));
            }
            steps.add(new ExecutionStep(
                stepId++,
                analyzeOnly ? "analyze" : inferStepAction(safeMessage),
                "menu_item",
                (analyzeOnly
                    ? "Analyze the target menu nodes, tables, and triggers related to "
                    : "Prepare a non-destructive menu patch for ") + primaryTarget
            ));
            steps.add(new ExecutionStep(
                stepId++,
                "analyze",
                "menu_schema",
                "Validate menu contract: icon normalization, table schema, trigger keys, and untouched sibling nodes"
            ));
        } else {
            steps.add(new ExecutionStep(
                stepId++,
                analyzeOnly ? "analyze" : "inspect",
                "code",
                "Anchor on currentCode, nearby symbols, and the main execution surface for " + primaryTarget
            ));
            if (hasRetrievedContext) {
                steps.add(new ExecutionStep(
                    stepId++,
                    "search",
                    "context",
                    "Use scoped Lucene evidence to collect related implementations, business rules, and reuse candidates"
                ));
            }
            steps.add(new ExecutionStep(
                stepId++,
                analyzeOnly ? "analyze" : inferStepAction(safeMessage),
                inferStepScope(primaryTarget, "code"),
                (analyzeOnly
                    ? "Analyze the control flow, side effects, and state changes around "
                    : "Apply the required code change to ") + primaryTarget
            ));
            steps.add(new ExecutionStep(
                stepId++,
                analyzeOnly ? "analyze" : "refactor",
                "code",
                analyzeOnly
                    ? "Summarize evidence-backed findings step by step for the editor timeline"
                    : "Verify patch safety, minimize unrelated diffs, and prepare incremental edits for CodeMirror"
            ));
        }

        if (steps.size() < maxSteps) {
            steps.add(new ExecutionStep(
                stepId,
                "analyze",
                safeWorkspace,
                analyzeOnly
                    ? "Return the final evidence-backed conclusion without reopening broader scope"
                    : "Return incremental result batches and stop when all planned steps are complete"
            ));
        }
        return steps.stream().limit(maxSteps).collect(Collectors.toCollection(ArrayList::new));
    }

    private boolean isAnalyzeIntent(String message) {
        String safe = String.valueOf(message == null ? "" : message).toLowerCase(Locale.ROOT);
        return safe.contains("phân tích")
            || safe.contains("phan tich")
            || safe.contains("analyze")
            || safe.contains("explain")
            || safe.contains("review")
            || safe.contains("kiểm tra")
            || safe.contains("kiem tra");
    }

    private String inferPrimaryTarget(
        String message,
        String retrievedContext,
        String workspaceContext,
        String currentContent
    ) {
        String safeMessage = String.valueOf(message == null ? "" : message).trim();
        String safeRetrievedContext = String.valueOf(retrievedContext == null ? "" : retrievedContext);
        String safeCurrentContent = String.valueOf(currentContent == null ? "" : currentContent);
        String safeWorkspace = String.valueOf(workspaceContext == null ? "code" : workspaceContext).trim().toLowerCase(Locale.ROOT);

        Pattern quotedTarget = Pattern.compile("['\"]([^'\"]{3,80})['\"]");
        Matcher quotedMatcher = quotedTarget.matcher(safeMessage);
        if (quotedMatcher.find()) {
            return quotedMatcher.group(1).trim();
        }

        Pattern symbolPattern = "menu".equals(safeWorkspace)
            ? Pattern.compile("(?i)\\b(menu|table|trigger|report|icon|node|parentId|children|path|label)\\b")
            : Pattern.compile("(?i)\\b(class|method|function|api|service|controller|hook|component|query|state|effect)\\b");
        Matcher symbolMatcher = symbolPattern.matcher(safeMessage + "\n" + safeRetrievedContext);
        if (symbolMatcher.find()) {
            return symbolMatcher.group(1).trim();
        }

        Pattern identifierPattern = "menu".equals(safeWorkspace)
            ? Pattern.compile("(?i)\\b[a-z_][a-z0-9_]{2,}\\b")
            : Pattern.compile("\\b[A-Za-z_][A-Za-z0-9_]{2,}\\b");
        Matcher identifierMatcher = identifierPattern.matcher(safeMessage);
        while (identifierMatcher.find()) {
            String candidate = identifierMatcher.group().trim();
            String lower = candidate.toLowerCase(Locale.ROOT);
            if (Set.of("them", "sua", "xoa", "fix", "add", "edit", "delete", "menu", "code", "json", "step").contains(lower)) {
                continue;
            }
            return candidate;
        }

        if (!safeCurrentContent.isEmpty()) {
            Matcher contentMatcher = identifierPattern.matcher(safeCurrentContent);
            if (contentMatcher.find()) {
                return contentMatcher.group().trim();
            }
        }

        return "menu".equals(safeWorkspace) ? "current menu scope" : "current code scope";
    }

    /**
     * Assign scope boundaries (line ranges or node IDs) to each step
     */
    private void assignScopeBoundaries(
        List<ExecutionStep> steps,
        String currentContent,
        String workspaceContext
    ) {
        if (currentContent == null || currentContent.isEmpty()) {
            return;
        }

        if ("code".equals(workspaceContext)) {
            assignCodeScopeBoundaries(steps, currentContent);
        } else if ("menu".equals(workspaceContext)) {
            assignMenuScopeBoundaries(steps, currentContent);
        }
    }

    private void assignCodeScopeBoundaries(List<ExecutionStep> steps, String code) {
        String[] lines = code.split("\\n");

        for (ExecutionStep step : steps) {
            // Simple heuristic: extract keywords from description and find line ranges
            String[] keywords = step.description.split("\\s+");

            List<Integer> affectedLines = new ArrayList<>();
            for (int i = 0; i < lines.length; i++) {
                String line = lines[i].toLowerCase();
                for (String keyword : keywords) {
                    if (keyword.length() > 2 && line.contains(keyword.toLowerCase())) {
                        affectedLines.add(i + 1); // 1-indexed
                        break;
                    }
                }
            }

            // If no matches, assume processing whole file or specific range
            if (affectedLines.isEmpty()) {
                if (step.description.toLowerCase().contains("function") ||
                    step.description.toLowerCase().contains("method")) {
                    // Try to find all function definitions
                    for (int i = 0; i < lines.length; i++) {
                        if (lines[i].contains("function ") || lines[i].contains("public ") || lines[i].contains("private ")) {
                            affectedLines.add(i + 1);
                        }
                    }
                } else {
                    // Default: entire file
                    for (int i = 1; i <= Math.min(10, lines.length); i++) {
                        affectedLines.add(i);
                    }
                }
            }

            step.affectedLines = affectedLines;
            step.complexity = affectedLines.size() > 50 ? "complex" : (affectedLines.size() > 5 ? "moderate" : "simple");
        }
    }

    private void assignMenuScopeBoundaries(List<ExecutionStep> steps, String menuJson) {
        // Try to parse menu structure
        try {
            // Simple heuristic: extract node IDs from description
            for (ExecutionStep step : steps) {
                String desc = step.description.toLowerCase();
                
                // Look for menu-related keywords
                if (desc.contains("root") || desc.contains("parent")) {
                    step.targetPath = "root";
                } else if (desc.contains("child")) {
                    step.targetPath = "children";
                } else {
                    step.targetPath = "items";
                }

                step.complexity = "moderate";
            }
        } catch (Exception e) {
            log.debug("Failed to assign menu scope boundaries: {}", e.getMessage());
        }
    }

    /**
     * Deduplicate adjacent steps with same or overlapping scope
     */
    private List<ExecutionStep> dedupAdjacentSteps(List<ExecutionStep> steps) {
        if (steps.isEmpty()) {
            return steps;
        }

        List<ExecutionStep> deduped = new ArrayList<>();
        ExecutionStep current = steps.get(0);

        for (int i = 1; i < steps.size(); i++) {
            ExecutionStep next = steps.get(i);

            // Check if mergeable
            if (current.canMergeWith(next)) {
                // Merge: combine descriptions
                current.description += " + " + next.description;
                current.affectedLines.addAll(next.affectedLines);
                // Skip next
            } else {
                deduped.add(current);
                current = next;
            }
        }
        deduped.add(current);

        return deduped;
    }

    /**
     * Estimate execution time for each step
     */
    private void estimateExecutionTimes(List<ExecutionStep> steps, String workspaceContext) {
        for (ExecutionStep step : steps) {
            long baseMs = 50;

            if ("complex".equals(step.complexity)) {
                baseMs = 500;
            } else if ("moderate".equals(step.complexity)) {
                baseMs = 200;
            }

            if (step.affectedLines.size() > 50) {
                baseMs *= 2;
            }

            step.estimatedMs = baseMs;
        }
    }

    // ── Inference Methods ──────────────────────────────────────────────────

    private String inferStepAction(String description) {
        String desc = description.toLowerCase();

        if (desc.contains("thêm") || desc.contains("add") || desc.contains("create")) {
            return "add";
        } else if (desc.contains("xóa") || desc.contains("delete") || desc.contains("remove")) {
            return "delete";
        } else if (desc.contains("sửa") || desc.contains("edit") || desc.contains("modify") || desc.contains("fix")) {
            return "edit";
        } else if (desc.contains("tối ưu") || desc.contains("refactor") || desc.contains("optimize")) {
            return "refactor";
        } else if (desc.contains("phân tích") || desc.contains("analyze")) {
            return "analyze";
        }

        return "process";
    }

    private String inferStepScope(String description, String workspaceContext) {
        String desc = description.toLowerCase();

        if ("code".equals(workspaceContext)) {
            if (desc.contains("function") || desc.contains("method") || desc.contains("hàm")) {
                return "function";
            } else if (desc.contains("class") || desc.contains("interface")) {
                return "class";
            } else if (desc.contains("import") || desc.contains("package")) {
                return "imports";
            } else if (desc.contains("loop") || desc.contains("vòng lặp")) {
                return "loop";
            }
            return "code";
        } else if ("menu".equals(workspaceContext)) {
            if (desc.contains("root") || desc.contains("tree")) {
                return "menu_tree";
            } else if (desc.contains("item") || desc.contains("mục")) {
                return "menu_item";
            } else if (desc.contains("group") || desc.contains("folder")) {
                return "menu_group";
            }
            return "menu_item";
        }

        return "general";
    }

    /**
     * Validate plan against current content
     */
    public boolean validatePlan(ExecutionPlan plan, String currentContent) {
        if (plan.steps.isEmpty()) {
            return true;
        }

        // Check if all affected lines exist in current content
        if (currentContent == null) {
            return false;
        }

        String[] lines = currentContent.split("\\n");
        int maxLine = lines.length;

        for (ExecutionStep step : plan.steps) {
            for (int lineNo : step.affectedLines) {
                if (lineNo < 1 || lineNo > maxLine) {
                    log.warn("Step {} references invalid line: {}", step.stepId, lineNo);
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Convert plan to step descriptions for user display
     */
    public List<String> getPlanDescriptions(ExecutionPlan plan) {
        return plan.steps.stream()
            .map(step -> String.format("Step %d [%s %s]: %s", 
                    step.stepId, step.action, step.scope, step.description))
            .collect(Collectors.toList());
    }
}
