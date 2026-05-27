package net.phanmemmottrieu.service;

import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Maps a local AI request into the 6-component agent harness (R/M/C/S/O/G)
 * and the three system bottlenecks: context governance, trustworthy memory, skill routing.
 *
 * Telemetry-only — never blocks the main SSE path.
 */
@Service
public class AiAgentHarnessTraceService {

    public Map<String, Object> buildHarnessTrace(
            String requestId,
            Map<String, Object> codeStreamMeta,
            AiLocalOrchestrationService.OrchestrationResult orchestration,
            Map<String, Object> finalOutputGateMeta,
            String responseMode,
            String contextType,
            String model,
            int appliedTextEditCount) {
        Map<String, Object> meta = codeStreamMeta == null ? Map.of() : codeStreamMeta;
        Map<String, Object> gate = finalOutputGateMeta == null ? Map.of() : finalOutputGateMeta;
        Map<String, Object> toolStats = orchestration != null && orchestration.toolStats != null
            ? orchestration.toolStats
            : Map.of();

        int promptOriginal = parseInt(meta.get("promptOriginalChars"));
        int promptFinal = parseInt(meta.get("promptFinalChars"));
        int scopedRagChars = parseInt(toolStats.get("scopedRagChars"));
        int retrievalRelevance = parseInt(toolStats.get("retrievalPolicyRelevance"));
        int memoryTrustScore = computeMemoryTrustScore(scopedRagChars, retrievalRelevance, toolStats);
        boolean memoryTrusted = memoryTrustScore >= 55 || scopedRagChars <= 0;

        String dispatchedSkill = resolveDispatchedSkill(meta, responseMode, contextType);
        boolean skillVerified = appliedTextEditCount > 0
            || bool(meta.get("editDeterministicLifecyclePatchApplied"))
            || bool(meta.get("deterministicLifecyclePatchApplied"))
            || bool(gate.get("passed"))
            || "analyze".equalsIgnoreCase(String.valueOf(responseMode));

        boolean gatePassed = bool(gate.get("passed"), true);
        String gateReason = str(gate.get("reasonCode"));

        Map<String, Object> contextGovernance = new LinkedHashMap<>();
        contextGovernance.put("selectedPromptChars", promptFinal);
        contextGovernance.put("editorChars", parseInt(meta.get("promptOriginalChars")));
        contextGovernance.put("compressionRatio", promptOriginal > 0
            ? Math.round(1000.0 * promptFinal / promptOriginal) / 1000.0
            : 1.0);
        contextGovernance.put("regionPlanApplied", bool(meta.get("largeCodeRegionPlanApplied")));
        contextGovernance.put("focusedContextApplied", bool(meta.get("focusedContextApplied")));
        contextGovernance.put("traceRequestId", String.valueOf(requestId == null ? "" : requestId));

        Map<String, Object> trustworthyMemory = new LinkedHashMap<>();
        trustworthyMemory.put("scopedRagChars", scopedRagChars);
        trustworthyMemory.put("retrievalPolicyId", str(toolStats.get("retrievalPolicy")));
        trustworthyMemory.put("retrievalRelevance", retrievalRelevance);
        trustworthyMemory.put("trustScore", memoryTrustScore);
        trustworthyMemory.put("trusted", memoryTrusted);
        trustworthyMemory.put("aclFilterEnabled", bool(toolStats.get("retrievalAuthFilterEnabled")));

        Map<String, Object> skillRouting = new LinkedHashMap<>();
        skillRouting.put("dispatchedSkill", dispatchedSkill);
        skillRouting.put("verified", skillVerified);
        skillRouting.put("appliedTextEdits", Math.max(0, appliedTextEditCount));
        skillRouting.put("lifecycleDeterministic", bool(meta.get("editDeterministicLifecyclePatchApplied"))
            || bool(meta.get("deterministicLifecyclePatchApplied")));

        Map<String, Object> harness = new LinkedHashMap<>();
        harness.put("memory", mapOf(
            "status", memoryTrusted ? "trusted" : "low_confidence",
            "detail", memoryTrusted
                ? "RAG/ACL recall trusted for this turn"
                : "Low RAG confidence — model relied on slice/planner context"));
        harness.put("context", mapOf(
            "status", promptFinal < promptOriginal ? "compacted" : "full_slice",
            "detail", String.format(Locale.ROOT, "%d → %d prompt chars", promptOriginal, promptFinal)));
        harness.put("reasoning", mapOf(
            "status", "local",
            "model", str(model),
            "tier", str(meta.get("runtimeTier"))));
        harness.put("skills", mapOf(
            "status", skillVerified ? "verified" : "pending",
            "skill", dispatchedSkill));
        harness.put("orchestration", mapOf(
            "status", orchestration != null && orchestration.enabled ? "active" : "lightweight",
            "planSteps", parseInt(meta.get("planStepCount"))));
        harness.put("governance", mapOf(
            "status", gatePassed ? "passed" : "rejected",
            "reasonCode", gateReason.isBlank() ? (gatePassed ? "ok" : "unknown") : gateReason));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", "1");
        out.put("requestId", requestId);
        out.put("bottlenecks", mapOf(
            "contextGovernance", contextGovernance,
            "trustworthyMemory", trustworthyMemory,
            "skillRouting", skillRouting));
        out.put("harness", harness);
        out.put("summaryVi", buildSummaryVi(contextGovernance, trustworthyMemory, skillRouting, harness, gatePassed));
        out.put("summaryEn", buildSummaryEn(contextGovernance, trustworthyMemory, skillRouting, harness, gatePassed));
        return out;
    }

