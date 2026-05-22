# CSM AI Local Agent v3 – Streaming Patch Architecture for Frontend Admin + CodeMirror

---

## ⚠️ REALITY CHECK — Đã triển khai thực tế vs Thiết kế gốc

> **Tài liệu này ban đầu là design doc.** Hệ thống thực tế đã triển khai khác ở nhiều điểm quan trọng.
> Bảng dưới đây map giữa thiết kế gốc và implementation thực tế.

| Khía cạnh | Thiết kế V3 gốc | Thực tế đã triển khai |
|---|---|---|
| **Transport** | WebSocket (`/ws/ai-agent`) | **SSE** via `POST /api/ai-code-stream` |
| **Edit format** | `operations: [{op, startLine, endLine, content}]` | **`textEdits: [{startLine, endLine, replacement, action}]`** |
| **Event types** | `task_started`, `patch`, `token`, `completed` | **`streaming`, `text_edit_apply`, `text_edit_apply_done`, `agentic_step_result`, `complete`, `error`** |
| **Backend controller** | `AiAgentSocketController` (STOMP) | **`ApiSpringController.streamCodeAssistant()`** |
| **Frontend components** | `AiChatPanel.jsx`, `aiPatchService.js`, `PatchHighlighter.jsx` | **`AiAssistantChat.tsx`, `CodeMirrorWithAiAssistant.tsx`, `sse-stream.ts`** |
| **Frontend apply** | `applyPatch(editor, operations)` | **`handleApplyLineEdit({startLine, endLine, replacement, action})`** |
| **Validation** | `Patch Validator` (generic) | **`validateDeterministicLineTextEdits` + `runPatchDryRunSimulation` + `runSemanticSandboxSimulation`** |
| **AI output format** | Always `{operations:[...]}` | **SEARCH/REPLACE blocks → backend canonicalizes to `textEdits` JSON** |
| **Store** | Zustand `useAiAgentStore` | **React state in `AiAssistantChat.tsx` + `liveCodeRef`** |

### Quan trọng cho AI local prompt authors:
- **Dùng `textEdits` format** (không phải `operations`)
- **Dùng `replacement`** (không phải `content`)
- **Dùng `action: "edit"|"add"|"delete"`** (không phải `op: "replace"|"insert"|"delete"`)
- **Line numbers là 1-based** (dòng 1 = dòng đầu tiên)
- **Xem `ai_code_master_prompt.md` v2.0 và `ai_menu_master_prompt.md` v3.0** để biết contract chính xác cho AI local

---

## Goal

Thiết kế AI local agent có thể:

- phân tích code lớn
- stream realtime
- trả về patch chính xác
- xác định line nào thêm/sửa/xóa
- cập nhật trực tiếp vào CodeMirror frontend-admin
- hoạt động tốt trên máy yếu
- hỗ trợ multi-file patch
- hỗ trợ repair loop
- hỗ trợ build/test feedback
- không cần gửi full file liên tục

---

# 1. Overall Architecture (Actual Implementation)

```text
Frontend Admin (React + CodeMirror v6)
        ↓ POST /api/ai-code-stream (SSE response)
ApiSpringController.streamCodeAssistant()
        ↓
AiAssistantGatewayService (master prompt injection)
        ↓
Context Builder (focus window, Lucene, symbols)
        ↓
LlamaCppNativeService / AiLocalOrchestrationService
        ↓
Streaming Patch Parser (canonicalize → textEdits)
        ↓
Deterministic Patch Validator + Dry-Run Simulation
        ↓
SSE Events: text_edit_apply → text_edit_apply_done → complete
        ↓
AiAssistantChat.tsx (dispatch SSE events)
        ↓
CodeMirrorWithAiAssistant.handleApplyLineEdit()
        ↓
CodeMirror view.dispatch({ changes: {from, to, insert} })
```

---

# 2. Main Principle

AI KHÔNG được trả full file mỗi lần.

AI phải trả (actual format — **textEdits**):

```json
{
  "summary": "mô tả ngắn thay đổi",
  "changes": ["thay đổi 1", "thay đổi 2"],
  "textEdits": [
    {
      "startLine": 120,
      "endLine": 145,
      "replacement": "new code",
      "action": "edit"
    }
  ]
}
```

Hoặc SEARCH/REPLACE blocks (backend tự convert sang textEdits):

```
<<<<<<< SEARCH
[đoạn code cũ chính xác]
=======
[đoạn code mới]
>>>>>>> REPLACE
```

