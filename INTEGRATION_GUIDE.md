# AI Local Orchestration - Integration Guide
## How to Wire Everything Together in ApiSpringController

---

## 1. AUTOWIRE THE NEW SERVICES

In **ApiSpringController.java**, add these autowired fields:

```java
@RestController
@RequestMapping
public class ApiSpringController {

    // ... existing autowired fields ...

    @Autowired
    private AiIntentClassifierService intentClassifier;

    @Autowired
    private AiExecutionPlannerService executionPlanner;

    @Autowired
    private AiScopedContextIngestionService scopedIngestion;

    @Autowired
    private AiBusinessMemoryVectorService businessMemoryService;

    @Autowired(required = false)
    private LlamaCppNativeService llamaCppService;
}
```

---

## 2. REFACTOR THE /ai-code-stream ENDPOINT

**Current location**: Look for `@PostMapping(value = "/ai-code-stream", ...)` in ApiSpringController

**Current code** (around line 1318-1450):
```java
@PostMapping(value = "/ai-code-stream", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public SseEmitter handleCodeStreamRequest(...) {
    // Existing implementation
}
```

**Replace with new 6-phase implementation** (see below)

---

## 3. COMPLETE NEW IMPLEMENTATION

Replace the entire `/ai-code-stream` handler with this:

