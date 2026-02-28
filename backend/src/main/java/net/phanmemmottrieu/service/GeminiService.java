package net.phanmemmottrieu.service;

import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import net.phanmemmottrieu.service.ApiKeyService.ApiKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.RestClientException;

import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.core5.util.Timeout;

import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.HashMap;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Dịch vụ để tương tác với Google Gemini API.
 *
 * <p>Lớp này chịu trách nhiệm gửi các yêu cầu đến Gemini API để tạo nội dung dựa trên một prompt.
 * Nó tích hợp với {@link ApiKeyService} để tự động lấy một API key hợp lệ cho mỗi lần gọi, đảm bảo
 * tuân thủ các giới hạn sử dụng.
 *
 * @author Mr.Anh
 */
@Service
public class GeminiService implements AIProvider {

  private static final Logger log = LoggerFactory.getLogger(GeminiService.class);

  /** Dịch vụ quản lý và cung cấp API key. */
  private final ApiKeyService apiKeyService;

  /** URL của Gemini API được cấu hình trong file properties. */
  private final String apiUrl;

  /** Danh sách các Gemini models để rotate */
  private final List<String> availableModels;

  /** Index của model hiện tại để rotation */
  private int currentModelIndex = 0;

  /** Quota tracking per model */
  private final Map<String, ModelQuota> modelQuotaMap = new HashMap<>();
  
  /** Max requests per minute for each model (free tier) */
  private int quotaPerMinute = 60;
  
  /** Max requests per day for each model (free tier) */
  private int quotaPerDay = 1500;

  /** Tên model AI mặc định sẽ được sử dụng. */
  private final String aiModel;

  /** RestTemplate được tối ưu với connection pooling và timeout. */
  private final RestTemplate restTemplate;

  /** Thread pool cho async operations - giới hạn 10 luồng để tránh quá tải. */
  private final ExecutorService executorService = Executors.newFixedThreadPool(10);

  /** Cache kết quả API với TTL 1 giờ để giảm số lần gọi API. */
  private final Cache<String, String> responseCache = CacheBuilder.newBuilder()
      .expireAfterWrite(1, TimeUnit.HOURS)
      .maximumSize(1000)
      .build();

  /**
   * Khởi tạo GeminiService với các dependency cần thiết.
   *
   * @param apiKeyService dịch vụ quản lý API key.
   * @param apiUrl URL của Gemini API, được inject từ file properties.
   * @param aiModel Tên model AI mặc định, được inject từ file properties.
   * @param geminiModels Danh sách models để rotate, được inject từ properties (comma-separated).
   * @param quotaPerMinute Max requests per minute per model (free tier).
   * @param quotaPerDay Max requests per day per model (free tier).
   */
  public GeminiService(
      ApiKeyService apiKeyService,
      @Value("${gemini.api.url}") String apiUrl,
      @Value("${gemini.model}") String aiModel,
      @Value("${gemini.models:gemini-2.0-flash-exp,gemini-1.5-flash,gemini-1.5-pro,gemma-2-27b-it,gemma-3-27b-it}") String geminiModels,
      @Value("${gemini.model.quota.per-minute:60}") int quotaPerMinute,
      @Value("${gemini.model.quota.per-day:1500}") int quotaPerDay) {
    this.apiKeyService = apiKeyService;
    this.apiUrl = apiUrl;
    this.aiModel = aiModel;
    this.quotaPerMinute = quotaPerMinute;
    this.quotaPerDay = quotaPerDay;
    // Parse comma-separated models list
    this.availableModels = Arrays.asList(geminiModels.split(",\\s*"));
    this.restTemplate = createOptimizedRestTemplate();
    
    // Initialize quota tracking for each model
    for (String model : availableModels) {
      modelQuotaMap.put(model, new ModelQuota(model, quotaPerMinute, quotaPerDay));
    }
    
    log.info("GeminiService initialized with {} models: {}", availableModels.size(), availableModels);
    log.info("Model quota limits: {} req/min, {} req/day", quotaPerMinute, quotaPerDay);
  }

