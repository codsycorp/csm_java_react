package net.phanmemmottrieu.service;

import org.springframework.stereotype.Service;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Quality gate for AI-generated menu JSON
 * Validates against CSM system standards:
 * - Multilingual completeness (label_vi/label_en/label_zh, f_header_vi/en/zh)
 * - Field schema compliance (f_name, f_types, f_cbo_query)
 * - Menu structure (type_form, table_name, trigger)
 * - Trigger patterns (valid signatures per CSM runtime)
 */
@Service
public class MenuQualityGateService {

    public static class QualityIssue {
        public String severity; // "error" | "warning" | "info"
        public String rule;
        public String path;
        public String message;
        public Object detail;

        public QualityIssue(String severity, String rule, String path, String message) {
            this.severity = severity;
            this.rule = rule;
            this.path = path;
            this.message = message;
        }

        public QualityIssue(String severity, String rule, String path, String message, Object detail) {
            this(severity, rule, path, message);
            this.detail = detail;
        }
    }

    public static class QualityReport {
        public List<QualityIssue> issues = new ArrayList<>();
        public double qualityScore; // 0-100
        public boolean passesHardGate; // No critical errors
        public String summary;
        public Map<String, Object> stats = new HashMap<>();

        public List<QualityIssue> getErrors() {
            return issues.stream()
                .filter(i -> "error".equals(i.severity))
                .toList();
        }

        public List<QualityIssue> getWarnings() {
            return issues.stream()
                .filter(i -> "warning".equals(i.severity))
                .toList();
        }
    }

    // Valid f_types for table fields
    private static final Set<String> VALID_F_TYPES = new HashSet<>(Arrays.asList(
        "string", "string_ro", "number", "num", "price", "ron", "date", "datetime", "time",
        "checkbox", "switch", "co", "co_ro", "multi_select", "multi_tag", "menu_tree",
        "json", "password", "html", "text", "textarea", "email", "phone", "url",
        "percent", "currency", "rating", "color", "file", "image", "signature"
    ));

    // Valid trigger keys
    private static final Set<String> VALID_TRIGGER_KEYS = new HashSet<>(Arrays.asList(
        "filter", "load_db", "datacolumntemplate", "datarowtemplate", "update", "barcode",
        "update_db", "delete_db", "report_db", "beforeSave", "beforeImport", "afterImport",
        "afterAdd", "afterEdit", "afterDelete", "on_load", "on_save", "on_delete",
        "custom_validator", "auto_compute", "cascade_update"
    ));

    private static final Pattern VALID_ID_PATTERN = Pattern.compile("^[a-zA-Z0-9_-]{4,64}$");
    private static final Pattern VALID_TABLE_NAME = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");

    /**
     * Main validation entry point
     */
    public QualityReport validateMenuJson(List<Map<String, Object>> menus, String requirement) {
        QualityReport report = new QualityReport();

        if (menus == null || menus.isEmpty()) {
            report.issues.add(new QualityIssue("error", "empty_menu", "", "Menu list is empty"));
            report.qualityScore = 0;
            report.passesHardGate = false;
            report.summary = "FAIL: Empty menu";
            return report;
        }

        int totalNodes = 0;
        final int[] validNodes = new int[] { 0 };
        final int[] multilingualCompleteNodes = new int[] { 0 };
        final int[] fieldCompleteNodes = new int[] { 0 };

        for (Map<String, Object> menu : menus) {
            walkAndValidate(menu, "", report, (violation) -> {
                if ("valid_node".equals(violation.rule)) {
                    validNodes[0]++;
                }
                if ("multilingual_complete".equals(violation.rule)) {
                    multilingualCompleteNodes[0]++;
                }
                if ("field_schema_complete".equals(violation.rule)) {
                    fieldCompleteNodes[0]++;
                }
            });
            totalNodes++;
        }

        // Calculate quality score
        report.stats.put("totalNodes", totalNodes);
        report.stats.put("validNodes", validNodes[0]);
        report.stats.put("multilingualCompleteNodes", multilingualCompleteNodes[0]);
        report.stats.put("fieldCompleteNodes", fieldCompleteNodes[0]);

        double structureScore = totalNodes > 0 ? (validNodes[0] * 100.0 / totalNodes) : 0;
        double multilingualScore = totalNodes > 0 ? (multilingualCompleteNodes[0] * 100.0 / totalNodes) : 0;
        double fieldScore = totalNodes > 0 ? (fieldCompleteNodes[0] * 100.0 / totalNodes) : 0;

        report.qualityScore = (structureScore * 0.4 + multilingualScore * 0.35 + fieldScore * 0.25);

        // Hard gate: No critical errors
        List<QualityIssue> errors = report.getErrors();
        report.passesHardGate = errors.isEmpty();

        // Build summary
        if (report.passesHardGate) {
            report.summary = String.format("PASS: Quality=%.1f%% | Nodes=%d | Multilingual=%.0f%% | Fields=%.0f%%",
                report.qualityScore, validNodes[0], multilingualScore, fieldScore);
        } else {
            report.summary = String.format("FAIL: %d critical errors | Quality=%.1f%%",
                errors.size(), report.qualityScore);
        }

        return report;
    }

