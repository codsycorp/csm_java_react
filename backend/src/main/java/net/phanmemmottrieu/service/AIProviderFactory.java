package net.phanmemmottrieu.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Factory để lựa chọn AI provider phù hợp dựa trên quota và availability.
 * 
 * Chiến lược:
 * 1. Chỉ sử dụng Gemini (theo quota miễn phí của các model)
 * 2. Trả về error nếu hết quota
 * 
 * @author Mr.Anh
 */
@Slf4j
@Service
public class AIProviderFactory {

  private final List<AIProvider> providers;
  
  private final ObjectMapper objectMapper = new ObjectMapper();

  private enum ProviderChainMode {
    LOCAL_ONLY,
    HYBRID
  }

  private static final class ProviderChainBuilder {
    private final List<AIProvider> orderedProviders = new ArrayList<>();

    ProviderChainBuilder addIfUsable(AIProvider provider) {
      if (provider != null && provider.isAvailable() && !orderedProviders.contains(provider)) {
        orderedProviders.add(provider);
      }
      return this;
    }

    List<AIProvider> build() {
      return Collections.unmodifiableList(new ArrayList<>(orderedProviders));
    }
  }

  private static final class ProviderChainDirector {
    private ProviderChainDirector() {
    }

    static List<AIProvider> buildChain(
        ProviderChainMode mode,
        GeminiService geminiService,
        LlamaCppNativeService llamaCppNativeService,
        boolean preferLocalFirst) {
      ProviderChainBuilder builder = new ProviderChainBuilder();
      if (mode == ProviderChainMode.LOCAL_ONLY) {
        return builder
            .addIfUsable(llamaCppNativeService)
            .build();
      }

      if (preferLocalFirst) {
        builder.addIfUsable(llamaCppNativeService);
        builder.addIfUsable(geminiService);
      } else {
        builder.addIfUsable(geminiService);
        builder.addIfUsable(llamaCppNativeService);
      }
      return builder.build();
    }
  }
  
  /**
   * Constructor - chỉ sử dụng Gemini
   */
  public AIProviderFactory(
      GeminiService geminiService,
      @Autowired(required = false) LlamaCppNativeService llamaCppNativeService,
      @Value("${ai.local.llama.prefer-local-first:false}") boolean preferLocalFirst,
      @Value("${ai.local.only.enabled:false}") boolean localOnlyEnabled) {
    ProviderChainMode mode = localOnlyEnabled ? ProviderChainMode.LOCAL_ONLY : ProviderChainMode.HYBRID;
    this.providers = ProviderChainDirector.buildChain(mode, geminiService, llamaCppNativeService, preferLocalFirst);

    if (localOnlyEnabled) {
      log.info("AIProviderFactory initialized in local-only mode with {} providers", providers.size());
      return;
    }

    log.info("AIProviderFactory initialized with {} providers", providers.size());
  }
  
  /**
   * Gọi AI generator với tự động rotation giữa các providers.
   * 
   * @param prompt Input prompt
   * @return JSON response từ provider (format: {"error": boolean, "message": string, ...})
   */
  public String generateContent(String prompt) {
    if (prompt == null || prompt.isEmpty()) {
      return createErrorJson("Prompt không được để trống", "INVALID_PROMPT");
    }

    if (providers.isEmpty()) {
      return createErrorJson("Local-only mode đang bật nhưng local model chưa sẵn sàng", "LOCAL_PROVIDER_UNAVAILABLE");
    }
    
    int totalProviders = providers.size();
    
    // Trước tiên, try các providers theo thứ tự ưu tiên
    for (int attempt = 0; attempt < totalProviders; attempt++) {
      AIProvider provider = providers.get(attempt);
      
      try {
        if (provider.isAvailable()) {
          log.debug("Using provider: {} (Attempt {}/{})", provider.getName(), attempt + 1, totalProviders);
          String result = provider.generateContent(prompt);
          
          // Kiểm tra xem kết quả có phải error không
          String errorCode = extractErrorCode(result);
          if (errorCode == null) {
            // Success
            log.info("Successfully generated content using: {}", provider.getName());
            return result;
          } else if (errorCode.contains("QUOTA") || errorCode.contains("RATE_LIMIT") || errorCode.contains("TOKENS_EXCEEDED")) {
            // Quota/token exceeded, thử provider tiếp theo
            log.warn("{} quota exceeded: {}. Trying next provider...", provider.getName(), errorCode);
            sleepBackoff(attempt);
            continue;
          } else if (errorCode.equals("CONNECTION_REFUSED")) {
            // Service không chạy, thử provider tiếp theo
            log.warn("{} is not available. Trying next provider...", provider.getName());
            continue;
          } else {
            // Lỗi khác nhưng vẫn return để không waste retry
            log.warn("Provider {} returned error: {}", provider.getName(), errorCode);
            return result;
          }
        } else {
          log.debug("Provider {} is not available (quota exceeded or offline)", provider.getName());
        }
      } catch (Exception e) {
        log.warn("Error using provider {}: {}. Trying next provider...", provider.getName(), e.getMessage());
      }
    }
    
    // Nếu tất cả providers đều failed, return error response
    log.error("All AI providers exhausted or unavailable");
    String allQuotaError = createDetailedQuotaError(prompt);
    return allQuotaError;
  }
  
