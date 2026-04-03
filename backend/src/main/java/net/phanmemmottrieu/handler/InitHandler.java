package net.phanmemmottrieu.handler;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.data.SearchFilter;
import net.phanmemmottrieu.model.StandardResponse;
import net.phanmemmottrieu.util.AppTokenHelper;
import net.phanmemmottrieu.util.PermissionBitfieldUtil;

@Component
public class InitHandler {
        private static final int system = 100; // Add this line to define the 'system' variable
        private final RecordManager recordManager; // Khai báo một trường để giữ instance của RecordManager

        // Sử dụng Dependency Injection thông qua Constructor
        @Autowired // Đánh dấu constructor này để Spring tự động tiêm RecordManager vào
        public InitHandler(RecordManager recordManager) {
                this.recordManager = recordManager;
        }

        public void handleCreateDefaultData(StandardResponse response) {
                try {
                        // Initialize roleList
                        List<Map<String, Object>> roleList = new ArrayList<>();
                        Map<String, Object> role1 = new HashMap<>();
                        role1.put("createTime", 1729752330782L);
                        role1.put("updateTime", 1729752330782L);
                        role1.put("id", UUID.randomUUID().toString());
                        role1.put("name", "超级管理员");
                        role1.put("code", "admin");
                        role1.put("status", 1);
                        role1.put("remark", "超级管理员拥有最高权限");
                        roleList.add(role1);

                        Map<String, Object> role2 = new HashMap<>();
                        role2.put("createTime", 1729752330782L);
                        role2.put("updateTime", 1729752330782L);
                        role2.put("id", UUID.randomUUID().toString());
                        role2.put("name", "普通角色");
                        role2.put("code", "common");
                        role2.put("status", 1);
                        role2.put("remark", "普通角色拥有部分权限");
                        roleList.add(role2);
                        // RecordManager.deleteRocksDB("csm", "index");
                        recordManager.createRecord("csm", "index", Map.of("id", "roleList", "data", roleList),
                                        List.of("id"));

                        // Initialize systemMenu
                        List<Map<String, Object>> systemMenu = new ArrayList<>();
                        Map<String, Object> menu1 = new HashMap<>();
                        menu1.put("id", UUID.randomUUID().toString());
                        menu1.put("menuType", 0);
                        menu1.put("name", "common.menu.system");
                        systemMenu.add(menu1);

                        Map<String, Object> menu2 = new HashMap<>();
                        menu2.put("parentId", menu1.get("id"));
                        menu2.put("id", UUID.randomUUID().toString());
                        menu2.put("menuType", 0);
                        menu2.put("name", "common.menu.user");
                        systemMenu.add(menu2);

                        Map<String, Object> menu3 = new HashMap<>();
                        menu3.put("parentId", menu1.get("id"));
                        menu3.put("id", UUID.randomUUID().toString());
                        menu3.put("menuType", 0);
                        menu3.put("name", "common.menu.role");
                        systemMenu.add(menu3);

                        Map<String, Object> menu4 = new HashMap<>();
                        menu4.put("parentId", menu1.get("id"));
                        menu4.put("id", UUID.randomUUID().toString());
                        menu4.put("menuType", 0);
                        menu4.put("name", "common.menu.menu");
                        systemMenu.add(menu4);

                        Map<String, Object> menu5 = new HashMap<>();
                        menu5.put("parentId", menu1.get("id"));
                        menu5.put("id", UUID.randomUUID().toString());
                        menu5.put("menuType", 0);
                        menu5.put("name", "common.menu.dept");
                        systemMenu.add(menu5);

                        Map<String, Object> menu6 = new HashMap<>();
                        menu6.put("parentId", menu4.get("id"));
                        menu6.put("id", UUID.randomUUID().toString());
                        menu6.put("menuType", 3);
                        menu6.put("name", "common.add");
                        systemMenu.add(menu6);

                        Map<String, Object> menu7 = new HashMap<>();
                        menu7.put("parentId", menu4.get("id"));
                        menu7.put("id", UUID.randomUUID().toString());
                        menu7.put("menuType", 3);
                        menu7.put("name", "common.edit");
                        systemMenu.add(menu7);

                        Map<String, Object> menu8 = new HashMap<>();
                        menu8.put("parentId", menu4.get("id"));
                        menu8.put("id", UUID.randomUUID().toString());
                        menu8.put("menuType", 3);
                        menu8.put("name", "common.delete");
                        systemMenu.add(menu8);
                        recordManager.createRecord("csm", "index", Map.of("id", "menuR", "data", systemMenu),
                                        List.of("id"));

                        // Initialize menuList
                        List<Map<String, Object>> menuList = new ArrayList<>();
                        Map<String, Object> menuList1 = new HashMap<>();
                        menuList1.put("parentId", "");
                        menuList1.put("id", "system"); // Fixed ID for System menu
                        menuList1.put("menuType", 0);
                        menuList1.put("name", "common.menu.system");
                        menuList1.put("label", "common.menu.system");
                        menuList1.put("path", "/system");
                        menuList1.put("component", "/system");
                        menuList1.put("order", system);
                        menuList1.put("icon", "SettingOutlined");
                        menuList1.put("currentActiveMenu", "");
                        menuList1.put("iframeLink", "");
                        menuList1.put("keepAlive", true);
                        menuList1.put("externalLink", "");
                        menuList1.put("hideInMenu", false);
                        menuList1.put("ignoreAccess", false);
                        menuList1.put("status", 1);
                        menuList1.put("createTime", 1737023155965L);
                        menuList1.put("updateTime", 1737023164653L);
                        menuList.add(menuList1);

                        // Menu con của System - Theo thứ tự đúng như system.ts
                        // 1. User
                        Map<String, Object> menuList2 = new HashMap<>();
                        menuList2.put("parentId", menuList1.get("id"));
                        menuList2.put("id", UUID.randomUUID().toString());
                        menuList2.put("menuType", 0);
                        menuList2.put("name", "common.menu.user");
                        menuList2.put("label", "common.menu.user");
                        menuList2.put("path", "/system/user");
                        menuList2.put("component", "/system/user");
                        menuList2.put("order", null);
                        menuList2.put("icon", "UserOutlined");
                        menuList2.put("currentActiveMenu", "");
                        menuList2.put("iframeLink", "");
                        menuList2.put("keepAlive", true);
                        menuList2.put("externalLink", "");
                        menuList2.put("hideInMenu", false);
                        menuList2.put("ignoreAccess", false);
                        menuList2.put("status", 1);
                        menuList2.put("createTime", 1737023155965L);
                        menuList2.put("updateTime", 1737023164653L);
                        menuList2.put("type_form", 1);
                        menuList2.put("row_type_edit", 0);
                        menuList2.put("g_readonly", false);
                        menuList2.put("table_name", "csm_accounts");
                        menuList2.put("table", buildSystemAccountFields());
                        menuList2.put("trigger", Map.of("beforeSave", buildMainAccountBeforeSaveScript()));
                        menuList2.put("system_user_modes", buildSystemUserModes());
                        menuList.add(menuList2);

                        // 2. Role
                        Map<String, Object> menuList3 = new HashMap<>();
                        menuList3.put("parentId", menuList1.get("id"));
                        menuList3.put("id", UUID.randomUUID().toString());
                        menuList3.put("menuType", 0);
                        menuList3.put("name", "common.menu.role");
                        menuList3.put("label", "common.menu.role");
                        menuList3.put("path", "/system/role");
                        menuList3.put("component", "/system/role");
                        menuList3.put("order", null);
                        menuList3.put("icon", "TeamOutlined");
                        menuList3.put("currentActiveMenu", "");
                        menuList3.put("iframeLink", "");
                        menuList3.put("keepAlive", true);
                        menuList3.put("externalLink", "");
                        menuList3.put("hideInMenu", false);
                        menuList3.put("ignoreAccess", false);
                        menuList3.put("status", 1);
                        menuList3.put("createTime", 1737023155965L);
                        menuList3.put("updateTime", 1737023164653L);
                        menuList.add(menuList3);

                        // 3. Menu
                        Map<String, Object> menuList4 = new HashMap<>();
                        menuList4.put("parentId", menuList1.get("id"));
                        menuList4.put("id", UUID.randomUUID().toString());
                        menuList4.put("menuType", 0);
                        menuList4.put("name", "common.menu.menu");
                        menuList4.put("label", "common.menu.menu");
                        menuList4.put("path", "/system/menu");
                        menuList4.put("component", "/system/menu");
                        menuList4.put("order", null);
                        menuList4.put("icon", "MenuOutlined");
                        menuList4.put("currentActiveMenu", "");
                        menuList4.put("iframeLink", "");
                        menuList4.put("keepAlive", true);
                        menuList4.put("externalLink", "");
                        menuList4.put("hideInMenu", false);
                        menuList4.put("ignoreAccess", false);
                        menuList4.put("status", 1);
                        menuList4.put("createTime", 1737023155965L);
                        menuList4.put("updateTime", 1737023164653L);
                        menuList.add(menuList4);

                        // 4. Developer
                        Map<String, Object> menuListDeveloper = new HashMap<>();
                        menuListDeveloper.put("parentId", menuList1.get("id"));
                        menuListDeveloper.put("id", UUID.randomUUID().toString());
                        menuListDeveloper.put("menuType", 0);
                        menuListDeveloper.put("name", "common.menu.developer");
                        menuListDeveloper.put("label", "common.menu.developer");
                        menuListDeveloper.put("path", "/system/developer");
                        menuListDeveloper.put("component", "/system/developer");
                        menuListDeveloper.put("order", null);
                        menuListDeveloper.put("icon", "CodeOutlined");
                        menuListDeveloper.put("currentActiveMenu", "");
                        menuListDeveloper.put("iframeLink", "");
                        menuListDeveloper.put("keepAlive", true);
                        menuListDeveloper.put("externalLink", "");
                        menuListDeveloper.put("hideInMenu", false);
                        menuListDeveloper.put("ignoreAccess", false);
                        menuListDeveloper.put("status", 1);
                        menuListDeveloper.put("createTime", 1737023155965L);
                        menuListDeveloper.put("updateTime", 1737023164653L);
                        menuList.add(menuListDeveloper);

                        // 5. Dept
                        Map<String, Object> menuList5 = new HashMap<>();
                        menuList5.put("parentId", menuList1.get("id"));
                        menuList5.put("id", UUID.randomUUID().toString());
                        menuList5.put("menuType", 0);
                        menuList5.put("name", "common.menu.dept");
                        menuList5.put("label", "common.menu.dept");
                        menuList5.put("path", "/system/dept");
                        menuList5.put("component", "/system/dept");
                        menuList5.put("order", null);
                        menuList5.put("icon", "ApartmentOutlined");
                        menuList5.put("currentActiveMenu", "");
                        menuList5.put("iframeLink", "");
                        menuList5.put("keepAlive", true);
                        menuList5.put("externalLink", "");
                        menuList5.put("hideInMenu", false);
                        menuList5.put("ignoreAccess", false);
                        menuList5.put("status", 1);
                        menuList5.put("createTime", 1737023155965L);
                        menuList5.put("updateTime", 1737023164653L);
                        menuList.add(menuList5);

                        // Thêm menu từ hệ thống cũ
                        // Menu: 01.19. Điều Hướng Trang (Routers)
                        Map<String, Object> menuList6 = new HashMap<>();
                        menuList6.put("parentId", "");
                        menuList6.put("id", UUID.randomUUID().toString());
                        menuList6.put("menuType", 0);
                        menuList6.put("name", "01.19. Điều Hướng Trang");
                        menuList6.put("label", "01.19. Điều Hướng Trang");
                        menuList6.put("path", "/routers");
                        menuList6.put("component", "/routers");
                        menuList6.put("order", 2);
                        menuList6.put("icon", "RouteOutlined");
                        menuList6.put("currentActiveMenu", "");
                        menuList6.put("iframeLink", "");
                        menuList6.put("keepAlive", true);
                        menuList6.put("externalLink", "");
                        menuList6.put("hideInMenu", false);
                        menuList6.put("ignoreAccess", false);
                        menuList6.put("status", 1);
                        menuList6.put("createTime", 1737023155965L);
                        menuList6.put("updateTime", 1737023164653L);
                        menuList.add(menuList6);

                        // Menu: 01.20. Chương Trình (Apps)
                        Map<String, Object> menuList7 = new HashMap<>();
                        menuList7.put("parentId", "");
                        menuList7.put("id", UUID.randomUUID().toString());
                        menuList7.put("menuType", 0);
                        menuList7.put("name", "01.20. Chương Trình");
                        menuList7.put("label", "01.20. Chương Trình");
                        menuList7.put("path", "/apps");
                        menuList7.put("component", "/apps");
                        menuList7.put("order", 3);
                        menuList7.put("icon", "BuildOutlined");
                        menuList7.put("currentActiveMenu", "");
                        menuList7.put("iframeLink", "");
                        menuList7.put("keepAlive", true);
                        menuList7.put("externalLink", "");
                        menuList7.put("hideInMenu", false);
                        menuList7.put("ignoreAccess", false);
                        menuList7.put("status", 1);
                        menuList7.put("createTime", 1737023155965L);
                        menuList7.put("updateTime", 1737023164653L);
                        menuList.add(menuList7);

                        // Menu: 01.21. React Native (Components)
                        Map<String, Object> menuList8 = new HashMap<>();
                        menuList8.put("parentId", "");
                        menuList8.put("id", UUID.randomUUID().toString());
                        menuList8.put("menuType", 0);
                        menuList8.put("name", "01.21. React Native");
                        menuList8.put("label", "01.21. React Native");
                        menuList8.put("path", "/react-native");
                        menuList8.put("component", "/react-native");
                        menuList8.put("order", 4);
                        menuList8.put("icon", "ReactOutlined");
                        menuList8.put("currentActiveMenu", "");
                        menuList8.put("iframeLink", "");
                        menuList8.put("keepAlive", true);
                        menuList8.put("externalLink", "");
                        menuList8.put("hideInMenu", false);
                        menuList8.put("ignoreAccess", false);
                        menuList8.put("status", 1);
                        menuList8.put("createTime", 1737023155965L);
                        menuList8.put("updateTime", 1737023164653L);
                        menuList.add(menuList8);

                        recordManager.createRecord("csm", "index", Map.of("id", "menu", "data", menuList),
                                        List.of("id"));

                        // Initialize notifications
                        List<Map<String, Object>> notifications = Arrays.asList(
                                        new HashMap<>(Map.of(
                                                        "id", UUID.randomUUID().toString(),
                                                        "avatar", "https://avatar.vercel.sh/vercel.svg?text=VC",
                                                        "date", "3 小时前",
                                                        "isRead", true,
                                                        "message", "描述信息描述信息描述信息",
                                                        "title", "收到了 14 份新周报")),
                                        new HashMap<>(Map.of(
                                                        "id", UUID.randomUUID().toString(),
                                                        "avatar", "https://avatar.vercel.sh/1",
                                                        "date", "刚刚",
                                                        "isRead", false,
                                                        "message", "描述信息描述信息描述信息",
                                                        "title", "Tom 回复了你")),
                                        new HashMap<>(Map.of(
                                                        "id", UUID.randomUUID().toString(),
                                                        "avatar", "https://avatar.vercel.sh/2",
                                                        "date", "2024-10-10",
                                                        "isRead", false,
                                                        "message", "描述信息描述信息描述信息",
                                                        "title", "Jack 评论了你")),
                                        new HashMap<>(Map.of(
                                                        "id", UUID.randomUUID().toString(),
                                                        "avatar", "https://avatar.vercel.sh/Jack",
                                                        "date", "1 天前",
                                                        "isRead", false,
                                                        "message", "描述信息描述信息描述信息",
                                                        "title", "代办提醒")));
                        recordManager.createRecord("csm", "index", Map.of("id", "notifications", "data", notifications),
                                        List.of("id"));

                        // Initialize asyncRoutes
                        List<Map<String, Object>> asyncRoutes = new ArrayList<>();

                        Map<String, Object> systemRoute = new HashMap<>();
                        systemRoute.put("id", UUID.randomUUID().toString());
                        systemRoute.put("path", "/system");
                        systemRoute.put("component", "/system");
                        Map<String, Object> systemHandle = new HashMap<>();
                        systemHandle.put("icon", "SettingOutlined");
                        systemHandle.put("title", "common.menu.system");
                        systemHandle.put("order", system);
                        systemRoute.put("handle", systemHandle);
                        List<Map<String, Object>> systemChildren = new ArrayList<>();
                        
                        // 1. User
                        Map<String, Object> userRoute = new HashMap<>();
                        userRoute.put("path", "/system/user");
                        userRoute.put("component", "/system/user");
                        Map<String, Object> userHandle = new HashMap<>();
                        userHandle.put("icon", "UserOutlined");
                        userHandle.put("title", "common.menu.user");
                        userHandle.put("roles", List.of("admin"));
                        userHandle.put("permissions", List.of("permission:button:add", "permission:button:update", "permission:button:delete"));
                        userRoute.put("handle", userHandle);
                        systemChildren.add(userRoute);
                        
                        // 2. Role
                        Map<String, Object> roleRoute = new HashMap<>();
                        roleRoute.put("path", "/system/role");
                        roleRoute.put("component", "/system/role");
                        Map<String, Object> roleHandle = new HashMap<>();
                        roleHandle.put("icon", "TeamOutlined");
                        roleHandle.put("title", "common.menu.role");
                        roleHandle.put("roles", List.of("admin"));
                        roleHandle.put("permissions", List.of("permission:button:add", "permission:button:update", "permission:button:delete"));
                        roleRoute.put("handle", roleHandle);
                        systemChildren.add(roleRoute);
                        
                        // 3. Menu
                        Map<String, Object> menuRoute = new HashMap<>();
                        menuRoute.put("path", "/system/menu");
                        menuRoute.put("component", "/system/menu");
                        Map<String, Object> menuHandle = new HashMap<>();
                        menuHandle.put("icon", "MenuOutlined");
                        menuHandle.put("title", "common.menu.menu");
                        menuHandle.put("roles", List.of("admin"));
                        menuHandle.put("permissions", List.of("permission:button:add", "permission:button:update", "permission:button:delete"));
                        menuRoute.put("handle", menuHandle);
                        systemChildren.add(menuRoute);
                        
                        // 4. Developer
                        Map<String, Object> devRoute = new HashMap<>();
                        devRoute.put("path", "/system/developer");
                        devRoute.put("component", "/system/developer");
                        Map<String, Object> devHandle = new HashMap<>();
                        devHandle.put("icon", "CodeOutlined");
                        devHandle.put("title", "common.menu.developer");
                        devHandle.put("roles", List.of("admin"));
                        devHandle.put("permissions", List.of("permission:button:add", "permission:button:update", "permission:button:delete"));
                        devRoute.put("handle", devHandle);
                        systemChildren.add(devRoute);
                        
                        // 5. Dept
                        Map<String, Object> deptRoute = new HashMap<>();
                        deptRoute.put("path", "/system/dept");
                        deptRoute.put("component", "/system/dept");
                        Map<String, Object> deptHandle = new HashMap<>();
                        deptHandle.put("keepAlive", false);
                        deptHandle.put("icon", "ApartmentOutlined");
                        deptHandle.put("title", "common.menu.dept");
                        deptHandle.put("roles", List.of("admin"));
                        deptHandle.put("permissions", List.of("permission:button:add", "permission:button:update", "permission:button:delete"));
                        deptRoute.put("handle", deptHandle);
                        systemChildren.add(deptRoute);
                        
                        systemRoute.put("children", systemChildren);
                        asyncRoutes.add(systemRoute);
                        
                        recordManager.createRecord("csm", "index", Map.of("id", "accessRights", "data", asyncRoutes),
                                        List.of("id"));

                        // Initialize permission system tables
                        initializeDataTables("csm", "csm_depts",
                                        List.of("id", "dept_code"), List.of(
                                                        "id", "parent_dept_id", "dept_code", "dept_name", "dept_full_name",
                                                        "description", "manager_user_id", "is_global", "status", "create_time", "update_time"));
                        initializeDataTables("csm", "csm_roles",
                                        List.of("id", "role_code"), List.of(
                                                        "id", "role_code", "role_name", "is_global", "department_id",
                                                        "description", "status", "permissionBitfield", "permissionSchemaVersion", "dataScope",
                                                        "create_time", "update_time"));
                        initializeDataTables("csm", "csm_permissions",
                                        List.of("id", "permission_code"), List.of(
                                                        "id", "permission_code", "permission_name", "resource", "action",
                                                        "description", "category", "create_time"));
                        initializeDataTables("csm", "csm_role_permissions",
                                        List.of("id", "role_id", "permission_id"), List.of(
                                                        "id", "role_id", "permission_id", "create_time"));
                        initializeDataTables("csm", "csm_user_depts",
                                        List.of("id", "user_id", "dept_id"), List.of(
                                                        "id", "user_id", "dept_id", "is_sub_user", "role_id", "direct_permissions",
                                                        "permissionBitfield", "permissionSchemaVersion", "dataScope",
                                                        "branch_id", "status", "join_date", "create_time"));
                        initializeDataTables("csm", "csm_user_roles",
                                        List.of("id", "user_id", "role_id"), List.of(
                                                        "id", "user_id", "role_id", "create_time"));

                        // 🔒 SCHEMA-ONLY INITIALIZATION for user tables (schemaOnly=true)
                        // chỉ khởi tạo schema LẦN ĐẦU, không khởi tạo lại dữ liệu
                        // initializeDataTables() sẽ check xem schema đã tồn tại hay chưa trước khi tạo
                        boolean isUserSchemaFirstInit = initializeUserTableSchemas();

                        initializeDataTables("csm", "routers", List.of("path"),
                                        List.of("path", "component", "layout", "handle", "children"));
                        initializeDataTables("csm", "index", List.of("id"), List.of("id", "struct"));

                        String defaultAppId = "csm";

                        // ⚠️ ONLY create admin/common users on first schema initialization
                        // Lần khởi động tiếp theo: schema đã tồn tại → skip user creation
                        org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger(InitHandler.class);
                        if (!isUserSchemaFirstInit) {
                                logger.info("ℹ️ User tables already initialized, skipping default user creation");
                        } else {
                                logger.info("🔓 First-time initialization: creating default admin/common users...");
                                
                        Map<String, Object> adminAccount = new HashMap<>();
                        adminAccount.put("id", UUID.randomUUID().toString());
                        adminAccount.put("username", "admin");
                        adminAccount.put("email", null);

                        // Mật khẩu đã mã hóa: dùng username làm key mã hóa (vì đăng nhập bằng username)
                        String passAdmin = recordManager.csm_encrypt("admin_____" + "123456789admin");
                        adminAccount.put("pass", passAdmin);

                        // TẠO app_token THEO NGUYÊN TẮC MỚI: dùng adminEmail làm định danh chính trong
                        // token
                        String adminAppTokenRawData = AppTokenHelper.buildRawToken(
                                        defaultAppId,
                                        "admin",
                                        "admin",
                                        AppTokenHelper.resolveAccessRight("admin"));
                        String adminAppToken = recordManager.csm_encrypt(adminAppTokenRawData);

                        adminAccount.put("app_token", adminAppToken);
                        adminAccount.put("refresh", adminAppToken);

                        adminAccount.put("avatar", "https://avatars.githubusercontent.com/u/47056890");
                        adminAccount.put("phoneNumber", null);
                        adminAccount.put("description", "manager");
                        adminAccount.put("roles", List.of("admin"));

                        adminAccount.put("actived", true);
                        adminAccount.put("permissions", List.of("admin"));
                        adminAccount.put("menusPermissions", List.of("dashboard", "users", "settings"));
                        long adminBitfield = PermissionBitfieldUtil.buildBitfield(
                                        (List<String>) adminAccount.get("permissions"),
                                        (List<String>) adminAccount.get("menusPermissions"),
                                        true);
                        adminAccount.put("permissionBitfield", PermissionBitfieldUtil.toCompactToken(adminBitfield));
                        adminAccount.put("permissionSchemaVersion", "v3");
                        adminAccount.put("dataScope", PermissionBitfieldUtil.resolveDataScope(adminBitfield));
                        adminAccount.put("dept_id", "ROOT");
                        adminAccount.put("branch_id", "MAIN");
                        adminAccount.put("department_id", "ROOT");
                        adminAccount.put("team_id", "ROOT");
                        adminAccount.put("group_rights", new ArrayList<>());
                        adminAccount.put("full_name", "Admin User");
                        adminAccount.put("user_address", "Admin Address");
                        adminAccount.put("app_id", defaultAppId);

                        recordManager.createRecord("csm", "csm_accounts", adminAccount, List.of("email", "username", "phoneNumber", "app_id","app_token", "id"));

                        // 3. Đồng bộ tạo tài khoản Common
                        Map<String, Object> commonAccount = new HashMap<>();
                        commonAccount.put("id", UUID.randomUUID().toString());
                        commonAccount.put("username", "common");
                        commonAccount.put("email", null);

                        // Mật khẩu đã mã hóa: dùng username làm key mã hóa (vì đăng nhập bằng username)
                        String passCommon = recordManager.csm_encrypt("common_____" + "123456789common");
                        commonAccount.put("pass", passCommon);

                        // TẠO app_token THEO NGUYÊN TẮC MỚI: dùng commonEmail làm định danh chính trong
                        // token
                        String commonAppTokenRawData = AppTokenHelper.buildRawToken(
                                        defaultAppId,
                                        "common",
                                        "user",
                                        AppTokenHelper.resolveAccessRight("user"));
                        String commonAppToken = recordManager.csm_encrypt(commonAppTokenRawData);

                        commonAccount.put("app_token", commonAppToken);
                        commonAccount.put("refresh", commonAppToken);

                        commonAccount.put("avatar", "https://avatar.vercel.sh/avatar.svg?text=Common");
                        commonAccount.put("phoneNumber", null);
                        commonAccount.put("description", "employee");
                        commonAccount.put("roles", List.of("common"));

                        commonAccount.put("actived", true);
                        commonAccount.put("permissions", List.of("user"));
                        commonAccount.put("menusPermissions", List.of("home", "profile"));
                        long commonBitfield = PermissionBitfieldUtil.buildBitfield(
                                        (List<String>) commonAccount.get("permissions"),
                                        (List<String>) commonAccount.get("menusPermissions"),
                                        false);
                        commonAccount.put("permissionBitfield", PermissionBitfieldUtil.toCompactToken(commonBitfield));
                        commonAccount.put("permissionSchemaVersion", "v3");
                        commonAccount.put("dataScope", PermissionBitfieldUtil.resolveDataScope(commonBitfield));
                        commonAccount.put("dept_id", "HR-001");
                        commonAccount.put("branch_id", "MAIN");
                        commonAccount.put("department_id", "HR-001");
                        commonAccount.put("team_id", "HR-001");
                        commonAccount.put("group_rights", new ArrayList<>());
                        commonAccount.put("full_name", "Tom User");
                        commonAccount.put("user_address", "Common Address");
                        commonAccount.put("app_id", defaultAppId);

                        recordManager.createRecord("csm", "csm_accounts", commonAccount,List.of("email", "username", "phoneNumber", "app_id","app_token", "id"));

                        // ========== INITIALIZE PERMISSION SYSTEM ==========
                        // Seed default permissions
                        List<Map<String, Object>> permissions = buildDefaultPermissions();
                        for (Map<String, Object> perm : permissions) {
                                recordManager.createRecord("csm", "csm_permissions", perm, List.of("id", "permission_code"));
                        }

                        // Seed default roles
                        List<Map<String, Object>> roles = buildDefaultRoles();
                        for (Map<String, Object> role : roles) {
                                recordManager.createRecord("csm", "csm_roles", role, List.of("id", "role_code"));
                        }

                        // Link admin role to all admin permissions
                        String adminRoleId = roles.stream()
                                .filter(r -> "ADMIN".equals(r.get("role_code")))
                                .map(r -> r.get("id").toString())
                                .findFirst().orElse(UUID.randomUUID().toString());
                        
                        for (Map<String, Object> perm : permissions) {
                                Map<String, Object> rolePermMap = new HashMap<>();
                                rolePermMap.put("id", UUID.randomUUID().toString());
                                rolePermMap.put("role_id", adminRoleId);
                                rolePermMap.put("permission_id", perm.get("id"));
                                rolePermMap.put("create_time", System.currentTimeMillis());
                                recordManager.createRecord("csm", "csm_role_permissions", rolePermMap, List.of("id", "role_id", "permission_id"));
                        }

                        // Create default organization/root department
                        String rootDeptId = UUID.randomUUID().toString();
                        Map<String, Object> rootDept = new HashMap<>();
                        rootDept.put("id", rootDeptId);
                        rootDept.put("parent_dept_id", null);
                        rootDept.put("dept_code", "ROOT");
                        rootDept.put("dept_name", "Organization");
                        rootDept.put("dept_full_name", "Organization");
                        rootDept.put("description", "Root organization");
                        rootDept.put("manager_user_id", (String)adminAccount.get("id"));
                        rootDept.put("is_global", true);
                        rootDept.put("status", 1);
                        rootDept.put("create_time", System.currentTimeMillis());
                        rootDept.put("update_time", System.currentTimeMillis());
                        recordManager.createRecord("csm", "csm_depts", rootDept, List.of("id", "dept_code"));

                        // Create HR department as child of root
                        String hrDeptId = UUID.randomUUID().toString();
                        Map<String, Object> hrDept = new HashMap<>();
                        hrDept.put("id", hrDeptId);
                        hrDept.put("parent_dept_id", rootDeptId);
                        hrDept.put("dept_code", "HR-001");
                        hrDept.put("dept_name", "HR");
                        hrDept.put("dept_full_name", "Organization/HR");
                        hrDept.put("description", "Human Resources Department");
                        hrDept.put("manager_user_id", (String)commonAccount.get("id"));
                        hrDept.put("is_global", false);
                        hrDept.put("status", 1);
                        hrDept.put("create_time", System.currentTimeMillis());
                        hrDept.put("update_time", System.currentTimeMillis());
                        recordManager.createRecord("csm", "csm_depts", hrDept, List.of("id", "dept_code"));

                        // Link admin to root department with admin role
                        String adminUserDeptId = UUID.randomUUID().toString();
                        Map<String, Object> adminUserDept = new HashMap<>();
                        adminUserDept.put("id", adminUserDeptId);
                        adminUserDept.put("user_id", (String)adminAccount.get("id"));
                        adminUserDept.put("dept_id", rootDeptId);
                        adminUserDept.put("is_sub_user", false);
                        adminUserDept.put("role_id", adminRoleId);
                        adminUserDept.put("direct_permissions", null);
                        adminUserDept.put("status", 1);
                        adminUserDept.put("join_date", System.currentTimeMillis());
                        adminUserDept.put("create_time", System.currentTimeMillis());
                        recordManager.createRecord("csm", "csm_user_depts", adminUserDept, List.of("id", "user_id", "dept_id"));

                        // Link common user to HR department
                        String commonUserDeptId = UUID.randomUUID().toString();
                        Map<String, Object> commonUserDept = new HashMap<>();
                        commonUserDept.put("id", commonUserDeptId);
                        commonUserDept.put("user_id", (String)commonAccount.get("id"));
                        commonUserDept.put("dept_id", hrDeptId);
                        commonUserDept.put("is_sub_user", false);
                        String deptManagerRoleId = roles.stream()
                                .filter(r -> "DEPT_MANAGER".equals(r.get("role_code")))
                                .map(r -> r.get("id").toString())
                                .findFirst().orElse(UUID.randomUUID().toString());
                        commonUserDept.put("role_id", deptManagerRoleId);
                        commonUserDept.put("direct_permissions", null);
                        commonUserDept.put("status", 1);
                        commonUserDept.put("join_date", System.currentTimeMillis());
                        commonUserDept.put("create_time", System.currentTimeMillis());
                        recordManager.createRecord("csm", "csm_user_depts", commonUserDept, List.of("id", "user_id", "dept_id"));
                        } // End of: if (isUserSchemaFirstInit)

                } catch (Exception e) {
                        // logger("Error creating default data: " + e.getMessage());
                }
        }

