package net.phanmemmottrieu.service;

import com.knuddels.jtokkit.Encodings;
import com.knuddels.jtokkit.api.Encoding;
import com.knuddels.jtokkit.api.EncodingRegistry;
import com.knuddels.jtokkit.api.EncodingType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Token-aware context budget manager.
 *
 * <p>Replaces the crude {@code prompt.length() / 4} heuristic in
 * {@link AiAssistantGatewayService} with accurate JTokkit-based token counting
 * (cl100k_base for GPT-4 family, o200k_base for GPT-4o-mini / newer models).
 *
 * <p>Core responsibilities:
 * <ol>
 *   <li>Accurate token counting per model family.</li>
 *   <li>Slot-based context fitting: each piece of context is a
 *       {@link ContextSlot} with a priority and a trim strategy.
 *       Low-priority slots (project Java files, knowledge md) are trimmed
 *       first; authoritative slots (user message, current JSON) are never
 *       trimmed.</li>
 *   <li>Skeletonize Java project context: collapse method bodies to
 *       signatures to save ~70-80 % of tokens while preserving structure.</li>
 *   <li>Keyword-based section extraction for Markdown knowledge files.</li>
 * </ol>
 */
@Component
public class ContextBudgetManager {

  private static final Logger log = LoggerFactory.getLogger(ContextBudgetManager.class);

  // ─── Config ────────────────────────────────────────────────────────────────

  @Value("${context.budget.enabled:true}")
  private boolean enabled;

  /** Tokens reserved for model output. Subtracted from model limit to get max input budget. */
  @Value("${context.budget.output-reserve-tokens:8192}")
  private int outputReserveTokens;

  /**
   * Safety margin applied on top of outputReserveTokens to avoid off-by-one
   * issues between different tokenizers (JTokkit vs server-side).
   */
  @Value("${context.budget.input-safety-margin-tokens:512}")
  private int inputSafetyMarginTokens;

  // ─── JTokkit registry ───────────────────────────────────────────────────────

  private final EncodingRegistry registry = Encodings.newDefaultEncodingRegistry();

  // ─── Public API: Token counting ────────────────────────────────────────────

  public boolean isEnabled() {
    return enabled;
  }

  /**
   * Count tokens in {@code text} using the encoding most appropriate for
   * {@code modelName}.
   *
   * <p>Falls back to {@code text.length() / 4} if JTokkit fails.
   */
  public int countTokens(String text, String modelName) {
    if (text == null || text.isBlank()) return 0;
    if (!enabled) return text.length() / 4;
    try {
      Encoding enc = resolveEncoding(modelName);
      return enc.countTokensOrdinary(text);
    } catch (Exception e) {
      log.debug("JTokkit failed for model '{}', falling back to char/4: {}", modelName, e.getMessage());
      return text.length() / 4;
    }
  }

  /** Count tokens using default encoding (cl100k_base). */
  public int countTokens(String text) {
    return countTokens(text, null);
  }

  /**
   * Compute the effective maximum input token budget for a model, accounting
   * for output reserve and safety margin.
   *
   * @param modelName      display name or API name (e.g. "GPT-4.1", "gpt-4o")
   * @param outputTokens   requested max output tokens (honours configured reserve if 0)
   */
  public int computeInputBudget(String modelName, int outputTokens) {
    int modelLimit = getModelContextLimit(modelName);
    int reserve = Math.max(outputReserveTokens, outputTokens > 0 ? outputTokens : outputReserveTokens);
    return Math.max(1000, modelLimit - reserve - inputSafetyMarginTokens);
  }

  // ─── Public API: Slot-based budget fitting ──────────────────────────────────

  /** How to trim a slot when it doesn't fit in the remaining budget. */
  public enum TrimStrategy {
    /** Always include in full — never trim. Use for user message, authoritative JSON, guardrails. */
    KEEP,
    /** Keep the tail (most recent) of the text, drop the head. Use for session history. */
    TAIL_TRIM,
    /** Keep the head, drop the tail. Use for structured reference docs where intro matters. */
    HEAD_TRIM,
    /** Extract only public class / method signatures. Use for crawled Java files. */
    SKELETON,
    /** Extract sections whose headings/content match the query hint. Use for knowledge .md files. */
    KEYWORD_SNIPPET,
    /** Trim JSON arrays to first few items while preserving overall structure. Use for large JSON payloads. */
    JSON_SKELETON,
    /** Proportional middle-trim: keep both head and tail, remove middle. */
    PROPORTIONAL,
  }

