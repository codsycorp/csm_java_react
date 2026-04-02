/**
 * Date format utility - chuyển đổi từ JavaScript sang TypeScript
 * Hỗ trợ format ngày tháng theo các mask pattern
 */

interface DateFormatMasks {
	default: string
	shortDate: string
	mediumDate: string
	longDate: string
	fullDate: string
	shortTime: string
	mediumTime: string
	longTime: string
	isoDate: string
	isoTime: string
	isoDateTime: string
	isoUtcDateTime: string
	[key: string]: string
}

interface DateFormatI18n {
	dayNames: string[]
	monthNames: string[]
}

const token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|"[^"]*"|'[^']*'/g;
const timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g;
const timezoneClip = /[^-+\dA-Z]/g;

function pad(val: string | number, len = 2): string {
	let valStr = String(val);
	while (valStr.length < len) valStr = `0${valStr}`;
	return valStr;
}

// Some common format strings
export const dateFormatMasks: DateFormatMasks = {
	default: "ddd mmm dd yyyy HH:MM:ss",
	shortDate: "m/d/yy",
	mediumDate: "mmm d, yyyy",
	longDate: "mmmm d, yyyy",
	fullDate: "dddd, mmmm d, yyyy",
	shortTime: "h:MM TT",
	mediumTime: "h:MM:ss TT",
	longTime: "h:MM:ss TT Z",
	isoDate: "yyyy-mm-dd",
	isoTime: "HH:MM:ss",
	isoDateTime: "yyyy-mm-dd'T'HH:MM:ss",
	isoUtcDateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'",
};

// Internationalization strings
export const dateFormatI18n: DateFormatI18n = {
	dayNames: [
		"Sun",
		"Mon",
		"Tue",
		"Wed",
		"Thu",
		"Fri",
		"Sat",
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	],
	monthNames: [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	],
};

/**
 * Format ngày tháng theo mask pattern
 * @param date - Date object, string, hoặc undefined (mặc định là ngày hiện tại)
 * @param mask - Pattern format hoặc key trong dateFormatMasks
 * @param utc - Sử dụng UTC thay vì local time
 * @returns Chuỗi ngày đã format
 */
export function dateFormat(date?: Date | string | null, mask?: string, utc?: boolean): string {
	let dateObj: Date;

	if (typeof date === "string") {
		let parts: number[] | undefined;
		if (date.includes("/")) {
			parts = date.split("/").map(Number); // YYYY/MM/DD hoặc DD/MM/YYYY
		}
		else if (date.includes("-")) {
			parts = date.split("-").map(Number); // YYYY-MM-DD
		}
		if (parts && parts.length === 3) {
			// Giả định DD/MM/YYYY nếu parts[0] <= 31
			if (parts[0] <= 31) {
				dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
			}
			else {
				dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
			}
		}
		else {
			dateObj = new Date(date);
		}
	}
	else if (date instanceof Date) {
		dateObj = date;
	}
	else {
		dateObj = new Date();
	}

	if (isNaN(dateObj.getTime()))
		dateObj = new Date(); // Xử lý trường hợp lỗi ngày tháng

	let maskStr = String(dateFormatMasks[mask || ""] || mask || dateFormatMasks.default);

	if (maskStr.slice(0, 4) === "UTC:") {
		maskStr = maskStr.slice(4);
		utc = true;
	}

	const _ = utc ? "getUTC" : "get";
	const d = (dateObj as any)[`${_}Date`]();
	const D = (dateObj as any)[`${_}Day`]();
	const m = (dateObj as any)[`${_}Month`]();
	const y = (dateObj as any)[`${_}FullYear`]();
	const H = (dateObj as any)[`${_}Hours`]();
	const M = (dateObj as any)[`${_}Minutes`]();
	const s = (dateObj as any)[`${_}Seconds`]();
	const L = (dateObj as any)[`${_}Milliseconds`]();
	const o = utc ? 0 : dateObj.getTimezoneOffset();

	const flags: Record<string, string | number> = {
		d,
		dd: pad(d),
		ddd: dateFormatI18n.dayNames[D],
		dddd: dateFormatI18n.dayNames[D + 7],
		m: m + 1,
		mm: pad(m + 1),
		mmm: dateFormatI18n.monthNames[m],
		mmmm: dateFormatI18n.monthNames[m + 12],
		yy: String(y).slice(2),
		yyyy: y,
		h: H % 12 || 12,
		hh: pad(H % 12 || 12),
		H,
		HH: pad(H),
		M,
		MM: pad(M),
		s,
		ss: pad(s),
		l: pad(L, 3),
		L: pad(L > 99 ? Math.round(L / 10) : L),
		t: H < 12 ? "a" : "p",
		tt: H < 12 ? "am" : "pm",
		T: H < 12 ? "A" : "P",
		TT: H < 12 ? "AM" : "PM",
		Z: utc ? "UTC" : (String(dateObj).match(timezone) || [""]).pop()?.replace(timezoneClip, "") || "",
		o: (o > 0 ? "-" : "+") + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
		S: ["th", "st", "nd", "rd"][d % 10 > 3 ? 0 : (d % 100 - d % 10 !== 10 ? 1 : 0) * (d % 10)],
	};

	return maskStr.replace(token, ($0) => {
		return $0 in flags ? String(flags[$0]) : $0.slice(1, $0.length - 1);
	});
}

/**
 * Chuyển chuỗi ngày theo format sang Date object
 * @param st - Chuỗi ngày cần chuyển
 * @param fm - Format pattern (ví dụ: "dd/mm/yyyy", "dd/mm/yyyy HH:MM:ss")
 * @returns Date object hoặc false nếu không hợp lệ
 */