        private void initializeDataTables(String app_id, String table_name, List<String> prkeys, List<String> keys)
                        throws Exception {
                // Tạo parametMap
                Map<String, Object> parametMap = new HashMap<>();
                // parametMap.put("app_id", app_id);
                Map<String, Object> structMap = new HashMap<>();
                List<String> fieldsPK = prkeys;
                List<String> fields = keys;

                // Đưa vào structMap
                structMap.put("fieldsPK", fieldsPK);
                structMap.put("fields", fields);
                parametMap.put("struct", structMap);
                parametMap.put("id", table_name);
                // logger.info("parametMap: " + parametMap);
                recordManager.createRecord(app_id, "index", parametMap, List.of("id"));
        }

        /**
         * Initialize schemas for user tables chỉ LẦN ĐẦU (check if schema already exists)
         * Để tránh xóa dữ liệu người dùng trên mỗi lần restart backend
         * 
         * Schema initialization logic:
         * 1. Check if csm_accounts schema exists in "index" table
         * 2. If not exists → initialize both user table schemas + return true (first-time init)
         * 3. If exists → skip (schema already set up, preserve user data) + return false
         * 
         * @return true if schemas were newly initialized (first-time), false if already existed
         */
        private boolean initializeUserTableSchemas() throws Exception {
                SearchFilter checkFilter = new SearchFilter();
                checkFilter.setField("id");
                checkFilter.setType("eq");
                checkFilter.setValue("csm_accounts");
                
                // Check xem schema đã tồn tại hay chưa
                Map<String, Object> existingSchema = recordManager.find("csm", "index", checkFilter);
                
                if (existingSchema != null && !existingSchema.isEmpty()) {
                        // Schema đã tồn tại: vẫn đồng bộ lại index struct để bổ sung field mới,
                        // nhưng không đụng dữ liệu người dùng.
                        org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger(InitHandler.class);
                        initializeDataTables("csm", "csm_accounts", getAccountSchemaPkFields(), getAccountSchemaFields());
                        initializeDataTables("csm", "csm_group_members", getSubAccountSchemaPkFields(), getSubAccountSchemaFields());
                        try {
                                recordManager.indexExistingRecords("csm", "csm_group_members");
                        } catch (Exception ex) {
                                logger.warn("Unable to rebuild csm_group_members index during schema sync: {}", ex.getMessage());
                        }
                        logger.info("✅ User table schemas already initialized, schema synced for latest fields");
                        return false; // Not first-time init
                }
                
                // Schema chưa tồn tại → khởi tạo lần đầu
                org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger(InitHandler.class);
                logger.info("🔒 Initializing user table schemas for the first time...");
                
                // Xóa dữ liệu cũ nếu tồn tại (lần đầu setup)
                recordManager.deleteRocksDB("csm", "csm_accounts");
                
                // 🔒 fieldsSearch for csm_accounts: Login + Session management fields
                // - id: Primary key
                // - email, username, phoneNumber: Login identifiers (findUserByEmail/Username/Phone)
                // - app_token, refresh_token, refresh: Session/token lookups (findUserByAppToken, findUserByRefreshToken)
                // PROTECTED: app_token, refresh_token, refresh have strict-no-scan (block RocksDB fallback scan on Lucene miss)
                initializeDataTables("csm", "csm_accounts", getAccountSchemaPkFields(), getAccountSchemaFields());
                
                // 🔒 fieldsSearch for csm_group_members: Sub-account login + session
                // - id: Primary key
                // - login_identifier: Sub-account login (like email/username/phone for sub-users)
                // - app_token, refresh: Sub-account session tokens (for sub-user session refresh)
                // PROTECTED: app_token, refresh have strict-no-scan (block expensive scans on lookup failures)
                initializeDataTables("csm", "csm_group_members", getSubAccountSchemaPkFields(), getSubAccountSchemaFields());
                
                logger.info("✅ User table schemas initialized successfully");
                return true; // First-time init completed
        }

