import { getAuthStorage } from "#src/utils/browser-client-id";

const AUTH_PERSIST_KEY = "access-token";
const USER_PERSIST_KEY = "user-info";
const REFRESH_MIRROR_KEY = "refreshToken";

export function readAuthPersistRaw(): string | null {
	try {
		return getAuthStorage().getItem(AUTH_PERSIST_KEY);
	} catch {
		return null;
	}
}

export function readUserPersistRaw(): string | null {
	try {
		return getAuthStorage().getItem(USER_PERSIST_KEY);
	} catch {
		return null;
	}
}

/** Keep refresh token readable for NWJS / refresh-token endpoint (mirrors Java body + header). */
export function syncRefreshTokenMirror(refreshToken?: string) {
	if (!refreshToken?.trim()) return;
	try {
		getAuthStorage().setItem(REFRESH_MIRROR_KEY, refreshToken.trim());
	} catch {
		// ignore
	}
}

export function readRefreshTokenMirror(): string | undefined {
	try {
		const fromMirror = getAuthStorage().getItem(REFRESH_MIRROR_KEY)?.trim();
		if (fromMirror) return fromMirror;
	} catch {
		// ignore
	}
	return undefined;
}

export function clearAuthPersistKeys() {
	const storage = getAuthStorage();
	try { storage.removeItem(AUTH_PERSIST_KEY); } catch {}
	try { storage.removeItem(USER_PERSIST_KEY); } catch {}
	try { storage.removeItem(REFRESH_MIRROR_KEY); } catch {}
	try { storage.removeItem("current_app_id"); } catch {}
	// Legacy localStorage keys from before tab isolation
	try { localStorage.removeItem(AUTH_PERSIST_KEY); } catch {}
	try { localStorage.removeItem(USER_PERSIST_KEY); } catch {}
	try { localStorage.removeItem(REFRESH_MIRROR_KEY); } catch {}
	try { localStorage.removeItem("current_app_id"); } catch {}
}