  /**
   * Lấy thông tin status của tất cả providers
   */
  public String getProvidersStatus() {
    try {
      Map<String, Object> status = new HashMap<>();
      List<Map<String, Object>> providerDetails = new ArrayList<>();
      
      for (AIProvider provider : providers) {
        Map<String, Object> detail = new HashMap<>();
        detail.put("name", provider.getName());
        detail.put("available", provider.isAvailable());
        detail.put("quota", provider.getQuotaInfo());
        providerDetails.add(detail);
      }
      
      status.put("providers", providerDetails);
      status.put("timestamp", System.currentTimeMillis());
      
      return objectMapper.writeValueAsString(status);
    } catch (Exception e) {
      log.error("Error getting providers status: {}", e.getMessage());
      return "{\"error\": \"Cannot get status\"}";
    }
  }
  
  /**
   * Extract error code từ response JSON
   */
  private String extractErrorCode(String response) {
    try {
      @SuppressWarnings("unchecked")
      Map<String, Object> parsed = objectMapper.readValue(response, Map.class);
      if (parsed == null || parsed.isEmpty()) {
        return "EMPTY_RESPONSE";
      }

      // Legacy shape: {"error": true, "errorCode": "..."}
      Object errorFlag = parsed.get("error");
      if (errorFlag instanceof Boolean && (Boolean) errorFlag) {
        Object errorCode = parsed.get("errorCode");
        return errorCode != null ? errorCode.toString() : "UNKNOWN_ERROR";
      }

      // Current provider shape: {"success": false, "errorCode": "..."}
      Object successFlag = parsed.get("success");
      if (successFlag instanceof Boolean && !((Boolean) successFlag)) {
        Object errorCode = parsed.get("errorCode");
        return errorCode != null ? errorCode.toString() : "UNKNOWN_ERROR";
      }
    } catch (Exception e) {
      // Ignore parse errors
    }
    return null; // No error
  }
  
  /**
   * Tạo detailed error message khi tất cả providers hết quota
   */
  private String createDetailedQuotaError(String prompt) {
    try {
      Map<String, Object> errorResponse = new HashMap<>();
      errorResponse.put("error", true);
      errorResponse.put("errorCode", "ALL_PROVIDERS_EXHAUSTED");
      errorResponse.put("retryAfterSeconds", 60);
      
      List<String> quotaInfo = new ArrayList<>();
      for (AIProvider provider : providers) {
        quotaInfo.add(provider.getName() + ": " + provider.getQuotaInfo());
      }
      
        String message = String.join(" | ", quotaInfo) +
          ". Gemini dang het quota. Hay thu lai sau it phut hoac cho reset hang ngay.";
      errorResponse.put("message", message);
      errorResponse.put("providers", quotaInfo);
      errorResponse.put("timestamp", System.currentTimeMillis());
      
      return objectMapper.writeValueAsString(errorResponse);
    } catch (Exception e) {
      log.error("Failed to create error JSON: {}", e.getMessage());
      return "{\"error\":true,\"errorCode\":\"SYSTEM_ERROR\",\"message\":\"Tất cả providers đã hết quota\"}";
    }
  }
  
  private String createErrorJson(String message, String errorCode) {
    try {
      Map<String, Object> errorResponse = new HashMap<>();
      errorResponse.put("error", true);
      errorResponse.put("errorCode", errorCode);
      errorResponse.put("message", message);
      errorResponse.put("timestamp", System.currentTimeMillis());
      
      return objectMapper.writeValueAsString(errorResponse);
    } catch (Exception e) {
      return "{\"error\":true,\"errorCode\":\"JSON_ERROR\",\"message\":\"Lỗi tạo response\"}";
    }
  }

  private void sleepBackoff(int attempt) {
    int delayMs = 300 * Math.max(1, attempt + 1);
    try {
      Thread.sleep(delayMs);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }
}