        private List<Map<String, Object>> buildSystemAccountFields() {
                return List.of(
                        buildFieldConfig("id", "ID", 1, "number", "right"),
                        buildFieldConfig("username", "common.username", 1, "string", "left"),
                        buildFieldConfig("email", "common.email", 1, "string", "left"),
                        buildFieldConfig("phoneNumber", "common.phoneNumber", 1, "string", "left"),
                        buildFieldConfig("full_name", "common.fullName", 1, "string", "left"),
                        buildFieldConfig("user_address", "common.address", 1, "string", "left"),
                        buildFieldConfig("app_id", "common.appId", 1, "co", "left",
                                Map.of("f_cbo_query", "{\"query\":[{\"obj_name\":\"sys_apps\",\"app_id\":\"csm\",\"fields\":[\"id\",\"name\"]}]}")),
                        buildFieldConfig("app_token", "common.appToken", 1, "string", "left"),
                        buildFieldConfig("refresh_token", "Refresh Token", 1, "string", "left"),
                        buildFieldConfig("refresh", "Refresh Alias", 1, "string", "left"),
                        buildFieldConfig("login_version", "Login Version", 1, "number", "right"),
                        buildFieldConfig("pass", "common.password", 1, "password", "left"),
                        buildFieldConfig("roles", "Roles", 1, "string", "left"),
                        buildFieldConfig("permissions", "Permissions", 1, "string", "left"),
                        buildFieldConfig("menusPermissions", "Menu Permissions", 1, "string", "left"),
                        buildFieldConfig("permissionBitfield", "Permission Bitfield", 1, "string", "left"),
                        buildFieldConfig("permissionSchemaVersion", "Permission Schema", 1, "string", "left"),
                        buildFieldConfig("dataScope", "Data Scope", 1, "string", "left"),
                        buildFieldConfig("dept_id", "Dept ID", 1, "string", "left"),
                        buildFieldConfig("branch_id", "Branch ID", 1, "string", "left"),
                        buildFieldConfig("actived", "common.active", 1, "checkbox", "left"));
        }

