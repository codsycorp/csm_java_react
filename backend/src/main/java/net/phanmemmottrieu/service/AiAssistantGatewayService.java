package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
  import java.util.LinkedHashMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Service;
import org.springframework.util.StreamUtils;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.reactive.function.client.WebClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.io.InputStream;
import java.io.IOException;
import java.util.Comparator;
import java.util.regex.Pattern;
import java.util.regex.Matcher;
import java.util.Locale;


/**
 * Fallback service for oversized prompts routed to AI Assistant API API.
 * Returns JSON wrapper compatible with existing /ai-generate-seo-content parsing flow.
 */
@Service
public class AiAssistantGatewayService {

  // Cached master prompt content
  private volatile String masterPrompt = null;
  // Cached code master prompt content
  private volatile String codeMasterPrompt = null;

  // Path to master prompt file, configurable via application.properties
  @Value("${ai.context.master-prompt-path:file:./csm_datas/ai_local/ai_menu_master_prompt.md}")
  private String masterPromptPath;

  // Path to code master prompt file, configurable via application.properties
  @Value("${ai.context.code-master-prompt-path:file:./csm_datas/ai_local/ai_code_master_prompt.md}")
  private String codeMasterPromptPath;

  @Value("${ai.gateway.stability.code-context-injection:true}")
  private boolean codeContextInjection;

  @Value("${ai.gateway.code-runtime-guard.enabled:true}")
  private boolean codeRuntimeGuardEnabled;

  // Directory where per-app AI context files are stored
  @Value("${ai.context.dir:csm_datas/ai_local}")
  private String contextDir;

  /** Local prompt slot budgets — large defaults for full local inference (no cloud fallback). */
  @Value("${ai.local.prompt.slot.active-editor-chars:400000}")
  private int localSlotActiveEditorChars;

  @Value("${ai.local.prompt.slot.rag-context-chars:120000}")
  private int localSlotRagContextChars;

  @Value("${ai.local.prompt.slot.memory-chars:60000}")
  private int localSlotMemoryChars;

  @Value("${ai.local.prompt.slot.user-request-chars:32000}")
  private int localSlotUserRequestChars;

  // Max chars to keep in the request history inside the context file
  private static final int CTX_MAX_HISTORY_CHARS = 8000;
  // Max chars to keep for previous result summary inside the context file
  private static final int CTX_MAX_RESULT_CHARS = 6000;
  // Max chars to keep for AI Assistant conversation continuity memory
  private static final int AI_ASSISTANT_MEMORY_MAX_CHARS = 180000;
  private static final int AI_ASSISTANT_PENDING_MAX_ITEMS = 12;

  public static class AiAssistantTurn {
    public String turnId;
    public String timestamp;
    public String contextType;
    public String responseMode;
    public int attachmentCount;
    public int feedbackRating;
    public String feedbackUpdatedAt;
    public String userMessage;
    public String assistantMessage;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Local-only prompt contracts (v7 slot-based minimal prompt)
  // ───────────────────────────────────────────────────────────────────────────

  public enum AiFlowIntent {
    MENU_JSON,
    FRONTEND_CODE,
    QUICK_QUESTION
  }

  private static final String BASE_SYSTEM_MIN = """
You are CSM AI Assistant.
Follow the requested output contract exactly.
Return only valid JSON without markdown or explanation unless explicitly asked.
End immediately after the response.
""";

  private static final String BASE_SYSTEM_ANALYZE_MIN = """
You are CSM AI Assistant.
Follow the requested output contract exactly.
Answer in plain text prose unless the contract explicitly requires JSON.
End immediately after the response.
""";

  private static final String QUICK_QUESTION_CONTRACT_MIN = """
You are CSM AI Assistant.
Answer the user's question directly in the same language as the user request (Vietnamese, English, or Chinese).
For code/debug questions: cite concrete symbols (functions, variables, timers, webview/process lifecycle).
Use at least 4 short bullet points covering: observed behavior, likely root cause, relevant code paths, suggested fix/check.
Do not output a single "reason:" line or JSON patch envelope.
No JSON unless the user explicitly asked for a patch.
No markdown code fences.
No random text.
End immediately after the answer.
""";

  private static final String FRONTEND_CODE_CONTRACT_MIN = """
You are CSM Frontend Code Editor.

Return ONLY valid JSON textEdits in edit mode:
{
  "summary": "",
  "changes": [],
  "textEdits": []
}

Rules:
- startLine/endLine are 1-based line numbers in the FULL active editor file (not relative to REGION excerpts).
- action is add/edit/delete.
- No overlapping edits.
- Linked-symbol edits (required when params/functions depend on each other):
  patch ALL related call sites in the SAME response as multiple textEdits.
  Example: webview close handler + cleanup + fnResetIP/proxy release must stay consistent.
  List every touched symbol in "changes" (function names, flags, timers).
- Do not change one branch while leaving dependent isRunning/shouldClose/proxy timers inconsistent.
- For DynamicCode runtime: no import/export/require/module.exports.
- Use browser globals only: window, document, window.React, window.ReactDOM, window.antd, window.seft, window.csmApi.
- Keep code idempotent.
If unsafe to patch atomically, return empty textEdits and explain in summary.
End immediately after JSON.
""";

  private static final String MENU_JSON_CONTRACT_MIN = """
You are CSM Menu JSON Editor.

Return ONLY valid JSON.
No markdown.
No explanation.
No random text.

Patch mode schema (include at least one patch when user requests fixes):
{
  "status": "success",
  "patches": [
    {
      "action": "edit",
      "nodeId": "<existing-menu-node-id>",
      "parentId": "<parent-id-or-empty>",
      "path": "Module / Feature",
      "before": null,
      "after": {
        "trigger": {"filter": "..."},
        "label": "Nhãn tiếng Việt",
        "label_en": "English label",
        "label_zh": "中文标签"
      },
      "reason": "Fix trigger keys and 3-language labels"
    }
  ],
  "i18n": {"vi": {}, "en": {}, "zh": {}},
  "warnings": []
}

Rules:
- Never return "success" with patches: [] when the user asked to check/fix/add menu fields.
- Use status "need_more_context" with warnings when nodeId or safe context is missing.
- Allowed patch action: add, edit, delete.
""";

  public String getMenuJsonContractMin() {
    return MENU_JSON_CONTRACT_MIN;
  }

  public String getFrontendCodeContractMin() {
    return FRONTEND_CODE_CONTRACT_MIN;
  }

  public AiFlowIntent classifyLocalIntent(String contextType, String responseMode, String message) {
    String ctx = String.valueOf(contextType == null ? "" : contextType).trim().toLowerCase(Locale.ROOT);
    String mode = String.valueOf(responseMode == null ? "" : responseMode).trim().toLowerCase(Locale.ROOT);
    if ("menu_json".equals(ctx)) {
      return AiFlowIntent.MENU_JSON;
    }
    if ("code".equals(ctx) || "frontend_code".equals(ctx)) {
      if ("analyze".equals(mode)) {
        return AiFlowIntent.QUICK_QUESTION;
      }
      return AiFlowIntent.FRONTEND_CODE;
    }
    if ("edit".equals(mode)) {
      return AiFlowIntent.FRONTEND_CODE;
    }
    return AiFlowIntent.QUICK_QUESTION;
  }

  public String buildLocalMinimalPrompt(
      AiFlowIntent intent,
      String activeEditorContent,
      String ragContext,
      String memory,
      String userRequest) {
    return buildLocalMinimalPrompt(intent, activeEditorContent, ragContext, memory, userRequest, "");
  }

  public String buildLocalMinimalPrompt(
      AiFlowIntent intent,
      String activeEditorContent,
      String ragContext,
      String memory,
      String userRequest,
      String uiLanguage) {
    String contract = switch (intent) {
      case MENU_JSON -> MENU_JSON_CONTRACT_MIN;
      case FRONTEND_CODE -> FRONTEND_CODE_CONTRACT_MIN;
      case QUICK_QUESTION -> QUICK_QUESTION_CONTRACT_MIN;
    };
    int editorCap = Math.max(4000, localSlotActiveEditorChars);
    int ragCap = Math.max(1000, localSlotRagContextChars);
    int memCap = Math.max(500, localSlotMemoryChars);
    int reqCap = Math.max(500, localSlotUserRequestChars);
    String safeEditor = trimToMax(String.valueOf(activeEditorContent == null ? "" : activeEditorContent), editorCap);
    String safeRag = trimToMax(String.valueOf(ragContext == null ? "" : ragContext), ragCap);
    String safeMem = trimToMax(String.valueOf(memory == null ? "" : memory), memCap);
    String safeReq = trimToMax(String.valueOf(userRequest == null ? "" : userRequest), reqCap);

    StringBuilder sb = new StringBuilder();
    String baseSystem = intent == AiFlowIntent.QUICK_QUESTION ? BASE_SYSTEM_ANALYZE_MIN : BASE_SYSTEM_MIN;
    sb.append(baseSystem).append("\n\n");
    sb.append(buildPromptLanguageBlock(uiLanguage, userRequest));
    sb.append(contract).append("\n\n");
    if (intent == AiFlowIntent.MENU_JSON) {
      if (!safeEditor.isBlank()) {
        sb.append("[ACTIVE_EDITOR_MENU_JSON]\n").append(safeEditor).append("\n[/ACTIVE_EDITOR_MENU_JSON]\n\n");
      }
    } else if (intent == AiFlowIntent.FRONTEND_CODE) {
      if (!safeEditor.isBlank()) {
        sb.append("[ACTIVE_EDITOR_CODE]\n").append(safeEditor).append("\n[/ACTIVE_EDITOR_CODE]\n\n");
      }
    }
    if (!safeRag.isBlank()) {
      sb.append("[RETRIEVED_CONTEXT]\n").append(safeRag).append("\n[/RETRIEVED_CONTEXT]\n\n");
    }
    if (!safeMem.isBlank()) {
      sb.append("[SESSION_MEMORY]\n").append(safeMem).append("\n[/SESSION_MEMORY]\n\n");
    }
    sb.append("[USER_REQUEST]\n").append(safeReq).append("\n[/USER_REQUEST]");
    return sb.toString();
  }

  private String buildPromptLanguageBlock(String uiLanguage, String userRequest) {
    String lang = String.valueOf(uiLanguage == null ? "" : uiLanguage).trim().toLowerCase(Locale.ROOT);
    if (lang.isBlank()) {
      lang = "vi";
    }
    String sample = trimToMax(String.valueOf(userRequest == null ? "" : userRequest).trim(), 160);
    return switch (lang) {
      case "en" -> """
          [OUTPUT_LANGUAGE]
          Reply in English only. Match the user's wording and tone.
          Write JSON summary/changes fields in English when applicable.
          User sample: %s
          [/OUTPUT_LANGUAGE]

          """.formatted(sample);
      case "zh" -> """
          [OUTPUT_LANGUAGE]
          仅使用中文回复，与用户请求语气一致。
          JSON 中的 summary/changes 字段也使用中文。
          用户示例：%s
          [/OUTPUT_LANGUAGE]

          """.formatted(sample);
      default -> """
          [NGON_NGU_TRA_LOI]
          Chỉ trả lời bằng tiếng Việt, đúng văn phong câu hỏi người dùng.
          Các trường summary/changes trong JSON cũng dùng tiếng Việt.
          Mẫu câu người dùng: %s
          [/NGON_NGU_TRA_LOI]

          """.formatted(sample);
    };
  }

  public String generateLocalFlowContent(
      AiFlowIntent intent,
      String activeEditorContent,
      String ragContext,
      String memory,
      String userRequest,
      LlamaCppNativeService llamaService) {
    LlamaCppNativeService svc = llamaService != null ? llamaService : llamaCppNativeService;
    if (svc == null || !svc.isAvailable()) {
      return "";
    }
    String prompt = buildLocalMinimalPrompt(intent, activeEditorContent, ragContext, memory, userRequest, "");
    if (!prompt.contains("<|im_start|>assistant")) {
      prompt = prompt + "\n<|im_end|>\n<|im_start|>assistant\n";
    }
    try {
      String raw = svc.generateContentFast(prompt, Math.max(256, localLlamaMaxTokens));
      String text = extractResultTextFromWrappedJson(raw);
      if (text == null || text.isBlank()) {
        text = raw == null ? "" : raw.trim();
      }
      return normalizeLocalStructuredOutput(text);
    } catch (Exception ex) {
      log.warn("generateLocalFlowContent failed: {}", ex.getMessage());
      return "";
    }
  }

  /**
   * Clean model output without forcing fallback JSON — keeps local reasoning path open for retry/agentic layers.
   */
  public String normalizeLocalStructuredOutput(String rawOutput) {
    if (rawOutput == null || rawOutput.isBlank()) {
      return "";
    }
    String extracted = extractResultTextFromWrappedJson(rawOutput);
    String cleaned = cleanAiOutput(extracted);
    return cleaned.isBlank() ? extracted.trim() : cleaned;
  }

  /** Exposed for code-stream quality gate on menu edit responses. */
  public boolean isMenuJsonOutputStructurallyValid(String rawOutput) {
    if (rawOutput == null || rawOutput.isBlank()) {
      return false;
    }
    return isValidMenuJsonOrPatch(cleanAiOutput(rawOutput));
  }

  /**
   * True when menu JSON is structurally valid and would change the editor (non-empty patches/menu)
   * or explicitly asks for more context.
   */
  public boolean isMenuJsonOutputActionable(String rawOutput) {
    if (rawOutput == null || rawOutput.isBlank()) {
      return false;
    }
    String text = cleanAiOutput(rawOutput);
    if (!isValidMenuJsonOrPatch(text)) {
      return false;
    }
    try {
      Object parsed = objectMapper.readValue(text, Object.class);
      if (parsed instanceof List<?> list) {
        return !list.isEmpty();
      }
      if (!(parsed instanceof Map<?, ?> mapRaw)) {
        return false;
      }
      @SuppressWarnings("unchecked")
      Map<String, Object> map = (Map<String, Object>) mapRaw;
      if (map.containsKey("status") && map.containsKey("patches")) {
        String status = String.valueOf(map.get("status") == null ? "" : map.get("status")).trim();
        if ("need_more_context".equalsIgnoreCase(status)) {
          return true;
        }
        Object patchesObj = map.get("patches");
        if (!(patchesObj instanceof List<?> patches) || patches.isEmpty()) {
          return false;
        }
        for (Object patchObj : patches) {
          if (!(patchObj instanceof Map<?, ?> patchMapRaw)) {
            continue;
          }
          @SuppressWarnings("unchecked")
          Map<String, Object> patchMap = (Map<String, Object>) patchMapRaw;
          String action = String.valueOf(patchMap.get("action") == null ? "" : patchMap.get("action")).trim();
          String nodeId = String.valueOf(patchMap.get("nodeId") == null ? "" : patchMap.get("nodeId")).trim();
          if (action.isBlank() || nodeId.isBlank()) {
            continue;
          }
          Object after = patchMap.get("after");
          Object patchFields = patchMap.get("patch");
          if (after instanceof Map<?, ?> afterMap && !afterMap.isEmpty()) {
            return true;
          }
          if (patchFields instanceof Map<?, ?> fieldsMap && !fieldsMap.isEmpty()) {
            return true;
          }
          if ("delete".equalsIgnoreCase(action)) {
            return true;
          }
        }
        return false;
      }
      Object menu = map.get("menu");
      if (menu instanceof List<?> menuList) {
        return !menuList.isEmpty();
      }
      if (map.containsKey("menu_node")) {
        return true;
      }
      return !map.isEmpty();
    } catch (Exception ignored) {
      return false;
    }
  }

  public String validateOrFallbackLocal(AiFlowIntent intent, String rawOutput) {
    String normalized = normalizeLocalStructuredOutput(rawOutput);
    if (normalized.isBlank()) {
      return fallbackForLocalIntent(intent);
    }
    switch (intent) {
      case MENU_JSON:
        if (isValidMenuJsonOrPatch(normalized)) {
          return normalized;
        }
        break;
      case FRONTEND_CODE:
        if (looksLikeCodeEditJson(normalized)) {
          return normalized;
        }
        break;
      case QUICK_QUESTION:
        return normalized;
      default:
        break;
    }
    return fallbackForLocalIntent(intent);
  }

  private String fallbackForLocalIntent(AiFlowIntent intent) {
    return switch (intent) {
      case MENU_JSON -> """
          {"status":"need_more_context","patches":[],"i18n":{"vi":{},"en":{},"zh":{}},"warnings":["Insufficient safe context"]}
          """.trim();
      case FRONTEND_CODE -> """
          {"summary":"Không tạo được patch an toàn","changes":[],"textEdits":[]}
          """.trim();
      case QUICK_QUESTION -> "";
    };
  }

  private String cleanAiOutput(String raw) {
    if (raw == null) {
      return "";
    }
    String text = raw.trim();
    if (text.startsWith("```")) {
      int firstNl = text.indexOf('\n');
      int lastFence = text.lastIndexOf("```");
      if (firstNl >= 0 && lastFence > firstNl) {
        text = text.substring(firstNl + 1, lastFence).trim();
      }
    }
    int jsonStart = text.indexOf('{');
    int arrayStart = text.indexOf('[');
    int start = -1;
    if (jsonStart >= 0 && arrayStart >= 0) {
      start = Math.min(jsonStart, arrayStart);
    } else if (jsonStart >= 0) {
      start = jsonStart;
    } else if (arrayStart >= 0) {
      start = arrayStart;
    }
    if (start > 0) {
      text = text.substring(start).trim();
    }
    return text.trim();
  }

  private boolean isValidMenuJsonOrPatch(String text) {
    if (text == null || text.isBlank()) {
      return false;
    }
    try {
      Object parsed = objectMapper.readValue(text, Object.class);
      if (parsed instanceof List<?> list) {
        return !list.isEmpty();
      }
      if (!(parsed instanceof Map<?, ?> mapRaw)) {
        return false;
      }
      @SuppressWarnings("unchecked")
      Map<String, Object> map = (Map<String, Object>) mapRaw;
      if (map.containsKey("patches") || map.containsKey("status")) {
        return true;
      }
      if (map.containsKey("menu") || map.containsKey("menu_node")) {
        return true;
      }
      return map.containsKey("id") && map.containsKey("label");
    } catch (Exception ignored) {
      return false;
    }
  }

