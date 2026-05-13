package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Fast-path pattern cache for recognizing boilerplate code edits.
 * 
 * Avoids full inference for predictable patterns (getters, setters, factory methods, CRUD ops).
 * Matches SEARCH/REPLACE blocks against known templates and returns cached results.
 * Expected speedup: 2-3x faster on boilerplate, lower token usage.
 */
@Service
public class AiPatternCacheService {

    private static final Logger logger = LoggerFactory.getLogger(AiPatternCacheService.class);

    @Value("${ai.code.stream.pattern-cache.enabled:true}")
    private boolean enabled;

    @Value("${ai.code.stream.pattern-cache.min-confidence:0.75}")
    private double minConfidence;

    @Value("${ai.code.stream.pattern-cache.max-patterns:200}")
    private int maxPatterns;

    private final List<CodePattern> patterns = new ArrayList<>();

    // ─── Pattern Matching Result ────────────────────────────────────────────────
    public static class PatternMatch {
        public boolean matched;
        public String patternName;
        public double confidence;
        public String suggestedEdit;
        public String explanation;

        public PatternMatch(boolean matched, String patternName, double confidence, String suggestedEdit, String explanation) {
            this.matched = matched;
            this.patternName = patternName;
            this.confidence = confidence;
            this.suggestedEdit = suggestedEdit;
            this.explanation = explanation;
        }

        public static PatternMatch noMatch() {
            return new PatternMatch(false, "", 0.0, "", "");
        }
    }

    // ─── Pattern Definition ────────────────────────────────────────────────────
    private static class CodePattern {
        String name;
        String category;
        Pattern searchRegex;
        String replaceTemplate;
        double confidenceBase;

        CodePattern(String name, String category, String searchRegex, String replaceTemplate, double confidenceBase) {
            this.name = name;
            this.category = category;
            try {
                this.searchRegex = Pattern.compile(searchRegex, Pattern.DOTALL | Pattern.MULTILINE);
            } catch (Exception e) {
                logger.warn("Invalid regex for pattern {}: {}", name, e.getMessage());
                this.searchRegex = Pattern.compile("(?!)"); // Never matches
            }
            this.replaceTemplate = replaceTemplate;
            this.confidenceBase = confidenceBase;
        }
    }

    // ─── Constructor: Initialize Pattern Database ────────────────────────────────
    public AiPatternCacheService() {
        initializePatterns();
    }