        private List<Map<String, Object>> buildSubUserFields() {
                return List.of(
                        buildFieldConfig("id", "ID", 1, "number", "right"),
                        buildFieldConfig("parent_account_id", "common.parentAccountId", 1, "string", "left"),
                        buildFieldConfig("login_identifier", "common.loginIdentifier", 1, "string", "left"),
                        buildFieldConfig("username", "common.username", 1, "string", "left"),
                        buildFieldConfig("email", "common.email", 1, "string", "left"),
                        buildFieldConfig("phoneNumber", "common.phoneNumber", 1, "string", "left"),
                        buildFieldConfig("full_name", "common.fullName", 1, "string", "left"),
                        buildFieldConfig("app_id", "common.appId", 1, "string", "left"),
                        buildFieldConfig("source_app_token", "Source App Token", 1, "string", "left"),
                        buildFieldConfig("group_id", "common.groupId", 1, "string", "left"),
                        buildFieldConfig("app_token", "common.appToken", 1, "string", "left"),
                        buildFieldConfig("refresh_token", "Refresh Token", 1, "string", "left"),
                        buildFieldConfig("refresh", "Refresh Alias", 1, "string", "left"),
                        buildFieldConfig("login_version", "Login Version", 1, "number", "right"),
                        buildFieldConfig("loginVersion", "Login Version Legacy", 1, "number", "right"),
                        buildFieldConfig("pass", "common.password", 1, "password", "left"),
                        buildFieldConfig("permissions", "Permissions", 1, "string", "left"),
                        buildFieldConfig("menusPermissions", "Menu Permissions", 1, "string", "left"),
                        buildFieldConfig("permissionBitfield", "Permission Bitfield", 1, "string", "left"),
                        buildFieldConfig("permissionSchemaVersion", "Permission Schema", 1, "string", "left"),
                        buildFieldConfig("dataScope", "Data Scope", 1, "string", "left"),
                        buildFieldConfig("dept_id", "Dept ID", 1, "string", "left"),
                        buildFieldConfig("branch_id", "Branch ID", 1, "string", "left"),
                        buildFieldConfig("actived", "common.active", 1, "checkbox", "left"));
        }

