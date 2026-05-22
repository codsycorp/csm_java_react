# AI Local Llama.cpp Integration – Complete Flow Documentation

**Last Updated:** May 22, 2026  
**Purpose:** Comprehensive guide for AI local (in-process GGUF inference) architecture, flow, and integration points.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Component Breakdown](#component-breakdown)
3. [Core Service: LlamaCppNativeService](#core-service-llamacppnativeservice)
4. [Orchestration Layer](#orchestration-layer)
5. [Controller & API Endpoints](#controller--api-endpoints)
6. [Frontend – SSE Stream Handling](#frontend--sse-stream-handling)
7. [Request Flow Examples](#request-flow-examples)
8. [Circuit Breaker & Resilience](#circuit-breaker--resilience)
9. [Configuration & Runtime Profiles](#configuration--runtime-profiles)
10. [Metrics & Monitoring](#metrics--monitoring)

---

## Architecture Overview

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  - AiAssistantChat.tsx (/system/developer/ai-assistant)         │
│  - CodeMirrorWithAiAssistant.tsx                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ SSE Stream / POST JSON
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              Backend Controllers (Spring Boot)                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ApiSpringController                                      │   │
│  │  - /ai-code-stream (SSE stream endpoint)                 │   │
│  │  - /ai-code-stream/{requestId}/cancel                   │   │
│  │  - /ai/propose-edits, /ai/apply-edits                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ AiLocalOpsController                                     │   │
│  │  - /ai-local/health (check llama status)                 │   │
│  │  - /ai-local/execute-local-plan (SSE orchestration)      │   │
│  │  - /ai-local/models (list available models)              │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│           Orchestration & Processing Services                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ AiLocalOrchestrationService                            │    │
│  │  - 4/6-phase orchestration pipeline                    │    │
│  │  - Intent classification, candidate generation         │    │
│  │  - Agentic web search                                  │    │
│  └────────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ AiIntentClassifierService                              │    │
│  │  - Classify user intent (code-gen, refactor, debug)    │    │
│  │  - Route to appropriate handler                        │    │
│  └────────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ LargeFileChunkingService                               │    │
│  │  - Chunk large files for summarization                 │    │
│  │  - Aggregate chunks → final summary                    │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│        LlamaCppNativeService (Core Inference Engine)            │
│                                                                  │
│  ┌─ Model Loading (PostConstruct) ──────────────────────────┐  │
│  │  - Load GGUF model from configured path                 │  │
│  │  - Preload if ai.local.llama.preload-on-startup=true    │  │
│  │  - Apply runtime profile (conservative/balanced/max)    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ Inference Methods ──────────────────────────────────────┐  │
│  │  - generateContent(prompt)                              │  │
│  │  - generateContentFast(prompt, maxTokens)               │  │
│  │  - generateContentWithTaskTracking(prompt, requestId)   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ Request Lifecycle ──────────────────────────────────────┐  │
│  │  1. Register active task (if requestId provided)        │  │
│  │  2. Prepare prompt (system prompt, JSON forcing)        │  │
│  │  3. Check circuit breaker (skip if open)                │  │
│  │  4. Clip prompt if exceeds maxPromptChars               │  │
│  │  5. Run inference (LlamaModel.complete)                 │  │
│  │  6. Parse output (JSON/text)                            │  │
│  │  7. Record metrics & cleanup task                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ Circuit Breaker & Resilience ───────────────────────────┐  │
│  │  - Track consecutive failures                           │  │
│  │  - Detect hard failures (GPU timeout, KV cache full)    │  │
│  │  - Open circuit on threshold + long cooldown            │  │
│  │  - Reset on first success                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ Metrics & Diagnostics ──────────────────────────────────┐  │
│  │  - requestCount, failedRequestCount                     │  │
│  │  - promptClipCount, inFlightRequests                    │  │
│  │  - lastRequestDurationMs, circuitOpenCount              │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
        ┌──────────────────────────────┐
        │   GGUF Model (llama.cpp)     │
        │  - In-process JNI binding    │
        │  - Direct GPU access (Metal) │
        │  - No external process       │
        └──────────────────────────────┘
```

---

## Component Breakdown

### 1. **LlamaCppNativeService** (Core Engine)
**Location:** `backend/src/main/java/net/phanmemmottrieu/service/LlamaCppNativeService.java`

**Role:** Direct model inference, state management, circuit breaking.

**Key Attributes:**
```java
// Model & configuration
private volatile LlamaModel model;
private String modelPath;
private int contextWindow, maxTokens, temperature, topP;
private int threads, batchSize, ubatchSize, gpuLayers;

// Circuit breaker state
private volatile long circuitOpenedAt;
private AtomicInteger consecutiveFailures;
private volatile long circuitCooldownMs;

// Metrics
private AtomicLong requestCount, failedRequestCount;
private AtomicInteger inFlightRequests;
private AtomicLong promptClipCount;

// Task tracking (for cancellation)
private static ConcurrentHashMap<String, Thread> activeInferenceTasks;
```

**Main Methods:**

| Method | Purpose | Returns |
|--------|---------|---------|
| `isAvailable()` | Enabled + model file exists | boolean |
| `isHealthy()` | Available + circuit not open | boolean |
| `isCircuitOpen()` | Check if in cooldown | boolean |
| `generateContent(prompt)` | Full inference response | String (JSON or error) |
| `generateContentFast(prompt, maxTokens)` | Capped token inference | String (JSON or error) |
| `generateContentWithTaskTracking(prompt, requestId)` | Trackable inference | String (JSON or error) |
| `cancelInferenceTask(requestId)` | Interrupt running task | boolean |

---

### 2. **AiLocalOpsController** (Local AI Operations)
**Location:** `backend/src/main/java/net/phanmemmottrieu/controller/AiLocalOpsController.java`

**Role:** Health checks, model management, plan execution.

**Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/ai-local/health` | GET | Check llama availability, circuit status |
| `/ai-local/models` | GET | List available GGUF models |
| `/ai-local/models/recommendations` | GET | Get recommended models for current system |
| `/ai-local/scan-dry-run` | POST | Preview orchestration steps (dry-run) |
| `/ai-local/execute-local-plan` | POST | Execute plan with SSE streaming |

**Health Response Example:**
```json
{
  "reasoningBeanPresent": true,
  "reasoningAvailable": true,
  "reasoningHealthy": true,
  "circuitOpen": false,
  "modelPath": "./csm_datas/ai_local/model/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf",
  "circuitOpenedAt": 0,
  "circuitCooldownMs": 300000,
  "requestMetrics": {
    "totalRequests": 1250,
    "failedRequests": 3,
    "inFlightRequests": 0,
    "promptClipCount": 12
  }
}
```

---

### 3. **ApiSpringController** (Primary API Handler)
**Location:** `backend/src/main/java/net/phanmemmottrieu/controller/ApiSpringController.java`

**Role:** Main request dispatcher, stream management, code generation.

**Key Integration Points:**

```java
// Line 451: LlamaCppNativeService dependency
private final LlamaCppNativeService llamaCppNativeService;

// Line 1604-1625: Stream routing decision
if (llamaCppNativeService == null || !llamaCppNativeService.isAvailable()) {
    // Fall back to cloud provider
} else if (llamaCppNativeService.isCircuitOpen()) {
    // Circuit is open, skip to cloud
} else {
    // Use local llama for inference
}

// Line 3401, 4098: Repair & Verify steps
String repairRaw = llamaCppNativeService.generateContentFast(repairPrompt, tokenCap);
String verifyOutput = llamaCppNativeService.generateContentFast(verifyPrompt, verifyTokenCap);

// Line 4937-4938: Cancel inference
if (llamaCppNativeService != null) {
    cancelled = llamaCppNativeService.cancelInferenceTask(safeRequestId);
}

// Line 30888: Cancel endpoint
@PostMapping("/ai-code-stream/{requestId}/cancel")
public ResponseEntity<?> cancelAiCodeStream(@PathVariable String requestId) { ... }
```

---

### 4. **AiLocalOrchestrationService** (Multi-Phase Pipeline)
**Location:** `backend/src/main/java/net/phanmemmottrieu/service/AiLocalOrchestrationService.java`

**Role:** Coordinate multi-step AI workflows, intent classification, agentic routing.

**6-Phase Orchestration Flow:**

1. **Phase 1: Parse & Classify**
   - Analyze user query complexity
   - Route via `AiIntentClassifierService`
   - Determine: code-gen, refactor, debug, explain

2. **Phase 2: Context Gathering**
   - Fetch relevant code snippets
   - Build embeddings
   - Prepare code context

3. **Phase 3: Planning**
   - Generate orchestration plan (steps)
   - Validate feasibility
   - Stream plan to frontend

4. **Phase 4: Execution**
   - Step 1: Candidate generation (via llama)
   - Step 2: Review & filter
   - Step 3: Refinement loop

5. **Phase 5: Verification**
   - Syntax check
   - Correctness validation
   - Test placeholder generation

6. **Phase 6: Output**
   - Format edits (structured JSON)
   - Apply post-processing
   - Send final response

**Llama Usage in Orchestration:**
```java
// Line 4182: Agentic web search result summarization
String summary = llamaCppNativeService.generateContentFast(
    "Summarize this web search result...", 
    Math.max(32, agenticWebSearchLlamaMaxOutputTokens)
);

// Line 4167: Health check before operation
if (llamaCppNativeService == null || !llamaCppNativeService.isHealthy()) {
    // Fall back to cloud orchestration
}
```

---

### 5. **AiIntentClassifierService** (Intent Detection)
**Location:** `backend/src/main/java/net/phanmemmottrieu/service/AiIntentClassifierService.java`

**Role:** Classify user intent, determine complexity, route to handler.

**Classification Modes:**
- **Fast (< 1.5 complexity):** Regex patterns + heuristics
- **LLM (>= 1.5 complexity & local available):** Use llama classifier
- **Fallback:** Cloud API

**Llama Integration:**
```java
// Line 241: Use LLM classifier if available
if (useLlmClassifier && llamaCppNativeService != null) {
    // Get LLM classification
    String response = llamaCppNativeService.generateContentFast(classifyPrompt, 8);
}

// Line 300: Complexity-based routing
if (complexity > 1.5 && llamaCppNativeService != null) {
    // Use LLM for better accuracy
}

// Line 387: Direct classification call
String response = llamaCppNativeService.generateContentFast(prompt, 0);
```

---

### 6. **LargeFileChunkingService** (Bulk Summarization)
**Location:** `backend/src/main/java/net/phanmemmottrieu/service/LargeFileChunkingService.java`

**Role:** Process large files via chunking strategy, summarize via llama.

**Chunking Flow:**
1. Split file into 500-2000 char chunks
2. For each chunk: `generateContent(summaryPrompt + chunk)`
3. Collect summaries
4. Aggregate summaries: `generateContent(aggregatePrompt + summaries)`
5. Return final summary

**Llama Usage:**
```java
// Line 527: Per-chunk summarization
String raw = llamaCppNativeService.generateContent(chunkPrompt);

// Line 687: Aggregate summarization
String raw = llamaCppNativeService.generateContent(aggregatePrompt);
```

---

## Core Service: LlamaCppNativeService

### Service Initialization

```java
@PostConstruct
public void validateStartupAvailability() {
    // 1. Check if enabled via config
    if (!enabled) return;
    
    // 2. Verify model file exists
    Path path = resolveModelPath(modelPath);
    if (!Files.isRegularFile(path)) {
        throw new IllegalStateException("Model file not found: " + path);
    }
    
    // 3. Apply runtime profile settings
    // Profile: conservative, balanced, max
    // Adjusts: threads, batchSize, gpuLayers, contextWindow
    
    // 4. Preload model if configured
    if (preloadOnStartup) {
        ensureModelLoaded();
    }
}
```

### Inference Request Lifecycle

#### Step 1: Register Task (Optional)
```java
if (requestId != null && !requestId.isBlank()) {
    registerActiveInferenceTask(requestId);  // Store thread reference
}
```

#### Step 2: Validate & Prepare Prompt
```java
String safePrompt = String.valueOf(prompt == null ? "" : prompt).trim();

// Check availability
if (!isAvailable()) return createErrorJson("Provider unavailable", "LOCAL_PROVIDER_UNAVAILABLE");
if (isCircuitOpen()) return createErrorJson("Circuit open", "CIRCUIT_OPEN");

// Add system prompt if configured
if (systemPrompt != null && !systemPrompt.isBlank()) {
    safePrompt = systemPrompt.trim() + "\n" + safePrompt;
}

// Detect JSON expectation & add JSON forcing prefix
if (detectJsonExpectation(safePrompt)) {
    safePrompt = "You MUST output ONLY valid JSON...\n\n" + safePrompt;
}
```

#### Step 3: Clip Prompt if Needed
```java
int maxChars = effectiveMaxPromptChars();
if (safePrompt.length() > maxChars) {
    safePrompt = safePrompt.substring(0, maxChars);
    promptClipCount.incrementAndGet();
    log.warn("Prompt clipped to {} chars", maxChars);
}
```

#### Step 4: Run Inference
```java
synchronized (modelLock) {
    ensureModelLoaded();  // Lazy load if needed
    
    // Create inference parameters (temperature, topP, topK, etc.)
    InferenceParameters infParams = new InferenceParameters()
        .setTemperature(temperature)
        .setTopP(topP)
        .setTopK(topK)
        .setNPredict(effectiveMaxTokens());
    
    // Run inference
    String output = model.complete(safePrompt, infParams);
}
```

#### Step 5: Parse & Process Output
```java
String trimmed = output.trim();

// Try parse as JSON
try {
    ObjectMapper mapper = new ObjectMapper();
    JsonNode parsed = mapper.readTree(trimmed);
    // Return as JSON string
    return mapper.writeValueAsString(parsed);
} catch (Exception e) {
    // Wrap as text response
    return createSuccessJson(trimmed);
}
```

#### Step 6: Record Metrics & Cleanup
```java
// Record success
requestCount.incrementAndGet();
lastRequestDurationMs.set(duration);
recordSuccess();  // Reset circuit on success

// Cleanup task tracking
if (requestId != null && !requestId.isBlank()) {
    unregisterActiveInferenceTask(requestId);
}

return response;
```

---

## Orchestration Layer

### AiLocalOrchestrationService Decision Tree

```
User Query
    ↓
Health Check: isHealthy() ?
    ├─ NO  → Use Cloud (Gemini/Claude)
    │
    └─ YES ↓
      Check Configuration Flags
          ├─ localOnlyIfNoCloud=true ? (strict local-only)
          │   ├─ NO  → Use hybrid (local + fallback)
          │   └─ YES → Pure local (no fallback)
          │
          └─ Complexity Analysis
              ├─ Simple (< 1.5) → Fast intent classify
              │                   → Direct local generation
              │
              ├─ Medium (1.5 - 3.0) → LLM intent classify
              │                        → Local orchestration
              │
              └─ Complex (> 3.0) → Multi-step orchestration
                                   → Phase 1-6 pipeline
                                   → Agentic web search
```

### Configuration Flags

| Config | Type | Default | Purpose |
|--------|------|---------|---------|
| `ai.local.llama.enabled` | boolean | false | Enable/disable llama provider |
| `ai.local.llama.model-path` | String | `./csm_datas/ai_local/model/...` | GGUF model file location |
| `ai.local.llama.preload-on-startup` | boolean | true | Load model at boot |
| `ai.local.llama.runtime-profile` | String | `balanced` | Conservative/Balanced/Max |
| `ai.local.llama.context-window` | int | 8192 | Input context size |
| `ai.local.llama.max-tokens` | int | 512 | Max output tokens |
| `ai.local.llama.max-prompt-chars` | int | 500000 | Prompt char limit before clip |
| `ai.local.llama.circuit.failure-threshold` | int | 5 | Failures before circuit open |
| `ai.local.llama.circuit.cooldown-ms` | long | 300000 | Normal cooldown (5 min) |
| `ai.local.llama.circuit.hard-cooldown-ms` | long | 900000 | Hard failure cooldown (15 min) |

---

## Controller & API Endpoints

### Request Sequence Diagram

```
Frontend                Backend                 LlamaCpp
   │                       │                        │
   │──── POST /ai-code-stream ──────────────────────│
   │     (SSE subscription)                         │
   │                       │                        │
   │                   Analyze request              │
   │                       │                        │
   │                   Check llama health?          │
   │                       │                        │
   │                   Yes ├─ generateContentFast()─│
   │                       │  (inference)           │
   │                       │                        │
   │                       │◄── Output JSON ──────│
   │                       │                        │
   │◄──── SSE: complete ───│                        │
   │      {result, metrics}│                        │
   │                       │                        │
```

### Main Endpoints

#### 1. AI Code Stream (SSE)
```
POST /ai-code-stream
Content-Type: application/json
Accept: text/event-stream

{
  "prompt": "Generate unit test for...",
  "context": { ... },
  "requestId": "req-12345"  // Optional, enables cancellation
}

Response (SSE):
event: streaming
data: {"chunk": "public class...", "tokenCount": 45}

event: complete
data: {"result": {...}, "metrics": {...}, "duration": 1234}
```

#### 2. Cancel Inference
```
POST /ai-code-stream/{requestId}/cancel

Response:
{
  "cancelled": true,
  "message": "Inference task cancelled"
}
```

#### 3. Health Check
```
GET /ai-local/health

Response:
{
  "reasoningBeanPresent": true,
  "reasoningAvailable": true,
  "reasoningHealthy": true,
  "circuitOpen": false,
  "modelPath": "...",
  "requestMetrics": { ... }
}
```

---

## Frontend – SSE Stream Handling

### TypeScript Flow

**File:** `frontend-admin/src/pages/system/developer/AiAssistantChat.tsx`

```typescript
// 1. Command input
async function handleLocalPlanCommand() {
  const payload = {
    prompt: userMessage,
    context: { code, cursorLine, ... },
    requestId: generateUUID()  // For cancellation
  };
  
  // 2. Call backend stream endpoint
  const response = await fetch('/api/ai-code-stream', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });
  
  // 3. Consume SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // Parse line-based SSE format
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        
        // 4. Handle different event types
        if (data.event === 'streaming') {
          onChunk(data.chunk);  // Accumulate text
        } else if (data.event === 'complete') {
          onComplete(data.result);  // Show final result
        } else if (data.event === 'error') {
          onError(data.message);
        }
      }
    }
  }
}

// 5. Cancellation
function cancelRequest(requestId: string) {
  fetch(`/api/ai-code-stream/${requestId}/cancel`, { method: 'POST' });
}
```

**File:** `frontend-admin/src/api/ai/sse-stream.ts`

```typescript
export async function consumeSseStream(
  response: Response,
  options: ConsumeSseOptions
): Promise<ConsumeSseResult> {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        const eventType = line.slice(7).trim();
        // Next line is data
      } else if (line.startsWith('data: ')) {
        const payload = JSON.parse(line.slice(6));
        
        // Call event handler
        await options.onEvent({
          stage: 'streaming',
          type: eventType,
          payload
        });
      }
    }
  }
  
  return { completed: true };
}
```

---

## Request Flow Examples

### Example 1: Simple Code Generation

```
1. User types: "Generate a simple REST endpoint for fetching users"
   
2. Frontend: POST /ai-code-stream
   {
     "prompt": "Generate a simple REST endpoint...",
     "context": { code: "", cursorLine: 0 },
     "requestId": "req-abc123"
   }

3. Backend (ApiSpringController):
   - Check: llamaCppNativeService.isAvailable() → YES
   - Check: llamaCppNativeService.isCircuitOpen() → NO
   - Action: Call AiLocalOrchestrationService

4. AiLocalOrchestrationService:
   - Intent classification: "code-gen"
   - Call: llamaCppNativeService.generateContentFast(prompt, 512)
   
5. LlamaCppNativeService:
   - Register task: activeInferenceTasks.put("req-abc123", currentThread)
   - Load model (if not loaded)
   - Prepare prompt with system message
   - Run: model.complete(prompt, inferenceParams)
   - Output: "public ResponseEntity<List<User>> getUsers() { ... }"
   - Record metrics: requestCount++, duration=1234ms
   - Unregister task

6. Frontend receives SSE:
   event: streaming
   data: {"chunk": "public ResponseEntity", "tokenCount": 5}
   
   ... more chunks ...
   
   event: complete
   data: {
     "result": {...},
     "metrics": {
       "duration": 1234,
       "totalTokens": 156,
       "provider": "local_llama"
     }
   }

7. UI displays generated code with syntax highlighting
```

### Example 2: Inference Cancellation

```
1. User starts long inference:
   POST /ai-code-stream
   { "requestId": "req-xyz789", "prompt": "Long multi-step..." }

2. LlamaCppNativeService:
   - Register: activeInferenceTasks.put("req-xyz789", Thread-1)
   - Start inference (blocking in llama.cpp)

3. User clicks "Cancel" button (e.g., after 2 seconds)

4. Frontend: POST /ai-code-stream/req-xyz789/cancel

5. Backend (ApiSpringController line 30841):
   if (llamaCppNativeService.cancelInferenceTask("req-xyz789")) {
       // Interrupt Thread-1
   }

6. LlamaCppNativeService.cancelInferenceTask():
   - Lookup activeInferenceTasks.get("req-xyz789")
   - Thread.interrupt() → llama.cpp unwinds gracefully
   - Mark as cancelled: cancelledTasks.put("req-xyz789", 1)

7. Frontend receives SSE error:
   event: error
   data: { "message": "Inference cancelled by user" }

8. UI shows "Cancelled" state, clears pending output
```

### Example 3: Circuit Breaker Activation

```
1. User makes 5 consecutive requests
   Request 1: FAILURE (timeout)
   Request 2: FAILURE (GPU error)
   Request 3: FAILURE (KV cache full)
   Request 4: FAILURE (Metal timeout)
   Request 5: FAILURE (command buffer error)

2. LlamaCppNativeService (each failure):
   - consecutiveFailures.incrementAndGet()
   - Call recordFailure(errorMessage)
   - Detect hard failure pattern (contains "gpu timeout", "metal", etc.)
   - Check: consecutiveFailures (5) >= cbFailureThreshold (5) → TRUE
   - Action: circuitOpenedAt = System.currentTimeMillis()
   - Log: "Local llama circuit OPENED after 5 consecutive failures"

3. Request 6 arrives:
   - isCircuitOpen() → (now - circuitOpenedAt) < circuitCooldownMs
   - Returns TRUE
   - Inference skipped: return createErrorJson("Circuit open", "CIRCUIT_OPEN")

4. Frontend receives:
   {
     "error": "Circuit open",
     "reason": "CIRCUIT_OPEN",
     "retryAfter": 900000  // 15 minutes (hard cooldown)
   }
   UI shows: "Local AI temporarily unavailable. Using cloud..."

5. After 15 minutes:
   - isCircuitOpen() → (now - circuitOpenedAt) >= circuitCooldownMs → FALSE
   - Circuit closes automatically
   - Next request: inference resumes
   - recordSuccess() → circuitOpenedAt = 0, log "circuit reset"
```

---

## Circuit Breaker & Resilience

### Circuit States

```
┌─────────────────────┐
│      CLOSED         │  ← Normal state, inference allowed
│ consecutiveFailures │  
│        = 0          │
└────────┬────────────┘
         │ Failure occurs
         ▼
┌─────────────────────┐
│      HALF-OPEN      │  ← Building up failures
│ consecutiveFailures │  
│       1 - 4         │
└────────┬────────────┘
         │ 5th failure
         ▼
┌─────────────────────────────────────────┐
│            OPEN (COOLDOWN)              │
│  circuitOpenedAt = now                  │
│  circuitCooldownMs = duration           │
│  ├─ Normal: 5 min (300000ms)            │
│  └─ Hard: 15 min (900000ms)             │
│  inference skipped, use cloud           │
└────────┬────────────────────────────────┘
         │ After cooldown expires + success
         ▼
┌─────────────────────┐
│      CLOSED         │  ← Recovered
│ consecutiveFailures │  
│        = 0          │
└─────────────────────┘
```

### Hard Failure Patterns

Errors containing these substrings trigger 15-minute hard cooldown:

```
- "kIOAccelCommandBufferCallbackErrorTimeout"
- "gpu timeout"
- "metal"
- "kv cache is full"
- "input prompt is too big compared to kv"
- "command buffer"
- "failed to decode the batch"
```

---

## Configuration & Runtime Profiles

### Runtime Profiles

#### Conservative Profile
- **Use Case:** 2-core / 4GB RAM systems
- **Settings:**
  - threads: 1
  - batchSize: 32
  - ubatchSize: 16
  - contextWindow: 4096 (half default)
  - maxTokens: 256 (half default)

#### Balanced Profile (Default)
- **Use Case:** 4-core / 8GB RAM systems
- **Settings:**
  - threads: 2
  - batchSize: 64
  - ubatchSize: 32
  - contextWindow: 8192
  - maxTokens: 512

#### Max Profile
- **Use Case:** 8+ core / 16GB+ RAM systems
- **Settings:**
  - threads: 4
  - batchSize: 128
  - ubatchSize: 64
  - contextWindow: 16384 (double default)
  - maxTokens: 1024

### Environment Variables (config.env)

```bash
# Enable/disable local llama
AI_LOCAL_LLAMA_ENABLED=true

# Model path (relative or absolute)
AI_LOCAL_LLAMA_MODEL_PATH=./csm_datas/ai_local/model/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf

# Inference parameters
AI_LOCAL_LLAMA_CONTEXT_WINDOW=8192
AI_LOCAL_LLAMA_MAX_TOKENS=512
AI_LOCAL_LLAMA_TEMPERATURE=0.2
AI_LOCAL_LLAMA_TOP_P=0.9
AI_LOCAL_LLAMA_TOP_K=40

# Hardware allocation
AI_LOCAL_LLAMA_THREADS=2
AI_LOCAL_LLAMA_BATCH_SIZE=64
AI_LOCAL_LLAMA_UBATCH_SIZE=32
AI_LOCAL_LLAMA_GPU_LAYERS=18

# Circuit breaker
AI_LOCAL_LLAMA_CIRCUIT_FAILURE_THRESHOLD=5
AI_LOCAL_LLAMA_CIRCUIT_COOLDOWN_MS=300000
AI_LOCAL_LLAMA_CIRCUIT_HARD_COOLDOWN_MS=900000

# Runtime optimization
AI_LOCAL_LLAMA_RUNTIME_PROFILE=balanced
AI_LOCAL_LLAMA_PRELOAD_ON_STARTUP=true
AI_LOCAL_LLAMA_FAIL_FAST=true

# Constraints
AI_LOCAL_LLAMA_MAX_PROMPT_CHARS=500000
AI_LOCAL_LLAMA_CONTEXT_WINDOW_HARD_CAP=32768
AI_LOCAL_LLAMA_MAX_TOKENS_HARD_CAP=32768
```

---

## Metrics & Monitoring

### Available Metrics

```java
// Request statistics
requestCount         // Total inference requests
failedRequestCount   // Failed requests
inFlightRequests     // Currently running inferences

// Prompt processing
promptClipCount      // Times prompt was clipped
promptClipCharsRemoved  // Total chars removed by clipping

// Performance
lastRequestDurationMs  // Last request duration
lastPromptChars       // Last request input length
lastOutputChars       // Last request output length

// Resilience
circuitOpenCount     // Total times circuit opened
consecutiveFailures  // Current failure streak
lastFailureMessage   // Last error message
lastPromptDigest     // SHA-256 digest of last prompt
```

### Metrics Endpoint

```
GET /api/ai/metrics

Response:
{
  "llama": {
    "requestCount": 1250,
    "failedRequestCount": 3,
    "inFlightRequests": 1,
    "promptClipCount": 12,
    "lastRequestDurationMs": 2345,
    "circuitOpenCount": 2,
    "circuitOpenedAt": 0,
    "circuitCooldownMs": 300000,
    "circuitOpen": false
  },
  "cloud": {
    "requestCount": 5432,
    "failedRequestCount": 1
  },
  "hybrid": {
    "totalRequests": 6682,
    "localRatio": 0.187  // 18.7% served by local
  }
}
```

### Reset Metrics

```
POST /api/ai/metrics/reset

Response:
{
  "reset": true,
  "timestamp": "2026-05-22T10:30:00Z"
}
```

---

## Troubleshooting

### Model Not Loading

**Symptoms:**
- `isAvailable() = false`
- Log: "Model file not found at..."

**Solutions:**
1. Check file exists: `ls -la ./csm_datas/ai_local/model/`
2. Verify path in config: `AI_LOCAL_LLAMA_MODEL_PATH`
3. Set `AI_LOCAL_LLAMA_FAIL_FAST=false` to allow degradation

### Circuit Breaker Stuck Open

**Symptoms:**
- `/ai-local/health` shows `circuitOpen: true`
- All requests return `"CIRCUIT_OPEN"`

**Solutions:**
1. Wait for cooldown to expire (5 min normal, 15 min hard)
2. Check error logs for pattern (hard failure?)
3. Manual reset (if needed):
   ```bash
   POST /api/ai/metrics/reset
   ```
4. Restart Spring Boot application

### OOM / GPU Memory Issues

**Symptoms:**
- Error: "kv cache is full" or "command buffer"
- Inference times increase dramatically

**Solutions:**
1. Reduce `AI_LOCAL_LLAMA_CONTEXT_WINDOW` (e.g., 4096 instead of 8192)
2. Reduce `AI_LOCAL_LLAMA_BATCH_SIZE` (e.g., 32 instead of 64)
3. Switch to conservative profile: `AI_LOCAL_LLAMA_RUNTIME_PROFILE=conservative`
4. Reduce `AI_LOCAL_LLAMA_GPU_LAYERS` (offload fewer layers to GPU)

### Slow Inference

**Symptoms:**
- Inference takes > 5 seconds
- UI timeout on SSE stream

**Solutions:**
1. Reduce `AI_LOCAL_LLAMA_MAX_TOKENS` (current: 512 → try 256)
2. Increase threads: `AI_LOCAL_LLAMA_THREADS` (if CPU has cores available)
3. Preload model: `AI_LOCAL_LLAMA_PRELOAD_ON_STARTUP=true`
4. Check system load: `top`, `Activity Monitor`

---

## Architecture Decisions

### Why In-Process (JNI)?
- **Latency:** No network round-trip, direct memory access
- **Privacy:** Data never leaves machine
- **Cost:** No per-request API charges
- **Availability:** Works offline

### Why Circuit Breaker?
- **Resilience:** Protect against cascade failures
- **UX:** Quick fallback to cloud, no hanging requests
- **Observability:** Track failure patterns, alert on issues

### Why SSE for Streaming?
- **Compatibility:** Works in all modern browsers
- **Simplicity:** Native fetch API support
- **Backpressure:** Built-in flow control, no buffer explosion

### Why Task Tracking?
- **Cancellation:** User can abort long-running tasks
- **Resource Cleanup:** Prevent orphaned threads
- **Monitoring:** Know what's currently running

---

## Future Enhancements

1. **Multi-Model Support:** Load different GGUF models dynamically
2. **Batch Inference:** Process multiple prompts in parallel
3. **Fine-tuning:** LoRA adapters for domain-specific tasks
4. **Quantization Variants:** Q4, Q8, FP16 model selection UI
5. **Metrics Export:** Prometheus endpoint for monitoring
6. **Cache Layer:** Semantic similarity search for prompt deduplication

---

## References

- **Llama.cpp:** https://github.com/ggerganov/llama.cpp
- **GGUF Format:** https://huggingface.co/docs/transformers/gguf
- **Spring Boot SSE:** https://spring.io/blog/2017/06/06/short-polling-long-polling-and-server-sent-events
- **Circuit Breaker Pattern:** https://martinfowler.com/bliki/CircuitBreaker.html

---

**Document Version:** 1.0  
**Last Reviewed:** May 22, 2026  
**Maintained By:** AI Local Team