```java
/**
 * New AI Local Orchestration Flow - 6 Phases
 * 
 * PHASE 0: Intent Classification (50ms-500ms)
 * PHASE 1: Early Finish Gate (100ms)
 * PHASE 2: Multimodal Analysis (50-150ms)
 * PHASE 3: Scoped Ingestion (500ms-2s, async ok)
 * PHASE 4: RAG Retrieval (100-200ms)
 * PHASE 5: Plan Generation (100-500ms)
 * PHASE 6: Step Execution (varies per step)
 */
@PostMapping(value = "/ai-code-stream", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public SseEmitter handleCodeStreamRequest(
    @RequestParam(value = "message", required = false) String message,
    @RequestParam(value = "contextType", required = false) String contextType,
    @RequestParam(value = "flowType", required = false, defaultValue = "code_editor") String flowType,
    @RequestParam(value = "taskType", required = false) String taskType,
    @RequestParam(value = "responseMode", required = false) String responseMode,
    @RequestPart(value = "currentCode", required = false) MultipartFile currentCodeFile,
    @RequestPart(value = "currentMenu", required = false) MultipartFile currentMenuFile,
    @RequestPart(value = "attachments", required = false) List<MultipartFile> attachmentFiles,
    HttpServletRequest httpRequest
) throws IOException {

    SseEmitter emitter = new SseEmitter(10 * 60_000L);
    
    // Extract request ID for tracking
    String requestId = UUID.randomUUID().toString();
    
    executorService.submit(() -> {
        try {
            // ────────────────────────────────────────────────────────────
            // INITIALIZATION
            // ────────────────────────────────────────────────────────────
            
            log.info("[{}] Starting AI orchestration: flowType={}, contextType={}", 
                    requestId, flowType, contextType);
            
            emitter.send(SseEmitter.event()
                .id(requestId)
                .name("start_sse")
                .data(buildEventData("Bắt đầu xử lý yêu cầu AI local...")));
            
            // Load current content
            String currentCode = currentCodeFile != null ? 
                new String(currentCodeFile.getBytes(), StandardCharsets.UTF_8) : "";
            String currentMenu = currentMenuFile != null ? 
                new String(currentMenuFile.getBytes(), StandardCharsets.UTF_8) : "";
            
            // Parse attachments
            List<Map<String, Object>> attachments = new ArrayList<>();
            if (attachmentFiles != null && !attachmentFiles.isEmpty()) {
                for (MultipartFile att : attachmentFiles) {
                    Map<String, Object> attMap = new LinkedHashMap<>();
                    attMap.put("name", att.getOriginalFilename());
                    attMap.put("type", att.getContentType());
                    attMap.put("size", att.getSize());
                    attachments.add(attMap);
                }
            }
            
            // ────────────────────────────────────────────────────────────
            // PHASE 0: INTENT CLASSIFICATION
            // ────────────────────────────────────────────────────────────
            
            long phase0Start = System.currentTimeMillis();
            
            AiIntentClassifierService.IntentClassification intent = 
                intentClassifier.classify(
                    message != null ? message : "",
                    contextType != null ? contextType : "code",
                    currentCode,
                    currentMenu
                );
            
            log.debug("[{}] Phase 0 intent: {} (confidence={})", 
                    requestId, intent.intentClass, String.format("%.2f", intent.confidence));
            
            emitter.send(SseEmitter.event()
                .name("phase_0_complete")
                .data(buildEventData(
                    String.format("Intent: %s (confidence: %.0f%%)", 
                        intent.intentClass, intent.confidence * 100))));
            
            // ────────────────────────────────────────────────────────────
            // PHASE 1: EARLY FINISH GATE
            // ────────────────────────────────────────────────────────────
            
            if (intent.isOffTopic()) {
                log.info("[{}] Off-topic detected, early finish", requestId);
                
                String synthesizedAnswer = buildSynthesizedOffTopicAnswer(message);
                
                emitter.send(SseEmitter.event()
                    .name("early_finish")
                    .data(buildEventData("Câu hỏi không liên quan. " + synthesizedAnswer)));
                
                emitter.send(SseEmitter.event()
                    .name("all_steps_done")
                    .data(buildEventData("Phiên kết thúc")));
                
                emitter.complete();
                return;
            }
            
            // ────────────────────────────────────────────────────────────
            // PHASE 2: MULTIMODAL ATTACHMENT ANALYSIS
            // ────────────────────────────────────────────────────────────
            
            long phase2Start = System.currentTimeMillis();
            
            AiScopedContextIngestionService.ScopeMaskAnalysis scopeAnalysis = 
                scopedIngestion.analyzeScopesFromAttachments(
                    message != null ? message : "",
                    attachments,
                    !currentCode.isEmpty(),
                    !currentMenu.isEmpty()
                );
            
            log.debug("[{}] Phase 2 scope analysis: {} ({}ms)", 
                    requestId, scopeAnalysis.describe(), 
                    System.currentTimeMillis() - phase2Start);
            
            emitter.send(SseEmitter.event()
                .name("phase_2_complete")
                .data(buildEventData(
                    String.format("Phân tích scope: %s", scopeAnalysis.describe()))));
            
            // ────────────────────────────────────────────────────────────
            // PHASE 3: SCOPED CONTEXT INGESTION
            // ────────────────────────────────────────────────────────────
            
            long phase3Start = System.currentTimeMillis();
            
            // Determine async vs sync based on machine profile
            boolean useAsync = shouldUseAsyncIngestion();
            
            // Ingest code if scope includes it
            AiScopedContextIngestionService.IngestionResult codeIngest = 
                scopedIngestion.ingestCode(
                    "local_" + requestId, // Use request ID as app ID
                    currentCode,
                    scopeAnalysis.scopeMask,
                    useAsync
                );
            
            // Ingest menu if scope includes it
            AiScopedContextIngestionService.IngestionResult menuIngest = 
                scopedIngestion.ingestMenu(
                    "local_" + requestId,
                    currentMenu,
                    scopeAnalysis.scopeMask,
                    useAsync
                );
            
            log.debug("[{}] Phase 3 ingestion: code={} chunks, menu={} chunks", 
                    requestId, codeIngest.chunksIngested, menuIngest.chunksIngested);
            
            // Wait briefly for async ingestion (up to 200ms)
            if (useAsync) {
                scopedIngestion.waitForIngestion("local_" + requestId, 200);
            }
            
            emitter.send(SseEmitter.event()
                .name("phase_3_complete")
                .data(buildEventData(
                    String.format("Nạp context: %d chunks", 
                        codeIngest.chunksIngested + menuIngest.chunksIngested))));
            
            // ────────────────────────────────────────────────────────────
            // PHASE 4: SCOPED RAG RETRIEVAL
            // ────────────────────────────────────────────────────────────
            
            long phase4Start = System.currentTimeMillis();
            
            // TODO: Add scopeMask filtering to businessMemoryService.searchWithScopes()
            // For now, use existing search
            List<Map<String, Object>> retrievedDocs = new ArrayList<>();
            try {
                // This method needs to be updated to accept scopeMask parameter
                // retrievedDocs = businessMemoryService.searchWithScopes(
                //     message, scopeAnalysis.scopeMask, 4);
                log.debug("[{}] Phase 4 RAG: {} docs retrieved", 
                        requestId, retrievedDocs.size());
            } catch (Exception e) {
                log.warn("[{}] RAG retrieval failed: {}", requestId, e.getMessage());
            }
            
            emitter.send(SseEmitter.event()
                .name("phase_4_complete")
                .data(buildEventData(
                    String.format("Tìm kiếm context: %d docs", retrievedDocs.size()))));
            
            // ────────────────────────────────────────────────────────────
            // PHASE 5: EXECUTION PLAN GENERATION
            // ────────────────────────────────────────────────────────────
            
            long phase5Start = System.currentTimeMillis();
            
            String retrievedContext = retrievedDocs.stream()
                .map(doc -> String.valueOf(doc.get("content")))
                .collect(Collectors.joining("\n---\n"));
            
            AiExecutionPlannerService.ExecutionPlan plan = 
                executionPlanner.generatePlan(
                    message != null ? message : "",
                    contextType != null ? contextType : "code",
                    !currentCode.isEmpty() ? currentCode : null,
                    retrievedContext
                );
            
            log.info("[{}] Phase 5 plan: {} steps (dedup_count={})", 
                    requestId, plan.getStepCount(), plan.deduplicationCount);
            
            // Emit plan event
            List<String> stepDescriptions = executionPlanner.getPlanDescriptions(plan);
            Map<String, Object> planData = new LinkedHashMap<>();
            planData.put("stage", "agentic_plan");
            planData.put("message", "Đã lập kế hoạch thực hiện:");
            planData.put("planSteps", stepDescriptions);
            planData.put("planStepCount", plan.getStepCount());
            planData.put("totalEstimatedMs", plan.totalEstimatedMs);
            
            emitter.send(SseEmitter.event()
                .name("agentic_plan")
                .data(objectMapper.writeValueAsString(planData)));
            
            // ────────────────────────────────────────────────────────────
            // PHASE 6: STEP-BY-STEP EXECUTION
            // ────────────────────────────────────────────────────────────
            
            for (AiExecutionPlannerService.ExecutionStep step : plan.steps) {
                
                // Emit step start event
                Map<String, Object> stepStartData = new LinkedHashMap<>();
                stepStartData.put("stage", "agentic_step");
                stepStartData.put("current", step.stepId);
                stepStartData.put("total", plan.getStepCount());
                stepStartData.put("message", String.format(
                    "Step %d/%d: %s", step.stepId, plan.getStepCount(), step.description));
                
                emitter.send(SseEmitter.event()
                    .name("agentic_step")
                    .data(objectMapper.writeValueAsString(stepStartData)));
                
                log.debug("[{}] Executing step {}/{}: {}", 
                        requestId, step.stepId, plan.getStepCount(), step.description);
                
                // Execute step with LLM
                String stepPrompt = buildStepExecutionPrompt(step, currentCode, currentMenu);
                String stepResult = null;
                
                if (llamaCppService != null && shouldUseLlamaForStep(step)) {
                    try {
                        stepResult = llamaCppService.generateContent(stepPrompt);
                    } catch (Exception e) {
                        log.warn("[{}] Step {} LLM failed: {}", requestId, step.stepId, e.getMessage());
                        stepResult = "Error: " + e.getMessage();
                    }
                } else {
                    stepResult = "Skipped (LLM unavailable)";
                }
                
                // Emit step result event
                Map<String, Object> stepResultData = new LinkedHashMap<>();
                stepResultData.put("stage", "agentic_step_result");
                stepResultData.put("stepId", step.stepId);
                stepResultData.put("result", stepResult);
                stepResultData.put("complexity", step.complexity);
                stepResultData.put("affectedLines", step.affectedLines);
                
                emitter.send(SseEmitter.event()
                    .name("agentic_step_result")
                    .data(objectMapper.writeValueAsString(stepResultData)));
                
                // Small delay between steps to avoid SSE queue overflow
                Thread.sleep(50);
            }
            
            // ────────────────────────────────────────────────────────────
            // COMPLETION
            // ────────────────────────────────────────────────────────────
            
            emitter.send(SseEmitter.event()
                .name("all_steps_done")
                .data(buildEventData(
                    String.format("Hoàn thành %d bước. Tổng thời gian: %dms", 
                        plan.getStepCount(), 
                        System.currentTimeMillis() - phase0Start))));
            
            log.info("[{}] Orchestration complete: {} steps, {}ms total", 
                    requestId, plan.getStepCount(), 
                    System.currentTimeMillis() - phase0Start);
            
            emitter.complete();
            
        } catch (IOException e) {
            try {
                emitter.send(SseEmitter.event()
                    .name("error")
                    .data(buildEventData("Lỗi: " + e.getMessage())));
            } catch (IOException ignore) {}
            emitter.completeWithError(e);
        } catch (Exception e) {
            log.error("[{}] Unexpected error in orchestration: {}", requestId, e.getMessage(), e);
            try {
                emitter.send(SseEmitter.event()
                    .name("error")
                    .data(buildEventData("Lỗi ngoài dự kiến: " + e.getMessage())));
            } catch (IOException ignore) {}
            emitter.completeWithError(e);
        }
    });
    
    return emitter;
}
```