        private List<String> getAccountSchemaPkFields() {
                return List.of("id", "email", "username", "phoneNumber", "app_token", "refresh_token", "refresh");
        }

        private List<String> getAccountSchemaFields() {
                return List.of(
                                "id", "username", "pass", "app_token", "refresh_token", "refresh",
                                "refresh_token_ip", "refresh_token_ua", "refresh_token_expiry", "login_version", "loginVersion",
                                "email", "avatar", "phoneNumber", "description", "roles", "actived",
                                "permissions", "menusPermissions", "group_rights", "full_name", "user_address", "app_id", "source_app_token",
                                "permissionBitfield", "permissionSchemaVersion", "dataScope",
                                "dept_id", "branch_id", "department_id", "team_id");
        }

        private List<String> getSubAccountSchemaPkFields() {
                return List.of("id", "login_identifier", "app_token", "refresh_token", "refresh");
        }

        private List<String> getSubAccountSchemaFields() {
                return List.of(
                                "id", "parent_account_id", "login_identifier", "username", "email", "phoneNumber",
                                "full_name", "user_address", "avatar", "group_rights", "group_id",
                                "app_id", "app_token", "source_app_token",
                                "refresh_token", "refresh", "refresh_token_ip", "refresh_token_ua", "refresh_token_expiry",
                                "login_version", "loginVersion", "pass", "actived",
                                "permissions", "menusPermissions", "permissionsAdd", "permissionsDeny", "menusPermissionsAdd", "menusPermissionsDeny",
                                "permissionBitfield", "permissionSchemaVersion", "dataScope",
                                "dept_id", "branch_id", "department_id", "team_id");
        }

