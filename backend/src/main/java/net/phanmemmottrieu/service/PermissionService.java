package net.phanmemmottrieu.service;

import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.data.SearchFilter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for managing permissions, roles, and department-user-role relationships
 */
@Service
public class PermissionService {
    private static final String APP_ID = "csm";
    private static final String PERMISSIONS_TABLE = "csm_permissions";
    private static final String ROLES_TABLE = "csm_roles";
    private static final String ROLE_PERMISSIONS_TABLE = "csm_role_permissions";
    private static final String USER_DEPTS_TABLE = "csm_user_depts";
    private static final String USER_ROLES_TABLE = "csm_user_roles";
    private static final String DEPTS_TABLE = "csm_depts";
    private static final String ACCOUNTS_TABLE = "csm_accounts";
    private static final String GROUP_MEMBERS_TABLE = "csm_group_members";

    @Autowired
    private RecordManager recordManager;

    /**
     * Get all permissions for a user (combining global roles + department-specific roles + direct permissions)
     */
    public Set<String> getUserPermissions(String userId) {
        Set<String> permissions = new HashSet<>();
        
        try {
            // Get user's global roles from csm_user_roles
            SearchFilter filter = new SearchFilter();
            filter.setField("user_id");
            filter.setType("eq");
            filter.setValue(userId);
            Map<String, Object> userRole = recordManager.find(APP_ID, USER_ROLES_TABLE, filter);
            
            if (userRole != null && !userRole.isEmpty()) {
                String roleId = (String) userRole.get("role_id");
                permissions.addAll(getPermissionsByRoleId(roleId));
            }
            
            // Get user's department-specific roles and permissions
            List<Map<String, Object>> userDepts = searchUserDepartments(userId);
            for (Map<String, Object> userDept : userDepts) {
                String roleId = (String) userDept.get("role_id");
                if (roleId != null && !roleId.isEmpty()) {
                    permissions.addAll(getPermissionsByRoleId(roleId));
                }
                
                // Add direct permissions if any
                String directPerms = (String) userDept.get("direct_permissions");
                if (directPerms != null && !directPerms.isEmpty()) {
                    String[] perms = directPerms.split(",");
                    permissions.addAll(Arrays.asList(perms));
                }
            }
            
        } catch (Exception e) {
            e.printStackTrace();
        }
        
        return permissions;
    }

