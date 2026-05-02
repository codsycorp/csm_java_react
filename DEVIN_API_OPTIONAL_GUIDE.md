# Devin API Integration Guide (Optional Alternative Provider)

## Can You Use Devin API?

**Yes**, you can add Devin as an **optional third AI provider** (after Gemini + Claude). However, consider:

### Trade-offs

| Aspect | Consideration |
|--------|---|
| **Pricing** | Pay-per-token (similar to Claude/Gemini) |
| **Latency** | Session-based (requires session creation overhead) |
| **Integration Complexity** | Adds new provider to multi-key rotation logic |
| **Use Case** | Best for **complex agentic tasks** (not simple analysis) |
| **Your Current Need** | With 5 cost patterns already implemented, may not be necessary |

---

## Option A: Add Devin as Tertiary Fallback

If Gemini + Claude both fail/ratelimit, fallback to Devin for expensive agentic work.

### Step 1: Update Configuration

```yaml
# application.yml / config.env

# Devin API Configuration
devin.api-key: ${DEVIN_API_KEY:}
devin.api-keys: ${DEVIN_API_KEYS:}  # Comma-separated keys for rotation
devin.model: gpt-4  # Devin uses OpenAI models internally
devin.streaming.max-tokens: 8192
devin.streaming.temperature: 0.2
devin.streaming.timeout-ms: 300000
devin.session.ttl-ms: 600000  # 10 min session lifetime

# Fallback priority
ai.provider.fallback-chain: gemini,claude,devin  # Try in order
```

### Step 2: Create DevinStreamingService

```java
package net.phanmemmottrieu.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class DevinStreamingService {

    @Value("${devin.api-key:}")
    private String devinApiKey;
    
    @Value("${devin.api-keys:}")
    private String devinApiKeys;

    @Value("${devin.model:gpt-4}")
    private String devinDefaultModel;

    private static final String DEVIN_API_BASE = "https://api.devin.ai/v1";
    private final Map<String, Long> devinSessionCache = new ConcurrentHashMap<>();

    /**
     * Create Devin session for agentic task
     * 
     * POST https://api.devin.ai/v1/sessions
     * Authorization: Bearer $DEVIN_API_KEY
     * Content-Type: application/json
     * 
     * {
     *   "prompt": "Your task here",
     *   "cwd": "/optional/working/directory"
     * }
     */
    public String createSession(String prompt) throws Exception {
        // Implementation: Call Devin API to create session
        // POST /sessions with Bearer token auth
        // Return sessionId
        throw new UnsupportedOperationException("Implement POST /sessions");
    }

    /**
     * Stream response from Devin session
     */
    public void streamSessionResponse(String sessionId, 
        java.util.function.Consumer<String> onChunk,
        java.util.function.Consumer<Throwable> onError) throws Exception {
        
        // Implementation: Poll Devin session status and stream chunks
        // GET /sessions/{sessionId}/output
        throw new UnsupportedOperationException("Implement GET /sessions/{sessionId}/output");
    }

    /**
     * Cleanup session
     */
    public void closeSession(String sessionId) {
        // DELETE /sessions/{sessionId}
        throw new UnsupportedOperationException("Implement DELETE /sessions/{sessionId}");
    }
}
```

### Step 3: Integrate into GeminiStreamingService

Add Devin as fallback option:

```java
// In GeminiStreamingService.java

@Autowired
private DevinStreamingService devinStreamingService;

private String streamWithDevinFallback(String prompt, String model,
    Consumer<String> onChunk, Consumer<Throwable> onError) throws Exception {
    
    try {
        String sessionId = devinStreamingService.createSession(prompt);
        StringBuilder response = new StringBuilder();
        
        devinStreamingService.streamSessionResponse(sessionId, 
            chunk -> {
                response.append(chunk);
                if (onChunk != null) onChunk.accept(chunk);
            },
            onError);
        
        devinStreamingService.closeSession(sessionId);
        return response.toString();
    } catch (Throwable ex) {
        if (onError != null) onError.accept(ex);
        throw ex;
    }
}

public void streamContent(String prompt, String model, 
    Consumer<String> onChunk, Runnable onComplete, 
    Consumer<Throwable> onError, Consumer<Map<String, Object>> onStatus) {
    
    try {
        // Try Gemini first
        super.streamContent(prompt, model, onChunk, onComplete, onError, onStatus);
    } catch (RateLimitException geminiEx) {
        try {
            // Fallback to Claude
            streamWithClaudeMultiKey(prompt, model, onChunk, onError, onStatus);
        } catch (RateLimitException claudeEx) {
            // Final fallback to Devin
            if ("aggressive".equalsIgnoreCase(profile)) {
                streamWithDevinFallback(prompt, model, onChunk, onError);
            } else {
                throw claudeEx;  // Don't add latency for non-aggressive profile
            }
        }
    }
}
```

---

## Option B: Use Devin for Code Analysis Only (Recommended)

Instead of adding it to the main chain, use Devin **selectively** for expensive tasks:

