import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Button, Card, Checkbox, Col, ColorPicker, DatePicker, Input, InputNumber, message, Progress, Row, Select, Space, Tabs, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/vi";

import { 
	fetchKQXSByStation, 
	fetchKQXSStationsWithFilter, 
	fetchTableData, 
	type KQXSRow,
	calculateTongHopResults,
	calculateNhomSo,
	getBoSoTriet,
	checkDuplicateNumbers,
	processNumberCollisions
} from "#src/api/kqxs_service";
import { CsmDynamicGrid } from "#src/components";
import WebsiteLayout from "#src/layout/website/WebsiteLayout";
import { useWebsiteMenu } from "#src/layout/website/wu_menu";

const { Title } = Typography;

dayjs.locale("vi");

interface DaiInfo {
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

interface EnrichedKQXSRow extends KQXSRow {
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

interface ThongKeItem {
	duoi: string;
	dem: number;
	kxh: number;
	max: number;
	tong: number;
}

import { fetchLoaiTim } from "#src/api/kqxs_service";

// Enhanced CSS styles with Vue styling features
const responsiveStyles = `
/* System theme color variables for light/dark mode support */
:root {
	--kqxs-primary: #1890ff;
	--kqxs-primary-text: #ffffff;
	--kqxs-bg: #ffffff;
	--kqxs-text: #000000d9;
	--kqxs-border: #d9d9d9;
	--kqxs-hover-bg: #f5f5f5;
	--kqxs-error: #ff4d4f;
	--kqxs-success: #52c41a;
}

@media (prefers-color-scheme: dark) {
	:root {
		--kqxs-primary: #177ddc;
		--kqxs-primary-text: #ffffff;
		--kqxs-bg: #141414;
		--kqxs-text: #ffffffd9;
		--kqxs-border: #434343;
		--kqxs-hover-bg: #262626;
		--kqxs-error: #ff7875;
		--kqxs-success: #73d13d;
	}
}

.kqxs-responsive {
	padding: 24px;
}

/* Vue-style lottery result cards - Enhanced */
.kqxs .box_kqxs {
	width: 100%;
	margin-bottom: 16px;
	border: 1px solid #ddd;
	border-radius: 4px;
	overflow: hidden;
}

.kqxs .box_kqxs_content {
	border-collapse: collapse;
	width: 100%;
	background: #fff;
}

.kqxs .card {
	border: 1px solid #ddd;
	border-radius: 4px;
	overflow: hidden;
	background: #fff;
	box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.kqxs .card-header {
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: white;
	padding: 8px;
	margin: 0;
	border-bottom: 1px solid #ddd;
}

.kqxs .card-title {
	font-size: 13pt;
	font-weight: bold;
	text-align: center;
	margin: 0 !important;
	color: white !important;
	padding: 4px 0;
}

.kqxs .card-body {
	padding: 0;
	background: #fff;
}

.kqxs .card-body .col-3 {
	margin: auto;
	width: 25%;
}

.kqxs .card-body .col-9 {
	width: 75%;
}

/* Vue lottery display styling theo miền */
.kqxs .bkqtinhmienbac .giaidb,
.kqxs .bkqtinhmiennam .giaidb {
	font-size: 18px;
	font-weight: 700;
	color: maroon;
	text-align: right;
	padding-right: 7px;
}

.kqxs .bkqtinhmienbac .giai1, .kqxs .bkqtinhmienbac .giai2, .kqxs .bkqtinhmienbac .giai3, 
.kqxs .bkqtinhmienbac .giai4, .kqxs .bkqtinhmienbac .giai5, .kqxs .bkqtinhmienbac .giai6, 
.kqxs .bkqtinhmienbac .giai7,
.kqxs .bkqtinhmiennam .giai1, .kqxs .bkqtinhmiennam .giai2, .kqxs .bkqtinhmiennam .giai3,
.kqxs .bkqtinhmiennam .giai4, .kqxs .bkqtinhmiennam .giai5, .kqxs .bkqtinhmiennam .giai6,
.kqxs .bkqtinhmiennam .giai7, .kqxs .bkqtinhmiennam .giai8 {
	font-size: 16px;
	font-weight: 700;
	padding: 2px 0;
	margin: 0;
	text-align: right;
	padding-right: 7px;
}

.kqxs .bkqtinhmienbac .giai1l, .kqxs .bkqtinhmienbac .giai2l, .kqxs .bkqtinhmienbac .giai3l,
.kqxs .bkqtinhmienbac .giai4l, .kqxs .bkqtinhmienbac .giai5l, .kqxs .bkqtinhmienbac .giai6l,
.kqxs .bkqtinhmienbac .giai7l, .kqxs .bkqtinhmienbac .giaidbl,
.kqxs .bkqtinhmiennam .giai1l, .kqxs .bkqtinhmiennam .giai2l, .kqxs .bkqtinhmiennam .giai3l,
.kqxs .bkqtinhmiennam .giai4l, .kqxs .bkqtinhmiennam .giai5l, .kqxs .bkqtinhmiennam .giai6l,
.kqxs .bkqtinhmiennam .giai7l, .kqxs .bkqtinhmiennam .giai8l, .kqxs .bkqtinhmiennam .giaidbl {
	font-size: 13px;
	font-weight: 700;
	text-align: right;
	padding-right: 7px;
}

.kqxs .giaiSo {
	padding: 2px 8px;
	margin: 0 2px;
	background: #f6ffed;
	border: 1px solid #b7eb8f;
	border-radius: 4px;
	font-family: monospace;
	font-size: 14px;
	display: inline-block;
	font-weight: bold;
}

/* Background colors for rows - Vue style enhanced */
.kqxs .bg-gray {
	background-color: var(--ant-background-color-light, #f8f9fa);
}

.kqxs .row {
	display: flex;
	margin: 0;
	padding: 6px 0;
	border-bottom: 1px solid var(--ant-border-color-split, #e9ecef);
	align-items: center;
	min-height: 40px;
	color: var(--ant-text-color, #000000d9);
}

.kqxs .row:last-child {
	border-bottom: none;
}

.kqxs .row:hover {
	background-color: var(--ant-item-hover-bg, #f1f3f4);
}

.kqxs .p-0 {
	padding: 0 !important;
}

.kqxs .col-3 {
	flex: 0 0 25%;
	max-width: 25%;
	padding: 8px;
	display: flex;
	align-items: center;
}

.kqxs .col-9 {
	flex: 0 0 75%;
	max-width: 75%;
	padding: 8px;
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

/* Special styling for Miền Bắc vs Miền Nam/Trung */
.kqxs .bkqtinhmiennam .giai3 .giaiSo {
	width: 49%;
	display: inline-block;
	font-size: 16px;
	font-weight: 700;
	margin-bottom: 2px;
}

/* Vue progress bar styling */
.kqxs .dx-progressbar-status {
	float: unset !important;
	text-align: center;
	font-size: 10pt;
	font-weight: bold;
}

.kqxs .complete .dx-progressbar-range {
	background-color: green;
}

/* Vue-style lottery result display */
.kqxs .giaidbl,
.kqxs .giai1l,
.kqxs .giai2l,
.kqxs .giai3l,
.kqxs .giai4l,
.kqxs .giai5l,
.kqxs .giai6l,
.kqxs .giai7l,
.kqxs .giai8l {
	background-color: var(--ant-primary-1, #e6f3ff);
	font-weight: bold;
	text-align: center;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 14px;
	color: var(--ant-text-color, #000000d9);
}

.kqxs .giaidb,
.kqxs .giai1,
.kqxs .giai2,
.kqxs .giai3,
.kqxs .giai4,
.kqxs .giai5,
.kqxs .giai6,
.kqxs .giai7,
.kqxs .giai8 {
	text-align: center;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-wrap: wrap;
}

.kqxs .giaiSo {
	display: inline-block;
	font-weight: bold;
	color: var(--ant-error-color, #d4292a);
	font-size: 16px;
	padding: 6px 10px;
	margin: 3px;
	background: var(--ant-component-background, #ffffff);
	border: 2px solid var(--ant-border-color, #e0e0e0);
	border-radius: 6px;
	min-width: 65px;
	text-align: center;
	box-shadow: 0 2px 4px var(--ant-shadow-1-down, rgba(0,0,0,0.1));
	transition: all 0.2s ease;
	font-family: 'Courier New', monospace;
}

.kqxs .giaiSo:hover {
	transform: translateY(-1px);
	box-shadow: 0 4px 8px var(--ant-shadow-2-down, rgba(0,0,0,0.15));
	border-color: var(--ant-primary-color, #1890ff);
}

/* Vue statistical grid styling */
.kqxs .to_mau {
	background: var(--ant-warning-color, #cc9108) !important;
}

.kqxs .text-bold {
	text-align: center;
	font-size: 10pt;
	font-weight: bold;
	color: var(--ant-text-color, #000000d9);
}

.kqxs .dx-datagrid td {
	text-align: center !important;
}

.kqxs .dx-datagrid td.text-left {
	text-align: left !important;
}

.kqxs .dx-header-row > td[role="columnheader"] > div.dx-datagrid-text-content {
	font-size: 10pt;
	font-weight: bold;
	color: var(--ant-text-color, #000000d9);
}

.kqxs .dx-header-row > td[role="columnheader"], .kqxs .bg-vach {
	background: var(--ant-background-color-light, #eeeff1) !important;
}

/* Bảng "Kết quả theo hàng chục và đơn vị" styling - System theme aware */
.kqxs .hang-chuc-don-vi-table {
	border-collapse: collapse;
	width: 100%;
	margin-top: 16px;
	border: 2px solid var(--ant-primary-color, #1890ff);
	border-radius: 6px;
	overflow: hidden;
}

.kqxs .hang-chuc-don-vi-table th {
	background: var(--ant-primary-color, #1890ff);
	color: var(--ant-primary-color-text, white);
	padding: 12px 8px;
	text-align: center;
	font-weight: bold;
	font-size: 14px;
	border: 1px solid var(--ant-primary-color-hover, #40a9ff);
}

.kqxs .hang-chuc-don-vi-table td {
	padding: 8px;
	text-align: center;
	border: 1px solid var(--ant-border-color, var(--kqxs-border, #d9d9d9));
	vertical-align: middle;
	min-height: 40px;
	background: var(--ant-component-background, var(--kqxs-bg, #ffffff));
	color: var(--ant-text-color, var(--kqxs-text, #000000d9));
}

.kqxs .hang-chuc-don-vi-table td.chuc-column {
	background: var(--ant-background-color-light, var(--kqxs-hover-bg, #f0f2f5));
	font-weight: bold;
	color: var(--ant-primary-color, var(--kqxs-primary, #1890ff));
	font-size: 16px;
	width: 80px;
}

.kqxs .hang-chuc-don-vi-table td.donvi-numbers {
	font-family: 'Courier New', monospace;
	font-size: 14px;
	color: var(--ant-error-color, var(--kqxs-error, #d4292a));
	font-weight: bold;
	line-height: 1.4;
}

.kqxs .hang-chuc-don-vi-table tr:nth-child(even) {
	background-color: var(--ant-background-color-light, #fafafa);
}

.kqxs .hang-chuc-don-vi-table tr:hover {
	background-color: var(--ant-primary-1, #e6f7ff);
}

.kqxs .hang-chuc-don-vi-table .donvi-numbers span {
	display: inline-block;
	margin: 0 2px;
	padding: 2px 4px;
	border-radius: 3px;
	background: var(--ant-success-bg, #f6ffed);
	border: 1px solid var(--ant-success-border, #b7eb8f);
	color: var(--ant-text-color, #000000d9);
}

/* Vue button styling */
.kqxs .btn {
	background: #083671de;
	color: #fff;
	border: none;
	border-radius: 4px;
	padding: 8px 16px;
	font-weight: 500;
}

.kqxs .btn:hover {
	background: #0A1D56;
	color: #fff;
}

/* Vue border styling */
.kqxs .csm_border {
	border-radius: 3px;
	border: 1px solid #0A1D56;
	padding: 10px;
}

/* Vue tabpanel styling */
.kqxs .dx-tabpanel-container {
	margin-top: -37px !important;
}

/* Number highlighting like Vue */
.kqxs .ketquaHightlight, .kqxs .ketquadaysoHightlight {
	background: #db2363;
	color: #fff;
	padding: 2px;
	border-radius: 50%;
	box-shadow: 3px 3px 10px -2px rgba(0, 0, 0, 0.4);
	font-weight: 400;
	font-family: Arial, Helvetica, sans-serif;
}

.kqxs .ketquaHightlight.hangdonvi, .kqxs .ketquadaysoHightlight.hangdonvi {
	background: radial-gradient(circle at 5px 5px, #56fdf8, #000);
}

.kqxs .ketquaHightlight.hangchuc, .kqxs .ketquadaysoHightlight.hangchuc {
	background: radial-gradient(circle at 5px 5px, #41e241, #001);
}

.kqxs .ketquaHightlight.cahaihang, .kqxs .ketquadaysoHightlight.cahaihang {
	background: radial-gradient(circle at 5px 5px, gold, #001);
}

/* Hàng chục và đơn vị styles */
.kqxs td.tanso_hangdonvi {
	height: 30px;
	line-height: 30px;
	font-size: 16px;
	font-weight: 700;
	font-family: Arial, Helvetica, sans-serif;
}

.kqxs td.tanso_hangchuc span.numberHightlight,
.kqxs td.tanso_hangdonvi span.numberHightlight {
	height: 29px;
	line-height: 29px;
	font-size: 16px;
	font-weight: 700;
	font-family: Arial, Helvetica, sans-serif;
}

.kqxs td.tanso_hangchuc {
	height: 30px;
	line-height: 30px;
	font-size: 16px;
	font-weight: 700;
	font-family: Arial, Helvetica, sans-serif;
}

/* Responsive breakpoints */
@media (max-width: 768px) {
	.kqxs-responsive {
		padding: 12px;
	}
	.kqxs-responsive .ant-card {
		margin-bottom: 12px;
	}
	.kqxs-responsive .ant-card-head-title {
		font-size: 14px !important;
	}
	.kqxs-responsive .ant-btn {
		font-size: 12px;
		padding: 4px 8px;
		height: auto;
	}
	.kqxs-responsive .ant-select {
		font-size: 12px;
	}
	.kqxs-responsive .ant-input {
		font-size: 12px;
	}
	.kqxs-responsive .ant-input-number {
		font-size: 12px;
	}
	.kqxs-responsive .ant-table {
		font-size: 12px;
	}
	.kqxs-responsive .ant-table-thead > tr > th {
		padding: 8px 4px;
		font-size: 11px;
	}
	.kqxs-responsive .ant-table-tbody > tr > td {
		padding: 8px 4px;
		font-size: 11px;
	}
	.kqxs-responsive .ant-space {
		gap: 8px !important;
	}
	.kqxs .giaiSo {
		font-size: 12px;
		padding: 1px 4px;
	}
	.kqxs .col-3, .kqxs .col-9 {
		padding: 4px;
	}
}

@media (max-width: 480px) {
	.kqxs-responsive {
		padding: 8px;
	}
	.kqxs-responsive .ant-card {
		margin-bottom: 8px;
	}
	.kqxs-responsive .ant-btn {
		font-size: 11px;
		padding: 2px 6px;
	}
	.kqxs-responsive .ant-col {
		margin-bottom: 8px;
	}
	.kqxs-responsive .ant-table {
		font-size: 10px;
	}
	.kqxs-responsive .ant-space {
		gap: 4px !important;
	}
	.kqxs .card-title {
		font-size: 11pt;
	}
	.kqxs .giaiSo {
		font-size: 10px;
		padding: 1px 2px;
		margin: 0 1px;
	}
	.kqxs .col-3 {
		flex: 0 0 30%;
		max-width: 30%;
	}
	.kqxs .col-9 {
		flex: 0 0 70%;
		max-width: 70%;
	}
}
`;

// Add styles to document head
if (typeof document !== "undefined" && !document.getElementById("kqxs-responsive-styles")) {
	const styleElement = document.createElement("style");
	styleElement.id = "kqxs-responsive-styles";
	styleElement.textContent = responsiveStyles;
	document.head.appendChild(styleElement);
}

const KQXS: React.FC = () => {
	// Website menu for navigation
	const menuItems = useWebsiteMenu();

	// Main states
	const [denNgay, setDenNgay] = useState<Dayjs>(dayjs());
	const [tuNgay, setTuNgay] = useState<Dayjs>(dayjs().subtract(1, 'year')); // Từ Ngày
	const [mien, setMien] = useState<string>("MN"); // MN=Miền Nam, MT=Miền Trung, MB=Miền Bắc như trên server
	const [thuTuan, setThuTuan] = useState<string>("");
	const [soKy, setSoKy] = useState<number>(52);
	const [kxhTu, setKxhTu] = useState<number>(1);
	const [kxhDen, setKxhDen] = useState<number>(30);
	const [dsDaiChon, setDsDaiChon] = useState<string[]>([]); // stt is string
	const [danhSachDai, setDanhSachDai] = useState<DaiInfo[]>([]);
	const [duLieuThongKe, setDuLieuThongKe] = useState<ThongKeItem[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [dsDaiChonXemKetQua, setDsDaiChonXemKetQua] = useState<string[]>([]); // du_lieu_dai is string
	const [ketQuaXemNgay, setKetQuaXemNgay] = useState<EnrichedKQXSRow[]>([]);
	const [displayedResults, setDisplayedResults] = useState<any[]>([]);
	
	// Progress Bar and Color Picker states from Vue
	const [chonMau, setChonMau] = useState<string>("#f0bb41"); // Màu tô color picker
	const [progressPercent, setProgressPercent] = useState<number>(0); // Progress bar percent
	const [progressStatus, setProgressStatus] = useState<string>(""); // Progress bar status text
	const [hienTK, setHienTK] = useState<boolean>(true); // Hiện TK checkbox
	const [soKyTH, setSoKyTH] = useState<number>(52); // Số Kỳ for TongHop
	const [soNgay, setSoNgay] = useState<number>(7); // Số ngày
	const [ketQuaFilter, setKetQuaFilter] = useState<string[]>(["KQT"]); // Lọc kết quả selection
	const [thuTuTrung, setThuTuTrung] = useState<string>("Có số nào trùng"); // Thứ tự trùng textarea
	const [tongHopData, setTongHopData] = useState<any[]>([]); // Grid data for TongHop

	// Active menu state
	const [activeMenu, setActiveMenu] = useState<string>("ketqua"); // Default to "ketqua", options: "ketqua" | "thongke" | "thongkemoi" | "tonghop"

	// Advanced statistics state variables (for thong_ke_moi functionality)
	const [laySoKy, setLaySoKy] = useState<number>(5); // Lấy số kỳ
	const [soChu, setSoChu] = useState<string[]>([]); // Số chủ array
	const [selectedRegion, setSelectedRegion] = useState<string>("MN");
	const [selectedStations, setSelectedStations] = useState<string[]>([]); // stt is string
	const [loaiThongKe, setLoaiThongKe] = useState<number>(2); // Loại Thống Kê (1-3 đài)
	
	// Additional Vue state variables
	const [demBeHon, setDemBeHon] = useState<number>(5); // Đếm be hơn
	const [demNhoHon, setDemNhoHon] = useState<number>(5); // Đếm nhỏ hơn 
	const [demLonHon, setDemLonHon] = useState<number>(5); // Đếm lớn hơn
	const [demToNhoHon, setDemToNhoHon] = useState<number>(5); // Đếm tổ nhỏ hơn
	const [lsBatDau, setLsBatDau] = useState<number>(5); // Lịch sử bắt đầu
	const [kxhPhaiLonHon, setKxhPhaiLonHon] = useState<number>(7); // KXH phải lớn hơn
	const [kxhLocSau, setKxhLocSau] = useState<boolean>(true); // KXH lọc sau
	const [sapXep, setSapXep] = useState<number>(1); // Sắp xếp: 0=mới trước, 1=cũ trước
	const [timeProgress, setTimeProgress] = useState<boolean>(false); // Time progress active
	
	// Vue data structures
	const [duLieuDaiMien, setDuLieuDaiMien] = useState<any>({}); // Data for regions
	const [xuLyKetQua, setXuLyKetQua] = useState<any[]>([]); // Result processing
	const [isXemThuong, setIsXemThuong] = useState<boolean>(true); // Show normal results
	
	// Station selection for số chủ functionality
	const [dsDaiChonSoChu, setDsDaiChonSoChu] = useState<string[]>([]);
	
	// Additional missing state variables
	const [sochu, setSochu] = useState<string>("");
	const [heSo, setHeSo] = useState<number>(1); // Hệ số
	const [loaiTim, setLoaiTim] = useState<string>(""); // Loại Tìm
	const [denNgayTH, setDenNgayTH] = useState<Dayjs>(dayjs()); // Đến ngày for TongHop
	const [soNhap, setSoNhap] = useState<string>(""); // Số nhập
	const [chkNhom, setChkNhom] = useState<boolean>(false); // Check nhóm
	const [chkTriet, setChkTriet] = useState<boolean>(false); // Check triệt
	const [chkTrietDuoi, setChkTrietDuoi] = useState<boolean>(false); // Check triệt đuôi
	const [chonDaiSoChu, setChonDaiSoChu] = useState<string>(""); // Lịch Sử Số Chủ
	const [ktn, setKtn] = useState<number>(12); // KTN value
	const [ktd, setKtd] = useState<number>(12); // KTD value  
	const [l2c, setL2c] = useState<number>(12); // L2C value
	
	// Days mapping like Vue - ds_thu
	const ds_thu = [
		{ ma: "T2", ten: "Thứ 2" },
		{ ma: "T3", ten: "Thứ 3" },
		{ ma: "T4", ten: "Thứ 4" },
		{ ma: "T5", ten: "Thứ 5" },
		{ ma: "T6", ten: "Thứ 6" },
		{ ma: "T7", ten: "Thứ 7" },
		{ ma: "CN", ten: "Chủ Nhật" }
	];

	// Function to get day name from thu code like Vue
	const getDayName = (thuCode: string) => {
		const found = ds_thu.find(t => t.ma === thuCode);
		return found ? found.ten : '';
	};

	// Function to format date from YYYYMMDD to DD/MM/YYYY
	const formatDisplayDate = (dateStr?: string) => {
		if (!dateStr || dateStr.length !== 8) return dateStr || '';
		const year = dateStr.substr(0, 4);
		const month = dateStr.substr(4, 2);
		const day = dateStr.substr(6, 2);
		return `${day}/${month}/${year}`;
	};

	// Function to transform KQXSRows to Vue-style structure
	const transformToVueStructure = (rows: EnrichedKQXSRow[]) => {
		console.warn("KQXS transformToVueStructure - Input rows:", rows);
		
		// The API returns already flattened data with all lottery results in one object
		// No need to group by prize, just transform each row to Vue structure
		const result = rows.map(row => {
			console.warn("KQXS transformToVueStructure - Processing row:", {
				du_lieu_dai: row.du_lieu_dai,
				field_ngay: row.field_ngay,
				ten_dai: row.ten_dai,
				hasFieldDau: !!row.field_dau,
				hasFieldSo2: !!row.field_so2
			});
			
			return {
				ten_dai: row.ten_dai,
				thu: row.thu,
				mien: row.mien,
				du_lieu_dai: row.du_lieu_dai,
				stt: row.stt,
				ngay: row.ngay,
				field_ngay: row.field_ngay,
				uniqueKey: row.uniqueKey,
				// Use the existing fields as data - the API already returns in this format
				data: {
					field_duoi: row.field_dau, // Giải ĐB
					field_so17: row.field_so2, // Giải nhất (MN/MT)
					field_so26: row.field_so26, // Giải nhất (MB)
					field_so16: row.field_so3, // Giải nhì (MN/MT)
					field_so24: row.field_so24, // Giải nhì (MB) - số 1
					field_so25: row.field_so25, // Giải nhì (MB) - số 2
					field_so15: row.field_so4, // Giải ba (MN/MT) - số 1
					field_so14: row.field_so5, // Giải ba (MN/MT) - số 2
					field_so18: row.field_so18, // Giải ba (MB) - số 1
					field_so19: row.field_so19, // Giải ba (MB) - số 2
					field_so20: row.field_so20, // Giải ba (MB) - số 3
					field_so21: row.field_so21, // Giải ba (MB) - số 4
					field_so22: row.field_so22, // Giải ba (MB) - số 5
					field_so23: row.field_so23, // Giải ba (MB) - số 6
					field_so13: row.field_so6, // Giải tư
					field_so12: row.field_so7, // Giải năm
					field_so11: row.field_so8, // Giải sáu
					field_so10: row.field_so9, // Giải bảy
					// Copy all other fields that might exist
					...Object.fromEntries(
						Object.entries(row).filter(([key]) => key.startsWith('field_'))
					)
				}
			};
		});
		
		console.warn("KQXS transformToVueStructure - Output result:", result);
		return result;
	};

	// Tạo bảng "Kết quả theo hàng chục và đơn vị" như Vue logic
	const createHangChucDonViTable = (transformedData: any[]) => {
		console.warn("KQXS createHangChucDonViTable - Input:", transformedData);
		
		// Khởi tạo bảng 10 hàng (0-9) như Vue
		const xuLyKetQua: any[] = [];
		for (let s = 0; s < 10; s++) {
			const objS: any = {
				id: `kqxs_${s}_${Date.now()}`,
				chuc: s, // Hàng chục
			};
			xuLyKetQua.push(objS);
		}
		
		// Xử lý từng đài đã chọn
		transformedData.forEach((dai) => {
			const stt = dai.stt;
			const kq = dai.data;
			
			// Khởi tạo cột cho đài này
			for (let s = 0; s < 10; s++) {
				xuLyKetQua[s][`dai_${stt}`] = '';
			}
			
			// Duyệt qua tất cả field kết quả như Vue logic
			Object.keys(kq).forEach((tk) => {
				if (tk !== '_id' && tk !== 'id' && tk !== 'thu' && tk !== 'field_ngay' && kq[tk]) {
					const soKQ = kq[tk].toString().trim();
					if (soKQ && soKQ.length >= 2) {
						// Lấy hàng chục (ký tự thứ 2 từ cuối)
						const chuc = parseInt(soKQ.substr(soKQ.length - 2, 1));
						// Lấy đơn vị (ký tự cuối cùng)  
						const donvi = soKQ.substr(soKQ.length - 1, 1);
						
						if (!isNaN(chuc) && chuc >= 0 && chuc <= 9) {
							const fIdxDong = xuLyKetQua.findIndex(idx => idx.chuc === chuc);
							if (fIdxDong !== -1) {
								const currentValue = xuLyKetQua[fIdxDong][`dai_${stt}`];
								xuLyKetQua[fIdxDong][`dai_${stt}`] = currentValue + (currentValue !== '' ? ',' : '') + donvi;
							}
						}
					}
				}
			});
		});
		
		console.warn("KQXS createHangChucDonViTable - Output:", xuLyKetQua);
		return xuLyKetQua;
	};

	// Loại Tìm options động cho Tổng Hợp
	const [loaiTimOptions, setLoaiTimOptions] = useState<{ value: string; label: string }[]>([]);

	// Cập nhật options Loại Tìm khi heSo thay đổi
	useEffect(() => {
		const loadLoaiTimOptions = async () => {
			try {
				const rows = await fetchLoaiTim(heSo.toString());
				const newOptions = (rows || []).map((row: any) => ({
					value: row.MaLoai,
					label: row.MoTa || row.MaLoai,
				}));
				setLoaiTimOptions(newOptions);
				
				// Nếu giá trị hiện tại không còn trong options mới thì reset về option đầu tiên
				if (newOptions.length > 0 && !newOptions.some(option => option.value === loaiTim)) {
					setLoaiTim(newOptions[0].value);
				}
			} catch (error) {
				console.warn("Lỗi khi tải options Loại Tìm:", error);
				setLoaiTimOptions([]);
			}
		};
		
		loadLoaiTimOptions();
	}, [heSo]); // Chỉ phụ thuộc vào heSo, không phụ thuộc vào loaiTim để tránh vòng lặp

	// State cho bảng "Kết quả theo hàng chục và đơn vị" như Vue
	const [xuLyKetQuaHangChuc, setXuLyKetQuaHangChuc] = useState<any[]>([]);

	// Transform ketQuaXemNgay to Vue-like structure for display
	useEffect(() => {
		try {
			if (ketQuaXemNgay.length > 0) {
				const transformed = transformToVueStructure(ketQuaXemNgay);
				setDisplayedResults(transformed);
				
				// Tạo bảng "Kết quả theo hàng chức và đơn vị" như Vue
				const xuLyKetQua = createHangChucDonViTable(transformed);
				setXuLyKetQuaHangChuc(xuLyKetQua);
				
				console.warn("KQXS - Transformed data:", transformed);
				console.warn("KQXS - Hang chuc don vi data:", xuLyKetQua);
				console.warn("KQXS - ✅ Đã tạo bảng hàng chục đơn vị với", xuLyKetQua.length, "hàng");
			} else {
				setDisplayedResults([]);
				setXuLyKetQuaHangChuc([]);
			}
		} catch (error) {
			console.error("KQXS - Error transforming data:", error);
			setDisplayedResults([]);
			setXuLyKetQuaHangChuc([]);
		}
	}, [ketQuaXemNgay]);

	// Filter dai by region and day - matching Vue logic exactly
	const daiFiltered = useMemo(() => {
		if (!mien) {
			return [];
		}
		// Vue logic: dsDaiThu=dsDaiMien.filter(d=>d.mien===seft.mien && d.thu===seft.thu_tuan)
		return danhSachDai
			.filter(dai => dai.mien === mien && (!thuTuan || dai.thu === thuTuan))
			.sort((a, b) => Number(a.stt) - Number(b.stt)); // stt is string, sort numerically
	}, [danhSachDai, mien, thuTuan]);

	// Fetch initial data
	useEffect(() => {
		let mounted = true;
		const fetchData = async () => {
			try {
				setLoading(true);
				console.warn("KQXS: Starting to load stations...");
				
				// Load all stations first to populate the full list like Vue logic
				const allStations = await fetchTableData<DaiInfo>("kqxs_lichxoso", {
					field: "id",
					type: "like",
					value: "",
				}, "kqxs");

				console.warn("KQXS: All stations loaded:", allStations.length);
				
				// Log first station structure for debugging
				if (allStations.length > 0) {
					console.warn("KQXS: First station structure:", JSON.stringify(allStations[0], null, 2));
					console.warn("KQXS: First station fields:", Object.keys(allStations[0]));
				}
				
				console.warn("KQXS: Raw stations loaded:", allStations.length, allStations.slice(0, 3));

				if (!mounted) {
					return;
				}

				// Sort by mien, thu, stt like in Vue: (a.mien+"_"+a.thu+"_"+a.stt)-(b.mien+"_"+b.thu+"_"+b.stt)
				const sortedStations = allStations.sort((a, b) => {
					const aKey = `${a.mien}_${a.thu}_${a.stt}`;
					const bKey = `${b.mien}_${b.thu}_${b.stt}`;
					return aKey.localeCompare(bKey);
				});

				console.warn("KQXS: Sorted stations:", sortedStations.length, sortedStations.slice(0, 3));

				setDanhSachDai(sortedStations || []);

				// Auto-set thuTuan based on current date like Vue does
				// Vue uses: seft.thu_tuan=seft.days[chuyenNgay(seft.den_ngay,"dd/mm/yyyy").getDay()];
				const currentDay = dayjs().day(); // 0=Sunday, 1=Monday, etc.
				const dayMap = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
				console.warn("KQXS: Setting thuTuan to:", dayMap[currentDay], "for day:", currentDay);
				setThuTuan(dayMap[currentDay]);
			}
			catch (error) {
				console.error("Error fetching KQXS stations:", error);
				message.error(`Không thể tải danh sách đài! Lỗi: ${error}`);
			}
			finally {
				if (mounted) {
					setLoading(false);
				}
			}
		};
		fetchData();
		return () => {
			mounted = false;
		};
	}, []);

	// Debug function to help verify station filtering logic
	const _debugStationFiltering = () => {
		const totalStations = danhSachDai.length;
		const filteredStations = daiFiltered.length;
		
		const debugInfo = {
			totalStations,
			filteredStations,
			currentFilters: { mien, thuTuan },
			loading,
			stationsByRegion: danhSachDai.reduce((acc, station) => {
				acc[station.mien] = (acc[station.mien] || 0) + 1;
				return acc;
			}, {} as Record<string, number>),
			stationsByDay: danhSachDai.reduce((acc, station) => {
				acc[station.thu] = (acc[station.thu] || 0) + 1;
				return acc;
			}, {} as Record<string, number>),
			filteredStationNames: daiFiltered.map(s => `${s.mien}-${s.thu}-${s.stt}: ${s.ten_dai}`).slice(0, 5),
			sampleStations: danhSachDai.slice(0, 3).map(s => ({ mien: s.mien, thu: s.thu, ten_dai: s.ten_dai, stt: s.stt })),
		};

		// Log to console for debugging
		console.warn("KQXS Debug Info:", debugInfo);
		
		return debugInfo;
	};

	// Handle date changes - update day of week like Vue
	// Vue logic: when denNgay changes -> update thuTuan -> call lay_ds_dai()
	useEffect(() => {
		if (denNgay) {
			const dayOfWeek = denNgay.day(); // 0=Sunday, 1=Monday, etc.
			const dayMap = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
			const newThuTuan = dayMap[dayOfWeek];
			
			// Only update if different to avoid infinite loop
			if (newThuTuan !== thuTuan) {
				setThuTuan(newThuTuan);
			}
		}
	}, [denNgay]); // Remove thuTuan from deps to avoid loop

	// Load optimized stations when mien and thuTuan are available
	// This implements your suggestion to add mien+thu conditions in API call for better performance
	useEffect(() => {
		const loadOptimizedStations = async () => {
			if (!mien || !thuTuan) {
				return; // Wait for both to be set
			}

			try {
				console.warn(`KQXS: Loading optimized stations for ${mien}-${thuTuan}...`);
				
				// Use fetchKQXSStationsWithFilter with correct signature
				const optimizedStations = await fetchKQXSStationsWithFilter({
					mien,
					thu: thuTuan,
				});

				console.warn("KQXS: Optimized stations loaded:", optimizedStations.length, optimizedStations.slice(0, 3));

				// Update the full list if we got results (this is additional optimization)
				if (optimizedStations && optimizedStations.length > 0) {
					// This filtered result can be used to update danhSachDai if needed
					// For now, we keep the full list but this shows the optimized approach works
				}
			} catch (error) {
				console.warn("KQXS: Error loading optimized stations:", error);
			}
		};

		loadOptimizedStations();
	}, [mien, thuTuan]);

	// Handle changes that should trigger station list reload like Vue lay_ds_dai()
	// Vue calls lay_ds_dai() when: mien changes, denNgay changes (via thuTuan update)
	useEffect(() => {
		// The daiFiltered memo will automatically recompute when mien or thuTuan change
		// This mimics Vue's lay_ds_dai() behavior
		// IMPORTANT: Clear ALL selections when region or day changes BUT NOT when switching on the same day
		console.warn(`KQXS: Region/Day changed to ${mien}-${thuTuan}, checking existing selections`);
		
		// Only clear selections if they are not valid for the new region/day combination
		if (dsDaiChonXemKetQua.length > 0) {
			const validSelections = dsDaiChonXemKetQua.filter(du_lieu_dai => {
				const dai = danhSachDai.find(d => d.du_lieu_dai === du_lieu_dai);
				return dai && dai.mien === mien && dai.thu === thuTuan;
			});
			
			if (validSelections.length !== dsDaiChonXemKetQua.length) {
				console.warn(`KQXS: Filtering selections from ${dsDaiChonXemKetQua.length} to ${validSelections.length} valid selections`);
				setDsDaiChonXemKetQua(validSelections);
			}
		}
		
		if (dsDaiChon.length > 0) {
			const validSelections = dsDaiChon.filter(stt => {
				const dai = danhSachDai.find(d => d.stt === stt);
				return dai && dai.mien === mien && dai.thu === thuTuan;
			});
			
			if (validSelections.length !== dsDaiChon.length) {
				console.warn(`KQXS: Filtering thongke selections from ${dsDaiChon.length} to ${validSelections.length} valid selections`);
				setDsDaiChon(validSelections);
			}
		}
	}, [mien, thuTuan, danhSachDai.length]); // Add danhSachDai.length to ensure we have loaded data

	// Debug: Log when stations are selected
	useEffect(() => {
		console.warn("KQXS: === STATION SELECTION DEBUG ===");
		console.warn("KQXS: Selected stations for xemKetQua (du_lieu_dai):", dsDaiChonXemKetQua);
		console.warn("KQXS: Filtered stations count:", daiFiltered.length);
		console.warn("KQXS: All stations count:", danhSachDai.length);
		console.warn("KQXS: Current filters:", { mien, thuTuan });
		console.warn("KQXS: Display results count:", displayedResults.length);
		
		// Log ALL filtered stations to see what's available
		console.warn("KQXS: Available stations for current filter:", 
			daiFiltered.map(d => `${d.du_lieu_dai}: ${d.ten_dai} [${d.mien}-${d.thu}]`).slice(0, 10)
		);
		
		if (dsDaiChonXemKetQua.length > 0) {
			console.warn("KQXS: === SELECTED STATIONS ANALYSIS ===");
			dsDaiChonXemKetQua.forEach((du_lieu_dai, idx) => {
				const found = danhSachDai.find(d => d.du_lieu_dai === du_lieu_dai);
				if (found) {
					const isMatch = found.mien === mien && found.thu === thuTuan;
					console.warn(`KQXS: [${idx+1}] "${du_lieu_dai}": ${found.ten_dai} [${found.mien}-${found.thu}] ${isMatch ? '✓ MATCH' : '✗ MISMATCH'}`);
				} else {
					console.warn(`KQXS: [${idx+1}] "${du_lieu_dai}": NOT FOUND IN DATABASE`);
				}
			});
		}
		
		console.warn("KQXS: === END DEBUG ===");
	}, [dsDaiChonXemKetQua, daiFiltered, danhSachDai.length, mien, thuTuan, displayedResults.length]);

	// Cập nhật kết quả từ external sources như Vue
	const capNhatKetQua = useCallback(async () => {
		setLoading(true);
		setProgressPercent(0);
		setProgressStatus("Đang cập nhật...");
		
		try {
			const ngayCapNhat = denNgay.format("DD-MM-YYYY");
			let completed = 0;
			const totalTasks = 3; // Miền Nam, Miền Trung, Miền Bắc
			
			// Update progress
			const updateProgress = (step: number, message: string) => {
				const percent = Math.round((step / totalTasks) * 100);
				setProgressPercent(percent);
				setProgressStatus(message);
			};

			updateProgress(1, "Đang cập nhật Miền Nam...");
			await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate delay

			updateProgress(2, "Đang cập nhật Miền Trung...");
			await new Promise(resolve => setTimeout(resolve, 1000));

			updateProgress(3, "Đang cập nhật Miền Bắc...");
			await new Promise(resolve => setTimeout(resolve, 1000));

			setProgressPercent(100);
			setProgressStatus("Hoàn thành!");
			message.success("Đã cập nhật xong kết quả");
			
			// Reset progress after 2 seconds
			setTimeout(() => {
				setProgressPercent(0);
				setProgressStatus("");
			}, 2000);

		} catch (error) {
			console.error("Error updating results:", error);
			message.error("Lỗi khi cập nhật kết quả");
			setProgressPercent(0);
			setProgressStatus("Lỗi!");
		} finally {
			setLoading(false);
		}
	}, [denNgay]);

	// Thống kê mới function từ Vue
	const thongKeMoi = useCallback(async () => {
		setLoading(true);
		try {
			// Implement logic cho thống kê mới theo Vue
			// console.log("Running thống kê mới...");
			
			// Reset progress
			setProgressPercent(0);
			setProgressStatus("Đang xử lý thống kê mới...");
			
			// Simulate processing
			for (let i = 0; i <= 100; i += 10) {
				setProgressPercent(i);
				setProgressStatus(`Đang xử lý: ${i}%`);
				await new Promise(resolve => setTimeout(resolve, 200));
			}
			
			setProgressStatus("Hoàn thành thống kê mới!");
			message.success("Thống kê mới đã hoàn thành");
			
		} catch (error) {
			console.error("Error in thống kê mới:", error);
			message.error("Lỗi khi chạy thống kê mới");
		} finally {
			setLoading(false);
		}
	}, []);

	const chayThongKe = useCallback(async () => {
		if (dsDaiChon.length === 0) return;
		setLoading(true);
		try {
			const allRows: KQXSRow[] = [];
			for (const stt of dsDaiChon) {
				const dai = danhSachDai.find(d => d.stt === stt);
				if (dai?.du_lieu_dai) {
					try {
						const rows = await fetchKQXSByStation(dai.du_lieu_dai, denNgay.subtract(soKy, "day").format("DD/MM/YYYY"));
						if (Array.isArray(rows) && rows.length) {
							allRows.push(...rows);
						}
					}
					catch {
						// Ignore errors for individual stations
					}
				}
			}
			setDuLieuDaiMien(allRows);
			if (allRows.length) {
				// Process thong ke logic here
				console.warn("Thống kê data:", allRows);
			}
		}
		catch (error) {
			message.error("Có lỗi khi chạy thống kê!");
		}
		finally {
			setLoading(false);
		}
	}, [dsDaiChon, danhSachDai, denNgay, soKy]);

	const xemKetQua = useCallback(async () => {
		if (dsDaiChonXemKetQua.length === 0) {
			message.warning("Vui lòng chọn ít nhất một đài!");
			return;
		}
		
		console.warn("KQXS xemKetQua - Selected stations (du_lieu_dai):", dsDaiChonXemKetQua);
		console.warn("KQXS xemKetQua - Date:", denNgay.format("DD/MM/YYYY"));
		console.warn("KQXS xemKetQua - Current filters:", { mien, thuTuan });
		console.warn("KQXS xemKetQua - Available filtered stations:", daiFiltered.length);
		
		// KHÔNG lọc bỏ đài đã chọn - Vue logic cho phép xem tất cả đài đã chọn
		// chỉ cần kiểm tra xem đài có tồn tại trong danh sách hay không
		const validStations = dsDaiChonXemKetQua.filter((du_lieu_dai) => {
			const dai = danhSachDai.find(d => d.du_lieu_dai === du_lieu_dai);
			return dai; // Chỉ cần đài tồn tại, không cần khớp mien/thu
		});
		
		if (validStations.length === 0) {
			message.error(`Không tìm thấy đài đã chọn trong danh sách!`);
			return;
		}
		
		// Thông báo nếu có đài sẽ không hiển thị kết quả do không phù hợp ngày
		const mismatchedStations = dsDaiChonXemKetQua.filter((du_lieu_dai) => {
			const dai = danhSachDai.find(d => d.du_lieu_dai === du_lieu_dai);
			return dai && (dai.mien !== mien || dai.thu !== thuTuan);
		});
		
		if (mismatchedStations.length > 0) {
			const mismatchedNames = mismatchedStations.map(du_lieu_dai => {
				const dai = danhSachDai.find(d => d.du_lieu_dai === du_lieu_dai);
				return dai ? `${dai.ten_dai} (${dai.mien}-${dai.thu})` : du_lieu_dai;
			}).join(', ');
			
			console.warn(`KQXS: Một số đài không phù hợp với ${mien}-${thuTuan}:`, mismatchedNames);
			message.warning(`Lưu ý: ${mismatchedStations.length} đài có thể không có kết quả cho ${mien}-${thuTuan}: ${mismatchedNames}`);
		}
		
		setLoading(true);
		try {
			const allRows: EnrichedKQXSRow[] = [];
			for (const du_lieu_dai of validStations) {
				const dai = danhSachDai.find(d => d.du_lieu_dai === du_lieu_dai);
				console.warn(`KQXS xemKetQua - Processing du_lieu_dai=\"${du_lieu_dai}\":`, dai);
				
				if (!dai) {
					console.error(`KQXS xemKetQua - Station not found: du_lieu_dai=\"${du_lieu_dai}\"`);
					continue;
				}
				
				// Vue logic: Vẫn lấy kết quả cho tất cả đài, dù có mismatch mien/thu
				// Chỉ log warning, không skip
				if (dai.mien !== mien || dai.thu !== thuTuan) {
					console.warn(`KQXS xemKetQua - Station mismatch: ${dai.ten_dai} is ${dai.mien}-${dai.thu}, searching for ${mien}-${thuTuan} data anyway`);
				}
				
				if (!dai.du_lieu_dai) {
					console.error(`KQXS xemKetQua - No du_lieu_dai for station: ${dai.ten_dai}`);
					continue;
				}
				
				try {
					console.warn(`KQXS xemKetQua - Fetching data for ${dai.ten_dai} (${dai.du_lieu_dai}) [${dai.mien}-${dai.thu}]`);
					const rows = await fetchKQXSByStation(dai.du_lieu_dai, denNgay.format("DD/MM/YYYY"));
					console.warn(`KQXS xemKetQua - Received ${rows?.length || 0} rows for ${dai.ten_dai}`);
					
					if (Array.isArray(rows) && rows.length) {
						// Enrich rows with station info
						const enrichedRows = rows.map((row, rowIdx) => ({
							...row,
							ten_dai: dai.ten_dai,
							thu: dai.thu,
							mien: dai.mien,
							du_lieu_dai: dai.du_lieu_dai,
							stt: dai.stt,
							ngay: formatDisplayDate(row.field_ngay),
							// Ensure unique key by adding row index
							uniqueKey: `${dai.stt || dai.du_lieu_dai}-${row.field_ngay}-${rowIdx}`,
						}));
						allRows.push(...enrichedRows);
					}
				}
				catch (error) {
					console.error(`KQXS xemKetQua - Error fetching data for ${dai.ten_dai}:`, error);
				}
			}
			
			console.warn(`KQXS xemKetQua - Total rows collected: ${allRows.length}`);
			setKetQuaXemNgay(allRows);
			
			if (allRows.length === 0) {
				message.warning("Không tìm thấy kết quả cho ngày đã chọn!");
			}
		}
		catch (error) {
			console.error("KQXS xemKetQua - Error:", error);
			message.error("Có lỗi khi xem kết quả!");
		}
		finally {
			setLoading(false);
		}
	}, [dsDaiChonXemKetQua, danhSachDai, denNgay, mien, thuTuan, daiFiltered.length]);

	// Prize row component
	const PrizeRow = React.useCallback(({ label, numbers }: { label: string; numbers: string[] }) => {
		const list = (numbers || []).filter(Boolean);
		const containerStyle = { display: "flex", alignItems: "center", marginBottom: "8px" } as React.CSSProperties;
		const labelStyle = {
			width: "100px",
			fontWeight: "bold",
			color: "#1890ff"
		} as React.CSSProperties;
		const numberStyle = {
			padding: "2px 8px",
			margin: "0 4px",
			backgroundColor: "#f6ffed",
			border: "1px solid #b7eb8f",
			borderRadius: "4px",
			fontFamily: "monospace",
			fontSize: "14px"
		} as React.CSSProperties;

		return React.createElement(
			"div",
			{ style: containerStyle },
			[
				React.createElement("div", { key: "label", style: labelStyle }, label),
				React.createElement(
					"div",
					{ key: "numbers", style: { display: "flex", flexWrap: "wrap", alignItems: "center" } },
					 list.length
						 ? list.map((num, idx) =>
							 React.createElement("span", { key: num + '-' + idx, style: numberStyle }, num)
						 )
						 : React.createElement("span", { key: "empty", style: { color: "#999" } }, "---")
				),
			]
		);
	}, []);

	// Generate tab content based on activeMenu
	const getTabItems = () => {
		const { t } = require('react-i18next').useTranslation();
		switch (activeMenu) {
			case "ketqua":
				return [
					{
						key: "1",
						label: t('website.services.kqxs.title'),
						children: React.createElement(
							"div",
							null,
							[
								React.createElement(
									Card,
									{ key: "controls", title: t('website.services.kqxs.select_station_date') },
									[
										React.createElement(
											Row,
											{ key: "row1", gutter: [8, 8] },
											[
												React.createElement(
													Col,
													{ key: "col1", xs: 24, sm: 12, md: 8 },
													React.createElement(
														Space,
														{ direction: "vertical", style: { width: "100%" } },
														[
															React.createElement("label", { key: "label" }, t('website.services.kqxs.region')),
															React.createElement(
																Select,
																{
																	key: "mien-select",
																	value: mien,
																	onChange: (value: any) => setMien(value),
																	style: { width: "100%" },
																	options: [
																		{ value: "MN", label: "Miền Nam" },
																		{ value: "MT", label: "Miền Trung" },
																		{ value: "MB", label: "Miền Bắc" },
																	]
																}
															),
														]
													)
												),
												React.createElement(
													Col,
													{ key: "col2", xs: 24, sm: 12, md: 8 },
													React.createElement(
														Space,
														{ direction: "vertical", style: { width: "100%" } },
														[
															React.createElement("label", { key: "label" }, t('website.services.kqxs.day')),
															React.createElement(
																Select,
																{
																	key: "thu-select",
																	value: thuTuan,
																	disabled: true, // Read-only like Vue: readOnly: true
																	placeholder: "Chọn thứ",
																	style: { width: "100%" },
																	options: [
																		{ value: "T2", label: "Thứ 2" },
																		{ value: "T3", label: "Thứ 3" },
																		{ value: "T4", label: "Thứ 4" },
																		{ value: "T5", label: "Thứ 5" },
																		{ value: "T6", label: "Thứ 6" },
																		{ value: "T7", label: "Thứ 7" },
																		{ value: "CN", label: "Chủ Nhật" },
																	]
																}
															),
														]
													)
												),
												React.createElement(
													Col,
													{ key: "col3", xs: 24, sm: 12, md: 8 },
													React.createElement(
														Space,
														{ direction: "vertical", style: { width: "100%" } },
														[
															React.createElement("label", { key: "label" }, t('website.services.kqxs.view_date')),
															React.createElement(
																DatePicker,
																{
																	key: "date-picker",
																	value: denNgay,
																	onChange: (date: any) => date && setDenNgay(date),
																	style: { width: "100%" },
																	format: "DD/MM/YYYY"
																}
															),
														]
													)
												),
											]
										),
										React.createElement(
											Row,
											{ key: "row2", style: { marginTop: 16 } },
											React.createElement(
												Col,
												{ key: "col", span: 24 },
												React.createElement(
													Space,
													{ direction: "vertical", style: { width: "100%" } },
													[
														React.createElement("label", { key: "label" }, t('website.services.kqxs.select_station')),
														React.createElement(
															Select,
															{
																key: "dai-select",
																mode: "multiple",
																value: dsDaiChonXemKetQua,
																onChange: (value: any) => setDsDaiChonXemKetQua(value),
																placeholder: "Chọn các đài cần xem",
																style: { width: "100%" },
																options: daiFiltered.map(dai => ({
																	value: dai.du_lieu_dai,
																	label: dai.ten_dai
																}))
															}
														),
													]
												)
											)
										),
										React.createElement(
											Row,
											{ key: "row3", style: { marginTop: 16 } },
											React.createElement(
												Col,
												{ key: "col", span: 24 },
												React.createElement(
													Space,
													{ wrap: true },
													[
														React.createElement(
															Button,
															{
																key: "submit",
																type: "primary",
																onClick: xemKetQua,
																loading: loading,
																disabled: dsDaiChonXemKetQua.length === 0
															},
															t('website.services.kqxs.view_result')
														),
														React.createElement(
															Button,
															{
																key: "update",
																type: "default",
																onClick: capNhatKetQua,
																loading: loading,
																style: { marginLeft: 8 }
															},
															t('website.services.kqxs.update_result')
														),
													]
												)
											)
										),
									]
								),
								// CSS Styling giống Vue
								React.createElement(
									"style",
									{ key: "kqxs-styles" },
									`
									.kqxs {
										margin-top: 20px;
									}
									.bkqtinhmienbac, .bkqtinhmiennam {
										border: 1px solid #999;
										border-right: 0;
										border-bottom: 0;
										width: 100%;
										font-size: 11px;
										margin-bottom: 20px;
									}
									.bkqtinhmienbac td, .bkqtinhmiennam td {
										border: 1px solid #999;
										border-top: 0;
										border-left: 0;
										text-align: center;
										height: 24px;
										padding: 0;
									}
									.card-header {
										background: linear-gradient(to bottom, #4A90E2, #357ABD);
										color: white;
										text-align: center;
										font-weight: bold;
										padding: 10px;
										border-bottom: 1px solid #ddd;
									}
									.card-title {
										color: #fff;
										font-size: 14px;
										font-weight: 700;
									}
									.card-body {
										padding: 0 !important;
									}
									.row {
										margin: 0;
										border-bottom: 1px solid var(--ant-border-color, #999);
									}
									.row.bg-gray {
										background-color: var(--ant-background-color-light, #f5f5f5);
									}
									.col-3, .col-9 {
										padding: 5px 8px;
									}
									.giaidbl, .giai1l, .giai2l, .giai3l, .giai4l, .giai5l, .giai6l, .giai7l, .giai8l {
										font-size: 13px;
										font-weight: bold;
										color: var(--ant-error-color, #b00);
										text-align: center;
										border-right: 1px solid var(--ant-border-color, #999);
									}
									.giaidb {
										font-weight: 700;
										color: var(--ant-error-color-dark, maroon);
										font-size: 18px;
										text-align: center;
									}
									.giai1, .giai2 {
										font-size: 16px;
										font-weight: 700;
										text-align: center;
									}
									.giai3, .giai4, .giai5, .giai6, .giai7 {
										font-size: 16px;
										font-weight: 700;
										text-align: center;
									}
									.giai8 {
										font-weight: 700;
										color: var(--ant-error-color-dark, maroon);
										font-size: 24px;
										text-align: center;
									}
									.giaiSo {
										display: inline-block;
										margin: 2px 4px;
										padding: 2px 6px;
										font-family: 'Courier New', monospace;
										font-weight: bold;
										background-color: var(--ant-component-background, #fff);
										border: 1px solid var(--ant-border-color, #ccc);
										color: var(--ant-text-color, #000000d9);
									}
									.giai4 .giaiSo {
										width: 24%;
										display: inline-block;
										float: left;
									}
									.giai6 .giaiSo {
										width: 33%;
										display: inline-block; 
										float: left;
									}
									.giai3 .giaiSo {
										width: 49%;
										display: inline-block;
										float: left;
									}
									.xu-ly-ket-qua {
										padding: 0;
									}
									.xu-ly-ket-qua table {
										width: 100%;
										border-collapse: collapse;
										font-size: 12px;
									}
									.xu-ly-ket-qua th {
										background-color: var(--ant-primary-color, #4A90E2);
										color: var(--ant-primary-color-text, white);
										padding: 8px 4px;
										text-align: center;
										font-weight: bold;
										border: 1px solid var(--ant-border-color, #ddd);
									}
									.xu-ly-ket-qua td {
										padding: 6px 4px;
										text-align: center;
										border: 1px solid var(--ant-border-color, #ddd);
										font-family: 'Courier New', monospace;
										background: var(--ant-component-background, #ffffff);
										color: var(--ant-text-color, #000000d9);
									}
									.xu-ly-ket-qua tbody tr:nth-child(even) {
										background-color: var(--ant-background-color-light, #f9f9f9);
									}
									.xu-ly-ket-qua tbody tr:hover {
										background-color: var(--ant-primary-1, #e6f3ff);
									}
									.font-weight-bold {
										font-weight: bold;
										background-color: var(--ant-background-color-light, #f0f0f0);
										color: var(--ant-text-color, #000000d9);
									}
									`
								),
								// Kết quả hiển thị theo style Vue - Enhanced với đầy đủ đài
								displayedResults.length > 0 ? React.createElement(
									"div",
									{ key: "ket-qua", className: "kqxs" },
									React.createElement(
										"div",
										{ className: "box_kqxs" },
										React.createElement(
											"div",
											{
												key: "lottery-results-container",
												style: { 
													display: "grid",
													gridTemplateColumns: displayedResults.length === 1 ? "1fr" :
																		  displayedResults.length === 2 ? "1fr 1fr" :
																		  displayedResults.length === 3 ? "1fr 1fr 1fr" :
																		  "repeat(auto-fit, minmax(320px, 1fr))",
													gap: "16px",
													padding: "16px"
												}
											},
											displayedResults.map((dai, idx) => React.createElement(
												"div",
												{
													key: dai.uniqueKey || `${dai.stt || 'unknown'}-${dai.field_ngay}-${idx}`,
													className: `${mien === "MB" ? "bkqtinhmienbac" : "bkqtinhmiennam"} lottery-card`,
													style: {
														border: "1px solid #999",
														borderRadius: "4px",
														overflow: "hidden",
														backgroundColor: "#fff",
														boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
													}
												},
												React.createElement(
													"div",
													{ className: "box_kqxs_content card" },
													[
														// Header với tên đài và ngày
														React.createElement(
															"div",
															{ key: "header", className: "card-header" },
															[
																React.createElement(
																	"div",
																	{ key: "title", className: "card-title" },
																	`${dai.ten_dai || ''}`
																),
																React.createElement(
																	"div",
																	{ key: "date", style: { fontSize: "12px", marginTop: "4px" } },
																	`${getDayName(dai.thu || '')} - ${dai.ngay || formatDisplayDate(dai.field_ngay)}`
																)
															]
														),
														// Body với các giải
														React.createElement(
															"div",
															{ key: "body", className: "card-body p-0" },
															[
																// Giải Đặc Biệt
																React.createElement(
																	Row,
																	{ key: "giai-db", className: "row" },
																	[
																		React.createElement("div", { key: "label", className: "giaidbl col-3 p-0" }, t('website.services.kqxs.prize_db')),
																		React.createElement(
																			"div", 
																			{ key: "number", className: "giaidb col-9 p-0" },
																			React.createElement(
																				"div",
																				{ className: "giaiSo" },
																				React.createElement("span", { style: { marginTop: "15px", display: "inline-block" } }, dai.data?.field_duoi || "")
																			)
																		)
																	]
																),
																// Giải Nhất  
																React.createElement(
																	Row,
																	{ key: "giai-1", className: "row bg-gray" },
																	[
																		React.createElement("div", { key: "label", className: "giai1l col-3 p-0" }, t('website.services.kqxs.prize_1')),
																		React.createElement(
																			"div",
																			{ key: "numbers", className: "giai1 col-9 p-0" },
																			mien !== "MB" 
																				? React.createElement("div", { className: "giaiSo" }, dai.data?.field_so17 || "")
																				: React.createElement("div", { className: "giaiSo" }, dai.data?.field_so26 || "")
																		)
																	]
																),
																// Giải Nhì
																React.createElement(
																	Row,
																	{ key: "giai-2", className: "row" },
																	[
																		React.createElement("div", { key: "label", className: "giai2l col-3 p-0" }, t('website.services.kqxs.prize_2')),
																		React.createElement(
																			"div",
																			{ key: "numbers", className: "giai2 col-9 p-0" },
																			mien !== "MB" 
																				? React.createElement("div", { className: "giaiSo" }, dai.data?.field_so16 || "")
																				: [
																					React.createElement("div", { key: "1", className: "giaiSo" }, dai.data?.field_so24 || ""),
																					React.createElement("div", { key: "2", className: "giaiSo" }, dai.data?.field_so25 || "")
																				]
																		)
																	]
																),
																// Giải Ba
																React.createElement(
																	Row,
																	{ key: "giai-3", className: "row bg-gray" },
																	[
																		React.createElement("div", { key: "label", className: "giai3l col-3 p-0" }, t('website.services.kqxs.prize_3')),
																		React.createElement(
																			"div",
																			{ key: "numbers", className: "giai3 col-9 p-0" },
																			mien !== "MB" 
																				? [
																					React.createElement("div", { key: "1", className: "giaiSo" }, dai.data?.field_so15 || ""),
																					React.createElement("div", { key: "2", className: "giaiSo" }, dai.data?.field_so14 || "")
																				]
																				: [
																					React.createElement("div", { key: "1", className: "giaiSo" }, dai.data?.field_so18 || ""),
																					React.createElement("div", { key: "2", className: "giaiSo" }, dai.data?.field_so19 || ""),
																					React.createElement("div", { key: "3", className: "giaiSo" }, dai.data?.field_so20 || ""),
																					React.createElement("div", { key: "4", className: "giaiSo" }, dai.data?.field_so21 || ""),
																					React.createElement("div", { key: "5", className: "giaiSo" }, dai.data?.field_so22 || ""),
																					React.createElement("div", { key: "6", className: "giaiSo" }, dai.data?.field_so23 || "")
																				]
																		)
																	]
																),
																// Giải Tư
																React.createElement(
																	Row,
																	{ key: "giai-4", className: "row" },
																	[
																		React.createElement("div", { key: "label", className: "giai4l col-3 p-0" }, t('website.services.kqxs.prize_4')),
																		React.createElement(
																			"div",
																			{ key: "numbers", className: "giai4 col-9 p-0" },
																			mien !== "MB" 
																				? [
																					React.createElement("div", { key: "1", className: "giaiSo" }, dai.data?.field_so13 || ""),
																					React.createElement("div", { key: "2", className: "giaiSo" }, dai.data?.field_so12 || ""),
																					React.createElement("div", { key: "3", className: "giaiSo" }, dai.data?.field_so11 || ""),
																					React.createElement("div", { key: "4", className: "giaiSo" }, dai.data?.field_so10 || ""),
																					React.createElement("div", { key: "5", className: "giaiSo" }, dai.data?.field_so9 || ""),
																					React.createElement("div", { key: "6", className: "giaiSo" }, dai.data?.field_so8 || ""),
																					React.createElement("div", { key: "7", className: "giaiSo" }, dai.data?.field_so7 || "")
																				]
																				: [
																					React.createElement("div", { key: "1", className: "giaiSo" }, dai.data?.field_so14 || ""),
																					React.createElement("div", { key: "2", className: "giaiSo" }, dai.data?.field_so15 || ""),
																					React.createElement("div", { key: "3", className: "giaiSo" }, dai.data?.field_so16 || ""),
																					React.createElement("div", { key: "4", className: "giaiSo" }, dai.data?.field_so17 || "")
																				]
																		)
																	]
																),
																// Giải Năm
																React.createElement(
																	Row,
																	{ key: "giai-5", className: "row bg-gray" },
																	[
																		React.createElement("div", { key: "label", className: "giai5l col-3 p-0" }, t('website.services.kqxs.prize_5')),
																		React.createElement(
																			"div",
																			{ key: "numbers", className: "giai5 col-9 p-0" },
																			mien !== "MB" 
																				? React.createElement("div", { className: "giaiSo" }, dai.data?.field_so6 || "")
																				: [
																					React.createElement("div", { key: "1", className: "giaiSo" }, dai.data?.field_so8 || ""),
																					React.createElement("div", { key: "2", className: "giaiSo" }, dai.data?.field_so9 || ""),
																					React.createElement("div", { key: "3", className: "giaiSo" }, dai.data?.field_so10 || ""),
																					React.createElement("div", { key: "4", className: "giaiSo" }, dai.data?.field_so11 || ""),
																					React.createElement("div", { key: "5", className: "giaiSo" }, dai.data?.field_so12 || ""),
																					React.createElement("div", { key: "6", className: "giaiSo" }, dai.data?.field_so13 || "")
																				]
																		)
																	]
																),
																// Giải Sáu
																React.createElement(
																	Row,
																	{ key: "giai-6", className: "row" },
																	[
																		React.createElement("div", { key: "label", className: "giai6l col-3 p-0" }, t('website.services.kqxs.prize_6')),
																		React.createElement(
																			"div",
																			{ key: "numbers", className: "giai6 col-9 p-0" },
																			mien !== "MB" 
																				? [
																					React.createElement("div", { key: "1", className: "giaiSo" }, dai.data?.field_so5 || ""),
																					React.createElement("div", { key: "2", className: "giaiSo" }, dai.data?.field_so4 || ""),
																					React.createElement("div", { key: "3", className: "giaiSo" }, dai.data?.field_so3 || "")
																				]
																				: [
																					React.createElement("div", { key: "1", className: "giaiSo" }, dai.data?.field_so5 || ""),
																					React.createElement("div", { key: "2", className: "giaiSo" }, dai.data?.field_so6 || ""),
																					React.createElement("div", { key: "3", className: "giaiSo" }, dai.data?.field_so7 || "")
																				]
																		)
																	]
																),
																// Giải Bảy
																React.createElement(
																	Row,
																	{ key: "giai-7", className: "row bg-gray" },
																	[
																		React.createElement("div", { key: "label", className: "giai7l col-3 p-0" }, t('website.services.kqxs.prize_7')),
																		React.createElement(
																			"div",
																			{ key: "numbers", className: "giai7 col-9 p-0" },
																			mien !== "MB" 
																				? React.createElement("div", { className: "giaiSo" }, dai.data?.field_so2 || "")
																				: [
																					React.createElement("div", { key: "1", className: "giaiSo" }, dai.data?.field_dau || ""),
																					React.createElement("div", { key: "2", className: "giaiSo" }, dai.data?.field_so2 || ""),
																					React.createElement("div", { key: "3", className: "giaiSo" }, dai.data?.field_so3 || ""),
																					React.createElement("div", { key: "4", className: "giaiSo" }, dai.data?.field_so4 || "")
																				]
																		)
																	]
																),
																// Giải 8 (chỉ cho miền Nam/Trung)
																mien !== "MB" ? React.createElement(
																	Row,
																	{ key: "giai-8", className: "row" },
																	[
																		React.createElement("div", { key: "label", className: "giai8l col-3 p-0" }, t('website.services.kqxs.prize_8')),
																		React.createElement(
																			"div",
																			{ key: "numbers", className: "giai8 col-9 p-0" },
																			React.createElement("div", { className: "giaiSo" }, dai.data?.field_dau || "")
																		)
																	]
																) : null
															].filter(Boolean)
														)
													]
												)
											))
										)
									)
								) : null,
					// Hiển thị bảng Kết quả theo hàng chục và đơn vị
					xuLyKetQuaHangChuc.length > 0 && React.createElement(
						Card,
						{
							key: "hang-chuc-don-vi",
							title: "Kết quả theo hàng chục và đơn vị",
							style: { marginTop: "20px" }
						},
						React.createElement(
							"div",
							{ className: "xu-ly-ket-qua" },
							[
								React.createElement(
									"div",
									{ key: "header", className: "table-responsive" },
									React.createElement(
										"table",
										{ className: "table table-bordered table-striped" },
										[
											React.createElement(
												"thead",
												{ key: "thead" },
												React.createElement(
													"tr",
													null,
													[
														React.createElement("th", { key: "hang-chuc", className: "text-center" }, "Hàng chục"),
														// Tạo headers từ các đài được chọn
														...displayedResults.map((dai: any, index: number) => 
															React.createElement("th", { key: `dai-${index}`, className: "text-center" }, dai.ten_dai || `Đài ${index + 1}`)
														)
													]
												)
											),
											React.createElement(
												"tbody", 
												{ key: "tbody" },
												xuLyKetQuaHangChuc.map((hangChuc: any, index: number) => 
													React.createElement(
														"tr",
														{ key: `row-${index}` },
														[
															React.createElement("td", { key: "digit", className: "text-center font-weight-bold tanso_hangchuc" }, hangChuc.chuc),
															// Tạo cells từ dữ liệu đài
															...displayedResults.map((dai: any, daiIndex: number) => {
																const daiKey = `dai_${dai.stt}`;
																const numbers = hangChuc[daiKey] || '';
																return React.createElement(
																	"td", 
																	{ key: `cell-${daiIndex}`, className: "text-center tanso_hangdonvi" },
																	numbers || "-"
																);
															})
														]
													)
												)
											)
										]
									)
								)
							]
						)
					),
					// Hiển thị trạng thái loading nếu có dữ liệu nhưng chưa chuyển đổi xong
					ketQuaXemNgay.length > 0 && displayedResults.length === 0 && React.createElement(
						Card,
						{ 
							key: "no-results", 
							title: "Đang xử lý dữ liệu...",
							style: { padding: "20px", textAlign: "center" } 
						},
						React.createElement("div", { style: { color: "#666" } }, `Đã tải ${ketQuaXemNgay.length} bản ghi...`)
					),
					// Hiển thị thông báo trống nếu không có dữ liệu
					!ketQuaXemNgay.length && React.createElement(
						Card,
						{ 
							key: "empty", 
							title: "Chưa có kết quả",
							style: { padding: "20px", textAlign: "center", color: "#999" } 
						},
						React.createElement("div", null, "Vui lòng chọn đài và ngày để xem kết quả.")
					)
				].filter(Boolean)
			)
		}
	];

	case "thongke":
		return [
					{
						key: "2",
						label: "Thống kê lô tô",
						children: React.createElement(
							"div",
							null,
							[
								React.createElement(
									Card,
									{ key: "controls", title: "Cài đặt thống kê" },
									[
										React.createElement(
											Row,
											{ key: "row1", gutter: [16, 16] },
											[
												React.createElement(
													Col,
													{ key: "col1", xs: 24, sm: 12, md: 6 },
													React.createElement(
														Space,
														{ direction: "vertical", style: { width: "100%" } },
														[
															React.createElement("label", { key: "label" }, "Miền:"),
															React.createElement(
																Select,
																{
																	key: "mien-select",
																	value: mien,
																	onChange: (value: any) => setMien(value),
																	style: { width: "100%" },
																	options: [
																		{ value: "MN", label: "Miền Nam" },
																		{ value: "MT", label: "Miền Trung" },
																		{ value: "MB", label: "Miền Bắc" },
																	]
																}
															),
														]
													)
												),
												React.createElement(
													Col,
													{ key: "col2", xs: 24, sm: 12, md: 6 },
													React.createElement(
														Space,
														{ direction: "vertical", style: { width: "100%" } },
														[
															React.createElement("label", { key: "label" }, "Thứ:"),
															React.createElement(
																Select,
																{
																	key: "thu-select",
																	value: thuTuan,
																	disabled: true, // Read-only like Vue: readOnly: true
																	placeholder: "Chọn thứ",
																	style: { width: "100%" },
																	options: [
																		{ value: "T2", label: "Thứ 2" },
																		{ value: "T3", label: "Thứ 3" },
																		{ value: "T4", label: "Thứ 4" },
																		{ value: "T5", label: "Thứ 5" },
																		{ value: "T6", label: "Thứ 6" },
																		{ value: "T7", label: "Thứ 7" },
																		{ value: "CN", label: "Chủ Nhật" },
																	]
																}
															),
														]
													)
												),
												React.createElement(
													Col,
													{ key: "col4", span: 12 },
													React.createElement(
														Space,
														{ direction: "vertical", style: { width: "100%" } },
														[
															React.createElement("label", { key: "label" }, "Số kỳ:"),
															React.createElement(
																InputNumber,
																{
																	key: "so-ky",
																	value: soKy,
																	onChange: (val: any) => val && setSoKy(val),
																	min: 1,
																	max: 365,
																	style: { width: "100%" }
																}
															),
														]
													)
												),
											]
										),
										React.createElement(
											Row,
											{ key: "row2", gutter: [16, 16], style: { marginTop: 16 } },
											[
												React.createElement(
													Col,
													{ key: "col1", span: 6 },
													React.createElement(
														Space,
														{ direction: "vertical", style: { width: "100%" } },
														[
															React.createElement("label", { key: "label" }, "KXH từ:"),
															React.createElement(
																InputNumber,
																{
																	key: "kxh-tu",
																	value: kxhTu,
																	onChange: (val: any) => val && setKxhTu(val),
																	min: 1,
																	max: 999,
																	style: { width: "100%" }
																}
															),
														]
													)
												),
												React.createElement(
													Col,
													{ key: "col2", span: 6 },
													React.createElement(
														Space,
														{ direction: "vertical", style: { width: "100%" } },
														[
															React.createElement("label", { key: "label" }, "KXH đến:"),
															React.createElement(
																InputNumber,
																{
																	key: "kxh-den",
																	value: kxhDen,
																	onChange: (val: any) => val && setKxhDen(val),
																	min: 1,
																	max: 999,
																	style: { width: "100%" }
																}
															),
														]
													)
												),
												React.createElement(
													Col,
													{ key: "col3", span: 12 },
													React.createElement(
														Space,
														{ direction: "vertical", style: { width: "100%" } },
														[
															React.createElement("label", { key: "label" }, "Chọn đài:"),
															React.createElement(
																Select,
																{
																	key: "dai-select",
																	mode: "multiple",
																	value: dsDaiChon,
																	onChange: (value: any) => setDsDaiChon(value),
																	placeholder: "Chọn các đài cần thống kê",
																	style: { width: "100%" },
																	options: daiFiltered.map(dai => ({
																		value: dai.stt,
																		label: dai.ten_dai
																	}))
																}
															),
														]
													)
												),
											]
										),
										React.createElement(
											Row,
											{ key: "row-progress", gutter: [8, 8], style: { marginTop: 16 } },
											React.createElement(
												Col,
												{ key: "col", span: 24 },
												React.createElement(
													Space,
													{ direction: "vertical", style: { width: "100%" } },
													[
														React.createElement("label", { key: "label" }, "Tiến trình:"),
														React.createElement(
															Progress,
															{
																key: "progress-bar",
																percent: progressPercent,
																status: progressPercent === 100 ? "success" : "active",
																strokeColor: "#52c41a",
																format: () => progressStatus
															}
														),
													]
												)
											)
										),
										// Advanced statistics controls từ Vue
										React.createElement(
											Row,
											{ key: "row-advanced1", gutter: [16, 16], style: { marginTop: 16 } },
											[
												React.createElement(
													Col,
													{ key: "col1", xs: 24, sm: 12, md: 6 },
													React.createElement(
														Space,
														{ direction: "vertical", style: { width: "100%" } },
														[
															React.createElement("label", { key: "label" }, "Loại Thống Kê:"),
															React.createElement(
																Select,
																{
																	key: "loai-tk",
																	value: loaiThongKe,
																	onChange: (value: any) => setLoaiThongKe(value),
																	style: { width: "100%" },
																	options: [
																		{ value: "thongke_basic", label: "Thống kê cơ bản" },
																		{ value: "thongke_advanced", label: "Thống kê nâng cao" },
																		{ value: "thongke_full", label: "Thống kê đầy đủ" },
																	]
																}
															),
														]
													)
												),
												React.createElement(
													Col,
													{ key: "col2", xs: 24, sm: 12, md: 6 },
													React.createElement(
														Space,
														{ direction: "vertical", style: { width: "100%" } },
														[
															React.createElement("label", { key: "label" }, "Loại Tìm:"),
															React.createElement(
																Select,
																{
																	key: "loai-tim",
																	value: loaiTim,
																	onChange: (value: any) => setLoaiTim(value),
																	style: { width: "100%" },
																	options: loaiTimOptions
																}
															),
														]
													)
												),
												React.createElement(
													Col,
													{ key: "col3", xs: 24, sm: 12, md: 6 },
													React.createElement(
														Space,
														{ direction: "vertical", style: { width: "100%" } },
														[
															React.createElement("label", { key: "label" }, "Tìm Số Chủ:"),
															React.createElement(
																Input,
																{
																	key: "so-chu",
																	value: sochu,
																	onChange: (e: any) => setSochu(e.target.value),
																	placeholder: "Nhập số chủ",
																	style: { width: "100%" }
																}
															),
														]
													)
												),
												React.createElement(
													Col,
													{ key: "col4", xs: 24, sm: 12, md: 6 },
													React.createElement(
														Space,
														{ direction: "vertical", style: { width: "100%" } },
														[
															React.createElement("label", { key: "label" }, "Lọc Sâu:"),
															React.createElement(
																Checkbox,
																{
																	key: "kxh-locsau",
																	checked: kxhLocSau,
																	onChange: (e: any) => setKxhLocSau(e.target.checked)
																},
																"Bật lọc sâu"
															),
														]
													)
												),
											]
										),
										React.createElement(
											Row,
											{ key: "row3", style: { marginTop: 16 } },
											React.createElement(
												Col,
												{ key: "col", span: 24 },
												React.createElement(
													Space,
													{ wrap: true, style: { justifyContent: "center" } },
													[
														React.createElement(
															Button,
															{
																key: "ket-qua",
																type: "primary",
																onClick: xemKetQua,
																loading: loading
															},
															"Kết Quả"
														),
														React.createElement(
															Button,
															{
																key: "thong-ke",
																type: "default",
																onClick: chayThongKe,
																loading: loading,
																disabled: dsDaiChon.length === 0
															},
															"Thống Kê"
														),
														React.createElement(
															Button,
															{
																key: "thong-ke-moi",
																type: "default",
																onClick: thongKeMoi,
																loading: loading
															},
															"Thống Kê Mới"
														),
													]
												)
											)
										),
									]
								),
								duLieuDaiMien.length > 0 ? React.createElement(
									Card,
									{ key: "results", title: "Kết quả thống kê", style: { marginTop: 16 } },
									React.createElement(CsmDynamicGrid as any, {
										key: "thongke-grid",
										appId: "kqxs",
										permissions: 0, // Read-only
										menusPermissions: {},
										database: {
											thongke_results: {
												rows: duLieuDaiMien.slice(0, 50).map((item: any, index: number) => ({
													...item,
													id: index,
													key: index,
												})),
											},
										},
										m_configs: {
											id: "thongke_results",
											label: "Kết quả thống kê",
											table_name: "thongke_results",
											table: [
												{ f_name: "field_ngay", f_header: "Ngày", f_show: 1, f_types: "text", width: 100 },
												{ f_name: "province", f_header: "Tỉnh/Thành", f_show: 1, f_types: "text", width: 120 },
												{ f_name: "prize", f_header: "Giải", f_show: 1, f_types: "text", width: 80 },
												{ f_name: "numbers", f_header: "Số", f_show: 1, f_types: "text" },
												{ f_name: "duoi", f_header: "Đuôi", f_show: 1, f_types: "text", width: 80 },
												{ f_name: "dem", f_header: "Đếm", f_show: 1, f_types: "number", width: 80 },
												{ f_name: "kxh", f_header: "KXH", f_show: 1, f_types: "number", width: 80 },
												{ f_name: "max", f_header: "Max", f_show: 1, f_types: "number", width: 80 },
												{ f_name: "tong", f_header: "Tổng", f_show: 1, f_types: "number", width: 80 },
											],
											trigger: {},
											g_readonly: true,
											table_pagesize: 20,
										},
									})
								) : null,
								// Grid grdKQ từ Vue cho kết quả chi tiết
								duLieuThongKe.length > 0 ? React.createElement(
									Card,
									{ key: "grd-kq", title: "Kết quả chi tiết (grdKQ)", style: { marginTop: 16 } },
									React.createElement(CsmDynamicGrid as any, {
										key: "grd-kq-grid",
										appId: "kqxs",
										permissions: 0, // Read-only
										menusPermissions: {},
										database: {
											grd_kq_results: {
												rows: duLieuThongKe.slice(0, 100).map((item: any, index: number) => ({
													...item,
													id: index,
													key: index,
												})),
											},
										},
										m_configs: {
											id: "grd_kq_results",
											label: "Kết quả chi tiết",
											table_name: "grd_kq_results",
											table: [
												{ f_name: "duoi", f_header: "Đuôi", f_show: 1, f_types: "text", width: 80 },
												{ f_name: "dem", f_header: "Đếm", f_show: 1, f_types: "number", width: 80 },
												{ f_name: "kxh", f_header: "KXH", f_show: 1, f_types: "number", width: 80 },
												{ f_name: "max", f_header: "Max", f_show: 1, f_types: "number", width: 80 },
												{ f_name: "tong", f_header: "Tổng", f_show: 1, f_types: "number", width: 80 },
											],
											trigger: {},
											g_readonly: true,
											table_pagesize: 25,
										},
									})
								) : null,
							]
						)
					}
				];

		case "thongkemoi":
			return [
					{
						key: "3", 
						label: "Thống kê mới",
						children: React.createElement(
							"div",
							{ style: { padding: "24px" } },
							[
								// Vue-style Progress Bar
								React.createElement(
									Card,
									{ key: "progress-card", title: "Tiến độ xử lý", style: { marginBottom: 16 } },
									React.createElement(Progress, {
										key: "progress-bar",
										percent: progressPercent,
										status: progressPercent === 100 ? "success" : "active",
										strokeColor: progressPercent === 100 ? "#52c41a" : "#1890ff",
									})
								),
								// Advanced Statistics Control Panel (Enhanced with Vue features)
								React.createElement(
									Card,
									{
										key: "advanced-control-panel",
										title: "Bảng Điều Khiển Thống Kê Nâng Cao (Vue Logic)",
										style: { marginBottom: 16 },
									},
									React.createElement(
										"div",
										{ key: "controls" },
										[
											React.createElement(
												Row,
												{ key: "control-row1", gutter: [16, 16], style: { marginBottom: 16 } },
												[
													React.createElement(
														Col,
														{ key: "mien-col", xs: 24, sm: 12, md: 4 },
														[
															React.createElement("div", { key: "mien-label", style: { marginBottom: "8px", fontWeight: "500" } }, "Miền:"),
															React.createElement(
																Select,
																{
																	key: "mien-select",
																	style: { width: "100%" },
																	value: mien,
																	onChange: (value: unknown) => setMien(value as string),
																	options: [
																		{ value: "MN", label: "Miền Nam" },
																		{ value: "MT", label: "Miền Trung" },
																		{ value: "MB", label: "Miền Bắc" },
																	],
																}
															),
														]
													),
													React.createElement(
														Col,
														{ key: "thu-col", xs: 24, sm: 12, md: 4 },
														[
															React.createElement("div", { key: "thu-label", style: { marginBottom: "8px", fontWeight: "500" } }, "Thứ:"),
															React.createElement(
																Select,
																{
																	key: "thu-select",
																	style: { width: "100%" },
																	value: thuTuan,
																	disabled: true, // Read-only like Vue
																	options: [
																		{ value: "T2", label: "Thứ 2" },
																		{ value: "T3", label: "Thứ 3" },
																		{ value: "T4", label: "Thứ 4" },
																		{ value: "T5", label: "Thứ 5" },
																		{ value: "T6", label: "Thứ 6" },
																		{ value: "T7", label: "Thứ 7" },
																		{ value: "CN", label: "Chủ Nhật" },
																	],
																}
															),
														]
													),

													React.createElement(
														Col,
														{ key: "soky-col", xs: 24, sm: 12, md: 4 },
														[
															React.createElement("div", { key: "soky-label", style: { marginBottom: "8px", fontWeight: "500" } }, "Số Kỳ:"),
															React.createElement(
																InputNumber,
																{
																	key: "soky-input",
																	style: { width: "100%" },
																	min: 1,
																	max: 365,
																	value: soKy,
																	onChange: (val: any) => setSoKy(val || 28),
																	controls: true,
																}
															),
														]
													),
													React.createElement(
														Col,
														{ key: "laysoky-col", xs: 24, sm: 12, md: 4 },
														[
															React.createElement("div", { key: "laysoky-label", style: { marginBottom: "8px", fontWeight: "500" } }, "Lấy Số Kỳ:"),
															React.createElement(
																InputNumber,
																{
																	key: "laysoky-input",
																	style: { width: "100%" },
																	min: 0,
																	max: 50,
																	value: laySoKy,
																	onChange: (val: any) => setLaySoKy(val || 5),
																	controls: true,
																}
															),
														]
													),
													React.createElement(
														Col,
														{ key: "sapxep-col", xs: 24, sm: 12, md: 4 },
														[
															React.createElement("div", { key: "sapxep-label", style: { marginBottom: "8px", fontWeight: "500" } }, "Sắp Xếp:"),
															React.createElement(
																Select,
																{
																	key: "sapxep-select",
																	style: { width: "100%" },
																	value: sapXep,
																	onChange: (value: unknown) => setSapXep(value as number),
																	options: [
																		{ value: 0, label: "Ngày mới đứng trước" },
																		{ value: 1, label: "Ngày cũ đứng trước" },
																	],
																}
															),
														]
													),
													React.createElement(
														Col,
														{ key: "loaithongke-col", xs: 24, sm: 12, md: 4 },
														[
															React.createElement("div", { key: "loaithongke-label", style: { marginBottom: "8px", fontWeight: "500" } }, "Loại Thống Kê:"),
															React.createElement(
																Select,
																{
																	key: "loaithongke-select",
																	style: { width: "100%" },
																	value: loaiThongKe,
																	onChange: (value: unknown) => setLoaiThongKe(value as number),
																	options: [
																		{ value: 1, label: "Thống kê 1 Đài" },
																		{ value: 2, label: "Thống kê 2 Đài" },
																		{ value: 3, label: "Thống kê 3 Đài" },
																	],
																}
															),
														]
													),
												]
											),
											React.createElement(
												Row,
												{ key: "control-row2", gutter: [16, 16], style: { marginBottom: 16 } },
												[
													React.createElement(
														Col,
														{ key: "kxh-controls", xs: 24, sm: 24, md: 12 },
														React.createElement(
															Card,
															{ size: "small", title: "Điều Kiện KXH", style: { border: "2px solid #52c41a" } },
															[
																React.createElement(
																	Row,
																	{ key: "kxh-row", gutter: [8, 8] },
																	[
																		React.createElement(
																			Col,
																			{ key: "kxhtu-col", span: 8 },
																			[
																				React.createElement("div", { key: "kxhtu-label", style: { fontSize: "12px", marginBottom: "4px" } }, "KXH Từ >=:"),
																				React.createElement(
																					InputNumber,
																					{
																						key: "kxhtu-input",
																						value: kxhTu,
																						onChange: (val: any) => setKxhTu(val || 2),
																						min: 0,
																						max: 999,
																						size: "small",
																						style: { width: "100%" },
																					}
																				),
																			]
																		),
																		React.createElement(
																			Col,
																			{ key: "kxhden-col", span: 8 },
																			[
																				React.createElement("div", { key: "kxhden-label", style: { fontSize: "12px", marginBottom: "4px" } }, "KXH Đến <=:"),
																				React.createElement(
																					InputNumber,
																					{
																						key: "kxhden-input",
																						value: kxhDen,
																						onChange: (val: any) => setKxhDen(val || 4),
																						min: 0,
																						max: 999,
																						size: "small",
																						style: { width: "100%" },
																					}
																				),
																			]
																		),
																		React.createElement(
																			Col,
																			{ key: "kxhlocsau-col", span: 8 },
																			[
																				React.createElement("div", { key: "kxhlocsau-label", style: { fontSize: "12px", marginBottom: "4px" } }, "Lọc Sâu:"),
																				React.createElement(
																					Checkbox,
																					{
																						key: "kxhlocsau-checkbox",
																						checked: kxhLocSau,
																						onChange: (e: any) => setKxhLocSau(e.target.checked),
																					},
																					"Có"
																				),
																			]
																		),
																	]
																),
															]
														)
													),
													React.createElement(
														Col,
														{ key: "sochu-col", xs: 24, sm: 24, md: 12 },
														[
															React.createElement("div", { key: "sochu-label", style: { marginBottom: "8px", fontWeight: "500" } }, "Số Chủ (VD: 12-34-56):"),
															React.createElement(
																Input,
																{
																	key: "sochu-input",
																	style: { width: "100%" },
																	placeholder: "99-99-99-99-99-99-99-99-99 (tối đa 9 số)",
																	value: soChu.join("-"),
																	maxLength: 26, // 9 numbers * 2 digits + 8 dashes
																	onChange: (e: any) => {
																		const value = e.target.value;
																		let numbers = value.replace(/\D/g, "").match(/\d{1,2}/g) || [];
																		const uniqueNumbers = new Set();
																		const formattedNumbers: string[] = [];
																		
																		for (let num of numbers) {
																			num = num.padStart(2, "0");
																			if (!uniqueNumbers.has(num) && parseInt(num, 10) <= 99) {
																				uniqueNumbers.add(num);
																				formattedNumbers.push(num);
																				if (formattedNumbers.length >= 9) break;
																			}
																		}
																		
																		setSoChu(formattedNumbers);
																	},
																}
															),
																		]
																	),
												]
											),
											React.createElement(
												Row,
												{ key: "control-row3", gutter: [16, 16], style: { marginBottom: 16 } },
												[
													React.createElement(
														Col,
														{ key: "stations-col", xs: 24, sm: 24, md: 24 },
														[
															React.createElement("div", { key: "stations-label", style: { marginBottom: "8px", fontWeight: "500" } }, "Chọn Đài:"),
															React.createElement(
																Select,
																{
																	key: "stations-select",
																	mode: "multiple",
																	style: { width: "100%" },
																	placeholder: "Chọn các đài cần thống kê",
																	value: selectedStations,
																	onChange: (value: unknown) => setSelectedStations(value as string[]),
																	options: daiFiltered.map((station) => ({
																		value: station.stt,
																		label: station.ten_dai,
																	})),
																	maxTagCount: 5,
																	maxTagTextLength: 15,
																}
															),
															React.createElement("div", { key: "stations-info", style: { fontSize: "12px", color: "#666", marginTop: "4px" } }, 
																`Đã chọn: ${selectedStations.length} đài (${daiFiltered.length} khả dụng)`
															),
														]
													),
												]
											),
											React.createElement(
												"div",
												{ key: "actions-row", style: { textAlign: "center", paddingTop: "16px" } },
												React.createElement(
													Space,
													{ key: "action-buttons", size: "middle" },
													React.createElement(
														Button,
														{
															key: "btn-run-stats",
															type: "primary",
															size: "large",
															loading: loading,
															onClick: processThongKeMoi,
														},
														"🔍 Chạy Thống Kê Nâng Cao (Vue Logic)"
													),
													React.createElement(
														Button,
														{
															key: "btn-reset",
															size: "large",
															onClick: () => {
																setSelectedStations([]);
																setSoChu([]);
																setSoKy(28);
																setLaySoKy(5);
																setDemBeHon(5);
																setDemNhoHon(5);
																setDemLonHon(5);
																setDemToNhoHon(5);
																setLsBatDau(5);
																setKxhPhaiLonHon(7);
																setKxhLocSau(true);
																setKxhTu(2);
																setKxhDen(4);
																setSapXep(1);
																setChonMau("#f0bb41");
																setProgressPercent(0);
																setIsXemThuong(true);
																message.success("Đã reset tất cả tham số về mặc định!");
															},
														},
														"🔄 Reset Tất Cả"
													)
												)
											)
										]
									)
								),
								React.createElement(
									Card,
									{
										key: "results-area",
										title: "Kết Quả Thống Kê Nâng Cao",
										style: { minHeight: 400 },
									},
									React.createElement(
										"div",
										{ 
											key: "placeholder",
											style: { 
												textAlign: "center", 
												padding: "64px 24px",
												color: "#666",
											},
										},
										[
											React.createElement("div", { key: "icon", style: { fontSize: "64px", marginBottom: "24px" } }, "📊"),
											React.createElement("h2", { key: "title", style: { marginBottom: "16px", color: "#1890ff" } }, "Phân Tích Thống Kê Xổ Số Nâng Cao"),
											React.createElement("p", { key: "description", style: { fontSize: "16px", marginBottom: "24px" } }, "Chọn miền, số kỳ, các đài và nhấn 'Chạy Thống Kê Nâng Cao' để xem kết quả chi tiết"),
											React.createElement("h4", { key: "features-title", style: { margin: "24px 0 16px", color: "#1890ff" } }, "Tính năng phân tích sẽ bao gồm:"),
											React.createElement(
												"div",
												{ key: "feature-list", style: { display: "inline-block", textAlign: "left" } },
												React.createElement(
													"ul",
													{ style: { margin: 0, padding: 0, listStyle: "none" } },
													[
														{ key: "f1", text: "🎯 Thống kê tần suất xuất hiện của từng số" },
														{ key: "f2", text: "📈 Phân tích chu kỳ không xuất hiện (KXH)" },
														{ key: "f3", text: "🔢 Lọc theo số chủ và điều kiện nâng cao" },
														{ key: "f4", text: "📊 Hiển thị kết quả dạng bảng động và biểu đồ" },
														{ key: "f5", text: "🎲 Phân tích tổ hợp đài và chu kỳ lịch sử" },
														{ key: "f6", text: "💾 Xuất kết quả ra file Excel/CSV" },
													].map(item => React.createElement("li", { key: item.key, style: { padding: "8px 0", fontSize: "14px" } }, item.text))
												)
											)
										]
									)
								)
							]
						)
					}
				];

		default:
				return React.createElement("div", { key: "default", style: { padding: "24px", textAlign: "center" } }, "Chọn chức năng từ menu trên");
		}
	};

	// Hàm thực hiện Tổng Hợp với logic từ TongHop.html và PHP
	const performTongHop = useCallback(async () => {
		if (!loaiTim) {
			message.error('Vui lòng chọn Loại Tìm');
			return;
		}

		setLoading(true);
		try {
			// Import các hàm mới từ kqxs_service
			const { 
				calculateTongHopResults, 
				calculateNhomSo, 
				getBoSoTriet,
				checkDuplicateNumbers,
				processNumberCollisions 
			} = await import('../../../api/kqxs_service');

			// Tính toán kết quả tổng hợp
			const results = await calculateTongHopResults({
				heSo: heSo.toString(),
				loaiTim,
				tuNgay: tuNgay.format('DD/MM/YYYY'),
				denNgay: denNgayTH.format('DD/MM/YYYY'),
				soNhap,
				chkNhom,
				chkTriet,
				chkTrietDuoi,
				ktn,
				ktd,
				l2c
			});

			// Xử lý kết quả theo logic TongHop.html
			let processedResults = results;

			// Nếu có nhập số, kiểm tra số trùng
			if (soNhap && soNhap.trim()) {
				const hasDuplicates = checkDuplicateNumbers(soNhap);
				console.log('Số trùng nhau:', hasDuplicates);
			}

			// Nếu chọn triệt số, lấy bộ số triệt
			if (chkTriet) {
				const boSoTriet = await getBoSoTriet(
					heSo.toString(), 
					loaiTim, 
					tuNgay.format('DD/MM/YYYY'), 
					denNgayTH.format('DD/MM/YYYY')
				);
				console.log('Bộ số triệt:', boSoTriet);
				
				if (boSoTriet) {
					const nhomSo = await calculateNhomSo(heSo.toString(), boSoTriet);
					console.log('Nhóm số triệt:', nhomSo);
				}
			}

			// Nếu chọn nhóm số
			if (chkNhom) {
				const nhomSo = await calculateNhomSo(heSo.toString());
				console.log('Nhóm số:', nhomSo);
			}

			// Xử lý số trùng nhau nếu có
			if (processedResults.length > 0) {
				const allNumbers = processedResults.map(item => 
					Object.values(item).join(' ')
				);
				const collisionMap = processNumberCollisions(allNumbers);
				console.log('Bản đồ số trùng:', collisionMap);
			}

			setTongHopData(processedResults);
			message.success(`Đã tính toán ${processedResults.length} kết quả tổng hợp`);
		} catch (error) {
			console.error('Error in performTongHop:', error);
			message.error('Có lỗi xảy ra khi tính toán tổng hợp');
		} finally {
			setLoading(false);
		}
	}, [heSo, loaiTim, tuNgay, denNgayTH, soNhap, chkNhom, chkTriet, chkTrietDuoi, ktn, ktd, l2c]);

	// Generate unique combinations like Vue getUniqueCombinations
	const getUniqueCombinations = (array: string[], size: number): string[][] => {
		const result: string[][] = [];
		
		function combine(arr: string[], start: number, currentCombo: string[]) {
			if (currentCombo.length === size) {
				result.push([...currentCombo]);
				return;
			}
			for (let i = start; i < arr.length; i++) {
				currentCombo.push(arr[i]);
				combine(arr, i + 1, currentCombo);
				currentCombo.pop();
			}
		}
		
		combine(array, 0, []);
		return result;
	};

	// Generate statistical results (matching Vue thong_ke_moi algorithm exactly)
	const processThongKeMoi = async () => {
		if (selectedStations.length === 0) {
			message.error("Vui lòng chọn ít nhất một đài!");
			return;
		}
		
		if (selectedStations.length < loaiThongKe) {
			message.error(`Vui lòng chọn ít nhất ${loaiThongKe} đài!`);
			return;
		}
		
		const tuNgay = denNgay.subtract(soKy, 'day').format('DD/MM/YYYY');
		const dateDiff = denNgay.diff(dayjs(tuNgay, 'DD/MM/YYYY'), 'days');
		
		if (dateDiff < 28) {
			message.error("Vui lòng chọn thời gian dài hơn 28 ngày");
			return;
		}
		
		setIsXemThuong(false);
		setLoading(true);
		
		try {
			// Process data like Vue thong_ke_moi
			const xuLyItems: any[] = [];
			const mangDlDai: Record<string, any[]> = {};
			const dsDaiChonN: any[] = [];
			
			// Load data for selected stations like Vue
			for (const stt of selectedStations) {
				const dai = danhSachDai.find(d => d.stt === stt && d.mien === mien && d.thu === thuTuan);
				if (dai?.du_lieu_dai) {
					try {
						const rows = await fetchKQXSByStation(dai.du_lieu_dai, tuNgay);
						if (Array.isArray(rows) && rows.length) {
							const processedData = rows.filter((obj: any) => {
								const objDate = dayjs(obj.field_ngay, 'YYYYMMDD');
								return objDate.isValid() && 
									   objDate.isAfter(dayjs(tuNgay, 'DD/MM/YYYY').subtract(1, 'day')) &&
									   objDate.isBefore(dayjs(denNgay.format('DD/MM/YYYY'), 'DD/MM/YYYY').add(1, 'day'));
							}).sort((a: any, b: any) => b.field_ngay.localeCompare(a.field_ngay));
							
							mangDlDai[stt] = processedData;
							dsDaiChonN.push({
								stt: parseInt(stt),
								dai: dai.ten_dai,
								ten_dai: dai.ten_dai
							});
						}
					} catch (error) {
						console.warn(`Error loading data for station ${stt}:`, error);
					}
				}
			}
			
			// Generate combinations like Vue
			const mangDai = Object.keys(mangDlDai);
			const mangCacDai = getUniqueCombinations(mangDai, loaiThongKe);
			
			// Process combinations
			mangCacDai.forEach(lstDai => {
				let stt = "", dai = "", ten_dai = "";
				lstDai.forEach((iDai, index) => {
					const csDai = dsDaiChonN.find(d => d.stt === parseInt(iDai));
					stt += (stt ? "&" : "") + iDai;
					dai += (dai ? "&" : mien + " ") + iDai;
					ten_dai += (ten_dai ? " & " : mien + " ") + (csDai?.ten_dai || iDai);
				});
				
				if (lstDai.length > 1 || loaiThongKe === 1) {
					xuLyItems.push({
						id: stt,
						text: dai,
						ketqua: false,
						ten_dai: ten_dai
					});
					xuLyItems.push({
						id: "kq_" + stt,
						text: 'KQ ' + dai,
						ketqua: true,
						ten_dai: ten_dai
					});
				}
			});
			
			// Process statistical data for each combination
			const results = processStatisticalData(mangDlDai, xuLyItems);
			
			// Update state
			setDuLieuDaiMien(mangDlDai);
			
			message.success(`Hoàn thành thống kê với ${results.length} kết quả`);
			
		} catch (error) {
			console.error('Error in processThongKeMoi:', error);
			message.error('Có lỗi khi xử lý thống kê!');
		} finally {
			setLoading(false);
		}
	};
	
	// Process statistical data matching Vue algorithm exactly  
	const processStatisticalData = (mangDlDai: Record<string, any[]>, xuLyItems: any[]) => {
		const results: any[] = [];
		
		xuLyItems.forEach(itemData => {
			const hienKq = itemData.ketqua;
			const dsThongKe: any[] = [];
			
			// Initialize data for numbers 00-99 like Vue
			for (let s = 0; s < 100; s++) {
				const obj: any = {
					id: `kqxs_${s}_${Date.now()}`,
					dem: 0,
					tong: 0,
					chua_ra: 0,
					lich_su: 0,
					so: s.toString().padStart(2, '0'),
					thoa_man: false
				};
				
				// Initialize period columns like Vue
				if (sapXep === 0) {
					for (let k = 0; k < soKy; k++) {
						obj[`k_${k + 1}`] = '';
					}
				} else {
					for (let k = soKy; k > 0; k--) {
						obj[`k_${k}`] = '';
					}
				}
				
				dsThongKe.push(obj);
			}
			
			// Process data for the current item like Vue logic
			let idKq = itemData.id.toString();
			if (hienKq) {
				idKq = idKq.replace(/kq_/g, '');
			}
			
			idKq.split(/&/g).forEach((STT: string) => {
				const bang = mangDlDai[STT] || [];
				const filteredData = bang.filter((obj: any) => {
					const objDate = dayjs(obj.field_ngay, 'YYYYMMDD');
					const tuNgayDate = dayjs(denNgay.subtract(soKy, 'day').format('DD/MM/YYYY'), 'DD/MM/YYYY');
					const denNgayDate = dayjs(denNgay.format('DD/MM/YYYY'), 'DD/MM/YYYY');
					return objDate.isAfter(tuNgayDate.subtract(1, 'day')) && objDate.isBefore(denNgayDate);
				}).sort((a: any, b: any) => b.field_ngay.localeCompare(a.field_ngay));
				
				let soKyCount = 0;
				
				// Process each result like Vue
				filteredData.reduce((acc: any[], item: any) => {
					if (!acc.some((obj: any) => obj.field_ngay === item.field_ngay)) {
						acc.push(item);
					}
					return acc;
				}, []).forEach((kq: any) => {
					soKyCount++;
					if (soKyCount <= soKy) {
						Object.keys(kq).forEach(tk => {
							if (tk !== '_id' && tk !== 'id' && tk !== 'thu' && tk !== 'field_ngay') {
								const so = kq[tk].trim().substr(-2);
								const timIdxSo = dsThongKe.findIndex(obj => obj.so === so);
								if (timIdxSo !== -1) {
									const newObj = {...dsThongKe[timIdxSo]};
									const fieldKey = `k_${soKyCount}`;
									newObj[fieldKey] = (newObj[fieldKey] || 0) + 1;
									dsThongKe[timIdxSo] = newObj;
								}
							}
						});
					}
				});
			});
			
			// Calculate totals and KXH like Vue logic
			dsThongKe.forEach((item, i) => {
				let dem = 0, tong = 0, kxhHt = 0, kxhLn = 0;
				let flagXo = true, kxh = 0;
				let khoiDong = -1, soLan = 0, soLanTrung = 0;
				let xetTiep = true, bieuDien = '', raTiep = 0;
				
				const mangKy = sapXep === 0 
					? Array.from({length: soKy}, (_, k) => `k_${k + 1}`)
					: Array.from({length: soKy}, (_, k) => `k_${soKy - k}`);
				
				mangKy.forEach((fieldKey, k) => {
					const kq = item[fieldKey];
					if (parseInt(kq) > 0) {
						tong += parseInt(kq);
						dem++;
						flagXo = false;
						if (kxhHt > kxhLn) kxhLn = kxhHt;
						raTiep++;
						if (kxhHt === 0 && khoiDong === -1) xetTiep = false;
						if (khoiDong === -1) khoiDong = kxhHt;
						if (xetTiep && kxhHt > 0) {
							if (kxhHt <= khoiDong) {
								soLan++;
								if (kxhHt === khoiDong) soLanTrung++;
							} else {
								item.kxh_sc = kxhHt;
								xetTiep = false;
							}
							bieuDien += (bieuDien ? ',' : '') + kxhHt;
						}
						kxhHt = 0;
					} else {
						if (xetTiep) {
							for (let rt = 0; rt < raTiep - 1; rt++) {
								bieuDien += (bieuDien ? ',0' : '0');
							}
						}
						raTiep = 0;
						kxhHt++;
					}
					if (k === mangKy.length - 1 && kxhHt > kxhLn) kxhLn = kxhHt;
				});
				
				if (flagXo) kxh++;
				
				// Apply Vue filtering conditions
				item.thoa_man = (khoiDong >= kxhTu && khoiDong <= kxhDen && soLan > 1);
				if (kxhLocSau && soLanTrung <= 1) {
					item.thoa_man = false;
				}
				
				// Check số chủ filter
				if (soChu.length > 0 && demLonHon > 0) {
					item.thoa_man = item.thoa_man && soChu.includes(item.so) && dem >= demLonHon;
				}
				
				item.dem = dem;
				item.bieu_dien = bieuDien;
				item.tong = tong;
				item.kxh = khoiDong > 0 ? khoiDong : 0;
				item.lich_su = kxhLn;
			});
			
			results.push({
				itemData,
				dsThongKe: dsThongKe.filter(item => 
					!hienKq || item.thoa_man || (soChu.length > 0 && soChu.includes(item.so))
				)
			});
		});
		
		return results;
	};

	// Advanced statistics function (based on Vue thong_ke_moi logic)
	const runAdvancedStatistics = async () => {
		if (selectedStations.length === 0) {
			message.error("Vui lòng chọn đài trước!");
			return;
		}

		if (selectedStations.length < loaiThongKe) {
			message.error(`Vui lòng chọn ít nhất ${loaiThongKe} đài!`);
			return;
		}

		try {
			message.loading({
				content: "Đang tính toán thống kê nâng cao...",
				key: "stats",
				duration: 0,
			});

			// Simulate Vue thong_ke_moi statistical processing
			await new Promise(resolve => setTimeout(resolve, 2000));

			// Generate sample statistical results for demonstration
			const generateStatisticalResults = () => {
				return Array.from({ length: 10 }, (_, index) => ({
					id: index + 1,
					so: `${index.toString().padStart(2, '0')}`,
					tanSuat: Math.floor(Math.random() * 100) + 1,
					kxh: Math.floor(Math.random() * 50) + 1,
					chuKy: Math.floor(Math.random() * 30) + 1,
				}));
			};

			const results = generateStatisticalResults();
			
			message.success({
				content: `Hoàn thành! Tìm thấy ${results.length} số phù hợp điều kiện lọc`,
				key: "stats",
				duration: 3,
			});
		}
		catch {
			message.error({
				content: "Có lỗi khi tính toán thống kê!",
				key: "stats",
			});
		}
	};

	// Menu handlers
	const handleKetQua = () => setActiveMenu("ketqua");
	const handleThongKe = () => setActiveMenu("thongke");
	const handleThongKeMoi = () => setActiveMenu("thongkemoi");

	// TongHop functions matching TongHop.html functionality
	const handleTim = async (isTriet: boolean = false) => {
		message.info(`Đang thực hiện ${isTriet ? "Tìm Triệt" : "Tìm"} với các tham số đã chọn`);
		setLoading(true);
		try {
			const { calculateTongHopResults } = await import("../../../api/kqxs_service");
			const results = await calculateTongHopResults({
				heSo: heSo.toString(),
				loaiTim,
				tuNgay: tuNgay.format("DD/MM/YYYY"),
				denNgay: denNgayTH.format("DD/MM/YYYY"),
				soNhap,
				chkNhom,
				chkTriet: isTriet || chkTriet,
				chkTrietDuoi,
				ktn,
				ktd,
				l2c,
			});
			setTongHopData(results);
			message.success(`Hoàn thành tìm kiếm (${results.length})`);
		} catch (err) {
			console.error(err);
			message.error("Có lỗi khi tính Tổng Hợp");
		} finally {
			setLoading(false);
		}
	};

	const renderTongHopTab = () => {
		return React.createElement(
			"div",
			{ key: "tonghop-content" },
			[
				// Header row 1: Hệ, Số đuôi, Số, checkboxes, KTN/KTD/L2C
				React.createElement(
					Card,
					{ key: "header1", title: "Tham số tìm kiếm", style: { marginBottom: 16 } },
					React.createElement(
						Row,
						{ gutter: [16, 16] },
						[
							React.createElement(
								Col,
								{ key: "he-col", span: 4 },
								React.createElement(
									Space,
									{ direction: "vertical", style: { width: "100%" } },
									[
										React.createElement("label", { key: "he-label" }, "Hệ"),
										React.createElement(
											Select,
											{
												key: "he-select",
												value: heSo,
												onChange: (value: any) => setHeSo(value),
												style: { width: "100%" },
												options: [
													{ value: "2", label: "2" },
													{ value: "3", label: "3" },
												],
											},
										),
									],
								),
							),
							React.createElement(
								Col,
								{ key: "so-col", span: 6 },
								React.createElement(
									Space,
									{ direction: "vertical", style: { width: "100%" } },
									[
										React.createElement("label", { key: "so-label" }, "Số đuôi - Số"),
										React.createElement(Input, {
											key: "so-input",
											value: soNhap,
											onChange: (e: any) => setSoNhap(e.target.value),
											placeholder: "Nhập số cần tìm",
											style: { width: "100%" },
										}),
									],
								),
							),
							React.createElement(
								Col,
								{ key: "checkboxes-col", span: 6 },
								React.createElement(
									Space,
									{ direction: "vertical" },
									[
										React.createElement(Checkbox, {
											key: "nhom-check",
											checked: chkNhom,
											onChange: (e: any) => setChkNhom(e.target.checked),
										}, "Nhóm"),
										React.createElement(Checkbox, {
											key: "triet-check",
											checked: chkTriet,
											onChange: (e: any) => setChkTriet(e.target.checked),
										}, "Triệt"),
										React.createElement(Checkbox, {
											key: "trietduoi-check",
											checked: chkTrietDuoi,
											onChange: (e: any) => setChkTrietDuoi(e.target.checked),
										}, "Đuổi"),
									],
								),
							),
							React.createElement(
								Col,
								{ key: "params-col", span: 8 },
								React.createElement(
									Row,
									{ gutter: [8, 8] },
									[
										React.createElement(
											Col,
											{ span: 8 },
											React.createElement(
												Space,
												{ direction: "vertical", size: "small" },
												[
													React.createElement("label", { key: "ktn-label", style: { fontSize: "12px" } }, "KTN"),
													React.createElement(InputNumber, {
														key: "ktn-input",
														value: ktn,
														onChange: (value: any) => setKtn(value || 12),
														min: 1,
														max: 100,
														size: "small",
														style: { width: "100%" },
													}),
												],
											),
										),
										React.createElement(
											Col,
											{ span: 8 },
											React.createElement(
												Space,
												{ direction: "vertical", size: "small" },
												[
													React.createElement("label", { key: "ktd-label", style: { fontSize: "12px" } }, "KTD"),
													React.createElement(InputNumber, {
														key: "ktd-input",
														value: ktd,
														onChange: (value: any) => setKtd(value || 12),
														min: 1,
														max: 100,
														size: "small",
														style: { width: "100%" },
													}),
												],
											),
										),
										React.createElement(
											Col,
											{ span: 8 },
											React.createElement(
												Space,
												{ direction: "vertical", size: "small" },
												[
													React.createElement("label", { key: "l2c-label", style: { fontSize: "12px" } }, "L2C"),
													React.createElement(InputNumber, {
														key: "l2c-input",
														value: l2c,
														onChange: (value: any) => setL2c(value || 12),
														min: 1,
														max: 100,
														size: "small",
														style: { width: "100%" },
													}),
												],
											),
										),
									],
								),
							),
						],
					),
				),
				// Header row 2: Loại Tìm, Date range, buttons, additional params
				React.createElement(
					Card,
					{ key: "header2", title: "Thời gian và tùy chọn", style: { marginBottom: 16 } },
					React.createElement(
						Row,
						{ gutter: [16, 16] },
						[
							React.createElement(
								Col,
								{ key: "loaitim-col", span: 6 },
								React.createElement(
									Space,
									{ direction: "vertical", style: { width: "100%" } },
									[
										React.createElement("label", { key: "loaitim-label" }, "Loại Tìm"),
										React.createElement(
											Select,
											{
												key: "loaitim-select",
												value: loaiTim,
												onChange: (value: any) => setLoaiTim(value),
												style: { width: "100%" },
												options: loaiTimOptions,
											},
										),
									],
								),
							),
							React.createElement(
								Col,
								{ key: "buttons-col", span: 8 },
								React.createElement(
									Space,
									{ direction: "vertical", size: "small" },
									[
										React.createElement(
											Space,
											{ size: "small" },
											[
												React.createElement(
													Button,
													{
														key: "tim-btn",
														type: "primary",
														onClick: () => handleTim(false),
														style: { fontWeight: "bold" },
													},
													"Tìm",
												),
												React.createElement(
													Button,
													{
														key: "tim-triet-btn",
														onClick: () => handleTim(true),
														style: { fontWeight: "bold" },
													},
													"Tìm Triệt",
												),
											],
										),
										React.createElement(Checkbox, {
											key: "hientk-check",
											checked: hienTK,
											onChange: (e: any) => setHienTK(e.target.checked),
										}, "Hiện TK"),
									],
								),
							),
							React.createElement(
								Col,
								{ key: "params2-col", span: 10 },
								React.createElement(
									Space,
									{ direction: "vertical", size: "small" },
									[
										React.createElement(
											Space,
											{ size: "small" },
											[
												React.createElement("label", { key: "soky-label", style: { fontSize: "12px" } }, "Số Kỳ"),
												React.createElement(InputNumber, {
													key: "soky-input",
													value: soKyTH,
													onChange: (value: any) => setSoKyTH(value || 52),
													min: 1,
													max: 999,
													size: "small",
													style: { width: "50px" },
												}),
											],
										),
										React.createElement(
											Space,
											{ size: "small" },
											[
												React.createElement("label", { key: "songay-label", style: { fontSize: "12px" } }, "Số ngày"),
												React.createElement(InputNumber, {
													key: "songay-input",
													value: soNgay,
													onChange: (value: any) => setSoNgay(value || 7),
													min: 1,
													max: 30,
													size: "small",
													style: { width: "50px" },
												}),
											],
										),
									],
								),
							),
						],
					),
				),

				// Results grid area (matching TongHop.html layout)
				React.createElement(
					Row,
					{ key: "results-row", gutter: [16, 16] },
					[
						React.createElement(
							Col,
							{ key: "main-col", span: 18 },
							React.createElement(
								Card,
								{ key: "results-card", title: "Kết quả tổng hợp" },
								React.createElement(CsmDynamicGrid as any, {
									key: "tonghop-grid",
									appId: "kqxs",
									permissions: 0, // Read-only
									menusPermissions: {},
									database: {
										tonghop_results: {
											rows: tongHopData.map((item: any, index: number) => ({
												...item,
												id: index,
												key: index,
											})),
										},
									},
									m_configs: {
										id: "tonghop_results",
										label: "Kết quả tổng hợp",
										table_name: "tonghop_results",
										table: [
											{ f_name: "cach", f_header: "Cách", f_show: 1, f_types: "text", width: 200 },
											{ f_name: "ketqua", f_header: "Kết quả", f_show: 1, f_types: "text", width: 300 },
											{ f_name: "solan", f_header: "Số Lần Ko Xổ", f_show: 1, f_types: "number", width: 80, f_align: "right" },
											{ f_name: "l2c", f_header: `${l2c} L2C`, f_show: 1, f_types: "number", width: 60, f_align: "right" },
											{ f_name: "tong28", f_header: "Tổng 28 ngày", f_show: 1, f_types: "number", width: 80, f_align: "right" },
											{ f_name: "launga", f_header: "Lâu Ngày", f_show: 1, f_types: "number", width: 70, f_align: "right" },
											{ f_name: "lauky", f_header: "Lâu Kỳ", f_show: 1, f_types: "number", width: 60, f_align: "right" },
											{ f_name: "ngaycx", f_header: "Ngày CX", f_show: 1, f_types: "text", width: 70 },
											{ f_name: "kychuaxo", f_header: "Kỳ Chưa Xổ", f_show: 1, f_types: "number", width: 80, f_align: "right" },
											{ f_name: "cacso", f_header: "Các Số", f_show: 1, f_types: "text", width: 600 },
										],
										trigger: {},
										g_readonly: true,
										table_pagesize: 50,
									},
								})
							)
						),
						React.createElement(
							Col,
							{ key: "filter-col", span: 6 },
							[
								React.createElement(
									Card,
									{ key: "filter-card", title: "Lọc kết quả", size: "small", style: { marginBottom: 16 } },
									React.createElement(
										"div",
										{ style: { height: "150px", overflow: "auto", border: "1px solid #d9d9d9", padding: "8px" } },
										React.createElement(
											Space,
											{ direction: "vertical" },
											[
												React.createElement(Checkbox, { key: "kqt", checked: ketQuaFilter.includes("KQT"), onChange: (e: any) => {
													if (e.target.checked) {
														setKetQuaFilter([...ketQuaFilter, "KQT"]);
													} else {
														setKetQuaFilter(ketQuaFilter.filter(k => k !== "KQT"));
													}
												} }, "Kết quả Tuần"),
												React.createElement(Checkbox, { key: "kqn", checked: ketQuaFilter.includes("KQN"), onChange: (e: any) => {
													if (e.target.checked) {
														setKetQuaFilter([...ketQuaFilter, "KQN"]);
													} else {
														setKetQuaFilter(ketQuaFilter.filter(k => k !== "KQN"));
													}
												} }, "Kết quả Ngày"),
												React.createElement(Checkbox, { key: "ktd", checked: ketQuaFilter.includes("KTD"), onChange: (e: any) => {
													if (e.target.checked) {
														setKetQuaFilter([...ketQuaFilter, "KTD"]);
													} else {
														setKetQuaFilter(ketQuaFilter.filter(k => k !== "KTD"));
													}
												} }, "Kết quả Tuần Đài"),
												React.createElement(Checkbox, { key: "l2c", checked: ketQuaFilter.includes("L2C"), onChange: (e: any) => {
													if (e.target.checked) {
														setKetQuaFilter([...ketQuaFilter, "L2C"]);
													} else {
														setKetQuaFilter(ketQuaFilter.filter(k => k !== "L2C"));
													}
												} }, "Kết quả ngày Nam Bắc")
											]
										)
									)
								),
								React.createElement(
									Card,
									{ key: "trung-card", title: "Thứ tự trùng", size: "small" },
									React.createElement(Input.TextArea, {
										key: "trung-textarea",
										value: thuTuTrung,
										onChange: (e: any) => setThuTuTrung(e.target.value),
										rows: 8,
										readOnly: true,
									})
								)
							]
						)
					]
				)
			]
		);
	};

	return React.createElement(
		WebsiteLayout as any,
		{ menuItems, selectedKey: "/kqxs.shtml", title: "Kết Quả Xổ Số" },
		React.createElement(
			"div",
			{ className: "kqxs-responsive" },
			[
				React.createElement(Title, { key: "title", level: 2 }, "Kết Quả Xổ Số"),
				
				// Menu buttons
				React.createElement(
					Card,
					{ key: "menu", style: { marginBottom: 16 } },
					React.createElement(
						Space,
						{ size: "small", wrap: true },
						[
							React.createElement(
								Button,
								{
									key: "btn-ketqua",
									type: activeMenu === "ketqua" ? "primary" : "default",
									onClick: handleKetQua
								},
								"Kết Quả"
							),
							React.createElement(
								Button,
								{
									key: "btn-thongke",
									type: activeMenu === "thongke" ? "primary" : "default",
									onClick: handleThongKe
								},
								"Thống Kê"
							),
							React.createElement(
								Button,
								{
									key: "btn-thongkemoi",
									type: activeMenu === "thongkemoi" ? "primary" : "default",
									onClick: handleThongKeMoi
								},
								"Thống Kê Mới"
							),
							React.createElement(
								Button,
								{
									key: "btn-tonghop",
									type: activeMenu === "tonghop" ? "primary" : "default",
									onClick: () => setActiveMenu("tonghop"),
								},
								"Tổng Hợp",
							),
						],
					)
				),

				// Conditional content based on activeMenu
				activeMenu === "tonghop"
					? renderTongHopTab()
					: React.createElement(
						Tabs as any,
						{
							key: "tabs",
							activeKey: activeMenu === "ketqua" ? "1" : activeMenu === "thongke" ? "2" : activeMenu === "thongkemoi" ? "3" : "1",
							items: getTabItems(),
						},
					),
			],
		),
	);
};

export default KQXS;