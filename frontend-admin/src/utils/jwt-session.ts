export type JwtSessionClaims = {
	uid?: string;
	sub?: string;
};

function normalizeUserId(raw?: string | null): string {
	const trimmed = String(raw ?? "").trim();
	if (!trimmed) return "";
	try {
		const decoded = atob(trimmed.replace(/-/g, "+").replace(/_/g, "/"));
		const text = decoded.trim();
		if (text) return text;
	} catch {
		// not base64 — keep raw value
	}
	return trimmed;
}

function userIdsMatch(dbId?: string, claimUid?: string): boolean {
	const left = normalizeUserId(dbId);
	const right = normalizeUserId(claimUid);
	if (!left || !right) return false;
	if (left === right) return true;
	return left.replace(/-/g, "") === right.replace(/-/g, "");
}

export function profileIdsMatch(a?: string, b?: string): boolean {
	return userIdsMatch(a, b);
}

export function parseJwtSessionClaims(token?: string | null): JwtSessionClaims | null {
	const raw = String(token ?? "").trim();
	if (!raw) return null;
	const parts = raw.split(".");
	if (parts.length < 2) return null;
	try {
		const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
		const json = JSON.parse(atob(padded));
		return {
			uid: typeof json?.uid === "string" ? json.uid : undefined,
			sub: typeof json?.sub === "string" ? json.sub : undefined,
		};
	} catch {
		return null;
	}
}

export function sessionClaimsMatchUser(
	claims: JwtSessionClaims | null,
	user: { userId?: string; app_token?: string; email?: string; username?: string; login_identifier?: string },
): boolean {
	if (!claims) return true;
	const uid = String(claims.uid ?? "").trim();
	const sub = String(claims.sub ?? "").trim();
	if (uid && userIdsMatch(user.userId, uid)) return true;
	if (sub) {
		const appToken = String(user.app_token ?? "").trim();
		if (appToken && sub === appToken) return true;
		if (userIdsMatch(user.userId, sub)) return true;
		if (sub === String(user.email ?? "").trim()) return true;
		if (sub === String(user.username ?? "").trim()) return true;
		if (sub === String(user.login_identifier ?? "").trim()) return true;
	}
	return !uid && !sub;
}

/** Drop stale /user-info payload when it disagrees with fresh /login result. */
export function sanitizeUserInfoAgainstLogin<T extends { userId?: string; app_token?: string }>(
	loginPayload: T,
	userInfoPayload: T,
): T {
	if (!userInfoPayload?.userId) return userInfoPayload;
	if (!loginPayload?.userId) return userInfoPayload;
	if (profileIdsMatch(loginPayload.userId, userInfoPayload.userId)) {
		const loginToken = String(loginPayload.app_token ?? "").trim();
		const infoToken = String(userInfoPayload.app_token ?? "").trim();
		if (!loginToken || !infoToken || loginToken === infoToken) {
			return userInfoPayload;
		}
	}
	return {} as T;
}