    // ─── Recursive validation ─────────────────────────────────────

    private void walkAndValidate(Object node, String path, QualityReport report, 
                                 java.util.function.Consumer<QualityIssue> tracker) {
        if (!(node instanceof Map)) {
            return;
        }

        Map<String, Object> item = (Map<String, Object>) node;
        String nodeId = String.valueOf(item.getOrDefault("id", "unknown"));
        String label = String.valueOf(item.getOrDefault("label", ""));
        String currentPath = path.isEmpty() ? label : path + " > " + label;

        // 1. Check ID validity
        validateId(item, currentPath, report);

        // 2. Check multilingual labels
        validateMultilingualLabels(item, currentPath, report);

        // 3. Check table structure
        validateTableSchema(item, currentPath, report);

        // 4. Check trigger
        validateTrigger(item, currentPath, report);

        // 5. Check type_form consistency
        validateTypeForm(item, currentPath, report);

        // 6. Check combo fields
        validateComboFields(item, currentPath, report);

        // Mark as valid if no errors at this node
        if (report.issues.stream()
            .filter(i -> i.path.equals(currentPath) && "error".equals(i.severity))
            .count() == 0) {
            tracker.accept(new QualityIssue("info", "valid_node", currentPath, "Node passes validation"));
        }

        // 7. Recurse into children
        Object childrenObj = item.get("children");
        if (childrenObj instanceof List) {
            List<?> children = (List<?>) childrenObj;
            for (Object child : children) {
                walkAndValidate(child, currentPath, report, tracker);
            }
        }
    }

    private void validateId(Map<String, Object> item, String path, QualityReport report) {
        Object id = item.get("id");
        if (id == null || String.valueOf(id).trim().isEmpty()) {
            report.issues.add(new QualityIssue("error", "id_missing", path, "Missing or empty 'id' field"));
        } else if (!VALID_ID_PATTERN.matcher(String.valueOf(id)).matches()) {
            report.issues.add(new QualityIssue("warning", "id_format", path, 
                "ID should be alphanumeric (4-64 chars): " + id));
        }
    }

