/** Vue csm_grid parity — #,##0 + f_dec; money/currency use locale currency. */

export function getLocaleNumberSeparators(locale: string): { group: string; decimal: string } {
	try {
		const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
		const group = parts.find((part) => part.type === "group")?.value || ",";
		const decimal = parts.find((part) => part.type === "decimal")?.value || ".";
		return { group, decimal };
	} catch {
		return { group: ",", decimal: "." };
	}
}

export function parseFlexibleNumberInput(input: unknown, locale?: string): number {
	if (typeof input === "number") return input;
	if (input == null) return Number.NaN;
	let text = String(input).trim();
	if (!text) return Number.NaN;

	if (locale) {
		const { group, decimal } = getLocaleNumberSeparators(locale);
		text = text
			.replace(/\s+/g, "")
			.replace(new RegExp(`[^0-9\\-\\${group}\\${decimal}]`, "g"), "")
			.replace(new RegExp(`\\${group}`, "g"), "")
			.replace(new RegExp(`\\${decimal}`, "g"), ".");
		return Number(text);
	}

	text = text.replace(/\s+/g, "").replace(/[^0-9,.-]/g, "");
	const lastComma = text.lastIndexOf(",");
	const lastDot = text.lastIndexOf(".");
	let normalized = text;

	if (lastComma >= 0 && lastDot >= 0) {
		const decimalSep = lastComma > lastDot ? "," : ".";
		const thousandSep = decimalSep === "," ? "." : ",";
		normalized = text.split(thousandSep).join("").replace(decimalSep, ".");
	} else if (lastComma >= 0) {
		const parts = text.split(",");
		if (parts.length > 2) {
			normalized = parts.join("");
		} else {
			const fraction = parts[1] || "";
			normalized = fraction.length === 3 ? parts.join("") : `${parts[0]}.${fraction}`;
		}
	}

	return Number(normalized);
}

export function resolveFieldDecimalPlaces(field: { f_types?: unknown; f_dec?: unknown }): number {
	const explicit = Number(field?.f_dec);
	if (Number.isFinite(explicit) && explicit >= 0) return explicit;
	const types = String(field?.f_types || "").toLowerCase();
	if (/float|double/.test(types)) return 2;
	return 0;
}

function resolveCurrencyCode(locale: string): string {
	return locale.toLowerCase().startsWith("vi") ? "VND" : "USD";
}

/** Grid display — mirrors Vue: price → #,##0[.decimals]; money/currency → currency symbol + grouping. */
export function formatGridNumberCell(
	value: unknown,
	locale: string,
	field: { f_types?: unknown; f_dec?: unknown; f_format?: unknown },
): string {
	if (value == null || value === "") return "";
	const types = String(field?.f_types || "").toLowerCase();
	const decimals = resolveFieldDecimalPlaces(field);
	const parsed = typeof value === "number" ? value : parseFlexibleNumberInput(value, locale);
	if (!Number.isFinite(parsed)) return String(value ?? "");

	if (/money|currency/.test(types)) {
		return new Intl.NumberFormat(locale, {
			style: "currency",
			currency: resolveCurrencyCode(locale),
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
		}).format(parsed);
	}

	return new Intl.NumberFormat(locale, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	}).format(parsed);
}

export function isGridNumberType(types: unknown): boolean {
	return /price|number|int|float|double|money|currency|digit|numeric/.test(String(types || "").toLowerCase());
}