Frontend CodeMirror sẽ:

```text
1. nhận SSE event "text_edit_apply" chứa textEdit
2. gọi handleApplyLineEdit({startLine, endLine, replacement, action})
3. dispatch changes vào CodeMirror view
4. update editor realtime
5. nhận "text_edit_apply_done" → commit final state
6. nhận "complete" → show summary + telemetry
```

---

# 3. Why Patch Streaming Instead of Full File

Full file rewrite gây:

```text
- tốn token
- lag frontend
- hallucination
- mất undo history
- conflict merge
- khó rollback
- khó validate
```

Patch-based giúp:

```text
- nhanh hơn
- chính xác hơn
- stream realtime
- update từng phần
- rollback dễ
- phù hợp local AI nhỏ
```

---

# 4. Frontend Architecture (React + CodeMirror)

## Recommended Structure

```text
frontend-admin/
  src/
    components/
      ai/
        AiChatPanel.jsx
        AiPatchPreview.jsx
        AiStreamingConsole.jsx
        AiTaskProgress.jsx

      editor/
        CodeMirrorEditor.jsx
        PatchHighlighter.jsx
        InlineDiffRenderer.jsx

    services/
      aiSocketService.js
      aiPatchService.js
      aiEditorSync.js

    stores/
      aiAgentStore.js
      editorStore.js
```

---

# 5. Backend Streaming Types

## Stream Event Types

Every event from backend must have:

```json
{
  "event": "event_type",
  "taskId": "uuid",
  "timestamp": 1710000000
}
```

---

# 6. Streaming Events

## 6.1 Task Started

```json
{
  "event": "task_started",
  "taskId": "abc123",
  "requestType": "refactor",
  "file": "RecordManager.java"
}
```

---

## 6.2 Analysis Progress

```json
{
  "event": "analysis_progress",
  "taskId": "abc123",
  "step": "Scanning related files",
  "progress": 20
}
```

---

## 6.3 Context Selected

```json
{
  "event": "context_selected",
  "taskId": "abc123",
  "files": [
    "RecordManager.java",
    "SearchFilter.java",
    "LuceneIndexer.java"
  ],
  "symbols": [
    "filter",
    "find",
    "filterWithPagination"
  ]
}
```

---

## 6.4 Token Stream

Optional.

```json
{
  "event": "token",
  "taskId": "abc123",
  "content": "Analyzing filter logic..."
}
```

---

# 7. Patch Streaming Events (Actual Implementation)

IMPORTANT — This is the core SSE event flow used by the real system.

## 7.1 Per-Edit Event: `text_edit_apply`

Backend emits one event per validated textEdit:

```json
{
  "stage": "text_edit_apply",
  "requestId": "abc123",
  "attempt": 1,
  "textEdit": {
    "startLine": 120,
    "endLine": 145,
    "replacement": "private List<Record> filterWithLucene(...) {\n ... }",
    "action": "edit"
  }
}
```

## 7.2 Edits Done Event: `text_edit_apply_done`

```json
{
  "stage": "text_edit_apply_done",
  "requestId": "abc123",
  "count": 3
}
```

## 7.3 Agentic Step Event: `agentic_step_result`

For multi-step edits, each step includes quality/risk metadata:

```json
{
  "stage": "agentic_step_result",
  "requestId": "abc123",
  "stepIndex": 1,
  "stepTotal": 3,
  "stepDescription": "Áp dụng thay đổi 1",
  "qualityScore": 85,
  "riskLevel": "low",
  "approvalRequired": false,
  "textEdits": [
    {
      "startLine": 120,
      "endLine": 145,
      "replacement": "...",
      "action": "edit"
    }
  ],
  "partial": true
}
```

## 7.4 Final Completion Event: `complete`

```json
{
  "stage": "complete",
  "requestId": "abc123",
  "status": "completed",
  "fullResponse": "raw AI output",
  "textEdits": [ /* all canonical edits */ ],
  "lineRanges": [ /* changed line ranges */ ],
  "patchValidator": { /* validation results */ },
  "patchDryRun": { /* dry-run simulation results */ },
  "usage": { "promptTokens": 500, "completionTokens": 200, "estimatedCostUsd": 0 }
}
```

---

# 8. Frontend Apply Patch Logic (Actual Implementation)

## CodeMirrorWithAiAssistant.tsx — handleApplyLineEdit