  /**
   * A named piece of context with a priority and trim strategy.
   *
   * @param name      Unique name for this slot (used for reconstruction order tracking).
   * @param content   Raw text content.
   * @param priority  0–9 inclusive. Higher = harder to drop. KEEP slots are always included.
   * @param strategy  How to trim this slot when it doesn't fit.
   * @param queryHint Keyword hint used by {@link TrimStrategy#KEYWORD_SNIPPET}.
   */
  public record ContextSlot(
      String name,
      String content,
      int priority,
      TrimStrategy strategy,
      String queryHint
  ) {
    public ContextSlot(String name, String content, int priority, TrimStrategy strategy) {
      this(name, content, priority, strategy, null);
    }
  }

  /**
   * Fit a list of context slots into {@code maxInputTokens}.
   *
   * <p>Algorithm:
   * <ol>
   *   <li>KEEP slots are always included at full length (counted against budget).</li>
   *   <li>Remaining slots are processed from highest to lowest priority.</li>
   *   <li>Each slot is included at full length if it fits; otherwise its trim
   *       strategy is applied. If still empty after trimming, it is dropped.</li>
   *   <li>Slots are reconstructed in their original list order.</li>
   * </ol>
   *
   * @param slots         List of context pieces in desired output order.
   * @param maxInputTokens Maximum number of input tokens for the fitted prompt.
   * @param modelName      Used for token counting; pass null for default cl100k_base.
   * @return Concatenated, budget-fitted prompt string.
   */
  public String fitToTokenBudget(List<ContextSlot> slots, int maxInputTokens, String modelName) {
    if (slots == null || slots.isEmpty()) return "";
    if (!enabled) {
      return slots.stream()
          .filter(s -> s.content() != null && !s.content().isBlank())
          .map(ContextSlot::content)
          .collect(Collectors.joining("\n\n"));
    }

    int safeMax = Math.max(1000, maxInputTokens);

    // --- Pass 1: reserve budget for KEEP slots ---
    int usedTokens = 0;
    Map<String, String> fittedContent = new LinkedHashMap<>();
    List<ContextSlot> toFit = new ArrayList<>();

    for (ContextSlot slot : slots) {
      if (slot == null || slot.content() == null || slot.content().isBlank()) continue;
      if (slot.strategy() == TrimStrategy.KEEP) {
        int t = countTokens(slot.content(), modelName);
        usedTokens += t;
        fittedContent.put(slot.name(), slot.content());
        log.debug("ContextBudgetManager [KEEP] slot='{}' tokens={}", slot.name(), t);
      } else {
        toFit.add(slot);
      }
    }

    if (usedTokens > safeMax) {
      log.warn("ContextBudgetManager: KEEP slots alone ({} tokens) exceed budget ({} tokens). " +
               "Consider raising context.budget.output-reserve-tokens or reducing authoritative content.",
               usedTokens, safeMax);
    }

    // --- Pass 2: sort non-KEEP slots by priority desc and fit ---
    List<ContextSlot> sortedToFit = toFit.stream()
        .sorted((a, b) -> Integer.compare(b.priority(), a.priority()))
        .toList();

    int remaining = safeMax - usedTokens;
    for (ContextSlot slot : sortedToFit) {
      if (remaining <= 0) {
        log.debug("ContextBudgetManager: budget exhausted, dropping slot='{}'", slot.name());
        continue;
      }
      int slotTokens = countTokens(slot.content(), modelName);
      if (slotTokens <= remaining) {
        fittedContent.put(slot.name(), slot.content());
        remaining -= slotTokens;
        log.debug("ContextBudgetManager [FULL] slot='{}' tokens={}", slot.name(), slotTokens);
      } else {
        String trimmed = applyTrimStrategy(slot, remaining, modelName);
        if (trimmed != null && !trimmed.isBlank()) {
          int trimmedTokens = countTokens(trimmed, modelName);
          fittedContent.put(slot.name(), trimmed);
          remaining -= trimmedTokens;
          log.debug("ContextBudgetManager [TRIMMED] slot='{}' originalTokens={} trimmedTokens={}",
              slot.name(), slotTokens, trimmedTokens);
        } else {
          log.debug("ContextBudgetManager: trim produced empty result, dropping slot='{}'", slot.name());
        }
      }
    }

    // --- Reconstruct in original list order ---
    List<String> parts = new ArrayList<>();
    for (ContextSlot slot : slots) {
      if (slot == null) continue;
      String fitted = fittedContent.get(slot.name());
      if (fitted != null && !fitted.isBlank()) {
        parts.add(fitted);
      }
    }

    String result = String.join("\n\n", parts);
    log.info("ContextBudgetManager fit: budget={} used={} outputChars={} slots={}",
        maxInputTokens, maxInputTokens - remaining, result.length(), slots.size());
    return result;
  }

