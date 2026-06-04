package net.phanmemmottrieu.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Central runtime tier for AI local on constrained servers.
 * Production server: balanced-8gb (8GB RAM, 4 CPU, 7B). weak-local profile uses CONSTRAINED.
 */
@Service
public class AiLocalRuntimeTierService {

    public enum Tier {
        STRONG,
        BALANCED,
        /** weak-local / fast profile — small heap, skip heavy orchestration loops */
        CONSTRAINED
    }

    @Value("${ai.local.runtime.tier:auto}")
    private String configuredTier;

    @Value("${ai.local.runtime.weak-profile.enabled:true}")
    private boolean weakProfileDetectionEnabled;

    @Value("${ai.local.runtime.weak-profile.cores-threshold:2}")
    private int weakCoresThreshold;

    @Value("${ai.local.runtime.weak-profile.heap-gb-threshold:3}")
    private int weakHeapGbThreshold;

    @Value("${ai.local.runtime.constrained.skip-orchestration-refine:true}")
    private boolean skipOrchestrationRefineOnConstrained;

    @Value("${ai.local.runtime.constrained.skip-orchestration-dag-replan:true}")
    private boolean skipOrchestrationDagReplanOnConstrained;

    @Value("${ai.local.runtime.constrained.skip-intent-second-pass:true}")
    private boolean skipIntentSecondPassOnConstrained;

    @Value("${ai.local.runtime.constrained.single-orchestration-pass:true}")
    private boolean singleOrchestrationPassOnConstrained;

    public Tier resolveTier() {
        String configured = String.valueOf(configuredTier == null ? "auto" : configuredTier)
            .trim()
            .toLowerCase(Locale.ROOT);
        return switch (configured) {
            case "strong", "max" -> Tier.STRONG;
            case "balanced", "balanced-8gb", "8gb", "standard" -> Tier.BALANCED;
            case "weak", "constrained", "weak-local", "fast" -> Tier.CONSTRAINED;
            default -> detectConstrainedMachine() ? Tier.CONSTRAINED : Tier.BALANCED;
        };
    }

    public boolean isWeakMachine() {
        return resolveTier() == Tier.CONSTRAINED;
    }

    public boolean detectConstrainedMachine() {
        if (!weakProfileDetectionEnabled) {
            return false;
        }
        int cores = Math.max(1, Runtime.getRuntime().availableProcessors());
        long heapGb = Math.max(1L, Runtime.getRuntime().maxMemory() / (1024L * 1024L * 1024L));
        return cores <= Math.max(1, weakCoresThreshold)
            && heapGb <= Math.max(2, weakHeapGbThreshold);
    }

    public boolean shouldSkipOrchestrationRefine() {
        return isWeakMachine() && skipOrchestrationRefineOnConstrained;
    }

    public boolean shouldSkipOrchestrationDagReplan() {
        return isWeakMachine() && skipOrchestrationDagReplanOnConstrained;
    }

    public boolean shouldSkipIntentClassifySecondPass() {
        return isWeakMachine() && skipIntentSecondPassOnConstrained;
    }

    /** One resilient orchestration call; no evidence-refine / DAG-replan loops on constrained tier. */
    public boolean preferSingleOrchestrationPass() {
        return isWeakMachine() && singleOrchestrationPassOnConstrained;
    }

    public Map<String, Object> describeRuntime() {
        Tier tier = resolveTier();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tier", tier.name());
        out.put("configuredTier", String.valueOf(configuredTier == null ? "auto" : configuredTier));
        out.put("cores", Runtime.getRuntime().availableProcessors());
        out.put("heapMaxGb", Runtime.getRuntime().maxMemory() / (1024L * 1024L * 1024L));
        out.put("constrainedMachineDetected", detectConstrainedMachine());
        out.put("skipOrchestrationRefine", shouldSkipOrchestrationRefine());
        out.put("skipOrchestrationDagReplan", shouldSkipOrchestrationDagReplan());
        out.put("skipIntentSecondPass", shouldSkipIntentClassifySecondPass());
        out.put("singleOrchestrationPass", preferSingleOrchestrationPass());
        return out;
    }
}
