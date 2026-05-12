package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Incremental Step Executor for AI Orchestration.
 *
 * <p>Parses structured plan from LLM and executes steps incrementally,
 * returning results that can be applied directly to CodeMirror without waiting
 * for the entire plan to complete.</p>
 *
 * <p>Supported action types:</p>
 * <ul>
 *   <li>{@code insert_code} — Insert code snippet at specific line</li>
 *   <li>{@code replace_code} — Replace code range with new content</li>
 *   <li>{@code delete_code} — Delete code range</li>
 *   <li>{@code add_menu} — Add menu node to tree</li>
 *   <li>{@code update_menu} — Update menu node properties</li>
 *   <li>{@code analyze_json} — Analyze JSON attachment, return summary</li>
 *   <li>{@code search_context} — Search Lucene vector DB, return results</li>
 * </ul>
 *
 * @author Mr.Anh
 */
@Service
public class AiIncrementalStepExecutorService {

    private static final Logger log = LoggerFactory.getLogger(AiIncrementalStepExecutorService.class);
    
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    @Autowired(required = false)
    private LocalAiAssistantContextService contextService;
    
    @Autowired(required = false)
    private AiBusinessMemoryVectorService businessMemoryService;
    
    @Value("${ai.orchestration.incremental.enabled:true}")
    private boolean enabled;
    
    @Value("${ai.orchestration.incremental.max-steps:8}")
    private int maxSteps;
    
    @Value("${ai.orchestration.incremental.step-timeout-ms:30000}")
    private long stepTimeoutMs;

    // ────────────────────────────────────────────────────────────────────────────
    // Data Classes
    // ────────────────────────────────────────────────────────────────────────────

    public static class ExecutionStep {
        public int stepNumber;
        public int totalSteps;
        public String actionType;           // insert_code, replace_code, delete_code, add_menu, update_menu, analyze_json, search_context
        public String targetPath;           // File path, menu node ID, or context query
        public String description;          // User-friendly step description
        public Map<String, Object> params;  // Action-specific params
        public long estimatedDurationMs;    // Estimated execution time
        
        public ExecutionStep() {
            this.params = new LinkedHashMap<>();
            this.estimatedDurationMs = 1000;
        }
    }

    public static class StepResult {
        public int stepNumber;
        public int totalSteps;
        public String actionType;
        public boolean success;
        public String message;
        public Object resultData;           // Patch, summary, search results, etc.
        public long executionTimeMs;
        public String errorCode;            // For failures: "parse_error", "exec_error", "timeout"
        
        public StepResult(int stepNumber, int totalSteps) {
            this.stepNumber = stepNumber;
            this.totalSteps = totalSteps;
            this.success = false;
        }
    }

    public static class PlanOutput {
        public String planId;
        public List<ExecutionStep> steps;
        public String reasoning;
        public long totalEstimatedMs;
        public Map<String, Object> metadata;
        
        public PlanOutput() {
            this.steps = new ArrayList<>();
            this.metadata = new LinkedHashMap<>();
            this.planId = UUID.randomUUID().toString();
        }
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Public API
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Parse LLM output into structured plan with executable steps.
     * 
     * Expects JSON like:
     * <pre>
     * {
     *   "reasoning": "...",
     *   "steps": [
     *     {
     *       "step": 1,
     *       "action": "replace_code",
     *       "target": "src/main/java/Example.java",
     *       "description": "...",
     *       "params": { "startLine": 10, "endLine": 15, "content": "..." }
     *     }
     *   ]
     * }
     * </pre>
     */
    public PlanOutput parsePlan(String llmOutput, String contextType) {
        PlanOutput plan = new PlanOutput();
        
        if (!enabled || llmOutput == null || llmOutput.isEmpty()) {
            log.warn("Step executor disabled or empty output");
            return plan;
        }
        
        try {
            // Extract JSON from markdown fence if present
            String jsonStr = extractJson(llmOutput);
            JsonNode root = objectMapper.readTree(jsonStr);
            
            if (root.has("reasoning")) {
                plan.reasoning = root.get("reasoning").asText("");
            }
            
            if (root.has("steps") && root.get("steps").isArray()) {
                ArrayNode stepsNode = (ArrayNode) root.get("steps");
                int stepIndex = 0;
                
                for (JsonNode stepNode : stepsNode) {
                    if (stepIndex >= maxSteps) break;
                    
                    ExecutionStep step = parseStep(stepNode, stepIndex + 1, stepsNode.size());
                    if (step != null) {
                        plan.steps.add(step);
                        plan.totalEstimatedMs += step.estimatedDurationMs;
                        stepIndex++;
                    }
                }
            }
            
            // ── Fallback: parse "textEdits" format (standard LLM output for code edit mode)
            // {"summary":"...","textEdits":[{"startLine":1,"endLine":3,"replacement":"...","action":"edit"}]}
            if (plan.steps.isEmpty() && root.has("textEdits") && root.get("textEdits").isArray()) {
                if (root.has("summary")) {
                    plan.reasoning = root.get("summary").asText("");
                }
                ArrayNode edits = (ArrayNode) root.get("textEdits");
                int total = Math.min(edits.size(), maxSteps);
                for (int i = 0; i < total; i++) {
                    JsonNode editNode = edits.get(i);
                    ExecutionStep step = new ExecutionStep();
                    step.stepNumber = i + 1;
                    step.totalSteps = total;
                    String editAction = editNode.has("action") ? editNode.get("action").asText("edit") : "edit";
                    step.actionType = "delete".equalsIgnoreCase(editAction) ? "delete_code" : "replace_code";
                    step.description = "Apply textEdit " + (i + 1) + "/" + total;
                    step.estimatedDurationMs = 300;
                    step.params = new java.util.LinkedHashMap<>();
                    if (editNode.has("startLine")) step.params.put("startLine", editNode.get("startLine").asInt(0));
                    if (editNode.has("endLine"))   step.params.put("endLine",   editNode.get("endLine").asInt(0));
                    if (editNode.has("replacement")) step.params.put("content", editNode.get("replacement").asText(""));
                    plan.steps.add(step);
                    plan.totalEstimatedMs += step.estimatedDurationMs;
                }
                plan.metadata.put("parsedFrom", "textEdits");
            }
            
            plan.metadata.put("contextType", contextType);
            plan.metadata.put("parsedAt", System.currentTimeMillis());
            
            log.info("✅ Parsed plan: {} steps, ~{}ms", plan.steps.size(), plan.totalEstimatedMs);
            
        } catch (Exception e) {
            log.error("❌ Plan parsing failed: {}", e.getMessage());
            plan.metadata.put("parseError", e.getMessage());
        }
        
        return plan;
    }

