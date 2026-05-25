package net.phanmemmottrieu.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Central runtime tier for AI local on constrained servers (v7 target: 5GB RAM, 2 CPU).
 * Principle: ingest/index the full source in RocksDB/Lucene, keep each LLM prompt small,
 * skip CPU-heavy orchestration loops on weak machines while preserving edit accuracy gates.
 */
@Service
public class AiLocalRuntimeTierService {

    public enum Tier {
        STRONG,
        BALANCED,
        WEAK_5GB
    }

    @Value("${ai.local.runtime.tier:auto}")
    private String configuredTier;

    @Value("${ai.local.runtime.weak-profile.enabled:true}")
    private boolean weakProfileDetectionEnabled;

    @Value("${ai.local.runtime.weak-profile.cores-threshold:2}")
    private int weakCoresThreshold;

    @Value("${ai.local.runtime.weak-profile.heap-gb-threshold:6}")
    private int weakHeapGbThreshold;

    @Value("${ai.local.runtime.weak-5gb.skip-orchestration-refine:true}")
    private boolean skipOrchestrationRefineOnWeak;

    @Value("${ai.local.runtime.weak-5gb.skip-orchestration-dag-replan:true}")
    private boolean skipOrchestrationDagReplanOnWeak;

    @Value("${ai.local.runtime.weak-5gb.skip-intent-second-pass:true}")
    private boolean skipIntentSecondPassOnWeak;

    @Value("${ai.local.runtime.weak-5gb.single-orchestration-pass:true}")
    private boolean singleOrchestrationPassOnWeak;

    public Tier resolveTier() {
        String configured = String.valueOf(configuredTier == null ? "auto" : configuredTier)
            .trim()
            .toLowerCase(Locale.ROOT);
        return switch (configured) {
            case "strong", "max" -> Tier.STRONG;
            case "balanced", "standard" -> Tier.BALANCED;
            case "weak", "weak-5gb", "5gb", "v7" -> Tier.WEAK_5GB;
            default -> detectWeakMachine() ? Tier.WEAK_5GB : Tier.BALANCED;
        };
    }

    public boolean isWeakMachine() {
        return resolveTier() == Tier.WEAK_5GB;
    }

    public boolean detectWeakMachine() {
        if (!weakProfileDetectionEnabled) {
            return false;
        }
        int cores = Math.max(1, Runtime.getRuntime().availableProcessors());
        long heapGb = Math.max(1L, Runtime.getRuntime().maxMemory() / (1024L * 1024L * 1024L));
        return cores <= Math.max(1, weakCoresThreshold)
            || heapGb <= Math.max(2, weakHeapGbThreshold);
    }

    public boolean shouldSkipOrchestrationRefine() {
        return isWeakMachine() && skipOrchestrationRefineOnWeak;
    }

    public boolean shouldSkipOrchestrationDagReplan() {
        return isWeakMachine() && skipOrchestrationDagReplanOnWeak;
    }

    public boolean shouldSkipIntentClassifySecondPass() {
        return isWeakMachine() && skipIntentSecondPassOnWeak;
    }

    /** One resilient orchestration call; no evidence-refine / DAG-replan loops on weak tier. */
    public boolean preferSingleOrchestrationPass() {
        return isWeakMachine() && singleOrchestrationPassOnWeak;
    }

    public Map<String, Object> describeRuntime() {
        Tier tier = resolveTier();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tier", tier.name());
        out.put("configuredTier", String.valueOf(configuredTier == null ? "auto" : configuredTier));
        out.put("cores", Runtime.getRuntime().availableProcessors());
        out.put("heapMaxGb", Runtime.getRuntime().maxMemory() / (1024L * 1024L * 1024L));
        out.put("weakMachineDetected", detectWeakMachine());
        out.put("skipOrchestrationRefine", shouldSkipOrchestrationRefine());
        out.put("skipOrchestrationDagReplan", shouldSkipOrchestrationDagReplan());
        out.put("skipIntentSecondPass", shouldSkipIntentClassifySecondPass());
        out.put("singleOrchestrationPass", preferSingleOrchestrationPass());
        return out;
    }
}
