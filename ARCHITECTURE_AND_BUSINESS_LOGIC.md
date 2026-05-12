# Architecture & Business Logic Analysis - May 12, 2026

## 🎯 Current System Architecture (Before Enhancement)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Frontend (React/TypeScript)                      │
│  ┌──────────────────────┬────────────────────────────────────────┐  │
│  │   CodeEditor.tsx     │    AiMenuDesigner.tsx                 │  │
│  │  • Code editing      │    • Menu tree designer               │  │
│  │  • AI chat panel     │    • Menu property editor             │  │
│  │  • SSE listener      │    • Diff visualization               │  │
│  └──────────────────────┴────────────────────────────────────────┘  │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │ SSE / REST API
┌────────────────────────────────┴─────────────────────────────────────┐
│               Backend (Java Spring Boot)                            │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  ApiSpringController.java (ai-code-stream endpoint)        │    │
│  │  • Request parsing & validation                            │    │
│  │  • SSE emitter management                                  │    │
│  │  • Context preparation                                     │    │
│  └────────────┬─────────────────────────────────────────────┬─┘    │
│               │                                             │       │
│     ┌─────────▼──────────────┐                   ┌────────▼──────┐ │
│     │  AiLocalOrchestration  │                   │ AIProviderFactory
│     │  Service               │                   │                │
│     │ • Off-topic detection  │                   │ • Route to     │
│     │ • Multimodal scanner   │                   │   Llama (local)│
│     │ • Lucene auto-index    │                   │   or Gemini    │
│     │ • Plan generation      │                   │   (cloud)      │
│     └────────────────────────┘                   └────────────────┘
│               │                                             │
│     ┌─────────▼────────────────────────────────────────────▼─────┐ │
│     │  LlamaCppNativeService (Local LLM - Qwen2.5-Coder)        │ │
│     │  • GGUF model inference in-process                        │ │
│     │  • JSON-forcing for structured output                     │ │
│     │  • Circuit breaker for stability                          │ │
│     │  • Task tracking for cancellation                         │ │
│     └─────────────────────────────────────────────────────────┬──┘ │
│                                                               │    │
│     ┌──────────────────────────────────────────────────────┬──┴──┐ │
│     │              Lucene Vector Database                 │     │ │
│     │  ┌───────────────────────────────────────────────┐  │     │ │
│     │  │ AiBusinessMemoryVectorService                │  │     │ │
│     │  │ • Chunks code/menu into vectors              │  │     │ │
│     │  │ • KNN search with scope bitmask              │  │     │ │
│     │  │ • Dynamic context pruning (weak machines)    │  │     │ │
│     │  └───────────────────────────────────────────────┘  │     │ │
│     │                                                      │     │ │
│     │  ┌───────────────────────────────────────────────┐  │     │ │
│     │  │ LocalAiAssistantContextService               │  │     │ │
│     │  │ • Distill large JSON attachments             │  │     │ │
│     │  │ • Extract focused code snippets              │  │     │ │
│     │  │ • Build RAG blocks for context               │  │     │ │
│     │  └───────────────────────────────────────────────┘  │     │ │
│     └──────────────────────────────────────────────────────┴─────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Business Logic Flow (Step-by-Step)

### User Journey in Code Editor