  /**
   * Tạo RestTemplate được tối ưu với connection pooling, timeout và buffer.
   * Điều này giảm thiểu overhead khi tạo connection mới cho mỗi request.
   */
  private RestTemplate createOptimizedRestTemplate() {
    // Tạo RequestConfig với timeout tùy chỉnh
    RequestConfig requestConfig = RequestConfig.custom()
        .setConnectTimeout(Timeout.ofSeconds(10))           // 10 giây connect timeout
        .setConnectionRequestTimeout(Timeout.ofSeconds(5))  // 5 giây request timeout
        .setResponseTimeout(Timeout.ofSeconds(120))         // 120 giây read/response timeout - AI cần thời gian xử lý prompt phức tạp
        .build();
    
    // Tạo HttpClient với config timeout
    CloseableHttpClient httpClient = HttpClients.custom()
        .setDefaultRequestConfig(requestConfig)
        .build();
    
    // Tạo factory với HttpClient đã config
    HttpComponentsClientHttpRequestFactory factory = new HttpComponentsClientHttpRequestFactory(httpClient);
    
    RestTemplate template = new RestTemplate(factory);
    return template;
  }

  /**
   * Gửi một prompt đến Gemini API và trả về nội dung được tạo ra.
   *
   * <p>Phương thức này thực hiện các bước sau:
   *
   * <ol>
   *   <li>Kiểm tra cache trước tiên để giảm số lần gọi API.
   *   <li>Yêu cầu một API key khả dụng từ {@link ApiKeyService}.
   *   <li>Xây dựng request body theo định dạng yêu cầu của Gemini API.
   *   <li>Thực hiện cuộc gọi POST đến API bằng {@link RestTemplate} được tối ưu.
   *   <li>Trích xuất nội dung văn bản từ phản hồi.
   * </ol>
   *
   * @param prompt chuỗi văn bản đầu vào để Gemini xử lý.
   * @return một chuỗi chứa nội dung do Gemini tạo ra.
   * @throws CustomException nếu không có API key nào khả dụng hoặc nếu có lỗi xảy ra trong quá
   *     trình gọi API.
   */
  public String generateContent(String prompt) {
    // Kiểm tra kích thước prompt - tối đa 500K ký tự (Gemini: 1M tokens)
    if (prompt == null || prompt.trim().isEmpty()) {
      log.warn("Empty prompt provided");
      return createErrorJson("Prompt không được để trống", "INVALID_PROMPT");
    }
    
    if (prompt.length() > 500000) {
      log.warn("Prompt too large: {} characters (max: 500000)", prompt.length());
      return createErrorJson("Prompt quá dài (tối đa 500,000 ký tự), hiện tại: " + prompt.length(), "PROMPT_TOO_LARGE");
    }

    // Kiểm tra cache trước - nếu prompt giống nhau sẽ trả về kết quả ngay mà không cần gọi API
    @SuppressWarnings("unchecked")
    String cachedResult = (String) responseCache.getIfPresent(prompt);
    if (cachedResult != null) {
      log.debug("Cache hit for prompt, returning cached result");
      return cachedResult;
    }

    ApiKey availableKey = apiKeyService.getAvailableApiKey();

    if (availableKey == null) {
      log.warn("No available API key for Gemini service");
      return createErrorJson("Không có API Key nào khả dụng. Vui lòng thử lại sau", "NO_AVAILABLE_KEY");
    }

    // Không thêm system message cứng nhắc - để AI tự hiểu từ prompt của người dùng
    Map<String, Object> userTextPart = Map.of("text", prompt);
    Map<String, Object> userContentObject = Map.of("role", "user", "parts", new Object[] {userTextPart});
    
    // Add generationConfig to allow longer outputs
    Map<String, Object> generationConfig = new HashMap<>();
    generationConfig.put("maxOutputTokens", 100000);  // Maximum tokens for Gemini - AI will decide actual length freely
    generationConfig.put("temperature", 0.7);  // Higher temperature for more creative/detailed responses (up from 0.3)
    generationConfig.put("topP", 0.95);  // Allow more diverse token selection for longer content
    generationConfig.put("topK", 40);  // Restrict to top 40 tokens per step for quality
    
    Map<String, Object> requestBodyMap = new HashMap<>();
    requestBodyMap.put("contents", new Object[] {userContentObject});
    requestBodyMap.put("generationConfig", generationConfig);

    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    final String dynamicApiKey = availableKey.getKeyString();
    HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBodyMap, headers);

    // Try each model in rotation until one succeeds
    int modelsAttempted = 0;
    int totalModels = availableModels.size();
    String lastError = "";
    boolean sawQuotaExceeded = false;
    
