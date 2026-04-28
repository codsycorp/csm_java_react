const MENU_PREFIX_PATTERN = /^(?:[A-Za-z]+|\d+)(?:\.(?:[A-Za-z]+|\d+))*\.(?=\s*\S)\s*/u;
const I18N_KEY_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;

export function stripMenuCodePrefix(raw: unknown): string {
	const value = String(raw ?? "").trim();
	if (!value) return "";
	if (I18N_KEY_PATTERN.test(value)) return value;
	const stripped = value.replace(MENU_PREFIX_PATTERN, "").trim();
	return stripped || value;
}

export function normalizeMenuLabel(raw: unknown): string {
	return stripMenuCodePrefix(raw);
}
