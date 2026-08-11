// No AuthType needed for cookie-based auth

export interface UserInfoType {
	userId: string
	avatar: string
	username: string
	email: string
	phoneNumber: string
	user_address?: string
	user_adress?: string
	full_name?: string
	description: string
	roles: string[]
	permissions: string[]
	menusPermissions: string[]
	permissionBitfield?: string
	permissionSchemaVersion?: string
	dataScope?: "NONE" | "OWNER" | "DEPARTMENT" | "BRANCH" | "ALL"
	account_expiry_at?: number
	accountExpiryAt?: number
	account_expiry_date?: string
	accountExpiryDate?: string
	account_remaining_days?: number
	accountRemainingDays?: number
	account_expiry_warning_level?: "expired" | "critical" | "high" | "medium" | ""
	accountExpiryWarningLevel?: "expired" | "critical" | "high" | "medium" | ""
	account_expiry_warning_message?: string
	accountExpiryWarningMessage?: string
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
