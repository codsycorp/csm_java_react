import { request } from "#src/utils";
import { dateFormat, chuyenNgay, TruNgayRaSoNgay, CongNgay, CongGio, toDate } from "#src/utils/dateFormat";

// Helper: chuẩn hóa chuỗi ngày về dd/MM/yyyy nếu có thể
function normalizeDateString(dateStr?: string): string | null {
	if (!dateStr) {
		return null;
	}
	const s = String(dateStr).trim();
	if (!s) {
		return null;
	}
	if (s.includes("/")) {
		// Giả định dd/MM/yyyy
		const parts = s.split("/");
		if (parts.length === 3) {
			return `${parts[0].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[2]}`;
		}
		return s;
	}
	const digits = s.replace(/\D/g, "");
	if (digits.length === 8) {
		// yyyyMMdd -> dd/MM/yyyy
		const yyyy = digits.slice(0, 4);
		const MM = digits.slice(4, 6);
		const dd = digits.slice(6, 8);
		return `${dd}/${MM}/${yyyy}`;
	}
	return s || null;
}

// Helper: map dd/MM/yyyy -> mã thứ tuần: T2..T7, CN
function thuFromDate(dateStr?: string): string | null {
	const n = normalizeDateString(dateStr);
	if (!n) {
		return null;
	}
	const [dd, mm, yyyy] = n.split("/").map(x => Number.parseInt(x, 10));
	if (!yyyy || !mm || !dd) {
		return null;
	}
	const d = new Date(yyyy, mm - 1, dd);
	// getDay(): 0 CN, 1 T2 .. 6 T7
	const map = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;
	return map[d.getDay()] || null;
}

// Hàm lấy dữ liệu động từ API cho từng bảng kqxs_*
// Tham số:
// - obj_name: tên bảng
// - e_where: điều kiện đơn (giữ tương thích cũ)
// - tuNgay, denNgay: khoảng ngày (dd/MM/yyyy)
// - thu: T2..T7 hoặc CN (lọc client theo ngày)
async function getKQXSData(
	obj_name: string,
	e_where?: TableWhere | null,
	tuNgay?: string,
	denNgay?: string,
	thu?: string,
): Promise<any[]> {
	const DATE_FIELD = "field_ngay";
	const hasDateFrom = Boolean(tuNgay && tuNgay.trim());
	const hasDateTo = Boolean(denNgay && denNgay.trim());

	let rows: any[] = [];

	if (hasDateFrom || hasDateTo) {
		const conditions: SearchFilter[] = [];
		if (hasDateFrom) {
			const dateObj = chuyenNgay(tuNgay?.trim() || "", "dd/MM/yyyy");
			const formattedDate = dateObj ? dateFormat(dateObj, "yyyyMMdd") : tuNgay?.trim();
			conditions.push({ field: DATE_FIELD, type: "gte", value: formattedDate });
		}
		if (hasDateTo) {
			const dateObj = chuyenNgay(denNgay?.trim() || "", "dd/MM/yyyy");
			const formattedDate = dateObj ? dateFormat(dateObj, "yyyyMMdd") : denNgay?.trim();
			conditions.push({ field: DATE_FIELD, type: "lte", value: formattedDate });
		}
		const searchFilter: SearchFilter = conditions.length === 1
			? conditions[0]
			: { operator: "AND", conditions };
		rows = await fetchTableDataWithSearchFilter<any>(obj_name, searchFilter, "kqxs");
	} else if (e_where) {
		rows = await fetchTableData<any>(obj_name, e_where, "kqxs");
	} else {
		rows = await fetchTableData<any>(obj_name, undefined, "kqxs");
	}

	// Lọc client theo thứ nếu có tham số thu
	if (thu && thu.trim()) {
		rows = rows.filter((r) => {
			const ngay = (r as any).Field_Ngay ?? (r as any).field_ngay;
			return thuFromDate(ngay) === thu;
		});
	}

	return Array.isArray(rows) ? rows : [];
}


// Hàm lấy dữ liệu miền Bắc (ví dụ: kqxs_mienbac)
async function getMienBac(tuNgay?: string, denNgay?: string, thu?: string): Promise<any[]> {
	return await getKQXSData("kqxs_mienbac", undefined, tuNgay, denNgay, thu);
}

