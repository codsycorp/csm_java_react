package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Semaphore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

/**
 * Fallback service for oversized prompts routed to GitHub Models API.
 * Returns JSON wrapper compatible with existing /ai-generate-seo-content parsing flow.
 */
@Service
public class GitHubModelsService {

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

  private final Semaphore requestSemaphore = new Semaphore(1, true);
  private volatile long lastRequestAtMs = 0L;
  private volatile long currentWindowStartMs = 0L;
  private volatile int currentWindowEstimatedTokens = 0;

  @Value("${github.models.token:}")
  private String token;

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

    if (prompt.length() > maxPromptChars) {
      return createErrorJson(
          "Prompt quá dài cho GitHub fallback (tối đa " + maxPromptChars + " ký tự), hiện tại: " + prompt.length(),
          "GITHUB_PROMPT_TOO_LARGE");
    }

    emitProgress(progressListener, progressPayload("preparing", "Đang chuẩn bị yêu cầu AI", 0, 1, null));

    if (prompt.length() > directMaxChars) {
      return generateLargePromptContent(prompt, progressListener);
    }

    return generateDirectContent(prompt, progressListener);
  }

  private String generateDirectContent(String prompt, ProgressListener progressListener) {
    try {
      if (prompt.length() > requestMaxChars) {
        return createErrorJson(
            "Prompt direct vượt ngưỡng an toàn request (" + requestMaxChars + " ký tự)",
            "GITHUB_DIRECT_PROMPT_TOO_LARGE");
      }
      emitProgress(progressListener, progressPayload("direct_call", "Đang gửi yêu cầu trực tiếp tới GitHub Models", 0, 1, null));
      String rawBody = callChatCompletion(prompt, maxOutputTokens, 0.7, progressListener, progressPayload("direct_call", "Đang chờ phản hồi từ GitHub Models", 1, 1, null));
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
      int idx = 1;
      for (String chunk : chunks) {
        Map<String, Object> extra = new HashMap<>();
        extra.put("phase", "chunk-summary");
        emitProgress(progressListener, progressPayload("chunking", "Đang phân tích từng phần của prompt", idx - 1, chunks.size(), extra));
        String chunkPrompt = buildChunkSummaryPrompt(idx, chunks.size(), chunk);
        String chunkRaw = callChatCompletion(chunkPrompt, chunkSummaryMaxTokens, 0.2, progressListener,
            progressPayload("chunking", "Đang xử lý chunk " + idx + "/" + chunks.size(), idx, chunks.size(), extra));
        if (chunkRaw == null || chunkRaw.isBlank()) {
          return createErrorJson("Chunk " + idx + " trả về rỗng", "GITHUB_CHUNK_EMPTY_RESPONSE");
        }
        String chunkContent = extractContent(chunkRaw);
        if (chunkContent == null || chunkContent.isBlank()) {
          return createErrorJson("Không trích xuất được summary của chunk " + idx, "GITHUB_CHUNK_PARSE_EMPTY");
        }
        chunkSummaries.add(chunkContent.trim());
        idx++;
      }

      emitProgress(progressListener, progressPayload("reducing", "Đang gộp tóm tắt các chunk", 0, chunkSummaries.size(), null));
      List<String> reducedSummaries = reduceSummaries(chunkSummaries, progressListener);
      emitProgress(progressListener, progressPayload("final_merge", "Đang tổng hợp kết quả cuối", 0, 1, null));
      String mergedPrompt = buildMergedPrompt(buildTaskHint(prompt), reducedSummaries);
      String mergedRaw = callChatCompletion(mergedPrompt, maxOutputTokens, 0.6, progressListener,
          progressPayload("final_merge", "Đang chờ phản hồi tổng hợp cuối", 1, 1, null));
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

    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.setBearerAuth(token.trim());

    Map<String, Object> body = new HashMap<>();
    body.put("model", model);
    body.put("messages", List.of(Map.of("role", "user", "content", prompt)));
    body.put("temperature", temperature);
    body.put("top_p", 0.95);
    body.put("max_tokens", maxTokens);

    HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
    return executeWithRetry(request, prompt, maxTokens, progressListener, progressMeta);
  }

  private String executeWithRetry(HttpEntity<Map<String, Object>> request, String prompt, int maxTokens,
      ProgressListener progressListener, Map<String, Object> progressMeta) {
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
          long waitMs = computeRetryWaitMs(attempt);
          log.warn("GitHub Models 429 rate limit (attempt {}/{}). Waiting {} ms before retry.",
              attempt, retryMaxAttempts, waitMs);
          emitProgress(progressListener, mergeProgress(progressMeta, Map.of(
              "stage", "waiting_rate_limit",
              "message", "Đang chờ quota GitHub Models",
              "attempt", attempt,
              "waitingMs", waitMs)));
          sleepQuietly(waitMs);
        } catch (HttpClientErrorException ex) {
          throw ex;
        }
      }
    } finally {
      requestSemaphore.release();
    }
    throw new IllegalStateException("GitHub Models rate limit exceeded after retries");
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
      + "Giữ output NGẮN GỌN (<= 1200 ký tự).\\n"
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
    for (int i = 0; i < chunkSummaries.size(); i++) {
      sb.append("[CHUNK ").append(i + 1).append("]\\n");
      sb.append(trimToMax(chunkSummaries.get(i), 1400)).append("\\n\\n");
    }
    return trimToMax(sb.toString(), requestMaxChars - 500);
  }

  private List<String> reduceSummaries(List<String> summaries, ProgressListener progressListener) {
    List<String> current = new ArrayList<>(summaries);
    int level = 1;

    while (current.size() > 1 && totalLength(current) > Math.max(4000, requestMaxChars - 6000)) {
      List<String> next = new ArrayList<>();
      List<String> batch = new ArrayList<>();
      int batchChars = 0;
      int maxBatchChars = Math.max(6000, requestMaxChars - 9000);
      int maxBatchItems = Math.max(2, mergeBatchSize);
      int completedBatches = 0;
      int estimatedBatchTotal = Math.max(1, (int) Math.ceil((double) current.size() / maxBatchItems));

      for (String item : current) {
        String safeItem = trimToMax(item, 1800);
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
    String raw = callChatCompletion(prompt, chunkSummaryMaxTokens, 0.2, progressListener,
        progressPayload("reducing", "Đang gộp summary level " + level + " (" + batchIndex + "/" + batchTotal + ")",
            batchIndex, batchTotal, Map.of("level", level)));
    if (raw == null || raw.isBlank()) {
      throw new IllegalStateException("Merge batch summary trả về rỗng ở level " + level);
    }
    String content = extractContentSafely(raw);
    if (content == null || content.isBlank()) {
      throw new IllegalStateException("Không trích xuất được merge summary ở level " + level);
    }
    return trimToMax(content.trim(), 1800);
  }

  private String buildSummaryMergePrompt(List<String> batch, int level) {
    StringBuilder sb = new StringBuilder();
    sb.append("Bạn hãy gộp các summary thành 1 summary ngắn gọn, không mất ràng buộc quan trọng.\\n");
    sb.append("Output chỉ JSON hợp lệ, tối đa 1200 ký tự.\\n");
    sb.append("Schema: {\"level\":").append(level).append(",\"facts\":[],\"constraints\":[],\"fields\":[]}\\n");
    sb.append("=== INPUT SUMMARIES ===\\n");
    for (int i = 0; i < batch.size(); i++) {
      sb.append("[S").append(i + 1).append("] ").append(trimToMax(batch.get(i), 1800)).append("\\n");
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
    return text.substring(0, maxChars);
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
