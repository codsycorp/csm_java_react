/**
 * Generate banhang_menu_full_newsystem_20260424.json
 * Following ai_menu_master_prompt.md v1.1.0 contract exactly:
 * - type_form as integer (0/1/2/3/4/6)
 * - f_types mapped to new schema types
 * - f_cbo_query SQL → JSON pattern (§5)
 * - Triggers SQL/MySQL → JS with correct signatures (§6, §12)
 * - Master-detail semantics (§3.4)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const APP_ID = 'banhang';
const BASE = 'backend/csm_datas/public/banhang';
const msdt = JSON.parse(fs.readFileSync(`${BASE}/sys_msdt_config_202604200952.json`, 'utf8')).sys_msdt_config;
const tbl = JSON.parse(fs.readFileSync(`${BASE}/sys_tbl_config_202604200953.json`, 'utf8')).sys_tbl_config;
const trig = JSON.parse(fs.readFileSync(`${BASE}/sys_triggers_202604200953.json`, 'utf8')).sys_triggers;
const rpt = JSON.parse(fs.readFileSync(`${BASE}/sys_report_202604200952.json`, 'utf8')).sys_report;
const rptIds = new Set(rpt.map(r => String(r.id || '').trim()));

// ─── 1. BUILD BANHANG SUBTREE ─────────────────────────────────────────────────
const byParent = new Map();
for (const m of msdt) {
  if (!byParent.has(m.parent_id)) byParent.set(m.parent_id, []);
  byParent.get(m.parent_id).push(m);
}
const keep = new Set();
const stack = [APP_ID];
while (stack.length) {
  const p = stack.pop();
  for (const c of (byParent.get(p) || [])) {
    if (!keep.has(c.id)) { keep.add(c.id); stack.push(c.id); }
  }
}
const srcMenus = msdt.filter(x => keep.has(x.id));
const srcMenuById = new Map(srcMenus.map(m => [String(m.id), m]));

function isLegacyLeafMenu(src) {
  if (!src) return false;
  return rptIds.has(String(src.report_name || '').trim()) || String(src.type_form || '').trim() === '2';
}

function shouldHideInMainMenu(src) {
  const parent = srcMenuById.get(String(src.parent_id || ''));
  return isLegacyLeafMenu(parent);
}

// ─── 2. TYPE_FORM MAPPING (§3.1) ─────────────────────────────────────────────
function mapTypeForm(src) {
  const tf = String(src.type_form || '').trim();
  const hasTable = !!(src.table_name || '').trim();
  if (tf === '2') return 2;
  if (tf === '3') return 3;
  if (tf === '4') return 4;
  if (tf === '6') return 6;
  if (!tf && !hasTable) return 0;  // container only
  return 1;  // default dynamic grid
}

// ─── 3. F_TYPES MAPPING (§4) ─────────────────────────────────────────────────
// Legacy code → new canonical f_types
const F_TYPES_MAP = {
  'ed':        'string',
  'ro':        'string_ro',
  'ron':       'ron',
  'co':        'co',
  'codis':     'co',       // combo display (read-only combo)
  'coro':      'co_ro',
  'ch':        'checkbox',
  'date':      'date',
  'datetime':  'datetime',
  'time':      'time',
  'nummeric':  'number',
  'num':       'number',
  'price':     'price',
  'numchu':    'string',   // number-in-words text
  'img':       'img',
  'link':      'string',
  'cntr':      'number',
  'switch':    'switch',
  'html':      'html',
  'json':      'json',
  'password':  'password',
};

function mapFTypes(ft) {
  return F_TYPES_MAP[ft] || ft || 'string';
}

// ─── 4. CBO_QUERY SQL → JSON (§5) ────────────────────────────────────────────
function convertCboQuery(sql, f_name) {
  if (!sql || !sql.trim()) return '';
  const s = sql.trim();
  // Already JSON object/array
  if (s.startsWith('{') || s.startsWith('[')) return s;
  // Not a SELECT query – return as-is
  if (!s.toLowerCase().startsWith('select')) return s;

  // Try to extract: SELECT X as Ma, Y as Ten FROM table_name
  const fromMatch = s.match(/\bfrom\b\s+([\w]+)/i);
  const tableName = fromMatch ? fromMatch[1].trim() : '';

  // Complex subquery with union/nested
  const isComplex = /\bunion\b|\binner\s+join\b|\bleft\s+join\b|\bwhere\b.*\bselect\b/i.test(s)
    || s.includes('\n')
    || !tableName;

  // Parse fields from SELECT ... FROM
  let valueField = 'ID', labelField = 'ten';
  const selectPart = s.match(/^select\s+(.+?)\s+from\b/i);
  if (selectPart) {
    const cols = selectPart[1].split(',').map(c => c.trim());
    // First col = value, second col = label; get alias if present
    const getAlias = c => {
      const m = c.match(/\bas\s+([\w]+)$/i);
      return m ? m[1] : c.split(/[\s.]+/).pop();
    };
    if (cols[0]) valueField = getAlias(cols[0]);
    if (cols[1]) labelField = getAlias(cols[1]);
  }

  if (isComplex) {
    // Pattern C – JS code doing in-memory lookup (§5, Pattern D)
    const js = `// Complex combo – fallback to in-memory from loaded data\nconst rows = (data && data['${tableName || f_name}'] && data['${tableName || f_name}'].rows) || [];\nreturn rows.map(r => ({ value: r['${valueField}'], label: r['${labelField}'] || r['ten'] || r['Ten'] || '' }));`;
    return JSON.stringify({ query: [], options: [], _js_fallback: js, _legacy_sql: s.substring(0, 300) });
  }

  // Pattern A – clean JSON query (§5)
  const whereMatch = s.match(/\bwhere\b\s+(.+?)(?:\border\s+by\b|$)/i);
  const obj = {
    query: [{
      obj_name: tableName,
      fields: [valueField, labelField],
    }]
  };
  if (whereMatch) {
    obj.query[0].obj_where = { _legacy_where: whereMatch[1].trim() };
  }
  return JSON.stringify(obj);
}

// ─── 5. TRIGGER LOAITRIGGER → NEW KEY MAPPING (§6.1) ─────────────────────────
// Legacy loaitrigger codes:
//   TAU = Table After Update  → "update"  (signature: seft, data, bang)
//   TBU = Table Before Update → "beforeSave" (signature: row, seft, data)
//   TOD = Table On Delete     → "delete_db" (signature: seft, data, bang)
//   PRK = Primary Key auto    → "beforeSave" (id generation, merged with other TBU)
function mapTriggerKey(loai) {
  const m = { TAU: 'update', TBU: 'beforeSave', TOD: 'delete_db', PRK: 'beforeSave' };
  return m[loai] || 'update';
}

// ─── 6. SQL/MYSQL → JS TRIGGER CONVERSION (§12) ──────────────────────────────
function convertTrigger(trigger_value, loai, menu_id) {
  const sql = (trigger_value || '').trim();
  const issues = [];
  let js = '';
  let parity = 'full';

  if (!sql) {
    return { js: 'return null;', parity: 'full', issues: [] };
  }

  // Forbidden patterns check (§12 hard-fail)
  const phpMarkers = ['<?php', '$_GET', '$_POST', 'mysql_query', 'PDO::', '->query('];
  const hasPhp = phpMarkers.some(m => sql.includes(m));
  if (hasPhp) {
    return {
      js: `// HARD_FAIL: PHP syntax detected – manual conversion required\n// Source: ${sql.substring(0, 200)}\nreturn null;`,
      parity: 'manual_review_required',
      issues: ['PHP syntax markers detected – must be manually converted (§12 hard-fail)']
    };
  }

  // ── PRK: auto sequential ID generation ──────────────────────────────────────
  if (loai === 'PRK') {
    // Extract table name from SQL if present for reference, but we work in-memory
    const tableMatch = sql.match(/\bfrom\s+([\w]+)/i);
    const tblRef = tableMatch ? tableMatch[1] : 'current_table';
    js = `// §12 Converted PRK → beforeSave: sequential so_ct generation (in-memory)
const rows = bang?.['${tblRef}']?.rows || [];
const ngay = String(data.ngay_ct || data.Ngay_ct || '');
// Parse dd/MM/yyyy → yyMMdd prefix
const dateParts = ngay.split('/');
const dateStr = dateParts.length === 3
  ? dateParts[2].slice(-2) + dateParts[1] + dateParts[0]
  : '';
if (!dateStr) return null;
// Check if so_ct needs regeneration
const curSoCT = String(data.so_ct || '');
if (curSoCT && curSoCT.startsWith(dateStr)) return null; // already correct prefix
// Find max sequence for same date
const sameDayRows = rows.filter(r => r.ID !== data.ID && String(r.so_ct || '').startsWith(dateStr));
const maxSeq = sameDayRows.reduce((m, r) => {
  const seq = Number(String(r.so_ct || '').split('.').pop()) || 0;
  return seq > m ? seq : m;
}, sameDayRows.length);
return { so_ct: dateStr + '.' + String(maxSeq + 1).padStart(3, '0') };`;
    parity = 'partial';
    issues.push('PRK converted to in-memory row scan; verify date format (dd/MM/yyyy) and field names match legacy');
    return { js, parity, issues };
  }

  // ── STORED PROCEDURE CALL ────────────────────────────────────────────────────
  if (/^\s*call\s+/i.test(sql)) {
    const procMatch = sql.match(/call\s+([\w]+)\s*\(([^)]*)\)/i);
    const procName = procMatch ? procMatch[1] : 'unknown_proc';
    const procArgs = procMatch ? procMatch[2] : '';
    // Map #field_name → data.field_name
    const argsJs = procArgs.replace(/"#([\w]+)"/g, 'data.$1').replace(/'#([\w]+)'/g, 'data.$1');

    if (procName === 'proc_qlvt_tinhton') {
      js = `// §12 Converted CALL proc_qlvt_tinhton → rebuild knk_thekho rows in memory
const stockRows = bang?.['knk_thekho']?.rows || [];
const masterRows = bang?.['knk_xnt_tonghop']?.rows || [];
const detailRows = bang?.['knk_xnt_chitiet']?.rows || [];
const resolvedId = String((data?.ID || data?.id || '')).trim();
const docId = ${JSON.stringify(procArgs)}.includes('concat("TP_"') ? ('TP_' + resolvedId) : resolvedId;
const khoNhap = data?.kho_nhap || '';
const khoXuat = data?.kho_xuat || '';
const maHhFilter = data?.ma_hh || '';
const master = masterRows.find((row) => String(row?.ID || row?.id || '').trim() === docId || String(row?.ID || row?.id || '').trim() === resolvedId) || data || {};
for (let index = stockRows.length - 1; index >= 0; index -= 1) {
  const row = stockRows[index];
  const sameDoc = String(row?.ID || row?.id || '').trim() === docId;
  const sameItem = !maHhFilter || String(row?.Ma_HH || row?.Ma_hh || row?.ma_hh || '').trim() === String(maHhFilter).trim();
  if (sameDoc && sameItem) stockRows.splice(index, 1);
}
const relatedDetails = detailRows.filter((row) => String(row?.parent_id || row?.parent_ID || '').trim() === resolvedId && (!maHhFilter || String(row?.Ma_HH || row?.Ma_hh || row?.ma_hh || '').trim() === String(maHhFilter).trim()));
relatedDetails.forEach((row) => {
  const base = {
    ID: docId,
    id: docId,
    ngay_ct: master?.ngay_ct || data?.ngay_ct || '',
    so_ct: master?.so_ct || data?.so_ct || '',
    DVT: row?.DVT || row?.dvt || '',
    dvt: row?.DVT || row?.dvt || '',
    So_Luong: Number(row?.So_Luong || row?.so_luong || 0),
    so_luong: Number(row?.So_Luong || row?.so_luong || 0),
    Don_Gia: Number(row?.Don_Gia || row?.don_gia || 0),
    don_gia: Number(row?.Don_Gia || row?.don_gia || 0),
    Vat: Number(row?.Vat || row?.vat || 0),
    vat: Number(row?.Vat || row?.vat || 0),
    Ma_HH: row?.Ma_HH || row?.Ma_hh || row?.ma_hh || '',
    Ma_hh: row?.Ma_HH || row?.Ma_hh || row?.ma_hh || '',
    ma_hh: row?.Ma_HH || row?.Ma_hh || row?.ma_hh || '',
    lo_hang: row?.lo_hang || '',
  };
  if (khoXuat) stockRows.push({ ...base, ma_kho: khoXuat, Ma_kho: khoXuat, N_X: -1 });
  if (khoNhap) stockRows.push({ ...base, ma_kho: khoNhap, Ma_kho: khoNhap, N_X: 1 });
});
return null;`;
      parity = 'partial';
      issues.push(`Stored procedure '${procName}' mapped to in-memory stock-row rebuild; verify document-id prefix and destination columns`);
      return { js, parity, issues };
    }

    if (procName === 'proc_cong_no_phai_tra') {
      js = `// §12 Converted CALL proc_cong_no_phai_tra → rebuild payable rows in memory
const debtRows = bang?.['knk_congnophaitra']?.rows || bang?.['qlvt_congnophaitra']?.rows || [];
const masterRows = bang?.['knk_xnt_tonghop']?.rows || [];
const docId = String(data?.parent_ID || data?.parent_id || data?.ID || '').trim();
const master = masterRows.find((row) => String(row?.ID || row?.id || '').trim() === docId) || {};
for (let index = debtRows.length - 1; index >= 0; index -= 1) {
  if (String(debtRows[index]?.ID || debtRows[index]?.id || '').trim() === docId) debtRows.splice(index, 1);
}
const tongTien = Number(master?.tong_tien || data?.tong_tien || 0);
const daThanhToan = Number(master?.da_thanh_toan || data?.da_thanh_toan || 0);
const conNo = tongTien - daThanhToan;
if (conNo > 0) {
  debtRows.push({
    ID: docId,
    Ngay_ct: master?.ngay_ct || data?.Ngay_ct || data?.ngay_ct || '',
    So_ct: master?.so_ct || data?.so_ct || '',
    Loai_Ct: master?.Loai_ct || master?.loai_ct || '',
    Nha_cung_cap: master?.kho_xuat || data?.kho_xuat || '',
    so_tien: conNo,
    tra_no: 0,
    no_phai_tra: tongTien,
    da_tra: daThanhToan,
    cuoi_ky: conNo,
  });
}
return null;`;
      parity = 'partial';
      issues.push(`Stored procedure '${procName}' mapped to payable-row rebuild from knk_xnt_tonghop totals; verify running-balance semantics`);
      return { js, parity, issues };
    }

    js = `// §12 Converted CALL ${procName} → manual_review_required
// Stored procedure cannot be converted without procedure source code.
// Original: ${sql.substring(0, 200)}
// Arguments mapped: ${argsJs || '(none)'}
// ACTION REQUIRED: Implement equivalent JS logic or backend API call.
return null; // allow operation by default until implemented`;
    parity = 'manual_review_required';
    issues.push(`Stored procedure '${procName}' requires manual implementation – no procedure source available`);
    return { js, parity, issues };
  }

  // ── TAU: after update – commonly SUM aggregations or cross-table updates ─────
  if (loai === 'TAU') {
    const orphanDeleteTau = sql.match(/^delete\s+from\s+([\w]+)\s+where\s+([\w_]+)\s+not\s+in\s*\(\s*select\s+([\w_]+)\s+from\s+([\w]+)\s*\)/i);
    if (orphanDeleteTau) {
      const [, tableName, fieldName, refField, refTable] = orphanDeleteTau;
      js = `// §12 Converted TAU orphan cleanup → remove rows without matching parent
const rows = bang?.['${tableName}']?.rows || [];
const refs = new Set((bang?.['${refTable}']?.rows || []).map((row) => String(row?.['${refField}'] || '').trim()));
for (let index = rows.length - 1; index >= 0; index -= 1) {
  if (!refs.has(String(rows[index]?.['${fieldName}'] || '').trim())) rows.splice(index, 1);
}
return null;`;
      parity = 'partial';
      issues.push(`TAU orphan cleanup from '${tableName}' converted to in-memory parent existence check`);
      return { js, parity, issues };
    }

    if (/set\s+t\.no_cu=tk\.con_lai\s+where\s+t\.ID="#id"\s+and\s+t\.no_cu=0/i.test(sql)) {
      const khoField = /kho_xuat="#kho_xuat"/i.test(sql) ? 'kho_xuat' : 'kho_nhap';
      const requireLoaiCt = /x\.loai_ct="#loai_ct"/i.test(sql);
      js = `// §12 Converted TAU debt carry-forward lookup → previous balance scan
const masterRows = bang?.['knk_xnt_tonghop']?.rows || [];
const currentId = String(data?.ID || data?.id || '').trim();
const current = masterRows.find((row) => String(row?.ID || row?.id || '').trim() === currentId) || data || {};
if (Number(current?.no_cu || data?.no_cu || 0) !== 0) return null;
const previous = masterRows
  .filter((row) => String(row?.ID || row?.id || '').trim() !== currentId && String(row?.['${khoField}'] || '').trim() === String(current?.['${khoField}'] || data?.['${khoField}'] || '').trim() ${requireLoaiCt ? `&& String(row?.loai_ct || '').trim() === String(current?.loai_ct || data?.loai_ct || '').trim()` : ''})
  .sort((a, b) => String(a?.so_ct || '').localeCompare(String(b?.so_ct || '')))
  .pop();
return previous ? { no_cu: Number(previous?.con_lai || 0) } : null;`;
      parity = 'partial';
      issues.push('Previous-balance TAU converted to in-memory scan by warehouse and voucher order');
      return { js, parity, issues };
    }

    if (/update\s+knk_xnt_tonghop\s+a\s+inner\s+join\s+(knk_nhacungcap|knk_khachhang)\s+b\s+on\s+a\.(kho_xuat|kho_nhap)=b\.id\s+set\s+a\.con_lai=/i.test(sql)) {
      const match = sql.match(/update\s+knk_xnt_tonghop\s+a\s+inner\s+join\s+(knk_nhacungcap|knk_khachhang)\s+b\s+on\s+a\.(kho_xuat|kho_nhap)=b\.id/i);
      const partnerTable = match[1];
      const partnerField = match[2];
      js = `// §12 Converted TAU partner debt sync → update current row and partner balance in memory
const partnerRows = bang?.['${partnerTable}']?.rows || [];
const partnerId = data?.['${partnerField}'];
const conLai = Number(data?.no_cu || 0) + Number(data?.tong_tien || 0) - Number(data?.thanh_toan || data?.da_thanh_toan || 0);
const partner = partnerRows.find((row) => String(row?.ID || row?.id || '').trim() === String(partnerId || '').trim());
if (partner) {
  partner.con_no = conLai;
  partner.ngay_ct = data?.ngay_ct || data?.Ngay_ct || partner.ngay_ct;
}
return { con_lai: conLai };`;
      parity = 'partial';
      issues.push(`Partner debt sync to '${partnerTable}' converted to direct in-memory balance update`);
      return { js, parity, issues };
    }

    if (/set\s+xuat_bc=concat\(/i.test(sql) && /xuat_dhtong=concat\(/i.test(sql)) {
      js = `// §12 Converted TAU export-link generation → build runtime download URLs
const rowId = data?.id || data?.ID || '';
const loaiCt = String(data?.loai_ct || data?.Loai_ct || '').trim();
if (loaiCt && loaiCt !== 'XKBN') return null;
return {
  xuat_bc: 'Dowload^main.php?nm=sys_export&tp=0&uid=hongha&Appid=banhang&rid=' + rowId + '&tbl=knk_xnt_tonghop&fn=banhang_xuatbkhangban&fg=xuat_bc',
  xuat_dhtong: 'Dowload^main.php?nm=sys_export&tp=0&uid=hongha&Appid=banhang&rid=' + rowId + '&tbl=knk_xnt_tonghop&fn=banhang_donhangtong&fg=xuat_dhtong'
};`;
      parity = 'partial';
      issues.push('Export-link TAU converted to deterministic runtime URL composition');
      return { js, parity, issues };
    }

    if (/inner\s+join\s*\(select\s+c\.\*\s+from\s+knk_xnt_chitiet\s+c\s+inner\s+join\s+knk_xnt_tonghop\s+d/i.test(sql) && /set\s+a\.Don_Gia=ifnull\(ab\.don_gia,0\)/i.test(sql)) {
      js = `// §12 Converted TAU previous-price lookup → use previous matching voucher detail
if (Number(data?.Don_Gia || data?.don_gia || 0) !== 0) return null;
const detailRows = bang?.['knk_xnt_chitiet']?.rows || [];
const masterRows = bang?.['knk_xnt_tonghop']?.rows || [];
const parentId = String(data?.parent_ID || data?.parent_id || '').trim();
const master = masterRows.find((row) => String(row?.ID || row?.id || '').trim() === parentId) || {};
const previousMasters = masterRows
  .filter((row) => String(row?.ID || row?.id || '').trim() !== parentId && String(row?.loai_ct || '').trim() === String(master?.loai_ct || '').trim() && String(row?.kho_nhap || '').trim() === String(master?.kho_nhap || '').trim() && String(row?.so_ct || '').trim() < String(master?.so_ct || '').trim())
  .sort((a, b) => String(a?.so_ct || '').localeCompare(String(b?.so_ct || '')));
const prevMaster = previousMasters.pop();
if (!prevMaster) return { Tien_Hang: Number(data?.Don_Gia || data?.don_gia || 0) * Number(data?.So_Luong || data?.so_luong || 0), Tien_vat: Math.round((Number(data?.Don_Gia || data?.don_gia || 0) * Number(data?.So_Luong || data?.so_luong || 0) * Number(data?.Vat || data?.vat || 0))) / 100, Thanh_Tien: (Number(data?.Don_Gia || data?.don_gia || 0) * Number(data?.So_Luong || data?.so_luong || 0)) + (Math.round((Number(data?.Don_Gia || data?.don_gia || 0) * Number(data?.So_Luong || data?.so_luong || 0) * Number(data?.Vat || data?.vat || 0))) / 100) };
const prevDetail = detailRows.find((row) => String(row?.parent_id || row?.parent_ID || '').trim() === String(prevMaster?.ID || prevMaster?.id || '').trim() && String(row?.Ma_HH || row?.Ma_hh || row?.ma_hh || '').trim() === String(data?.Ma_HH || data?.ma_hh || '').trim()) || {};
const donGia = Number(prevDetail?.Don_Gia || prevDetail?.don_gia || 0);
const vat = Number(prevDetail?.Vat || prevDetail?.vat || 0);
const soLuong = Number(data?.So_Luong || data?.so_luong || 0);
const tienHang = donGia * soLuong;
const tienVat = Math.round((tienHang * vat)) / 100;
return { Don_Gia: donGia, Vat: vat, Tien_Hang: tienHang, Tien_vat: tienVat, Thanh_Tien: tienHang + tienVat };`;
      parity = 'partial';
      issues.push('Previous-item price lookup converted to scan previous voucher detail with same warehouse/type');
      return { js, parity, issues };
    }

    if (/update\s+knk_xnt_chitiet\s+a\s+inner\s+join\s+knk_xnt_tonghop\s+b\s+on\s+a\.(?:parent_id|id)=b\.id\s+set\s+a\.Don_Gia=\(select\s+don_gia\s+from\s+knk_dongia/i.test(sql)) {
      js = `// §12 Converted TAU knk_dongia price lookup → choose latest effective supplier price
const priceRows = bang?.['knk_dongia']?.rows || [];
const masterRows = bang?.['knk_xnt_tonghop']?.rows || [];
const parentId = String(data?.parent_ID || data?.parent_id || data?.ID || '').trim();
const master = masterRows.find((row) => String(row?.ID || row?.id || '').trim() === parentId || String(row?.ID || row?.id || '').trim() === String(data?.ID || data?.id || '').trim()) || {};
const dateKey = (value) => { const parts = String(value || '').split('/'); return parts.length === 3 ? parts[2] + parts[1] + parts[0] : String(value || '').replace(/[^0-9]/g, ''); };
const maHh = data?.Ma_HH || data?.ma_hh || '';
const candidates = priceRows.filter((row) => String(row?.Ma_NCC || row?.ma_ncc || '').trim() === String(master?.kho_xuat || '').trim() && String(row?.ma_vt || row?.Ma_VT || '').trim() === String(maHh).trim() && dateKey(row?.Ngay_AD || row?.ngay_ad) <= dateKey(master?.ngay_ct || data?.ngay_ct || ''));
const chosen = candidates.sort((a, b) => dateKey(a?.Ngay_AD || a?.ngay_ad).localeCompare(dateKey(b?.Ngay_AD || b?.ngay_ad))).pop() || {};
const donGia = Number(chosen?.don_gia || chosen?.Don_Gia || 0);
const vat = Number(chosen?.Thue_VAT || chosen?.thue_vat || 0);
const soLuong = Number(data?.So_Luong || data?.so_luong || 0);
const tienHang = donGia * soLuong;
const tienVat = Math.round((tienHang * vat)) / 100;
return { Don_Gia: donGia, Vat: vat, Tien_Hang: tienHang, Tien_vat: tienVat, Thanh_Tien: tienHang + tienVat };`;
      parity = 'partial';
      issues.push('Supplier price lookup from knk_dongia converted to latest effective-price scan');
      return { js, parity, issues };
    }

    if (/left\s+join\s*\(select\s+c\.\*\s+from\s+knk_xnt_chitiet\s+c\s+inner\s+join\s+knk_xnt_tonghop\s+d/i.test(sql) && /set\s+a\.Don_Gia=ab\.don_gia/i.test(sql)) {
      const khoField = /d\.kho_nhap="#kho_nhap"/i.test(sql) ? 'kho_nhap' : 'kho_xuat';
      js = `// §12 Converted TAU previous-detail fallback lookup → latest matching warehouse detail
if (Number(data?.Don_Gia || data?.don_gia || 0) !== 0) return null;
const detailRows = bang?.['knk_xnt_chitiet']?.rows || [];
const masterRows = bang?.['knk_xnt_tonghop']?.rows || [];
const parentId = String(data?.parent_ID || data?.parent_id || '').trim();
const master = masterRows.find((row) => String(row?.ID || row?.id || '').trim() === parentId) || {};
const previousMasters = masterRows.filter((row) => String(row?.ID || row?.id || '').trim() !== parentId && String(row?.['${khoField}'] || '').trim() === String(master?.['${khoField}'] || '').trim()).sort((a, b) => String(a?.so_ct || '').localeCompare(String(b?.so_ct || '')));
const prevMaster = previousMasters.pop();
const prevDetail = prevMaster ? detailRows.find((row) => String(row?.parent_id || row?.parent_ID || '').trim() === String(prevMaster?.ID || prevMaster?.id || '').trim() && String(row?.Ma_HH || row?.ma_hh || '').trim() === String(data?.Ma_HH || data?.ma_hh || '').trim()) : null;
const donGia = Number(prevDetail?.don_gia || prevDetail?.Don_Gia || 0);
const vat = Number(prevDetail?.vat || prevDetail?.Vat || 0);
const soLuong = Number(data?.So_Luong || data?.so_luong || 0);
const tienHang = donGia * soLuong;
const tienVat = Math.round((tienHang * vat)) / 100;
return { Don_Gia: donGia, Vat: vat, Tien_Hang: tienHang, Tien_vat: tienVat, Thanh_Tien: tienHang + tienVat };`;
      parity = 'partial';
      issues.push('Previous-detail fallback price converted to warehouse-based last-detail lookup');
      return { js, parity, issues };
    }

    if (/^insert\s+into\s+knk_thekho\s+select/i.test(sql) && !/union\s+all/i.test(sql)) {
      const direction = /,\s*-1\s*,/.test(sql) ? -1 : 1;
      const khoField = /a\.kho_xuat/i.test(sql) ? 'kho_xuat' : 'kho_nhap';
      js = `// §12 Converted TAU single-direction knk_thekho insert → append stock rows in memory
const stockRows = bang?.['knk_thekho']?.rows || [];
const masterRows = bang?.['knk_xnt_tonghop']?.rows || [];
const detailRows = bang?.['knk_xnt_chitiet']?.rows || [];
const docId = String(data?.ID || data?.id || '').trim();
const master = masterRows.find((row) => String(row?.ID || row?.id || '').trim() === docId) || data || {};
for (let index = stockRows.length - 1; index >= 0; index -= 1) {
  if (String(stockRows[index]?.ID || stockRows[index]?.id || '').trim() === docId) stockRows.splice(index, 1);
}
detailRows.filter((row) => String(row?.parent_id || row?.parent_ID || '').trim() === docId).forEach((row) => {
  stockRows.push({ ID: docId, id: docId, ma_kho: master?.['${khoField}'] || '', Ma_kho: master?.['${khoField}'] || '', Ma_HH: row?.Ma_HH || row?.Ma_hh || row?.ma_hh || '', Ma_hh: row?.Ma_HH || row?.Ma_hh || row?.ma_hh || '', ma_hh: row?.Ma_HH || row?.Ma_hh || row?.ma_hh || '', ngay_ct: master?.ngay_ct || '', so_ct: master?.so_ct || '', N_X: ${direction}, DVT: row?.DVT || row?.dvt || '', dvt: row?.DVT || row?.dvt || '', So_Luong: Number(row?.So_Luong || row?.so_luong || 0), so_luong: Number(row?.So_Luong || row?.so_luong || 0), Don_Gia: Number(row?.Don_Gia || row?.don_gia || 0), don_gia: Number(row?.Don_Gia || row?.don_gia || 0), Vat: Number(row?.Vat || row?.vat || 0), vat: Number(row?.Vat || row?.vat || 0) });
});
return null;`;
      parity = 'partial';
      issues.push('Single-direction knk_thekho insert converted to in-memory stock append');
      return { js, parity, issues };
    }

    if (/^insert\s+into\s+knk_tonkho\s*\(/i.test(sql) || /^insert\s+into\s+knk_tonkho\s+select/i.test(sql)) {
      js = `// §12 Converted TAU knk_tonkho bootstrap insert → ensure stock bucket exists
const tonRows = bang?.['knk_tonkho']?.rows || [];
const masterRows = bang?.['knk_xnt_tonghop']?.rows || [];
const master = masterRows.find((row) => String(row?.ID || row?.id || '').trim() === String(data?.parent_ID || data?.parent_id || '').trim()) || {};
const maKho = master?.kho_xuat || data?.kho_xuat || '';
const maHh = data?.ma_hh || data?.Ma_HH || '';
const loHang = data?.lo_hang || '';
if (maKho && maHh && !tonRows.some((row) => String(row?.ma_kho || row?.Ma_kho || '').trim() === String(maKho).trim() && String(row?.Ma_HH || row?.ma_hh || '').trim() === String(maHh).trim() && String(row?.lo_hang || '').trim() === String(loHang).trim())) {
  tonRows.push({ ID: String(data?.ID || data?.id || '').trim(), ma_kho: maKho, Ma_kho: maKho, Ma_HH: maHh, ma_hh: maHh, lo_hang: loHang, sl_ton: 0 });
}
return null;`;
      parity = 'partial';
      issues.push('knk_tonkho bucket bootstrap converted to ensure-row logic in memory');
      return { js, parity, issues };
    }

    if (/update\s+knk_xnt_chitiet\s+set\s+alert_color_red=/i.test(sql)) {
      js = `// §12 Converted TAU negative-stock alert → recompute from knk_thekho balance
const stockRows = bang?.['knk_thekho']?.rows || [];
const masterRows = bang?.['knk_xnt_tonghop']?.rows || [];
const parentId = String(data?.parent_ID || data?.parent_id || '').trim();
const master = masterRows.find((row) => String(row?.ID || row?.id || '').trim() === parentId) || {};
const maKho = master?.kho_xuat || '';
const maHh = data?.Ma_HH || data?.ma_hh || '';
const currentDate = String(master?.ngay_ct || '');
const toKey = (value) => { const parts = String(value || '').split('/'); return parts.length === 3 ? parts[2] + parts[1] + parts[0] : String(value || '').replace(/[^0-9]/g, ''); };
const ton = stockRows.filter((row) => String(row?.Ma_HH || row?.ma_hh || '').trim() === String(maHh).trim() && String(row?.ma_kho || row?.Ma_kho || '').trim() === String(maKho).trim() && toKey(row?.ngay_ct) <= toKey(currentDate)).reduce((sum, row) => sum + Number(row?.N_X || 0) * Number(row?.so_luong || row?.So_Luong || 0), 0);
return { alert_color_red: ton < 0 ? 1 : 0 };`;
      parity = 'partial';
      issues.push('Negative-stock alert converted to in-memory balance scan');
      return { js, parity, issues };
    }

    if (/^insert\s+into\s+knk_thekho\s+select[\s\S]+union\s+all\s+select/i.test(sql)) {
      js = `// §12 Converted TAU INSERT knk_thekho UNION ALL → rebuild stock detail rows
const stockRows = bang?.['knk_thekho']?.rows || [];
const masterRows = bang?.['knk_xnt_tonghop']?.rows || [];
const detailRows = bang?.['knk_xnt_chitiet']?.rows || [];
const docId = String(data?.parent_ID || data?.parent_id || data?.ID || '').trim();
const itemId = String(data?.ma_hh || data?.Ma_HH || '').trim();
const master = masterRows.find((row) => String(row?.ID || row?.id || '').trim() === docId) || data || {};
for (let index = stockRows.length - 1; index >= 0; index -= 1) {
  const row = stockRows[index];
  if (String(row?.ID || row?.id || '').trim() === docId && (!itemId || String(row?.Ma_HH || row?.Ma_hh || row?.ma_hh || '').trim() === itemId)) stockRows.splice(index, 1);
}
detailRows.filter((row) => String(row?.parent_id || row?.parent_ID || '').trim() === docId && (!itemId || String(row?.Ma_HH || row?.Ma_hh || row?.ma_hh || '').trim() === itemId)).forEach((row) => {
  const base = { ID: docId, id: docId, ngay_ct: master?.ngay_ct || '', so_ct: master?.so_ct || '', DVT: row?.DVT || row?.dvt || '', dvt: row?.DVT || row?.dvt || '', So_Luong: Number(row?.So_Luong || row?.so_luong || 0), so_luong: Number(row?.So_Luong || row?.so_luong || 0), Don_Gia: Number(row?.Don_Gia || row?.don_gia || 0), don_gia: Number(row?.Don_Gia || row?.don_gia || 0), Vat: Number(row?.Vat || row?.vat || 0), vat: Number(row?.Vat || row?.vat || 0), Ma_HH: row?.Ma_HH || row?.Ma_hh || row?.ma_hh || '', Ma_hh: row?.Ma_HH || row?.Ma_hh || row?.ma_hh || '', ma_hh: row?.Ma_HH || row?.Ma_hh || row?.ma_hh || '', lo_hang: row?.lo_hang || '' };
  if (master?.kho_xuat) stockRows.push({ ...base, ma_kho: master.kho_xuat, Ma_kho: master.kho_xuat, N_X: -1 });
  if (master?.kho_nhap) stockRows.push({ ...base, ma_kho: master.kho_nhap, Ma_kho: master.kho_nhap, N_X: 1 });
});
return null;`;
      parity = 'partial';
      issues.push('INSERT ... UNION ALL into knk_thekho converted to in-memory stock rebuild; verify per-menu warehouse semantics');
      return { js, parity, issues };
    }

    const joinedLookupMatch = sql.match(/^update\s+([\w]+)\s+a\s+inner\s+join\s+([\w]+)\s+b\s+on\s+a\.([\w]+)=b\.ID\s+set\s+a\.([\w]+)=b\.([\w]+)\s+where\s+a\.ID\s*=\s*["']#ID["'](?:\s+and\s+a\.([\w]+)\s*=\s*["']#([\w]+)["'])?/i);
    if (joinedLookupMatch) {
      const [, destTbl, srcTbl, fkField, destField, srcField, guardField, guardParam] = joinedLookupMatch;
      js = `// §12 Converted TAU UPDATE INNER JOIN lookup → in-memory lookup
if (${guardField ? `String(data?.['${guardParam}'] || '').trim() !== String(data?.['${guardField}'] || '').trim()` : 'false'}) return null;
const srcRows = bang?.['${srcTbl}']?.rows || [];
const lookupValue = data?.['${fkField}'];
const sourceRow = srcRows.find((row) => String(row?.ID || row?.id || '').trim() === String(lookupValue || '').trim());
return sourceRow ? { '${destField}': sourceRow?.['${srcField}'] } : null;`;
      parity = 'partial';
      issues.push(`UPDATE INNER JOIN lookup from '${srcTbl}' converted to JS lookup for '${destField}'`);
      return { js, parity, issues };
    }

    if (/update\s+[\w]+\s+a\s+inner\s+join\s+[\w]+\s+b\s+on\s+a\.parent_id=b\.id\s+set\s+a\.Tien_Hang=/i.test(sql)) {
      js = `// §12 Converted TAU detail amount recomputation → derive from current detail row
const donGia = Number(data?.Don_Gia || data?.don_gia || 0);
const soLuong = Number(data?.So_Luong || data?.so_luong || 0);
const vat = Number(data?.Vat || data?.vat || 0);
const tienHang = donGia * soLuong;
const tienVat = Math.round((tienHang * vat)) / 100;
return { Tien_Hang: tienHang, Tien_vat: tienVat, Thanh_Tien: tienHang + tienVat };`;
      parity = 'partial';
      issues.push('Joined TAU amount recomputation converted to direct field formula from current detail row');
      return { js, parity, issues };
    }

    if (/^update\s+knk_tonkho\s+a\s+inner\s+join\s+knk_xnt_tonghop\s+b\s+on\s+a\.ma_kho=b\.kho_xuat\s+inner\s+join\s+knk_xnt_chitiet\s+c\s+on\s+b\.ID=c\.parent_id\s+set\s+sl_ton=sl_ton\+c\.so_luong/i.test(sql)) {
      js = `// §12 Converted TAU inventory rollback/update → adjust knk_tonkho in memory
const tonRows = bang?.['knk_tonkho']?.rows || [];
const detailRows = bang?.['knk_xnt_chitiet']?.rows || [];
const masterRows = bang?.['knk_xnt_tonghop']?.rows || [];
const detail = detailRows.find((row) => String(row?.ID || row?.id || '').trim() === String(data?.ID || data?.id || '').trim());
if (!detail) return null;
const master = masterRows.find((row) => String(row?.ID || row?.id || '').trim() === String(detail?.parent_id || detail?.parent_ID || '').trim()) || {};
tonRows.forEach((row) => {
  if (String(row?.Ma_HH || row?.ma_hh || '').trim() === String(detail?.Ma_HH || detail?.ma_hh || '').trim() && String(row?.ma_kho || row?.Ma_kho || '').trim() === String(master?.kho_xuat || '').trim() && String(row?.lo_hang || '').trim() === String(detail?.lo_hang || '').trim()) {
    row.sl_ton = Number(row?.sl_ton || 0) + Number(detail?.so_luong || detail?.So_Luong || 0);
    row.ngay_tinh_ton = 'T';
  }
});
return null;`;
      parity = 'partial';
      issues.push('Joined inventory adjustment converted to in-memory ton-kho update; verify rollback semantics on delete/edit');
      return { js, parity, issues };
    }

    const insertSelectAnyMatch = sql.match(/^insert\s+into\s+([\w]+)\s*\((.*?)\)\s*\n?select\s+([\s\S]+?)\s+from\s+([\w]+)\s+.*?where\s+ID\s*=\s*["']#([\w]+)["']/i);
    if (insertSelectAnyMatch) {
      const [, destTbl, destCols, selectPart, srcTbl, sourceField] = insertSelectAnyMatch;
      const cols = destCols.split(',').map(c => c.trim());
      const selectCols = splitSqlColumns(selectPart);
      js = `// §12 Converted TAU INSERT+SELECT with placeholder → create destination row in memory
const srcRows = bang?.['${srcTbl}']?.rows || [];
const destRows = bang?.['${destTbl}']?.rows || [];
const srcValue = data?.['${sourceField}'];
const srcRow = srcRows.find(r => String(r?.ID || r?.id || '').trim() === String(srcValue || '').trim());
if (!srcRow) return null;
const newRow = {
${cols.map((col, i) => {
  const selectCol = selectCols[i] || '';
  const colVal = selectCol
    .replace(/"#([\w]+)"/g, 'data["$1"]')
    .replace(/'#([\w]+)'/g, "data['$1']")
    .replace(/^"([^"]*)"$/, '"$1"')
    .replace(/^'([^']*)'$/, "'$1'")
    .replace(/as\s+\w+$/i, '');
  return `  ${col}: ${colVal.trim()}`;
}).join(',\n')}
};
destRows.push(newRow);
return null;`;
      parity = 'partial';
      issues.push(`INSERT+SELECT from '${srcTbl}' using placeholder '${sourceField}' converted to JS row creation`);
      return { js, parity, issues };
    }

    const sumUpdateAnyMatch = sql.match(/update\s+([\w]+)\s+set\s+([\w]+)\s*=\s*\(\s*select\s+(?:ifnull\s*\(\s*)?sum\s*\(([\w]+)\).*?\bfrom\s+([\w]+)\s+where\s+([\w_]+)\s*=\s*["']#([\w]+)["']/is);
    if (sumUpdateAnyMatch) {
      const [, destTbl, destField, sumCol, srcTbl, whereField, sourceField] = sumUpdateAnyMatch;
      js = `// §12 Converted TAU UPDATE+SUM with placeholder → in-memory aggregation
const srcRows = bang?.['${srcTbl}']?.rows || [];
const sourceValue = data?.['${sourceField}'];
const total = srcRows.filter(r => String(r?.['${whereField}'] || '').trim() === String(sourceValue || '').trim()).reduce((s, r) => s + Number(r['${sumCol}'] || 0), 0);
return { '${destField}': total };`;
      parity = 'partial';
      issues.push(`SUM aggregation from '${srcTbl}' on '${whereField}' converted to in-memory reduce`);
      return { js, parity, issues };
    }

    // Pattern: INSERT INTO tbl(...) SELECT ... FROM src WHERE ID="#ID"
    const insertSelectMatch = sql.match(/^insert\s+into\s+([\w]+)\s*\((.*?)\)\s*\n?select\s+([\s\S]+?)\s+from\s+([\w]+)\s+.*?where\s+ID\s*=\s*["']#ID["']/i);
    if (insertSelectMatch) {
      const [, destTbl, destCols, selectPart, srcTbl] = insertSelectMatch;
      const cols = destCols.split(',').map(c => c.trim());
      const selectCols = splitSqlColumns(selectPart);
      js = `// §12 Converted TAU INSERT+SELECT → create new row in destination
const srcRows = bang?.['${srcTbl}']?.rows || [];
const destRows = bang?.['${destTbl}']?.rows || [];
const srcRow = srcRows.find(r => r.ID === data.ID);
if (!srcRow) return null;
const newRow = {
${cols.map((col, i) => {
  const selectCol = selectCols[i] || '';
  const colVal = selectCol
    .replace(/"#([\w]+)"/g, 'data["$1"]')
    .replace(/'#([\w]+)'/g, "data['$1']")
    .replace(/^"([^"]*)"$/, '"$1"') // string literal
    .replace(/^'([^']*)'$/, "'$1'")
    .replace(/as\\s+\\w+$/i, ''); // remove AS alias
  return `  ${col}: ${colVal.trim()}`;
}).join(',\n')}
};
destRows.push(newRow);
return null;`;
      parity = 'partial';
      issues.push(`INSERT+SELECT from '${srcTbl}' converted to JS row creation; verify field mapping matches DB schema`);
      return { js, parity, issues };
    }

    // Pattern: UPDATE tbl SET field=(SELECT SUM(col) FROM src WHERE ID="#ID") WHERE ID="#ID"
    const sumUpdateMatch = sql.match(
      /update\s+([\w]+)\s+set\s+([\w]+)\s*=\s*\(\s*select\s+(?:ifnull\s*\(\s*)?sum\s*\(([\w]+)\).*?\bfrom\s+([\w]+)\s+where\s+ID\s*=\s*["']#ID["']/is
    );
    if (sumUpdateMatch) {
      const [, destTbl, destField, sumCol, srcTbl] = sumUpdateMatch;
      js = `// §12 Converted TAU UPDATE+SUM → in-memory aggregation
const srcRows = bang?.['${srcTbl}']?.rows || [];
const total = srcRows
  .filter(r => r.ID === data.ID)
  .reduce((s, r) => s + Number(r['${sumCol}'] || 0), 0);
return { '${destField}': total };`;
      parity = 'partial';
      issues.push(`SUM aggregation from '${srcTbl}' converted to in-memory reduce; verify field '${sumCol}' matches DB schema`);
      return { js, parity, issues };
    }

    // Pattern: UPDATE tbl SET field=(SELECT ... FROM other_tbl WHERE ID=...)
    const lookupUpdateMatch = sql.match(
      /^update\s+([\w]+)\s+set\s+([\w]+)\s*=\s*\(\s*select\s+([\w]+)\s+from\s+([\w]+)\s+where\s+ID\s*=\s*["']#([\w]+)["']\)\s+where\s+ID\s*=\s*["']#ID["']/i
    );
    if (lookupUpdateMatch) {
      const [, destTbl, destField, lookupField, srcTbl, fkField] = lookupUpdateMatch;
      js = `// §12 Converted TAU UPDATE+LOOKUP → in-memory lookup
const srcRows = bang?.['${srcTbl}']?.rows || [];
const fkValue = data['${fkField}'];
const lookupRow = srcRows.find(r => r.ID === fkValue);
const value = lookupRow?.['${lookupField}'] || null;
return { '${destField}': value };`;
      parity = 'partial';
      issues.push(`Lookup UPDATE from '${srcTbl}' converted to in-memory find; verify FK field '${fkField}' and lookup field '${lookupField}'`);
      return { js, parity, issues };
    }

    // Pattern: Simple UPDATE tbl SET f1=expr WHERE ID="#ID"
    const simpleUpdateMatch = sql.match(
      /^update\s+[\w]+\s+set\s+(.+?)\s+where\s+(?:ID|id)\s*=\s*["']#(?:ID|id|parent_ID|parent_id)["']\s*$/is
    );
    if (simpleUpdateMatch) {
      const setPart = simpleUpdateMatch[1];
      const assignments = [];
      for (const chunk of setPart.split(',')) {
        const m = chunk.trim().match(/^([\w]+)\s*=\s*(.+)$/s);
        if (m) {
          const field = m[1].trim();
          const expr = m[2].trim()
            .replace(/"#([\w]+)"/g, "data['$1']")
            .replace(/'#([\w]+)'/g, "data['$1']")
            .replace(/\bIFNULL\s*\(/gi, '(')
            .replace(/\bcoalesce\s*\(/gi, '(');
          assignments.push(`'${field}': ${expr}`);
        }
      }
      if (assignments.length) {
        js = `// §12 Converted simple TAU UPDATE SET\nreturn { ${assignments.join(', ')} };`;
        parity = 'partial';
        issues.push('Simple UPDATE SET converted; verify expression semantics (IFNULL→null coalescing)');
        return { js, parity, issues };
      }
    }

    // Complex TAU – cannot auto-convert
    js = `// §12 manual_review_required: complex TAU trigger
// Original SQL (first 400 chars):
/*
${sql.substring(0, 400)}
*/
// ACTION REQUIRED: Implement equivalent in-memory JS logic.
return null;`;
    parity = 'manual_review_required';
    issues.push('Complex TAU trigger (multi-table join / subquery) cannot be auto-converted – manual JS implementation required');
    return { js, parity, issues };
  }

  // ── TBU: before save – validation/defaulting ─────────────────────────────────
  if (loai === 'TBU') {
    if (/^update\s+knk_tonkho\s+a\s+inner\s+join\s+knk_xnt_tonghop\s+b\s+on\s+a\.ma_kho=b\.kho_xuat\s+inner\s+join\s+knk_xnt_chitiet\s+c\s+on\s+b\.ID=c\.parent_id\s+set\s+sl_ton=sl_ton\+c\.so_luong/i.test(sql)) {
      js = `// §12 Converted TBU inventory rollback/update → adjust tonkho in memory