```typescript
const handleApplyLineEdit = useCallback((edit: {
  startLine: number; endLine: number; replacement: string; action: string
}) => {
  const view = editorViewRef.current;
  if (!view) {
    // Fallback: reconstruct full code
    const lines = String(currentCode || "").split("\n");
    const s = Math.max(0, edit.startLine - 1);
    const e = Math.max(s, Math.min(edit.endLine - 1, lines.length - 1));
    lines.splice(s, e - s + 1, ...edit.replacement.split("\n"));
    handleCopilotCodeInsert(lines.join("\n"));
    return;
  }
  try {
    const doc = view.state.doc;
    const safeStart = Math.max(1, Math.min(edit.startLine, doc.lines));
    const safeEnd = Math.max(safeStart, Math.min(edit.endLine, doc.lines));
    const startLineObj = doc.line(safeStart);
    const endLineObj = doc.line(safeEnd);
    // Precise character-range change — only target lines touched
    view.dispatch({
      changes: { from: startLineObj.from, to: endLineObj.to, insert: edit.replacement },
      scrollIntoView: true,
    });
    // Propagate updated value to React state
    if (typeof onChange === "function") {
      onChange(view.state.doc.toString(), undefined as any);
    }
  } catch {
    // Fallback: full code reconstruction
    const lines = String(currentCode || "").split("\n");
    const s = Math.max(0, edit.startLine - 1);
    const e = Math.max(s, Math.min(edit.endLine - 1, lines.length - 1));
    lines.splice(s, e - s + 1, ...edit.replacement.split("\n"));
    handleCopilotCodeInsert(lines.join("\n"));
  }
}, [currentCode, handleCopilotCodeInsert, onChange]);
```

## AiAssistantChat.tsx — SSE dispatch for text_edit_apply

```typescript
else if (evt.stage === "text_edit_apply" && (evt as any).textEdit) {
  const rawEdit = (evt as any).textEdit;
  const startLine = Math.max(1, Number(rawEdit.startLine ?? 1));
  const endLine = Math.max(startLine, Number(rawEdit.endLine ?? startLine));
  const replacement = String(rawEdit.replacement ?? rawEdit.text ?? "");
  const action = String(rawEdit.action ?? "edit").trim().toLowerCase();
  if (onApplyLineEdit) {
    onApplyLineEdit({ startLine, endLine, replacement, action });
  }
}
```

---

# 9. Highlight Changed Lines

## PatchHighlighter.jsx

```javascript
import { Decoration, EditorView } from '@codemirror/view';

export function createPatchDecorations(lines) {
  return Decoration.set(
    lines.map(line =>
      Decoration.line({
        attributes: {
          class: 'ai-changed-line'
        }
      }).range(line.from)
    )
  );
}
```

CSS:

```css
.ai-changed-line {
  background: rgba(255, 215, 0, 0.12);
}
```

---

# 10. SSE Transport Architecture (Actual Implementation)

## Backend Endpoints

```text
POST /ai-code-stream          → ApiSpringController.streamCodeAssistant()
POST /api/ai-code-stream       → same (dual mapping)
POST /api/ai-code-stream/{id}/cancel → cancel active stream
```

**Response:** `text/event-stream` (Server-Sent Events)

## Nginx Config (SSE passthrough)

```nginx
location = /ai-code-stream {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
    chunked_transfer_encoding off;
}
```

---

# 11. Backend Streaming Controller (Actual Implementation)

## ApiSpringController.java — streamCodeAssistant()

```java
@PostMapping(value = {"/ai-code-stream", "/api/ai-code-stream"},
             produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public SseEmitter streamCodeAssistant(@RequestBody Map<String, Object> body) {
    SseEmitter emitter = new SseEmitter(effectiveSseTimeoutMs);

    // 1. Parse request: message, currentCode, contextType, responseMode, language, appId
    // 2. Auth & rate limit checks
    // 3. Build prompt context (focus window, Lucene retrieval, symbol excerpts)
    // 4. Inject master prompt (ai_code_master_prompt or ai_menu_master_prompt)
    // 5. Call LlamaCppNativeService or cloud provider
    // 6. Stream tokens → emit SSE "streaming" events
    // 7. Parse completion → canonicalize to textEdits
    // 8. Validate: deterministic patch + dry-run + semantic sandbox
    // 9. Emit SSE "text_edit_apply" per validated edit
    // 10. Emit SSE "text_edit_apply_done"
    // 11. Emit SSE "complete" with full payload + telemetry

    return emitter;
}
```