    private static String resolveDispatchedSkill(Map<String, Object> meta, String responseMode, String contextType) {
        if (bool(meta.get("editDeterministicLifecyclePatchApplied"))
                || bool(meta.get("deterministicLifecyclePatchApplied"))) {
            return "deterministic_lifecycle_webview";
        }
        if (bool(meta.get("editFocusedEarlyExit"))) {
            return "focused_large_code_edit";
        }
        if (parseInt(meta.get("editDeterministicLifecycleTextEdits")) > 0) {
            return "lifecycle_pipeline";
        }
        if ("analyze".equalsIgnoreCase(String.valueOf(responseMode))) {
            return "local_analyze";
        }
        if ("menu_json".equalsIgnoreCase(String.valueOf(contextType))) {
            return "menu_json_edit";
        }
        if ("edit".equalsIgnoreCase(String.valueOf(responseMode))) {
            return "code_text_edits";
        }
        return "general_local";
    }

    private static int computeMemoryTrustScore(int scopedRagChars, int retrievalRelevance, Map<String, Object> toolStats) {
        if (scopedRagChars <= 0) {
            return 70;
        }
        int base = Math.min(100, 40 + scopedRagChars / 80);
        if (retrievalRelevance > 0) {
            base = Math.min(100, (base + retrievalRelevance) / 2);
        }
        if (bool(toolStats.get("retrievalAuthFilterEnabled"))) {
            base = Math.min(100, base + 8);
        }
        String policy = str(toolStats.get("retrievalPolicy"));
        if (policy.contains("symbol") || policy.contains("focused")) {
            base = Math.min(100, base + 5);
        }
        return Math.max(0, Math.min(100, base));
    }

    private static String buildSummaryVi(
            Map<String, Object> contextGovernance,
            Map<String, Object> trustworthyMemory,
            Map<String, Object> skillRouting,
            Map<String, Object> harness,
            boolean gatePassed) {
        return String.format(Locale.ROOT,
            "Ngữ cảnh: %s/%s ký tự · Memory trust %d%% · Skill: %s · Governance: %s",
            contextGovernance.get("selectedPromptChars"),
            contextGovernance.get("editorChars"),
            trustworthyMemory.get("trustScore"),
            skillRouting.get("dispatchedSkill"),
            gatePassed ? "đạt" : "từ chối");
    }

    private static String buildSummaryEn(
            Map<String, Object> contextGovernance,
            Map<String, Object> trustworthyMemory,
            Map<String, Object> skillRouting,
            Map<String, Object> harness,
            boolean gatePassed) {
        return String.format(Locale.ROOT,
            "Context: %s/%s chars · Memory trust %d%% · Skill: %s · Governance: %s",
            contextGovernance.get("selectedPromptChars"),
            contextGovernance.get("editorChars"),
            trustworthyMemory.get("trustScore"),
            skillRouting.get("dispatchedSkill"),
            gatePassed ? "passed" : "rejected");
    }

    private static int parseInt(Object value) {
        if (value == null) {
            return 0;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (Exception ignored) {
            return 0;
        }
    }

    private static boolean bool(Object value) {
        return bool(value, false);
    }

    private static boolean bool(Object value, boolean defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Boolean b) {
            return b;
        }
        String s = String.valueOf(value).trim().toLowerCase(Locale.ROOT);
        if ("true".equals(s) || "1".equals(s) || "yes".equals(s)) {
            return true;
        }
        if ("false".equals(s) || "0".equals(s) || "no".equals(s)) {
            return false;
        }
        return defaultValue;
    }

    private static String str(Object value) {
        return String.valueOf(value == null ? "" : value).trim();
    }

    @SafeVarargs
    private static Map<String, Object> mapOf(Object... kv) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            map.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return map;
    }
}