        private Map<String, Object> buildFieldConfig(String name, String header, int show, String type, String align) {
                Map<String, Object> field = new HashMap<>();
                field.put("f_name", name);
                field.put("f_header", header);
                field.put("f_show", show);
                field.put("f_types", type);
                field.put("f_align", align);
                return field;
        }

        private Map<String, Object> buildFieldConfig(String name, String header, int show, String type, String align, Map<String, Object> extra) {
                Map<String, Object> field = buildFieldConfig(name, header, show, type, align);
                if (extra != null) field.putAll(extra);
                return field;
        }

        private Map<String, Object> buildSystemUserModes() {
                Map<String, Object> modes = new HashMap<>();
                modes.put("main", buildSystemUserMode("csm_accounts", buildSystemAccountFields(), buildMainAccountBeforeSaveScript()));
                modes.put("sub", buildSystemUserMode("csm_group_members", buildSubUserFields(), buildSubUserBeforeSaveScript()));
                return modes;
        }

        private Map<String, Object> buildSystemUserMode(String tableName, List<Map<String, Object>> table,
                        String beforeSaveScript) {
                Map<String, Object> mode = new HashMap<>();
                mode.put("table_name", tableName);
                mode.put("table", table);
                mode.put("trigger", Map.of("beforeSave", beforeSaveScript));
                mode.put("type_form", 1);
                mode.put("row_type_edit", 0);
                mode.put("g_readonly", false);
                return mode;
        }