    // First pass: try models with available quota
    for (int i = 0; i < totalModels; i++) {
      String currentModel = availableModels.get((currentModelIndex + i) % totalModels);
      ModelQuota quota = modelQuotaMap.get(currentModel);
      
      if (!quota.isAvailable()) {
        log.debug("Model {} quota exhausted: {}", currentModel, quota.getQuotaInfo());
        continue;
      }

      try {
        String apiGeminiUrl = String.format(apiUrl, currentModel) + dynamicApiKey;
        log.info("[Gemini] 📤 Trying model: {} (attempt {}/{}), prompt length: {} chars", 
            currentModel, modelsAttempted + 1, totalModels, prompt.length());
        
        // Sử dụng RestTemplate đã được tối ưu thay vì tạo mới
        ResponseEntity<String> response = restTemplate.postForEntity(apiGeminiUrl, entity, String.class);

        if (response == null || response.getBody() == null) {
          lastError = "Empty response";
          continue;
        }

        String body = response.getBody();
        log.info("[Gemini] 📥 Received response from {}, body length: {} chars", currentModel, body.length());
        
        String result = parseGeminiResponse(body);
        
        // Success - increment quota and cache result
        quota.incrementUsage();
        responseCache.put(prompt, result);
        log.info("Successfully used Gemini model: {} - {}", currentModel, quota.getQuotaInfo());
        
        return result;
        
      } catch (RestClientException e) {
        String errorMsg = e.getMessage();
        String keyStr = dynamicApiKey.length() > 8 ? dynamicApiKey.substring(0, 8) : dynamicApiKey;
        
        // Kiểm tra xem có phải lỗi "429 Too Many Requests" (Quota Exceeded) không
        if (errorMsg != null && errorMsg.contains("429")) {
          log.warn("Model {} quota exceeded for API key {}: {}", currentModel, keyStr, errorMsg);
          lastError = "Quota exceeded for model: " + currentModel;
          sawQuotaExceeded = true;
          // Try next model
          continue;
        }
        
        log.warn("Model {} failed with error {}: {}. Trying next model...", currentModel, e.getClass().getSimpleName(), errorMsg);
        lastError = e.getClass().getSimpleName() + ": " + errorMsg;
      } catch (Exception e) {
        String keyStr = dynamicApiKey.length() > 8 ? dynamicApiKey.substring(0, 8) : dynamicApiKey;
        log.warn("Unexpected error with model {}, key {}: {}. Trying next model...", currentModel, keyStr, e.getMessage());
        lastError = e.getMessage();
      }
      
      modelsAttempted++;
    }
    
    // All models failed
    String keyStr = dynamicApiKey.length() > 8 ? dynamicApiKey.substring(0, 8) : dynamicApiKey;
    log.error("All {} Gemini models failed for key {}: {}", totalModels, keyStr, lastError);
    if (sawQuotaExceeded) {
      this.apiKeyService.disableApiKeyUntilNextDay(dynamicApiKey);
    }
    
    // Build quota status for error message
    StringBuilder quotaStatus = new StringBuilder();
    for (ModelQuota quota : modelQuotaMap.values()) {
      quotaStatus.append(quota.getQuotaInfo()).append(" | ");
    }
    