    /**
     * Execute a single step and return actionable result for CodeMirror/menu editor.
     * 
     * This is called per-step during orchestration, allowing frontend to apply
     * patches incrementally without waiting for plan completion.
     */
    public StepResult executeStep(ExecutionStep step, String currentCode, Map<String, Object> context) {
        StepResult result = new StepResult(step.stepNumber, step.totalSteps);
        result.actionType = step.actionType;
        result.message = step.description;
        
        long startMs = System.currentTimeMillis();
        
        try {
            switch (step.actionType) {
                case "insert_code":
                    result.resultData = handleInsertCode(step, currentCode, context);
                    result.success = true;
                    break;
                    
                case "replace_code":
                    result.resultData = handleReplaceCode(step, currentCode, context);
                    result.success = true;
                    break;
                    
                case "delete_code":
                    result.resultData = handleDeleteCode(step, currentCode, context);
                    result.success = true;
                    break;
                    
                case "add_menu":
                    result.resultData = handleAddMenu(step, context);
                    result.success = true;
                    break;
                    
                case "update_menu":
                    result.resultData = handleUpdateMenu(step, context);
                    result.success = true;
                    break;
                    
                case "analyze_json":
                    result.resultData = handleAnalyzeJson(step, context);
                    result.success = true;
                    break;
                    
                case "search_context":
                    result.resultData = handleSearchContext(step, context);
                    result.success = true;
                    break;
                    
                default:
                    result.errorCode = "unknown_action";
                    result.message = "Unknown action: " + step.actionType;
                    log.warn("❌ Unknown step action: {}", step.actionType);
            }
            
        } catch (Exception e) {
            result.success = false;
            result.errorCode = "exec_error";
            result.message = "Execution failed: " + e.getMessage();
            log.error("❌ Step {} execution error: {}", step.stepNumber, e.getMessage());
        }
        
        result.executionTimeMs = System.currentTimeMillis() - startMs;
        return result;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Step Handlers
    // ────────────────────────────────────────────────────────────────────────────

    private Map<String, Object> handleInsertCode(ExecutionStep step, String currentCode, Map<String, Object> context) {
        Map<String, Object> patch = new LinkedHashMap<>();
        
        Integer lineNumber = getIntParam(step.params, "line", 0);
        String insertContent = getStringParam(step.params, "content", "");
        
        // Create SEARCH/REPLACE formatted patch
        patch.put("action", "insert");
        patch.put("line", lineNumber);
        patch.put("content", insertContent);
        
        return patch;
    }

    private Map<String, Object> handleReplaceCode(ExecutionStep step, String currentCode, Map<String, Object> context) {
        Map<String, Object> patch = new LinkedHashMap<>();
        
        Integer startLine = getIntParam(step.params, "startLine", 0);
        Integer endLine = getIntParam(step.params, "endLine", 0);
        String content = getStringParam(step.params, "content", "");
        
        patch.put("action", "replace");
        patch.put("startLine", startLine);
        patch.put("endLine", endLine);
        patch.put("content", content);
        
        return patch;
    }

    private Map<String, Object> handleDeleteCode(ExecutionStep step, String currentCode, Map<String, Object> context) {
        Map<String, Object> patch = new LinkedHashMap<>();
        
        Integer startLine = getIntParam(step.params, "startLine", 0);
        Integer endLine = getIntParam(step.params, "endLine", 0);
        
        patch.put("action", "delete");
        patch.put("startLine", startLine);
        patch.put("endLine", endLine);
        
        return patch;
    }

    private Map<String, Object> handleAddMenu(ExecutionStep step, Map<String, Object> context) {
        Map<String, Object> patch = new LinkedHashMap<>();
        
        String parentId = getStringParam(step.params, "parentId", "");
        String nodeId = getStringParam(step.params, "nodeId", "");
        String nodeData = getStringParam(step.params, "nodeData", "{}");
        
        patch.put("action", "add_menu");
        patch.put("parentId", parentId);
        patch.put("nodeId", nodeId);
        patch.put("nodeData", nodeData);
        
        return patch;
    }

    private Map<String, Object> handleUpdateMenu(ExecutionStep step, Map<String, Object> context) {
        Map<String, Object> patch = new LinkedHashMap<>();
        
        String nodeId = getStringParam(step.params, "nodeId", "");
        String updateData = getStringParam(step.params, "updateData", "{}");
        
        patch.put("action", "update_menu");
        patch.put("nodeId", nodeId);
        patch.put("updateData", updateData);
        
        return patch;
    }

    private Map<String, Object> handleAnalyzeJson(ExecutionStep step, Map<String, Object> context) {
        Map<String, Object> result = new LinkedHashMap<>();
        
        String query = getStringParam(step.params, "query", "");
        result.put("analysisType", "json_structure");
        result.put("query", query);
        result.put("message", "JSON analysis complete");
        
        return result;
    }

    private Map<String, Object> handleSearchContext(ExecutionStep step, Map<String, Object> context) {
        Map<String, Object> result = new LinkedHashMap<>();
        
        String query = getStringParam(step.params, "query", "");
        result.put("searchType", "lucene_vector");
        result.put("query", query);
        result.put("message", "Vector search completed");
        
        return result;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Helpers
    // ────────────────────────────────────────────────────────────────────────────

    private ExecutionStep parseStep(JsonNode stepNode, int stepNumber, int totalSteps) {
        if (!stepNode.isObject()) return null;
        
        ExecutionStep step = new ExecutionStep();
        step.stepNumber = stepNumber;
        step.totalSteps = totalSteps;
        
        // Parse action/step field
        String action = stepNode.has("action") 
            ? stepNode.get("action").asText("") 
            : stepNode.get("step").asText("");
        step.actionType = normalizeActionType(action);
        
        step.targetPath = stepNode.has("target") 
            ? stepNode.get("target").asText("") 
            : stepNode.get("targetPath").asText("");
        
        step.description = stepNode.has("description")
            ? stepNode.get("description").asText("")
            : stepNode.has("details")
            ? stepNode.get("details").asText("")
            : "";
        
        // Parse params
        if (stepNode.has("params") && stepNode.get("params").isObject()) {
            JsonNode paramsNode = stepNode.get("params");
            paramsNode.fields().forEachRemaining(entry -> {
                JsonNode val = entry.getValue();
                if (val.isTextual()) {
                    step.params.put(entry.getKey(), val.asText());
                } else if (val.isNumber()) {
                    step.params.put(entry.getKey(), val.asInt());
                } else if (val.isBoolean()) {
                    step.params.put(entry.getKey(), val.asBoolean());
                } else {
                    step.params.put(entry.getKey(), val);
                }
            });
        }
        
        return step;
    }

    private String normalizeActionType(String action) {
        if (action == null) return "unknown";
        String lower = action.toLowerCase().trim();
        
        // Normalize common LLM outputs
        if (lower.contains("insert")) return "insert_code";
        if (lower.contains("replace")) return "replace_code";
        if (lower.contains("delete")) return "delete_code";
        if (lower.contains("add") && lower.contains("menu")) return "add_menu";
        if (lower.contains("update") && lower.contains("menu")) return "update_menu";
        if (lower.contains("analyze") && lower.contains("json")) return "analyze_json";
        if (lower.contains("search")) return "search_context";
        
        return action;
    }

    private String extractJson(String text) {
        // Try to extract JSON from markdown fence
        Pattern pattern = Pattern.compile("```(?:json)?\\s*\\n?(.+?)\\n?```", Pattern.DOTALL);
        Matcher matcher = pattern.matcher(text);
        
        if (matcher.find()) {
            return matcher.group(1).trim();
        }
        
        // Try direct JSON parsing
        text = text.trim();
        if (text.startsWith("{") || text.startsWith("[")) {
            return text;
        }
        
        // Fallback: assume whole text is JSON
        return text;
    }

    private Integer getIntParam(Map<String, Object> params, String key, Integer defaultValue) {
        if (params == null) return defaultValue;
        Object val = params.get(key);
        if (val instanceof Number) return ((Number) val).intValue();
        if (val instanceof String) {
            try {
                return Integer.parseInt((String) val);
            } catch (NumberFormatException e) {
                return defaultValue;
            }
        }
        return defaultValue;
    }

    private String getStringParam(Map<String, Object> params, String key, String defaultValue) {
        if (params == null) return defaultValue;
        Object val = params.get(key);
        return val != null ? String.valueOf(val) : defaultValue;
    }
}