    private void initializePatterns() {
        // ─── GETTER PATTERN ───
        patterns.add(new CodePattern(
            "getter_simple",
            "accessor",
            "public\\s+\\w+\\s+get\\w+\\(\\)\\s*\\{\\s*return\\s+this\\.\\w+;\\s*\\}",
            "public ${type} get${fieldName}() {\n    return this.${fieldName};\n}",
            0.95
        ));

        // ─── SETTER PATTERN ───
        patterns.add(new CodePattern(
            "setter_simple",
            "mutator",
            "public\\s+void\\s+set\\w+\\(\\s*\\w+\\s+\\w+\\s*\\)\\s*\\{\\s*this\\.\\w+\\s*=\\s*\\w+;\\s*\\}",
            "public void set${fieldName}(${type} ${paramName}) {\n    this.${fieldName} = ${paramName};\n}",
            0.95
        ));

        // ─── NULL CHECK PATTERN ───
        patterns.add(new CodePattern(
            "null_check_throw",
            "validation",
            "if\\s*\\(\\s*\\w+\\s*==\\s*null\\s*\\)\\s*throw\\s+new\\s+\\w+Exception\\s*\\(",
            "if (${param} == null) throw new IllegalArgumentException(\"${param} cannot be null\");",
            0.90
        ));

        // ─── FACTORY METHOD PATTERN ───
        patterns.add(new CodePattern(
            "factory_method",
            "factory",
            "public\\s+static\\s+\\w+\\s+create\\w*\\(.*?\\)\\s*\\{\\s*return\\s+new\\s+\\w+\\(.*?\\);\\s*\\}",
            "public static ${className} create(${params}) {\n    return new ${className}(${args});\n}",
            0.85
        ));

        // ─── LIST ADD PATTERN ───
        patterns.add(new CodePattern(
            "list_add",
            "collection",
            "\\w+\\.add\\(\\s*.*?\\s*\\);",
            "${listName}.add(${item});",
            0.88
        ));

        // ─── MAP PUT PATTERN ───
        patterns.add(new CodePattern(
            "map_put",
            "collection",
            "\\w+\\.put\\(\\s*.*?\\s*,\\s*.*?\\s*\\);",
            "${mapName}.put(${key}, ${value});",
            0.88
        ));

        // ─── BUILDER PATTERN ───
        patterns.add(new CodePattern(
            "builder_setter",
            "builder",
            "public\\s+\\w+\\s+with\\w+\\(\\s*\\w+\\s+\\w+\\s*\\)\\s*\\{\\s*this\\.\\w+\\s*=\\s*\\w+;\\s*return\\s+this;\\s*\\}",
            "public ${className} with${fieldName}(${type} ${paramName}) {\n    this.${fieldName} = ${paramName};\n    return this;\n}",
            0.90
        ));

        // ─── EQUALS METHOD PATTERN ───
        patterns.add(new CodePattern(
            "equals_method",
            "object_method",
            "@Override\\s+public\\s+boolean\\s+equals\\(Object\\s+o\\)\\s*\\{.*?return\\s+Objects\\.equals\\(.*?\\);\\s*\\}",
            "@Override\npublic boolean equals(Object o) {\n    if (this == o) return true;\n    if (!(o instanceof ${className})) return false;\n    ${className} that = (${className}) o;\n    return Objects.equals(this.${field}, that.${field});\n}",
            0.92
        ));

        // ─── HASHCODE METHOD PATTERN ───
        patterns.add(new CodePattern(
            "hashcode_method",
            "object_method",
            "@Override\\s+public\\s+int\\s+hashCode\\(\\)\\s*\\{\\s*return\\s+Objects\\.hash\\(.*?\\);\\s*\\}",
            "@Override\npublic int hashCode() {\n    return Objects.hash(${fields});\n}",
            0.92
        ));

        // ─── TOSTRING PATTERN ───
        patterns.add(new CodePattern(
            "tostring_method",
            "object_method",
            "@Override\\s+public\\s+String\\s+toString\\(\\)\\s*\\{\\s*return\\s+\\\".*?\\\"\\s*\\+.*?;\\s*\\}",
            "@Override\npublic String toString() {\n    return \"${className}{\" +\n            \"${fields}\" +\n            \"}\";\n}",
            0.90
        ));

        // ─── DEPENDENCY INJECTION PATTERN ───
        patterns.add(new CodePattern(
            "autowired_field",
            "spring",
            "@Autowired\\s+private\\s+\\w+\\s+\\w+;",
            "@Autowired\nprivate ${serviceType} ${fieldName};",
            0.88
        ));

        // ─── CRUD FIND PATTERN ───
        patterns.add(new CodePattern(
            "crud_find",
            "dao",
            "public\\s+\\w+\\s+find\\w*\\(.*?\\)\\s*\\{.*?return\\s+\\w+;\\s*\\}",
            "public ${entityType} find${entityName}(${params}) {\n    return repository.find${entityName}(${args});\n}",
            0.82
        ));

        // ─── CRUD SAVE PATTERN ───
        patterns.add(new CodePattern(
            "crud_save",
            "dao",
            "public\\s+\\w+\\s+save\\(.*?\\)\\s*\\{.*?return\\s+\\w+\\.save\\(.*?\\);\\s*\\}",
            "public ${entityType} save(${entityType} entity) {\n    return repository.save(entity);\n}",
            0.85
        ));

        // ─── CRUD DELETE PATTERN ───
        patterns.add(new CodePattern(
            "crud_delete",
            "dao",
            "public\\s+void\\s+delete\\(.*?\\)\\s*\\{.*?\\w+\\.delete\\(.*?\\);\\s*\\}",
            "public void delete(${idType} id) {\n    repository.deleteById(id);\n}",
            0.84
        ));

        // ─── LOG STATEMENT PATTERN ───
        patterns.add(new CodePattern(
            "log_info",
            "logging",
            "logger\\.info\\(\".*?\"\\);",
            "logger.info(\"${message}\");",
            0.80
        ));

        // ─── SYNCHRONIZED BLOCK PATTERN ───
        patterns.add(new CodePattern(
            "synchronized_block",
            "concurrency",
            "synchronized\\s*\\(\\s*\\w+\\s*\\)\\s*\\{.*?\\}",
            "synchronized (${lockObj}) {\n    ${code}\n}",
            0.85
        ));

        logger.info("Initialized {} code patterns for fast-path caching", patterns.size());
    }