  private boolean looksLikeCodeEditJson(String text) {
    if (text == null || text.isBlank()) {
      return false;
    }
    try {
      Object parsed = objectMapper.readValue(text, Object.class);
      if (!(parsed instanceof Map<?, ?> mapRaw)) {
        return false;
      }
      @SuppressWarnings("unchecked")
      Map<String, Object> map = (Map<String, Object>) mapRaw;
      return map.containsKey("textEdits") || map.containsKey("summary");
    } catch (Exception ignored) {
      return false;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Per-app AI session context file  (mirrors AI Assistant's /memories/session/)
  // File path: {contextDir}/ai_context_{appId}.md
  // Loaded before every AI call and saved after every successful generation.
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Return the context file path for a given appId.
   * contextDir is relative to the JVM working directory.
   */
  private java.io.File getContextFile(String appId) {
    String safeName = appId.replaceAll("[^a-zA-Z0-9_\\-]", "_");
    return new java.io.File(contextDir, "ai_context_" + safeName + ".md");
  }

  /** Return AI Assistant continuity memory file path for a given appId and optional scope key. */
  private java.io.File getAiAssistantMemoryFile(String appId, String scopeKey) {

    String safeName = sanitizeAppName(appId);
    String safeScope = scopeKey == null ? "" : scopeKey.replaceAll("[^a-zA-Z0-9_\\-]", "_");
    if (safeScope.isBlank()) {
      return new java.io.File(contextDir, "ai_assistant_context_" + safeName + ".md");
    }
    return new java.io.File(contextDir, "ai_assistant_context_" + safeName + "__" + safeScope + ".md");
  }

  /** Return AI Assistant pending-questions file path for a given appId and optional scope key. */
  private java.io.File getAiAssistantPendingFile(String appId, String scopeKey) {
    String safeName = sanitizeAppName(appId);
    String safeScope = scopeKey == null ? "" : scopeKey.replaceAll("[^a-zA-Z0-9_\\-]", "_");
    if (safeScope.isBlank()) {
      return new java.io.File(contextDir, "ai_assistant_pending_" + safeName + ".md");
    }
    return new java.io.File(contextDir, "ai_assistant_pending_" + safeName + "__" + safeScope + ".md");
  }

  /** Load unresolved pending questions for AI Assistant continuation. */
  public List<String> loadAiAssistantPendingQuestions(String appId, String scopeKey, int maxItems) {
    if (appId == null || appId.isBlank()) return Collections.emptyList();
    java.io.File f = getAiAssistantPendingFile(appId, scopeKey);
    if (!f.exists()) return Collections.emptyList();
    int safeMax = Math.max(1, Math.min(50, maxItems));
    try {
      List<String> lines = Files.readAllLines(f.toPath(), StandardCharsets.UTF_8);
      List<String> result = new ArrayList<>();
      for (String line : lines) {
        String raw = String.valueOf(line == null ? "" : line).trim();
        if (raw.startsWith("- ")) {
          String item = raw.substring(2).trim();
          if (!item.isEmpty()) {
            result.add(item);
          }
        }
        if (result.size() >= safeMax) break;
      }
      return result;
    } catch (Exception e) {
      log.warn("Could not load AI Assistant pending questions for appId={} scope={}: {}", appId, scopeKey, e.getMessage());
      return Collections.emptyList();
    }
  }

  /**
   * Load the code master prompt (system core for context_type=code), cache for reuse.
   * Path is configurable via ai.context.code-master-prompt-path property.
   */
  public String getCodeMasterPrompt() {
    if (codeMasterPrompt != null) return codeMasterPrompt;
    synchronized (this) {
      if (codeMasterPrompt != null) return codeMasterPrompt;
      try {
        Resource resource = resolveResource(codeMasterPromptPath);
        try (InputStream in = resource.getInputStream()) {
          codeMasterPrompt = StreamUtils.copyToString(in, StandardCharsets.UTF_8);
          return codeMasterPrompt;
        }
      } catch (IOException e) {
        throw new RuntimeException("Không đọc được code master prompt từ: " + codeMasterPromptPath, e);
      }
    }
  }

  /** Load persisted AI Assistant conversation memory for continuity across turns. */
  public String loadAiAssistantConversationMemory(String appId) {
    return loadAiAssistantConversationMemory(appId, null);
  }

  /** Load persisted AI Assistant conversation memory for continuity across turns. */
  public String loadAiAssistantConversationMemory(String appId, String scopeKey) {
    if (appId == null || appId.isBlank()) return "";
    java.io.File f = getAiAssistantMemoryFile(appId, scopeKey);
    if (!f.exists()) return "";
    try {
      String text = java.nio.file.Files.readString(f.toPath(), StandardCharsets.UTF_8);
      if (text == null) return "";
      if (text.length() <= AI_ASSISTANT_MEMORY_MAX_CHARS) return text;
      return text.substring(text.length() - AI_ASSISTANT_MEMORY_MAX_CHARS);
    } catch (Exception e) {
      log.warn("Could not load AI Assistant continuity memory for appId={} scope={}: {}", appId, scopeKey, e.getMessage());
      return "";
    }
  }

  /** Append one AI Assistant Q&A turn so later requests continue instead of restarting. */
  public void appendAiAssistantConversationTurn(
      String appId,
      String userMessage,
      String assistantMessage,
      String contextType,
      String responseMode,
      List<Map<String, Object>> attachments) {
    appendAiAssistantConversationTurn(appId, null, userMessage, assistantMessage, contextType, responseMode, attachments);
  }

  /** Append one AI Assistant Q&A turn with a scoped continuity key. */
  public void appendAiAssistantConversationTurn(
      String appId,
      String scopeKey,
      String userMessage,
      String assistantMessage,
      String contextType,
      String responseMode,
      List<Map<String, Object>> attachments) {
    if (appId == null || appId.isBlank()) return;
    try {
      String existing = loadAiAssistantConversationMemory(appId, scopeKey);
      String now = java.time.LocalDateTime.now()
          .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
      String turnId = UUID.randomUUID().toString();

      int attachmentCount = attachments == null ? 0 : attachments.size();
      String turn = "\n\n### Turn @ " + now + "\n"
          + "turn_id=" + turnId + "\n"
          + "context_type=" + String.valueOf(contextType == null ? "" : contextType).trim() + "\n"
          + "response_mode=" + String.valueOf(responseMode == null ? "" : responseMode).trim() + "\n"
          + "attachment_count=" + attachmentCount + "\n\n"
          + "User:\n" + trimToMax(String.valueOf(userMessage == null ? "" : userMessage).trim(), 20000) + "\n\n"
          + "Assistant:\n" + trimToMax(String.valueOf(assistantMessage == null ? "" : assistantMessage).trim(), 45000);

      String merged;
      if (existing == null || existing.isBlank()) {
        merged = "# AI Assistant Conversation Continuity: app_id=" + appId + "\n"
            + (scopeKey == null || scopeKey.isBlank() ? "" : "scope_key=" + scopeKey + "\n")
            + "<!-- AUTO-GENERATED by GitHubModelsService -->\n"
            + turn;
      } else {
        merged = existing.trim() + turn;
      }

      if (merged.length() > AI_ASSISTANT_MEMORY_MAX_CHARS) {
        merged = merged.substring(merged.length() - AI_ASSISTANT_MEMORY_MAX_CHARS);
      }

      java.io.File f = getAiAssistantMemoryFile(appId, scopeKey);
      f.getParentFile().mkdirs();
      java.nio.file.Files.writeString(f.toPath(), merged, StandardCharsets.UTF_8);
      updateAiAssistantPendingQuestions(appId, scopeKey, userMessage, assistantMessage);
    } catch (Exception e) {
      log.warn("Could not append AI Assistant continuity memory for appId={} scope={}: {}", appId, scopeKey, e.getMessage());
    }
  }

  public List<AiAssistantTurn> listAiAssistantConversationTurns(String appId, String scopeKey, int limit) {
    if (appId == null || appId.isBlank()) {
      return Collections.emptyList();
    }
    int safeLimit = Math.max(1, Math.min(500, limit));
    java.io.File f = getAiAssistantMemoryFile(appId, scopeKey);
    if (!f.exists()) {
      return Collections.emptyList();
    }
    try {
      String text = java.nio.file.Files.readString(f.toPath(), StandardCharsets.UTF_8);
      List<AiAssistantTurn> parsed = parseAiAssistantTurns(text);
      if (parsed.size() <= safeLimit) {
        return parsed;
      }
      return new ArrayList<>(parsed.subList(parsed.size() - safeLimit, parsed.size()));
    } catch (Exception e) {
      log.warn("Could not list AI Assistant turns for appId={} scope={}: {}", appId, scopeKey, e.getMessage());
      return Collections.emptyList();
    }
  }

  public boolean deleteAiAssistantConversationTurn(String appId, String scopeKey, String turnId) {
    String safeTurnId = String.valueOf(turnId == null ? "" : turnId).trim();
    if (appId == null || appId.isBlank() || safeTurnId.isBlank()) {
      return false;
    }
    java.io.File f = getAiAssistantMemoryFile(appId, scopeKey);
    if (!f.exists()) {
      return false;
    }
    try {
      String text = java.nio.file.Files.readString(f.toPath(), StandardCharsets.UTF_8);
      List<AiAssistantTurn> parsed = parseAiAssistantTurns(text);
      int before = parsed.size();
      parsed.removeIf(turn -> safeTurnId.equals(String.valueOf(turn.turnId == null ? "" : turn.turnId).trim()));
      if (parsed.size() == before) {
        return false;
      }
      writeTurnsBackToMemoryFile(f, text, parsed, appId, scopeKey);
      return true;
    } catch (Exception e) {
      log.warn("Could not delete AI Assistant turn for appId={} scope={} turnId={}: {}", appId, scopeKey, safeTurnId, e.getMessage());
      return false;
    }
  }

  public boolean rateAiAssistantConversationTurn(String appId, String scopeKey, String turnId, int rating) {
    String safeTurnId = String.valueOf(turnId == null ? "" : turnId).trim();
    if (appId == null || appId.isBlank() || safeTurnId.isBlank()) {
      return false;
    }
    int normalizedRating = Math.max(-1, Math.min(1, rating));
    java.io.File f = getAiAssistantMemoryFile(appId, scopeKey);
    if (!f.exists()) {
      return false;
    }
    try {
      String text = java.nio.file.Files.readString(f.toPath(), StandardCharsets.UTF_8);
      List<AiAssistantTurn> parsed = parseAiAssistantTurns(text);
      boolean updated = false;
      String now = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
      for (AiAssistantTurn turn : parsed) {
        String currentTurnId = String.valueOf(turn.turnId == null ? "" : turn.turnId).trim();
        if (!safeTurnId.equals(currentTurnId)) {
          continue;
        }
        turn.feedbackRating = normalizedRating;
        turn.feedbackUpdatedAt = now;
        updated = true;
        break;
      }
      if (!updated) {
        return false;
      }
      writeTurnsBackToMemoryFile(f, text, parsed, appId, scopeKey);
      return true;
    } catch (Exception e) {
      log.warn("Could not rate AI Assistant turn for appId={} scope={} turnId={}: {}", appId, scopeKey, safeTurnId, e.getMessage());
      return false;
    }
  }

  public String buildPositiveFeedbackContext(String appId, String scopeKey, String requestText, int maxItems, int maxChars) {
    if (appId == null || appId.isBlank()) {
      return "";
    }
    java.io.File f = getAiAssistantMemoryFile(appId, scopeKey);
    if (!f.exists()) {
      return "";
    }

    int safeMaxItems = Math.max(1, Math.min(12, maxItems));
    int safeMaxChars = Math.max(400, Math.min(12000, maxChars));
    try {
      String text = java.nio.file.Files.readString(f.toPath(), StandardCharsets.UTF_8);
      List<AiAssistantTurn> parsed = parseAiAssistantTurns(text);
      if (parsed.isEmpty()) {
        return "";
      }

      List<String> queryTokens = tokenizeForFeedbackSearch(requestText);
      List<AiAssistantTurn> ranked = new ArrayList<>();
      for (AiAssistantTurn turn : parsed) {
        if (turn == null || turn.feedbackRating <= 0) {
          continue;
        }
        ranked.add(turn);
      }
      if (ranked.isEmpty()) {
        return "";
      }

      ranked.sort((a, b) -> {
        int scoreA = scoreTurnForFeedbackSearch(a, queryTokens);
        int scoreB = scoreTurnForFeedbackSearch(b, queryTokens);
        if (scoreA != scoreB) {
          return Integer.compare(scoreB, scoreA);
        }
        return String.valueOf(b.timestamp == null ? "" : b.timestamp)
            .compareTo(String.valueOf(a.timestamp == null ? "" : a.timestamp));
      });

      StringBuilder sb = new StringBuilder();
      sb.append("## POSITIVE_FEEDBACK_MEMORY\n");
      sb.append("Use these previously liked answers as style/quality references when relevant to current request.\n\n");

      int used = 0;
      for (AiAssistantTurn turn : ranked) {
        if (used >= safeMaxItems) {
          break;
        }
        String user = trimToMax(String.valueOf(turn.userMessage == null ? "" : turn.userMessage).trim(), 600);
        String assistant = trimToMax(String.valueOf(turn.assistantMessage == null ? "" : turn.assistantMessage).trim(), 1200);
        if (assistant.isBlank()) {
          continue;
        }
        String block = "### Liked turn\n"
            + "time=" + String.valueOf(turn.timestamp == null ? "" : turn.timestamp).trim() + "\n"
            + "user_request=" + user + "\n"
            + "assistant_answer=\n" + assistant + "\n\n";
        if (sb.length() + block.length() > safeMaxChars && used > 0) {
          break;
        }
        sb.append(block);
        used++;
      }

      if (used == 0) {
        return "";
      }
      return sb.toString().trim();
    } catch (Exception e) {
      log.warn("Could not build positive feedback context for appId={} scope={}: {}", appId, scopeKey, e.getMessage());
      return "";
    }
  }

  private int scoreTurnForFeedbackSearch(AiAssistantTurn turn, List<String> queryTokens) {
    String haystack = (
        String.valueOf(turn == null || turn.userMessage == null ? "" : turn.userMessage)
            + " "
            + String.valueOf(turn == null || turn.assistantMessage == null ? "" : turn.assistantMessage)
    ).toLowerCase(Locale.ROOT);
    int score = 0;
    for (String token : queryTokens) {
      if (token.isBlank()) continue;
      if (haystack.contains(token)) {
        score += 2;
      }
    }
    score += Math.max(0, turn == null ? 0 : turn.feedbackRating) * 3;
    return score;
  }

  private List<String> tokenizeForFeedbackSearch(String text) {
    String src = String.valueOf(text == null ? "" : text).toLowerCase(Locale.ROOT);
    if (src.isBlank()) {
      return Collections.emptyList();
    }
    Matcher matcher = Pattern.compile("[\\p{L}\\p{N}_]{2,}").matcher(src);
    LinkedHashSet<String> out = new LinkedHashSet<>();
    while (matcher.find() && out.size() < 24) {
      String token = String.valueOf(matcher.group() == null ? "" : matcher.group()).trim();
      if (!token.isBlank()) {
        out.add(token);
      }
    }
    return new ArrayList<>(out);
  }

  public int clearAiAssistantConversationTurns(String appId, String scopeKey) {
    if (appId == null || appId.isBlank()) {
      return 0;
    }
    java.io.File f = getAiAssistantMemoryFile(appId, scopeKey);
    int deleted = 0;
    if (f.exists()) {
      try {
        String text = java.nio.file.Files.readString(f.toPath(), StandardCharsets.UTF_8);
        deleted = parseAiAssistantTurns(text).size();
      } catch (Exception ignore) {
        deleted = 0;
      }
      try {
        java.nio.file.Files.deleteIfExists(f.toPath());
      } catch (Exception e) {
        log.warn("Could not delete AI Assistant memory file for appId={} scope={}: {}", appId, scopeKey, e.getMessage());
      }
    }
    try {
      java.io.File pending = getAiAssistantPendingFile(appId, scopeKey);
      if (pending.exists()) {
        java.nio.file.Files.deleteIfExists(pending.toPath());
      }
    } catch (Exception e) {
      log.debug("Could not delete AI Assistant pending file for appId={} scope={}: {}", appId, scopeKey, e.getMessage());
    }
    return deleted;
  }

  private void writeTurnsBackToMemoryFile(
      java.io.File file,
      String originalText,
      List<AiAssistantTurn> turns,
      String appId,
      String scopeKey) throws IOException {
    String header = extractHeaderBeforeTurns(originalText);
    if (header.isBlank()) {
      header = "# AI Assistant Conversation Continuity: app_id=" + appId + "\n"
          + (scopeKey == null || scopeKey.isBlank() ? "" : "scope_key=" + scopeKey + "\n")
          + "<!-- AUTO-GENERATED by GitHubModelsService -->";
    }
    StringBuilder out = new StringBuilder(header.trim());
    for (AiAssistantTurn turn : turns) {
      out.append("\n\n");
      out.append(formatTurnBlock(turn));
    }
    java.nio.file.Files.writeString(file.toPath(), out.toString(), StandardCharsets.UTF_8);
  }

  private String extractHeaderBeforeTurns(String text) {
    String source = String.valueOf(text == null ? "" : text);
    int firstTurn = source.indexOf("\n### Turn @ ");
    if (firstTurn < 0) {
      firstTurn = source.indexOf("### Turn @ ");
    }
    if (firstTurn < 0) {
      return source.trim();
    }
    return source.substring(0, firstTurn).trim();
  }

  private String formatTurnBlock(AiAssistantTurn turn) {
    String timestamp = String.valueOf(turn == null || turn.timestamp == null ? "" : turn.timestamp).trim();
    if (timestamp.isBlank()) {
      timestamp = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }
    String turnId = String.valueOf(turn == null || turn.turnId == null ? "" : turn.turnId).trim();
    if (turnId.isBlank()) {
      turnId = UUID.randomUUID().toString();
    }
    String contextType = String.valueOf(turn == null || turn.contextType == null ? "" : turn.contextType).trim();
    String responseMode = String.valueOf(turn == null || turn.responseMode == null ? "" : turn.responseMode).trim();
    int attachmentCount = Math.max(0, turn == null ? 0 : turn.attachmentCount);
    int feedbackRating = Math.max(-1, Math.min(1, turn == null ? 0 : turn.feedbackRating));
    String feedbackUpdatedAt = String.valueOf(turn == null || turn.feedbackUpdatedAt == null ? "" : turn.feedbackUpdatedAt).trim();
    String user = String.valueOf(turn == null || turn.userMessage == null ? "" : turn.userMessage).trim();
    String assistant = String.valueOf(turn == null || turn.assistantMessage == null ? "" : turn.assistantMessage).trim();

    return "### Turn @ " + timestamp + "\n"
        + "turn_id=" + turnId + "\n"
        + "context_type=" + contextType + "\n"
        + "response_mode=" + responseMode + "\n"
        + "attachment_count=" + attachmentCount + "\n\n"
      + "feedback_rating=" + feedbackRating + "\n"
      + "feedback_updated_at=" + feedbackUpdatedAt + "\n\n"
        + "User:\n" + user + "\n\n"
        + "Assistant:\n" + assistant;
  }

  private List<AiAssistantTurn> parseAiAssistantTurns(String text) {
    String source = String.valueOf(text == null ? "" : text).replace("\r\n", "\n").replace('\r', '\n');
    if (source.isBlank()) {
      return Collections.emptyList();
    }
    Pattern headerPattern = Pattern.compile("(?m)^### Turn @ ");
    Matcher matcher = headerPattern.matcher(source);
    List<Integer> starts = new ArrayList<>();
    while (matcher.find()) {
      starts.add(matcher.start());
    }
    if (starts.isEmpty()) {
      return Collections.emptyList();
    }

    List<AiAssistantTurn> turns = new ArrayList<>();
    for (int i = 0; i < starts.size(); i++) {
      int start = starts.get(i);
      int end = (i + 1 < starts.size()) ? starts.get(i + 1) : source.length();
      String block = source.substring(start, end).trim();
      AiAssistantTurn turn = parseTurnBlock(block, i);
      if (turn != null) {
        turns.add(turn);
      }
    }
    return turns;
  }

  private AiAssistantTurn parseTurnBlock(String block, int index) {
    if (block == null || block.isBlank()) {
      return null;
    }
    String src = block.trim();
    AiAssistantTurn turn = new AiAssistantTurn();

    String[] lines = src.split("\n", 2);
    String header = lines.length > 0 ? lines[0].trim() : "";
    turn.timestamp = header.startsWith("### Turn @ ") ? header.substring("### Turn @ ".length()).trim() : "";

    turn.turnId = extractLineValue(src, "turn_id=");
    turn.contextType = extractLineValue(src, "context_type=");
    turn.responseMode = extractLineValue(src, "response_mode=");
    turn.attachmentCount = parseSafeInt(extractLineValue(src, "attachment_count="));
    turn.feedbackRating = Math.max(-1, Math.min(1, parseSafeInt(extractLineValue(src, "feedback_rating="))));
    turn.feedbackUpdatedAt = extractLineValue(src, "feedback_updated_at=");

    int userStart = src.indexOf("\nUser:\n");
    if (userStart < 0 && src.startsWith("User:\n")) {
      userStart = 0;
    }
    int assistantStart = src.indexOf("\n\nAssistant:\n");
    if (assistantStart < 0) {
      assistantStart = src.indexOf("\nAssistant:\n");
    }

    String user = "";
    String assistant = "";
    if (userStart >= 0) {
      int userBodyStart = userStart == 0 ? "User:\n".length() : userStart + "\nUser:\n".length();
      int userBodyEnd = assistantStart > userBodyStart ? assistantStart : src.length();
      user = src.substring(userBodyStart, userBodyEnd).trim();
    }
    if (assistantStart >= 0) {
      int assistantBodyStart;
      if (src.startsWith("Assistant:\n", assistantStart)) {
        assistantBodyStart = assistantStart + "Assistant:\n".length();
      } else if (src.startsWith("\nAssistant:\n", assistantStart)) {
        assistantBodyStart = assistantStart + "\nAssistant:\n".length();
      } else {
        assistantBodyStart = assistantStart + "\n\nAssistant:\n".length();
      }
      assistant = src.substring(Math.min(assistantBodyStart, src.length())).trim();
    }

    turn.userMessage = user;
    turn.assistantMessage = assistant;

    if (turn.turnId == null || turn.turnId.isBlank()) {
      turn.turnId = buildFallbackTurnId(turn, index);
    }
    if (turn.timestamp == null) {
      turn.timestamp = "";
    }
    return turn;
  }

  private String buildFallbackTurnId(AiAssistantTurn turn, int index) {
    String seed = String.valueOf(turn.timestamp == null ? "" : turn.timestamp)
        + "|" + String.valueOf(turn.userMessage == null ? "" : turn.userMessage)
        + "|" + String.valueOf(turn.assistantMessage == null ? "" : turn.assistantMessage)
        + "|" + index;
    return UUID.nameUUIDFromBytes(seed.getBytes(StandardCharsets.UTF_8)).toString();
  }

  private String extractLineValue(String text, String prefix) {
    if (text == null || text.isBlank() || prefix == null || prefix.isBlank()) {
      return "";
    }
    Pattern p = Pattern.compile("(?m)^" + Pattern.quote(prefix) + "(.*)$");
    Matcher m = p.matcher(text);
    if (!m.find()) {
      return "";
    }
    return String.valueOf(m.group(1) == null ? "" : m.group(1)).trim();
  }

  private int parseSafeInt(String raw) {
    try {
      return Integer.parseInt(String.valueOf(raw == null ? "0" : raw).trim());
    } catch (Exception e) {
      return 0;
    }
  }

  private void updateAiAssistantPendingQuestions(
      String appId,
      String scopeKey,
      String userMessage,
      String assistantMessage) {
    try {
      List<String> existing = new ArrayList<>(loadAiAssistantPendingQuestions(appId, scopeKey, AI_ASSISTANT_PENDING_MAX_ITEMS));

      // If user replies in this scoped thread, assume the oldest pending item has been addressed.
      if (userMessage != null && !userMessage.trim().isEmpty() && !existing.isEmpty()) {
        existing.remove(0);
      }

      List<String> extracted = extractPendingQuestionsFromAssistant(assistantMessage);
      LinkedHashSet<String> merged = new LinkedHashSet<>();
      merged.addAll(existing);
      merged.addAll(extracted);

      List<String> limited = new ArrayList<>(merged);
      if (limited.size() > AI_ASSISTANT_PENDING_MAX_ITEMS) {
        limited = limited.subList(limited.size() - AI_ASSISTANT_PENDING_MAX_ITEMS, limited.size());
      }

      StringBuilder out = new StringBuilder();
      out.append("# AI Assistant Pending Questions\n");
      out.append("<!-- AUTO-GENERATED by GitHubModelsService -->\n");
      for (String item : limited) {
        out.append("- ").append(item).append("\n");
      }

      java.io.File f = getAiAssistantPendingFile(appId, scopeKey);
      f.getParentFile().mkdirs();
      java.nio.file.Files.writeString(f.toPath(), out.toString(), StandardCharsets.UTF_8);
    } catch (Exception e) {
      log.warn("Could not update AI Assistant pending questions for appId={} scope={}: {}", appId, scopeKey, e.getMessage());
    }
  }

  private List<String> extractPendingQuestionsFromAssistant(String assistantMessage) {
    if (assistantMessage == null || assistantMessage.isBlank()) {
      return Collections.emptyList();
    }

    String raw = assistantMessage.replace("\r", "\n").trim();
    List<String> candidates = new ArrayList<>();

    Pattern lineQuestion = Pattern.compile("(?m)^(?:[-*\\d.)\\s]*)?(.{8,240}\\?)\\s*$");
    Matcher matcher = lineQuestion.matcher(raw);
    while (matcher.find()) {
      String q = String.valueOf(matcher.group(1)).trim();
      if (!q.isEmpty()) {
        candidates.add(trimToMax(q, 240));
      }
      if (candidates.size() >= 8) break;
    }

    if (candidates.isEmpty()) {
      Pattern askPattern = Pattern.compile("(?i)(please provide|can you share|could you share|vui long|cho biet|xin cho biet|ban co the cung cap)([^\\n.!?]{0,200})");
      Matcher askMatcher = askPattern.matcher(raw);
      while (askMatcher.find()) {
        String sentence = (askMatcher.group(0) == null ? "" : askMatcher.group(0)).trim();
        if (!sentence.isEmpty()) {
          if (!sentence.endsWith("?")) sentence = sentence + "?";
          candidates.add(trimToMax(sentence, 240));
        }
        if (candidates.size() >= 8) break;
      }
    }

    if (candidates.isEmpty()) {
      return Collections.emptyList();
    }
    return new ArrayList<>(new LinkedHashSet<>(candidates));
  }

  /**
   * Load the per-app session context block.
   * Returns empty string if the file does not exist yet.
   */
  public String loadAppContextFile(String appId) {
    if (appId == null || appId.isBlank()) return "";
    java.io.File f = getContextFile(appId);
    if (!f.exists()) return "";
    try {
      return java.nio.file.Files.readString(f.toPath(), StandardCharsets.UTF_8);
    } catch (IOException e) {
      log.warn("Could not read AI context file for appId={}: {}", appId, e.getMessage());
      return "";
    }
  }

  /**
   * Build menu knowledge context block for AI Assistant chat requests.
   * Auto-loads ai_menu_*.md files when request is detected as menu design.
   */
  public String buildAiAssistantMenuKnowledgeBlock(String appId, String contextType, String taskType) {
    if (!isMenuDesignContext(contextType, taskType)) {
      return "";
    }

    List<String> sections = new ArrayList<>();
    List<String> mdFiles = loadMenuKnowledgeFiles();
    for (String entry : mdFiles) {
      if (entry == null || entry.isBlank()) {
        continue;
      }
      sections.add(entry);
    }

    String appContext = loadAppContextFile(appId);
    if (!appContext.isBlank()) {
      sections.add("### Session memory (ai_context_" + sanitizeAppName(appId) + ".md)\n" + appContext.trim());
    }

    if (sections.isEmpty()) {
      return "";
    }

    return "## AUTO-LOADED MENU KNOWLEDGE\n"
        + "Use these markdown references as high-priority context for menu design requests.\n\n"
        + String.join("\n\n", sections);
  }

  private boolean isMenuDesignContext(String contextType, String taskType) {
    String normalizedContext = contextType == null ? "" : contextType.trim().toLowerCase();
    String normalizedTask = taskType == null ? "" : taskType.trim().toLowerCase();
    return "menu_json".equals(normalizedContext)
        || "menu_design".equals(normalizedTask)
        || "menu".equals(normalizedTask);
  }

  private String sanitizeAppName(String appId) {
    if (appId == null || appId.isBlank()) {
      return "unknown";
    }
    return appId.replaceAll("[^a-zA-Z0-9_\\-]", "_");
  }

  private List<String> loadMenuKnowledgeFiles() {
    Path dir = Paths.get(contextDir);
    if (!Files.isDirectory(dir)) {
      return Collections.emptyList();
    }

    final int maxCharsPerFile = 60000;
    final int maxFiles = 12;
    List<String> sections = new ArrayList<>();

    try (var stream = Files.list(dir)) {
      List<Path> markdownFiles = stream
          .filter(Files::isRegularFile)
          .filter(path -> {
            String fileName = path.getFileName().toString().toLowerCase();
            return fileName.endsWith(".md")
                && (fileName.startsWith("ai_menu_")
                || fileName.startsWith("ai_system_")
                || fileName.contains("system_structure")
                || fileName.contains("architecture"));
          })
          .sorted(Comparator.comparing(path -> path.getFileName().toString().toLowerCase()))
          .limit(maxFiles)
          .toList();

      for (Path path : markdownFiles) {
        try {
          String text = Files.readString(path, StandardCharsets.UTF_8);
          if (text == null || text.isBlank()) {
            continue;
          }
          String trimmed = text.trim();
          if (trimmed.length() > maxCharsPerFile) {
            trimmed = trimmed.substring(0, maxCharsPerFile) + "\n...[truncated]";
          }
          sections.add("### " + path.getFileName() + "\n" + trimmed);
        } catch (Exception readEx) {
          log.warn("Could not read menu knowledge file {}: {}", path, readEx.getMessage());
        }
      }
    } catch (Exception e) {
      log.warn("Could not scan menu knowledge directory {}: {}", dir, e.getMessage());
    }

    return sections;
  }

  /**
   * Persist / update the per-app session context file after a successful AI generation.
   *
   * @param appId       the target app id
   * @param newRequest  the user request text that was just processed
   * @param resultJson  the raw JSON string returned by the AI (the full result wrapper)
   */
  public void updateAppContextFile(String appId, String newRequest, String resultJson) {
    if (appId == null || appId.isBlank()) return;
    try {
      // Load existing context so we can accumulate history
      String existing = loadAppContextFile(appId);
      String existingHistory = extractSection(existing, "## Request History");
      String now = java.time.LocalDateTime.now()
          .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));

      // Accumulate request history
      String entry = "[" + now + "] " + newRequest.trim();
      String combined = existingHistory.isBlank() ? entry : existingHistory.trim() + "\n---\n" + entry;
      if (combined.length() > CTX_MAX_HISTORY_CHARS) {
        combined = combined.substring(combined.length() - CTX_MAX_HISTORY_CHARS);
      }

      // Build compact result summary
      String resultSummary = buildResultSummaryForContext(resultJson);

      // Build PENDING section from unresolved_assumptions + pending notes
      String pendingSection = buildPendingSectionForContext(resultJson);

      String content = "# AI Session Context: app_id=" + appId + "\n"
          + "<!-- AUTO-GENERATED by GitHubModelsService - do not edit manually -->\n"
          + "## Last Updated: " + now + "\n\n"
          + "## Request History\n" + combined + "\n\n"
          + (pendingSection.isBlank() ? "" : pendingSection + "\n\n")
          + "## Previous AI Output Summary\n" + resultSummary + "\n";

      java.io.File f = getContextFile(appId);
      f.getParentFile().mkdirs();
      java.nio.file.Files.writeString(f.toPath(), content, StandardCharsets.UTF_8);
      log.info("Updated AI context file for appId={} ({})", appId, f.getAbsolutePath());
    } catch (Exception e) {
      log.warn("Could not update AI context file for appId={}: {}", appId, e.getMessage());
    }
  }

  /** Extract a named ## section from context file content. Returns "" if absent. */
  private String extractSection(String content, String heading) {
    if (content == null || content.isBlank()) return "";
    int start = content.indexOf(heading);
    if (start < 0) return "";
    start += heading.length();
    // find next ## heading
    int end = content.indexOf("\n## ", start);
    return (end < 0 ? content.substring(start) : content.substring(start, end)).trim();
  }

  /** Build a compact summary of the AI JSON result for the context file. */
  @SuppressWarnings("unchecked")
  private String buildResultSummaryForContext(String resultJson) {
    if (resultJson == null || resultJson.isBlank()) return "(no result)";
    try {
      Map<String, Object> wrapper = objectMapper.readValue(resultJson, Map.class);
      Object data = wrapper.getOrDefault("data", wrapper.get("result"));
      if (data == null) data = wrapper;
      Map<String, Object> payload = data instanceof Map ? (Map<String, Object>) data : wrapper;

      Object menuObj = payload.get("menu");
      int menuCount = menuObj instanceof java.util.List ? ((java.util.List<?>) menuObj).size() : 0;
      Object notesObj = payload.get("notes");
      String notesStr = notesObj != null ? objectMapper.writeValueAsString(notesObj) : "[]";

      String summary = "menu_count=" + menuCount + "\nnotes_preview=" + notesStr;
      if (summary.length() > CTX_MAX_RESULT_CHARS) summary = summary.substring(0, CTX_MAX_RESULT_CHARS);
      return summary;
    } catch (Exception e) {
      String raw = resultJson.length() > 1200 ? resultJson.substring(0, 1200) : resultJson;
      return "raw_preview=" + raw;
    }
  }

  /** Build a PENDING section listing unresolved_assumptions and todo notes from the last result. */
  @SuppressWarnings("unchecked")
  private String buildPendingSectionForContext(String resultJson) {
    if (resultJson == null || resultJson.isBlank()) return "";
    try {
      Map<String, Object> wrapper = objectMapper.readValue(resultJson, Map.class);
      Object data = wrapper.getOrDefault("data", wrapper.get("result"));
      Map<String, Object> payload = data instanceof Map ? (Map<String, Object>) data : wrapper;

      java.util.List<String> items = new java.util.ArrayList<>();
      Object unresolved = payload.get("unresolved_assumptions");
      if (unresolved instanceof java.util.List) {
        for (Object u : (java.util.List<?>) unresolved) {
          String s = String.valueOf(u).trim();
          if (!s.isEmpty()) items.add(s);
        }
      }
      Object notes = payload.get("notes");
      if (notes instanceof java.util.List) {
        java.util.regex.Pattern p = java.util.regex.Pattern.compile(
            "pending|todo|incomplete|chua|missing|thieu|con lai", java.util.regex.Pattern.CASE_INSENSITIVE);
        for (Object n : (java.util.List<?>) notes) {
          String s = String.valueOf(n).trim();
          if (!s.isEmpty() && p.matcher(s).find()) items.add(s);
        }
      }
      if (items.isEmpty()) return "";
      StringBuilder sb = new StringBuilder("## PENDING / INCOMPLETE FROM LAST RUN (MUST ADDRESS FIRST)\n");
      items.stream().limit(12).forEach(i -> sb.append("- ").append(i).append("\n"));
      return sb.toString().trim();
    } catch (Exception e) {
      return "";
    }
  }

  /**
   * Extract app_id from the prompt JSON.
   *
   * Supported prompt shapes:
   * - top-level app_id_target
   * - app_context.app_id
   * - app_id_specific_metadata.app_id (current frontend payload)
   *
   * Returns null if the prompt is not JSON or the field is absent.
   */
  @SuppressWarnings("unchecked")
  public String extractAppIdFromPrompt(String prompt) {
    if (prompt == null || prompt.isBlank() || !prompt.trim().startsWith("{")) return null;
    try {
      Map<String, Object> root = objectMapper.readValue(prompt.trim(), Map.class);

      // Try top-level app_id_target first.
      Object topLevel = root.get("app_id_target");
      if (topLevel instanceof String s && !s.isBlank()) return s.trim();

      // Try app_context.app_id.
      Object appCtx = root.get("app_context");
      if (appCtx instanceof Map) {
        Object nested = ((Map<String, Object>) appCtx).get("app_id");
        if (nested instanceof String s && !s.isBlank()) return s.trim();
      }

      // Try app_id_specific_metadata.app_id used by AiMenuDesigner payloads.
      Object appSpecificMetadata = root.get("app_id_specific_metadata");
      if (appSpecificMetadata instanceof Map) {
        Object nested = ((Map<String, Object>) appSpecificMetadata).get("app_id");
        if (nested instanceof String s && !s.isBlank()) return s.trim();
      }
    } catch (Exception ignored) {}
    return null;
  }

  /**
   * Load the master prompt (system core) from resource file, cache for reuse.
   * Path is configurable via ai.context.master-prompt-path property.
   */
  public String getMasterPrompt() {
    if (masterPrompt != null) return masterPrompt;
    synchronized (this) {
      if (masterPrompt != null) return masterPrompt;
      try {
        Resource resource = resolveResource(masterPromptPath);
        try (InputStream in = resource.getInputStream()) {
          masterPrompt = StreamUtils.copyToString(in, StandardCharsets.UTF_8);
          return masterPrompt;
        }
      } catch (IOException e) {
        throw new RuntimeException("Không đọc được master prompt từ: " + masterPromptPath, e);
      }
    }
  }

  /**
   * Helper to resolve resource from path (classpath: or file: supported)
   */
  private Resource resolveResource(String path) {
    if (path == null) throw new IllegalArgumentException("masterPromptPath is null");
    if (path.startsWith("classpath:")) {
      return new ClassPathResource(path.substring("classpath:".length()));
    } else if (path.startsWith("file:")) {
      return new FileSystemResource(path.substring("file:".length()));
    } else {
      // Default to classpath
      return new ClassPathResource(path);
    }
  }

  public interface ProgressListener {
    void onProgress(Map<String, Object> progress);
  }

  private static final Logger log = LoggerFactory.getLogger(AiAssistantGatewayService.class);

  private final RestTemplate restTemplate = new RestTemplate();
  private final ObjectMapper objectMapper = new ObjectMapper();
  private volatile WebClient webClient;
  
  private WebClient getWebClient() {
    if (webClient == null) {
      synchronized (this) {
        if (webClient == null) {
          this.webClient = WebClient.builder().build();
        }
      }
    }
    return webClient;
  }

  @Value("${ai.gateway.enabled:true}")
  private boolean enabled;

  @Value("${ai.gateway.api.url:${ai.gateway.url:https://invalid.local/disabled-chat-completions}}")
  private String apiUrl;

  @Value("${ai.gateway.auth-scheme:auto}")
  private String authScheme;

  @Value("${ai.gateway.auth-fallback-on-401:true}")
  private boolean authFallbackOnUnauthorized;

  @Value("${ai.gateway.chat-fallback-url:}")
  private String chatFallbackUrl;

  @Value("${ai.gateway.catalog-cache-ms:300000}")
  private long modelCatalogCacheMs;

  @Value("${ai.gateway.model:gemini-2.5-pro}")
  private String model;

  @Value("${ai.gateway.models:}")
  private String models;

  @Value("${ai.gateway.default-fallback-models:gemini-2.5-pro,gemini-2.5-flash,gemini-2.0-flash-001}")
  private String defaultFallbackModels;

  @Value("${ai.gateway.menu-allowed-models:gemini-2.5-pro,gemini-2.5-flash,gemini-2.0-flash-001}")
  private String menuAllowedModels;

  @Value("${ai.gateway.prioritize-mini:true}")
  private boolean prioritizeMiniModels;

  @Value("${ai.gateway.max-output-tokens:8192}")
  private int maxOutputTokens;

  @Value("${ai.gateway.max-prompt-chars:3000000}")
  private int maxPromptChars;

  @Value("${ai.gateway.direct-max-chars:20000}")
  private int directMaxChars;

  @Value("${ai.gateway.chunk-mode-threshold-chars:100000}")
  private int chunkModeThresholdChars;

  @Value("${ai.gateway.chunk-size-chars:16000}")
  private int chunkSizeChars;

  @Value("${ai.gateway.chunk-overlap-chars:500}")
  private int chunkOverlapChars;

  @Value("${ai.gateway.max-chunks:300}")
  private int maxChunks;

  @Value("${ai.gateway.chunk-summary-max-tokens:1024}")
  private int chunkSummaryMaxTokens;

  @Value("${ai.gateway.request-max-chars:32000}")
  private int requestMaxChars;

  @Value("${ai.gateway.merge-batch-size:8}")
  private int mergeBatchSize;

  @Value("${ai.gateway.task-hint-max-chars:12000}")
  private int taskHintMaxChars;

  @Value("${ai.gateway.retry.max-attempts:5}")
  private int retryMaxAttempts;

  @Value("${ai.gateway.retry.base-wait-ms:65000}")
  private long retryBaseWaitMs;

  @Value("${ai.gateway.retry.max-rate-retries-per-model:1}")
  private int retryMaxRateRetriesPerModel;

  @Value("${ai.gateway.retry.max-429-wait-ms:8000}")
  private long retryMax429WaitMs;

  @Value("${ai.gateway.model-rate-limit-cooldown-ms:600000}")
  private long modelRateLimitCooldownMs;

  @Value("${ai.gateway.model-unknown-cooldown-ms:21600000}")
  private long modelUnknownCooldownMs;

  @Value("${ai.gateway.rotate-candidates:false}")
  private boolean rotateCandidates;

  @Value("${ai.gateway.throttle.min-interval-ms:2500}")
  private long throttleMinIntervalMs;

  @Value("${ai.gateway.tpm-limit:38000}")
  private int tpmLimit;

  @Value("${ai.gateway.temperature.direct:0.2}")
  private double directTemperature;

  @Value("${ai.gateway.temperature.chunk-summary:0.1}")
  private double chunkSummaryTemperature;

  @Value("${ai.gateway.temperature.merge:0.2}")
  private double mergeTemperature;

  @Value("${ai.gateway.realtime-draft.enabled:true}")
  private boolean realtimeDraftEnabled;

  @Value("${ai.gateway.realtime-draft.every-chunks:1}")
  private int realtimeDraftEveryChunks;

  @Value("${ai.gateway.stability.menu-only-context-injection:true}")
  private boolean menuOnlyContextInjection;

  @Value("${ai.gateway.chat-stream.direct-max-chars:120000}")
  private int chatStreamDirectMaxChars;

  @Value("${ai.gateway.chat-stream.input-token-soft-limit:6800}")
  private int chatStreamInputTokenSoftLimit;

  @Value("${ai.gateway.chat-stream.emit-chunk-chars:2400}")
  private int chatStreamEmitChunkChars;

  @Value("${google.cloud.project-id:}")
  private String googleProjectId;

  @Value("${google.cloud.api-key:}")
  private String googleApiKey;

  @Value("${ai.gateway.gemini-enabled:true}")
  private boolean geminiEnabled;

  @Value("${ai.gateway.gemini.model:gemini-1.5-pro}")
  private String geminiModel;

  @Value("${ai.gateway.gemini.endpoint:https://generativelanguage.googleapis.com/v1beta/models}")
  private String geminiEndpoint;

  @Value("${ai.gateway.gemini.max-tokens:65536}")
  private int geminiMaxTokens;

  @Value("${ai.gateway.gemini.temperature:0.2}")
  private double geminiTemperature;

  @Value("${ai.gateway.response-cache-enabled:true}")
  private boolean responseCacheEnabled;

  @Value("${ai.gateway.response-cache.ttl-ms:3600000}")
  private long responseCacheTtlMs;

  @Value("${ai.gateway.response-cache.max-entries:1000}")
  private int responseCacheMaxEntries;

  @Value("${ai.gateway.smart-selection-enabled:true}")
  private boolean smartSelectionEnabled;

  @Value("${ai.gateway.smart-selection.code-task-threshold-chars:5000}")
  private int codeTaskThresholdChars;

  @Value("${ai.gateway.smart-selection.large-context-threshold-chars:50000}")
  private int largeContextThresholdChars;

  @Value("${ai.gateway.smart-selection.menu-gemini-threshold-chars:15000}")
  private int menuGeminiThresholdChars;

  @Value("${ai.gateway.menu.force-direct-provider:true}")
  private boolean menuForceGithubModels;

  @Value("${ai.gateway.model-quota-cooldown-ms:21600000}")
  private long modelQuotaCooldownMs;

  private final Semaphore requestSemaphore = new Semaphore(1, true);
  private volatile long lastRequestAtMs = 0L;
  private volatile long currentWindowStartMs = 0L;
  private volatile int currentWindowEstimatedTokens = 0;
  private final AtomicInteger modelCursor = new AtomicInteger(0);

  @Value("${ai.gateway.token:}")
  private String token;

  @Value("${ai.gateway.api-key:}")
  private String openAiApiKey;

  // Hard gate removed — system is local-only; kept for config compatibility only.
  @Value("${ai.provider.force-gemini:false}")
  private boolean forceGeminiProvider;

  private volatile Map<String, Set<String>> modelEndpointCache = Collections.emptyMap();
  private volatile Map<String, String> modelAliasToCatalogId = Collections.emptyMap();
  private volatile Set<String> modelCatalogRawIds = Collections.emptySet();
  private volatile long modelEndpointCacheFetchedAtMs = 0L;
  // ═══════════════════════════════════════════════════════════════════════════
  // Response Cache & Project Context Cache
  // ═══════════════════════════════════════════════════════════════════════════
  private static class CachedResponse {
    String response;
    long cachedAtMs;
    CachedResponse(String response) {
      this.response = response;
      this.cachedAtMs = System.currentTimeMillis();
    }
  }

  private volatile Map<String, CachedResponse> responseCache = Collections.synchronizedMap(new java.util.LinkedHashMap<String, CachedResponse>(16, 0.75f, true) {
    @Override
    protected boolean removeEldestEntry(Map.Entry<String, CachedResponse> eldest) {
      return size() > Math.max(10, responseCacheMaxEntries);
    }
  });
  private volatile Map<String, Long> modelUnavailableUntilMs = Collections.synchronizedMap(new HashMap<>());
  private volatile Map<String, String> modelUnavailableReason = Collections.synchronizedMap(new HashMap<>());
  // Account-level OpenAI key rate-limit: when set, ALL models on this key are unavailable.
  // Unlike per-model cooldown (10min), this uses the actual Retry-After from OpenAI (e.g. 65s).
  private volatile long openAiAccountRateLimitUntilMs = 0L;
  // Token-aware context budget manager (JTokkit). Optional — null-safe throughout.
  @org.springframework.beans.factory.annotation.Autowired(required = false)
  private ContextBudgetManager contextBudgetManager;

  @org.springframework.beans.factory.annotation.Autowired(required = false)
  private LlamaCppNativeService llamaCppNativeService;

  @Value("${ai.local.only.enabled:true}")
  private boolean localOnlyEnabled;

  @Value("${ai.local.llama.max-prompt-chars:240000}")
  private int localLlamaMaxPromptChars;

  @Value("${ai.local.llama.max-tokens:1024}")
  private int localLlamaMaxTokens;

  private String getApiToken() {
    String openAiEnvToken = System.getenv("OPENAI_API_KEY");
    if (openAiEnvToken != null && !openAiEnvToken.trim().isEmpty()) {
      return openAiEnvToken.trim();
    }
    String openAiConfigured = openAiApiKey == null ? "" : openAiApiKey.trim();
    if (!openAiConfigured.isEmpty()) {
      return openAiConfigured;
    }

    String envToken = System.getenv("GITHUB_TOKEN");
    if (envToken != null && !envToken.trim().isEmpty()) {
      return envToken.trim();
    }
    String configured = token == null ? "" : token.trim();
    if (!configured.isEmpty()) {
      return configured;
    }
    return "";
  }

  private String getEffectiveToken(String endpoint) {
    // Use PAT directly for every endpoint.
    return getApiToken();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE 1: Response Caching
  // ═══════════════════════════════════════════════════════════════════════════
  private String getPromptHash(String prompt) {
    if (prompt == null || prompt.isBlank()) return "";
    try {
      java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
      byte[] messageDigest = md.digest(prompt.getBytes(StandardCharsets.UTF_8));
      StringBuilder sb = new StringBuilder();
      for (byte b : messageDigest) {
        sb.append(String.format("%02x", b));
      }
      return sb.toString();
    } catch (Exception ex) {
      log.debug("Could not compute prompt hash: {}", ex.getMessage());
      return "";
    }
  }

  private String getCachedResponse(String prompt) {
    if (!responseCacheEnabled || prompt == null) return null;
    String hash = getPromptHash(prompt);
    if (hash.isEmpty()) return null;
    CachedResponse cached = responseCache.get(hash);
    if (cached == null) return null;
    long now = System.currentTimeMillis();
    if (now - cached.cachedAtMs > responseCacheTtlMs) {
      responseCache.remove(hash);
      return null;
    }
    log.debug("Cache HIT for prompt hash={} (age={}ms)", hash, now - cached.cachedAtMs);
    return cached.response;
  }

  private void cacheResponse(String prompt, String response) {
    if (!responseCacheEnabled || prompt == null || response == null) return;
    String hash = getPromptHash(prompt);
    if (hash.isEmpty()) return;
    responseCache.put(hash, new CachedResponse(response));
    log.debug("Cached response for prompt hash={} (cache size={})", hash, responseCache.size());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE 3: Smart Model Selection
  // ═══════════════════════════════════════════════════════════════════════════
  private String selectOptimalModel(String taskType, int promptSize, boolean isCodeTask) {
    return "local_provider";
  }

  private boolean shouldFastFallbackMenuToGemini(String selectedModel, int promptChars, boolean isMenuTask) {
    return false;
  }

  private boolean looksLikeCodeTask(String text) {
    String normalized = String.valueOf(text == null ? "" : text).toLowerCase(Locale.ROOT);
    return normalized.contains("java")
        || normalized.contains("code")
        || normalized.contains("class ")
        || normalized.contains("method")
        || normalized.contains("service")
        || normalized.contains("controller")
        || normalized.contains("repository")
        || normalized.contains("entity")
        || normalized.contains("bug")
        || normalized.contains("refactor")
        || normalized.contains("stacktrace")
        || normalized.contains("exception");
  }

  private boolean looksLikeMenuTask(String text) {
    String normalized = String.valueOf(text == null ? "" : text).toLowerCase(Locale.ROOT);
    return normalized.contains("menu_json")
        || normalized.contains("menu_design")
        || normalized.contains("\"menu\"")
        || normalized.contains("flowtype")
        || normalized.contains("responsemode")
        || normalized.contains("trigger")
        || normalized.contains("table_name")
        || normalized.contains("current_menu_full_json");
  }

  private String detectTaskTypeHint(String prompt) {
    String normalized = String.valueOf(prompt == null ? "" : prompt).toLowerCase(Locale.ROOT);
    if (normalized.contains("orchestration_routing_tier=planner_fast")) {
      return "planning_fast";
    }
    if (normalized.contains("orchestration_routing_tier=solver_complex")) {
      return "solver_complex";
    }
    if (normalized.contains("orchestration_routing_tier=solver_balanced")) {
      return "solver_balanced";
    }
    if (looksLikeMenuTask(prompt)) {
      return "menu_design";
    }
    return looksLikeCodeTask(prompt) ? "code_generation" : "general";
  }

  private String detectContextTypeHint(String prompt) {
    String normalized = String.valueOf(prompt == null ? "" : prompt).toLowerCase(Locale.ROOT);
    if (normalized.contains("context_type=menu_json")
        || normalized.contains("\"context_type\":\"menu_json\"")
        || normalized.contains("\"context_type\": \"menu_json\"")) {
      return "menu_json";
    }
    if (normalized.contains("context_type=code")
        || normalized.contains("\"context_type\":\"code\"")
        || normalized.contains("\"context_type\": \"code\"")) {
      return "code";
    }
    return "";
  }

  /**
   * Apply slot-based token budget fitting to the assembled finalPrompt.
   *
   * <p>Called when the prompt already exceeds {@code directMaxChars} but we want to
   * avoid entering chunk-mode by intelligently trimming low-priority context layers:
   * <ol>
  *   <li>Session context / app context block (TAIL_TRIM, lowest priority)</li>
   *   <li>BACKEND SESSION CONTEXT / app context block (TAIL_TRIM)</li>
   *   <li>System core and scenario guardrail (KEEP)</li>
   *   <li>User payload (KEEP, highest priority)</li>
   * </ol>
   * Returns the original finalPrompt unchanged if fitting does not reduce length.
   */
  private String applyContextBudgetFitting(
      String finalPrompt,
      String systemCore,
      String appContextBlock,
      String scenarioContextText,
      String userPayload,
      String taskTypeHint) {

    int maxInputTokens = contextBudgetManager.computeInputBudget(model, maxOutputTokens);
    List<ContextBudgetManager.ContextSlot> slots = new ArrayList<>();

    if (!systemCore.isBlank()) {
      slots.add(new ContextBudgetManager.ContextSlot(
          "system_core", systemCore.trim(), 9, ContextBudgetManager.TrimStrategy.KEEP));
    }
    if (!appContextBlock.isBlank()) {
      slots.add(new ContextBudgetManager.ContextSlot(
          "app_context", appContextBlock, 5, ContextBudgetManager.TrimStrategy.TAIL_TRIM));
    }
    if (!scenarioContextText.isBlank()) {
      slots.add(new ContextBudgetManager.ContextSlot(
          "scenario_guardrail", scenarioContextText, 8, ContextBudgetManager.TrimStrategy.KEEP));
    }
    slots.add(new ContextBudgetManager.ContextSlot(
        "user_payload", userPayload, 9, ContextBudgetManager.TrimStrategy.KEEP));

    String fitted = contextBudgetManager.fitToTokenBudget(slots, maxInputTokens, model);
    if (!fitted.isBlank() && fitted.length() < finalPrompt.length()) {
      log.info("applyContextBudgetFitting: reduced prompt {} -> {} chars (budget={} tokens)",
          finalPrompt.length(), fitted.length(), maxInputTokens);
      return fitted;
    }
    return finalPrompt;
  }

  private String buildModelCooldownKey(String modelName, String tokenScope) {
    String normalizedModel = String.valueOf(modelName == null ? "" : modelName).trim().toLowerCase(Locale.ROOT);
    if (normalizedModel.isBlank()) {
      return "";
    }
    String scope = String.valueOf(tokenScope == null ? "" : tokenScope).trim();
    if (scope.isBlank()) {
      return normalizedModel + "|scope:default";
    }
    String scopeHash = Integer.toHexString(scope.hashCode());
    return normalizedModel + "|scope:" + scopeHash;
  }

  private boolean isModelTemporarilyUnavailable(String modelName, String tokenScope) {
    String cooldownKey = buildModelCooldownKey(modelName, tokenScope);
    if (cooldownKey.isBlank()) {
      return false;
    }
    Long untilMs = modelUnavailableUntilMs.get(cooldownKey);
    if (untilMs == null) {
      return false;
    }
    long now = System.currentTimeMillis();
    if (now >= untilMs) {
      modelUnavailableUntilMs.remove(cooldownKey);
      modelUnavailableReason.remove(cooldownKey);
      return false;
    }
    return true;
  }

  private long getModelUnavailableRemainingMs(String modelName, String tokenScope) {
    String cooldownKey = buildModelCooldownKey(modelName, tokenScope);
    if (cooldownKey.isBlank()) {
      return 0L;
    }
    Long untilMs = modelUnavailableUntilMs.get(cooldownKey);
    if (untilMs == null) {
      return 0L;
    }
    return Math.max(0L, untilMs - System.currentTimeMillis());
  }

  private String getModelUnavailableReason(String modelName, String tokenScope) {
    String cooldownKey = buildModelCooldownKey(modelName, tokenScope);
    if (cooldownKey.isBlank()) {
      return "temporary cooldown";
    }
    String reason = modelUnavailableReason.get(cooldownKey);
    return (reason == null || reason.isBlank()) ? "temporary cooldown" : reason;
  }

  private void markModelTemporarilyUnavailable(String modelName, String tokenScope, long cooldownMs, String reason) {
    String cooldownKey = buildModelCooldownKey(modelName, tokenScope);
    if (cooldownKey.isBlank()) {
      return;
    }
    long effectiveCooldownMs = Math.max(60000L, cooldownMs);
    long untilMs = System.currentTimeMillis() + effectiveCooldownMs;
    modelUnavailableUntilMs.put(cooldownKey, untilMs);
    modelUnavailableReason.put(cooldownKey, String.valueOf(reason == null ? "temporary cooldown" : reason));
    log.warn("Temporarily disabling model '{}' for {} ms due to {} (scope={})",
        modelName,
        effectiveCooldownMs,
        reason,
        cooldownKey.substring(Math.max(0, cooldownKey.indexOf("|scope:"))));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Local llama.cpp provider (replaces Gemini/OpenAI when local-only enabled)
  // ═══════════════════════════════════════════════════════════════════════════
  private String callLocalProviderWithContext(String prompt, int maxTokens, double temperature, ProgressListener progressListener) {
    if (llamaCppNativeService == null || !llamaCppNativeService.isAvailable()) {
      return createErrorJson("Local AI provider chưa sẵn sàng (llama.cpp)", "LOCAL_PROVIDER_UNAVAILABLE");
    }
    String safePrompt = prompt == null ? "" : prompt.trim();
    if (safePrompt.isBlank()) {
      return createErrorJson("Prompt rỗng", "INVALID_PROMPT");
    }
    int maxPrompt = Math.max(8000, localLlamaMaxPromptChars);
    String fittedPrompt = safePrompt.length() > maxPrompt
        ? safePrompt.substring(0, maxPrompt)
        : safePrompt;
    if (safePrompt.length() > maxPrompt) {
      log.warn("Local provider prompt clamped {} -> {} chars", safePrompt.length(), maxPrompt);
    }
    emitProgress(progressListener, progressPayload(
        "local_inference",
        "Đang gọi Local AI (llama.cpp)...",
        0,
        1,
        progressI18n("copilot.progress.message.local_inference", null, null, null)));
    try {
      int outTokens = Math.max(128, Math.min(Math.max(256, maxTokens), localLlamaMaxTokens));
      String raw = llamaCppNativeService.generateContentFast(fittedPrompt, outTokens);
      String text = extractResultTextFromWrappedJson(raw);
      if (text == null || text.isBlank()) {
        text = raw == null ? "" : raw.trim();
      }
      emitProgress(progressListener, progressPayload(
          "complete",
          "Local AI hoàn tất",
          1,
          1,
          mergeProgress(
              progressI18n("copilot.progress.message.local_inference_complete", null, null, null),
              Map.of("provider", "local_provider", "outputChars", text.length()))));
      cacheResponse(prompt, wrapTextAsChatCompletionsJson(text));
      return wrapTextAsChatCompletionsJson(text);
    } catch (Exception ex) {
      log.error("Local provider inference failed: {}", ex.getMessage());
      return createErrorJson("Local AI lỗi: " + ex.getMessage(), "LOCAL_PROVIDER_ERROR");
    }
  }

  /** Local inference — legacy name kept for internal call sites. */
  private String callGeminiWithContext(String prompt, int maxTokens, double temperature, ProgressListener progressListener) {
    return callLocalProviderWithContext(prompt, maxTokens, temperature, progressListener);
  }

  private String normalizeChatCompletionsEndpoint(String configuredUrl) {
    String configured = configuredUrl == null ? "" : configuredUrl.trim();
    if (configured.isEmpty()) {
      return "https://invalid.local/disabled-chat-completions";
    }
    String lower = configured.toLowerCase(Locale.ROOT);
    if (lower.endsWith("/chat/completions")) {
      return configured;
    }
    if (lower.endsWith("/openai/v1")) {
      return configured + "/chat/completions";
    }
    if (lower.endsWith("/inference")) {
      return configured + "/chat/completions";
    }
    if (lower.contains("/api/projects/") && !lower.endsWith("/chat/completions")) {
      return configured + "/chat/completions";
    }
    return configured;
  }

  private String resolveChatCompletionsEndpoint() {
    return normalizeChatCompletionsEndpoint(apiUrl);
  }

  private String resolveResponsesEndpoint() {
    String chatEndpoint = resolveChatCompletionsEndpoint();
    if (chatEndpoint.toLowerCase(Locale.ROOT).endsWith("/chat/completions")) {
      return chatEndpoint.substring(0, chatEndpoint.length() - "/chat/completions".length()) + "/responses";
    }
    if (chatEndpoint.toLowerCase(Locale.ROOT).endsWith("/inference")) {
      return chatEndpoint + "/responses";
    }
    return chatEndpoint;
  }

  private String resolveModelsEndpoint() {
    String chatEndpoint = resolveChatCompletionsEndpoint();
    if (chatEndpoint.toLowerCase(Locale.ROOT).endsWith("/chat/completions")) {
      return chatEndpoint.substring(0, chatEndpoint.length() - "/chat/completions".length()) + "/models";
    }
    if (chatEndpoint.toLowerCase(Locale.ROOT).endsWith("/inference")) {
      return chatEndpoint + "/models";
    }
    return chatEndpoint;
  }

  private String buildAuthorizationHeaderValue(String endpoint, String effectiveToken) {
    String tokenValue = effectiveToken == null ? "" : effectiveToken.trim();
    if (tokenValue.isEmpty()) {
      return "";
    }

    String scheme = authScheme == null ? "auto" : authScheme.trim().toLowerCase(Locale.ROOT);
    if (scheme.isEmpty()) {
      scheme = "auto";
    }

    if ("github-bearer".equals(scheme) || "github_bearer".equals(scheme)) {
      return "GitHub-Bearer " + tokenValue;
    }
    if ("bearer".equals(scheme)) {
      return "Bearer " + tokenValue;
    }
    if ("api-key".equals(scheme) || "apikey".equals(scheme) || "x-api-key".equals(scheme)) {
      return "";
    }

    // In auto mode, always use standard Bearer PAT.
    return "Bearer " + tokenValue;
  }

  private void applyAuthHeaders(HttpHeaders headers, String endpoint, String effectiveToken) {
    if (headers == null) {
      return;
    }
    String scheme = authScheme == null ? "auto" : authScheme.trim().toLowerCase(Locale.ROOT);
    if (scheme.isBlank()) {
      scheme = "auto";
    }

    String tokenValue = String.valueOf(effectiveToken == null ? "" : effectiveToken).trim();

    if ("api-key".equals(scheme) || "apikey".equals(scheme) || "x-api-key".equals(scheme)) {
      return;
    }

    if ("github-bearer".equals(scheme) || "github_bearer".equals(scheme)) {
      if (!tokenValue.isBlank()) {
        headers.set("Authorization", "GitHub-Bearer " + tokenValue);
      }
      return;
    }

    if ("bearer".equals(scheme)) {
      if (!tokenValue.isBlank()) {
        headers.set("Authorization", "Bearer " + tokenValue);
      }
      return;
    }

    // auto mode
    String authHeader = buildAuthorizationHeaderValue(endpoint, tokenValue);
    if (!authHeader.isBlank()) {
      headers.set("Authorization", authHeader);
    }
  }

  private boolean isResponsesPreferredModel(String modelName) {
    String normalized = String.valueOf(modelName == null ? "" : modelName).toLowerCase(Locale.ROOT);
    return normalized.contains("codex") || normalized.contains("gpt-5.4-mini");
  }

  private void refreshModelEndpointCacheIfNeeded(String effectiveToken) {
    long now = System.currentTimeMillis();
    long ttl = Math.max(30000L, modelCatalogCacheMs);
    if (now - modelEndpointCacheFetchedAtMs < ttl && modelEndpointCache != null && !modelEndpointCache.isEmpty()) {
      return;
    }

    synchronized (this) {
      now = System.currentTimeMillis();
      if (now - modelEndpointCacheFetchedAtMs < ttl && modelEndpointCache != null && !modelEndpointCache.isEmpty()) {
        return;
      }

      try {
        String endpoint = resolveModelsEndpoint();
        HttpHeaders headers = new HttpHeaders();
        applyAuthHeaders(headers, endpoint, effectiveToken);
        ResponseEntity<String> response = restTemplate.exchange(endpoint, HttpMethod.GET, new HttpEntity<>(headers), String.class);

        if (response.getBody() == null || response.getBody().isBlank()) {
          return;
        }

        Object parsed = objectMapper.readValue(response.getBody(), Object.class);
        List<?> dataList = null;
        if (parsed instanceof Map<?, ?> rootMap) {
          Object dataObj = rootMap.get("data");
          if (dataObj instanceof List<?> list) {
            dataList = list;
          }
        } else if (parsed instanceof List<?> list) {
          dataList = list;
        }
        if (dataList == null) {
          log.debug("Model catalog endpoint '{}' returned unsupported schema", endpoint);
          return;
        }

        Map<String, Set<String>> next = new HashMap<>();
        Map<String, String> aliases = new HashMap<>();
        Set<String> rawIds = new LinkedHashSet<>();
        for (Object itemObj : dataList) {
          if (!(itemObj instanceof Map<?, ?> item)) {
            continue;
          }
          Object idObj = item.get("id");
          if (idObj == null) {
            continue;
          }
          String id = String.valueOf(idObj).trim();
          if (id.isEmpty()) {
            continue;
          }

          Set<String> endpoints = new LinkedHashSet<>();
          Object supportedObj = item.get("supported_endpoints");
          if (supportedObj instanceof List<?> supportedList) {
            for (Object endpointObj : supportedList) {
              if (endpointObj == null) continue;
              String path = String.valueOf(endpointObj).trim().toLowerCase(Locale.ROOT);
              if (!path.isEmpty()) {
                endpoints.add(path);
              }
            }
          }
          String idLower = id.toLowerCase(Locale.ROOT);
          rawIds.add(idLower);
          String callableId = deriveCallableModelId(idLower);
          indexCatalogAlias(next, aliases, idLower, callableId, endpoints);

          // Base alias: strip date suffix so short names match versioned entries.
          String baseName = stripVersionSuffix(idLower);
          if (!baseName.equals(idLower)) {
            indexCatalogAlias(next, aliases, baseName, callableId, endpoints);
          }

          // Provider-qualified ids (e.g. openai/gpt-4.1) should match by short segment.
          int slash = idLower.lastIndexOf('/');
          if (slash >= 0 && slash < idLower.length() - 1) {
            String shortName = idLower.substring(slash + 1);
            indexCatalogAlias(next, aliases, shortName, callableId, endpoints);
            String shortBase = stripVersionSuffix(shortName);
            if (!shortBase.equals(shortName)) {
              indexCatalogAlias(next, aliases, shortBase, callableId, endpoints);
            }
          }

          if (!callableId.equals(idLower)) {
            indexCatalogAlias(next, aliases, callableId, callableId, endpoints);
            String callableBase = stripVersionSuffix(callableId);
            if (!callableBase.equals(callableId)) {
              indexCatalogAlias(next, aliases, callableBase, callableId, endpoints);
            }
          }
        }

        if (!next.isEmpty()) {
          modelEndpointCache = next;
          modelAliasToCatalogId = aliases;
          modelCatalogRawIds = rawIds;
          modelEndpointCacheFetchedAtMs = System.currentTimeMillis();
          log.info("Loaded AI Assistant model catalog: {} models", next.size());
          logCatalogResolution(next, aliases);
        }
      } catch (Exception ex) {
        log.debug("Could not refresh AI Assistant model catalog: {}", ex.getMessage());
      }
    }
  }

  private void logCatalogResolution(Map<String, Set<String>> endpointCache, Map<String, String> aliasMap) {
    if (endpointCache == null || endpointCache.isEmpty()) {
      return;
    }

    Set<String> requestedAliases = new LinkedHashSet<>();
    String primary = normalizeConfiguredModel(model);
    if (!primary.isBlank()) {
      requestedAliases.add(primary);
    }
    addModelsFromCsv(requestedAliases, models);
    addModelsFromCsv(requestedAliases, defaultFallbackModels);

    List<String> mapped = new ArrayList<>();
    List<String> missing = new ArrayList<>();
    for (String alias : requestedAliases) {
      String resolved = resolveCatalogModelId(alias, endpointCache, aliasMap);
      if (resolved == null || resolved.isBlank()) {
        missing.add(alias);
      } else {
        Set<String> endpoints = endpointCache.getOrDefault(resolved.toLowerCase(Locale.ROOT), Collections.emptySet());
        mapped.add(alias + " -> " + resolved + " endpoints=" + endpoints);
      }
    }

    if (!mapped.isEmpty()) {
      log.info("AI Assistant API catalog mapping: {}", String.join("; ", mapped));
    }
    if (!missing.isEmpty()) {
      log.warn("AI Assistant API catalog missing configured aliases: {}", String.join(", ", missing));
    }

    Set<String> raw = modelCatalogRawIds == null ? Collections.emptySet() : modelCatalogRawIds;
    if (!raw.isEmpty()) {
      log.info("AI Assistant API catalog raw IDs: {}", String.join(", ", raw));
    }

    List<String> chatCapable = collectCatalogModelsForChat(endpointCache);
    if (!chatCapable.isEmpty()) {
      log.info("AI Assistant API chat-capable catalog IDs: {}", String.join(", ", chatCapable));
    }
  }

  private Set<String> getSupportedEndpointsForModel(String modelName, String effectiveToken) {
    refreshModelEndpointCacheIfNeeded(effectiveToken);
    if (modelName == null || modelName.isBlank()) {
      return Collections.emptySet();
    }
    Map<String, Set<String>> cache = modelEndpointCache == null ? Collections.emptyMap() : modelEndpointCache;
    String aliasKey = resolveCatalogAliasKey(modelName, cache);
    Set<String> supported = aliasKey == null ? null : cache.get(aliasKey);
    return supported == null ? Collections.emptySet() : supported;
  }

  private List<String> resolveEndpointOrderForModel(String modelName, String effectiveToken) {
    Set<String> supported = getSupportedEndpointsForModel(modelName, effectiveToken);
    List<String> order = new ArrayList<>();

    if (!supported.isEmpty()) {
      if (supported.contains("/chat/completions")) order.add("/chat/completions");
      if (supported.contains("/responses")) order.add("/responses");
      if (order.isEmpty()) {
        order.add(isResponsesPreferredModel(modelName) ? "/responses" : "/chat/completions");
      }
      return order;
    }

    order.add(isResponsesPreferredModel(modelName) ? "/responses" : "/chat/completions");
    if (!order.contains("/chat/completions")) order.add("/chat/completions");
    if (!order.contains("/responses")) order.add("/responses");
    return order;
  }

  private String resolveEndpointByPath(String endpointPath) {
    if ("/responses".equals(endpointPath)) {
      return resolveResponsesEndpoint();
    }
    return resolveChatCompletionsEndpoint();
  }

  private HttpEntity<Map<String, Object>> buildRequestEntity(
      String endpointPath,
      String candidateModel,
      String prompt,
      int maxTokens,
      double temperature,
      String effectiveToken) {
    Map<String, Object> body = new HashMap<>();
    String resolvedEndpoint = resolveEndpointByPath(endpointPath);
    body.put("model", candidateModel);

    if ("/responses".equals(endpointPath)) {
      body.put("input", prompt);
      body.put("max_output_tokens", maxTokens);
      body.put("temperature", temperature);
      body.put("top_p", 0.95);
    } else {
      body.put("messages", List.of(Map.of("role", "user", "content", prompt)));
      body.put("temperature", temperature);
      body.put("top_p", 0.95);
      body.put("max_tokens", maxTokens);
    }

    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    applyAuthHeaders(headers, resolvedEndpoint, effectiveToken);
    return new HttpEntity<>(body, headers);
  }

  private boolean isUnsupportedApiForModelError(HttpClientErrorException ex) {
    String body = ex == null ? "" : String.valueOf(ex.getResponseBodyAsString());
    String normalized = body.toLowerCase(Locale.ROOT);
    return normalized.contains("unsupported_api_for_model")
        || normalized.contains("not accessible via the /chat/completions endpoint")
        || normalized.contains("not accessible via the /responses endpoint");
  }


  /**
   * Prepend system core (master prompt) to every prompt sent to AI.
   * The prompt argument should be the dynamic context (app_id, metadata, task, etc).
   */
  public String generateContent(String prompt) {
    return generateContent(prompt, null);
  }

  public String generateContent(String prompt, ProgressListener progressListener) {
    if (!enabled) {
      return createErrorJson("AI Assistant API fallback đang tắt", "GITHUB_MODELS_DISABLED");
    }
    if (prompt == null || prompt.trim().isEmpty()) {
      return createErrorJson("Prompt không được để trống", "INVALID_PROMPT");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEATURE 1: Check response cache FIRST
    // ═══════════════════════════════════════════════════════════════════════════
    String cachedResp = getCachedResponse(prompt);
    if (cachedResp != null) {
      emitProgress(progressListener, progressPayload("cache_hit", "Cached response (tái sử dụng kết quả)", 1, 1,
          progressI18n("copilot.progress.message.cache_hit", null, null, null)));
      return cachedResp;
    }

    if (localOnlyEnabled && (llamaCppNativeService == null || !llamaCppNativeService.isAvailable())) {
      return createErrorJson("Local AI provider chưa sẵn sàng (local-only mode)", "LOCAL_PROVIDER_UNAVAILABLE");
    }

    String trimmedPrompt = prompt.trim();
    String taskTypeHint = detectTaskTypeHint(trimmedPrompt);
    boolean isMenuTask = looksLikeMenuTask(trimmedPrompt);
    boolean isCodeTask = looksLikeCodeTask(trimmedPrompt) && !isMenuTask;
    String contextTypeHint = detectContextTypeHint(trimmedPrompt);

    // Inject scenario-specific instructions between master prompt and dynamic context
    AiMenuOperationScenario scenario = extractOperationScenario(prompt);
    boolean isMenuScenario = scenario != AiMenuOperationScenario.UNKNOWN;
    boolean isExplicitMenuContext = "menu_json".equals(contextTypeHint);
    boolean isExplicitCodeContext = "code".equals(contextTypeHint);
    boolean shouldInjectMenuContext = isExplicitMenuContext || !menuOnlyContextInjection || isMenuScenario;
    boolean shouldInjectCodeContext = codeContextInjection
        && !shouldInjectMenuContext
        && (isExplicitCodeContext || (contextTypeHint.isBlank() && isCodeTask));
    boolean shouldInjectSystemContext = shouldInjectMenuContext || shouldInjectCodeContext;
    String selectedPromptProfile = shouldInjectMenuContext
      ? "menu_master_prompt"
      : (shouldInjectCodeContext ? "code_master_prompt" : "no_master_prompt");

    String systemCore = "";
    String scenarioContext = null;
    if (shouldInjectMenuContext) {
      systemCore = getMasterPrompt();
      if (systemCore == null || systemCore.trim().isEmpty()) {
        return createErrorJson("Không load được System Core (master prompt)", "MASTER_PROMPT_MISSING");
      }
      scenarioContext = buildScenarioContext(prompt);
    } else if (shouldInjectCodeContext) {
      systemCore = getCodeMasterPrompt();
      if (systemCore == null || systemCore.trim().isEmpty()) {
        return createErrorJson("Không load được Code System Core (master prompt)", "CODE_MASTER_PROMPT_MISSING");
      }
    }

    // Load per-app session context file (if prompt doesn't already embed session_memory)
    // This mirrors how AI Assistant injects its /memories/session context into each request.
    String appContextBlock = "";
    boolean promptAlreadyHasSessionMemory = prompt.contains("session_memory")
        || prompt.contains("APP CONTINUITY MEMORY");
    if (shouldInjectSystemContext && !promptAlreadyHasSessionMemory) {
      String promptAppId = extractAppIdFromPrompt(prompt);
      if (promptAppId != null) {
        String ctxFile = loadAppContextFile(promptAppId);
        if (!ctxFile.isBlank()) {
          appContextBlock = "\n\n## BACKEND SESSION CONTEXT (app_id=" + promptAppId + ")\n"
              + "The following is the persisted session context from previous AI runs for this app.\n"
              + "Use it to maintain continuity — do not re-do work already done unless asked.\n\n"
              + ctxFile.trim();
        }
      }
    }

    // Compose final prompt: [System_Core]\n\n[App_Context?]\n\n[Scenario_Context?]\n\n[Dynamic_Context]
    String finalPrompt;
    String scenarioContextText = scenarioContext == null ? "" : scenarioContext.trim();
    if (!shouldInjectSystemContext) {
      finalPrompt = trimmedPrompt;
    } else if (appContextBlock.isBlank() && scenarioContextText.isBlank()) {
      finalPrompt = systemCore.trim() + "\n\n" + trimmedPrompt;
    } else if (appContextBlock.isBlank()) {
      finalPrompt = systemCore.trim() + "\n\n" + scenarioContextText + "\n\n" + trimmedPrompt;
    } else if (scenarioContextText.isBlank()) {
      finalPrompt = systemCore.trim() + appContextBlock + "\n\n" + trimmedPrompt;
    } else {
      finalPrompt = systemCore.trim() + appContextBlock + "\n\n" + scenarioContextText + "\n\n" + trimmedPrompt;
    }

    boolean injectedProjectContext = false;

    // Token-aware budget fitting: if the assembled prompt exceeds direct-mode threshold,
    // try to compress supplementary layers (session context, project skeleton) before
    // falling through to chunk-mode or returning an error.
    if (contextBudgetManager != null && contextBudgetManager.isEnabled()
        && finalPrompt.length() > directMaxChars
        && shouldInjectMenuContext) {
      finalPrompt = applyContextBudgetFitting(
          finalPrompt, systemCore, appContextBlock, scenarioContextText, trimmedPrompt, taskTypeHint);
    }

    if (finalPrompt.length() > maxPromptChars) {
      return createErrorJson(
          "Prompt quá dài cho AI Assistant fallback (tối đa " + maxPromptChars + " ký tự), hiện tại: " + finalPrompt.length(),
          "GITHUB_PROMPT_TOO_LARGE");
    }

    String selectedModel = selectOptimalModel(taskTypeHint, finalPrompt.length(), isCodeTask);
    if (!localOnlyEnabled && shouldFastFallbackMenuToGemini(selectedModel, finalPrompt.length(), isMenuTask)) {
      String fastFallback = callLocalProviderWithContext(finalPrompt, maxOutputTokens, directTemperature, progressListener);
      return applyCodeRuntimeGuardIfNeeded(fastFallback, shouldInjectCodeContext, contextTypeHint, selectedPromptProfile);
    }
    log.info(
      "AI local routing: taskTypeHint={}, isCodeTask={}, isMenuTask={}, contextTypeHint={}, promptProfile={}, promptChars={}, selectedModel={}",
        taskTypeHint,
        isCodeTask,
        isMenuTask,
        contextTypeHint,
        selectedPromptProfile,
        finalPrompt.length(),
        selectedModel);

    emitProgress(progressListener, progressPayload(
      "preparing",
      "Đang chọn model phù hợp",
      0,
      1,
      mergeProgress(
        progressI18n("copilot.progress.message.preparing_request", null, null, null),
        Map.of("selectedModel", selectedModel, "taskTypeHint", taskTypeHint, "isCodeTask", isCodeTask))));

    emitProgress(progressListener, progressPayload(
      "preparing",
      "Đang chuẩn bị yêu cầu AI",
      0,
      1,
      withOrchestrationMeta("preparing", 0, 1, mergeProgress(
        progressI18n(
          "copilot.progress.message.preparing_request",
          null,
          "copilot.progress.detail.deciding_mode",
          Map.of("inputChars", finalPrompt.length())),
        Map.of(
          "detail", "Dang kiem tra kich thuoc ngu canh va quyet dinh direct/chunk mode",
          "inputChars", finalPrompt.length())))));

    int chunkThresholdChars = Math.max(10000, chunkModeThresholdChars);
    String rawResponse;
    if (finalPrompt.length() > directMaxChars || finalPrompt.length() > chunkThresholdChars) {
      rawResponse = generateLargePromptContent(finalPrompt, progressListener, scenario);
    } else {
      rawResponse = generateDirectContent(finalPrompt, progressListener);
    }
    return applyCodeRuntimeGuardIfNeeded(rawResponse, shouldInjectCodeContext, contextTypeHint, selectedPromptProfile);
  }

  private String applyCodeRuntimeGuardIfNeeded(
      String wrappedResponse,
      boolean shouldInjectCodeContext,
      String contextTypeHint,
      String promptProfile) {
    if (!codeRuntimeGuardEnabled || !shouldInjectCodeContext) {
      return wrappedResponse;
    }
    if (wrappedResponse == null || wrappedResponse.isBlank()) {
      return wrappedResponse;
    }

    String resultText = extractResultTextFromWrappedJson(wrappedResponse);
    if (resultText == null || resultText.isBlank()) {
      return wrappedResponse;
    }

    List<String> violations = detectCodeRuntimeViolations(resultText);
    if (violations.isEmpty()) {
      log.info("Code runtime guard passed: contextTypeHint={}, promptProfile={}, violations=0", contextTypeHint, promptProfile);
      return wrappedResponse;
    }

    log.warn("Code runtime guard blocked response: contextTypeHint={}, promptProfile={}, violations={}",
        contextTypeHint, promptProfile, violations);
    String detail = String.join("; ", violations);
    return createErrorJson("Code output không tương thích runtime browser: " + detail, "CODE_RUNTIME_GUARD_FAILED");
  }

  private List<String> detectCodeRuntimeViolations(String resultText) {
    List<String> violations = new ArrayList<>();
    Object parsed = tryParseJson(resultText);

    if (parsed instanceof Map<?, ?> map) {
      Object codeObj = map.get("code");
      if (codeObj instanceof String codeText) {
        collectRuntimePatternViolations(codeText, "code", violations);
      }
      Object textEditsObj = map.get("textEdits");
      if (textEditsObj instanceof List<?> edits) {
        for (int i = 0; i < edits.size(); i++) {
          Object editObj = edits.get(i);
          if (!(editObj instanceof Map<?, ?> editMap)) {
            continue;
          }
          Object replacementObj = editMap.get("replacement");
          if (replacementObj instanceof String replacement) {
            collectRuntimePatternViolations(replacement, "textEdits[" + i + "].replacement", violations);
          }
        }
      }
    }

    if (violations.isEmpty()) {
      collectRuntimePatternViolations(resultText, "result", violations);
    }
    return violations;
  }

  private void collectRuntimePatternViolations(String codeText, String fieldPath, List<String> violations) {
    if (codeText == null || codeText.isBlank()) {
      return;
    }
    String text = codeText;
    if (Pattern.compile("(?m)^\\s*import\\s+.+$", Pattern.CASE_INSENSITIVE).matcher(text).find()) {
      violations.add(fieldPath + ": uses import syntax");
    }
    if (Pattern.compile("(?m)^\\s*export\\s+", Pattern.CASE_INSENSITIVE).matcher(text).find()) {
      violations.add(fieldPath + ": uses export syntax");
    }
    if (Pattern.compile("\\brequire\\s*\\(", Pattern.CASE_INSENSITIVE).matcher(text).find()) {
      violations.add(fieldPath + ": uses require()");
    }
    if (Pattern.compile("\\bmodule\\.exports\\b", Pattern.CASE_INSENSITIVE).matcher(text).find()) {
      violations.add(fieldPath + ": uses module.exports");
    }
  }

  /**
   * Stream chat messages for CodeMirror real-time interaction.
   * Chunks are emitted via ProgressListener for Socket.IO broadcasting.
   */
  public String chatWithStreaming(String prompt, ProgressListener progressListener) {
    List<Map<String, Object>> messages = List.of(
        Map.of("role", "system", "content", "Bạn là một trợ lý lập trình giỏi. Trả lời ngắn gọn và hữu ích."),
        Map.of("role", "user", "content", prompt == null ? "" : prompt.trim()));
    return chatWithStreamingMessages(messages, progressListener);
  }

  public String chatWithStreamingMessages(List<Map<String, Object>> messages, ProgressListener progressListener) {
    if (!enabled) {
      return createErrorJson("AI Assistant API không khả dụng", "GITHUB_MODELS_DISABLED");
    }
    if (messages == null || messages.isEmpty()) {
      return createErrorJson("Messages rỗng", "INVALID_PROMPT");
    }
    String flattenedPrompt = flattenChatMessages(messages);
    String fittedPrompt = applyStreamingContextBudgetFitting(messages, flattenedPrompt);
    String localRaw = callLocalProviderWithContext(
        fittedPrompt,
        maxOutputTokens,
        directTemperature,
        progressListener);
    if (isErrorResponseJson(localRaw)) {
      return localRaw;
    }
    String finalText = extractResultTextFromWrappedJson(localRaw);
    if (finalText == null || finalText.isBlank()) {
      finalText = localRaw;
    }
    emitStreamingChunks(finalText, progressListener);
    emitProgress(progressListener, progressPayload("complete", "Chat hoàn tất (local)", 1, 1,
        mergeProgress(progressI18n("copilot.progress.message.chat_complete", null, null, null), Map.of(
            "mode", "local_streaming",
            "provider", "local_provider"))));
    return createSuccessJson(finalText, "local_streaming", Map.of("provider", "local_provider"));
  }

  private boolean isFallbackEligibleStreamingFailure(Exception ex) {
    if (ex == null) {
      return false;
    }
    String text = String.valueOf(ex.getMessage() == null ? "" : ex.getMessage()).toLowerCase();
    return text.contains("payload too large")
        || text.contains("tokens_limit_reached")
        || text.contains("request body too large")
        || text.contains("max size")
        || text.contains("tất cả aiAssistant api đều thất bại")
        || text.contains("tat ca aiAssistant api deu that bai")
        || text.contains("rate limit")
        || text.contains("quota")
        || text.contains("unauthorized")
        || text.contains("authentication failed")
        || text.contains("invalid token")
        || text.contains("429")
        || text.contains("401")
        || text.contains("413");
  }

  private String applyStreamingContextBudgetFitting(List<Map<String, Object>> messages, String flattenedPrompt) {
    if (flattenedPrompt == null || flattenedPrompt.isBlank()) {
      return "";
    }
    if (contextBudgetManager == null || !contextBudgetManager.isEnabled() || messages == null || messages.isEmpty()) {
      return flattenedPrompt;
    }

    int maxInputTokens = contextBudgetManager.computeInputBudget(model, Math.max(256, maxOutputTokens));
    int latestUserIndex = -1;
    for (int i = messages.size() - 1; i >= 0; i--) {
      Map<String, Object> message = messages.get(i);
      String role = String.valueOf(message == null ? "" : message.getOrDefault("role", "")).toLowerCase(Locale.ROOT);
      if ("user".equals(role)) {
        latestUserIndex = i;
        break;
      }
    }

    List<ContextBudgetManager.ContextSlot> slots = new ArrayList<>();
    for (int i = 0; i < messages.size(); i++) {
      Map<String, Object> message = messages.get(i);
      String block = renderMessageBlock(message);
      if (block.isBlank()) {
        continue;
      }

      String role = String.valueOf(message == null ? "" : message.getOrDefault("role", "user")).toLowerCase(Locale.ROOT);
      ContextBudgetManager.TrimStrategy strategy;
      int priority;

      if ("system".equals(role) || i == latestUserIndex) {
        strategy = ContextBudgetManager.TrimStrategy.KEEP;
        priority = 9;
      } else if ("user".equals(role)) {
        strategy = ContextBudgetManager.TrimStrategy.PROPORTIONAL;
        priority = 7;
      } else if ("assistant".equals(role)) {
        strategy = ContextBudgetManager.TrimStrategy.TAIL_TRIM;
        priority = 5;
      } else {
        strategy = ContextBudgetManager.TrimStrategy.HEAD_TRIM;
        priority = 4;
      }

      slots.add(new ContextBudgetManager.ContextSlot("msg_" + i, block, priority, strategy));
    }

    if (slots.isEmpty()) {
      return flattenedPrompt;
    }

    String fitted = contextBudgetManager.fitToTokenBudget(slots, maxInputTokens, model);
    if (fitted == null || fitted.isBlank()) {
      return flattenedPrompt;
    }

    if (fitted.length() < flattenedPrompt.length()) {
      log.info("Streaming context fitting reduced prompt {} -> {} chars (budget={} tokens)",
          flattenedPrompt.length(), fitted.length(), maxInputTokens);
    }
    return fitted;
  }

  @SuppressWarnings("unchecked")
  private String extractResultTextFromWrappedJson(String raw) {
    if (raw == null || raw.isBlank()) {
      return "";
    }
    try {
      Map<String, Object> wrapper = objectMapper.readValue(raw, Map.class);
      Object result = wrapper.get("result");
      if (result == null) {
        Object message = wrapper.get("message");
        return message == null ? raw : String.valueOf(message);
      }
      if (result instanceof String) {
        return (String) result;
      }
      return objectMapper.writeValueAsString(result);
    } catch (Exception ex) {
      return raw;
    }
  }

  @SuppressWarnings("unchecked")
  private boolean isErrorResponseJson(String raw) {
    if (raw == null || raw.isBlank()) {
      return false;
    }
    try {
      Map<String, Object> wrapper = objectMapper.readValue(raw, Map.class);
      Object success = wrapper.get("success");
      if (success instanceof Boolean) {
        return !((Boolean) success);
      }
      Object error = wrapper.get("error");
      if (error instanceof Boolean) {
        return (Boolean) error;
      }
      return false;
    } catch (Exception ex) {
      return false;
    }
  }

  private String flattenChatMessages(List<Map<String, Object>> messages) {
    if (messages == null || messages.isEmpty()) {
      return "";
    }
    StringBuilder sb = new StringBuilder();
    for (Map<String, Object> message : messages) {
      String block = renderMessageBlock(message);
      if (!block.isBlank()) {
        sb.append(block).append("\n\n");
      }
    }
    return sb.toString().trim();
  }

  private String renderMessageBlock(Map<String, Object> message) {
    if (message == null || message.isEmpty()) {
      return "";
    }

    StringBuilder sb = new StringBuilder();
    String role = String.valueOf(message.getOrDefault("role", "user"));
    sb.append("[ROLE=").append(role).append("]\n");

    Object content = message.get("content");
    if (content instanceof String text) {
      sb.append(text);
      return sb.toString().trim();
    }

    if (content instanceof List<?> parts) {
      for (Object partObj : parts) {
        if (!(partObj instanceof Map<?, ?> part)) {
          sb.append(String.valueOf(partObj)).append("\n");
          continue;
        }

        Object typeObj = part.get("type");
        String type = typeObj == null ? "" : String.valueOf(typeObj);
        if ("text".equals(type)) {
          Object textObj = part.get("text");
          sb.append(textObj == null ? "" : String.valueOf(textObj)).append("\n");
        } else if ("image_url".equals(type)) {
          Object imageObj = part.get("image_url");
          if (imageObj instanceof Map<?, ?> imageMap) {
            Object urlObj = imageMap.get("url");
            sb.append("[IMAGE_URL] ").append(urlObj == null ? "" : String.valueOf(urlObj)).append("\n");
          } else {
            sb.append("[IMAGE_URL] ").append(String.valueOf(imageObj)).append("\n");
          }
        } else {
          sb.append(String.valueOf(part)).append("\n");
        }
      }
    }
    return sb.toString().trim();
  }

  private void emitStreamingChunks(String text, ProgressListener progressListener) {
    if (text == null || text.isBlank() || progressListener == null) {
      return;
    }

    int safeChunkChars = Math.max(500, chatStreamEmitChunkChars);
    int total = text.length();
    int sent = 0;
    while (sent < total) {
      int end = Math.min(total, sent + safeChunkChars);
      String chunk = text.substring(sent, end);
        emitProgress(progressListener, progressPayload("streaming", "Nhận dữ liệu", end, total,
          mergeProgress(progressI18n("copilot.progress.message.receiving_data", null, null, null), Map.of("chunk", chunk))));
      sent = end;
    }
  }

  @SuppressWarnings("unused")
  private String callStreamingChatCompletion(HttpEntity<Map<String, Object>> request, ProgressListener progressListener) {
    StringBuilder accumulated = new StringBuilder();
    try {
      List<String> candidateModels = resolveCandidateModels();
      
      for (String candidateModel : candidateModels) {
        try {
          // Update model in request body
          Map<String, Object> body = request.getBody();
          body.put("model", candidateModel);
          
          HttpEntity<Map<String, Object>> updatedRequest = new HttpEntity<>(body, request.getHeaders());
          
            emitProgress(progressListener, progressPayload("streaming", "Đang kết nối tới " + candidateModel, 0, 1,
              progressI18n("copilot.progress.message.connecting_model", Map.of("model", candidateModel), null, null)));
          
          // Call AI Assistant API with streaming
          ResponseEntity<String> response = restTemplate.postForEntity(apiUrl, updatedRequest, String.class);
          String rawBody = response.getBody();
          
          if (rawBody != null && !rawBody.trim().isEmpty()) {
            // Parse SSE chunks
            String[] lines = rawBody.split("\n");
            for (String line : lines) {
              if (line.startsWith("data:")) {
                String jsonData = line.substring(5).trim();
                if (!jsonData.isEmpty() && !jsonData.equals("[DONE]")) {
                  try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> chunk = objectMapper.readValue(jsonData, Map.class);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> choices = (List<Map<String, Object>>) chunk.get("choices");
                    if (choices != null && !choices.isEmpty()) {
                      @SuppressWarnings("unchecked")
                      Map<String, Object> delta = (Map<String, Object>) choices.get(0).get("delta");
                      if (delta != null) {
                        String content = (String) delta.get("content");
                        if (content != null && !content.isEmpty()) {
                          accumulated.append(content);
                          emitProgress(progressListener, progressPayload("streaming", "Nhận dữ liệu", 0, 1,
                            mergeProgress(progressI18n("copilot.progress.message.receiving_data", null, null, null), Map.of("chunk", content))));
                        }
                      }
                    }
                  } catch (Exception parseEx) {
                    log.debug("Failed to parse SSE chunk: {}", parseEx.getMessage());
                  }
                }
              }
            }
            
            return accumulated.toString();
          }
          
        } catch (Exception ex) {
          log.warn("Model {} failed: {}", candidateModel, ex.getMessage());
          continue;
        }
      }
      
      throw new IllegalStateException("Tất cả AI Assistant models đều thất bại");
      
    } catch (Exception ex) {
      log.error("Streaming chat completion failed", ex);
      throw new IllegalStateException("Streaming chat lỗi: " + ex.getMessage());
    }
  }

  /**
   * Stream chat completion using WebClient (reactive, non-blocking).
   * Endpoint is resolved from github.models.url.
   * Supports both:
   * - https://models.github.ai/inference
   * - https://models.github.ai/inference/chat/completions
   */
  private String streamChatCompletionWithWebClient(Map<String, Object> body, ProgressListener progressListener) {
    StringBuilder accumulated = new StringBuilder();
    List<String> candidateModels = resolveCandidateModels();
    String endpoint = resolveChatCompletionsEndpoint();
    String effectiveToken = getEffectiveToken(endpoint);
    
    for (String candidateModel : candidateModels) {
      try {
        if (!resolveEndpointOrderForModel(candidateModel, effectiveToken).contains("/chat/completions")) {
          log.info("Skip model '{}' in streaming mode because it does not support /chat/completions", candidateModel);
          continue;
        }
        body.put("model", candidateModel);
        
        emitProgress(progressListener, progressPayload("streaming", "Đang kết nối tới " + candidateModel, 0, 1,
          progressI18n("copilot.progress.message.connecting_model", Map.of("model", candidateModel), null, null)));
        
        // Blocking collect all streamed chunks (WebClient will handle stream internally)
        getWebClient().post()
            .uri(endpoint)
            .contentType(MediaType.APPLICATION_JSON)
            .accept(MediaType.TEXT_EVENT_STREAM)
          .headers(h -> applyAuthHeaders(h, endpoint, effectiveToken))
            .header("User-Agent", "java-github-models/1.0")
            .bodyValue(body)
            .retrieve()
            .bodyToFlux(String.class)
            .doOnNext(chunk -> {
              // Parse each SSE chunk in real-time
              String trimmed = chunk.trim();
              if (trimmed.startsWith("data:")) {
                String jsonLine = trimmed.substring(5).trim();
                if (!jsonLine.isEmpty() && !jsonLine.equals("[DONE]")) {
                  try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> parsed = objectMapper.readValue(jsonLine, Map.class);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> choices = (List<Map<String, Object>>) parsed.get("choices");
                    if (choices != null && !choices.isEmpty()) {
                      @SuppressWarnings("unchecked")
                      Map<String, Object> delta = (Map<String, Object>) choices.get(0).get("delta");
                      if (delta != null && delta.containsKey("content")) {
                        String content = (String) delta.get("content");
                        if (content != null && !content.isEmpty()) {
                          accumulated.append(content);
                          // Emit each chunk to progress listener for real-time UI update
                            emitProgress(progressListener, progressPayload("streaming", "Nhận dữ liệu", 0, 1,
                              mergeProgress(progressI18n("copilot.progress.message.receiving_data", null, null, null), Map.of("chunk", content))));
                        }
                      }
                    }
                  } catch (Exception parseEx) {
                    log.debug("Failed to parse SSE chunk: {}", parseEx.getMessage());
                  }
                }
              }
            })
            .doOnError(ex -> log.warn("Stream error: {}", ex.getMessage()))
            .blockLast(); // Block until stream completes, return last element (null for empty stream)
        
        if (accumulated.length() > 0) {
          log.info("Stream completed: {} chars, model={}", accumulated.length(), candidateModel);
          return accumulated.toString();
        }
        
      } catch (Exception ex) {
        log.warn("WebClient streaming failed for model {}: {}", candidateModel, ex.getMessage());
        accumulated.setLength(0); // Reset for next attempt
        continue;
      }
    }
    
    throw new IllegalStateException("Tất cả AI Assistant models đều thất bại (stream mode)");
  }

  private String generateDirectContent(String prompt, ProgressListener progressListener) {
    return callLocalProviderWithContext(prompt, maxOutputTokens, directTemperature, progressListener);
  }

  private String generateLargePromptContent(String prompt, ProgressListener progressListener, AiMenuOperationScenario scenario) {
    log.info("generateLargePromptContent: local provider, promptChars={}", prompt.length());
    return callLocalProviderWithContext(prompt, maxOutputTokens, directTemperature, progressListener);
  }

  @SuppressWarnings("unused")
  private String generateLargePromptContent_chunked(String prompt, ProgressListener progressListener, AiMenuOperationScenario scenario) {
    // Kept for reference only — no longer called.
    try {
      List<String> chunks = splitIntoChunks(prompt, chunkSizeChars, chunkOverlapChars);
      if (chunks.isEmpty()) {
        return createErrorJson("Không thể chia prompt thành chunks hợp lệ", "GITHUB_CHUNK_SPLIT_FAILED");
      }
      if (chunks.size() > maxChunks) {
        return createErrorJson(
            "Prompt quá lớn sau khi chia chunk (" + chunks.size() + " chunks, tối đa " + maxChunks + ")",
            "GITHUB_TOO_MANY_CHUNKS");
      }

      List<String> chunkSummaries = new ArrayList<>();
      String taskHint = buildTaskHint(prompt);
      List<?> baseMenuForIncremental = scenario == AiMenuOperationScenario.INCREMENTAL_UPDATE
          ? extractCurrentMenuFromPrompt(prompt)
          : null;
      emitProgress(progressListener, progressPayload(
          "preparing",
          "Ngữ cảnh quá lớn, chuyển sang chế độ chunk",
          0,
          Math.max(1, chunks.size()),
          withOrchestrationMeta("preparing", 0, Math.max(1, chunks.size()), mergeProgress(
            progressI18n(
              "copilot.progress.message.large_context_chunk_mode",
              null,
              "copilot.progress.detail.split_into_chunks",
              Map.of(
                "chunkCount", chunks.size(),
                "chunkSizeChars", chunkSizeChars,
                "chunkOverlapChars", chunkOverlapChars,
                "inputChars", prompt.length(),
                "mode", "chunked_map_reduce")),
            Map.of(
              "detail", "Da chia ngu canh thanh " + chunks.size() + " phan de phan tich tuan tu",
              "chunkCount", chunks.size(),
              "chunkSizeChars", chunkSizeChars,
              "chunkOverlapChars", chunkOverlapChars,
              "inputChars", prompt.length(),
              "mode", "chunked_map_reduce")))));
      int idx = 1;
      for (String chunk : chunks) {
        Map<String, Object> extra = new HashMap<>();
        extra.put("phase", "chunk-summary");
        extra.put("detail", "Dang phan tich phan [" + idx + "/" + chunks.size() + "] bang model chunk-summary");
        extra.put("detailKey", "copilot.progress.detail.analyzing_chunk");
        extra.put("detailArgs", Map.of("current", idx, "total", chunks.size()));
        String preChunkDraft = buildRealtimeDraftText(
            "chunking",
            "Dang phan tich tung phan du lieu",
            taskHint,
            chunkSummaries,
            idx - 1,
            chunks.size());
        if (preChunkDraft != null && !preChunkDraft.isBlank()) {
          extra.put("draftText", preChunkDraft);
        }
        if (realtimeDraftEnabled && scenario == AiMenuOperationScenario.INCREMENTAL_UPDATE && baseMenuForIncremental != null && !baseMenuForIncremental.isEmpty()) {
          String baseDraft = buildMenuDraftEnvelope(baseMenuForIncremental, idx - 1, chunks.size(), "base_menu");
          if (baseDraft != null && !baseDraft.isBlank()) {
            extra.put("draftText", baseDraft);
          }
        }
        emitProgress(progressListener, progressPayload("chunking", "Đang phân tích từng phần của prompt", idx - 1, chunks.size(),
          mergeProgress(progressI18n("copilot.progress.message.chunking_prompt_parts", null, null, null),
            withOrchestrationMeta("chunking", idx - 1, chunks.size(), extra))));
        
        String chunkPrompt = buildChunkSummaryPrompt(idx, chunks.size(), chunk);
        String chunkRaw = callChatCompletion(chunkPrompt, chunkSummaryMaxTokens, chunkSummaryTemperature, progressListener,
          progressPayload("chunking", "Đang xử lý chunk " + idx + "/" + chunks.size(), idx, chunks.size(),
            mergeProgress(progressI18n("copilot.progress.message.processing_chunk", Map.of("current", idx, "total", chunks.size()), null, null),
              withOrchestrationMeta("chunking", idx, chunks.size(), extra))));
        if (chunkRaw == null || chunkRaw.isBlank()) {
          return createErrorJson("Chunk " + idx + " trả về rỗng", "GITHUB_CHUNK_EMPTY_RESPONSE");
        }
        String chunkContent = extractContent(chunkRaw);
        if (chunkContent == null || chunkContent.isBlank()) {
          return createErrorJson("Không trích xuất được summary của chunk " + idx, "GITHUB_CHUNK_PARSE_EMPTY");
        }
        chunkSummaries.add(chunkContent.trim());
        Map<String, Object> postChunkExtra = new HashMap<>();
        postChunkExtra.put("phase", "chunk-summary");
        postChunkExtra.put("detail", "Da hoan tat phan tich phan [" + idx + "/" + chunks.size() + "]");
        postChunkExtra.put("detailKey", "copilot.progress.detail.chunk_completed");
        postChunkExtra.put("detailArgs", Map.of("current", idx, "total", chunks.size()));
        String postChunkDraft = buildRealtimeDraftText(
            "chunking",
            "Da hoan tat chunk " + idx + "/" + chunks.size(),
            taskHint,
            chunkSummaries,
            idx,
            chunks.size());
        if (postChunkDraft != null && !postChunkDraft.isBlank()) {
          postChunkExtra.put("draftText", postChunkDraft);
        }

        // ⭐ ALWAYS emit realtime menu draft every chunk for INCREMENTAL_UPDATE
        // This ensures frontend updates editor in realtime, not just at final merge
        if (realtimeDraftEnabled && scenario == AiMenuOperationScenario.INCREMENTAL_UPDATE && baseMenuForIncremental != null) {
          String incrementalMenuDraft = tryBuildRealtimeMenuDraft(
              taskHint,
              chunkSummaries,
              idx,
              chunks.size(),
              scenario,
              baseMenuForIncremental);
          if (incrementalMenuDraft != null && !incrementalMenuDraft.isBlank()) {
            postChunkExtra.put("draftText", incrementalMenuDraft);  // ← Override with menu draft
            log.info("[REALTIME_DRAFT_CHUNK] idx={}/{} draftLength={} hasMenuField={}", 
                idx, chunks.size(), incrementalMenuDraft.length(), incrementalMenuDraft.contains("\"menu\""));
          }
        }
        emitProgress(progressListener, progressPayload("chunking", "Đang cập nhật bản nháp tạm thời", idx, chunks.size(),
          mergeProgress(progressI18n("copilot.progress.message.updating_draft", null, null, null),
            withOrchestrationMeta("chunking", idx, chunks.size(), postChunkExtra))));
        idx++;
      }

      Map<String, Object> reducingExtra = new HashMap<>();
      String reducingDraft = buildRealtimeDraftText(
          "reducing",
          "Dang gom cac chunk summary de tong hop",
          taskHint,
          chunkSummaries,
          0,
          chunkSummaries.size());
      if (reducingDraft != null && !reducingDraft.isBlank()) {
        reducingExtra.put("draftText", reducingDraft);
      }
        reducingExtra.put("detail", "Dang gom " + chunkSummaries.size() + " ban tom tat de tao bo nho tam cho suy luan cuoi");
        reducingExtra.put("detailKey", "copilot.progress.detail.reducing_summaries");
        reducingExtra.put("detailArgs", Map.of("chunkCount", chunkSummaries.size()));
        emitProgress(progressListener, progressPayload("reducing", "Đang gộp tóm tắt các chunk", 0, chunkSummaries.size(),
          mergeProgress(progressI18n("copilot.progress.message.reducing_chunks", null, null, null),
            withOrchestrationMeta("reducing", 0, chunkSummaries.size(), reducingExtra))));
      List<String> reducedSummaries = reduceSummaries(chunkSummaries, progressListener);
        String globalAnchors = buildGlobalContextAnchors(prompt, chunks, baseMenuForIncremental, taskHint);
      Map<String, Object> finalMergeExtra = new HashMap<>();
      String finalMergeDraft = buildRealtimeDraftText(
          "final_merge",
          "Dang tong hop ket qua cuoi cung",
          taskHint,
          reducedSummaries,
          0,
          1);
      if (finalMergeDraft != null && !finalMergeDraft.isBlank()) {
        finalMergeExtra.put("draftText", finalMergeDraft);
      }
      finalMergeExtra.put("detail", "Final reasoning: dang tong hop toan bo chunk summaries thanh ket qua cuoi cung");
        finalMergeExtra.put("detailKey", "copilot.progress.detail.final_reasoning");
        finalMergeExtra.put("detailArgs", Map.of("summaryCount", reducedSummaries.size()));
      emitProgress(progressListener, progressPayload("final_merge", "Đang tổng hợp kết quả cuối", 0, 1,
          mergeProgress(progressI18n("copilot.progress.message.final_merge", null, null, null),
            withOrchestrationMeta("final_merge", 0, 1, finalMergeExtra))));
      String mergedPrompt = buildMergedPrompt(taskHint, reducedSummaries, globalAnchors);
      String mergedRaw = callChatCompletion(mergedPrompt, maxOutputTokens, mergeTemperature, progressListener,
          progressPayload("final_merge", "Đang chờ phản hồi tổng hợp cuối", 1, 1,
            mergeProgress(progressI18n("copilot.progress.message.final_waiting", null, null, null),
              withOrchestrationMeta("final_merge", 1, 1, finalMergeExtra))));
      if (mergedRaw == null || mergedRaw.isBlank()) {
        return createErrorJson("Tổng hợp chunk trả về rỗng", "GITHUB_MERGE_EMPTY_RESPONSE");
      }

      String mergedContent = extractContent(mergedRaw);
      if (mergedContent == null || mergedContent.isBlank()) {
        return createErrorJson("Không trích xuất được nội dung tổng hợp cuối", "GITHUB_MERGE_PARSE_EMPTY");
      }

      Object parsedResult = tryParseJson(mergedContent);
      Object normalizedResult = parsedResult != null ? parsedResult : mergedContent;
      if (looksLikeMenuTask(prompt)) {
        Object repaired = ensureValidMenuFinalResult(normalizedResult, mergedContent, scenario, progressListener, finalMergeExtra);
        if (repaired == null) {
          return createErrorJson(
              "AI Assistant API trả về kết quả cuối không hợp lệ cho menu (không phải JSON menu/menu_node).",
              "GITHUB_FINAL_OUTPUT_INVALID");
        }
        normalizedResult = repaired;
      }

      Map<String, Object> meta = new HashMap<>();
      meta.put("chunks", chunks.size());
      meta.put("reducedSummaries", reducedSummaries.size());
      meta.put("chunkSizeChars", chunkSizeChars);
      meta.put("chunkOverlapChars", chunkOverlapChars);
        meta.put("detail", "Da hoan tat toan bo quy trinh preparing -> chunking -> reducing -> final reasoning");
        meta.put("detailKey", "copilot.progress.detail.completed_pipeline");
        meta.put("detailArgs", Map.of("chunkCount", chunks.size(), "summaryCount", reducedSummaries.size()));
        emitProgress(progressListener, progressPayload("completed", "Đã hoàn tất xử lý AI", chunks.size(), chunks.size(),
          mergeProgress(progressI18n("copilot.progress.message.completed", null, null, null),
            withOrchestrationMeta("completed", chunks.size(), chunks.size(), meta))));
      String successJson = createSuccessJson(normalizedResult, "chunked", meta);
      cacheResponse(prompt, successJson);
      return successJson;
    } catch (Exception ex) {
      log.error("AI Assistant API chunked request failed", ex);
      String normalizedMessage = String.valueOf(ex.getMessage() == null ? "" : ex.getMessage()).toLowerCase(Locale.ROOT);
      if (normalizedMessage.contains("tat ca aiAssistant api deu that bai")
          || normalizedMessage.contains("no available aiAssistant api")) {
        return createErrorJson("AI Assistant API exhausted for chunked menu task: " + ex.getMessage(), "GITHUB_MODELS_EXHAUSTED");
      }
      return createErrorJson("Lỗi xử lý prompt lớn qua AI Assistant API: " + ex.getMessage(), "GITHUB_CHUNKED_ERROR");
    }
  }

  private String buildRealtimeDraftText(
      String stage,
      String message,
      String taskHint,
      List<String> summaries,
      int current,
      int total) {
    try {
      Map<String, Object> draft = new HashMap<>();
      draft.put("success", false);
      draft.put("status", "running");
      draft.put("stage", stage);
      draft.put("message", message);
      draft.put("progress", Map.of(
          "current", Math.max(0, current),
          "total", Math.max(1, total)));
      draft.put("task_hint", trimToMax(taskHint == null ? "" : taskHint, 1200));

      List<String> preview = new ArrayList<>();
      if (summaries != null && !summaries.isEmpty()) {
        int start = Math.max(0, summaries.size() - 3);
        for (int i = start; i < summaries.size(); i++) {
          String item = summaries.get(i);
          if (item != null && !item.isBlank()) {
            preview.add(trimToMax(item, 700));
          }
        }
      }
      draft.put("working_summaries", preview);
      return objectMapper.writeValueAsString(draft);
    } catch (Exception ex) {
      log.debug("Cannot build realtime draft text: {}", ex.getMessage());
      return null;
    }
  }

  private String tryBuildRealtimeMenuDraft(
      String taskHint,
      List<String> summaries,
      int currentChunk,
      int totalChunks,
      AiMenuOperationScenario scenario,
      List<?> baseMenu) {
    try {
      if (summaries == null || summaries.isEmpty()) {
        return buildMenuDraftEnvelope(baseMenu, currentChunk, totalChunks, "base_menu");
      }

      String prompt = buildRealtimeMenuDraftPrompt(taskHint, summaries, currentChunk, totalChunks, scenario, baseMenu);
      int draftMaxTokens = Math.max(512, Math.min(1800, chunkSummaryMaxTokens * 2));
      String raw = callChatCompletion(prompt, draftMaxTokens, 0.1d, null, null);
      if (raw == null || raw.isBlank()) {
        return buildMenuDraftEnvelope(baseMenu, currentChunk, totalChunks, "base_menu");
      }

      String content = extractContentSafely(raw);
      if (content == null || content.isBlank()) {
        return buildMenuDraftEnvelope(baseMenu, currentChunk, totalChunks, "base_menu");
      }

      Object parsed = tryParseJson(content);
      List<?> menu = extractMenuList(parsed);
      if (menu == null || menu.isEmpty()) {
        return buildMenuDraftEnvelope(baseMenu, currentChunk, totalChunks, "base_menu");
      }

      return buildMenuDraftEnvelope(menu, currentChunk, totalChunks, "chunking");
    } catch (Exception ex) {
      log.debug("Realtime menu draft generation skipped: {}", ex.getMessage());
      return buildMenuDraftEnvelope(baseMenu, currentChunk, totalChunks, "base_menu");
    }
  }

  private String buildMenuDraftEnvelope(List<?> menu, int currentChunk, int totalChunks, String stage) {
    if (menu == null || menu.isEmpty()) {
      return null;
    }
    try {
      Map<String, Object> menuEnvelope = new HashMap<>();
      menuEnvelope.put("menu", menu);
      menuEnvelope.put("_draft_stage", stage == null ? "chunking" : stage);
      menuEnvelope.put("_draft_progress", Map.of(
          "current", Math.max(0, currentChunk),
          "total", Math.max(1, totalChunks)));
      return objectMapper.writeValueAsString(menuEnvelope);
    } catch (Exception ex) {
      log.debug("Cannot build menu draft envelope: {}", ex.getMessage());
      return null;
    }
  }

  private List<?> extractMenuList(Object parsed) {
    if (parsed == null) {
      return null;
    }
    if (parsed instanceof List<?>) {
      return (List<?>) parsed;
    }
    if (parsed instanceof Map<?, ?> map) {
      Object menu = map.get("menu");
      if (menu instanceof List<?>) {
        return (List<?>) menu;
      }
      Object data = map.get("data");
      if (data instanceof Map<?, ?> dataMap) {
        Object nestedMenu = dataMap.get("menu");
        if (nestedMenu instanceof List<?>) {
          return (List<?>) nestedMenu;
        }
      }
    }
    return null;
  }

  private String buildRealtimeMenuDraftPrompt(
      String taskHint,
      List<String> summaries,
      int currentChunk,
      int totalChunks,
      AiMenuOperationScenario scenario,
      List<?> baseMenu) {
    StringBuilder sb = new StringBuilder();
    sb.append("Bạn đang tạo BẢN NHÁP MENU TẠM THỜI theo tiến độ chunk.\\n");
    sb.append("SCENARIO: ").append(scenario == null ? "UNKNOWN" : scenario.name()).append("\\n");
    sb.append("YÊU CẦU CỨNG:\\n");
    sb.append("- Chỉ trả JSON hợp lệ, không markdown.\\n");
    sb.append("- Trả về đúng format: {\"menu\":[...]}\\n");
    sb.append("- Không được tự ý xóa hàng loạt menu; ưu tiên giữ cấu trúc hiện có nếu chưa chắc chắn.\\n");
    sb.append("- Nếu chưa đủ thông tin, trả về menu bảo thủ nhất có thể.\\n");
    sb.append("- Đây là bản nháp tạm để hiển thị realtime, không phải kết quả cuối.\\n\\n");
    sb.append("- CHỈNH SỬA trigger nếu yêu cầu có nhắc tới trigger; không được bỏ qua trigger.\\n");
    sb.append("- KHÔNG được xóa node/menu không liên quan tới yêu cầu thay đổi.\\n\\n");
    sb.append("TIẾN ĐỘ: chunk ").append(currentChunk).append("/").append(totalChunks).append("\\n\\n");
    sb.append("TASK_HINT:\\n").append(trimToMax(taskHint == null ? "" : taskHint, 1800)).append("\\n\\n");
    if (baseMenu != null && !baseMenu.isEmpty()) {
      try {
        sb.append("BASE_MENU_AUTHORITATIVE (phai giu nguyen node khong lien quan):\\n");
        sb.append(trimToMax(objectMapper.writeValueAsString(Map.of("menu", baseMenu)), Math.max(6000, requestMaxChars - 3500))).append("\\n\\n");
      } catch (Exception ignored) {
        // Ignore serialization errors and continue with chunk summaries only.
      }
    }
    sb.append("TÓM TẮT CHUNK GẦN NHẤT:\\n");

    List<String> safeSummaries = summaries == null ? Collections.emptyList() : summaries;
    int start = Math.max(0, safeSummaries.size() - 4);
    for (int i = start; i < safeSummaries.size(); i++) {
      String item = safeSummaries.get(i);
      if (item == null || item.isBlank()) {
        continue;
      }
      sb.append("[S").append(i + 1).append("] ").append(trimToMax(item, 2400)).append("\\n");
    }

    return trimToMax(sb.toString(), requestMaxChars - 500);
  }

  private List<?> extractCurrentMenuFromPrompt(String prompt) {
    if (prompt == null || prompt.isBlank()) {
      return null;
    }
    try {
      @SuppressWarnings("unchecked")
      Map<String, Object> root = objectMapper.readValue(prompt.trim(), Map.class);
      Object metadataObj = root.get("app_id_specific_metadata");
      if (!(metadataObj instanceof Map<?, ?> metadataMap)) {
        return null;
      }
      Object menuJsonObj = metadataMap.get("current_menu_full_json");
      if (menuJsonObj == null) {
        return null;
      }
      Object parsed = menuJsonObj instanceof String
          ? tryParseJson((String) menuJsonObj)
          : menuJsonObj;
      return extractMenuList(parsed);
    } catch (Exception ex) {
      log.debug("Cannot extract base menu from prompt: {}", ex.getMessage());
      return null;
    }
  }

  private String callChatCompletion(String prompt, int maxTokens, double temperature, ProgressListener progressListener,
      Map<String, Object> progressMeta) {
    if (prompt == null || prompt.isBlank()) {
      throw new IllegalArgumentException("Prompt rỗng khi gọi local AI");
    }
    return callLocalProviderWithContext(prompt, maxTokens, temperature, progressListener);
  }

  private List<String> filterMenuAllowedModels(List<String> candidates) {
    if (candidates == null || candidates.isEmpty()) {
      return Collections.emptyList();
    }
    Set<String> allowed = new LinkedHashSet<>();
    addModelsFromCsv(allowed, menuAllowedModels);
    if (allowed.isEmpty()) {
      addModelsFromCsv(allowed, "gpt-4o-mini,gpt-4o");
    }

    List<String> filtered = new ArrayList<>();
    for (String candidate : candidates) {
      String lc = String.valueOf(candidate == null ? "" : candidate).toLowerCase(Locale.ROOT);
      boolean ok = false;
      for (String allow : allowed) {
        String allowLc = allow.toLowerCase(Locale.ROOT);
        if (!allowLc.isBlank() && lc.contains(allowLc)) {
          ok = true;
          break;
        }
      }
      if (ok) {
        filtered.add(candidate);
      }
    }
    return filtered;
  }

  private String executeWithRetry(HttpEntity<Map<String, Object>> request, String prompt, int maxTokens,
      ProgressListener progressListener, Map<String, Object> progressMeta, String modelName, String endpoint,
      String tokenScope) {
    int estimatedTokens = estimateTokens(prompt, maxTokens);
    acquirePermit();
    try {
      for (int attempt = 1; attempt <= Math.max(1, retryMaxAttempts); attempt++) {
        try {
          reserveBudgetBeforeCall(estimatedTokens);
          emitProgress(progressListener, mergeProgress(progressMeta, Map.of("attempt", attempt)));
          if (attempt == 1) {
            log.info("AI Assistant API request: endpoint='{}', model='{}', promptChars={}", endpoint, modelName, prompt == null ? 0 : prompt.length());
          }
          ResponseEntity<String> response = postInferenceRequest(endpoint, request);
          return response.getBody();
        } catch (HttpClientErrorException.TooManyRequests ex) {
          if (isDailyQuotaExceeded(ex)) {
            String msg = "AI Assistant API daily quota reached for model '" + modelName + "'";
            markModelTemporarilyUnavailable(modelName, tokenScope, modelQuotaCooldownMs, "daily quota exhausted");
            log.warn(msg);
            throw new IllegalStateException(msg);
          }
          long waitMs = computeRetryWaitMs(attempt, ex);
          int maxRateRetries = Math.max(0, retryMaxRateRetriesPerModel);
          long maxWaitAllowed = Math.max(0L, retryMax429WaitMs);
          boolean shouldFastFailover = attempt > maxRateRetries || (maxWaitAllowed > 0L && waitMs > maxWaitAllowed);

          if (shouldFastFailover) {
            String reason = waitMs > maxWaitAllowed && maxWaitAllowed > 0L
                ? ("429 wait too long (" + waitMs + "ms > " + maxWaitAllowed + "ms)")
                : ("429 retries exceeded per model (attempt " + attempt + "/" + retryMaxAttempts + ")");
            log.warn("AI Assistant API 429 for model '{}' -> fast failover: {}.", modelName, reason);
            // If OpenAI returned a large Retry-After, the entire account key is rate-limited.
            // Record account-level cooldown so other models skip immediately without wasted calls.
            if (waitMs > maxWaitAllowed && maxWaitAllowed > 0L && waitMs > 0L) {
              long accountCooldownUntil = System.currentTimeMillis() + waitMs;
              openAiAccountRateLimitUntilMs = accountCooldownUntil;
              log.warn("OpenAI account-level rate limit detected: all models unavailable for {}ms (until {})",
                  waitMs, new java.util.Date(accountCooldownUntil));
            }
            markModelTemporarilyUnavailable(modelName, tokenScope, modelRateLimitCooldownMs, reason);
            emitProgress(progressListener, mergeProgress(progressMeta, Map.of(
                "stage", "fast_failover_rate_limit",
                "message", "Model dang bi rate-limit, chuyen model fallback de giam tre",
              "messageKey", "copilot.progress.message.fast_failover_rate_limit",
              "messageArgs", Map.of("model", modelName),
                "attempt", attempt,
                "model", modelName,
                "waitingMs", waitMs,
                "reason", reason)));
            throw new IllegalStateException("rate limit fast-failover for model '" + modelName + "': " + reason);
          }

          log.warn("AI Assistant API 429 rate limit for model '{}' (attempt {}/{}). Waiting {} ms before retry.",
              modelName, attempt, retryMaxAttempts, waitMs);
          emitProgress(progressListener, mergeProgress(progressMeta, Map.of(
              "stage", "waiting_rate_limit",
              "message", "Đang chờ quota AI Assistant API",
              "messageKey", "copilot.progress.message.waiting_rate_limit",
              "messageArgs", Map.of("model", modelName, "waitingMs", waitMs),
              "attempt", attempt,
              "model", modelName,
              "waitingMs", waitMs)));
          sleepQuietly(waitMs);
        } catch (HttpClientErrorException ex) {
          if (ex.getStatusCode().value() == 401) {
            String authMessage = "AI Assistant API authentication failed (401) for model '" + modelName
                + "' at endpoint '" + endpoint
                + "'. Check github.models.token, github.models.auth-scheme and token scope.";
            throw new IllegalStateException(authMessage, ex);
          }
          throw ex;
        }
      }
    } finally {
      requestSemaphore.release();
    }
    throw new IllegalStateException("AI Assistant API rate limit exceeded after retries for model '" + modelName + "'");
  }

  private ResponseEntity<String> postInferenceRequest(String endpoint, HttpEntity<Map<String, Object>> request) {
    HttpEntity<Map<String, Object>> safeRequest = request == null
        ? new HttpEntity<>(Collections.emptyMap(), new HttpHeaders())
        : request;

    ResponseEntity<String> response = executeInferencePost(endpoint, safeRequest);

    if (response == null) {
      throw new IllegalStateException("AI Assistant API request failed: empty response");
    }

    if (response.getStatusCode().isError()) {
      if (response.getStatusCode().value() == 401 && authFallbackOnUnauthorized) {
        ResponseEntity<String> recovered = tryRecoverFromUnauthorized(endpoint, safeRequest, response);
        if (recovered != null && !recovered.getStatusCode().isError()) {
          return recovered;
        }
      }
      throw createHttpClientError("AI Assistant API request failed", response);
    }

    return response;
  }

  private ResponseEntity<String> executeInferencePost(String endpoint, HttpEntity<Map<String, Object>> safeRequest) {
    return getWebClient()
        .post()
        .uri(endpoint)
        .headers(h -> {
          HttpHeaders source = safeRequest.getHeaders();
          if (source != null) {
            source.forEach((k, v) -> h.put(k, new ArrayList<>(v)));
          }
        })
        .bodyValue(safeRequest.getBody() == null ? Collections.emptyMap() : safeRequest.getBody())
        .exchangeToMono(clientResponse -> clientResponse.toEntity(String.class))
        .block();
  }

  private List<String> resolveCandidateModels() {
    return resolveCandidateModels(model);
  }

  private List<String> resolveCandidateModels(String preferredModel) {
    Set<String> ordered = new LinkedHashSet<>();
    String primary = normalizeConfiguredModel(preferredModel);
    if (!primary.isEmpty()) {
      ordered.add(primary);
    }

    String defaultPrimary = normalizeConfiguredModel(model);
    if (!defaultPrimary.isEmpty()) {
      ordered.add(defaultPrimary);
    }

    addModelsFromCsv(ordered, models);
    addModelsFromCsv(ordered, defaultFallbackModels);

    List<String> list = new ArrayList<>(ordered);
    String endpoint = resolveChatCompletionsEndpoint();
    String effectiveToken = getEffectiveToken(endpoint);
    refreshModelEndpointCacheIfNeeded(effectiveToken);

    Map<String, Set<String>> cache = modelEndpointCache == null ? Collections.emptyMap() : modelEndpointCache;
    if (!cache.isEmpty()) {
      List<String> filtered = new ArrayList<>();
      for (String candidate : list) {
        String resolved = resolveCatalogModelId(candidate, cache);
        if (resolved != null && !resolved.isBlank()) {
          filtered.add(resolved);
        } else {
          log.debug("Skip model '{}' because it is not listed by endpoint catalog {}", candidate, endpoint);
        }
      }
      if (!filtered.isEmpty()) {
        list = filtered;
      } else {
        List<String> catalogFallback = collectCatalogModelsForChat(cache);
        if (!catalogFallback.isEmpty()) {
          list = catalogFallback;
          log.warn("Configured model aliases are missing in catalog. Falling back to chat-capable catalog models: {}",
              String.join(", ", catalogFallback));
        }
      }

      addEndpointCatalogFallback(list, cache, "gpt-4o-mini");
      addEndpointCatalogFallback(list, cache, "gpt-4o");
      addEndpointCatalogFallback(list, cache, "Meta-Llama-3.1-8B-Instruct");
    }

    list = preferOpenAiModels(list);

    if (list.size() <= 1) {
      return list;
    }

    if (prioritizeMiniModels) {
      list.sort((a, b) -> Integer.compare(modelPriority(a), modelPriority(b)));
    }

    if (!rotateCandidates) {
      return list;
    }

    int start = Math.floorMod(modelCursor.getAndIncrement(), list.size());
    List<String> rotated = new ArrayList<>(list.size());
    for (int i = 0; i < list.size(); i++) {
      rotated.add(list.get((start + i) % list.size()));
    }
    return rotated;
  }

  private List<String> preferOpenAiModels(List<String> candidates) {
    if (candidates == null || candidates.isEmpty()) {
      return Collections.emptyList();
    }
    List<String> openAi = new ArrayList<>();
    List<String> others = new ArrayList<>();
    for (String candidate : candidates) {
      String lower = String.valueOf(candidate == null ? "" : candidate).toLowerCase(Locale.ROOT);
      if (lower.contains("gpt-")) {
        openAi.add(candidate);
      } else {
        others.add(candidate);
      }
    }
    if (openAi.isEmpty()) {
      return candidates;
    }
    List<String> merged = new ArrayList<>(openAi.size() + others.size());
    merged.addAll(openAi);
    merged.addAll(others);
    return merged;
  }

  private static String stripVersionSuffix(String modelId) {
    if (modelId == null) return "";
    // Strip date-like suffixes: -2024-07-18 or -20240718
    return modelId.replaceAll("-\\d{4}-\\d{2}-\\d{2}$", "")
                  .replaceAll("-\\d{8}$", "");
  }

  private static String normalizeModelAliasKey(String raw) {
    if (raw == null) {
      return "";
    }
    return raw.trim().toLowerCase(Locale.ROOT);
  }

  private List<String> collectCatalogModelsForChat(Map<String, Set<String>> cache) {
    if (cache == null || cache.isEmpty()) {
      return Collections.emptyList();
    }

    Set<String> canonical = new LinkedHashSet<>();
    Map<String, String> aliases = modelAliasToCatalogId == null ? Collections.emptyMap() : modelAliasToCatalogId;
    canonical.addAll(aliases.values());
    if (canonical.isEmpty()) {
      Set<String> raw = modelCatalogRawIds == null ? Collections.emptySet() : modelCatalogRawIds;
      for (String key : raw) {
        if (key == null || key.isBlank()) {
          continue;
        }
        canonical.add(deriveCallableModelId(key));
      }
    }

    List<String> chatCapable = new ArrayList<>();
    for (String id : canonical) {
      if (!isLikelyChatLlmModelId(id)) {
        continue;
      }
      String aliasKey = resolveCatalogAliasKey(id, cache);
      Set<String> endpoints = aliasKey == null ? Collections.emptySet() : cache.getOrDefault(aliasKey, Collections.emptySet());
      // Some catalog payloads omit supported_endpoints; treat those as unknown (optimistic allow).
      if (endpoints.isEmpty() || endpoints.contains("/chat/completions")) {
        chatCapable.add(id);
      }
    }

    if (chatCapable.size() > 1 && prioritizeMiniModels) {
      chatCapable.sort((a, b) -> Integer.compare(modelPriority(a), modelPriority(b)));
    }

    if (chatCapable.size() > 12) {
      return new ArrayList<>(chatCapable.subList(0, 12));
    }
    return chatCapable;
  }

  private boolean isLikelyChatLlmModelId(String modelId) {
    if (modelId == null || modelId.isBlank()) {
      return false;
    }
    String lower = modelId.toLowerCase(Locale.ROOT);
    if (lower.contains("embedding") || lower.contains("rerank") || lower.contains("whisper")
        || lower.contains("tts") || lower.contains("moderation")) {
      return false;
    }
    return lower.contains("gpt")
        || lower.contains("o1")
        || lower.contains("o3")
        || lower.contains("claude")
        || lower.contains("gemini")
        || lower.contains("llama")
        || lower.contains("mistral")
        || lower.contains("deepseek")
        || lower.contains("qwen")
        || lower.contains("grok");
  }

  private static void indexCatalogAlias(
      Map<String, Set<String>> endpointCache,
      Map<String, String> aliasToCatalogId,
      String alias,
      String catalogId,
      Set<String> endpoints) {
    String key = normalizeModelAliasKey(alias);
    String value = normalizeModelAliasKey(catalogId);
    if (key.isBlank() || value.isBlank()) {
      return;
    }
    endpointCache.putIfAbsent(key, endpoints);
    aliasToCatalogId.putIfAbsent(key, value);
  }

  private String deriveCallableModelId(String catalogId) {
    String normalized = normalizeModelAliasKey(catalogId);
    if (normalized.isBlank()) {
      return normalized;
    }

    int modelsPos = normalized.indexOf("/models/");
    if (modelsPos >= 0) {
      int nameStart = modelsPos + "/models/".length();
      int versionPos = normalized.indexOf("/versions/", nameStart);
      if (versionPos > nameStart) {
        return normalized.substring(nameStart, versionPos);
      }
      return normalized.substring(nameStart);
    }

    if (normalized.startsWith("openai/") || normalized.startsWith("azure-openai/")) {
      int slash = normalized.lastIndexOf('/');
      if (slash >= 0 && slash < normalized.length() - 1) {
        return normalized.substring(slash + 1);
      }
    }
    return normalized;
  }

  private String resolveCatalogAliasKey(String requestedModel, Map<String, Set<String>> cache) {
    if (requestedModel == null || requestedModel.isBlank() || cache == null || cache.isEmpty()) {
      return null;
    }
    String normalized = normalizeModelAliasKey(normalizeConfiguredModel(requestedModel));
    if (normalized.isBlank()) {
      return null;
    }
    if (cache.containsKey(normalized)) {
      return normalized;
    }

    String suffix = "/" + normalized;
    for (String key : cache.keySet()) {
      if (key.endsWith(suffix)) {
        return key;
      }
    }

    for (String key : cache.keySet()) {
      String keyBase = stripVersionSuffix(key);
      if (normalized.equals(keyBase)) {
        return key;
      }
      int slash = key.lastIndexOf('/');
      if (slash >= 0 && slash < key.length() - 1) {
        String shortName = key.substring(slash + 1);
        if (normalized.equals(stripVersionSuffix(shortName))) {
          return key;
        }
      }
    }
    return null;
  }

  private String resolveCatalogModelId(String requestedModel, Map<String, Set<String>> cache) {
    String aliasKey = resolveCatalogAliasKey(requestedModel, cache);
    if (aliasKey == null) {
      return null;
    }
    Map<String, String> aliases = modelAliasToCatalogId == null ? Collections.emptyMap() : modelAliasToCatalogId;
    return resolveCatalogModelId(requestedModel, cache, aliases);
  }

  private String resolveCatalogModelId(String requestedModel, Map<String, Set<String>> cache, Map<String, String> aliases) {
    String aliasKey = resolveCatalogAliasKey(requestedModel, cache);
    if (aliasKey == null) {
      return null;
    }
    Map<String, String> safeAliases = aliases == null ? Collections.emptyMap() : aliases;
    return safeAliases.getOrDefault(aliasKey, aliasKey);
  }

  private void addEndpointCatalogFallback(List<String> collector, Map<String, Set<String>> catalog, String modelId) {
    if (collector == null || catalog == null || modelId == null || modelId.isBlank()) {
      return;
    }
    String resolved = resolveCatalogModelId(modelId, catalog);
    if (resolved == null || resolved.isBlank()) {
      return;
    }
    for (String existing : collector) {
      if (resolved.equalsIgnoreCase(existing)) {
        return;
      }
    }
    collector.add(resolved);
  }

  private void addModelsFromCsv(Set<String> collector, String csv) {
    if (collector == null || csv == null || csv.isBlank()) {
      return;
    }
    String[] parts = csv.split(",");
    for (String part : parts) {
      String candidate = normalizeConfiguredModel(part);
      if (!candidate.isEmpty()) {
        collector.add(candidate);
      }
    }
  }

  private String normalizeConfiguredModel(String rawModel) {
    if (rawModel == null) {
      return "";
    }
    String candidate = rawModel.trim();
    if (candidate.isEmpty()) {
      return "";
    }

    String compact = candidate
        .toLowerCase(Locale.ROOT)
        .replace("_", " ")
        .replace("-", " ")
        .replaceAll("\\s+", " ")
        .trim();

    switch (compact) {
      case "gpt 5.4 mini": return "gpt-5.4-mini";
      case "gpt 5 mini": return "gpt-5-mini";
      case "grok code fast 1": return "grok-code-fast-1";
      case "claude haiku 4.5": return "gemini-2.5-flash";
      case "gemini 3 flash": return "gemini-3-flash";
      case "claude sonnet 4.6": return "gemini-2.5-pro";
      case "claude sonnet 4": return "gemini-2.5-pro";
      case "claude sonnet 4.5": return "gemini-2.5-pro";
      case "gpt 5.2": return "gpt-5.2";
      case "gpt 4.1": return "gpt-4.1";
      case "gpt 4o": return "gpt-4o";
      case "claude opus 4.7": return "gemini-2.5-pro";
      case "gemini 3.1 pro": return "gemini-3.1-pro";
      case "gpt 5.2 codex": return "gpt-5.2-codex";
      case "gpt 5.3 codex": return "gpt-5.3-codex";
      case "gpt 5.4": return "gpt-5.4";
      case "gemini 2.5 pro": return "gemini-2.5-pro";
      default:
        return candidate;
    }
  }

  private int modelPriority(String modelName) {
    if (modelName == null || modelName.isBlank()) {
      return 100;
    }
    String normalized = modelName.trim().toLowerCase();
    if (normalized.contains("mini")) {
      return 0;
    }
    if (normalized.contains("4o")) {
      return 1;
    }
    if (normalized.contains("4.1")) {
      return 2;
    }
    return 10;
  }

  private boolean supportsPromptSize(String modelName, int estimatedInputTokens, int maxTokens) {
    if (modelName == null || modelName.isBlank()) {
      return true;
    }
    String normalized = modelName.trim().toLowerCase();
    int estimatedTotalTokens = Math.max(estimatedInputTokens, 0) + Math.max(maxTokens, 0);

    if (normalized.contains("o1-mini") || normalized.contains("o3-mini")) {
      return estimatedInputTokens <= 3200 && estimatedTotalTokens <= 3800;
    }

    // gpt-5-mini variants can reject requests above ~4000 tokens (413 tokens_limit_reached).
    if (normalized.contains("gpt-5-mini") || normalized.contains("gpt-5.4-mini")) {
      return estimatedInputTokens <= 3000 && estimatedTotalTokens <= 3800;
    }

    // grok-code-fast-1 can also reject >~4000 tokens with tokens_limit_reached.
    if (normalized.contains("grok-code-fast-1") || normalized.contains("grok code fast 1")) {
      return estimatedInputTokens <= 3000 && estimatedTotalTokens <= 3800;
    }

    return true;
  }

  private boolean isPayloadTooLargeError(HttpClientErrorException ex) {
    if (ex == null) {
      return false;
    }

    if (ex.getStatusCode().value() == 413) {
      return true;
    }

    String body = String.valueOf(ex.getResponseBodyAsString() == null ? "" : ex.getResponseBodyAsString())
        .toLowerCase(Locale.ROOT);
    return body.contains("tokens_limit_reached")
        || body.contains("payload too large")
        || body.contains("request body too large")
        || body.contains("max size");
  }

  private boolean isUnknownModelError(HttpClientErrorException ex) {
    String body = ex.getResponseBodyAsString();
    if (body == null || body.isBlank()) {
      return false;
    }
    String normalized = body.toLowerCase();
    return normalized.contains("unknown_model") || normalized.contains("unknown model");
  }

  private boolean isDailyQuotaExceeded(HttpClientErrorException.TooManyRequests ex) {
    String body = ex.getResponseBodyAsString();
    if (body == null || body.isBlank()) {
      return false;
    }
    String normalized = body.toLowerCase();
    return normalized.contains("userbymodelbyday")
        || normalized.contains("per 86400s")
        || normalized.contains("daily");
  }

  private void acquirePermit() {
    try {
      requestSemaphore.acquire();
    } catch (InterruptedException ie) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Interrupted while waiting AI queue", ie);
    }
  }

  private synchronized void reserveBudgetBeforeCall(int estimatedTokens) {
    long now = System.currentTimeMillis();
    if (currentWindowStartMs == 0L || now - currentWindowStartMs >= 60000L) {
      currentWindowStartMs = now;
      currentWindowEstimatedTokens = 0;
    }

    long elapsedSinceLast = now - lastRequestAtMs;
    if (elapsedSinceLast < throttleMinIntervalMs) {
      sleepQuietly(throttleMinIntervalMs - elapsedSinceLast);
      now = System.currentTimeMillis();
    }

    if (currentWindowEstimatedTokens + estimatedTokens > Math.max(1000, tpmLimit)) {
      long waitForNextWindow = 60000L - (now - currentWindowStartMs) + 500L;
      if (waitForNextWindow > 0L) {
        log.info("Throttling AI Assistant API requests to respect TPM budget. Waiting {} ms.", waitForNextWindow);
        sleepQuietly(waitForNextWindow);
      }
      currentWindowStartMs = System.currentTimeMillis();
      currentWindowEstimatedTokens = 0;
    }

    currentWindowEstimatedTokens += Math.max(1, estimatedTokens);
    lastRequestAtMs = System.currentTimeMillis();
  }

  private int estimateTokens(String prompt, int maxTokens) {
    int inputTokens;
    if (contextBudgetManager != null && contextBudgetManager.isEnabled()) {
      inputTokens = Math.max(1, contextBudgetManager.countTokens(prompt, model));
    } else {
      inputTokens = Math.max(1, (prompt == null ? 0 : prompt.length()) / 4);
    }
    int outputReserve = Math.max(64, Math.min(1024, maxTokens));
    return inputTokens + outputReserve;
  }

  private long computeRetryWaitMs(int attempt) {
    long base = Math.max(1000L, retryBaseWaitMs);
    long factor = 1L << Math.min(3, Math.max(0, attempt - 1));
    return Math.min(240000L, base * factor);
  }

  private long computeRetryWaitMs(int attempt, HttpClientErrorException.TooManyRequests ex) {
    long exponentialWaitMs = computeRetryWaitMs(attempt);
    long headerSuggestedMs = extractRetryAfterMs(ex);
    if (headerSuggestedMs <= 0L) {
      return exponentialWaitMs;
    }
    return Math.max(exponentialWaitMs, headerSuggestedMs);
  }

  private long extractRetryAfterMs(HttpClientErrorException.TooManyRequests ex) {
    try {
      HttpHeaders headers = ex.getResponseHeaders();
      if (headers == null) {
        return 0L;
      }

      String retryAfterMsHeader = headers.getFirst("x-ms-retry-after-ms");
      if (retryAfterMsHeader != null && !retryAfterMsHeader.isBlank()) {
        long ms = Long.parseLong(retryAfterMsHeader.trim());
        return Math.max(0L, ms + 1000L);
      }

      String retryAfterHeader = headers.getFirst("Retry-After");
      if (retryAfterHeader != null && !retryAfterHeader.isBlank()) {
        String value = retryAfterHeader.trim();
        if (value.matches("^\\d+$")) {
          return Math.max(0L, (Long.parseLong(value) * 1000L) + 1000L);
        }

        ZonedDateTime retryAt = ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME);
        long waitMs = retryAt.toInstant().toEpochMilli() - System.currentTimeMillis();
        return Math.max(0L, waitMs + 1000L);
      }

      String resetEpochHeader = headers.getFirst("x-ratelimit-reset");
      if (resetEpochHeader != null && !resetEpochHeader.isBlank() && resetEpochHeader.matches("^\\d+$")) {
        long resetMs = Long.parseLong(resetEpochHeader.trim()) * 1000L;
        long waitMs = resetMs - System.currentTimeMillis();
        return Math.max(0L, waitMs + 1000L);
      }
    } catch (Exception headerParseEx) {
      log.debug("Unable to parse retry-after headers from AI Assistant API 429: {}", headerParseEx.getMessage());
    }
    return 0L;
  }

  private void sleepQuietly(long ms) {
    long wait = Math.max(0L, ms);
    if (wait == 0L) {
      return;
    }
    try {
      Thread.sleep(wait);
    } catch (InterruptedException ie) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Interrupted while waiting for AI Assistant API retry/throttle", ie);
    }
  }