## Frontend SSE Consumer — sse-stream.ts

```typescript
export async function consumeSseStream(response: Response, options: ConsumeSseOptions): Promise<ConsumeSseResult> {
    const reader = response.body.getReader();
    // Parse SSE lines: "event:", "data:"
    // Flush each event → options.onEvent({event, data, payload})
}

export function dispatchAiCodeStreamEvent(payload, accumulated, callbacks) {
    // stage === "streaming" → onChunk
    // stage === "complete" → onComplete
    // stage === "error" → onError
    // other → onStatus (text_edit_apply, agentic_step_result, etc.)
}
```

---

# 12. AI Response Format (Actual)

The model must NEVER return plain text for code modifications.

Must return one of these formats (in priority order):

## Format 1: SEARCH/REPLACE blocks (preferred — backend converts to textEdits)

```
<<<<<<< SEARCH
[exact original code — must be unique substring]
=======
[replacement code]
>>>>>>> REPLACE
```

## Format 2: JSON with textEdits

```json
{
  "summary": "description of change",
  "changes": ["change 1", "change 2"],
  "textEdits": [
    {
      "startLine": 40,
      "endLine": 60,
      "replacement": "new code",
      "action": "edit"
    }
  ]
}
```

## Format 3: Fallback full code (last resort only)

```json
{
  "summary": "description",
  "changes": ["change"],
  "code": "full file content"
}
```

## Bad ❌

```text
Replace this code with:
...
```

---

# 13. System Prompt Injection (Actual)

The backend (`ApiSpringController.buildCodeStreamSystemPrompt()`) builds the system prompt dynamically based on `responseMode` and `contextType`:

### For `edit` mode + code context:
```
CHẾ ĐỘ: Chỉnh sửa code theo vị trí dòng.
BẮT BUỘC: trả về các khối SEARCH/REPLACE để backend ráp đúng vùng code:
<<<<<<< SEARCH
[đoạn code cũ]
=======
[đoạn code mới]
>>>>>>> REPLACE
Ưu tiên trả về JSON thuần theo format:
{"summary":"...","changes":["..."],"textEdits":[{"startLine":10,"endLine":12,"replacement":"...","action":"edit"}]}
```

### For `edit` mode + menu_json context:
```
CHẾ ĐỘ: Chỉnh sửa menu JSON cho editor.
BẮT BUỘC: Trả về DUY NHẤT một JSON hợp lệ cho menu editor.
Đầu ra phải là object chứa trường menu (ví dụ: {"menu":[...]}) hoặc mảng menu thuần.
```

### For `analyze` mode:
```
CHẾ ĐỘ: Phân tích/Giải thích.
Chỉ giải thích logic của CODE HIỆN TẠI.
Không viết lại code sang ngôn ngữ khác.
```

**Note:** The full master prompt (`ai_code_master_prompt.md` or `ai_menu_master_prompt.md`) is prepended before the mode-specific instructions via `AiAssistantGatewayService`.

---

# 14. Patch Validator

Before frontend receives patch:

```text
1. validate JSON
2. validate line numbers
3. validate syntax
4. ensure file exists
5. ensure operation ranges valid
6. ensure no overlapping operations
```

---

# 15. Backend Patch Processing (Actual)

The backend does NOT use `PatchOperation` / `PatchResult` model classes.

Instead, `ApiSpringController` processes edits as `List<Map<String, Object>>` with this canonical shape per edit:

```java
// Each textEdit map contains:
{
  "startLine": Integer,    // 1-based
  "endLine": Integer,      // 1-based, >= startLine
  "replacement": String,   // exact replacement text
  "action": String         // "edit" | "add" | "delete"
}
```

**Validation pipeline (in order):**
1. `canonicalizeLineTextEditsPayload()` — normalize raw output to standard JSON
2. `parseNormalizedLineTextEdits()` — extract list of textEdit maps
3. `applyDeltaFirstAntiEchoLineTextEdits()` — remove edits that duplicate existing code
4. `validateDeterministicLineTextEdits()` — check line bounds, overlap, consistency
5. `runPatchDryRunSimulation()` — simulate applying edits to verify result
6. `runSemanticSandboxSimulation()` — check for risky semantic changes
7. `verifyEditStepEvidence()` — per-edit quality scoring

---

# 16. Multi File Patch (Design — Not Yet Implemented)

> ⚠️ Current implementation is single-file only. The editor operates on one code/menu document at a time.
> Multi-file patch is a future enhancement.

