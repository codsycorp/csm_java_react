'use strict';
const fs = require('fs');

// [oldLabel, newVI, newEN, newZH]
const RENAMES = [
  // ── Banhang: dưới "Công nợ" ──────────────────────────────────────────────
  ['Công nợ khách hàng', 'Khách hàng',  'Customers',      '客户'],
  ['Công nợ NCC',        'NCC',          'Suppliers',      '供应商'],
  // ── Banhang: dưới "Danh mục" ─────────────────────────────────────────────
  ['Danh mục khách hàng','Khách hàng',  'Customers',      '客户'],
  ['Danh Mục Kho',       'Kho',          'Warehouse',      '仓库'],
  ['Danh mục đơn hàng',  'Đơn hàng',    'Orders',         '订单'],
  // ── Vemaybay: dưới "Xuất vé" ─────────────────────────────────────────────
  ['Xuất vé ra Excel',   'Xuất Excel',  'Export to Excel','导出Excel'],
];

const nfc = s => (s || '').normalize('NFC');
const renameMap = new Map(RENAMES.map(([old, vi, en, zh]) => [nfc(old), { vi, en, zh }]));

function patchNode(m) {
  const key = nfc(m.label);
  if (renameMap.has(key)) {
    const r = renameMap.get(key);
    m.label    = r.vi;
    m.name     = r.vi;
    m.label_en = r.en;
    m.label_zh = r.zh;
  }
  (m.children || []).forEach(patchNode);
  (m.nodes    || []).forEach(patchNode);
}

function patchFile(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let count = 0;

  // patch menus tree
  (data.menus || []).forEach(patchNode);

  // patch menus_flat
  data.menus_flat.forEach(m => {
    const key = nfc(m.label);
    if (renameMap.has(key)) {
      const r = renameMap.get(key);
      m.label    = r.vi;
      m.name     = r.vi;
      m.label_en = r.en;
      m.label_zh = r.zh;
      count++;
    }
  });

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`✓ ${filePath.split('/').pop()}: ${count} labels updated`);
}

patchFile('backend/csm_datas/public/banhang/new_system_20260424/banhang_menu_full_newsystem_20260424.json');
patchFile('backend/csm_datas/public/vemaybay/new_system_20260428/vemaybay_menu_full_newsystem_20260428.json');