    return createErrorJsonWithRetry(
      "Tất cả models Gemini đều hết quota hoặc lỗi: " + lastError + "\nQuota status: " + quotaStatus.toString(),
      "GEMINI_ALL_MODELS_FAILED",
      3600
    );
  }

  /**
   * Gửi một prompt đến Gemini API một cách không đồng bộ (async) và trả về CompletableFuture.
   * Phương thức này không block luồng gọi và cho phép server xử lý các requests khác.
   *
   * @param prompt chuỗi văn bản đầu vào để Gemini xử lý.
   * @return CompletableFuture chứa nội dung do Gemini tạo ra.
   */
  public CompletableFuture<String> generateContentAsync(String prompt) {
    return CompletableFuture.supplyAsync(() -> generateContent(prompt), executorService)
        .exceptionally(ex -> {
          log.error("Error in async generateContent: " + ex.getMessage());
          return "Lỗi khi xử lý yêu cầu AI";
        });
  }

  /**
   * Parse phản hồi từ Gemini API để trích xuất nội dung văn bản.
   * Phương thức này được tách riêng để tăng tính rõ ràng của code.
   *
   * @param body Body của response từ Gemini API.
   * @return Nội dung văn bản được trích xuất.
   */
  private String parseGeminiResponse(String body) {
    try {
      JSONObject jsonObject = JSONObject.parseObject(body);
      StringBuilder stringBuilder = new StringBuilder();
      JSONArray jsonArray =
          jsonObject
              .getJSONArray("candidates")
              .getJSONObject(0)
              .getJSONObject("content")
              .getJSONArray("parts");

      for (int i = 0; i < jsonArray.size(); i++) {
        stringBuilder.append(jsonArray.getJSONObject(i).getString("text"));
      }

      String content = stringBuilder.toString();
      
      // Check finish_reason and safety ratings
      JSONObject firstCandidate = jsonObject.getJSONArray("candidates").getJSONObject(0);
      String finishReason = firstCandidate.getString("finishReason");
      JSONArray safetyRatings = firstCandidate.getJSONArray("safetyRatings");
      
      log.info("[Gemini] ✅ Extracted content length: {} chars, finish_reason: {}", content.length(), finishReason);
      
      // Check if response was cut off
      if ("MAX_TOKENS".equals(finishReason)) {
        log.warn("[Gemini] ⚠️ Response was TRUNCATED! finish_reason='MAX_TOKENS' - content may be incomplete");
      } else if ("SAFETY".equals(finishReason)) {
        log.warn("[Gemini] ⚠️ Response was blocked! finish_reason='SAFETY'");
        if (safetyRatings != null) {
          log.warn("[Gemini] Safety ratings: {}", safetyRatings.toJSONString());
        }
      } else {
        log.debug("[Gemini] Response complete, finish_reason: {}", finishReason);
      }
      
      log.debug("[Gemini] Content preview (first 300 chars): {}", content.substring(0, Math.min(300, content.length())));
      log.debug("[Gemini] Content preview (last 300 chars): {}", 
          content.substring(Math.max(0, content.length() - 300)));
      
      // Check for truncation indicators
      if (content.contains("...") || content.contains("(nội dung như trên)")) {
        log.warn("[Gemini] ⚠️ Possible truncated content detected in response");
      }
      
      // Try to parse content as JSON if it looks like markdown-wrapped JSON
      Object parsedContent = content; // Default to raw string
      
      if (content.contains("```json") || (content.contains("{") && content.contains("}"))) {
        try {
          // Extract JSON from markdown if present
          String jsonStr = content.trim();
          
          // ✅ FIX: Remove markdown code block markers - ONLY at start/end, not all occurrences
          // Remove opening ```json or ```
          if (jsonStr.startsWith("```json")) {
            jsonStr = jsonStr.substring(7).trim(); // Remove "```json"
          } else if (jsonStr.startsWith("```")) {
            jsonStr = jsonStr.substring(3).trim(); // Remove "```"
          }
          
          // Remove closing ```
          if (jsonStr.endsWith("```")) {
            jsonStr = jsonStr.substring(0, jsonStr.length() - 3).trim();
          }
          
          // Now jsonStr should be clean JSON without markdown wrappers
          log.debug("[Gemini] After removing markdown: first 100 chars: {}", 
              jsonStr.substring(0, Math.min(100, jsonStr.length())));
          
          // Try to parse as JSON object directly
          try {
            parsedContent = JSONObject.parse(jsonStr);
            log.info("[Gemini] ✅ Successfully parsed content as JSON object");
          } catch (Exception e) {
            // If parse fails, try to extract just the JSON part (find first { and last })
            log.debug("[Gemini] Direct parse failed, trying to extract JSON: {}", e.getMessage());
            int firstBrace = jsonStr.indexOf('{');
            int lastBrace = jsonStr.lastIndexOf('}');
            
            if (firstBrace != -1 && lastBrace != -1 && lastBrace > firstBrace) {
              String jsonContent = jsonStr.substring(firstBrace, lastBrace + 1);
              try {
                parsedContent = JSONObject.parse(jsonContent);
                log.info("[Gemini] ✅ Successfully parsed extracted JSON");
              } catch (Exception e2) {
                log.warn("[Gemini] ⚠️ JSON parse failed even after extraction: {}", e2.getMessage());
                parsedContent = content; // Keep original string
              }
            } else {
              log.warn("[Gemini] ⚠️ Could not find JSON braces in content");
              parsedContent = content; // Keep original string
            }
          }
        } catch (Exception e) {
          log.debug("[Gemini] Exception while trying to parse JSON content: {}", e.getMessage());
          parsedContent = content; // Fallback to raw string
        }
      }
      
      // ✅ Wrap success response - CHUẨN CLIENT: success=true, result=data (không phải error/content)
      Map<String, Object> successResponse = new HashMap<>();
      successResponse.put("success", true);
      successResponse.put("result", parsedContent);  // ← KEY: "result" để client có thể lấy
      successResponse.put("provider", "Gemini");
      successResponse.put("timestamp", System.currentTimeMillis());
      
      ObjectMapper mapper = new ObjectMapper();
      return mapper.writeValueAsString(successResponse);
    } catch (Exception e) {
      log.error("Error parsing Gemini response: " + e.getMessage());
      return "";
    }
  }

  /**
   * Tạo JSON error response với message và error code.
   * Được sử dụng khi có lỗi để confirm response là JSON.
   */
  private String createErrorJson(String message, String errorCode) {
    try {
      Map<String, Object> errorResponse = new HashMap<>();
      errorResponse.put("success", false);  // ← CHUẨN CLIENT: success=false
      errorResponse.put("errorCode", errorCode);
      errorResponse.put("message", message);
      errorResponse.put("timestamp", System.currentTimeMillis());
      
      ObjectMapper mapper = new ObjectMapper();
      return mapper.writeValueAsString(errorResponse);
    } catch (Exception e) {
      // Fallback nếu không thể tạo JSON
      log.error("Failed to create error JSON: {}", e.getMessage());
      return "{\"success\":false,\"errorCode\":\"JSON_ERROR\",\"message\":\"Lỗi tạo response\"}";
    }
  }

  private String createErrorJsonWithRetry(String message, String errorCode, int retryAfterSeconds) {
    try {
      Map<String, Object> errorResponse = new HashMap<>();
      errorResponse.put("success", false);  // ← CHUẨN CLIENT: success=false
      errorResponse.put("errorCode", errorCode);
      errorResponse.put("message", message);
      errorResponse.put("retryAfterSeconds", retryAfterSeconds);
      errorResponse.put("timestamp", System.currentTimeMillis());
      
      ObjectMapper mapper = new ObjectMapper();
      return mapper.writeValueAsString(errorResponse);
    } catch (Exception e) {
      log.error("Failed to create error JSON: {}", e.getMessage());
      return "{\"success\":false,\"errorCode\":\"JSON_ERROR\",\"message\":\"Lỗi tạo response\"";
    }
  }
  
  /**
   * Trích xuất thông tin quota từ error message
   */
  private String extractQuotaInfoFromError(String errorMsg) {
    if (errorMsg == null) return "";
    
    // Tìm thông tin retry delay
    if (errorMsg.contains("retryDelay") || errorMsg.contains("retry in")) {
      try {
        int startIdx = errorMsg.indexOf("retry");
        int endIdx = errorMsg.indexOf("s", startIdx);
        if (startIdx > 0 && endIdx > startIdx) {
          return errorMsg.substring(startIdx, Math.min(endIdx + 1, startIdx + 50));
        }
      } catch (Exception e) {
        log.debug("Could not extract quota info: {}", e.getMessage());
      }
    }
    return "";
  }

  // ===== Implementation of AIProvider interface =====
  
  @Override
  public boolean isAvailable() {
    // Gemini luôn sẵn sàng nếu có ít nhất 1 API key khả dụng
    return apiKeyService.getAvailableApiKey() != null;
  }
  
  @Override
  public String getName() {
    return "Gemini";
  }
  
  @Override
  public String getQuotaInfo() {
    StringBuilder info = new StringBuilder("Gemini (");
    info.append(availableModels.size()).append(" models): ");
    
    for (ModelQuota quota : modelQuotaMap.values()) {
      info.append(quota.getQuotaInfo()).append(" | ");
    }
    
    return info.toString();
  }

  /**
   * Shutdown method để cleanup resources - gọi khi application stop.
   */
  public void shutdown() {
    executorService.shutdown();
    try {
      if (!executorService.awaitTermination(10, TimeUnit.SECONDS)) {
        executorService.shutdownNow();
      }
    } catch (InterruptedException e) {
      log.error("Error shutting down executor service: " + e.getMessage());
      executorService.shutdownNow();
    }
  }
}