package net.phanmemmottrieu.service;

import java.util.regex.Pattern;

/**
 * Consolidated Regex Pattern Registry for Local AI Orchestration.
 * 
 * Goal: Avoid regex recompilation overhead in tight loops + reduce duplicates.
 * Benefit: Weak machine performance improvement (regex compile is expensive on CPU).
 */
public class AiOrchestrationPatternRegistry {

    // Function/class/interface declarations (used in 4+ places)
    public static final Pattern FUNCTION_DECLARATION = Pattern.compile(
        "(?m)(?:function\\s+([A-Za-z_$][A-Za-z0-9_$]*)\\s*\\(|const\\s+([A-Za-z_$][A-Za-z0-9_$]*)\\s*=\\s*\\([^\\)]*\\)\\s*=>|class\\s+([A-Za-z_$][A-Za-z0-9_$]*)|public\\s+[\\w<>]+\\s+([A-Za-z_$][A-Za-z0-9_$]*)\\s*\\()"
    );

    // State management patterns (React hooks, Vue ref, Angular injectable)
    public static final Pattern STATE_PATTERN = Pattern.compile(
        "(?i)(useState\\s*\\(|useReducer\\s*\\(|set[A-Z][A-Za-z0-9_]*\\s*\\(|props\\.|state\\.|ref\\.|memo\\(|computed\\(|@Input|@State)"
    );

    // Side effects: API/persistence/async operations
    public static final Pattern SIDE_EFFECT_PATTERN = Pattern.compile(
        "(?i)(fetch\\s*\\(|axios\\.|request\\.|recordManager\\.|save\\s*\\(|update\\s*\\(|delete\\s*\\(|emit\\s*\\(|socket\\.|sseemitter|settimeout\\s*\\(|setInterval\\s*\\(|async\\s+|await\\s+)"
    );

    // Branch control flow (if/switch/case)
    public static final Pattern IF_CONDITION = Pattern.compile("(?m)\\bif\\s*\\(([^\\)]{1,120})\\)");
    public static final Pattern SWITCH_CONDITION = Pattern.compile("(?m)\\bswitch\\s*\\(([^\\)]{1,100})\\)");

    // Input signals (params, props, request body)
    public static final Pattern INPUT_SIGNAL = Pattern.compile(
        "(?i)\\b(props\\.|params\\.|request\\.|body\\.|attachments\\b|currentCode\\b|cursorLine\\b|message\\b|intent\\b)"
    );

    // Output signals (return, state setters, emit)
    public static final Pattern OUTPUT_SIGNAL = Pattern.compile(
        "(?i)\\b(return\\b|set[A-Z][A-Za-z0-9_]*\\s*\\(|emit\\s*\\(|response\\.set|socket\\.|sseemitter|yield\\s+)"
    );

    // Evidence code references (backticks, method calls, camelCase identifiers)
    public static final Pattern EVIDENCE_CODE_REF = Pattern.compile(
        "`[^`]+`|[A-Za-z_$][A-Za-z0-9_$]*\\s*[.(\\[]|\\b[a-z][a-zA-Z0-9]{2,}[A-Z][a-zA-Z0-9]*\\b"
    );

    // Type annotations (Java/TypeScript)
    public static final Pattern TYPE_ANNOTATION = Pattern.compile(
        "(?:public|private|protected)?\\s*(?:static\\s+)?(?:final\\s+)?" +
        "(?:List|Set|Map|Optional|Stream|Function|Supplier|Consumer|Predicate|" +
        "String|int|long|double|float|boolean|byte|short|char|void|Object|" +
        "var|let|const|string|number|boolean|object|any|unknown|null|undefined|" +
        "str|int|float|bool|list|dict|tuple|Optional|Union|Type)" +
        "(?:<[^>]+>)?\\s*[A-Za-z_][A-Za-z0-9_]*"
    );

