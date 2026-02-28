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
import net.phanmemmottrieu.model.StandardResponse;

@Component
public class InitHandler {
        private static final int system = 100; // Add this line to define the 'system' variable
        private static final String ADMIN_TOKEN = "4d543bb4-714c-4bb1-952f-a2e0bf8b24a3"; // Add this line to define the
                                                                                          // 'ADMIN_TOKEN' variable
        private static final String ADMIN_REFRESH_TOKEN = "3075217c-4445-47b6-a9a3-ebf003ebde99"; // Add this line to
                                                                                                  // define
                                                                                                  // the
                                                                                                  // 'ADMIN_REFRESH_TOKEN'
                                                                                                  // variable
        private static final String COMMON_TOKEN = "c196c8ef-a80f-43c1-b98b-24f80f95bd8a"; // Add this line to define
                                                                                           // the
                                                                                           // 'COMMON_TOKEN' variable
        private static final String COMMON_REFRESH_TOKEN = "0fd107de-e1fa-47a6-9eb4-ee1fb479aa91"; // Add this line to
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
                        recordManager.deleteRocksDB("csm", "csm_accounts");
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
                        
                        // System menu parent
                        Map<String, Object> systemRoute = new HashMap<>();
                        systemRoute.put("id", UUID.randomUUID().toString());
                        systemRoute.put("path", "/system");
                        systemRoute.put("component", "/system");
                        Map<String, Object> systemHandle = new HashMap<>();
                        systemHandle.put("icon", "SettingOutlined");
                        systemHandle.put("title", "common.menu.system");
                        systemHandle.put("order", system);
                        systemRoute.put("handle", systemHandle);
                        
                        // Children routes
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

                        initializeDataTables("csm", "csm_accounts",
                                        List.of("email", "username", "phoneNumber", "app_id","app_token", "id"), List.of(
                                                        "id", "username", "pass", "app_token", "refresh", "email",
                                                        "avatar",
                                                        "phoneNumber", "description",
                                                        "roles", "actived", "permissions", "menusPermissions",
                                                        "group_rights",
                                                        "full_name", "user_address", "app_id"));
                        initializeDataTables("csm", "routers", List.of("path"),
                                        List.of("path", "component", "layout", "handle", "children"));
                        initializeDataTables("csm", "index", List.of("id"), List.of("id", "struct"));

                        String defaultAppId = "csm";
                        String defaultReferrerEmail = "codsycorp@gmail.com";
                        String adminAccessLevel = "FULL_ADMIN";
                        String commonAccessLevel = "STANDARD_USER";

                        // 2. Đồng bộ tạo tài khoản Admin
                        Map<String, Object> adminAccount = new HashMap<>();
                        adminAccount.put("id", UUID.randomUUID().toString());
                        adminAccount.put("username", "admin");
                        adminAccount.put("email", null);

                        // Mật khẩu đã mã hóa: dùng username làm key mã hóa (vì đăng nhập bằng username)
                        String passAdmin = recordManager.csm_encrypt("admin_____" + "123456789admin");
                        adminAccount.put("pass", passAdmin);

                        // TẠO app_token THEO NGUYÊN TẮC MỚI: dùng adminEmail làm định danh chính trong
                        // token
                        String adminAppTokenRawData = defaultAppId + "_____admin_____"
                                        + defaultReferrerEmail + "_____" + adminAccessLevel;
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
                        String commonAppTokenRawData = defaultAppId + "_____common_____"
                                        + defaultReferrerEmail + "_____" + commonAccessLevel;
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
                        commonAccount.put("group_rights", new ArrayList<>());
                        commonAccount.put("full_name", "Tom User");
                        commonAccount.put("user_address", "Common Address");
                        commonAccount.put("app_id", defaultAppId);

                        recordManager.createRecord("csm", "csm_accounts", commonAccount,List.of("email", "username", "phoneNumber", "app_id","app_token", "id"));

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

}