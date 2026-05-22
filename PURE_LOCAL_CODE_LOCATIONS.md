# Pure Local AI Flow - Code Locations Quick Reference

## 🗺️ Master Control Flow (Entry → Response)

### Step 1: Request Entry
```
Frontend: AiAssistantChat.tsx
    ↓
Backend: ApiSpringController.streamCodeAssistant()
    Line 1474: @PostMapping("ai-code-stream")
    ↓
```

### Step 2: Local-Only Guard (CRITICAL)
```
Line 1592: boolean hardLocalOnlyFlow = strictLocalAssistantScope || aiRouterScoreV2LocalOnlyHard || codeMenuForceLocalOnly
    ↓
Line 1599-1640: if (hardLocalOnlyFlow)
    • Check: llamaCppNativeService.isAvailable()
    • Check: llamaCppNativeService.isCircuitOpen()
    • If NOT available/open: Block request, return error, NO CLOUD
    ↓
```

### Step 3: Routing Decision
```
Line 2825: boolean tryLocalProviderFirst = codeStreamRouteDecision.mode() != AiRouteMode.CLOUD_ONLY
Line 2826: boolean localOnlyHardRoute = hardLocalOnlyFlow || codeStreamRouteDecision.mode() == AiRouteMode.LOCAL_ONLY
    
Decision Matrix:
┌─────────────────────┬──────────────────┬────────────────────┐
│ hardLocalOnlyFlow    │ Route Mode       │ Action             │
├─────────────────────┼──────────────────┼────────────────────┤
│ TRUE                │ LOCAL_ONLY       │ Use Local Only ✓   │
│ FALSE               │ LOCAL_FIRST      │ Try Local, Fallback│
│ FALSE               │ CLOUD_ONLY       │ Use Cloud ✗        │
└─────────────────────┴──────────────────┴────────────────────┘

For PURE LOCAL: hardLocalOnlyFlow=TRUE → localOnlyHardRoute=TRUE
    ↓
```

### Step 4: Local Orchestration (No Cloud Involved)
```
Line 1916: aiLocalOrchestrationService.orchestrateResilient(...)
    • All local tools (no cloud calls)
    • Check early finish: if can answer → return early (NO LLM)
    • If can't: continue to LLM
    ↓
```

### Step 5: Pre-Analysis Check
```
Line 2800: if (codeStreamPreAnalysis.handledLocally())
    → Return early ✓ (no LLM call)
    ↓
```

### Step 6: Local Provider Primary
```
Line 2829-2900: if (tryLocalProviderFirst)
    Line 2862: String providerRaw = runLocalProviderWithProgress(...)
        ↓ Calls: LlamaCppNativeService.generateContent()
        ↓ JNI → llama.cpp in-process inference
        ↓ Returns: local model output
    ↓
```

### Step 7: Output Quality Check
```
Line 2905: boolean localAccepted = shouldAcceptLocalCodeStreamOutput(...)

If localAccepted=true:
    Line 2906: ✓ Return local response
    ↓
If localAccepted=false:
    Line 3127: if (aiLocalEditAdaptiveRetryEnabled)
        Line 3128-3200: Retry with local only (buildEditAdaptiveRetryPrompt)
        Line 3141: Loop back to Step 5
        ↓
    If retry budget exhausted:
        ↓
```

### Step 8: Cloud Fallback Prevention (CRITICAL)
```
GUARD 1 - Line 3702-3780: if (callerForcedLocal && rawResponse == null)
    Line 3775: sendErrorEvent("Local AI could not handle this. No cloud fallback.")
    Line 3776: return ✓ Block cloud
    ↓

GUARD 2 - Line 3829-3860: if (localOnlyHardRoute && rawResponse == null)
    Line 3855: sendErrorEvent("Local-only mode: No cloud fallback allowed.")
    Line 3856: return ✓ Block cloud
    ↓

⚠️ DEPRECATED - Line 7333-7370:
    ☁️ geminiStreamingService.streamContent() 
    ☁️ geminiStreamingService.streamContentWithCache()
    (Only executed if rawResponse is null AND NOT guarded by local-only logic)
    (Should never execute when localOnlyHardRoute=true)
    ↓
```

### Step 9: Response Stream to Frontend
```
Line 3776 or similar: emitter.complete()
    ↓ SSE stream to AiAssistantChat.tsx
    ↓ User sees local response or honest error
```

---

## 🔴 Cloud Fallback Risk Points

### Risk Point 1: Line 7333-7370 (DIRECT GEMINI CALLS)
```java
// RISKY - Only guarded by (rawResponse == null)
if (isFirstAttemptWithCache) {
    geminiStreamingService.streamContentWithCache(...)  // ☁️ CLOUD
}
else {
    geminiStreamingService.streamContent(...)           // ☁️ CLOUD
}

// GUARD CHECK (before line 7333):
// if (localOnlyHardRoute) { return; }  // ← NOT PRESENT!
// Should be: rawResponse != null when localOnlyHardRoute=true
```

**Why Safe with Config**: 
- When `hardLocalOnlyFlow=true` → `localOnlyHardRoute=true`
- When `localOnlyHardRoute=true` → Line 3829 blocks cloud
- So `rawResponse` is never null at line 7333

**Why Not 100% Safe**:
- If config flag gets misconfigured → `localOnlyHardRoute` could be false
- Then line 7333-7370 could execute

---

### Risk Point 2: Line 20632 (MENU FALLBACK DECISION)
```java
// RISKY - Menu fallback to Gemini
boolean upstreamFallbackSignal = forceGeminiFallback || shouldFallbackToGemini(githubRaw);
```

**Why Safe with Config**:
- When `codeMenuForceLocalOnly=true` → always routes local first
- Menu context has separate guards

