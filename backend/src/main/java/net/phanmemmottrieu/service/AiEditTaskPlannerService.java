package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Cursor/Copilot-aligned task planner: analyze user request → locate code/menu regions →
 * decompose into ordered execution slices for incremental edit on CodeMirror code strings.
 */
@Service
public class AiEditTaskPlannerService {

    private static final Logger log = LoggerFactory.getLogger(AiEditTaskPlannerService.class);

    @Value("${ai.edit.task-planner.enabled:true}")
    private boolean enabled;

    @Value("${ai.edit.task-planner.max-slices:6}")
    private int maxSlices;

    @Value("${ai.edit.task-planner.slice-context-lines:80}")
    private int sliceContextLines;

    @Value("${ai.edit.task-planner.multi-slice-threshold-chars:30000}")
    private int multiSliceThresholdChars;

    @Value("${ai.edit.task-planner.slice-max-chars:4000}")
    private int sliceMaxChars;

    private static final String[] LIFECYCLE_SYMBOLS = {
        "__forceKillWebviewProcess", "__waitForWebviewExit", "waitForProcessDeath",
        "closeAllTabsAndCleanup", "closeAllTabs", "fnRemoveTab", "fnResetIP",
        "stopApp", "runApp", "clearInterval", "stopProcess", "killProcess",
        "isProcessRunning", "runParallelProcessing", "waitForAllTabsClose", "webview"
    };

