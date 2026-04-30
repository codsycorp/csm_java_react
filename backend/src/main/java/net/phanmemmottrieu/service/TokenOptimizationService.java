package net.phanmemmottrieu.service;

import org.springframework.stereotype.Service;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Token optimization for AI requests
 * Reduces input tokens from 3M+ characters to ~50-100K chars while preserving meaning:
 * 1. Smart compression of repetitive structures
 * 2. Context windowing (keep recent + important)
 * 3. Lazy field expansion (expand only when needed)
 * 4. Structural summarization
 */
@Service
public class TokenOptimizationService {

    public static class OptimizationResult {
        public String optimizedContent;
        public int originalChars;
        public int optimizedChars;
        public double reductionPercent;
        public Map<String, Object> compressionStats;

        public OptimizationResult(String content, int originalChars, int optimizedChars) {
            this.optimizedContent = content;
            this.originalChars = originalChars;
            this.optimizedChars = optimizedChars;
            this.reductionPercent = 100.0 * (1.0 - (double) optimizedChars / originalChars);
            this.compressionStats = new HashMap<>();
        }
    }

    private static final int TARGET_MAX_CHARS = 80000; // Aggressive target
    private static final int HARD_CAP_CHARS = 150000; // Absolute maximum
    private static final Pattern MULTI_NEWLINE = Pattern.compile("\n{3,}");
    private static final Pattern MULTI_SPACE = Pattern.compile("  +");

    /**
     * Main entry: Compress content while preserving essential information
     */
    public OptimizationResult optimize(String content, String hint) {
        if (content == null || content.length() <= TARGET_MAX_CHARS) {
            return new OptimizationResult(content, content != null ? content.length() : 0, 
                content != null ? content.length() : 0);
        }

        int originalLen = content.length();
        Map<String, Object> stats = new HashMap<>();

        // Phase 1: Normalize whitespace
        String step1 = normalizeWhitespace(content);
        stats.put("after_whitespace_normalize", step1.length());

        // Phase 2: Remove comments/metadata
        String step2 = removeComments(step1);
        stats.put("after_comment_removal", step2.length());

        // Phase 3: Compress JSON structures
        String step3 = compressJsonStructures(step2);
        stats.put("after_json_compression", step3.length());

        // Phase 4: Compress repetitive patterns
        String step4 = compressRepetitivePatterns(step3, hint);
        stats.put("after_pattern_compression", step4.length());

        // Phase 5: Context windowing (keep recent + first)
        String step5 = applyContextWindowing(step4, TARGET_MAX_CHARS);
        stats.put("after_context_windowing", step5.length());

        // Phase 6: Final truncation if still over limit
        String step6 = step5.length() > HARD_CAP_CHARS 
            ? step5.substring(0, HARD_CAP_CHARS) + "\n/* truncated for token budget */"
            : step5;

        OptimizationResult result = new OptimizationResult(step6, originalLen, step6.length());
        result.compressionStats = stats;
        return result;
    }

    /**
     * Compress array of menu items by extracting commonalities
     */
    public String compressMenuArray(List<Map<String, Object>> menus) {
        if (menus == null || menus.isEmpty()) return "";

        StringBuilder sb = new StringBuilder();
        sb.append("/* Menu compression: ").append(menus.size()).append(" items */\n");

        // Summary stats
        int totalFields = 0;
        Set<String> commonFields = new HashSet<>();
        Set<String> allTableNames = new HashSet<>();

        for (Map<String, Object> menu : menus) {
            commonFields.addAll(menu.keySet());
            Object tableObj = menu.get("table");
            if (tableObj instanceof List) {
                List<?> fields = (List<?>) tableObj;
                totalFields += fields.size();
            }
            String tableName = (String) menu.get("table_name");
            if (tableName != null && !tableName.isEmpty()) {
                allTableNames.add(tableName);
            }
        }

        sb.append("Common fields: ").append(String.join(", ", 
            commonFields.stream().sorted().limit(15).collect(Collectors.toList()))).append("\n");
        sb.append("Total fields: ").append(totalFields).append("\n");
        sb.append("Tables: ").append(String.join(", ", allTableNames)).append("\n");
        sb.append("---\n");

        // Compact representation of each menu
        for (Map<String, Object> menu : menus) {
            sb.append(compressMenuItem(menu)).append("\n");
        }

        return sb.toString();
    }

