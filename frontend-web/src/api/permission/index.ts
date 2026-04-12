import { request } from "#src/utils";

const BASE_URL = "permission";

/**
 * Get all roles
 */
export async function fetchAllRoles(config?: any) {
	return request.get(`${BASE_URL}/roles`, { ...config }).json();
}

/**
 * Get all permissions
 */
export async function fetchAllPermissions(config?: any) {
	return request.get(`${BASE_URL}/permissions`, { ...config }).json();
}

/**
 * Get all departments
 */
export async function fetchAllDepartments(config?: any) {
	return request.get(`${BASE_URL}/departments`, { ...config }).json();
}

/**
 * Get department tree hierarchy
 */
export async function fetchDepartmentTree(config?: any) {
	return request.get(`${BASE_URL}/departments/tree`, { ...config }).json();
}

/**
 * Get user's permissions
 */
export async function fetchUserPermissions(userId: string, config?: any) {
	return request.get(`${BASE_URL}/user/${userId}/permissions`, { ...config }).json();
}

/**
 * Check if user has specific permission
 */
export async function fetchCheckUserPermission(userId: string, permissionCode: string, config?: any) {
	return request.get(`${BASE_URL}/user/${userId}/check/${permissionCode}`, { ...config }).json();
}

/**
 * Get user's departments
 */
export async function fetchUserDepartments(userId: string, config?: any) {
	return request.get(`${BASE_URL}/user/${userId}/departments`, { ...config }).json();
}

/**
 * Get role's permissions
 */
export async function fetchRolePermissions(roleId: string, config?: any) {
	return request.get(`${BASE_URL}/role/${roleId}/permissions`, { ...config }).json();
}

/**
 * Add permission to role
 */
export async function fetchAddPermissionToRole(roleId: string, permissionId: string, config?: any) {
	return request.post(`${BASE_URL}/role/${roleId}/permission/${permissionId}/add`, { json: {}, ...config }).json();
}

/**
 * Remove permission from role
 */
export async function fetchRemovePermissionFromRole(roleId: string, permissionId: string, config?: any) {
	return request.post(`${BASE_URL}/role/${roleId}/permission/${permissionId}/remove`, { json: {}, ...config }).json();
}

/**
 * Assign role to user in department
 */
export async function fetchAssignRoleToUserInDept(
	userId: string,
	deptId: string,
	roleId: string,
	isSubUser: boolean = false,
	config?: any
) {
	return request.post(
		`${BASE_URL}/user/${userId}/department/${deptId}/role/${roleId}/assign`,
		{ 
			json: { isSubUser },
			...config 
		}
	).json();
}

/**
 * Get permission matrix (all users x permissions)
 */
export async function fetchPermissionMatrix(config?: any) {
	return request.get(`${BASE_URL}/matrix`, { ...config }).json();
}