        private String buildMainAccountBeforeSaveScript() {
                return """
function beforeSave(row, seft) {
        const resolvedAppId = String(row.app_id || seft.appId || \"\").trim();
        if (!resolvedAppId) {
                window.$message?.error(\"Vui lòng chọn app_id trước khi tạo tài khoản\");
                return false;
        }
        const primaryIdentifier = String(row.username || row.email || row.phoneNumber || \"\").trim();
        if (!primaryIdentifier) {
                window.$message?.error(\"Cần username, email hoặc phoneNumber để tạo tài khoản\");
                return false;
        }
        row.app_id = resolvedAppId;
        const roleValue = Array.isArray(row.roles) && row.roles.length > 0
                ? String(row.roles[0] || \"admin\").trim() || \"admin\"
                : \"admin\";
        const accessRight = roleValue.toLowerCase() === \"dev\" ? \"1\" : \"0\";
        row.app_token = seft.csmEncrypt([resolvedAppId, primaryIdentifier, roleValue, accessRight].join(\"_____\"));
        row.refresh_token = row.app_token;
        row.refresh = row.app_token;
        if (row.login_version == null) row.login_version = 0;
        if (row.loginVersion == null) row.loginVersion = row.login_version;
        const currentPass = String(row.pass || \"\").trim();
        if (currentPass) {
                const decryptedPass = String(seft.csmDecrypt(currentPass) || \"\");
                if (!decryptedPass.startsWith(primaryIdentifier + \"_____\")) {
                        row.pass = seft.csmEncrypt(primaryIdentifier + \"_____\" + currentPass);
                }
        }
        if (row.actived == null) row.actived = true;
        return row;
}
""";
        }

        private String buildSubUserBeforeSaveScript() {
                return """
function beforeSave(row, seft) {
        const sourceAppToken = String(seft.user?.app_token || \"\").trim();
        if (!sourceAppToken) {
                window.$message?.error(\"Không tìm thấy app_token của tài khoản hiện tại\");
                return false;
        }
        const decryptedSource = String(seft.csmDecrypt(sourceAppToken) || \"\");
        const sourceParts = decryptedSource.split(\"_____\");
        const sourceAppId = String(sourceParts[0] || seft.user?.app_id || \"\").trim();
        if (!sourceAppId) {
                window.$message?.error(\"Không xác định được app_id từ tài khoản hiện tại\");
                return false;
        }
        const loginIdentifier = String(row.login_identifier || \"\").trim();
        if (!loginIdentifier) {
                window.$message?.error(\"Vui lòng nhập login_identifier cho sub-user\");
                return false;
        }
        row.parent_account_id = String(row.parent_account_id || seft.user?.app_id || sourceAppId).trim();
        row.app_id = sourceAppId;
        row.source_app_token = sourceAppToken;
        row.app_token = seft.csmEncrypt([sourceAppId, loginIdentifier, \"user\", \"0\"].join(\"_____\"));
        row.refresh_token = row.app_token;
        row.refresh = row.app_token;
        if (row.login_version == null) row.login_version = 0;
        if (row.loginVersion == null) row.loginVersion = row.login_version;
        const currentPass = String(row.pass || \"\").trim();
        if (currentPass) {
                const decryptedPass = String(seft.csmDecrypt(currentPass) || \"\");
                if (!decryptedPass.startsWith(loginIdentifier + \"_____\")) {
                        row.pass = seft.csmEncrypt(loginIdentifier + \"_____\" + currentPass);
                }
        }
        if (row.actived == null) row.actived = true;
        return row;
}
""";
        }

