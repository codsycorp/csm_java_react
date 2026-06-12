/**
 * Browser profile + tab session isolation (Chrome-profile-like).
 * - browser client id: localStorage — one per browser profile (Chrome vs Firefox vs Chrome Profile B)
 * - tab session id: sessionStorage — one per tab (same profile, two accounts in two tabs)
 * Combined as X-Client-Id: `{browser}|{tab}` and bound to refresh tokens on the server.
 */

const BROWSER_CLIENT_KEY = "csm_browser_client_id";
const TAB_SESSION_KEY = "csm_tab_session_id";
const LEGACY_CLIENT_KEY = "csm_client_id";

function createId(prefix: string) {
	const randomPart =
		typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
			? crypto.randomUUID()
			: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
	return `${prefix}-${randomPart}`;
}

function readCookie(name: string) {
	if (typeof document === "undefined") return "";
	const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
	return match ? decodeURIComponent(match[1]) : "";
}

function writeBrowserClientCookie(value: string) {
	if (typeof document === "undefined" || !value) return;
	const secure = window.location.protocol === "https:" ? "; Secure" : "";
	document.cookie = `${LEGACY_CLIENT_KEY}=${encodeURIComponent(value)}; Path=/; Max-Age=${365 * 24 * 60 * 60}; SameSite=Lax${secure}`;
}

export function ensureBrowserClientId(): string {
	if (typeof window === "undefined") return "";
	try {
		const fromStorage = localStorage.getItem(BROWSER_CLIENT_KEY)
			|| localStorage.getItem(LEGACY_CLIENT_KEY)
			|| readCookie(LEGACY_CLIENT_KEY);
		if (fromStorage?.trim()) {
			const normalized = fromStorage.trim();
			localStorage.setItem(BROWSER_CLIENT_KEY, normalized);
			writeBrowserClientCookie(normalized);
			return normalized;
		}
	} catch {
		// fall through
	}
	const created = createId("csm");
	try {
		localStorage.setItem(BROWSER_CLIENT_KEY, created);
		localStorage.setItem(LEGACY_CLIENT_KEY, created);
		writeBrowserClientCookie(created);
	} catch {
		// ignore
	}
	return created;
}

export function ensureTabSessionId(): string {
	if (typeof window === "undefined") return "";
	try {
		const existing = sessionStorage.getItem(TAB_SESSION_KEY)?.trim();
		if (existing) return existing;
		const created = createId("tab");
		sessionStorage.setItem(TAB_SESSION_KEY, created);
		return created;
	} catch {
		return createId("tab");
	}
}

/** Value sent as X-Client-Id — bound to refresh session on backend. */
export function getClientSessionId(): string {
	const browser = ensureBrowserClientId();
	const tab = ensureTabSessionId();
	if (!browser) return tab;
	if (!tab) return browser;
	return `${browser}|${tab}`;
}

export function isNwjsRuntime(): boolean {
	if (typeof window === "undefined") return false;
	return Boolean((window as any).nw)
		|| navigator.userAgent.toLowerCase().includes("nwjs")
		|| navigator.userAgent.toLowerCase().includes("node-webkit");
}

/** Auth tokens: sessionStorage in browser (tab-isolated), localStorage in NWJS desktop. */
export function getAuthStorage(): Storage {
	if (typeof window === "undefined") {
		return localStorage;
	}
	return isNwjsRuntime() ? localStorage : sessionStorage;
}
