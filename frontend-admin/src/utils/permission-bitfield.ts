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

const V3_RESERVED_SIGNATURE = 0x43534d33n; // "CSM3"
const V3_MENU_SHIFT = 48n;
const V3_ACTION_SHIFT = 40n;
const V3_SCOPE_SHIFT = 32n;
const V3_MENU_MASK = 0xffffn;
const V3_BYTE_MASK = 0xffn;

function parseBigIntByRadix(text: string, radix: number): bigint | null {
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
	if (radix < 2 || radix > alphabet.length) return null;
	const normalized = text.trim().toLowerCase();
	if (!normalized) return null;
	let result = 0n;
	const base = BigInt(radix);
	for (const ch of normalized) {
		const digit = alphabet.indexOf(ch);
		if (digit < 0 || digit >= radix) return null;
		result = (result * base) + BigInt(digit);
	}
	return result;
}

export type PermissionDataScope = "NONE" | "OWNER" | "DEPARTMENT" | "BRANCH" | "ALL";

const KNOWN_MENU_BITS: Record<string, number> = {
	dashboard: 0,
	"/dashboard": 0,
	homepage: 0,
	"/homepage": 0,
	user: 1,
	"/system/user": 1,
	role: 2,
	"/system/role": 2,
	"/system/roles": 2,
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
		const trimmed = raw.trim().replace(/_/g, "");
		if (!trimmed) return null;
		const normalized = trimmed.toLowerCase();
		if (normalized.startsWith("b36:")) {
			return parseBigIntByRadix(trimmed.slice(4), 36);
		}
		if (normalized.startsWith("b64:")) {
			const payload = trimmed.slice(4);
			try {
				const urlSafe = payload.replace(/-/g, "+").replace(/_/g, "/");
				const padded = urlSafe + "=".repeat((4 - (urlSafe.length % 4)) % 4);
				const decoded = globalThis.atob ? globalThis.atob(padded) : "";
				if (!decoded) return null;
				let value = 0n;
				for (let i = 0; i < decoded.length; i += 1) {
					value = (value << 8n) | BigInt(decoded.charCodeAt(i) & 0xff);
				}
				return value;
			} catch {
				return null;
			}
		}
		if (/^[0-9a-z]+$/i.test(trimmed) && /[a-z]/i.test(trimmed)) {
			const base36 = parseBigIntByRadix(trimmed, 36);
			if (base36 !== null) return base36;
		}
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

function isSecurityTokenV3(bitfield: bigint | null): boolean {
	if (bitfield === null) return false;
	return (bitfield & 0xffffffffn) === V3_RESERVED_SIGNATURE;
}

function normalizeToSingleToken(bitfield: bigint | null): bigint | null {
	if (bitfield === null) return null;
	if (isSecurityTokenV3(bitfield)) return bitfield;

	let menuMask = 0n;
	for (let i = 0; i <= 15; i += 1) {
		if ((bitfield & (1n << BigInt(i))) !== 0n) {
			menuMask = menuMask | (1n << BigInt(i));
		}
	}

	let actionMask = 0n;
	if ((bitfield & (1n << BigInt(PERMISSION_BITS.action.view))) !== 0n) actionMask = actionMask | (1n << 0n);
	if ((bitfield & (1n << BigInt(PERMISSION_BITS.action.create))) !== 0n) actionMask = actionMask | (1n << 1n);
	if ((bitfield & (1n << BigInt(PERMISSION_BITS.action.edit))) !== 0n) actionMask = actionMask | (1n << 2n);
	if ((bitfield & (1n << BigInt(PERMISSION_BITS.action.delete))) !== 0n) actionMask = actionMask | (1n << 3n);
	if ((bitfield & (1n << BigInt(PERMISSION_BITS.action.export))) !== 0n) actionMask = actionMask | (1n << 4n);

	let scopeMask = 0n;
	if ((bitfield & (1n << BigInt(PERMISSION_BITS.dataScope.owner))) !== 0n) scopeMask = scopeMask | (1n << 0n);
	if ((bitfield & (1n << BigInt(PERMISSION_BITS.dataScope.department))) !== 0n) scopeMask = scopeMask | (1n << 1n);
	if ((bitfield & (1n << BigInt(PERMISSION_BITS.dataScope.branch))) !== 0n) scopeMask = scopeMask | (1n << 2n);
	if ((bitfield & (1n << BigInt(PERMISSION_BITS.dataScope.all))) !== 0n) scopeMask = scopeMask | (1n << 3n);

	return (menuMask << V3_MENU_SHIFT)
		| (actionMask << V3_ACTION_SHIFT)
		| (scopeMask << V3_SCOPE_SHIFT)
		| V3_RESERVED_SIGNATURE;
}

function hasMaskBit(mask: bigint, bitPosition: number): boolean {
	if (bitPosition < 0) return false;
	return (mask & (1n << BigInt(bitPosition))) !== 0n;
}

function extractV3MenuMask(bitfield: bigint): bigint {
	return (bitfield >> V3_MENU_SHIFT) & V3_MENU_MASK;
}

function extractV3ActionMask(bitfield: bigint): bigint {
	return (bitfield >> V3_ACTION_SHIFT) & V3_BYTE_MASK;
}

function extractV3ScopeMask(bitfield: bigint): bigint {
	return (bitfield >> V3_SCOPE_SHIFT) & V3_BYTE_MASK;
}

function hasPermissionBitV3(bitfield: bigint, bitIndex: number): boolean {
	if (bitIndex < 0) return false;

	if (bitIndex >= PERMISSION_BITS.menu.min && bitIndex <= 15) {
		return hasMaskBit(extractV3MenuMask(bitfield), bitIndex);
	}
	if (bitIndex > 15 && bitIndex <= PERMISSION_BITS.menu.max) {
		return false;
	}

	if (bitIndex === PERMISSION_BITS.action.view) return hasMaskBit(extractV3ActionMask(bitfield), 0);
	if (bitIndex === PERMISSION_BITS.action.create) return hasMaskBit(extractV3ActionMask(bitfield), 1);
	if (bitIndex === PERMISSION_BITS.action.edit) return hasMaskBit(extractV3ActionMask(bitfield), 2);
	if (bitIndex === PERMISSION_BITS.action.delete) return hasMaskBit(extractV3ActionMask(bitfield), 3);
	if (bitIndex === PERMISSION_BITS.action.export) return hasMaskBit(extractV3ActionMask(bitfield), 4);

	if (bitIndex === PERMISSION_BITS.dataScope.owner) return hasMaskBit(extractV3ScopeMask(bitfield), 0);
	if (bitIndex === PERMISSION_BITS.dataScope.department) return hasMaskBit(extractV3ScopeMask(bitfield), 1);
	if (bitIndex === PERMISSION_BITS.dataScope.branch) return hasMaskBit(extractV3ScopeMask(bitfield), 2);
	if (bitIndex === PERMISSION_BITS.dataScope.all) return hasMaskBit(extractV3ScopeMask(bitfield), 3);

	return false;
}

export function hasPermissionBit(bitfield: bigint | null, bitIndex: number): boolean {
	if (bitIndex < 0) return false;
	const normalized = normalizeToSingleToken(bitfield);
	if (normalized === null) return false;
	return hasPermissionBitV3(normalized, bitIndex);
}

export function hasAnyPermissionBit(bitfield: bigint | null, startBit: number, endBit: number): boolean {
	if (bitfield === null) return false;
	for (let i = startBit; i <= endBit; i += 1) {
		if (hasPermissionBit(bitfield, i)) return true;
	}
	return false;
}

export function resolvePermissionDataScope(bitfield: bigint | null): PermissionDataScope {
	const normalized = normalizeToSingleToken(bitfield);
	if (normalized === null) return "NONE";
	const scopeMask = extractV3ScopeMask(normalized);
	if (hasMaskBit(scopeMask, 3)) return "ALL";
	if (hasMaskBit(scopeMask, 2)) return "BRANCH";
	if (hasMaskBit(scopeMask, 1)) return "DEPARTMENT";
	if (hasMaskBit(scopeMask, 0)) return "OWNER";
	return "NONE";
}

export function hasFullActionPermissions(bitfield: bigint | null): boolean {
	return hasPermissionBit(bitfield, PERMISSION_BITS.action.view)
		&& hasPermissionBit(bitfield, PERMISSION_BITS.action.create)
		&& hasPermissionBit(bitfield, PERMISSION_BITS.action.edit)
		&& hasPermissionBit(bitfield, PERMISSION_BITS.action.delete)
		&& hasPermissionBit(bitfield, PERMISSION_BITS.action.export);
}

export function isSuperPermissionProfile(bitfield: bigint | null): boolean {
	if (!hasFullActionPermissions(bitfield)) {
		return false;
	}
	return resolvePermissionDataScope(bitfield) === "ALL";
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