    public record EditTaskSlice(
        int index,
        int total,
        String kind,
        String objective,
        int lineStart,
        int lineEnd,
        List<String> symbols,
        String excerptPreview
    ) {
        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("index", index);
            m.put("total", total);
            m.put("kind", kind);
            m.put("objective", objective);
            m.put("lineStart", lineStart);
            m.put("lineEnd", lineEnd);
            m.put("symbols", symbols == null ? List.of() : symbols);
            m.put("excerptPreview", excerptPreview == null ? "" : excerptPreview);
            return m;
        }
    }

    public record EditTaskPlan(
        boolean enabled,
        String requestSummary,
        String flowType,
        String language,
        String responseMode,
        List<String> targetSymbols,
        List<String> ragQueries,
        List<EditTaskSlice> slices,
        boolean multiSliceExecution,
        Map<String, Object> meta
    ) {
        public static EditTaskPlan disabled() {
            return new EditTaskPlan(false, "", "QUICK", "", "analyze", List.of(), List.of(), List.of(), false, Map.of());
        }

        public Map<String, Object> toTelemetryMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("enabled", enabled);
            m.put("requestSummary", requestSummary);
            m.put("flowType", flowType);
            m.put("language", language);
            m.put("responseMode", responseMode);
            m.put("targetSymbols", targetSymbols);
            m.put("ragQueries", ragQueries);
            m.put("sliceCount", slices == null ? 0 : slices.size());
            m.put("multiSliceExecution", multiSliceExecution);
            m.put("slices", slices == null ? List.of() : slices.stream().map(EditTaskSlice::toMap).toList());
            if (meta != null) {
                m.putAll(meta);
            }
            return m;
        }
    }

    public EditTaskPlan plan(
        String message,
        String contextType,
        String language,
        String responseMode,
        String fullCode,
        int cursorLine,
        int focusStartLine,
        int focusEndLine
    ) {
        if (!enabled) {
            return EditTaskPlan.disabled();
        }
        String code = String.valueOf(fullCode == null ? "" : fullCode);
        String msg = String.valueOf(message == null ? "" : message).trim();
        String lang = normalizeLanguage(language, contextType, code);
        String mode = String.valueOf(responseMode == null ? "analyze" : responseMode).trim().toLowerCase(Locale.ROOT);
        boolean menuFlow = "menu_json".equalsIgnoreCase(String.valueOf(contextType == null ? "" : contextType).trim());
        String flowType = menuFlow ? "MENU_JSON" : ("edit".equals(mode) ? "FRONTEND_CODE" : "QUICK_QUESTION");

        List<String> targetSymbols = extractTargetSymbols(msg, code, lang, menuFlow);
        List<String> ragQueries = buildRagQueries(msg, targetSymbols, lang, menuFlow);

        List<EditTaskSlice> slices = menuFlow
            ? planMenuSlices(msg, code, targetSymbols)
            : planCodeSlices(msg, code, lang, cursorLine, focusStartLine, focusEndLine, targetSymbols);

        boolean multiSlice = "edit".equals(mode)
            && !menuFlow
            && code.length() >= Math.max(10000, multiSliceThresholdChars)
            && slices.size() > 1;

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("sourceChars", code.length());
        meta.put("sourceLines", countLines(code));
        meta.put("plannerVersion", "1.0");

        log.debug("EditTaskPlan flow={} symbols={} slices={} multiSlice={} chars={}",
            flowType, targetSymbols.size(), slices.size(), multiSlice, code.length());

        return new EditTaskPlan(
            true,
            summarizeRequest(msg),
            flowType,
            lang,
            mode,
            targetSymbols,
            ragQueries,
            slices,
            multiSlice,
            meta
        );
    }

    /**
     * Build condensed editor context from planner slices (Cursor-style region injection).
     */
    public String buildCondensedContextFromPlan(EditTaskPlan plan, String fullCode, int maxChars) {
        if (plan == null || !plan.enabled() || plan.slices() == null || plan.slices().isEmpty()) {
            return "";
        }
        String code = String.valueOf(fullCode == null ? "" : fullCode);
        int cap = Math.max(8000, maxChars);
        StringBuilder sb = new StringBuilder();
        sb.append("/* EDIT_TASK_PLAN slices=").append(plan.slices().size())
            .append(" symbols=").append(plan.targetSymbols() == null ? 0 : plan.targetSymbols().size())
            .append(" flow=").append(plan.flowType())
            .append(" lang=").append(plan.language())
            .append(" */\n\n");

        for (EditTaskSlice slice : plan.slices()) {
            String block = extractSliceExcerpt(code, slice.lineStart(), slice.lineEnd(), sliceMaxChars);
            if (block.isBlank()) {
                continue;
            }
            String header = "/* SLICE " + slice.index() + "/" + slice.total()
                + " kind=" + slice.kind()
                + " lines " + slice.lineStart() + "-" + slice.lineEnd()
                + " symbols=" + String.join(",", slice.symbols() == null ? List.of() : slice.symbols())
                + " */\n";
            String chunk = header + block;
            if (sb.length() + chunk.length() + 2 > cap) {
                break;
            }
            sb.append(chunk).append("\n\n");
        }
        return truncateMiddle(sb.toString().trim(), cap);
    }

    public String buildSliceObjective(EditTaskSlice slice, String userMessage) {
        String base = String.valueOf(userMessage == null ? "" : userMessage).trim();
        if (slice == null) {
            return base;
        }
        return base
            + "\n\n[SLICE " + slice.index() + "/" + slice.total() + "] "
            + slice.objective()
            + "\nEdit ONLY lines " + slice.lineStart() + "-" + slice.lineEnd()
            + " in the FULL file. Return textEdits with absolute 1-based line numbers.";
    }

    public String extractSliceExcerpt(String fullCode, int lineStart, int lineEnd, int maxChars) {
        String code = String.valueOf(fullCode == null ? "" : fullCode);
        if (code.isBlank() || lineStart < 1) {
            return "";
        }
        String[] lines = code.split("\\r?\\n", -1);
        int start = Math.max(0, lineStart - 1);
        int end = Math.min(lines.length, Math.max(start, lineEnd));
        if (start >= lines.length) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (int i = start; i < end; i++) {
            sb.append(lines[i]);
            if (i < end - 1) {
                sb.append('\n');
            }
        }
        return truncateMiddle(sb.toString(), Math.max(500, maxChars));
    }

    // ── Symbol extraction ─────────────────────────────────────────────────────

    List<String> extractTargetSymbols(String message, String code, String language, boolean menuFlow) {
        LinkedHashSet<String> symbols = new LinkedHashSet<>();
        String msg = String.valueOf(message == null ? "" : message);
        String lower = msg.toLowerCase(Locale.ROOT);

        if (isLifecycleRequest(lower)) {
            for (String sym : LIFECYCLE_SYMBOLS) {
                if (codeContainsSymbol(code, sym)) {
                    symbols.add(sym);
                }
            }
        }

        if (menuFlow) {
            Matcher idMatcher = Pattern.compile("(?:node\\s*id|id\\s*[:=]\\s*|mã\\s*node\\s*)[\"']?([A-Za-z0-9_$.-]{2,64})").matcher(msg);
            while (idMatcher.find()) {
                symbols.add(idMatcher.group(1));
            }
            Matcher labelMatcher = Pattern.compile("[\"']([A-Za-z0-9_\\s\\u00C0-\\u1EF9.-]{2,80})[\"']").matcher(msg);
            while (labelMatcher.find() && symbols.size() < maxSlices * 2) {
                String label = labelMatcher.group(1).trim();
                if (label.length() >= 3) {
                    symbols.add(label);
                }
            }
        }

        Pattern[] patterns = languagePatterns(language);
        for (Pattern p : patterns) {
            Matcher m = p.matcher(msg);
            while (m.find() && symbols.size() < maxSlices * 3) {
                String candidate = m.groupCount() >= 1 ? m.group(1) : m.group();
                if (isUsefulSymbol(candidate)) {
                    symbols.add(candidate.trim());
                }
            }
        }

        // Backtick-quoted identifiers from user message
        Matcher backtick = Pattern.compile("`([A-Za-z_][A-Za-z0-9_$.]{2,64})`").matcher(msg);
        while (backtick.find() && symbols.size() < maxSlices * 3) {
            symbols.add(backtick.group(1));
        }

        // CamelCase / snake identifiers explicitly mentioned
        Matcher ident = Pattern.compile("\\b([A-Za-z_][A-Za-z0-9_]{2,64})\\b").matcher(msg);
        while (ident.find() && symbols.size() < maxSlices * 3) {
            String token = ident.group(1);
            if (isUsefulSymbol(token) && codeContainsSymbol(code, token)) {
                symbols.add(token);
            }
        }

        return new ArrayList<>(symbols);
    }

    private List<String> buildRagQueries(String message, List<String> symbols, String language, boolean menuFlow) {
        List<String> queries = new ArrayList<>();
        String msg = truncate(String.valueOf(message == null ? "" : message).trim(), 240);
        if (!msg.isBlank()) {
            queries.add(msg);
        }
        int symLimit = Math.min(4, symbols == null ? 0 : symbols.size());
        for (int i = 0; i < symLimit; i++) {
            queries.add("symbol:" + symbols.get(i) + " lang:" + language + (menuFlow ? " menu_json" : " code"));
        }
        return queries.stream().distinct().limit(6).toList();
    }

    // ── Code slice planning ───────────────────────────────────────────────────

    private List<EditTaskSlice> planCodeSlices(
        String message,
        String code,
        String language,
        int cursorLine,
        int focusStartLine,
        int focusEndLine,
        List<String> targetSymbols
    ) {
        List<RegionAnchor> anchors = new ArrayList<>();

        // Only explicit selection narrows scope. No highlight → scan full string (symbols + code_full fallback).
        if (focusStartLine > 0 && focusEndLine >= focusStartLine) {
            anchors.add(new RegionAnchor(focusStartLine, focusEndLine, "cursor_selection", List.of(), 0));
        }

        int symRank = 1;
        for (String symbol : targetSymbols) {
            for (SymbolHit hit : findSymbolHits(code, symbol, language)) {
                anchors.add(new RegionAnchor(
                    hit.lineStart(),
                    hit.lineEnd(),
                    "symbol_" + symbol,
                    List.of(symbol),
                    symRank++
                ));
            }
            if (anchors.size() >= maxSlices * 2) {
                break;
            }
        }

        List<RegionAnchor> merged = mergeAnchors(anchors, sliceContextLines);
        List<EditTaskSlice> slices = new ArrayList<>();
        int total = Math.min(maxSlices, merged.size());
        String objective = summarizeRequest(message);

        for (int i = 0; i < total; i++) {
            RegionAnchor a = merged.get(i);
            String preview = truncate(extractSliceExcerpt(code, a.lineStart, a.lineEnd, 200), 200);
            slices.add(new EditTaskSlice(
                i + 1,
                total,
                a.kind,
                objective + " — focus " + (a.symbols.isEmpty() ? a.kind : String.join(", ", a.symbols)),
                a.lineStart,
                a.lineEnd,
                a.symbols,
                preview
            ));
        }

        // No selection / no symbol hit: scope = entire code string (same semantics as menu_full).
        if (slices.isEmpty() && code != null && !code.isBlank()) {
            int lineCount = countLines(code);
            List<String> symList = targetSymbols == null ? List.of() : targetSymbols;
            slices.add(new EditTaskSlice(
                1,
                1,
                "code_full",
                objective,
                1,
                lineCount,
                symList,
                truncate(extractSliceExcerpt(code, 1, lineCount, 200), 200)
            ));
        } else if (!slices.isEmpty()) {
            int sliceTotal = slices.size();
            slices = slices.stream()
                .map(s -> new EditTaskSlice(
                    s.index(), sliceTotal, s.kind(), s.objective(),
                    s.lineStart(), s.lineEnd(), s.symbols(), s.excerptPreview()))
                .toList();
        }
        return slices;
    }

    private List<EditTaskSlice> planMenuSlices(String message, String code, List<String> targetSymbols) {
        List<EditTaskSlice> slices = new ArrayList<>();
        String objective = summarizeRequest(message);
        int lineCount = countLines(code);

        if (targetSymbols.isEmpty()) {
            slices.add(new EditTaskSlice(1, 1, "menu_full", objective, 1, lineCount, List.of(), truncate(code, 200)));
            return slices;
        }

        int idx = 0;
        for (String sym : targetSymbols) {
            if (idx >= maxSlices) {
                break;
            }
            int pos = code.indexOf(sym);
            if (pos < 0) {
                pos = code.toLowerCase(Locale.ROOT).indexOf(sym.toLowerCase(Locale.ROOT));
            }
            if (pos < 0) {
                continue;
            }
            int lineStart = estimateLineAt(code, pos);
            int lineEnd = Math.min(lineCount, lineStart + Math.max(40, sliceContextLines));
            lineStart = Math.max(1, lineStart - 10);
            idx++;
            slices.add(new EditTaskSlice(
                idx,
                Math.min(maxSlices, targetSymbols.size()),
                "menu_node",
                objective + " — node/id/label: " + sym,
                lineStart,
                lineEnd,
                List.of(sym),
                truncate(extractSliceExcerpt(code, lineStart, lineEnd, 200), 200)
            ));
        }

        if (slices.isEmpty()) {
            slices.add(new EditTaskSlice(1, 1, "menu_full", objective, 1, lineCount, targetSymbols, truncate(code, 200)));
        } else {
            int total = slices.size();
            slices = slices.stream()
                .map(s -> new EditTaskSlice(s.index(), total, s.kind(), s.objective(), s.lineStart(), s.lineEnd(), s.symbols(), s.excerptPreview()))
                .toList();
        }
        return slices;
    }

    // ── Symbol location in code string ────────────────────────────────────────

    record SymbolHit(int lineStart, int lineEnd, int charStart) {}

    private List<SymbolHit> findSymbolHits(String code, String symbol, String language) {
        List<SymbolHit> hits = new ArrayList<>();
        if (code == null || code.isBlank() || symbol == null || symbol.isBlank()) {
            return hits;
        }
        String safe = Pattern.quote(symbol);
        Pattern[] searchPatterns = new Pattern[] {
            Pattern.compile("(?m)(?:window\\.|globalThis\\.)?" + safe + "\\s*=\\s*function"),
            Pattern.compile("(?m)(?:async\\s+)?function\\s+" + safe + "\\s*\\("),
            Pattern.compile("(?m)(?:const|let|var)\\s+" + safe + "\\s*="),
            Pattern.compile("(?m)" + safe + "\\s*:\\s*function"),
            Pattern.compile("(?m)" + safe + "\\s*\\("),
            Pattern.compile(Pattern.quote(symbol), Pattern.LITERAL)
        };

        Set<Integer> seenLines = new LinkedHashSet<>();
        int half = Math.max(30, sliceContextLines / 2);
        int lineCount = countLines(code);

        for (Pattern p : searchPatterns) {
            Matcher m = p.matcher(code);
            while (m.find() && hits.size() < 3) {
                int charStart = m.start();
                int lineStart = estimateLineAt(code, charStart);
                if (seenLines.contains(lineStart)) {
                    continue;
                }
                seenLines.add(lineStart);
                int lineEnd = Math.min(lineCount, lineStart + half);
                lineStart = Math.max(1, lineStart - Math.min(15, half / 3));
                hits.add(new SymbolHit(lineStart, lineEnd, charStart));
            }
        }
        return hits;
    }

    private static final class RegionAnchor {
        int lineStart;
        int lineEnd;
        String kind;
        List<String> symbols;
        int rank;

        RegionAnchor(int lineStart, int lineEnd, String kind, List<String> symbols, int rank) {
            this.lineStart = lineStart;
            this.lineEnd = lineEnd;
            this.kind = kind;
            this.symbols = symbols == null ? List.of() : symbols;
            this.rank = rank;
        }
    }

    private List<RegionAnchor> mergeAnchors(List<RegionAnchor> anchors, int mergeGapLines) {
        if (anchors == null || anchors.isEmpty()) {
            return List.of();
        }
        anchors.sort((a, b) -> {
            int c = Integer.compare(a.lineStart, b.lineStart);
            return c != 0 ? c : Integer.compare(a.rank, b.rank);
        });
        List<RegionAnchor> merged = new ArrayList<>();
        RegionAnchor current = null;
        int gap = Math.max(20, mergeGapLines / 2);

        for (RegionAnchor a : anchors) {
            if (current == null) {
                current = a;
                continue;
            }
            if (a.lineStart <= current.lineEnd + gap) {
                current.lineEnd = Math.max(current.lineEnd, a.lineEnd);
                LinkedHashSet<String> sym = new LinkedHashSet<>(current.symbols);
                sym.addAll(a.symbols);
                current.symbols = new ArrayList<>(sym);
                if ("cursor_selection".equals(a.kind) || "cursor_window".equals(a.kind)) {
                    current.kind = a.kind;
                }
            } else {
                merged.add(current);
                current = a;
            }
        }
        if (current != null) {
            merged.add(current);
        }
        return merged.stream().limit(maxSlices).toList();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private boolean isLifecycleRequest(String lowerMessage) {
        return lowerMessage.contains("webview") || lowerMessage.contains("process")
            || lowerMessage.contains("proxy") || lowerMessage.contains("tắt")
            || lowerMessage.contains("tat") || lowerMessage.contains("treo")
            || lowerMessage.contains("kill") || lowerMessage.contains("interval")
            || lowerMessage.contains("closealltabs") || lowerMessage.contains("resetip");
    }

    private boolean codeContainsSymbol(String code, String symbol) {
        if (code == null || symbol == null) {
            return false;
        }
        return code.contains(symbol) || code.toLowerCase(Locale.ROOT).contains(symbol.toLowerCase(Locale.ROOT));
    }

    private Pattern[] languagePatterns(String language) {
        return switch (normalizeLanguageKey(language)) {
            case "java" -> new Pattern[] {
                Pattern.compile("\\bclass\\s+([A-Za-z_][A-Za-z0-9_]*)"),
                Pattern.compile("\\b(?:public|private|protected)?\\s*(?:static\\s+)?[\\w<>,\\[\\]\\s]+\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\(")
            };
            case "python" -> new Pattern[] {
                Pattern.compile("\\bdef\\s+([A-Za-z_][A-Za-z0-9_]*)"),
                Pattern.compile("\\bclass\\s+([A-Za-z_][A-Za-z0-9_]*)")
            };
            case "sql" -> new Pattern[] {
                Pattern.compile("\\b(FROM|INTO|UPDATE|TABLE)\\s+([A-Za-z_][A-Za-z0-9_]*)", Pattern.CASE_INSENSITIVE)
            };
            default -> new Pattern[] {
                Pattern.compile("\\bfunction\\s+([A-Za-z_][A-Za-z0-9_]*)"),
                Pattern.compile("\\b([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(?:async\\s+)?function"),
                Pattern.compile("\\b(?:const|let|var)\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*="),
                Pattern.compile("\\.([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*function")
            };
        };
    }

    private String normalizeLanguage(String language, String contextType, String code) {
        if ("menu_json".equalsIgnoreCase(String.valueOf(contextType == null ? "" : contextType).trim())) {
            return "json";
        }
        String lang = normalizeLanguageKey(language);
        if (!"generic".equals(lang)) {
            return lang;
        }
        String sample = String.valueOf(code == null ? "" : code).substring(0, Math.min(2000, code.length())).toLowerCase(Locale.ROOT);
        if (sample.contains("public class") || sample.contains("@override")) {
            return "java";
        }
        if (sample.contains("def ") && sample.contains("import ")) {
            return "python";
        }
        if (sample.contains("select ") && sample.contains(" from ")) {
            return "sql";
        }
        if (sample.contains("react.createelement") || sample.contains("function ") || sample.contains("window.")) {
            return "javascript";
        }
        return lang;
    }

    private String normalizeLanguageKey(String language) {
        String lang = String.valueOf(language == null ? "" : language).trim().toLowerCase(Locale.ROOT);
        if (lang.isBlank() || "generic".equals(lang)) {
            return "generic";
        }
        if (lang.contains("typescript") || lang.equals("ts")) {
            return "typescript";
        }
        if (lang.contains("javascript") || lang.equals("js")) {
            return "javascript";
        }
        if (lang.contains("java")) {
            return "java";
        }
        if (lang.contains("python") || lang.equals("py")) {
            return "python";
        }
        if (lang.contains("sql")) {
            return "sql";
        }
        if (lang.contains("html")) {
            return "html";
        }
        if (lang.contains("css")) {
            return "css";
        }
        if (lang.contains("json")) {
            return "json";
        }
        return lang;
    }

    private boolean isUsefulSymbol(String token) {
        if (token == null) {
            return false;
        }
        String t = token.trim();
        if (t.length() < 3 || t.length() > 80) {
            return false;
        }
        Set<String> deny = Set.of(
            "the", "and", "for", "with", "code", "line", "json", "menu", "edit", "fix", "hãy", "sửa",
            "return", "const", "let", "var", "new", "null", "true", "false", "this", "that", "void",
            "public", "private", "function", "class", "when", "from", "your"
        );
        if (deny.contains(t.toLowerCase(Locale.ROOT))) {
            return false;
        }
        return t.matches("[A-Za-z_][A-Za-z0-9_$.]*") || t.matches("[\\u00C0-\\u1EF9\\w\\s.-]{2,80}");
    }

    private String summarizeRequest(String message) {
        return truncate(String.valueOf(message == null ? "" : message).replaceAll("\\s+", " ").trim(), 160);
    }

    private int countLines(String text) {
        if (text == null || text.isBlank()) {
            return 0;
        }
        return text.split("\\r?\\n", -1).length;
    }

    private int estimateLineAt(String text, int charIndex) {
        if (text == null || text.isBlank() || charIndex <= 0) {
            return 1;
        }
        int line = 1;
        int limit = Math.min(charIndex, text.length());
        for (int i = 0; i < limit; i++) {
            if (text.charAt(i) == '\n') {
                line++;
            }
        }
        return line;
    }

    private String truncate(String text, int max) {
        String s = String.valueOf(text == null ? "" : text);
        if (s.length() <= max) {
            return s;
        }
        return s.substring(0, Math.max(0, max - 3)) + "...";
    }

    private String truncateMiddle(String text, int maxChars) {
        String s = String.valueOf(text == null ? "" : text).trim();
        if (s.length() <= maxChars) {
            return s;
        }
        int head = Math.max(1, maxChars / 2);
        int tail = Math.max(1, maxChars - head - 5);
        return s.substring(0, head) + "\n...\n" + s.substring(Math.max(0, s.length() - tail));
    }
}
