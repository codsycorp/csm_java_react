import { getAuthStorage } from "#src/utils/browser-client-id";

const AUTH_PERSIST_KEY = "access-token";
const USER_PERSIST_KEY = "user-info";

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

export function clearAuthPersistKeys() {
	const storage = getAuthStorage();
	try { storage.removeItem(AUTH_PERSIST_KEY); } catch {}
	try { storage.removeItem(USER_PERSIST_KEY); } catch {}
	// Legacy localStorage keys from before tab isolation
	try { localStorage.removeItem(AUTH_PERSIST_KEY); } catch {}
	try { localStorage.removeItem(USER_PERSIST_KEY); } catch {}
	try { localStorage.removeItem("refreshToken"); } catch {}
}