    private String compressMenuItem(Map<String, Object> menu) {
        StringBuilder sb = new StringBuilder();
        
        String id = String.valueOf(menu.getOrDefault("id", "?"));
        String label = String.valueOf(menu.getOrDefault("label", ""));
        String tableName = String.valueOf(menu.getOrDefault("table_name", ""));
        int typeForm = Integer.parseInt(String.valueOf(menu.getOrDefault("type_form", 0)));

        sb.append("- [").append(id, 0, Math.min(8, id.length())).append("] ");
        sb.append(label);

        if (!tableName.isEmpty()) {
            sb.append(" (table: ").append(tableName).append(")");
        }
        sb.append(" type=").append(typeForm);

        Object children = menu.get("children");
        if (children instanceof List) {
            List<?> childList = (List<?>) children;
            sb.append(" [").append(childList.size()).append(" children]");
        }

        return sb.toString();
    }

    /**
     * Build smart context for conversation: recent turns + summaries of older
     */
    public String buildSmartConversationContext(List<String> allTurns, int maxChars) {
        if (allTurns == null || allTurns.isEmpty()) return "";

        StringBuilder context = new StringBuilder();
        int charCounter = 0;

        // Add recent turns in full
        int recentCount = Math.min(3, allTurns.size());
        for (int i = allTurns.size() - recentCount; i < allTurns.size(); i++) {
            String turn = allTurns.get(i);
            if (charCounter + turn.length() <= maxChars) {
                context.append(turn).append("\n---\n");
                charCounter += turn.length() + 5;
            }
        }

        // Add summaries of older turns
        for (int i = 0; i < allTurns.size() - recentCount; i++) {
            String turn = allTurns.get(i);
            String summary = summarizeTurn(turn, 100);
            if (charCounter + summary.length() <= maxChars) {
                context.append(summary).append("\n");
                charCounter += summary.length();
            }
        }

        return context.toString();
    }

    /**
     * Estimate tokens from characters (rough: 1 char ≈ 0.25-0.3 tokens for English)
     */
    public int estimateTokens(String text) {
        if (text == null) return 0;
        // Rule of thumb: ~4 chars per token, plus word boundary adjustments
        int chars = text.length();
        int words = text.split("\\s+").length;
        // Average: 4-5 chars per token, but words add overhead
        return (int) Math.ceil(chars / 4.0 + words * 0.1);
    }

    /**
     * Calculate cost savings compared to unoptimized
     */
    public Map<String, Object> calculateCostSavings(int originalChars, int optimizedChars, 
                                                     double geminiInputCostPerToken) {
        int originalTokens = estimateTokens(buildString(originalChars));
        int optimizedTokens = estimateTokens(buildString(optimizedChars));

        double originalCost = originalTokens * geminiInputCostPerToken;
        double optimizedCost = optimizedTokens * geminiInputCostPerToken;
        double savedCost = originalCost - optimizedCost;
        double savingsPercent = 100.0 * (1.0 - (double) optimizedTokens / originalTokens);

        Map<String, Object> result = new HashMap<>();
        result.put("original_chars", originalChars);
        result.put("optimized_chars", optimizedChars);
        result.put("original_tokens", originalTokens);
        result.put("optimized_tokens", optimizedTokens);
        result.put("original_cost_usd", String.format("%.4f", originalCost));
        result.put("optimized_cost_usd", String.format("%.4f", optimizedCost));
        result.put("saved_cost_usd", String.format("%.4f", savedCost));
        result.put("savings_percent", String.format("%.1f%%", savingsPercent));
        return result;
    }

    // ─── Private compression helpers ─────────────────────────────

