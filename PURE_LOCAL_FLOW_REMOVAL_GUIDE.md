# Pure Local AI Flow - Complete Removal Guide

## 📋 Summary

**Goal**: Make AI Local flow **100% LOCAL** with ZERO cloud fallback  
**Scope**: `ApiSpringController.java`  
**Impact**: Remove all Gemini/Claude cloud routing, force pure LlamaCpp

---

## 🔴 CRITICAL CHANGE: Force LOCAL_ONLY Routing

### Location: Line 1592
**Current Code:**
```java
boolean hardLocalOnlyFlow = strictLocalAssistantScope || aiRouterScoreV2LocalOnlyHard || codeMenuForceLocalOnly;
```

**Analysis**: `hardLocalOnlyFlow` is the master flag that controls pure local vs mixed cloud flow

**Config Flags to Enable:**
```properties
# In application.properties
ai.router.score.v2.local-only.hard=true              # Forces LOCAL_ONLY routing
ai.code.menu.force-local-only=true                   # Forces local for menu
ai.orchestration.strict.local.scope=true             # Strict local-only scope
```

**Verify**: After config change, when request comes in:
- `hardLocalOnlyFlow` = `true` (line 1592)
- `localOnlyHardRoute` = `true` (line 2825)

---

## ❌ CLOUD FALLBACK PATHS TO REMOVE

### REMOVAL 1: Gemini Direct Calls (Lines 7333 & 7360)

