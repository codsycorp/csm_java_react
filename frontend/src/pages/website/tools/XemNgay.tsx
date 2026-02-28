import React from "react";

import { Button, Card, Col, Descriptions, Divider, Modal, Row, Tooltip, Typography } from "antd";
import { useTranslation } from 'react-i18next';
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

import WebsiteLayout from "#src/layout/website/WebsiteLayout";
import { useWebsiteMenu } from "#src/layout/website/wu_menu";
import { request } from "#src/utils";

// Khai báo CAN, CHI trước khi dùng trong getCanChi
const CAN = [
	"Giáp",
	"Ất",
	"Bính",
	"Đinh",
	"Mậu",
	"Kỷ",
	"Canh",
	"Tân",
	"Nhâm",
	"Quý",
];
const CHI = [
	"Tý",
	"Sửu",
	"Dần",
	"Mão",
	"Thìn",
	"Tỵ",
	"Ngọ",
	"Mùi",
	"Thân",
	"Dậu",
	"Tuất",
	"Hợi",
];

// Helpers for Can Chi and time heavenly stems
function getCanChi(lunar: LunarDate): [string, string, string] {
	const dayName = `${CAN[(lunar.jd + 9) % 10]} ${CHI[(lunar.jd + 1) % 12]}`;
	const monthName = `${CAN[(lunar.year * 12 + lunar.month + 3) % 10]} ${CHI[(lunar.month + 1) % 12]}`;
	const yearName = `${CAN[(lunar.year + 6) % 10]} ${CHI[(lunar.year + 8) % 12]}`;
	return [dayName, monthName, yearName];
}

function getDayName(lunarDate: LunarDate) {
	if (!lunarDate || lunarDate.day === 0) {
		return "";
	}
	const [dayCC, monthCC, yearCC] = getCanChi(lunarDate);
	return `Ngày ${dayCC}, tháng ${monthCC}, năm ${yearCC}`;
}

// Thời Can for giờ
const can12 = ["Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý", "Giáp", "Ất"];
const can24 = ["Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý", "Giáp", "Ất", "Bính", "Đinh"];
const can36 = ["Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý", "Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ"];
const can48 = ["Canh", "Tân", "Nhâm", "Quý", "Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân"];
const can64 = ["Nhâm", "Quý", "Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý"];

function _ThoiCan(NhatCan: string, gio: number) {
	if (gio >= 12) {
		gio -= 12;
	}
	const canDau = NhatCan.charAt(0);
	if (canDau === "G" || canDau === "K") {
		return can12[gio];
	}
	else if (canDau === "Ấ" || canDau === "C") {
		return can24[gio];
	}
	else if (canDau === "B" || canDau === "T") {
		return can36[gio];
	}
	else if (canDau === "Đ" || canDau === "N") {
		return can48[gio];
	}
	else if (canDau === "M" || canDau === "Q") {
		return can64[gio];
	}
	return "";
}

// 24 tiết khí (for TinhTietKhi)
const TIETKHI = [
	"Lập xuân",
	"Vũ thủy",
	"Kinh trập",
	"Xuân phân",
	"Thanh minh",
	"Cốc vũ",
	"Lập hạ",
	"Tiểu mãn",
	"Mang chủng",
	"Hạ chí",
	"Tiểu thử",
	"Đại thử",
	"Lập thu",
	"Xử thử",
	"Bạch lộ",
	"Thu phân",
	"Hàn lộ",
	"Sương giáng",
	"Lập đông",
	"Tiểu tuyết",
	"Đại tuyết",
	"Đông chí",
	"Tiểu hàn",
	"Đại hàn",
];

// Day names for calendar header (Sunday first)
const DAYNAMES = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
// (imports moved to top)

// Responsive CSS styles
const responsiveStyles = `
.xem-ngay-responsive {
	padding: 24px;
}
@media (max-width: 768px) {
	.xem-ngay-responsive {
		padding: 12px;
	}
	.ant-descriptions-item-label {
		font-size: 12px !important;
	}
	.ant-descriptions-item-content {
		font-size: 12px !important;
	}
	.ant-card-head-title {
		font-size: 14px !important;
	}
}
@media (max-width: 480px) {
	.xem-ngay-responsive {
		padding: 8px;
	}
}
`;

// Add styles to document head
if (typeof document !== "undefined" && !document.getElementById("xem-ngay-styles")) {
	const styleElement = document.createElement("style");
	styleElement.id = "xem-ngay-styles";
	styleElement.textContent = responsiveStyles;
	document.head.appendChild(styleElement);
}

// API service functions following wu_service.ts pattern
interface ApiListResponse<T> {
	data: T[]
	total?: number
	[key: string]: any
}

// VPTS API Service - following exact pattern from wu_service.ts
async function fetchVptsData(objName: string): Promise<any[]> {
	try {
		const res = await request
			.get<ApiListResponse<any>>("/vpts", {
				searchParams: { obj_name: objName },
				ignoreLoading: true,
			})
			.json<ApiListResponse<any>>();

		// SSR payload returns rows
		return Array.isArray(res?.rows) ? res.rows : [];
	}
	catch (error) {
		console.error(`Error fetching ${objName} (SSR):`, error);
		return [];
	}
}

// Specific fetch functions for each table (matching Vue component exactly)
const _fetchDanhNgon = () => fetchVptsData("vpts_danhngon");
const _fetchDongCong = () => fetchVptsData("vpts_dongcong");
const _fetchTamSat = () => fetchVptsData("vpts_tamsat");
const _fetchKhongMinh = () => fetchVptsData("vpts_khongminh");
async function fetchThapNhiTruc() {
	return await fetchVptsData("vpts_thapnhitruc");
}
const _fetchNguyenBinhKhiem = () => fetchVptsData("vpts_nguyenbinhkhiem");
const _fetchCuuTinh = () => fetchVptsData("vpts_cuutinh");
async function fetchGioNuocLon() {
	return await fetchVptsData("vpts_gionuoclon");
}
const fetchKietHungTinhThoi = () => fetchVptsData("vpts_kiethungtinhthoi");
const _fetchCatHungThan = () => fetchVptsData("vpts_cathungthan");
const _fetchGioKhongVong = () => fetchVptsData("vpts_giokhongvong");
// Missing in earlier code: add Luc Nham and Tiet Khi fetchers
async function fetchLucNham() {
	return await fetchVptsData("vpts_lucnham");
}
async function fetchTietKhi() {
	return await fetchVptsData("vpts_tietkhi");
}
// Good/Bad stars endpoints - updated based on selected date
async function fetchSaoTot() {
	return await fetchVptsData("vpts_saotot");
}
async function fetchSaoXau() {
	return await fetchVptsData("vpts_saoxau");
}

const PI = Math.PI;

// Interfaces for data structures
interface LunarDate {
	day: number
	month: number
	year: number
	leap: boolean
	jd: number
}

interface Quote {
	id: string
	content: string
	author: string
}

interface SpiritDirection {
	stt: number
	can_ngay?: string
	can_chi_ngay?: string
	huong: string
}

interface _StarInfo {
	id: string
	name: string
	type: "good" | "bad"
	description: string
}

interface _HourFortune {
	hour: string
	status: "good" | "bad" | "neutral"
	description: string
}

// Backend data interfaces (following wu_ API pattern)
interface DanhNgon {
	id: string
	content: string
	tacgia: string
}

interface SaoTot {
	id: string
	ten?: string
	ten_sao?: string
	mota?: string
	tinh_chat?: string
}

interface SaoXau {
	id: string
	ten?: string
	ten_sao?: string
	mota?: string
	tinh_chat?: string
}

interface KietHungThoi {
	id: string
	gio: string
	trangthai: string
	mota: string
}

// Fortune telling data - will be loaded from backend
const HY_THAN: SpiritDirection[] = [
	{ stt: 1, can_ngay: "Giáp-Kỷ", huong: "Đông Bắc" },
	{ stt: 2, can_ngay: "Ất-Canh", huong: "Tây Bắc" },
	{ stt: 3, can_ngay: "Bính-Tân", huong: "Tây Nam" },
	{ stt: 4, can_ngay: "Đinh-Nhâm", huong: "Đông Nam" },
	{ stt: 5, can_ngay: "Mậu-Quý", huong: "Đông Nam" },
];

const HAC_THAN: SpiritDirection[] = [
	{ stt: 1, can_chi_ngay: "Giáp Tý-Ất Sửu-Bính Dần-Đinh Mão-Mậu Thìn", huong: "Đông" },
	{ stt: 2, can_chi_ngay: "Kỷ Tỵ-Canh Ngọ-Tân Mùi-Nhâm Thân-Quý Dậu", huong: "Nam" },
	{ stt: 3, can_chi_ngay: "Giáp Tuất-Ất Hợi", huong: "Tây" },
	{ stt: 4, can_chi_ngay: "Bính Tý-Đinh Sửu-Mậu Dần-Kỷ Mão-Canh Thìn", huong: "Bắc" },
	{ stt: 5, can_chi_ngay: "Tân Tỵ-Nhâm Ngọ-Quý Mùi", huong: "Đông" },
	{ stt: 6, can_chi_ngay: "Giáp Thân-Ất Dậu-Bính Tuất-Đinh Hợi", huong: "Nam" },
	{ stt: 7, can_chi_ngay: "Mậu Tý-Kỷ Sửu-Canh Dần-Tân Mão-Nhâm Thìn", huong: "Tây" },
	{ stt: 8, can_chi_ngay: "Mậu Tý-Kỷ Sửu-Canh Dần-Tân Mão-Nhâm Thìn", huong: "Bắc" },
];

const TAI_THAN: SpiritDirection[] = [
	{ stt: 1, can_ngay: "Giáp", huong: "Đông Bắc" },
	{ stt: 2, can_ngay: "Ất", huong: "Đông" },
	{ stt: 3, can_ngay: "Bính", huong: "Đông Nam" },
	{ stt: 4, can_ngay: "Đinh", huong: "Nam" },
	{ stt: 5, can_ngay: "Mậu", huong: "Đông Nam" },
	{ stt: 6, can_ngay: "Kỷ", huong: "Nam" },
	{ stt: 7, can_ngay: "Quý", huong: "Tây Bắc" },
];

// Lưu Nguyệt Phi Tinh data
const LUU_NGUYET_PHI_TINH = [
	{ thang_dl: 2, thang_al: 1, ty_ngo_mao_dau: "Bát bạch", thin_tuat_suu_mui: "Ngũ hoàng", dan_than_ty_hoi: "Nhị hắc" },
	{ thang_dl: 3, thang_al: 2, ty_ngo_mao_dau: "Thất xích", thin_tuat_suu_mui: "Tứ lục", dan_than_ty_hoi: "Nhất bạch" },
	{ thang_dl: 4, thang_al: 3, ty_ngo_mao_dau: "Lục bạch", thin_tuat_suu_mui: "Tam bích", dan_than_ty_hoi: "Cửu tử" },
	{ thang_dl: 5, thang_al: 4, ty_ngo_mao_dau: "Ngũ hoàng", thin_tuat_suu_mui: "Nhị hắc", dan_than_ty_hoi: "Bát bạch" },
	{ thang_dl: 6, thang_al: 5, ty_ngo_mao_dau: "Tứ lục", thin_tuat_suu_mui: "Nhất bạch", dan_than_ty_hoi: "Thất xích" },
	{ thang_dl: 7, thang_al: 6, ty_ngo_mao_dau: "Tam bích", thin_tuat_suu_mui: "Cửu tử", dan_than_ty_hoi: "Lục bạch" },
	{ thang_dl: 8, thang_al: 7, ty_ngo_mao_dau: "Nhị hắc", thin_tuat_suu_mui: "Bát bạch", dan_than_ty_hoi: "Ngũ hoàng" },
	{ thang_dl: 9, thang_al: 8, ty_ngo_mao_dau: "Nhất bạch", thin_tuat_suu_mui: "Thất xích", dan_than_ty_hoi: "Tứ lục" },
	{ thang_dl: 10, thang_al: 9, ty_ngo_mao_dau: "Cửu tử", thin_tuat_suu_mui: "Lục bạch", dan_than_ty_hoi: "Tam bích" },
	{ thang_dl: 11, thang_al: 10, ty_ngo_mao_dau: "Bát bạch", thin_tuat_suu_mui: "Ngũ hoàng", dan_than_ty_hoi: "Nhị hắc" },
	{ thang_dl: 12, thang_al: 11, ty_ngo_mao_dau: "Thất xích", thin_tuat_suu_mui: "Tứ lục", dan_than_ty_hoi: "Nhất bạch" },
	{ thang_dl: 1, thang_al: 12, ty_ngo_mao_dau: "Lục bạch", thin_tuat_suu_mui: "Tam bích", dan_than_ty_hoi: "Cửu tử" },
];

