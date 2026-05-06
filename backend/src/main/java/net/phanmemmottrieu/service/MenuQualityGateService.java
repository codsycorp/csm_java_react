package net.phanmemmottrieu.service;

import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Contract-aligned quality gate for AI menu JSON.
 *
 * Enforces key rules from ai_menu_master_prompt v2:
 * - parentId hierarchy integrity
 * - canonical icon field only (icon)
 * - valid type_form and runtime consistency
 * - table field f_* schema checks
 * - combo query requirements for combo-like fields
 * - trigger key whitelist
 */
@Service
public class MenuQualityGateService {

    public static class QualityIssue {
        public String severity; // error | warning | info
        public String rule;
        public String errorCode;
        public String path;
        public String message;
        public Object detail;

        public QualityIssue(String severity, String rule, String errorCode, String path, String message) {
            this.severity = severity;
            this.rule = rule;
            this.errorCode = errorCode;
            this.path = path;
            this.message = message;
        }

        public QualityIssue(String severity, String rule, String errorCode, String path, String message, Object detail) {
            this(severity, rule, errorCode, path, message);
            this.detail = detail;
        }
    }

    public static class QualityReport {
        public List<QualityIssue> issues = new ArrayList<>();
        public double qualityScore;
        public boolean passesHardGate;
        public String summary;
        public Map<String, Object> stats = new LinkedHashMap<>();

        public List<QualityIssue> getErrors() {
            return issues.stream().filter(i -> "error".equals(i.severity)).toList();
        }

        public List<QualityIssue> getWarnings() {
            return issues.stream().filter(i -> "warning".equals(i.severity)).toList();
        }

        public List<String> getErrorCodes() {
            LinkedHashSet<String> codes = new LinkedHashSet<>();
            for (QualityIssue issue : getErrors()) {
                if (issue.errorCode != null && !issue.errorCode.isBlank()) {
                    codes.add(issue.errorCode);
                }
            }
            return new ArrayList<>(codes);
        }

        public Map<String, Object> toValidationReportPayload() {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("passed", passesHardGate);
            payload.put("qualityScore", qualityScore);
            payload.put("summary", summary);
            payload.put("error_codes", getErrorCodes());
            payload.put("checks", issues);
            return payload;
        }
    }

    private static final Set<Integer> VALID_TYPE_FORMS = Set.of(0, 1, 2, 3, 4, 5, 6);

    private static final Set<String> FORBIDDEN_ICON_FIELDS = Set.of(
        "m_icon", "m_icons", "attributes_icon"
    );

    private static final Set<String> COMBO_LIKE_TYPES = Set.of(
        "co", "co_ro", "cbo", "coro", "cp", "multi_select", "multi_tag", "menu_tree"
    );

    private static final Set<String> VALID_TRIGGER_KEYS = Set.of(
        "filter",
        "load_db",
        "datacolumntemplate",
        "datarowtemplate",
        "update",
        "barcode",
        "update_db",
        "delete_db",
        "report_db",
        "beforeSave",
        "beforeImport",
        "afterImport",
        "afterAdd",
        "afterEdit",
        "afterDelete"
    );

    private static final Pattern VALID_TABLE_NAME = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");

    private static final class NodeCtx {
        Map<String, Object> node;
        String path;
        String parentIdDeclared;
        String parentIdPosition;
        int depth;

        NodeCtx(
            Map<String, Object> node,
            String path,
            String parentIdDeclared,
            String parentIdPosition,
            int depth
        ) {
            this.node = node;
            this.path = path;
            this.parentIdDeclared = parentIdDeclared;
            this.parentIdPosition = parentIdPosition;
            this.depth = depth;
        }
    }

