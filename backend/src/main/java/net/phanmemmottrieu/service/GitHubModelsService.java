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
import java.nio.charset.StandardCharsets;
import java.io.InputStream;
import java.io.IOException;


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

  @Value("${github.models.enabled:true}")
  private boolean enabled;

  @Value("${github.models.url:https://models.inference.ai.azure.com/chat/completions}")
  private String apiUrl;

  @Value("${github.models.model:gpt-4o-mini}")
  private String model;

  @Value("${github.models.models:}")
  private String models;

  @Value("${github.models.max-output-tokens:8192}")
  private int maxOutputTokens;

  @Value("${github.models.max-prompt-chars:3000000}")
  private int maxPromptChars;

  @Value("${github.models.direct-max-chars:20000}")
  private int directMaxChars;

  @Value("${github.models.chunk-size-chars:16000}")
  private int chunkSizeChars;

  @Value("${github.models.chunk-overlap-chars:500}")
  private int chunkOverlapChars;

  @Value("${github.models.max-chunks:300}")
  private int maxChunks;

  @Value("${github.models.chunk-summary-max-tokens:512}")
  private int chunkSummaryMaxTokens;

  @Value("${github.models.request-max-chars:22000}")
  private int requestMaxChars;

  @Value("${github.models.merge-batch-size:8}")
  private int mergeBatchSize;

  @Value("${github.models.task-hint-max-chars:4000}")
  private int taskHintMaxChars;

  @Value("${github.models.retry.max-attempts:5}")
  private int retryMaxAttempts;

  @Value("${github.models.retry.base-wait-ms:65000}")
  private long retryBaseWaitMs;

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
    String systemCore = getMasterPrompt();
    if (systemCore == null || systemCore.trim().isEmpty()) {
      return createErrorJson("Không load được System Core (master prompt)", "MASTER_PROMPT_MISSING");
    }
    if (prompt == null || prompt.trim().isEmpty()) {
      return createErrorJson("Prompt không được để trống", "INVALID_PROMPT");
    }
    if (token == null || token.trim().isEmpty()) {
      return createErrorJson("Thiếu github.models.token để gọi GitHub Models API", "GITHUB_TOKEN_MISSING");
    }

    // Inject scenario-specific instructions between master prompt and dynamic context
    String scenarioContext = buildScenarioContext(prompt);

    // Compose final prompt: [System_Core]\n\n[Scenario_Context?]\n\n[Dynamic_Context]
    String finalPrompt = scenarioContext != null && !scenarioContext.isBlank()
        ? systemCore.trim() + "\n\n" + scenarioContext.trim() + "\n\n" + prompt.trim()
        : systemCore.trim() + "\n\n" + prompt.trim();

    if (finalPrompt.length() > maxPromptChars) {
      return createErrorJson(
          "Prompt quá dài cho GitHub fallback (tối đa " + maxPromptChars + " ký tự), hiện tại: " + finalPrompt.length(),
          "GITHUB_PROMPT_TOO_LARGE");
    }

    emitProgress(progressListener, progressPayload("preparing", "Đang chuẩn bị yêu cầu AI", 0, 1, null));

    if (finalPrompt.length() > directMaxChars) {
      return generateLargePromptContent(finalPrompt, progressListener);
    }

    return generateDirectContent(finalPrompt, progressListener);
  }

  private String generateDirectContent(String prompt, ProgressListener progressListener) {
    try {
      if (prompt.length() > requestMaxChars) {
        return createErrorJson(
            "Prompt direct vượt ngưỡng an toàn request (" + requestMaxChars + " ký tự)",
            "GITHUB_DIRECT_PROMPT_TOO_LARGE");
      }
      emitProgress(progressListener, progressPayload("direct_call", "Đang gửi yêu cầu trực tiếp tới GitHub Models", 0, 1, null));
        String rawBody = callChatCompletion(prompt, maxOutputTokens, directTemperature, progressListener,
          progressPayload("direct_call", "Đang chờ phản hồi từ GitHub Models", 1, 1, null));
      if (rawBody == null || rawBody.trim().isEmpty()) {
        return createErrorJson("GitHub Models trả về response rỗng", "GITHUB_EMPTY_RESPONSE");
      }

      String content = extractContent(rawBody);
      if (content == null || content.trim().isEmpty()) {
        return createErrorJson("Không trích xuất được nội dung từ GitHub Models", "GITHUB_PARSE_EMPTY");
      }

      Object parsedResult = tryParseJson(content);
      emitProgress(progressListener, progressPayload("completed", "Đã hoàn tất xử lý AI", 1, 1, null));
      return createSuccessJson(parsedResult != null ? parsedResult : content, "direct", null);
    } catch (Exception ex) {
      log.error("GitHub Models request failed", ex);
      return createErrorJson("Lỗi gọi GitHub Models API: " + ex.getMessage(), "GITHUB_MODELS_ERROR");
    }
  }

  private String generateLargePromptContent(String prompt, ProgressListener progressListener) {
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
      int idx = 1;
      for (String chunk : chunks) {
        Map<String, Object> extra = new HashMap<>();
        extra.put("phase", "chunk-summary");
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
        emitProgress(progressListener, progressPayload("chunking", "Đang phân tích từng phần của prompt", idx - 1, chunks.size(), extra));
        String chunkPrompt = buildChunkSummaryPrompt(idx, chunks.size(), chunk);
        String chunkRaw = callChatCompletion(chunkPrompt, chunkSummaryMaxTokens, chunkSummaryTemperature, progressListener,
            progressPayload("chunking", "Đang xử lý chunk " + idx + "/" + chunks.size(), idx, chunks.size(), extra));
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
        emitProgress(progressListener, progressPayload("chunking", "Đang cập nhật bản nháp tạm thời", idx, chunks.size(), postChunkExtra));
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
      emitProgress(progressListener, progressPayload("reducing", "Đang gộp tóm tắt các chunk", 0, chunkSummaries.size(), reducingExtra));
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
      emitProgress(progressListener, progressPayload("final_merge", "Đang tổng hợp kết quả cuối", 0, 1, finalMergeExtra));
      String mergedPrompt = buildMergedPrompt(taskHint, reducedSummaries);
        String mergedRaw = callChatCompletion(mergedPrompt, maxOutputTokens, mergeTemperature, progressListener,
          progressPayload("final_merge", "Đang chờ phản hồi tổng hợp cuối", 1, 1, finalMergeExtra));
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
      emitProgress(progressListener, progressPayload("completed", "Đã hoàn tất xử lý AI", chunks.size(), chunks.size(), meta));
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

  private String callChatCompletion(String prompt, int maxTokens, double temperature) {
    return callChatCompletion(prompt, maxTokens, temperature, null, null);
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

    List<String> candidateModels = resolveCandidateModels();
    String lastFailure = null;

    for (String candidateModel : candidateModels) {
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
          lastFailure = msg;
          continue;
        }
        throw badRequest;
      } catch (IllegalStateException rateLimitedEx) {
        String msg = rateLimitedEx.getMessage() == null ? "unknown error" : rateLimitedEx.getMessage();
        if (msg.contains("rate limit") || msg.contains("quota")) {
          log.warn("Model '{}' tạm không dùng được ({}). Đang thử model tiếp theo.", candidateModel, msg);
          lastFailure = msg;
          continue;
        }
        throw rateLimitedEx;
      }
    }

    throw new IllegalStateException(lastFailure != null
        ? "Tất cả GitHub models đều thất bại. Lỗi cuối: " + lastFailure
        : "Tất cả GitHub models đều thất bại");
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
          log.warn("GitHub Models 429 rate limit for model '{}' (attempt {}/{}). Waiting {} ms before retry.",
              modelName, attempt, retryMaxAttempts, waitMs);
          emitProgress(progressListener, mergeProgress(progressMeta, Map.of(
              "stage", "waiting_rate_limit",
              "message", "Đang chờ quota GitHub Models",
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

    if (models != null && !models.isBlank()) {
      String[] parts = models.split(",");
      for (String part : parts) {
        String candidate = part == null ? "" : part.trim();
        if (!candidate.isEmpty()) {
          ordered.add(candidate);
        }
      }
    }

    if (ordered.isEmpty()) {
      ordered.add("gpt-4o-mini");
    }

    List<String> list = new ArrayList<>(ordered);
    if (list.size() <= 1) {
      return list;
    }

    int start = Math.floorMod(modelCursor.getAndIncrement(), list.size());
    List<String> rotated = new ArrayList<>(list.size());
    for (int i = 0; i < list.size(); i++) {
      rotated.add(list.get((start + i) % list.size()));
    }
    return rotated;
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
          emitProgress(progressListener, progressPayload("reducing", "Đang gộp summary level " + level, completedBatches - 1, estimatedBatchTotal, Map.of("level", level)));
          next.add(mergeSummaryBatch(batch, level, progressListener, completedBatches, estimatedBatchTotal));
          batch.clear();
          batchChars = 0;
        }

        batch.add(safeItem);
        batchChars += itemLen;
      }

      if (!batch.isEmpty()) {
        completedBatches++;
        emitProgress(progressListener, progressPayload("reducing", "Đang gộp summary level " + level, completedBatches - 1, estimatedBatchTotal, Map.of("level", level)));
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
            batchIndex, batchTotal, Map.of("level", level)));
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