// Hàm lấy dữ liệu từng đài miền Nam (ví dụ: kqxs_tiengiang, kqxs_tphcm, ...)
async function getTienGiang(tuNgay?: string, denNgay?: string, thu?: string) {
	return await getKQXSData("kqxs_tiengiang", undefined, tuNgay, denNgay, thu);
}
async function getTPHCM(tuNgay?: string, denNgay?: string, thu?: string) {
	return await getKQXSData("kqxs_tphcm", undefined, tuNgay, denNgay, thu);
}
async function getBenTre(tuNgay?: string, denNgay?: string, thu?: string) {
	return await getKQXSData("kqxs_bentre", undefined, tuNgay, denNgay, thu);
}
async function getDongNai(tuNgay?: string, denNgay?: string, thu?: string) {
	return await getKQXSData("kqxs_dongnai", undefined, tuNgay, denNgay, thu);
}
async function getTayNinh(tuNgay?: string, denNgay?: string, thu?: string) {
	return await getKQXSData("kqxs_tayninh", undefined, tuNgay, denNgay, thu);
}
async function getVinhLong(tuNgay?: string, denNgay?: string, thu?: string) {
	return await getKQXSData("kqxs_vinhlong", undefined, tuNgay, denNgay, thu);
}
async function getKienGiang(tuNgay?: string, denNgay?: string, thu?: string) {
	return await getKQXSData("kqxs_kiengiang", undefined, tuNgay, denNgay, thu);
}
async function getDongThap(tuNgay?: string, denNgay?: string, thu?: string) {
	return await getKQXSData("kqxs_dongthap", undefined, tuNgay, denNgay, thu);
}
async function getVungTau(tuNgay?: string, denNgay?: string, thu?: string) {
	return await getKQXSData("kqxs_vungtau", undefined, tuNgay, denNgay, thu);
}
async function getCanTho(tuNgay?: string, denNgay?: string, thu?: string) {
	return await getKQXSData("kqxs_cantho", undefined, tuNgay, denNgay, thu);
}
async function getAnGiang(tuNgay?: string, denNgay?: string, thu?: string) {
	return await getKQXSData("kqxs_angiang", undefined, tuNgay, denNgay, thu);
}
async function getSongBe(tuNgay?: string, denNgay?: string, thu?: string) {
	return await getKQXSData("kqxs_songbe", undefined, tuNgay, denNgay, thu);
}
async function getLongAn(tuNgay?: string, denNgay?: string, thu?: string) {
	return await getKQXSData("kqxs_longan", undefined, tuNgay, denNgay, thu);
}


// Hàm gộp dữ liệu daichinh (theo truy vấn SQL mẫu)
async function getDaichinh(tuNgay?: string, denNgay?: string) {
	const [tiengiang, tphcm, bentre, dongnai, tayninh, vinhlong] = await Promise.all([
		getTienGiang(tuNgay, denNgay),
		getTPHCM(tuNgay, denNgay),
		getBenTre(tuNgay, denNgay),
		getDongNai(tuNgay, denNgay),
		getTayNinh(tuNgay, denNgay),
		getVinhLong(tuNgay, denNgay),
	]);
	return [
		...tiengiang,
		...tphcm,
		...bentre,
		...dongnai,
		...tayninh,
		...vinhlong,
	];
}

// Hàm gộp dữ liệu daiphu (theo truy vấn SQL mẫu)
async function getDaiphu(tuNgay?: string, denNgay?: string) {
	const [kiengiang, dongthap, vungtau, cantho, angiang, songbe, longan] = await Promise.all([
		getKienGiang(tuNgay, denNgay),
		getDongThap(tuNgay, denNgay),
		getVungTau(tuNgay, denNgay),
		getCanTho(tuNgay, denNgay),
		getAnGiang(tuNgay, denNgay),
		getSongBe(tuNgay, denNgay),
		getLongAn(tuNgay, denNgay),
	]);
	return [
		...kiengiang,
		...dongthap,
		...vungtau,
		...cantho,
		...angiang,
		...songbe,
		...longan,
	];
}

// Hàm join, select, concat, left/right/mid cho các truy vấn SQL
function _pad2(n: number | string) {
	return n.toString().padStart(2, "0");
}
function sqlID(field_ngay: string) {
	// concat(right(yyyyMMdd,4), mid(yyyyMMdd,4,2), left(yyyyMMdd,2))
	// field_ngay dạng dd/MM/yyyy hoặc yyyyMMdd
	if (!field_ngay) {
		return "";
	}
	const d = field_ngay.replace(/\D/g, "");
	if (d.length === 8) {
		return d.slice(4, 8) + d.slice(2, 4) + d.slice(0, 2);
	}
	if (d.length === 6) {
		return d.slice(2, 6) + d.slice(0, 2);
	}
	return field_ngay;
}


// Hàm lấy dữ liệu tương ứng truy vấn sp_Get2_BL

export async function get2_BL(tuNgay?: string, denNgay?: string) {
	const [a, b, mienbac] = await Promise.all([
		getDaichinh(tuNgay, denNgay),
		getDaiphu(tuNgay, denNgay),
		getMienBac(tuNgay, denNgay),
	]);
	// join a.Field_Ngay = b.Field_Ngay
	const ab = a.map(rowA => {
		const rowB = b.find(rowB => rowB.Field_Ngay === rowA.Field_Ngay);
		const rowC = mienbac.find(rowC => rowC.Field_Ngay === rowA.Field_Ngay);
		return {
			ID: sqlID(rowA.Field_Ngay),
			...Object.fromEntries(Object.entries(rowA).map(([k,v]) => ["D_"+k.replace('Field_','').toLowerCase(), v])),
			...rowB ? Object.fromEntries(Object.entries(rowB).map(([k,v]) => ["P_"+k.replace('Field_','').toLowerCase(), v])) : {},
			...rowC ? Object.fromEntries(Object.entries(rowC).map(([k,v]) => ["B_"+k.replace('Field_','').toLowerCase(), v])) : {},
		};
	});
	return ab;
}


// Hàm lấy dữ liệu tương ứng truy vấn sp_Get2_DD