  private List<String> splitIntoChunks(String text, int maxChunkChars, int overlapChars) {
    List<String> chunks = new ArrayList<>();
    if (text == null || text.isEmpty()) {
      return chunks;
    }
    int safeChunkSize = Math.max(1000, maxChunkChars);
    int safeOverlap = Math.max(0, Math.min(overlapChars, safeChunkSize / 5));
    int start = 0;
    while (start < text.length()) {
      int end = Math.min(start + safeChunkSize, text.length());
      chunks.add(text.substring(start, end));
      if (end >= text.length()) {
        break;
      }
      start = Math.max(end - safeOverlap, start + 1);
    }
    return chunks;
  }

  private String buildChunkSummaryPrompt(int chunkIndex, int totalChunks, String chunk) {
    String safeChunk = trimToMax(String.valueOf(chunk == null ? "" : chunk), Math.max(2000, requestMaxChars - 2500));
    return "Bạn là bộ nén ngữ cảnh cho pipeline map-reduce.\\n"
        + "Nhiệm vụ: tóm tắt CHUNK hiện tại thành dữ liệu ngắn gọn nhưng KHÔNG làm mất thông tin nghiệp vụ quan trọng.\\n"
        + "Bắt buộc xuất JSON hợp lệ theo schema sau:\\n"
        + "{\\n"
        + "  \"chunk_index\": \"k/n\",\\n"
        + "  \"facts\": [\"...\"],\\n"
        + "  \"entities\": [\"...\"],\\n"
        + "  \"critical_ids\": [\"...\"],\\n"
        + "  \"schema_paths\": [\"...\"],\\n"
        + "  \"hard_constraints\": [\"...\"],\\n"
        + "  \"instructions\": [\"...\"],\\n"
        + "  \"jsonExamples\": [\"...\"],\\n"
        + "  \"notes\": [\"...\"]\\n"
        + "}\\n"
        + "Giữ nguyên field name, schema, rule, id, điều kiện lọc và giá trị mặc định nếu có.\\n"
        + "Nếu có thay đổi menu/config, liệt kê rõ node/field nào bị tác động trong critical_ids và schema_paths.\\n"
        + "Không trả markdown hoặc văn bản ngoài JSON.\\n"
        + "CHUNK_INDEX=" + (chunkIndex + 1) + "/" + Math.max(1, totalChunks) + "\\n"
        + "<CHUNK>\\n"
        + safeChunk
        + "\\n</CHUNK>";
  }