  // ─── Trim strategies ────────────────────────────────────────────────────────

  private String applyTrimStrategy(ContextSlot slot, int targetTokens, String modelName) {
    String content = slot.content();
    // Use chars as a fast proxy within the strategy implementations
    int targetChars = Math.max(300, targetTokens * 4);

    return switch (slot.strategy()) {
      case TAIL_TRIM -> {
        if (content.length() <= targetChars) yield content;
        yield "...[earlier context trimmed for token budget]...\n"
            + content.substring(content.length() - Math.max(targetChars - 60, 200));
      }
      case HEAD_TRIM -> {
        if (content.length() <= targetChars) yield content;
        yield content.substring(0, Math.max(targetChars - 60, 200))
            + "\n...[content trimmed for token budget]...";
      }
      case SKELETON -> skeletonizeJavaContext(content, targetTokens);
      case KEYWORD_SNIPPET -> extractRelevantSections(content, slot.queryHint(), targetTokens);
      case JSON_SKELETON -> trimJsonSkeleton(content, targetTokens);
      case PROPORTIONAL -> {
        if (content.length() <= targetChars) yield content;
        int head = targetChars / 2;
        int tail = targetChars / 3;
        int safeHead = Math.max(100, Math.min(head, content.length()));
        int safeTail = Math.max(0, Math.min(tail, content.length() - safeHead));
        yield content.substring(0, safeHead)
            + "\n...[TRIMMED_FOR_BUDGET]...\n"
            + (safeTail > 0 ? content.substring(content.length() - safeTail) : "");
      }
      default -> {
        if (content.length() <= targetChars) yield content;
        yield content.substring(0, Math.max(targetChars - 30, 100))
            + "\n...[trimmed]...";
      }
    };
  }

  // ─── Skeletonize Java context ───────────────────────────────────────────────