    private void validateMultilingualLabels(Map<String, Object> item, String path, QualityReport report) {
        String labelVi = String.valueOf(item.getOrDefault("label", "")).trim();
        String labelEn = String.valueOf(item.getOrDefault("label_en", "")).trim();
        String labelZh = String.valueOf(item.getOrDefault("label_zh", "")).trim();

        // Rule: At least one must be present
        if (labelVi.isEmpty() && labelEn.isEmpty() && labelZh.isEmpty()) {
            report.issues.add(new QualityIssue("error", "label_missing", path, 
                "Must have at least one of: label (VI), label_en (EN), label_zh (ZH)"));
            return;
        }

        // Rule: All three should be present (strict)
        List<String> missing = new ArrayList<>();
        if (labelVi.isEmpty()) missing.add("label_vi");
        if (labelEn.isEmpty()) missing.add("label_en");
        if (labelZh.isEmpty()) missing.add("label_zh");

        if (!missing.isEmpty()) {
            report.issues.add(new QualityIssue("warning", "multilingual_incomplete", path,
                "Missing translations: " + String.join(", ", missing)));
        } else {
            report.issues.add(new QualityIssue("info", "multilingual_complete", path, "All 3 languages present"));
        }

        // Rule: Translations should be distinct (not just copy-paste)
        if (!labelVi.isEmpty() && labelVi.equals(labelEn)) {
            report.issues.add(new QualityIssue("warning", "translation_duplicate_en", path,
                "label_en is identical to label (should be translated to English)"));
        }
        if (!labelVi.isEmpty() && labelVi.equals(labelZh)) {
            report.issues.add(new QualityIssue("warning", "translation_duplicate_zh", path,
                "label_zh is identical to label (should be translated to Chinese)"));
        }
    }

    private void validateTableSchema(Map<String, Object> item, String path, QualityReport report) {
        Object tableObj = item.get("table");
        if (!(tableObj instanceof List)) {
            return; // No table fields
        }

        List<?> fields = (List<?>) tableObj;
        if (fields.isEmpty()) {
            return;
        }

        boolean allFieldsValid = true;
        List<String> missingHeaderFields = new ArrayList<>();

        for (int i = 0; i < fields.size(); i++) {
            Object fieldObj = fields.get(i);
            if (!(fieldObj instanceof Map)) continue;

            Map<String, Object> field = (Map<String, Object>) fieldObj;
            String fieldPath = path + " > field[" + (i + 1) + "]";

            // Required f_* fields
            String fName = String.valueOf(field.getOrDefault("f_name", "")).trim();
            String fTypes = String.valueOf(field.getOrDefault("f_types", "")).trim();
            String fHeader = String.valueOf(field.getOrDefault("f_header", "")).trim();

            if (fName.isEmpty()) {
                report.issues.add(new QualityIssue("error", "f_name_required", fieldPath, "Missing f_name"));
                allFieldsValid = false;
            }

            if (fTypes.isEmpty()) {
                report.issues.add(new QualityIssue("error", "f_types_required", fieldPath, 
                    "Missing f_types for field: " + fName));
                allFieldsValid = false;
            } else if (!VALID_F_TYPES.contains(fTypes)) {
                report.issues.add(new QualityIssue("warning", "f_types_unknown", fieldPath,
                    "Unknown f_types: " + fTypes + " (valid: " + String.join(",", VALID_F_TYPES) + ")"));
            }

            // Multilingual headers
            String fHeaderEn = String.valueOf(field.getOrDefault("f_header_en", "")).trim();
            String fHeaderZh = String.valueOf(field.getOrDefault("f_header_zh", "")).trim();

            if (fHeader.isEmpty() && fHeaderEn.isEmpty() && fHeaderZh.isEmpty()) {
                report.issues.add(new QualityIssue("warning", "f_header_missing", fieldPath,
                    "No header text (f_header/f_header_en/f_header_zh)"));
                missingHeaderFields.add(fName);
            } else if (fHeaderEn.isEmpty() || fHeaderZh.isEmpty()) {
                List<String> missingLangs = new ArrayList<>();
                if (fHeaderEn.isEmpty()) missingLangs.add("f_header_en");
                if (fHeaderZh.isEmpty()) missingLangs.add("f_header_zh");
                report.issues.add(new QualityIssue("warning", "f_header_incomplete", fieldPath,
                    "Missing header translations: " + String.join(", ", missingLangs) + " for field: " + fName));
            }

            // Combo field requires f_cbo_query
            if ("co".equals(fTypes) || "co_ro".equals(fTypes) || "multi_select".equals(fTypes)) {
                String fCboQuery = String.valueOf(field.getOrDefault("f_cbo_query", "")).trim();
                if (fCboQuery.isEmpty()) {
                    report.issues.add(new QualityIssue("error", "f_cbo_query_missing", fieldPath,
                        "Combo field '" + fName + "' (" + fTypes + ") must have f_cbo_query"));
                    allFieldsValid = false;
                }
            }
        }

        if (allFieldsValid) {
            report.issues.add(new QualityIssue("info", "field_schema_complete", path, 
                "All " + fields.size() + " fields are valid"));
        } else if (!missingHeaderFields.isEmpty()) {
            report.issues.add(new QualityIssue("warning", "field_quality", path,
                "Some fields missing multilingual headers: " + String.join(", ", missingHeaderFields)));
        }
    }