  private ResponseEntity<String> tryRecoverFromUnauthorized(
      String endpoint,
      HttpEntity<Map<String, Object>> request,
      ResponseEntity<String> unauthorizedResponse) {
    HttpHeaders sourceHeaders = request.getHeaders() == null ? new HttpHeaders() : request.getHeaders();
    String currentAuth = sourceHeaders.getFirst(HttpHeaders.AUTHORIZATION);

    LinkedHashSet<String> endpoints = new LinkedHashSet<>();
    endpoints.add(endpoint);
    String fallbackEndpoint = resolveUnauthorizedFallbackChatEndpoint(endpoint);
    if (fallbackEndpoint != null && !fallbackEndpoint.isBlank()) {
      endpoints.add(fallbackEndpoint);
    }

    ResponseEntity<String> lastResponse = unauthorizedResponse;
    for (String targetEndpoint : endpoints) {
      LinkedHashSet<String> authCandidates = buildUnauthorizedAuthCandidates(targetEndpoint, currentAuth);
      for (String authHeader : authCandidates) {
        if ((targetEndpoint.equals(endpoint)) && authHeader.equals(currentAuth)) {
          continue;
        }

        HttpHeaders retryHeaders = new HttpHeaders();
        if (sourceHeaders != null) {
          sourceHeaders.forEach((k, v) -> {
            if (!HttpHeaders.AUTHORIZATION.equalsIgnoreCase(k)) {
              retryHeaders.put(k, new ArrayList<>(v));
            }
          });
        }
        retryHeaders.set(HttpHeaders.AUTHORIZATION, authHeader);

        HttpEntity<Map<String, Object>> retryRequest = new HttpEntity<>(request.getBody(), retryHeaders);
        ResponseEntity<String> retryResponse = executeInferencePost(targetEndpoint, retryRequest);
        if (retryResponse != null && !retryResponse.getStatusCode().isError()) {
          log.warn("Recovered AI Assistant API 401 via fallback auth strategy: endpoint='{}' auth='{}'",
              targetEndpoint,
              authHeader.toLowerCase(Locale.ROOT).startsWith("github-bearer ") ? "github-bearer" : "bearer");
          return retryResponse;
        }
        if (retryResponse != null) {
          lastResponse = retryResponse;
        }
      }
    }
    return lastResponse;
  }

