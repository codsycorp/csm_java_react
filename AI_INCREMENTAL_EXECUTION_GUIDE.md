# AI Local Intelligent Orchestration - Full Implementation Guide
## May 12, 2026 - Step-by-Step Direct CodeMirror Delivery

---

## 📋 Overview

**Goal**: Implement full AI local orchestration pipeline with incremental result delivery to CodeMirror.

**Flow**:
```
User Chat Message
    ↓
[Phase 0] Intent Classification
    ↓
[Phase 1] Smart Context Loading (Lucene auto-index + multimodal scan)
    ↓
[Phase 2] Plan Generation (LLM decides N steps)
    ↓
[Phase 3] Incremental Execution ← NEW
    ├─ Step 1 → Execute locally → SSE "incremental_patch" event → Frontend patches CodeMirror
    ├─ Step 2 → Execute locally → SSE "incremental_patch" event → Frontend patches CodeMirror
    ├─ Step 3 → Execute locally → SSE "incremental_patch" event → Frontend patches CodeMirror
    └─ ... repeat until done
    ↓
[Done] Success notification
```

**Key Changes**:
- ✅ `AiIncrementalStepExecutorService.java` created
- ✅ React/ReactDOM scope fix applied
- ⏳ ApiSpringController integration (this guide)
- ⏳ CodeEditor.tsx SSE listener (this guide)
- ⏳ Configuration updates (this guide)

---

## 🔧 Implementation Steps

### Step 1: Configure Application Properties

**File**: `backend/src/main/resources/application.properties`

Add/update these properties:

```properties
# ─── Incremental Step Execution ─────────────────────────────────────
ai.orchestration.incremental.enabled=true
ai.orchestration.incremental.max-steps=8
ai.orchestration.incremental.step-timeout-ms=30000

# ─── LLM Output Format for Planning ──────────────────────────────────
# When enabled, LLM is prompted to return structured JSON plan instead of free text
ai.orchestration.plan-output.format=json
ai.orchestration.plan-output.require-action-types=true
ai.orchestration.plan-output.require-params=true

# ─── Weak Machine Optimization ──────────────────────────────────────
ai.orchestration.incremental.max-concurrent-steps=1
ai.orchestration.incremental.chunk-result-size-bytes=8192
ai.orchestration.incremental.emit-progress-every-ms=500
```

---

### Step 2: Update System Prompt for LLM

**File**: `csm_datas/ai_local/ai_code_master_prompt.md` (for code flow)

Add section near end:

```markdown
## Output Format for Incremental Execution

When executing edits, you MUST structure your response as follows:

### For Code Edits:
```json
{
  "reasoning": "Brief explanation of changes",
  "steps": [
    {
      "step": 1,
      "action": "replace_code",
      "target": "src/path/to/File.java",
      "description": "Fix security vulnerability",
      "params": {
        "startLine": 45,
        "endLine": 52,
        "content": "// replacement code here"
      }
    },
    {
      "step": 2,
      "action": "insert_code",
      "target": "src/path/to/File.java",
      "description": "Add new method",
      "params": {
        "line": 100,
        "content": "// new method code"
      }
    }
  ]
}
```

### For Menu Edits:
```json
{
  "reasoning": "Menu structure optimization",
  "steps": [
    {
      "step": 1,
      "action": "update_menu",
      "targetPath": "menu.id.field_name",
      "description": "Update field display properties",
      "params": {
        "nodeId": "menu_node_123",
        "updateData": {"label": "New Label", "visible": true}
      }
    }
  ]
}
```

Each step will be executed incrementally, with results streamed to the editor immediately.
```

---

### Step 3: Inject Step Executor into ApiSpringController

**Location**: `backend/src/main/java/net/phanmemmottrieu/controller/ApiSpringController.java`

**Step 3a**: Add field (around line 200-300, with other @Autowired fields)

```java
@Autowired(required = false)
private AiIncrementalStepExecutorService aiIncrementalStepExecutorService;
```

**Step 3b**: After LLM response received (around line 11000-11100), add step execution logic:

Find this pattern:
```java
// After LLM response is fully collected in aiAssistantChat flow
emitAiAssistantChatChunk(appId, Map.of(
    "stage", "done",
    "message", fullAiResponse,
    // ... other fields
));
```

**Before emitting "done"**, insert:

```java
// ─── Incremental Step Execution (NEW) ────────────────────────────────
if (aiIncrementalStepExecutorService != null 
    && aiIncrementalStepExecutorService.isEnabled()
    && isIncrementalExecutionContext(contextType, responseMode)) {
    
    try {
        AiIncrementalStepExecutorService.PlanOutput plan = 
            aiIncrementalStepExecutorService.parsePlan(
                fullAiResponse, 
                contextType);
        
        if (plan.steps != null && !plan.steps.isEmpty()) {
            log.info("✅ Parsed {} steps for incremental execution", plan.steps.size());
            
            // Create execution context
            Map<String, Object> execContext = new LinkedHashMap<>();
            execContext.put("currentCode", currentCode);
            execContext.put("currentMenu", currentMenu);
            execContext.put("appId", appId);
            execContext.put("language", language);
            
            // Execute each step and emit patch
            for (AiIncrementalStepExecutorService.ExecutionStep step : plan.steps) {
                // Execute step locally
                AiIncrementalStepExecutorService.StepResult result = 
                    aiIncrementalStepExecutorService.executeStep(
                        step,
                        currentCode,
                        execContext);
                
                // Emit incremental patch event
                Map<String, Object> patchEvent = new LinkedHashMap<>();
                patchEvent.put("stage", "incremental_patch");
                patchEvent.put("stepNumber", result.stepNumber);
                patchEvent.put("stepTotal", result.stepTotal);
                patchEvent.put("actionType", result.actionType);
                patchEvent.put("message", result.message);
                patchEvent.put("success", result.success);
                patchEvent.put("executionTimeMs", result.executionTimeMs);
                
                if (result.success && result.resultData != null) {
                    patchEvent.put("patch", result.resultData);
                } else if (result.errorCode != null) {
                    patchEvent.put("errorCode", result.errorCode);
                }
                
                emitAiAssistantChatChunk(appId, patchEvent);
                
                // Small delay on weak machines to avoid overwhelming frontend
                if (isWeakMachineMode()) {
                    Thread.sleep(100);
                }
            }
            
            // Final summary
            emitAiAssistantChatChunk(appId, Map.of(
                "stage", "incremental_execution_complete",
                "totalSteps", plan.steps.size(),
                "estimatedTimeMs", plan.totalEstimatedMs,
                "message", "Tất cả bước đã thực hiện xong"
            ));
        }
        
    } catch (Exception e) {
        log.error("❌ Step execution failed: {}", e.getMessage());
        emitAiAssistantChatChunk(appId, Map.of(
            "stage", "incremental_execution_error",
            "errorCode", "step_exec_failed",
            "message", "Lỗi khi thực hiện bước: " + e.getMessage()
        ));
    }
}
```

**Step 3c**: Add helper methods (anywhere in ApiSpringController):

```java
/**
 * Check if this context should use incremental execution.
 * Only for code_editor and menu_json flows when local-only mode is active.
 */
private boolean isIncrementalExecutionContext(String contextType, String responseMode) {
    if (contextType == null) return false;
    
    boolean isCodeOrMenu = contextType.equals("code_editor") 
        || contextType.equals("menu_json")
        || contextType.startsWith("code_")
        || contextType.startsWith("menu_");
    
    // Only use incremental if local-only or weak machine mode
    boolean shouldUseIncremental = "local_only".equals(responseMode) 
        || "true".equalsIgnoreCase(System.getenv("WEAK_MODE_ACTIVE"));
    
    return isCodeOrMenu && shouldUseIncremental;
}

private boolean isWeakMachineMode() {
    return "true".equalsIgnoreCase(System.getenv("WEAK_MODE_ACTIVE"));
}
```

---

### Step 4: Update CodeEditor.tsx SSE Listener

**File**: `frontend-admin/src/pages/system/developer/CodeEditor.tsx`

Find the SSE event listener (search for `onmessage` or `addEventListener`), then add this handler:

```typescript
// ─── Handle incremental_patch events ──────────────────────────────
if (event.stage === "incremental_patch") {
  const { stepNumber, stepTotal, actionType, patch, success, message, executionTimeMs } = event;
  
  // Render step progress
  console.log(`📍 Step ${stepNumber}/${stepTotal}: ${actionType}`);
  
  if (success && patch) {
    // Apply patch directly to CodeMirror
    applyIncrementalPatch(patch, actionType);
    
    // Show step completion toast
    notification.success({
      message: `Step ${stepNumber}/${stepTotal}`,
      description: message || actionType,
      duration: 1.5,
      placement: "topRight"
    });
  } else {
    // Show error
    notification.error({
      message: `Step ${stepNumber} failed`,
      description: message || "Unknown error",
      placement: "topRight"
    });
  }
}

// Handle incremental_execution_complete
if (event.stage === "incremental_execution_complete") {
  const { totalSteps, estimatedTimeMs, message } = event;
  
  notification.success({
    message: "✅ Execution Complete",
    description: `${totalSteps} steps completed in ${Math.round(estimatedTimeMs / 1000)}s`,
    duration: 3,
    placement: "topRight"
  });
  
  // Optionally auto-save
  onSave?.();
}

// Handle incremental_execution_error
if (event.stage === "incremental_execution_error") {
  const { errorCode, message } = event;
  
  notification.error({
    message: "❌ Execution Error",
    description: message,
    placement: "topRight"
  });
}
```

**Add these helper functions** to CodeEditor.tsx:

```typescript
/**
 * Apply incremental patch to CodeMirror.
 * Supports: insert_code, replace_code, delete_code, add_menu, update_menu
 */
function applyIncrementalPatch(patch: any, actionType: string) {
  if (!editorView || !patch) return;
  
  const editor = editorView;
  
  switch (actionType) {
    case "insert_code": {
      const { line, content } = patch;
      if (typeof line === "number" && content) {
        // Convert 0-based line to actual position
        const doc = editor.state.doc;
        const lineStart = doc.line(line + 1).from;
        
        editor.dispatch({
          changes: {
            from: lineStart,
            to: lineStart,
            insert: content + "\n"
          }
        });
      }
      break;
    }
    
    case "replace_code": {
      const { startLine, endLine, content } = patch;
      if (typeof startLine === "number" && typeof endLine === "number") {
        const doc = editor.state.doc;
        const from = doc.line(startLine + 1).from;
        const to = doc.line(endLine + 1).to;
        
        editor.dispatch({
          changes: {
            from,
            to,
            insert: content || ""
          }
        });
      }
      break;
    }
    
    case "delete_code": {
      const { startLine, endLine } = patch;
      if (typeof startLine === "number" && typeof endLine === "number") {
        const doc = editor.state.doc;
        const from = doc.line(startLine + 1).from;
        const to = doc.line(endLine + 1).to;
        
        editor.dispatch({
          changes: {
            from,
            to,
            insert: ""
          }
        });
      }
      break;
    }
    
    case "add_menu": {
      // For menu flows, emit custom event that menu editor listens to
      const { parentId, nodeId, nodeData } = patch;
      window.dispatchEvent(new CustomEvent("ai:addMenuNode", {
        detail: { parentId, nodeId, nodeData }
      }));
      break;
    }
    
    case "update_menu": {
      const { nodeId, updateData } = patch;
      window.dispatchEvent(new CustomEvent("ai:updateMenuNode", {
        detail: { nodeId, updateData }
      }));
      break;
    }
  }
}
```

---

### Step 5: Update AiMenuDesigner.tsx for Menu Patches

**File**: `frontend-admin/src/pages/system/menu/components/AiMenuDesigner.tsx`

Add listeners for menu patch events:

```typescript
useEffect(() => {
  const handleAddMenuNode = (event: CustomEvent) => {
    const { parentId, nodeId, nodeData } = event.detail;
    
    // Parse nodeData if it's JSON string
    let parsed = nodeData;
    if (typeof nodeData === "string") {
      try {
        parsed = JSON.parse(nodeData);
      } catch (e) {
        console.warn("Failed to parse nodeData:", e);
      }
    }
    
    // Apply to current menu tree
    const newMenus = [...(currentMenus || [])];
    // ... your tree manipulation logic
    
    notification.success({
      message: "Menu node added",
      description: `Added ${nodeId}`,
      duration: 1.5
    });
  };
  
  const handleUpdateMenuNode = (event: CustomEvent) => {
    const { nodeId, updateData } = event.detail;
    
    // Update node in tree
    const newMenus = [...(currentMenus || [])];
    // ... your tree update logic
    
    notification.success({
      message: "Menu node updated",
      description: `Updated ${nodeId}`,
      duration: 1.5
    });
  };
  
  window.addEventListener("ai:addMenuNode", handleAddMenuNode as EventListener);
  window.addEventListener("ai:updateMenuNode", handleUpdateMenuNode as EventListener);
  
  return () => {
    window.removeEventListener("ai:addMenuNode", handleAddMenuNode as EventListener);
    window.removeEventListener("ai:updateMenuNode", handleUpdateMenuNode as EventListener);
  };
}, [currentMenus]);
```