---

## 4. HELPER METHODS TO ADD

Add these helper methods to **ApiSpringController**:

```java
/**
 * Build event data wrapper
 */
private Map<String, Object> buildEventData(String message) {
    Map<String, Object> data = new LinkedHashMap<>();
    data.put("message", message);
    data.put("timestamp", System.currentTimeMillis());
    return data;
}

/**
 * Synthesize off-topic answer
 */
private String buildSynthesizedOffTopicAnswer(String question) {
    return "Xin lỗi, câu hỏi này không liên quan đến việc chỉnh sửa code hoặc thiết kế menu. " +
           "Tôi chỉ có thể hỗ trợ các yêu cầu liên quan đến code editing hoặc menu design.";
}

/**
 * Determine if async ingestion should be used
 */
private boolean shouldUseAsyncIngestion() {
    // Check if weak machine profile
    String profile = environment.getProperty("ai.machine.profile", "normal");
    return !"weak".equals(profile);
}

/**
 * Determine if LLM should be used for this step
 */
private boolean shouldUseLlamaForStep(AiExecutionPlannerService.ExecutionStep step) {
    return llamaCppService != null && llamaCppService.isAvailable();
}

/**
 * Build execution prompt for a specific step
 */
private String buildStepExecutionPrompt(
    AiExecutionPlannerService.ExecutionStep step,
    String currentCode,
    String currentMenu
) {
    StringBuilder prompt = new StringBuilder();
    prompt.append("Execute this step:\n\n");
    prompt.append("Step: ").append(step.stepId).append("\n");
    prompt.append("Action: ").append(step.action).append("\n");
    prompt.append("Scope: ").append(step.scope).append("\n");
    prompt.append("Description: ").append(step.description).append("\n\n");
    
    if (step.affectedLines != null && !step.affectedLines.isEmpty()) {
        prompt.append("Affected lines: ").append(step.affectedLines).append("\n\n");
    }
    
    if ("code".equals(step.scope) && !currentCode.isEmpty()) {
        // Include relevant code snippet
        String[] lines = currentCode.split("\\n");
        int startLine = Math.max(0, (step.affectedLines != null && !step.affectedLines.isEmpty() ? 
                step.affectedLines.get(0) : 1) - 1);
        int endLine = Math.min(lines.length, startLine + 20);
        
        prompt.append("Relevant code:\n```\n");
        for (int i = startLine; i < endLine && i < lines.length; i++) {
            prompt.append(String.format("%3d: %s\n", i + 1, lines[i]));
        }
        prompt.append("```\n\n");
    }
    
    prompt.append("Provide clear output:\n");
    prompt.append("- For edit: provide SEARCH/REPLACE blocks\n");
    prompt.append("- For add: provide code snippet\n");
    prompt.append("- For analyze: provide detailed explanation\n");
    
    return prompt.toString();
}
```

---

## 5. REQUIRED SPRING BEAN REGISTRATIONS

Add to **ApiSpringController** class or create a **@Configuration** class:

```java
@Bean
public ExecutorService codeStreamExecutor() {
    return Executors.newFixedThreadPool(4, r -> {
        Thread t = new Thread(r, "CodeStream-SSE");
        t.setDaemon(false);
        return t;
    });
}
```

---

## 6. UPDATE application.properties

Add these new properties (and update existing ones):

```properties
# Intent Classification
ai.intent.classifier.enabled=true
ai.intent.classifier.use-llm=false
ai.intent.classifier.off-topic.confidence-threshold=0.85
ai.intent.classifier.cache.enabled=true

