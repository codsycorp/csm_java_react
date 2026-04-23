package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Collections;
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


/**
 * Fallback service for oversized prompts routed to GitHub Models API.
 * Returns JSON wrapper compatible with existing /ai-generate-seo-content parsing flow.
 */
@Service
public class GitHubModelsService {

  // Cached master prompt content
  private volatile String masterPrompt = null;

  // Path to master prompt file, configurable via application.properties
  @Value("${github.models.master-prompt-path:classpath:csm_datas/public/ai_menu_master_prompt.md}")
  private String masterPromptPath;

  // Directory where per-app AI context files are stored
  @Value("${github.models.context-dir:csm_datas/public}")
  private String contextDir;

  // Max chars to keep in the request history inside the context file
  private static final int CTX_MAX_HISTORY_CHARS = 8000;
  // Max chars to keep for previous result summary inside the context file
  private static final int CTX_MAX_RESULT_CHARS = 6000;
  // Max chars to keep for Copilot conversation continuity memory
  private static final int COPILOT_MEMORY_MAX_CHARS = 180000;
  private static final int COPILOT_PENDING_MAX_ITEMS = 12;

  // ───────────────────────────────────────────────────────────────────────────
  // Per-app AI session context file  (mirrors Copilot's /memories/session/)
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

  /** Return Copilot continuity memory file path for a given appId and optional scope key. */
  private java.io.File getCopilotMemoryFile(String appId, String scopeKey) {
    String safeName = sanitizeAppName(appId);
    String safeScope = scopeKey == null ? "" : scopeKey.replaceAll("[^a-zA-Z0-9_\\-]", "_");
    if (safeScope.isBlank()) {
      return new java.io.File(contextDir, "ai_copilot_context_" + safeName + ".md");
    }
    return new java.io.File(contextDir, "ai_copilot_context_" + safeName + "__" + safeScope + ".md");
  }

  /** Return Copilot pending-questions file path for a given appId and optional scope key. */
  private java.io.File getCopilotPendingFile(String appId, String scopeKey) {
    String safeName = sanitizeAppName(appId);
    String safeScope = scopeKey == null ? "" : scopeKey.replaceAll("[^a-zA-Z0-9_\\-]", "_");
    if (safeScope.isBlank()) {
      return new java.io.File(contextDir, "ai_copilot_pending_" + safeName + ".md");
    }
    return new java.io.File(contextDir, "ai_copilot_pending_" + safeName + "__" + safeScope + ".md");
  }