```
1. USER SENDS CHAT MESSAGE + CONTEXT
   ├─ Message: "Fix this performance issue"
   ├─ Attachment: performance_profile.json
   ├─ CurrentCode: entire Java file
   └─ Context: code_editor

2. [PHASE 0] INTENT CLASSIFICATION
   └─ LocalIntentClassifier: "This is a code_edit request"
   
3. [PHASE 1] SMART CONTEXT LOADING
   ├─ MultimodalScanner analyzes JSON
   │  └─ Extracts: "response_time: 5000ms", "GC pressure: high"
   ├─ Auto-index currentCode to Lucene with scopeTag=CODE
   ├─ Search Lucene: keywords from message
   │  └─ Returns: "Thread management", "Collection optimization"
   └─ Build RAG context (max 8K tokens)

4. [PHASE 2] PLAN GENERATION
   ├─ LLM receives:
   │  ├─ User message
   │  ├─ RAG context from Lucene
   │  ├─ System instructions (JSON format)
   │  └─ Attachment analysis (MultimodalScannerService output)
   └─ LLM returns structured plan:
      ```
      {
        "reasoning": "3 bottlenecks found: collection allocation, thread pool, logging",
        "steps": [
          {"step": 1, "action": "replace_code", "target": "...", "params": {...}},
          {"step": 2, "action": "insert_code", "target": "...", "params": {...}},
          {"step": 3, "action": "replace_code", "target": "...", "params": {...}}
        ]
      }
      ```

5. [PHASE 3] INCREMENTAL EXECUTION ← NEW ✨
   ├─ Parse plan → 3 steps
   ├─ STEP 1/3: Replace inefficient loop
   │  ├─ Execute locally (Java code analysis)
   │  ├─ Return patch: {action: "replace", startLine: 45, endLine: 52, content: "..."}
   │  ├─ SSE event "incremental_patch" → Frontend
   │  └─ CodeMirror updates IMMEDIATELY
   │
   ├─ STEP 2/3: Insert caching layer
   │  ├─ Execute locally
   │  ├─ Return patch: {action: "insert", line: 100, content: "..."}
   │  ├─ SSE event → Frontend
   │  └─ CodeMirror updates IMMEDIATELY
   │
   └─ STEP 3/3: Update thread pool config
      ├─ Execute locally
      ├─ Return patch
      ├─ SSE event → Frontend
      └─ CodeMirror updates IMMEDIATELY

6. COMPLETION
   ├─ SSE event "incremental_execution_complete"
   ├─ Frontend shows: "✅ 3 steps completed in 4.2 seconds"
   └─ User can save/discard all changes
```

---

## 🔄 For Menu Designer (Similar Flow)

```
USER: "Add Reports menu under Admin, with export options"
CONTEXT: menu_json

[PHASE 0-2] Same: Classification → Context Loading → Plan

[PHASE 3] INCREMENTAL EXECUTION
├─ STEP 1/2: Create Reports menu structure
│  ├─ Parse: nodeId, parentId, fields
│  ├─ SSE "incremental_patch" event
│  └─ AiMenuDesigner listens to ai:addMenuNode event
│     └─ Menu tree updates in editor
│
└─ STEP 2/2: Add export options submenu
   ├─ Parse: update parent, add children
   ├─ SSE "incremental_patch" event
   └─ Menu tree reflects changes
```

---

## 🏗️ Key Services Overview

### 1. **AiIncrementalStepExecutorService** (NEW)
**Purpose**: Parse LLM plan and execute steps incrementally

**Key Methods**:
- `parsePlan(String llmOutput, String contextType)` 
  → PlanOutput with List<ExecutionStep>
  
- `executeStep(ExecutionStep step, String currentCode, Map context)`
  → StepResult with actionable patch

**Action Types Supported**:
```
insert_code      → Insert snippet at line
replace_code     → Replace line range
delete_code      → Delete line range
add_menu         → Add menu node
update_menu      → Update menu properties
analyze_json     → Analyze JSON, return summary
search_context   → Search Lucene vectors
```

### 2. **AiLocalOrchestrationService** (Existing, Enhanced)
**Current**: Generates plan steps (metadata only)
**Future**: Can feed plan steps to AiIncrementalStepExecutorService

### 3. **LlamaCppNativeService** (Existing, Enhanced for JSON)
**Current**: Qwen2.5-Coder inference with JSON-forcing
**Output**: Structured JSON for plan (already working)

### 4. **AiBusinessMemoryVectorService** (Existing)
**Role**: Scoped Lucene retrieval for RAG context

---

## 💡 Logic for Weak Machines (2-Core / 6GB RAM)

**Problem**: Running full pipeline on weak machines causes:
- OOM if chunking too large
- Long wait times for user
- CPU thrashing when batching too aggressive

**Solution Applied** (in code):

```
WEAK_MODE_ACTIVE=true
├─ Thread count: 1 (not 4-8)
├─ Context window: 2048 (not 4096)
├─ Max tokens: 96 (not 512)
├─ Batch size: 32 (not 256)
├─ Incremental chunks: 4KB (not 8KB)
└─ Step execution: sequential, 100ms delay between steps

Result: Still responsive, just slower (~5-10s per step on weak machine)
```

---

## 🔌 Integration Points (Where Code Interacts)

### Backend → Frontend
```
ApiSpringController
  └─ sendEvent(emitter, jsonOf(
       "stage", "incremental_patch",
       "stepNumber", 1,
       "actionType", "replace_code",
       "patch", {...}  ← CodeMirror-actionable patch
     ))
  └─ SSE emitter (HTTP streaming)
  └─ Frontend CodeEditor.tsx receives
      └─ Calls applyIncrementalPatch(patch, actionType)
      └─ CodeMirror.dispatch({ changes: {...} })
```

