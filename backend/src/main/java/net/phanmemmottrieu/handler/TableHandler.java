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
    
        response.set("success", true);
        response.set("message", "Đã tạo xong cấu trúc");
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

            if (findStruct == null) return errorResponse("Không tìm thấy cấu trúc bảng");

            Map<String, Object> structMap = (Map<String, Object>) findStruct.get("struct");
            List<String> primaryKeyFields = (List<String>) structMap.get("fieldsPK");
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

    private UserAccessContext resolveCurrentUserAccessContext() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || authentication.getPrincipal() == null ||
            "anonymousUser".equals(authentication.getPrincipal())) {
            return new UserAccessContext(false, false, null, Collections.emptySet());
        }

        Object principal = authentication.getPrincipal();
        List<String> roles = null;
        Boolean dev = false;
        String userAppId = null;
        Set<String> parentCandidates = new HashSet<>();

        if (principal instanceof User) {
            User user = (User) principal;
            roles = user.getPermissions();
            dev = user.getDev() != null ? user.getDev() : false;
            userAppId = user.getAppId();
            if (user.getId() != null && !user.getId().isBlank()) parentCandidates.add(user.getId());
            if (user.getAppId() != null && !user.getAppId().isBlank()) parentCandidates.add(user.getAppId());
            if (user.getUsername() != null && !user.getUsername().isBlank()) parentCandidates.add(user.getUsername());
            if (user.getEmail() != null && !user.getEmail().isBlank()) parentCandidates.add(user.getEmail());
            if (user.getPhoneNumber() != null && !user.getPhoneNumber().isBlank()) parentCandidates.add(user.getPhoneNumber());
        } else if (principal instanceof Map<?, ?>) {
            Map<?, ?> principalMap = (Map<?, ?>) principal;
            Object rolesObj = principalMap.get("roles");
            if (rolesObj instanceof List<?>) {
                roles = ((List<?>) rolesObj).stream()
                    .filter(String.class::isInstance)
                    .map(String.class::cast)
                    .collect(java.util.stream.Collectors.toList());
            }
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
        }

        boolean isAdmin = roles != null && roles.stream().anyMatch(r -> "admin".equalsIgnoreCase(r));
        return new UserAccessContext(isAdmin, Boolean.TRUE.equals(dev), userAppId, parentCandidates);
    }

    private static final class UserAccessContext {
        private final boolean isAdmin;
        private final boolean isDev;
        private final String appId;
        private final Set<String> parentAccountCandidates;

        private UserAccessContext(boolean isAdmin, boolean isDev, String appId, Set<String> parentAccountCandidates) {
            this.isAdmin = isAdmin;
            this.isDev = isDev;
            this.appId = appId;
            this.parentAccountCandidates = parentAccountCandidates != null ? parentAccountCandidates : Collections.emptySet();
        }
    }

    private Map<String, Object> handleIndexTableOperation(String appId, Map<String, Object> msg, SearchFilter filters, boolean isUpdate) throws Exception {
        Map<String, Object> filterResult = null;
        Object takeObj = msg.get("take");
        Object lastkeyObj = msg.get("lastkey");

        // logger.info("Bảng {} chương trình {} có lọc số dòng {} bắt đầu khoá là{}", "index", appId, takeObj, lastkeyObj);

        if (takeObj instanceof Number) {
            int take = ((Number) takeObj).intValue();
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

        Map<String, Object> filterResult = recordManager.filter(appId, tblname, filters);
        List<Map<String, Object>> records = (List<Map<String, Object>>) filterResult.getOrDefault("rows", new ArrayList<>());

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
                ensureRowId(objUpdate);
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
                    ensureRowId(objUpdate);
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
                }
                break;
    
            case "delete":
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
    
    private Map<String, Object> handleSelectTableOperation(String appId, String tblname,Map<String, Object> msg, SearchFilter filters, Map<String, Object> structMap) {
        Map<String, Object> filterResult = null;
        Object takeObj = msg.get("take");
        Object lastkeyObj = msg.get("lastkey");
        
        if (takeObj instanceof Number) {
            int take = ((Number) takeObj).intValue();  // hỗ trợ Integer, Long, Double, v.v.
            String lastkey = (lastkeyObj != null) ? lastkeyObj.toString() : null;
        
            // logger.info("Bảng {} chương trình {} lọc với take = {}, lastkey = {}, full params = {}",
            //             tblname, appId, take, lastkey, msg);
        
            return recordManager.filterWithPagination(appId, tblname, filters, take, lastkey);
        } else {
            // logger.info("Bảng {} chương trình {} dùng filter thường, params = {}", tblname, appId, msg);
            filterResult = recordManager.filter(appId, tblname, filters);
        }
             
        List<Map<String, Object>> data = (List<Map<String, Object>>) filterResult.getOrDefault("rows", new ArrayList<>());
    
        Map<String, Object> result = new HashMap<>();
        result.put("id", tblname);
        result.put("fieldsPK", structMap.get("fieldsPK"));
        result.put("fields", structMap.get("fields"));
        result.put("rows", data);
    
        return result;
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