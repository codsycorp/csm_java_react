import type { UserInfoType } from "#src/api/user/types";
import { normalizeUserSessionAppId } from "#src/utils/user-app-id";

type LoginResultPayload = Partial<UserInfoType> & Record<string, unknown>;

/**
 * Merge /user-info with /login payload — Java returns elevated profile on login;
 * user-info only refreshes profile fields without re-deriving permissions differently.
 */
export function buildLoginUserProfile(
	loginPayload: LoginResultPayload = {},
	userInfoPayload: LoginResultPayload = {},
): UserInfoType {
	const loginPerms = Array.isArray(loginPayload.permissions) ? loginPayload.permissions : [];
	const infoPerms = Array.isArray(userInfoPayload.permissions) ? userInfoPayload.permissions : [];
	const loginMenus = Array.isArray(loginPayload.menusPermissions) ? loginPayload.menusPermissions : [];
	const infoMenus = Array.isArray(userInfoPayload.menusPermissions) ? userInfoPayload.menusPermissions : [];

	const merged: UserInfoType = {
		...(userInfoPayload as UserInfoType),
		userId: String(loginPayload.userId ?? userInfoPayload.userId ?? ""),
		username: String(loginPayload.username ?? userInfoPayload.username ?? ""),
		email: String(loginPayload.email ?? userInfoPayload.email ?? ""),
		phoneNumber: String(loginPayload.phoneNumber ?? userInfoPayload.phoneNumber ?? ""),
		full_name: String(loginPayload.full_name ?? userInfoPayload.full_name ?? ""),
		avatar: String(loginPayload.avatar ?? userInfoPayload.avatar ?? ""),
		user_address: (loginPayload.user_address ?? userInfoPayload.user_address) as any,
		user_adress: (loginPayload.user_adress ?? userInfoPayload.user_adress) as any,
		app_token: String(loginPayload.app_token ?? userInfoPayload.app_token ?? ""),
		account_type: (loginPayload.account_type ?? userInfoPayload.account_type ?? "main") as "main" | "sub-user",
		is_sub_user: Boolean(loginPayload.is_sub_user ?? userInfoPayload.is_sub_user),
		login_identifier: String(loginPayload.login_identifier ?? userInfoPayload.login_identifier ?? ""),
		dev: Boolean(loginPayload.dev ?? userInfoPayload.dev),
		roles: loginPerms.length ? loginPerms : infoPerms,
		permissions: loginPerms.length ? loginPerms : infoPerms,
		menusPermissions: loginMenus.length ? loginMenus : infoMenus,
		permissionBitfield: String(loginPayload.permissionBitfield ?? userInfoPayload.permissionBitfield ?? ""),
		permissionSchemaVersion: String(loginPayload.permissionSchemaVersion ?? userInfoPayload.permissionSchemaVersion ?? ""),
		dataScope: (loginPayload.dataScope ?? userInfoPayload.dataScope ?? "NONE") as UserInfoType["dataScope"],
		app_id: "",
	};

	merged.app_id = normalizeUserSessionAppId({
		app_id: String(loginPayload.app_id ?? userInfoPayload.app_id ?? ""),
		app_token: merged.app_token,
		menusPermissions: merged.menusPermissions,
		dev: merged.dev,
	});

	return merged;
}

export function resolveLoginAppId(loginPayload: LoginResultPayload = {}, userInfoPayload: LoginResultPayload = {}): string {
	const loginAppId = String(loginPayload.app_id ?? "").trim();
	const profileAppId = String(userInfoPayload.app_id ?? "").trim();
	const fromToken = normalizeUserSessionAppId({
		app_id: loginAppId || profileAppId,
		app_token: String(loginPayload.app_token ?? userInfoPayload.app_token ?? ""),
		menusPermissions: (loginPayload.menusPermissions ?? userInfoPayload.menusPermissions) as string[],
		dev: Boolean(loginPayload.dev ?? userInfoPayload.dev),
	});
	return fromToken || profileAppId || loginAppId || "csm";
}
