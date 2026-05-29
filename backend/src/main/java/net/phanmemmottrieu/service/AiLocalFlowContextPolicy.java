package net.phanmemmottrieu.service;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Flow-aware context + RAG presets for AI Local (analyze/edit × menu/code).
 * Replaces ad-hoc boosts with explicit per-flow budgets aligned to weak-5gb slot caps.
 */
@Component
public class AiLocalFlowContextPolicy {

    public enum FlowKind {
        ANALYZE_MENU,
        EDIT_MENU,
        ANALYZE_CODE,
        EDIT_CODE,
        QUICK
    }

    public record RagFlowPreset(
        FlowKind flow,
        int scopeMask,
        int topK,
        int maxChars,
        boolean ragEnabled,
        String label) {
    }

    public record ContextWindowFit(
        FlowKind flow,
        int suggestedContextTokens,
        int maxPromptCharsHint,
        String note) {
    }

    private static final int SCOPE_MENU = AiMultimodalScannerService.SCOPE_MENU;
    private static final int SCOPE_CODE = AiMultimodalScannerService.SCOPE_CODE;
    private static final int SCOPE_JSON = AiMultimodalScannerService.SCOPE_JSON_SCHEMA;
    private static final int SCOPE_BUSINESS = AiMultimodalScannerService.SCOPE_BUSINESS;
    private static final int SCOPE_UI = AiMultimodalScannerService.SCOPE_UI_UX;

    public FlowKind resolveFlow(String contextType, String responseMode, String taskType) {
        String ctx = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase(Locale.ROOT);
        String mode = String.valueOf(responseMode == null ? "" : responseMode).trim().toLowerCase(Locale.ROOT);
        String task = String.valueOf(taskType == null ? "" : taskType).trim().toLowerCase(Locale.ROOT);
        boolean menu = "menu_json".equals(ctx) || task.contains("menu");
        boolean analyze = "analyze".equals(mode) || task.contains("qa") || task.contains("_qa");
        if (menu) {
            return analyze ? FlowKind.ANALYZE_MENU : FlowKind.EDIT_MENU;
        }
        if ("code".equals(ctx) || task.contains("code")) {
            return analyze ? FlowKind.ANALYZE_CODE : FlowKind.EDIT_CODE;
        }
        return FlowKind.QUICK;
    }

    public RagFlowPreset ragPreset(FlowKind flow, boolean weakProfile) {
        return switch (flow) {
            case ANALYZE_MENU -> new RagFlowPreset(
                flow,
                SCOPE_MENU | SCOPE_JSON | SCOPE_BUSINESS,
                weakProfile ? 4 : 5,
                weakProfile ? 3200 : 4500,
                true,
                "analyze_menu: business + live menu patterns");
            case EDIT_MENU -> new RagFlowPreset(
                flow,
                SCOPE_MENU | SCOPE_JSON | SCOPE_UI,
                weakProfile ? 3 : 4,
                weakProfile ? 2800 : 3600,
                true,
                "edit_menu: schema + trigger patterns");
            case ANALYZE_CODE -> new RagFlowPreset(
                flow,
                SCOPE_CODE | SCOPE_BUSINESS,
                weakProfile ? 3 : 5,
                weakProfile ? 2600 : 4000,
                !weakProfile,
                weakProfile ? "analyze_code_weak: editor slice only" : "analyze_code: symbols + business");
            case EDIT_CODE -> new RagFlowPreset(
                flow,
                SCOPE_CODE | SCOPE_UI,
                weakProfile ? 2 : 4,
                weakProfile ? 0 : 2800,
                !weakProfile,
                weakProfile ? "edit_code_weak: no RAG — region plan only" : "edit_code: symbol retrieval");
            case QUICK -> new RagFlowPreset(
                flow,
                SCOPE_BUSINESS,
                weakProfile ? 2 : 3,
                weakProfile ? 1200 : 2000,
                true,
                "quick: direct answer");
        };
    }

    public RagFlowPreset ragPreset(String contextType, String responseMode, String taskType, boolean weakProfile) {
        return ragPreset(resolveFlow(contextType, responseMode, taskType), weakProfile);
    }

    public ContextWindowFit contextWindowFit(
            FlowKind flow,
            int configuredMaxPromptChars,
            int configuredMaxTokens,
            boolean weakProfile) {
        int promptChars = Math.max(4000, configuredMaxPromptChars);
        int maxTokens = Math.max(256, configuredMaxTokens);
        int promptTokens = Math.max(1024, (promptChars + 3) / 4);
        int margin = weakProfile ? 384 : 512;
        int suggested = promptTokens + maxTokens + margin;
        suggested = roundUpTokens(suggested, 512);
        suggested = Math.max(2048, Math.min(suggested, weakProfile ? 8192 : 16384));
        String note = switch (flow) {
            case ANALYZE_MENU -> "menu analyze: Comprehend scan + compact RAG";
            case EDIT_MENU -> "menu edit: editor + trigger RAG";
            case ANALYZE_CODE -> "code analyze: condensed slice + optional RAG";
            case EDIT_CODE -> "code edit: region plan priority";
            case QUICK -> "quick: minimal ctx";
        };
        return new ContextWindowFit(flow, suggested, promptChars, note);
    }

    public int mergeScopeMask(int aggregateMask, int presetMask) {
        if (presetMask <= 0) {
            return Math.max(0, aggregateMask);
        }
        if (aggregateMask <= 0) {
            return presetMask;
        }
        return aggregateMask | presetMask;
    }

    public List<String> presetReasonTags(FlowKind flow) {
        List<String> tags = new ArrayList<>();
        tags.add("flow_preset_" + flow.name().toLowerCase(Locale.ROOT));
        return tags;
    }

    private static int roundUpTokens(int value, int step) {
        int safeStep = Math.max(256, step);
        return ((Math.max(safeStep, value) + safeStep - 1) / safeStep) * safeStep;
    }
}
