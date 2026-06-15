import { andWhere, getTableData, invalidateTableDataCache } from "#src/components/csm-grid/CsmApi";
import { csmDecrypt } from "#src/components/csm-grid/CsmCrypto";
import { pickBestSysAutosRow } from "#src/pages/system/dynamic-code/reload";

const SAVED_PLACEHOLDER = /^\[saved:\d+ chars\]$/i;

function decryptSysAutosPCode(raw: string): string {
	const value = String(raw || "").trim();
	if (!value) return "";
	if (SAVED_PLACEHOLDER.test(value)) {
		throw new Error("sys_autos returned p_code placeholder instead of full code");
	}
	return csmDecrypt(value);
}

/** Always fetch latest sys_autos JS/HTML template from server (no client cache). */
export async function fetchSysAutosTemplateCode(
	pName: string,
	pType = 0,
): Promise<string> {
	const normalizedName = String(pName || "").trim();
	if (!normalizedName) {
		return "";
	}

	invalidateTableDataCache();
	const where = andWhere([
		{ field: "p_name", type: "eq", value: normalizedName },
		{ field: "p_type", type: "eq", value: pType },
	]);
	const res = await getTableData<any>({
		app_id: "csm",
		obj_name: "sys_autos",
		where,
		fresh: true,
	});
	const rows = (res as any)?.rows || (res as any)?.data || [];
	const codeRecord = pickBestSysAutosRow(rows, normalizedName, pType);
	if (!codeRecord?.p_code) {
		return "";
	}
	return decryptSysAutosPCode(codeRecord.p_code);
}

export async function fetchFirstSysAutosTemplateCode(
	candidateNames: string[],
	pType = 0,
): Promise<{ pName: string; code: string } | null> {
	for (const candidateName of candidateNames) {
		const name = String(candidateName || "").trim();
		if (!name) continue;
		try {
			const code = await fetchSysAutosTemplateCode(name, pType);
			if (code.trim()) {
				return { pName: name, code };
			}
		} catch (error) {
			console.warn(`[DynamicCode] Failed to load sys_autos template "${name}":`, error);
		}
	}
	return null;
}
