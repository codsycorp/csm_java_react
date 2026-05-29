package net.phanmemmottrieu.service;

import org.springframework.beans.factory.annotation.Autowired;
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

    @Autowired(required = false)
    private LocalTranslationService localTranslationService;

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
        migrateLegacyIconFieldsDeep(menus);

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
            validateLabelI18n(ctx, report);
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

    private void validateLabelI18n(NodeCtx ctx, QualityReport report) {
        String label = asText(ctx.node.get("label"));
        String labelEn = asText(ctx.node.get("label_en"));
        String labelZh = asText(ctx.node.get("label_zh"));

        if (label.isBlank()) {
            report.issues.add(new QualityIssue(
                "error",
                "label_required",
                "ERR_LABEL_MISSING_VI",
                ctx.path,
                "label (Vietnamese) is required"
            ));
        }

        if (labelEn.isBlank()) {
            report.issues.add(new QualityIssue(
                "error",
                "label_en_required",
                "ERR_LABEL_MISSING_EN",
                ctx.path,
                "label_en (English) is required"
            ));
        }

        if (labelZh.isBlank()) {
            report.issues.add(new QualityIssue(
                "error",
                "label_zh_required",
                "ERR_LABEL_MISSING_ZH",
                ctx.path,
                "label_zh (Chinese) is required"
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
        if (triggerMap.isEmpty()) {
            Integer typeForm = toInt(ctx.node.get("type_form"));
            if (typeForm != null && (typeForm == 1 || typeForm == 2 || typeForm == 4 || typeForm == 5)) {
                report.issues.add(new QualityIssue(
                    "warning",
                    "trigger_empty_for_runtime",
                    "WARN_TRIGGER_EMPTY",
                    ctx.path,
                    "trigger is empty but type_form=" + typeForm + " usually expects business triggers"
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

    /**
     * Deterministic in-place repair for weak local models (i18n labels, trigger keys, type_form, icon).
     * Mutates the menu tree referenced by {@code menus} and nested {@code children}.
     *
     * @return number of nodes touched
     */
    public int repairMenuTreeInPlace(List<Map<String, Object>> menus) {
        if (menus == null || menus.isEmpty()) {
            return 0;
        }
        int repairedNodes = 0;
        Deque<Map<String, Object>> stack = new ArrayDeque<>();
        for (Map<String, Object> root : menus) {
            if (root != null && !root.isEmpty()) {
                stack.push(root);
            }
        }
        while (!stack.isEmpty()) {
            Map<String, Object> node = stack.pop();
            migrateLegacyIconFieldsOnNode(node);

            Map<String, Object> after = new LinkedHashMap<>();
            List<String> reasons = new ArrayList<>();
            NodeCtx ctx = new NodeCtx(node, "", "", "", 0);
            accumulateLabelI18nRepairs(ctx, after, reasons);
            accumulateTableInputParamRepairs(ctx, after, reasons);
            accumulateTriggerRepairs(ctx, after, reasons);
            if (node.get("type_form") == null) {
                Integer inferred = inferTypeForm(node);
                if (inferred != null) {
                    after.put("type_form", inferred);
                    reasons.add("type_form");
                }
            } else {
                Integer coerced = coerceTypeForm(node.get("type_form"));
                if (coerced != null && !Objects.equals(coerced, toInt(node.get("type_form")))) {
                    after.put("type_form", coerced);
                    reasons.add("type_form");
                }
            }
            LinkedHashSet<String> removeFields = new LinkedHashSet<>();
            applyLegacyIconRepair(node, after, removeFields, reasons);

            if (applyAfterPatchToNode(node, after, removeFields)) {
                repairedNodes++;
            }

            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                for (Object child : childList) {
                    if (child instanceof Map<?, ?> childMap) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> childNode = (Map<String, Object>) childMap;
                        stack.push(childNode);
                    }
                }
            }
        }
        return repairedNodes;
    }

    private boolean applyAfterPatchToNode(
            Map<String, Object> node,
            Map<String, Object> after,
            LinkedHashSet<String> removeFields) {
        if ((after == null || after.isEmpty()) && (removeFields == null || removeFields.isEmpty())) {
            return false;
        }
        if (removeFields != null) {
            for (String field : removeFields) {
                node.remove(field);
            }
        }
        if (after == null || after.isEmpty()) {
            return removeFields != null && !removeFields.isEmpty();
        }
        for (Map.Entry<String, Object> entry : after.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();
            if ("table".equals(key) && value instanceof List<?> patches) {
                mergeTableFieldPatches(node, patches);
            } else {
                node.put(key, value);
            }
        }
        return true;
    }

    private void mergeTableFieldPatches(Map<String, Object> node, List<?> patches) {
        Object tableObj = node.get("table");
        if (!(tableObj instanceof List<?> fields) || patches == null || patches.isEmpty()) {
            return;
        }
        for (Object patchObj : patches) {
            if (!(patchObj instanceof Map<?, ?> patchRaw)) {
                continue;
            }
            String fName = asText(patchRaw.get("f_name"));
            if (fName.isBlank()) {
                continue;
            }
            for (Object fieldObj : fields) {
                if (!(fieldObj instanceof Map<?, ?> fieldRaw)) {
                    continue;
                }
                if (!fName.equals(asText(fieldRaw.get("f_name")))) {
                    continue;
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> field = (Map<String, Object>) fieldRaw;
                for (Map.Entry<?, ?> entry : patchRaw.entrySet()) {
                    String key = String.valueOf(entry.getKey());
                    if ("f_name".equals(key)) {
                        continue;
                    }
                    field.put(key, entry.getValue());
                }
                break;
            }
        }
    }

    /**
     * Builds a patch envelope from deterministic quality-gate findings (labels, trigger keys, icon).
     * Used when the local model cannot produce actionable patches for broad menu audit requests.
     */
    public Map<String, Object> buildRepairPatchEnvelope(List<Map<String, Object>> menus, int maxPatches) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "success");
        out.put("i18n", Map.of("vi", Map.of(), "en", Map.of(), "zh", Map.of()));
        List<Map<String, Object>> patches = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        if (menus == null || menus.isEmpty() || maxPatches <= 0) {
            out.put("patches", patches);
            out.put("warnings", warnings);
            return out;
        }

        QualityReport report = validateMenuJson(menus, "deterministic_menu_audit");
        Map<String, NodeCtx> byId = indexNodes(menus);
        Map<String, Map<String, Object>> afterByNodeId = new LinkedHashMap<>();
        Map<String, LinkedHashSet<String>> removeFieldsByNodeId = new LinkedHashMap<>();
        Map<String, List<String>> reasonPartsByNodeId = new LinkedHashMap<>();

        for (QualityIssue issue : report.issues) {
            if (issue == null) {
                continue;
            }
            String nodeId = extractNodeIdFromIssuePath(issue.path, byId);
            if (nodeId.isBlank()) {
                continue;
            }
            NodeCtx ctx = byId.get(nodeId);
            if (ctx == null) {
                continue;
            }

            Map<String, Object> after = afterByNodeId.computeIfAbsent(nodeId, k -> new LinkedHashMap<>());
            LinkedHashSet<String> removeFields = removeFieldsByNodeId.computeIfAbsent(nodeId, k -> new LinkedHashSet<>());
            List<String> reasons = reasonPartsByNodeId.computeIfAbsent(nodeId, k -> new ArrayList<>());

            String errorCode = asText(issue.errorCode);
            if ("type_form_missing".equals(asText(issue.rule))) {
                Integer inferred = inferTypeForm(ctx.node);
                if (inferred != null) {
                    after.put("type_form", inferred);
                    reasons.add("type_form");
                }
                continue;
            }
            if (errorCode.isBlank()) {
                continue;
            }

            switch (errorCode) {
                case "ERR_LABEL_MISSING_EN" -> {
                    String label = asText(ctx.node.get("label"));
                    if (!label.isBlank()) {
                        after.put("label_en", label);
                        reasons.add("label_en");
                    }
                }
                case "ERR_LABEL_MISSING_ZH" -> {
                    String label = asText(ctx.node.get("label"));
                    if (!label.isBlank()) {
                        after.put("label_zh", label);
                        reasons.add("label_zh");
                    }
                }
                case "ERR_TRIGGER_KEY_INVALID" -> {
                    Object triggerObj = ctx.node.get("trigger");
                    if (triggerObj instanceof Map<?, ?> triggerMap) {
                        Map<String, Object> cleaned = new LinkedHashMap<>();
                        for (Map.Entry<?, ?> entry : triggerMap.entrySet()) {
                            String key = String.valueOf(entry.getKey());
                            if (VALID_TRIGGER_KEYS.contains(key)) {
                                cleaned.put(key, entry.getValue());
                            }
                        }
                        after.put("trigger", cleaned);
                        reasons.add("trigger_keys");
                    }
                }
                case "ERR_ICON_LEGACY_FIELD" -> applyLegacyIconRepair(ctx.node, after, removeFields, reasons);
                case "ERR_TYPE_FORM_INVALID" -> {
                    Integer coerced = coerceTypeForm(ctx.node.get("type_form"));
                    if (coerced == null) {
                        coerced = inferTypeForm(ctx.node);
                    }
                    if (coerced != null) {
                        after.put("type_form", coerced);
                        reasons.add("type_form");
                    }
                }
                default -> {
                    // no-op
                }
            }
        }

        for (NodeCtx ctx : byId.values()) {
            String nodeId = asText(ctx.node.get("id"));
            if (nodeId.isBlank()) {
                continue;
            }
            String label = asText(ctx.node.get("label"));
            if (label.isBlank()) {
                continue;
            }
            Map<String, Object> after = afterByNodeId.computeIfAbsent(nodeId, k -> new LinkedHashMap<>());
            List<String> reasons = reasonPartsByNodeId.computeIfAbsent(nodeId, k -> new ArrayList<>());
            accumulateLabelI18nRepairs(ctx, after, reasons);
            accumulateTableInputParamRepairs(ctx, after, reasons);
            accumulateTriggerRepairs(ctx, after, reasons);
            if (ctx.node.get("type_form") == null) {
                Integer inferred = inferTypeForm(ctx.node);
                if (inferred != null) {
                    after.put("type_form", inferred);
                    reasons.add("type_form");
                }
            } else {
                Integer coerced = coerceTypeForm(ctx.node.get("type_form"));
                if (coerced != null && !Objects.equals(coerced, toInt(ctx.node.get("type_form")))) {
                    after.put("type_form", coerced);
                    reasons.add("type_form");
                }
            }
            LinkedHashSet<String> removeFields = removeFieldsByNodeId.computeIfAbsent(nodeId, k -> new LinkedHashSet<>());
            applyLegacyIconRepair(ctx.node, after, removeFields, reasons);
        }

        for (Map.Entry<String, Map<String, Object>> entry : afterByNodeId.entrySet()) {
            if (patches.size() >= maxPatches) {
                warnings.add("Truncated repair patches at maxPatches=" + maxPatches);
                break;
            }
            String nodeId = entry.getKey();
            Map<String, Object> after = entry.getValue();
            LinkedHashSet<String> removeFields = removeFieldsByNodeId.getOrDefault(nodeId, new LinkedHashSet<>());
            if (after.isEmpty() && removeFields.isEmpty()) {
                continue;
            }
            NodeCtx ctx = byId.get(nodeId);
            if (ctx == null) {
                continue;
            }
            List<String> reasons = reasonPartsByNodeId.getOrDefault(nodeId, List.of());
            Map<String, Object> patch = new LinkedHashMap<>();
            patch.put("action", "edit");
            patch.put("nodeId", nodeId);
            patch.put("parentId", asText(ctx.node.get("parentId")));
            patch.put("path", ctx.path);
            patch.put("before", null);
            patch.put("after", after);
            if (!removeFields.isEmpty()) {
                patch.put("removeFields", new ArrayList<>(removeFields));
            }
            patch.put(
                "reason",
                reasons.isEmpty()
                    ? "Deterministic quality-gate repair"
                    : "Deterministic menu audit: fix " + String.join(", ", reasons)
            );
            patches.add(patch);
        }

        if (!patches.isEmpty()) {
            warnings.add("Deterministic quality-gate repair (" + patches.size() + " patches). Review label_en/label_zh placeholders.");
        }
        out.put("patches", patches);
        out.put("warnings", warnings);
        return out;
    }

    private void accumulateLabelI18nRepairs(NodeCtx ctx, Map<String, Object> after, List<String> reasons) {
        String label = asText(ctx.node.get("label"));
        if (label.isBlank()) {
            return;
        }
        String labelEn = asText(ctx.node.get("label_en"));
        String labelZh = asText(ctx.node.get("label_zh"));
        LabelParts parts = splitMenuLabelPrefix(label);

        if (labelEn.isBlank() || labelEn.equals(label)) {
            String translated = translateLabel(parts.core(), true);
            after.put("label_en", parts.prefix() + (translated.isBlank() ? parts.core() : translated));
            reasons.add("label_en");
        }
        if (labelZh.isBlank() || labelZh.equals(label)) {
            String translated = translateLabel(parts.core(), false);
            after.put("label_zh", parts.prefix() + (translated.isBlank() ? parts.core() : translated));
            reasons.add("label_zh");
        }
    }

    private void accumulateTableInputParamRepairs(NodeCtx ctx, Map<String, Object> after, List<String> reasons) {
        Object tableObj = ctx.node.get("table");
        if (!(tableObj instanceof List<?> fields) || fields.isEmpty()) {
            return;
        }
        List<Map<String, Object>> fieldPatches = new ArrayList<>();
        for (Object fieldObj : fields) {
            if (!(fieldObj instanceof Map<?, ?> rawField)) {
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> field = (Map<String, Object>) rawField;
            String fName = asText(field.get("f_name"));
            if (fName.isBlank()) {
                continue;
            }
            Map<String, Object> patch = new LinkedHashMap<>();
            patch.put("f_name", fName);

            String fHeader = asText(field.get("f_header"));
            if (fHeader.isBlank()) {
                fHeader = humanizeFieldName(fName);
                patch.put("f_header", fHeader);
            }

            String fHeaderEn = asText(field.get("f_header_en"));
            if (fHeaderEn.isBlank() && !fHeader.isBlank()) {
                String translated = translateLabel(fHeader, true);
                if (!translated.isBlank()) {
                    patch.put("f_header_en", translated);
                }
            }
            String fHeaderZh = asText(field.get("f_header_zh"));
            if (fHeaderZh.isBlank() && !fHeader.isBlank()) {
                String translated = translateLabel(fHeader, false);
                if (!translated.isBlank()) {
                    patch.put("f_header_zh", translated);
                }
            }

            String fTypes = normalizeType(asText(field.get("f_types")));
            if (COMBO_LIKE_TYPES.contains(fTypes) && asText(field.get("f_cbo_query")).isBlank()) {
                Object fOptions = field.get("f_options");
                if (!(fOptions instanceof List<?> opts) || opts.isEmpty()) {
                    // Keep existing value; quality report already flags ERR_COMBO_QUERY_INVALID.
                    // Do not invent business combo queries here.
                }
            }

            if (patch.size() > 1) {
                fieldPatches.add(patch);
            }
        }
        if (!fieldPatches.isEmpty()) {
            after.put("table", fieldPatches);
            reasons.add("table_input_params");
        }
    }

    private void accumulateTriggerRepairs(NodeCtx ctx, Map<String, Object> after, List<String> reasons) {
        Object triggerObj = ctx.node.get("trigger");
        Integer typeForm = toInt(ctx.node.get("type_form"));
        if (typeForm == null) {
            typeForm = inferTypeForm(ctx.node);
        }

        if (triggerObj instanceof List<?> triggerList) {
            Map<String, Object> converted = convertTriggerArrayToObject(triggerList, typeForm);
            if (!converted.isEmpty()) {
                after.put("trigger", converted);
                reasons.add("trigger_array_to_object");
            } else if (typeForm != null && (typeForm == 1 || typeForm == 2 || typeForm == 4 || typeForm == 5)) {
                after.put("trigger", defaultTriggerForTypeForm(typeForm));
                reasons.add("trigger_array_fallback");
            }
            return;
        }

        if (triggerObj instanceof Map<?, ?> triggerMap) {
            Map<String, Object> cleaned = new LinkedHashMap<>();
            boolean hadInvalid = false;
            for (Map.Entry<?, ?> entry : triggerMap.entrySet()) {
                String key = String.valueOf(entry.getKey());
                if (VALID_TRIGGER_KEYS.contains(key)) {
                    Object value = entry.getValue();
                    if (value instanceof String text && text.isBlank()) {
                        continue;
                    }
                    cleaned.put(key, value);
                } else {
                    hadInvalid = true;
                }
            }
            if (hadInvalid || cleaned.size() != triggerMap.size()) {
                after.put("trigger", cleaned);
                reasons.add("trigger_keys");
            } else if (cleaned.isEmpty() && typeForm != null && (typeForm == 1 || typeForm == 2 || typeForm == 4 || typeForm == 5)) {
                after.put("trigger", cleaned);
                reasons.add("trigger_empty");
            }
            return;
        }

        if (triggerObj == null && typeForm != null && (typeForm == 1 || typeForm == 2 || typeForm == 4 || typeForm == 5)) {
            after.put("trigger", defaultTriggerForTypeForm(typeForm));
            reasons.add("trigger_missing");
        }
    }

    /** Weak local models often emit trigger as [{type, action}] — normalize to { load_db: "..." }. */
    private Map<String, Object> convertTriggerArrayToObject(List<?> triggerList, Integer typeForm) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (triggerList == null || triggerList.isEmpty()) {
            return out;
        }
        for (Object item : triggerList) {
            if (!(item instanceof Map<?, ?> row)) {
                continue;
            }
            String typeKey = asText(row.get("type"));
            if (typeKey.isBlank()) {
                typeKey = asText(row.get("key"));
            }
            if (typeKey.isBlank()) {
                typeKey = asText(row.get("name"));
            }
            String action = asText(row.get("action"));
            if (action.isBlank()) {
                action = asText(row.get("value"));
            }
            if (action.isBlank()) {
                action = asText(row.get("handler"));
            }
            if (!typeKey.isBlank() && VALID_TRIGGER_KEYS.contains(typeKey)) {
                out.put(typeKey, action.isBlank() ? defaultTriggerBodyForKey(typeKey) : action);
            }
        }
        if (out.isEmpty() && typeForm != null) {
            return defaultTriggerForTypeForm(typeForm);
        }
        return out;
    }

    private Map<String, Object> defaultTriggerForTypeForm(int typeForm) {
        if (typeForm == 5) {
            return new LinkedHashMap<>(Map.of("report_db", "(self, data, bang)"));
        }
        if (typeForm == 1 || typeForm == 2 || typeForm == 4) {
            return new LinkedHashMap<>(Map.of("load_db", "(self, data, bang)"));
        }
        return new LinkedHashMap<>();
    }

    private String defaultTriggerBodyForKey(String key) {
        if ("report_db".equals(key)) {
            return "(self, data, bang)";
        }
        if ("load_db".equals(key) || "update_db".equals(key) || "delete_db".equals(key)) {
            return "(self, data, bang)";
        }
        return "(self, data, bang)";
    }

    private String translateLabel(String vietnameseCore, boolean english) {
        if (vietnameseCore == null || vietnameseCore.isBlank()) {
            return "";
        }
        if (localTranslationService != null) {
            return english
                ? localTranslationService.translateVietnameseToEnglish(vietnameseCore)
                : localTranslationService.translateVietnameseToChinese(vietnameseCore);
        }
        return "";
    }

    private LabelParts splitMenuLabelPrefix(String label) {
        String safe = asText(label);
        if (safe.isBlank()) {
            return new LabelParts("", "");
        }
        java.util.regex.Matcher matcher = java.util.regex.Pattern
            .compile("^([A-Z0-9]+\\.\\s*)(.+)$")
            .matcher(safe);
        if (matcher.matches()) {
            return new LabelParts(matcher.group(1), matcher.group(2).trim());
        }
        return new LabelParts("", safe);
    }

    private String humanizeFieldName(String fName) {
        String raw = asText(fName);
        if (raw.isBlank()) {
            return "";
        }
        String spaced = raw.replace('_', ' ').replace('-', ' ').trim();
        if (spaced.isBlank()) {
            return raw;
        }
        String[] tokens = spaced.split("\\s+");
        StringBuilder out = new StringBuilder();
        for (String token : tokens) {
            if (token.isBlank()) {
                continue;
            }
            if (!out.isEmpty()) {
                out.append(' ');
            }
            out.append(Character.toUpperCase(token.charAt(0)));
            if (token.length() > 1) {
                out.append(token.substring(1));
            }
        }
        return out.toString();
    }

    private record LabelParts(String prefix, String core) {}

    private void applyLegacyIconRepair(
            Map<String, Object> node,
            Map<String, Object> after,
            Set<String> removeFields,
            List<String> reasons) {
        if (node == null || node.isEmpty()) {
            return;
        }
        for (String forbidden : FORBIDDEN_ICON_FIELDS) {
            if (!node.containsKey(forbidden) || isBlank(node.get(forbidden))) {
                continue;
            }
            if (isBlank(node.get("icon")) && isBlank(after.get("icon"))) {
                after.put("icon", node.get(forbidden));
            }
            removeFields.add(forbidden);
            reasons.add("icon");
        }
    }

    /**
     * Migrate m_icon / m_icons / attributes_icon → canonical {@code icon} in-place (recursive).
     * Prevents hard-gate false rejects on legacy editor data after deterministic menu audit merges.
     */
    public void migrateLegacyIconFieldsDeep(List<Map<String, Object>> menus) {
        if (menus == null || menus.isEmpty()) {
            return;
        }
        for (Map<String, Object> menu : menus) {
            migrateLegacyIconFieldsOnNode(menu);
        }
    }

    @SuppressWarnings("unchecked")
    private void migrateLegacyIconFieldsOnNode(Map<String, Object> node) {
        if (node == null || node.isEmpty()) {
            return;
        }
        for (String forbidden : FORBIDDEN_ICON_FIELDS) {
            if (!node.containsKey(forbidden) || isBlank(node.get(forbidden))) {
                continue;
            }
            if (isBlank(node.get("icon"))) {
                node.put("icon", node.get(forbidden));
            }
            node.remove(forbidden);
        }
        Object children = node.get("children");
        if (children instanceof List<?> childList) {
            for (Object child : childList) {
                if (child instanceof Map<?, ?> childMap) {
                    migrateLegacyIconFieldsOnNode((Map<String, Object>) childMap);
                }
            }
        }
    }

    private Integer coerceTypeForm(Object rawType) {
        Integer parsed = toInt(rawType);
        if (parsed != null && VALID_TYPE_FORMS.contains(parsed)) {
            return parsed;
        }
        String text = asText(rawType).toLowerCase(Locale.ROOT);
        if (text.isBlank()) {
            return null;
        }
        return switch (text) {
            case "group", "0" -> 0;
            case "crud", "1" -> 1;
            case "master_detail", "master-detail", "2" -> 2;
            case "link", "3" -> 3;
            case "runtime", "4" -> 4;
            case "report", "5" -> 5;
            case "kanban", "6" -> 6;
            default -> null;
        };
    }

    private Integer inferTypeForm(Map<String, Object> node) {
        if (node == null || node.isEmpty()) {
            return null;
        }
        Object children = node.get("children");
        if (children instanceof List<?> childList && !childList.isEmpty()) {
            return 0;
        }
        if (!asText(node.get("report_name")).isBlank()) {
            return 5;
        }
        Object triggerObj = node.get("trigger");
        if (triggerObj instanceof Map<?, ?> triggerMap
            && (triggerMap.containsKey("report_db") || triggerMap.containsKey("report_html"))) {
            return 5;
        }
        if (!asText(node.get("table_name")).isBlank()) {
            return 1;
        }
        if (!asText(node.get("v_link")).isBlank()) {
            return 3;
        }
        return 0;
    }

    private Map<String, NodeCtx> indexNodes(List<Map<String, Object>> menus) {
        Map<String, NodeCtx> byId = new LinkedHashMap<>();
        List<NodeCtx> allNodes = new ArrayList<>();
        Set<String> duplicateIds = new LinkedHashSet<>();
        Deque<String> ancestorStack = new ArrayDeque<>();
        for (int i = 0; i < menus.size(); i++) {
            Object rootObj = menus.get(i);
            if (rootObj instanceof Map<?, ?> rawRoot) {
                @SuppressWarnings("unchecked")
                Map<String, Object> root = (Map<String, Object>) rawRoot;
                walkNode(root, "menu[" + i + "]", "", 0, ancestorStack, allNodes, byId, duplicateIds, new QualityReport());
            }
        }
        return byId;
    }

    private String extractNodeIdFromIssuePath(String path, Map<String, NodeCtx> byId) {
        String safePath = asText(path);
        if (safePath.isBlank()) {
            return "";
        }
        int open = safePath.lastIndexOf('(');
        int close = safePath.lastIndexOf(')');
        if (open >= 0 && close > open) {
            String id = safePath.substring(open + 1, close).trim();
            if (byId.containsKey(id)) {
                return id;
            }
        }
        if (safePath.startsWith("id=")) {
            String id = safePath.substring(3).trim();
            if (byId.containsKey(id)) {
                return id;
            }
        }
        return "";
    }
}
