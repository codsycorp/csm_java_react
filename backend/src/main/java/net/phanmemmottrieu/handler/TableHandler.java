package net.phanmemmottrieu.handler;

import com.corundumstudio.socketio.SocketIOServer;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import net.phanmemmottrieu.controller.WebSpringController;
import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.data.SearchFilter;
import net.phanmemmottrieu.model.StandardResponse;
import net.phanmemmottrieu.model.User;
import net.phanmemmottrieu.socket.SocketIOConfig;
import net.phanmemmottrieu.util.AppTokenHelper;
import net.phanmemmottrieu.util.PermissionBitfieldUtil;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.IOException;
import java.util.*;

@Component
public class TableHandler {
    private static final Logger logger = LoggerFactory.getLogger(TableHandler.class);
    private final RecordManager recordManager; // Khai báo một trường để giữ instance của RecordManager
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final List<String> OWNER_SCOPE_FIELDS = List.of("created_by", "create_by", "owner_id", "owner", "user_id", "userid", "account_id", "parent_account_id");
    private static final List<String> DEPARTMENT_SCOPE_FIELDS = List.of("dept_id", "department_id", "team_id", "group_id", "org_unit_id");
    private static final List<String> BRANCH_SCOPE_FIELDS = List.of("branch_id", "site_id", "region_id");
    private static final List<String> DEFAULT_FULL_MENU_PERMISSIONS = List.of("/dashboard", "/home", "/system/user", "/system/menu", "/system/dept", "/crm");
    private static final Map<Integer, String> CORE_MENU_BIT_TO_TOKEN = createCoreMenuBitToToken();
    private static final Set<String> ACTION_SCOPE_TOKENS = Set.of(
        "view", "create", "edit", "delete", "export",
        "scope:owner", "scope:department", "scope:branch", "scope:all"
    );
    // Các trường admin KHÔNG được phép sửa (chỉ được sửa những trường cá nhân như password, avatar, email, etc.)
    private static final List<String> ADMIN_SELF_EDIT_RESTRICTED_FIELDS = List.of(
        "id", "username",              // Nhận dạng hệ thống
        "app_id", "appId",             // App
        "roles", "permissions",        // Quyền hạn
        "menusPermissions",             // Menu
        "dev",                          // Dev
        "actived",                      // Status
        "permissionBitfield", "permissionSchemaVersion", "dataScope",  // Schema
        "dept_id", "branch_id", "department_id", "team_id", "group_id"   // Tổ chức
    );
    // Các trường sub-user KHÔNG được phép sửa (chỉ được sửa những trường cá nhân như password, etc.)
    private static final List<String> SUBUSER_SELF_EDIT_RESTRICTED_FIELDS = List.of(
        "id", "login_identifier",      // Nhận dạng hệ thống
        "parent_account_id",           // Tài khoản cha
        "group_id",                    // Nhóm
        "roles", "permissions",        // Quyền hạn
        "menusPermissions",            // Menu
        "actived",                     // Status
        "permissionBitfield", "permissionSchemaVersion", "dataScope",  // Schema
        "dept_id", "branch_id", "department_id", "team_id"   // Tổ chức
    );
    private static final Map<String, List<String>> AUTO_PERMISSION_SCHEMA_FIELDS = createAutoPermissionSchemaFields();
    private static final Map<String, List<String>> DEFAULT_TABLE_PK_FIELDS = createDefaultTablePkFields();
    private static final Map<String, List<String>> DEFAULT_TABLE_FIELDS = createDefaultTableFields();
    
    @Autowired
    private SocketIOConfig socketIOConfig; // Inject SocketIOConfig


    @Autowired
    public TableHandler(RecordManager recordManager, SocketIOServer socketIOServer) {
        this.recordManager = recordManager;
    }

    public void restoreDb(StandardResponse response, Map<String, Object> params) {
        String appId = params.get("app_id").toString();
        String tableName = params.get("obj_name").toString();
        try {
            recordManager.restoreDbM(appId, tableName);
            Map<String, Object> key = new HashMap<>();
            key.put("id", tableName);
            response.set("success", true);
            response.set("message", "Đã khôi phục bảng dữ liệu "+tableName+" thành công");
        } catch (Exception e) {
            response.set("success", false);
            response.set("message", "Lỗi khôi phục bảng:"+tableName + e.getMessage());
        }
    }
    public void migrateKeys(StandardResponse response, Map<String, Object> params) {
        Object appIdRaw = params.get("app_id");
        Object tableNameRaw = params.get("obj_name");
    
        String appId;
        if (appIdRaw != null) {
            appId = appIdRaw.toString();
        } else {
            appId = ""; // Hoặc giá trị mặc định khác tùy thuộc vào yêu cầu của bạn
        }

        String tableName;
        if (tableNameRaw != null) {
            tableName = tableNameRaw.toString();
        } else {
            tableName = ""; // Hoặc giá trị mặc định khác
        }
        
        // OSSUtil.log("Xử lý backup bảng " + tableName + " của chương trình: " + appId);
    
        try {
            recordManager.migrateKeys(appId, tableName);
            response.set("success", true);
            response.set("message", "Đã sao chuyển khoá mới cho bảng dữ liệu " + tableName + " thành công");
        } catch (Exception e) {
            response.set("success", false);
            response.set("message", "Lỗi sao lưu bảng: " + tableName + " - " + e.getMessage());
        }
    }
    public void backupDb(StandardResponse response, Map<String, Object> params) {
        Object appIdRaw = params.get("app_id");
        Object tableNameRaw = params.get("obj_name");
    
        if (appIdRaw == null || tableNameRaw == null) {
            response.set("success", false);
            response.set("message", "Thiếu thông tin 'app_id' hoặc 'obj_table' trong request.");
            return;
        }
    
        String appId = appIdRaw.toString();
        String tableName = tableNameRaw.toString();
        
        // OSSUtil.log("Xử lý backup bảng " + tableName + " của chương trình: " + appId);
    
        try {
            recordManager.backupDbM(appId, tableName);
            response.set("success", true);
            response.set("message", "Đã sao lưu bảng dữ liệu " + tableName + " thành công");
        } catch (Exception e) {
            response.set("success", false);
            response.set("message", "Lỗi sao lưu bảng: " + tableName + " - " + e.getMessage());
        }
    }

    public void handleCreateTable(StandardResponse response, Map<String, Object> params) throws Exception {
        // Kiểm tra sự tồn tại của app_id
        if (!params.containsKey("app_id")) {
            response.set("success", false);
            response.set("message", "Thiếu mã chương trình không thể tạo dữ liệu");
            return;
        }
    
        // Lấy đối tượng obj_table
        Object objTableObj = params.get("obj_table");
        if (!(objTableObj instanceof Map)) {
            response.set("success", false);
            response.set("message", "Thiếu hoặc sai định dạng 'obj_table'");
            return;
        }
        Map<String, Object> objTable = (Map<String, Object>) objTableObj;
    
        // Kiểm tra sự tồn tại của id trong obj_table
        if (!objTable.containsKey("id")) {
            response.set("success", false);
            response.set("message", "Thiếu tên bảng id:'tên bảng' trong 'obj_table'");
            return;
        }
        // Kiểm tra sự tồn tại của struct trong obj_table
        if (!objTable.containsKey("struct")) {
            response.set("success", false);
            response.set("message", "Thiếu cấu trúc bảng trong 'obj_table'");
            return;
        }
    
        String appId = params.get("app_id").toString(); // Lấy giá trị của app_id
    
        // Lấy id và struct từ obj_table
        String id = objTable.get("id").toString();
        Map<String, Object> struct = (Map<String, Object>) objTable.get("struct");
    
        // Tạo một Map mới chỉ chứa id và struct để lưu vào recordManager
        Map<String, Object> recordParams = new HashMap<>();
        recordParams.put("id", id);
        recordParams.put("struct", struct);
    
        // Ghi cấu trúc bảng vào bảng 'index' trong database được chỉ định bởi appId.
        recordManager.createRecord(appId, "index", recordParams, List.of("id"));

        // Xóa triệt để Lucene index cũ trước khi tạo lại theo cấu trúc mới
        recordManager.deleteLuceneIndex(appId, id);

        // Rebuild Lucene index theo cấu trúc mới của bảng
        try {
            recordManager.indexExistingRecords(appId, id);
            response.set("success", true);
            response.set("message", "Đã tạo xong cấu trúc và lập lại chỉ mục tìm kiếm cho bảng: " + id);
        } catch (Exception e) {
            logger.warn("Tạo cấu trúc thành công nhưng lỗi khi lập lại chỉ mục cho bảng {}: {}", id, e.getMessage());
            response.set("success", true);
            response.set("message", "Đã tạo xong cấu trúc (lỗi lập chỉ mục: " + e.getMessage() + ")");
        }
    }

    public void handleIndexExistingRecords(StandardResponse response, Map<String, Object> params) {
        String appId = params.get("app_id").toString();
        String tableName = params.get("obj_name").toString();

        try {
            // Gọi phương thức để lập chỉ mục cho các bản ghi hiện có
            recordManager.indexExistingRecords(appId, tableName);

            // Cập nhật phản hồi sau khi lập chỉ mục thành công
            response.set("success", true);
            response.set("message", "Đã lập chỉ mục thành công cho bảng: " + tableName);
        } catch (Exception e) {
            // Cập nhật phản hồi nếu có lỗi xảy ra
            response.set("success", false);
            response.set("message", "Lỗi khi lập chỉ mục bảng: " + e.getMessage());
        }
    }

    public void handleDropTable(StandardResponse response, Map<String, Object> params) {
        String appId = params.get("app_id").toString();
        String tableName = params.get("obj_name").toString();
        try {
            recordManager.deleteDatabase(appId, tableName);
            Map<String, Object> key = new HashMap<>();
            key.put("id", tableName);
            recordManager.deleteRecord(appId, "index", key);
            response.set("success", true);
            response.set("message", "Đã xóa bảng và dữ liệu thành công");
        } catch (Exception e) {
            response.set("success", false);
            response.set("message", "Lỗi khi xóa bảng: " + e.getMessage());
        }
    }

    public void handleGetTableData(StandardResponse response, Map<String, Object> msg) {
        Map<String, Object> result = handleTableOperation(msg, false);
        // logger.info("Ket Qua {}",result);
        response.set("code", 200);
        response.setProperties(result);
        response.set("message", "ok");
        response.set("success", true);
    }

    public void handleUpdateTableData(StandardResponse response, Map<String, Object> msg) {
        Map<String, Object> result = handleTableOperation(msg, true);

        boolean success = true;
        Object successObj = result.get("success");
        if (successObj instanceof Boolean) {
            success = (Boolean) successObj;
        }
        if (Boolean.TRUE.equals(result.get("error"))) {
            success = false;
        }

        // Giải mã pass trong updated_row trước khi trả về client để lưới hiển thị đúng
        if (success) {
            String tblname = msg.get("obj_name") != null ? String.valueOf(msg.get("obj_name")) : "";
            Object updatedRowObj = result.get("updated_row");
            if (updatedRowObj instanceof Map<?, ?>) {
                @SuppressWarnings("unchecked")
                Map<String, Object> updatedRow = (Map<String, Object>) updatedRowObj;
                decryptPassForDisplay(tblname, List.of(updatedRow));
            }
        }

        response.set("code", success ? 200 : 400);
        response.set("message", success ? "ok" : String.valueOf(result.getOrDefault("message", "error")));
        response.set("success", success);

        // Chỉ trả các trường cần thiết, tránh echo toàn bộ request (token/header/filter nhạy cảm).
        copyIfPresent(response, result, "error");
        copyIfPresent(response, result, "requestId");
        copyIfPresent(response, result, "command");
        copyIfPresent(response, result, "socket_actions");
        copyIfPresent(response, result, "updated_row");
        copyIfPresent(response, result, "obj_name");
        copyIfPresent(response, result, "app_id");
    }    

    private void copyIfPresent(StandardResponse response, Map<String, Object> source, String key) {
        if (source != null && source.containsKey(key)) {
            response.set(key, source.get(key));
        }
    }

    private Map<String, Object> handleTableOperation(Map<String, Object> msg, boolean isUpdate) {
        try {
            String appId = msg.get("app_id").toString();
            String tblname = msg.get("obj_name").toString();
            UserAccessContext accessContext = resolveCurrentUserAccessContext();

            // Policy: csm_accounts is dev-only. Admin/sub-user must operate on csm_group_members.
            String tableAccessError = validateSystemUserTableAccess(tblname, accessContext);
            if (tableAccessError != null) {
                return errorResponse(tableAccessError);
            }

            String permissionGroupAppBoundaryError = validatePermissionGroupAppBoundary(appId, tblname, accessContext);
            if (permissionGroupAppBoundaryError != null) {
                return errorResponse(permissionGroupAppBoundaryError);
            }

            // Chuẩn hóa e_where thành Map<String, Object>
            Object eWhereObj = msg.getOrDefault("e_where", new HashMap<>());
            SearchFilter filtersObjs;
            if (eWhereObj instanceof Map) {
                // Giả sử eWhereObj là Map, ta chuyển sang JSON rồi parse lại thành SearchFilter
                ObjectMapper mapper = new ObjectMapper();

                // Convert Map sang JSON string
                String jsonStr = mapper.writeValueAsString(eWhereObj);

                // Parse JSON string thành SearchFilter
                filtersObjs = mapper.readValue(jsonStr, SearchFilter.class);
            } else if (eWhereObj instanceof SearchFilter) {
                filtersObjs = (SearchFilter) eWhereObj;
            } else {
                filtersObjs = null;  // hoặc tạo SearchFilter mặc định nếu cần
            }

            // Security scope: admin (non-dev) chỉ xem users cùng app_id khi đọc bảng csm_accounts.
            filtersObjs = applyAdminUserListScope(tblname, filtersObjs, isUpdate);
            // Security scope: admin (non-dev) chỉ xem sub-user thuộc mình trong bảng csm_group_members.
            filtersObjs = applyAdminSubUserListScope(tblname, filtersObjs, isUpdate);

//            OSSUtil.log("Lấy dữ liệu "+appId+" trên bảng "+tblname+" với điều kiện "+filtersObjs+" so với điều kiện của nó là:"+msg.get("e_where"));
            if ("index".equals(tblname)) {
                return handleIndexTableOperation(appId, msg, filtersObjs, isUpdate, accessContext);
            }
//            OSSUtil.log("Lấy Cấu trúc cho bảng "+tblname+"Với điều kiện là "+findKey);
            // logger.info("Bắt đầu tìm cấu trúc chương trình {} với bảng:{}",msg.get("app_id").toString(),msg.get("obj_name").toString());
            SearchFilter filter = new SearchFilter();
            filter.setField("id");
            filter.setType("eq");
            filter.setValue(tblname);

            Map<String, Object> findStruct = recordManager.find(appId, "index", filter);
            Map<String, Object> objUpdate = null;
            if (msg.get("obj_update") instanceof Map<?, ?> rawUpdate) {
                objUpdate = new HashMap<>();
                for (Map.Entry<?, ?> entry : rawUpdate.entrySet()) {
                    if (entry.getKey() == null) {
                        continue;
                    }
                    objUpdate.put(String.valueOf(entry.getKey()), entry.getValue());
                }
            }

            Map<String, Object> structMap = ensureTableStructReadyForOperation(appId, tblname, findStruct, objUpdate);
            if (structMap == null) {
                return errorResponse("Không tìm thấy cấu trúc bảng");
            }
            ensureAutoPermissionSchemaForTable(appId, tblname, findStruct, structMap);
            List<String> primaryKeyFields = toMutableStringList(structMap.get("fieldsPK"));
            try {
                String filtersJson = objectMapper.writeValueAsString(filtersObjs); // Use the 'filters' parameter
                logger.info("JSON của SearchFilter (filters): {} client gui len la {}", filtersJson,eWhereObj);
            } catch (JsonProcessingException e) {
                logger.error("Không thể chuyển đổi SearchFilter thành JSON để log: {}", e.getMessage());
            }
            return isUpdate ?
                handleUpdateTableOperation(appId, tblname, msg, filtersObjs, primaryKeyFields)
                : handleSelectTableOperation(appId, tblname,msg, filtersObjs, structMap);

        } catch (Exception e) {
            logger.info("Lỗi thao tác chương trình {} với bảng:{} với lỗi:{}",msg.get("app_id").toString(),msg.get("obj_name").toString(),e.getMessage());
            return errorResponse("Lỗi thao tác bảng: " + e.getMessage());
        }
    }

    private String validateSystemUserTableAccess(String tableName, UserAccessContext accessContext) {
        if (tableName == null || accessContext == null) {
            return null;
        }
        if ("csm_accounts".equals(tableName) && !accessContext.isDev) {
            return "Bảng csm_accounts chỉ dành cho tài khoản dev. Admin/Sub-user vui lòng thao tác trên csm_group_members.";
        }
        return null;
    }