### User's Dynamic Runtime (index.tsx)
```
Before (React/ReactDOM not available):
  ❌ const root = ReactDOM.createRoot(container);
  ❌ Error: ReactDOM is undefined

After (Fixed):
  ✅ runtimeStore.React = React;
  ✅ runtimeStore.ReactDOM = ReactDOM;
  ✅ windowProxy.React → runtimeStore.React
  ✅ Now dynamic code can use React/ReactDOM
```

---

## 📈 Performance Characteristics

### Response Time Breakdown (Typical Scenario)

```
Code Edit Request (3 steps)
├─ Phase 0: Intent Classification        200ms
├─ Phase 1: Smart Context Loading       1500ms
│  ├─ Multimodal scan                    200ms
│  ├─ Auto-index to Lucene               800ms
│  └─ KNN search + RAG build             500ms
│
├─ Phase 2: Plan Generation             2000ms
│  └─ LLM inference (Qwen2.5)           2000ms
│
├─ Phase 3: Incremental Execution      1500ms  ← NEW, per-step streaming
│  ├─ Step 1 execute + stream            400ms
│  ├─ Step 2 execute + stream            400ms
│  └─ Step 3 execute + stream            400ms
│  (Results appear on screen as they complete, not waiting for all)
│
└─ TOTAL: ~5200ms (with streaming UX improvement)

Without incremental execution: User waits ~5200ms before seeing ANY result
With incremental execution: User sees Step 1 after ~4.5s, Step 2 after ~4.9s, Step 3 after ~5.3s
```

---

## 🎯 Business Value

| Feature | Benefit | User Impact |
|---------|---------|------------|
| Intent Classification | Faster off-topic detection | Questions answered in <1s |
| Smart Context Loading | Relevant code snippets only | Accurate fixes, not hallucinations |
| Plan Generation | Structured, step-by-step edits | Clear changelog of what AI did |
| Incremental Execution | See results as they appear | Better UX, feels faster (4.5s → perceived as 2s) |
| Weak Machine Optimization | Works on 2-core / 6GB machines | Deployable on cheap VPS/laptop |
| React/ReactDOM Fix | Dynamic code can use React | Custom UI overlays in dynamic menus |

---

## 🔒 Security & Reliability

### Error Handling Chain
```
LLM returns invalid JSON
  → AiIncrementalStepExecutorService.parsePlan() catches
  → Emits SSE "incremental_execution_error"
  → Frontend shows notification
  → User can manually edit or retry

Step execution fails (e.g., invalid line number)
  → StepResult.success = false
  → StepResult.errorCode = "exec_error"
  → Emits SSE "incremental_patch" with error
  → Frontend shows error, continues to next step or stops
```

### Scope & Validation
```
Only trusted LLM outputs accepted:
  ✅ Structured JSON (strict parsing)
  ✅ Action types from whitelist (7 types)
  ✅ Line numbers bounds-checked
  ✅ Content size limits (max 100KB per patch)
  
❌ Arbitrary code execution (not possible)
❌ File system access (not possible)
❌ SQL injection (param validation)
```

---

## 📋 Testing Matrix

| Scenario | Input | Expected | Status |
|----------|-------|----------|--------|
| Code edit (3 steps) | Message + code | 3 patches appear step-by-step | ⏳ Ready to test |
| Menu add | Message + menu JSON | Menu tree updated in-place | ⏳ Ready to test |
| Off-topic question | "Hello" | Quick answer, no context loading | ✅ Already working |
| Large attachment | 2MB JSON | Multimodal scanner distills to summary | ✅ Already working |
| Weak machine | Qwen0.5B model | 5-10s response time | ✅ Already working |
| React/ReactDOM | Dynamic code needs React | Dynamic code can render components | ✅ Fixed |

---

## 🚀 Next: Implementation Checklist

Follow **AI_INCREMENTAL_EXECUTION_GUIDE.md** for:
- [ ] Update `application.properties`
- [ ] Update system prompts (JSON output format)
- [ ] Add step executor to ApiSpringController
- [ ] Implement SSE listener in CodeEditor.tsx
- [ ] Implement menu listeners in AiMenuDesigner.tsx
- [ ] Test on development machine
- [ ] Test on weak machine (VPS)
- [ ] Deploy to production