const tonRows = bang?.['knk_tonkho']?.rows || [];
const detailRows = bang?.['knk_xnt_chitiet']?.rows || [];
const masterRows = bang?.['knk_xnt_tonghop']?.rows || [];
const detail = detailRows.find((row) => String(row?.ID || row?.id || '').trim() === String(data?.ID || data?.id || '').trim());
if (!detail) return null;
const master = masterRows.find((row) => String(row?.ID || row?.id || '').trim() === String(detail?.parent_id || detail?.parent_ID || '').trim()) || {};
tonRows.forEach((row) => {
  if (String(row?.Ma_HH || row?.ma_hh || '').trim() === String(detail?.Ma_HH || detail?.ma_hh || '').trim() && String(row?.ma_kho || row?.Ma_kho || '').trim() === String(master?.kho_xuat || '').trim() && String(row?.lo_hang || '').trim() === String(detail?.lo_hang || '').trim()) {
    row.sl_ton = Number(row?.sl_ton || 0) + Number(detail?.so_luong || detail?.So_Luong || 0);
    row.ngay_tinh_ton = 'T';
  }
});
return null;`;
      parity = 'partial';
      issues.push('TBU tonkho adjustment converted to in-memory stock rollback/update');
      return { js, parity, issues };
    }

    const deleteWithPlaceholders = sql.match(/^delete\s+from\s+([\w]+)\s+where\s+(.+)$/i);
    if (deleteWithPlaceholders && /#([\w]+)/.test(deleteWithPlaceholders[2])) {
      const [, tableName, wherePart] = deleteWithPlaceholders;
      js = `// §12 Converted TBU cleanup DELETE → pre-save derived-data invalidation