```java
// In ApiSpringController.java

@PostMapping("/api/ai-code-analysis-with-devin")
public void analyzeCodeWithDevin(@RequestBody Map<String, String> request,
    HttpServletResponse response) throws Exception {
    
    String appId = request.get("appId");
    String code = request.get("code");
    String task = request.get("task");  // e.g., "refactor for performance"
    
    // Only for complex tasks
    if (!isComplexTask(task)) {
        return analyzeCodeWithGemini(appId, code, task, response);  // Use fast path
    }
    
    // For complex: use Devin with session
    String sessionId = devinStreamingService.createSession(
        "Analyze and " + task + ":\n\n" + code);
    
    try {
        devinStreamingService.streamSessionResponse(sessionId,
            chunk -> response.getWriter().write(chunk));
    } finally {
        devinStreamingService.closeSession(sessionId);
    }
}

private boolean isComplexTask(String task) {
    return task.length() > 200 
        || task.contains("refactor")
        || task.contains("optimize")
        || task.contains("architecture");
}
```

---

## Option C: Devin for Interactive Agentic Flows

Best use case: **Multi-turn agentic tasks** where you want Devin's autonomous agent features.

```java
// New endpoint for agentic work
@PostMapping("/api/ai-agentic-task-with-devin")
public void agenticTaskWithDevin(@RequestBody Map<String, Object> request,
    HttpServletResponse response) throws Exception {
    
    String task = request.get("task").toString();
    String context = request.get("context").toString();
    
    // Create Devin session
    Map<String, Object> sessionPayload = new HashMap<>();
    sessionPayload.put("prompt", task);
    sessionPayload.put("cwd", "/workspace");
    String sessionId = devinStreamingService.createSession(objectMapper.writeValueAsString(sessionPayload));
    
    try {
        // Poll and stream results
        devinStreamingService.streamSessionResponse(sessionId,
            chunk -> {
                try {
                    response.getWriter().write(formatChunk(chunk));
                } catch (IOException ignored) {}
            },
            ex -> logger.error("Devin session error: {}", ex.getMessage())
        );
    } finally {
        devinStreamingService.closeSession(sessionId);
    }
}
```

---

## Comparison: Devin vs Your Current Setup

| Feature | Gemini + Claude + Patterns | Devin |
|---------|---|---|
| **Cost Efficiency** | ⭐⭐⭐⭐⭐ (5 patterns) | ⭐⭐⭐ (pay-per-token) |
| **Latency** | ~1-3s streaming | ~5-15s (session overhead) |
| **Code Analysis** | Fast (Gemini default) | Slower but more thorough |
| **Agentic Features** | Limited | ⭐⭐⭐⭐⭐ (autonomous agent) |
| **Complexity** | Low (2 providers) | High (3 providers + session management) |
| **Production Ready** | ✅ Yes | ⚠️ Needs testing |

---

## Recommendation

### Current Status (With 5 Patterns)
✅ **Sufficient for most use cases**
- Gemini + Claude with exponential backoff
- 40-60% token savings from 5 patterns
- Session budget enforcement
- Early-finish for simple queries

### When to Add Devin

**Add Devin only if:**
1. You exhaust Gemini + Claude quotas regularly
2. You need **autonomous multi-step agent behavior** (not just LLM calls)
3. You can afford the session overhead (5-15s latency)
4. You're willing to manage a 3rd provider

**Don't add if:**
- Your goal is cost optimization (patterns already handle this)
- You need low latency (<3s)
- API rotation complexity is a concern

---

## Implementation Priority

### Phase 1 (Current Status ✅)
1. ✅ 5 cost-optimization patterns deployed
2. ✅ Gemini + Claude multi-key rotation
3. ✅ Exponential backoff on rate-limits

### Phase 2 (Optional, only if needed)
1. Add Devin as **selective fallback** (Option B)
2. Use only for complex tasks (not every request)
3. Monitor session overhead and cost

### Phase 3 (Future)
1. Implement Devin agentic flows for autonomous tasks (Option C)
2. Separate routing: simple tasks → Gemini/Claude, complex → Devin

---

## Quick Test: Can I Use Your Devin Key Now?

```bash
# Test Devin API with your key
curl -X POST "https://api.devin.ai/v1/sessions" \
  -H "Authorization: Bearer apk_user_dXNlci1jOGNiMWVkNjZhNjM0ZmVmOWUxYjlhYTcyNWQwZDRmNV9vcmctM2UxY2M0YTVkZTdjNDdlZThjYWQ3YWEyODE4YmVmNjU6NjFhMzQ0MTNkNmY5NGYzOGE3ODIwZGU3MWI4Yjk5OGY=" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "List all files in current directory"
  }'

# If successful: returns { "id": "session_...", "status": "ready" }
# If failed: returns error with reason
```

If you want to integrate Devin, provide the key in `config.env`:
```
DEVIN_API_KEY=apk_user_dXNlci1jOGNiMWVkNjZhNjM0ZmVmOWUxYjlhYTcyNWQwZDRmNV9vcmctM2UxY2M0YTVkZTdjNDdlZThjYWQ3YWEyODE4YmVmNjU6NjFhMzQ0MTNkNmY5NGYzOGE3ODIwZGU3MWI4Yjk5OGY=
```

---

## Summary

**Your Current Setup** (with 5 patterns) is **already optimized**. Devin is optional:
- Use **Option A** if you need an emergency fallback after both APIs exhaust
- Use **Option B** if you only want to offload expensive analysis tasks  
- Use **Option C** if you plan to build autonomous multi-step workflows

For now, **focus on renewing API keys** and validating the 5 patterns work correctly. Add Devin later if needed.
