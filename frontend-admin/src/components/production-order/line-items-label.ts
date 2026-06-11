/** Resolve field/column label by UI language (VI / EN / ZH). */
export function resolveTriLangLabel(
	item: Record<string, any> | undefined | null,
	lang: string,
	fallbackKeys: string[] = ["label", "f_header", "f_name", "name"],
): string {
	if (!item) return "";
	const normalized = String(lang || "vi").toLowerCase().split("-")[0];
	const pick = (key: string) => {
		const value = item[key];
		return typeof value === "string" && value.trim() ? value.trim() : "";
	};

	if (normalized === "en") {
		return pick("label_en")
			|| pick("f_header_en")
			|| pick("label")
			|| pick("f_header")
			|| fallbackKeys.map(pick).find(Boolean)
			|| "";
	}
	if (normalized === "zh") {
		return pick("label_zh")
			|| pick("f_header_zh")
			|| pick("label")
			|| pick("f_header")
			|| fallbackKeys.map(pick).find(Boolean)
			|| "";
	}
	return pick("label")
		|| pick("f_header")
		|| pick("f_header_vi")
		|| pick("label_vi")
		|| fallbackKeys.map(pick).find(Boolean)
		|| "";
}

export function ensureTriLangLabels<T extends Record<string, any>>(item: T, baseKey = "label"): T {
	const base = String(item[baseKey] ?? item.f_header ?? item.name ?? "").trim();
	return {
		...item,
		[baseKey]: base || item[baseKey],
		[`${baseKey}_en`]: String(item[`${baseKey}_en`] ?? base).trim() || base,
		[`${baseKey}_zh`]: String(item[`${baseKey}_zh`] ?? base).trim() || base,
	};
}