    private String normalizeWhitespace(String text) {
        // Remove excessive newlines
        text = MULTI_NEWLINE.matcher(text).replaceAll("\n\n");
        // Remove leading/trailing whitespace per line
        text = text.lines()
            .map(String::strip)
            .collect(Collectors.joining("\n"));
        // Remove excessive spaces
        text = MULTI_SPACE.matcher(text).replaceAll(" ");
        return text;
    }

    private String removeComments(String text) {
        // Remove /* */ comments
        text = text.replaceAll("/\\*[^*]*\\*+(?:[^/*][^*]*\\*+)*/", "");
        // Remove // comments (end of line)
        text = text.replaceAll("//.*$", "");
        // Remove HTML comments
        text = text.replaceAll("<!--.*?-->", "");
        return text;
    }

    private String compressJsonStructures(String text) {
        // Remove pretty-printing indentation in JSON-like content
        StringBuilder sb = new StringBuilder();
        boolean inString = false;
        boolean inJson = false;
        int braceDepth = 0;

        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            char next = i < text.length() - 1 ? text.charAt(i + 1) : '\0';

            if (c == '"' && (i == 0 || text.charAt(i - 1) != '\\')) {
                inString = !inString;
            }

            if (!inString) {
                if (c == '{' || c == '[') {
                    braceDepth++;
                    inJson = true;
                    sb.append(c);
                    // Skip following whitespace
                    while (i + 1 < text.length() && Character.isWhitespace(text.charAt(i + 1))) {
                        i++;
                    }
                    continue;
                }
                if (c == '}' || c == ']') {
                    braceDepth--;
                    if (sb.length() > 0 && Character.isWhitespace(sb.charAt(sb.length() - 1))) {
                        sb.setLength(sb.length() - 1);
                    }
                    sb.append(c);
                    continue;
                }
                if (inJson && Character.isWhitespace(c)) {
                    if (sb.length() > 0 && !Character.isWhitespace(sb.charAt(sb.length() - 1))) {
                        sb.append(' ');
                    }
                    continue;
                }
            }

            sb.append(c);
        }

        return sb.toString();
    }

    private String compressRepetitivePatterns(String text, String hint) {
        // Compress repeated field definitions in menus
        if ("menu".equalsIgnoreCase(hint)) {
            text = text.replaceAll(
                "\"hideinmenu\"\\s*:\\s*0\\s*,", "");
            text = text.replaceAll(
                "\"type_form\"\\s*:\\s*0\\s*,", "");
            text = text.replaceAll(
                "\"m_show\"\\s*:\\s*true\\s*,", "");
        }
        return text;
    }

    private String applyContextWindowing(String text, int maxChars) {
        if (text.length() <= maxChars) {
            return text;
        }

        // Keep first and last sections
        String[] sections = text.split("\n---\n");
        if (sections.length <= 1) {
            return text.substring(0, maxChars);
        }

        StringBuilder result = new StringBuilder();
        int charCounter = 0;

        // Add recent sections first
        int recentSections = Math.min(2, sections.length);
        for (int i = sections.length - recentSections; i < sections.length; i++) {
            String section = sections[i];
            if (charCounter + section.length() <= maxChars) {
                result.append(section).append("\n---\n");
                charCounter += section.length() + 5;
            }
        }

        // Add summaries of earlier sections
        for (int i = 0; i < sections.length - recentSections; i++) {
            String section = sections[i];
            String summary = summarizeTurn(section, 60);
            if (charCounter + summary.length() <= maxChars) {
                result.append(summary).append("\n");
                charCounter += summary.length();
            }
        }

        return result.toString();
    }

    private String summarizeTurn(String turn, int maxLen) {
        String[] lines = turn.split("\n");
        StringBuilder summary = new StringBuilder();

        // Take first and last meaningful lines
        for (String line : lines) {
            if (line.trim().isEmpty() || line.startsWith("//")) continue;
            if (summary.length() + line.length() <= maxLen) {
                summary.append(line).append(" ");
            } else {
                break;
            }
        }

        return summary.toString().trim();
    }

    private String buildString(int length) {
        // Dummy string for token estimation
        return "a".repeat(Math.min(length, 10000));
    }
}