Design concept (for future):

```json
{
  "stage": "multi_file_patch",
  "files": [
    {
      "file": "UserService.java",
      "textEdits": [{"startLine": 10, "endLine": 12, "replacement": "...", "action": "edit"}]
    },
    {
      "file": "UserController.java",
      "textEdits": [{"startLine": 5, "endLine": 5, "replacement": "...", "action": "add"}]
    }
  ]
}
```

---

# 17. Streaming Generation Loop

```text
1. classify request
2. find files
3. build context
4. generate patch chunk
5. validate patch
6. stream patch
7. apply patch frontend
8. continue next chunk
```

---

# 18. Large File Strategy

For files > 3000 lines:

DO NOT send full file.

Instead:

```text
1. parse symbols
2. identify target method/class
3. extract nearby lines only
4. summarize unrelated sections
```

---

# 19. Symbol Graph

Required for repo understanding.

```json
{
  "class": "RecordManager",
  "methods": [
    {
      "name": "filter",
      "calls": [
        "buildLuceneQuery",
        "searchLuceneIndex",
        "rocksIterator"
      ]
    }
  ]
}
```

---

# 20. Context Builder

## Priority

```text
1. selected code
2. cursor area
3. current method
4. current class
5. imported symbols
6. called methods
7. search results
8. summaries
```

---

# 21. Token Budget Strategy

For weak machine:

```text
max context: 8192
reserved output: 1024
reserved system: 500
usable retrieval: 6668
```

---

# 22. Low Resource Runtime

## llama.cpp

```bash
llama-server \
  -m qwen2.5-coder-3b-instruct-q4_k_m.gguf \
  -c 8192 \
  -t 3 \
  -b 256 \
  --parallel 1
```

---

# 23. Frontend AI Store

## Zustand Example

```javascript
export const useAiAgentStore = create((set) => ({
  tasks: {},

  addTask: (task) => set((state) => ({
    tasks: {
      ...state.tasks,
      [task.id]: task
    }
  }))
}));
```

---

# 24. Auto Apply Toggle

Frontend should support:

```text
[ ] Preview only
[x] Auto apply AI patch
[ ] Require confirmation
```

---

# 25. Undo/Redo Safety

Before patch:

```javascript
editor.dispatch({
  effects: saveHistoryEffect.of(true)
});
```

---

# 26. Build/Test Loop

After patch:

```text
1. run compile
2. capture errors
3. feed only errors + changed code back to AI
4. generate repair patch
5. stream repair patch
```

---

# 27. Repair Prompt

```text
Compiler errors:
{errors}

Changed code:
{patch}

Return ONLY repair patch JSON.
```

---

# 28. Inline AI Suggestions

Support:

```text
- explain method
- optimize loop
- add null check
- generate DTO
- add logging
- convert to async
```

Context menu:

```text
Right click → AI Actions
```

---

# 29. Transport: SSE is Primary (Not WebSocket)

The actual system uses SSE as the primary and only transport:

```text
POST /api/ai-code-stream → text/event-stream
```

WebSocket was the original V3 design but was NOT implemented.
SSE was chosen because:

```text
- Simpler to deploy behind nginx/load balancer
- No STOMP/SockJS dependency needed
- Works with standard HTTP/2
- Easy cancellation via AbortController on frontend
- Backend uses SseEmitter (Spring Boot native)
```

---

# 30. Recommended Backend Modules

```text
backend/
  ai/
    controller/
    websocket/
    orchestration/
    retrieval/
    parser/
    patch/
    validation/
    runtime/
    memory/
```

---

# 31. AI Orchestration Pipeline

```text
REQUEST
  ↓
CLASSIFIER
  ↓
RETRIEVAL
  ↓
CONTEXT BUILDER
  ↓
PROMPT BUILDER
  ↓
LLM STREAM
  ↓
PATCH PARSER
  ↓
VALIDATOR
  ↓
PATCH STREAM
  ↓
FRONTEND APPLY
```

---

# 32. Recommended Local AI Rules

```text
- patch only
- deterministic
- low temperature
- no huge explanations
- no full file rewrite
- no giant context
- use retrieval first
```

---

# 33. Final Golden Rule

AI local mạnh không nằm ở model.

Nó nằm ở:

```text
- retrieval tốt
- patch architecture
- streaming tốt
- validation tốt
- compiler feedback
- frontend sync tốt
```

Small model + strong architecture
>
Big model + bad architecture
