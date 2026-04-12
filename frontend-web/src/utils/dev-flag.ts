// Helpers to interpret backend dev flag values that may come as boolean, number, or string
export function resolveDevFlag(devFlag?: unknown, roles?: string[]): boolean {
	if (devFlag === true) return true;
	if (typeof devFlag === "number") return devFlag === 1;
	if (typeof devFlag === "string") {
		const lower = devFlag.trim().toLowerCase();
		if (["true", "1", "yes", "y", "on", "dev"].includes(lower)) return true;
	}
	if (Array.isArray(roles)) {
		return roles.some(r => typeof r === "string" && r.trim().toLowerCase() === "dev");
	}
	return false;
}

export function persistDevLocalFlag(isDev: boolean) {
	if (isDev) {
		localStorage.setItem("user_dev", "true");
	} else {
		localStorage.removeItem("user_dev");
	}
}
