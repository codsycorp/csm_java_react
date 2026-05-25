package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Local-only AI provider factory — delegates inference to llama.cpp via {@link LlamaCppNativeService}.
 */
@Service
public class AIProviderFactory {

  private static final Logger log = LoggerFactory.getLogger(AIProviderFactory.class);

  private final List<AIProvider> providers;
  private final ObjectMapper objectMapper = new ObjectMapper();

  public AIProviderFactory(@Autowired(required = false) LlamaCppNativeService llamaCppNativeService) {
    List<AIProvider> chain = new ArrayList<>();
    if (llamaCppNativeService != null && llamaCppNativeService.isAvailable()) {
      chain.add(llamaCppNativeService);
    }
    this.providers = Collections.unmodifiableList(chain);
    log.info("AIProviderFactory initialized (local-only) with {} provider(s)", providers.size());
  }

  public String generateContent(String prompt) {
    if (prompt == null || prompt.isEmpty()) {
      return createErrorJson("Prompt không được để trống", "INVALID_PROMPT");
    }
    if (providers.isEmpty()) {
      return createErrorJson("Local AI provider chưa sẵn sàng", "LOCAL_PROVIDER_UNAVAILABLE");
    }

    AIProvider provider = providers.get(0);
    try {
      if (provider.isAvailable()) {
        log.debug("Using local provider: {}", provider.getName());
        String result = provider.generateContent(prompt);
        String errorCode = extractErrorCode(result);
        if (errorCode == null) {
          log.info("Successfully generated content using: {}", provider.getName());
          return result;
        }
        log.warn("Local provider returned error: {}", errorCode);
        return result;
      }
    } catch (Exception e) {
      log.warn("Local provider error: {}", e.getMessage());
    }

    return createErrorJson("Local AI provider không khả dụng", "LOCAL_PROVIDER_UNAVAILABLE");
  }

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
      status.put("mode", "local_only");
      status.put("timestamp", System.currentTimeMillis());
      return objectMapper.writeValueAsString(status);
    } catch (Exception e) {
      log.error("Error getting providers status: {}", e.getMessage());
      return "{\"error\": \"Cannot get status\"}";
    }
  }

  private String extractErrorCode(String response) {
    try {
      @SuppressWarnings("unchecked")
      Map<String, Object> parsed = objectMapper.readValue(response, Map.class);
      if (parsed == null || parsed.isEmpty()) {
        return "EMPTY_RESPONSE";
      }
      Object errorFlag = parsed.get("error");
      if (errorFlag instanceof Boolean && (Boolean) errorFlag) {
        Object errorCode = parsed.get("errorCode");
        return errorCode != null ? errorCode.toString() : "UNKNOWN_ERROR";
      }
      Object successFlag = parsed.get("success");
      if (successFlag instanceof Boolean && !((Boolean) successFlag)) {
        Object errorCode = parsed.get("errorCode");
        return errorCode != null ? errorCode.toString() : "UNKNOWN_ERROR";
      }
    } catch (Exception ignored) {
      // plain text success
    }
    return null;
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
}