  /**
    * Reduce a Java project context block to class + public method signatures only.
   * Drops method bodies, field declarations, and imports.
   * Typically reduces tokens by 65–80 %.
   *
   * @param javaContext   Raw multi-file Java context string.
   * @param maxTokens     Approximate token target for the result.
   */
  public String skeletonizeJavaContext(String javaContext, int maxTokens) {
    if (javaContext == null || javaContext.isBlank()) return "";
    int targetChars = Math.max(500, maxTokens * 4);
    if (javaContext.length() <= targetChars) return javaContext;

    StringBuilder sb = new StringBuilder("## Project Structure (skeleton — method bodies omitted)\n\n");
    String[] lines = javaContext.split("\n");
    int approxChars = sb.length();
    boolean inMethod = false;
    int braceDepth = 0;

    for (String line : lines) {
      if (approxChars >= targetChars) {
        sb.append("\n...[remaining files omitted — token budget]...\n");
        break;
      }

      String trimmed = line.stripLeading();

      // File heading — always include
      if (trimmed.startsWith("### ") || trimmed.startsWith("## ")) {
        sb.append(line).append("\n");
        approxChars += line.length() + 1;
        inMethod = false;
        braceDepth = 0;
        continue;
      }

      // Annotations useful for understanding structure
      if (trimmed.startsWith("@Service") || trimmed.startsWith("@RestController")
          || trimmed.startsWith("@Component") || trimmed.startsWith("@Repository")
          || trimmed.startsWith("@Entity") || trimmed.startsWith("@Table(")) {
        sb.append(line).append("\n");
        approxChars += line.length() + 1;
        continue;
      }

      // Class / interface declaration
      if (trimmed.startsWith("public class ") || trimmed.startsWith("public interface ")
          || trimmed.startsWith("public abstract class ") || trimmed.startsWith("public enum ")
          || trimmed.startsWith("public record ") || trimmed.startsWith("public sealed ")) {
        sb.append(line).append("\n");
        approxChars += line.length() + 1;
        inMethod = false;
        braceDepth = 0;
        continue;
      }

      // Public method / constructor signature
      if (!inMethod && (trimmed.startsWith("public ") || trimmed.startsWith("protected "))
          && trimmed.contains("(")) {
        // Emit signature only (up to opening brace)
        String sig = trimmed.contains("{")
            ? trimmed.substring(0, trimmed.indexOf("{")).trim() + " { ... }"
            : trimmed;
        String indent = "  "; // normalise indentation
        sb.append(indent).append(sig).append("\n");
        approxChars += sig.length() + 3;
        // Track brace depth to skip body
        inMethod = trimmed.endsWith("{") || trimmed.contains("{");
        braceDepth = inMethod ? 1 : 0;
        continue;
      }

      // While inside a method body, track braces to detect end
      if (inMethod) {
        for (char c : trimmed.toCharArray()) {
          if (c == '{') braceDepth++;
          else if (c == '}') braceDepth--;
        }
        if (braceDepth <= 0) {
          inMethod = false;
          braceDepth = 0;
        }
        // skip body lines
      }
    }

    return sb.toString();
  }

  // ─── Keyword-based Markdown section extraction ──────────────────────────────

  /**
   * Extract the sections of a Markdown file most relevant to {@code query},
   * ranked by keyword overlap with heading and body text.
   *
   * @param markdown  Full markdown content.
   * @param query     Search query / task hint for relevance scoring.
   * @param maxTokens Approximate token target for the result.
   */
  public String extractRelevantSections(String markdown, String query, int maxTokens) {
    if (markdown == null || markdown.isBlank()) return "";
    int targetChars = Math.max(500, maxTokens * 4);
    if (markdown.length() <= targetChars) return markdown;

    if (query == null || query.isBlank()) {
      return markdown.substring(0, Math.min(targetChars, markdown.length()))
          + "\n...[truncated — no query hint]...";
    }

    // Split into sections at ## / ### boundaries
    String[] lines = markdown.split("\n");
    List<Section> sections = new ArrayList<>();
    StringBuilder body = new StringBuilder();
    String heading = "";

    for (String line : lines) {
      if (line.startsWith("## ") || line.startsWith("### ")) {
        sections.add(new Section(heading, body.toString()));
        heading = line;
        body = new StringBuilder();
      } else {
        body.append(line).append("\n");
      }
    }
    sections.add(new Section(heading, body.toString()));

    // Score sections by keyword overlap
    String[] queryWords = query.toLowerCase().split("[\\s,;:./\\-_|]+");
    List<ScoredSection> scored = new ArrayList<>();
    for (Section s : sections) {
      if (s.heading().isBlank() && s.body().isBlank()) continue;
      String combined = (s.heading() + " " + s.body()).toLowerCase();
      int score = 0;
      for (String w : queryWords) {
        if (w.length() > 2 && combined.contains(w)) score++;
      }
      scored.add(new ScoredSection(score, s));
    }
    scored.sort((a, b) -> Integer.compare(b.score(), a.score()));

    // Build output from highest-scored sections
    StringBuilder result = new StringBuilder();
    int usedChars = 0;
    for (ScoredSection ss : scored) {
      String h = ss.section().heading();
      String bdy = ss.section().body();
      int len = h.length() + bdy.length() + 2;
      if (usedChars + len > targetChars) {
        int remaining = targetChars - usedChars - h.length() - 2;
        if (remaining > 100 && !h.isBlank()) {
          result.append(h).append("\n");
          result.append(bdy, 0, Math.min(remaining, bdy.length()));
          result.append("\n...[section trimmed — token budget]...\n");
        }
        break;
      }
      if (!h.isBlank()) result.append(h).append("\n");
      result.append(bdy).append("\n");
      usedChars += len;
    }

    return result.toString();
  }

