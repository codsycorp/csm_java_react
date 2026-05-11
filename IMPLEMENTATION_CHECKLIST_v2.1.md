# Implementation Checklist - Bug Fixes v2.1

## Phase 1: Code Deployment (30 min)

### ✅ New Service Files
- [ ] Copy `RequestContextTracer.java` to `backend/src/main/java/net/phanmemmottrieu/service/`

### ✅ Verify Updated Services
- [ ] `AiIntentClassifierService.java` - Verify PatternSet class added
- [ ] `AiIntentClassifierService.java` - Verify classifyAdaptive() method added
- [ ] `AiIntentClassifierService.java` - Verify request tracing integrated
- [ ] `AiScopedContextIngestionService.java` - Verify requestId parameters added
- [ ] Both services have `@Autowired RequestContextTracer contextTracer`

### ✅ Build & Test Compilation
```bash
mvn clean -DskipTests compile
```
**Expected**: No errors

---

## Phase 2: Controller Integration (1-2 hours)

### 🔧 Update ApiSpringController.java

#### Add Autowired Tracer (top of class ~line 50)
```java
@Autowired
private RequestContextTracer contextTracer;
```

#### Update /ai-code-stream Handler (~line 1318)
Replace method signature to add requestId generation:

```java
@PostMapping("/ai-code-stream")
public void aiCodeStream(
    @RequestParam String message,
    @RequestParam String contextType,
    HttpServletResponse response
) throws IOException {
    // Generate unique request ID
    String requestId = UUID.randomUUID().toString();
    contextTracer.startRequest(requestId);
    
    try {
        // ... existing validation code ...
        
        // Phase 1: Intent Classification
        IntentClassification intent = intentClassifier.classify(
            message, 
            contextType, 
            currentCode,     // if available
            currentMenu,     // if available
            requestId        // ADD THIS PARAMETER
        );
        
        // Early exit for off-topic
        if (intent.isOffTopic()) {
            String answer = buildSynthesizedOffTopicAnswer(message);
            sendSSE(response, "off_topic_response", answer);
            contextTracer.completeRequest(requestId);
            return;
        }
        
        // Phase 2-3: Scoped Ingestion
        IngestionResult ingestionCode = scopedIngestion.ingestCode(
            appId,
            currentCode,
            scopeMask,
            false,           // sync mode for now
            requestId        // ADD THIS PARAMETER
        );
        
        // ... rest of flow ...
        
        // Final: Log request summary
        contextTracer.logRequestSummary(requestId);
        contextTracer.completeRequest(requestId);
        
    } catch (Exception e) {
        contextTracer.recordError(requestId, "ai_code_stream_error", e.getMessage());
        contextTracer.completeRequest(requestId);
        throw e;
    }
}
```

#### Update Ingestion Calls
All calls to `ingestCode()` and `ingestMenu()` must add `requestId`:

```java
// OLD
IngestionResult result = scopedIngestion.ingestCode(appId, currentCode, scopeMask, async);

// NEW  
IngestionResult result = scopedIngestion.ingestCode(appId, currentCode, scopeMask, async, requestId);
```

---

## Phase 3: Testing (1-2 hours)

### ✅ Unit Tests

#### Test 1: Adaptive Routing (Intent Classifier)
```bash
# Simple message test
curl -X POST http://localhost:8080/ai-code-stream \
  -d 'message=hi&contextType=code'

# Expected: 
# - classificationMethod = "heuristic_simple"
# - inferenceTimeMs < 50ms
# - totalTimeFromRequestStartMs = correct end-to-end
```

#### Test 2: Flexible Patterns
```java
// In test
AiIntentClassifierService classifier = new AiIntentClassifierService();
classifier.initializePatterns();

IntentClassification result = classifier.classify(
    "Explain this algorithm", 
    "code", 
    "code content here", 
    null,
    "test-123"
);

// Verify
assert result.intentClass.equals("code_analyze");
assert result.classificationMethod.equals("heuristic_adaptive");
assert result.requestId.equals("test-123");
assert result.totalTimeFromRequestStartMs > 0;
```

#### Test 3: Request Tracing
```java
// In test
RequestContextTracer tracer = new RequestContextTracer();
tracer.startRequest("req-123");

tracer.startPhase("phase1", "req-123");
Thread.sleep(100);
tracer.endPhase("phase1", "req-123", 100);

tracer.startPhase("phase2", "req-123");
Thread.sleep(50);
tracer.endPhase("phase2", "req-123", 50);

tracer.completeRequest("req-123");

Map<String, Object> summary = tracer.getSummary("req-123");

// Verify
assert ((long)summary.get("totalDurationMs")) >= 150;
assert ((Map)summary.get("phaseBreakdown")).size() == 2;
assert summary.get("status").equals("completed");
```