---

## 🚀 Deployment & Testing

### Build Backend
```bash
cd backend
mvn clean -DskipTests compile
```

### Deploy
```bash
./deploy.sh
# or
./start.sh
```

### Test Scenario 1: Code Edit with Steps
```
User: "Refactor this function to use modern Java features and add proper error handling"
Context: code_editor
Expected: 
- Step 1/3: Replace old loop → CodeMirror updates
- Step 2/3: Add exception handling → CodeMirror updates
- Step 3/3: Add Javadoc → CodeMirror updates
- Final notification: ✅ 3 steps completed
```

### Test Scenario 2: Menu Designer
```
User: "Add a new submenu for reports under Admin section"
Context: menu_json
Expected:
- Step 1/2: Create menu node structure
- Step 2/2: Update Admin parent
- Menu tree reflects changes in real-time
```

---

## ⚙️ Configuration for Weak Machines

**File**: `config.env`

```bash
# Weak machine profile
AI_LOCAL_MODE=fast
WEAK_MODE_ACTIVE=true

# Reduce step concurrency on low-RAM systems
AI_ORCHESTRATION_INCREMENTAL_MAX_CONCURRENT_STEPS=1

# Smaller chunks to avoid memory bloat
AI_ORCHESTRATION_INCREMENTAL_CHUNK_RESULT_SIZE_BYTES=4096

# Progress events less frequently
AI_ORCHESTRATION_INCREMENTAL_EMIT_PROGRESS_EVERY_MS=1000
```

**File**: `start.sh`

Already configured to auto-detect weak machines and apply these overrides.

---

## 📊 Monitoring & Debugging

### Check Backend Logs
```bash
tail -f logs/application.log | grep -i "incremental\|step_exec"
```

### Frontend Console Logs
Open DevTools → Console
Should see:
```
📍 Step 1/3: replace_code
📍 Step 2/3: insert_code
✅ Execution Complete: 3 steps
```

### Verify Step Executor Service
```bash
# In backend logs, search for:
"✅ Parsed X steps for incremental execution"
```

---

## 🔍 Troubleshooting

### Steps not appearing
1. Check `ai.orchestration.incremental.enabled=true` in properties
2. Verify LLM output format is valid JSON with steps array
3. Check `contextType` is `code_editor` or `menu_json`

### Frontend not receiving patches
1. Verify SSE connection is open (DevTools → Network)
2. Check `stage === "incremental_patch"` event listener is registered
3. Look for browser console errors

### Performance issues on weak machines
1. Increase `AI_ORCHESTRATION_INCREMENTAL_EMIT_PROGRESS_EVERY_MS`
2. Decrease `AI_ORCHESTRATION_INCREMENTAL_MAX_CONCURRENT_STEPS` to 1
3. Reduce `AI_LOCAL_LLAMA_BATCH_SIZE` in config.env

---

## 📝 Summary

**New Files**:
- ✅ `AiIncrementalStepExecutorService.java`

**Modified Files**:
- `ApiSpringController.java` (add step executor injection + execution logic)
- `CodeEditor.tsx` (add SSE listener + patch application)
- `AiMenuDesigner.tsx` (add menu patch listeners)
- `application.properties` (add incremental config)
- `ai_code_master_prompt.md` (add JSON output format instruction)

**Configuration Files**:
- `config.env` (weak machine optimization)
- `start.sh` (auto-detection already in place)

---

## Next Steps

1. ✅ Apply React/ReactDOM fix (done)
2. ✅ Deploy `AiIncrementalStepExecutorService.java` (done)
3. ⏳ Update `ApiSpringController` with step execution logic
4. ⏳ Implement `CodeEditor.tsx` SSE listener
5. ⏳ Update system prompts
6. ⏳ Test with real scenarios
7. ⏳ Monitor performance on weak machines