  // ─── JSON skeleton ──────────────────────────────────────────────────────────

  /**
   * Trim a JSON payload to fit within the token budget.
   * For arrays: keeps the first few items and adds an ellipsis comment.
   * For objects: truncates at targetChars.
   */
  public String trimJsonSkeleton(String json, int maxTokens) {
    if (json == null || json.isBlank()) return "";
    int targetChars = Math.max(200, maxTokens * 4);
    if (json.length() <= targetChars) return json;

    String trimmed = json.trim();
    if (trimmed.startsWith("[")) {
      // Array: keep first ~5 items
      int depth = 0;
      int itemCount = 0;
      int keptEnd = 0;
      for (int i = 0; i < trimmed.length() && keptEnd < targetChars - 80; i++) {
        char c = trimmed.charAt(i);
        if (c == '{' || c == '[') depth++;
        if (c == '}' || c == ']') {
          depth--;
          if (depth == 1) { // closed an array item
            itemCount++;
            keptEnd = i + 1;
            if (itemCount >= 5) break;
          }
        }
      }
      if (keptEnd > 0 && keptEnd < trimmed.length() - 5) {
        return trimmed.substring(0, keptEnd) + "\n  // ...[array trimmed for token budget]...\n]";
      }
    }

    return json.substring(0, targetChars - 40) + "\n// ...[JSON trimmed for token budget]...";
  }

  // ─── Model context limits ───────────────────────────────────────────────────

  /**
   * Return the known context-window token limit for a given model name.
   * Conservative values to stay within documented limits.
   */
  public int getModelContextLimit(String modelName) {
    if (modelName == null || modelName.isBlank()) return 32000;
    String lower = modelName.toLowerCase();
    if (lower.contains("claude opus") || lower.contains("claude-opus")) return 180000;
    if (lower.contains("claude")) return 180000;
    if (lower.contains("gemini 2.5 pro") || lower.contains("gemini-2.5-pro")) return 1000000;
    if (lower.contains("gemini 2.5") || lower.contains("gemini-2.5")) return 1000000;
    if (lower.contains("gemini 2.0") || lower.contains("gemini-2.0")) return 1000000;
    if (lower.contains("gemini")) return 128000;
    if (lower.contains("gpt-5") || lower.contains("gpt 5")) return 128000;
    if (lower.contains("gpt-4.1") || lower.contains("gpt 4.1")) return 128000;
    if (lower.contains("gpt-4o") || lower.contains("gpt 4o")) return 128000;
    if (lower.contains("gpt-4")) return 128000;
    if (lower.contains("grok")) return 128000;
    return 32000;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private Encoding resolveEncoding(String modelName) {
    if (modelName == null || modelName.isBlank()) {
      return registry.getEncoding(EncodingType.CL100K_BASE);
    }
    String lower = modelName.toLowerCase();
    // o200k_base: GPT-4o family, GPT-4.1, GPT-5, o1, o3
    if (lower.contains("gpt-4o") || lower.contains("gpt 4o")
        || lower.contains("gpt-4.1") || lower.contains("gpt 4.1")
        || lower.contains("gpt-5") || lower.contains("gpt 5")
        || lower.contains("o1-") || lower.contains("o3-")) {
      try {
        return registry.getEncoding(EncodingType.O200K_BASE);
      } catch (Exception ignore) {
        // fall through to cl100k
      }
    }
    // cl100k_base: GPT-4, GPT-3.5, Claude, most others
    return registry.getEncoding(EncodingType.CL100K_BASE);
  }

  // ─── Private data holders ───────────────────────────────────────────────────

  private record Section(String heading, String body) {}
  private record ScoredSection(int score, Section section) {}
}