**Location**: [ApiSpringController.java](backend/src/main/java/net/phanmemmottrieu/controller/ApiSpringController.java#L7333-L7370)

**Current Code (REMOVE):**
```java
// Line 7333 - WITH CACHE
if (isFirstAttemptWithCache) {
    providerCalls.incrementAndGet();
    geminiStreamingService.streamContentWithCache(  // ❌ REMOVE THIS ENTIRE BLOCK
            systemContent,
            userMessage,
            model,
            chunkHandler,
            null,
            err -> errorHolder[0] = err,
            status -> { /* ... */ });
}

// Line 7360 - WITHOUT CACHE  
else {
    providerCalls.incrementAndGet();
    geminiStreamingService.streamContent(  // ❌ REMOVE THIS ENTIRE BLOCK
            currentPrompt,
            model,
            chunkHandler,
            null,
            err -> errorHolder[0] = err,
            status -> { /* ... */ });
}
```

**Why Remove**: These are direct cloud Gemini API calls that happen after local fails

**Replacement Strategy**:
```java
// INSTEAD: Only call if rawResponse is null AND not localOnlyHardRoute
if (rawResponse == null && !localOnlyHardRoute) {
    // Cloud call would go here (but we want to remove this branch entirely)
    logger.warn("Pure local mode: Blocking cloud fallback. Returning error instead.");
    sendErrorEvent(emitter, "Local AI could not process request in pure local mode.");
    return;
} else if (rawResponse != null) {
    // Use local response
    // Stream to frontend
}
```

---

### REMOVAL 2: Claude Fallback Logic (Lines 7344 & 7370)

**Location**: Inside `geminiStreamingService.streamContentWithCache()` and `.streamContent()` status callbacks

**Current Code (REMOVE):**
```java
// Line 7344 & 7370 - IN BOTH CALLBACKS
if ("claude_fallback".equalsIgnoreCase(stage) && !fallbackCountedThisAttempt[0]) {
    fallbackCountedThisAttempt[0] = true;
    providerFallbackTransitions.incrementAndGet();  // ❌ REMOVE
    recordQualityFallback(metricsAppId);            // ❌ REMOVE
}
```

**Why Remove**: These track fallback to Claude - not needed when no fallback exists

---

### REMOVAL 3: shouldFallbackToGemini() Calls (Line 20632)

**Location**: [ApiSpringController.java](backend/src/main/java/net/phanmemmottrieu/controller/ApiSpringController.java#L20632-L20654)

**Current Code (REMOVE):**
```java
// Line 20632 - Menu context fallback decision
boolean upstreamFallbackSignal = forceGeminiFallback || shouldFallbackToGemini(githubRaw);  // ❌ REMOVE

if (upstreamFallbackSignal) {
    // Line 20653-20654: Fallback message about switching to Gemini
    // ❌ REMOVE THESE MESSAGES
    sendEvent(emitter, jsonOf(
        "message", "AI Assistant API đang lỗi hạ tầng/giới hạn, tạm bỏ chặn fallback để chuyển sang Gemini",
        "message", "AI Assistant API has infrastructure/limit failures, temporarily overriding fallback block to switch to Gemini"));
}
```

**Why Remove**: Menu fallback logic that routes to cloud Gemini

---

### REMOVAL 4: Gemini Fallback Gate (Line 20796)

**Location**: [ApiSpringController.java](backend/src/main/java/net/phanmemmottrieu/controller/ApiSpringController.java#L20796-L20800)

**Current Code (REMOVE):**
```java
// Line 20796 - Menu can gate fallback to Gemini
boolean canGateFallbackToProvider = !menuGeminiFallbackDisabled  // ❌ REMOVE THIS CHECK
    && (upstreamFallbackSignal || shouldFallbackToGemini(githubRaw));

if (canGateFallbackToProvider) {
    // Fallback logic here - should not execute
    // ❌ REMOVE ENTIRE IF BLOCK
}
```

**Why Remove**: Gate that allows menu requests to fallback to cloud

---

### REMOVAL 5: Multimodal Cloud Disabled Check (Line 3868)

**Location**: [ApiSpringController.java](backend/src/main/java/net/phanmemmottrieu/controller/ApiSpringController.java#L3868-L3890)

**Current Code (KEEP & VERIFY):**
```java
// Line 3868 - Block multimodal when cloud disabled
if (hasImages) {
    logger.error("MULTIMODAL_CLOUD_DISABLED requestId={} contextType={} reason=cloud_path_removed", requestId, contextType);
    sendErrorEvent(emitter, "Multimodal mode requires local vision provider. Vision endpoint not ready.");
    return;  // ✓ GOOD - Already blocks without cloud fallback
}
```

**Why Keep**: Already prevents cloud usage for multimodal

---

## ✅ CODE BLOCKS TO KEEP (Pure Local Path)

### KEEP 1: hardLocalOnlyFlow Guard (Line 1599)
```java
if (hardLocalOnlyFlow) {
    if (llamaCppNativeService == null || !llamaCppNativeService.isAvailable()) {
        sendErrorEvent(emitter, "Local provider not ready. No cloud fallback in pure local mode.");
        return;  // ✓ KEEP - Blocks cloud
    }
    if (llamaCppNativeService.isCircuitOpen()) {
        sendErrorEvent(emitter, "Local provider in cooldown. No cloud fallback in pure local mode.");
        return;  // ✓ KEEP - Blocks cloud
    }
}
```

### KEEP 2: Local Provider Path (Line 2825+)
```java
if (tryLocalProviderFirst) {
    String providerRaw = runLocalProviderWithProgress(emitter, requestId, localProviderPrompt, contextType);
    // ✓ KEEP - LlamaCppNativeService execution
}
```

### KEEP 3: callerForcedLocal Block (Line 3762)
```java
if (callerForcedLocal && rawResponse == null) {
    logger.warn("LOCAL_OVERRIDE: blocking cloud fallback per caller request");
    sendErrorEvent(emitter, "Local AI could not handle this. Try rephrasing your question.");
    return;  // ✓ KEEP - Prevents cloud fallback
}
```

### KEEP 4: localOnlyHardRoute Block (Line 3829)
```java
if (localOnlyHardRoute && rawResponse == null) {
    logger.warn("LOCAL_ONLY_HARD_ROUTE: blocking cloud fallback");
    sendErrorEvent(emitter, "Local AI could not handle this in local-only mode. Please simplify your request.");
    return;  // ✓ KEEP - Prevents cloud fallback
}
```

---

## 🔧 Implementation Strategy

### Phase 1: Config-Only (Recommended First Step)
**No code changes. Just update config:**

```properties
# application.properties
ai.router.score.v2.local-only.hard=true              # Key flag
ai.code.menu.force-local-only=true                   # Menu flag
ai.orchestration.strict.local.scope=true             # Orchestration flag
ai.routing.stability.disable-fallback-for-gemini-coding=true  # Disable fallback

# Verify this exists and is TRUE
ai.local.llama.enabled=true
```

**Expected Result**: 
- All new requests will route to `LOCAL_ONLY` mode
- `localOnlyHardRoute` = true
- Cloud Gemini calls at line 7333/7360 will NEVER execute (guarded by if-statement)

### Phase 2: Code Cleanup (Optional - Full Removal)
If you want to **completely remove** cloud code (not just disable):

**Step 1**: Remove geminiStreamingService dependency injection
- Line 54: Remove `import` for GeminiStreamingService
- Line 440: Remove `@Autowired GeminiStreamingService geminiStreamingService`
- Line 1416: Remove from constructor param
- Line 1451: Remove assignment

**Step 2**: Remove Gemini streaming calls (Lines 7315-7400)
- Delete entire if-else block at line 7333-7370
- Replace with error return

**Step 3**: Remove fallback utilities
- Remove `shouldFallbackToGemini()` method
- Remove `recordQualityFallback()` calls related to cloud

---

## 🧪 Validation Steps

### Test 1: Verify hardLocalOnlyFlow is True
```java
// Add temporary log in streamCodeAssistant() at line 1475
logger.info("DEBUG: hardLocalOnlyFlow={}, localOnlyHardRoute={}, effectiveModel={}",
    hardLocalOnlyFlow, localOnlyHardRoute, effectiveModel);
```

Expected output:
```
DEBUG: hardLocalOnlyFlow=true, localOnlyHardRoute=true, effectiveModel=local_provider
```

### Test 2: Verify LlamaCpp is Called
```java
// In runLocalProviderWithProgress(), add log
logger.info("DEBUG: Calling LlamaCppNativeService.generateContent() - NOT GEMINI");
```

### Test 3: Test Error Path (No Cloud Fallback)
1. Stop local llama.cpp service
2. Send request to /api/ai-code-stream
3. **Expected**: Error response immediately, NO cloud call attempted
4. **Check logs**: Should see "LOCAL_ONLY_HARD_ROUTE: blocking cloud fallback"

### Test 4: Check No Gemini Calls
```bash
# Search for any Gemini API calls in logs
grep -i "gemini\|claude\|cloud.*api" logs/application.log

# Should return NOTHING (no cloud calls)
```

---

## 📊 Impact Analysis

| Aspect | Impact |
|--------|--------|
| **Performance** | ✅ Faster (no cloud round-trip latency) |
| **Cost** | ✅ ZERO API calls (all local compute) |
| **Latency** | ✅ Reduced (GPU/CPU on machine) |
| **Reliability** | ⚠️ Depends on local hardware (GPU mem, CPU) |
| **Quality** | ⚠️ Depends on local model size (1.5B vs 7B+) |
| **Hardware Requirement** | ⚠️ GPU strongly recommended (4GB+ VRAM) |

---

## 🚀 Recommended Config (Final State)

```properties
# Pure Local Orchestration Config
ai.router.score.v2.local-only.hard=true              # ✓ CRITICAL
ai.code.menu.force-local-only=true                   # ✓ CRITICAL
ai.orchestration.strict.local.scope=true             # ✓ Force strict local

# Local LLM Provider (llama.cpp)
ai.local.llama.enabled=true                          # ✓ Enable local
ai.local.llama.model-path=./csm_datas/ai_local/model/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf
ai.local.llama.gpu-layers=999                        # Load all layers on GPU

# Disable all cloud/remote paths
ai.routing.stability.disable-fallback-for-gemini-coding=true
ai.cloud.provider.fallback.enabled=false             # If this config exists

# Local retry/quality gates (all local, no fallback)
ai.local.edit.adaptive.retry.enabled=true            # Retry with local only
ai.local.analyze.broad.gap-fill.enabled=true         # Gap fill with local only
ai.local.evidence-gate.enabled=true                  # Keep local quality gates
```

---

## 🎯 Final State Checklist

- [ ] Config flags set to force LOCAL_ONLY
- [ ] Verify hardLocalOnlyFlow=true in logs
- [ ] Verify LlamaCppNativeService calls (NOT Gemini)
- [ ] Test error case: No cloud fallback
- [ ] Remove/disable Gemini cloud calls (Phase 2 optional)
- [ ] No "gemini", "claude", or "cloud" in logs during AI requests
- [ ] All requests show: model=local_provider, provider=LlamaCppNativeService

---

## 📝 Files Modified

- **Modified**: [backend/src/main/java/net/phanmemmottrieu/controller/ApiSpringController.java](backend/src/main/java/net/phanmemmottrieu/controller/ApiSpringController.java)
  - Config changes only: No code changes needed
  - Code removal (optional): Lines 7333-7370, 3624-3650, 20632, 20796

- **Modified**: `application.properties` or `config.env`
  - Add pure local config flags (see Recommended Config)

---

## ⚠️ Rollback Plan

If issues occur, to revert to mixed cloud+local:
```properties
ai.router.score.v2.local-only.hard=false             # Allow other routes
ai.code.menu.force-local-only=false                  # Allow menu fallback
```

Then requests can fallback to cloud Gemini if local fails.

---

## ✅ Status

**Current**: Mixed local + cloud fallback  
**Target**: Pure local only  
**Effort**: Low (config-only) to Medium (with code removal)  
**Risk**: Low (guarded by existing code checks)