# Execution Planning
ai.execution.plan.enabled=true
ai.execution.plan.max-steps=8
ai.execution.plan.dedup.enabled=true
ai.execution.plan.step-merge-threshold=0.75

# Context Ingestion
ai.context.ingestion.enabled=true
ai.context.ingestion.async.enabled=true
ai.context.ingestion.chunk-size=2200
ai.context.ingestion.max-chunks-per-scope=50
ai.context.ingestion.prune-old-indexes=true

# Machine profile (normal | weak)
ai.machine.profile=normal

# Existing configs...
```

---

## 7. TESTING CHECKLIST

After integration:

- [ ] **Compilation**: `mvn clean -DskipTests compile`
- [ ] **Intent Classification**: Test with off-topic message
- [ ] **Code Flow**: Test with code editing request
- [ ] **Menu Flow**: Test with menu design request
- [ ] **Attachment Analysis**: Test with JSON file
- [ ] **Async Ingestion**: Verify no blocking
- [ ] **Plan Generation**: Check deduplication works
- [ ] **SSE Events**: Verify all events fire in order
- [ ] **Error Handling**: Test with invalid inputs
- [ ] **Weak Machine**: Profile with 6GB RAM setup

---

## 8. COMMON ISSUES & FIXES

### Issue: "AiIntentClassifierService not autowired"
**Fix**: Ensure service class has `@Service` annotation

### Issue: "SSE events not in correct order"
**Fix**: Verify `Thread.sleep(50)` between events to prevent queue overflow

### Issue: "Memory leak from pending tasks"
**Fix**: Call `scopedIngestion.clearPendingTasks()` on shutdown

### Issue: "LLM inference hangs"
**Fix**: Add timeout: `llamaCppService.generateContentWithTimeout(prompt, 5000)`

---

## 9. FRONTEND INTEGRATION

In **AiAssistantChat.tsx**, listen for new events:

```typescript
case 'agentic_plan': {
  setPlanSteps(event.planSteps);
  setCurrentPlan(event);
  break;
}
case 'agentic_step': {
  setCurrentStep(event.current);
  setTotalSteps(event.total);
  setStepMessage(event.message);
  break;
}
case 'agentic_step_result': {
  // Apply patch to CodeMirror
  applyStepResult(event);
  break;
}
case 'all_steps_done': {
  setCompletion('success');
  setTimeout(() => closeAiPanel(), 2000);
  break;
}
```

---

**Generated**: May 11, 2026
**Status**: Ready for implementation
