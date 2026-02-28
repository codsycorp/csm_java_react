const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["frontend/assets/kqxs_service.D27SQRiP.js","frontend/assets/index.DtMulOe_.js","frontend/assets/react.DVuwCT6o.js","frontend/assets/antd.Cqk3zFLl.js","frontend/assets/index.CxOefl7n.css"])))=>i.map(i=>d[i]);
import{a0 as bt,C as Ke}from"./index.DtMulOe_.js";import{a as o,R as e}from"./react.DVuwCT6o.js";import{i as z,N as v,z as ua,bu as _,S as u,B as C,Y as ka,V as b,W as d,a2 as N,a3 as fe,a7 as X,ab as Q,af as vt,a9 as fa}from"./antd.Cqk3zFLl.js";import{fetchKQXSByStation as Ce,fetchLoaiTim as pa,fetchTableData as ya,fetchKQXSStationsWithFilter as xa}from"./kqxs_service.D27SQRiP.js";import{u as ba,W as va}from"./WebsiteLayout.C3vVgTJl.js";const{Title:_a}=ua;z.locale("vi");const Ea=`
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
`;if(typeof document<"u"&&!document.getElementById("kqxs-responsive-styles")){const ee=document.createElement("style");ee.id="kqxs-responsive-styles",ee.textContent=Ea,document.head.appendChild(ee)}const Fa=()=>{const ee=ba(),[E,_t]=o.useState(z()),[de,qa]=o.useState(z().subtract(1,"year")),[h,pe]=o.useState("MN"),[y,De]=o.useState(""),[D,ye]=o.useState(52),[xe,be]=o.useState(1),[ve,_e]=o.useState(30),[H,Me]=o.useState([]),[q,Et]=o.useState([]),[Qe,wa]=o.useState([]),[F,w]=o.useState(!1),[S,ze]=o.useState([]),[G,qt]=o.useState([]),[$,Ee]=o.useState([]),[Sa,wt]=o.useState("#f0bb41"),[te,I]=o.useState(0),[St,V]=o.useState(""),[Tt,Nt]=o.useState(!0),[Kt,Ct]=o.useState(52),[Dt,Mt]=o.useState(7),[M,R]=o.useState(["KQT"]),[Qt,zt]=o.useState("Có số nào trùng"),[$t,$e]=o.useState([]),[B,me]=o.useState("ketqua"),[Yt,Ye]=o.useState(5),[ae,Xe]=o.useState([]),[Ta,Na]=o.useState("MN"),[ne,He]=o.useState([]),[U,Be]=o.useState(2),[Ka,Xt]=o.useState(5),[Ca,Ht]=o.useState(5),[Le,Bt]=o.useState(5),[Da,Lt]=o.useState(5),[Ma,At]=o.useState(5),[Qa,It]=o.useState(7),[qe,we]=o.useState(!0),[Se,Ae]=o.useState(1),[za,$a]=o.useState(!1),[Ie,Ve]=o.useState({}),[Ya,Xa]=o.useState([]),[Ha,Re]=o.useState(!0),[Ba,La]=o.useState([]),[Vt,Rt]=o.useState(""),[L,Ot]=o.useState(1),[O,Te]=o.useState(""),[he,Aa]=o.useState(z()),[W,Pt]=o.useState(""),[ie,jt]=o.useState(!1),[le,Wt]=o.useState(!1),[ge,Ft]=o.useState(!1),[Ia,Va]=o.useState(""),[ue,Gt]=o.useState(12),[ke,Ut]=o.useState(12),[oe,Jt]=o.useState(12),Zt=[{ma:"T2",ten:"Thứ 2"},{ma:"T3",ten:"Thứ 3"},{ma:"T4",ten:"Thứ 4"},{ma:"T5",ten:"Thứ 5"},{ma:"T6",ten:"Thứ 6"},{ma:"T7",ten:"Thứ 7"},{ma:"CN",ten:"Chủ Nhật"}],ea=a=>{const t=Zt.find(n=>n.ma===a);return t?t.ten:""},Oe=a=>{if(!a||a.length!==8)return a||"";const t=a.substr(0,4),n=a.substr(4,2);return`${a.substr(6,2)}/${n}/${t}`},ta=a=>{console.warn("KQXS transformToVueStructure - Input rows:",a);const t=a.map(n=>(console.warn("KQXS transformToVueStructure - Processing row:",{du_lieu_dai:n.du_lieu_dai,field_ngay:n.field_ngay,ten_dai:n.ten_dai,hasFieldDau:!!n.field_dau,hasFieldSo2:!!n.field_so2}),{ten_dai:n.ten_dai,thu:n.thu,mien:n.mien,du_lieu_dai:n.du_lieu_dai,stt:n.stt,ngay:n.ngay,field_ngay:n.field_ngay,uniqueKey:n.uniqueKey,data:{field_duoi:n.field_dau,field_so17:n.field_so2,field_so26:n.field_so26,field_so16:n.field_so3,field_so24:n.field_so24,field_so25:n.field_so25,field_so15:n.field_so4,field_so14:n.field_so5,field_so18:n.field_so18,field_so19:n.field_so19,field_so20:n.field_so20,field_so21:n.field_so21,field_so22:n.field_so22,field_so23:n.field_so23,field_so13:n.field_so6,field_so12:n.field_so7,field_so11:n.field_so8,field_so10:n.field_so9,...Object.fromEntries(Object.entries(n).filter(([i])=>i.startsWith("field_")))}}));return console.warn("KQXS transformToVueStructure - Output result:",t),t},aa=a=>{console.warn("KQXS createHangChucDonViTable - Input:",a);const t=[];for(let n=0;n<10;n++){const i={id:`kqxs_${n}_${Date.now()}`,chuc:n};t.push(i)}return a.forEach(n=>{const i=n.stt,l=n.data;for(let r=0;r<10;r++)t[r][`dai_${i}`]="";Object.keys(l).forEach(r=>{if(r!=="_id"&&r!=="id"&&r!=="thu"&&r!=="field_ngay"&&l[r]){const c=l[r].toString().trim();if(c&&c.length>=2){const s=parseInt(c.substr(c.length-2,1)),p=c.substr(c.length-1,1);if(!isNaN(s)&&s>=0&&s<=9){const m=t.findIndex(k=>k.chuc===s);if(m!==-1){const k=t[m][`dai_${i}`];t[m][`dai_${i}`]=k+(k!==""?",":"")+p}}}}})}),console.warn("KQXS createHangChucDonViTable - Output:",t),t},[Pe,je]=o.useState([]);o.useEffect(()=>{(async()=>{try{const n=(await pa(L.toString())||[]).map(i=>({value:i.MaLoai,label:i.MoTa||i.MaLoai}));je(n),n.length>0&&!n.some(i=>i.value===O)&&Te(n[0].value)}catch(t){console.warn("Lỗi khi tải options Loại Tìm:",t),je([])}})()},[L]);const[We,Ne]=o.useState([]);o.useEffect(()=>{try{if(G.length>0){const a=ta(G);Ee(a);const t=aa(a);Ne(t),console.warn("KQXS - Transformed data:",a),console.warn("KQXS - Hang chuc don vi data:",t),console.warn("KQXS - ✅ Đã tạo bảng hàng chục đơn vị với",t.length,"hàng")}else Ee([]),Ne([])}catch(a){console.error("KQXS - Error transforming data:",a),Ee([]),Ne([])}},[G]);const A=o.useMemo(()=>h?q.filter(a=>a.mien===h&&(!y||a.thu===y)).sort((a,t)=>Number(a.stt)-Number(t.stt)):[],[q,h,y]);o.useEffect(()=>{let a=!0;return(async()=>{try{w(!0),console.warn("KQXS: Starting to load stations...");const n=await ya("kqxs_lichxoso",{field:"id",type:"like",value:""},"kqxs");if(console.warn("KQXS: All stations loaded:",n.length),n.length>0&&(console.warn("KQXS: First station structure:",JSON.stringify(n[0],null,2)),console.warn("KQXS: First station fields:",Object.keys(n[0]))),console.warn("KQXS: Raw stations loaded:",n.length,n.slice(0,3)),!a)return;const i=n.sort((c,s)=>{const p=`${c.mien}_${c.thu}_${c.stt}`,m=`${s.mien}_${s.thu}_${s.stt}`;return p.localeCompare(m)});console.warn("KQXS: Sorted stations:",i.length,i.slice(0,3)),Et(i||[]);const l=z().day(),r=["CN","T2","T3","T4","T5","T6","T7"];console.warn("KQXS: Setting thuTuan to:",r[l],"for day:",l),De(r[l])}catch(n){console.error("Error fetching KQXS stations:",n),v.error(`Không thể tải danh sách đài! Lỗi: ${n}`)}finally{a&&w(!1)}})(),()=>{a=!1}},[]),o.useEffect(()=>{if(E){const a=E.day(),n=["CN","T2","T3","T4","T5","T6","T7"][a];n!==y&&De(n)}},[E]),o.useEffect(()=>{(async()=>{if(!(!h||!y))try{console.warn(`KQXS: Loading optimized stations for ${h}-${y}...`);const t=await xa({mien:h,thu:y});console.warn("KQXS: Optimized stations loaded:",t.length,t.slice(0,3)),t&&t.length>0}catch(t){console.warn("KQXS: Error loading optimized stations:",t)}})()},[h,y]),o.useEffect(()=>{if(console.warn(`KQXS: Region/Day changed to ${h}-${y}, checking existing selections`),S.length>0){const a=S.filter(t=>{const n=q.find(i=>i.du_lieu_dai===t);return n&&n.mien===h&&n.thu===y});a.length!==S.length&&(console.warn(`KQXS: Filtering selections from ${S.length} to ${a.length} valid selections`),ze(a))}if(H.length>0){const a=H.filter(t=>{const n=q.find(i=>i.stt===t);return n&&n.mien===h&&n.thu===y});a.length!==H.length&&(console.warn(`KQXS: Filtering thongke selections from ${H.length} to ${a.length} valid selections`),Me(a))}},[h,y,q.length]),o.useEffect(()=>{console.warn("KQXS: === STATION SELECTION DEBUG ==="),console.warn("KQXS: Selected stations for xemKetQua (du_lieu_dai):",S),console.warn("KQXS: Filtered stations count:",A.length),console.warn("KQXS: All stations count:",q.length),console.warn("KQXS: Current filters:",{mien:h,thuTuan:y}),console.warn("KQXS: Display results count:",$.length),console.warn("KQXS: Available stations for current filter:",A.map(a=>`${a.du_lieu_dai}: ${a.ten_dai} [${a.mien}-${a.thu}]`).slice(0,10)),S.length>0&&(console.warn("KQXS: === SELECTED STATIONS ANALYSIS ==="),S.forEach((a,t)=>{const n=q.find(i=>i.du_lieu_dai===a);if(n){const i=n.mien===h&&n.thu===y;console.warn(`KQXS: [${t+1}] "${a}": ${n.ten_dai} [${n.mien}-${n.thu}] ${i?"✓ MATCH":"✗ MISMATCH"}`)}else console.warn(`KQXS: [${t+1}] "${a}": NOT FOUND IN DATABASE`)})),console.warn("KQXS: === END DEBUG ===")},[S,A,q.length,h,y,$.length]);const na=o.useCallback(async()=>{w(!0),I(0),V("Đang cập nhật...");try{const a=E.format("DD-MM-YYYY");let t=0;const n=3,i=(l,r)=>{const c=Math.round(l/n*100);I(c),V(r)};i(1,"Đang cập nhật Miền Nam..."),await new Promise(l=>setTimeout(l,1e3)),i(2,"Đang cập nhật Miền Trung..."),await new Promise(l=>setTimeout(l,1e3)),i(3,"Đang cập nhật Miền Bắc..."),await new Promise(l=>setTimeout(l,1e3)),I(100),V("Hoàn thành!"),v.success("Đã cập nhật xong kết quả"),setTimeout(()=>{I(0),V("")},2e3)}catch(a){console.error("Error updating results:",a),v.error("Lỗi khi cập nhật kết quả"),I(0),V("Lỗi!")}finally{w(!1)}},[E]),ia=o.useCallback(async()=>{w(!0);try{console.log("Running thống kê mới..."),I(0),V("Đang xử lý thống kê mới...");for(let a=0;a<=100;a+=10)I(a),V(`Đang xử lý: ${a}%`),await new Promise(t=>setTimeout(t,200));V("Hoàn thành thống kê mới!"),v.success("Thống kê mới đã hoàn thành")}catch(a){console.error("Error in thống kê mới:",a),v.error("Lỗi khi chạy thống kê mới")}finally{w(!1)}},[]),la=o.useCallback(async()=>{if(H.length!==0){w(!0);try{const a=[];for(const t of H){const n=q.find(i=>i.stt===t);if(n!=null&&n.du_lieu_dai)try{const i=await Ce(n.du_lieu_dai,E.subtract(D,"day").format("DD/MM/YYYY"));Array.isArray(i)&&i.length&&a.push(...i)}catch{}}Ve(a),a.length&&console.warn("Thống kê data:",a)}catch{v.error("Có lỗi khi chạy thống kê!")}finally{w(!1)}}},[H,q,E,D]),Fe=o.useCallback(async()=>{if(S.length===0){v.warning("Vui lòng chọn ít nhất một đài!");return}console.warn("KQXS xemKetQua - Selected stations (du_lieu_dai):",S),console.warn("KQXS xemKetQua - Date:",E.format("DD/MM/YYYY")),console.warn("KQXS xemKetQua - Current filters:",{mien:h,thuTuan:y}),console.warn("KQXS xemKetQua - Available filtered stations:",A.length);const a=S.filter(n=>q.find(l=>l.du_lieu_dai===n));if(a.length===0){v.error("Không tìm thấy đài đã chọn trong danh sách!");return}const t=S.filter(n=>{const i=q.find(l=>l.du_lieu_dai===n);return i&&(i.mien!==h||i.thu!==y)});if(t.length>0){const n=t.map(i=>{const l=q.find(r=>r.du_lieu_dai===i);return l?`${l.ten_dai} (${l.mien}-${l.thu})`:i}).join(", ");console.warn(`KQXS: Một số đài không phù hợp với ${h}-${y}:`,n),v.warning(`Lưu ý: ${t.length} đài có thể không có kết quả cho ${h}-${y}: ${n}`)}w(!0);try{const n=[];for(const i of a){const l=q.find(r=>r.du_lieu_dai===i);if(console.warn(`KQXS xemKetQua - Processing du_lieu_dai="${i}":`,l),!l){console.error(`KQXS xemKetQua - Station not found: du_lieu_dai="${i}"`);continue}if((l.mien!==h||l.thu!==y)&&console.warn(`KQXS xemKetQua - Station mismatch: ${l.ten_dai} is ${l.mien}-${l.thu}, searching for ${h}-${y} data anyway`),!l.du_lieu_dai){console.error(`KQXS xemKetQua - No du_lieu_dai for station: ${l.ten_dai}`);continue}try{console.warn(`KQXS xemKetQua - Fetching data for ${l.ten_dai} (${l.du_lieu_dai}) [${l.mien}-${l.thu}]`);const r=await Ce(l.du_lieu_dai,E.format("DD/MM/YYYY"));if(console.warn(`KQXS xemKetQua - Received ${(r==null?void 0:r.length)||0} rows for ${l.ten_dai}`),Array.isArray(r)&&r.length){const c=r.map((s,p)=>({...s,ten_dai:l.ten_dai,thu:l.thu,mien:l.mien,du_lieu_dai:l.du_lieu_dai,stt:l.stt,ngay:Oe(s.field_ngay),uniqueKey:`${l.stt||l.du_lieu_dai}-${s.field_ngay}-${p}`}));n.push(...c)}}catch(r){console.error(`KQXS xemKetQua - Error fetching data for ${l.ten_dai}:`,r)}}console.warn(`KQXS xemKetQua - Total rows collected: ${n.length}`),qt(n),n.length===0&&v.warning("Không tìm thấy kết quả cho ngày đã chọn!")}catch(n){console.error("KQXS xemKetQua - Error:",n),v.error("Có lỗi khi xem kết quả!")}finally{w(!1)}},[S,q,E,h,y,A.length]);e.useCallback(({label:a,numbers:t})=>{const n=(t||[]).filter(Boolean),i={display:"flex",alignItems:"center",marginBottom:"8px"},l={width:"100px",fontWeight:"bold",color:"#1890ff"},r={padding:"2px 8px",margin:"0 4px",backgroundColor:"#f6ffed",border:"1px solid #b7eb8f",borderRadius:"4px",fontFamily:"monospace",fontSize:"14px"};return e.createElement("div",{style:i},[e.createElement("div",{key:"label",style:l},a),e.createElement("div",{key:"numbers",style:{display:"flex",flexWrap:"wrap",alignItems:"center"}},n.length?n.map((c,s)=>e.createElement("span",{key:c+"-"+s,style:r},c)):e.createElement("span",{key:"empty",style:{color:"#999"}},"---"))])},[]);const oa=()=>{const{t:a}=require("react-i18next").useTranslation();switch(B){case"ketqua":return[{key:"1",label:a("website.services.kqxs.title"),children:e.createElement("div",null,[e.createElement(_,{key:"controls",title:a("website.services.kqxs.select_station_date")},[e.createElement(b,{key:"row1",gutter:[8,8]},[e.createElement(d,{key:"col1",xs:24,sm:12,md:8},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"label"},a("website.services.kqxs.region")),e.createElement(N,{key:"mien-select",value:h,onChange:t=>pe(t),style:{width:"100%"},options:[{value:"MN",label:"Miền Nam"},{value:"MT",label:"Miền Trung"},{value:"MB",label:"Miền Bắc"}]})])),e.createElement(d,{key:"col2",xs:24,sm:12,md:8},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"label"},a("website.services.kqxs.day")),e.createElement(N,{key:"thu-select",value:y,disabled:!0,placeholder:"Chọn thứ",style:{width:"100%"},options:[{value:"T2",label:"Thứ 2"},{value:"T3",label:"Thứ 3"},{value:"T4",label:"Thứ 4"},{value:"T5",label:"Thứ 5"},{value:"T6",label:"Thứ 6"},{value:"T7",label:"Thứ 7"},{value:"CN",label:"Chủ Nhật"}]})])),e.createElement(d,{key:"col3",xs:24,sm:12,md:8},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"label"},a("website.services.kqxs.view_date")),e.createElement(fa,{key:"date-picker",value:E,onChange:t=>t&&_t(t),style:{width:"100%"},format:"DD/MM/YYYY"})]))]),e.createElement(b,{key:"row2",style:{marginTop:16}},e.createElement(d,{key:"col",span:24},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"label"},a("website.services.kqxs.select_station")),e.createElement(N,{key:"dai-select",mode:"multiple",value:S,onChange:t=>ze(t),placeholder:"Chọn các đài cần xem",style:{width:"100%"},options:A.map(t=>({value:t.du_lieu_dai,label:t.ten_dai}))})]))),e.createElement(b,{key:"row3",style:{marginTop:16}},e.createElement(d,{key:"col",span:24},e.createElement(u,{wrap:!0},[e.createElement(C,{key:"submit",type:"primary",onClick:Fe,loading:F,disabled:S.length===0},a("website.services.kqxs.view_result")),e.createElement(C,{key:"update",type:"default",onClick:na,loading:F,style:{marginLeft:8}},a("website.services.kqxs.update_result"))])))]),e.createElement("style",{key:"kqxs-styles"},`
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
									`),$.length>0?e.createElement("div",{key:"ket-qua",className:"kqxs"},e.createElement("div",{className:"box_kqxs"},e.createElement("div",{key:"lottery-results-container",style:{display:"grid",gridTemplateColumns:$.length===1?"1fr":$.length===2?"1fr 1fr":$.length===3?"1fr 1fr 1fr":"repeat(auto-fit, minmax(320px, 1fr))",gap:"16px",padding:"16px"}},$.map((t,n)=>{var i,l,r,c,s,p,m,k,g,f,x,T,K,Y,P,J,se,Z,j,re,ce,Ue,Je,Ze,et,tt,at,nt,it,lt,ot,st,rt,ct,dt,mt,ht,gt,ut,kt,ft,pt,yt,xt;return e.createElement("div",{key:t.uniqueKey||`${t.stt||"unknown"}-${t.field_ngay}-${n}`,className:`${h==="MB"?"bkqtinhmienbac":"bkqtinhmiennam"} lottery-card`,style:{border:"1px solid #999",borderRadius:"4px",overflow:"hidden",backgroundColor:"#fff",boxShadow:"0 2px 8px rgba(0,0,0,0.1)"}},e.createElement("div",{className:"box_kqxs_content card"},[e.createElement("div",{key:"header",className:"card-header"},[e.createElement("div",{key:"title",className:"card-title"},`${t.ten_dai||""}`),e.createElement("div",{key:"date",style:{fontSize:"12px",marginTop:"4px"}},`${ea(t.thu||"")} - ${t.ngay||Oe(t.field_ngay)}`)]),e.createElement("div",{key:"body",className:"card-body p-0"},[e.createElement(b,{key:"giai-db",className:"row"},[e.createElement("div",{key:"label",className:"giaidbl col-3 p-0"},a("website.services.kqxs.prize_db")),e.createElement("div",{key:"number",className:"giaidb col-9 p-0"},e.createElement("div",{className:"giaiSo"},e.createElement("span",{style:{marginTop:"15px",display:"inline-block"}},((i=t.data)==null?void 0:i.field_duoi)||"")))]),e.createElement(b,{key:"giai-1",className:"row bg-gray"},[e.createElement("div",{key:"label",className:"giai1l col-3 p-0"},a("website.services.kqxs.prize_1")),e.createElement("div",{key:"numbers",className:"giai1 col-9 p-0"},h!=="MB"?e.createElement("div",{className:"giaiSo"},((l=t.data)==null?void 0:l.field_so17)||""):e.createElement("div",{className:"giaiSo"},((r=t.data)==null?void 0:r.field_so26)||""))]),e.createElement(b,{key:"giai-2",className:"row"},[e.createElement("div",{key:"label",className:"giai2l col-3 p-0"},a("website.services.kqxs.prize_2")),e.createElement("div",{key:"numbers",className:"giai2 col-9 p-0"},h!=="MB"?e.createElement("div",{className:"giaiSo"},((c=t.data)==null?void 0:c.field_so16)||""):[e.createElement("div",{key:"1",className:"giaiSo"},((s=t.data)==null?void 0:s.field_so24)||""),e.createElement("div",{key:"2",className:"giaiSo"},((p=t.data)==null?void 0:p.field_so25)||"")])]),e.createElement(b,{key:"giai-3",className:"row bg-gray"},[e.createElement("div",{key:"label",className:"giai3l col-3 p-0"},a("website.services.kqxs.prize_3")),e.createElement("div",{key:"numbers",className:"giai3 col-9 p-0"},h!=="MB"?[e.createElement("div",{key:"1",className:"giaiSo"},((m=t.data)==null?void 0:m.field_so15)||""),e.createElement("div",{key:"2",className:"giaiSo"},((k=t.data)==null?void 0:k.field_so14)||"")]:[e.createElement("div",{key:"1",className:"giaiSo"},((g=t.data)==null?void 0:g.field_so18)||""),e.createElement("div",{key:"2",className:"giaiSo"},((f=t.data)==null?void 0:f.field_so19)||""),e.createElement("div",{key:"3",className:"giaiSo"},((x=t.data)==null?void 0:x.field_so20)||""),e.createElement("div",{key:"4",className:"giaiSo"},((T=t.data)==null?void 0:T.field_so21)||""),e.createElement("div",{key:"5",className:"giaiSo"},((K=t.data)==null?void 0:K.field_so22)||""),e.createElement("div",{key:"6",className:"giaiSo"},((Y=t.data)==null?void 0:Y.field_so23)||"")])]),e.createElement(b,{key:"giai-4",className:"row"},[e.createElement("div",{key:"label",className:"giai4l col-3 p-0"},a("website.services.kqxs.prize_4")),e.createElement("div",{key:"numbers",className:"giai4 col-9 p-0"},h!=="MB"?[e.createElement("div",{key:"1",className:"giaiSo"},((P=t.data)==null?void 0:P.field_so13)||""),e.createElement("div",{key:"2",className:"giaiSo"},((J=t.data)==null?void 0:J.field_so12)||""),e.createElement("div",{key:"3",className:"giaiSo"},((se=t.data)==null?void 0:se.field_so11)||""),e.createElement("div",{key:"4",className:"giaiSo"},((Z=t.data)==null?void 0:Z.field_so10)||""),e.createElement("div",{key:"5",className:"giaiSo"},((j=t.data)==null?void 0:j.field_so9)||""),e.createElement("div",{key:"6",className:"giaiSo"},((re=t.data)==null?void 0:re.field_so8)||""),e.createElement("div",{key:"7",className:"giaiSo"},((ce=t.data)==null?void 0:ce.field_so7)||"")]:[e.createElement("div",{key:"1",className:"giaiSo"},((Ue=t.data)==null?void 0:Ue.field_so14)||""),e.createElement("div",{key:"2",className:"giaiSo"},((Je=t.data)==null?void 0:Je.field_so15)||""),e.createElement("div",{key:"3",className:"giaiSo"},((Ze=t.data)==null?void 0:Ze.field_so16)||""),e.createElement("div",{key:"4",className:"giaiSo"},((et=t.data)==null?void 0:et.field_so17)||"")])]),e.createElement(b,{key:"giai-5",className:"row bg-gray"},[e.createElement("div",{key:"label",className:"giai5l col-3 p-0"},a("website.services.kqxs.prize_5")),e.createElement("div",{key:"numbers",className:"giai5 col-9 p-0"},h!=="MB"?e.createElement("div",{className:"giaiSo"},((tt=t.data)==null?void 0:tt.field_so6)||""):[e.createElement("div",{key:"1",className:"giaiSo"},((at=t.data)==null?void 0:at.field_so8)||""),e.createElement("div",{key:"2",className:"giaiSo"},((nt=t.data)==null?void 0:nt.field_so9)||""),e.createElement("div",{key:"3",className:"giaiSo"},((it=t.data)==null?void 0:it.field_so10)||""),e.createElement("div",{key:"4",className:"giaiSo"},((lt=t.data)==null?void 0:lt.field_so11)||""),e.createElement("div",{key:"5",className:"giaiSo"},((ot=t.data)==null?void 0:ot.field_so12)||""),e.createElement("div",{key:"6",className:"giaiSo"},((st=t.data)==null?void 0:st.field_so13)||"")])]),e.createElement(b,{key:"giai-6",className:"row"},[e.createElement("div",{key:"label",className:"giai6l col-3 p-0"},a("website.services.kqxs.prize_6")),e.createElement("div",{key:"numbers",className:"giai6 col-9 p-0"},h!=="MB"?[e.createElement("div",{key:"1",className:"giaiSo"},((rt=t.data)==null?void 0:rt.field_so5)||""),e.createElement("div",{key:"2",className:"giaiSo"},((ct=t.data)==null?void 0:ct.field_so4)||""),e.createElement("div",{key:"3",className:"giaiSo"},((dt=t.data)==null?void 0:dt.field_so3)||"")]:[e.createElement("div",{key:"1",className:"giaiSo"},((mt=t.data)==null?void 0:mt.field_so5)||""),e.createElement("div",{key:"2",className:"giaiSo"},((ht=t.data)==null?void 0:ht.field_so6)||""),e.createElement("div",{key:"3",className:"giaiSo"},((gt=t.data)==null?void 0:gt.field_so7)||"")])]),e.createElement(b,{key:"giai-7",className:"row bg-gray"},[e.createElement("div",{key:"label",className:"giai7l col-3 p-0"},a("website.services.kqxs.prize_7")),e.createElement("div",{key:"numbers",className:"giai7 col-9 p-0"},h!=="MB"?e.createElement("div",{className:"giaiSo"},((ut=t.data)==null?void 0:ut.field_so2)||""):[e.createElement("div",{key:"1",className:"giaiSo"},((kt=t.data)==null?void 0:kt.field_dau)||""),e.createElement("div",{key:"2",className:"giaiSo"},((ft=t.data)==null?void 0:ft.field_so2)||""),e.createElement("div",{key:"3",className:"giaiSo"},((pt=t.data)==null?void 0:pt.field_so3)||""),e.createElement("div",{key:"4",className:"giaiSo"},((yt=t.data)==null?void 0:yt.field_so4)||"")])]),h!=="MB"?e.createElement(b,{key:"giai-8",className:"row"},[e.createElement("div",{key:"label",className:"giai8l col-3 p-0"},a("website.services.kqxs.prize_8")),e.createElement("div",{key:"numbers",className:"giai8 col-9 p-0"},e.createElement("div",{className:"giaiSo"},((xt=t.data)==null?void 0:xt.field_dau)||""))]):null].filter(Boolean))]))})))):null,We.length>0&&e.createElement(_,{key:"hang-chuc-don-vi",title:"Kết quả theo hàng chục và đơn vị",style:{marginTop:"20px"}},e.createElement("div",{className:"xu-ly-ket-qua"},[e.createElement("div",{key:"header",className:"table-responsive"},e.createElement("table",{className:"table table-bordered table-striped"},[e.createElement("thead",{key:"thead"},e.createElement("tr",null,[e.createElement("th",{key:"hang-chuc",className:"text-center"},"Hàng chục"),...$.map((t,n)=>e.createElement("th",{key:`dai-${n}`,className:"text-center"},t.ten_dai||`Đài ${n+1}`))])),e.createElement("tbody",{key:"tbody"},We.map((t,n)=>e.createElement("tr",{key:`row-${n}`},[e.createElement("td",{key:"digit",className:"text-center font-weight-bold tanso_hangchuc"},t.chuc),...$.map((i,l)=>{const r=`dai_${i.stt}`,c=t[r]||"";return e.createElement("td",{key:`cell-${l}`,className:"text-center tanso_hangdonvi"},c||"-")})])))]))])),G.length>0&&$.length===0&&e.createElement(_,{key:"no-results",title:"Đang xử lý dữ liệu...",style:{padding:"20px",textAlign:"center"}},e.createElement("div",{style:{color:"#666"}},`Đã tải ${G.length} bản ghi...`)),!G.length&&e.createElement(_,{key:"empty",title:"Chưa có kết quả",style:{padding:"20px",textAlign:"center",color:"#999"}},e.createElement("div",null,"Vui lòng chọn đài và ngày để xem kết quả."))].filter(Boolean))}];case"thongke":return[{key:"2",label:"Thống kê lô tô",children:e.createElement("div",null,[e.createElement(_,{key:"controls",title:"Cài đặt thống kê"},[e.createElement(b,{key:"row1",gutter:[16,16]},[e.createElement(d,{key:"col1",xs:24,sm:12,md:6},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"label"},"Miền:"),e.createElement(N,{key:"mien-select",value:h,onChange:t=>pe(t),style:{width:"100%"},options:[{value:"MN",label:"Miền Nam"},{value:"MT",label:"Miền Trung"},{value:"MB",label:"Miền Bắc"}]})])),e.createElement(d,{key:"col2",xs:24,sm:12,md:6},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"label"},"Thứ:"),e.createElement(N,{key:"thu-select",value:y,disabled:!0,placeholder:"Chọn thứ",style:{width:"100%"},options:[{value:"T2",label:"Thứ 2"},{value:"T3",label:"Thứ 3"},{value:"T4",label:"Thứ 4"},{value:"T5",label:"Thứ 5"},{value:"T6",label:"Thứ 6"},{value:"T7",label:"Thứ 7"},{value:"CN",label:"Chủ Nhật"}]})])),e.createElement(d,{key:"col4",span:12},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"label"},"Số kỳ:"),e.createElement(Q,{key:"so-ky",value:D,onChange:t=>t&&ye(t),min:1,max:365,style:{width:"100%"}})]))]),e.createElement(b,{key:"row2",gutter:[16,16],style:{marginTop:16}},[e.createElement(d,{key:"col1",span:6},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"label"},"KXH từ:"),e.createElement(Q,{key:"kxh-tu",value:xe,onChange:t=>t&&be(t),min:1,max:999,style:{width:"100%"}})])),e.createElement(d,{key:"col2",span:6},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"label"},"KXH đến:"),e.createElement(Q,{key:"kxh-den",value:ve,onChange:t=>t&&_e(t),min:1,max:999,style:{width:"100%"}})])),e.createElement(d,{key:"col3",span:12},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"label"},"Chọn đài:"),e.createElement(N,{key:"dai-select",mode:"multiple",value:H,onChange:t=>Me(t),placeholder:"Chọn các đài cần thống kê",style:{width:"100%"},options:A.map(t=>({value:t.stt,label:t.ten_dai}))})]))]),e.createElement(b,{key:"row-progress",gutter:[8,8],style:{marginTop:16}},e.createElement(d,{key:"col",span:24},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"label"},"Tiến trình:"),e.createElement(vt,{key:"progress-bar",percent:te,status:te===100?"success":"active",strokeColor:"#52c41a",format:()=>St})]))),e.createElement(b,{key:"row-advanced1",gutter:[16,16],style:{marginTop:16}},[e.createElement(d,{key:"col1",xs:24,sm:12,md:6},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"label"},"Loại Thống Kê:"),e.createElement(N,{key:"loai-tk",value:U,onChange:t=>Be(t),style:{width:"100%"},options:[{value:"thongke_basic",label:"Thống kê cơ bản"},{value:"thongke_advanced",label:"Thống kê nâng cao"},{value:"thongke_full",label:"Thống kê đầy đủ"}]})])),e.createElement(d,{key:"col2",xs:24,sm:12,md:6},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"label"},"Loại Tìm:"),e.createElement(N,{key:"loai-tim",value:O,onChange:t=>Te(t),style:{width:"100%"},options:Pe})])),e.createElement(d,{key:"col3",xs:24,sm:12,md:6},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"label"},"Tìm Số Chủ:"),e.createElement(fe,{key:"so-chu",value:Vt,onChange:t=>Rt(t.target.value),placeholder:"Nhập số chủ",style:{width:"100%"}})])),e.createElement(d,{key:"col4",xs:24,sm:12,md:6},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"label"},"Lọc Sâu:"),e.createElement(X,{key:"kxh-locsau",checked:qe,onChange:t=>we(t.target.checked)},"Bật lọc sâu")]))]),e.createElement(b,{key:"row3",style:{marginTop:16}},e.createElement(d,{key:"col",span:24},e.createElement(u,{wrap:!0,style:{justifyContent:"center"}},[e.createElement(C,{key:"ket-qua",type:"primary",onClick:Fe,loading:F},"Kết Quả"),e.createElement(C,{key:"thong-ke",type:"default",onClick:la,loading:F,disabled:H.length===0},"Thống Kê"),e.createElement(C,{key:"thong-ke-moi",type:"default",onClick:ia,loading:F},"Thống Kê Mới")])))]),Ie.length>0?e.createElement(_,{key:"results",title:"Kết quả thống kê",style:{marginTop:16}},e.createElement(Ke,{key:"thongke-grid",appId:"kqxs",permissions:0,menusPermissions:{},database:{thongke_results:{rows:Ie.slice(0,50).map((t,n)=>({...t,id:n,key:n}))}},m_configs:{id:"thongke_results",label:"Kết quả thống kê",table_name:"thongke_results",table:[{f_name:"field_ngay",f_header:"Ngày",f_show:1,f_types:"text",width:100},{f_name:"province",f_header:"Tỉnh/Thành",f_show:1,f_types:"text",width:120},{f_name:"prize",f_header:"Giải",f_show:1,f_types:"text",width:80},{f_name:"numbers",f_header:"Số",f_show:1,f_types:"text"},{f_name:"duoi",f_header:"Đuôi",f_show:1,f_types:"text",width:80},{f_name:"dem",f_header:"Đếm",f_show:1,f_types:"number",width:80},{f_name:"kxh",f_header:"KXH",f_show:1,f_types:"number",width:80},{f_name:"max",f_header:"Max",f_show:1,f_types:"number",width:80},{f_name:"tong",f_header:"Tổng",f_show:1,f_types:"number",width:80}],trigger:{},g_readonly:!0,table_pagesize:20}})):null,Qe.length>0?e.createElement(_,{key:"grd-kq",title:"Kết quả chi tiết (grdKQ)",style:{marginTop:16}},e.createElement(Ke,{key:"grd-kq-grid",appId:"kqxs",permissions:0,menusPermissions:{},database:{grd_kq_results:{rows:Qe.slice(0,100).map((t,n)=>({...t,id:n,key:n}))}},m_configs:{id:"grd_kq_results",label:"Kết quả chi tiết",table_name:"grd_kq_results",table:[{f_name:"duoi",f_header:"Đuôi",f_show:1,f_types:"text",width:80},{f_name:"dem",f_header:"Đếm",f_show:1,f_types:"number",width:80},{f_name:"kxh",f_header:"KXH",f_show:1,f_types:"number",width:80},{f_name:"max",f_header:"Max",f_show:1,f_types:"number",width:80},{f_name:"tong",f_header:"Tổng",f_show:1,f_types:"number",width:80}],trigger:{},g_readonly:!0,table_pagesize:25}})):null])}];case"thongkemoi":return[{key:"3",label:"Thống kê mới",children:e.createElement("div",{style:{padding:"24px"}},[e.createElement(_,{key:"progress-card",title:"Tiến độ xử lý",style:{marginBottom:16}},e.createElement(vt,{key:"progress-bar",percent:te,status:te===100?"success":"active",strokeColor:te===100?"#52c41a":"#1890ff"})),e.createElement(_,{key:"advanced-control-panel",title:"Bảng Điều Khiển Thống Kê Nâng Cao (Vue Logic)",style:{marginBottom:16}},e.createElement("div",{key:"controls"},[e.createElement(b,{key:"control-row1",gutter:[16,16],style:{marginBottom:16}},[e.createElement(d,{key:"mien-col",xs:24,sm:12,md:4},[e.createElement("div",{key:"mien-label",style:{marginBottom:"8px",fontWeight:"500"}},"Miền:"),e.createElement(N,{key:"mien-select",style:{width:"100%"},value:h,onChange:t=>pe(t),options:[{value:"MN",label:"Miền Nam"},{value:"MT",label:"Miền Trung"},{value:"MB",label:"Miền Bắc"}]})]),e.createElement(d,{key:"thu-col",xs:24,sm:12,md:4},[e.createElement("div",{key:"thu-label",style:{marginBottom:"8px",fontWeight:"500"}},"Thứ:"),e.createElement(N,{key:"thu-select",style:{width:"100%"},value:y,disabled:!0,options:[{value:"T2",label:"Thứ 2"},{value:"T3",label:"Thứ 3"},{value:"T4",label:"Thứ 4"},{value:"T5",label:"Thứ 5"},{value:"T6",label:"Thứ 6"},{value:"T7",label:"Thứ 7"},{value:"CN",label:"Chủ Nhật"}]})]),e.createElement(d,{key:"soky-col",xs:24,sm:12,md:4},[e.createElement("div",{key:"soky-label",style:{marginBottom:"8px",fontWeight:"500"}},"Số Kỳ:"),e.createElement(Q,{key:"soky-input",style:{width:"100%"},min:1,max:365,value:D,onChange:t=>ye(t||28),controls:!0})]),e.createElement(d,{key:"laysoky-col",xs:24,sm:12,md:4},[e.createElement("div",{key:"laysoky-label",style:{marginBottom:"8px",fontWeight:"500"}},"Lấy Số Kỳ:"),e.createElement(Q,{key:"laysoky-input",style:{width:"100%"},min:0,max:50,value:Yt,onChange:t=>Ye(t||5),controls:!0})]),e.createElement(d,{key:"sapxep-col",xs:24,sm:12,md:4},[e.createElement("div",{key:"sapxep-label",style:{marginBottom:"8px",fontWeight:"500"}},"Sắp Xếp:"),e.createElement(N,{key:"sapxep-select",style:{width:"100%"},value:Se,onChange:t=>Ae(t),options:[{value:0,label:"Ngày mới đứng trước"},{value:1,label:"Ngày cũ đứng trước"}]})]),e.createElement(d,{key:"loaithongke-col",xs:24,sm:12,md:4},[e.createElement("div",{key:"loaithongke-label",style:{marginBottom:"8px",fontWeight:"500"}},"Loại Thống Kê:"),e.createElement(N,{key:"loaithongke-select",style:{width:"100%"},value:U,onChange:t=>Be(t),options:[{value:1,label:"Thống kê 1 Đài"},{value:2,label:"Thống kê 2 Đài"},{value:3,label:"Thống kê 3 Đài"}]})])]),e.createElement(b,{key:"control-row2",gutter:[16,16],style:{marginBottom:16}},[e.createElement(d,{key:"kxh-controls",xs:24,sm:24,md:12},e.createElement(_,{size:"small",title:"Điều Kiện KXH",style:{border:"2px solid #52c41a"}},[e.createElement(b,{key:"kxh-row",gutter:[8,8]},[e.createElement(d,{key:"kxhtu-col",span:8},[e.createElement("div",{key:"kxhtu-label",style:{fontSize:"12px",marginBottom:"4px"}},"KXH Từ >=:"),e.createElement(Q,{key:"kxhtu-input",value:xe,onChange:t=>be(t||2),min:0,max:999,size:"small",style:{width:"100%"}})]),e.createElement(d,{key:"kxhden-col",span:8},[e.createElement("div",{key:"kxhden-label",style:{fontSize:"12px",marginBottom:"4px"}},"KXH Đến <=:"),e.createElement(Q,{key:"kxhden-input",value:ve,onChange:t=>_e(t||4),min:0,max:999,size:"small",style:{width:"100%"}})]),e.createElement(d,{key:"kxhlocsau-col",span:8},[e.createElement("div",{key:"kxhlocsau-label",style:{fontSize:"12px",marginBottom:"4px"}},"Lọc Sâu:"),e.createElement(X,{key:"kxhlocsau-checkbox",checked:qe,onChange:t=>we(t.target.checked)},"Có")])])])),e.createElement(d,{key:"sochu-col",xs:24,sm:24,md:12},[e.createElement("div",{key:"sochu-label",style:{marginBottom:"8px",fontWeight:"500"}},"Số Chủ (VD: 12-34-56):"),e.createElement(fe,{key:"sochu-input",style:{width:"100%"},placeholder:"99-99-99-99-99-99-99-99-99 (tối đa 9 số)",value:ae.join("-"),maxLength:26,onChange:t=>{let i=t.target.value.replace(/\D/g,"").match(/\d{1,2}/g)||[];const l=new Set,r=[];for(let c of i)if(c=c.padStart(2,"0"),!l.has(c)&&parseInt(c,10)<=99&&(l.add(c),r.push(c),r.length>=9))break;Xe(r)}})])]),e.createElement(b,{key:"control-row3",gutter:[16,16],style:{marginBottom:16}},[e.createElement(d,{key:"stations-col",xs:24,sm:24,md:24},[e.createElement("div",{key:"stations-label",style:{marginBottom:"8px",fontWeight:"500"}},"Chọn Đài:"),e.createElement(N,{key:"stations-select",mode:"multiple",style:{width:"100%"},placeholder:"Chọn các đài cần thống kê",value:ne,onChange:t=>He(t),options:A.map(t=>({value:t.stt,label:t.ten_dai})),maxTagCount:5,maxTagTextLength:15}),e.createElement("div",{key:"stations-info",style:{fontSize:"12px",color:"#666",marginTop:"4px"}},`Đã chọn: ${ne.length} đài (${A.length} khả dụng)`)])]),e.createElement("div",{key:"actions-row",style:{textAlign:"center",paddingTop:"16px"}},e.createElement(u,{key:"action-buttons",size:"middle"},e.createElement(C,{key:"btn-run-stats",type:"primary",size:"large",loading:F,onClick:ra},"🔍 Chạy Thống Kê Nâng Cao (Vue Logic)"),e.createElement(C,{key:"btn-reset",size:"large",onClick:()=>{He([]),Xe([]),ye(28),Ye(5),Xt(5),Ht(5),Bt(5),Lt(5),At(5),It(7),we(!0),be(2),_e(4),Ae(1),wt("#f0bb41"),I(0),Re(!0),v.success("Đã reset tất cả tham số về mặc định!")}},"🔄 Reset Tất Cả")))])),e.createElement(_,{key:"results-area",title:"Kết Quả Thống Kê Nâng Cao",style:{minHeight:400}},e.createElement("div",{key:"placeholder",style:{textAlign:"center",padding:"64px 24px",color:"#666"}},[e.createElement("div",{key:"icon",style:{fontSize:"64px",marginBottom:"24px"}},"📊"),e.createElement("h2",{key:"title",style:{marginBottom:"16px",color:"#1890ff"}},"Phân Tích Thống Kê Xổ Số Nâng Cao"),e.createElement("p",{key:"description",style:{fontSize:"16px",marginBottom:"24px"}},"Chọn miền, số kỳ, các đài và nhấn 'Chạy Thống Kê Nâng Cao' để xem kết quả chi tiết"),e.createElement("h4",{key:"features-title",style:{margin:"24px 0 16px",color:"#1890ff"}},"Tính năng phân tích sẽ bao gồm:"),e.createElement("div",{key:"feature-list",style:{display:"inline-block",textAlign:"left"}},e.createElement("ul",{style:{margin:0,padding:0,listStyle:"none"}},[{key:"f1",text:"🎯 Thống kê tần suất xuất hiện của từng số"},{key:"f2",text:"📈 Phân tích chu kỳ không xuất hiện (KXH)"},{key:"f3",text:"🔢 Lọc theo số chủ và điều kiện nâng cao"},{key:"f4",text:"📊 Hiển thị kết quả dạng bảng động và biểu đồ"},{key:"f5",text:"🎲 Phân tích tổ hợp đài và chu kỳ lịch sử"},{key:"f6",text:"💾 Xuất kết quả ra file Excel/CSV"}].map(t=>e.createElement("li",{key:t.key,style:{padding:"8px 0",fontSize:"14px"}},t.text))))]))])}];default:return e.createElement("div",{key:"default",style:{padding:"24px",textAlign:"center"}},"Chọn chức năng từ menu trên")}};o.useCallback(async()=>{if(!O){v.error("Vui lòng chọn Loại Tìm");return}w(!0);try{const{calculateTongHopResults:a,calculateNhomSo:t,getBoSoTriet:n,checkDuplicateNumbers:i,processNumberCollisions:l}=await bt(async()=>{const{calculateTongHopResults:s,calculateNhomSo:p,getBoSoTriet:m,checkDuplicateNumbers:k,processNumberCollisions:g}=await import("./kqxs_service.D27SQRiP.js");return{calculateTongHopResults:s,calculateNhomSo:p,getBoSoTriet:m,checkDuplicateNumbers:k,processNumberCollisions:g}},__vite__mapDeps([0,1,2,3,4]));let c=await a({heSo:L.toString(),loaiTim:O,tuNgay:de.format("DD/MM/YYYY"),denNgay:he.format("DD/MM/YYYY"),soNhap:W,chkNhom:ie,chkTriet:le,chkTrietDuoi:ge,ktn:ue,ktd:ke,l2c:oe});if(W&&W.trim()){const s=i(W);console.log("Số trùng nhau:",s)}if(le){const s=await n(L.toString(),O,de.format("DD/MM/YYYY"),he.format("DD/MM/YYYY"));if(console.log("Bộ số triệt:",s),s){const p=await t(L.toString(),s);console.log("Nhóm số triệt:",p)}}if(ie){const s=await t(L.toString());console.log("Nhóm số:",s)}if(c.length>0){const s=c.map(m=>Object.values(m).join(" ")),p=l(s);console.log("Bản đồ số trùng:",p)}$e(c),v.success(`Đã tính toán ${c.length} kết quả tổng hợp`)}catch(a){console.error("Error in performTongHop:",a),v.error("Có lỗi xảy ra khi tính toán tổng hợp")}finally{w(!1)}},[L,O,de,he,W,ie,le,ge,ue,ke,oe]);const sa=(a,t)=>{const n=[];function i(l,r,c){if(c.length===t){n.push([...c]);return}for(let s=r;s<l.length;s++)c.push(l[s]),i(l,s+1,c),c.pop()}return i(a,0,[]),n},ra=async()=>{if(ne.length===0){v.error("Vui lòng chọn ít nhất một đài!");return}if(ne.length<U){v.error(`Vui lòng chọn ít nhất ${U} đài!`);return}const a=E.subtract(D,"day").format("DD/MM/YYYY");if(E.diff(z(a,"DD/MM/YYYY"),"days")<28){v.error("Vui lòng chọn thời gian dài hơn 28 ngày");return}Re(!1),w(!0);try{const n=[],i={},l=[];for(const p of ne){const m=q.find(k=>k.stt===p&&k.mien===h&&k.thu===y);if(m!=null&&m.du_lieu_dai)try{const k=await Ce(m.du_lieu_dai,a);if(Array.isArray(k)&&k.length){const g=k.filter(f=>{const x=z(f.field_ngay,"YYYYMMDD");return x.isValid()&&x.isAfter(z(a,"DD/MM/YYYY").subtract(1,"day"))&&x.isBefore(z(E.format("DD/MM/YYYY"),"DD/MM/YYYY").add(1,"day"))}).sort((f,x)=>x.field_ngay.localeCompare(f.field_ngay));i[p]=g,l.push({stt:parseInt(p),dai:m.ten_dai,ten_dai:m.ten_dai})}}catch(k){console.warn(`Error loading data for station ${p}:`,k)}}const r=Object.keys(i);sa(r,U).forEach(p=>{let m="",k="",g="";p.forEach((f,x)=>{const T=l.find(K=>K.stt===parseInt(f));m+=(m?"&":"")+f,k+=(k?"&":h+" ")+f,g+=(g?" & ":h+" ")+((T==null?void 0:T.ten_dai)||f)}),(p.length>1||U===1)&&(n.push({id:m,text:k,ketqua:!1,ten_dai:g}),n.push({id:"kq_"+m,text:"KQ "+k,ketqua:!0,ten_dai:g}))});const s=ca(i,n);Ve(i),v.success(`Hoàn thành thống kê với ${s.length} kết quả`)}catch(n){console.error("Error in processThongKeMoi:",n),v.error("Có lỗi khi xử lý thống kê!")}finally{w(!1)}},ca=(a,t)=>{const n=[];return t.forEach(i=>{const l=i.ketqua,r=[];for(let s=0;s<100;s++){const p={id:`kqxs_${s}_${Date.now()}`,dem:0,tong:0,chua_ra:0,lich_su:0,so:s.toString().padStart(2,"0"),thoa_man:!1};if(Se===0)for(let m=0;m<D;m++)p[`k_${m+1}`]="";else for(let m=D;m>0;m--)p[`k_${m}`]="";r.push(p)}let c=i.id.toString();l&&(c=c.replace(/kq_/g,"")),c.split(/&/g).forEach(s=>{const m=(a[s]||[]).filter(g=>{const f=z(g.field_ngay,"YYYYMMDD"),x=z(E.subtract(D,"day").format("DD/MM/YYYY"),"DD/MM/YYYY"),T=z(E.format("DD/MM/YYYY"),"DD/MM/YYYY");return f.isAfter(x.subtract(1,"day"))&&f.isBefore(T)}).sort((g,f)=>f.field_ngay.localeCompare(g.field_ngay));let k=0;m.reduce((g,f)=>(g.some(x=>x.field_ngay===f.field_ngay)||g.push(f),g),[]).forEach(g=>{k++,k<=D&&Object.keys(g).forEach(f=>{if(f!=="_id"&&f!=="id"&&f!=="thu"&&f!=="field_ngay"){const x=g[f].trim().substr(-2),T=r.findIndex(K=>K.so===x);if(T!==-1){const K={...r[T]},Y=`k_${k}`;K[Y]=(K[Y]||0)+1,r[T]=K}}})})}),r.forEach((s,p)=>{let m=0,k=0,g=0,f=0,x=-1,T=0,K=0,Y=!0,P="",J=0;const se=Se===0?Array.from({length:D},(Z,j)=>`k_${j+1}`):Array.from({length:D},(Z,j)=>`k_${D-j}`);se.forEach((Z,j)=>{const re=s[Z];if(parseInt(re)>0)k+=parseInt(re),m++,g>f&&(f=g),J++,g===0&&x===-1&&(Y=!1),x===-1&&(x=g),Y&&g>0&&(g<=x?(T++,g===x&&K++):(s.kxh_sc=g,Y=!1),P+=(P?",":"")+g),g=0;else{if(Y)for(let ce=0;ce<J-1;ce++)P+=P?",0":"0";J=0,g++}j===se.length-1&&g>f&&(f=g)}),s.thoa_man=x>=xe&&x<=ve&&T>1,qe&&K<=1&&(s.thoa_man=!1),ae.length>0&&Le>0&&(s.thoa_man=s.thoa_man&&ae.includes(s.so)&&m>=Le),s.dem=m,s.bieu_dien=P,s.tong=k,s.kxh=x>0?x:0,s.lich_su=f}),n.push({itemData:i,dsThongKe:r.filter(s=>!l||s.thoa_man||ae.length>0&&ae.includes(s.so))})}),n},da=()=>me("ketqua"),ma=()=>me("thongke"),ha=()=>me("thongkemoi"),Ge=async(a=!1)=>{v.info(`Đang thực hiện ${a?"Tìm Triệt":"Tìm"} với các tham số đã chọn`),w(!0);try{const{calculateTongHopResults:t}=await bt(async()=>{const{calculateTongHopResults:i}=await import("./kqxs_service.D27SQRiP.js");return{calculateTongHopResults:i}},__vite__mapDeps([0,1,2,3,4])),n=await t({heSo:L.toString(),loaiTim:O,tuNgay:de.format("DD/MM/YYYY"),denNgay:he.format("DD/MM/YYYY"),soNhap:W,chkNhom:ie,chkTriet:a||le,chkTrietDuoi:ge,ktn:ue,ktd:ke,l2c:oe});$e(n),v.success(`Hoàn thành tìm kiếm (${n.length})`)}catch(t){console.error(t),v.error("Có lỗi khi tính Tổng Hợp")}finally{w(!1)}},ga=()=>e.createElement("div",{key:"tonghop-content"},[e.createElement(_,{key:"header1",title:"Tham số tìm kiếm",style:{marginBottom:16}},e.createElement(b,{gutter:[16,16]},[e.createElement(d,{key:"he-col",span:4},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"he-label"},"Hệ"),e.createElement(N,{key:"he-select",value:L,onChange:a=>Ot(a),style:{width:"100%"},options:[{value:"2",label:"2"},{value:"3",label:"3"}]})])),e.createElement(d,{key:"so-col",span:6},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"so-label"},"Số đuôi - Số"),e.createElement(fe,{key:"so-input",value:W,onChange:a=>Pt(a.target.value),placeholder:"Nhập số cần tìm",style:{width:"100%"}})])),e.createElement(d,{key:"checkboxes-col",span:6},e.createElement(u,{direction:"vertical"},[e.createElement(X,{key:"nhom-check",checked:ie,onChange:a=>jt(a.target.checked)},"Nhóm"),e.createElement(X,{key:"triet-check",checked:le,onChange:a=>Wt(a.target.checked)},"Triệt"),e.createElement(X,{key:"trietduoi-check",checked:ge,onChange:a=>Ft(a.target.checked)},"Đuổi")])),e.createElement(d,{key:"params-col",span:8},e.createElement(b,{gutter:[8,8]},[e.createElement(d,{span:8},e.createElement(u,{direction:"vertical",size:"small"},[e.createElement("label",{key:"ktn-label",style:{fontSize:"12px"}},"KTN"),e.createElement(Q,{key:"ktn-input",value:ue,onChange:a=>Gt(a||12),min:1,max:100,size:"small",style:{width:"100%"}})])),e.createElement(d,{span:8},e.createElement(u,{direction:"vertical",size:"small"},[e.createElement("label",{key:"ktd-label",style:{fontSize:"12px"}},"KTD"),e.createElement(Q,{key:"ktd-input",value:ke,onChange:a=>Ut(a||12),min:1,max:100,size:"small",style:{width:"100%"}})])),e.createElement(d,{span:8},e.createElement(u,{direction:"vertical",size:"small"},[e.createElement("label",{key:"l2c-label",style:{fontSize:"12px"}},"L2C"),e.createElement(Q,{key:"l2c-input",value:oe,onChange:a=>Jt(a||12),min:1,max:100,size:"small",style:{width:"100%"}})]))]))])),e.createElement(_,{key:"header2",title:"Thời gian và tùy chọn",style:{marginBottom:16}},e.createElement(b,{gutter:[16,16]},[e.createElement(d,{key:"loaitim-col",span:6},e.createElement(u,{direction:"vertical",style:{width:"100%"}},[e.createElement("label",{key:"loaitim-label"},"Loại Tìm"),e.createElement(N,{key:"loaitim-select",value:O,onChange:a=>Te(a),style:{width:"100%"},options:Pe})])),e.createElement(d,{key:"buttons-col",span:8},e.createElement(u,{direction:"vertical",size:"small"},[e.createElement(u,{size:"small"},[e.createElement(C,{key:"tim-btn",type:"primary",onClick:()=>Ge(!1),style:{fontWeight:"bold"}},"Tìm"),e.createElement(C,{key:"tim-triet-btn",onClick:()=>Ge(!0),style:{fontWeight:"bold"}},"Tìm Triệt")]),e.createElement(X,{key:"hientk-check",checked:Tt,onChange:a=>Nt(a.target.checked)},"Hiện TK")])),e.createElement(d,{key:"params2-col",span:10},e.createElement(u,{direction:"vertical",size:"small"},[e.createElement(u,{size:"small"},[e.createElement("label",{key:"soky-label",style:{fontSize:"12px"}},"Số Kỳ"),e.createElement(Q,{key:"soky-input",value:Kt,onChange:a=>Ct(a||52),min:1,max:999,size:"small",style:{width:"50px"}})]),e.createElement(u,{size:"small"},[e.createElement("label",{key:"songay-label",style:{fontSize:"12px"}},"Số ngày"),e.createElement(Q,{key:"songay-input",value:Dt,onChange:a=>Mt(a||7),min:1,max:30,size:"small",style:{width:"50px"}})])]))])),e.createElement(b,{key:"results-row",gutter:[16,16]},[e.createElement(d,{key:"main-col",span:18},e.createElement(_,{key:"results-card",title:"Kết quả tổng hợp"},e.createElement(Ke,{key:"tonghop-grid",appId:"kqxs",permissions:0,menusPermissions:{},database:{tonghop_results:{rows:$t.map((a,t)=>({...a,id:t,key:t}))}},m_configs:{id:"tonghop_results",label:"Kết quả tổng hợp",table_name:"tonghop_results",table:[{f_name:"cach",f_header:"Cách",f_show:1,f_types:"text",width:200},{f_name:"ketqua",f_header:"Kết quả",f_show:1,f_types:"text",width:300},{f_name:"solan",f_header:"Số Lần Ko Xổ",f_show:1,f_types:"number",width:80,f_align:"right"},{f_name:"l2c",f_header:`${oe} L2C`,f_show:1,f_types:"number",width:60,f_align:"right"},{f_name:"tong28",f_header:"Tổng 28 ngày",f_show:1,f_types:"number",width:80,f_align:"right"},{f_name:"launga",f_header:"Lâu Ngày",f_show:1,f_types:"number",width:70,f_align:"right"},{f_name:"lauky",f_header:"Lâu Kỳ",f_show:1,f_types:"number",width:60,f_align:"right"},{f_name:"ngaycx",f_header:"Ngày CX",f_show:1,f_types:"text",width:70},{f_name:"kychuaxo",f_header:"Kỳ Chưa Xổ",f_show:1,f_types:"number",width:80,f_align:"right"},{f_name:"cacso",f_header:"Các Số",f_show:1,f_types:"text",width:600}],trigger:{},g_readonly:!0,table_pagesize:50}}))),e.createElement(d,{key:"filter-col",span:6},[e.createElement(_,{key:"filter-card",title:"Lọc kết quả",size:"small",style:{marginBottom:16}},e.createElement("div",{style:{height:"150px",overflow:"auto",border:"1px solid #d9d9d9",padding:"8px"}},e.createElement(u,{direction:"vertical"},[e.createElement(X,{key:"kqt",checked:M.includes("KQT"),onChange:a=>{a.target.checked?R([...M,"KQT"]):R(M.filter(t=>t!=="KQT"))}},"Kết quả Tuần"),e.createElement(X,{key:"kqn",checked:M.includes("KQN"),onChange:a=>{a.target.checked?R([...M,"KQN"]):R(M.filter(t=>t!=="KQN"))}},"Kết quả Ngày"),e.createElement(X,{key:"ktd",checked:M.includes("KTD"),onChange:a=>{a.target.checked?R([...M,"KTD"]):R(M.filter(t=>t!=="KTD"))}},"Kết quả Tuần Đài"),e.createElement(X,{key:"l2c",checked:M.includes("L2C"),onChange:a=>{a.target.checked?R([...M,"L2C"]):R(M.filter(t=>t!=="L2C"))}},"Kết quả ngày Nam Bắc")]))),e.createElement(_,{key:"trung-card",title:"Thứ tự trùng",size:"small"},e.createElement(fe.TextArea,{key:"trung-textarea",value:Qt,onChange:a=>zt(a.target.value),rows:8,readOnly:!0}))])])]);return e.createElement(va,{menuItems:ee,selectedKey:"/kqxs.shtml",title:"Kết Quả Xổ Số"},e.createElement("div",{className:"kqxs-responsive"},[e.createElement(_a,{key:"title",level:2},"Kết Quả Xổ Số"),e.createElement(_,{key:"menu",style:{marginBottom:16}},e.createElement(u,{size:"small",wrap:!0},[e.createElement(C,{key:"btn-ketqua",type:B==="ketqua"?"primary":"default",onClick:da},"Kết Quả"),e.createElement(C,{key:"btn-thongke",type:B==="thongke"?"primary":"default",onClick:ma},"Thống Kê"),e.createElement(C,{key:"btn-thongkemoi",type:B==="thongkemoi"?"primary":"default",onClick:ha},"Thống Kê Mới"),e.createElement(C,{key:"btn-tonghop",type:B==="tonghop"?"primary":"default",onClick:()=>me("tonghop")},"Tổng Hợp")])),B==="tonghop"?ga():e.createElement(ka,{key:"tabs",activeKey:B==="ketqua"?"1":B==="thongke"?"2":B==="thongkemoi"?"3":"1",items:oa()})]))};export{Fa as default};