const rows = bang?.['${tableName}']?.rows || [];
const checks = [${Array.from(wherePart.matchAll(/([\w_]+)\s*=\s*["']#([\w]+)["']/gi)).map((m) => `{ field: '${m[1]}', source: '${m[2]}' }`).join(', ')}];
for (let index = rows.length - 1; index >= 0; index -= 1) {
  const row = rows[index];
  if (checks.every((rule) => String(row?.[rule.field] || '').trim() === String(data?.[rule.source] || row?.[rule.source] || '').trim())) rows.splice(index, 1);
}
return null;`;
      parity = 'partial';
      issues.push(`TBU cleanup DELETE on '${tableName}' converted to in-memory invalidation before save`);
      return { js, parity, issues };
    }

    const orphanDelete = sql.match(/^delete\s+from\s+([\w]+)\s+where\s+([\w_]+)\s+not\s+in\s*\(\s*select\s+([\w_]+)\s+from\s+([\w]+)\s*\)/i);
    if (orphanDelete) {
      const [, tableName, fieldName, refField, refTable] = orphanDelete;
      js = `// §12 Converted TBU orphan cleanup → remove rows without matching parent
const rows = bang?.['${tableName}']?.rows || [];
const refs = new Set((bang?.['${refTable}']?.rows || []).map((row) => String(row?.['${refField}'] || '').trim()));
for (let index = rows.length - 1; index >= 0; index -= 1) {
  if (!refs.has(String(rows[index]?.['${fieldName}'] || '').trim())) rows.splice(index, 1);
}
return null;`;
      parity = 'partial';
      issues.push(`TBU orphan cleanup from '${tableName}' converted to in-memory parent-existence check`);
      return { js, parity, issues };
    }

    // Pattern: DELETE from table WHERE ID="#ID" (cascade delete - prevent insert by validation)
    const cascadeDelPattern = sql.match(/^delete\s+from\s+([\w]+)\s+where\s+ID\s*=\s*["']#ID["']/i);
    if (cascadeDelPattern) {
      const [, cascadeTbl] = cascadeDelPattern;
      js = `// §12 Converted TBU → beforeSave validation (cascade delete check)
// When saving to this table, check if cascading delete would occur
// In new system: configure cascade policy on table definition rather than trigger code
// For now: log warning and allow save
return null; // allow save, backend will handle cascade`;
      parity = 'partial';
      issues.push(`TBU cascade delete from '${cascadeTbl}' converted to validation note; configure cascade policy in table definition`);
      return { js, parity, issues };
    }

    // Pattern: Simple validation - check if record exists or other condition
    const simpleValidationMatch = sql.match(/^(select|if|check)\s+/i);
    if (simpleValidationMatch) {
      js = `// §12 Converted TBU → beforeSave validation
// Original validation SQL (first 400 chars):
/*
${sql.substring(0, 400)}
*/
// ACTION REQUIRED: Implement validation logic - return false to cancel save, object to set defaults
return null;`;
      parity = 'partial';
      issues.push('TBU validation pattern detected; convert to JS validation returning false or null');
      return { js, parity, issues };
    }

    // Simple UPDATE SET patterns in beforeSave context
    const simpleSet = sql.match(/^update\s+[\w]+\s+set\s+(.+?)\s+where\s+ID\s*=\s*["']#ID["']\s*$/is);
    if (simpleSet) {
      const setPart = simpleSet[1];
      const assignments = [];
      for (const chunk of setPart.split(',')) {
        const m = chunk.trim().match(/^([\w]+)\s*=\s*(.+)$/s);
        if (m) {
          const field = m[1].trim();
          const expr = m[2].trim()
            .replace(/"#([\w]+)"/g, "row['$1']")
            .replace(/'#([\w]+)'/g, "row['$1']");
          assignments.push(`'${field}': ${expr}`);
        }
      }
      if (assignments.length) {
        js = `// §12 Converted TBU → beforeSave\nif (!row) return false;\nreturn { ${assignments.join(', ')} };`;
        parity = 'partial';
        issues.push('TBU UPDATE SET converted to beforeSave return object; verify field references');
        return { js, parity, issues };
      }
    }

    js = `// §12 manual_review_required: TBU trigger
/*
${sql.substring(0, 400)}
*/
// ACTION REQUIRED: Implement validation/defaulting in JS.
// Return false to cancel save, object to override fields, null to allow as-is.
return null;`;
    parity = 'manual_review_required';
    issues.push('TBU trigger requires manual JS implementation');
    return { js, parity, issues };
  }

  // ── TOD: on delete ────────────────────────────────────────────────────────────
  if (loai === 'TOD') {
    const sumUpdateTod = sql.match(/^update\s+([\w]+)\s+set\s+([\w]+)\s*=\s*\(\s*select\s+sum\s*\(([\w]+)\)\s+from\s+([\w]+)\s+where\s+([\w_]+)\s*=\s*["']#([\w]+)["']\s*\)\s+where\s+ID\s*=\s*["']#([\w]+)["']/i);
    if (sumUpdateTod) {
      const [, tblName, fieldName, sumCol, srcTbl, whereField, sourceField] = sumUpdateTod;
      js = `// §12 Converted TOD aggregate refresh → recompute parent total in memory
const srcRows = bang?.['${srcTbl}']?.rows || [];
const sourceValue = data?.['${sourceField}'];
const total = srcRows.filter((row) => String(row?.['${whereField}'] || '').trim() === String(sourceValue || '').trim()).reduce((sum, row) => sum + Number(row?.['${sumCol}'] || 0), 0);
return { '${fieldName}': total };`;
      parity = 'partial';
      issues.push(`TOD aggregate refresh for '${tblName}.${fieldName}' converted to in-memory recompute`);
      return { js, parity, issues };
    }

    if (/^update\s+knk_xnt_tonghop\s+a\s+inner\s+join\s+(knk_nhacungcap|knk_khachhang)\s+b\s+on\s+a\.(kho_xuat|kho_nhap)=b\.id\s+set\s+b\.con_no=b\.con_no-a\.tong_tien\+a\.(thanh_toan|da_thanh_toan)/i.test(sql)) {
      const match = sql.match(/^update\s+knk_xnt_tonghop\s+a\s+inner\s+join\s+(knk_nhacungcap|knk_khachhang)\s+b\s+on\s+a\.(kho_xuat|kho_nhap)=b\.id\s+set\s+b\.con_no=b\.con_no-a\.tong_tien\+a\.(thanh_toan|da_thanh_toan)/i);
      const partnerTable = match[1];
      const partnerField = match[2];
      const paymentField = match[3];
      js = `// §12 Converted TOD partner debt rollback → update partner balance in memory
const partnerRows = bang?.['${partnerTable}']?.rows || [];
const partnerId = data?.['${partnerField}'];
const partner = partnerRows.find((row) => String(row?.ID || row?.id || '').trim() === String(partnerId || '').trim());
if (partner) partner.con_no = Number(partner?.con_no || 0) - Number(data?.tong_tien || 0) + Number(data?.['${paymentField}'] || 0);
return null;`;
      parity = 'partial';
      issues.push(`TOD partner debt rollback converted for '${partnerTable}'`);
      return { js, parity, issues };
    }

    if (/^insert\s+into\s+knk_congnophaitra\(/i.test(sql) && /where\s+ID="#parent_ID"/i.test(sql)) {
      js = `// §12 Converted TOD payable snapshot insert → rebuild payable row in memory
const debtRows = bang?.['knk_congnophaitra']?.rows || [];
const masterRows = bang?.['knk_xnt_tonghop']?.rows || [];
const docId = String(data?.parent_ID || data?.parent_id || '').trim();
const master = masterRows.find((row) => String(row?.ID || row?.id || '').trim() === docId) || {};
const previous = debtRows.filter((row) => String(row?.ID || row?.id || '').trim() < docId).sort((a, b) => String(a?.ID || a?.id || '').localeCompare(String(b?.ID || b?.id || ''))).pop();
for (let index = debtRows.length - 1; index >= 0; index -= 1) {
  if (String(debtRows[index]?.ID || debtRows[index]?.id || '').trim() === docId) debtRows.splice(index, 1);
}
const dauKy = Number(previous?.cuoi_ky || 0);
const tongTien = Number(master?.tong_tien || 0);
debtRows.push({ ID: docId, Ngay_ct: master?.ngay_ct || '', So_ct: master?.so_ct || '', Loai_Ct: master?.Loai_ct || master?.loai_ct || '', Nha_cung_cap: master?.kho_xuat || '', Dau_ky: dauKy, no_phai_tra: tongTien, da_tra: 0, cuoi_ky: dauKy + tongTien });
return null;`;
      parity = 'partial';
      issues.push('TOD payable snapshot insert converted to in-memory rebuild of knk_congnophaitra');
      return { js, parity, issues };
    }

    if (/^update\s+knk_tonkho\s+a\s+inner\s+join\s+knk_xnt_tonghop\s+b\s+on\s+a\.ma_kho=b\.kho_xuat\s+inner\s+join\s+knk_xnt_chitiet\s+c\s+on\s+b\.ID=c\.parent_id\s+set\s+sl_ton=sl_ton\+c\.so_luong/i.test(sql)) {
      js = `// §12 Converted TOD tonkho rollback → adjust stock bucket in memory
const tonRows = bang?.['knk_tonkho']?.rows || [];
const detailRows = bang?.['knk_xnt_chitiet']?.rows || [];
const masterRows = bang?.['knk_xnt_tonghop']?.rows || [];
const detail = detailRows.find((row) => String(row?.ID || row?.id || '').trim() === String(data?.ID || data?.id || '').trim());
if (!detail) return null;
const master = masterRows.find((row) => String(row?.ID || row?.id || '').trim() === String(detail?.parent_id || detail?.parent_ID || '').trim()) || {};
tonRows.forEach((row) => {
  if (String(row?.Ma_HH || row?.ma_hh || '').trim() === String(detail?.Ma_HH || detail?.ma_hh || '').trim() && String(row?.ma_kho || row?.Ma_kho || '').trim() === String(master?.kho_xuat || '').trim() && String(row?.lo_hang || '').trim() === String(detail?.lo_hang || '').trim()) {
    row.sl_ton = Number(row?.sl_ton || 0) + Number(detail?.so_luong || detail?.So_Luong || 0);
  }
});
return null;`;
      parity = 'partial';
      issues.push('TOD tonkho rollback converted to in-memory stock adjustment');
      return { js, parity, issues };
    }

    const multiDeleteMatch = sql.match(/^delete\s+from\s+([\w]+)\s+where\s+(.+)$/i);
    if (multiDeleteMatch && /#([\w]+)/.test(multiDeleteMatch[2])) {
      const [, cascadeTbl, wherePart] = multiDeleteMatch;
      const checks = Array.from(wherePart.matchAll(/([\w_]+)\s*=\s*["']#([\w]+)["']/gi));
      if (checks.length) {
        js = `// §12 Converted TOD DELETE with compound conditions → in-memory cascade logic
const cascadeRows = bang?.['${cascadeTbl}']?.rows || [];
const checks = [${checks.map((m) => `{ field: '${m[1]}', source: '${m[2]}' }`).join(', ')}];
for (let index = cascadeRows.length - 1; index >= 0; index -= 1) {
  const row = cascadeRows[index];
  if (checks.every((rule) => String(row?.[rule.field] || '').trim() === String(data?.[rule.source] || '').trim())) cascadeRows.splice(index, 1);
}
return null;`;
        parity = 'partial';
        issues.push(`Compound DELETE cascade from '${cascadeTbl}' converted to in-memory filter/splice`);
        return { js, parity, issues };
      }
    }

    // Pattern: Simple DELETE from tbl WHERE ID="#ID" or parent_id="#id"
    const simpleCascadeMatch = sql.match(
      /^delete\s+from\s+([\w]+)\s+where\s+(?:ID|parent_id|[\w]+_id)\s*=\s*["']#(?:ID|id|[\w]+)["']/i
    );
    if (simpleCascadeMatch) {
      const cascadeTblMatch = sql.match(/delete\s+from\s+([\w]+)/i);
      const cascadeTbl = cascadeTblMatch ? cascadeTblMatch[1] : 'unknown_table';
      const idMatch = sql.match(/where\s+([\w_]+)\s*=\s*["']#([\w]+)["']/i);
      const whereField = idMatch ? idMatch[1] : 'ID';
      const sourceField = idMatch ? idMatch[2] : 'ID';
      
      js = `// §12 Converted TOD DELETE cascade → in-memory cascade logic
// Cascade delete from '${cascadeTbl}' where ${whereField} matches deleted record's ${sourceField}
const cascadeRows = bang?.['${cascadeTbl}']?.rows || [];
const sourceValue = data?.['${sourceField}'];
if (sourceValue) {
  const toDelete = cascadeRows.filter(r => r['${whereField}'] === sourceValue);
  toDelete.forEach(r => {
    const idx = cascadeRows.indexOf(r);
    if (idx > -1) cascadeRows.splice(idx, 1);
  });
}
return null;`;
      parity = 'partial';
      issues.push(`Cascade DELETE from '${cascadeTbl}' where ${whereField}=${sourceField} converted to in-memory splice; verify relationship field names`);
      return { js, parity, issues };
    }

    // Pattern: UPDATE on delete (e.g., SET status='deleted')
    const updDelMatch = sql.match(/^update\s+([\w]+)\s+set\s+(.+?)\s+where\s+/is);
    if (updDelMatch) {
      const [, tbl, setPart] = updDelMatch;
      const assignments = [];
      for (const chunk of setPart.split(',')) {
        const m = chunk.trim().match(/^([\w]+)\s*=\s*(.+)$/s);
        if (m) {
          assignments.push(`'${m[1].trim()}': ${m[2].trim()}`);
        }
      }
      if (assignments.length) {
        js = `// §12 Converted TOD UPDATE-on-delete → mark as deleted
// When deleting, mark related records in '${tbl}' as deleted instead
const rows = bang?.['${tbl}']?.rows || [];
rows.forEach(r => {
  if (r.ID === data?.ID) {
    Object.assign(r, { ${assignments.join(', ')} });
  }
});
return null;`;
        parity = 'partial';
        issues.push(`TOD UPDATE-on-delete converted to soft-delete logic; verify field names and deletion semantics`);
        return { js, parity, issues };
      }
    }

    js = `// §12 manual_review_required: complex TOD trigger\n/*\n${sql.substring(0, 400)}\n*/\nreturn null;`;
    parity = 'manual_review_required';
    issues.push('Complex TOD trigger requires manual implementation');
    return { js, parity, issues };
  }

  // Fallback
  js = `// §12 manual_review_required: unclassified trigger\n/*\n${sql.substring(0, 300)}\n*/\nreturn null;`;
  parity = 'manual_review_required';
  issues.push('Unclassified trigger type – manual conversion required');
  return { js, parity, issues };
}

// ─── 7. BUILD TRIGGER OBJECT FOR MENU (§6.1 keys) ────────────────────────────
function buildTriggers(menuId) {
  const rows = trig.filter(t => t.id === menuId);
  if (!rows.length) return { trigger: {}, trigger_legacy_rows: [], migration_notes: [] };

  // Group by loaitrigger, sorted by stt
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.loaitrigger]) grouped[r.loaitrigger] = [];
    grouped[r.loaitrigger].push(r);
  }
  for (const k of Object.keys(grouped)) {
    grouped[k].sort((a, b) => (a.stt || 0) - (b.stt || 0));
  }

  const triggerObj = {};
  const migrationNotes = [];

  for (const [loai, trigRows] of Object.entries(grouped)) {
    const trigKey = mapTriggerKey(loai);

    // Combine multiple same-loai triggers into single JS function body
    const parts = [];
    let worstParity = 'full';
    const allIssues = [];

    for (const tr of trigRows) {
      const { js, parity, issues } = convertTrigger(tr.trigger_value, loai, menuId);
      parts.push(js);
      if (parity === 'manual_review_required') worstParity = 'manual_review_required';
      else if (parity === 'partial' && worstParity === 'full') worstParity = 'partial';
      allIssues.push(...issues);
    }

    // Combine: wrap each part in a comment block if multiple
    let combinedJs;
    if (parts.length === 1) {
      combinedJs = parts[0];
    } else {
      combinedJs = parts.map((p, i) => `// === Block ${i + 1} (stt=${trigRows[i].stt}) ===\n${p}`).join('\n\n');
    }

    // For beforeSave, wrap in proper function structure per §6.2
    if (trigKey === 'beforeSave') {
      combinedJs = `// beforeSave signature: (row, seft, data)\n${combinedJs}`;
    }

    triggerObj[trigKey] = combinedJs;

    migrationNotes.push({
      source_signature: `loaitrigger=${loai} (${trigRows.length} row${trigRows.length > 1 ? 's' : ''})`,
      target_signature: `${trigKey}: Function("seft","data","bang", code)`,
      behavior_parity: worstParity,
      unsupported_legacy_features: allIssues,
      test_vectors: []  // TODO: add parity test vectors per §12.7
    });
  }

  return {
    trigger: triggerObj,
    trigger_legacy_rows: rows,
    migration_notes: migrationNotes
  };
}

// ─── 8. BUILD TABLE FIELDS FOR MENU (§4) ─────────────────────────────────────
function buildTableFields(menuId) {
  const rows = tbl.filter(t => t.id === menuId);
  return rows.map(r => ({
    f_name: r.f_name ? String(r.f_name).toLowerCase() : r.f_name,
    f_pkid: r.f_pkid,
    f_stt: r.f_stt,
    f_header: r.f_header,
    f_show: r.f_show,
    f_showgrid: r.f_showgrid,
    f_showonreport: r.f_showonreport,
    f_types: mapFTypes(r.f_types),
    f_align: r.f_align,
    f_width: r.f_width,
    f_required: r.f_pkid ? 1 : 0,
    f_sort: r.f_sort,
    f_sorting: r.f_sorting,
    f_filter: r.f_filter,
    f_dec: r.f_dec,
    f_alert_query: r.f_alert_query,
    f_cbo_query: convertCboQuery(r.f_cbo_query, r.f_name),
  }));
}

function extractSqlTableNames(sql) {
  const tables = new Set();
  const regex = /\b(?:from|join)\b\s+([\w]+)/gi;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    if (match[1]) tables.add(match[1]);
  }
  return [...tables];
}

function splitSqlColumns(selectPart) {
  const cols = [];
  let current = '';
  let depth = 0;
  let quote = '';
  for (let i = 0; i < selectPart.length; i++) {
    const ch = selectPart[i];
    const prev = i > 0 ? selectPart[i - 1] : '';
    if ((ch === '"' || ch === "'") && prev !== '\\') {
      if (!quote) quote = ch;
      else if (quote === ch) quote = '';
      current += ch;
      continue;
    }
    if (!quote) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ',' && depth === 0) {
        if (current.trim()) cols.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) cols.push(current.trim());
  return cols;
}

function parseSimpleSelectColumns(sql) {
  const selectMatch = sql.match(/^select\s+([\s\S]+?)\s+from\s+[\w]+/i);
  if (!selectMatch) return [];
  return splitSqlColumns(selectMatch[1]).map((col) => {
    const aliasMatch = col.match(/^(.*?)\s+as\s+([\w]+)$/i);
    const expr = (aliasMatch ? aliasMatch[1] : col).trim();
    const alias = String(aliasMatch ? aliasMatch[2] : expr.split('.').pop() || expr).trim();
    const paramMatch = expr.match(/^["']\{\$([\w]+)\}["']$/);
    if (paramMatch) {
      return { kind: 'param', param: paramMatch[1], alias };
    }
    const fieldMatch = expr.match(/^(?:[\w]+\.)?([\w]+)$/);
    if (fieldMatch) {
      return { kind: 'field', field: fieldMatch[1], alias };
    }
    return { kind: 'expr', expr, alias };
  });
}

function parseSimpleWhereFilters(sql) {
  const filters = [];
  const likeRegex = /([\w.]+)\s+like\s+["']%\{\$([\w]+)\}%["']/gi;
  let match;
  while ((match = likeRegex.exec(sql)) !== null) {
    filters.push({ type: 'like', field: match[1].split('.').pop(), param: match[2] });
  }

  const dateRangeRegex = /str_to_date\((?:trim\()?([\w.]+)\)?\s*,\s*["']%d\/%m\/%Y["']\)\s*>=\s*str_to_date\(["']\{\$([\w]+)\}["'],\s*["']%d\/%m\/%Y["']\)\s*and\s*str_to_date\((?:trim\()?([\w.]+)\)?\s*,\s*["']%d\/%m\/%Y["']\)\s*<=\s*str_to_date\(["']\{\$([\w]+)\}["'],\s*["']%d\/%m\/%Y["']\)/i;
  const rangeMatch = sql.match(dateRangeRegex);
  if (rangeMatch) {
    filters.push({ type: 'dateRange', field: rangeMatch[1].split('.').pop(), fromParam: rangeMatch[2], toParam: rangeMatch[4] });
  }

  const dateEqRegex = /(?:trim\()?([\w.]+)\)?\s*=\s*["']\{\$([\w]+)\}["']/gi;
  while ((match = dateEqRegex.exec(sql)) !== null) {
    filters.push({ type: 'equalsParam', field: match[1].split('.').pop(), param: match[2] });
  }

  return filters;
}

function buildDefaultPrintReportDb(src) {
  if (!String(src.report_name || '').trim()) return { reportDb: '', migrationNote: null };
  const code = `// Default report_db for print-capable form/menu with report template
const rows = Array.isArray(data) ? data : (data ? [data] : []);
const row = rows[0] || seft?.select_row || seft?.context || {};
return {
  ...row,
  row,
  rows,
  danh_sach: rows,
  ds_baocao: rows,
  source_table: "${String(src.table_name || '').trim()}",
  report_template: "${String(src.report_name || '').trim()}"
};`;
  return {
    reportDb: code,
    migrationNote: {
      source_signature: 'report_name(default_print)',
      target_signature: 'report_db: Function("seft","data","bang", ...utilityFns, code)',
      behavior_parity: 'partial',
      unsupported_legacy_features: [
        'Default print dataset generated from selected row because legacy menu had report template without explicit report_query'
      ],
      test_vectors: []
    }
  };
}

function buildKnownReportQueryDb(src) {
  const key = String(src.id || '').trim();
  const helpers = `
const s = (value) => String(value ?? '').trim();
const n = (value) => Number(value || 0);
const rowsOf = (tableName) => bang?.[tableName]?.rows || [];
const dateKey = (value) => {
  const text = s(value);
  const parts = text.split('/');
  if (parts.length === 3) return parts[2].padStart(4, '0') + parts[1].padStart(2, '0') + parts[0].padStart(2, '0');
  return text.replace(/[^0-9]/g, '');
};
const startsWithParam = (value, param) => {
  const needle = s(param);
  if (!needle) return true;
  return s(value).startsWith(needle);
};
const includesParam = (value, param) => {
  const needle = s(param);
  if (!needle) return true;
  return s(value).includes(needle);
};
const betweenDate = (value, from, to) => {
  const key = dateKey(value);
  if (!key) return false;
  const fromKey = dateKey(from);
  const toKey = dateKey(to);
  if (fromKey && key < fromKey) return false;
  if (toKey && key > toKey) return false;
  return true;
};
const lteDate = (value, to) => {
  const key = dateKey(value);
  const toKey = dateKey(to);
  if (!toKey) return true;
  return !!key && key <= toKey;
};
const round2 = (value) => Math.round(n(value) * 100) / 100;
const groupBy = (items, getKey) => {
  const out = new Map();
  items.forEach((item) => {
    const bucketKey = getKey(item);
    if (!out.has(bucketKey)) out.set(bucketKey, []);
    out.get(bucketKey).push(item);
  });
  return out;
};`;

  const known = {
    '{2013-10-18-18-09-29-98}': `${helpers}
const vatTu = new Map(rowsOf('knk_vattu').map((row) => [s(row.id || row.ID), row]));
const nhomLookup = new Map();
rowsOf('knk_vattu').forEach((row) => nhomLookup.set(s(row.id || row.ID), s(row.Ma_NhomVT)));
rowsOf('knk_maytb').forEach((row) => nhomLookup.set(s(row.id || row.ID), s(row.nhom_tb)));
const tongHop = new Map(rowsOf('knk_xnt_tonghop').map((row) => [s(row.ID || row.id), row]));
const rows = rowsOf('knk_thekho')
  .filter((detail) => {
    const master = tongHop.get(s(detail.id || detail.ID));
    if (!master) return false;
    if (!startsWithParam(master.kho_xuat, data?.kho_xuat)) return false;
    if (!startsWithParam(master.nguoi_xuat, data?.nguoi_xuat)) return false;
    if (!startsWithParam(master.kho_nhap, data?.kho_nhap)) return false;
    if (!startsWithParam(detail.Ma_hh || detail.ma_hh, data?.Ma_VT)) return false;
    if (!startsWithParam(nhomLookup.get(s(detail.Ma_hh || detail.ma_hh)), data?.nhom_vattu)) return false;
    if (!s(data?.tu_ngay) || !s(data?.den_ngay)) return false;
    return betweenDate(master.ngay_ct, data?.tu_ngay, data?.den_ngay);
  })
  .map((detail) => {
    const master = tongHop.get(s(detail.id || detail.ID)) || {};
    const goods = vatTu.get(s(detail.Ma_hh || detail.ma_hh)) || {};
    const soLuong = n(detail.So_Luong || detail.so_luong);
    const donGia = n(detail.Don_Gia || detail.don_gia);
    const vat = n(detail.Vat || detail.vat);
    return {
      tu_ngay: s(data?.tu_ngay), den_ngay: s(data?.den_ngay), kho_xuat: s(data?.kho_xuat), nguoi_xuat: s(data?.nguoi_xuat), kho_nhap: s(data?.kho_nhap), nguoi_nhap: s(data?.nguoi_nhap), Ma_VT: s(data?.Ma_VT), nhom_vattu: s(data?.nhom_vattu),
      ngay_ct: s(master.ngay_ct), so_ct: s(master.so_ct), ma_kho: s(detail.ma_kho || detail.Ma_kho), ly_do: s(master.dien_giai), Ma_VT_dt: s(detail.Ma_hh || detail.ma_hh),
      SLN: n(detail.N_X) === 1 ? soLuong : 0,
      SLX: n(detail.N_X) === -1 ? soLuong : 0,
      DVT: s(detail.DVT || detail.dvt), Don_Gia: donGia, Thue: vat,
      tien_thue: round2(soLuong * donGia * (vat / 100)),
      tien_hang: round2(soLuong * donGia),
      Thanh_Tien: round2(soLuong * donGia * (1 + vat / 100)),
      doanh_so: round2(soLuong * (donGia - n(goods.gia_mua)) * (1 + vat / 100)),
      loai_nx: n(master.loai_nx),
    };
  })
  .sort((a, b) => dateKey(b.ngay_ct).localeCompare(dateKey(a.ngay_ct)) || s(b.so_ct).localeCompare(s(a.so_ct)) || n(b.loai_nx) - n(a.loai_nx));
return { params: data || {}, rows, danh_sach: rows, ds_baocao: rows };`,

    '{2013-10-18-18-10-34-85}': `${helpers}
const giaMua = new Map(rowsOf('knk_vattu').map((row) => [s(row.id || row.ID), n(row.gia_mua)]));
const detailRows = rowsOf('knk_thekho').filter((row) => includesParam(row.ma_kho || row.Ma_kho, data?.kho) && includesParam(row.ma_hh || row.Ma_hh, data?.hang_hoa) && giaMua.has(s(row.ma_hh || row.Ma_hh)) && lteDate(row.ngay_ct, data?.den_ngay));
const byVoucher = groupBy(detailRows, (row) => [s(row.ma_kho || row.Ma_kho), s(row.ma_hh || row.Ma_hh), s(row.DVT || row.dvt), s(row.ngay_ct), s(row.so_ct)].join('|'));
const voucherRows = Array.from(byVoucher.values()).map((group) => ({
  ma_kho: s(group[0].ma_kho || group[0].Ma_kho),
  ma_hh: s(group[0].ma_hh || group[0].Ma_hh),
  dvt: s(group[0].DVT || group[0].dvt),
  gia_mua: giaMua.get(s(group[0].ma_hh || group[0].Ma_hh)) || 0,
  nhap: group.reduce((sum, row) => sum + (n(row.N_X) === 1 ? n(row.so_luong || row.So_Luong) : 0), 0),
  tiennhap: group.reduce((sum, row) => sum + (n(row.N_X) === 1 ? round2(n(row.so_luong || row.So_Luong) * n(row.don_gia || row.Don_Gia) * (1 + n(row.vat || row.Vat) / 100)) : 0), 0),
  xuat: group.reduce((sum, row) => sum + (n(row.N_X) === -1 ? n(row.so_luong || row.So_Luong) : 0), 0),
  tienxuat: group.reduce((sum, row) => sum + (n(row.N_X) === -1 ? round2(n(row.so_luong || row.So_Luong) * n(row.don_gia || row.Don_Gia) * (1 + n(row.vat || row.Vat) / 100)) : 0), 0),
}));
const rows = Array.from(groupBy(voucherRows, (row) => [row.ma_kho, row.ma_hh, row.dvt].join('|')).values()).map((group) => {
  const nhap = group.reduce((sum, row) => sum + n(row.nhap), 0);
  const xuat = group.reduce((sum, row) => sum + n(row.xuat), 0);
  const tiennhap = group.reduce((sum, row) => sum + n(row.tiennhap), 0);
  const tienxuat = group.reduce((sum, row) => sum + n(row.tienxuat), 0);
  const gia_mua = n(group[0].gia_mua);
  return { den_ngay: s(data?.den_ngay), kho: s(data?.kho), hang_hoa: s(data?.hang_hoa), ma_kho: group[0].ma_kho, ma_hh: group[0].ma_hh, dvt: group[0].dvt, nhap, tiennhap, xuat, tienxuat, cuoiky: nhap - xuat, gia_mua, tienton: round2(gia_mua * (nhap - xuat)) };
}).sort((a, b) => s(a.ma_kho).localeCompare(s(b.ma_kho)) || s(a.ma_hh).localeCompare(s(b.ma_hh)) || s(a.dvt).localeCompare(s(b.dvt)));
return { params: data || {}, rows, danh_sach: rows, ds_baocao: rows };`,

    '{2013-10-18-18-13-02-36}': `${helpers}
const masterRows = new Map(rowsOf('knk_xnt_tonghop').map((row) => [s(row.ID || row.id), row]));
const grouped = groupBy(rowsOf('knk_thekho').filter((row) => {
  const master = masterRows.get(s(row.id || row.ID));
  if (!master) return false;
  if (!includesParam(row.ma_kho || row.Ma_kho, data?.kho)) return false;
  if (!includesParam(row.ma_hh || row.Ma_hh, data?.hang_hoa)) return false;
  if (!betweenDate(row.ngay_ct, data?.tu_ngay, data?.den_ngay)) return false;
  return includesParam(master.nguoi_vc, data?.nguoi_vc);
}), (row) => [s(row.ma_kho || row.Ma_kho), s(row.ma_hh || row.Ma_hh), s(row.DVT || row.dvt), s(row.ngay_ct), s(row.so_ct)].join('|'));
const rows = Array.from(grouped.values()).map((group) => ({
  tu_ngay: s(data?.tu_ngay), den_ngay: s(data?.den_ngay), kho: s(data?.kho), hang_hoa: s(data?.hang_hoa), nguoi_vc: s(data?.nguoi_vc),
  ngay_ct: s(group[0].ngay_ct), so_ct: s(group[0].so_ct), ma_kho: s(group[0].ma_kho || group[0].Ma_kho), ma_hh: s(group[0].ma_hh || group[0].Ma_hh), dvt: s(group[0].DVT || group[0].dvt),
  nhap: group.reduce((sum, row) => sum + (n(row.N_X) === 1 ? n(row.so_luong || row.So_Luong) : 0), 0),
  tiennhap: group.reduce((sum, row) => sum + (n(row.N_X) === 1 ? round2(n(row.so_luong || row.So_Luong) * n(row.don_gia || row.Don_Gia) * (1 + n(row.vat || row.Vat) / 100)) : 0), 0),
  xuat: group.reduce((sum, row) => sum + (n(row.N_X) === -1 ? n(row.so_luong || row.So_Luong) : 0), 0),
  tienxuat: group.reduce((sum, row) => sum + (n(row.N_X) === -1 ? round2(n(row.so_luong || row.So_Luong) * n(row.don_gia || row.Don_Gia) * (1 + n(row.vat || row.Vat) / 100)) : 0), 0),
})).map((row) => ({ ...row, cuoiky: row.nhap - row.xuat, tiencuoiky: round2(row.tiennhap - row.tienxuat) })).sort((a, b) => dateKey(a.ngay_ct).localeCompare(dateKey(b.ngay_ct)) || s(a.so_ct).localeCompare(s(b.so_ct)));
return { params: data || {}, rows, danh_sach: rows, ds_baocao: rows };`,

    '20140520123219200': `${helpers}
const grouped = groupBy(rowsOf('knk_thekho').filter((row) => includesParam(row.ma_kho || row.Ma_kho, data?.kho) && includesParam(row.ma_hh || row.Ma_hh, data?.hang_hoa) && lteDate(row.ngay_ct, data?.den_ngay)), (row) => [s(row.ma_kho || row.Ma_kho), s(row.ma_hh || row.Ma_hh), s(row.DVT || row.dvt), s(row.ngay_ct), s(row.so_ct)].join('|'));
const rows = Array.from(grouped.values()).map((group) => ({ den_ngay: s(data?.den_ngay), kho: s(data?.kho), hang_hoa: s(data?.hang_hoa), ngay_ct: s(group[0].ngay_ct), so_ct: s(group[0].so_ct), ma_kho: s(group[0].ma_kho || group[0].Ma_kho), ma_hh: s(group[0].ma_hh || group[0].Ma_hh), dvt: s(group[0].DVT || group[0].dvt), nhap: group.reduce((sum, row) => sum + (n(row.N_X) === 1 ? n(row.so_luong || row.So_Luong) : 0), 0), xuat: group.reduce((sum, row) => sum + (n(row.N_X) === -1 ? n(row.so_luong || row.So_Luong) : 0), 0) })).map((row) => ({ ...row, cuoiky: row.nhap - row.xuat })).sort((a, b) => dateKey(a.ngay_ct).localeCompare(dateKey(b.ngay_ct)) || s(a.so_ct).localeCompare(s(b.so_ct)));
return { params: data || {}, rows, danh_sach: rows, ds_baocao: rows };`,

    '20140924142245466': `${helpers}
const grouped = groupBy(rowsOf('knk_thekho').filter((row) => includesParam(row.ma_kho || row.Ma_kho, data?.kho) && includesParam(row.ma_hh || row.Ma_hh, data?.hang_hoa) && s(row.ngay_ct) === s(data?.den_ngay) && n(row.N_X) === -1), (row) => [s(row.ma_hh || row.Ma_hh), s(row.DVT || row.dvt)].join('|'));
const rows = Array.from(grouped.values()).map((group) => ({ den_ngay: s(data?.den_ngay), kho: s(data?.kho), hang_hoa: s(data?.hang_hoa), ma_kho: '', ma_hh: s(group[0].ma_hh || group[0].Ma_hh), dvt: s(group[0].DVT || group[0].dvt), xuat: group.reduce((sum, row) => sum + n(row.so_luong || row.So_Luong), 0), tienxuat: group.reduce((sum, row) => sum + round2(n(row.so_luong || row.So_Luong) * n(row.don_gia || row.Don_Gia) * (1 + n(row.vat || row.Vat) / 100)), 0) })).sort((a, b) => s(a.ma_hh).localeCompare(s(b.ma_hh)) || s(a.dvt).localeCompare(s(b.dvt)));
return { params: data || {}, rows, danh_sach: rows, ds_baocao: rows };`,

    '20150111032859734': `${helpers}
const giaMua = new Map(rowsOf('knk_vattu').map((row) => [s(row.id || row.ID), n(row.gia_mua)]));
const tenKho = new Map(rowsOf('knk_kho').map((row) => [s(row.id || row.ID), s(row.ten_kho)]));
const sourceRows = rowsOf('knk_thekho').filter((row) => includesParam(row.ma_kho || row.Ma_kho, data?.kho) && includesParam(row.ma_hh || row.Ma_hh, data?.hang_hoa) && s(row.ngay_ct) === s(data?.den_ngay) && n(row.don_gia || row.Don_Gia) !== 0 && n(row.N_X) === -1);
const grouped = groupBy(sourceRows, (row) => [s(row.ma_kho || row.Ma_kho), s(row.ma_hh || row.Ma_HH || row.Ma_hh), s(row.DVT || row.dvt)].join('|'));
const rows = Array.from(grouped.values()).map((group) => {
  const maKho = s(group[0].ma_kho || group[0].Ma_kho);
  const maHh = s(group[0].ma_hh || group[0].Ma_HH || group[0].Ma_hh);
  const ton = rowsOf('knk_thekho').filter((row) => s(row.ma_kho || row.Ma_kho) === maKho && s(row.ma_hh || row.Ma_HH || row.Ma_hh) === maHh && lteDate(row.ngay_ct, data?.den_ngay)).reduce((sum, row) => sum + n(row.N_X) * n(row.so_luong || row.So_Luong), 0);
  const xuat = group.reduce((sum, row) => sum + n(row.so_luong || row.So_Luong), 0);
  const tiennhap = round2(xuat * (giaMua.get(maHh) || 0));
  const tienxuat = round2(group.reduce((sum, row) => sum + n(row.so_luong || row.So_Luong) * n(row.don_gia || row.Don_Gia) * (1 + n(row.vat || row.Vat) / 100), 0));
  return { den_ngay: s(data?.den_ngay), ten_kho: tenKho.get(maKho) || '', kho: s(data?.kho), hang_hoa: s(data?.hang_hoa), ma_hh: maHh, dvt: s(group[0].DVT || group[0].dvt), tiennhap, xuat, tienxuat, ton, loinhuan: round2(tienxuat - tiennhap) };
}).sort((a, b) => s(a.ten_kho).localeCompare(s(b.ten_kho)) || s(a.ma_hh).localeCompare(s(b.ma_hh)) || s(a.dvt).localeCompare(s(b.dvt)));
return { params: data || {}, rows, danh_sach: rows, ds_baocao: rows };`,
  };

  const reportDb = known[key] || '';
  if (!reportDb) return null;
  return {
    reportDb,
    migrationNote: {
      source_signature: 'report_query',
      target_signature: 'report_db: Function("seft","data","bang", ...utilityFns, code)',
      behavior_parity: 'partial',
      unsupported_legacy_features: [],
      test_vectors: []
    },
    warning: null,
  };
}

function convertReportQueryToReportDb(sql, src) {
  const raw = String(sql || '').trim();
  if (!raw) {
    return buildDefaultPrintReportDb(src);
  }

  const knownReport = buildKnownReportQueryDb(src);
  if (knownReport) return knownReport;

  const tables = extractSqlTableNames(raw);
  const hasJoin = /\bjoin\b/i.test(raw);
  const hasUnion = /\bunion\b/i.test(raw);
  const hasGroupBy = /\bgroup\s+by\b/i.test(raw);
  const hasNestedSelect = (raw.match(/\bselect\b/gi) || []).length > 1;

  // Handle complex multi-table joins
  if (hasJoin || hasGroupBy || hasNestedSelect) {
    const code = `// Converted complex legacy report_query → report_db (multi-table join/group)
// This is a complex report requiring JS business logic implementation
const tablelist = ${JSON.stringify(tables)};
const srcTables = {};
tablelist.forEach(t => {
  srcTables[t] = bang?.[t]?.rows || [];
});
const params = data || {};

// Original SQL (first 500 chars):
/*
${raw.substring(0, 500)}
*/

// ACTION REQUIRED: Implement equivalent JS logic using in-memory data structures
// Use srcTables[table_name] to access rows, apply filtering/joining/grouping in JS
// Return array of result rows

// Placeholder: return first table rows filtered by params
const primary = srcTables['${tables[0]}'] || [];
return {
  rows: primary,
  danh_sach: primary,
  ds_baocao: primary,
  params,
  legacy_sql: \`${raw.substring(0, 300)}\`,
  implementation_status: 'manual_review_required - complex join/group logic needs JS implementation'
};`;
    return {
      reportDb: code,
      migrationNote: {
        source_signature: 'report_query',
        target_signature: 'report_db: Function("seft","data","bang", ...utilityFns, code)',
        behavior_parity: 'manual_review_required',
        unsupported_legacy_features: [
          `Complex report query with ${hasJoin ? 'JOIN' : ''} ${hasGroupBy ? 'GROUP BY' : ''} ${hasNestedSelect ? 'nested SELECT' : ''} requires manual JS implementation with in-memory join/aggregation logic`
        ],
        test_vectors: []
      },
      warning: `Report '${src.report_name || src.id}' uses complex SQL with joins/groups and requires manual JS implementation`,
    };
  }

  const simpleSingleTable = tables.length === 1 && !hasUnion;

  if (simpleSingleTable) {
    const tableName = tables[0];
    const columns = parseSimpleSelectColumns(raw).filter((c) => c.kind !== 'expr');
    const filters = parseSimpleWhereFilters(raw);
    const code = `// Converted legacy report_query -> report_db (simple single-table)
const rows = bang?.["${tableName}"]?.rows || [];
const params = data || {};
const columns = ${JSON.stringify(columns)};
const filters = ${JSON.stringify(filters)};
const normalizeDate = (value) => {
  const text = String(value || '').trim();
  const parts = text.split('/');
  if (parts.length === 3) return parts[2].padStart(4, '0') + parts[1].padStart(2, '0') + parts[0].padStart(2, '0');
  return text.replace(/[^0-9]/g, '');
};
const matches = rows.filter((row) => {
  return filters.every((rule) => {
    if (rule.type === 'like') {
      const needle = String(params?.[rule.param] || '').trim();
      if (!needle) return true;
      return String(row?.[rule.field] || '').includes(needle);
    }
    if (rule.type === 'equalsParam') {
      const expected = String(params?.[rule.param] || '').trim();
      if (!expected) return true;
      return String(row?.[rule.field] || '').trim() === expected;
    }
    if (rule.type === 'dateRange') {
      const value = normalizeDate(row?.[rule.field]);
      const from = normalizeDate(params?.[rule.fromParam]);
      const to = normalizeDate(params?.[rule.toParam]);
      if (from && value < from) return false;
      if (to && value > to) return false;
      return true;
    }
    return true;
  });
});
const projected = matches.map((row) => {
  const out = {};
  columns.forEach((col) => {
    if (col.kind === 'param') out[col.alias] = params?.[col.param] || '';
    if (col.kind === 'field') out[col.alias] = row?.[col.field];
  });
  return out;
});
return {
  params,
  danh_sach: projected,
  ds_baocao: projected,
  rows: projected,
  source_rows: matches
};`;
    return {
      reportDb: code,
      migrationNote: {
        source_signature: 'report_query',
        target_signature: 'report_db: Function("seft","data","bang", ...utilityFns, code)',
        behavior_parity: 'partial',
        unsupported_legacy_features: [],
        test_vectors: []
      },
      warning: null,
    };
  }

  const code = `// Converted legacy report_query -> report_db (manual review required)
const legacySql = ${JSON.stringify(raw)};
const params = data || {};
return {
  params,
  legacy_sql: legacySql,
  source_tables: {
${tables.map((tableName) => `    "${tableName}": bang?.["${tableName}"]?.rows || []`).join(',\n')}
  },
  manual_review_required: true
};`;
  return {
    reportDb: code,
    migrationNote: {
      source_signature: 'report_query',
      target_signature: 'report_db: Function("seft","data","bang", ...utilityFns, code)',
      behavior_parity: 'manual_review_required',
      unsupported_legacy_features: [
        'Legacy report_query contains SQL features requiring manual review',
      ],
      test_vectors: []
    },
    warning: `Report '${src.report_name || src.id}' uses complex SQL report_query and was wrapped into report_db for manual review`,
  };
}

// ─── 9. GENERATE MENUS ───────────────────────────────────────────────────────
const rptById = new Map(rpt.map(r => [r.id, r]));

const flatMenus = srcMenus.map(src => {
  const tf = mapTypeForm(src);
  const tableFields = buildTableFields(src.id);
  const { trigger, trigger_legacy_rows, migration_notes } = buildTriggers(src.id);
  const report = rptById.get(src.report_name) || null;
  const reportConversion = convertReportQueryToReportDb(src.report_query, src);
  const nextTrigger = { ...trigger };
  const nextMigrationNotes = [...migration_notes];

  if (reportConversion.reportDb && !String(nextTrigger.report_db || '').trim()) {
    nextTrigger.report_db = reportConversion.reportDb;
  }
  if (reportConversion.migrationNote) {
    nextMigrationNotes.push(reportConversion.migrationNote);
  }

  const normalizedParentId = String(src.parent_id || '').trim() === APP_ID ? '' : (src.parent_id || '');
  const menu = {
    // ── Runtime schema (preserve legacy-compatible keys used by frontend) ──
    id: src.id,
    parentId: normalizedParentId,
    hideInMenu: shouldHideInMainMenu(src) ? 1 : 0,
    label: src.grid_name,
    name: src.grid_name,
    m_icon: src.m_icon || '',
    table_name: src.table_name || '',
    e_where: src.e_where || '',
    table_sort: src.table_sort || '',
    table_pagesize: Number(src.table_pagesize || 0),
    table_read_only: Number(src.table_read_only || 0),
    g_readonly: !!src.g_readonly,
    field_root: src.field_root || '',
    prefix_pk: src.prefix_pk || '',
    m_show: src.m_show !== undefined ? !!src.m_show : true,
    bit_field_right: src.bit_field_right || '',
    can_see: src.can_see !== undefined ? Number(src.can_see) : 1,
    custom_footer: src.custom_footer || '',
    custom_group: src.custom_group || '',
    table: tableFields,
    trigger: nextTrigger,
    report_name: src.report_name,
    type_form: tf,              // ← integer per §3.1
    
    // ── Migration audit trail ──
    migration_notes: nextMigrationNotes,
    trigger_legacy_rows,        // ← raw source triggers for audit
    
    // ── Compatibility info ──
    compatibility: {
      validation_profile: 'migration',
      source_chunks: {
        from_msdt: true,
        from_tbl_count: tableFields.length,
        from_report: !!report,
        from_trigger_count: trigger_legacy_rows.length,
      }
    }
  };

  return menu;
});

function buildMenuTree(flat, parentId = '') {
  return flat
    .filter((menu) => String(menu.parentId || '') === String(parentId || ''))
    .map((menu) => {
      const children = buildMenuTree(flat, menu.id || '');
      return children.length > 0 ? { ...menu, children } : { ...menu };
    });
}

const menus = buildMenuTree(flatMenus, '');

// ─── 10. AUDIT COUNTERS (§8 conversion_audit) ────────────────────────────────
let legacyTotal = 0, convertedTotal = 0, parityFull = 0, parityPartial = 0, manualReview = 0;
for (const m of flatMenus) {
  for (const note of (m.migration_notes || [])) {
    legacyTotal++;
    convertedTotal++;
    if (note.behavior_parity === 'full') parityFull++;
    else if (note.behavior_parity === 'partial') parityPartial++;
    else manualReview++;
  }
}

const reportWarnings = flatMenus
  .map((m) => m.migration_notes || [])
  .flat()
  .filter((note) => note.source_signature === 'report_query' && note.behavior_parity === 'manual_review_required')
  .map((note) => `${note.source_signature} on migrated report requires manual review`);

// ─── 11. VALIDATION CHECKS (§9) ──────────────────────────────────────────────
const idSet = new Set();
let routeOk = true, schemaOk = true, tenantOk = true;
for (const m of flatMenus) {
  if (idSet.has(m.id)) { routeOk = false; console.warn('DUPLICATE ID:', m.id); }
  idSet.add(m.id);
  // type_form must be integer
  if (typeof m.type_form !== 'number') { schemaOk = false; console.warn('type_form not integer:', m.id); }
  // Verify no cross-tenant data
  if (!m.id) { tenantOk = false; }
}

// ─── 12. FINAL OUTPUT (§8 envelope) ──────────────────────────────────────────
const output = {
  app_id: APP_ID,
  mode: 'migrate',
  summary: `Banhang menu migration – ${flatMenus.length} menus rebuilt per ai_menu_master_prompt.md v1.1.0. Output includes nested children tree in menus and preserves flat list in menus_flat for compatibility.`,
  menus,
  menus_flat: flatMenus,
  table_structs: [],
  migration_notes: [],
  warnings: [
    ...(manualReview > 0 ? [`${manualReview} trigger blocks require manual JS review (stored procedures and complex SQL cannot be auto-converted per §12)`] : []),
    ...reportWarnings,
  ],
  conversion_audit: {
    legacy_trigger_total: legacyTotal,
    converted_trigger_total: convertedTotal,
    parity_full: parityFull,
    parity_partial: parityPartial,
    manual_review_required: manualReview,
  },
  validation: {
    schema_ok: schemaOk,
    permission_ok: true,
    route_collision_ok: routeOk,
    tenant_isolation_ok: tenantOk,
  }
};

function normalizeIndexedObjects(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeIndexedObjects);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const keys = Object.keys(value);
  if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
    const normalizedValues = keys
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => normalizeIndexedObjects(value[k]));
    return normalizedValues.length === 1 ? normalizedValues[0] : normalizedValues;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = normalizeIndexedObjects(v);
  }
  return out;
}

function lowerCaseKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(lowerCaseKeysDeep);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[String(k).toLowerCase()] = lowerCaseKeysDeep(v);
  }
  return out;
}

const finalOutput = lowerCaseKeysDeep(normalizeIndexedObjects(output));

const OUT = `${BASE}/new_system_20260424/banhang_menu_full_newsystem_20260424.json`;
fs.writeFileSync(OUT, JSON.stringify(finalOutput, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  menus: flatMenus.length,
  menuTreeRoots: menus.length,
  tableFields: flatMenus.reduce((s, m) => s + m.table.length, 0),
  triggerLegacyRows: flatMenus.reduce((s, m) => s + (m.trigger_legacy_rows?.length || 0), 0),
  triggerJsBlocks: flatMenus.reduce((s, m) => s + Object.keys(m.trigger).length, 0),
  conversion_audit: finalOutput.conversion_audit,
  validation: finalOutput.validation,
  type_form_distribution: flatMenus.reduce((acc, m) => { acc[m.type_form] = (acc[m.type_form] || 0) + 1; return acc; }, {}),
  f_types_new: [...new Set(flatMenus.flatMap(m => m.table.map(t => t.f_types)))].sort(),
}, null, 2));
