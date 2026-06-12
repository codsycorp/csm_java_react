import { csmDecrypt } from "#src/components/csm-grid/CsmCrypto";
import { useAppStore } from "#src/store/app";
import { useUserStore } from "#src/store/user";

const SYSTEM_CSM_TABLES = new Set([
	"csm_accounts",
	"csm_group_members",
]);

export type UserAppIdInput = {
	app_id?: string | null;
	app_token?: string | null;
	menusPermissions?: string[] | null;
	dev?: boolean | null;
};

/**
 * Mirror Java TableHandler.extractAppIdFromEncryptedAppToken /
 * UserService.mapMainAccountToUser — decrypt app_token, first segment before "_____".
 */
export function parseAppIdFromAppToken(
	appToken?: string | null,
	decrypt: (value: string) => string = csmDecrypt,
): string {
	const token = String(appToken ?? "").trim();
	if (!token) return "";

	try {
		let decrypted = "";
		try {
			decrypted = String(decrypt(token) ?? "").trim();
		} catch {
			decrypted = token;
		}
		if (!decrypted) return "";
		const parts = decrypted.split("_____");
		return String(parts[0] ?? "").trim();
	} catch {
		const rawParts = token.split("_____");
		return String(rawParts[0] ?? "").trim();
	}
}

function resolvePrimaryAppIdFromMenus(menus?: string[] | null): string {
	if (!menus?.length) return "";
	for (const menu of menus) {
		const normalized = String(menu ?? "").trim();
		if (!normalized || normalized === "csm") continue;
		if (normalized.startsWith("/") || normalized.startsWith("app:")) continue;
		if (!normalized.includes("/") && !normalized.includes(".")) return normalized;
	}
	return "";
}

/**
 * Mirror Java mapMainAccountToUser + Rust UserAccessContext::from_auth.
 * Priority: app_token → profile app_id → menus → app store.
 */
export function resolveEffectiveUserAppId(
	user: UserAppIdInput = {},
	decrypt: (value: string) => string = csmDecrypt,
): string {
	const fromToken = parseAppIdFromAppToken(user.app_token, decrypt);
	const fromProfile = String(user.app_id ?? "").trim();
	const fromMenus = resolvePrimaryAppIdFromMenus(user.menusPermissions);
	const fromStore = String(useAppStore.getState().getCurrentAppId?.() ?? "").trim();

	return fromToken || fromProfile || fromMenus || fromStore || "csm";
}

export function getUserAccessContext(): UserAppIdInput {
	const state = useUserStore.getState();
	return {
		app_id: state.app_id,
		app_token: state.app_token,
		menusPermissions: state.menusPermissions,
		dev: state.dev,
	};
}

/**
 * Normalize user-info payload after login / user-info API — same rules as backend.
 */
export function normalizeUserSessionAppId(
	user: UserAppIdInput = {},
	decrypt: (value: string) => string = csmDecrypt,
): string {
	return resolveEffectiveUserAppId(user, decrypt);
}

/**
 * app_id for get/update-table-data — mirror Java cross-app guard.
 * Tenant users always use home app_id; dev/csm operators may use preferred/menu app_id.
 */
export function resolveTableRequestAppId(
	tableName: string,
	preferredAppId?: string | null,
	user: UserAppIdInput = getUserAccessContext(),
	decrypt: (value: string) => string = csmDecrypt,
): string {
	const normalizedTable = String(tableName ?? "").trim().toLowerCase();
	if (SYSTEM_CSM_TABLES.has(normalizedTable)) return "csm";

	const homeAppId = resolveEffectiveUserAppId(user, decrypt);
	const preferred = String(preferredAppId ?? "").trim();
	const isDev = Boolean(user.dev);
	const isCsmOperator = homeAppId.toLowerCase() === "csm";

	if (isDev || isCsmOperator) {
		if (preferred) return preferred;
		return homeAppId || "csm";
	}

	if (homeAppId) return homeAppId;
	return preferred || "csm";
}
