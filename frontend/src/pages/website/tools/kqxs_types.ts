import { type KQXSRow } from "#src/api/kqxs_service";

// Định nghĩa thông tin đài
export interface DaiInfo {
	id: number;
	mien: string;
	thu: string;
	stt: string; // stt is string per server
	ten_dai: string;
	du_lieu_dai: string;
	duong_dan: string;
	ngay?: string; // Display date DD/MM/YYYY
	field_ngay?: string; // Raw date YYYYMMDD
}

// Định nghĩa kết quả xổ số đã làm giàu
export interface EnrichedKQXSRow extends KQXSRow {
	ten_dai?: string;
	thu?: string;
	mien?: string;
	du_lieu_dai?: string;
	stt?: string;
	ngay?: string; // Display date DD/MM/YYYY
	uniqueKey?: string; // Unique key for React rendering
	
	// Actual API fields for lottery results
	field_dau?: string; // Giải ĐB
	field_so2?: string; // Giải nhất
	field_so3?: string; // Giải nhì
	field_so4?: string; // Giải ba 1
	field_so5?: string; // Giải ba 2
	field_so6?: string; // Giải tư
	field_so7?: string; // Giải năm
	field_so8?: string; // Giải sáu
	field_so9?: string; // Giải bảy
	field_so10?: string;
	field_so11?: string;
	field_so12?: string;
	field_so13?: string;
	field_so14?: string;
	field_so15?: string;
	field_so16?: string;
	field_so17?: string;
	field_so18?: string;
	field_so19?: string;
	field_so20?: string;
	field_so21?: string;
	field_so22?: string;
	field_so23?: string;
	field_so24?: string;
	field_so25?: string;
	field_so26?: string;
	[key: string]: any; // Allow other field_* properties
}

// Định nghĩa điều kiện tìm kiếm
export interface SearchCondition {
  field: string;
  type: string;
  value: string | number;
}

// Định nghĩa bộ lọc tìm kiếm
export interface SearchFilter {
  operator?: "AND" | "OR";
  conditions: (SearchCondition | SearchFilter)[];
}

// Định nghĩa cấu trúc thống kê
export interface ThongKeItem {
  so: string;
  lanXuatHien: number;
  lanVeDau: number;
  lanVeDuoi: number;
  tyLe: number;
  dem?: number;    // Để tương thích với code cũ
  kxh?: number;    // Để tương thích với code cũ
  max?: number;    // Để tương thích với code cũ
  tb?: number;     // Để tương thích với code cũ
}

// Định nghĩa cấu trúc dữ liệu cho kết quả hiển thị
export interface DisplayKQXSRow {
	ten_dai?: string;
	thu?: string;
	mien?: string;
	du_lieu_dai: string;
	stt: string;
	ngay?: string;
	field_ngay?: string;
	uniqueKey?: string;
	data: Record<string, any>;
}

// Days mapping - ds_thu
export const ds_thu = [
	{ ma: "T2", ten: "Thứ 2" },
	{ ma: "T3", ten: "Thứ 3" },
	{ ma: "T4", ten: "Thứ 4" },
	{ ma: "T5", ten: "Thứ 5" },
	{ ma: "T6", ten: "Thứ 6" },
	{ ma: "CN", ten: "Chủ Nhật" }
];