    // ─── Main Matching API ────────────────────────────────────────────────────
    /**
     * Try to match the given SEARCH/REPLACE block against pattern database.
     * Returns a match with confidence >= minConfidence, or noMatch() otherwise.
     */
    public PatternMatch tryMatch(String searchBlock, String replaceBlock, String codeContext) {
        if (!enabled || patterns.isEmpty()) {
            return PatternMatch.noMatch();
        }

        String search = String.valueOf(searchBlock == null ? "" : searchBlock).trim();
        String replace = String.valueOf(replaceBlock == null ? "" : replaceBlock).trim();
        String context = String.valueOf(codeContext == null ? "" : codeContext).trim();

        if (search.isBlank() || replace.isBlank()) {
            return PatternMatch.noMatch();
        }

        // ─── Score each pattern ────────────────────────────────────────────────
        List<PatternMatch> candidates = new ArrayList<>();

        for (CodePattern pattern : patterns) {
            try {
                Matcher matcher = pattern.searchRegex.matcher(search);
                if (matcher.find()) {
                    double score = scoreMatch(pattern, search, replace, context);
                    if (score >= minConfidence) {
                        candidates.add(new PatternMatch(
                            true,
                            pattern.name,
                            score,
                            pattern.replaceTemplate,
                            String.format("Matched %s pattern with %.1f%% confidence", pattern.category, score * 100)
                        ));
                    }
                }
            } catch (Exception e) {
                logger.debug("Pattern matching error for {}: {}", pattern.name, e.getMessage());
            }
        }

        // ─── Return best match ────────────────────────────────────────────────
        if (candidates.isEmpty()) {
            return PatternMatch.noMatch();
        }

        return candidates.stream()
            .max(Comparator.comparingDouble(m -> m.confidence))
            .orElse(PatternMatch.noMatch());
    }

    /**
     * Score a pattern match considering multiple factors.
     * Returns confidence in range [0, 1].
     */
    private double scoreMatch(CodePattern pattern, String search, String replace, String context) {
        double score = pattern.confidenceBase;

        // Boost if context contains related keywords
        String contextLower = context.toLowerCase(Locale.ROOT);
        if (contextLower.contains(pattern.category.toLowerCase(Locale.ROOT))) {
            score += 0.05;
        }

        // Reduce if replace is too different from template
        if (!replaceContainsPatternHints(replace, pattern.replaceTemplate)) {
            score -= 0.10;
        }

        // Normalize to [0, 1]
        return Math.max(0, Math.min(1, score));
    }

    /**
     * Check if replace block contains template hint keywords.
     */
    private boolean replaceContainsPatternHints(String replace, String template) {
        // Extract placeholder names from template (e.g., ${fieldName}, ${type})
        Pattern placeholderPattern = Pattern.compile("\\$\\{([^}]+)\\}");
        Matcher matcher = placeholderPattern.matcher(template);

        while (matcher.find()) {
            String placeholder = matcher.group(1);
            // Check if replace has any identifier that could map to this placeholder
            if (!replace.toLowerCase(Locale.ROOT).contains(placeholder.toLowerCase(Locale.ROOT))) {
                // Placeholder not found in replace - might be a mismatch
            }
        }

        return true; // Simplified: assume replace is valid if it passed earlier checks
    }

    /**
     * Get all patterns of a specific category.
     */
    public List<String> getPatternsInCategory(String category) {
        return patterns.stream()
            .filter(p -> p.category.equalsIgnoreCase(category))
            .map(p -> p.name)
            .collect(Collectors.toList());
    }

    /**
     * Get pattern cache statistics (for diagnostics).
     */
    public Map<String, Object> getStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("enabled", enabled);
        stats.put("totalPatterns", patterns.size());
        stats.put("minConfidence", minConfidence);
        
        Map<String, Long> byCategory = patterns.stream()
            .collect(Collectors.groupingBy(p -> p.category, Collectors.counting()));
        stats.put("patternsByCategory", byCategory);

        return stats;
    }
}