---

## 📋 Key Config Flags

### Flag 1: Force Local-Only Mode
```properties
ai.router.score.v2.local-only.hard=true
├─ Controls: Line 1592 hardLocalOnlyFlow calculation
├─ Sets: localOnlyHardRoute=true at line 2826
├─ Effect: Forces LOCAL_ONLY routing, blocks cloud fallback
└─ Recommended: TRUE for pure local
```

### Flag 2: Menu Force Local
```properties
ai.code.menu.force-local-only=true
├─ Controls: Line 1592 hardLocalOnlyFlow calculation
├─ Effect: Menu JSON generation stays local
└─ Recommended: TRUE for pure local
```

### Flag 3: Strict Local Scope
```properties
ai.orchestration.strict.local.scope=true
├─ Controls: Orchestration service behavior
├─ Effect: Orchestration tools stay local
└─ Recommended: TRUE for pure local
```

### Flag 4: Disable Gemini Fallback
```properties
ai.routing.stability.disable-fallback-for-gemini-coding=true
├─ Controls: Line 490 fallback config check
├─ Effect: Blocks fallback in some edge cases
└─ Recommended: TRUE for pure local
```

### Flag 5: Enable Local LLaMA
```properties
ai.local.llama.enabled=true
├─ Controls: LlamaCppNativeService availability
├─ Effect: Enables local model inference
└─ Recommended: TRUE (required for pure local)
```

---

## 🎯 Minimal Config for Pure Local

**MUST SET:**
```properties
ai.router.score.v2.local-only.hard=true              # CRITICAL
ai.code.menu.force-local-only=true                   # CRITICAL
ai.local.llama.enabled=true                          # REQUIRED
```

**SHOULD SET:**
```properties
ai.orchestration.strict.local.scope=true
ai.routing.stability.disable-fallback-for-gemini-coding=true
```

---

## 🧪 Test Case: Verify Pure Local

### Test 1: Config Verification
```
Expected in logs:
✓ hardLocalOnlyFlow=true
✓ localOnlyHardRoute=true  
✓ effectiveModel=local_provider
✓ NO "gemini" or "claude" mentions
```

### Test 2: Local Provider Success
```
Send: Request with simple code question
Expected:
✓ LlamaCppNativeService called
✓ Model output received
✓ Response streamed to frontend
✗ NO Gemini API calls
```

### Test 3: Local Provider Failure (No Fallback)
```
Setup: Stop llama.cpp service
Send: Request to /api/ai-code-stream
Expected:
✓ Request blocked immediately
✓ Error message sent: "Local provider not ready"
✗ NO Gemini API call attempted
✗ NO fallback to cloud
```

### Test 4: Log Verification
```bash
# Search logs for cloud mentions
grep -i "gemini\|claude\|cloud.*api\|fallback" logs/app.log

# Expected output: NOTHING
# If you see anything, something is wrong
```

---

## 🔗 Code Dependencies

### LlamaCppNativeService
```
Location: src/main/java/net/phanmemmottrieu/service/ai/local/LlamaCppNativeService.java
Key Methods:
  - isAvailable(): Check if local model ready
  - isCircuitOpen(): Check if in cooldown
  - generateContent(prompt): Main LLM call
  - generateContentFast(prompt, maxTokens): Fast variant
```

### ApiSpringController Entry Points
```
Line 1474: @PostMapping("ai-code-stream")
    ↓ streamCodeAssistant(SseEmitter emitter, @RequestBody Map<String, Object> body)
    ↓ Main orchestration happens here
    ↓ Response sent via SSE
```

### Gate Layers
```
Line 1500-1600: Authentication, flowType, local-only checks
Line 1680-1750: Intent classification, requirement guards
Line 2825-2900: Routing decision, local provider call
Line 3700-3860: Response quality checks, cloud fallback prevention
```

---

## ✅ Pure Local Flow Validation Matrix

```
┌─────────────────────────────────┬──────────────┬────────────────┐
│ Checkpoint                      │ Should See   │ Failure Signal │
├─────────────────────────────────┼──────────────┼────────────────┤
│ Line 1592 hardLocalOnlyFlow     │ TRUE         │ FALSE          │
│ Line 2826 localOnlyHardRoute    │ TRUE         │ FALSE          │
│ Line 2862 LlamaCpp call         │ Called       │ Not called     │
│ Line 7333 Gemini call           │ Never reach  │ Called         │
│ Log: "gemini"                   │ Absent       │ Present        │
│ Log: "local_provider"           │ Present      │ Absent         │
│ Error case: Cloud attempt       │ None         │ Cloud call     │
└─────────────────────────────────┴──────────────┴────────────────┘
```

---

## 🚀 Deployment Checklist

- [ ] Update config: ai.router.score.v2.local-only.hard=true
- [ ] Update config: ai.code.menu.force-local-only=true
- [ ] Restart backend service
- [ ] Check logs: hardLocalOnlyFlow=true
- [ ] Send test request: Simple code question
- [ ] Verify: LlamaCppNativeService called (not Gemini)
- [ ] Verify: Response returned from local model
- [ ] Test error case: Stop llama.cpp, send request
- [ ] Verify: Error returned, no cloud attempt
- [ ] Check logs: NO "gemini", "claude", or "cloud"

---

## 📝 Troubleshooting

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Gemini still called | Config flags not set | Set ai.router.score.v2.local-only.hard=true |
| LlamaCpp unavailable | Service not started | Start llama.cpp service/check port |
| Circuit open errors | GPU memory issues | Increase GPU memory or reduce batch size |
| Slow responses | CPU fallback from GPU | Ensure GPU available (gpu-layers=999) |
| Quality issues | Small model (1.5B) | Use larger model (7B+) if hardware supports |
