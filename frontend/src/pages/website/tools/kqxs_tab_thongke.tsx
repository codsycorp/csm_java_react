import React, { useState, useEffect } from "react";
import { Card, Row, Col, Select, DatePicker, Button, Space, InputNumber, Progress, message, Input, ColorPicker, Table, Tabs, Tag } from "antd";
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from "dayjs";
import { fetchKQXSStationsWithFilter, fetchKQXSTableRange } from "#src/api/kqxs_service";

interface DaiInfo {
  du_lieu_dai: string;
  ten_dai: string;
  mien: string;
  thu: string;
  stt: number;
}

interface ThongKeConfig {
  tuNgay: Dayjs;
  denNgay: Dayjs;
  mien: string;
  loaiTim: number;
  loaiThongKe: number;
  chuKy: number;
  laySoKy: number;
  demBeHon: number;
  kxhPhaiLonHon: number;
  demNhoHon: number;
  lsBatDau: number;
  demLonHon: number;
  demToNhoHon: number;
  kxhTu: number;
  kxhDen: number;
  kxhLocSau: boolean;
  mauTo: string;
  thuTuan: string;
  sapXep: number;
}

interface ThongKeRow {
  id: string;
  so: string;
  tong: number;
  dem: number;
  kxh: number;
  lauNhat: number;
  [key: string]: any;
}

interface KetQuaRow {
  id: string;
  ngay?: string;
  so_ky?: number;
  so1?: string;
  so2?: string;
  ket_qua1?: any;
  ket_qua2?: any;
  to_mau1?: boolean;
  to_mau2?: boolean;
  [key: string]: any;
}

interface TabItem { key: string; label: string; tenDai: string; ketqua: boolean; }

interface LichSuRow { id: string; ngay: string; so_ky: number; stt: number; }

interface KetQuaBlock {
  laySoKy?: KetQuaRow[]; // KQ1
  kxhPhaiLonHon?: KetQuaRow[]; // KQ2
  demNhoHon?: KetQuaRow[]; // KQ3
  demLonHon?: any[]; // bảng tổng hợp đặc biệt (dem_lon_hon | dem_to_nho_hon)
  lichSuSoChu?: LichSuRow[]; // lịch sử số chủ
}

const defaultConfig: ThongKeConfig = {
  tuNgay: dayjs().subtract(4, 'year'),
  denNgay: dayjs(),
  mien: "MN",
  loaiTim: 1, // 0: "Theo Ngày", 1: "Theo Kỳ"
  loaiThongKe: 2, // 1: "Thống kê KQ 1 Đài", 2: "Thống kê KQ 2 Đài", 3: "Thống kê KQ 3 Đài"
  chuKy: 28,
  laySoKy: 5,
  demBeHon: 5, // Điểm KQ1 <=
  kxhPhaiLonHon: 7, // KXH KQ2 >=
  demNhoHon: 5, // Điểm KQ3 <=
  lsBatDau: 5, // Max LSBD >=
  demLonHon: 5, // Đếm Số Chủ >=
  demToNhoHon: 0, // Đếm Số Lần <=
  kxhTu: 2,
  kxhDen: 4,
  kxhLocSau: true,
  mauTo: "#f0bb41",
  thuTuan: "T3",
  sapXep: 1 // 0: "Ngày mới đứng trước", 1: "Ngày cũ đứng trước"
};