  private LinkedHashSet<String> buildUnauthorizedAuthCandidates(String endpoint, String currentAuth) {
    LinkedHashSet<String> authCandidates = new LinkedHashSet<>();

    addAuthCandidate(authCandidates, currentAuth);

    String apiToken = getApiToken();
    addAuthVariantsForToken(authCandidates, apiToken);
    return authCandidates;
  }

  private void addAuthVariantsForToken(Set<String> collector, String tokenValue) {
    String token = String.valueOf(tokenValue == null ? "" : tokenValue).trim();
    if (collector == null || token.isBlank()) {
      return;
    }
    collector.add("Bearer " + token);
  }

  private void addAuthCandidate(Set<String> collector, String candidate) {
    String value = String.valueOf(candidate == null ? "" : candidate).trim();
    if (collector == null || value.isBlank()) {
      return;
    }
    collector.add(value);
  }

  private String resolveUnauthorizedFallbackChatEndpoint(String endpoint) {
    String configured = normalizeChatCompletionsEndpoint(chatFallbackUrl);
    if (!configured.isBlank() && !configured.equalsIgnoreCase(endpoint)) {
      return configured;
    }

    String normalized = normalizeChatCompletionsEndpoint(endpoint);
    String lower = normalized.toLowerCase(Locale.ROOT);
    if (lower.contains("models.inference.ai.azure.com")) {
      return normalized.replace("models.inference.ai.azure.com", "models.github.ai/inference");
    }
    if (lower.contains("models.github.ai/inference")) {
      return normalized.replace("models.github.ai/inference", "models.inference.ai.azure.com");
    }
    return "";
  }