export function chuyenNgay(st: string, fm: string): Date | false {
	try {
		if (typeof st !== "string" || typeof fm !== "string")
			return false;

		// Map các thành phần định dạng sang regex
		const formatRegex = fm
			.replace(/dd/g, "(\\d{2})")
			.replace(/mm/g, "(\\d{2})")
			.replace(/yyyy/g, "(\\d{4})")
			.replace(/HH/g, "(\\d{2})")
			.replace(/MM/g, "(\\d{2})")
			.replace(/ss/g, "(\\d{2})");

		const regex = new RegExp(`^${formatRegex}$`);
		const match = st.match(regex);
		if (!match)
			return false;

		// Tạo map các thành phần
		const parts: Record<string, number> = {};
		const fields = fm.match(/(dd|mm|yyyy|HH|MM|ss)/g) || [];
		fields.forEach((f, i) => {
			parts[f] = Number.parseInt(match[i + 1], 10);
		});

		// Mặc định giờ/phút/giây nếu không có
		const day = parts.dd || 1;
		const month = (parts.mm || 1) - 1;
		const year = parts.yyyy || 1970;
		const hour = parts.HH || 0;
		const minute = parts.MM || 0;
		const second = parts.ss || 0;

		const dateObj = new Date(year, month, day, hour, minute, second);

		// Kiểm tra lại tính hợp lệ (tránh các ngày như 31/02)
		if (
			dateObj.getFullYear() !== year
			|| dateObj.getMonth() !== month
			|| dateObj.getDate() !== day
			|| dateObj.getHours() !== hour
			|| dateObj.getMinutes() !== minute
			|| dateObj.getSeconds() !== second
		) {
			return false;
		}

		return dateObj;
	}
	catch (ex) {
		return false;
	}
}

/**
 * Tính số ngày giữa hai ngày
 * @param tu_ngay - Ngày bắt đầu
 * @param den_ngay - Ngày kết thúc
 * @param fm - Format pattern
 * @returns Số ngày chênh lệch
 */
export function TruNgayRaSoNgay(tu_ngay: string, den_ngay: string, fm: string): number {
	const utcThis = chuyenNgay(tu_ngay, fm);
	const utcOther = chuyenNgay(den_ngay, fm);
	if (!utcThis || !utcOther)
		return 0;
	const factor = 24 * 60 * 60 * 1000;
	return (utcThis.getTime() - utcOther.getTime()) / factor;
}

/**
 * Cộng số ngày vào một ngày
 * @param strngay - Chuỗi ngày
 * @param so_cong_vao - Số ngày cần cộng
 * @param fm - Format pattern
 * @returns Chuỗi ngày sau khi cộng (format dd/mm/yyyy)
 */
export function CongNgay(strngay: string, so_cong_vao: number, fm: string): string {
	const ngay = chuyenNgay(strngay, fm);
	if (!ngay)
		return "";
	const factor = 24 * 60 * 60 * 1000;
	return dateFormat(new Date(ngay.getTime() + so_cong_vao * factor), "dd/mm/yyyy");
}

/**
 * Cộng số giờ vào một ngày
 * @param strngay - Chuỗi ngày
 * @param so_gio_cong_vao - Số giờ cần cộng
 * @param fm - Format pattern
 * @returns Chuỗi ngày sau khi cộng (format dd/mm/yyyy HH:MM:ss)
 */
export function CongGio(strngay: string, so_gio_cong_vao: number, fm: string): string {
	const ngay = chuyenNgay(strngay, fm);
	if (!ngay)
		return "";
	const factor = 60 * 60 * 1000;
	return dateFormat(new Date(ngay.getTime() + so_gio_cong_vao * factor), "dd/mm/yyyy HH:MM:ss");
}

/**
 * Chuyển chuỗi sang Date theo format (hỗ trợ nhiều format)
 * @param dateStr - Chuỗi ngày
 * @param format - Format pattern
 * @returns Date object
 */
export function toDate(dateStr: string, format: string): Date {
	const normalized = dateStr.replace(/[^a-z0-9]/gi, "-");
	const normalizedFormat = format.toLowerCase().replace(/[^a-z0-9]/gi, "-");
	const formatItems = normalizedFormat.split("-");
	const dateItems = normalized.split("-");

	const monthIndex = formatItems.indexOf("mm");
	const dayIndex = formatItems.indexOf("dd");
	const yearIndex = formatItems.indexOf("yyyy");
	const hourIndex = formatItems.indexOf("hh");
	const minutesIndex = formatItems.indexOf("ii");
	const secondsIndex = formatItems.indexOf("ss");

	const today = new Date();
	const year = yearIndex > -1 ? Number.parseInt(dateItems[yearIndex], 10) : today.getFullYear();
	const month = monthIndex > -1 ? Number.parseInt(dateItems[monthIndex], 10) - 1 : today.getMonth() - 1;
	const day = dayIndex > -1 ? Number.parseInt(dateItems[dayIndex], 10) : today.getDate();
	const hour = hourIndex > -1 ? Number.parseInt(dateItems[hourIndex], 10) : today.getHours();
	const minute = minutesIndex > -1 ? Number.parseInt(dateItems[minutesIndex], 10) : today.getMinutes();
	const second = secondsIndex > -1 ? Number.parseInt(dateItems[secondsIndex], 10) : today.getSeconds();

	return new Date(year, month, day, hour, minute, second);
}

// Export default cho compatibility
export default {
	dateFormat,
	chuyenNgay,
	TruNgayRaSoNgay,
	CongNgay,
	CongGio,
	toDate,
	masks: dateFormatMasks,
	i18n: dateFormatI18n,
};