export async function get2_DD(tuNgay?: string, denNgay?: string) {
	const [d, p, mienbac] = await Promise.all([
		getDaichinh(tuNgay, denNgay),
		getDaiphu(tuNgay, denNgay),
		getMienBac(tuNgay, denNgay),
	]);
	return d.map(rowD => {
		const rowP = p.find(rowP => rowP.Field_Ngay === rowD.Field_Ngay);
		const rowB = mienbac.find(rowB => rowB.Field_Ngay === rowD.Field_Ngay);
		return {
			ID: sqlID(rowD.Field_Ngay),
			D_dau: rowD.Field_dau,
			D_duoi: rowD.Field_duoi,
			P_dau: rowP?.Field_dau,
			P_duoi: rowP?.Field_duoi,
			B_dau: rowB?.Field_dau,
			B_so2: rowB?.Field_so2,
			B_so3: rowB?.Field_so3,
			B_so4: rowB?.Field_so4,
			B_duoi: rowB?.Field_duoi,
		};
	});
}


// Hàm lấy dữ liệu tương ứng truy vấn sp_Get3_BL

export async function get3_BL(tuNgay?: string, denNgay?: string) {
	const [a, b, mienbac] = await Promise.all([
		getDaichinh(tuNgay, denNgay),
		getDaiphu(tuNgay, denNgay),
		getMienBac(tuNgay, denNgay),
	]);
	const ab = a.map(rowA => {
		const rowB = b.find(rowB => rowB.Field_Ngay === rowA.Field_Ngay);
		const rowC = mienbac.find(rowC => rowC.Field_Ngay === rowA.Field_Ngay);
		return {
			ID: sqlID(rowA.Field_Ngay),
			D_so2: rowA.Field_so2,
			D_so3: rowA.Field_so3,
			D_so4: rowA.Field_so4,
			D_so5: rowA.Field_so5,
			D_so6: rowA.Field_so6,
			D_so7: rowA.Field_so7,
			D_so8: rowA.Field_so8,
			D_so9: rowA.Field_so9,
			D_so10: rowA.Field_so10,
			D_so11: rowA.Field_so11,
			D_so12: rowA.Field_so12,
			D_so13: rowA.Field_so13,
			D_so14: rowA.Field_so14,
			D_so15: rowA.Field_so15,
			D_so16: rowA.Field_so16,
			D_so17: rowA.Field_so17,
			D_duoi: rowA.Field_duoi,
			...(rowB ? {
				P_so2: rowB.Field_so2,
				P_so3: rowB.Field_so3,
				P_so4: rowB.Field_so4,
				P_so5: rowB.Field_so5,
				P_so6: rowB.Field_so6,
				P_so7: rowB.Field_so7,
				P_so8: rowB.Field_so8,
				P_so9: rowB.Field_so9,
				P_so10: rowB.Field_so10,
				P_so11: rowB.Field_so11,
				P_so12: rowB.Field_so12,
				P_so13: rowB.Field_so13,
				P_so14: rowB.Field_so14,
				P_so15: rowB.Field_so15,
				P_so16: rowB.Field_so16,
				P_so17: rowB.Field_so17,
				P_duoi: rowB.Field_duoi,
			} : {}),
			...(rowC ? {
				B_so5: rowC.Field_so5,
				B_so6: rowC.Field_so6,
				B_so7: rowC.Field_so7,
				B_so8: rowC.Field_so8,
				B_so9: rowC.Field_so9,
				B_so10: rowC.Field_so10,
				B_so11: rowC.Field_so11,
				B_so12: rowC.Field_so12,
				B_so13: rowC.Field_so13,
				B_so14: rowC.Field_so14,
				B_so15: rowC.Field_so15,
				B_so16: rowC.Field_so16,
				B_so17: rowC.Field_so17,
				B_so18: rowC.Field_so18,
				B_so19: rowC.Field_so19,
				B_so20: rowC.Field_so20,
				B_so21: rowC.Field_so21,
				B_so22: rowC.Field_so22,
				B_so23: rowC.Field_so23,
				B_so24: rowC.Field_so24,
				B_so25: rowC.Field_so25,
				B_so26: rowC.Field_so26,
				B_duoi: rowC.Field_duoi,
			} : {}),
		};
	});
	return ab;
}


// Hàm lấy dữ liệu tương ứng truy vấn sp_Get3_DD

export async function get3_DD(tuNgay?: string, denNgay?: string) {
	const [d, p, mienbac] = await Promise.all([
		getDaichinh(tuNgay, denNgay),
		getDaiphu(tuNgay, denNgay),
		getMienBac(tuNgay, denNgay),
	]);
	return d.map(rowD => {
		const rowP = p.find(rowP => rowP.Field_Ngay === rowD.Field_Ngay);
		const rowB = mienbac.find(rowB => rowB.Field_Ngay === rowD.Field_Ngay);
		return {
			ID: sqlID(rowD.Field_Ngay),
			D_dau: rowD.Field_so2,
			D_duoi: rowD.Field_duoi,
			P_dau: rowP?.Field_so2,
			P_duoi: rowP?.Field_duoi,
			B_dau: rowB?.Field_so5,
			B_so2: rowB?.Field_so6,
			B_so3: rowB?.Field_so7,
			B_duoi: rowB?.Field_duoi,
		};
	});
}