  private HttpClientErrorException createHttpClientError(String message, ResponseEntity<String> response) {
    return HttpClientErrorException.create(
        response.getStatusCode(),
        message,
        response.getHeaders(),
        String.valueOf(response.getBody() == null ? "" : response.getBody()).getBytes(StandardCharsets.UTF_8),
        StandardCharsets.UTF_8);
  }

  private String buildMergedPrompt(String taskHint, List<String> chunkSummaries, String globalAnchors) {
    StringBuilder sb = new StringBuilder();
    sb.append("Bạn sẽ giải bài toán từ mô tả nhiệm vụ và các tóm tắt chunk đã nén.\\n");
    sb.append("Bắt buộc giữ đầy đủ ràng buộc, schema, field name và logic nghiệp vụ.\\n");
    sb.append("Nếu yêu cầu gốc đòi output JSON thì chỉ trả JSON hợp lệ, không markdown.\\n\\n");
    if (globalAnchors != null && !globalAnchors.isBlank()) {
      sb.append("=== GLOBAL ANCHORS (khong duoc bo sot) ===\\n");
      sb.append(globalAnchors).append("\\n\\n");
    }
    sb.append("=== MO TA NHIEM VU (RUT GON) ===\\n");
    sb.append(taskHint);
    sb.append("\\n\\n=== TOM TAT CAC CHUNK ===\\n");
    int perChunkSummaryCap = Math.max(2600, Math.min(8000, Math.max(3000, requestMaxChars / 3)));
    for (int i = 0; i < chunkSummaries.size(); i++) {
      sb.append("[CHUNK ").append(i + 1).append("]\\n");
      sb.append(trimToMax(chunkSummaries.get(i), perChunkSummaryCap)).append("\\n\\n");
    }
    return trimToMax(sb.toString(), requestMaxChars - 500);
  }