    private String validatePermissionGroupAppBoundary(String appId, String tableName, UserAccessContext accessContext) {
        if (accessContext == null || accessContext.isDev) {
            return null;
        }
        if (!"csm_roles".equals(tableName)) {
            return null;
        }
        String contextAppId = safeStr(accessContext.appId);
        if (contextAppId.isEmpty()) {
            return null;
        }
        String targetAppId = safeStr(appId);
        if (targetAppId.isEmpty()) {
            return null;
        }
        if (!contextAppId.equals(targetAppId)) {
            return "Bạn chỉ được quản lý Nhóm quyền trong app_id của chính mình.";
        }
        return null;
    }

    private SearchFilter applyAdminUserListScope(String tableName, SearchFilter existingFilter, boolean isUpdate) {
        if (isUpdate || !"csm_accounts".equals(tableName)) {
            return existingFilter;
        }

        // Multi-level hierarchy (parent -> child -> grandchild) cannot be expressed with a single
        // parent_account_id equality filter at query time. We keep raw filter and apply recursive
        // descendant ownership filtering after fetching rows.
        return existingFilter;
    }

    private SearchFilter applyAdminSubUserListScope(String tableName, SearchFilter existingFilter, boolean isUpdate) {
        if (isUpdate || !"csm_group_members".equals(tableName)) {
            return existingFilter;
        }

        UserAccessContext access = resolveCurrentUserAccessContext();
        // Apply parent_account_id scope for all authenticated users (both admin and dev).
        // Dev should only see sub-users belonging to their own account, not all tenants'.
        if (access.parentAccountCandidates.isEmpty()) {
            return existingFilter;
        }

        SearchFilter ownerScope = buildFieldScopeFilter(access.parentAccountCandidates, "parent_account_id");
        if (ownerScope == null) {
            return existingFilter;
        }
        if (isEmptyFilter(existingFilter)) {
            return ownerScope;
        }

        SearchFilter merged = new SearchFilter();
        merged.setOperator("AND");
        merged.setConditions(new ArrayList<>(List.of(existingFilter, ownerScope)));
        return merged;
    }

    private SearchFilter buildFieldScopeFilter(Set<String> candidates, String fieldName) {
        List<SearchFilter> conditions = new ArrayList<>();
        for (String candidate : candidates) {
            if (candidate == null || candidate.isBlank()) continue;
            SearchFilter cond = new SearchFilter();
            cond.setField(fieldName);
            cond.setType("eq");
            cond.setValue(candidate);
            conditions.add(cond);
        }
        if (conditions.isEmpty()) {
            return null;
        }
        if (conditions.size() == 1) {
            return conditions.get(0);
        }
        SearchFilter filter = new SearchFilter();
        filter.setOperator("OR");
        filter.setConditions(conditions);
        return filter;
    }

    private boolean isOwnedManagedAccountRow(Map<String, Object> row, UserAccessContext access) {
        if (row == null || access == null) {
            return false;
        }
        Set<String> visibleIds = buildManagedAccountVisibleIdSet(List.of(row), access);
        String rowId = normalizedIdentity(row.get("id"));
        if (rowId.isBlank()) {
            return false;
        }
        return visibleIds.contains(rowId);
    }

    private List<Map<String, Object>> filterManagedAccountDescendants(List<Map<String, Object>> rows, UserAccessContext access) {
        return filterManagedAccountDescendants("", rows, access);
    }

    private List<Map<String, Object>> filterManagedAccountDescendants(String tableName, List<Map<String, Object>> rows, UserAccessContext access) {
        if (!"csm_accounts".equals(tableName)) {
            return rows;
        }
        if (rows == null || rows.isEmpty() || access == null || access.isDev) {
            return rows;
        }
        Set<String> visibleIds = buildManagedAccountVisibleIdSet(rows, access);
        if (visibleIds.isEmpty()) {
            return new ArrayList<>();
        }
        return rows.stream()
            .filter(row -> visibleIds.contains(normalizedIdentity(row.get("id"))))
            .collect(java.util.stream.Collectors.toList());
    }

    private Set<String> resolveManagedAccountVisibleIdSet(String appId, UserAccessContext access) {
        if (access == null || access.isDev) {
            return Collections.emptySet();
        }
        SearchFilter allFilter = new SearchFilter();
        allFilter.setField("id");
        allFilter.setType("like");
        allFilter.setValue("");
        Map<String, Object> allRowsResult = recordManager.filter(appId, "csm_accounts", allFilter);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> allRows = (List<Map<String, Object>>) allRowsResult.getOrDefault("rows", new ArrayList<>());
        return buildManagedAccountVisibleIdSet(allRows, access);
    }

    private Set<String> buildManagedAccountVisibleIdSet(List<Map<String, Object>> rows, UserAccessContext access) {
        if (rows == null || rows.isEmpty() || access == null || access.ownerCandidates.isEmpty()) {
            return Collections.emptySet();
        }

        Set<String> reachableParents = new LinkedHashSet<>(access.ownerCandidates);
        Set<String> visibleIds = new LinkedHashSet<>();

        boolean changed = true;
        while (changed) {
            changed = false;
            for (Map<String, Object> row : rows) {
                if (row == null) continue;
                String parent = normalizedIdentity(row.get("parent_account_id"));
                if (parent.isBlank() || !reachableParents.contains(parent)) {
                    continue;
                }
                String rowId = normalizedIdentity(row.get("id"));
                if (rowId.isBlank()) {
                    continue;
                }
                if (visibleIds.add(rowId)) {
                    changed = true;
                }

                int beforeSize = reachableParents.size();
                collectCandidate(reachableParents, row.get("id"));
                collectCandidate(reachableParents, row.get("username"));
                collectCandidate(reachableParents, row.get("email"));
                collectCandidate(reachableParents, row.get("phoneNumber"));
                if (reachableParents.size() != beforeSize) {
                    changed = true;
                }
            }
        }

        return visibleIds;
    }

    private String normalizedIdentity(Object raw) {
        return raw == null ? "" : String.valueOf(raw).trim().toLowerCase(Locale.ROOT);
    }

    private boolean isOwnedSubUserRow(Map<String, Object> row, UserAccessContext access) {
        if (row == null || access == null || access.parentAccountCandidates.isEmpty()) {
            return false;
        }
        Object parentObj = row.get("parent_account_id");
        if (parentObj == null) {
            return false;
        }
        return containsIdentifierCandidateIgnoreCase(access.parentAccountCandidates, String.valueOf(parentObj));
    }

    private boolean containsIdentifierCandidateIgnoreCase(Set<String> candidates, String value) {
        if (candidates == null || candidates.isEmpty() || value == null) {
            return false;
        }
        String normalizedValue = value.trim();
        if (normalizedValue.isEmpty()) {
            return false;
        }
        for (String candidate : candidates) {
            if (candidate != null && candidate.equalsIgnoreCase(normalizedValue)) {
                return true;
            }
        }
        return false;
    }

    private boolean allRowsBelongToCurrentOwner(List<Map<String, Object>> records, UserAccessContext access) {
        if (records == null || records.isEmpty() || access == null || access.ownerCandidates.isEmpty()) {
            return false;
        }
        for (Map<String, Object> row : records) {
            if (row == null) return false;
            String rowId = normalizedIdentity(row.get("id"));
            if (rowId.isBlank() || !access.ownerCandidates.contains(rowId)) {
                return false;
            }
        }
        return true;
    }

    private boolean isEmptyFilter(SearchFilter filter) {
        if (filter == null) {
            return true;
        }
        boolean hasField = filter.getField() != null && !filter.getField().isBlank();
        boolean hasType = filter.getType() != null && !filter.getType().isBlank();
        boolean hasValue = filter.getValue() != null && !String.valueOf(filter.getValue()).isBlank();
        boolean hasConditions = filter.getConditions() != null && !filter.getConditions().isEmpty();
        return !(hasField || hasType || hasValue || hasConditions);
    }

    private static Map<String, List<String>> createAutoPermissionSchemaFields() {
        Map<String, List<String>> map = new HashMap<>();
        map.put("csm_accounts", List.of(
            "permissionBitfield", "permissionSchemaVersion", "dataScope",
            "dept_id", "branch_id", "department_id", "team_id"
        ));
        map.put("csm_group_members", List.of(
            "permissionBitfield", "permissionSchemaVersion", "dataScope",
            "dept_id", "branch_id", "department_id", "team_id"
        ));
        map.put("csm_roles", List.of(
            "permissionBitfield", "permissionSchemaVersion", "dataScope"
        ));
        map.put("csm_user_depts", List.of(
            "permissionBitfield", "permissionSchemaVersion", "dataScope", "branch_id"
        ));
        return map;
    }

    private static Map<String, List<String>> createDefaultTablePkFields() {
        Map<String, List<String>> map = new HashMap<>();
        map.put("csm_depts", List.of("id", "dept_code"));
        map.put("csm_roles", List.of("id", "role_code"));
        map.put("csm_permissions", List.of("id", "permission_code"));
        map.put("csm_role_permissions", List.of("id", "role_id", "permission_id"));
        map.put("csm_user_depts", List.of("id", "user_id", "dept_id"));
        map.put("csm_user_roles", List.of("id", "user_id", "role_id"));
        map.put("csm_accounts", List.of("email", "username", "phoneNumber", "app_id", "app_token", "id"));
        map.put("csm_group_members", List.of("id", "login_identifier"));
        map.put("routers", List.of("path"));
        map.put("index", List.of("id"));
        return map;
    }

    private static Map<String, List<String>> createDefaultTableFields() {
        Map<String, List<String>> map = new HashMap<>();
        map.put("csm_depts", List.of(
            "id", "parent_dept_id", "dept_code", "dept_name", "dept_full_name",
            "description", "manager_user_id", "is_global", "status", "create_time", "update_time"
        ));
        map.put("csm_roles", List.of(
            "id", "role_code", "role_name", "is_global", "department_id",
            "description", "status", "permissionBitfield", "permissionSchemaVersion", "dataScope",
            "create_time", "update_time"
        ));
        map.put("csm_permissions", List.of(
            "id", "permission_code", "permission_name", "resource", "action",
            "description", "category", "create_time"
        ));
        map.put("csm_role_permissions", List.of("id", "role_id", "permission_id", "create_time"));
        map.put("csm_user_depts", List.of(
            "id", "user_id", "dept_id", "is_sub_user", "role_id", "direct_permissions",
            "permissionBitfield", "permissionSchemaVersion", "dataScope",
            "branch_id", "status", "join_date", "create_time"
        ));
        map.put("csm_user_roles", List.of("id", "user_id", "role_id", "create_time"));
        map.put("csm_accounts", List.of(
            "id", "username", "pass", "app_token", "refresh", "email", "avatar", "phoneNumber",
            "refresh_token", "refresh_token_ip", "refresh_token_ua", "refresh_token_expiry", "login_version", "loginVersion",
            "description", "roles", "actived", "permissions", "menusPermissions", "group_rights",
            "full_name", "user_address", "app_id", "parent_account_id", "permissionBitfield", "permissionSchemaVersion", "dataScope",
            "dept_id", "branch_id", "department_id", "team_id"
        ));
        map.put("csm_group_members", List.of(
            "id", "parent_account_id", "login_identifier", "username", "email", "phoneNumber", "full_name", "user_address", "avatar",
            "group_rights", "group_id", "app_id", "app_token", "source_app_token", "refresh_token", "refresh",
            "refresh_token_ip", "refresh_token_ua", "refresh_token_expiry", "login_version", "loginVersion", "pass", "actived",
            "permissions", "menusPermissions", "permissionsAdd", "permissionsDeny", "menusPermissionsAdd", "menusPermissionsDeny",
            "permissionBitfield", "permissionSchemaVersion", "dataScope",
            "dept_id", "branch_id", "department_id", "team_id"
        ));
        map.put("routers", List.of("path", "component", "layout", "handle", "children"));
        map.put("index", List.of("id", "struct"));
        return map;
    }

    private static Map<Integer, String> createCoreMenuBitToToken() {
        Map<Integer, String> map = new HashMap<>();
        map.put(0, "/dashboard");
        map.put(1, "/system/user");
        map.put(3, "/system/menu");
        map.put(4, "/system/dept");
        map.put(5, "/system/developer");
        map.put(6, "/system/broadcast");
        map.put(7, "/system/report");
        map.put(8, "/crm");
        return map;
    }

    private Map<String, Object> ensureTableStructReadyForOperation(
        String appId,
        String tableName,
        Map<String, Object> existingStructRecord,
        Map<String, Object> objUpdate
    ) {
        Map<String, Object> structRecord = existingStructRecord;
        if (structRecord == null) {
            structRecord = new HashMap<>();
            structRecord.put("id", tableName);
        }

        Map<String, Object> structMap = null;
        Object rawStruct = structRecord.get("struct");
        if (rawStruct instanceof Map<?, ?> rawMap) {
            structMap = new HashMap<>();
            for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                if (entry.getKey() == null) {
                    continue;
                }
                structMap.put(String.valueOf(entry.getKey()), entry.getValue());
            }
        }

        boolean changed = false;
        if (structMap == null) {
            structMap = new HashMap<>();
            changed = true;
        }

        List<String> fieldsPk = toMutableStringList(structMap.get("fieldsPK"));
        if (fieldsPk.isEmpty()) {
            fieldsPk = new ArrayList<>(DEFAULT_TABLE_PK_FIELDS.getOrDefault(tableName, List.of("id")));
            changed = true;
        }

        List<String> fields = toMutableStringList(structMap.get("fields"));
        if (fields.isEmpty()) {
            fields = new ArrayList<>(DEFAULT_TABLE_FIELDS.getOrDefault(tableName, new ArrayList<>(fieldsPk)));
            changed = true;
        }

        if (objUpdate != null && !objUpdate.isEmpty()) {
            for (String key : objUpdate.keySet()) {
                if (key == null || key.isBlank()) {
                    continue;
                }
                if (!fields.contains(key)) {
                    fields.add(key);
                    changed = true;
                }
            }
        }

        for (String pkField : fieldsPk) {
            if (!fields.contains(pkField)) {
                fields.add(pkField);
                changed = true;
            }
        }

        if (fieldsPk.isEmpty()) {
            fieldsPk = List.of("id");
            if (!fields.contains("id")) {
                fields.add("id");
            }
            changed = true;
        }

        structMap.put("fieldsPK", fieldsPk);
        structMap.put("fields", fields);
        structRecord.put("struct", structMap);

        if (changed || existingStructRecord == null || existingStructRecord.get("struct") == null) {
            logger.warn("Auto-heal cấu trúc bảng {}.{} vì thiếu/không hợp lệ struct trong index", appId, tableName);
            recordManager.createRecord(appId, "index", structRecord, List.of("id"));
        }

