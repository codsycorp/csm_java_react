package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Jackson-based menu tree merge service.
 *
 * <p>Supports two scenarios:</p>
 * <ul>
 *   <li><b>incremental_update</b> — diffMergeTrees(): compares old vs new full tree,
 *       produces a list of precise add/edit/delete PatchOps. The merged result is
 *       the new AI tree (already complete).</li>
 *   <li><b>property_edit</b> — mergeMenuNode(): field-level Jackson merge for a single
 *       node; preserves id/parentId/children; special f_name-keyed merge for "table"
 *       arrays; tracks field-level FieldDelta changes.</li>
 * </ul>
 *
 * The returned PatchOps are consumed by the frontend to render
 * Copilot-style inline diff decorations in CodeMirror.
 */
@Service
public class AiMenuMergeService {

    private final ObjectMapper om = new ObjectMapper();

    // ─── Public data classes ──────────────────────────────────────────────

    public static class FieldDelta {
        public String fieldName;
        public Object oldVal;
        public Object newVal;

        public FieldDelta() {}

        public FieldDelta(String field, Object o, Object n) {
            this.fieldName = field;
            this.oldVal = o;
            this.newVal = n;
        }
    }

    public static class PatchOp {
        public String action;                   // "add" | "edit" | "delete"
        public String nodeId;
        public String nodeName;                 // human-readable label
        public String nodePath;                 // breadcrumb e.g. "Module A / Feature B"
        public List<FieldDelta> changedFields = new ArrayList<>();
    }

    public static class MergeOutput {
        public List<Object> mergedMenu = new ArrayList<>();
        public List<PatchOp> patchOps = new ArrayList<>();
        public int added;
        public int edited;
        public int deleted;
    }

    // ─── Public API ───────────────────────────────────────────────────────

    /**
     * Diff two full menu trees (incremental_update scenario).
     *
     * The AI returned a complete new tree; we diff it against the old tree to
     * find exactly what was added, edited, or deleted.
     * The merged result IS the new AI tree.
     */
    public MergeOutput diffMergeTrees(String oldJson, String newJson) throws Exception {
        JsonNode oldTree = om.readTree(normalizeToArray(oldJson));
        JsonNode newTree = om.readTree(normalizeToArray(newJson));

        MergeOutput out = new MergeOutput();

        // Flatten both trees into id -> (node, breadcrumb) maps
        Map<String, JsonNode> oldMap = new LinkedHashMap<>();
        Map<String, String> oldPaths = new LinkedHashMap<>();
        flattenTree(oldTree, oldMap, oldPaths, "");

        Map<String, JsonNode> newMap = new LinkedHashMap<>();
        Map<String, String> newPaths = new LinkedHashMap<>();
        flattenTree(newTree, newMap, newPaths, "");

        // ADDs and EDITs: walk new tree
        for (Map.Entry<String, JsonNode> e : newMap.entrySet()) {
            String id = e.getKey();
            JsonNode newNode = e.getValue();
            if (!oldMap.containsKey(id)) {
                PatchOp op = new PatchOp();
                op.action = "add";
                op.nodeId = id;
                op.nodeName = getNodeName(newNode);
                op.nodePath = newPaths.getOrDefault(id, "");
                out.patchOps.add(op);
                out.added++;
            } else {
                JsonNode oldNode = oldMap.get(id);
                List<FieldDelta> delta = computeDelta(oldNode, newNode);
                if (!delta.isEmpty()) {
                    PatchOp op = new PatchOp();
                    op.action = "edit";
                    op.nodeId = id;
                    op.nodeName = getNodeName(newNode);
                    op.nodePath = newPaths.getOrDefault(id, "");
                    op.changedFields = delta;
                    out.patchOps.add(op);
                    out.edited++;
                }
            }
        }

        // DELETEs: old nodes not present in new tree
        for (String id : oldMap.keySet()) {
            if (!newMap.containsKey(id)) {
                PatchOp op = new PatchOp();
                op.action = "delete";
                op.nodeId = id;
                op.nodeName = getNodeName(oldMap.get(id));
                op.nodePath = oldPaths.getOrDefault(id, "");
                out.patchOps.add(op);
                out.deleted++;
            }
        }

        // Merged result = the new (full) AI tree
        out.mergedMenu = jsonNodeToList(newTree);
        return out;
    }