  private String buildGlobalContextAnchors(String prompt, List<String> chunks, List<?> baseMenu, String taskHint) {
    String source = String.valueOf(prompt == null ? "" : prompt);
    int sourceCap = Math.min(source.length(), Math.max(120000, requestMaxChars / 2));
    String scan = source.substring(0, sourceCap);

    Map<String, Integer> keyFreq = new HashMap<>();
    Matcher keyMatcher = Pattern.compile("\\\"([A-Za-z0-9_\\-]{2,64})\\\"\\s*:").matcher(scan);
    while (keyMatcher.find()) {
      String key = String.valueOf(keyMatcher.group(1) == null ? "" : keyMatcher.group(1)).trim();
      if (key.isEmpty()) {
        continue;
      }
      keyFreq.put(key, keyFreq.getOrDefault(key, 0) + 1);
    }

    List<Map.Entry<String, Integer>> keyEntries = new ArrayList<>(keyFreq.entrySet());
    keyEntries.sort((a, b) -> Integer.compare(b.getValue(), a.getValue()));

    StringBuilder sb = new StringBuilder();
    sb.append("task_hint=").append(trimToMax(String.valueOf(taskHint == null ? "" : taskHint), 1000)).append("\\n");
    sb.append("chunk_count=").append(chunks == null ? 0 : chunks.size()).append("\\n");
    if (baseMenu != null && !baseMenu.isEmpty()) {
      sb.append("base_menu_present=true\\n");
      sb.append("base_menu_items=").append(baseMenu.size()).append("\\n");
    } else {
      sb.append("base_menu_present=false\\n");
    }
    sb.append("top_json_keys=\\n");
    int limit = Math.min(80, keyEntries.size());
    for (int i = 0; i < limit; i++) {
      Map.Entry<String, Integer> e = keyEntries.get(i);
      sb.append("- ").append(e.getKey()).append(" (count=").append(e.getValue()).append(")\\n");
    }
    return trimToMax(sb.toString(), Math.max(4000, requestMaxChars / 3));
  }