export default function XemNgayPage() {
	const menuItems = useWebsiteMenu();
	const { t } = useTranslation();
	const [selectedDate, setSelectedDate] = React.useState<Dayjs>(dayjs());
	const [currentMonth, setCurrentMonth] = React.useState<number>(dayjs().month() + 1);
	const [currentYear, setCurrentYear] = React.useState<number>(dayjs().year());
	const [isLunarMode, setIsLunarMode] = React.useState<boolean>(false);

	// Backend data states (following wu_ API pattern)
	const [quotes, setQuotes] = React.useState<DanhNgon[]>([]);
	const [saoTot, setSaoTot] = React.useState<SaoTot[]>([]);
	const [saoXau, setSaoXau] = React.useState<SaoXau[]>([]);
	const [kietHungThoi, setKietHungThoi] = React.useState<KietHungThoi[]>([]);
	
	// New comprehensive state variables following Vue component
	const [gioAl, setGioAl] = React.useState<any>({
		canChi: "",
		nguHanh: "Hỏa",
		queVan: "Ly",
	});
	const [napAmNgay, _setNapAmNgay] = React.useState<any>({ nguHanh: "" });
	const [thapNhiTruc, _setThapNhiTruc] = React.useState<any>({ tenTruc: "" });
	const [_kietHungNhat, _setKietHungNhat] = React.useState<any>({ text: "" });
	const [daiTieuNguyet, setDaiTieuNguyet] = React.useState<string>("");
	const [saoTheoNgay, _setSaoTheoNgay] = React.useState<any>({ tenSao: "" });
	const [ngayAmDuong, _setNgayAmDuong] = React.useState<any>({ noiDung: "" });
	const [ngayAl, setNgayAl] = React.useState<any>({
		can: "",
		chi: "",
		nguHanhCan: "",
		nguHanhChi: "",
		canChi: "",
	});
	
	// Cửu Tinh states
	const [namCuuTinh, setNamCuuTinh] = React.useState<any>({ text: "" });
	const [thangCuuTinh, setThangCuuTinh] = React.useState<any>({ text: "" });
	const [ngayCuuTinh, setNgayCuuTinh] = React.useState<any>({ text: "" });
	const [gioCuuTinh, setGioCuuTinh] = React.useState<any>({ text: "" });
	const [ngayLucNham, _setNgayLucNham] = React.useState<any>({ text: "" });
	const [tietKhi, _setTietKhi] = React.useState<any[]>([]);
	const [ngayXuatHanh, _setNgayXuatHanh] = React.useState<any>({ text: "" });
	const [ngayDauThang, _setNgayDauThang] = React.useState<string>("");
	const [danGian, _setDanGian] = React.useState<any>({ text: "" });
	
	// Calendar visibility state
	const [isCalendarVisible, setIsCalendarVisible] = React.useState<boolean>(false);
	
	// Additional state variables
	const [namAl, _setNamAl] = React.useState<any>({
		nguHanh: "Kim",
		queVan: "Càn",
		can: "",
		chi: "",
		canChi: "",
	});
	const [thangAl, _setThangAl] = React.useState<any>({
		nguHanh: "Mộc",
		queVan: "Chấn",
		can: "",
		chi: "",
		canChi: "",
	});
	
	// Day of week for display
	const dayOfWeek = React.useMemo(() => {
		const days = [
			t('website.services.xemngay.sunday'),
			t('website.services.xemngay.monday'),
			t('website.services.xemngay.tuesday'),
			t('website.services.xemngay.wednesday'),
			t('website.services.xemngay.thursday'),
			t('website.services.xemngay.friday'),
			t('website.services.xemngay.saturday')
		];
		return days[selectedDate.day()];
	}, [selectedDate, t]);
	
	// Kiết Hung Tinh states
	const [cacSaoTot, _setCacSaoTot] = React.useState<any[]>([]);
	const [cacSaoTotTk, _setCacSaoTotTk] = React.useState<any[]>([]);
	const [cacSaoXau, _setCacSaoXau] = React.useState<any[]>([]);
	const [cacSaoXauTk, _setCacSaoXauTk] = React.useState<any[]>([]);
	
	// Tam Sát states
	const [tamSatNien, _setTamSatNien] = React.useState<any>({ huongKhac: "" });
	const [tamSatNguyet, _setTamSatNguyet] = React.useState<any>({ huongKhac: "" });
	const [tamSatNhut, _setTamSatNhut] = React.useState<any>({ huongKhac: "" });
	const [tamSatThoi, _setTamSatThoi] = React.useState<any>({ huongKhac: "" });
	
	// Giờ hoàng đạo and related states
	const [gioHoangDao, _setGioHoangDao] = React.useState<any[]>([]);
	const [saoTheoGio, _setSaoTheoGio] = React.useState<any[]>([]);
	const [gioLucNham, _setGioLucNham] = React.useState<any[]>([]);
	const [gioNuoc, _setGioNuoc] = React.useState<any>({ gioNuocLon: "", gioNuocNho: "" });
	
	// Tuổi xung khắc and directions
	const [tuoiXungKhacNgay, _setTuoiXungKhacNgay] = React.useState<string[]>([]);
	const [tuoiXungKhacThang, _setTuoiXungKhacThang] = React.useState<string[]>([]);
	const [huongKietHung, _setHuongKietHung] = React.useState<any>({
		taiThan: "",
		hyThan: "",
		hacThan: "",
	});
	// const DATA_MAX = 20; // Total number of API calls expected

	// Default quotes if backend fails
	const defaultQuotes: Quote[] = [
		{ id: "1", content: "Học tập không phải là một cuộc đua, mà là một hành trình khám phá.", author: "Khổng Tử" },
		{ id: "2", content: "Thành công không phải là chìa khóa của hạnh phúc. Hạnh phúc là chìa khóa của thành công.", author: "Albert Schweitzer" },
		{ id: "3", content: "Chỉ có một cách để làm việc tuyệt vời, đó là yêu thích công việc bạn làm.", author: "Steve Jobs" },
	];

	// Helper functions from Vue component (moved up for use in lunar calculation)
	const INT = (d: number): number => Math.floor(d);

	const jdFromDate = (dd: number, mm: number, yy: number): number => {
		const a = INT((14 - mm) / 12);
		const y = yy + 4800 - a;
		const m = mm + 12 * a - 3;
		const jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
		return jd;
	};

	const NewMoon = (k: number): number => {
		const T = k / 1236.85;
		const T2 = T * T;
		const T3 = T2 * T;
		const dr = PI / 180;
		let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
		Jd1 = Jd1 + 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
		const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
		const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
		const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
		let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
		C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
		C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
		C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
		C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
		C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
		C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
		return Jd1 + C1;
	};

	const SunLongitude = (jdn: number): number => {
		const T = (jdn - 2451545.0) / 36525;
		const T2 = T * T;
		const dr = PI / 180;
		const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
		const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
		let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
		DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
		let L = L0 + DL;
		L = L - 360 * INT(L / 360);
		return L;
	};

	const getSunLongitude = (dayNumber: number, timeZone: number): number => {
		return INT(SunLongitude(dayNumber - 0.5 - timeZone / 24) / 30);
	};

	const getNewMoonDay = (k: number, timeZone: number): number => {
		return INT(NewMoon(k) + 0.5 + timeZone / 24);
	};

	const getLunarMonth11 = (yy: number, timeZone: number): number => {
		const off = jdFromDate(31, 12, yy) - 2415021.076998695;
		const k = INT(off / 29.530588853);
		let nm = getNewMoonDay(k, timeZone);
		const sunLong = getSunLongitude(nm, timeZone);
		if (sunLong >= 9) {
			nm = getNewMoonDay(k - 1, timeZone);
		}
		return nm;
	};

	const getLeapMonthOffset = (a11: number, timeZone: number): number => {
		const k = INT(0.5 + (a11 - 2415021.076998695) / 29.530588853);
		let last = 0;
		let i = 1;
		let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
		do {
			last = arc;
			i++;
			arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
		} while (arc !== last && i < 14);
		return i - 1;
	};

	const duongQuaAm = (dd: number, mm: number, yy: number, timeZone: number = 7): LunarDate => {
		let lunarDay, lunarMonth, lunarYear, lunarLeap;
		const dayNumber = jdFromDate(dd, mm, yy);
		const k = INT((dayNumber - 2415021.076998695) / 29.530588853);
		let monthStart = getNewMoonDay(k + 1, timeZone);
		if (monthStart > dayNumber) {
			monthStart = getNewMoonDay(k, timeZone);
		}
		let a11 = getLunarMonth11(yy, timeZone);
		const b11 = a11;
		if (a11 >= monthStart) {
			lunarYear = yy;
			a11 = getLunarMonth11(yy - 1, timeZone);
		} else {
			lunarYear = yy + 1;
		}
		lunarDay = dayNumber - monthStart + 1;
		const diff = INT((monthStart - a11) / 29);
		lunarLeap = false;
		lunarMonth = diff + 11;
		if (b11 - a11 > 365) {
			const leapMonthDiff = getLeapMonthOffset(a11, timeZone);
			if (diff >= leapMonthDiff) {
				lunarMonth = diff + 10;
				if (diff === leapMonthDiff) {
					lunarLeap = true;
				}
			}
		}
		if (lunarMonth > 12) {
			lunarMonth = lunarMonth - 12;
		}
		if (lunarMonth >= 11 && diff < 4) {
			lunarYear -= 1;
		}
		return { day: lunarDay, month: lunarMonth, year: lunarYear, leap: lunarLeap, jd: dayNumber };
	};

	// Get current lunar info (must be declared before useEffect that uses it)
	const lunar = React.useMemo(() => duongQuaAm(selectedDate.date(), selectedDate.month() + 1, selectedDate.year()), [selectedDate]);
	
	// Calculate Giờ Nước based on lunar date (similar to Vue implementation)
	const calculateGioNuoc = React.useCallback((lunarDate: LunarDate) => {
		const day = lunarDate.day;
		const month = lunarDate.month;
		
		// Calculation based on lunar day and month like in Vue
		let gioNuocLon = "";
		let gioNuocNho = "";
		
		if (day >= 1 && day <= 15) {
			// First half of lunar month
			switch (month % 4) {
				case 1:
					gioNuocLon = "7h-9h, 19h-21h";
					gioNuocNho = "1h-3h, 13h-15h";
					break;
				case 2:
					gioNuocLon = "9h-11h, 21h-23h";
					gioNuocNho = "3h-5h, 15h-17h";
					break;
				case 3:
					gioNuocLon = "11h-13h, 23h-1h";
					gioNuocNho = "5h-7h, 17h-19h";
					break;
				case 0:
					gioNuocLon = "5h-7h, 17h-19h";
					gioNuocNho = "11h-13h, 23h-1h";
					break;
			}
		}
		else {
			// Second half of lunar month
			switch (month % 4) {
				case 1:
					gioNuocLon = "13h-15h, 1h-3h";
					gioNuocNho = "7h-9h, 19h-21h";
					break;
				case 2:
					gioNuocLon = "15h-17h, 3h-5h";
					gioNuocNho = "9h-11h, 21h-23h";
					break;
				case 3:
					gioNuocLon = "17h-19h, 5h-7h";
					gioNuocNho = "11h-13h, 23h-1h";
					break;
				case 0:
					gioNuocLon = "19h-21h, 7h-9h";
					gioNuocNho = "5h-7h, 17h-19h";
					break;
			}
		}
		
		return { gioNuocLon, gioNuocNho };
	}, []);

	// Load data from backend following wu_ pattern (exactly like Vue component)
	React.useEffect(() => {
		const loadBackendData = async () => {
			try {
				// Load data and update states properly
				const [
					danhNgonData,
				] = await Promise.all([
					_fetchDanhNgon(),
				]);

				setQuotes(danhNgonData || defaultQuotes);

				// Load other essential data with proper state updates
				try {
					const [thapNhiTrucData, lucNhamData, tietKhiData, gioNuocData] = await Promise.all([
						fetchThapNhiTruc(),
						fetchLucNham(),
						fetchTietKhi(),
						fetchGioNuocLon(),
					]);
					
					// Update states with actual data instead of "Đang tải..."
					if (Array.isArray(thapNhiTrucData) && thapNhiTrucData[0]) {
						_setThapNhiTruc({ tenTruc: thapNhiTrucData[0].tenTruc || "Không có dữ liệu" });
					}
					
					if (Array.isArray(lucNhamData)) {
						_setNgayLucNham({ text: lucNhamData.map((item: any) => item.text || item.name || "").join(", ") || "Không có dữ liệu" });
					}
					
					if (Array.isArray(tietKhiData)) {
						_setTietKhi(tietKhiData || []);
					}
					
					// Update Giờ Nước Lớn data
					if (Array.isArray(gioNuocData) && gioNuocData[0]) {
						_setGioNuoc({
							gioNuocLon: gioNuocData[0].gio_nuoc_lon || "7h-9h, 19h-21h",
							gioNuocNho: gioNuocData[0].gio_nuoc_nho || "13h-15h, 1h-3h",
						});
					}
				} catch (detailError) {
					console.warn("Some detailed data could not be loaded:", detailError);
				}
			} catch (error) {
				console.error("Error loading backend data:", error);
				// Set fallback data to avoid "Đang tải..." permanently
				_setThapNhiTruc({ tenTruc: "Không có dữ liệu từ server" });
				_setNgayLucNham({ text: "Không có dữ liệu từ server" });
				_setDanGian({ text: "Không có dữ liệu từ server" });
			}
		};

		loadBackendData();
	}, []);

	// Effect to update stars and water time when date changes
	React.useEffect(() => {
		const updateDateBasedData = async () => {
			try {
				// Update Sao Tốt/Xấu based on selected date
				const [saoTotData, saoXauData, kietHungData] = await Promise.all([
					fetchSaoTot(),
					fetchSaoXau(),
					fetchKietHungTinhThoi(),
				]);
				
				setSaoTot(Array.isArray(saoTotData) ? saoTotData : []);
				setSaoXau(Array.isArray(saoXauData) ? saoXauData : []);
				setKietHungThoi(Array.isArray(kietHungData) ? kietHungData : []);

				// Calculate Giờ Nước based on lunar date
				const calculatedGioNuoc = calculateGioNuoc(lunar);
				_setGioNuoc(calculatedGioNuoc);
			}
			catch (error) {
				console.warn("Error updating date-based data:", error);
			}
		};

		updateDateBasedData();
	}, [selectedDate, lunar, calculateGioNuoc]);

	// Additional helper functions
	const convertSolarToLunar = (solarDate: Dayjs) => {
		return duongQuaAm(solarDate.date(), solarDate.month() + 1, solarDate.year());
	};

	const getGioHoangDao = (jd: number): string[] => {
		const chi = (jd + 1) % 12;
		let gioHD = "";
		switch (chi) {
			case 0:
			case 6:
				gioHD = "23-1,5-7,9-11,15-17";
				break;
			case 1:
			case 7:
				gioHD = "1-3,7-9,13-15,19-21";
				break;
			case 2:
			case 8:
				gioHD = "3-5,9-11,15-17,21-23";
				break;
			case 3:
			case 9:
				gioHD = "5-7,11-13,17-19,23-1";
				break;
			case 4:
			case 10:
				gioHD = "7-9,13-15,19-21,1-3";
				break;
			case 5:
			case 11:
				gioHD = "9-11,15-17,21-23,3-5";
				break;
		}
		return gioHD.split(",");
	};

	const TinhTietKhi = (n: number): [string, number] => {
		const Index = getSunLongitude(n, 7);
		return [TIETKHI[Index], Index];
	};

	// Computed values based on lunar date
	const [dayCanChi, monthCanChi, yearCanChi] = React.useMemo(() => getCanChi(lunar), [lunar]);
	const _gioHoangDaoCalculated = React.useMemo(() => getGioHoangDao(lunar.jd), [lunar]);
	const [_tietKhiCalculated] = React.useMemo(() => TinhTietKhi(lunar.jd), [lunar]);


	// Get fortune telling info
	const getHyThan = (): string => {
		const canNgay = dayCanChi.split(" ")[0];
		const hyThan = HY_THAN.find(h => h.can_ngay && h.can_ngay.includes(canNgay));
		return hyThan ? hyThan.huong : "Không xác định";
	};

	// Cửu Tinh calculation functions from Vue component
	const tinhCuuTinhNam = (namAl: any): any => {
		const sttNam = (namAl + 6) % 9;
		const saoNames = ["Nhất Bạch", "Nhị Hắc", "Tam Bích", "Tứ Lục", "Ngũ Hoàng", "Lục Bạch", "Thất Xích", "Bát Bạch", "Cửu Tử"];
		return {
			text: saoNames[sttNam] || "Nhất Bạch",
			note: `Sao ${saoNames[sttNam]} chủ năm ${namAl}`
		};
	};

	const tinhCuuTinhThang = (thangAl: number, namAl: number): any => {
		const sttNam = (namAl + 6) % 9;
		const sttThang = (sttNam + thangAl - 1) % 9;
		const saoNames = ["Nhất Bạch", "Nhị Hắc", "Tam Bích", "Tứ Lục", "Ngũ Hoàng", "Lục Bạch", "Thất Xích", "Bát Bạch", "Cửu Tử"];
		return {
			text: saoNames[sttThang] || "Nhất Bạch",
			note: `Sao ${saoNames[sttThang]} chủ tháng ${thangAl}`
		};
	};

	const tinhCuuTinhNgay = (ngayAl: number, thangAl: number, namAl: number): any => {
		const sttNam = (namAl + 6) % 9;
		const sttThang = (sttNam + thangAl - 1) % 9;
		const sttNgay = (sttThang + ngayAl - 1) % 9;
		const saoNames = ["Nhất Bạch", "Nhị Hắc", "Tam Bích", "Tứ Lục", "Ngũ Hoàng", "Lục Bạch", "Thất Xích", "Bát Bạch", "Cửu Tử"];
		return {
			text: saoNames[sttNgay] || "Nhất Bạch",
			note: `Sao ${saoNames[sttNgay]} chủ ngày ${ngayAl}`
		};
	};

	const tinhCuuTinhGio = (gioChiIndex: number, ngayAl: number, thangAl: number, namAl: number): any => {
		const sttNam = (namAl + 6) % 9;
		const sttThang = (sttNam + thangAl - 1) % 9;
		const sttNgay = (sttThang + ngayAl - 1) % 9;
		const sttGio = (sttNgay + gioChiIndex) % 9;
		const saoNames = ["Nhất Bạch", "Nhị Hắc", "Tam Bích", "Tứ Lục", "Ngũ Hoàng", "Lục Bạch", "Thất Xích", "Bát Bạch", "Cửu Tử"];
		return {
			text: saoNames[sttGio] || "Nhất Bạch",
			note: `Sao ${saoNames[sttGio]} chủ giờ ${CHI[gioChiIndex]}`
		};
	};

	// Advanced calculation function that updates all comprehensive data
	const tinhToanChiTiet = React.useCallback(async () => {
		try {
			const currentGio = selectedDate.hour();
			const gioChiIndex = Math.floor(currentGio / 2);
			
			// Update giờ âm lịch
			const canNgayIndex = CAN.findIndex(can => dayCanChi.includes(can));
			const gioCanIndex = (canNgayIndex * 2 + gioChiIndex) % 10;
			const gioCanChi = `${CAN[gioCanIndex]} ${CHI[gioChiIndex]}`;
			setGioAl({ canChi: gioCanChi });

			// Update ngayAl with detailed info
			const canNgay = dayCanChi.split(" ")[0];
			const chiNgay = dayCanChi.split(" ")[1];
			
			// Tính Ngũ Hành cho Can
			const nguHanhCan = {
				"Giáp": "Mộc", "Ất": "Mộc",
				"Bính": "Hỏa", "Đinh": "Hỏa", 
				"Mậu": "Thổ", "Kỷ": "Thổ",
				"Canh": "Kim", "Tân": "Kim",
				"Nhâm": "Thủy", "Quý": "Thủy"
			}[canNgay] || "Kim";
			
			// Tính Ngũ Hành cho Chi
			const nguHanhChi = {
				"Tý": "Thủy", "Sửu": "Thổ", "Dần": "Mộc", "Mão": "Mộc",
				"Thìn": "Thổ", "Tỵ": "Hỏa", "Ngọ": "Hỏa", "Mùi": "Thổ", 
				"Thân": "Kim", "Dậu": "Kim", "Tuất": "Thổ", "Hợi": "Thủy"
			}[chiNgay] || "Thổ";
			
			setNgayAl({
				can: canNgay,
				chi: chiNgay,
				canChi: dayCanChi,
				nguHanhCan: nguHanhCan,
				nguHanhChi: nguHanhChi
			});

			// Calculate Cửu Tinh
			setNamCuuTinh(tinhCuuTinhNam(lunar.year));
			setThangCuuTinh(tinhCuuTinhThang(lunar.month, lunar.year));
			setNgayCuuTinh(tinhCuuTinhNgay(lunar.day, lunar.month, lunar.year));
			setGioCuuTinh(tinhCuuTinhGio(gioChiIndex, lunar.day, lunar.month, lunar.year));

			// Set some basic calculated values
			setDaiTieuNguyet("Tháng Đủ"); // Default, should be calculated properly
			_setNgayDauThang(dayCanChi); // Simplified, should calculate first day of month

		} catch (error) {
			console.error("Error in detailed calculations:", error);
		}
	}, [selectedDate, lunar, dayCanChi]);

	// Gọi hàm tính toán chi tiết mỗi khi ngày được chọn thay đổi
	React.useEffect(() => {
		tinhToanChiTiet();
	}, [tinhToanChiTiet]);

	const getTaiThan = (): string => {
		const canNgay = dayCanChi.split(" ")[0];
		const taiThan = TAI_THAN.find(t => t.can_ngay === canNgay);
		return taiThan ? taiThan.huong : "Không xác định";
	};

	const getHacThan = (): string => {
		const canChiNgay = dayCanChi;
		const hacThan = HAC_THAN.find(h => h.can_chi_ngay && h.can_chi_ngay.includes(canChiNgay));
		return hacThan ? hacThan.huong : "Tại Thiên"; // Sửa lỗi và thêm giá trị mặc định
	};

	// Get Lưu Nguyệt Phi Tinh for current date
	const getLuuNguyetPhiTinh = (): string => {
		const currentMonth = lunar.month;
		const phiTinh = LUU_NGUYET_PHI_TINH.find(p => p.thang_al === currentMonth);
		if (!phiTinh) return "Không xác định";

		const chi = (lunar.jd + 1) % 12;
		// Determine direction based on Chi
		if ([0, 6, 2, 8].includes(chi)) return phiTinh.ty_ngo_mao_dau;
		if ([4, 10, 1, 7].includes(chi)) return phiTinh.thin_tuat_suu_mui;
		if ([2, 8, 5, 11].includes(chi)) return phiTinh.dan_than_ty_hoi;
		return phiTinh.ty_ngo_mao_dau;
	};

	// Get today's good and bad stars
	const getTodayStars = () => {
		const dayIndex = (lunar.jd + lunar.day) % saoTot.length;
		const goodStar = saoTot[dayIndex] || null;
		const badStar = saoXau[dayIndex] || null;
		return { goodStar, badStar };
	};

	// Get fortune hours for today
	const getTodayFortuneHours = () => {
		const hours = gioHoangDao;
		const fortuneHours = kietHungThoi.filter(k => 
			hours.some(h => k.gio.includes(h.split("-")[0]))
		);
		return fortuneHours;
	};

	// Generate calendar for current month
	const generateCalendar = () => {
		const firstDay = dayjs().year(currentYear).month(currentMonth - 1).startOf('month');
		const lastDay = firstDay.endOf('month');
		const startWeek = firstDay.startOf('week');
		const endWeek = lastDay.endOf('week');
		
		const calendar = [];
		let current = startWeek;
		
		while (current.isBefore(endWeek) || current.isSame(endWeek, 'day')) {
			const week = [];
			for (let i = 0; i < 7; i++) {
				const isCurrentMonth = current.month() === firstDay.month();
				const lunarInfo = duongQuaAm(current.date(), current.month() + 1, current.year());
				
				week.push({
					solar: current,
					lunar: lunarInfo,
					isCurrentMonth,
					isToday: current.isSame(dayjs(), 'day'),
					isSelected: current.isSame(selectedDate, 'day')
				});
				current = current.add(1, 'day');
			}
			calendar.push(week);
		}
		
		return calendar;
	};

	const calendar = React.useMemo(() => generateCalendar(), [currentMonth, currentYear, selectedDate]);

	const navigateMonth = (direction: 'prev' | 'next') => {
		if (direction === 'prev') {
			if (currentMonth === 1) {
				setCurrentMonth(12);
				setCurrentYear(currentYear - 1);
			} else {
				setCurrentMonth(currentMonth - 1);
			}
		} else {
			if (currentMonth === 12) {
				setCurrentMonth(1);
				setCurrentYear(currentYear + 1);
			} else {
				setCurrentMonth(currentMonth + 1);
			}
		}
	};

	const navigateYear = (direction: 'prev' | 'next') => {
		setCurrentYear(currentYear + (direction === 'prev' ? -1 : 1));
	};

	const onDateClick = (date: Dayjs) => {
		setSelectedDate(date);
	};

	// Random quote - convert backend format to display format
	const randomQuote = React.useMemo(() => {
		const availableQuotes = quotes.length > 0 ? quotes : defaultQuotes.map(q => ({
			id: q.id,
			content: q.content,
			tacgia: q.author
		}));
		if (availableQuotes.length === 0) {
			return { content: "Hãy luôn học hỏi và phát triển bản thân.", tacgia: "Danh ngôn" };
		}
		const selected = availableQuotes[Math.floor(Math.random() * availableQuotes.length)];
		return { content: selected.content, tacgia: selected.tacgia };
	}, [quotes, defaultQuotes]);

	return React.createElement(
		WebsiteLayout as any,
		{ menuItems, selectedKey: "/xem-ngay", title: "Xem Ngày Tốt Xấu" },
		React.createElement(
			"div",
			{ 
				style: { 
					padding: "24px", 
					fontFamily: "'Times New Roman', serif",
					maxWidth: "100%",
					overflow: "hidden",
				},
				className: "xem-ngay-responsive",
				id: "dvxemngaytotxau",
			},
			// Title
			React.createElement(Typography.Title as any, { 
				level: 2, 
				style: { 
					marginBottom: 24, 
					textAlign: 'center',
					color: '#1890ff'
				} 
			}, "Công Cụ Xem Ngày Tốt Xấu"),
			
			// Tickler (Quote section with red border)
			React.createElement(
				Card,
				{ 
					style: { 
						marginBottom: 24,
						border: '2px solid #ff4d4f',
						borderRadius: '8px'
					},
					bodyStyle: { 
						padding: '16px',
						textAlign: 'center'
					}
				},
				React.createElement(
					"div",
					{ style: { color: '#1890ff', fontSize: '16px', fontStyle: 'italic', marginBottom: 8 } },
					`"${randomQuote.content}"`
				),
				React.createElement(
					"div",
					{ style: { color: "#666", fontSize: "14px" } },
					`- ${randomQuote.tacgia}`
				)
			),

			// Main layout - 3 columns like Vue template: TỔNG QUAN - CHỌN NGÀY - THÔNG TIN
			React.createElement(
				Row,
				{ gutter: [16, 16] },
				
				// Left column - TỔNG QUAN (responsive: full width on mobile, 1/3 on desktop)
				React.createElement(
					Col,
					{ xs: 24, sm: 24, md: 8, lg: 8, xl: 8 },
					React.createElement(
						Card,
						{
							title: "TỔNG QUAN",
							size: "small",
							style: { height: "100%" }
						},
						React.createElement(
							Descriptions,
							{
								column: 1,
								size: "small",
								labelStyle: { fontWeight: "normal", width: "50%" },
								contentStyle: { fontWeight: "bold" }
							},
							React.createElement(Descriptions.Item, { label: "Giờ Đang Xem", children: gioAl.canChi || `Giờ ${selectedDate.hour()}` }),
							React.createElement(Descriptions.Item, { label: "Nạp Âm Ngày", children: napAmNgay.nguHanh || "Kim" }),
							React.createElement(Descriptions.Item, { label: "Thập Nhị Trực", children: `Trực ${thapNhiTruc.tenTruc || "Khai"}` }),
							React.createElement(Descriptions.Item, { label: "Kiết Hung Nhật", children: React.createElement("span", { style: { color: "#52c41a" } }, "Ngày Bình Thường") }),
							React.createElement(Descriptions.Item, { label: "Đại Tiểu Nguyệt", children: daiTieuNguyet }),
							React.createElement(Descriptions.Item, { label: "Nhị Thập Bát Tú", children: saoTheoNgay.tenSao || "Giác Mộc Giao" }),
							React.createElement(Descriptions.Item, { label: "Ngày Âm Dương", children: ngayAmDuong.noiDung || "Ngày Âm" }),
							React.createElement(Descriptions.Item, { label: "Can Ngày", children: `${ngayAl.can} (${ngayAl.nguHanhCan || "Kim"})` }),
							React.createElement(Descriptions.Item, { label: "Chi Ngày", children: `${ngayAl.chi} (${ngayAl.nguHanhChi || "Thổ"})` })
						)
					)
				),
				
				// Center column - CHỌN NGÀY với Calendar (responsive: full width on mobile, 1/3 on desktop)
				React.createElement(
					Col,
					{ xs: 24, sm: 24, md: 8, lg: 8, xl: 8 },
					React.createElement(
						Card,
						{ 
							title: "CÔNG CỤ XEM NGÀY TỐT, XẤU",
							size: "small",
							style: { height: "100%" },
							bodyStyle: { position: "relative" }
						},
						// Nút mở/ẩn lịch luôn hiển thị phía trên
						React.createElement(
							"div",
							{ style: { textAlign: "center", marginBottom: 16, position: "relative", zIndex: 1100 } },
							React.createElement(Button, {
								type: isCalendarVisible ? "default" : "primary",
								size: "middle",
								style: {
									fontWeight: "bold",
									background: isCalendarVisible ? "#fffbe6" : "#1890ff",
									color: isCalendarVisible ? "#faad14" : "#fff",
									border: isCalendarVisible ? "1px solid #faad14" : undefined,
									boxShadow: isCalendarVisible ? "0 2px 8px #faad1440" : undefined,
									minWidth: 120,
									minHeight: 36,
									fontSize: 16,
									transition: "all 0.2s"
								},
								onClick: () => setIsCalendarVisible(v => !v)
							}, isCalendarVisible ? "Ẩn Lịch" : "Mở Lịch")
						),
						// Current date display
						React.createElement(
							"div",
							{
								style: {
									textAlign: "center",
									fontSize: "14px",
									fontWeight: "bold",
									marginBottom: 16,
									textTransform: "uppercase"
								}
							},
							`ĐANG HIỂN THỊ ${dayOfWeek}`
						),
						
						// Calendar popup as Modal
						React.createElement(Modal, {
							open: isCalendarVisible,
							title: `Chọn Ngày - Tháng ${currentMonth}/${currentYear}`,
							centered: true,
							footer: null,
							width: 520,
							maskClosable: true,
							onCancel: () => setIsCalendarVisible(false),
							bodyStyle: { paddingTop: 8 }
						},
							// Calendar navigation
							React.createElement(
								"div",
								{ style: { textAlign: "center", marginBottom: 16 } },
								React.createElement(
									Button.Group,
									{ size: "small" },
									React.createElement(Button, { 
										onClick: () => navigateYear("prev"),
									}, "<<"),
									React.createElement(Button, { 
										onClick: () => navigateMonth("prev"),
									}, "<"),
									React.createElement(
										"span",
										{ style: { margin: "0 16px", fontSize: "16px", fontWeight: "bold" } },
										`Tháng ${currentMonth}/${currentYear}`,
									),
									React.createElement(Button, { 
										onClick: () => navigateMonth("next"),
									}, ">"),
									React.createElement(Button, { 
										onClick: () => navigateYear("next"),
									}, ">>"),
								),
							),
							// Calendar grid
							React.createElement(
								"table",
								{ 
									style: {
										width: "100%", 
										border: "2px solid #d9d9d9",
										borderCollapse: "collapse"
									}
								},
								React.createElement(
									"thead",
									null,
									React.createElement(
										"tr",
										null,
										...DAYNAMES.map((dayName, index) => 
											React.createElement(
												"th",
												{ 
													key: index, 
													style: { 
														textAlign: "center", 
														fontWeight: "bold", 
														padding: "8px",
														backgroundColor: "#f0f0f0",
														color: index === 0 ? "#ff4d4f" : "#000",
														border: "1px solid #d9d9d9"
													} 
												},
												dayName
											)
										)
									)
								),
								React.createElement(
									"tbody",
									null,
									...calendar.map((week, weekIndex) =>
										React.createElement(
											"tr",
											{ key: weekIndex },
											...week.map((day, dayIndex) =>
												React.createElement(
													Tooltip,
													{
														key: dayIndex,
														title: getDayName(day.lunar),
														placement: "top",
													},
													React.createElement(
														"td",
														{
															style: {
																minHeight: "60px",
																padding: "4px",
																cursor: "pointer",
																border: "1px solid #d9d9d9",
																backgroundColor: day.isSelected ? "#e6f7ff" :
																	day.isToday ? "#fff7e6" :
																	day.isCurrentMonth ? "#fff" : "#f5f5f5",
																opacity: day.isCurrentMonth ? 1 : 0.5,
																textAlign: "center",
																verticalAlign: "top"
															},
															onClick: () => {
																onDateClick(day.solar);
																setIsCalendarVisible(false);
															}
														},
														React.createElement(
															"div",
															{
																style: {
																	fontSize: "14px",
																	fontWeight: day.isToday ? "bold" : "normal",
																	color: dayIndex === 0 ? "#ff4d4f" : "#000"
																}
															},
															day.solar.date()
														),
														React.createElement(
															"div",
															{
																style: {
																	fontSize: "11px",
																	color: "#666",
																	marginTop: "2px"
																}
															},
															day.lunar.day === 1 ? `${day.lunar.day}/${day.lunar.month}` : day.lunar.day
														)
													)
												)
											)
										)
									)
								)
							),
							// Close button
							React.createElement(
								"div",
								{ style: { textAlign: "center", marginTop: 12 } },
								React.createElement(Button, {
									type: "default",
									size: "small",
									onClick: () => setIsCalendarVisible(false)
								}, "- Đóng Lại -")
							)
						),
						
						// Đoạn mới: chỉ 1 input, toggle Âm/Dương, tự động đồng bộ
						React.createElement(
							"div",
							{ style: { textAlign: "center", marginBottom: 16 } },
							React.createElement(Button, {
								type: isLunarMode ? "primary" : "default",
								size: "small",
								style: { marginRight: 8 },
								onClick: () => setIsLunarMode(false)
							}, "Dương Lịch"),
							React.createElement(Button, {
								type: isLunarMode ? "default" : "primary",
								size: "small",
								onClick: () => setIsLunarMode(true)
							}, "Âm Lịch"),
							React.createElement("div", { style: { marginTop: 12 } },
								isLunarMode
									? React.createElement("input", {
										style: {
											width: "140px",
											borderRadius: "5px",
											border: "1px solid #ddd",
											textAlign: "center",
											padding: "4px",
											fontSize: "16px"
										},
										value: `${lunar.day.toString().padStart(2, "0")}/${lunar.month.toString().padStart(2, "0")}/${lunar.year}`,
										onChange: (e: any) => {
											const [day, month, year] = e.target.value.split("/");
											if (day && month && year && day.length <= 2 && month.length <= 2 && year.length === 4) {
												let solarYear = Number.parseInt(year, 10);
												let solarMonth = Number.parseInt(month, 10);
												let solarDay = Number.parseInt(day, 10);
												if (solarMonth <= 2) {
													solarMonth = solarMonth + 10;
													solarYear = solarYear - 1;
												} else {
													solarMonth = solarMonth - 2;
												}
												const maxDaysInMonth = dayjs(new Date(solarYear, solarMonth - 1, 1)).daysInMonth();
												if (solarDay > maxDaysInMonth) {
													solarDay = maxDaysInMonth;
												}
												const solarDate = dayjs(new Date(solarYear, solarMonth - 1, solarDay));
												if (solarDate.isValid()) {
													setSelectedDate(solarDate);
												}
											}
										}
									})
									: React.createElement("input", {
										style: {
											width: "140px",
											borderRadius: "5px",
											border: "1px solid #ddd",
											textAlign: "center",
											padding: "4px",
											fontSize: "16px"
										},
										value: selectedDate.format("DD/MM/YYYY"),
										onChange: (e: any) => {
											const [day, month, year] = e.target.value.split("/");
											if (day && month && year && day.length <= 2 && month.length <= 2 && year.length === 4) {
												const newDate = dayjs(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
												if (newDate.isValid()) {
													setSelectedDate(newDate);
												}
											}
										}
									})
							)
						),
						
						// Can Chi display with tooltips (matching Vue layout)
						React.createElement(
							"div",
							{
								className: "can-chi-display",
								style: {
									display: "table",
									width: "100%",
									textAlign: "center",
									fontSize: "14px",
									fontWeight: "bold",
									marginTop: 8,
									marginBottom: 16,
									padding: "8px 4px",
								},
							},
							// Năm
							React.createElement(
								"div",
								{ style: { display: "table-cell", verticalAlign: "middle" } },
								React.createElement(
									Tooltip,
									{ 
										title: `Năm ${yearCanChi} - Ngũ hành: ${namAl.nguHanh} - Quẻ: ${namAl.queVan}`,
										placement: "top",
									},
									React.createElement(
										"div",
										{ className: "tooltip-wrapper", style: { padding: "4px" } },
										React.createElement("div", null, "Năm"),
										React.createElement("div", { style: { color: "#d32f2f" } }, namAl.nguHanh),
										React.createElement("div", null, yearCanChi),
										React.createElement("div", { style: { color: "#1976d2" } }, namAl.queVan || "Càn"),
									),
								)
							),
							// Separator
							React.createElement(
								"div",
								{ style: { display: "table-cell", verticalAlign: "middle", width: "20px" } },
								React.createElement("div", { style: { color: "#666" } }, "-")
							),
							// Tháng
							React.createElement(
								"div",
								{ style: { display: "table-cell", verticalAlign: "middle" } },
								React.createElement(
									Tooltip,
									{ 
										title: `Tháng ${monthCanChi} - Ngũ hành: ${thangAl.nguHanh} - Quẻ: ${thangAl.queVan}`,
										placement: "top",
									},
									React.createElement(
										"div",
										{ className: "tooltip-wrapper", style: { padding: "4px" } },
										React.createElement("div", null, "Tháng"),
										React.createElement("div", { style: { color: "#d32f2f" } }, thangAl.nguHanh),
										React.createElement("div", null, monthCanChi),
										React.createElement("div", { style: { color: "#1976d2" } }, thangAl.queVan || "Chấn"),
									),
								)
							),
							// Separator
							React.createElement(
								"div",
								{ style: { display: "table-cell", verticalAlign: "middle", width: "20px" } },
								React.createElement("div", { style: { color: "#666" } }, "-")
							),
							// Ngày
							React.createElement(
								"div",
								{ style: { display: "table-cell", verticalAlign: "middle" } },
								React.createElement(
									Tooltip,
									{ 
										title: `Ngày ${dayCanChi} - Ngũ hành: ${ngayAl.nguHanh} - Quẻ: ${ngayAl.queVan}`,
										placement: "top",
									},
									React.createElement(
										"div",
										{ className: "tooltip-wrapper", style: { padding: "4px" } },
										React.createElement("div", null, "Ngày"),
										React.createElement("div", { style: { color: "#d32f2f" } }, ngayAl.nguHanh || "Hỏa"),
										React.createElement("div", null, dayCanChi),
										React.createElement("div", { style: { color: "#1976d2" } }, ngayAl.queVan || "Ly"),
									),
								)
							),
							// Separator
							React.createElement(
								"div",
								{ style: { display: "table-cell", verticalAlign: "middle", width: "20px" } },
								React.createElement("div", { style: { color: "#666" } }, "-")
							),
							// Giờ
							React.createElement(
								"div",
								{ style: { display: "table-cell", verticalAlign: "middle" } },
								React.createElement(
									Tooltip,
									{ 
										title: `Giờ ${gioAl.canChi || "Bính Ngọ"} - Ngũ hành: ${gioAl.nguHanh} - Quẻ: ${gioAl.queVan}`,
										placement: "top",
									},
									React.createElement(
										"div",
										{ className: "tooltip-wrapper", style: { padding: "4px" } },
										React.createElement("div", null, "Giờ"),
										React.createElement("div", { style: { color: "#d32f2f" } }, gioAl.nguHanh),
										React.createElement("div", null, gioAl.canChi || "Bính Ngọ"),
										React.createElement("div", { style: { color: "#1976d2" } }, gioAl.queVan),
									),
								)
							)
						),
							React.createElement("div", { style: { margin: "0 8px", alignSelf: "center" } }, "-"),
							React.createElement(
								"div", 
								{ style: { flex: 1 } },
								React.createElement("div", null, "Tháng"),
								React.createElement("div", null, thangAl.nguHanh || "Mộc"), 
								React.createElement("div", null, monthCanChi),
								React.createElement("div", null, thangAl.queVan || "Chấn")
							),
							React.createElement("div", { style: { margin: "0 8px", alignSelf: "center" } }, "-"),
							React.createElement(
								"div",
								{ style: { flex: 1 } },
								React.createElement("div", null, "Ngày"),
								React.createElement("div", null, ngayAl.nguHanh || "Thổ"),
								React.createElement("div", null, dayCanChi),
								React.createElement("div", null, ngayAl.queVan || "Khôn")
							),
							React.createElement("div", { style: { margin: "0 8px", alignSelf: "center" } }, "-"),
							React.createElement(
								"div",
								{ style: { flex: 1 } },
								React.createElement("div", null, "Giờ"),
								React.createElement("div", null, gioAl.nguHanh || "Hỏa"),
								React.createElement("div", null, gioAl.canChi || `Giờ ${selectedDate.hour()}`),
								React.createElement("div", null, gioAl.queVan || "Ly")
							)
						),
						
						// Navigation buttons
						React.createElement(
							"div",
							{ style: { textAlign: "center", marginBottom: 16 } },
							React.createElement(Button, {
								style: { border: "none", background: "transparent", fontSize: "12px" },
								onClick: () => setSelectedDate(selectedDate.subtract(1, "day"))
							}, "←"),
							React.createElement(Button, {
								style: { 
									border: "none", 
									background: "transparent", 
									fontSize: "12px", 
									fontWeight: "bold",
									margin: "0 8px"
								},
								onClick: () => setSelectedDate(dayjs())
							}, "XEM HÔM NAY"),
							React.createElement(Button, {
								style: { border: "none", background: "transparent", fontSize: "12px" },
								onClick: () => setSelectedDate(selectedDate.add(1, "day"))
							}, "→")
						),
						
						// Calendar toggle button (luôn hiển thị, nổi bật, không bị che)
						React.createElement(
							"div",
							{ style: { textAlign: "center", marginBottom: 16, position: "relative", zIndex: 1100 } },
							React.createElement(Button, {
								type: isCalendarVisible ? "default" : "primary",
								size: "middle",
								style: {
									fontWeight: "bold",
									background: isCalendarVisible ? "#fffbe6" : "#1890ff",
									color: isCalendarVisible ? "#faad14" : "#fff",
									border: isCalendarVisible ? "1px solid #faad14" : undefined,
									boxShadow: isCalendarVisible ? "0 2px 8px #faad1440" : undefined,
									minWidth: 120,
									minHeight: 36,
									fontSize: 16,
									transition: "all 0.2s"
								},
								onClick: () => setIsCalendarVisible(v => !v)
							}, isCalendarVisible ? "Ẩn Lịch" : "Mở Lịch")
						),

						// Date selection form (following Vue template exactly)
						React.createElement(
							"div",
							{ 
								style: { 
									marginBottom: 16,
									border: "1px solid #d9d9d9",
									borderRadius: "6px",
									padding: "12px",
									backgroundColor: "#fafafa",
								},
							},
							React.createElement(
								"table",
								{ 
									style: { 
										width: "100%", 
										margin: "0 auto",
										border: "none",
									},
								},
								React.createElement(
									"tbody",
									null,
									// Header row
									React.createElement(
										"tr",
										null,
										React.createElement(
											"td",
											{ style: { textAlign: "center", fontWeight: "bold" } },
											"Dương Lịch",
										),
										React.createElement(
											"td",
											{ style: { width: "4%" } },
										),
										React.createElement(
											"td",
											{ style: { textAlign: "center", fontWeight: "bold" } },
											"Âm Lịch",
										),
									),
									// Input row
									React.createElement(
										"tr",
										null,
										// Dương lịch column
										React.createElement(
											"td",
											{ style: { width: "48%" } },
											React.createElement(
												"div",
												{ style: { marginBottom: 8 } },
												React.createElement("input", {
													type: "number",
													style: {
														width: "25%",
														textAlign: "center",
														border: "1px solid black",
														marginRight: "2px",
													},
													defaultValue: selectedDate.date(),
													min: 1,
													max: 31,
													id: "chondd",
												}),
												React.createElement("input", {
													type: "number",
													style: {
														width: "25%",
														textAlign: "center",
														border: "1px solid black",
														marginRight: "2px",
													},
													defaultValue: selectedDate.month() + 1,
													min: 1,
													max: 12,
													id: "chonmm",
												}),
												React.createElement("input", {
													type: "number",
													style: {
														width: "45%",
														textAlign: "center",
														border: "1px solid black",
													},
													defaultValue: selectedDate.year(),
													id: "chonyy",
												}),
											),
											React.createElement(
												"div",
												{ 
													style: { 
														marginBottom: 8,
														display: "flex",
														justifyContent: "space-between",
														alignItems: "center",
													},
												},
												React.createElement("label", null, "Giờ"),
												React.createElement("input", {
													type: "number",
													style: {
														width: "25%",
														textAlign: "center",
														border: "1px solid black",
													},
													defaultValue: new Date().getHours(),
													min: 0,
													max: 23,
													id: "chonhh",
												}),
												React.createElement("label", null, "Phút"),
												React.createElement("input", {
													type: "number",
													style: {
														width: "25%",
														textAlign: "center",
														border: "1px solid black",
													},
													defaultValue: new Date().getMinutes(),
													min: 0,
													max: 59,
													id: "chonphut",
												}),
											),
											React.createElement(
												"div",
												null,
												React.createElement(Button, {
													style: { width: "100%" },
													type: "primary",
													size: "small",
													onClick: () => {
														const dd = parseInt((document.getElementById("chondd") as HTMLInputElement)?.value || "1");
														const mm = parseInt((document.getElementById("chonmm") as HTMLInputElement)?.value || "1");
														const yy = parseInt((document.getElementById("chonyy") as HTMLInputElement)?.value || "2024");
														setSelectedDate(dayjs(`${yy}-${mm.toString().padStart(2, "0")}-${dd.toString().padStart(2, "0")}`));
													},
												}, "Xem"),
											),
										),
										React.createElement(
											"td",
											{ style: { width: "4%" } },
										),
										// Âm lịch column
										React.createElement(
											"td",
											{ style: { width: "48%" } },
											React.createElement(
												"div",
												{ style: { marginBottom: 8 } },
												React.createElement("input", {
													type: "number",
													style: {
														width: "25%",
														textAlign: "center",
														border: "1px solid black",
														marginRight: "2px",
													},
													defaultValue: lunar.day,
													min: 1,
													max: 30,
													id: "chondda",
												}),
												React.createElement("input", {
													type: "number",
													style: {
														width: "25%",
														textAlign: "center",
														border: "1px solid black",
														marginRight: "2px",
													},
													defaultValue: lunar.month,
													min: 1,
													max: 12,
													id: "chonmma",
												}),
												React.createElement("input", {
													type: "number",
													style: {
														width: "45%",
														textAlign: "center",
														border: "1px solid black",
													},
													defaultValue: lunar.year,
													id: "chonyya",
												}),
											),
											React.createElement(
												"div",
												{ 
													style: { 
														marginBottom: 8,
														display: "flex",
														justifyContent: "space-between",
														alignItems: "center",
													},
												},
												React.createElement("label", null, "Giờ"),
												React.createElement("input", {
													type: "number",
													style: {
														width: "25%",
														textAlign: "center",
														border: "1px solid black",
													},
													defaultValue: new Date().getHours(),
													min: 0,
													max: 23,
													id: "chonhha",
												}),
												React.createElement("label", null, "Phút"),
												React.createElement("input", {
													type: "number",
													style: {
														width: "25%",
														textAlign: "center",
														border: "1px solid black",
													},
													defaultValue: new Date().getMinutes(),
													min: 0,
													max: 59,
													id: "chonphuta",
												}),
											),
											React.createElement(
												"div",
												null,
												React.createElement(Button, {
													style: { width: "100%" },
													type: "primary",
													size: "small",
													onClick: () => {
														// Convert lunar to solar and update
														const dd = parseInt((document.getElementById("chondda") as HTMLInputElement)?.value || "1");
														const mm = parseInt((document.getElementById("chonmma") as HTMLInputElement)?.value || "1");
														const yy = parseInt((document.getElementById("chonyya") as HTMLInputElement)?.value || "2024");
														
														try {
															// Simple lunar to solar conversion
															// Vietnamese lunar calendar approximation
															let solarYear = yy;
															let solarMonth = mm;
															let solarDay = dd;
															
															// Basic approximation: lunar calendar is typically 1-2 months ahead
															if (mm <= 2) {
																solarMonth = mm + 10;
																solarYear = yy - 1;
															} else {
																solarMonth = mm - 2;
															}
															
															// Ensure valid solar date
															const maxDaysInMonth = dayjs(new Date(solarYear, solarMonth - 1, 1)).daysInMonth();
															if (solarDay > maxDaysInMonth) {
																solarDay = maxDaysInMonth;
															}
															
															const solarDate = dayjs(new Date(solarYear, solarMonth - 1, solarDay));
															
															// Update solar input fields
															(document.getElementById("chondd") as HTMLInputElement).value = solarDate.date().toString();
															(document.getElementById("chonmm") as HTMLInputElement).value = (solarDate.month() + 1).toString();
															(document.getElementById("chonyy") as HTMLInputElement).value = solarDate.year().toString();
															
															// Update selected date
															setSelectedDate(solarDate);
														} catch (error) {
															console.error("Lỗi chuyển đổi âm lịch:", error);
														}
													},
												}, "Xem"),
											),
										),
									),
								),
							),
					)
				),

				// Right column - THÔNG TIN (responsive: full width on mobile, 1/3 on desktop)  
				React.createElement(
					Col,
					{ xs: 24, sm: 24, md: 8, lg: 8, xl: 8 },
					React.createElement(
						Card,
						{
							title: "THÔNG TIN",
							size: "small",
							style: { height: "100%" }
						},
						React.createElement(
							Descriptions,
							{
								column: 1,
								size: "small",
								labelStyle: { fontWeight: "normal", width: "50%" },
								contentStyle: { fontWeight: "bold" }
							},
							React.createElement(Descriptions.Item, { label: "Năm Cửu Tinh", children: namCuuTinh.text || "Tham Lang" }),
							React.createElement(Descriptions.Item, { label: "Tháng Cửu Tinh", children: thangCuuTinh.text || "Cự Môn" }),
							React.createElement(Descriptions.Item, { label: "Ngày Cửu Tinh", children: ngayCuuTinh.text || "Tham Lang" }),
							React.createElement(Descriptions.Item, { label: "Giờ Cửu Tinh", children: `${gioCuuTinh.text || "Tham Lang"} (${gioAl.canChi})` }),
							React.createElement(Descriptions.Item, { label: "Ngày Lục Nhâm", children: ngayLucNham.text || "Ngày Tốt" }),
							React.createElement(Descriptions.Item, { label: "Nhị Thập Tứ Khí", children: tietKhi }),
							React.createElement(Descriptions.Item, { label: "Ngày Xuất Hành", children: ngayXuatHanh.text || "Tốt" }),
							React.createElement(Descriptions.Item, { label: "Ngày Đầu Tháng", children: ngayDauThang }),
							React.createElement(Descriptions.Item, { label: "Quan Niệm Dân Gian", children: danGian.text || "Ngày Bình Thường" })
						)
					),
				),
			),

			// Additional sections below the 3-column layout
			React.createElement(
				Row,
				{ gutter: [16, 16], style: { marginTop: 24 } },
				React.createElement(
					Col,
					{ span: 24 },
					React.createElement(
						Card,
						{ title: "Chi Tiết Thông Tin Ngày", size: "small" },
						// Basic date info
						React.createElement(Descriptions, {
							column: 1,
							size: "small",
							bordered: false,
							style: { marginBottom: 16 },
							items: [
								{ label: "Ngày Dương Lịch", children: selectedDate.format("DD/MM/YYYY") },
								{ label: "Ngày Âm Lịch", children: `${lunar.day}/${lunar.month}${lunar.leap ? " (Nhuận)" : ""}/${lunar.year}` },
								{ label: "Thứ", children: DAYNAMES[selectedDate.day()] },
							],
						}),

						React.createElement(Divider, { children: "Can Chi" }),
						
						// Can Chi info with proper spacing
						React.createElement(
							"div",
							{ style: { display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginBottom: 16 } },
							React.createElement(
								"div",
								{ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: '#f9f9f9', borderRadius: '4px' } },
								React.createElement("span", { style: { fontWeight: 'bold' } }, "Thập Thiên Can Ngày:"),
								React.createElement("span", null, yearCanChi)
							),
							React.createElement(
								"div",
								{ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: '#f9f9f9', borderRadius: '4px' } },
								React.createElement("span", { style: { fontWeight: 'bold' } }, "Thập Nhị Địa Chi Ngày:"),
								React.createElement("span", null, dayCanChi)
							),
							React.createElement(
								"div",
								{ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: '#f9f9f9', borderRadius: '4px' } },
								React.createElement("span", { style: { fontWeight: 'bold' } }, "Can Chi Tháng:"),
								React.createElement("span", null, monthCanChi)
							)
						),

						React.createElement(Divider, { children: "Tổng Quan" }),

						// Fortune telling info
						React.createElement(Descriptions, {
							column: 1,
							size: "small",
							bordered: false,
							items: [
								{ label: "Tiết Khí", children: tietKhi },
								{ label: "Hỷ Thần", children: getHyThan() },
								{ label: "Tài Thần", children: getTaiThan() },
								{ label: "Hắc Thần", children: getHacThan() },
								{ label: "Lưu Nguyệt Phi Tinh", children: getLuuNguyetPhiTinh() },
								{ 
									label: "Giờ Hoàng Đạo", 
									children: React.createElement(
										"div", // Sửa lỗi: gioHoangDao -> gioHoangDaoCalculated
										null,
										gioHoangDao.map((gio, index) => 
											React.createElement(
												"span",
												{ 
													key: index,
													style: { 
														marginRight: '8px',
														padding: '2px 6px',
														backgroundColor: '#52c41a',
														color: 'white',
														borderRadius: '4px',
														fontSize: '12px'
													}
												},
												gio
											)
										)
									)
								},
							],
						}),

						React.createElement(Divider, { children: "Thông Tin Chi Tiết" }),

						// TỔNG QUAN và THÔNG TIN sections
						React.createElement(
							Row,
							{ gutter: [16, 16] },
							// Cột TỔNG QUAN
							React.createElement(
								Col,
								{ span: 12 },
								React.createElement(
									Card,
									{
										title: "TỔNG QUAN",
										size: "small"
									},
									React.createElement(
										Descriptions,
										{
											column: 1,
											size: "small",
											labelStyle: { fontWeight: "normal", width: "50%" },
											contentStyle: { fontWeight: "bold" }
										},
										React.createElement(Descriptions.Item, { label: "Giờ Đang Xem", children: gioAl.canChi || `Giờ ${selectedDate.hour()}` }),
										React.createElement(Descriptions.Item, { label: "Nạp Âm Ngày", children: napAmNgay.nguHanh || "Kim" }),
										React.createElement(Descriptions.Item, { label: "Thập Nhị Trực", children: `Trực ${thapNhiTruc.tenTruc || "Khai"}` }),
										React.createElement(Descriptions.Item, { label: "Kiết Hung Nhật", children: React.createElement("span", { style: { color: "#52c41a" } }, "Ngày Bình Thường") }),
										React.createElement(Descriptions.Item, { label: "Đại Tiểu Nguyệt", children: daiTieuNguyet }),
										React.createElement(Descriptions.Item, { label: "Nhị Thập Bát Tú", children: saoTheoNgay.tenSao || "Giác Mộc Giao" }),
										React.createElement(Descriptions.Item, { label: "Ngày Âm Dương", children: ngayAmDuong.noiDung || "Ngày Âm" }),
										React.createElement(Descriptions.Item, { label: "Can Ngày", children: `${ngayAl.can} (${ngayAl.nguHanhCan || "Kim"})` }),
										React.createElement(Descriptions.Item, { label: "Chi Ngày", children: `${ngayAl.chi} (${ngayAl.nguHanhChi || "Thổ"})` })
									)
								)
							),
							// Cột THÔNG TIN
							React.createElement(
								Col,
								{ span: 12 },
								React.createElement(
									Card,
									{
										title: "THÔNG TIN",
										size: "small"
									},
									React.createElement(
										Descriptions,
										{
											column: 1,
											size: "small",
											labelStyle: { fontWeight: "normal", width: "50%" },
											contentStyle: { fontWeight: "bold" }
										},
										React.createElement(Descriptions.Item, { label: "Năm Cửu Tinh", children: namCuuTinh.text || `${namCuuTinh.saoName || "Tham Lang"} - ${namCuuTinh.note || "Tốt lành"}` }),
										React.createElement(Descriptions.Item, { label: "Tháng Cửu Tinh", children: thangCuuTinh.text || `${thangCuuTinh.saoName || "Cự Môn"} - ${thangCuuTinh.note || "Bình thường"}` }),
										React.createElement(Descriptions.Item, { label: "Ngày Cửu Tinh", children: ngayCuuTinh.text || `${ngayCuuTinh.saoName || "Lộc Tồn"} - ${ngayCuuTinh.note || "Kiết tinh"}` }),
										React.createElement(Descriptions.Item, { label: "Giờ Cửu Tinh", children: `${gioCuuTinh.text || `${gioCuuTinh.saoName || "Văn Khúc"} - ${gioCuuTinh.note || "Bình thường"}`} (${gioAl.canChi || ""})` }),
										React.createElement(Descriptions.Item, { label: "Ngày Lục Nhâm", children: ngayLucNham.text || "Không thuộc ngày Lục Nhâm" }),
										React.createElement(Descriptions.Item, { label: "Nhị Thập Tứ Khí", children: tietKhi.length > 0 ? tietKhi.map((tk: any) => tk.tiet || tk.name).join(" - ") : "Đông Chí - Tiểu Hàn" }),
										React.createElement(Descriptions.Item, { label: "Ngày Xuất Hành", children: ngayXuatHanh.text || "Ngày tốt cho việc xuất hành" }),
										React.createElement(Descriptions.Item, { label: "Ngày Đầu Tháng", children: ngayDauThang || dayCanChi }),
										React.createElement(Descriptions.Item, { label: "Quan Niệm Dân Gian", children: danGian.text || "Ngày bình thường, không có kiêng cử đặc biệt" }),
									)
								)
							)
						),

						React.createElement(Divider, { children: "Kiết Hung Tinh" }),

						// Kiết tinh và Hung tinh sections (responsive grid)  
						React.createElement(
							Row,
							{ gutter: [8, 8] },
							// Kiết tinh theo âm lịch
							React.createElement(
								Col,
								{ xs: 24, sm: 12, md: 6, lg: 6 },
								React.createElement(
									Card,
									{
										title: "KIẾT TINH THEO ÂM LỊCH",
										size: "small"
									},
									cacSaoTot.length > 0 ? cacSaoTot.map((sao: any, index: number) => 
										React.createElement(
											"span",
											{ 
												key: index,
												style: { 
													color: '#52c41a',
													fontWeight: sao.toDam >= 2 ? 'bold' : 'normal',
													marginRight: 4
												}
											},
											`${sao.tenSao}${index < cacSaoTot.length - 1 ? ', ' : ''}`
										)
									) : React.createElement("span", { style: { color: '#52c41a' } }, "Thiên Đức, Nguyệt Đức, Thiên Quan, Phúc Đức")
								)
							),
							// Kiết tinh theo tiết khí  
							React.createElement(
								Col,
								{ xs: 24, sm: 12, md: 6, lg: 6 },
								React.createElement(
									Card,
									{
										title: "KIẾT TINH THEO TIẾT KHÍ",
										size: "small"
									},
									cacSaoTotTk.length > 0 ? cacSaoTotTk.map((sao: any, index: number) => 
										React.createElement(
											"span",
											{ 
												key: index,
												style: { 
													color: '#52c41a',
													fontWeight: sao.toDam >= 2 ? 'bold' : 'normal',
													marginRight: 4
												}
											},
											`${sao.tenSao}${index < cacSaoTotTk.length - 1 ? ', ' : ''}`
										)
									) : React.createElement("span", { style: { color: "#52c41a" } }, "Thiên Ân, Địa Ân, Nguyệt Ân")
								)
							),
							// Hung tinh theo âm lịch
							React.createElement(
								Col,
								{ xs: 24, sm: 12, md: 6, lg: 6 },
								React.createElement(
									Card,
									{
										title: "HUNG TINH THEO ÂM LỊCH",
										size: "small"
									},
									cacSaoXau.length > 0 ? cacSaoXau.map((sao: any, index: number) => 
										React.createElement(
											"span",
											{ 
												key: index,
												style: { 
													color: '#ff4d4f',
													fontWeight: sao.toDam >= 2 ? 'bold' : 'normal',
													marginRight: 4
												}
											},
											`${sao.tenSao}${index < cacSaoXau.length - 1 ? ', ' : ''}`
										)
									) : React.createElement("span", { style: { color: "#ff4d4f" } }, "Ngũ Quỷ, Tử Phù, Bạch Hổ")
								)
							),
							// Hung tinh theo tiết khí
							React.createElement(
								Col,
								{ xs: 24, sm: 12, md: 6, lg: 6 },
								React.createElement(
									Card,
									{
										title: "HUNG TINH THEO TIẾT KHÍ",
										size: "small"
									},
									cacSaoXauTk.length > 0 ? cacSaoXauTk.map((sao: any, index: number) => 
										React.createElement(
											"span",
											{ 
												key: index,
												style: { 
													color: '#ff4d4f',
													fontWeight: sao.toDam >= 2 ? 'bold' : 'normal',
													marginRight: 4
												}
											},
											`${sao.tenSao}${index < cacSaoXauTk.length - 1 ? ', ' : ''}`
										)
									) : React.createElement("span", { style: { color: "#ff4d4f" } }, "Thiên Hình, Địa Phá, Nguyệt Hại")
								)
							)
						),

						React.createElement(Divider, { children: "Tam Sát" }),

						// Tam Sát sections (responsive)
						React.createElement(
							Row,
							{ gutter: [8, 8] },
							React.createElement(
								Col,
								{ xs: 24, sm: 12, md: 6, lg: 6 },
								React.createElement(
									Card,
									{
										title: "TAM SÁT NIÊN",
										size: "small"
									},
									React.createElement(
										"div",
										{ style: { textAlign: "center", fontWeight: "bold", padding: "20px 0" } },
										tamSatNien.huongKhac || "Bắc"
									)
								)
							),
							React.createElement(
								Col,
								{ xs: 24, sm: 12, md: 6, lg: 6 },
								React.createElement(
									Card,
									{
										title: "TAM SÁT NGUYỆT",
										size: "small"
									},
									React.createElement(
										"div",
										{ style: { textAlign: "center", fontWeight: "bold", padding: "20px 0" } },
										tamSatNguyet.huongKhac || "Tây Nam"
									)
								)
							),
							React.createElement(
								Col,
								{ xs: 24, sm: 12, md: 6, lg: 6 },
								React.createElement(
									Card,
									{
										title: "TAM SÁT NHỰT",
										size: "small"
									},
									React.createElement(
										"div",
										{ style: { textAlign: "center", fontWeight: "bold", padding: "20px 0" } },
										tamSatNhut.huongKhac || "Đông Nam"
									)
								)
							),
							React.createElement(
								Col,
								{ xs: 24, sm: 12, md: 6, lg: 6 },
								React.createElement(
									Card,
									{
										title: "TAM SÁT THỜI",
										size: "small"
									},
									React.createElement(
										"div",
										{ style: { textAlign: "center", fontWeight: "bold", padding: "20px 0" } },
										tamSatThoi.huongKhac || "Nam"
									)
								)
							)
						),

						React.createElement(Divider, { children: "Giờ Hoàng Đạo và Thời Gian" }),

						// Giờ hoàng đạo và các thông tin thời gian
						React.createElement(
							Row,
							{ gutter: [16, 16] },
							// Giờ hoàng đạo
							React.createElement(
								Col,
								{ span: 6 },
								React.createElement(
									Card,
									{
										title: "GIỜ HOÀNG ĐẠO",
										size: "small",
									},
									gioHoangDao.length > 0 ? gioHoangDao.map((hd: any, index: number) =>
										React.createElement(
											"div",
											{
												key: index,
												style: { 
													display: "flex",
													alignItems: "center",
													marginBottom: 4,
													fontSize: "12px",
												},
											},
											React.createElement(
												"div",
												{ style: { width: "25%" } },
												hd.tenGio || CHI[index],
											),
											React.createElement(
												"div",
												{ style: { width: "30%" } },
												hd.khungGio || `${((index * 2 + 23) % 24).toString().padStart(2, "0")}-${((index * 2 + 1) % 24).toString().padStart(2, "0")}`
											),
											React.createElement(
												"div",
												{
													style: {
														width: "45%",
														textAlign: "right",
														color: hd.toDam >= 2 ? "#ff4d4f" : "#52c41a",
														fontWeight: hd.toDam >= 2 ? "bold" : "normal",
													},
												},
												hd.ten || "Bình thường",
											),
										),
									) : React.createElement("div", { style: { color: "#52c41a", textAlign: "center", padding: "20px 0" } }, "Giờ Hoàng Đạo: 23-1, 5-7, 9-11, 15-17"),
								),
							),
							// Sao theo giờ
							React.createElement(
								Col,
								{ span: 6 },
								React.createElement(
									Card,
									{
										title: "SAO THEO GIỜ",
										size: "small",
									},
									saoTheoGio.length > 0 ? saoTheoGio.map((sao: any, index: number) =>
										React.createElement(
											"div",
											{
												key: index,
												style: {
													display: "flex",
													alignItems: "center",
													marginBottom: 4,
													fontSize: "12px",
												},
											},
											React.createElement(
												"div",
												{ style: { width: "15%" } },
												sao.chiGio || CHI[index],
											),
											React.createElement(
												"div",
												{
													style: {
														width: "40%",
														textAlign: "right",
														color: sao.tinhChat >= 2 ? "#ff4d4f" : "#000",
														fontWeight: sao.tinhChat >= 2 ? "bold" : "normal",
													},
												},
												sao.tenSao || "",
											),
											React.createElement(
												"div",
												{
													style: {
														width: "40%",
														textAlign: "right",
														color: sao.tinhChat1 >= 2 ? "#ff4d4f" : "#000",
														fontWeight: sao.tinhChat1 >= 2 ? "bold" : "normal",
													},
												},
												sao.tenSao1 || "",
											),
										),
									) : React.createElement("div", { style: { color: "#52c41a", textAlign: "center", padding: "20px 0" } }, "Các sao theo giờ: Thanh Long, Bạch Hổ, Chu Tước, Huyền Vũ"),
								),
							),
							// Giờ lục nhâm
							React.createElement(
								Col,
								{ span: 6 },
								React.createElement(
									Card,
									{
										title: "GIỜ LỤC NHÂM",
										size: "small",
									},
									gioLucNham.length > 0 ? gioLucNham.map((gio: any, index: number) =>
										React.createElement(
											"div",
											{
												key: index,
												style: {
													display: "flex",
													alignItems: "center",
													marginBottom: 4,
													fontSize: "12px",
												},
											},
											React.createElement(
												"div",
												{ style: { width: "25%" } },
												gio.tenGio,
											),
											React.createElement(
												"div",
												{
													style: {
														width: "70%",
														textAlign: "right",
														color: gio.tot ? "#ff4d4f" : "#000",
													},
												},
												gio.tenLucNham,
											),
										),
									) : React.createElement("div", { style: { color: "#52c41a", textAlign: "center", padding: "20px 0" } }, "Giờ Lục Nhâm: Ngọ thời (11-13h), Mùi thời (13-15h)"),
								),
							),
							// Giờ nước lớn, ròng
							React.createElement(
								Col,
								{ span: 6 },
								React.createElement(
									Card,
									{
										title: "GIỜ NƯỚC LỚN, RÒNG",
										size: "small",
									},
									React.createElement(
										"div",
										null,
										React.createElement("div", { style: { fontWeight: "bold", marginBottom: 8 } }, "Đối Với Vùng Thấp"),
										React.createElement("div", null, `Giờ Nước Lớn: `, React.createElement("span", { style: { color: "#ff4d4f" } }, (gioNuoc.gioNuocLon || "").replace(",", ", "))),
										React.createElement("div", null, `Giờ Nước Ròng: ${(gioNuoc.gioNuocNho || "").replace(",", ", ")}`),
										React.createElement("div", { style: { fontWeight: "bold", marginTop: 8, marginBottom: 8 } }, "Đối Với Vùng Cao"),
										React.createElement("div", null, `Giờ Nước Lớn: `, React.createElement("span", { style: { color: "#ff4d4f" } }, (gioNuoc.gioNuocNho || "").replace(",", ", "))),
										React.createElement("div", null, `Giờ Nước Ròng: ${(gioNuoc.gioNuocLon || "").replace(",", ", ")}`),
									),
								),
							),
						),

						React.createElement(Divider, { children: "Tuổi Xung Khắc và Hướng Kiết Hung" }),

						// Tuổi xung khắc và hướng kiết hung
						React.createElement(
							Row,
							{ gutter: [16, 16] },
							// Tuổi xung khắc với ngày
							React.createElement(
								Col,
								{ span: 6 },
								React.createElement(
									Card,
									{
										title: "TUỔI XUNG KHẮC VỚI NGÀY",
										size: "small",
									},
									tuoiXungKhacNgay.length > 0 ? tuoiXungKhacNgay.map((tuoi: string, index: number) =>
										React.createElement(
											"div",
											{
												key: index,
												style: { 
													margin: "4px 8px",
													display: "inline-block",
													fontSize: "12px",
												},
											},
											tuoi,
										),
									) : React.createElement("div", { style: { color: "#52c41a", textAlign: "center", padding: "20px 0" } }, "Tuổi Tý, Ngọ"),
								),
							),
							// Tuổi xung khắc với tháng
							React.createElement(
								Col,
								{ span: 6 },
								React.createElement(
									Card,
									{
										title: "TUỔI XUNG KHẮC VỚI THÁNG",
										size: "small",
									},
									tuoiXungKhacThang.length > 0 ? tuoiXungKhacThang.map((tuoi: string, index: number) =>
										React.createElement(
											"div",
											{
												key: index,
												style: { 
													margin: "4px 8px",
													display: "inline-block",
													fontSize: "12px",
												},
											},
											tuoi,
										),
									) : React.createElement("div", { style: { color: "#52c41a", textAlign: "center", padding: "20px 0" } }, "Tuổi Sửu, Mùi"),
								),
							),
							// Hướng kiết hung
							React.createElement(
								Col,
								{ span: 12 },
								React.createElement(
									Card,
									{
										title: "HƯỚNG KIẾT HUNG",
										size: "small",
									},
									React.createElement(
										Descriptions,
										{
											column: 3,
											size: "small",
											labelStyle: { fontWeight: "normal" },
											contentStyle: { color: "#ff4d4f", fontWeight: "bold" },
										},
										React.createElement(Descriptions.Item, { label: "Tài Thần", children: huongKietHung.taiThan || getTaiThan() }),
										React.createElement(Descriptions.Item, { label: "Hỷ Thần", children: huongKietHung.hyThan || "Đông Nam" }),
										React.createElement(Descriptions.Item, { label: "Hắc Thần", children: huongKietHung.hacThan || getHacThan() }),
									),
								),
							),
						),

						React.createElement(Divider, { children: "Sao Tốt - Sao Xấu" }),
						
						// Stars section
						React.createElement(
							Row,
							{ gutter: [16, 16] },
							React.createElement(
								Col,
								{ span: 12 },
								React.createElement(
									Card,
									{ 
										title: "Sao Tốt Hôm Nay",
										size: "small"
									},
									saoTot.length > 0 ? saoTot.slice(0, 5).map((sao, index) => 
										React.createElement(
											"div",
											{ key: index, style: { marginBottom: 4 } },
											React.createElement("span", { style: { color: '#52c41a', fontWeight: 'bold' } }, `• ${sao.ten || sao.ten_sao || 'Sao tốt'}`),
											React.createElement("br"),
											React.createElement("span", { style: { fontSize: '12px', color: '#666' } }, sao.mota || sao.tinh_chat || 'Sao tốt mang lại may mắn')
										)
									) : React.createElement("div", { style: { color: "#52c41a" } }, 
										React.createElement("div", null, "• Thiên Đức: Mang lại may mắn và tài lộc"),
										React.createElement("div", null, "• Nguyệt Đức: Giúp mọi việc thuận lợi"),
										React.createElement("div", null, "• Thiên Quan: Tốt cho công việc và học tập")
									)
								)
							),
							React.createElement(
								Col,
								{ span: 12 },
								React.createElement(
									Card,
									{ 
										title: "Sao Xấu Hôm Nay",
										size: "small"
									},
									saoXau.length > 0 ? saoXau.slice(0, 5).map((sao, index) => 
										React.createElement(
											"div",
											{ key: index, style: { marginBottom: 4 } },
											React.createElement("span", { style: { color: '#ff4d4f', fontWeight: 'bold' } }, `• ${sao.ten || sao.ten_sao || 'Sao xấu'}`),
											React.createElement("br"),
											React.createElement("span", { style: { fontSize: '12px', color: '#666' } }, sao.mota || sao.tinh_chat || 'Cần cẩn thận và tránh xa')
										)
									) : React.createElement("div", { style: { color: "#ff4d4f" } }, 
										React.createElement("div", null, "• Ngũ Quỷ: Cần cẩn thận trong giao tiếp"),
										React.createElement("div", null, "• Tử Phù: Tránh các công việc quan trọng"),
										React.createElement("div", null, "• Bạch Hổ: Chú ý sức khỏe và an toàn")
									)
								)
							)
						)
					)
				)
			),
			// Add styles
			React.createElement("style", {
				dangerouslySetInnerHTML: {
					__html: `
					#dvxemngaytotxau .btn {
						border: none;
						background: transparent;
						padding: 0;
					}
					#dvxemngaytotxau .title {
						font-family: 'Times New Roman', serif;
						font-size: 24px;
						font-weight: bold;
						color: #1890ff;
						text-align: center;
						margin-bottom: 20px;
					}
					#dvxemngaytotxau .card-header {
						background: #f0f2f5;
						border-bottom: 1px solid #d9d9d9;
						padding: 12px 16px;
					}
					#dvxemngaytotxau .card-body {
						padding: 16px;
						font-family: 'Times New Roman', serif;
					}
					#dvxemngaytotxau .card-text {
						margin-bottom: 8px;
					}
					#dvxemngaytotxau .card {
						border: 1px solid #d9d9d9;
						border-radius: 8px;
						height: 100%;
						display: flex;
						flex-direction: column;
					}
					#dvxemngaytotxau .card .ant-card-body {
						flex: 1;
						display: flex;
						flex-direction: column;
						justify-content: center;
					}
					#dvxemngaytotxau .ant-row {
						align-items: stretch;
					}
					#dvxemngaytotxau .ant-col {
						display: flex;
						flex-direction: column;
					}
					.text-red {
						color: #ff4d4f;
					}
					.text-bold {
						font-weight: bold;
					}
					/* Can Chi styling to match Vue */
					.can-chi-display {
						font-family: 'Times New Roman', serif;
						border: 1px solid #ddd;
						border-radius: 4px;
						background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
						box-shadow: inset 0 1px 3px rgba(0,0,0,0.12);
					}
					.can-chi-display .tooltip-wrapper {
						cursor: help;
						transition: all 0.2s ease;
					}
					.can-chi-display .tooltip-wrapper:hover {
						background: rgba(24, 144, 255, 0.1);
						border-radius: 2px;
					}
					/* Responsive improvements */
					@media (max-width: 768px) {
						#dvxemngaytotxau .ant-descriptions {
							font-size: 12px;
						}
						#dvxemngaytotxau .title {
							font-size: 18px;
						}
						.can-chi-display {
							font-size: 11px;
							padding: 4px 2px;
						}
					}
					@media (min-width: 768px) {
						.lichamduong {
							width: 100%;
						}
					}
					.lichamduong {
						font-family: 'Times New Roman', serif;
						border-collapse: collapse;
						width: 100%;
						border: 1px solid #d9d9d9;
					}
					.lichamduong .am {
						color: #666;
						font-size: 11px;
						text-align: center;
					}
					.ngaythang {
						border: 1px solid #d9d9d9;
						text-align: center;
						vertical-align: top;
						position: relative;
						transition: all 0.3s;
					}
					.ngaythang:hover {
						background-color: #e6f7ff !important;
					}
					.bgcuutinh {
						background: linear-gradient(45deg, #f0f2f5, #ffffff);
						padding: 8px;
						border-radius: 4px;
					}
					.bgcuutinh .divcuutinh {
						text-align: center;
						font-weight: bold;
					}
					.bgcuutinh .divcuutinh .socuutinh {
						font-size: 24px;
						color: #1890ff;
						display: block;
						margin: 4px 0;
						text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
					}
					.section > .container {
						padding: 0 15px;
						margin: 0 auto;
					}
					.hidden {
						display: none;
					}
					
					/* Uniform card heights - các khối độ cao cùng hàng chạy theo cột dài nhất */
					.uniform-cards .ant-row {
						display: flex;
						align-items: stretch;
					}
					.uniform-cards .ant-col {
						display: flex;
						flex-direction: column;
					}
					.uniform-cards .ant-card {
						height: 100%;
						display: flex;
						flex-direction: column;
					}
					.uniform-cards .ant-card-body {
						flex: 1;
						display: flex;
						flex-direction: column;
						justify-content: space-between;
					}
					
					/* Khoảng cách đều giữa các ô thông tin */
					.ant-descriptions-item {
						padding: 8px 0 !important;
					}
					
					/* Canh giữa nội dung trên dưới cho các ô thông tin */
					.ant-descriptions-item-label,
					.ant-descriptions-item-content {
						vertical-align: middle !important;
						text-align: center !important;
						padding: 4px 8px !important;
					}
					
					/* Can Chi display với bo viền đỏ gạch và font Times New Roman */
					.can-chi-display {
						border: 2px solid #ff4d4f !important;
						border-style: dashed !important;
						font-family: 'Times New Roman', serif !important;
					}
					
					/* Tooltip wrapper màu xanh theo bảng màu */
					.tooltip-wrapper {
						color: #1890ff !important;
					}
				`,
				},
			}),
		),
	);
}
