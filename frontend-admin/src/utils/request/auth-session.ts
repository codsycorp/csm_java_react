import { fetchRefreshToken } from "#src/api/user";
import { useAuthStore } from "#src/store";

import { AUTH_HEADER } from "./constants";

export function readPersistedAuthState(): { token?: string; refreshToken?: string; csrfToken?: string } {
	try {
		const raw = localStorage.getItem("access-token");
		if (!raw) {
			return {};
		}
		const parsed = JSON.parse(raw);
		const state = parsed?.state || {};
		return {
			token: typeof state.token === "string" ? state.token : undefined,
			refreshToken: typeof state.refreshToken === "string" ? state.refreshToken : undefined,
			csrfToken: typeof state.csrfToken === "string" ? state.csrfToken : undefined,
		};
	} catch {
		return {};
	}
}

export function getAuthCredentials() {
	const persisted = readPersistedAuthState();
	try {
		const state = useAuthStore.getState();
		return {
			token: state.token || persisted.token,
			refreshToken: state.refreshToken || persisted.refreshToken,
			csrfToken: state.csrfToken || persisted.csrfToken,
		};
	} catch {
		return persisted;
	}
}

export function hasAuthSession(): boolean {
	const creds = getAuthCredentials();
	if (creds.token || creds.refreshToken || creds.csrfToken) {
		return true;
	}
	if (typeof document === "undefined") {
		return false;
	}
	return /(?:^|; )refreshToken=([^;]*)/.test(document.cookie);
}

export function applyAuthHeadersToRequest(request: Request) {
	const creds = getAuthCredentials();
	if (creds.token) {
		request.headers.set(AUTH_HEADER, creds.token);
	}
	if (creds.refreshToken) {
		request.headers.set("X-Refresh-Token", creds.refreshToken);
	}
	if (["POST", "PUT", "DELETE"].includes(request.method.toUpperCase())) {
		let csrfToken = creds.csrfToken || "";
		if (!csrfToken && typeof document !== "undefined") {
			const match = document.cookie.match(/(?:^|; )CSRF-TOKEN=([^;]*)/);
			if (match?.[1]) {
				csrfToken = decodeURIComponent(match[1]);
			}
		}
		if (csrfToken) {
			request.headers.delete("X-CSRF-Token");
			request.headers.set("X-CSRF-Token", csrfToken);
		}
	}
}

/**
 * Ensure access/refresh credentials exist before protected table APIs.
 * Proactively refreshes when only refresh token is available.
 */
export async function ensureAuthSessionReady(): Promise<boolean> {
	if (!hasAuthSession()) {
		return false;
	}

	const creds = getAuthCredentials();
	if (creds.token) {
		return true;
	}

	if (!creds.refreshToken) {
		return hasAuthSession();
	}

	try {
		const freshResponse = await fetchRefreshToken();
		const nextToken = freshResponse?.result?.token;
		const nextRefreshToken = freshResponse?.result?.refreshToken;
		const nextCsrfToken = freshResponse?.result?.csrfToken;
		if (nextToken) {
			useAuthStore.setState({ token: nextToken });
		}
		if (nextRefreshToken) {
			useAuthStore.setState({ refreshToken: nextRefreshToken });
			try {
				localStorage.setItem("refreshToken", nextRefreshToken);
			} catch {}
		}
		if (nextCsrfToken) {
			useAuthStore.setState({ csrfToken: nextCsrfToken });
		}
		return Boolean(nextToken || nextRefreshToken || hasAuthSession());
	} catch (error) {
		console.warn("[Auth] ensureAuthSessionReady refresh failed:", error);
		return hasAuthSession();
	}
}