    /**
     * Field-level Jackson merge for a single node (property_edit scenario).
     *
     * <ul>
     *   <li>Start with a deep copy of the old node.</li>
     *   <li>Overlay changed fields from the AI's proposed node.</li>
     *   <li>Preserve: id, parentId, parent_id, menu_id, children.</li>
     *   <li>Special: "table" array is merged key-by-key on f_name.</li>
     * </ul>
     * Returns the merged node plus a PatchOp describing every changed field.
     */
    public MergeOutput mergeMenuNode(String oldNodeJson, String newNodeJson) throws Exception {
        JsonNode rawOld = om.readTree(oldNodeJson);
        JsonNode rawNew = om.readTree(newNodeJson);

        // Accept single object or array-of-one
        JsonNode oldNode = rawOld.isArray() ? rawOld.get(0) : rawOld;
        JsonNode newNode = rawNew.isArray() ? rawNew.get(0) : rawNew;

        if (oldNode == null) oldNode = om.createObjectNode();
        if (newNode == null) newNode = om.createObjectNode();

        ObjectNode merged = (ObjectNode) oldNode.deepCopy();

        // Fields never overwritten from AI result
        Set<String> preserve = Set.of("id", "parentId", "parent_id", "menu_id", "children");

        List<FieldDelta> deltas = new ArrayList<>();

        Iterator<Map.Entry<String, JsonNode>> fields = newNode.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            String fieldName = entry.getKey();
            JsonNode newVal = entry.getValue();

            if (preserve.contains(fieldName)) continue;

            JsonNode oldVal = merged.get(fieldName);

            // Special: merge "table" array by f_name key
            if ("table".equals(fieldName)
                    && newVal.isArray()
                    && oldVal != null
                    && oldVal.isArray()) {
                ArrayNode mergedTable = mergeTableArray(
                        (ArrayNode) oldVal, (ArrayNode) newVal, deltas, "table");
                merged.set(fieldName, mergedTable);
            } else {
                if (!newVal.equals(oldVal)) {
                    deltas.add(new FieldDelta(
                            fieldName,
                            oldVal != null && !oldVal.isNull() ? oldVal.asText() : null,
                            !newVal.isNull() ? newVal.asText() : null));
                    merged.set(fieldName, newVal);
                }
            }
        }

        MergeOutput out = new MergeOutput();
        out.mergedMenu = List.of(om.convertValue(merged, Object.class));
        out.edited = deltas.size();

        PatchOp op = new PatchOp();
        op.action = "edit";
        op.nodeId = getNodeIdStr(oldNode);
        op.nodeName = getNodeName(oldNode);
        op.nodePath = "";
        op.changedFields = deltas;
        out.patchOps.add(op);

