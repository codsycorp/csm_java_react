package net.phanmemmottrieu.handler;

import java.util.*;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.data.SearchFilter;
import net.phanmemmottrieu.model.StandardResponse;

@Component
public class MenuHandler {

    private final RecordManager recordManager; // Khai báo một trường để giữ instance của RecordManager

    // Sử dụng Dependency Injection thông qua Constructor
    @Autowired // Đánh dấu constructor này để Spring tự động tiêm RecordManager vào
    public MenuHandler(RecordManager recordManager) {
        this.recordManager = recordManager;
    }
    public void handleMenuList(StandardResponse response) {
        // Get current authenticated user
        org.springframework.security.core.Authentication authentication = 
            org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        
        List<String> userMenuIds = null;
        
        if (authentication != null && authentication.isAuthenticated() && 
            authentication.getPrincipal() != null && 
            !"anonymousUser".equals(authentication.getPrincipal())) {
            
            Object principal = authentication.getPrincipal();
            if (principal instanceof net.phanmemmottrieu.model.User) {
                net.phanmemmottrieu.model.User user = (net.phanmemmottrieu.model.User) principal;
                userMenuIds = user.getMenusPermissions();
            } else if (principal instanceof java.util.Map) {
                Object menusPerms = ((java.util.Map<?, ?>) principal).get("menusPermissions");
                if (menusPerms instanceof java.util.List<?>) {
                    userMenuIds = (java.util.List<String>) menusPerms;
                }
            }
        }

        SearchFilter filter = new SearchFilter();
        filter.setField("id");
        filter.setType("eq");
        filter.setValue("menuList");

        Map<String, Object> record = recordManager.find("csm", "index", filter);
        List<Map<String, Object>> allMenus = (List<Map<String, Object>>) record.get("data");

        // Filter menus by user permissions if available
        final List<Map<String, Object>> filteredMenus;
        if (userMenuIds != null && !userMenuIds.isEmpty()) {
            filteredMenus = filterMenusByPermissions(allMenus, userMenuIds);
        } else {
            filteredMenus = allMenus;
        }

        response.set("code", 200);
        response.set("result", new HashMap<String, Object>() {{
            put("list", filteredMenus);
            put("total", filteredMenus.size());
            put("pageSize", 10);
            put("current", 1);
        }});
        response.set("message", "ok");
        response.set("success", true);
    }

    /**
     * Filter menu tree by user's allowed menu IDs
     * Recursively filters children and only keeps allowed menus
     */
    private List<Map<String, Object>> filterMenusByPermissions(
            List<Map<String, Object>> menus, 
            List<String> allowedMenuIds) {
        
        if (menus == null || allowedMenuIds == null) {
            return menus;
        }

        List<Map<String, Object>> filtered = new ArrayList<>();
        
        for (Map<String, Object> menu : menus) {
            String menuId = (String) menu.get("id");
            
            // Check if this menu is in allowed list
            if (allowedMenuIds.contains(menuId)) {
                Map<String, Object> filteredMenu = new HashMap<>(menu);
                
                // Recursively filter children
                Object childrenObj = menu.get("children");
                if (childrenObj instanceof List) {
                    List<Map<String, Object>> children = (List<Map<String, Object>>) childrenObj;
                    List<Map<String, Object>> filteredChildren = 
                        filterMenusByPermissions(children, allowedMenuIds);
                    if (!filteredChildren.isEmpty()) {
                        filteredMenu.put("children", filteredChildren);
                    }
                }
                
                filtered.add(filteredMenu);
            }
        }
        
        return filtered;
    }

    public void handleMenuItem(StandardResponse response, String method, Map<String, Object> params) throws Exception {
        SearchFilter filter = new SearchFilter();
        filter.setField("id");
        filter.setType("eq");
        filter.setValue("menuList");

        Map<String, Object> record = recordManager.find("csm", "index", filter);

        List<Map<String, Object>> list = (List<Map<String, Object>>) record.get("data");

        String methodUpper = method.toUpperCase();
        if ("POST".equals(methodUpper)) {
            params.put("id", UUID.randomUUID().toString());
            list.add(params);
        } else if ("PUT".equals(methodUpper)) {
            for (Map<String, Object> item : list) {
                if (item.get("id").equals(params.get("id"))) {
                    item.putAll(params);
                    break;
                }
            }
        } else if ("DELETE".equals(methodUpper)) {
            list.removeIf(m -> m.get("id").equals(params.get("id")));
        }

        recordManager.createRecord("csm", "index", new HashMap<String, Object>() {{
            put("id", "menuList");
            put("data", list);
        }}, List.of("id"));
        

        response.set("code", 200);
        response.set("result", new HashMap<String, Object>());
        response.set("message", "ok");
        response.set("success", true);
    }

    public void handleMenuByRoleId(StandardResponse response, Map<String, Object> params) {
        SearchFilter filter = new SearchFilter();
        filter.setField("id");
        filter.setType("eq");
        filter.setValue("menuR");

        Map<String, Object> record = recordManager.find("csm", "index", filter);
        List<Map<String, Object>> data = (List<Map<String, Object>>) record.get("data");

        List<Object> menuIds;
        if ("1".equals(params.get("id"))) {
            menuIds = data.stream().map(item -> item.get("id")).collect(Collectors.toList());
        } else {
            menuIds = Collections.emptyList();
        }

        response.set("code", 200);
        response.set("result", menuIds);
        response.set("message", "ok");
        response.set("success", true);
    }
}