### ✅ Integration Tests

#### Test 4: End-to-End Timing Accuracy
```bash
# Start timing from request
time curl -X POST http://localhost:8080/ai-code-stream \
  -d 'message=fix this bug&contextType=code'

# Log should show:
# "Request started: req-xyz"
# "Phase started: intent_classification in request req-xyz"
# "Phase completed: intent_classification (52ms) in request req-xyz"
# "Intent: code_edit (conf=0.87, method=heuristic_adaptive, inferenceMs=52, totalMs=425, requestId=req-xyz)"
# "Request completed: req-xyz (425ms)"

# Check: curl time ≈ 425ms ±50ms
```

#### Test 5: Off-Topic Early Exit
```bash
time curl -X POST http://localhost:8080/ai-code-stream \
  -d 'message=what is the weather today?&contextType=code'

# Should be very fast (~50ms) due to early exit
```

---

## Phase 4: Configuration (15 min)

### Update application.properties
```properties
# Adaptive routing (default: enabled)
ai.intent.classifier.adaptive-routing.enabled=true

# Pattern source (default: config)
ai.intent.classifier.patterns.source=config

# For weak machines, keep LLM disabled
ai.intent.classifier.use-llm=false

# Optional: Enable verbose logging
logging.level.net.phanmemmottrieu.service.RequestContextTracer=DEBUG
logging.level.net.phanmemmottrieu.service.AiIntentClassifierService=INFO
```

---

## Phase 5: Validation (30 min)

### ✅ Performance Checks

- [ ] Simple message TTFT < 50ms
- [ ] Complex message TTFT < 400ms (with LLM)
- [ ] Off-topic TTFT < 50ms
- [ ] No timing mismatches (reported ≈ actual)
- [ ] Accuracy > 90%

### ✅ Functionality Checks

- [ ] Code editing flow works
- [ ] Menu editing flow works
- [ ] Attachment analysis works
- [ ] SSE event streaming works
- [ ] Output is NOT jumbled (no more "nối lộn xộn")

### ✅ Monitoring Checks

```bash
# Get all request summaries (from RequestContextTracer.getAllSummaries())
curl http://localhost:8080/admin/request-summaries

# Expected: Shows all tracked requests with phase breakdown
```

---

## 🚨 Troubleshooting

### Issue: "Cannot autowire RequestContextTracer"
**Solution**: Verify RequestContextTracer.java is in service package and has @Service annotation

### Issue: "method classify() not found"
**Solution**: Check AiIntentClassifierService has 5 parameters (including requestId)

### Issue: "Timing still mismatches"
**Solution**: 
- Verify contextTracer.startRequest() called at handler start
- Verify contextTracer.completeRequest() called before response sent
- Check that all service calls include requestId parameter

### Issue: "Adaptive routing not working"
**Solution**: Set `ai.intent.classifier.adaptive-routing.enabled=true`

---

## 📋 Final Checklist

### Code Ready
- [ ] AiIntentClassifierService.java - v2.1 deployed
- [ ] AiScopedContextIngestionService.java - v2.1 deployed
- [ ] RequestContextTracer.java - deployed
- [ ] ApiSpringController.java - updated with requestId

### Configuration Ready
- [ ] application.properties - updated
- [ ] Patterns initialized at startup
- [ ] Adaptive routing enabled

### Tests Passed
- [ ] Compilation: ✓ No errors
- [ ] Adaptive routing: ✓ Simple/complex messages
- [ ] Request tracing: ✓ End-to-end timing
- [ ] Performance: ✓ TTFT targets met
- [ ] Accuracy: ✓ > 90%

### User Visible
- [ ] No more "nối lộn xộn" output
- [ ] Accurate timing displayed
- [ ] Fast responses for simple queries
- [ ] Accurate responses for complex queries

---

## 📞 Support

If you encounter issues:

1. Check logs with `grep "requestId"` for request-level tracing
2. Call `contextTracer.logRequestSummary(requestId)` to see phase breakdown
3. Review `BUG_FIX_SUMMARY_v2.1.md` for detailed explanations
4. Compare with BEFORE/AFTER examples in the summary

---

**Status**: Ready for Implementation  
**Estimated Time**: 4-5 hours total  
**Risk Level**: Low (backward compatible)
