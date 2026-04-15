// No AuthType needed for cookie-based auth

export interface UserInfoType {
	userId: string
	avatar: string
	username: string
	email: string
	phoneNumber: string
	full_name?: string
	description: string
	roles: string[]
	permissions: string[]
	menusPermissions: string[]
	permissionBitfield?: string
	permissionSchemaVersion?: string
	dataScope?: "NONE" | "OWNER" | "DEPARTMENT" | "BRANCH" | "ALL"
	dept_id?: string
	branch_id?: string
	app_id: string
	app_token: string
	dev?: boolean // Thêm dev flag từ backend
	account_type?: "main" | "sub-user"
	is_sub_user?: boolean
	login_identifier?: string
}

export interface AuthListProps {
	label: string
	name: string
	auth: string[]
}
