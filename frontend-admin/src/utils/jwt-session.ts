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
	return left === right;
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
	user: { userId?: string; app_token?: string; email?: string; username?: string },
): boolean {
	if (!claims) return true;
	const uid = String(claims.uid ?? "").trim();
	const sub = String(claims.sub ?? "").trim();
	if (uid && userIdsMatch(user.userId, uid)) return true;
	if (sub) {
		if (sub === String(user.app_token ?? "").trim()) return true;
		if (userIdsMatch(user.userId, sub)) return true;
		if (sub === String(user.email ?? "").trim()) return true;
		if (sub === String(user.username ?? "").trim()) return true;
	}
	return !uid && !sub;
}