  private List<String> reduceSummaries(List<String> summaries, ProgressListener progressListener) {
    List<String> current = new ArrayList<>(summaries);
    int level = 1;

    while (current.size() > 1 && totalLength(current) > Math.max(8000, requestMaxChars - 3000)) {
      List<String> next = new ArrayList<>();
      List<String> batch = new ArrayList<>();
      int batchChars = 0;
      int maxBatchChars = Math.max(10000, requestMaxChars - 4000);
      int maxBatchItems = Math.max(2, mergeBatchSize);
      int completedBatches = 0;
      int estimatedBatchTotal = Math.max(1, (int) Math.ceil((double) current.size() / maxBatchItems));
      int perItemSummaryCap = Math.max(2600, Math.min(8000, Math.max(3000, requestMaxChars / 3)));

      for (String item : current) {
        String safeItem = trimToMax(item, perItemSummaryCap);
        int itemLen = safeItem.length();
        boolean wouldOverflowChars = batchChars + itemLen > maxBatchChars;
        boolean wouldOverflowItems = batch.size() >= maxBatchItems;

        if (!batch.isEmpty() && (wouldOverflowChars || wouldOverflowItems)) {
          completedBatches++;
            emitProgress(progressListener, progressPayload("reducing", "Đang gộp summary level " + level, completedBatches - 1, estimatedBatchTotal,
              progressI18n("copilot.progress.message.reducing_level", Map.of("level", level), null, null)));
          next.add(mergeSummaryBatch(batch, level, progressListener, completedBatches, estimatedBatchTotal));
          batch.clear();
          batchChars = 0;
        }

        batch.add(safeItem);
        batchChars += itemLen;
      }

      if (!batch.isEmpty()) {
        completedBatches++;
        emitProgress(progressListener, progressPayload("reducing", "Đang gộp summary level " + level, completedBatches - 1, estimatedBatchTotal,
          progressI18n("copilot.progress.message.reducing_level", Map.of("level", level), null, null)));
        next.add(mergeSummaryBatch(batch, level, progressListener, completedBatches, estimatedBatchTotal));
      }

      current = next;
      level++;
      if (level > 10) {
        break;
      }
    }

    return current;
  }

  private String mergeSummaryBatch(List<String> batch, int level, ProgressListener progressListener, int batchIndex, int batchTotal) {
    String prompt = buildSummaryMergePrompt(batch, level);
    String raw = callChatCompletion(prompt, chunkSummaryMaxTokens, chunkSummaryTemperature, progressListener,
        progressPayload("reducing", "Đang gộp summary level " + level + " (" + batchIndex + "/" + batchTotal + ")",
        batchIndex, batchTotal,
        progressI18n("copilot.progress.message.reducing_level_batch",
          Map.of("level", level, "batchIndex", batchIndex, "batchTotal", batchTotal), null, null)));
    if (raw == null || raw.isBlank()) {
      throw new IllegalStateException("Merge batch summary trả về rỗng ở level " + level);
    }
    String content = extractContentSafely(raw);
    if (content == null || content.isBlank()) {
      throw new IllegalStateException("Không trích xuất được merge summary ở level " + level);
    }
    int mergeResultCap = Math.max(2600, Math.min(9000, Math.max(3500, requestMaxChars / 2)));
    return trimToMax(content.trim(), mergeResultCap);
  }

  private String buildSummaryMergePrompt(List<String> batch, int level) {
    StringBuilder sb = new StringBuilder();
    sb.append("Bạn hãy gộp các summary thành 1 summary ngắn gọn, không mất ràng buộc quan trọng.\\n");
    sb.append("Output chỉ JSON hợp lệ; ưu tiên giữ đủ các facts/constraints/fields quan trọng.\\n");
    sb.append("Schema: {\"level\":").append(level)
        .append(",\"facts\":[],\"constraints\":[],\"fields\":[],\"critical_ids\":[],\"schema_paths\":[]}\\n");
    sb.append("=== INPUT SUMMARIES ===\\n");
    int perSummaryCap = Math.max(2600, Math.min(8000, Math.max(3000, requestMaxChars / 3)));
    for (int i = 0; i < batch.size(); i++) {
      sb.append("[S").append(i + 1).append("] ").append(trimToMax(batch.get(i), perSummaryCap)).append("\\n");
    }
    return trimToMax(sb.toString(), requestMaxChars - 500);
  }

  private String buildTaskHint(String originalPrompt) {
    String head = trimToMax(originalPrompt == null ? "" : originalPrompt.trim(), taskHintMaxChars);
    if (originalPrompt != null && originalPrompt.length() > taskHintMaxChars) {
      return head + "\\n... [TRUNCATED_TASK_HINT]";
    }
    return head;
  }

  private int totalLength(List<String> items) {
    int n = 0;
    for (String s : items) {
      if (s != null) {
        n += s.length();
      }
    }
    return n;
  }

  private String trimToMax(String text, int maxChars) {
    if (text == null) {
      return "";
    }
    if (maxChars <= 0 || text.length() <= maxChars) {
      return text;
    }

    int markerLen = 30;
    if (maxChars <= markerLen + 10) {
      return text.substring(0, maxChars);
    }

    int keepHead = Math.max(1, (int) Math.floor(maxChars * 0.65));
    int keepTail = Math.max(1, maxChars - keepHead - markerLen);
    if (keepHead + keepTail + markerLen > maxChars) {
      keepTail = Math.max(1, maxChars - keepHead - markerLen);
    }

    String head = text.substring(0, keepHead).trim();
    String tail = text.substring(Math.max(0, text.length() - keepTail)).trim();
    return head + "\\n...[TRUNCATED_FOR_BUDGET]...\\n" + tail;
  }

  private String extractContentSafely(String rawBody) {
    try {
      return extractContent(rawBody);
    } catch (Exception e) {
      return null;
    }
  }

  private void emitProgress(ProgressListener progressListener, Map<String, Object> progress) {
    if (progressListener == null || progress == null) {
      return;
    }
    try {
      progressListener.onProgress(progress);
    } catch (Exception ignored) {
      // Progress callback must never break AI execution.
    }
  }

  private Map<String, Object> progressPayload(String stage, String message, int current, int total,
      Map<String, Object> extra) {
    Map<String, Object> payload = new HashMap<>();
    payload.put("stage", stage);
    payload.put("message", message);
    payload.put("current", Math.max(0, current));
    payload.put("total", Math.max(1, total));
    int safeTotal = Math.max(1, total);
    int safeCurrent = Math.max(0, Math.min(current, safeTotal));
    payload.put("percent", Math.max(0, Math.min(100, (int) Math.round((safeCurrent * 100.0) / safeTotal))));
    if (extra != null && !extra.isEmpty()) {
      payload.putAll(extra);
    }
    return payload;
  }

  private Map<String, Object> withOrchestrationMeta(String stage, int current, int total, Map<String, Object> extra) {
    Map<String, Object> merged = new HashMap<>();
    if (extra != null && !extra.isEmpty()) {
      merged.putAll(extra);
    }
    merged.put("orchestrationPhaseKey", resolveOrchestrationPhaseKey(stage));
    merged.put("orchestrationPhase", resolveOrchestrationPhase(stage));
    merged.put("overallPercent", computeOverallPercent(stage, current, total));
    return merged;
  }

  private Map<String, Object> progressI18n(String messageKey, Map<String, Object> messageArgs,
      String detailKey, Map<String, Object> detailArgs) {
    Map<String, Object> meta = new HashMap<>();
    if (messageKey != null && !messageKey.isBlank()) {
      meta.put("messageKey", messageKey);
    }
    if (messageArgs != null && !messageArgs.isEmpty()) {
      meta.put("messageArgs", messageArgs);
    }
    if (detailKey != null && !detailKey.isBlank()) {
      meta.put("detailKey", detailKey);
    }
    if (detailArgs != null && !detailArgs.isEmpty()) {
      meta.put("detailArgs", detailArgs);
    }
    return meta;
  }

  private String resolveOrchestrationPhaseKey(String stage) {
    String normalized = String.valueOf(stage == null ? "" : stage).trim().toLowerCase();
    return switch (normalized) {
      case "preparing" -> "copilot.progress.phase.preparing";
      case "chunking" -> "copilot.progress.phase.chunking";
      case "reducing" -> "copilot.progress.phase.reducing";
      case "final_merge" -> "copilot.progress.phase.final_reasoning";
      case "streaming" -> "copilot.progress.phase.streaming";
      case "completed", "complete" -> "copilot.progress.phase.completed";
      case "error" -> "copilot.progress.phase.error";
      default -> "copilot.progress.phase.running";
    };
  }

  private String resolveOrchestrationPhase(String stage) {
    String normalized = String.valueOf(stage == null ? "" : stage).trim().toLowerCase();
    return switch (normalized) {
      case "preparing" -> "Preparing";
      case "chunking" -> "Chunking";
      case "reducing" -> "Reducing";
      case "final_merge" -> "Final Reasoning";
      case "streaming" -> "Streaming";
      case "completed", "complete" -> "Completed";
      case "error" -> "Error";
      default -> normalized.isEmpty() ? "Running" : normalized;
    };
  }

  private int computeOverallPercent(String stage, int current, int total) {
    int safeTotal = Math.max(1, total);
    int safeCurrent = Math.max(0, Math.min(current, safeTotal));
    double ratio = Math.max(0.0d, Math.min(1.0d, safeCurrent / (double) safeTotal));
    String normalized = String.valueOf(stage == null ? "" : stage).trim().toLowerCase();
    return switch (normalized) {
      case "preparing" -> 5;
      case "chunking" -> Math.max(10, Math.min(74, 10 + (int) Math.round(ratio * 64.0d)));
      case "reducing" -> Math.max(75, Math.min(89, 75 + (int) Math.round(ratio * 14.0d)));
      case "final_merge" -> Math.max(90, Math.min(99, 90 + (int) Math.round(ratio * 9.0d)));
      case "completed", "complete" -> 100;
      case "error" -> Math.max(0, Math.min(99, 10 + (int) Math.round(ratio * 80.0d)));
      default -> Math.max(0, Math.min(100, (int) Math.round(ratio * 100.0d)));
    };
  }

  private Map<String, Object> mergeProgress(Map<String, Object> base, Map<String, Object> patch) {
    Map<String, Object> merged = new HashMap<>();
    if (base != null) {
      merged.putAll(base);
    }
    if (patch != null) {
      merged.putAll(patch);
    }
    Object currentObj = merged.get("current");
    Object totalObj = merged.get("total");
    if (currentObj instanceof Number && totalObj instanceof Number) {
      int current = ((Number) currentObj).intValue();
      int total = Math.max(1, ((Number) totalObj).intValue());
      merged.put("percent", Math.max(0, Math.min(100, (int) Math.round((Math.min(current, total) * 100.0) / total))));
    }
    return merged;
  }

  // ── 3-Scenario Context Injection ──────────────────────────────────────────

  /**
   * Supported operation scenarios matching frontend OperationScenario type.
   */
  private enum AiMenuOperationScenario {
    NEW_BUILD,
    INCREMENTAL_UPDATE,
    PROPERTY_EDIT,
    UNKNOWN
  }

  /**
   * Detect the operation_scenario from the prompt JSON payload.
   * Returns UNKNOWN if not a menu-design prompt or field is absent.
   */
  private AiMenuOperationScenario extractOperationScenario(String prompt) {
    if (prompt == null || prompt.isBlank()) return AiMenuOperationScenario.UNKNOWN;
    // Fast pre-check: must contain the field to bother parsing
    if (!prompt.contains("operation_scenario")) return AiMenuOperationScenario.UNKNOWN;

    try {
      // The prompt may be a large JSON – parse only the top-level to find operation_scenario
      @SuppressWarnings("unchecked")
      Map<String, Object> root = objectMapper.readValue(prompt.trim(), Map.class);
      Object raw = root.get("operation_scenario");
      if (raw == null) return AiMenuOperationScenario.UNKNOWN;
      String value = String.valueOf(raw).toLowerCase().trim();
      return switch (value) {
        case "new_build" -> AiMenuOperationScenario.NEW_BUILD;
        case "incremental_update" -> AiMenuOperationScenario.INCREMENTAL_UPDATE;
        case "property_edit" -> AiMenuOperationScenario.PROPERTY_EDIT;
        default -> AiMenuOperationScenario.UNKNOWN;
      };
    } catch (Exception e) {
      log.debug("Could not parse operation_scenario from prompt: {}", e.getMessage());
      return AiMenuOperationScenario.UNKNOWN;
    }
  }

  /**
   * Build a scenario-specific guardrail block to inject between master prompt and dynamic context.
   * Returns null/empty when no scenario-specific guardrail is needed.
   */
  private String buildScenarioContext(String prompt) {
    AiMenuOperationScenario scenario = extractOperationScenario(prompt);
    return switch (scenario) {
      case NEW_BUILD -> """
          ## ACTIVE SCENARIO: NEW_BUILD
          You are designing a COMPLETE menu tree from scratch.
          MANDATORY RULES:
          - Analyze the business requirement thoroughly and create ALL necessary modules.
          - Every functional menu node MUST have: type_form, table_name (for type 1/2/6), and table fields.
          - Group menus logically: top-level nodes are type_form=0 groups; leaf nodes are functional (type 1/2/3/4/6).
          - Return COMPLETE menu JSON in the envelope: { "menu": [...], "notes": [], "warnings": [], "coverage_modules": [], "coverage_tables": [] }
          - Do NOT truncate or summarize. Output the full tree.
          """;
      case INCREMENTAL_UPDATE -> """
          ## ACTIVE SCENARIO: INCREMENTAL_UPDATE
          You are performing a PARTIAL UPDATE on an EXISTING menu tree.
          MANDATORY RULES (VIOLATION = INVALID RESPONSE):
          1. Return THE ENTIRE menu tree including ALL existing nodes you did NOT change.
          2. NEVER omit, truncate, or summarize nodes that are not affected by the change request.
          3. Only ADD new nodes, EDIT specified nodes, or MARK for deletion nodes explicitly requested.
          4. Preserve all existing: id, parentId, menu_id, path, type_form, table_name, trigger.
          5. For any NEW node added: must include complete table fields and type_form.
          6. Return format: { "menu": [FULL_TREE], "notes": [...], "warnings": [...] }
          7. If current_menu_full_json is present in the payload, use it as the authoritative base.
          8. DO NOT collapse the menu tree to a subset. Keep unchanged branches exactly as-is.
          9. If request does not explicitly ask for bulk deletion, keep nearly all existing nodes and only patch targets.
          10. Never return a single-module tree when input contains multi-module structure.
          """;
      case PROPERTY_EDIT -> """
          ## ACTIVE SCENARIO: PROPERTY_EDIT
          You are editing ONLY the specified properties of ONE specific menu node.
          MANDATORY RULES (VIOLATION = INVALID RESPONSE):
          1. Return ONLY the modified node object under key "menu_node".
          2. Keep UNCHANGED: id, parentId, menu_id, and any fields not explicitly mentioned in the request.
          3. For table fields: preserve all existing fields; only add/modify what is requested.
          4. For trigger: preserve all existing trigger functions; only add/modify what is requested.
          5. Return format: { "menu_node": { ...modified_node... }, "notes": [...], "warnings": [...] }
          6. Do NOT return a menu array. Return only the single node object.
          """;
      default -> null;
    };
  }

  private String createSuccessJson(Object result, String mode, Map<String, Object> metadata) {
    try {
      Map<String, Object> ok = new HashMap<>();
      ok.put("success", true);
      ok.put("provider", localOnlyEnabled ? "local_provider" : "GitHubModels");
      ok.put("mode", mode);
      ok.put("result", result);
      if (metadata != null && !metadata.isEmpty()) {
        ok.put("metadata", metadata);
      }
      ok.put("timestamp", System.currentTimeMillis());
      return objectMapper.writeValueAsString(ok);
    } catch (Exception e) {
      return "{\"success\":false,\"errorCode\":\"JSON_ERROR\",\"message\":\"Lỗi tạo response\"}";
    }
  }

  private String extractContent(String rawBody) throws Exception {
    @SuppressWarnings("unchecked")
    Map<String, Object> payload = objectMapper.readValue(rawBody, Map.class);

    // OpenAI/AI Assistant Responses API format
    Object outputObj = payload.get("output");
    if (outputObj instanceof List<?> outputList && !outputList.isEmpty()) {
      StringBuilder sb = new StringBuilder();
      for (Object itemObj : outputList) {
        if (!(itemObj instanceof Map<?, ?> itemMap)) {
          continue;
        }
        Object contentObj = itemMap.get("content");
        if (!(contentObj instanceof List<?> contentList)) {
          continue;
        }
        for (Object partObj : contentList) {
          if (!(partObj instanceof Map<?, ?> partMap)) {
            continue;
          }
          Object textObj = partMap.get("text");
          if (textObj != null) {
            if (sb.length() > 0) sb.append("\n");
            sb.append(String.valueOf(textObj));
          }
        }
      }
      if (sb.length() > 0) {
        return sb.toString();
      }
    }

    Object outputTextObj = payload.get("output_text");
    if (outputTextObj != null && !String.valueOf(outputTextObj).isBlank()) {
      return String.valueOf(outputTextObj);
    }

    // Chat Completions format
    Object choicesObj = payload.get("choices");
    if (!(choicesObj instanceof List<?> choices) || choices.isEmpty()) {
      return null;
    }
    Object first = choices.get(0);
    if (!(first instanceof Map<?, ?> firstMap)) {
      return null;
    }
    Object messageObj = firstMap.get("message");
    if (!(messageObj instanceof Map<?, ?> messageMap)) {
      return null;
    }
    Object contentObj = messageMap.get("content");
    return contentObj == null ? null : String.valueOf(contentObj);
  }

  private String wrapTextAsChatCompletionsJson(String text) {
    try {
      Map<String, Object> message = new LinkedHashMap<>();
      message.put("role", "assistant");
      message.put("content", text == null ? "" : text);

      Map<String, Object> choice = new LinkedHashMap<>();
      choice.put("index", 0);
      choice.put("message", message);
      choice.put("finish_reason", "stop");

      Map<String, Object> payload = new LinkedHashMap<>();
      payload.put("id", "local-compat-" + System.currentTimeMillis());
      payload.put("object", "chat.completion");
      payload.put("created", System.currentTimeMillis() / 1000L);
      payload.put("model", "local_provider");
      payload.put("provider", "local_provider");
      payload.put("choices", List.of(choice));

      return objectMapper.writeValueAsString(payload);
    } catch (Exception ex) {
      return "{\"choices\":[{\"message\":{\"content\":\"\"}}]}";
    }
  }

  private Object tryParseJson(String text) {
    if (text == null) return null;
    String cleaned = text.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.substring(7).trim();
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.substring(3).trim();
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.substring(0, cleaned.length() - 3).trim();
    }

    try {
      return objectMapper.readValue(cleaned, Object.class);
    } catch (Exception ignored) {
      return null;
    }
  }

  private Object ensureValidMenuFinalResult(
      Object currentResult,
      String rawContent,
      AiMenuOperationScenario scenario,
      ProgressListener progressListener,
      Map<String, Object> progressMeta) {
    if (isValidMenuResultShape(currentResult, scenario) && !isClearlyCodeLikeMenuOutput(currentResult)) {
      return currentResult;
    }

    if (rawContent == null || rawContent.isBlank()) {
      return null;
    }

    try {
      Map<String, Object> repairMeta = new HashMap<>();
      if (progressMeta != null) {
        repairMeta.putAll(progressMeta);
      }
      repairMeta.put("detail", "Dang chuan hoa ket qua cuoi sang JSON menu hop le");
      repairMeta.put("detailKey", "copilot.progress.detail.normalizing_final_output");
      emitProgress(progressListener, progressPayload("final_merge", "Đang chuẩn hóa kết quả cuối", 1, 1,
          mergeProgress(progressI18n("copilot.progress.message.final_waiting", null, null, null),
              withOrchestrationMeta("final_merge", 1, 1, repairMeta))));

      String repairPrompt = buildMenuFinalRepairPrompt(rawContent, scenario);
      String repairedRaw = callChatCompletion(repairPrompt, Math.min(4096, maxOutputTokens), 0.0d, progressListener, repairMeta);
      String repairedContent = extractContent(repairedRaw);
      Object repairedParsed = tryParseJson(repairedContent);
      if (isValidMenuResultShape(repairedParsed, scenario) && !isClearlyCodeLikeMenuOutput(repairedParsed)) {
        return repairedParsed;
      }
    } catch (Exception ex) {
      log.warn("Could not repair invalid final menu output: {}", ex.getMessage());
    }
    return null;
  }

  private String buildMenuFinalRepairPrompt(String rawContent, AiMenuOperationScenario scenario) {
    String expected = scenario == AiMenuOperationScenario.PROPERTY_EDIT
        ? "{\"menu_node\":{...},\"notes\":[...],\"warnings\":[...]}"
        : "{\"menu\":[...],\"notes\":[...],\"warnings\":[...]}";
    return "Bạn là bộ chuẩn hóa output JSON cho menu.\\n"
        + "Nhiệm vụ: CHUYỂN nội dung bên dưới thành JSON hợp lệ duy nhất, không markdown, không text giải thích.\\n"
        + "Schema bắt buộc: " + expected + "\\n"
        + "Giữ nguyên ý nghĩa nghiệp vụ từ nội dung đầu vào.\\n"
        + "Nếu thiếu thông tin thì trả object tối thiểu theo schema với mảng rỗng.\\n"
        + "OUTPUT: chỉ JSON.\\n\\n"
        + "INPUT_RAW:\\n"
        + trimToMax(String.valueOf(rawContent == null ? "" : rawContent), Math.max(2000, requestMaxChars - 3000));
  }

  private boolean isValidMenuResultShape(Object parsed, AiMenuOperationScenario scenario) {
    if (parsed == null) {
      return false;
    }
    if (scenario != null && scenario == AiMenuOperationScenario.PROPERTY_EDIT) {
      if (parsed instanceof Map<?, ?> map) {
        Object menuNode = map.get("menu_node");
        return menuNode instanceof Map<?, ?>;
      }
      return false;
    }

    if (parsed instanceof List<?> list) {
      return !list.isEmpty();
    }
    if (parsed instanceof Map<?, ?> map) {
      Object menuObj = map.get("menu");
      if (menuObj instanceof List<?> menuList) {
        return !menuList.isEmpty();
      }
    }
    return false;
  }

  private boolean isClearlyCodeLikeMenuOutput(Object parsed) {
    String text = String.valueOf(parsed == null ? "" : parsed).toLowerCase(Locale.ROOT);
    if (text.isBlank()) {
      return false;
    }
    return text.contains("```python")
        || text.contains("import json")
        || text.contains("def ")
        || text.contains("chunk_index")
        || text.contains("print(");
  }

  private String createErrorJson(String message, String errorCode) {
    try {
      Map<String, Object> err = new HashMap<>();
      err.put("success", false);
      err.put("errorCode", errorCode);
      err.put("message", message);
      err.put("provider", "GitHubModels");
      err.put("timestamp", System.currentTimeMillis());
      return objectMapper.writeValueAsString(err);
    } catch (Exception e) {
      return "{\"success\":false,\"errorCode\":\"JSON_ERROR\",\"message\":\"Lỗi tạo response\"}";
    }
  }
}