export interface KQXSRow {
  id: string;
  province: string;
  prize: string;
  numbers: string;
  field_ngay: string;
  [key: string]: any;
}

export interface TableWhere {
  field: string;
  type: string; // eq | like | between | in | gte | lte | etc.
  value: any;
}

export interface AdvancedTableWhere {
  and?: TableWhere[];
  or?: TableWhere[];
  [key: string]: any;
}

export async function fetchTableData<T>(obj_name: string, e_where?: TableWhere | null, appId = "kqxs") {
	// Refactored: Use SSR endpoint like fetchKQXSTableRange
	const baseUrl = import.meta.env?.VITE_BASE_URL || "";
	let url = `${baseUrl}/kqxs/table-range?obj_name=${encodeURIComponent(obj_name)}`;
	let from = undefined, to = undefined;
	if (e_where && e_where.field && (e_where.type === "gte" || e_where.type === "lte" || e_where.type === "eq")) {
		if (e_where.type === "gte") from = e_where.value;
		if (e_where.type === "lte") to = e_where.value;
		if (e_where.type === "eq") {
			from = e_where.value;
			to = e_where.value;
		}
	}
	if (from) url += `&from=${encodeURIComponent(from)}`;
	if (to) url += `&to=${encodeURIComponent(to)}`;
	try {
		const res = await fetch(url, {
			method: "GET",
			credentials: "same-origin",
			headers: {
				"Accept": "application/json"
			}
		});
		const data = await res.json();
		return Array.isArray(data?.rows) ? (data.rows as T[]) : ([] as T[]);
	} catch (err) {
		console.error("SSR table-range fetch error", err, "url:", url, "obj_name:", obj_name, "from:", from, "to:", to);
		return [];
	}
}

/**
 * SSR-safe fetch for KQXS table by date range (field_ngay between from/to yyyyMMdd or dd/MM/yyyy).
 */
export async function fetchKQXSTableRange<T>(obj_name: string, from?: string, to?: string) {
	const baseUrl = import.meta.env?.VITE_BASE_URL || "";
	const url = `${baseUrl}/kqxs/table-range?obj_name=${encodeURIComponent(obj_name)}${from ? `&from=${encodeURIComponent(from)}` : ""}${to ? `&to=${encodeURIComponent(to)}` : ""}`;
	try {
		const res = await fetch(url, {
			method: "GET",
			credentials: "same-origin",
			headers: {
				"Accept": "application/json"
			}
		});
		const data = await res.json();
		return Array.isArray(data?.rows) ? data.rows : [];
	} catch (err) {
		console.error("SSR table-range fetch error", err, "url:", url, "obj_name:", obj_name, "from:", from, "to:", to);
		return [];
	}
}

/**
 * Interface for SearchFilter matching Java backend SearchFilter.java
 */
interface SearchFilter {
	operator?: string // "AND" | "OR"
	conditions?: SearchFilter[]
	field?: string
	type?: string // eq, eqignorecase, like, prefix, gte, lte, range
	value?: any
}

/**
 * Fetch KQXS stations with complex filtering using SearchFilter (matches Java backend)
 * This properly implements the SearchFilter structure that Java TableHandler expects
 */
export async function fetchKQXSStationsWithFilter(filters: { mien?: string; thu?: string }): Promise<any[]> {
	// Sử dụng SSR webrouter endpoint, không cần token đăng nhập
	const baseUrl = import.meta.env?.VITE_BASE_URL || "";
	const url = `${baseUrl}/kqxs/stations?${filters?.mien ? `mien=${encodeURIComponent(filters.mien)}&` : ""}${filters?.thu ? `thu=${encodeURIComponent(filters.thu)}` : ""}`;
	try {
		const res = await fetch(url, {
			method: "GET",
			credentials: "same-origin", // Đảm bảo cookie nếu cần
			headers: {
				"Accept": "application/json"
			}
		});
		const data = await res.json();
		return Array.isArray(data?.rows) ? data.rows : [];
	} catch (err) {
		console.error("SSR stations fetch error", err);
		return [];
	}
}

/**
 * New function to send SearchFilter to Java backend properly
 */
export async function fetchTableDataWithSearchFilter<T>(
	obj_name: string,
	searchFilter: SearchFilter,
	appId = "kqxs",
): Promise<T[]> {
	const payload = {
		app_id: appId,
		obj_name,
		e_where: searchFilter,
	};

	const baseUrl = import.meta.env?.VITE_BASE_URL || "";
	const url = `${baseUrl}/get-table-data`;

	try {
		const res = await fetch(url, {
			method: "POST",
			credentials: "same-origin",
			headers: {
				"Content-Type": "application/json",
				"Accept": "application/json",
			},
			body: JSON.stringify(payload),
		});
		const data: { rows?: T[] } = await res.json();
		return Array.isArray(data?.rows) ? data.rows : [];
	} catch (error) {
		console.error("Error fetching table data with search filter:", error);
		return [];
	}
}

/**
 * Lấy kết quả xổ số cho 1 đài cụ thể (theo obj_name động)
 * @param obj_name Tên bảng đài, ví dụ: "kqxs_mn_1" (lấy từ du_lieu_dai)
 * @param date Ngày cần lấy kết quả (dd/MM/yyyy)
 */
