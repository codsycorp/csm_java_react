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

/** Plain tenant slug — not csm-encrypted blob or app_token payload. */
function isPlainTenantAppId(value: string): boolean {
	const text = String(value || "").trim();
	if (!text || text.includes("=") || text.includes("_____")) return false;
	return /^[a-z][a-z0-9_-]*$/i.test(text) && text.length <= 64;
}

/**
 * Normalize menu/profile app_id or csm_encrypt blob → plain tenant id (e.g. banhang).
 * Mirrors Java RecordManager.csm_decrypt + split("_____")[0].
 */
export function normalizePlainAppId(
	raw: unknown,
	decrypt: (value: string) => string = csmDecrypt,
): string {
	let text = String(raw ?? "").trim();
	if (!text) return "";
	if (isPlainTenantAppId(text)) {
		return text.toLowerCase() === "csm" ? "csm" : text;
	}

	const candidates: string[] = [text];
	const tryDecrypt = (fn: (value: string) => string) => {
		try {
			const dec = String(fn(text) ?? "").trim();
			if (dec && dec !== text && !candidates.includes(dec)) {
				candidates.unshift(dec);
				text = dec;
			}
		} catch {
			// ignore
		}
	};

	tryDecrypt(decrypt);
	if (decrypt !== csmDecrypt) {
		tryDecrypt(csmDecrypt);
	}

	for (const candidate of candidates) {
		const head = String(candidate.split("_____")[0] ?? "").trim();
		if (isPlainTenantAppId(head)) {
			return head.toLowerCase() === "csm" ? "csm" : head;
		}
	}

	return isPlainTenantAppId(text) ? text : "";
}

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
		return normalizePlainAppId(decrypted, decrypt);
	} catch {
		return normalizePlainAppId(token, decrypt);
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
	const fromProfile = normalizePlainAppId(user.app_id, decrypt);
	const fromMenus = normalizePlainAppId(resolvePrimaryAppIdFromMenus(user.menusPermissions), decrypt);
	const fromStore = normalizePlainAppId(useAppStore.getState().getCurrentAppId?.(), decrypt);

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
	const preferred = normalizePlainAppId(preferredAppId, decrypt);
	const isDev = Boolean(user.dev);
	const isCsmOperator = homeAppId.toLowerCase() === "csm";

	if (isDev || isCsmOperator) {
		if (preferred) return preferred;
		return homeAppId || "csm";
	}

	if (homeAppId) return homeAppId;
	return preferred || "csm";
}