        return out;
    }

    // ─── Private helpers ──────────────────────────────────────────────────

    /** Recursively walk the tree, populate id->node and id->path maps. */
    private void flattenTree(JsonNode tree, Map<String, JsonNode> map,
                             Map<String, String> paths, String parentPath) {
        if (!tree.isArray()) return;
        for (JsonNode node : tree) {
            String id = getNodeIdStr(node);
            if (id != null && !id.isBlank()) {
                String name = getNodeName(node);
                String path = parentPath.isEmpty() ? name : parentPath + " / " + name;
                map.put(id, node);
                paths.put(id, path);
                JsonNode children = node.get("children");
                if (children != null && children.isArray()) {
                    flattenTree(children, map, paths, path);
                }
            }
        }
    }

    private String getNodeIdStr(JsonNode node) {
        if (node == null) return null;
        JsonNode n = node.get("id");
        if (n == null || n.isNull()) return null;
        return n.asText().trim();
    }

    private String getNodeName(JsonNode node) {
        if (node == null) return "";
        for (String key : new String[]{"label_vi", "labelVi", "label", "name"}) {
            if (node.has(key) && !node.get(key).isNull()) {
                String val = node.get(key).asText().trim();
                if (!val.isEmpty()) return val;
            }
        }
        String id = getNodeIdStr(node);
        return id != null ? id : "";
    }

    private static final Set<String> SKIP_DIFF_FIELDS = Set.of(
            "children", "_action", "_delete", "updated_at", "created_at", "app_id");

    /** Compare scalar and non-child fields between two nodes, return deltas. */
    private List<FieldDelta> computeDelta(JsonNode oldNode, JsonNode newNode) {
        List<FieldDelta> result = new ArrayList<>();
        Iterator<Map.Entry<String, JsonNode>> it = newNode.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            if (SKIP_DIFF_FIELDS.contains(e.getKey())) continue;
            JsonNode oldVal = oldNode.get(e.getKey());
            if (!e.getValue().equals(oldVal)) {
                result.add(new FieldDelta(
                        e.getKey(),
                        oldVal != null && !oldVal.isNull() ? oldVal.asText() : null,
                        !e.getValue().isNull() ? e.getValue().asText() : null));
            }
        }
        return result;
    }

    /**
     * Merge two "table" arrays by f_name key.
     * - Existing rows: update changed fields, track deltas.
     * - New rows (no matching f_name): add as-is.
     * - Old rows not mentioned in new table: keep unchanged (non-destructive).
     */
    private ArrayNode mergeTableArray(ArrayNode oldTable, ArrayNode newTable,
                                      List<FieldDelta> deltas, String parentField) {
        Map<String, ObjectNode> oldByFname = new LinkedHashMap<>();
        for (JsonNode row : oldTable) {
            String fname = row.has("f_name") ? row.get("f_name").asText() : null;
            if (fname != null) oldByFname.put(fname, (ObjectNode) row.deepCopy());
        }

        ArrayNode result = om.createArrayNode();
        Set<String> processed = new LinkedHashSet<>();

        for (JsonNode newRow : newTable) {
            String fname = newRow.has("f_name") ? newRow.get("f_name").asText() : null;
            if (fname != null && oldByFname.containsKey(fname)) {
                ObjectNode mergedRow = oldByFname.get(fname);
                Iterator<Map.Entry<String, JsonNode>> rowFields = newRow.fields();
                while (rowFields.hasNext()) {
                    Map.Entry<String, JsonNode> rf = rowFields.next();
                    JsonNode oldRowVal = mergedRow.get(rf.getKey());
                    if (!rf.getValue().equals(oldRowVal)) {
                        deltas.add(new FieldDelta(
                                parentField + "." + fname + "." + rf.getKey(),
                                oldRowVal != null && !oldRowVal.isNull() ? oldRowVal.asText() : null,
                                !rf.getValue().isNull() ? rf.getValue().asText() : null));
                        mergedRow.set(rf.getKey(), rf.getValue());
                    }
                }
                result.add(mergedRow);
                processed.add(fname);
            } else {
                // New field row added by AI
                result.add(newRow);
                if (fname != null) {
                    processed.add(fname);
                    deltas.add(new FieldDelta(parentField + "." + fname, null, "added"));
                }
            }
        }

        // Keep old rows not mentioned in new table (non-destructive)
        for (Map.Entry<String, ObjectNode> e : oldByFname.entrySet()) {
            if (!processed.contains(e.getKey())) {
                result.add(e.getValue());
            }
        }

        return result;
    }

    /**
     * Normalize a JSON string to a JSON array.
     * Handles: bare array, {"menu":[...]}, {"menus":[...]}, single object.
     */
    private String normalizeToArray(String json) {
        if (json == null || json.isBlank()) return "[]";
        String trimmed = json.trim();
        if (trimmed.startsWith("[")) return trimmed;
        try {
            JsonNode root = om.readTree(trimmed);
            if (root.isObject()) {
                for (String key : new String[]{"menu", "menus", "data", "result"}) {
                    JsonNode arr = root.get(key);
                    if (arr != null && arr.isArray()) {
                        return om.writeValueAsString(arr);
                    }
                }
                // Single object → wrap
                return "[" + trimmed + "]";
            }
        } catch (Exception ignored) {
            // fall through
        }
        return "[]";
    }

    @SuppressWarnings("unchecked")
    private List<Object> jsonNodeToList(JsonNode node) {
        try {
            return om.convertValue(node, List.class);
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }
}
