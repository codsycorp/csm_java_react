import { invalidateBroadcastHomeAutoCodeCache } from "#src/api/system/menu/index";
import { invalidateTableDataCache } from "#src/components/csm-grid/CsmApi";

export const DYNAMIC_CODE_RELOAD_EVENT = "csm:dynamic-code-reload";

export interface DynamicCodeReloadDetail {
	p_name: string;
	p_type?: number;
	action?: "create" | "update" | "delete";
}

const reloadVersionByPName = new Map<string, number>();
const reloadSubscribers = new Set<() => void>();

export function resolveWatchedPNames(autoCodeName: string, appId: string): string[] {
	const requested = String(autoCodeName || "").trim();
	const normalizedAppId = String(appId || "csm").trim();
	if (requested) {
		return [requested];
	}
	return [normalizedAppId, `broadcast_${normalizedAppId}`];
}

export function getDynamicCodeReloadVersion(pName: string): number {
	return reloadVersionByPName.get(String(pName || "").trim()) || 0;
}

export function getMatchingReloadVersion(watchedNames: string[]): number {
	if (!watchedNames.length) return 0;
	return Math.max(...watchedNames.map((name) => getDynamicCodeReloadVersion(name)));
}

export function subscribeDynamicCodeReload(listener: () => void): () => void {
	reloadSubscribers.add(listener);
	return () => reloadSubscribers.delete(listener);
}

function bumpReloadVersion(pName: string) {
	const key = String(pName || "").trim();
	if (!key) return;
	reloadVersionByPName.set(key, getDynamicCodeReloadVersion(key) + 1);
}

/** Whether a sys_autos save should reload this DynamicCodeMenu instance. */
export function matchesDynamicCodeReload(
	detail: DynamicCodeReloadDetail,
	options: {
		autoCodeName: string;
		appId: string;
	},
): boolean {
	const pType = detail.p_type ?? 0;
	if (pType !== 0) {
		return false;
	}
	const updated = String(detail.p_name || "").trim();
	if (!updated) {
		return false;
	}
	const watched = resolveWatchedPNames(options.autoCodeName, options.appId);
	return watched.includes(updated);
}

/** Drop client-side caches that can serve stale sys_autos code after save. */
export function invalidateClientSysAutosCaches(pName: string) {
	const normalized = String(pName || "").trim();
	if (!normalized) return;

	invalidateTableDataCache();

	if (normalized.startsWith("broadcast_")) {
		invalidateBroadcastHomeAutoCodeCache(normalized.slice("broadcast_".length));
	} else {
		invalidateBroadcastHomeAutoCodeCache(normalized);
	}

	if (typeof sessionStorage !== "undefined") {
		try {
			sessionStorage.removeItem("auto_setup_code");
			sessionStorage.removeItem("auto_setup_label");
		} catch {
			// Ignore storage errors in private mode.
		}
	}
}

export function notifyDynamicCodeReload(detail: DynamicCodeReloadDetail) {
	if (typeof window === "undefined") return;
	const pName = String(detail.p_name || "").trim();
	if (!pName) return;

	invalidateClientSysAutosCaches(pName);
	bumpReloadVersion(pName);
	reloadSubscribers.forEach((listener) => {
		try {
			listener();
		} catch {
			// Keep hot-reload fan-out resilient.
		}
	});

	window.dispatchEvent(new CustomEvent(DYNAMIC_CODE_RELOAD_EVENT, {
		detail: {
			p_name: pName,
			p_type: detail.p_type ?? 0,
			action: detail.action,
		},
	}));
}
