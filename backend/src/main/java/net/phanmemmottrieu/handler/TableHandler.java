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

        response.set("code", 200);
        response.set("message", success ? "ok" : String.valueOf(result.getOrDefault("message", "error")));
        response.set("success", success);
    
        // Gộp tất cả key-value từ result vào response
        for (Map.Entry<String, Object> entry : result.entrySet()) {
            response.set(entry.getKey(), entry.getValue());
        }
    }    

    private Map<String, Object> handleTableOperation(Map<String, Object> msg, boolean isUpdate) {
        try {
            String appId = msg.get("app_id").toString();
            String tblname = msg.get("obj_name").toString();
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
                return handleIndexTableOperation(appId, msg, filtersObjs, isUpdate);
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

    private SearchFilter applyAdminUserListScope(String tableName, SearchFilter existingFilter, boolean isUpdate) {
        if (isUpdate || !"csm_accounts".equals(tableName)) {
            return existingFilter;
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || authentication.getPrincipal() == null ||
            "anonymousUser".equals(authentication.getPrincipal())) {
            return existingFilter;
        }

        Object principal = authentication.getPrincipal();
        List<String> roles = null;
        Boolean dev = false;
        String userAppId = null;

        if (principal instanceof User) {
            User user = (User) principal;
            roles = user.getPermissions();
            dev = user.getDev() != null ? user.getDev() : false;
            userAppId = user.getAppId();
        } else if (principal instanceof Map<?, ?>) {
            Map<?, ?> principalMap = (Map<?, ?>) principal;
            Object rolesObj = principalMap.get("roles");
            if (rolesObj instanceof List<?>) {
                roles = ((List<?>) rolesObj).stream().filter(String.class::isInstance).map(String.class::cast).collect(java.util.stream.Collectors.toList());
            }
            Object devObj = principalMap.get("dev");
            if (devObj instanceof Boolean) {
                dev = (Boolean) devObj;
            }
            Object appIdObj = principalMap.get("app_id");
            if (appIdObj != null) {
                userAppId = String.valueOf(appIdObj);
            }
        }

        boolean isAdmin = roles != null && roles.stream().anyMatch(r -> "admin".equalsIgnoreCase(r));
        if (!isAdmin || Boolean.TRUE.equals(dev) || userAppId == null || userAppId.isBlank()) {
            return existingFilter;
        }

        SearchFilter appScope = new SearchFilter();
        appScope.setField("app_id");
        appScope.setType("eq");
        appScope.setValue(userAppId);

        if (isEmptyFilter(existingFilter)) {
            return appScope;
        }

        SearchFilter merged = new SearchFilter();
        merged.setOperator("AND");
        merged.setConditions(new ArrayList<>(List.of(existingFilter, appScope)));
        return merged;
    }

    private SearchFilter applyAdminSubUserListScope(String tableName, SearchFilter existingFilter, boolean isUpdate) {
        if (isUpdate || !"csm_group_members".equals(tableName)) {
            return existingFilter;
        }

        UserAccessContext access = resolveCurrentUserAccessContext();
        if (!access.isAdmin || access.isDev || access.parentAccountCandidates.isEmpty()) {
            return existingFilter;
        }

        SearchFilter ownerScope = buildParentAccountScopeFilter(access.parentAccountCandidates);
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

    private SearchFilter buildParentAccountScopeFilter(Set<String> parentCandidates) {
        List<SearchFilter> conditions = new ArrayList<>();
        for (String candidate : parentCandidates) {
            if (candidate == null || candidate.isBlank()) continue;
            SearchFilter cond = new SearchFilter();
            cond.setField("parent_account_id");
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

    private boolean isOwnedSubUserRow(Map<String, Object> row, UserAccessContext access) {
        if (row == null || access == null || access.parentAccountCandidates.isEmpty()) {
            return false;
        }
        Object parentObj = row.get("parent_account_id");
        if (parentObj == null) {
            return false;
        }
        String parent = String.valueOf(parentObj);
        return access.parentAccountCandidates.contains(parent);
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
            "description", "roles", "actived", "permissions", "menusPermissions", "group_rights",
            "full_name", "user_address", "app_id", "permissionBitfield", "permissionSchemaVersion", "dataScope",
            "dept_id", "branch_id", "department_id", "team_id"
        ));
        map.put("csm_group_members", List.of(
            "id", "parent_account_id", "login_identifier", "group_id", "app_token", "refresh", "pass", "actived",
            "permissions", "menusPermissions", "permissionBitfield", "permissionSchemaVersion", "dataScope",
            "dept_id", "branch_id", "department_id", "team_id"
        ));
        map.put("routers", List.of("path", "component", "layout", "handle", "children"));
        map.put("index", List.of("id", "struct"));
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
                "NONE"
            );
        }

        Object principal = authentication.getPrincipal();
        List<String> roles = null;
        List<String> menusPermissions = null;
        Boolean dev = false;
        String userAppId = null;
        Set<String> parentCandidates = new HashSet<>();
        Set<String> ownerCandidates = new HashSet<>();
        Set<String> departmentCandidates = new HashSet<>();
        Set<String> branchCandidates = new HashSet<>();

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
            collectCandidate(ownerCandidates, user.getAppId());
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
            collectCandidate(ownerCandidates, principalMap.get("app_id"));

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

        boolean isAdmin = roles != null && roles.stream().anyMatch(r -> "admin".equalsIgnoreCase(r));
        String dataScope = PermissionBitfieldUtil.resolveDataScope(
            PermissionBitfieldUtil.buildBitfield(roles, menusPermissions, dev)
        );
        return new UserAccessContext(
            isAdmin,
            Boolean.TRUE.equals(dev),
            userAppId,
            parentCandidates,
            ownerCandidates,
            departmentCandidates,
            branchCandidates,
            dataScope
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
        if (!(raw instanceof List<?> list)) {
            return Collections.emptyList();
        }
        List<String> out = new ArrayList<>();
        for (Object item : list) {
            if (item == null) continue;
            String value = String.valueOf(item).trim();
            if (!value.isBlank()) {
                out.add(value);
            }
        }
        return out;
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
            String dataScope
        ) {
            this.isAdmin = isAdmin;
            this.isDev = isDev;
            this.appId = appId;
            this.parentAccountCandidates = parentAccountCandidates != null ? parentAccountCandidates : Collections.emptySet();
            this.ownerCandidates = ownerCandidates != null ? ownerCandidates : Collections.emptySet();
            this.departmentCandidates = departmentCandidates != null ? departmentCandidates : Collections.emptySet();
            this.branchCandidates = branchCandidates != null ? branchCandidates : Collections.emptySet();
            this.dataScope = dataScope != null ? dataScope : "NONE";
            this.preferredOwner = this.ownerCandidates.stream().findFirst().orElse("");
            this.preferredDepartment = this.departmentCandidates.stream().findFirst().orElse("");
            this.preferredBranch = this.branchCandidates.stream().findFirst().orElse("");
        }
    }

    private Map<String, Object> handleIndexTableOperation(String appId, Map<String, Object> msg, SearchFilter filters, boolean isUpdate) throws Exception {
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

        // Admin (non-dev) không được thao tác ghi trên bảng user hệ thống.
        // Họ chỉ nên quản lý sub-user ở bảng/luồng riêng.
        if (isSystemUsersTable && isAdminNonDev) {
            return errorResponse("Admin không có quyền thêm/sửa/xóa trên bảng user hệ thống (csm_accounts)");
        }

        if (isSubUserTable && isAdminNonDev) {
            Object parentObj = objUpdate.get("parent_account_id");
            if ("create".equals(command)) {
                if (parentObj == null || String.valueOf(parentObj).isBlank()) {
                    String preferredParent = accessContext.appId;
                    if (preferredParent == null || preferredParent.isBlank()) {
                        preferredParent = accessContext.parentAccountCandidates.stream().findFirst().orElse("");
                    }
                    if (preferredParent == null || preferredParent.isBlank()) {
                        return errorResponse("Không xác định được parent_account_id để tạo sub-user");
                    }
                    objUpdate.put("parent_account_id", preferredParent);
                } else if (!accessContext.parentAccountCandidates.contains(String.valueOf(parentObj))) {
                    return errorResponse("Admin chỉ được tạo sub-user thuộc tài khoản của chính mình");
                }
            } else if (parentObj != null && !String.valueOf(parentObj).isBlank()
                && !accessContext.parentAccountCandidates.contains(String.valueOf(parentObj))) {
                return errorResponse("Không được chuyển sub-user sang parent_account_id khác");
            }
        }

        boolean enforceAccountAppScope = isSystemUsersTable
            && accessContext.isAdmin
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

        // Với update/delete, ưu tiên tìm đúng 1 bản ghi theo e_where trước (nhanh và ổn định hơn).
        if ("update".equals(command) || "delete".equals(command)) {
            Map<String, Object> foundRecord = recordManager.find(appId, tblname, filters);
            if (foundRecord != null && !foundRecord.isEmpty()) {
                records.add(foundRecord);
            }
        }

        // Fallback về filter khi không tìm được bản ghi đơn hoặc với luồng create.
        if (records.isEmpty()) {
            filterResult = recordManager.filter(appId, tblname, filters);
            records = (List<Map<String, Object>>) filterResult.getOrDefault("rows", new ArrayList<>());
        } else {
            filterResult.put("rows", records);
            filterResult.put("totalCount", (long) records.size());
        }

        if (enforceAccountAppScope) {
            records = records.stream()
                .filter(row -> accessContext.appId.equals(String.valueOf(row.get("app_id"))))
                .collect(java.util.stream.Collectors.toList());
        }
        if (isSubUserTable && isAdminNonDev) {
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
                if (isSubUserTable && isAdminNonDev) {
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
            if (isSubUserTable && isAdminNonDev) {
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
                String createGuardError = applyDataScopeCreateGuard(tblname, objUpdate, accessContext);
                if (createGuardError != null) {
                    return errorResponse(createGuardError);
                }
                if (!hasNonBlank(objUpdate.get("id"))) {
                    return errorResponse("Thiếu id khi tạo mới dữ liệu");
                }
                List<String> missingCreatePk = missingPrimaryKeyFields(objUpdate, effectivePkFields);
                if (!missingCreatePk.isEmpty()) {
                    return errorResponse("Thiếu khóa chính: " + String.join(", ", missingCreatePk));
                }
                if (recordManager.existsByPrimaryKey(appId, tblname, objUpdate, effectivePkFields)) {
                    return errorResponse("Trùng khóa chính khi tạo dữ liệu");
                }
                if (records.isEmpty()) {
                    command = recordManager.createRecord(appId, tblname, objUpdate, effectivePkFields);
                    enqueueServiceInvalidation(appId, tblname, objUpdate);
                    msg.put("command", command);
                    // 🔥 CRITICAL: Flush pending batch updates to ensure Lucene searcher is refreshed before socket notification
                    recordManager.flushPendingBatchUpdates(appId, tblname);
                    // 🔥 CRITICAL: Force commit Lucene index before socket notification
                    try {
                        recordManager.commitLuceneIndex(appId, tblname);
                    } catch (IOException e) {
                        logger.error("Error committing Lucene index for create: {}", e.getMessage());
                    }
                    // Gửi full data row để client có thể insert trực tiếp
                    socketIOConfig.sendUpdateNotification(appId, tblname, "create", extractPrimaryKeyValues(objUpdate, effectivePkFields), objUpdate);
                    break;
                } else {
                    // Nếu bản ghi đã tồn tại thì chuyển sang update
                    command = "update"; // Chuyển sang update
                    // Không break -> sẽ chạy tiếp xuống "update"
                }
            case "update":
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

                        if (!effectivePkFields.isEmpty()) {
                            List<String> missingPk = missingPrimaryKeyFields(newRow, effectivePkFields);
                            if (!missingPk.isEmpty()) {
                                return errorResponse("Thiếu khóa chính: " + String.join(", ", missingPk));
                            }
                        }

                        String oldKey = recordManager.buildPrimaryKeyKey(appId, tblname, row, effectivePkFields);
                        String newKey = recordManager.buildPrimaryKeyKey(appId, tblname, newRow, effectivePkFields);
                        if (newKey != null && !newKey.equals(oldKey) && recordManager.existsByPrimaryKey(appId, tblname, newRow, effectivePkFields)) {
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

                        recordManager.deleteRecord(appId, tblname, row);
                        enqueueServiceInvalidation(appId, tblname, row);
                        socketIOConfig.sendUpdateNotification(appId, tblname, "delete", oldKeys, row);

                        command = recordManager.createRecord(appId, tblname, newRow, effectivePkFields);
                        enqueueServiceInvalidation(appId, tblname, newRow);

                        // 🔥 CRITICAL: Flush + commit Lucene trước khi broadcast bản ghi mới
                        recordManager.flushPendingBatchUpdates(appId, tblname);
                        try {
                            recordManager.commitLuceneIndex(appId, tblname);
                        } catch (IOException e) {
                            logger.error("Error committing Lucene index for replace-update: {}", e.getMessage());
                        }

                        // Gửi create cho row mới để client insert/reconcile nhất quán
                        socketIOConfig.sendUpdateNotification(appId, tblname, "create", newKeys, newRow);
                        msg.put("command", "update");
                        msg.put("updated_row", newRow);
                        msg.put("socket_actions", List.of("delete", "create"));
                    }
                } else if (!newPkValues.isEmpty() && newPkValues.keySet().containsAll(effectivePkFields)) {
                    // Trường hợp upsert (không tìm thấy bản ghi nhưng đủ khóa chính)
                    if (!hasNonBlank(objUpdate.get("id"))) {
                        return errorResponse("Thiếu id khi tạo mới dữ liệu");
                    }
                    if (recordManager.existsByPrimaryKey(appId, tblname, objUpdate, effectivePkFields)) {
                        SearchFilter conflictFilter = buildPrimaryKeyFilter(objUpdate, effectivePkFields);
                        if (conflictFilter != null) {
                            Map<String, Object> conflictRes = recordManager.filter(appId, tblname, conflictFilter);
                            List<Map<String, Object>> conflictRows = (List<Map<String, Object>>) conflictRes.getOrDefault("rows", new ArrayList<>());
                            for (Map<String, Object> conflictRow : conflictRows) {
                                Map<String, Object> conflictKeys = extractPrimaryKeyValues(conflictRow, effectivePkFields);
                                recordManager.deleteRecord(appId, tblname, conflictRow);
                                enqueueServiceInvalidation(appId, tblname, conflictRow);
                                socketIOConfig.sendUpdateNotification(appId, tblname, "delete", conflictKeys, conflictRow);
                                logger.warn("Force-replace upsert collision: deleted row id={} table={}", conflictRow.get("id"), tblname);
                            }
                        }
                    }
                    command = recordManager.createRecord(appId, tblname, objUpdate, effectivePkFields);
                    enqueueServiceInvalidation(appId, tblname, objUpdate);
                    msg.put("command", command);
                    // 🔥 CRITICAL: Flush pending batch updates to ensure Lucene searcher is refreshed before socket notification
                    recordManager.flushPendingBatchUpdates(appId, tblname);
                    // 🔥 CRITICAL: Force commit Lucene index before socket notification
                    try {
                        recordManager.commitLuceneIndex(appId, tblname);
                    } catch (IOException e) {
                        logger.error("Error committing Lucene index for upsert: {}", e.getMessage());
                    }
                    // Gửi create với full data
                    socketIOConfig.sendUpdateNotification(appId, tblname, "create", extractPrimaryKeyValues(objUpdate, effectivePkFields), objUpdate);
                    msg.put("updated_row", objUpdate);
                    msg.put("socket_actions", List.of("create"));
                } else {
                    return errorResponse("Không tìm thấy bản ghi để cập nhật");
                }
                break;
    
            case "delete":
                if (records.isEmpty()) {
                    return errorResponse("Không tìm thấy bản ghi để xóa");
                }
                for (Map<String, Object> row : records) {
                    Map<String, Object> rowPrimaryKeys = extractPrimaryKeyValues(row, effectivePkFields);
                    recordManager.deleteRecord(appId, tblname, row);
                    enqueueServiceInvalidation(appId, tblname, row);
                    // 🔥 CRITICAL: Flush pending batch updates to ensure Lucene searcher is refreshed before socket notification
                    recordManager.flushPendingBatchUpdates(appId, tblname);
                    // 🔥 CRITICAL: Force commit Lucene index before socket notification
                    try {
                        recordManager.commitLuceneIndex(appId, tblname);
                    } catch (IOException e) {
                        logger.error("Error committing Lucene index for delete: {}", e.getMessage());
                    }
                    // Gửi delete với data row để client biết xóa row nào
                    socketIOConfig.sendUpdateNotification(appId, tblname, "delete", rowPrimaryKeys, row);
                }
                msg.put("command", "delete");
                break;
    
            default:
                return errorResponse("Lệnh không hợp lệ");
        }
    
        return successResponse("Thao tác thành công", msg);
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
                rows = applyDataScopeRowFilter(tblname, rows, resolveCurrentUserAccessContext());
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
                rows = applyDataScopeRowFilter(tblname, rows, resolveCurrentUserAccessContext());
                paginated.put("rows", rows);
            }
            return paginated;
        } else {
            // logger.info("Bảng {} chương trình {} dùng filter thường, params = {}", tblname, appId, msg);
            filterResult = recordManager.filter(appId, tblname, filters);
        }
             
        List<Map<String, Object>> data = (List<Map<String, Object>>) filterResult.getOrDefault("rows", new ArrayList<>());
        autoFillPermissionSchemaValues(appId, tblname, data, true);
        data = applyDataScopeRowFilter(tblname, data, resolveCurrentUserAccessContext());
    
        Map<String, Object> result = new HashMap<>();
        result.put("id", tblname);
        result.put("fieldsPK", structMap.get("fieldsPK"));
        result.put("fields", structMap.get("fields"));
        result.put("rows", data);
    
        return result;
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
                List<String> permissions = toStringList(row.get("permissions"));
                List<String> menusPermissions = toStringList(row.get("menusPermissions"));
                boolean dev = extractDevFlagFromAppToken(row.get("app_token"));
                long bitfield = PermissionBitfieldUtil.buildBitfield(permissions, menusPermissions, dev);
                String dataScope = PermissionBitfieldUtil.resolveDataScope(bitfield);

                if (!Objects.equals(String.valueOf(row.getOrDefault("permissionBitfield", "")), String.valueOf(bitfield))) {
                    row.put("permissionBitfield", String.valueOf(bitfield));
                    changed = true;
                }
                if (!Objects.equals(String.valueOf(row.getOrDefault("permissionSchemaVersion", "")), "v2")) {
                    row.put("permissionSchemaVersion", "v2");
                    changed = true;
                }
                if (!Objects.equals(String.valueOf(row.getOrDefault("dataScope", "")), dataScope)) {
                    row.put("dataScope", dataScope);
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
                if (!hasNonBlank(row.get("permissionBitfield"))) {
                    row.put("permissionBitfield", "0");
                    changed = true;
                }
                if (!Objects.equals(String.valueOf(row.getOrDefault("permissionSchemaVersion", "")), "v2")) {
                    row.put("permissionSchemaVersion", "v2");
                    changed = true;
                }
                if (!hasNonBlank(row.get("dataScope"))) {
                    row.put("dataScope", "NONE");
                    changed = true;
                }
            } else if ("csm_user_depts".equals(tableName)) {
                if (!hasNonBlank(row.get("permissionBitfield"))) {
                    row.put("permissionBitfield", "0");
                    changed = true;
                }
                if (!Objects.equals(String.valueOf(row.getOrDefault("permissionSchemaVersion", "")), "v2")) {
                    row.put("permissionSchemaVersion", "v2");
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