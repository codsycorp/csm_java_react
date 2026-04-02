export const PERMISSION_BITS = {
	menu: {
		min: 0,
		max: 30,
	},
	action: {
		view: 31,
		edit: 32,
		create: 33,
		delete: 34,
		export: 35,
	},
	dataScope: {
		owner: 41,
		department: 42,
		branch: 43,
		all: 44,
	},
} as const;

export type PermissionDataScope = "NONE" | "OWNER" | "DEPARTMENT" | "BRANCH" | "ALL";

const KNOWN_MENU_BITS: Record<string, number> = {
	dashboard: 0,
	"/dashboard": 0,
	home: 0,
	"/home": 0,
	user: 1,
	"/system/user": 1,
	role: 2,
	"/system/role": 2,
	menu: 3,
	"/system/menu": 3,
	dept: 4,
	"/system/dept": 4,
	developer: 5,
	"/system/developer": 5,
	broadcast: 6,
	"/system/broadcast": 6,
	report: 7,
	"/system/report": 7,
	crm: 8,
	"/crm": 8,
};

export function toPermissionBigInt(raw: unknown): bigint | null {
	if (raw === null || raw === undefined || raw === "") return null;

	if (typeof raw === "bigint") return raw;
	if (typeof raw === "number") {
		if (!Number.isFinite(raw)) return null;
		return BigInt(Math.trunc(raw));
	}
	if (typeof raw === "string") {
		const trimmed = raw.trim();
		if (!trimmed) return null;
		try {
			return BigInt(trimmed);
		} catch {
			try {
				const parsed = JSON.parse(trimmed);
				return toPermissionBigInt(parsed);
			} catch {
				return null;
			}
		}
	}
	if (Array.isArray(raw)) {
		for (const item of raw) {
			const parsed = toPermissionBigInt(item);
			if (parsed !== null) return parsed;
		}
		return null;
	}
	if (typeof raw === "object") {
		const obj = raw as Record<string, unknown>;
		const candidates = [
			obj.permissionBitfield,
			obj.permission_bitfield,
			obj.permissionsBitfield,
			obj.permissions_bitfield,
			obj.permissions,
			obj.mask,
			obj.value,
		];
		for (const candidate of candidates) {
			const parsed = toPermissionBigInt(candidate);
			if (parsed !== null) return parsed;
		}
	}

	return null;
}

export function hasPermissionBit(bitfield: bigint | null, bitIndex: number): boolean {
	if (bitfield === null || bitIndex < 0) return false;
	return (bitfield & (1n << BigInt(bitIndex))) !== 0n;
}

export function hasAnyPermissionBit(bitfield: bigint | null, startBit: number, endBit: number): boolean {
	if (bitfield === null) return false;
	for (let i = startBit; i <= endBit; i += 1) {
		if (hasPermissionBit(bitfield, i)) return true;
	}
	return false;
}

export function resolvePermissionDataScope(bitfield: bigint | null): PermissionDataScope {
	if (hasPermissionBit(bitfield, PERMISSION_BITS.dataScope.all)) return "ALL";
	if (hasPermissionBit(bitfield, PERMISSION_BITS.dataScope.branch)) return "BRANCH";
	if (hasPermissionBit(bitfield, PERMISSION_BITS.dataScope.department)) return "DEPARTMENT";
	if (hasPermissionBit(bitfield, PERMISSION_BITS.dataScope.owner)) return "OWNER";
	return "NONE";
}

export function parseMenuBitIndex(menuId: unknown): number | null {
	if (typeof menuId === "number" && Number.isInteger(menuId)) {
		return menuId >= PERMISSION_BITS.menu.min && menuId <= PERMISSION_BITS.menu.max ? menuId : null;
	}
	if (typeof menuId !== "string") return null;

	const trimmed = menuId.trim();
	if (!trimmed) return null;
	const lowered = trimmed.toLowerCase();
	if (KNOWN_MENU_BITS[lowered] != null) {
		return KNOWN_MENU_BITS[lowered];
	}

	if (/^\d+$/.test(trimmed)) {
		const index = Number.parseInt(trimmed, 10);
		return index >= PERMISSION_BITS.menu.min && index <= PERMISSION_BITS.menu.max ? index : null;
	}
	if (trimmed.startsWith("menu:")) {
		const raw = trimmed.slice(5);
		if (/^\d+$/.test(raw)) {
			const index = Number.parseInt(raw, 10);
			return index >= PERMISSION_BITS.menu.min && index <= PERMISSION_BITS.menu.max ? index : null;
		}
	}

	return null;
}