  /** Load unresolved pending questions for Copilot continuation. */
  public List<String> loadCopilotPendingQuestions(String appId, String scopeKey, int maxItems) {
    if (appId == null || appId.isBlank()) return Collections.emptyList();
    java.io.File f = getCopilotPendingFile(appId, scopeKey);
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
      log.warn("Could not load Copilot pending questions for appId={} scope={}: {}", appId, scopeKey, e.getMessage());
      return Collections.emptyList();
    }
  }

  /** Load persisted Copilot conversation memory for continuity across turns. */
  public String loadCopilotConversationMemory(String appId) {
    return loadCopilotConversationMemory(appId, null);
  }

  /** Load persisted Copilot conversation memory for continuity across turns. */
  public String loadCopilotConversationMemory(String appId, String scopeKey) {
    if (appId == null || appId.isBlank()) return "";
    java.io.File f = getCopilotMemoryFile(appId, scopeKey);
    if (!f.exists()) return "";
    try {
      String text = java.nio.file.Files.readString(f.toPath(), StandardCharsets.UTF_8);
      if (text == null) return "";
      if (text.length() <= COPILOT_MEMORY_MAX_CHARS) return text;
      return text.substring(text.length() - COPILOT_MEMORY_MAX_CHARS);
    } catch (Exception e) {
      log.warn("Could not load Copilot continuity memory for appId={} scope={}: {}", appId, scopeKey, e.getMessage());
      return "";
    }
  }

  /** Append one Copilot Q&A turn so later requests continue instead of restarting. */
  public void appendCopilotConversationTurn(
      String appId,
      String userMessage,
      String assistantMessage,
      String contextType,
      String responseMode,
      List<Map<String, Object>> attachments) {
    appendCopilotConversationTurn(appId, null, userMessage, assistantMessage, contextType, responseMode, attachments);
  }

  /** Append one Copilot Q&A turn with a scoped continuity key. */
  public void appendCopilotConversationTurn(
      String appId,
      String scopeKey,
      String userMessage,
      String assistantMessage,
      String contextType,
      String responseMode,
      List<Map<String, Object>> attachments) {
    if (appId == null || appId.isBlank()) return;
    try {
      String existing = loadCopilotConversationMemory(appId, scopeKey);
      String now = java.time.LocalDateTime.now()
          .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

      int attachmentCount = attachments == null ? 0 : attachments.size();
      String turn = "\n\n### Turn @ " + now + "\n"
          + "context_type=" + String.valueOf(contextType == null ? "" : contextType).trim() + "\n"
          + "response_mode=" + String.valueOf(responseMode == null ? "" : responseMode).trim() + "\n"
          + "attachment_count=" + attachmentCount + "\n\n"
          + "User:\n" + trimToMax(String.valueOf(userMessage == null ? "" : userMessage).trim(), 20000) + "\n\n"
          + "Assistant:\n" + trimToMax(String.valueOf(assistantMessage == null ? "" : assistantMessage).trim(), 45000);

      String merged;
      if (existing == null || existing.isBlank()) {
        merged = "# Copilot Conversation Continuity: app_id=" + appId + "\n"
            + (scopeKey == null || scopeKey.isBlank() ? "" : "scope_key=" + scopeKey + "\n")
            + "<!-- AUTO-GENERATED by GitHubModelsService -->\n"
            + turn;
      } else {
        merged = existing.trim() + turn;
      }

      if (merged.length() > COPILOT_MEMORY_MAX_CHARS) {
        merged = merged.substring(merged.length() - COPILOT_MEMORY_MAX_CHARS);
      }

      java.io.File f = getCopilotMemoryFile(appId, scopeKey);
      f.getParentFile().mkdirs();
      java.nio.file.Files.writeString(f.toPath(), merged, StandardCharsets.UTF_8);
      updateCopilotPendingQuestions(appId, scopeKey, userMessage, assistantMessage);
    } catch (Exception e) {
      log.warn("Could not append Copilot continuity memory for appId={} scope={}: {}", appId, scopeKey, e.getMessage());
    }
  }

  private void updateCopilotPendingQuestions(
      String appId,
      String scopeKey,
      String userMessage,
      String assistantMessage) {
    try {
      List<String> existing = new ArrayList<>(loadCopilotPendingQuestions(appId, scopeKey, COPILOT_PENDING_MAX_ITEMS));

      // If user replies in this scoped thread, assume the oldest pending item has been addressed.
      if (userMessage != null && !userMessage.trim().isEmpty() && !existing.isEmpty()) {
        existing.remove(0);
      }

      List<String> extracted = extractPendingQuestionsFromAssistant(assistantMessage);
      LinkedHashSet<String> merged = new LinkedHashSet<>();
      merged.addAll(existing);
      merged.addAll(extracted);

      List<String> limited = new ArrayList<>(merged);
      if (limited.size() > COPILOT_PENDING_MAX_ITEMS) {
        limited = limited.subList(limited.size() - COPILOT_PENDING_MAX_ITEMS, limited.size());
      }

      StringBuilder out = new StringBuilder();
      out.append("# Copilot Pending Questions\n");
      out.append("<!-- AUTO-GENERATED by GitHubModelsService -->\n");
      for (String item : limited) {
        out.append("- ").append(item).append("\n");
      }

      java.io.File f = getCopilotPendingFile(appId, scopeKey);
      f.getParentFile().mkdirs();
      java.nio.file.Files.writeString(f.toPath(), out.toString(), StandardCharsets.UTF_8);
    } catch (Exception e) {
      log.warn("Could not update Copilot pending questions for appId={} scope={}: {}", appId, scopeKey, e.getMessage());
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
   * Build menu knowledge context block for Copilot chat requests.
   * Auto-loads ai_menu_*.md files when request is detected as menu design.
   */
  public String buildCopilotMenuKnowledgeBlock(String appId, String contextType, String taskType) {
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
   * Path is configurable via github.models.master-prompt-path property.
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

  private static final Logger log = LoggerFactory.getLogger(GitHubModelsService.class);

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

  @Value("${github.models.enabled:true}")
  private boolean enabled;

  @Value("${github.models.url:https://models.inference.ai.azure.com/chat/completions}")
  private String apiUrl;

  @Value("${github.models.model:gpt-4o-mini}")
  private String model;

  @Value("${github.models.models:}")
  private String models;

  @Value("${github.models.default-fallback-models:gpt-4o-mini,gpt-4.1-mini,gpt-4.1}")
  private String defaultFallbackModels;

  @Value("${github.models.prioritize-mini:true}")
  private boolean prioritizeMiniModels;

  @Value("${github.models.max-output-tokens:8192}")
  private int maxOutputTokens;

  @Value("${github.models.max-prompt-chars:3000000}")
  private int maxPromptChars;

  @Value("${github.models.direct-max-chars:20000}")
  private int directMaxChars;

  @Value("${github.models.chunk-mode-threshold-chars:100000}")
  private int chunkModeThresholdChars;

  @Value("${github.models.chunk-size-chars:16000}")
  private int chunkSizeChars;

  @Value("${github.models.chunk-overlap-chars:500}")
  private int chunkOverlapChars;

  @Value("${github.models.max-chunks:300}")
  private int maxChunks;

  @Value("${github.models.chunk-summary-max-tokens:1024}")
  private int chunkSummaryMaxTokens;

  @Value("${github.models.request-max-chars:32000}")
  private int requestMaxChars;

  @Value("${github.models.merge-batch-size:8}")
  private int mergeBatchSize;

  @Value("${github.models.task-hint-max-chars:12000}")
  private int taskHintMaxChars;

  @Value("${github.models.retry.max-attempts:5}")
  private int retryMaxAttempts;

  @Value("${github.models.retry.base-wait-ms:65000}")
  private long retryBaseWaitMs;

  @Value("${github.models.retry.max-rate-retries-per-model:1}")
  private int retryMaxRateRetriesPerModel;

  @Value("${github.models.retry.max-429-wait-ms:8000}")
  private long retryMax429WaitMs;

  @Value("${github.models.throttle.min-interval-ms:2500}")
  private long throttleMinIntervalMs;

  @Value("${github.models.tpm-limit:38000}")
  private int tpmLimit;

  @Value("${github.models.temperature.direct:0.2}")
  private double directTemperature;

  @Value("${github.models.temperature.chunk-summary:0.1}")
  private double chunkSummaryTemperature;

  @Value("${github.models.temperature.merge:0.2}")
  private double mergeTemperature;

  @Value("${github.models.realtime-draft.enabled:true}")
  private boolean realtimeDraftEnabled;

  @Value("${github.models.realtime-draft.every-chunks:1}")
  private int realtimeDraftEveryChunks;

  @Value("${github.models.stability.menu-only-context-injection:true}")
  private boolean menuOnlyContextInjection;

  @Value("${github.models.chat-stream.direct-max-chars:120000}")
  private int chatStreamDirectMaxChars;

  @Value("${github.models.chat-stream.input-token-soft-limit:6800}")
  private int chatStreamInputTokenSoftLimit;

  @Value("${github.models.chat-stream.emit-chunk-chars:2400}")
  private int chatStreamEmitChunkChars;

  private final Semaphore requestSemaphore = new Semaphore(1, true);
  private volatile long lastRequestAtMs = 0L;
  private volatile long currentWindowStartMs = 0L;
  private volatile int currentWindowEstimatedTokens = 0;
  private final AtomicInteger modelCursor = new AtomicInteger(0);

  @Value("${github.models.token:}")
  private String token;


  /**
   * Prepend system core (master prompt) to every prompt sent to AI.
   * The prompt argument should be the dynamic context (app_id, metadata, task, etc).
   */
  public String generateContent(String prompt) {
    return generateContent(prompt, null);
  }

  public String generateContent(String prompt, ProgressListener progressListener) {
    if (!enabled) {
      return createErrorJson("GitHub Models fallback đang tắt", "GITHUB_MODELS_DISABLED");
    }
    if (prompt == null || prompt.trim().isEmpty()) {
      return createErrorJson("Prompt không được để trống", "INVALID_PROMPT");
    }
    if (token == null || token.trim().isEmpty()) {
      return createErrorJson("Thiếu github.models.token để gọi GitHub Models API", "GITHUB_TOKEN_MISSING");
    }

    String trimmedPrompt = prompt.trim();

    // Inject scenario-specific instructions between master prompt and dynamic context
    AiMenuOperationScenario scenario = extractOperationScenario(prompt);
    boolean isMenuScenario = scenario != AiMenuOperationScenario.UNKNOWN;
    boolean shouldInjectMenuContext = !menuOnlyContextInjection || isMenuScenario;

    String systemCore = "";
    String scenarioContext = null;
    if (shouldInjectMenuContext) {
      systemCore = getMasterPrompt();
      if (systemCore == null || systemCore.trim().isEmpty()) {
        return createErrorJson("Không load được System Core (master prompt)", "MASTER_PROMPT_MISSING");
      }
      scenarioContext = buildScenarioContext(prompt);
    }

    // Load per-app session context file (if prompt doesn't already embed session_memory)
    // This mirrors how Copilot injects its /memories/session context into each request.
    String appContextBlock = "";
    boolean promptAlreadyHasSessionMemory = prompt.contains("session_memory")
        || prompt.contains("APP CONTINUITY MEMORY");
    if (shouldInjectMenuContext && !promptAlreadyHasSessionMemory) {
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
    if (!shouldInjectMenuContext) {
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

    if (finalPrompt.length() > maxPromptChars) {
      return createErrorJson(
          "Prompt quá dài cho GitHub fallback (tối đa " + maxPromptChars + " ký tự), hiện tại: " + finalPrompt.length(),
          "GITHUB_PROMPT_TOO_LARGE");
    }

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
    if (finalPrompt.length() > directMaxChars || finalPrompt.length() > chunkThresholdChars) {
      return generateLargePromptContent(finalPrompt, progressListener, scenario);
    }

    return generateDirectContent(finalPrompt, progressListener);
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
      return createErrorJson("GitHub Models không khả dụng", "GITHUB_MODELS_DISABLED");
    }
    if (messages == null || messages.isEmpty()) {
      return createErrorJson("Messages rỗng", "INVALID_PROMPT");
    }
    if (token == null || token.trim().isEmpty()) {
      return createErrorJson("Thiếu GitHub Models token", "GITHUB_TOKEN_MISSING");
    }

    try {
      String flattenedPrompt = flattenChatMessages(messages);
      int streamingDirectSafeChars = Math.max(8000, Math.min(chatStreamDirectMaxChars, requestMaxChars - 1000));
        int chunkThresholdChars = Math.max(10000, chunkModeThresholdChars);
      int estimatedInputTokens = estimateTokens(flattenedPrompt, Math.max(128, Math.min(1024, maxOutputTokens)));
      boolean shouldChunkFallback = !flattenedPrompt.isBlank()
          && (flattenedPrompt.length() > streamingDirectSafeChars
            || flattenedPrompt.length() > chunkThresholdChars
              || estimatedInputTokens > Math.max(3000, chatStreamInputTokenSoftLimit));

      if (shouldChunkFallback) {
        emitProgress(progressListener, progressPayload(
            "preparing",
            "Ngữ cảnh quá lớn, chuyển sang chế độ chunk để giữ đầy đủ nội dung",
            0,
            1,
          withOrchestrationMeta("preparing", 0, 1, mergeProgress(
            progressI18n(
              "copilot.progress.message.large_context_chunk_mode",
              null,
              "copilot.progress.detail.streaming_chunk_fallback",
              Map.of(
                "inputChars", flattenedPrompt.length(),
                "chunkModeThresholdChars", chunkThresholdChars,
                "estimatedInputTokens", estimatedInputTokens,
                "directCharsLimit", streamingDirectSafeChars,
                "inputTokenSoftLimit", Math.max(3000, chatStreamInputTokenSoftLimit),
                "mode", "streaming_chunked_fallback")),
            Map.of(
              "detail", "Ngu canh lon vuot nguong streaming direct, kich hoat chunk mode map-reduce",
              "inputChars", flattenedPrompt.length(),
              "chunkModeThresholdChars", chunkThresholdChars,
              "estimatedInputTokens", estimatedInputTokens,
              "directCharsLimit", streamingDirectSafeChars,
              "inputTokenSoftLimit", Math.max(3000, chatStreamInputTokenSoftLimit),
              "mode", "streaming_chunked_fallback")))));

        String chunkedResult = generateContent(flattenedPrompt, progressListener);
        if (isErrorResponseJson(chunkedResult)) {
          return chunkedResult;
        }
        String finalText = extractResultTextFromWrappedJson(chunkedResult);
        if (finalText == null || finalText.isBlank()) {
          finalText = chunkedResult;
        }
        emitStreamingChunks(finalText, progressListener);
        emitProgress(progressListener, progressPayload("complete", "Chat hoàn tất", 1, 1,
          mergeProgress(progressI18n("copilot.progress.message.chat_complete", null, null, null), Map.of(
                "mode", "streaming_chunked_fallback",
                "inputChars", flattenedPrompt.length(),
              "estimatedInputTokens", estimatedInputTokens))));
        return createSuccessJson(finalText, "streaming_chunked_fallback", Map.of(
            "inputChars", flattenedPrompt.length(),
            "chunkModeThresholdChars", chunkThresholdChars,
            "estimatedInputTokens", estimatedInputTokens,
            "directCharsLimit", streamingDirectSafeChars,
            "inputTokenSoftLimit", Math.max(3000, chatStreamInputTokenSoftLimit)));
      }

      StringBuilder fullResponse = new StringBuilder();

        emitProgress(progressListener, progressPayload("streaming", "Bắt đầu chat với GitHub Models", 0, 1,
          progressI18n("copilot.progress.message.streaming_start", null, null, null)));
      
      // Build request payload
      Map<String, Object> body = new HashMap<>();
      body.put("model", model);
      body.put("messages", messages);
      body.put("temperature", 0.7);
      body.put("top_p", 0.95);
      body.put("max_tokens", maxOutputTokens);
      body.put("stream", true); // Enable true streaming

      // Use WebClient for reactive streaming (vs blocking RestTemplate)
      String streamedResponse = streamChatCompletionWithWebClient(body, progressListener);
      
      fullResponse.append(streamedResponse);
      
      emitProgress(progressListener, progressPayload("complete", "Chat hoàn tất", 1, 1,
        mergeProgress(progressI18n("copilot.progress.message.chat_complete", null, null, null),
          Map.of("chunk", fullResponse.toString()))));
      
      return createSuccessJson(fullResponse.toString(), "streaming_chat", null);
      
    } catch (Exception ex) {
      log.error("Chat streaming failed", ex);
      if (isFallbackEligibleStreamingFailure(ex)) {
        emitProgress(progressListener, progressPayload(
            "github_models_failed",
            "GitHub Models tạm không xử lý được, đang thử provider fallback",
            0,
            1,
            mergeProgress(
                progressI18n("copilot.progress.message.github_fallback", null, "copilot.progress.detail.github_fallback", Map.of("error", String.valueOf(ex.getMessage()))),
                Map.of("error", String.valueOf(ex.getMessage())))));
      } else {
        emitProgress(progressListener, progressPayload("error", "Chat lỗi: " + ex.getMessage(), 0, 1,
            progressI18n("copilot.progress.message.chat_error", Map.of("error", String.valueOf(ex.getMessage())), null, null)));
      }
      return createErrorJson("Chat streaming lỗi: " + ex.getMessage(), "CHAT_STREAMING_ERROR");
    }
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
        || text.contains("tất cả github models đều thất bại")
        || text.contains("tat ca github models deu that bai")
        || text.contains("rate limit")
        || text.contains("quota")
        || text.contains("429")
        || text.contains("413");
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
      if (message == null || message.isEmpty()) {
        continue;
      }
      String role = String.valueOf(message.getOrDefault("role", "user"));
      sb.append("[ROLE=").append(role).append("]\n");

      Object content = message.get("content");
      if (content instanceof String text) {
        sb.append(text).append("\n\n");
        continue;
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

      sb.append("\n");
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
          
          // Call GitHub Models with streaming
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
      
      throw new IllegalStateException("Tất cả GitHub models đều thất bại");
      
    } catch (Exception ex) {
      log.error("Streaming chat completion failed", ex);
      throw new IllegalStateException("Streaming chat lỗi: " + ex.getMessage());
    }
  }

  /**
   * Stream chat completion using WebClient (reactive, non-blocking).
   * Endpoint: https://models.inference.ai.azure.com/chat/completions
   * Supports gpt-4o, gpt-4.1, gpt-4o-mini models with stream=true.
   */
  private String streamChatCompletionWithWebClient(Map<String, Object> body, ProgressListener progressListener) {
    StringBuilder accumulated = new StringBuilder();
    List<String> candidateModels = resolveCandidateModels();
    String endpoint = "https://models.inference.ai.azure.com/chat/completions";
    
    for (String candidateModel : candidateModels) {
      try {
        body.put("model", candidateModel);
        
        emitProgress(progressListener, progressPayload("streaming", "Đang kết nối tới " + candidateModel, 0, 1,
          progressI18n("copilot.progress.message.connecting_model", Map.of("model", candidateModel), null, null)));
        
        // Blocking collect all streamed chunks (WebClient will handle stream internally)
        getWebClient().post()
            .uri(endpoint)
            .contentType(MediaType.APPLICATION_JSON)
            .accept(MediaType.TEXT_EVENT_STREAM)
            .header("Authorization", "Bearer " + token.trim())
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
    
    throw new IllegalStateException("Tất cả GitHub models đều thất bại (stream mode)");
  }

  private String generateDirectContent(String prompt, ProgressListener progressListener) {
    try {
      if (prompt.length() > requestMaxChars) {
        return createErrorJson(
            "Prompt direct vượt ngưỡng an toàn request (" + requestMaxChars + " ký tự)",
            "GITHUB_DIRECT_PROMPT_TOO_LARGE");
      }
      emitProgress(progressListener, progressPayload("direct_call", "Đang gửi yêu cầu trực tiếp tới GitHub Models", 0, 1,
          progressI18n("copilot.progress.message.direct_request", null, null, null)));
        String rawBody = callChatCompletion(prompt, maxOutputTokens, directTemperature, progressListener,
          progressPayload("direct_call", "Đang chờ phản hồi từ GitHub Models", 1, 1,
              progressI18n("copilot.progress.message.direct_waiting", null, null, null)));
      if (rawBody == null || rawBody.trim().isEmpty()) {
        return createErrorJson("GitHub Models trả về response rỗng", "GITHUB_EMPTY_RESPONSE");
      }

      String content = extractContent(rawBody);
      if (content == null || content.trim().isEmpty()) {
        return createErrorJson("Không trích xuất được nội dung từ GitHub Models", "GITHUB_PARSE_EMPTY");
      }

      Object parsedResult = tryParseJson(content);
        emitProgress(progressListener, progressPayload("completed", "Đã hoàn tất xử lý AI", 1, 1,
          progressI18n("copilot.progress.message.completed", null, null, null)));
      return createSuccessJson(parsedResult != null ? parsedResult : content, "direct", null);
    } catch (Exception ex) {
      log.error("GitHub Models request failed", ex);
      return createErrorJson("Lỗi gọi GitHub Models API: " + ex.getMessage(), "GITHUB_MODELS_ERROR");
    }
  }

  private String generateLargePromptContent(String prompt, ProgressListener progressListener, AiMenuOperationScenario scenario) {
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
      String mergedPrompt = buildMergedPrompt(taskHint, reducedSummaries);
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
      return createSuccessJson(parsedResult != null ? parsedResult : mergedContent, "chunked", meta);
    } catch (Exception ex) {
      log.error("GitHub Models chunked request failed", ex);
      return createErrorJson("Lỗi xử lý prompt lớn qua GitHub Models: " + ex.getMessage(), "GITHUB_CHUNKED_ERROR");
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
      throw new IllegalArgumentException("Prompt rỗng khi gọi GitHub Models");
    }
    if (prompt.length() > requestMaxChars) {
      throw new IllegalArgumentException(
          "Prompt request quá lớn cho model (" + prompt.length() + ">" + requestMaxChars + " ký tự)");
    }

    int estimatedInputTokens = estimateTokens(prompt, Math.max(256, maxTokens));
    List<String> candidateModels = resolveCandidateModels();
    List<String> failures = new ArrayList<>();

    for (String candidateModel : candidateModels) {
      if (!supportsPromptSize(candidateModel, estimatedInputTokens, maxTokens)) {
        String skipReason = "skip context too large for model";
        log.info("Skip model '{}' for promptSize={} estimatedInputTokens={} maxTokens={} ({})",
            candidateModel, prompt.length(), estimatedInputTokens, maxTokens, skipReason);
        failures.add(candidateModel + " -> " + skipReason);
        continue;
      }

      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);
      headers.setBearerAuth(token.trim());

      Map<String, Object> body = new HashMap<>();
      body.put("model", candidateModel);
      body.put("messages", List.of(Map.of("role", "user", "content", prompt)));
      body.put("temperature", temperature);
      body.put("top_p", 0.95);
      body.put("max_tokens", maxTokens);

      HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
      try {
        return executeWithRetry(request, prompt, maxTokens, progressListener,
            mergeProgress(progressMeta, Map.of("model", candidateModel)), candidateModel);
      } catch (HttpClientErrorException.BadRequest badRequest) {
        if (isUnknownModelError(badRequest)) {
          String msg = "Model '" + candidateModel + "' không khả dụng hoặc sai tên. Đang thử model tiếp theo.";
          log.warn(msg);
          failures.add(candidateModel + " -> unknown model");
          continue;
        }
        throw badRequest;
      } catch (IllegalStateException rateLimitedEx) {
        String msg = rateLimitedEx.getMessage() == null ? "unknown error" : rateLimitedEx.getMessage();
        if (msg.contains("rate limit") || msg.contains("quota")) {
          log.warn("Model '{}' tạm không dùng được ({}). Đang thử model tiếp theo.", candidateModel, msg);
          failures.add(candidateModel + " -> " + msg);
          continue;
        }
        throw rateLimitedEx;
      }
    }

    String failureSummary = failures.isEmpty() ? "Không có chi tiết lỗi" : String.join(" | ", failures);
    throw new IllegalStateException("Tất cả GitHub models đều thất bại. Đã thử: "
        + String.join(", ", candidateModels) + ". Chi tiết: " + failureSummary);
  }

  private String executeWithRetry(HttpEntity<Map<String, Object>> request, String prompt, int maxTokens,
      ProgressListener progressListener, Map<String, Object> progressMeta, String modelName) {
    int estimatedTokens = estimateTokens(prompt, maxTokens);
    acquirePermit();
    try {
      for (int attempt = 1; attempt <= Math.max(1, retryMaxAttempts); attempt++) {
        try {
          reserveBudgetBeforeCall(estimatedTokens);
          emitProgress(progressListener, mergeProgress(progressMeta, Map.of("attempt", attempt)));
          ResponseEntity<String> response = restTemplate.postForEntity(apiUrl, request, String.class);
          return response.getBody();
        } catch (HttpClientErrorException.TooManyRequests ex) {
          if (isDailyQuotaExceeded(ex)) {
            String msg = "GitHub Models daily quota reached for model '" + modelName + "'";
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
            log.warn("GitHub Models 429 for model '{}' -> fast failover: {}.", modelName, reason);
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

          log.warn("GitHub Models 429 rate limit for model '{}' (attempt {}/{}). Waiting {} ms before retry.",
              modelName, attempt, retryMaxAttempts, waitMs);
          emitProgress(progressListener, mergeProgress(progressMeta, Map.of(
              "stage", "waiting_rate_limit",
              "message", "Đang chờ quota GitHub Models",
              "messageKey", "copilot.progress.message.waiting_rate_limit",
              "messageArgs", Map.of("model", modelName, "waitingMs", waitMs),
              "attempt", attempt,
              "model", modelName,
              "waitingMs", waitMs)));
          sleepQuietly(waitMs);
        } catch (HttpClientErrorException ex) {
          throw ex;
        }
      }
    } finally {
      requestSemaphore.release();
    }
    throw new IllegalStateException("GitHub Models rate limit exceeded after retries for model '" + modelName + "'");
  }

  private List<String> resolveCandidateModels() {
    Set<String> ordered = new LinkedHashSet<>();
    String primary = model == null ? "" : model.trim();
    if (!primary.isEmpty()) {
      ordered.add(primary);
    }

    addModelsFromCsv(ordered, models);
    addModelsFromCsv(ordered, defaultFallbackModels);

    List<String> list = new ArrayList<>(ordered);
    if (list.size() <= 1) {
      return list;
    }

    if (prioritizeMiniModels) {
      list.sort((a, b) -> Integer.compare(modelPriority(a), modelPriority(b)));
    }

    int start = Math.floorMod(modelCursor.getAndIncrement(), list.size());
    List<String> rotated = new ArrayList<>(list.size());
    for (int i = 0; i < list.size(); i++) {
      rotated.add(list.get((start + i) % list.size()));
    }
    return rotated;
  }

  private void addModelsFromCsv(Set<String> collector, String csv) {
    if (collector == null || csv == null || csv.isBlank()) {
      return;
    }
    String[] parts = csv.split(",");
    for (String part : parts) {
      String candidate = part == null ? "" : part.trim();
      if (!candidate.isEmpty()) {
        collector.add(candidate);
      }
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

    return true;
  }

  private boolean isUnknownModelError(HttpClientErrorException.BadRequest ex) {
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
        log.info("Throttling GitHub Models requests to respect TPM budget. Waiting {} ms.", waitForNextWindow);
        sleepQuietly(waitForNextWindow);
      }
      currentWindowStartMs = System.currentTimeMillis();
      currentWindowEstimatedTokens = 0;
    }

    currentWindowEstimatedTokens += Math.max(1, estimatedTokens);
    lastRequestAtMs = System.currentTimeMillis();
  }

  private int estimateTokens(String prompt, int maxTokens) {
    int inputTokens = Math.max(1, (prompt == null ? 0 : prompt.length()) / 4);
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
      log.debug("Unable to parse retry-after headers from GitHub Models 429: {}", headerParseEx.getMessage());
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
      throw new IllegalStateException("Interrupted while waiting for GitHub Models retry/throttle", ie);
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

  private String buildChunkSummaryPrompt(int index, int total, String chunk) {
    String safeChunk = trimToMax(chunk, Math.max(4000, requestMaxChars - 5000));
    return "Bạn là bộ nén ngữ cảnh chính xác cho tác vụ AI.\\n"
        + "Mục tiêu: trích xuất thông tin cốt lõi từ CHUNK để phục vụ trả lời yêu cầu cuối.\\n"
        + "Yêu cầu output: chỉ trả về JSON hợp lệ, không markdown.\\n"
        + "Không tự giới hạn độ dài một cách máy móc; ưu tiên đầy đủ nghiệp vụ, schema và ràng buộc quan trọng.\\n"
        + "Schema JSON: {\\n"
        + "  \"chunkIndex\": " + index + ",\\n"
        + "  \"totalChunks\": " + total + ",\\n"
        + "  \"facts\": [\"...\"],\\n"
        + "  \"constraints\": [\"...\"],\\n"
        + "  \"entities\": [\"...\"],\\n"
        + "  \"instructions\": [\"...\"],\\n"
        + "  \"jsonExamples\": [\"...\"],\\n"
        + "  \"notes\": [\"...\"]\\n"
        + "}\\n"
        + "Không bỏ sót quy tắc quan trọng, tên trường dữ liệu, cấu trúc JSON, hoặc ràng buộc nghiệp vụ.\\n"
        + "<CHUNK>\\n"
        + safeChunk
        + "\\n</CHUNK>";
  }

  private String buildMergedPrompt(String taskHint, List<String> chunkSummaries) {
    StringBuilder sb = new StringBuilder();
    sb.append("Bạn sẽ giải bài toán từ mô tả nhiệm vụ và các tóm tắt chunk đã nén.\\n");
    sb.append("Bắt buộc giữ đầy đủ ràng buộc, schema, field name và logic nghiệp vụ.\\n");
    sb.append("Nếu yêu cầu gốc đòi output JSON thì chỉ trả JSON hợp lệ, không markdown.\\n\\n");
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
    sb.append("Schema: {\"level\":").append(level).append(",\"facts\":[],\"constraints\":[],\"fields\":[]}\\n");
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
      ok.put("provider", "GitHubModels");
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