        return structMap;
    }

    private List<String> toMutableStringList(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return new ArrayList<>();
        }
        List<String> out = new ArrayList<>();
        for (Object item : list) {
            if (item == null) {
                continue;
            }
            String value = String.valueOf(item).trim();
            if (!value.isEmpty() && !out.contains(value)) {
                out.add(value);
            }
        }
        return out;
    }

    private Integer parseIntegerParam(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number) {
            return ((Number) raw).intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(raw).trim());
        } catch (Exception ignore) {
            return null;
        }
    }

    private UserAccessContext resolveCurrentUserAccessContext() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || authentication.getPrincipal() == null ||
            "anonymousUser".equals(authentication.getPrincipal())) {
            return new UserAccessContext(
                false,
                false,
                null,
                Collections.emptySet(),
                Collections.emptySet(),
                Collections.emptySet(),
                Collections.emptySet(),
                "NONE",
                Collections.emptyList(),
                Collections.emptyList()
            );
        }

        Object principal = authentication.getPrincipal();
        List<String> roles = null;
        List<String> menusPermissions = null;
        Boolean dev = false;
        String userAppId = null;
        Set<String> parentCandidates = new LinkedHashSet<>();
        Set<String> ownerCandidates = new LinkedHashSet<>();
        Set<String> departmentCandidates = new LinkedHashSet<>();
        Set<String> branchCandidates = new LinkedHashSet<>();

        if (principal instanceof User) {
            User user = (User) principal;
            roles = user.getPermissions();
            menusPermissions = user.getMenusPermissions();
            dev = user.getDev() != null ? user.getDev() : false;
            userAppId = user.getAppId();
            if (user.getId() != null && !user.getId().isBlank()) parentCandidates.add(user.getId());
            if (user.getAppId() != null && !user.getAppId().isBlank()) parentCandidates.add(user.getAppId());
            if (user.getUsername() != null && !user.getUsername().isBlank()) parentCandidates.add(user.getUsername());
            if (user.getEmail() != null && !user.getEmail().isBlank()) parentCandidates.add(user.getEmail());
            if (user.getPhoneNumber() != null && !user.getPhoneNumber().isBlank()) parentCandidates.add(user.getPhoneNumber());

            collectCandidate(ownerCandidates, user.getId());
            collectCandidate(ownerCandidates, user.getUsername());
            collectCandidate(ownerCandidates, user.getEmail());
            collectCandidate(ownerCandidates, user.getPhoneNumber());
        } else if (principal instanceof Map<?, ?>) {
            Map<?, ?> principalMap = (Map<?, ?>) principal;
            roles = toStringList(principalMap.get("roles"));
            menusPermissions = toStringList(principalMap.get("menusPermissions"));
            Object devObj = principalMap.get("dev");
            if (devObj instanceof Boolean) {
                dev = (Boolean) devObj;
            }
            Object appIdObj = principalMap.get("app_id");
            if (appIdObj != null) {
                userAppId = String.valueOf(appIdObj);
                if (!userAppId.isBlank()) parentCandidates.add(userAppId);
            }
            Object idObj = principalMap.get("id");
            if (idObj != null && !String.valueOf(idObj).isBlank()) parentCandidates.add(String.valueOf(idObj));
            Object usernameObj = principalMap.get("username");
            if (usernameObj != null && !String.valueOf(usernameObj).isBlank()) parentCandidates.add(String.valueOf(usernameObj));
            Object emailObj = principalMap.get("email");
            if (emailObj != null && !String.valueOf(emailObj).isBlank()) parentCandidates.add(String.valueOf(emailObj));
            Object phoneObj = principalMap.get("phoneNumber");
            if (phoneObj != null && !String.valueOf(phoneObj).isBlank()) parentCandidates.add(String.valueOf(phoneObj));

            collectCandidate(ownerCandidates, principalMap.get("id"));
            collectCandidate(ownerCandidates, principalMap.get("userId"));
            collectCandidate(ownerCandidates, principalMap.get("username"));
            collectCandidate(ownerCandidates, principalMap.get("email"));
            collectCandidate(ownerCandidates, principalMap.get("phoneNumber"));

            collectCandidate(departmentCandidates, principalMap.get("dept_id"));
            collectCandidate(departmentCandidates, principalMap.get("deptId"));
            collectCandidate(departmentCandidates, principalMap.get("department_id"));
            collectCandidate(departmentCandidates, principalMap.get("team_id"));
            collectCandidate(departmentCandidates, principalMap.get("group_id"));

            collectCandidate(branchCandidates, principalMap.get("branch_id"));
            collectCandidate(branchCandidates, principalMap.get("branchId"));
            collectCandidate(branchCandidates, principalMap.get("site_id"));
            collectCandidate(branchCandidates, principalMap.get("region_id"));
        }

        Object permissionBitfieldRaw = null;
        if (principal instanceof User userPrincipal) {
            permissionBitfieldRaw = userPrincipal.getPermissionBitfield();
        } else if (principal instanceof Map<?, ?> principalMap) {
            permissionBitfieldRaw = principalMap.get("permissionBitfield");
        }
        Long parsedToken = PermissionBitfieldUtil.parseSecurityToken(safeStr(permissionBitfieldRaw));

        List<String> effectivePermissions = roles == null ? new ArrayList<>() : new ArrayList<>(roles);
        if (parsedToken != null) {
            effectivePermissions = permissionsFromToken(parsedToken);
        }

        boolean isAdmin = (roles != null && roles.stream().anyMatch(r -> "admin".equalsIgnoreCase(r)))
            || hasAdminPrivilegeFromToken(parsedToken);
        String dataScope = parsedToken != null
            ? PermissionBitfieldUtil.resolveDataScope(parsedToken)
            : PermissionBitfieldUtil.resolveDataScope(PermissionBitfieldUtil.buildBitfield(effectivePermissions, menusPermissions, dev));
        return new UserAccessContext(
            isAdmin,
            Boolean.TRUE.equals(dev),
            userAppId,
            parentCandidates,
            ownerCandidates,
            departmentCandidates,
            branchCandidates,
            dataScope,
            effectivePermissions,
            menusPermissions
        );
    }

    private List<Map<String, Object>> applyDataScopeRowFilter(String tableName, List<Map<String, Object>> rows, UserAccessContext access) {
        if (rows == null || rows.isEmpty() || access == null || access.isDev || isDataScopeExemptTable(tableName)) {
            return rows;
        }

        String scope = access.dataScope != null ? access.dataScope : "NONE";
        if ("ALL".equalsIgnoreCase(scope) || "NONE".equalsIgnoreCase(scope)) {
            return rows;
        }

        return rows.stream().filter(row -> rowMatchesDataScope(row, access)).collect(java.util.stream.Collectors.toList());
    }

    private boolean rowMatchesDataScope(Map<String, Object> row, UserAccessContext access) {
        String scope = access.dataScope != null ? access.dataScope : "NONE";
        if ("OWNER".equalsIgnoreCase(scope)) {
            return matchesByFields(row, OWNER_SCOPE_FIELDS, access.ownerCandidates);
        }
        if ("DEPARTMENT".equalsIgnoreCase(scope)) {
            return matchesByFields(row, DEPARTMENT_SCOPE_FIELDS, access.departmentCandidates);
        }
        if ("BRANCH".equalsIgnoreCase(scope)) {
            return matchesByFields(row, BRANCH_SCOPE_FIELDS, access.branchCandidates);
        }
        return true;
    }

    private String applyDataScopeCreateGuard(String tableName, Map<String, Object> objUpdate, UserAccessContext access) {
        if (objUpdate == null || access == null || access.isDev || isDataScopeExemptTable(tableName)) {
            return null;
        }

        String scope = access.dataScope != null ? access.dataScope : "NONE";
        if ("ALL".equalsIgnoreCase(scope) || "NONE".equalsIgnoreCase(scope)) {
            return null;
        }

        if ("OWNER".equalsIgnoreCase(scope)) {
            return validateOrAssignField(objUpdate, OWNER_SCOPE_FIELDS, access.ownerCandidates, access.preferredOwner, "Bạn chỉ được tạo dữ liệu thuộc phạm vi OWNER");
        }
        if ("DEPARTMENT".equalsIgnoreCase(scope)) {
            return validateOrAssignField(objUpdate, DEPARTMENT_SCOPE_FIELDS, access.departmentCandidates, access.preferredDepartment, "Bạn chỉ được tạo dữ liệu thuộc DEPARTMENT của mình");
        }
        if ("BRANCH".equalsIgnoreCase(scope)) {
            return validateOrAssignField(objUpdate, BRANCH_SCOPE_FIELDS, access.branchCandidates, access.preferredBranch, "Bạn chỉ được tạo dữ liệu thuộc BRANCH của mình");
        }
        return null;
    }

    private String validateOrAssignField(
        Map<String, Object> row,
        List<String> fields,
        Set<String> allowedValues,
        String fallbackValue,
        String errorMessage
    ) {
        for (String field : fields) {
            if (!row.containsKey(field)) {
                continue;
            }
            Object current = row.get(field);
            if (current == null || String.valueOf(current).isBlank()) {
                if (fallbackValue != null && !fallbackValue.isBlank()) {
                    row.put(field, fallbackValue);
                    return null;
                }
                return errorMessage;
            }

            String normalized = String.valueOf(current).trim().toLowerCase(Locale.ROOT);
            if (allowedValues.isEmpty() || !allowedValues.contains(normalized)) {
                return errorMessage;
            }
            return null;
        }
        return null;
    }

    private boolean matchesByFields(Map<String, Object> row, List<String> fields, Set<String> allowedValues) {
        if (row == null || fields == null || fields.isEmpty()) {
            return true;
        }
        String foundValue = null;
        for (String field : fields) {
            Object value = row.get(field);
            if (value != null && !String.valueOf(value).isBlank()) {
                foundValue = String.valueOf(value).trim().toLowerCase(Locale.ROOT);
                break;
            }
        }
        if (foundValue == null) {
            return true;
        }
        return allowedValues.contains(foundValue);
    }

    private boolean isDataScopeExemptTable(String tableName) {
        if (tableName == null || tableName.isBlank()) {
            return true;
        }
        return "index".equals(tableName)
            || "csm_accounts".equals(tableName)
            || "csm_group_members".equals(tableName)
            || "csm_roles".equals(tableName)
            || "csm_permissions".equals(tableName)
            || "csm_role_permissions".equals(tableName)
            || "csm_user_roles".equals(tableName)
            || "csm_user_depts".equals(tableName)
            || "csm_depts".equals(tableName)
            || "csm_menu".equals(tableName);
    }

    private void collectCandidate(Set<String> target, Object raw) {
        if (target == null || raw == null) {
            return;
        }
        String normalized = String.valueOf(raw).trim().toLowerCase(Locale.ROOT);
        if (!normalized.isBlank()) {
            target.add(normalized);
        }
    }

    private List<String> toStringList(Object raw) {
        if (raw == null) {
            return Collections.emptyList();
        }
        if (raw instanceof List<?> list) {
            List<String> out = new ArrayList<>();
            for (Object item : list) {
                if (item == null) continue;
                if (item instanceof Map<?, ?> mapItem) {
                    Object valueObj = mapItem.get("value");
                    if (valueObj == null) valueObj = mapItem.get("id");
                    if (valueObj == null) valueObj = mapItem.get("key");
                    if (valueObj == null) valueObj = mapItem.get("code");
                    String value = safeStr(valueObj);
                    if (!value.isBlank()) {
                        out.add(value);
                    }
                    continue;
                }
                String value = String.valueOf(item).trim();
                if (!value.isBlank()) {
                    out.add(value);
                }
            }
            return out;
        }
        if (raw instanceof String text) {
            String trimmed = text.trim();
            if (trimmed.isEmpty()) {
                return Collections.emptyList();
            }
            if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
                try {
                    Object parsed = objectMapper.readValue(trimmed, Object.class);
                    return toStringList(parsed);
                } catch (Exception ignore) {
                }
            }
            String[] parts = trimmed.split("[,;\\n]");
            List<String> out = new ArrayList<>();
            for (String part : parts) {
                String value = safeStr(part);
                if (!value.isBlank()) {
                    out.add(value);
                }
            }
            return out;
        }
        return Collections.emptyList();
    }

    private Map<String, Object> findRoleRecordByCodeOrId(String appId, String roleRef) {
        String effectiveAppId = safeStr(appId);
        if (effectiveAppId.isEmpty()) {
            effectiveAppId = "csm";
        }
        String role = safeStr(roleRef);
        if (role.isEmpty()) {
            return Collections.emptyMap();
        }

        SearchFilter roleCodeFilter = new SearchFilter();
        roleCodeFilter.setField("role_code");
        roleCodeFilter.setType("eq");
        roleCodeFilter.setValue(role);
        Map<String, Object> byRoleCode = recordManager.find(effectiveAppId, "csm_roles", roleCodeFilter);
        if (byRoleCode != null && !byRoleCode.isEmpty()) {
            return byRoleCode;
        }

        SearchFilter idFilter = new SearchFilter();
        idFilter.setField("id");
        idFilter.setType("eq");
        idFilter.setValue(role);
        Map<String, Object> byId = recordManager.find(effectiveAppId, "csm_roles", idFilter);
        return byId == null ? Collections.emptyMap() : byId;
    }

    private List<String> mergeUniqueCaseInsensitive(List<String> base, List<String> extra) {
        LinkedHashMap<String, String> merged = new LinkedHashMap<>();
        List<String> safeBase = base == null ? Collections.emptyList() : base;
        List<String> safeExtra = extra == null ? Collections.emptyList() : extra;
        for (String value : safeBase) {
            String normalized = safeStr(value);
            if (!normalized.isEmpty()) {
                merged.putIfAbsent(normalized.toLowerCase(Locale.ROOT), normalized);
            }
        }
        for (String value : safeExtra) {
            String normalized = safeStr(value);
            if (!normalized.isEmpty()) {
                merged.putIfAbsent(normalized.toLowerCase(Locale.ROOT), normalized);
            }
        }
        return new ArrayList<>(merged.values());
    }

    private List<String> subtractCaseInsensitive(List<String> source, List<String> deny) {
        Set<String> denySet = new LinkedHashSet<>();
        List<String> safeDeny = deny == null ? Collections.emptyList() : deny;
        for (String value : safeDeny) {
            String normalized = safeStr(value).toLowerCase(Locale.ROOT);
            if (!normalized.isEmpty()) {
                denySet.add(normalized);
            }
        }
        if (denySet.isEmpty()) {
            return source == null ? Collections.emptyList() : new ArrayList<>(source);
        }
        List<String> safeSource = source == null ? Collections.emptyList() : source;
        List<String> out = new ArrayList<>();
        for (String value : safeSource) {
            String normalized = safeStr(value);
            if (normalized.isEmpty()) {
                continue;
            }
            if (!denySet.contains(normalized.toLowerCase(Locale.ROOT))) {
                out.add(normalized);
            }
        }
        return out;
    }

    private List<String> presetPermissions(String rawPreset) {
        String preset = safeStr(rawPreset).toLowerCase(Locale.ROOT);
        return switch (preset) {
            case "viewer" -> List.of("view");
            case "editor" -> List.of("view", "create", "edit");
            case "full_crud" -> List.of("view", "create", "edit", "delete");
            case "full_crud_export" -> List.of("view", "create", "edit", "delete", "export");
            case "admin_full" -> List.of("admin", "view", "create", "edit", "delete", "export", "scope:all");
            default -> Collections.emptyList();
        };
    }

    private List<String> presetMenus(String rawPreset) {
        String preset = safeStr(rawPreset).toLowerCase(Locale.ROOT);
        return switch (preset) {
            case "viewer" -> List.of("/home");
            case "editor", "full_crud", "full_crud_export" -> List.of("/dashboard", "/home", "/crm");
            case "admin_full" -> List.of("/system/user", "/system/menu", "/system/dept", "/dashboard", "/home", "/crm");
            default -> Collections.emptyList();
        };
    }

    private boolean isSubsetCaseInsensitive(List<String> subset, List<String> superset) {
        List<String> safeSubset = subset == null ? Collections.emptyList() : subset;
        if (safeSubset.isEmpty()) {
            return true;
        }
        Set<String> normalizedSuperset = new LinkedHashSet<>();
        List<String> safeSuperset = superset == null ? Collections.emptyList() : superset;
        for (String value : safeSuperset) {
            String normalized = safeStr(value).toLowerCase(Locale.ROOT);
            if (!normalized.isBlank()) {
                normalizedSuperset.add(normalized);
            }
        }
        for (String value : safeSubset) {
            String normalized = safeStr(value).toLowerCase(Locale.ROOT);
            if (!normalized.isBlank() && !normalizedSuperset.contains(normalized)) {
                return false;
            }
        }
        return true;
    }

    private String normalizeScopeName(String rawScope) {
        String scope = safeStr(rawScope).toUpperCase(Locale.ROOT);
        return switch (scope) {
            case "ALL", "BRANCH", "DEPARTMENT", "OWNER" -> scope;
            default -> "NONE";
        };
    }

    private List<String> applyScopeToken(List<String> permissions, String scope) {
        List<String> out = subtractCaseInsensitive(permissions, List.of("scope:owner", "scope:department", "scope:branch", "scope:all"));
        String normalizedScope = normalizeScopeName(scope);
        switch (normalizedScope) {
            case "OWNER" -> out = mergeUniqueCaseInsensitive(out, List.of("scope:owner"));
            case "DEPARTMENT" -> out = mergeUniqueCaseInsensitive(out, List.of("scope:department"));
            case "BRANCH" -> out = mergeUniqueCaseInsensitive(out, List.of("scope:branch"));
            case "ALL" -> out = mergeUniqueCaseInsensitive(out, List.of("scope:all"));
            default -> {
            }
        }
        return out;
    }

    private List<String> permissionsFromToken(long bitfield) {
        List<String> out = new ArrayList<>();
        if (PermissionBitfieldUtil.hasBit(bitfield, PermissionBitfieldUtil.ACTION_VIEW)) out.add("view");
        if (PermissionBitfieldUtil.hasBit(bitfield, PermissionBitfieldUtil.ACTION_CREATE)) out.add("create");
        if (PermissionBitfieldUtil.hasBit(bitfield, PermissionBitfieldUtil.ACTION_EDIT)) out.add("edit");
        if (PermissionBitfieldUtil.hasBit(bitfield, PermissionBitfieldUtil.ACTION_DELETE)) out.add("delete");
        if (PermissionBitfieldUtil.hasBit(bitfield, PermissionBitfieldUtil.ACTION_EXPORT)) out.add("export");

        String scope = PermissionBitfieldUtil.resolveDataScope(bitfield);
        switch (scope) {
            case "OWNER" -> out.add("scope:owner");
            case "DEPARTMENT" -> out.add("scope:department");
            case "BRANCH" -> out.add("scope:branch");
            case "ALL" -> out.add("scope:all");
            default -> {
            }
        }
        return out;
    }

    private List<String> coreMenusFromToken(long bitfield) {
        List<String> out = new ArrayList<>();
        for (Map.Entry<Integer, String> entry : CORE_MENU_BIT_TO_TOKEN.entrySet()) {
            if (PermissionBitfieldUtil.hasBit(bitfield, entry.getKey())) {
                out.add(entry.getValue());
            }
        }
        return out;
    }

    private boolean hasAdminPrivilegeFromToken(Long parsedToken) {
        if (parsedToken == null) {
            return false;
        }
        long bitfield = parsedToken;
        return PermissionBitfieldUtil.hasBit(bitfield, PermissionBitfieldUtil.ACTION_VIEW)
            && PermissionBitfieldUtil.hasBit(bitfield, PermissionBitfieldUtil.ACTION_CREATE)
            && PermissionBitfieldUtil.hasBit(bitfield, PermissionBitfieldUtil.ACTION_EDIT)
            && PermissionBitfieldUtil.hasBit(bitfield, PermissionBitfieldUtil.ACTION_DELETE)
            && PermissionBitfieldUtil.hasBit(bitfield, PermissionBitfieldUtil.ACTION_EXPORT)
            && "ALL".equalsIgnoreCase(PermissionBitfieldUtil.resolveDataScope(bitfield));
    }

    private void syncProjectionFromToken(Map<String, Object> row, long bitfield) {
        if (row == null) {
            return;
        }

        List<String> projectedPermissions = permissionsFromToken(bitfield);
        List<String> existingPermissions = toStringList(row.get("permissions"));
        List<String> customPermissionTokens = subtractCaseInsensitive(existingPermissions, new ArrayList<>(ACTION_SCOPE_TOKENS));
        row.put("permissions", mergeUniqueCaseInsensitive(customPermissionTokens, projectedPermissions));

        List<String> projectedCoreMenus = coreMenusFromToken(bitfield);
        List<String> existingMenus = toStringList(row.get("menusPermissions"));
        Set<String> coreMenuSet = new HashSet<>();
        for (String menu : CORE_MENU_BIT_TO_TOKEN.values()) {
            coreMenuSet.add(menu.toLowerCase(Locale.ROOT));
        }
        List<String> customMenus = new ArrayList<>();
        for (String menu : existingMenus) {
            String normalized = safeStr(menu).toLowerCase(Locale.ROOT);
            if (!normalized.isEmpty() && !coreMenuSet.contains(normalized)) {
                customMenus.add(menu);
            }
        }
        row.put("menusPermissions", mergeUniqueCaseInsensitive(customMenus, projectedCoreMenus));
        row.put("dataScope", PermissionBitfieldUtil.resolveDataScope(bitfield));
    }

    /**
     * Xác thực admin có thể tự sửa thông tin cá nhân trên bảng csm_accounts.
     * Validation này chạy SAU khi records đã tìm được (update flow).
     * 
     * @return null nếu hợp lệ, hoặc thông báo lỗi
     */
    private String validateAdminSelfEditOnRecords(String command, Map<String, Object> objUpdate, 
                                                   List<Map<String, Object>> records, UserAccessContext accessContext) {
        // Cho update: kiểm tra records có thuộc user hiện tại không
        if ("update".equals(command)) {
            if (records.isEmpty()) {
                return "Không tìm thấy bản ghi để cập nhật";
            }
            
            String currentUserId = accessContext.ownerCandidates.stream().findFirst().orElse("");
            if (currentUserId.isBlank()) {
                return "Không xác định được ID của user hiện tại";
            }
            
            // Kiểm tra tất cả records có thuộc user hiện tại không
            for (Map<String, Object> row : records) {
                Object rowId = row.get("id");
                String rowIdStr = (rowId != null) ? String.valueOf(rowId).trim() : "";
                if (!currentUserId.equalsIgnoreCase(rowIdStr)) {
                    return "Admin chỉ được cập nhật thông tin của chính mình, không được sửa record của người khác";
                }
            }
            
            // Kiểm tra các trường bị cấm
            for (String restrictedField : ADMIN_SELF_EDIT_RESTRICTED_FIELDS) {
                if (objUpdate.containsKey(restrictedField)) {
                    Object requestedValue = objUpdate.get(restrictedField);
                    if (requestedValue != null && !String.valueOf(requestedValue).isBlank()) {
                        if (!isRestrictedFieldActuallyChanged(restrictedField, requestedValue, records)) {
                            continue;
                        }
                        return "Admin không được thay đổi trường hệ thống: " + restrictedField + 
                               ". Bạn chỉ được sửa: password, avatar, email, phone, full_name, address, description";
                    }
                }
            }
        }
        return null;
    }

    /**
     * Xác thực sub-user có thể tự sửa thông tin cá nhân trên bảng csm_group_members.
     * Validation này chạy SAU khi records đã tìm được (update flow).
     * 
     * @return null nếu hợp lệ, hoặc thông báo lỗi
     */
    private String validateSubUserSelfEditOnRecords(String command, Map<String, Object> objUpdate, 
                                                     List<Map<String, Object>> records, UserAccessContext accessContext) {
        // Cho update: kiểm tra records có thuộc user hiện tại không
        if ("update".equals(command)) {
            if (records.isEmpty()) {
                return "Không tìm thấy bản ghi để cập nhật";
            }
            
            String currentUserId = accessContext.ownerCandidates.stream().findFirst().orElse("");
            if (currentUserId.isBlank()) {
                return "Không xác định được ID của sub-user hiện tại";
            }
            
            // Kiểm tra tất cả records có thuộc user hiện tại không
            for (Map<String, Object> row : records) {
                Object rowId = row.get("id");
                String rowIdStr = (rowId != null) ? String.valueOf(rowId).trim() : "";
                if (!currentUserId.equalsIgnoreCase(rowIdStr)) {
                    return "Sub-user chỉ được cập nhật thông tin của chính mình, không được sửa record của người khác";
                }
            }
            
            // Kiểm tra các trường bị cấm
            for (String restrictedField : SUBUSER_SELF_EDIT_RESTRICTED_FIELDS) {
                if (objUpdate.containsKey(restrictedField)) {
                    Object requestedValue = objUpdate.get(restrictedField);
                    if (requestedValue != null && !String.valueOf(requestedValue).isBlank()) {
                        if (!isRestrictedFieldActuallyChanged(restrictedField, requestedValue, records)) {
                            continue;
                        }
                        return "Sub-user không được thay đổi trường hệ thống: " + restrictedField + 
                               ". Bạn chỉ được sửa: password/pass và các thông tin cá nhân khác";
                    }
                }
            }
        }
        return null;
    }

    private boolean isRestrictedFieldActuallyChanged(String fieldName, Object requestedValue, List<Map<String, Object>> records) {
        String requested = String.valueOf(requestedValue).trim();
        for (Map<String, Object> row : records) {
            String stored = row.get(fieldName) == null ? "" : String.valueOf(row.get(fieldName)).trim();
            if (!Objects.equals(stored, requested)) {
                return true;
            }
        }
        return false;
    }

    private static String safeStr(Object val) {
        return val == null ? "" : String.valueOf(val).trim();
    }

    private static int dataScopeRank(String scope) {
        String normalized = safeStr(scope).toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "OWNER" -> 1;
            case "DEPARTMENT" -> 2;
            case "BRANCH" -> 3;
            case "ALL" -> 4;
            default -> 0;
        };
    }

    private static String minDataScope(String requested, String allowed) {
        String[] scopes = {"NONE", "OWNER", "DEPARTMENT", "BRANCH", "ALL"};
        int idx = Math.min(dataScopeRank(requested), dataScopeRank(allowed));
        return scopes[Math.max(0, Math.min(idx, scopes.length - 1))];
    }

    private static List<String> intersectPreserveOrder(List<String> requested, List<String> allowed) {
        List<String> safeRequested = requested == null ? Collections.emptyList() : requested;
        List<String> safeAllowed = allowed == null ? Collections.emptyList() : allowed;
        Set<String> allowedSet = new LinkedHashSet<>();
        for (String item : safeAllowed) {
            String normalized = safeStr(item).toLowerCase(Locale.ROOT);
            if (!normalized.isEmpty()) {
                allowedSet.add(normalized);
            }
        }
        if (allowedSet.isEmpty()) {
            return new ArrayList<>();
        }
        List<String> result = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (String item : safeRequested) {
            String normalized = safeStr(item).toLowerCase(Locale.ROOT);
            if (!normalized.isEmpty() && allowedSet.contains(normalized) && seen.add(normalized)) {
                result.add(safeStr(item));
            }
        }
        return result;
    }

    private void normalizeManagedAccountPermissions(Map<String, Object> objUpdate, UserAccessContext accessContext) {
        if (objUpdate == null || accessContext == null) {
            return;
        }

        if (accessContext.isDev) {
            objUpdate.put("roles", new ArrayList<>(List.of("admin")));
            objUpdate.put("permissions", new ArrayList<>(List.of("admin", "scope:all")));
            // Dev tạo tài khoản chính phải có full scope theo app_id đích.
            // Dùng legacy full-app token để frontend/backend đều hiểu là toàn quyền menu app.
            String targetAppId = safeStr(objUpdate.get("app_id"));
            if (targetAppId.isEmpty()) {
                targetAppId = accessContext.appId == null ? "" : accessContext.appId;
            }
            if (!targetAppId.isBlank()) {
                objUpdate.put("menusPermissions", new ArrayList<>(List.of(targetAppId.trim())));
            } else {
                List<String> inheritedMenus = accessContext.menusPermissions == null ? Collections.emptyList() : accessContext.menusPermissions;
                objUpdate.put("menusPermissions", new ArrayList<>(inheritedMenus));
            }
            objUpdate.put("dataScope", "ALL");
            return;
        }

        if (accessContext.preferredOwner != null && !accessContext.preferredOwner.isBlank()) {
            objUpdate.put("parent_account_id", accessContext.preferredOwner);
        }
        if (accessContext.appId != null && !accessContext.appId.isBlank()) {
            objUpdate.put("app_id", accessContext.appId);
        }

        List<String> permissionGroups = toStringList(objUpdate.get("permissionGroups"));
        List<String> groupedPermissions = new ArrayList<>();
        List<String> groupedMenus = new ArrayList<>();
        for (String groupRef : permissionGroups) {
            Map<String, Object> roleRecord = findRoleRecordByCodeOrId(accessContext.appId, groupRef);
            if (roleRecord == null || roleRecord.isEmpty()) {
                continue;
            }
            groupedPermissions = mergeUniqueCaseInsensitive(groupedPermissions, toStringList(roleRecord.get("permissions")));
            groupedMenus = mergeUniqueCaseInsensitive(groupedMenus, toStringList(roleRecord.get("menusPermissions")));
        }

        List<String> requestedPermissions = toStringList(objUpdate.get("permissions"));
        List<String> requestedMenus = toStringList(objUpdate.get("menusPermissions"));
        String requestedPreset = safeStr(objUpdate.get("permissionPreset"));
        List<String> presetPermissions = presetPermissions(requestedPreset);
        List<String> presetMenus = presetMenus(requestedPreset);
        if (requestedPermissions.isEmpty() && !presetPermissions.isEmpty()) {
            requestedPermissions = new ArrayList<>(presetPermissions);
        }
        if (requestedMenus.isEmpty() && !presetMenus.isEmpty()) {
            requestedMenus = new ArrayList<>(presetMenus);
        }
        List<String> permissionsAdd = toStringList(objUpdate.get("permissionsAdd"));
        List<String> permissionsDeny = toStringList(objUpdate.get("permissionsDeny"));
        List<String> menusAdd = toStringList(objUpdate.get("menusPermissionsAdd"));
        List<String> menusDeny = toStringList(objUpdate.get("menusPermissionsDeny"));

        List<String> basePermissions = (!permissionGroups.isEmpty() && !groupedPermissions.isEmpty()) ? groupedPermissions : requestedPermissions;
        List<String> baseMenus = (!permissionGroups.isEmpty() && !groupedMenus.isEmpty()) ? groupedMenus : requestedMenus;

        List<String> resolvedPermissions = mergeUniqueCaseInsensitive(basePermissions, permissionsAdd);
        resolvedPermissions = subtractCaseInsensitive(resolvedPermissions, permissionsDeny);

        List<String> resolvedMenus = mergeUniqueCaseInsensitive(baseMenus, menusAdd);
        resolvedMenus = subtractCaseInsensitive(resolvedMenus, menusDeny);

        List<String> allowedPermissions = accessContext.permissions == null ? Collections.emptyList() : accessContext.permissions;
        List<String> allowedMenus = accessContext.menusPermissions == null ? Collections.emptyList() : accessContext.menusPermissions;

        objUpdate.put("permissions", intersectPreserveOrder(resolvedPermissions, allowedPermissions));

        // Nếu admin có "legacy full-app-scope" (menusPermissions chỉ chứa appId),
        // họ được phép gán bất kỳ menu nào của app cho người dùng con — không cần intersect.
        String contextAppId = accessContext.appId == null ? "" : accessContext.appId.trim().toLowerCase(Locale.ROOT);
        boolean adminHasFullAppScope = !contextAppId.isEmpty() && allowedMenus.stream().anyMatch(m -> {
            String normalized = safeStr(m).toLowerCase(Locale.ROOT).trim();
            return normalized.equals(contextAppId)
                || normalized.equals("app:" + contextAppId)
                || normalized.equals("/" + contextAppId);
        });
        if (adminHasFullAppScope) {
            // Giữ nguyên các menu được yêu cầu (loại bỏ rỗng)
            List<String> safeRequested = new ArrayList<>();
            for (String m : resolvedMenus) {
                String v = safeStr(m).trim();
                if (!v.isEmpty()) safeRequested.add(v);
            }
            objUpdate.put("menusPermissions", safeRequested);
        } else {
            objUpdate.put("menusPermissions", intersectPreserveOrder(resolvedMenus, allowedMenus));
        }

        objUpdate.put("dataScope", minDataScope(safeStr(objUpdate.get("dataScope")), accessContext.dataScope));

        if (!requestedPreset.isBlank()) {
            List<String> finalPermissions = toStringList(objUpdate.get("permissions"));
            List<String> finalMenus = toStringList(objUpdate.get("menusPermissions"));
            boolean presetOutOfParent = !isSubsetCaseInsensitive(presetPermissions, finalPermissions)
                || !isSubsetCaseInsensitive(presetMenus, finalMenus);
            if (presetOutOfParent) {
                objUpdate.put("permissionPreset", "");
            }
        }
    }

    private boolean hasPermissionMutationPayload(Map<String, Object> objUpdate) {
        if (objUpdate == null || objUpdate.isEmpty()) {
            return false;
        }
        return objUpdate.containsKey("group_id")
            || objUpdate.containsKey("permissionGroups")
            || objUpdate.containsKey("permissions")
            || objUpdate.containsKey("menusPermissions")
            || objUpdate.containsKey("permissionsAdd")
            || objUpdate.containsKey("permissionsDeny")
            || objUpdate.containsKey("menusPermissionsAdd")
            || objUpdate.containsKey("menusPermissionsDeny")
            || objUpdate.containsKey("dataScope");
    }

    private void normalizeManagedSubUserPermissions(Map<String, Object> objUpdate, UserAccessContext accessContext) {
        if (objUpdate == null || accessContext == null) {
            return;
        }

        if (accessContext.preferredOwner != null && !accessContext.preferredOwner.isBlank()) {
            objUpdate.put("parent_account_id", accessContext.preferredOwner);
        }
        if (accessContext.appId != null && !accessContext.appId.isBlank()) {
            objUpdate.put("app_id", accessContext.appId);
        }

        List<String> permissionGroups = toStringList(objUpdate.get("permissionGroups"));
        String groupId = safeStr(objUpdate.get("group_id"));
        if (!groupId.isBlank()) {
            permissionGroups = mergeUniqueCaseInsensitive(permissionGroups, List.of(groupId));
            objUpdate.put("permissionGroups", permissionGroups);
        }

        List<String> groupedPermissions = new ArrayList<>();
        List<String> groupedMenus = new ArrayList<>();
        for (String groupRef : permissionGroups) {
            Map<String, Object> roleRecord = findRoleRecordByCodeOrId(accessContext.appId, groupRef);
            if (roleRecord == null || roleRecord.isEmpty()) {
                continue;
            }
            groupedPermissions = mergeUniqueCaseInsensitive(groupedPermissions, toStringList(roleRecord.get("permissions")));
            groupedMenus = mergeUniqueCaseInsensitive(groupedMenus, toStringList(roleRecord.get("menusPermissions")));
        }

        List<String> requestedPermissions = toStringList(objUpdate.get("permissions"));
        List<String> requestedMenus = toStringList(objUpdate.get("menusPermissions"));
        String requestedPreset = safeStr(objUpdate.get("permissionPreset"));
        List<String> presetPermissions = presetPermissions(requestedPreset);
        List<String> presetMenus = presetMenus(requestedPreset);
        if (requestedPermissions.isEmpty() && !presetPermissions.isEmpty()) {
            requestedPermissions = new ArrayList<>(presetPermissions);
        }
        if (requestedMenus.isEmpty() && !presetMenus.isEmpty()) {
            requestedMenus = new ArrayList<>(presetMenus);
        }
        List<String> permissionsAdd = toStringList(objUpdate.get("permissionsAdd"));
        List<String> permissionsDeny = toStringList(objUpdate.get("permissionsDeny"));
        List<String> menusAdd = toStringList(objUpdate.get("menusPermissionsAdd"));
        List<String> menusDeny = toStringList(objUpdate.get("menusPermissionsDeny"));

        List<String> basePermissions = (!permissionGroups.isEmpty() && !groupedPermissions.isEmpty()) ? groupedPermissions : requestedPermissions;
        List<String> baseMenus = (!permissionGroups.isEmpty() && !groupedMenus.isEmpty()) ? groupedMenus : requestedMenus;

        List<String> resolvedPermissions = mergeUniqueCaseInsensitive(basePermissions, permissionsAdd);
        resolvedPermissions = subtractCaseInsensitive(resolvedPermissions, permissionsDeny);
        resolvedPermissions = subtractCaseInsensitive(resolvedPermissions, List.of("admin", "dev"));

        List<String> resolvedMenus = mergeUniqueCaseInsensitive(baseMenus, menusAdd);
        resolvedMenus = subtractCaseInsensitive(resolvedMenus, menusDeny);

        List<String> allowedPermissions = accessContext.permissions == null ? Collections.emptyList() : accessContext.permissions;
        List<String> allowedMenus = accessContext.menusPermissions == null ? Collections.emptyList() : accessContext.menusPermissions;

        if (!accessContext.isDev) {
            resolvedPermissions = intersectPreserveOrder(resolvedPermissions, allowedPermissions);

            String contextAppId = accessContext.appId == null ? "" : accessContext.appId.trim().toLowerCase(Locale.ROOT);
            boolean ownerHasLegacyFullApp = !contextAppId.isEmpty() && allowedMenus.stream().anyMatch(m -> {
                String normalized = safeStr(m).toLowerCase(Locale.ROOT).trim();
                return normalized.equals(contextAppId)
                    || normalized.equals("app:" + contextAppId)
                    || normalized.equals("/" + contextAppId);
            });

            if (!ownerHasLegacyFullApp) {
                resolvedMenus = intersectPreserveOrder(resolvedMenus, allowedMenus);
            }
        }

        String requestedScope = safeStr(objUpdate.get("dataScope"));
        String clampedScope = minDataScope(requestedScope, accessContext.dataScope);
        resolvedPermissions = applyScopeToken(resolvedPermissions, clampedScope);

        if (resolvedPermissions.isEmpty()) {
            resolvedPermissions = new ArrayList<>(List.of("view", "scope:owner"));
            clampedScope = "OWNER";
        }

        objUpdate.put("permissions", resolvedPermissions);
        objUpdate.put("menusPermissions", resolvedMenus);
        objUpdate.put("dataScope", clampedScope);

        if (!requestedPreset.isBlank()) {
            List<String> finalPermissions = toStringList(objUpdate.get("permissions"));
            List<String> finalMenus = toStringList(objUpdate.get("menusPermissions"));
            boolean presetOutOfParent = !isSubsetCaseInsensitive(presetPermissions, finalPermissions)
                || !isSubsetCaseInsensitive(presetMenus, finalMenus);
            if (presetOutOfParent) {
                objUpdate.put("permissionPreset", "");
            }
        }
    }

    /**
     * For csm_accounts (dev creating main account):
     * Auto-encrypt pass and generate app_token if not already set.
     */
    private void autoGenerateAccountCredentials(Map<String, Object> objUpdate, UserAccessContext accessContext) {
        String loginId = safeStr(objUpdate.get("username"));
        if (loginId.isEmpty()) loginId = safeStr(objUpdate.get("email"));
        if (loginId.isEmpty()) return;

        if (!accessContext.isDev && accessContext.appId != null && !accessContext.appId.isBlank()) {
            objUpdate.put("app_id", accessContext.appId);
        }

        // Auto-encrypt pass (dung helper chong double-encryption)
        ensurePassEncrypted("csm_accounts", objUpdate, Collections.emptyList());

        // Auto-generate app_token if not already set
        String existingToken = safeStr(objUpdate.get("app_token"));
        if (existingToken.isEmpty()) {
            try {
                String effectiveAppId = safeStr(objUpdate.get("app_id"));
                if (effectiveAppId.isEmpty()) effectiveAppId = accessContext.appId != null ? accessContext.appId : "csm";
                @SuppressWarnings("unchecked")
                List<String> rolesList = (objUpdate.get("roles") instanceof List) ? (List<String>) objUpdate.get("roles") : null;
                String role = (rolesList != null && !rolesList.isEmpty()) ? String.valueOf(rolesList.get(0)) : "admin";
                String rawToken = AppTokenHelper.buildRawToken(effectiveAppId, loginId, role, AppTokenHelper.resolveAccessRight(role));
                String generatedToken = recordManager.csm_encrypt(rawToken);
                objUpdate.put("app_token", generatedToken);
                if (!objUpdate.containsKey("refresh") || safeStr(objUpdate.get("refresh")).isEmpty()) {
                    objUpdate.put("refresh", generatedToken);
                }
                if (!objUpdate.containsKey("app_id") || safeStr(objUpdate.get("app_id")).isEmpty()) {
                    objUpdate.put("app_id", effectiveAppId);
                }
            } catch (Exception e) {
                logger.warn("[autoGenerateAccountCredentials] Failed to generate app_token: {}", e.getMessage());
            }
        }
    }

    /**
     * For csm_group_members (admin creating sub-user):
     * Auto-encrypt pass and generate app_token from admin's context.
     */
    private void autoGenerateSubUserCredentials(Map<String, Object> objUpdate, UserAccessContext accessContext) {
        // Auto-set parent_account_id if not set
        if (safeStr(objUpdate.get("parent_account_id")).isEmpty() && accessContext.appId != null) {
            objUpdate.put("parent_account_id", accessContext.appId);
        }

        String loginId = safeStr(objUpdate.get("login_identifier"));
        if (loginId.isEmpty()) return;

        // Auto-encrypt pass (dung helper chong double-encryption)
        ensurePassEncrypted("csm_group_members", objUpdate, Collections.emptyList());

        // Auto-generate app_token if not already set
        String existingToken = safeStr(objUpdate.get("app_token"));
        if (existingToken.isEmpty()) {
            try {
                String effectiveAppId = accessContext.appId != null ? accessContext.appId : "csm";
                String rawToken = AppTokenHelper.buildRawToken(effectiveAppId, loginId, "user", AppTokenHelper.resolveAccessRight("user"));
                String generatedToken = recordManager.csm_encrypt(rawToken);
                objUpdate.put("app_token", generatedToken);
                if (!objUpdate.containsKey("refresh") || safeStr(objUpdate.get("refresh")).isEmpty()) {
                    objUpdate.put("refresh", generatedToken);
                }
            } catch (Exception e) {
                logger.warn("[autoGenerateSubUserCredentials] Failed to generate app_token: {}", e.getMessage());
            }
        }

        // Auto-set app_id from context if not set
        if (safeStr(objUpdate.get("app_id")).isEmpty() && accessContext.appId != null) {
            objUpdate.put("app_id", accessContext.appId);
        }

        // Canonical profile/session fields for csm_group_members
        if (safeStr(objUpdate.get("username")).isEmpty()) {
            objUpdate.put("username", loginId);
        }
        if (safeStr(objUpdate.get("email")).isEmpty()) {
            objUpdate.put("email", loginId);
        }
        if (!objUpdate.containsKey("phoneNumber")) {
            objUpdate.put("phoneNumber", "");
        }
        if (safeStr(objUpdate.get("full_name")).isEmpty()) {
            objUpdate.put("full_name", loginId);
        }
        if (!objUpdate.containsKey("user_address")) {
            objUpdate.put("user_address", "");
        }
        if (!objUpdate.containsKey("avatar")) {
            objUpdate.put("avatar", "");
        }
        if (!objUpdate.containsKey("group_rights")) {
            objUpdate.put("group_rights", new ArrayList<>());
        }
        if (!objUpdate.containsKey("source_app_token")) {
            objUpdate.put("source_app_token", "");
        }

        String appToken = safeStr(objUpdate.get("app_token"));
        String refresh = safeStr(objUpdate.get("refresh"));
        String refreshToken = safeStr(objUpdate.get("refresh_token"));
        if (refreshToken.isEmpty()) {
            refreshToken = !refresh.isEmpty() ? refresh : appToken;
            objUpdate.put("refresh_token", refreshToken);
        }
        if (refresh.isEmpty()) {
            objUpdate.put("refresh", refreshToken);
        }
        if (!objUpdate.containsKey("refresh_token_ip")) {
            objUpdate.put("refresh_token_ip", "");
        }
        if (!objUpdate.containsKey("refresh_token_ua")) {
            objUpdate.put("refresh_token_ua", "");
        }
        if (!objUpdate.containsKey("refresh_token_expiry")) {
            objUpdate.put("refresh_token_expiry", 0L);
        }
        if (!objUpdate.containsKey("login_version")) {
            objUpdate.put("login_version", 0);
        }
        if (!objUpdate.containsKey("loginVersion")) {
            objUpdate.put("loginVersion", objUpdate.get("login_version"));
        }
        if (!objUpdate.containsKey("actived")) {
            objUpdate.put("actived", true);
        }
        if (!objUpdate.containsKey("permissions")) {
            objUpdate.put("permissions", new ArrayList<>());
        }
        if (!objUpdate.containsKey("menusPermissions")) {
            objUpdate.put("menusPermissions", new ArrayList<>());
        }
        if (!objUpdate.containsKey("permissionsAdd")) {
            objUpdate.put("permissionsAdd", new ArrayList<>());
        }
        if (!objUpdate.containsKey("permissionsDeny")) {
            objUpdate.put("permissionsDeny", new ArrayList<>());
        }
        if (!objUpdate.containsKey("menusPermissionsAdd")) {
            objUpdate.put("menusPermissionsAdd", new ArrayList<>());
        }
        if (!objUpdate.containsKey("menusPermissionsDeny")) {
            objUpdate.put("menusPermissionsDeny", new ArrayList<>());
        }

        List<String> permissions = toStringList(objUpdate.get("permissions"));
        List<String> menusPermissions = toStringList(objUpdate.get("menusPermissions"));
        long bitfield = PermissionBitfieldUtil.buildBitfield(permissions, menusPermissions, false);
        objUpdate.put("permissionBitfield", PermissionBitfieldUtil.toCompactToken(bitfield));
        objUpdate.put("permissionSchemaVersion", "v3");
        objUpdate.put("dataScope", PermissionBitfieldUtil.resolveDataScope(bitfield));
    }

    private static final class UserAccessContext {
        private final boolean isAdmin;
        private final boolean isDev;
        private final String appId;
        private final Set<String> parentAccountCandidates;
        private final Set<String> ownerCandidates;
        private final Set<String> departmentCandidates;
        private final Set<String> branchCandidates;
        private final String dataScope;
        private final List<String> permissions;
        private final List<String> menusPermissions;
        private final String preferredOwner;
        private final String preferredDepartment;
        private final String preferredBranch;

        private UserAccessContext(
            boolean isAdmin,
            boolean isDev,
            String appId,
            Set<String> parentAccountCandidates,
            Set<String> ownerCandidates,
            Set<String> departmentCandidates,
            Set<String> branchCandidates,
            String dataScope,
            List<String> permissions,
            List<String> menusPermissions
        ) {
            this.isAdmin = isAdmin;
            this.isDev = isDev;
            this.appId = appId;
            this.parentAccountCandidates = parentAccountCandidates != null ? parentAccountCandidates : Collections.emptySet();
            this.ownerCandidates = ownerCandidates != null ? ownerCandidates : Collections.emptySet();
            this.departmentCandidates = departmentCandidates != null ? departmentCandidates : Collections.emptySet();
            this.branchCandidates = branchCandidates != null ? branchCandidates : Collections.emptySet();
            this.dataScope = dataScope != null ? dataScope : "NONE";
            this.permissions = permissions != null ? new ArrayList<>(permissions) : Collections.emptyList();
            this.menusPermissions = menusPermissions != null ? new ArrayList<>(menusPermissions) : Collections.emptyList();
            this.preferredOwner = this.ownerCandidates.stream().findFirst().orElse("");
            this.preferredDepartment = this.departmentCandidates.stream().findFirst().orElse("");
            this.preferredBranch = this.branchCandidates.stream().findFirst().orElse("");
        }
    }

    private Map<String, Object> handleIndexTableOperation(String appId, Map<String, Object> msg, SearchFilter filters, boolean isUpdate, UserAccessContext accessContext) throws Exception {
        Map<String, Object> filterResult = null;
        Integer take = parseIntegerParam(msg.get("take"));
        Integer offset = parseIntegerParam(msg.get("offset"));
        Integer limit = parseIntegerParam(msg.get("limit"));
        Object lastkeyObj = msg.get("lastkey");

        // logger.info("Bảng {} chương trình {} có lọc số dòng {} bắt đầu khoá là{}", "index", appId, takeObj, lastkeyObj);

        if (limit != null && limit > 0) {
            int safeOffset = Math.max(0, offset != null ? offset : 0);
            return recordManager.filterWithOffset(appId, "index", filters, safeOffset, limit);
        }

        if (take != null && take > 0) {
            String lastkey = (lastkeyObj != null) ? lastkeyObj.toString() : null;

            return recordManager.filterWithPagination(appId, "index", filters, take, lastkey);
        } else {
            filterResult = recordManager.filter(appId, "index", filters);
        }

        List<Map<String, Object>> tables = (List<Map<String, Object>>) filterResult.getOrDefault("rows", new ArrayList<>());
    
        if (!isUpdate) {
            List<Map<String, Object>> dataToReturn; // Declare dataToReturn here

            if (tables.size() == 1) {
                Map<String, Object> tableRecord = tables.get(0);
                if (tableRecord != null && tableRecord.containsKey("data")) {
                    Object data = tableRecord.get("data");
                    if (data instanceof List<?>) {
                        List<?> rawList = (List<?>) data;
                        List<Map<String, Object>> safeList = new ArrayList<>();
                        for (Object item : rawList) {
                            if (item instanceof Map) {
                                safeList.add((Map<String, Object>) item);
                            }
                        }
                        dataToReturn = safeList; // Assign to dataToReturn
                    } else {
                        dataToReturn = new ArrayList<>();
                    }                    
                } else {
                    // logger.info("Dữ liệu trên bảng index là {} với điều kiện lọc {}",tableRecord,filters);
                    dataToReturn = new ArrayList<>(); // If no 'data' key or tableRecord is null
                    dataToReturn.add(tableRecord);
                }
            } else {
                dataToReturn = tables; // Assign to dataToReturn
            }

            Map<String, Object> result = new HashMap<>();
            result.put("id", "index");
            result.put("rows", dataToReturn); 
            return result;
        }
    
        String command = msg.getOrDefault("command", "").toString().toLowerCase(Locale.ROOT);

        List<String> pkFields = List.of("id");
        Map<String, Object> primaryKeysAndValues = new HashMap<>();
        Map<String, Object> objUpdate = (Map<String, Object>) msg.get("obj_update");
        if (objUpdate == null) {
            return errorResponse("Thiếu dữ liệu cập nhật");
        }
        if (objUpdate.get("id") != null) {
            SearchFilter queryMapPage = new SearchFilter();
            queryMapPage.setField("id");
            queryMapPage.setType("eq");
            queryMapPage.setValue(objUpdate.get("id"));
            filterResult = recordManager.filter(appId, "index", queryMapPage);
            tables = (List<Map<String, Object>>) filterResult.getOrDefault("rows", new ArrayList<>());
            // For 'index' table, 'id' is the primary key.
            primaryKeysAndValues.put("id", objUpdate.get("id"));
        }
    
        switch (command) {
            case "migrate_permission_tokens":
                if (accessContext == null || !accessContext.isDev) {
                    return errorResponse("Chỉ tài khoản dev được phép chạy migrate_permission_tokens");
                }
                return migratePermissionTokensToLatestSchema(appId, msg);

            case "create": 
                if (objUpdate.get("id") == null || objUpdate.get("id").toString().isBlank()) {
                    return errorResponse("Thiếu giá trị khóa chính 'id'");
                }
                if (recordManager.existsByPrimaryKey(appId, "index", objUpdate, pkFields)) {
                    return errorResponse("Trùng khóa chính (id) cho bảng index");
                }
                if(tables.size()==0)
                {
                    command=recordManager.createRecord(appId, "index", objUpdate, List.of("id"));
                    msg.put("command", command);
                    // 🔥 CRITICAL: Flush pending batch updates to ensure Lucene searcher is refreshed before socket notification
                    recordManager.flushPendingBatchUpdates(appId, "index");
                    // 🔥 CRITICAL: Force commit Lucene index before socket notification
                    try {
                        recordManager.commitLuceneIndex(appId, "index");
                    } catch (IOException e) {
                        logger.error("Error committing Lucene index for index create: {}", e.getMessage());
                    }
                    // Gửi notification với full data
                    socketIOConfig.sendUpdateNotification(appId, "index", "create", primaryKeysAndValues, objUpdate);
                    break;
                }
            case "update":
                for (Map<String, Object> row : tables) {
                    if (Objects.equals(row.get("id"), objUpdate.get("id"))) {
                        row.putAll(objUpdate);
                        command=recordManager.createRecord(appId, "index", row, List.of("id"));
                        // 🔥 CRITICAL: Flush pending batch updates to ensure Lucene searcher is refreshed before socket notification
                        recordManager.flushPendingBatchUpdates(appId, "index");
                        // 🔥 CRITICAL: Force commit Lucene index before socket notification
                        try {
                            recordManager.commitLuceneIndex(appId, "index");
                        } catch (IOException e) {
                            logger.error("Error committing Lucene index for index update: {}", e.getMessage());
                        }
                        // Gửi notification với full updated row
                        socketIOConfig.sendUpdateNotification(appId, "index", "update", extractPrimaryKeyValues(row, pkFields), row);
                        break;
                    }
                }
                msg.put("command", command);
                break;
    
            case "delete":
                for (Map<String, Object> row : tables) {
                    if (Objects.equals(row.get("id"), objUpdate.get("id"))) {
                        recordManager.deleteRecord(appId, "index", row);
                        // 🔥 CRITICAL: Flush pending batch updates to ensure Lucene searcher is refreshed before socket notification
                        recordManager.flushPendingBatchUpdates(appId, "index");
                        // 🔥 CRITICAL: Force commit Lucene index before socket notification
                        try {
                            recordManager.commitLuceneIndex(appId, "index");
                        } catch (IOException e) {
                            logger.error("Error committing Lucene index for index delete: {}", e.getMessage());
                        }
                        // Gửi notification với deleted row data
                        socketIOConfig.sendUpdateNotification(appId, "index", "delete", extractPrimaryKeyValues(row, pkFields), row);
                    }
                }
                msg.put("command", "delete");
                break;
    
            default:
                return errorResponse("Lệnh không hợp lệ cho bảng index");
        }
        return successResponse("Thao tác thành công",msg);
    }

    private Map<String, Object> migratePermissionTokensToLatestSchema(String appId, Map<String, Object> msg) {
        if (!"csm".equals(appId)) {
            return errorResponse("migrate_permission_tokens chỉ áp dụng cho app_id=csm");
        }

        List<String> targetTables = List.of("csm_accounts", "csm_group_members", "csm_roles", "csm_user_depts");
        Map<String, Object> summary = new LinkedHashMap<>();
        SearchFilter allFilter = new SearchFilter();
        allFilter.setField("id");
        allFilter.setType("like");
        allFilter.setValue("");

        int totalRows = 0;
        for (String table : targetTables) {
            Map<String, Object> result = recordManager.filter(appId, table, allFilter);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rows = (List<Map<String, Object>>) result.getOrDefault("rows", new ArrayList<>());
            int count = rows.size();
            totalRows += count;
            if (count > 0) {
                autoFillPermissionSchemaValues(appId, table, rows, true);
            }
            summary.put(table, count);
        }

        Map<String, Object> response = successResponse("Migrate permission tokens thành công", msg);
        response.put("migratedTables", targetTables);
        response.put("tableRowCounts", summary);
        response.put("totalRowsProcessed", totalRows);
        response.put("permissionSchemaVersion", "v3");
        response.put("tokenEncoding", "base36");
        return response;
    }
    
    private Map<String, Object> handleUpdateTableOperation(String appId, String tblname, Map<String, Object> msg, SearchFilter filters, List<String> pkFields) throws Exception {
        List<String> effectivePkFields = (pkFields != null) ? pkFields : Collections.emptyList();
        String command = msg.get("command").toString().toLowerCase(Locale.ROOT);
        Map<String, Object> objUpdate = (Map<String, Object>) msg.get("obj_update");
        if (objUpdate == null) {
            return errorResponse("Thiếu dữ liệu cập nhật");
        }

        UserAccessContext accessContext = resolveCurrentUserAccessContext();
        boolean isSystemUsersTable = "csm_accounts".equals(tblname);
        boolean isAdminNonDev = accessContext.isAdmin && !accessContext.isDev;
        boolean isSubUserTable = "csm_group_members".equals(tblname);

        if (isSubUserTable && !accessContext.isDev) {
            Object parentObj = objUpdate.get("parent_account_id");
            if ("create".equals(command)) {
                // Admin/Sub-user: luôn tự gán parent_account_id theo tài khoản đăng nhập, không cho chọn tay.
                String preferredParent = accessContext.appId;
                if (preferredParent == null || preferredParent.isBlank()) {
                    preferredParent = accessContext.parentAccountCandidates.stream().findFirst().orElse("");
                }
                if (preferredParent == null || preferredParent.isBlank()) {
                    return errorResponse("Không xác định được parent_account_id để tạo sub-user");
                }
                objUpdate.put("parent_account_id", preferredParent);
            } else if (parentObj != null && !String.valueOf(parentObj).isBlank()
                && !containsIdentifierCandidateIgnoreCase(accessContext.parentAccountCandidates, String.valueOf(parentObj))) {
                return errorResponse("Không được chuyển sub-user sang parent_account_id khác");
            }
        }

        boolean enforceAccountAppScope = isSystemUsersTable
            && !accessContext.isDev
            && accessContext.appId != null
            && !accessContext.appId.isBlank();

        if (enforceAccountAppScope) {
            Object targetAppIdObj = objUpdate.get("app_id");
            if ("create".equals(command)) {
                if (targetAppIdObj == null || String.valueOf(targetAppIdObj).isBlank()) {
                    objUpdate.put("app_id", accessContext.appId);
                } else if (!accessContext.appId.equals(String.valueOf(targetAppIdObj))) {
                    return errorResponse("Admin chỉ được tạo người dùng trong app_id của chính mình");
                }
            } else if (targetAppIdObj != null && !String.valueOf(targetAppIdObj).isBlank()
                && !accessContext.appId.equals(String.valueOf(targetAppIdObj))) {
                return errorResponse("Không được chuyển tài khoản sang app_id khác");
            }
        }

        Map<String, Object> filterResult = new HashMap<>();
        List<Map<String, Object>> records = new ArrayList<>();

        Object objUpdateId = objUpdate.get("id");
        boolean hasUpdateId = hasNonBlank(objUpdateId);

        // Ưu tiên query theo id cho update/delete để định vị đúng bản ghi nhanh nhất trên Lucene.
        if (("update".equals(command) || "delete".equals(command)) && hasUpdateId) {
            SearchFilter idFirstFilter = new SearchFilter();
            idFirstFilter.setField("id");
            idFirstFilter.setType("eq");
            idFirstFilter.setValue(objUpdateId);
            filterResult = recordManager.filter(appId, tblname, idFirstFilter);
            records = (List<Map<String, Object>>) filterResult.getOrDefault("rows", new ArrayList<>());
            logger.debug("Primary lookup by id for {}.{} id={} -> {} row(s)", appId, tblname, objUpdateId, records.size());
        }

        // Fallback về filter gốc nếu không có id hoặc lookup theo id không ra dữ liệu.
        if (records.isEmpty()) {
            // Dùng trực tiếp filter() (Lucene) thay vì find() để tránh full-scan RocksDB trên bảng lớn.
            // find() có fallback duyệt toàn bộ bản ghi O(N) khi PK lookup thất bại, gây timeout trên bảng lớn.
            filterResult = recordManager.filter(appId, tblname, filters);
            records = (List<Map<String, Object>>) filterResult.getOrDefault("rows", new ArrayList<>());
        }

        boolean enforceManagedAccountOwnership = isSystemUsersTable && !accessContext.isDev;

        if (enforceAccountAppScope) {
            records = records.stream()
                .filter(row -> accessContext.appId.equals(String.valueOf(row.get("app_id"))))
                .collect(java.util.stream.Collectors.toList());
        }
        final Set<String> managedVisibleIds = enforceManagedAccountOwnership
            ? resolveManagedAccountVisibleIdSet(appId, accessContext)
            : Collections.emptySet();
        if (enforceManagedAccountOwnership) {
            records = records.stream()
                .filter(row -> managedVisibleIds.contains(normalizedIdentity(row.get("id"))))
                .collect(java.util.stream.Collectors.toList());
        }
        if (isSubUserTable && (isAdminNonDev || accessContext.isDev)) {
            records = records.stream()
                .filter(row -> isOwnedSubUserRow(row, accessContext))
                .collect(java.util.stream.Collectors.toList());
        }
        autoFillPermissionSchemaValues(appId, tblname, records, true);
        records = applyDataScopeRowFilter(tblname, records, accessContext);

        // Nếu filter gốc quá chặt, fallback theo identity rút ra từ e_where để tìm lại dòng gốc.
        if (("update".equals(command) || "delete".equals(command)) && records.isEmpty()) {
            SearchFilter identityFallback = buildIdentityFallbackFilter(filters);
            if (identityFallback != null) {
                Map<String, Object> fallbackResult = recordManager.filter(appId, tblname, identityFallback);
                records = (List<Map<String, Object>>) fallbackResult.getOrDefault("rows", new ArrayList<>());
                if (enforceAccountAppScope) {
                    records = records.stream()
                        .filter(row -> accessContext.appId.equals(String.valueOf(row.get("app_id"))))
                        .collect(java.util.stream.Collectors.toList());
                }
                if (enforceManagedAccountOwnership) {
                    records = records.stream()
                        .filter(row -> managedVisibleIds.contains(normalizedIdentity(row.get("id"))))
                        .collect(java.util.stream.Collectors.toList());
                }
                if (isSubUserTable && (isAdminNonDev || accessContext.isDev)) {
                    records = records.stream()
                        .filter(row -> isOwnedSubUserRow(row, accessContext))
                        .collect(java.util.stream.Collectors.toList());
                }
                autoFillPermissionSchemaValues(appId, tblname, records, true);
                records = applyDataScopeRowFilter(tblname, records, accessContext);
                logger.info("Fallback lookup by identity for {}.{} -> {} row(s)", appId, tblname, records.size());
            }
        }

        // Ưu tiên update theo id: nếu e_where quá chặt làm rỗng, fallback query theo id để ghi đè đúng bản ghi.
        if ("update".equals(command) && records.isEmpty() && objUpdate.get("id") != null) {
            SearchFilter idFilter = new SearchFilter();
            idFilter.setField("id");
            idFilter.setType("eq");
            idFilter.setValue(objUpdate.get("id"));
            Map<String, Object> idLookupResult = recordManager.filter(appId, tblname, idFilter);
            records = (List<Map<String, Object>>) idLookupResult.getOrDefault("rows", new ArrayList<>());
            if (enforceAccountAppScope) {
                records = records.stream()
                    .filter(row -> accessContext.appId.equals(String.valueOf(row.get("app_id"))))
                    .collect(java.util.stream.Collectors.toList());
            }
            if (enforceManagedAccountOwnership) {
                records = records.stream()
                    .filter(row -> managedVisibleIds.contains(normalizedIdentity(row.get("id"))))
                    .collect(java.util.stream.Collectors.toList());
            }
            if (isSubUserTable && (isAdminNonDev || accessContext.isDev)) {
                records = records.stream()
                    .filter(row -> isOwnedSubUserRow(row, accessContext))
                    .collect(java.util.stream.Collectors.toList());
            }
            logger.info("Fallback lookup by id for update {}.{} id={} -> {} row(s)", appId, tblname, objUpdate.get("id"), records.size());
        }

        if ("update".equals(command)) {
            Object idObj = objUpdate.get("id");
            if ((idObj == null || String.valueOf(idObj).isBlank()) && records.size() == 1) {
                Object matchedId = records.get(0).get("id");
                if (matchedId != null && !String.valueOf(matchedId).isBlank()) {
                    objUpdate.put("id", matchedId);
                    logger.info("Hydrate obj_update.id from matched record for {}.{}: {}", appId, tblname, matchedId);
                }
            }
        }

        Map<String, Object> primaryKeysAndValues = new HashMap<>();
        logger.info("Kiem tra su kien command {} du lieu {}",command,filterResult);
        // Populate primaryKeysAndValues
        if (!effectivePkFields.isEmpty()) {
            for (String pkField : effectivePkFields) {
                if (objUpdate.containsKey(pkField)) {
                    primaryKeysAndValues.put(pkField, objUpdate.get(pkField));
                }
            }
        }
    
        switch (command) {
            case "create":
                // ✅ Sub-user table: dev/admin/sub-user đều có thể tạo, nhưng parent_account_id
                // sẽ được ép theo tài khoản đăng nhập ở block phía trên.
                if (isSubUserTable && accessContext == null) {
                    return errorResponse("Không xác định được ngữ cảnh người dùng để tạo sub-user");
                }

                // Chặn trùng định danh xuyên bảng user chính/user con.
                String uniqueIdentifierError = validateUniqueUserIdentifiersOnCreate(appId, tblname, objUpdate);
                if (uniqueIdentifierError != null) {
                    return errorResponse(uniqueIdentifierError);
                }

                if (isSystemUsersTable && !hasNonBlank(objUpdate.get("pass"))) {
                    return errorResponse("Thiếu mật khẩu khi tạo tài khoản");
                }
                
                // ✅ Auto-generate encrypted credentials for user account tables
                if (isSystemUsersTable) {
                    normalizeManagedAccountPermissions(objUpdate, accessContext);
                    autoGenerateAccountCredentials(objUpdate, accessContext);
                }
                if (isSubUserTable && (isAdminNonDev || accessContext.isDev)) {
                    normalizeManagedSubUserPermissions(objUpdate, accessContext);
                    autoGenerateSubUserCredentials(objUpdate, accessContext);
                }

                String createGuardError = applyDataScopeCreateGuard(tblname, objUpdate, accessContext);
                if (createGuardError != null) {
                    return errorResponse(createGuardError);
                }
                ensureRowId(objUpdate);
                if (!effectivePkFields.isEmpty() && !hasAnyPrimaryKeyValue(objUpdate, effectivePkFields)) {
                    return errorResponse("Thiếu khóa chính: cần ít nhất 1 trong các trường " + String.join(", ", effectivePkFields));
                }
                if (recordManager.existsByPrimaryKey(appId, tblname, objUpdate, effectivePkFields)) {
                    return errorResponse("Trùng khóa chính khi tạo dữ liệu");
                }
                if (records.isEmpty()) {
                    command = recordManager.createRecord(appId, tblname, objUpdate, effectivePkFields);
                    enqueueServiceInvalidation(appId, tblname, objUpdate);
                    msg.put("command", command);
                    // Gửi full data row để client có thể insert trực tiếp
                    socketIOConfig.sendUpdateNotification(appId, tblname, "create", extractPrimaryKeyValues(objUpdate, effectivePkFields), objUpdate);
                    break;
                } else {
                    // Nếu bản ghi đã tồn tại thì chuyển sang update
                    command = "update"; // Chuyển sang update
                    // Không break -> sẽ chạy tiếp xuống "update"
                }
            case "update":
                // Không cho phép cập nhật sub-user qua bảng csm_accounts (tránh ghi nhầm bảng chính).
                if (isSystemUsersTable) {
                    boolean containsSubUserRow = records.stream()
                        .anyMatch(row -> "user".equalsIgnoreCase(extractRoleFromAppToken(row.get("app_token"))));
                    if (containsSubUserRow) {
                        return errorResponse("Bản ghi này là tài khoản con. Vui lòng cập nhật tại bảng csm_group_members (chế độ sub-user).");
                    }
                }

                // ✅ Validation self-edit cho admin/sub-user (SAU khi records đã hydrate)
                if (isSystemUsersTable && isAdminNonDev && allRowsBelongToCurrentOwner(records, accessContext)) {
                    String selfEditError = validateAdminSelfEditOnRecords("update", objUpdate, records, accessContext);
                    if (selfEditError != null) {
                        return errorResponse(selfEditError);
                    }
                }
                if (isSubUserTable && !isAdminNonDev) {
                    String selfEditError = validateSubUserSelfEditOnRecords("update", objUpdate, records, accessContext);
                    if (selfEditError != null) {
                        return errorResponse(selfEditError);
                    }
                }

                if (isSubUserTable && hasPermissionMutationPayload(objUpdate)) {
                    normalizeManagedSubUserPermissions(objUpdate, accessContext);
                }

                // Ensure child account edits never exceed current user's app and permission/data scope.
                if (isSystemUsersTable && !accessContext.isDev && !allRowsBelongToCurrentOwner(records, accessContext)) {
                    normalizeManagedAccountPermissions(objUpdate, accessContext);
                    autoGenerateAccountCredentials(objUpdate, accessContext);
                }

                // Ma hoa pass cho MOI truong hop update tren bang user/sub-user
                // (ke ca dev tu sua, admin tu sua, hoac admin sua sub-user)
                if (isSystemUsersTable || isSubUserTable) {
                    ensurePassEncrypted(tblname, objUpdate, records);
                }

                Map<String, Object> newPkValues = new HashMap<>();
                for (String pkField : effectivePkFields) {
                    if (objUpdate.containsKey(pkField)) {
                        newPkValues.put(pkField, objUpdate.get(pkField));
                    }
                }
                if (!records.isEmpty()) {
                    for (Map<String, Object> row : records) {
                        // Disallow changing stable id
                        if (objUpdate.containsKey("id") && row.containsKey("id")
                                && !Objects.equals(row.get("id"), objUpdate.get("id"))) {
                            return errorResponse("Không được thay đổi id của bản ghi");
                        }

                        // Luôn thay thế bản ghi theo chiến lược delete + create để đồng bộ khóa/Lucene/socket nhất quán.
                        Map<String, Object> newRow = new HashMap<>(row);
                        newRow.putAll(objUpdate);
                        ensureRowId(newRow);

                        if (!effectivePkFields.isEmpty() && !hasAnyPrimaryKeyValue(newRow, effectivePkFields)) {
                            return errorResponse("Thiếu khóa chính: cần ít nhất 1 trong các trường " + String.join(", ", effectivePkFields));
                        }

                        String oldKey = recordManager.buildPrimaryKeyKey(appId, tblname, row, effectivePkFields);
                        String newKey = recordManager.buildPrimaryKeyKey(appId, tblname, newRow, effectivePkFields);
                        boolean primaryKeyChanged = oldKey != null && newKey != null && !newKey.equals(oldKey);
                        if (primaryKeyChanged && recordManager.existsByPrimaryKey(appId, tblname, newRow, effectivePkFields)) {
                            // FORCE-REPLACE MODE: xóa các bản ghi đang giữ PK mới (khác id hiện tại),
                            // sau đó tạo lại newRow để đảm bảo update theo id luôn thành công.
                            SearchFilter conflictFilter = buildPrimaryKeyFilter(newRow, effectivePkFields);
                            if (conflictFilter != null) {
                                Map<String, Object> conflictRes = recordManager.filter(appId, tblname, conflictFilter);
                                List<Map<String, Object>> conflictRows = (List<Map<String, Object>>) conflictRes.getOrDefault("rows", new ArrayList<>());
                                for (Map<String, Object> conflictRow : conflictRows) {
                                    if (Objects.equals(conflictRow.get("id"), row.get("id"))) {
                                        continue;
                                    }
                                    Map<String, Object> conflictKeys = extractPrimaryKeyValues(conflictRow, effectivePkFields);
                                    recordManager.deleteRecord(appId, tblname, conflictRow);
                                    enqueueServiceInvalidation(appId, tblname, conflictRow);
                                    socketIOConfig.sendUpdateNotification(appId, tblname, "delete", conflictKeys, conflictRow);
                                    logger.warn("Force-replace PK collision: deleted conflicting row id={} table={}", conflictRow.get("id"), tblname);
                                }
                            }
                        }

                        Map<String, Object> oldKeys = extractPrimaryKeyValues(row, effectivePkFields);
                        Map<String, Object> newKeys = extractPrimaryKeyValues(newRow, effectivePkFields);

                        if (primaryKeyChanged) {
                            // Chỉ khi đổi khóa chính mới cần replace bằng delete+create.
                            recordManager.deleteRecord(appId, tblname, row);
                            enqueueServiceInvalidation(appId, tblname, row);
                            socketIOConfig.sendUpdateNotification(appId, tblname, "delete", oldKeys, row);

                            command = recordManager.createRecord(appId, tblname, newRow, effectivePkFields);
                            enqueueServiceInvalidation(appId, tblname, newRow);
                            socketIOConfig.sendUpdateNotification(appId, tblname, "create", newKeys, newRow);
                            msg.put("command", "update");
                            msg.put("updated_row", newRow);
                            msg.put("socket_actions", List.of("delete", "create"));
                        } else {
                            // PK không đổi: cập nhật in-place để nhanh hơn và tránh lệch action phía client.
                            command = recordManager.createRecord(appId, tblname, newRow, effectivePkFields);
                            enqueueServiceInvalidation(appId, tblname, newRow);
                            socketIOConfig.sendUpdateNotification(appId, tblname, "update", newKeys, newRow);
                            msg.put("command", "update");
                            msg.put("updated_row", newRow);
                            msg.put("socket_actions", List.of("update"));
                        }
                    }
                } else {
                    return errorResponse("Không tìm thấy bản ghi để cập nhật");
                }
                break;
    
            case "delete":
                // ✅ Cấm admin/sub-user xóa user
                if ((isSystemUsersTable && isAdminNonDev) || (isSubUserTable && !isAdminNonDev && !accessContext.isDev)) {
                    if (isSystemUsersTable && isAdminNonDev) {
                        return errorResponse("Admin không có quyền xóa người dùng trên bảng csm_accounts");
                    }
                    if (isSubUserTable && !isAdminNonDev && !accessContext.isDev) {
                        return errorResponse("Sub-user không có quyền xóa sub-user trên bảng csm_group_members");
                    }
                }
                
                if (records.isEmpty()) {
                    return errorResponse("Không tìm thấy bản ghi để xóa");
                }
                for (Map<String, Object> row : records) {
                    Map<String, Object> rowPrimaryKeys = extractPrimaryKeyValues(row, effectivePkFields);
                    recordManager.deleteRecord(appId, tblname, row);
                    enqueueServiceInvalidation(appId, tblname, row);
                    // Gửi delete với data row để client biết xóa row nào
                    socketIOConfig.sendUpdateNotification(appId, tblname, "delete", rowPrimaryKeys, row);
                    // Cascade: xóa toàn bộ sub-user thuộc tài khoản này
                    if ("csm_accounts".equals(tblname)) {
                        cascadeDeleteSubUsers(appId, row);
                    }
                }
                msg.put("command", "delete");
                break;
    
            default:
                return errorResponse("Lệnh không hợp lệ");
        }
    
        return successResponse("Thao tác thành công", msg);
    }    

    private String validateUniqueUserIdentifiersOnCreate(String appId, String tableName, Map<String, Object> objUpdate) {
        if (objUpdate == null) {
            return null;
        }
        if (!"csm_accounts".equals(tableName) && !"csm_group_members".equals(tableName)) {
            return null;
        }

        Set<String> identifiers = new LinkedHashSet<>();
        if ("csm_accounts".equals(tableName)) {
            addIdentifierCandidate(identifiers, objUpdate.get("username"));
            addIdentifierCandidate(identifiers, objUpdate.get("email"));
            addIdentifierCandidate(identifiers, objUpdate.get("phoneNumber"));
        } else {
            addIdentifierCandidate(identifiers, objUpdate.get("login_identifier"));
        }

        if (identifiers.isEmpty()) {
            return null;
        }

        for (String identifier : identifiers) {
            if (identifierExistsInSubUsers(appId, identifier)) {
                return "Định danh '" + identifier + "' đã tồn tại trong danh sách người dùng con.";
            }
            if (identifierExistsInMainAccounts(appId, identifier)) {
                return "Định danh '" + identifier + "' đã tồn tại trong danh sách người dùng chính.";
            }
        }
        return null;
    }

    private void addIdentifierCandidate(Set<String> target, Object raw) {
        if (target == null || raw == null) {
            return;
        }
        String value = String.valueOf(raw).trim();
        if (!value.isEmpty()) {
            target.add(value);
        }
    }

    private boolean identifierExistsInSubUsers(String appId, String identifier) {
        SearchFilter filter = new SearchFilter();
        filter.setField("login_identifier");
        filter.setType("eq");
        filter.setValue(identifier);
        Map<String, Object> row = recordManager.find(appId, "csm_group_members", filter);
        return row != null && !row.isEmpty();
    }

    private boolean identifierExistsInMainAccounts(String appId, String identifier) {
        String[] fields = new String[] {"username", "email", "phoneNumber"};
        for (String field : fields) {
            SearchFilter filter = new SearchFilter();
            filter.setField(field);
            filter.setType("eq");
            filter.setValue(identifier);
            Map<String, Object> row = recordManager.find(appId, "csm_accounts", filter);
            if (row != null && !row.isEmpty()) {
                return true;
            }
        }
        return false;
    }

        private SearchFilter buildIdentityFallbackFilter(SearchFilter sourceFilter) {
            Map<String, Object> eqValues = new HashMap<>();
            collectEqValues(sourceFilter, eqValues);
            if (eqValues.isEmpty()) {
                return null;
            }

            List<SearchFilter> identityConds = new ArrayList<>();
            String[] preferredIdentityFields = new String[] {"id", "email", "phoneNumber", "username", "login_identifier"};
            for (String field : preferredIdentityFields) {
                Object value = eqValues.get(field);
                if (value == null || String.valueOf(value).isBlank()) {
                    continue;
                }
                SearchFilter cond = new SearchFilter();
                cond.setField(field);
                cond.setType("eq");
                cond.setValue(value);
                identityConds.add(cond);
                // Ưu tiên id hoặc email là đủ mạnh để xác định bản ghi.
                if ("id".equals(field) || "email".equals(field)) {
                    break;
                }
            }

            Object appIdVal = eqValues.get("app_id");
            if (appIdVal != null && !String.valueOf(appIdVal).isBlank()) {
                SearchFilter appScopeCond = new SearchFilter();
                appScopeCond.setField("app_id");
                appScopeCond.setType("eq");
                appScopeCond.setValue(appIdVal);
                identityConds.add(appScopeCond);
            }

            if (identityConds.isEmpty()) {
                return null;
            }
            if (identityConds.size() == 1) {
                return identityConds.get(0);
            }

            SearchFilter fallback = new SearchFilter();
            fallback.setOperator("AND");
            fallback.setConditions(identityConds);
            return fallback;
        }

        private void collectEqValues(SearchFilter filter, Map<String, Object> output) {
            if (filter == null || output == null) {
                return;
            }
            if (filter.getConditions() != null && !filter.getConditions().isEmpty()) {
                for (SearchFilter sub : filter.getConditions()) {
                    collectEqValues(sub, output);
                }
                return;
            }
            if (!"eq".equalsIgnoreCase(filter.getType()) || filter.getField() == null || filter.getField().isBlank()) {
                return;
            }
            output.putIfAbsent(filter.getField(), filter.getValue());
        }
    
    private Map<String, Object> handleSelectTableOperation(String appId, String tblname,Map<String, Object> msg, SearchFilter filters, Map<String, Object> structMap) {
        Map<String, Object> filterResult = null;
        Integer take = parseIntegerParam(msg.get("take"));
        Integer offset = parseIntegerParam(msg.get("offset"));
        Integer limit = parseIntegerParam(msg.get("limit"));
        Object lastkeyObj = msg.get("lastkey");

        if (limit != null && limit > 0) {
            int safeOffset = Math.max(0, offset != null ? offset : 0);
            Map<String, Object> paginated = recordManager.filterWithOffset(appId, tblname, filters, safeOffset, limit);
            Object rowsObj = paginated.get("rows");
            if (rowsObj instanceof List<?>) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> rows = (List<Map<String, Object>>) rowsObj;
                autoFillPermissionSchemaValues(appId, tblname, rows, true);
                rows = filterManagedAccountDescendants(tblname, rows, resolveCurrentUserAccessContext());
                rows = applyDataScopeRowFilter(tblname, rows, resolveCurrentUserAccessContext());
                rows = filterMainAccountRows(tblname, rows);
                decryptPassForDisplay(tblname, rows);
                paginated.put("rows", rows);
            }
            return paginated;
        }
        
        if (take != null && take > 0) {
            String lastkey = (lastkeyObj != null) ? lastkeyObj.toString() : null;
        
            // logger.info("Bảng {} chương trình {} lọc với take = {}, lastkey = {}, full params = {}",
            //             tblname, appId, take, lastkey, msg);
        
            Map<String, Object> paginated = recordManager.filterWithPagination(appId, tblname, filters, take, lastkey);
            Object rowsObj = paginated.get("rows");
            if (rowsObj instanceof List<?>) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> rows = (List<Map<String, Object>>) rowsObj;
                autoFillPermissionSchemaValues(appId, tblname, rows, true);
                rows = filterManagedAccountDescendants(tblname, rows, resolveCurrentUserAccessContext());
                rows = applyDataScopeRowFilter(tblname, rows, resolveCurrentUserAccessContext());
                rows = filterMainAccountRows(tblname, rows);
                decryptPassForDisplay(tblname, rows);
                paginated.put("rows", rows);
            }
            return paginated;
        } else {
            // logger.info("Bảng {} chương trình {} dùng filter thường, params = {}", tblname, appId, msg);
            filterResult = recordManager.filter(appId, tblname, filters);
        }
             
        List<Map<String, Object>> data = (List<Map<String, Object>>) filterResult.getOrDefault("rows", new ArrayList<>());
        autoFillPermissionSchemaValues(appId, tblname, data, true);
        data = filterManagedAccountDescendants(tblname, data, resolveCurrentUserAccessContext());
        data = applyDataScopeRowFilter(tblname, data, resolveCurrentUserAccessContext());
        data = filterMainAccountRows(tblname, data);
        decryptPassForDisplay(tblname, data);
    
        Map<String, Object> result = new HashMap<>();
        result.put("id", tblname);
        result.put("fieldsPK", structMap.get("fieldsPK"));
        result.put("fields", structMap.get("fields"));
        result.put("rows", data);
    
        return result;
    }

    /**
     * Ma hoa truong pass trong objUpdate neu chua duoc ma hoa.
     * Phat hien double-encryption bang cach thu giai ma va kiem tra "_____" separator.
     * Dung chung cho ca create lan update de pass luon duoc luu dung chuan.
     *
     * @param tableName       ten bang ("csm_accounts" hoac "csm_group_members")
     * @param objUpdate       du lieu dang ghi
     * @param existingRecords ban ghi hien co de lay loginId neu objUpdate khong co
     */
    private void ensurePassEncrypted(String tableName, Map<String, Object> objUpdate, List<Map<String, Object>> existingRecords) {
        String passVal = safeStr(objUpdate.get("pass"));
        if (passVal.isEmpty()) return;

        // Kiem tra da ma hoa chua: thu giai ma, neu ket qua chua "_____" thi da ma hoa dung chuan
        try {
            String decrypted = recordManager.csm_decrypt(passVal);
            if (decrypted.contains("_____")) {
                return; // Da ma hoa, khong lam gi them
            }
        } catch (Exception ignored) {
            // Khong giai ma duoc -> la plain text, tiep tuc
        }

        // Lay loginId: uu tien tu objUpdate, fallback sang existing record
        String loginId = "";
        if ("csm_accounts".equals(tableName)) {
            loginId = safeStr(objUpdate.get("username"));
            if (loginId.isEmpty()) loginId = safeStr(objUpdate.get("email"));
            if (loginId.isEmpty() && !existingRecords.isEmpty()) {
                Map<String, Object> first = existingRecords.get(0);
                loginId = safeStr(first.get("username"));
                if (loginId.isEmpty()) loginId = safeStr(first.get("email"));
            }
        } else if ("csm_group_members".equals(tableName)) {
            loginId = safeStr(objUpdate.get("login_identifier"));
            if (loginId.isEmpty() && !existingRecords.isEmpty()) {
                loginId = safeStr(existingRecords.get(0).get("login_identifier"));
            }
        }
        if (loginId.isEmpty()) return;

        try {
            objUpdate.put("pass", recordManager.csm_encrypt(loginId + "_____" + passVal));
        } catch (Exception e) {
            logger.warn("[ensurePassEncrypted] Failed to encrypt pass for {}: {}", tableName, e.getMessage());
        }
    }

    /**
     * Chỉ giữ lại bản ghi user chính cho bảng csm_accounts.
     * Những bản ghi có app_token role=user được xem là sub-user và sẽ không hiển thị ở danh sách user chính.
     */
    private List<Map<String, Object>> filterMainAccountRows(String tableName, List<Map<String, Object>> rows) {
        if (!"csm_accounts".equals(tableName) || rows == null || rows.isEmpty()) {
            return rows;
        }
        return rows.stream()
            .filter(row -> !"user".equalsIgnoreCase(extractRoleFromAppToken(row.get("app_token"))))
            .collect(java.util.stream.Collectors.toList());
    }

    private String extractRoleFromAppToken(Object rawAppToken) {
        if (rawAppToken == null) {
            return "";
        }
        String appToken = String.valueOf(rawAppToken).trim();
        if (appToken.isEmpty()) {
            return "";
        }
        try {
            String decrypted = recordManager.csm_decrypt(appToken);
            String[] parts = decrypted.split("_____");
            if (parts.length < 3) {
                return "";
            }
            return parts[2] == null ? "" : parts[2].trim();
        } catch (Exception ignore) {
            return "";
        }
    }

    /**
     * Giải mã trường pass để hiển thị lên lưới (chỉ áp dụng cho csm_accounts và csm_group_members).
     * Mật khẩu được lưu dạng encrypt(loginId + "_____" + rawPassword);
     * sau khi giải mã sẽ lấy phần sau "_____" để trả về mật khẩu gốc.
     */
    private void decryptPassForDisplay(String tableName, List<Map<String, Object>> rows) {
        if (rows == null || rows.isEmpty()) return;
        if (!"csm_accounts".equals(tableName) && !"csm_group_members".equals(tableName)) return;
        for (Map<String, Object> row : rows) {
            Object pass = row.get("pass");
            if (pass == null || String.valueOf(pass).isBlank()) continue;
            try {
                String decrypted = recordManager.csm_decrypt(String.valueOf(pass));
                int sepIdx = decrypted.indexOf("_____");
                if (sepIdx >= 0) {
                    row.put("pass", decrypted.substring(sepIdx + 5));
                } else {
                    row.put("pass", decrypted);
                }
            } catch (Exception e) {
                // Nếu giải mã thất bại, giữ nguyên giá trị
            }
        }
    }

    /**
     * Xóa cascade tất cả sub-user trong csm_group_members khi xóa tài khoản cha.
     */
    private void cascadeDeleteSubUsers(String appId, Map<String, Object> deletedAccountRow) {
        Set<String> identifiers = new LinkedHashSet<>();
        for (String field : new String[]{"id", "app_id", "username", "email", "phoneNumber"}) {
            Object val = deletedAccountRow.get(field);
            if (val != null && !String.valueOf(val).isBlank()) {
                identifiers.add(String.valueOf(val).trim());
            }
        }
        if (identifiers.isEmpty()) return;

        SearchFilter subUserFilter = buildFieldScopeFilter(identifiers, "parent_account_id");
        if (subUserFilter == null) return;

        try {
            Map<String, Object> subUserResult = recordManager.filter(appId, "csm_group_members", subUserFilter);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> subUsers = (List<Map<String, Object>>) subUserResult.getOrDefault("rows", new ArrayList<>());
            List<String> subUserPkFields = DEFAULT_TABLE_PK_FIELDS.getOrDefault("csm_group_members", List.of("id"));
            for (Map<String, Object> subUser : subUsers) {
                Map<String, Object> subPkValues = extractPrimaryKeyValues(subUser, subUserPkFields);
                recordManager.deleteRecord(appId, "csm_group_members", subUser);
                enqueueServiceInvalidation(appId, "csm_group_members", subUser);
                socketIOConfig.sendUpdateNotification(appId, "csm_group_members", "delete", subPkValues, subUser);
            }
            if (!subUsers.isEmpty()) {
                logger.info("[cascadeDeleteSubUsers] Đã xóa {} sub-user thuộc tài khoản {}", subUsers.size(), deletedAccountRow.get("id"));
            }
        } catch (Exception e) {
            logger.warn("[cascadeDeleteSubUsers] Lỗi khi xóa sub-user cascade cho tài khoản {}: {}", deletedAccountRow.get("id"), e.getMessage());
        }
    }

    private void ensureAutoPermissionSchemaForTable(String appId, String tableName, Map<String, Object> structRecord, Map<String, Object> structMap) {
        if (!"csm".equals(appId) || structRecord == null || structMap == null) {
            return;
        }
        List<String> requiredFields = AUTO_PERMISSION_SCHEMA_FIELDS.get(tableName);
        if (requiredFields == null || requiredFields.isEmpty()) {
            return;
        }

        Object fieldsObj = structMap.get("fields");
        if (!(fieldsObj instanceof List<?> rawFields)) {
            return;
        }

        List<String> fields = new ArrayList<>();
        for (Object item : rawFields) {
            if (item == null) continue;
            fields.add(String.valueOf(item));
        }

        boolean changed = false;
        for (String requiredField : requiredFields) {
            if (!fields.contains(requiredField)) {
                fields.add(requiredField);
                changed = true;
            }
        }

        if (!changed) {
            return;
        }

        structMap.put("fields", fields);
        structRecord.put("struct", structMap);
        recordManager.createRecord(appId, "index", structRecord, List.of("id"));
    }

    private void autoFillPermissionSchemaValues(String appId, String tableName, List<Map<String, Object>> rows, boolean persist) {
        if (!"csm".equals(appId) || rows == null || rows.isEmpty()) {
            return;
        }
        List<String> requiredFields = AUTO_PERMISSION_SCHEMA_FIELDS.get(tableName);
        if (requiredFields == null || requiredFields.isEmpty()) {
            return;
        }

        List<Map<String, Object>> changedRows = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if (row == null) continue;
            boolean changed = false;

            for (String field : requiredFields) {
                if (!row.containsKey(field)) {
                    row.put(field, "");
                    changed = true;
                }
            }

            if ("csm_accounts".equals(tableName) || "csm_group_members".equals(tableName)) {
                List<String> directPermissions = toStringList(row.get("permissions"));
                List<String> directMenus = toStringList(row.get("menusPermissions"));
                List<String> permissionsAdd = toStringList(row.get("permissionsAdd"));
                List<String> permissionsDeny = toStringList(row.get("permissionsDeny"));
                List<String> menusAdd = toStringList(row.get("menusPermissionsAdd"));
                List<String> menusDeny = toStringList(row.get("menusPermissionsDeny"));

                List<String> groupRefs = new ArrayList<>();
                groupRefs.addAll(toStringList(row.get("permissionGroups")));
                String groupId = safeStr(row.get("group_id"));
                if (!groupId.isEmpty()) {
                    groupRefs.add(groupId);
                }

                List<String> groupPermissions = new ArrayList<>();
                List<String> groupMenus = new ArrayList<>();
                String groupScope = "";
                for (String groupRef : groupRefs) {
                    Map<String, Object> roleRecord = findRoleRecordByCodeOrId(appId, groupRef);
                    if (roleRecord.isEmpty()) {
                        continue;
                    }
                    groupPermissions = mergeUniqueCaseInsensitive(groupPermissions, toStringList(roleRecord.get("permissions")));
                    groupMenus = mergeUniqueCaseInsensitive(groupMenus, toStringList(roleRecord.get("menusPermissions")));
                    if (groupScope.isEmpty()) {
                        groupScope = safeStr(roleRecord.get("dataScope"));
                    }
                }

                List<String> effectivePermissions;
                List<String> effectiveMenus;
                if ("csm_group_members".equals(tableName) && !groupPermissions.isEmpty()) {
                    effectivePermissions = new ArrayList<>(groupPermissions);
                    effectiveMenus = new ArrayList<>(groupMenus);
                } else {
                    effectivePermissions = directPermissions.isEmpty() ? new ArrayList<>(groupPermissions) : new ArrayList<>(directPermissions);
                    effectiveMenus = directMenus.isEmpty() ? new ArrayList<>(groupMenus) : new ArrayList<>(directMenus);
                }

                effectivePermissions = mergeUniqueCaseInsensitive(effectivePermissions, permissionsAdd);
                effectivePermissions = subtractCaseInsensitive(effectivePermissions, permissionsDeny);
                effectiveMenus = mergeUniqueCaseInsensitive(effectiveMenus, menusAdd);
                effectiveMenus = subtractCaseInsensitive(effectiveMenus, menusDeny);

                if ("csm_group_members".equals(tableName)) {
                    effectivePermissions = subtractCaseInsensitive(effectivePermissions, List.of("admin", "dev"));
                }

                String selectedScope = safeStr(row.get("dataScope"));
                if (selectedScope.isEmpty()) {
                    selectedScope = groupScope;
                }
                effectivePermissions = applyScopeToken(effectivePermissions, selectedScope);

                boolean dev = extractDevFlagFromAppToken(row.get("app_token"));
                long bitfield = PermissionBitfieldUtil.buildBitfield(effectivePermissions, effectiveMenus, dev);
                String dataScope = normalizeScopeName(selectedScope);
                if ("NONE".equals(dataScope)) {
                    dataScope = PermissionBitfieldUtil.resolveDataScope(bitfield);
                }

                if (!Objects.equals(toStringList(row.get("permissions")), effectivePermissions)) {
                    row.put("permissions", effectivePermissions);
                    changed = true;
                }
                if (!Objects.equals(toStringList(row.get("menusPermissions")), effectiveMenus)) {
                    row.put("menusPermissions", effectiveMenus);
                    changed = true;
                }

                String compactBitfield = PermissionBitfieldUtil.toCompactToken(bitfield);
                if (!Objects.equals(String.valueOf(row.getOrDefault("permissionBitfield", "")), compactBitfield)) {
                    row.put("permissionBitfield", compactBitfield);
                    changed = true;
                }
                if (!Objects.equals(String.valueOf(row.getOrDefault("permissionSchemaVersion", "")), "v3")) {
                    row.put("permissionSchemaVersion", "v3");
                    changed = true;
                }
                if (!Objects.equals(String.valueOf(row.getOrDefault("dataScope", "")), dataScope)) {
                    row.put("dataScope", dataScope);
                    changed = true;
                }

                List<String> beforeSyncPermissions = toStringList(row.get("permissions"));
                List<String> beforeSyncMenus = toStringList(row.get("menusPermissions"));
                String beforeSyncScope = safeStr(row.get("dataScope"));
                syncProjectionFromToken(row, bitfield);
                if (!Objects.equals(beforeSyncPermissions, toStringList(row.get("permissions")))) {
                    changed = true;
                }
                if (!Objects.equals(beforeSyncMenus, toStringList(row.get("menusPermissions")))) {
                    changed = true;
                }
                if (!Objects.equals(beforeSyncScope, safeStr(row.get("dataScope")))) {
                    changed = true;
                }

                if (!hasNonBlank(row.get("department_id")) && hasNonBlank(row.get("dept_id"))) {
                    row.put("department_id", String.valueOf(row.get("dept_id")));
                    changed = true;
                }
                if (!hasNonBlank(row.get("team_id")) && hasNonBlank(row.get("dept_id"))) {
                    row.put("team_id", String.valueOf(row.get("dept_id")));
                    changed = true;
                }
            } else if ("csm_roles".equals(tableName)) {
                List<String> rolePermissions = toStringList(row.get("permissions"));
                List<String> roleMenus = toStringList(row.get("menusPermissions"));
                String roleScope = safeStr(row.get("dataScope"));
                rolePermissions = applyScopeToken(rolePermissions, roleScope);
                long roleBitfield = PermissionBitfieldUtil.buildBitfield(rolePermissions, roleMenus, false);
                String roleDataScope = normalizeScopeName(roleScope);
                if ("NONE".equals(roleDataScope)) {
                    roleDataScope = PermissionBitfieldUtil.resolveDataScope(roleBitfield);
                }

                String compactRoleBitfield = PermissionBitfieldUtil.toCompactToken(roleBitfield);
                if (!Objects.equals(String.valueOf(row.getOrDefault("permissionBitfield", "")), compactRoleBitfield)) {
                    row.put("permissionBitfield", compactRoleBitfield);
                    changed = true;
                }
                if (!Objects.equals(String.valueOf(row.getOrDefault("permissionSchemaVersion", "")), "v3")) {
                    row.put("permissionSchemaVersion", "v3");
                    changed = true;
                }
                if (!Objects.equals(String.valueOf(row.getOrDefault("dataScope", "")), roleDataScope)) {
                    row.put("dataScope", roleDataScope);
                    changed = true;
                }

                List<String> beforeSyncRolePermissions = toStringList(row.get("permissions"));
                List<String> beforeSyncRoleMenus = toStringList(row.get("menusPermissions"));
                String beforeSyncRoleScope = safeStr(row.get("dataScope"));
                syncProjectionFromToken(row, roleBitfield);
                if (!Objects.equals(beforeSyncRolePermissions, toStringList(row.get("permissions")))) {
                    changed = true;
                }
                if (!Objects.equals(beforeSyncRoleMenus, toStringList(row.get("menusPermissions")))) {
                    changed = true;
                }
                if (!Objects.equals(beforeSyncRoleScope, safeStr(row.get("dataScope")))) {
                    changed = true;
                }
            } else if ("csm_user_depts".equals(tableName)) {
                String emptyToken = PermissionBitfieldUtil.toCompactToken(
                    PermissionBitfieldUtil.buildBitfield(Collections.emptyList(), Collections.emptyList(), false)
                );
                String currentTokenRaw = safeStr(row.get("permissionBitfield"));
                Long normalizedParsedToken = hasNonBlank(currentTokenRaw)
                    ? PermissionBitfieldUtil.parseSecurityToken(currentTokenRaw)
                    : null;
                String normalizedToken = normalizedParsedToken == null
                    ? emptyToken
                    : PermissionBitfieldUtil.toCompactToken(normalizedParsedToken);
                if (!Objects.equals(currentTokenRaw, normalizedToken)) {
                    row.put("permissionBitfield", normalizedToken);
                    changed = true;
                }
                if (!Objects.equals(String.valueOf(row.getOrDefault("permissionSchemaVersion", "")), "v3")) {
                    row.put("permissionSchemaVersion", "v3");
                    changed = true;
                }
                if (!hasNonBlank(row.get("dataScope"))) {
                    row.put("dataScope", hasNonBlank(row.get("dept_id")) ? "DEPARTMENT" : "NONE");
                    changed = true;
                }
            }

            if (persist && changed && hasNonBlank(row.get("id"))) {
                changedRows.add(row);
            }
        }
        if (persist && !changedRows.isEmpty()) {
            recordManager.batchUpdateRecords(appId, tableName, changedRows, List.of("id"));
        }
    }

    private boolean extractDevFlagFromAppToken(Object rawAppToken) {
        if (rawAppToken == null) {
            return false;
        }
        String appToken = String.valueOf(rawAppToken).trim();
        if (appToken.isEmpty()) {
            return false;
        }
        try {
            String decrypted = recordManager.csm_decrypt(appToken);
            String[] parts = decrypted.split("_____");
            if (parts.length == 0) {
                return false;
            }
            int accessRight = Integer.parseInt(parts[parts.length - 1].trim());
            return accessRight > 0;
        } catch (Exception ignore) {
            return false;
        }
    }

    private boolean hasNonBlank(Object value) {
        return value != null && !String.valueOf(value).trim().isEmpty();
    }

    private void enqueueServiceInvalidation(String appId, String tableName, Map<String, Object> record) {
        try {
            boolean triggered = WebSpringController.triggerDynamicImmediateInvalidation(appId, tableName, record);
            if (!triggered) {
                logger.debug("Skip immediate cache sync for {}.{} because no matching router/cache mapping was found", appId, tableName);
            }
        } catch (Exception ex) {
            logger.warn("Immediate cache sync failed for {}.{}: {}", appId, tableName, ex.getMessage());
        }
    }

    private static Map<String, Object> successResponse(String message, Map<String, Object> ob) {
        Map<String, Object> response = new HashMap<>();
        response.put("message", message);
        if (ob != null) {
            response.putAll(ob); // Gộp các key-value từ ob vào response
        }
        return response;
    }

    private static Map<String, Object> errorResponse(String message) {
        return new HashMap<String, Object>() {{
            put("success", false);
            put("error", true);
            put("message", message);
        }};
    }

    private void ensureRowId(Map<String, Object> record) {
        Object idVal = record.get("id");
        if (idVal == null || idVal.toString().isBlank()) {
            record.put("id", UUID.randomUUID().toString());
        }
    }

    private List<String> missingPrimaryKeyFields(Map<String, Object> record, List<String> pkFields) {
        if (pkFields == null || pkFields.isEmpty()) {
            return Collections.emptyList();
        }
        List<String> missing = new ArrayList<>();
        for (String pkField : pkFields) {
            Object value = record.get(pkField);
            if (value == null || value.toString().isBlank()) {
                missing.add(pkField);
            }
        }
        return missing;
    }

    private boolean hasAnyPrimaryKeyValue(Map<String, Object> record, List<String> pkFields) {
        if (record == null || pkFields == null || pkFields.isEmpty()) {
            return false;
        }
        for (String pkField : pkFields) {
            if (hasNonBlank(record.get(pkField))) {
                return true;
            }
        }
        return false;
    }

    private Map<String, Object> extractPrimaryKeyValues(Map<String, Object> record, List<String> pkFields) {
        Map<String, Object> values = new HashMap<>();
        if (record == null) {
            return values;
        }
        if (pkFields == null || pkFields.isEmpty()) {
            Object idVal = record.get("id");
            if (idVal != null) {
                values.put("id", idVal);
            }
            return values;
        }
        for (String pkField : pkFields) {
            if (record.containsKey(pkField)) {
                values.put(pkField, record.get(pkField));
            }
        }
        // Always include id if present (stable unique key)
        if (record.containsKey("id") && !values.containsKey("id")) {
            values.put("id", record.get("id"));
        }
        return values;
    }

    private SearchFilter buildPrimaryKeyFilter(Map<String, Object> record, List<String> pkFields) {
        if (pkFields == null || pkFields.isEmpty()) {
            return null;
        }
        for (String pkField : pkFields) {
            Object value = record.get(pkField);
            if (value == null || value.toString().isBlank()) {
                return null;
            }
        }
        if (pkFields.size() == 1) {
            SearchFilter filter = new SearchFilter();
            filter.setField(pkFields.get(0));
            filter.setType("eq");
            filter.setValue(record.get(pkFields.get(0)));
            return filter;
        }
        SearchFilter root = new SearchFilter();
        root.setOperator("AND");
        List<SearchFilter> conditions = new ArrayList<>();
        for (String pkField : pkFields) {
            SearchFilter condition = new SearchFilter();
            condition.setField(pkField);
            condition.setType("eq");
            condition.setValue(record.get(pkField));
            conditions.add(condition);
        }
        root.setConditions(conditions);
        return root;
    }

}