    // React-specific patterns
    public static final Pattern REACT_JSX_TAG = Pattern.compile("<[A-Z][A-Za-z0-9]*.*?>");
    public static final Pattern REACT_HOOK_CALL = Pattern.compile("\\b(use[A-Z][A-Za-z0-9]*|useCallback|useMemo|useRef|useContext)\\s*\\(");
    public static final Pattern REACT_LIFECYCLE = Pattern.compile("(componentDidMount|componentWillUnmount|useEffect)\\s*\\(");

    // Java-specific patterns
    public static final Pattern JAVA_ANNOTATION = Pattern.compile("@[A-Za-z][A-Za-z0-9]*");
    public static final Pattern JAVA_EXCEPTION_HANDLING = Pattern.compile("\\b(try|catch|finally|throw)\\b");

    // Generic tokens (3+ chars, used in intent matching)
    public static final Pattern GENERIC_TOKEN = Pattern.compile("[a-zA-Z0-9_\\-]{3,}");

    // Multi-line whitespace (for normalization)
    public static final Pattern MULTI_NEWLINE = Pattern.compile("\\n{3,}");

    // Code language detection
    public static final Pattern TYPESCRIPT_SIGNATURE = Pattern.compile(":\\s*(?:string|number|boolean|any|unknown|void|never|type|interface)\\b");
    public static final Pattern JAVA_SIGNATURE = Pattern.compile("(?:public|private|protected|static|final)\\s+(?:class|interface|enum|record)\\b");
    public static final Pattern PYTHON_SIGNATURE = Pattern.compile("^\\s*(?:def|class)\\s+[A-Za-z_]|^\\s*@");
    public static final Pattern VUE_SIGNATURE = Pattern.compile("(?:<template>|<script|v-if|v-for|@click)");

    // Dynamic context leak detection (internal framework markers)
    public static final Pattern DYNAMIC_CONTEXT_LEAK_PREFIX = Pattern.compile("(?im)^\\s*(dyn_ctx_|source=primary_flow|ORCHESTRATION_SCANNER|STAGE_TIME:|STEP_INDEX:)");

    // CSS/DOM fragment detection (false positives from malformed output)
    public static final Pattern CSS_DOM_FRAGMENT = Pattern.compile(
        "(?im)(\\{\\s*color\\s*:|className\\s*=|style\\s*=|<div|<span|<button|xmlns|svg|rect|circle|polygon|@media\\s|@keyframes\\s)"
    );

    // Normalize numeric noise in outputs
    public static final Pattern NUMERIC_NOISE = Pattern.compile("(?im)^\\s*luong[_\\s/-]*xu[_\\s/-]*ly\\s*:\\s*\\d{3,}\\s*$");

    // Common false positive patterns (generic output that lacks evidence)
    public static final Pattern GENERIC_TEMPLATE_PHRASE = Pattern.compile(
        "(?i)(code này có|đoạn code này|bạn nên|nên sử dụng|cần phải|chúng ta có|chức năng này|logic này|phần này)"
    );

    /**
     * Extract group from matcher, with null-safe fallback.
     * Usage: String name = firstNonBlank(m.group(1), m.group(2), m.group(3))
     */
    public static String firstNonBlank(String... candidates) {
        for (String candidate : candidates) {
            if (candidate != null && !candidate.isBlank()) {
                return candidate;
            }
        }
        return "";
    }

    /**
     * Count pattern matches in text (efficient for tight loops).
     */
    public static long countMatches(Pattern pattern, String text) {
        if (text == null || text.isBlank()) {
            return 0;
        }
        return pattern.matcher(text).results().count();
    }

    /**
     * Safe pattern match with max iterations to prevent DOS.
     */
    public static java.util.List<String> findMatches(Pattern pattern, String text, int maxMatches) {
        java.util.List<String> results = new java.util.ArrayList<>();
        if (text == null || text.isBlank()) {
            return results;
        }
        var matcher = pattern.matcher(text);
        int count = 0;
        while (matcher.find() && count < maxMatches) {
            results.add(matcher.group(1) != null ? matcher.group(1) : matcher.group(0));
            count++;
        }
        return results;
    }
}