export const KQXSTabThongKe: React.FC = () => {
  const [config, setConfig] = useState<ThongKeConfig>({ ...defaultConfig });
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [tabItems, setTabItems] = useState<TabItem[]>([]);
  const [activeTabKey, setActiveTabKey] = useState<string>("");
  const [danhSachDai, setDanhSachDai] = useState<DaiInfo[]>([]);
  const [dsDaiChon, setDsDaiChon] = useState<string[]>([]);
  const [dsDaiSoChuChon, setDsDaiSoChuChon] = useState<string[]>([]);
  const [duLieuDaiMien, setDuLieuDaiMien] = useState<Record<string, any[]>>({}); // key: du_lieu_dai, value: rows
  const [soChu, setSoChu] = useState<string[]>([]);
  const [ketQuaBlocks, setKetQuaBlocks] = useState<Record<string, KetQuaBlock>>({});
  const [thongKeData, setThongKeData] = useState<any[]>([]);
  // Chế độ: TK (Thống Kê) | TK_MOI (Thống Kê Mới)
  const [mode, setMode] = useState<'TK' | 'TK_MOI'>('TK');

  const labelStyle: React.CSSProperties = { fontWeight: 600, marginBottom: 6, display: 'block' };

  const updateConfig = (key: keyof ThongKeConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  // Helper functions
  const guid = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const parseDate = (dateStr: string, format: string): Date => {
    if (format.toLowerCase() === "dd/mm/yyyy") {
      const [day, month, year] = dateStr.split('/').map(Number);
      return new Date(year, month - 1, day);
    }
    if (format.toLowerCase() === "yyyymmdd") {
      const s = (dateStr || '').toString().replace(/\D/g, '');
      const yyyy = Number(s.slice(0,4));
      const mm = Number(s.slice(4,6));
      const dd = Number(s.slice(6,8));
      return new Date(yyyy, mm - 1, dd);
    }
    return new Date(dateStr);
  };

  const diffDays = (date1: string, date2: string): number => {
    const d1 = parseDate(date1, "dd/mm/yyyy");
    const d2 = parseDate(date2, "dd/mm/yyyy");
    return Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
  };


  // Update thuTuan khi denNgay thay đổi
  useEffect(() => {
    const dayMap = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    updateConfig('thuTuan', dayMap[config.denNgay.day()]);
  }, [config.denNgay]);

  // Fetch danh sách đài khi ngày, miền, hoặc thứ thay đổi
  useEffect(() => {
    fetchKQXSStationsWithFilter({ thu: config.thuTuan })
      .then(allStations => {
        setDanhSachDai(allStations || []);
        setDsDaiChon([]);
        setDsDaiSoChuChon([]);
      })
      .catch(e => {
        console.error("Không tải được danh sách đài (SSR)", e);
        setDanhSachDai([]);
        setDsDaiChon([]);
        setDsDaiSoChuChon([]);
      });
  }, [config.denNgay, config.mien, config.thuTuan]);

  // Lọc đài theo miền và thứ tuần
  const daiFiltered = danhSachDai.filter(dai => {
    if (dai.mien !== config.mien) return false;
    if (config.loaiTim === 1) { // Theo Kỳ
      return !config.thuTuan || dai.thu === config.thuTuan;
    }
    return true; // Theo Ngày: không khóa theo thứ
  });

  // Hàm xử lý số chủ input
  const handleSoChuChange = (value: string) => {
    const numbers = value.replace(/\D/g, '').match(/\d{1,2}/g) || [];
    const formattedNumbers = numbers
      .map(num => num.padStart(2, '0'))
      .filter((num, idx, arr) => arr.indexOf(num) === idx && parseInt(num) <= 99);
    setSoChu(formattedNumbers);
  };

  /******************* Helpers chuyển đổi ngày *******************/
  const formatYMD = (d: Dayjs) => d.format("YYYYMMDD");
  const dayMap = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

  const buildUniqueCombinations = (arr: string[], size: number): string[][] => {
    const res: string[][] = [];
    const backtrack = (start: number, combo: string[]) => {
      if (combo.length === size) { res.push([...combo]); return; }
      for (let i = start; i < arr.length; i++) { combo.push(arr[i]); backtrack(i + 1, combo); combo.pop(); }
    };
    backtrack(0, []);
    return res;
  };

  // Tạo danh sách field k_ theo cấu hình sapXep
  const getCycleFields = (): string[] => {
    const fields: string[] = [];
    if (config.sapXep === 0) { for (let k = 1; k <= config.chuKy; k++) fields.push(`k_${k}`); }
    else { for (let k = config.chuKy; k >= 1; k--) fields.push(`k_${k}`); }
    return fields;
  };

  // Tính lịch sử số chủ: chuỗi số kỳ trống giữa các lần trúng (>= lsBatDau)
  const computeLichSuSoChu = (): LichSuRow[] => {
    if (soChu.length === 0 || dsDaiSoChuChon.length === 0) return [];
    // Hợp nhất dữ liệu theo ngày cho các đài số chủ
    let merged: any[] = [];
    for (const t of dsDaiSoChuChon) { merged = merged.concat(duLieuDaiMien[t] || []); }
    const tuYMD = formatYMD(config.tuNgay);
    const denYMD = formatYMD(config.denNgay);
    merged = merged.filter(r => r.field_ngay < denYMD); // lịch sử trước ngày đến
    // Sắp xếp ngày giảm dần
    merged.sort((a,b) => b.field_ngay.localeCompare(a.field_ngay));
    // Duy nhất theo field_ngay
    const byNgay: any[] = [];
    merged.forEach(r => { if (!byNgay.some(x => x.field_ngay === r.field_ngay)) byNgay.push(r); });
    let ghls = 0; const out: LichSuRow[] = []; let stt = 0;
    for (const kq of byNgay) {
      // Có trúng số chủ?
      let hit = false;
      Object.keys(kq).forEach(f => {
        if (!(f === '_id' || f === 'id' || f === 'thu' || f === 'field_ngay')) {
          const val = (kq as any)[f];
          if (typeof val === 'string' && val.trim()) {
            if (soChu.find(so => val.trim().endsWith(so))) hit = true;
          }
        }
      });
      if (hit) {
        if (ghls >= config.lsBatDau) {
          stt += 1;
          out.push({ id: guid(), ngay: dayjs(kq.field_ngay, 'YYYYMMDD').format('DD/MM/YYYY'), so_ky: ghls, stt });
        }
        ghls = 0;
      } else { ghls++; }
    }
    return out.sort((a,b) => a.stt - b.stt);
  };

  // KQ1: lấy các số có xuất hiện ở kỳ cuối, rồi liệt kê đến laySoKy lần xuất hiện đầu tiên theo thứ tự cycle fields
  const computeKQ1Rows = (baseRows: ThongKeRow[]) => {
    const fields = getCycleFields();
    const lastField = `k_${config.chuKy}`; // kỳ cuối theo hướng không đảo label
    const candidates = baseRows.filter(r => (r[lastField] || 0) > 0);
    const tkRows = candidates.map(r => {
      const obj: any = { so: r.so, to_mau: false, ket_qua: '*' };
      let count = 0;
      for (const f of fields) {
        if ((r[f] || 0) > 0 && count < config.laySoKy) {
          count += 1; obj[`c_${count}`] = r[f];
        }
      }
      for (let i = count + 1; i <= config.laySoKy; i++) obj[`c_${i}`] = '';
      if (config.demBeHon > 0 && r.dem <= config.demBeHon) { obj.ket_qua = r.dem; obj.to_mau = true; }
      return obj;
    });
    // Chia đôi thành cặp
    const result: any[] = [];
    const half = Math.ceil(tkRows.length / 2);
    for (let i = 0; i < half; i++) {
      const left = tkRows[i]; const right = tkRows[i + half];
      const row: any = { id: guid() };
      if (left) {
        row.so1 = left.so; for (let c = 1; c <= config.laySoKy; c++) row[`c_${c}`] = left[`c_${c}`] || '';
        row.ket_qua1 = left.ket_qua; row.to_mau1 = left.to_mau;
      }
      if (right) {
        row.so2 = right.so; for (let c = 1; c <= config.laySoKy; c++) row[`c_${config.laySoKy + c}`] = right[`c_${c}`] || '';
        row.ket_qua2 = right.ket_qua; row.to_mau2 = right.to_mau;
      }
      result.push(row);
    }
    // Columns
    const columns: ColumnsType<any> = [];
    columns.push({ title: '', dataIndex: 'so1', key: 'so1', width: 50, render: (t: any) => <strong>{t}</strong> });
    for (let c = 1; c <= config.laySoKy; c++) columns.push({ title: '', dataIndex: `c_${c}`, key: `c_${c}`, width: 40, align: 'center' });
    columns.push({ title: '', dataIndex: 'ket_qua1', key: 'ket_qua1', width: 60, align: 'center' });
    columns.push({ title: '', dataIndex: 'vach', key: 'vach', width: 12, render: () => <div style={{ background: '#eee', width: '100%', height: 18 }} /> });
    columns.push({ title: '', dataIndex: 'so2', key: 'so2', width: 50, render: (t: any) => <strong>{t}</strong> });
    for (let c = 1; c <= config.laySoKy; c++) columns.push({ title: '', dataIndex: `c_${config.laySoKy + c}`, key: `c_${config.laySoKy + c}`, width: 40, align: 'center' });
    columns.push({ title: '', dataIndex: 'ket_qua2', key: 'ket_qua2', width: 60, align: 'center' });
    return { data: result, columns };
  };

  // KQ2: các số có kxh >= kxhPhaiLonHon
  const computeKQ2Rows = (baseRows: ThongKeRow[]) => {
    const filtered = baseRows.filter(r => (r.kxh || 0) >= config.kxhPhaiLonHon);
    const half = Math.ceil(filtered.length / 2);
    const result: any[] = [];
    for (let i = 0; i < half; i++) {
      const left = filtered[i]; const right = filtered[i + half]; const row: any = { id: guid() };
      if (left) { row.so1 = left.so; row.ket_qua1 = left.kxh; }
      if (right) { row.so2 = right.so; row.ket_qua2 = right.kxh; }
      result.push(row);
    }
    const columns: ColumnsType<any> = [
      { title: '', dataIndex: 'so1', key: 'so1', width: 50, render: (t:any)=><strong>{t}</strong> },
      { title: '', dataIndex: 'vach1', key: 'vach1', width: 12, render: () => <div style={{ background: '#eee', width: '100%', height: 18 }} /> },
      { title: '', dataIndex: 'ket_qua1', key: 'ket_qua1', width: 60, align: 'center' },
      { title: '', dataIndex: 'vach', key: 'vach', width: 12, render: () => <div style={{ background: '#ccc', width: '100%', height: 18 }} /> },
      { title: '', dataIndex: 'so2', key: 'so2', width: 50, render: (t:any)=><strong>{t}</strong> },
      { title: '', dataIndex: 'vach2', key: 'vach2', width: 12, render: () => <div style={{ background: '#eee', width: '100%', height: 18 }} /> },
      { title: '', dataIndex: 'ket_qua2', key: 'ket_qua2', width: 60, align: 'center' },
    ];
    return { data: result, columns };
  };

  // KQ3: k_{chuKy} === 0 và dem <= demNhoHon
  const computeKQ3Rows = (baseRows: ThongKeRow[]) => {
    const lastField = `k_${config.chuKy}`;
    const filtered = baseRows.filter(r => (r[lastField] || 0) === 0 && (r.dem || 0) <= config.demNhoHon);
    const half = Math.ceil(filtered.length / 2);
    const result: any[] = [];
    for (let i = 0; i < half; i++) {
      const left = filtered[i]; const right = filtered[i + half]; const row: any = { id: guid() };
      if (left) { row.so1 = left.so; row.ket_qua1 = left.dem; }
      if (right) { row.so2 = right.so; row.ket_qua2 = right.dem; }
      result.push(row);
    }
    const columns: ColumnsType<any> = [
      { title: '', dataIndex: 'so1', key: 'so1', width: 50, render: (t:any)=><strong>{t}</strong> },
      { title: '', dataIndex: 'vach1', key: 'vach1', width: 12, render: () => <div style={{ background: '#eee', width: '100%', height: 18 }} /> },
      { title: '', dataIndex: 'ket_qua1', key: 'ket_qua1', width: 60, align: 'center' },
      { title: '', dataIndex: 'vach', key: 'vach', width: 12, render: () => <div style={{ background: '#ccc', width: '100%', height: 18 }} /> },
      { title: '', dataIndex: 'so2', key: 'so2', width: 50, render: (t:any)=><strong>{t}</strong> },
      { title: '', dataIndex: 'vach2', key: 'vach2', width: 12, render: () => <div style={{ background: '#eee', width: '100%', height: 18 }} /> },
      { title: '', dataIndex: 'ket_qua2', key: 'ket_qua2', width: 60, align: 'center' },
    ];
    return { data: result, columns };
  };

  // Grid 4-khối cho demLonHon/demToNhoHon, mỗi khối 20 số (00..99 chia thành 4 cột khối)
  const computeDemLonHonGrid = (baseRows: ThongKeRow[]) => {
    const rows: any[] = [];
    const blocks = 4; // tối đa 4 khối = 80 số đầu; nếu >80 vẫn hiển thị thêm vào khối 4 (giới hạn UI)
    const perBlock = 20;
    const list = [...baseRows]; // giữ nguyên thứ tự 00..99
    // Tạo khung 20 dòng
    for (let r = 0; r < perBlock; r++) rows.push({ id: guid(), stt: r });
    // Đổ dữ liệu vào 4 khối
    let blockIdx = 1;
    list.forEach((objD, idx) => {
      const rIndex = idx % perBlock; const b = Math.floor(idx / perBlock) + 1; if (b > blocks) return;
      const fieldSuffix = String(b);
      rows[rIndex][`so${fieldSuffix}`] = objD.so;
      rows[rIndex][`tong${fieldSuffix}`] = objD.tong;
      rows[rIndex][`dem${fieldSuffix}`] = objD.dem;
      rows[rIndex][`kxh${fieldSuffix}`] = objD.kxh;
      // đánh dấu to_mau theo cấu hình
      if (config.demLonHon > 0 && soChu.length > 0) rows[rIndex][`to_mau${fieldSuffix}`] = (objD.dem >= config.demLonHon);
      else if (config.demToNhoHon > 0) rows[rIndex][`to_mau${fieldSuffix}`] = (objD.dem <= config.demToNhoHon);
    });
    // Columns group cho 4 khối
    const makeBlockCols = (suf: string, isFirst: boolean = false): ColumnsType<any>[number] => ({
      title: '',
      children: [
        { title: isFirst ? 'STT' : '', dataIndex: `so${suf}`, key: `so${suf}`, width: 50, render: (t:any) => <strong>{t}</strong>, onCell: (rec:any) => ({ style: rec[`to_mau${suf}`] ? { background: config.mauTo } : {} }) },
        { title: isFirst ? 'Tổng' : '', dataIndex: `tong${suf}`, key: `tong${suf}`, width: 60, align:'center' as const, onCell: (rec:any) => ({ style: rec[`to_mau${suf}`] ? { background: config.mauTo } : {} }) },
        { title: isFirst ? 'SL' : '', dataIndex: `dem${suf}`, key: `dem${suf}`, width: 50, align:'center' as const, onCell: (rec:any) => ({ style: rec[`to_mau${suf}`] ? { background: config.mauTo } : {} }) },
        { title: isFirst ? 'KXH' : '', dataIndex: `kxh${suf}`, key: `kxh${suf}`, width: 60, align:'center' as const, onCell: (rec:any) => ({ style: rec[`to_mau${suf}`] ? { background: config.mauTo } : {} }) },
      ],
    });
    const columns: ColumnsType<any> = [
      makeBlockCols('1', true), // Khối 1 có header
      { title: '', dataIndex: 'vach_a', key: 'vach_a', width: 10, render: () => <div style={{ width: '100%', height: 18, background: '#eee' }} /> },
      makeBlockCols('2', false),
      { title: '', dataIndex: 'vach_b', key: 'vach_b', width: 10, render: () => <div style={{ width: '100%', height: 18, background: '#eee' }} /> },
      makeBlockCols('3', false),
      { title: '', dataIndex: 'vach_c', key: 'vach_c', width: 10, render: () => <div style={{ width: '100%', height: 18, background: '#eee' }} /> },
      makeBlockCols('4'),
    ];
    return { data: rows, columns };
  };

  /** Load dữ liệu các bảng kqxs_* cho danh sách đài chọn (và đài số chủ nếu khác) */
  const loadDuLieuDai = async (): Promise<Record<string, any[]>> => {
    const allNeeded = Array.from(new Set([...dsDaiChon, ...dsDaiSoChuChon]));
    console.log('[loadDuLieuDai] dsDaiChon:', dsDaiChon, 'dsDaiSoChuChon:', dsDaiSoChuChon, 'allNeeded:', allNeeded);
    if (allNeeded.length === 0) return {};
    const tu = config.tuNgay.format("DD/MM/YYYY");
    const den = config.denNgay.format("DD/MM/YYYY");
    console.log('[loadDuLieuDai] Khoảng ngày:', tu, '-', den);
    const newData: Record<string, any[]> = { ...duLieuDaiMien };
    for (const tableName of allNeeded) {
      // Chỉ fetch nếu chưa có hoặc ngày thay đổi
      if (!newData[tableName]) {
        try {
          console.log('[loadDuLieuDai] Fetching table:', tableName);
          // Dùng SearchFilter (AND) giới hạn khoảng ngày
          const rows = await fetchKQXSTableRange<any>(
            tableName,
            formatYMD(config.tuNgay),
            formatYMD(config.denNgay)
          );
          console.log('[loadDuLieuDai] Fetched', tableName, ':', rows?.length, 'rows');
          newData[tableName] = (rows || []).filter((r: any) => r.field_ngay); // lọc row sai
          console.log('[loadDuLieuDai] After filter', tableName, ':', newData[tableName].length, 'rows');
        } catch (e) {
          console.error('Lỗi tải dữ liệu đài', tableName, e);
          message.error(`Lỗi tải dữ liệu ${tableName}`);
        }
      } else {
        console.log('[loadDuLieuDai] Using cached data for', tableName, ':', newData[tableName].length, 'rows');
      }
    }
    console.log('[loadDuLieuDai] Final newData:', newData);
    setDuLieuDaiMien(newData);
    return newData; // Trả về data thay vì chỉ set state
  };

  /*** Tính dsThongKe cho một tổ hợp đài (chuỗi stt1&stt2&...) */
  const computeThongKe = (comboKey: string, dataSource?: Record<string, any[]>): ThongKeRow[] => {
    // Dùng dataSource truyền vào hoặc fallback về state
    const data = dataSource || duLieuDaiMien;
    // comboKey dùng du_lieu_dai (tableName) nối bằng &
    const chuKy = config.chuKy;
    // Khởi tạo 100 rows (00-99), mỗi row có các field k_1, k_2, ..., k_N (LUÔN theo thứ tự này)
    const rows: ThongKeRow[] = Array.from({ length: 100 }, (_, i) => {
      const so = i.toString().padStart(2, '0');
      const obj: ThongKeRow = { id: guid(), so, tong: 0, dem: 0, kxh: 0, lauNhat: 0 };
      // LUÔN tạo k_1, k_2, ..., k_N (không phụ thuộc sapXep)
      for (let k = 1; k <= chuKy; k++) obj[`k_${k}`] = '';
      return obj;
    });
    const soToObj = (so: string) => rows.find(r => r.so === so)!;

    // Gộp dữ liệu theo ngày duy nhất
    const tableNames = comboKey.split('&');
    let merged: any[] = [];
    for (const t of tableNames) {
      const tableData = data[t] || [];
      merged = merged.concat(tableData);
    }
    console.log('[computeThongKe] comboKey:', comboKey, 'merged rows:', merged.length, 'sample:', merged[0]);
    // Lọc theo điều kiện ngày & loại tìm (Theo Kỳ: filter thứ)
    const tuYMD = formatYMD(config.tuNgay);
    const denYMD = formatYMD(config.denNgay);
    console.log('[computeThongKe] Filter range:', tuYMD, '<= field_ngay <=', denYMD);
    merged = merged.filter(r => r.field_ngay >= tuYMD && r.field_ngay <= denYMD); // Đổi < thành <=
    console.log('[computeThongKe] After date filter:', merged.length, 'rows');
    if (config.loaiTim === 1) { // Theo Kỳ => filter weekday của ngày đến
      const targetThu = config.thuTuan;
      merged = merged.filter(r => {
        const d = parseDate(r.field_ngay, 'yyyymmdd');
        return dayMap[d.getDay()] === targetThu;
      });
    }
    // Unique ngày (descending newest first)
    const uniqueByNgay: any[] = [];
    merged.sort((a, b) => b.field_ngay.localeCompare(a.field_ngay)).forEach(r => {
      if (!uniqueByNgay.some(x => x.field_ngay === r.field_ngay)) uniqueByNgay.push(r);
    });

    let cycleIndex = 0;
    for (const ngayRow of uniqueByNgay) {
      cycleIndex++;
      if (cycleIndex > chuKy) break;
      Object.keys(ngayRow).forEach(field => {
        if (!(field === '_id' || field === 'id' || field === 'thu' || field === 'field_ngay')) {
          const val = (ngayRow as any)[field];
          if (typeof val === 'string' && val.trim()) {
            const so = val.trim().slice(-2); // 2 số cuối
            const obj = soToObj(so);
            const kField = `k_${cycleIndex}`;
            obj[kField] = (obj[kField] ? obj[kField] + 1 : 1); // tăng count trong kỳ
          }
        }
      });
    }
    
    console.log('[computeThongKe] comboKey:', comboKey, 'uniqueByNgay:', uniqueByNgay.length, 'first row sample:', rows[0]);

    // Tính toán dem / tong / kxh / lauNhat (lich_su) + thoaMan (theo thong_ke_moi)
    rows.forEach(r => {
      let dem = 0, tong = 0, flagMiss = true, kxh = 0, currentMiss = 0, maxMiss = 0;
      for (let k = 1; k <= chuKy; k++) {
        const val = r[`k_${k}`];
        if (val && val > 0) {
          tong += val; dem++; flagMiss = false; if (currentMiss > maxMiss) maxMiss = currentMiss; currentMiss = 0;
        } else { if (flagMiss) kxh++; currentMiss++; }
      }
      if (currentMiss > maxMiss) maxMiss = currentMiss;
      r.dem = dem; r.tong = tong; r.kxh = kxh; r.lauNhat = maxMiss;
      // thoa_man nâng cao (dựa trên order mang_ky theo sapXep)
      const orderedFields = getCycleFields();
      let kxh_ht = 0; let kxh_ln = 0; let khoi_dong = -1; let so_lan = 0; let so_lan_trung = 0; let xet_tiep = true;
      for (let idx = 0; idx < orderedFields.length; idx++) {
        const v = r[orderedFields[idx]] || 0;
        if (v > 0) {
          if (kxh_ht > kxh_ln) kxh_ln = kxh_ht;
          // Logic đặc biệt: nếu trúng ngay từ đầu (kxh_ht === 0) và chưa có khoi_dong => dừng xet_tiep
          if (kxh_ht === 0 && khoi_dong === -1) xet_tiep = false;
          if (khoi_dong === -1) khoi_dong = kxh_ht;
          if (xet_tiep && kxh_ht > 0) {
            if (kxh_ht <= khoi_dong) { so_lan++; if (kxh_ht === khoi_dong) so_lan_trung++; }
            else { (r as any).kxh_sc = kxh_ht; xet_tiep = false; }
          }
          kxh_ht = 0;
        } else {
          kxh_ht++;
        }
        if (idx === orderedFields.length - 1 && kxh_ht > kxh_ln) kxh_ln = kxh_ht;
      }
      (r as any).thoaMan = (khoi_dong >= config.kxhTu && khoi_dong <= config.kxhDen && so_lan > 1);
      if (config.kxhLocSau && so_lan_trung <= 1) (r as any).thoaMan = false;
    });
    return rows;
  };

  /** Tính các bảng đặc biệt cho tab KQ (laySoKy, kxhPhaiLonHon, demNhoHon, demLonHon/demToNhoHon, lịch sử số chủ) */
  const computeKetQuaBlocks = (comboKey: string, baseRows: ThongKeRow): KetQuaBlock => ({ });

  // Helper xây dựng biểu diễn chuỗi cho Thống Kê Mới (theo đúng logic Vue)
  const buildBieuDien = (r: ThongKeRow): string => {
    const orderedFields = getCycleFields();
    let bieu_dien = '';
    let kxh_ht = 0;
    let khoi_dong = -1;
    let so_lan = 0;
    let xet_tiep = true;
    let ra_tiep = 0;
    
    for (let k = 0; k < orderedFields.length; k++) {
      const kq = (r as any)[orderedFields[k]] || 0;
      if (kq > 0) {
        ra_tiep++;
        // Điều kiện đặc biệt để set khoi_dong
        if (kxh_ht === 0 && khoi_dong === -1) xet_tiep = false;
        if (khoi_dong === -1) khoi_dong = kxh_ht;
        
        if (xet_tiep && kxh_ht > 0) {
          if (kxh_ht <= khoi_dong) {
            so_lan++;
          } else {
            // Vượt quá khoi_dong => dừng xet_tiep
            xet_tiep = false;
          }
          bieu_dien += (bieu_dien ? ',' : '') + kxh_ht;
        }
        kxh_ht = 0;
      } else {
        // Miss: thêm các số 0 tương ứng với ra_tiep - 1
        if (xet_tiep) {
          for (let rt = 0; rt < ra_tiep - 1; rt++) {
            bieu_dien += (bieu_dien ? ',0' : '0');
          }
        }
        ra_tiep = 0;
        kxh_ht++;
      }
    }
    return bieu_dien;
  };

  // Thống Kê Mới: dùng computeThongKe + thêm bieu_dien
  const computeThongKeMoi = (comboKey: string, dataSource?: Record<string, any[]>): ThongKeRow[] => {
    const rows = computeThongKe(comboKey, dataSource);
    rows.forEach(r => { (r as any).bieu_dien = buildBieuDien(r); });
    return rows;
  };

  /*** Xây dựng danh sách tab theo logic Vue (bao gồm tab đơn theo từng đài và tab kết hợp) */
  const buildTabsForMode = (currentMode: 'TK' | 'TK_MOI'): TabItem[] => {
    const tabs: TabItem[] = [];
    const dsBase = [...dsDaiChon];
    
    // Lịch sử số chủ tab nếu có
    if (soChu.length > 0 && dsDaiSoChuChon.length > 0) {
      const tenLichSu = dsDaiSoChuChon
        .map(code => danhSachDai.find(d => d.du_lieu_dai === code)?.ten_dai || code)
        .join(' & ');
      tabs.push({ key: 'lich_su_so_chu', label: 'Lịch Sử Số Chủ', tenDai: tenLichSu, ketqua: false });
    }
    
    // Điều kiện tạo combo tabs và KQ tabs (từ Vue chay_thong_ke)
    // TK_MOI: luôn có KQ tabs
    // TK: chỉ có KQ tabs khi có điều kiện lọc
    const hasFilterCondition = (config.laySoKy + config.demBeHon + config.kxhPhaiLonHon + config.demNhoHon > 0) || 
                               (config.demLonHon > 0 && soChu.length > 0);
    const shouldGenerateCombosAndKQ = (currentMode === 'TK_MOI') || hasFilterCondition;
    
    if (shouldGenerateCombosAndKQ) {
      // Vue logic: ds_dai_chonN = copy(ds_dai_chon) + combos
      // Bước 1: Copy singles vào ds_dai_chonN
      const dsDaiChonN: Array<{stt: string, dai: string, ten_dai: string}> = dsBase.map(st => {
        const label = danhSachDai.find(d => d.du_lieu_dai === st)?.ten_dai || st;
        return { stt: st, dai: label, ten_dai: label };
      });
      
      // Bước 2: Generate combos và PUSH thêm vào dsDaiChonN
      const combos = buildUniqueCombinations(dsBase, config.loaiThongKe);
      combos.forEach(comboArr => {
        // Skip combo size=1 vì đã có trong dsDaiChonN từ dsBase ban đầu
        if (comboArr.length > 1) {
          const stt = comboArr.join('&');
          const dai = comboArr.map(st => danhSachDai.find(d => d.du_lieu_dai === st)?.ten_dai || st).join(' & ');
          dsDaiChonN.push({ stt, dai, ten_dai: dai });
        }
      });
      
      // Bước 3: Loop dsDaiChonN để tạo tabs: tab chính + KQ tab
      dsDaiChonN.forEach(o => {
        tabs.push({ key: o.stt, label: o.dai, tenDai: o.ten_dai, ketqua: false });
        if (o.stt !== 'lich_su_so_chu') {
          tabs.push({ key: 'kq_' + o.stt, label: 'KQ ' + o.dai, tenDai: o.ten_dai, ketqua: true });
        }
      });
    } else {
      // TK mode KHÔNG có điều kiện lọc: CHỈ tạo single station tabs, KHÔNG có KQ, KHÔNG có combo
      dsBase.forEach(st => {
        const label = danhSachDai.find(d => d.du_lieu_dai === st)?.ten_dai || st;
        tabs.push({ key: st, label, tenDai: label, ketqua: false });
      });
    }
    
    return tabs;
  };

  // Mặc định dùng mode hiện tại
  const buildTabs = (): TabItem[] => buildTabsForMode(mode);

  // Main thống kê function (port từ Vue chay_thong_ke)
  const chayThongKe = async () => {
    // Validation
    if (dsDaiChon.length === 0) {
      message.warning("Vui lòng Chọn Đài trước");
      return;
    }
    
    const daysDiff = diffDays(config.denNgay.format("DD/MM/YYYY"), config.tuNgay.format("DD/MM/YYYY"));
    if (daysDiff < 28) {
      message.warning("Vui lòng lại thời gian dài hơn 28 ngày");
      return;
    }

    if (dsDaiChon.length < config.loaiThongKe) {
      message.warning("Vui lòng chọn thêm đài cần xem cho Chọn Đài");
      return;
    }

  setLoading(true);
  setMode('TK');
    setProgressPercent(0);
    setProgressStatus("Đang xử lý thống kê...");

    try {
      // Bước 1: tải dữ liệu các đài
      setProgressStatus('Đang tải dữ liệu đài...');
      const loadedData = await loadDuLieuDai(); // Nhận data trả về
      setProgressPercent(30);

      // Bước 2: xây dựng danh sách tab
      setProgressStatus('Xây dựng tabs...');
      const tabs = buildTabsForMode('TK'); // Truyền trực tiếp mode thay vì dùng state
      setTabItems(tabs);
      setActiveTabKey(tabs[0]?.key || '');
      setProgressPercent(50);

      // Bước 3: tính thống kê từng tab (lazy compute khi render để giảm tải)
      setProgressStatus('Tính toán dữ liệu thống kê...');
      const blocks: Record<string, KetQuaBlock> = {};
      // Lịch sử số chủ (nếu có tab)
      if (tabs.find(t => t.key === 'lich_su_so_chu')) {
        blocks['lich_su_so_chu'] = { lichSuSoChu: computeLichSuSoChu() };
      }
      // Tính cho từng combo chính và tab KQ
      for (const t of tabs) {
        if (t.key === 'lich_su_so_chu') continue;
        const comboKey = t.key.startsWith('kq_') ? t.key.replace(/^kq_/, '') : t.key;
        const baseRows = computeThongKe(comboKey, loadedData); // Truyền loadedData
        if (!blocks[comboKey]) blocks[comboKey] = {};
        blocks[comboKey].demLonHon = baseRows; // lưu thô để tái sử dụng (sẽ refine nếu cần)
        if (t.ketqua) {
          const kqBlock: KetQuaBlock = {};
          if (config.laySoKy > 0) kqBlock.laySoKy = computeKQ1Rows(baseRows).data;
          if (config.kxhPhaiLonHon > 0) kqBlock.kxhPhaiLonHon = computeKQ2Rows(baseRows).data;
          if (config.demNhoHon > 0) kqBlock.demNhoHon = computeKQ3Rows(baseRows).data;
          blocks['kq_' + comboKey] = kqBlock;
        }
      }
      setKetQuaBlocks(blocks);
      setProgressPercent(85);

      setProgressStatus('Hoàn thành thống kê!');
      setProgressPercent(100);
      message.success('Thống kê đã hoàn thành');
    } catch (e) {
      console.error(e);
      message.error('Lỗi khi chạy thống kê');
    } finally { setLoading(false); }
  };

  // Render bảng thống kê cho mỗi tab
  const renderThongKe = (tabKey: string) => {
    console.log('[renderThongKe] tabKey:', tabKey, 'mode:', mode, 'ketQuaBlocks keys:', Object.keys(ketQuaBlocks));
    // Tab lịch sử số chủ
    if (tabKey === 'lich_su_so_chu') {
      const lichSu: LichSuRow[] = ketQuaBlocks['lich_su_so_chu']?.lichSuSoChu || [];
      console.log('[renderThongKe] Lịch sử số chủ:', lichSu.length, 'rows');
      return <Table size="small" bordered rowKey="id" columns={[
        { title: 'Ngày', dataIndex: 'ngay', key: 'ngay' },
        { title: 'Số Kỳ', dataIndex: 'so_ky', key: 'so_ky', width: 80 }
      ]} dataSource={lichSu} pagination={false} />;
    }
    const isKetQua = tabKey.startsWith('kq_');
    const comboKey = isKetQua ? tabKey.replace(/^kq_/, '') : tabKey;
    const baseRows = ketQuaBlocks[comboKey]?.demLonHon as ThongKeRow[] || computeThongKe(comboKey);
    console.log('[renderThongKe] comboKey:', comboKey, 'isKetQua:', isKetQua, 'baseRows:', baseRows.length, 'rows');
    // Lấy tên đài từ tabItems
    const tabInfo = tabItems.find(t => t.key === tabKey || t.key === comboKey || t.key === ('kq_' + comboKey));
    const tenDai = tabInfo?.tenDai || comboKey;
    // Caption khác nhau giữa TK và TK_MOI
    const tieuDeChung = (() => {
      if (isKetQua && mode === 'TK_MOI') {
        // TK_MOI KQ tabs: "Thứ X DD/MM/YYYY TênĐài"
        const weekday = dayMap[config.denNgay.toDate().getDay()];
        return `${weekday} ${config.denNgay.format('DD/MM/YYYY')} ${tenDai}`;
      }
      // Các trường hợp khác: "Thứ Tuần DD/MM/YYYY TênĐài"
      return `${config.thuTuan} ${config.denNgay.format('DD/MM/YYYY')} ${tenDai}`;
    })();
    
    // Base columns KHÔNG bao gồm cycle columns (dùng cho KQ tabs)
    const baseColumnsNoKy: ColumnsType<ThongKeRow> = [
      { title: 'Tổng', dataIndex: 'tong', width: 70, align:'center' },
      { title: 'Số Lần', dataIndex: 'dem', width: 70, align:'center' },
      { title: 'KXH', dataIndex: 'kxh', width: 70, align:'center' },
      { title: 'Lâu Nhất', dataIndex: 'lauNhat', width: 90, align:'center' },
      { title: 'Số', dataIndex: 'so', width: 60, align:'center', render: (t) => <strong>{t}</strong> },
    ];
    
    // Columns WITH cycle columns (dùng cho tab thông thường)
    const columnsWithKy: ColumnsType<ThongKeRow> = [...baseColumnsNoKy];
    for (let i = 1; i <= config.chuKy; i++) {
      const field = config.sapXep === 0 ? i : config.chuKy - i + 1;
      columnsWithKy.push({
        title: field.toString(),
        dataIndex: `k_${field}`,
        width: 40,
        align:'center',
        onCell: (rec: any) => {
          const v = rec[`k_${field}`] || 0;
          return v > 0 ? { style: { background: config.mauTo } } : {};
        }
      });
    }
    console.log('[renderThongKe] columnsWithKy count:', columnsWithKy.length, 'chuKy:', config.chuKy, 'sapXep:', config.sapXep);
    console.log('[renderThongKe] Sample row data:', baseRows[0]);
    
    // Tab thông thường (không phải KQ)
    if (!isKetQua) {
      return <><div style={{fontWeight:600,margin:'6px 0'}}>{tieuDeChung}</div><Table size="small" bordered rowKey="id" dataSource={baseRows} columns={columnsWithKy} pagination={{ pageSize: 100 }} scroll={{ x: 'max-content' }} rowClassName={r => (soChu.includes(r.so) && config.demLonHon>0 && soChu.length>0 ? 'to-mau' : (r as any).thoaMan ? 'to-mau' : '')} /></>;
    }
    
    // KQ tabs: Logic khác nhau giữa TK_MOI và TK
    if (mode === 'TK_MOI') {
      // TK_MOI KQ tabs: CHỈ hiển thị 1 bảng với filter thoaMan và cột bieu_dien (KHÔNG có cycle columns)
      const kqColumns = [...baseColumnsNoKy];
      kqColumns.push({ title: 'Kết Quả', dataIndex: 'bieu_dien', width: 160, align: 'center' });
      const dataTong = baseRows.filter(r => (r as any).thoaMan);
      return (
        <>
          <div style={{fontWeight:600,margin:'6px 0'}}>{tieuDeChung}</div>
          <Table size="small" bordered rowKey="id" dataSource={dataTong} columns={kqColumns} pagination={false} scroll={{ x: 'max-content' }} />
        </>
      );
    }
    
    // TK mode KQ tabs
    const block = ketQuaBlocks['kq_' + comboKey] || {};
    
    // Nếu cấu hình đếm số chủ -> hiển thị lưới 4-khối giống Vue
    if (config.demLonHon > 0) {
      const grid = computeDemLonHonGrid(baseRows);
      const tieuDe = (() => {
        const ten = tabInfo?.tenDai || comboKey;
        // Vue logic: tenDai [start]-[chuKy]-[demLonHon]
        if (config.chuKy > 0) {
          if (config.sapXep === 0) return `${ten} 1-${config.chuKy}-${config.demLonHon}`;
          return `${ten} ${config.chuKy}-1-${config.demLonHon}`;
        }
        return ten;
      })();
      return (
        <div>
          <div style={{fontWeight:600,margin:'6px 0'}}>{tieuDeChung}</div>
          <Table key="grid4" size="small" bordered rowKey="id" dataSource={grid.data} columns={grid.columns as any} pagination={false} scroll={{ x: 'max-content' }} />
        </div>
      );
    }
    
    // Ngược lại hiển thị các bảng KQ1/KQ2/KQ3 theo cấu hình
    const elements: React.ReactNode[] = [];
    if (block.laySoKy) {
      const kq1 = computeKQ1Rows(baseRows);
      const tieu_de1 = (() => {
        const ten = tabItems.find(t => t.key === comboKey || t.key === ('kq_'+comboKey))?.tenDai || comboKey;
        if (config.chuKy > 0) {
          if (config.sapXep === 0) return `${ten} 1-${config.chuKy}-${config.laySoKy} ${config.thuTuan} ${config.denNgay.format('DD/MM/YYYY')}`;
          return `${ten} ${config.chuKy}-1-${config.laySoKy} ${config.thuTuan} ${config.denNgay.format('DD/MM/YYYY')}`;
        }
        return ten;
      })();
      elements.push(
        <React.Fragment key="kq1">
          <div style={{fontWeight:600,margin:'6px 0'}}>{tieu_de1}</div>
          <Table key="kq1" size="small" bordered rowKey="id" dataSource={kq1.data} columns={kq1.columns} pagination={false} style={{ marginBottom:16 }} />
        </React.Fragment>
      );
    }
    if (block.kxhPhaiLonHon) {
      const kq2 = computeKQ2Rows(baseRows);
      const tieu_de2 = (() => {
        const ten = tabItems.find(t => t.key === comboKey || t.key === ('kq_'+comboKey))?.tenDai || comboKey;
        if (config.chuKy > 0) return `${ten} 1-${config.chuKy}-${config.kxhPhaiLonHon}`;
        return ten;
      })();
      elements.push(
        <React.Fragment key="kq2">
          <div style={{fontWeight:600,margin:'6px 0'}}>{tieu_de2}</div>
          <Table key="kq2" size="small" bordered rowKey="id" dataSource={kq2.data} columns={kq2.columns} pagination={false} style={{ marginBottom:16 }} />
        </React.Fragment>
      );
    }
    if (block.demNhoHon) {
      const kq3 = computeKQ3Rows(baseRows);
      const tieu_de3 = (() => {
        const ten = tabItems.find(t => t.key === comboKey || t.key === ('kq_'+comboKey))?.tenDai || comboKey;
        if (config.chuKy > 0) return `${ten} 1-${config.chuKy}-${config.demNhoHon}`;
        return ten;
      })();
      elements.push(
        <React.Fragment key="kq3">
          <div style={{fontWeight:600,margin:'6px 0'}}>{tieu_de3}</div>
          <Table key="kq3" size="small" bordered rowKey="id" dataSource={kq3.data} columns={kq3.columns} pagination={false} style={{ marginBottom:16 }} />
        </React.Fragment>
      );
    }
    return <div>{elements}</div>;
  };

  // Dummy logic for statistics (replace with real logic)
  const thongKe = async () => {
    await chayThongKe();
  };

  // Thống Kê Mới: luôn có tab KQ và thêm cột Kết Quả (biểu diễn)
  const thongKeMoi = async () => {
    if (dsDaiChon.length === 0) {
      message.warning("Vui lòng Chọn Đài trước");
      return;
    }
    const daysDiff = diffDays(config.denNgay.format("DD/MM/YYYY"), config.tuNgay.format("DD/MM/YYYY"));
    if (daysDiff < 28) {
      message.warning("Vui lòng lại thời gian dài hơn 28 ngày");
      return;
    }
    if (dsDaiChon.length < config.loaiThongKe) {
      message.warning("Vui lòng chọn thêm đài cần xem cho Chọn Đài");
      return;
    }
    setLoading(true);
    setMode('TK_MOI');
    setProgressPercent(0);
    setProgressStatus("Đang xử lý thống kê mới...");
    try {
      setProgressStatus('Đang tải dữ liệu đài...');
      const loadedData = await loadDuLieuDai(); // Nhận data trả về
      setProgressPercent(30);
      setProgressStatus('Xây dựng tabs...');
      const tabs = buildTabsForMode('TK_MOI'); // Truyền trực tiếp mode thay vì dùng state
      setTabItems(tabs);
      setActiveTabKey(tabs[0]?.key || '');
      setProgressPercent(50);
      setProgressStatus('Tính toán dữ liệu thống kê...');
      const blocks: Record<string, KetQuaBlock> = {};
      if (tabs.find(t => t.key === 'lich_su_so_chu')) {
        blocks['lich_su_so_chu'] = { lichSuSoChu: computeLichSuSoChu() };
      }
      for (const t of tabs) {
        if (t.key === 'lich_su_so_chu') continue;
        const comboKey = t.key.startsWith('kq_') ? t.key.replace(/^kq_/, '') : t.key;
        const baseRows = computeThongKeMoi(comboKey, loadedData); // Truyền loadedData
        if (!blocks[comboKey]) blocks[comboKey] = {};
        blocks[comboKey].demLonHon = baseRows;
        if (t.ketqua) {
          const kqBlock: KetQuaBlock = {};
          if (config.laySoKy > 0) kqBlock.laySoKy = computeKQ1Rows(baseRows).data;
          if (config.kxhPhaiLonHon > 0) kqBlock.kxhPhaiLonHon = computeKQ2Rows(baseRows).data;
          if (config.demNhoHon > 0) kqBlock.demNhoHon = computeKQ3Rows(baseRows).data;
          blocks['kq_' + comboKey] = kqBlock;
        }
      }
      setKetQuaBlocks(blocks);
      setProgressPercent(85);
      setProgressStatus('Hoàn thành thống kê mới!');
      setProgressPercent(100);
      message.success('Thống kê Mới đã hoàn thành');
    } catch (e) {
      console.error(e);
      message.error('Lỗi khi chạy thống kê mới');
    } finally { setLoading(false); }
  };

  // Render result table (dummy, replace with real matrix)
  const renderBangThongKe = (rows: ThongKeRow[]) => (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
      <thead>
        <tr>
          <th>Số</th>
          <th>Tổng</th>
          <th>Số lần</th>
          <th>KXH</th>
          <th>Lâu nhất</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={idx}>
            <td>{row.so}</td>
            <td>{row.tong}</td>
            <td>{row.dem}</td>
            <td>{row.kxh}</td>
            <td>{row.lauNhat}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Hàm tải lại dữ liệu thống kê
  const loadThongKeData = async () => {
    try {
      // Sử dụng SSR endpoint để lấy dữ liệu thống kê
      // Ví dụ: lấy dữ liệu từ các đài đã chọn trong khoảng ngày
      if (dsDaiChon.length === 0) {
        setThongKeData([]);
        return;
      }
      const tuNgay = config.tuNgay.format("YYYYMMDD");
      const denNgay = config.denNgay.format("YYYYMMDD");
      // Gộp dữ liệu từ các đài đã chọn
      let allRows: any[] = [];
      for (const tableName of dsDaiChon) {
        const rows = await import("#src/api/kqxs_service").then(mod => mod.fetchKQXSTableRange<any>(tableName, tuNgay, denNgay));
        allRows = allRows.concat(rows);
      }
      // Xử lý thống kê cơ bản: đếm số lần xuất hiện của từng số cuối (00-99)
      const thongKe: any[] = Array.from({ length: 100 }, (_, i) => ({
        so: i.toString().padStart(2, '0'),
        tong: 0,
        dem: 0,
        kxh: 0,
        lauNhat: 0
      }));
      allRows.forEach(row => {
        Object.keys(row).forEach(field => {
          if (!(field === '_id' || field === 'id' || field === 'thu' || field === 'field_ngay')) {
            const val = row[field];
            if (typeof val === 'string' && val.trim()) {
              const so = val.trim().slice(-2);
              const obj = thongKe.find(r => r.so === so);
              if (obj) {
                obj.tong++;
                obj.dem++;
              }
            }
          }
        });
      });
      setThongKeData(thongKe);
    } catch (err) {
      setThongKeData([]);
    }
  };

  // Tự động tải lại dữ liệu khi đổi ngày hoặc đổi danh sách đài số chủ hoặc thứ tuần
  useEffect(() => {
    loadThongKeData();
  }, [config.tuNgay, config.denNgay, dsDaiSoChuChon, config.thuTuan]);

  return (
    <Card title="Thống kê KQXS">
      <Row gutter={[24, 16]}>
        {/* Cột trái chứa các tham số */}
        <Col xl={18} lg={16} md={24} sm={24} xs={24}>
          <Row gutter={[16, 16]}>
            {/* Hàng 1: Các trường lọc chính */}
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Từ Ngày</label>
              <DatePicker
                value={config.tuNgay}
                onChange={date => {
                  if (date) {
                    updateConfig('tuNgay', date);
                    loadThongKeData();
                  }
                }}
                style={{ width: "100%" }}
                format="DD/MM/YYYY"
              />
            </Col>
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Đến Ngày</label>
              <DatePicker
                value={config.denNgay}
                onChange={date => {
                  if (date) {
                    updateConfig('denNgay', date);
                    loadThongKeData();
                  }
                }}
                style={{ width: "100%" }}
                format="DD/MM/YYYY"
              />
            </Col>
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Loại Thống Kê</label>
              <Select value={config.loaiThongKe} onChange={val => updateConfig('loaiThongKe', val)} style={{ width: "100%" }} options={[
                { value: 1, label: "Thống kê KQ 1 Đài" },
                { value: 2, label: "Thống kê KQ 2 Đài" },
                { value: 3, label: "Thống kê KQ 3 Đài" }
              ]} />
            </Col>
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Chọn Đài</label>
              <Select 
                mode="multiple" 
                value={dsDaiChon} 
                onChange={setDsDaiChon}
                style={{ width: "100%" }} 
                options={daiFiltered.map(dai => ({ value: dai.du_lieu_dai, label: dai.ten_dai }))} 
                placeholder="Chọn đài" 
              />
            </Col>

            {/* Hàng 2: Miền và Loại tìm */}
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Miền</label>
              <Select value={config.mien} onChange={val => {
                updateConfig('mien', val);
                setDsDaiChon([]);
                setDsDaiSoChuChon([]);
                // Update thuTuan based on tuNgay
                const dayMap = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
                updateConfig('thuTuan', dayMap[config.tuNgay.day()]);
              }} style={{ width: "100%" }} options={[
                { value: "MN", label: "Miền Nam" },
                { value: "MT", label: "Miền Trung" },
                { value: "MB", label: "Miền Bắc" }
              ]} />
            </Col>
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Loại Tìm</label>
              <Select value={config.loaiTim} onChange={val => updateConfig('loaiTim', val)} style={{ width: "100%" }} options={[
                { value: 0, label: "Theo Ngày" },
                { value: 1, label: "Theo Kỳ" }
              ]} />
            </Col>
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Chu Kỳ</label>
              <InputNumber min={1} max={365} value={config.chuKy} onChange={val => val !== null && updateConfig('chuKy', val)} style={{ width: "100%" }} />
            </Col>
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Lấy số Kỳ</label>
              <InputNumber min={1} max={365} value={config.laySoKy} onChange={val => val !== null && updateConfig('laySoKy', val)} style={{ width: "100%" }} />
            </Col>

            {/* Hàng 3: Các điểm KQ */}
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Điểm KQ1 &lt;=</label>
              <InputNumber min={0} max={100} value={config.demBeHon} onChange={val => val !== null && updateConfig('demBeHon', val)} style={{ width: "100%" }} />
            </Col>
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>KXH KQ2 &gt;=</label>
              <InputNumber min={0} max={100} value={config.kxhPhaiLonHon} onChange={val => val !== null && updateConfig('kxhPhaiLonHon', val)} style={{ width: "100%" }} />
            </Col>
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Điểm KQ3 &lt;=</label>
              <InputNumber min={0} max={100} value={config.demNhoHon} onChange={val => val !== null && updateConfig('demNhoHon', val)} style={{ width: "100%" }} />
            </Col>
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Màu Tô</label>
              <ColorPicker 
                value={config.mauTo} 
                onChange={(color) => updateConfig('mauTo', color.toHexString())}
                showText
                style={{ width: "100%" }} 
              />
            </Col>

            {/* Hàng 4: Thứ tuần, Sắp xếp, Đếm */}
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Thứ Tuần</label>
              <Select 
                value={config.thuTuan} 
                disabled
                style={{ width: "100%" }} 
                options={[
                  { value: "T2", label: "Thứ 2" },
                  { value: "T3", label: "Thứ 3" },
                  { value: "T4", label: "Thứ 4" },
                  { value: "T5", label: "Thứ 5" },
                  { value: "T6", label: "Thứ 6" },
                  { value: "T7", label: "Thứ 7" },
                  { value: "CN", label: "Chủ Nhật" }
                ]} 
              />
            </Col>
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Sắp Xếp</label>
              <Select value={config.sapXep} onChange={val => updateConfig('sapXep', val)} style={{ width: "100%" }} options={[
                { value: 0, label: "Ngày mới đứng trước" },
                { value: 1, label: "Ngày cũ đứng trước" }
              ]} />
            </Col>
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Đếm Số Chủ &gt;=</label>
              <InputNumber min={0} max={100} value={config.demLonHon} onChange={val => val !== null && updateConfig('demLonHon', val)} style={{ width: "100%" }} />
            </Col>
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Đếm Số Lần &lt;=</label>
              <InputNumber min={0} max={100} value={config.demToNhoHon} onChange={val => val !== null && updateConfig('demToNhoHon', val)} style={{ width: "100%" }} />
            </Col>

            {/* Hàng 5: Max LSBD, Lịch Sử, Tìm Số Chủ */}
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Max LSBD &gt;=</label>
              <InputNumber min={0} max={100} value={config.lsBatDau} onChange={val => val !== null && updateConfig('lsBatDau', val)} style={{ width: "100%" }} />
            </Col>
            <Col xl={12} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Lịch Sử Số Chủ</label>
              <Select 
                mode="multiple" 
                value={dsDaiSoChuChon} 
                onChange={val => {
                  setDsDaiSoChuChon(val);
                  loadThongKeData();
                }}
                style={{ width: "100%" }} 
                options={daiFiltered.map(dai => ({ value: dai.du_lieu_dai, label: dai.ten_dai }))} 
                placeholder="Chọn đài số chủ" 
              />
            </Col>
            <Col xl={6} lg={12} md={12} sm={12} xs={24}>
              <label style={labelStyle}>Tìm Số Chủ</label>
              <Input 
                placeholder="__-__-__-__-__-__" 
                style={{ width: "100%" }}
                onChange={(e) => handleSoChuChange(e.target.value)}
              />
            </Col>
          </Row>
        </Col>

        {/* Cột phải chứa khối KXH và nút bấm */}
        <Col xl={6} lg={8} md={24} sm={24} xs={24}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
            <div style={{ 
              border: '1px solid #1890ff',
              borderRadius: '6px',
              padding: '16px',
              backgroundColor: 'rgba(24,144,255,0.02)'
            }}>
              <Row gutter={[12, 12]}>
                <Col span={24} sm={12}>
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <label style={labelStyle}>KXH Từ &gt;=</label>
                    <InputNumber min={0} max={100} value={config.kxhTu} onChange={val => val !== null && updateConfig('kxhTu', val)} style={{ width: "100%" }} />
                  </Space>
                </Col>
                <Col span={24} sm={12}>
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <label style={labelStyle}>KXH Đến &lt;=</label>
                    <InputNumber min={0} max={100} value={config.kxhDen} onChange={val => val !== null && updateConfig('kxhDen', val)} style={{ width: "100%" }} />
                  </Space>
                </Col>
                <Col span={24}>
                  <Space direction="vertical" style={{ width: "100%", marginTop: 8 }}>
                    <label style={labelStyle}>Lọc Sâu</label>
                    <Select 
                      value={config.kxhLocSau} 
                      onChange={val => updateConfig('kxhLocSau', val)}
                      style={{ width: "100%" }} 
                      options={[
                        { value: true, label: "Có" },
                        { value: false, label: "Không" }
                      ]} 
                    />
                  </Space>
                </Col>
              </Row>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <Button type="primary" onClick={() => thongKe()} loading={loading} block>
                Thống Kê
              </Button>
              <Button type="primary" onClick={() => thongKeMoi()} loading={loading} block>
                Thống Kê Mới
              </Button>
            </div>
          </div>
        </Col>
      </Row>
      {loading && (
        <Row style={{ marginTop: 16 }}>
          <Col span={24}>
            <Progress percent={progressPercent} status={progressPercent === 100 ? "success" : "active"} format={() => progressStatus} />
          </Col>
        </Row>
      )}
      {!loading && tabItems.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <Tabs
            activeKey={activeTabKey}
            onChange={setActiveTabKey}
            items={tabItems.map(tab => ({
              key: tab.key,
              label: tab.label,
              children: renderThongKe(tab.key)
            }))}
          />
        </div>
      )}
    </Card>
  );
};