                private List<Map<String, Object>> buildDefaultPermissions() {
                List<Map<String, Object>> permissions = new ArrayList<>();
                long now = System.currentTimeMillis();
                
                // User management permissions
                permissions.add(buildPermission("USER.CREATE", "Tạo người dùng", "USER", "CREATE", "Có thể tạo người dùng mới", "USER", now));
                permissions.add(buildPermission("USER.READ", "Xem người dùng", "USER", "READ", "Có thể xem danh sách người dùng", "USER", now));
                permissions.add(buildPermission("USER.UPDATE", "Cập nhật người dùng", "USER", "UPDATE", "Có thể cập nhật thông tin người dùng", "USER", now));
                permissions.add(buildPermission("USER.DELETE", "Xóa người dùng", "USER", "DELETE", "Có thể xóa người dùng", "USER", now));
                
                // Sub-user management permissions
                permissions.add(buildPermission("SUBUSER.CREATE", "Tạo người dùng con", "SUBUSER", "CREATE", "Có thể tạo người dùng con", "USER", now));
                permissions.add(buildPermission("SUBUSER.READ", "Xem người dùng con", "SUBUSER", "READ", "Có thể xem danh sách người dùng con", "USER", now));
                permissions.add(buildPermission("SUBUSER.UPDATE", "Cập nhật người dùng con", "SUBUSER", "UPDATE", "Có thể cập nhật thông tin người dùng con", "USER", now));
                permissions.add(buildPermission("SUBUSER.DELETE", "Xóa người dùng con", "SUBUSER", "DELETE", "Có thể xóa người dùng con", "USER", now));
                
                // Department management permissions
                permissions.add(buildPermission("DEPARTMENT.CREATE", "Tạo phòng ban", "DEPARTMENT", "CREATE", "Có thể tạo phòng ban mới", "DEPARTMENT", now));
                permissions.add(buildPermission("DEPARTMENT.READ", "Xem phòng ban", "DEPARTMENT", "READ", "Có thể xem danh sách phòng ban", "DEPARTMENT", now));
                permissions.add(buildPermission("DEPARTMENT.UPDATE", "Cập nhật phòng ban", "DEPARTMENT", "UPDATE", "Có thể cập nhật thông tin phòng ban", "DEPARTMENT", now));
                permissions.add(buildPermission("DEPARTMENT.DELETE", "Xóa phòng ban", "DEPARTMENT", "DELETE", "Có thể xóa phòng ban", "DEPARTMENT", now));
                
                // Role management permissions
                permissions.add(buildPermission("ROLE.CREATE", "Tạo vai trò", "ROLE", "CREATE", "Có thể tạo vai trò mới", "ROLE", now));
                permissions.add(buildPermission("ROLE.READ", "Xem vai trò", "ROLE", "READ", "Có thể xem danh sách vai trò", "ROLE", now));
                permissions.add(buildPermission("ROLE.UPDATE", "Cập nhật vai trò", "ROLE", "UPDATE", "Có thể cập nhật vai trò", "ROLE", now));
                permissions.add(buildPermission("ROLE.DELETE", "Xóa vai trò", "ROLE", "DELETE", "Có thể xóa vai trò", "ROLE", now));
                
                // Permission management
                permissions.add(buildPermission("PERMISSION.MANAGE", "Quản lý quyền hạn", "PERMISSION", "MANAGE", "Có thể quản lý quyền hạn", "PERMISSION", now));
                
                // System permissions
                permissions.add(buildPermission("SYSTEM.ADMIN", "Quản trị hệ thống", "SYSTEM", "ADMIN", "Có tất cả quyền hạn tối cao", "SYSTEM", now));
                
                return permissions;
        }

        private Map<String, Object> buildPermission(String code, String name, String resource, String action, String description, String category, long createTime) {
                Map<String, Object> perm = new HashMap<>();
                perm.put("id", UUID.randomUUID().toString());
                perm.put("permission_code", code);
                perm.put("permission_name", name);
                perm.put("resource", resource);
                perm.put("action", action);
                perm.put("description", description);
                perm.put("category", category);
                perm.put("create_time", createTime);
                return perm;
        }

        private List<Map<String, Object>> buildDefaultRoles() {
                List<Map<String, Object>> roles = new ArrayList<>();
                long now = System.currentTimeMillis();
                
                // Global admin role
                Map<String, Object> adminRole = new HashMap<>();
                adminRole.put("id", UUID.randomUUID().toString());
                adminRole.put("role_code", "ADMIN");
                adminRole.put("role_name", "Quản trị viên");
                adminRole.put("is_global", true);
                adminRole.put("department_id", null);
                adminRole.put("description", "Có tất cả quyền hạn tối cao trên hệ thống");
                adminRole.put("status", 1);
                adminRole.put("create_time", now);
                adminRole.put("update_time", now);
                roles.add(adminRole);
                
                // Department manager role
                Map<String, Object> deptManagerRole = new HashMap<>();
                deptManagerRole.put("id", UUID.randomUUID().toString());
                deptManagerRole.put("role_code", "DEPT_MANAGER");
                deptManagerRole.put("role_name", "Trưởng phòng ban");
                deptManagerRole.put("is_global", false);
                deptManagerRole.put("department_id", null);
                deptManagerRole.put("description", "Quản lý phòng ban và nhân viên trong phòng ban");
                deptManagerRole.put("status", 1);
                deptManagerRole.put("create_time", now);
                deptManagerRole.put("update_time", now);
                roles.add(deptManagerRole);
                
                // Department staff role
                Map<String, Object> staffRole = new HashMap<>();
                staffRole.put("id", UUID.randomUUID().toString());
                staffRole.put("role_code", "STAFF");
                staffRole.put("role_name", "Nhân viên");
                staffRole.put("is_global", false);
                staffRole.put("department_id", null);
                staffRole.put("description", "Nhân viên bình thường chỉ có quyền xem và chỉnh sửa dữ liệu của phòng ban");
                staffRole.put("status", 1);
                staffRole.put("create_time", now);
                staffRole.put("update_time", now);
                roles.add(staffRole);
                
                // Guest role (limit permissions)
                Map<String, Object> guestRole = new HashMap<>();
                guestRole.put("id", UUID.randomUUID().toString());
                guestRole.put("role_code", "GUEST");
                guestRole.put("role_name", "Khách");
                guestRole.put("is_global", true);
                guestRole.put("department_id", null);
                guestRole.put("description", "Quyền hạn tối thiểu chỉ xem dữ liệu");
                guestRole.put("status", 1);
                guestRole.put("create_time", now);
                guestRole.put("update_time", now);
                roles.add(guestRole);
                
                return roles;
        }
}
