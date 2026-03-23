package net.phanmemmottrieu.controller;

import net.phanmemmottrieu.model.StandardResponse;
import net.phanmemmottrieu.service.PermissionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST API endpoints for permission, role, and department management
 */
@RestController
@RequestMapping("/api/permission")
@CrossOrigin(origins = "*", maxAge = 3600)
public class PermissionController {

    @Autowired
    private PermissionService permissionService;

    /**
     * Get all roles
     */
    @GetMapping("/roles")
    public StandardResponse getAllRoles() {
        StandardResponse response = new StandardResponse();
        try {
            List<Map<String, Object>> roles = permissionService.getAllRoles();
            response.set("code", 200);
            response.set("result", roles);
            response.set("success", true);
            response.set("message", "OK");
        } catch (Exception e) {
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
        return response;
    }

    /**
     * Get all permissions
     */
    @GetMapping("/permissions")
    public StandardResponse getAllPermissions() {
        StandardResponse response = new StandardResponse();
        try {
            List<Map<String, Object>> permissions = permissionService.getAllPermissions();
            response.set("code", 200);
            response.set("result", permissions);
            response.set("success", true);
            response.set("message", "OK");
        } catch (Exception e) {
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
        return response;
    }

    /**
     * Get all departments
     */
    @GetMapping("/departments")
    public StandardResponse getAllDepartments() {
        StandardResponse response = new StandardResponse();
        try {
            List<Map<String, Object>> departments = permissionService.getAllDepartments();
            response.set("code", 200);
            response.set("result", departments);
            response.set("success", true);
            response.set("message", "OK");
        } catch (Exception e) {
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
        return response;
    }

    /**
     * Get department hierarchy tree
     */
    @GetMapping("/departments/tree")
    public StandardResponse getDepartmentTree() {
        StandardResponse response = new StandardResponse();
        try {
            List<Map<String, Object>> tree = permissionService.getDepartmentTree();
            response.set("code", 200);
            response.set("result", tree);
            response.set("success", true);
            response.set("message", "OK");
        } catch (Exception e) {
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
        return response;
    }

    /**
     * Get user's permissions
     */
    @GetMapping("/user/{userId}/permissions")
    public StandardResponse getUserPermissions(@PathVariable String userId) {
        StandardResponse response = new StandardResponse();
        try {
            var permissions = permissionService.getUserPermissions(userId);
            response.set("code", 200);
            response.set("result", permissions);
            response.set("success", true);
            response.set("message", "OK");
        } catch (Exception e) {
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
        return response;
    }

    /**
     * Check if user has a specific permission
     */
    @GetMapping("/user/{userId}/check/{permissionCode}")
    public StandardResponse checkUserPermission(@PathVariable String userId, @PathVariable String permissionCode) {
        StandardResponse response = new StandardResponse();
        try {
            boolean hasPermission = permissionService.hasPermission(userId, permissionCode);
            response.set("code", 200);
            response.set("result", Map.of("hasPermission", hasPermission));
            response.set("success", true);
            response.set("message", "OK");
        } catch (Exception e) {
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
        return response;
    }

    /**
     * Get user's departments
     */
    @GetMapping("/user/{userId}/departments")
    public StandardResponse getUserDepartments(@PathVariable String userId) {
        StandardResponse response = new StandardResponse();
        try {
            List<Map<String, Object>> departments = permissionService.getUserDepartments(userId);
            response.set("code", 200);
            response.set("result", departments);
            response.set("success", true);
            response.set("message", "OK");
        } catch (Exception e) {
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
        return response;
    }

    /**
     * Get role's permissions
     */
    @GetMapping("/role/{roleId}/permissions")
    public StandardResponse getRolePermissions(@PathVariable String roleId) {
        StandardResponse response = new StandardResponse();
        try {
            List<Map<String, Object>> permissions = permissionService.getRolePermissions(roleId);
            response.set("code", 200);
            response.set("result", permissions);
            response.set("success", true);
            response.set("message", "OK");
        } catch (Exception e) {
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
        return response;
    }

    /**
     * Add permission to role
     */
    @PostMapping("/role/{roleId}/permission/{permissionId}/add")
    public StandardResponse addPermissionToRole(@PathVariable String roleId, @PathVariable String permissionId) {
        StandardResponse response = new StandardResponse();
        try {
            permissionService.addPermissionToRole(roleId, permissionId);
            response.set("code", 200);
            response.set("success", true);
            response.set("message", "Permission added to role successfully");
        } catch (Exception e) {
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
        return response;
    }

    /**
     * Remove permission from role
     */
    @PostMapping("/role/{roleId}/permission/{permissionId}/remove")
    public StandardResponse removePermissionFromRole(@PathVariable String roleId, @PathVariable String permissionId) {
        StandardResponse response = new StandardResponse();
        try {
            permissionService.removePermissionFromRole(roleId, permissionId);
            response.set("code", 200);
            response.set("success", true);
            response.set("message", "Permission removed from role successfully");
        } catch (Exception e) {
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
        return response;
    }

    /**
     * Assign role to user in department
     */
    @PostMapping("/user/{userId}/department/{deptId}/role/{roleId}/assign")
    public StandardResponse assignRoleToUserInDept(
            @PathVariable String userId,
            @PathVariable String deptId,
            @PathVariable String roleId,
            @RequestParam(value = "isSubUser", defaultValue = "false") boolean isSubUser) {
        StandardResponse response = new StandardResponse();
        try {
            permissionService.assignRoleToUserInDept(userId, deptId, roleId, isSubUser);
            response.set("code", 200);
            response.set("success", true);
            response.set("message", "Role assigned to user in department successfully");
        } catch (Exception e) {
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
        return response;
    }

    /**
     * Get permission matrix (all users x permissions)
     */
    @GetMapping("/matrix")
    public StandardResponse getPermissionMatrix() {
        StandardResponse response = new StandardResponse();
        try {
            Map<String, Map<String, Boolean>> matrix = permissionService.getPermissionMatrix();
            response.set("code", 200);
            response.set("result", matrix);
            response.set("success", true);
            response.set("message", "OK");
        } catch (Exception e) {
            response.set("code", 500);
            response.set("message", "Error: " + e.getMessage());
            response.set("success", false);
        }
        return response;
    }
}
