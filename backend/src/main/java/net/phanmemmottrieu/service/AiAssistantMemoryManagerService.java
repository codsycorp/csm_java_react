package net.phanmemmottrieu.service;

import com.fasterxml.jackson.core.json.JsonReadFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class AiAssistantMemoryManagerService {

  private static final Logger log = LoggerFactory.getLogger(AiAssistantMemoryManagerService.class);
  private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

  private final ObjectMapper objectMapper = new ObjectMapper()
      .configure(JsonReadFeature.ALLOW_UNESCAPED_CONTROL_CHARS.mappedFeature(), true);

  @Value("${ai.assistant.memory-manager.enabled:true}")
  private boolean enabled;

  @Value("${ai.assistant.memory-manager.context-dir:csm_datas/ai_local}")
  private String contextDir;

  @Value("${ai.assistant.memory-manager.max-sources:18}")
  private int maxSources;

  @Value("${ai.assistant.memory-manager.max-summary-per-source-chars:2400}")
  private int maxSummaryPerSourceChars;

  @Value("${ai.assistant.memory-manager.max-global-context-chars:120000}")
  private int maxGlobalContextChars;

  public String buildAndPersistMenuGlobalContext(
      String appId,
      String scopeKey,
      String userMessage,
      String currentCode,
      List<Map<String, Object>> attachments) {
    if (!enabled) {
      return "";
    }
    String safeApp = sanitize(appId, "default");
    String safeScope = sanitize(scopeKey, "menu");

    List<String> blocks = new ArrayList<>();
    String normalizedUserMessage = String.valueOf(userMessage == null ? "" : userMessage).trim();
    if (!normalizedUserMessage.isBlank()) {
      blocks.add("## Active Intent\n" + trimToMax(normalizedUserMessage, 1200));
    }

    String currentCodeSummary = summarizeByType("active_editor", currentCode, "json");
    if (!currentCodeSummary.isBlank()) {
      blocks.add("## Active Editor Summary\n" + currentCodeSummary);
    }

    int usedSources = 0;
    int capSources = Math.max(1, maxSources);
    if (attachments != null) {
      for (Map<String, Object> attachment : attachments) {
        if (usedSources >= capSources) {
          break;
        }
        if (attachment == null) {
          continue;
        }
        String kind = String.valueOf(attachment.getOrDefault("kind", "")).trim().toLowerCase(Locale.ROOT);
        if ("image".equals(kind)) {
          continue;
        }
        String text = String.valueOf(attachment.getOrDefault("textContent", ""));
        if (text.isBlank()) {
          continue;
        }
        String fileName = String.valueOf(attachment.getOrDefault("fileName", "attachment_" + (usedSources + 1))).trim();
        String typeHint = detectTypeHint(fileName, text, kind);
        String summary = summarizeByType(fileName, text, typeHint);
        if (summary.isBlank()) {
          continue;
        }
        blocks.add("## Source: " + fileName + "\n" + summary);
        usedSources++;
      }
    }

    StringBuilder assembled = new StringBuilder();
    assembled.append("# AI Assistant Global Context\n");
    assembled.append("appId=").append(safeApp).append("\n");
    assembled.append("scopeKey=").append(safeScope).append("\n");
    assembled.append("generatedAt=").append(LocalDateTime.now().format(TS)).append("\n\n");
    for (String block : blocks) {
      if (block == null || block.isBlank()) {
        continue;
      }
      if (assembled.length() + block.length() + 2 > Math.max(10000, maxGlobalContextChars)) {
        break;
      }
      assembled.append(block).append("\n\n");
    }

    String merged = assembled.toString().trim();
    if (merged.length() > Math.max(10000, maxGlobalContextChars)) {
      merged = merged.substring(0, Math.max(10000, maxGlobalContextChars));
    }

    persistGlobalContext(safeApp, safeScope, merged);
    return merged;
  }

  private String summarizeByType(String name, String rawText, String typeHint) {
    String text = String.valueOf(rawText == null ? "" : rawText).trim();
    if (text.isBlank()) {
      return "";
    }
    String normalizedType = String.valueOf(typeHint == null ? "" : typeHint).trim().toLowerCase(Locale.ROOT);
    String summary;
    if ("json".equals(normalizedType)) {
      summary = summarizeJsonSchema(name, text);
    } else if ("java".equals(normalizedType)) {
      summary = summarizeJavaFile(name, text);
    } else {
      summary = summarizeText(name, text);
    }
    return trimToMax(summary, Math.max(600, maxSummaryPerSourceChars));
  }

  private String summarizeJsonSchema(String name, String jsonText) {
    try {
      JsonNode root = parseJsonTree(jsonText);
      StringBuilder sb = new StringBuilder();
      sb.append("type: ").append(root.isArray() ? "array" : root.isObject() ? "object" : "scalar").append("\n");
      if (root.isObject()) {
        sb.append("top_keys:\n");
        int count = 0;
        var fields = root.fieldNames();
        while (fields.hasNext() && count < 40) {
          String key = fields.next();
          JsonNode child = root.get(key);
          sb.append("- ").append(key).append(" : ").append(nodeType(child)).append("\n");
          count++;
        }
      } else if (root.isArray()) {
        sb.append("array_size_hint: ").append(root.size()).append("\n");
        if (root.size() > 0) {
          JsonNode first = root.get(0);
          sb.append("first_item_type: ").append(nodeType(first)).append("\n");
          if (first != null && first.isObject()) {
            sb.append("first_item_keys:\n");
            int count = 0;
            var f = first.fieldNames();
            while (f.hasNext() && count < 30) {
              String k = f.next();
              sb.append("- ").append(k).append("\n");
              count++;
            }
          }
        }
      }
      return sb.toString().trim();
    } catch (Exception ex) {
      return summarizeText(name, jsonText);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA DISTILLATION — compress large JSON files to compact schema summaries
  // so they fit within AI Assistant API context window (~128k tokens).
  // Threshold: any JSON attachment >40k chars gets distilled instead of raw-sent.
  // ─────────────────────────────────────────────────────────────────────────────

  /** Maximum chars for a single distilled output (per attachment). */
  private static final int DISTILL_MAX_OUTPUT_CHARS = 20_000;

  /** If raw JSON is smaller than this, skip distillation and return as-is. */
  private static final int DISTILL_TRIGGER_CHARS = 40_000;

  /**
   * Entry point for Data Distillation.
   * Compresses a large JSON attachment down to a compact schema summary while
   * preserving all table names, column names, trigger types and key metadata.
   *
   * @param fileName the attachment file name (used to detect CSM file type)
   * @param jsonText the raw JSON text content
   * @return distilled schema text (much smaller than input, but semantically complete)
   */
  public String distillJsonForMenu(String fileName, String jsonText) {
    String text = String.valueOf(jsonText == null ? "" : jsonText).trim();
    if (text.isBlank()) return "";
    if (text.length() <= DISTILL_TRIGGER_CHARS) return text;

    String lowerName = String.valueOf(fileName == null ? "" : fileName).trim().toLowerCase(Locale.ROOT);
    try {
      if (lowerName.contains("sys_tbl_config") || lowerName.contains("tbl_config")) {
        return distillTblConfig(fileName, text);
      } else if (lowerName.contains("sys_msdt_config") || lowerName.contains("msdt_config")) {
        return distillMsdtConfig(fileName, text);
      } else if (lowerName.contains("sys_triggers") || (lowerName.contains("trigger") && lowerName.endsWith(".json"))) {
        return distillTriggersConfig(fileName, text);
      } else if (lowerName.contains("sys_report") || lowerName.contains("baocao") || lowerName.contains("report")) {
        return distillReportConfig(fileName, text);
      } else {
        return distillGenericJsonSchema(fileName, text);
      }
    } catch (Exception ex) {
      log.warn("JSON distillation failed for {}: {} — falling back to regex distillation", fileName, ex.getMessage());
      return distillBrokenJsonByRegex(fileName, text);
    }
  }

  private JsonNode parseJsonTree(String text) throws Exception {
    String raw = String.valueOf(text == null ? "" : text);
    List<String> candidates = buildJsonParseCandidates(raw);
    Exception lastEx = null;
    for (String candidate : candidates) {
      if (candidate == null || candidate.isBlank()) continue;
      try {
        return objectMapper.readTree(candidate);
      } catch (Exception ex) {
        lastEx = ex;
      }
    }
    if (lastEx != null) throw lastEx;
    throw new IllegalArgumentException("Cannot parse empty JSON candidate");
  }

  private List<String> buildJsonParseCandidates(String raw) {
    List<String> out = new ArrayList<>();
    String base = String.valueOf(raw == null ? "" : raw);
    out.add(base);

    String sanitized = sanitizeJsonControlCharsInStrings(base);
    if (!sanitized.equals(base)) {
      out.add(sanitized);
    }

    String unescaped = tryUnescapeJsonLikeText(base);
    if (!unescaped.equals(base)) {
      out.add(unescaped);
      String sanitizedUnescaped = sanitizeJsonControlCharsInStrings(unescaped);
      if (!sanitizedUnescaped.equals(unescaped)) {
        out.add(sanitizedUnescaped);
      }
    }

    String bracketed = extractLikelyJsonBlock(base);
    if (!bracketed.equals(base)) {
      out.add(bracketed);
      String bracketedSanitized = sanitizeJsonControlCharsInStrings(bracketed);
      if (!bracketedSanitized.equals(bracketed)) {
        out.add(bracketedSanitized);
      }
    }

    // Keep auto-repaired candidates last to avoid selecting tiny-but-valid fragments
    // when richer non-repaired candidates are still parseable.
    String repairedBase = repairLikelyTruncatedJson(base);
    if (!repairedBase.equals(base)) {
      out.add(repairedBase);
    }
    if (!sanitized.equals(base)) {
      String repairedSanitized = repairLikelyTruncatedJson(sanitized);
      if (!repairedSanitized.equals(sanitized)) {
        out.add(repairedSanitized);
      }
    }
    if (!unescaped.equals(base)) {
      String repairedUnescaped = repairLikelyTruncatedJson(unescaped);
      if (!repairedUnescaped.equals(unescaped)) {
        out.add(repairedUnescaped);
      }
      String sanitizedUnescaped = sanitizeJsonControlCharsInStrings(unescaped);
      if (!sanitizedUnescaped.equals(unescaped)) {
        String repairedSanitizedUnescaped = repairLikelyTruncatedJson(sanitizedUnescaped);
        if (!repairedSanitizedUnescaped.equals(sanitizedUnescaped)) {
          out.add(repairedSanitizedUnescaped);
        }
      }
    }
    if (!bracketed.equals(base)) {
      String repairedBracketed = repairLikelyTruncatedJson(bracketed);
      if (!repairedBracketed.equals(bracketed)) {
        out.add(repairedBracketed);
      }
      String bracketedSanitized = sanitizeJsonControlCharsInStrings(bracketed);
      if (!bracketedSanitized.equals(bracketed)) {
        String repairedBracketedSanitized = repairLikelyTruncatedJson(bracketedSanitized);
        if (!repairedBracketedSanitized.equals(bracketedSanitized)) {
          out.add(repairedBracketedSanitized);
        }
      }
    }
    return out;
  }

  private String repairLikelyTruncatedJson(String raw) {
    String text = String.valueOf(raw == null ? "" : raw).trim();
    if (text.isBlank()) {
      return text;
    }

    // Trim to a safer boundary first to reduce parse failures on abruptly cut strings.
    String boundaryTrimmed = trimToLastJsonBoundary(text);
    String repaired = closeOpenJsonStructures(boundaryTrimmed);

    // Remove trailing commas before object/array close to keep JSON valid.
    String normalized = repaired;
    String previous;
    do {
      previous = normalized;
      normalized = normalized.replaceAll(",\\s*([}\\]])", "$1");
    } while (!normalized.equals(previous));
    return normalized;
  }

  private String trimToLastJsonBoundary(String raw) {
    if (raw == null || raw.isEmpty()) {
      return "";
    }
    boolean inString = false;
    boolean escaped = false;
    int lastBoundary = -1;
    int firstStart = -1;

    for (int i = 0; i < raw.length(); i++) {
      char c = raw.charAt(i);
      if (firstStart < 0 && (c == '{' || c == '[')) {
        firstStart = i;
      }

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (c == '\\') {
          escaped = true;
        } else if (c == '"') {
          inString = false;
        }
        continue;
      }

      if (c == '"') {
        inString = true;
      }
      if (c == ',' || c == '}' || c == ']') {
        lastBoundary = i;
      }
    }

    if (firstStart < 0) {
      return raw;
    }
    if (lastBoundary <= firstStart) {
      return raw.substring(firstStart);
    }
    return raw.substring(firstStart, lastBoundary + 1);
  }

  private String closeOpenJsonStructures(String raw) {
    if (raw == null || raw.isEmpty()) {
      return "";
    }
    StringBuilder sb = new StringBuilder(raw.length() + 64);
    List<Character> stack = new ArrayList<>();
    boolean inString = false;
    boolean escaped = false;

    for (int i = 0; i < raw.length(); i++) {
      char c = raw.charAt(i);
      sb.append(c);

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (c == '\\') {
          escaped = true;
        } else if (c == '"') {
          inString = false;
        }
        continue;
      }

      if (c == '"') {
        inString = true;
      } else if (c == '{' || c == '[') {
        stack.add(c);
      } else if (c == '}' || c == ']') {
        if (!stack.isEmpty()) {
          char top = stack.get(stack.size() - 1);
          if ((top == '{' && c == '}') || (top == '[' && c == ']')) {
            stack.remove(stack.size() - 1);
          }
        }
      }
    }

    if (inString) {
      sb.append('"');
    }
    for (int i = stack.size() - 1; i >= 0; i--) {
      char open = stack.get(i);
      sb.append(open == '{' ? '}' : ']');
    }
    return sb.toString();
  }

  private String tryUnescapeJsonLikeText(String raw) {
    String text = String.valueOf(raw == null ? "" : raw);
    long escapedQuotes = text.chars().filter(ch -> ch == '\\').count();
    if (escapedQuotes < 100) {
      return text;
    }
    String unescaped = text
        .replace("\\\\\"", "\"")
        .replace("\\\\n", "\n")
        .replace("\\\\r", "\r")
        .replace("\\\\t", "\t")
        .replace("\\\\/", "/");
    return unescaped;
  }

  private String extractLikelyJsonBlock(String raw) {
    String text = String.valueOf(raw == null ? "" : raw);
    int firstObj = text.indexOf('{');
    int firstArr = text.indexOf('[');
    int start;
    if (firstObj < 0) start = firstArr;
    else if (firstArr < 0) start = firstObj;
    else start = Math.min(firstObj, firstArr);
    if (start < 0) {
      return text;
    }
    int lastObj = text.lastIndexOf('}');
    int lastArr = text.lastIndexOf(']');
    int end = Math.max(lastObj, lastArr);
    if (end <= start) {
      return text;
    }
    return text.substring(start, end + 1);
  }

  private String sanitizeJsonControlCharsInStrings(String raw) {
    if (raw == null || raw.isEmpty()) return "";
    StringBuilder sb = new StringBuilder(raw.length() + 128);
    boolean inString = false;
    boolean escaped = false;
    for (int i = 0; i < raw.length(); i++) {
      char c = raw.charAt(i);
      if (!inString) {
        sb.append(c);
        if (c == '"') {
          inString = true;
          escaped = false;
        }
        continue;
      }

      if (escaped) {
        sb.append(c);
        escaped = false;
        continue;
      }
      if (c == '\\') {
        sb.append(c);
        escaped = true;
        continue;
      }
      if (c == '"') {
        sb.append(c);
        inString = false;
        continue;
      }

      if (c == '\n') {
        sb.append("\\n");
      } else if (c == '\r') {
        sb.append("\\r");
      } else if (c == '\t') {
        sb.append("\\t");
      } else if (c < 0x20) {
        String hex = Integer.toHexString(c);
        sb.append("\\u");
        for (int pad = hex.length(); pad < 4; pad++) sb.append('0');
        sb.append(hex);
      } else {
        sb.append(c);
      }
    }
    return sb.toString();
  }

  private String distillBrokenJsonByRegex(String name, String text) {
    String unescaped = tryUnescapeJsonLikeText(text);
    String working = extractLikelyJsonBlock(unescaped);
    Set<String> tableNames = new LinkedHashSet<>();
    Set<String> columns = new LinkedHashSet<>();
    Set<String> triggerTypes = new LinkedHashSet<>();
    Set<String> prefixes = new LinkedHashSet<>();
    Set<String> ids = new LinkedHashSet<>();
    Set<String> reportNames = new LinkedHashSet<>();
    Map<String, Integer> keyFreq = new TreeMap<>();

    Pattern tablePattern = Pattern.compile("(?i)\\\"(?:table_name|tbl_name|obj_name|table)\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
    Pattern columnPattern = Pattern.compile("(?i)\\\"(?:f_name|column_name|col_name|field_name|field)\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
    Pattern triggerPattern = Pattern.compile("(?i)\\\"(?:loaitrigger|trigger_type|type)\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
    Pattern prefixPattern = Pattern.compile("(?i)\\\"(?:prefix_pk|pk_prefix|prefix)\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
    Pattern idPattern = Pattern.compile("(?i)\\\"(?:id|report_id|ma_bc|ma_ct|code)\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
    Pattern reportPattern = Pattern.compile("(?i)\\\"(?:ten|label|ten_baocao|display_name)\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
    Pattern keyPattern = Pattern.compile("(?i)\\\"([a-zA-Z0-9_]{2,60})\\\"\\s*:");

    Matcher tableMatcher = tablePattern.matcher(working);
    while (tableMatcher.find() && tableNames.size() < 500) {
      String v = String.valueOf(tableMatcher.group(1) == null ? "" : tableMatcher.group(1)).trim();
      if (!v.isEmpty()) tableNames.add(v);
    }

    Matcher colMatcher = columnPattern.matcher(working);
    while (colMatcher.find() && columns.size() < 800) {
      String v = String.valueOf(colMatcher.group(1) == null ? "" : colMatcher.group(1)).trim();
      if (!v.isEmpty()) columns.add(v);
    }

    Matcher trgMatcher = triggerPattern.matcher(working);
    while (trgMatcher.find() && triggerTypes.size() < 120) {
      String v = String.valueOf(trgMatcher.group(1) == null ? "" : trgMatcher.group(1)).trim();
      if (!v.isEmpty()) triggerTypes.add(v);
    }

    Matcher preMatcher = prefixPattern.matcher(working);
    while (preMatcher.find() && prefixes.size() < 200) {
      String v = String.valueOf(preMatcher.group(1) == null ? "" : preMatcher.group(1)).trim();
      if (!v.isEmpty()) prefixes.add(v);
    }

    Matcher idMatcher = idPattern.matcher(working);
    while (idMatcher.find() && ids.size() < 500) {
      String v = String.valueOf(idMatcher.group(1) == null ? "" : idMatcher.group(1)).trim();
      if (!v.isEmpty()) ids.add(v);
    }

    Matcher reportMatcher = reportPattern.matcher(working);
    while (reportMatcher.find() && reportNames.size() < 300) {
      String v = String.valueOf(reportMatcher.group(1) == null ? "" : reportMatcher.group(1)).trim();
      if (!v.isEmpty()) reportNames.add(v);
    }

    Matcher keyMatcher = keyPattern.matcher(working);
    while (keyMatcher.find()) {
      String key = String.valueOf(keyMatcher.group(1) == null ? "" : keyMatcher.group(1)).trim();
      if (key.isEmpty()) continue;
      keyFreq.put(key, keyFreq.getOrDefault(key, 0) + 1);
    }

    StringBuilder sb = new StringBuilder();
    sb.append("# Distilled (regex-fallback): ").append(name).append("\n");
    sb.append("# original_size_chars: ").append(text.length()).append("\n");
    sb.append("# note: malformed JSON parsed by regex fallback\n\n");

    if (!tableNames.isEmpty()) {
      sb.append("tables(").append(tableNames.size()).append("): ");
      sb.append(joinLimited(tableNames, 120));
      if (tableNames.size() > 120) sb.append(", ...");
      sb.append("\n");
    }
    if (!columns.isEmpty()) {
      sb.append("columns(").append(columns.size()).append("): ");
      sb.append(joinLimited(columns, 180));
      if (columns.size() > 180) sb.append(", ...");
      sb.append("\n");
    }
    if (!triggerTypes.isEmpty()) {
      sb.append("trigger_types(").append(triggerTypes.size()).append("): ");
      sb.append(String.join(", ", triggerTypes));
      sb.append("\n");
    }
    if (!prefixes.isEmpty()) {
      sb.append("prefix_pk_values(").append(prefixes.size()).append("): ");
      sb.append(String.join(", ", prefixes));
      sb.append("\n");
    }

    if (!ids.isEmpty()) {
      sb.append("ids(").append(ids.size()).append("): ");
      sb.append(joinLimited(ids, 120));
      if (ids.size() > 120) sb.append(", ...");
      sb.append("\n");
    }

    if (!reportNames.isEmpty()) {
      sb.append("labels(").append(reportNames.size()).append("): ");
      sb.append(joinLimited(reportNames, 80));
      if (reportNames.size() > 80) sb.append(", ...");
      sb.append("\n");
    }

    if (!keyFreq.isEmpty()) {
      sb.append("top_keys:\n");
      int printed = 0;
      for (Map.Entry<String, Integer> e : keyFreq.entrySet()) {
        if (e.getValue() < 2) continue;
        sb.append("- ").append(e.getKey()).append(" (count=").append(e.getValue()).append(")\n");
        printed++;
        if (printed >= 60) break;
      }
    }

    if (sb.length() < 1200) {
      int headKeep = Math.min(7000, working.length());
      int tailKeep = Math.min(7000, Math.max(0, working.length() - headKeep));
      String head = working.substring(0, headKeep);
      String tail = tailKeep > 0 ? working.substring(Math.max(0, working.length() - tailKeep)) : "";
      sb.append("sample_head:\n").append(head).append("\n");
      if (!tail.isBlank()) {
        sb.append("\nsample_tail:\n").append(tail).append("\n");
      }
    }
    String out = sb.toString().trim();
    return out.length() > DISTILL_MAX_OUTPUT_CHARS ? out.substring(0, DISTILL_MAX_OUTPUT_CHARS) : out;
  }

  private String joinLimited(Set<String> values, int limit) {
    if (values == null || values.isEmpty() || limit <= 0) {
      return "";
    }
    StringBuilder sb = new StringBuilder();
    int count = 0;
    for (String v : values) {
      if (v == null || v.isBlank()) continue;
      if (count > 0) sb.append(", ");
      sb.append(v);
      count++;
      if (count >= limit) break;
    }
    return sb.toString();
  }

  /**
   * Distill sys_tbl_config: extract all table names + their column definitions.
   * Typical structure: { "TABLE_NAME": { "pk":"col", "cols": { "col1":{...} } }, ... }
   *   OR array: [ { "table_name":"X", "cols":{...}, "fields":[...] } ]
   */
  private String distillTblConfig(String name, String text) throws Exception {
    JsonNode root = parseJsonTree(text);
    StringBuilder sb = new StringBuilder();
    sb.append("# Distilled: ").append(name).append(" (sys_tbl_config)\n");
    sb.append("# original_size_chars: ").append(text.length()).append("\n\n");

    int tableCount = 0;
    int sampledColumnCount = 0;

    if (root.isObject()) {
      // Pattern: { "TABLE_NAME": { pk, cols/fields } }
      sb.append("tables_count: ").append(root.size()).append("\n");
      sb.append("tables:\n");
      var tableNames = root.fieldNames();
      while (tableNames.hasNext()) {
        if (sb.length() > DISTILL_MAX_OUTPUT_CHARS - 500) {
          sb.append("  ...[truncated]\n");
          break;
        }
        String tbl = tableNames.next();
        tableCount++;
        JsonNode tblNode = root.get(tbl);
        sb.append("  ").append(tbl).append(":\n");
        if (tblNode != null && tblNode.isObject()) {
          // pk
          JsonNode pk = findFirstMatchingField(tblNode, "pk", "primary_key", "id_field", "key_field");
          if (pk != null && pk.isTextual()) {
            sb.append("    pk: ").append(pk.asText()).append("\n");
          }
          // columns from "cols", "columns", "fields"
          JsonNode colsNode = findFirstMatchingField(tblNode, "cols", "columns", "fields", "col_list");
          List<String> colNames = extractColumnNames(colsNode);
          if (!colNames.isEmpty()) {
            sampledColumnCount += colNames.size();
            sb.append("    columns(").append(colNames.size()).append("): ")
              .append(String.join(", ", colNames.subList(0, Math.min(colNames.size(), 60))))
              .append(colNames.size() > 60 ? ", ..." : "").append("\n");
          }
        }
      }
    } else if (root.isArray()) {
      // Pattern: [ { "table_name":"X", "pk":"y", "cols":{...} } ]
      sb.append("tables_count: ").append(root.size()).append("\n");
      sb.append("tables:\n");
      for (int i = 0; i < root.size(); i++) {
        if (sb.length() > DISTILL_MAX_OUTPUT_CHARS - 500) {
          sb.append("  ...[truncated]\n");
          break;
        }
        JsonNode item = root.get(i);
        if (item == null || !item.isObject()) continue;
        tableCount++;
        JsonNode nameNode = findFirstMatchingField(item, "table_name", "tbl_name", "name", "tableName");
        String tbl = nameNode != null ? nameNode.asText("?") : "item_" + i;
        sb.append("  ").append(tbl).append(":\n");
        JsonNode pk = findFirstMatchingField(item, "pk", "primary_key", "id_field");
        if (pk != null && pk.isTextual()) {
          sb.append("    pk: ").append(pk.asText()).append("\n");
        }
        JsonNode colsNode = findFirstMatchingField(item, "cols", "columns", "fields", "col_list");
        List<String> colNames = extractColumnNames(colsNode);
        if (!colNames.isEmpty()) {
          sampledColumnCount += colNames.size();
          sb.append("    columns(").append(colNames.size()).append("): ")
            .append(String.join(", ", colNames.subList(0, Math.min(colNames.size(), 60))))
            .append(colNames.size() > 60 ? ", ..." : "").append("\n");
        }
      }
    } else {
      // Unknown shape — fall back to generic
      return distillGenericJsonSchema(name, text);
    }

    // Guard: huge source but almost no table/column signal likely means repaired fragment parse.
    if (text.length() > 250_000 && tableCount <= 2 && sampledColumnCount < 10) {
      log.warn("sys_tbl_config distillation appears too sparse (tables={}, columns={}), using regex fallback for {}",
          tableCount, sampledColumnCount, name);
      return distillBrokenJsonByRegex(name, text);
    }

    return sb.toString().trim();
  }

  /**
   * Distill sys_msdt_config: extract msdt codes → prefix_pk + table_name mappings.
   * Typical structure: { "MSDT_CODE": { "prefix_pk":"ABC", "tbl_name":"TABLE", ... } }
   */
  private String distillMsdtConfig(String name, String text) throws Exception {
    JsonNode root = parseJsonTree(text);
    StringBuilder sb = new StringBuilder();
    sb.append("# Distilled: ").append(name).append(" (sys_msdt_config)\n");
    sb.append("# original_size_chars: ").append(text.length()).append("\n\n");

    if (root.isObject()) {
      sb.append("msdt_count: ").append(root.size()).append("\n");
      sb.append("msdt_mappings:\n");
      // Group by prefix pattern if possible
      var msdtCodes = root.fieldNames();
      int count = 0;
      while (msdtCodes.hasNext()) {
        if (sb.length() > DISTILL_MAX_OUTPUT_CHARS - 500) {
          sb.append("  ...[truncated]\n");
          break;
        }
        String code = msdtCodes.next();
        JsonNode cfg = root.get(code);
        sb.append("  ").append(code).append(":");
        if (cfg != null && cfg.isObject()) {
          JsonNode prefix = findFirstMatchingField(cfg, "prefix_pk", "prefix", "pk_prefix");
          JsonNode tbl = findFirstMatchingField(cfg, "tbl_name", "table_name", "tableName", "name");
          JsonNode label = findFirstMatchingField(cfg, "ten", "label", "display_name", "ten_msdt");
          if (prefix != null) sb.append(" prefix=").append(prefix.asText());
          if (tbl != null) sb.append(" table=").append(tbl.asText());
          if (label != null) sb.append(" label=\"").append(label.asText()).append("\"");
        }
        sb.append("\n");
        count++;
        if (count >= 300) {
          sb.append("  ...[more entries omitted]\n");
          break;
        }
      }
    } else if (root.isArray()) {
      sb.append("msdt_count: ").append(root.size()).append("\n");
      sb.append("msdt_mappings:\n");
      for (int i = 0; i < Math.min(root.size(), 300); i++) {
        if (sb.length() > DISTILL_MAX_OUTPUT_CHARS - 500) {
          sb.append("  ...[truncated]\n");
          break;
        }
        JsonNode item = root.get(i);
        if (item == null || !item.isObject()) continue;
        JsonNode code = findFirstMatchingField(item, "msdt_code", "code", "ma_msdt", "id");
        JsonNode prefix = findFirstMatchingField(item, "prefix_pk", "prefix", "pk_prefix");
        JsonNode tbl = findFirstMatchingField(item, "tbl_name", "table_name");
        JsonNode label = findFirstMatchingField(item, "ten", "label", "display_name");
        sb.append("  ");
        if (code != null) sb.append(code.asText("?")).append(":");
        if (prefix != null) sb.append(" prefix=").append(prefix.asText());
        if (tbl != null) sb.append(" table=").append(tbl.asText());
        if (label != null) sb.append(" label=\"").append(label.asText()).append("\"");
        sb.append("\n");
      }
    } else {
      return distillGenericJsonSchema(name, text);
    }
    return sb.toString().trim();
  }

  /**
   * Distill sys_triggers: group triggers by loaitrigger type, extract IDs + target tables.
   * Typical structure: [ { "loaitrigger":"AFTER_INSERT", "tbl_name":"X", "trigger_id":"T1" } ]
   */
  private String distillTriggersConfig(String name, String text) throws Exception {
    JsonNode root = parseJsonTree(text);
    StringBuilder sb = new StringBuilder();
    sb.append("# Distilled: ").append(name).append(" (sys_triggers)\n");
    sb.append("# original_size_chars: ").append(text.length()).append("\n\n");

    JsonNode arr = root.isArray() ? root : findFirstArrayField(root);
    if (arr == null || !arr.isArray()) {
      return distillGenericJsonSchema(name, text);
    }

    sb.append("total_triggers: ").append(arr.size()).append("\n\n");

    // Group by loaitrigger
    Map<String, List<String>> byType = new TreeMap<>();
    Set<String> allTables = new LinkedHashSet<>();
    for (int i = 0; i < arr.size(); i++) {
      JsonNode item = arr.get(i);
      if (item == null || !item.isObject()) continue;
      JsonNode loaiNode = findFirstMatchingField(item, "loaitrigger", "loai_trigger", "trigger_type", "type");
      JsonNode tblNode = findFirstMatchingField(item, "tbl_name", "table_name", "tableName");
      JsonNode idNode = findFirstMatchingField(item, "trigger_id", "id", "ma_trigger");
      String loai = loaiNode != null ? loaiNode.asText("UNKNOWN") : "UNKNOWN";
      String tbl = tblNode != null ? tblNode.asText("") : "";
      String id = idNode != null ? idNode.asText("") : "";
      byType.computeIfAbsent(loai, k -> new ArrayList<>()).add(
        (id.isEmpty() ? "" : id) + (tbl.isEmpty() ? "" : "@" + tbl));
      if (!tbl.isEmpty()) allTables.add(tbl);
    }

    sb.append("trigger_types_summary:\n");
    for (Map.Entry<String, List<String>> entry : byType.entrySet()) {
      if (sb.length() > DISTILL_MAX_OUTPUT_CHARS - 1000) {
        sb.append("  ...[truncated]\n");
        break;
      }
      List<String> ids = entry.getValue();
      sb.append("  ").append(entry.getKey()).append(" (count=").append(ids.size()).append("):\n");
      int showMax = Math.min(ids.size(), 30);
      for (int i = 0; i < showMax; i++) {
        sb.append("    - ").append(ids.get(i)).append("\n");
      }
      if (ids.size() > showMax) sb.append("    - ...[").append(ids.size() - showMax).append(" more]\n");
    }

    if (!allTables.isEmpty()) {
      sb.append("\naffected_tables(").append(allTables.size()).append("):\n");
      int tCount = 0;
      for (String t : allTables) {
        if (tCount++ > 80 || sb.length() > DISTILL_MAX_OUTPUT_CHARS - 200) {
          sb.append("  ...[more]\n");
          break;
        }
        sb.append("  - ").append(t).append("\n");
      }
    }
    return sb.toString().trim();
  }

  /**
   * Distill sys_report / baocao config: extract report IDs + target tables + field lists.
   */
  private String distillReportConfig(String name, String text) throws Exception {
    JsonNode root = parseJsonTree(text);
    StringBuilder sb = new StringBuilder();
    sb.append("# Distilled: ").append(name).append(" (sys_report)\n");
    sb.append("# original_size_chars: ").append(text.length()).append("\n\n");

    JsonNode arr = root.isArray() ? root : findFirstArrayField(root);
    if (arr != null && arr.isArray()) {
      sb.append("report_count: ").append(arr.size()).append("\n");
      sb.append("reports:\n");
      for (int i = 0; i < arr.size(); i++) {
        if (sb.length() > DISTILL_MAX_OUTPUT_CHARS - 500) { sb.append("  ...[truncated]\n"); break; }
        JsonNode item = arr.get(i);
        if (item == null || !item.isObject()) continue;
        JsonNode id = findFirstMatchingField(item, "report_id", "baocao_id", "id", "ma_bc");
        JsonNode tbl = findFirstMatchingField(item, "tbl_name", "table_name", "tbl_baocao");
        JsonNode label = findFirstMatchingField(item, "ten", "label", "ten_baocao", "display_name");
        sb.append("  ").append(id != null ? id.asText("?") : "item_" + i).append(":");
        if (tbl != null) sb.append(" table=").append(tbl.asText());
        if (label != null) sb.append(" label=\"").append(label.asText()).append("\"");
        sb.append("\n");
      }
    } else if (root.isObject()) {
      // Object shape — emit key → summary
      sb.append("reports_count: ").append(root.size()).append("\n");
      sb.append("reports:\n");
      var keys = root.fieldNames();
      while (keys.hasNext()) {
        if (sb.length() > DISTILL_MAX_OUTPUT_CHARS - 500) { sb.append("  ...[truncated]\n"); break; }
        String key = keys.next();
        JsonNode val = root.get(key);
        JsonNode tbl = findFirstMatchingField(val, "tbl_name", "table_name");
        sb.append("  ").append(key);
        if (tbl != null) sb.append(": table=").append(tbl.asText());
        sb.append("\n");
      }
    } else {
      return distillGenericJsonSchema(name, text);
    }
    return sb.toString().trim();
  }

  /**
   * Generic deep schema extractor — works for any JSON structure.
   * Extracts key names and value types (no actual values) up to 5 levels deep.
   */
  private String distillGenericJsonSchema(String name, String text) throws Exception {
    JsonNode root = parseJsonTree(text);
    StringBuilder sb = new StringBuilder();
    sb.append("# Distilled: ").append(name).append(" (generic_schema)\n");
    sb.append("# original_size_chars: ").append(text.length()).append("\n\n");
    buildSchemaTree(sb, root, "", 0, 5, new int[]{0});
    String result = sb.toString().trim();
    if (result.length() > DISTILL_MAX_OUTPUT_CHARS) {
      return result.substring(0, DISTILL_MAX_OUTPUT_CHARS);
    }
    return result;
  }

  private void buildSchemaTree(StringBuilder sb, JsonNode node, String indent, int depth, int maxDepth, int[] charCount) {
    if (charCount[0] > DISTILL_MAX_OUTPUT_CHARS - 200) return;
    if (depth > maxDepth) { sb.append(indent).append("...\n"); charCount[0] += indent.length() + 4; return; }
    if (node == null || node.isNull()) {
      sb.append("null\n"); charCount[0] += 5;
    } else if (node.isObject()) {
      if (depth > 0) { sb.append("object\n"); charCount[0] += 7; }
      Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
      int fieldCount = 0;
      while (fields.hasNext()) {
        if (charCount[0] > DISTILL_MAX_OUTPUT_CHARS - 200) break;
        Map.Entry<String, JsonNode> entry = fields.next();
        String line = indent + "  " + entry.getKey() + ": ";
        sb.append(line); charCount[0] += line.length();
        buildSchemaTree(sb, entry.getValue(), indent + "  ", depth + 1, maxDepth, charCount);
        fieldCount++;
        if (fieldCount >= 80 && depth <= 1) { sb.append(indent).append("  ...[").append(node.size() - fieldCount).append(" more fields]\n"); break; }
      }
    } else if (node.isArray()) {
      sb.append("array[").append(node.size()).append("]\n"); charCount[0] += 12;
      if (node.size() > 0 && depth < maxDepth) {
        sb.append(indent).append("  item_schema: ");
        charCount[0] += indent.length() + 14;
        buildSchemaTree(sb, node.get(0), indent + "  ", depth + 1, maxDepth, charCount);
      }
    } else if (node.isTextual()) {
      String v = node.asText();
      String display = v.length() > 40 ? "string(\"" + v.substring(0, 40) + "...\")" : "string(\"" + v + "\")";
      sb.append(display).append("\n"); charCount[0] += display.length() + 1;
    } else if (node.isNumber()) {
      sb.append("number(").append(node.asText()).append(")\n"); charCount[0] += 10;
    } else if (node.isBoolean()) {
      sb.append("boolean(").append(node.asBoolean()).append(")\n"); charCount[0] += 10;
    } else {
      sb.append(nodeType(node)).append("\n"); charCount[0] += 8;
    }
  }

  // ─── Helper: find first JSON field matching any of the candidate names ──────

  private JsonNode findFirstMatchingField(JsonNode node, String... candidates) {
    if (node == null || !node.isObject()) return null;
    for (String c : candidates) {
      if (node.has(c)) return node.get(c);
    }
    // Case-insensitive fallback
    Iterator<String> names = node.fieldNames();
    while (names.hasNext()) {
      String fn = names.next();
      String lower = fn.toLowerCase(Locale.ROOT);
      for (String c : candidates) {
        if (lower.equals(c.toLowerCase(Locale.ROOT))) return node.get(fn);
      }
    }
    return null;
  }

  private JsonNode findFirstArrayField(JsonNode node) {
    if (node == null || !node.isObject()) return null;
    Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
    while (fields.hasNext()) {
      Map.Entry<String, JsonNode> e = fields.next();
      if (e.getValue().isArray()) return e.getValue();
    }
    return null;
  }

  private List<String> extractColumnNames(JsonNode colsNode) {
    List<String> result = new ArrayList<>();
    if (colsNode == null) return result;
    if (colsNode.isObject()) {
      Iterator<String> names = colsNode.fieldNames();
      while (names.hasNext()) result.add(names.next());
    } else if (colsNode.isArray()) {
      for (int i = 0; i < colsNode.size(); i++) {
        JsonNode item = colsNode.get(i);
        JsonNode nameNode = findFirstMatchingField(item, "col_name", "column_name", "name", "field_name");
        if (nameNode != null) result.add(nameNode.asText());
        else if (item.isTextual()) result.add(item.asText());
      }
    }
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // END DATA DISTILLATION
  // ─────────────────────────────────────────────────────────────────────────────

  private String summarizeJavaFile(String name, String source) {
    String[] lines = source.split("\\n");
    Pattern classPattern = Pattern.compile("\\b(class|interface|enum|record)\\s+([A-Za-z0-9_]+)");
    Pattern methodPattern = Pattern.compile("\\b(public|protected|private)\\s+[A-Za-z0-9_<>,\\[\\]\\s]+\\s+([A-Za-z0-9_]+)\\s*\\([^;]*\\)");

    String packageLine = "";
    Set<String> classes = new LinkedHashSet<>();
    Set<String> methods = new LinkedHashSet<>();
    Set<String> annotations = new LinkedHashSet<>();

    for (String raw : lines) {
      String line = String.valueOf(raw == null ? "" : raw).trim();
      if (line.isEmpty() || line.startsWith("//") || line.startsWith("*")) {
        continue;
      }
      if (line.startsWith("package ") && packageLine.isEmpty()) {
        packageLine = line;
      }
      if (line.startsWith("@")) {
        annotations.add(line);
      }
      Matcher c = classPattern.matcher(line);
      if (c.find()) {
        classes.add(c.group(1) + " " + c.group(2));
      }
      Matcher m = methodPattern.matcher(line);
      if (m.find()) {
        methods.add(m.group(2));
      }
      if (classes.size() >= 10 && methods.size() >= 40) {
        break;
      }
    }

    StringBuilder sb = new StringBuilder();
    if (!packageLine.isBlank()) {
      sb.append(packageLine).append("\n");
    }
    if (!annotations.isEmpty()) {
      sb.append("annotations:\n");
      int count = 0;
      for (String ann : annotations) {
        if (count++ >= 20) break;
        sb.append("- ").append(ann).append("\n");
      }
    }
    if (!classes.isEmpty()) {
      sb.append("types:\n");
      int count = 0;
      for (String type : classes) {
        if (count++ >= 20) break;
        sb.append("- ").append(type).append("\n");
      }
    }
    if (!methods.isEmpty()) {
      sb.append("public_api_methods:\n");
      int count = 0;
      for (String method : methods) {
        if (count++ >= 50) break;
        sb.append("- ").append(method).append("\n");
      }
    }
    return sb.toString().trim();
  }

  private String summarizeText(String name, String text) {
    String cleaned = text.replace("\r", "").trim();
    if (cleaned.isEmpty()) {
      return "";
    }
    String[] lines = cleaned.split("\\n");
    StringBuilder sb = new StringBuilder();
    sb.append("key_lines:\n");
    int count = 0;
    for (String line : lines) {
      String s = line.trim();
      if (s.isEmpty()) {
        continue;
      }
      if (s.length() > 220) {
        s = s.substring(0, 220) + "...";
      }
      sb.append("- ").append(s).append("\n");
      count++;
      if (count >= 18) {
        break;
      }
    }
    return sb.toString().trim();
  }

  private String detectTypeHint(String fileName, String text, String kind) {
    String lowerName = String.valueOf(fileName == null ? "" : fileName).trim().toLowerCase(Locale.ROOT);
    String lowerKind = String.valueOf(kind == null ? "" : kind).trim().toLowerCase(Locale.ROOT);
    if (lowerName.endsWith(".json") || lowerKind.contains("json")) {
      return "json";
    }
    if (lowerName.endsWith(".java")) {
      return "java";
    }
    String trimmed = String.valueOf(text == null ? "" : text).trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return "json";
    }
    if (trimmed.contains("class ") && trimmed.contains("public ")) {
      return "java";
    }
    return "text";
  }

  private String nodeType(JsonNode node) {
    if (node == null || node.isNull()) return "null";
    if (node.isObject()) return "object";
    if (node.isArray()) return "array";
    if (node.isTextual()) return "string";
    if (node.isNumber()) return "number";
    if (node.isBoolean()) return "boolean";
    return "value";
  }

  private void persistGlobalContext(String appId, String scopeKey, String text) {
    try {
      File file = getGlobalContextFile(appId, scopeKey);
      File parent = file.getParentFile();
      if (parent != null) {
        parent.mkdirs();
      }
      Files.writeString(file.toPath(), text == null ? "" : text, StandardCharsets.UTF_8);
    } catch (Exception ex) {
      log.warn("Cannot persist aiAssistant global context appId={} scopeKey={}: {}", appId, scopeKey, ex.getMessage());
    }
  }

  private File getGlobalContextFile(String appId, String scopeKey) {
    String name = "ai_global_context_" + appId + "__" + scopeKey + ".md";
    return new File(contextDir, name);
  }

  private String sanitize(String raw, String fallback) {
    String value = String.valueOf(raw == null ? "" : raw).trim();
    if (value.isEmpty()) {
      value = fallback;
    }
    value = value.replaceAll("[^a-zA-Z0-9_-]", "_");
    value = value.replaceAll("_+", "_");
    if (value.isBlank()) {
      return fallback;
    }
    return value;
  }

  private String trimToMax(String text, int maxChars) {
    String value = String.valueOf(text == null ? "" : text);
    int limit = Math.max(200, maxChars);
    if (value.length() <= limit) {
      return value;
    }
    int head = (int) Math.floor(limit * 0.7);
    int tail = Math.max(60, limit - head - 32);
    String left = value.substring(0, Math.min(head, value.length())).trim();
    String right = value.substring(Math.max(0, value.length() - tail)).trim();
    return left + "\n...[TRIMMED_FOR_MEMORY]...\n" + right;
  }
}