    /**
     * Get all permissions for a role
     */
    public Set<String> getPermissionsByRoleId(String roleId) {
        Set<String> permissions = new HashSet<>();
        
        try {
            SearchFilter filter = new SearchFilter();
            filter.setField("role_id");
            filter.setType("eq");
            filter.setValue(roleId);
            Map<String, Object> rolePerms = recordManager.find(APP_ID, ROLE_PERMISSIONS_TABLE, filter);
            
            if (rolePerms != null && !rolePerms.isEmpty()) {
                List<Map<String, Object>> permList = (List<Map<String, Object>>) rolePerms.get("permissions");
                if (permList != null) {
                    for (Map<String, Object> perm : permList) {
                        String permCode = (String) perm.get("permission_code");
                        if (permCode != null) {
                            permissions.add(permCode);
                        }
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        
        return permissions;
    }

    /**
     * Check if user has a specific permission
     */
    public boolean hasPermission(String userId, String permissionCode) {
        return getUserPermissions(userId).contains(permissionCode);
    }

    /**
     * Get all roles
     */
    public List<Map<String, Object>> getAllRoles() {
        try {
            SearchFilter filter = new SearchFilter();
            filter.setField("id");
            filter.setType("neq");
            filter.setValue("");
            Map<String, Object> result = recordManager.find(APP_ID, ROLES_TABLE, filter);
            if (result != null && !result.isEmpty()) {
                List<Map<String, Object>> roles = (List<Map<String, Object>>) result.get("data");
                return roles != null ? roles : new ArrayList<>();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return new ArrayList<>();
    }

    /**
     * Get all permissions
     */
    public List<Map<String, Object>> getAllPermissions() {
        try {
            SearchFilter filter = new SearchFilter();
            filter.setField("id");
            filter.setType("neq");
            filter.setValue("");
            Map<String, Object> result = recordManager.find(APP_ID, PERMISSIONS_TABLE, filter);
            if (result != null && !result.isEmpty()) {
                List<Map<String, Object>> perms = (List<Map<String, Object>>) result.get("data");
                return perms != null ? perms : new ArrayList<>();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return new ArrayList<>();
    }

    /**
     * Get all departments
     */
    public List<Map<String, Object>> getAllDepartments() {
        try {
            SearchFilter filter = new SearchFilter();
            filter.setField("id");
            filter.setType("neq");
            filter.setValue("");
            Map<String, Object> result = recordManager.find(APP_ID, DEPTS_TABLE, filter);
            if (result != null && !result.isEmpty()) {
                List<Map<String, Object>> depts = (List<Map<String, Object>>) result.get("data");
                return depts != null ? depts : new ArrayList<>();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return new ArrayList<>();
    }

    /**
     * Get department hierarchy as tree structure
     */
    public List<Map<String, Object>> getDepartmentTree() {
        List<Map<String, Object>> allDepts = getAllDepartments();
        Map<String, Map<String, Object>> deptMap = new HashMap<>();
        
        // Build map for quick lookup
        for (Map<String, Object> dept : allDepts) {
            deptMap.put((String) dept.get("id"), dept);
            dept.put("children", new ArrayList<>());
        }
        
        // Build tree structure
        List<Map<String, Object>> tree = new ArrayList<>();
        for (Map<String, Object> dept : allDepts) {
            String parentId = (String) dept.get("parent_dept_id");
            if (parentId == null || parentId.isEmpty()) {
                tree.add(dept);
            } else {
                Map<String, Object> parent = deptMap.get(parentId);
                if (parent != null) {
                    List<Map<String, Object>> children = (List<Map<String, Object>>) parent.get("children");
                    children.add(dept);
                }
            }
        }
        
        return tree;
    }

    /**
     * Get user's departments
     */
    public List<Map<String, Object>> getUserDepartments(String userId) {
        return searchUserDepartments(userId);
    }

    /**
     * Search user departments by user ID
     */
    private List<Map<String, Object>> searchUserDepartments(String userId) {
        try {
            SearchFilter filter = new SearchFilter();
            filter.setField("user_id");
            filter.setType("eq");
            filter.setValue(userId);
            Map<String, Object> result = recordManager.find(APP_ID, USER_DEPTS_TABLE, filter);
            if (result != null && !result.isEmpty()) {
                List<Map<String, Object>> userDepts = (List<Map<String, Object>>) result.get("data");
                return userDepts != null ? userDepts : new ArrayList<>();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return new ArrayList<>();
    }

    /**
     * Get role's permissions
     */
    public List<Map<String, Object>> getRolePermissions(String roleId) {
        try {
            SearchFilter filter = new SearchFilter();
            filter.setField("role_id");
            filter.setType("eq");
            filter.setValue(roleId);
            Map<String, Object> result = recordManager.find(APP_ID, ROLE_PERMISSIONS_TABLE, filter);
            if (result != null && !result.isEmpty()) {
                List<Map<String, Object>> perms = (List<Map<String, Object>>) result.get("data");
                return perms != null ? perms : new ArrayList<>();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return new ArrayList<>();
    }

    /**
     * Add permission to role
     */
    public void addPermissionToRole(String roleId, String permissionId) {
        try {
            Map<String, Object> rolePermMap = new HashMap<>();
            rolePermMap.put("id", UUID.randomUUID().toString());
            rolePermMap.put("role_id", roleId);
            rolePermMap.put("permission_id", permissionId);
            rolePermMap.put("create_time", System.currentTimeMillis());
            recordManager.createRecord(APP_ID, ROLE_PERMISSIONS_TABLE, rolePermMap, 
                List.of("id", "role_id", "permission_id"));
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /**
     * Remove permission from role
     */
    public void removePermissionFromRole(String roleId, String permissionId) {
        try {
            SearchFilter filter = new SearchFilter();
            filter.setField("role_id");
            filter.setType("eq");
            filter.setValue(roleId);
            Map<String, Object> result = recordManager.find(APP_ID, ROLE_PERMISSIONS_TABLE, filter);
            if (result != null && !result.isEmpty()) {
                List<Map<String, Object>> perms = (List<Map<String, Object>>) result.get("data");
                if (perms != null) {
                    for (Map<String, Object> perm : perms) {
                        if (permissionId.equals(perm.get("permission_id"))) {
                            recordManager.deleteRocksDB(APP_ID, ROLE_PERMISSIONS_TABLE);
                            break;
                        }
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /**
     * Assign role to user in a department
     */
    public void assignRoleToUserInDept(String userId, String deptId, String roleId, boolean isSubUser) {
        try {
            String userDeptId = UUID.randomUUID().toString();
            Map<String, Object> userDept = new HashMap<>();
            userDept.put("id", userDeptId);
            userDept.put("user_id", userId);
            userDept.put("dept_id", deptId);
            userDept.put("is_sub_user", isSubUser);
            userDept.put("role_id", roleId);
            userDept.put("direct_permissions", null);
            userDept.put("status", 1);
            userDept.put("join_date", System.currentTimeMillis());
            userDept.put("create_time", System.currentTimeMillis());
            recordManager.createRecord(APP_ID, USER_DEPTS_TABLE, userDept, 
                List.of("id", "user_id", "dept_id"));
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /**
     * Get permission matrix (users x permissions)
     */
    public Map<String, Map<String, Boolean>> getPermissionMatrix() {
        Map<String, Map<String, Boolean>> matrix = new HashMap<>();
        
        try {
            // Get all users
            SearchFilter filter = new SearchFilter();
            filter.setField("id");
            filter.setType("neq");
            filter.setValue("");
            Map<String, Object> usersResult = recordManager.find(APP_ID, ACCOUNTS_TABLE, filter);
            Map<String, Object> subUsersResult = recordManager.find(APP_ID, GROUP_MEMBERS_TABLE, filter);
            
            List<Map<String, Object>> allUsers = new ArrayList<>();
            if (usersResult != null && !usersResult.isEmpty()) {
                List<Map<String, Object>> users = (List<Map<String, Object>>) usersResult.get("data");
                if (users != null) allUsers.addAll(users);
            }
            if (subUsersResult != null && !subUsersResult.isEmpty()) {
                List<Map<String, Object>> subUsers = (List<Map<String, Object>>) subUsersResult.get("data");
                if (subUsers != null) allUsers.addAll(subUsers);
            }
            
            // Get all permissions
            List<Map<String, Object>> allPerms = getAllPermissions();
            List<String> permCodes = allPerms.stream()
                .map(p -> (String) p.get("permission_code"))
                .collect(Collectors.toList());
            
            // Build matrix
            for (Map<String, Object> user : allUsers) {
                String userId = (String) user.get("id");
                String username = (String) user.get("username");
                String loginId = (String) user.get("login_identifier");
                String userKey = username != null ? username : (loginId != null ? loginId : userId);
                
                Map<String, Boolean> userPerms = new HashMap<>();
                Set<String> userPermissions = getUserPermissions(userId);
                
                for (String permCode : permCodes) {
                    userPerms.put(permCode, userPermissions.contains(permCode));
                }
                
                matrix.put(userKey, userPerms);
            }
            
        } catch (Exception e) {
            e.printStackTrace();
        }
        
        return matrix;
    }
}