export async function fetchKQXSByStation(obj_name: string, date: string) {
	// Sử dụng SSR webrouter endpoint, không cần token đăng nhập
	const baseUrl = import.meta.env?.VITE_BASE_URL || "";
	const url = `${baseUrl}/kqxs/station?obj_name=${encodeURIComponent(obj_name)}&date=${encodeURIComponent(date)}`;
	console.log("[fetchKQXSByStation] Requesting:", url, "obj_name:", obj_name, "date:", date);
	try {
		const res = await fetch(url, {
			method: "GET",
			credentials: "same-origin",
			headers: {
				"Accept": "application/json"
			}
		});
		const data = await res.json();
		console.log("[fetchKQXSByStation] Response:", data);
		return Array.isArray(data?.rows) ? data.rows : [];
	} catch (err) {
		console.error("SSR station fetch error", err, "url:", url, "obj_name:", obj_name, "date:", date);
		return [];
	}
}

/** SSR-safe fetch for kqxs_tonghop with validated params */
export async function fetchKQXSTongHop<T = any>(params: Record<string, string | number | boolean | undefined>) {
	const baseUrl = import.meta.env?.VITE_BASE_URL || "";
	const url = `${baseUrl}/kqxs/tonghop`;

	try {
		const res = await fetch(url, {
			method: "GET",
			credentials: "same-origin",
			headers: {
				"Accept": "application/json",
			},
		});
		const data: { rows?: T[] } = await res.json();
		return Array.isArray(data?.rows) ? data.rows : [];
	} catch (error) {
		console.error("Error fetching KQXS TongHop:", error);
		throw error;
	}
}

// Extra helpers to replace legacy PHP endpoints with JSON API
export interface LoaiTimRow {
  MaLoai: string;
  MoTa: string;
  [k: string]: any;
}

