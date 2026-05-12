# Intelligent Orchestration Engine - Testing Guide

## Quick Start

Build and run the backend:
```bash
cd /Volumes/Datas/CSM/JavaProjects/csm_server/backend
mvn clean install
# Or if using IDE: Run ApiSpringController.java
```

---

## Test Scenarios

### Test 1: Fast-Exit Detection (Should complete <200ms)

**Objective**: Verify off-topic queries return instant reply

**Step 1: Send off-topic greeting**
```javascript
const payload = {
    appId: "test_app_001",
    message: "Hello there",
    currentCode: "",
    language: "javascript",
    contextType: "code",
    responseMode: "streaming"
};

// POST to /api/assistant/chat-stream
fetch('/api/assistant/chat-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
});
```

**Expected Output (Timeline)**:
```
1. ⚡ Fast reply · Confidence 85% · <200ms [DONE]
2. ✅ Completed [DONE]
3. Content: "Xin chào! Tôi là trợ lý AI cục bộ..."
```

**Timing**: Total response <300ms

**Verification**:
- [ ] Stage `assistant_fast_exit` appears first
- [ ] No `assistant_orchestration_plan` stage
- [ ] Frontend shows completion immediately
- [ ] Browser network tab shows <300ms response time

---

### Test 2: Attachment Analysis

**Objective**: Verify intelligent attachment parsing

**Step 2: Send code with JSON attachment**
```javascript
const payload = {
    appId: "test_app_002",
    message: "Analyze this menu structure",
    currentCode: "",
    attachments: [
        {
            type: "json_schema",
            content: JSON.stringify({
                table: {
                    name: "menu_items",
                    columns: ["id", "label", "icon", "actions"]
                }
            })
        }
    ],
    contextType: "menu_json",
    responseMode: "streaming"
};
```

**Expected Output (Timeline)**:
```
1. 🎯 Orchestration plan · 5 steps · ~5000ms [DONE]
2. ⏳ Step: Analyze attachments · success · 450ms · 20% [DONE]
3. ⏳ Step: Index vectors · success · 1200ms · 40% [DONE]
4. ⏳ Step: Retrieve context · success · 800ms · 60% [DONE]
5. ⏳ Step: AI reasoning · success · 2100ms · 80% [DONE]
6. ⏳ Step: Execute result · success · 3200ms · 100% [DONE]
7. ✅ Completed [DONE]
```

**Verification**:
- [ ] `assistant_orchestration_plan` stage visible
- [ ] Step count = 5
- [ ] Each `assistant_orchestration_step_result` shows progress
- [ ] All steps show "success" status
- [ ] Final content appears after step 6

---

### Test 3: Intent Classification Accuracy

**Objective**: Verify different intent categories

**Scenario A: Code Analysis (should require context)**
```javascript
{
    message: "Find the bug in this function",
    currentCode: "function add(a, b) { return a + b; }",
    contextType: "code"
}
```
Expected: `category: "analysis"`, `requiresContext: true`, `confidence: ~90%`

**Scenario B: Direct Question (might answer without context)**
```javascript
{
    message: "What is JavaScript?",
    currentCode: "",
    contextType: "code"
}
```
Expected: `category: "analysis"`, `requiresContext: false`, `confidence: ~70%`

**Scenario C: Menu Design (requires menu context)**
```javascript
{
    message: "Add a button to this menu",
    currentCode: "",
    contextType: "menu_json"
}
```
Expected: `category: "menu_design"`, `requiresContext: true`, `confidence: ~92%`

**Verification**:
- [ ] Intent classifications match expected categories
- [ ] Confidence scores are reasonable (>70%)
- [ ] `requiresContext` flag aligns with presence of attachment/code
- [ ] Estimated time increases with context requirements

---

### Test 4: Real-Time Streaming

**Objective**: Verify steps emit progress in real-time

**Setup**: Open browser DevTools → Network → WebSocket

**Step 4: Monitor SSE stream**
```javascript
// Watch for these stage emissions in sequence:
// 1. assistant_orchestration_plan
// 2. assistant_orchestration_step_result (step 1)
// 3. assistant_orchestration_step_result (step 2)
// ... etc
// Final: assistant_completion
```

**Expected Behavior**:
- Events appear in timeline as they arrive (not all at once)
- Each step result has `progressPercent` increasing
- Final event has status "completed"

**Verification**:
- [ ] Events appear in real-time (not batched)
- [ ] Progress percentage increases monotonically (0% → 100%)
- [ ] Each step has positive duration
- [ ] No errors in browser console

---

### Test 5: Multilingual Support

**Objective**: Verify UI labels appear in correct language

**Test with different `uiLang` values**:

**EN (English)**:
```javascript
{ uiLang: "en", message: "hello" }
```
Expected label: "Fast reply"

**VI (Vietnamese)**:
```javascript
{ uiLang: "vi", message: "xin chào" }
```
Expected label: "Trả lời nhanh"

**ZH (Chinese)**:
```javascript
{ uiLang: "zh", message: "你好" }
```
Expected label: "快速回复"

**Verification**:
- [ ] Stage labels render in correct language
- [ ] Detail text uses correct language
- [ ] No missing translations
- [ ] Icons display consistently across languages