    private void validateTrigger(Map<String, Object> item, String path, QualityReport report) {
        Object triggerObj = item.get("trigger");
        if (triggerObj == null) {
            return;
        }

        if (!(triggerObj instanceof Map)) {
            report.issues.add(new QualityIssue("warning", "trigger_not_object", path,
                "trigger should be an object, got: " + triggerObj.getClass().getSimpleName()));
            return;
        }

        Map<String, Object> trigger = (Map<String, Object>) triggerObj;
        for (String key : trigger.keySet()) {
            if (!VALID_TRIGGER_KEYS.contains(key)) {
                report.issues.add(new QualityIssue("warning", "trigger_unknown_key", path,
                    "Unknown trigger key: " + key + " (valid: " + String.join(",", VALID_TRIGGER_KEYS) + ")"));
            }
        }
    }

    private void validateTypeForm(Map<String, Object> item, String path, QualityReport report) {
        Object typeFormObj = item.get("type_form");
        if (typeFormObj == null) {
            return;
        }

        try {
            int typeForm = Integer.parseInt(String.valueOf(typeFormObj));
            if (typeForm < 0 || typeForm > 6) {
                report.issues.add(new QualityIssue("warning", "type_form_invalid", path,
                    "type_form should be 0-6, got: " + typeForm));
            }

            // Type form 1/2/6 should have table_name
            if ((typeForm == 1 || typeForm == 2 || typeForm == 6) && 
                String.valueOf(item.getOrDefault("table_name", "")).trim().isEmpty()) {
                report.issues.add(new QualityIssue("warning", "table_name_missing", path,
                    "type_form=" + typeForm + " usually requires table_name"));
            }

            // Type form 0 should not have table_name
            if (typeForm == 0 && !String.valueOf(item.getOrDefault("table_name", "")).trim().isEmpty()) {
                report.issues.add(new QualityIssue("info", "type_form_container", path,
                    "type_form=0 (group) should not have table_name"));
            }
        } catch (NumberFormatException e) {
            report.issues.add(new QualityIssue("warning", "type_form_not_number", path,
                "type_form is not a number: " + typeFormObj));
        }
    }

    private void validateComboFields(Map<String, Object> item, String path, QualityReport report) {
        Object tableObj = item.get("table");
        if (!(tableObj instanceof List)) {
            return;
        }

        List<?> fields = (List<?>) tableObj;
        for (Object fieldObj : fields) {
            if (!(fieldObj instanceof Map)) continue;

            Map<String, Object> field = (Map<String, Object>) fieldObj;
            String fTypes = String.valueOf(field.getOrDefault("f_types", "")).trim();
            String fName = String.valueOf(field.getOrDefault("f_name", "")).trim();

            if ("co".equals(fTypes) || "co_ro".equals(fTypes) || "multi_select".equals(fTypes)) {
                Object cboQuery = field.get("f_cbo_query");
                if (cboQuery == null || String.valueOf(cboQuery).trim().isEmpty()) {
                    report.issues.add(new QualityIssue("error", "combo_no_query", 
                        path + " > " + fName, "Combo field missing f_cbo_query"));
                }
            }
        }
    }
}