// Static loaitim data for override
const staticLoaiTimData: LoaiTimRow[] = [
	{ ma_duoi: 2, MaLoai: "sp_Get2_BL,D_-P_", MoTa: "Bao Lô 2 Đài" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_BL,D_", MoTa: "Bao lô Đài Chính" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_DD,D_dau", MoTa: "Đầu Chính" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_DD,D_-P_", MoTa: "Đầu đuôi 2 Đài" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_DD,P_dau", MoTa: "Đầu Phụ" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_DD,D_duoi", MoTa: "Đuôi Chính" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_DD,P_duoi", MoTa: "Đuôi Phụ" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_DD,D_-P_-B_", MoTa: "Đầu đuôi Nam Bắc" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_DD,D_dau-D_duoi", MoTa: "Đầu-Đuôi Chính" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_DD,P_dau-P_duoi", MoTa: "Đầu-Đuôi Phụ" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_DD,B_", MoTa: "Đầu đuôi Miền Bắc" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_BL,P_", MoTa: "Bao lô Đài Phụ" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_BL,B_-D_-P_", MoTa: "Bao Lô Nam Bắc" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_BL,B_", MoTa: "Bao lô Miền Bắc" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_DD,D_dau-P_dau", MoTa: "Đầu Chính-Phụ" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_DD,D_duoi-P_duoi", MoTa: "Đuôi Chính-Phụ" },
	{ ma_duoi: 3, MaLoai: "sp_Get3_BL,D_-P_", MoTa: "Bao Lô 2 Đài" },
	{ ma_duoi: 3, MaLoai: "sp_Get3_BL,D_", MoTa: "Bao Lô Đài Chính" },
	{ ma_duoi: 3, MaLoai: "sp_Get3_BL,P_", MoTa: "Bao Lô Đài Phụ" },
	{ ma_duoi: 3, MaLoai: "sp_Get3_BL,D_-P_-B_", MoTa: "Bao Lô Nam Bắc" },
	{ ma_duoi: 3, MaLoai: "sp_Get3_DD,D_dau-D_duoi", MoTa: "Đầu-Đuôi Chính" },
	{ ma_duoi: 3, MaLoai: "sp_Get3_DD,P_dau-P_duoi", MoTa: "Đầu-Đuôi Phụ" },
	{ ma_duoi: 3, MaLoai: "sp_Get3_DD,B_", MoTa: "Đầu-Đuôi Bắc" },
	{ ma_duoi: 3, MaLoai: "sp_Get3_DD,D_-P_-B_", MoTa: "Đầu-Đuôi Nam Bắc" },
	{ ma_duoi: 3, MaLoai: "sp_Get3_BL,B_", MoTa: "Bao Lô Bắc" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_DD,B_duoi", MoTa: "Đuôi Miền Bắc" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_DD,B_dau-B_so", MoTa: "Đầu Miền Bắc" },
	{ ma_duoi: 2, MaLoai: "sp_Get2_DD,D_-P_-B_dau-B_so", MoTa: "Đầu-Đuôi Nam Đầu Bắc" },
];

export async function fetchLoaiTim(ma_duoi: string) {
	if (['2', '3'].includes(String(ma_duoi))) {
		// Return static data for ma_duoi 2 and 3
		return staticLoaiTimData.filter(row => String(row.ma_duoi) === String(ma_duoi));
	}
	return false;
}

export interface TimKiemRow {
	noi_dung: string
	kieu_tim: string
	ma_duoi?: string
	[k: string]: any
}

export interface BangQueryRow {
	Fields: string
	MaQuery: string
	ma_duoi: string
	[k: string]: any
}


// Helper function để parse MaLoai và filter dữ liệu theo các trường cần thiết
function parseAndFilterData(maLoai: string, rawData: any[]) {
	if (!maLoai.includes(',')) return rawData;
	
	const [spName, fieldPattern] = maLoai.split(',');
	if (!fieldPattern) return rawData;
	
	// Parse field pattern - có thể là "D_-P_-B_" hoặc "D_dau" hoặc "D_dau-D_duoi"
	const fieldPrefixes = fieldPattern.split('-').map(f => f.trim()).filter(Boolean);
	
	return rawData.map(row => {
		const filteredRow: any = { ID: row.ID };
		
		// Lọc các trường theo pattern
		for (const [key, value] of Object.entries(row)) {
			// Kiểm tra nếu key bắt đầu bằng một trong các prefix được chỉ định
			const shouldInclude = fieldPrefixes.some(prefix => {
				if (prefix.endsWith('_')) {
					// Pattern như "D_", "P_", "B_" - lấy tất cả trường bắt đầu bằng prefix này
					return key.startsWith(prefix);
				} else {
					// Pattern chính xác như "D_dau", "D_duoi"
					return key === prefix;
				}
			});
			
			if (shouldInclude) {
				filteredRow[key] = value;
			}
		}
		
		return filteredRow;
	});
}

// Hàm lấy dữ liệu thống kê theo MaLoai đã chọn
export async function fetchStatisticalData(maLoai: string, ma_duoi: string, tuNgay?: string, denNgay?: string, thuTuan?: string) {
	let rawData: any[] = [];

	// Xác định loại dữ liệu cần lấy dựa vào MaLoai
	if (maLoai.startsWith('sp_Get2_BL')) {
		rawData = await get2_BL(tuNgay, denNgay);
	} else if (maLoai.startsWith('sp_Get2_DD')) {
		rawData = await get2_DD(tuNgay, denNgay);
	} else if (maLoai.startsWith('sp_Get3_BL')) {
		rawData = await get3_BL(tuNgay, denNgay);
	} else if (maLoai.startsWith('sp_Get3_DD')) {
		rawData = await get3_DD(tuNgay, denNgay);
	}

	// Parse và filter dữ liệu theo pattern
	return parseAndFilterData(maLoai, rawData);
}

// Chỉ override fetchBangQuery cho các MaQuery đặc biệt, còn lại gọi API như cũ
export async function fetchBangQuery(maQuery: string, ma_duoi: string) {
	if (maQuery === 'sp_Get2_BL' && ma_duoi === '2') {
		const data = await get2_BL();
		return [{ MaQuery: 'sp_Get2_BL', ma_duoi: '2', Fields: JSON.stringify(data) }];
	}
	if (maQuery === 'sp_Get2_DD' && ma_duoi === '2') {
		const data = await get2_DD();
		return [{ MaQuery: 'sp_Get2_DD', ma_duoi: '2', Fields: JSON.stringify(data) }];
	}
	if (maQuery === 'sp_Get3_BL' && ma_duoi === '3') {
		const data = await get3_BL();
		return [{ MaQuery: 'sp_Get3_BL', ma_duoi: '3', Fields: JSON.stringify(data) }];
	}
	if (maQuery === 'sp_Get3_DD' && ma_duoi === '3') {
		const data = await get3_DD();
		return [{ MaQuery: 'sp_Get3_DD', ma_duoi: '3', Fields: JSON.stringify(data) }];
	}
	// fallback: gọi API như cũ
	const rows = await fetchTableData<BangQueryRow>("bangquery", { field: "ma_duoi", type: "eq", value: ma_duoi });
	return rows.filter(r => r.MaQuery === maQuery);
}

// Helper functions để xử lý chuỗi giống PHP
function right(value: string, count: number): string {
  return value.substr(-count);
}

function left(value: string, count: number): string {
  return value.substr(0, count);
}

// Interface cho các bảng dữ liệu bổ sung
interface TimKiemDataRow {
  noi_dung?: string;
  kieu_tim?: string;
  ma_duoi?: number;
  [key: string]: any;
}

interface TimKiemTrRow {
  noi_dung?: string;
  kieu_tim?: string;
  [key: string]: any;
}

// Hàm tính nhóm số theo logic PHP tree_nhomso.php
export async function calculateNhomSo(ma_duoi: string, allBoSo?: string): Promise<any[]> {
  try {
    // Lấy dữ liệu từ bảng timkiem
    const timKiemData = await fetchTableData<TimKiemDataRow>('kqxs_timkiem', { 
      field: 'ma_duoi', 
      type: 'eq', 
      value: ma_duoi 
    });
    
		// Lọc theo allBoSo nếu có, nếu không thì lấy hết
		let filteredData = timKiemData;
		if (allBoSo && allBoSo.trim()) {
			// Đảm bảo allBoSo có dạng @...@ hoặc phân tách đúng
			const allBoSoArr = allBoSo.split('@').map(s => s.trim()).filter(Boolean);
			filteredData = timKiemData.filter((item: TimKiemDataRow) => {
				return allBoSoArr.some(bs => (item.noi_dung || '').includes(bs));
			});
		}
		// Nếu lọc ra rỗng mà allBoSo có dữ liệu, fallback lấy hết
		if (allBoSo && allBoSo.trim() && filteredData.length === 0) {
			filteredData = timKiemData;
		}
		console.log('Filtered Data:', filteredData, timKiemData);
		// Tính nhóm số theo công thức: LENGTH(concat(noi_dung,' '))/(ma_duoi+1)
		const nhomMap = new Map<number, TimKiemDataRow[]>();
		filteredData.forEach((item: TimKiemDataRow) => {
			const noi_dung = item.noi_dung || '';
			const nhom = Math.floor((noi_dung + ' ').length / (parseInt(ma_duoi) + 1));
			if (!nhomMap.has(nhom)) {
				nhomMap.set(nhom, []);
			}
			nhomMap.get(nhom)?.push(item);
		});
		// Chuyển thành array kết quả, luôn trả về cả nhóm số và loại nhóm số nếu có
		const result: any[] = [];
		nhomMap.forEach((items, nhom) => {
			// Nếu có kieu_tim riêng biệt trong items thì thêm từng loại
			const kieuTimSet = new Set<string>();
			items.forEach(i => i.kieu_tim && kieuTimSet.add(i.kieu_tim));
			if (kieuTimSet.size > 0) {
				kieuTimSet.forEach(kieu_tim => {
					const itemsByKieu = items.filter(i => i.kieu_tim === kieu_tim);
					result.push({
						nhom,
						ten: `Nhóm ${nhom} Số - ${kieu_tim}`,
						kieu_tim,
						items: itemsByKieu
					});
				});
			} else {
				result.push({
					nhom,
					ten: `Nhóm ${nhom} Số`,
					items
				});
			}
		});
		return result.sort((a, b) => a.nhom - b.nhom);
  } catch (error) {
    console.error('Error calculating nhom so:', error);
    return [];
  }
}

// Hàm lấy số triệt theo logic PHP
export async function getBoSoTriet(
  ma_duoi: string, 
  loaiTim: string, 
  tuNgay: string, 
  denNgay: string
): Promise<string> {
	try {
		// Chuyển đổi định dạng ngày từ dd/MM/yyyy sang yyyyMMdd
		const formatDate = (dateStr: string) => {
			const parts = dateStr.split('/');
			return `${parts[2]}${parts[1]}${parts[0]}`;
		};

		const tu = formatDate(tuNgay);
		const den = formatDate(denNgay);

		// Parse loaiTim: "sp_Get2_DD,D_-P_-B_"
		const loaiParts = loaiTim.split(',');
		const maQuery = loaiParts[0];
		const fieldPattern = loaiParts[1];
		// Chuẩn hóa pattern thành mảng
		const patternArr = fieldPattern.split('-').map(s => s.replace('_', '').trim()).filter(Boolean);

		let rawData: any[] = [];

		// Lấy dữ liệu dựa vào MaQuery
		if (maQuery === 'sp_Get2_BL' && ma_duoi === '2') {
			rawData = await get2_BL();
		} else if (maQuery === 'sp_Get2_DD' && ma_duoi === '2') {
			rawData = await get2_DD();
		} else if (maQuery === 'sp_Get3_BL' && ma_duoi === '3') {
			rawData = await get3_BL();
		} else if (maQuery === 'sp_Get3_DD' && ma_duoi === '3') {
			rawData = await get3_DD();
		}

		// Filter theo ngày
		const filteredData = rawData.filter(row => {
			const rowId = row.ID ? row.ID.toString() : '';
			return rowId < den && rowId >= tu;
		});

		// Truy vấn timkiemtr một lần duy nhất
		const timKiemTrData = await fetchTableData<TimKiemTrRow>('kqxs_timkiemtr', {
			field: 'id',
			type: 'gt',
			value: '0'
		});

		let allBoSo = '';
		let so = '';

		for (const row of filteredData) {
			const fieldNames = Object.keys(row).filter(k => k !== 'ID');

			// Lần đầu: tìm các số chưa có trong So
			for (const fieldName of fieldNames) {
				const trimmedName = fieldName.trim();
				const fieldPrefix = left(trimmedName, 2);
				// Kiểm tra field có trong pattern không
				if (!patternArr.includes(fieldPrefix)) continue;

				const fieldValue = row[fieldName];
				if (!fieldValue) continue;

				const sod = right(fieldValue.toString().trim(), 2);
				if (!so.split(' ').includes(sod)) {
					let bs = '';
					if (left(sod, 1) !== right(sod, 1)) {
						const matching = timKiemTrData.find((item: TimKiemTrRow) => {
							const noi_dung = item.noi_dung || '';
							return noi_dung.substr(0, 5).includes(sod) &&
										 noi_dung.substr(0, 5).includes(right(sod, 1) + left(sod, 1));
						});
						if (matching) bs = matching.noi_dung || '';
					} else {
						const matching = timKiemTrData.find((item: TimKiemTrRow) => {
							const noi_dung = item.noi_dung || '';
							return noi_dung.substr(0, 2) === sod;
						});
						if (matching) bs = matching.noi_dung || '';
					}
					if (bs) {
						allBoSo = allBoSo ? `${allBoSo}@${bs}` : bs;
					}
				}
			}

			// Lần hai: thu thập tất cả số trong row
			let boso = '';
			for (const fieldName of fieldNames) {
				const trimmedName = fieldName.trim();
				const fieldPrefix = left(trimmedName, 2);
				if (!patternArr.includes(fieldPrefix)) continue;

				const fieldValue = row[fieldName];
				if (!fieldValue) continue;

				const sodo = right(fieldValue.toString().trim(), 2);
				if (left(sodo, 1) !== right(sodo, 1)) {
					const matching = timKiemTrData.find((item: TimKiemTrRow) => {
						const noi_dung = item.noi_dung || '';
						return noi_dung.substr(0, 5).includes(sodo) &&
									 noi_dung.substr(0, 5).includes(right(sodo, 1) + left(sodo, 1));
					});
					if (matching) boso += ` ${matching.noi_dung || ''}`;
				} else {
					const matching = timKiemTrData.find((item: TimKiemTrRow) => {
						const noi_dung = item.noi_dung || '';
						return noi_dung.substr(0, 2) === sodo;
					});
					if (matching) boso += ` ${matching.noi_dung || ''}`;
				}
			}
			so = boso.trim();
		}
		return allBoSo;
	} catch (error) {
		console.error('Error getting bo so triet:', error);
		return '';
	}
}

// Hàm xử lý số trùng nhau theo logic JavaScript TongHop.html
export function processNumberCollisions(numbers: string[]): { [key: string]: number } {
  const result: { [key: string]: number } = {};
  
  numbers.forEach(numberGroup => {
    const soArray = numberGroup.split(' ');
    
    soArray.forEach(so => {
      if (so.trim()) {
        if (result[so]) {
          result[so]++;
        } else {
          result[so] = 0;
        }
      }
    });
  });
  
  return result;
}

// Hàm tính toán kết quả tổng hợp theo logic TongHop.html
export async function calculateTongHopResults(options: {
	heSo: string;
	loaiTim: string;
	tuNgay: string;
	denNgay: string;
	thuTuan?: string;
	soNhap?: string;
	chkNhom?: boolean;
	chkTriet?: boolean;
	chkTrietDuoi?: boolean;
	ktn?: number;
	ktd?: number;
	l2c?: number;
	nhomSo?: string;
}): Promise<any[]> {
  try {
    const { heSo, loaiTim, tuNgay, denNgay,thuTuan, soNhap, chkNhom, chkTriet, chkTrietDuoi } = options;
    
    // Lấy dữ liệu cơ bản
    let rawData = await fetchStatisticalData(loaiTim, heSo, tuNgay, denNgay, thuTuan);
    
    // Filter theo ngày
    const formatDate = (dateStr: string) => {
      const parts = dateStr.split('/');
      return `${parts[2]}${parts[1]}${parts[0]}`;
    };
    
    const tu = formatDate(tuNgay);
    const den = formatDate(denNgay);
    
    rawData = rawData.filter(row => {
      const rowId = row.ID ? row.ID.toString() : '';
      return rowId < den && rowId >= tu;
    });
    
    // Xử lý theo các checkbox
    let result = rawData;
    
    if (chkTriet) {
      // Logic triệt số
      const boSoTriet = await getBoSoTriet(heSo, loaiTim, tuNgay, denNgay);
      if (boSoTriet) {
        const nhomSo = await calculateNhomSo(heSo, boSoTriet);
        // Áp dụng logic nhóm số đã tính
        result = result.filter(item => {
          // Logic lọc theo nhóm số triệt
          return true; // Placeholder - cần implement chi tiết
        });
      }
    }
    
    if (chkTrietDuoi) {
      // Logic triệt đuổi - tương tự tree_nhomso_k_triet.php
      // Cần implement logic đặc biệt cho triệt đuổi
    }
    
    if (chkNhom) {
      // Logic nhóm số
      const nhomSo = await calculateNhomSo(heSo);
      // Áp dụng logic nhóm số
    }
    
    // Lọc theo số nhập
    if (soNhap && soNhap.trim()) {
      const inputNumbers = soNhap.split(' ').map(s => s.trim()).filter(s => s);
      result = result.filter(item => {
        return inputNumbers.some(num => 
          Object.values(item).some(value => 
            value && value.toString().includes(num)
          )
        );
      });
    }
    
    return result;
  } catch (error) {
    console.error('Error calculating tong hop results:', error);
    return [];
  }
}

// Hàm format ngày theo định dạng của TongHop.html
export function formatDateForQuery(date: string): string {
  // Từ dd/MM/yyyy sang yyyyMMdd
  const parts = date.split('/');
  return `${parts[2]}${parts[1]}${parts[0]}`;
}

// Hàm kiểm tra số trùng theo logic TongHop.html SoTrungNhau
export function checkDuplicateNumbers(so: string): boolean {
  const soArray = so.split(' ');
  const seen = new Set();
  
  for (const num of soArray) {
    if (num.trim() && seen.has(num.trim())) {
      return true; // Có số trùng
    }
    seen.add(num.trim());
  }
  
  return false; // Không có số trùng
}