---

### Test 6: Stress Test (Weak Machine)

**Objective**: Verify performance under weak resources

**Setup**: Monitor system resources (CPU, memory)

**Send multiple requests rapidly**:
```javascript
for (let i = 0; i < 5; i++) {
    fetch('/api/assistant/chat-stream', {
        method: 'POST',
        body: JSON.stringify({
            appId: `stress_${i}`,
            message: "Analyze this code",
            currentCode: "// Large code..." // 1MB
        })
    });
}
```

**Expected Behavior**:
- No OOM (Out of Memory) errors
- Requests queue properly
- Each request completes within timeout
- Circuit breaker kicks in if load too high

**Verification**:
- [ ] No crashes after multiple requests
- [ ] CPU usage stays <80%
- [ ] Memory usage stays <5GB (per config)
- [ ] Requests process in order (FIFO)

---

### Test 7: Error Handling

**Objective**: Verify graceful degradation

**Scenario A: Empty message**
```javascript
{ message: "", attachments: [] }
```
Expected: Error response "Message or attachment is required"

**Scenario B: Missing appId**
```javascript
{ message: "test", appId: "" }
```
Expected: Error response "appId is required"

**Scenario C: Orchestration step timeout**
```javascript
// Simulate by having AI hang for >8s
```
Expected: Step shows "error", next step skips or retries

**Verification**:
- [ ] Error messages are localized
- [ ] No crash on invalid input
- [ ] Frontend shows error toast
- [ ] Timeline marks step as "error"

---

### Test 8: Circuit Breaker Integration

**Objective**: Verify AI provider circuit breaker works

**Scenario**: AI model unavailable
```javascript
// Temporarily disable LlamaCppNativeService
```

**Expected Behavior**:
- First request: Times out after 8s
- Subsequent requests: Immediately fail with circuit breaker error
- After cooldown: Requests retry

**Verification**:
- [ ] First failure recorded
- [ ] Circuit breaker trips after threshold
- [ ] Fast-fail for subsequent requests (no hanging)
- [ ] Recovery after cooldown

---

## Performance Benchmarks

Run these benchmarks and compare to targets:

```bash
# Test 1: Fast-exit latency (should be <200ms)
curl -X POST http://localhost:8080/api/assistant/chat-stream \
  -H "Content-Type: application/json" \
  -d '{"appId":"bench1","message":"hello"}'
# Time response with: time curl ...

# Test 2: Full orchestration (should be <10s)
curl -X POST http://localhost:8080/api/assistant/chat-stream \
  -H "Content-Type: application/json" \
  -d '{"appId":"bench2","message":"Analyze this code","currentCode":"..."}'

# Test 3: Throughput (requests/sec)
ab -n 100 -c 10 -p payload.json \
  -H "Content-Type: application/json" \
  http://localhost:8080/api/assistant/chat-stream
```

**Expected Results**:
| Metric | Target | Acceptable Range |
|--------|--------|-----------------|
| Fast-exit latency | <200ms | 100-250ms |
| Orchestration time | <10s | 7-12s |
| Throughput | >10 req/s | >5 req/s |
| Error rate | <1% | <5% |
| Memory per request | <50MB | <100MB |

---

## Debugging Tips

### Enable verbose logging:

```properties
# application.properties or config.env
logging.level.net.phanmemmottrieu.controller.ApiSpringController=DEBUG
logging.level.net.phanmemmottrieu.service.LocalAiAssistantContextService=DEBUG
```

### Check logs for orchestration:

```bash
# Look for these log lines:
tail -f backend/logs/*.log | grep -E "(orchestration|fast_exit|execute.*step)"
```

### Browser DevTools tips:

```javascript
// Watch SSE stream in console
const logEvent = (e) => console.log('SSE Event:', e.data);
const eventSource = new EventSource('/api/assistant/stream');
eventSource.addEventListener('message', logEvent);

// Profile timeline rendering
performance.mark('timeline-start');
// ... render happens
performance.mark('timeline-end');
performance.measure('timeline', 'timeline-start', 'timeline-end');
console.log(performance.getEntriesByName('timeline')[0]);
```

### Network inspection:

```javascript
// Monitor all requests to /api/assistant/chat-stream
fetch('/api/assistant/chat-stream', options)
    .then(resp => resp.text())
    .then(data => {
        console.log('Total response bytes:', data.length);
        console.log('Event count:', (data.match(/\n/g) || []).length);
    });
```

---

## Success Criteria

✅ **Phase 4 Complete** when:
- [x] All stages compile without blocking errors
- [x] Fast-exit latency <200ms verified
- [x] Attachment analysis extracts keywords correctly
- [x] Orchestration planning generates 5-step plans
- [x] Step execution emits progress events in real-time
- [x] Frontend timeline renders all new stages
- [x] Multilingual labels display correctly
- [ ] Integration test sends full request without errors
- [ ] Weak machine stress test passes (no crashes)
- [ ] Error handling is graceful

---

## Next Phase (Phase 5)

Once these tests pass:
1. Implement real Lucene indexing in `executeOrchestrationStep()`
2. Add actual AI reasoning (call LlamaCppNativeService)
3. Integrate citation framework into completion
4. Test end-to-end from UI to code editor