    public QualityReport validateMenuJson(List<Map<String, Object>> menus, String requirement) {
        QualityReport report = new QualityReport();

        if (menus == null || menus.isEmpty()) {
            report.issues.add(new QualityIssue(
                "error",
                "json_not_empty",
                "ERR_JSON_INVALID",
                "menu",
                "Menu array is empty"
            ));
            finalizeReport(report, 0, 0, 0, 0, 0, requirement);
            return report;
        }

        List<NodeCtx> allNodes = new ArrayList<>();
        Map<String, NodeCtx> byId = new LinkedHashMap<>();
        Set<String> duplicateIds = new LinkedHashSet<>();
        Deque<String> ancestorStack = new ArrayDeque<>();

        for (int i = 0; i < menus.size(); i++) {
            Object rootObj = menus.get(i);
            if (!(rootObj instanceof Map<?, ?> rawRoot)) {
                report.issues.add(new QualityIssue(
                    "error",
                    "node_object_required",
                    "ERR_JSON_INVALID",
                    "menu[" + i + "]",
                    "Each root menu item must be an object"
                ));
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> root = (Map<String, Object>) rawRoot;
            walkNode(root, "menu[" + i + "]", "", 0, ancestorStack, allNodes, byId, duplicateIds, report);
        }

        for (String dupId : duplicateIds) {
            report.issues.add(new QualityIssue(
                "error",
                "id_unique",
                "ERR_JSON_INVALID",
                "id=" + dupId,
                "Duplicate menu id found"
            ));
        }

        for (NodeCtx ctx : allNodes) {
            validateHierarchy(ctx, byId, report);
            validateIconContract(ctx, report);
            validateTypeForm(ctx, report);
            validateTableSchema(ctx, report);
            validateTrigger(ctx, report);
        }

        long errorCount = report.getErrors().size();
        long warningCount = report.getWarnings().size();
        long infoCount = report.issues.stream().filter(i -> "info".equals(i.severity)).count();

        int rootCount = (int) allNodes.stream().filter(n -> n.parentIdDeclared.isBlank()).count();
        finalizeReport(report, allNodes.size(), rootCount, errorCount, warningCount, infoCount, requirement);
        return report;
    }

    private void walkNode(
        Map<String, Object> node,
        String path,
        String parentIdPosition,
        int depth,
        Deque<String> ancestorStack,
        List<NodeCtx> allNodes,
        Map<String, NodeCtx> byId,
        Set<String> duplicateIds,
        QualityReport report
    ) {
        String id = normalizeId(node.get("id"));
        String declaredParent = normalizeParentId(node.get("parentId"), node.get("parent_id"));

        if (id.isBlank()) {
            report.issues.add(new QualityIssue(
                "error",
                "id_required",
                "ERR_JSON_INVALID",
                path,
                "Node is missing non-empty id"
            ));
        }

        String effectivePath = path + (id.isBlank() ? "" : "(" + id + ")");
        NodeCtx ctx = new NodeCtx(node, effectivePath, declaredParent, parentIdPosition, depth);
        allNodes.add(ctx);

        if (!id.isBlank()) {
            if (byId.containsKey(id)) {
                duplicateIds.add(id);
            } else {
                byId.put(id, ctx);
            }
        }

        if (!id.isBlank() && ancestorStack.contains(id)) {
            report.issues.add(new QualityIssue(
                "error",
                "cycle_detected",
                "ERR_PARENT_MAPPING_INVALID",
                effectivePath,
                "Cycle detected in menu tree"
            ));
        }

        ancestorStack.push(id);
        Object childrenObj = node.get("children");
        if (childrenObj instanceof List<?> children) {
            for (int i = 0; i < children.size(); i++) {
                Object childObj = children.get(i);
                if (!(childObj instanceof Map<?, ?> rawChild)) {
                    report.issues.add(new QualityIssue(
                        "error",
                        "children_item_object_required",
                        "ERR_JSON_INVALID",
                        effectivePath + ".children[" + i + "]",
                        "Children item must be an object"
                    ));
                    continue;
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> child = (Map<String, Object>) rawChild;
                walkNode(
                    child,
                    effectivePath + ".children[" + i + "]",
                    id,
                    depth + 1,
                    ancestorStack,
                    allNodes,
                    byId,
                    duplicateIds,
                    report
                );
            }
        }
        ancestorStack.pop();
    }

    private void validateHierarchy(NodeCtx ctx, Map<String, NodeCtx> byId, QualityReport report) {
        if (ctx.parentIdDeclared.isBlank()) {
            if (ctx.depth > 0) {
                report.issues.add(new QualityIssue(
                    "error",
                    "root_node_in_children",
                    "ERR_ROOT_NODE_IN_CHILDREN",
                    ctx.path,
                    "Node with empty parentId must be top-level only"
                ));
            }
            return;
        }

        NodeCtx parent = byId.get(ctx.parentIdDeclared);
        if (parent == null) {
            report.issues.add(new QualityIssue(
                "error",
                "parent_exists",
                "ERR_PARENT_MAPPING_INVALID",
                ctx.path,
                "parentId does not reference an existing node",
                Map.of("parentId", ctx.parentIdDeclared)
            ));
            return;
        }

        if (!Objects.equals(ctx.parentIdDeclared, ctx.parentIdPosition)) {
            report.issues.add(new QualityIssue(
                "error",
                "parent_position_consistency",
                "ERR_PARENT_MAPPING_INVALID",
                ctx.path,
                "Node location in children tree does not match parentId",
                Map.of(
                    "parentIdDeclared", ctx.parentIdDeclared,
                    "parentIdByPosition", ctx.parentIdPosition,
                    "parentNodePath", parent.path
                )
            ));
        }
    }

    private void validateIconContract(NodeCtx ctx, QualityReport report) {
        for (String forbidden : FORBIDDEN_ICON_FIELDS) {
            if (ctx.node.containsKey(forbidden) && !isBlank(ctx.node.get(forbidden))) {
                report.issues.add(new QualityIssue(
                    "error",
                    "icon_canonical_field_only",
                    "ERR_ICON_LEGACY_FIELD",
                    ctx.path,
                    "Forbidden legacy icon field detected: " + forbidden
                ));
            }
        }

        String icon = asText(ctx.node.get("icon"));
        if (icon.isBlank()) {
            report.issues.add(new QualityIssue(
                "warning",
                "icon_recommended",
                null,
                ctx.path,
                "icon is blank, fallback AppstoreOutlined is recommended"
            ));
        }
    }

    private void validateTypeForm(NodeCtx ctx, QualityReport report) {
        Object rawType = ctx.node.get("type_form");
        if (rawType == null) {
            report.issues.add(new QualityIssue(
                "warning",
                "type_form_missing",
                null,
                ctx.path,
                "type_form is missing"
            ));
            return;
        }

        Integer typeForm = toInt(rawType);
        if (typeForm == null || !VALID_TYPE_FORMS.contains(typeForm)) {
            report.issues.add(new QualityIssue(
                "error",
                "type_form_valid",
                "ERR_TYPE_FORM_INVALID",
                ctx.path,
                "type_form must be one of 0,1,2,3,4,5,6",
                Map.of("value", String.valueOf(rawType))
            ));
            return;
        }

        String tableName = asText(ctx.node.get("table_name"));
        if ((typeForm == 1 || typeForm == 2 || typeForm == 6) && tableName.isBlank()) {
            report.issues.add(new QualityIssue(
                "warning",
                "table_name_expected",
                null,
                ctx.path,
                "type_form=" + typeForm + " usually expects non-empty table_name"
            ));
        }

        if (!tableName.isBlank()) {
            String[] names = tableName.split(",");
            for (String name : names) {
                String normalized = name.trim();
                if (normalized.isBlank()) continue;
                if (!VALID_TABLE_NAME.matcher(normalized).matches()) {
                    report.issues.add(new QualityIssue(
                        "warning",
                        "table_name_format",
                        null,
                        ctx.path,
                        "table_name token has unusual format: " + normalized
                    ));
                }
            }
        }
    }

    private void validateTableSchema(NodeCtx ctx, QualityReport report) {
        Object tableObj = ctx.node.get("table");
        if (tableObj == null) {
            return;
        }
        if (!(tableObj instanceof List<?> fields)) {
            report.issues.add(new QualityIssue(
                "error",
                "table_array_required",
                "ERR_TABLE_SCHEMA_INVALID",
                ctx.path,
                "table must be an array when present"
            ));
            return;
        }

        Set<String> seenFieldNames = new HashSet<>();
        for (int i = 0; i < fields.size(); i++) {
            Object fieldObj = fields.get(i);
            String fieldPath = ctx.path + ".table[" + i + "]";
            if (!(fieldObj instanceof Map<?, ?> rawField)) {
                report.issues.add(new QualityIssue(
                    "error",
                    "field_object_required",
                    "ERR_TABLE_SCHEMA_INVALID",
                    fieldPath,
                    "table item must be an object"
                ));
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> field = (Map<String, Object>) rawField;

            String fName = asText(field.get("f_name"));
            String fTypes = normalizeType(asText(field.get("f_types")));
            String fHeader = asText(field.get("f_header"));

            if (fName.isBlank()) {
                report.issues.add(new QualityIssue(
                    "error",
                    "f_name_required",
                    "ERR_TABLE_SCHEMA_INVALID",
                    fieldPath,
                    "f_name is required"
                ));
            } else if (!seenFieldNames.add(fName)) {
                report.issues.add(new QualityIssue(
                    "warning",
                    "f_name_unique",
                    null,
                    fieldPath,
                    "duplicate f_name detected: " + fName
                ));
            }

            if (fTypes.isBlank()) {
                report.issues.add(new QualityIssue(
                    "error",
                    "f_types_required",
                    "ERR_TABLE_SCHEMA_INVALID",
                    fieldPath,
                    "f_types is required"
                ));
            }

            if (fHeader.isBlank()) {
                report.issues.add(new QualityIssue(
                    "warning",
                    "f_header_recommended",
                    null,
                    fieldPath,
                    "f_header is blank"
                ));
            }

            if (COMBO_LIKE_TYPES.contains(fTypes)) {
                boolean hasCboQuery = !asText(field.get("f_cbo_query")).isBlank();
                boolean hasOptions = field.get("f_options") instanceof List<?> opts && !opts.isEmpty();
                if (!hasCboQuery && !hasOptions) {
                    report.issues.add(new QualityIssue(
                        "error",
                        "combo_source_required",
                        "ERR_COMBO_QUERY_INVALID",
                        fieldPath,
                        "Combo-like field requires f_cbo_query or non-empty f_options",
                        Map.of("f_types", fTypes, "f_name", fName)
                    ));
                }
            }
        }
    }

    private void validateTrigger(NodeCtx ctx, QualityReport report) {
        Object triggerObj = ctx.node.get("trigger");
        if (triggerObj == null) {
            return;
        }
        if (!(triggerObj instanceof Map<?, ?> triggerMap)) {
            report.issues.add(new QualityIssue(
                "error",
                "trigger_object_required",
                "ERR_TRIGGER_KEY_INVALID",
                ctx.path,
                "trigger must be an object"
            ));
            return;
        }

        for (Object keyObj : triggerMap.keySet()) {
            String key = String.valueOf(keyObj);
            if (!VALID_TRIGGER_KEYS.contains(key)) {
                report.issues.add(new QualityIssue(
                    "error",
                    "trigger_key_supported",
                    "ERR_TRIGGER_KEY_INVALID",
                    ctx.path,
                    "Unsupported trigger key: " + key
                ));
            }
        }
    }

    private void finalizeReport(
        QualityReport report,
        int totalNodes,
        int rootNodes,
        long errorCount,
        long warningCount,
        long infoCount,
        String requirement
    ) {
        double score = 100.0;
        score -= errorCount * 12.0;
        score -= warningCount * 2.5;
        if (score < 0) score = 0;

        report.qualityScore = Math.round(score * 10.0) / 10.0;
        report.passesHardGate = errorCount == 0;

        report.stats.put("totalNodes", totalNodes);
        report.stats.put("rootNodes", rootNodes);
        report.stats.put("errorCount", errorCount);
        report.stats.put("warningCount", warningCount);
        report.stats.put("infoCount", infoCount);
        report.stats.put("requirementChars", requirement == null ? 0 : requirement.length());

        if (report.passesHardGate) {
            report.summary = "PASS: menu output satisfies hard gate";
        } else {
            report.summary = "FAIL: menu output violates hard gate";
        }
    }

    private String normalizeId(Object rawId) {
        return asText(rawId);
    }

    private String normalizeParentId(Object parentId, Object parentIdLegacy) {
        String p = asText(parentId);
        if (!p.isBlank()) return p;
        return asText(parentIdLegacy);
    }

    private String asText(Object raw) {
        if (raw == null) return "";
        return String.valueOf(raw).trim();
    }

    private boolean isBlank(Object raw) {
        return asText(raw).isBlank();
    }

    private String normalizeType(String type) {
        return String.valueOf(type == null ? "" : type).trim().toLowerCase(Locale.ROOT);
    }

    private Integer toInt(Object raw) {
        if (raw instanceof Number n) {
            return n.intValue();
        }
        String text = asText(raw);
        if (text.isBlank()) return null;
        try {
            return Integer.parseInt(text);
        } catch (Exception ignored) {
            return null;
        }
    }
}
