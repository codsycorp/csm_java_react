'use strict';
const fs = require('fs');
const path = require('path');

// ── Rename map: [old_vi, new_vi, new_en, new_zh] ─────────────────────────────
const RENAMES = [
  // ── Banhang ──
  ['Danh mục hàng hóa, vật tư, nguyên phụ liệu', 'Hàng hóa & Vật tư', 'Goods & Materials', '商品与材料'],
  ['Báo cáo tổng hợp thu chi theo ngày',          'TH thu chi theo ngày', 'Daily Inc/Exp Summary', '每日收支汇总'],
  ['Báo cáo chi tiết thu chi theo ngày',           'CT thu chi theo ngày', 'Daily Inc/Exp Detail', '每日收支明细'],
  ['Báo cáo tổng hợp xuất nhập tồn',              'TH xuất nhập tồn',     'Inventory Summary',     '进销存汇总'],
  ['Báo cáo doanh số &amp; Tồn kho',              'Doanh số & Tồn kho',   'Sales & Inventory',     '销售与库存'],
  ['Báo cáo chi tiết xuất nhập tồn',              'CT xuất nhập tồn',     'Inventory Detail',      '进销存明细'],
  ['Bảng kê xuất - nhập hàng ngày',               'Xuất nhập hàng ngày',  'Daily In/Out',          '每日进出货'],
  ['Báo cáo chi tiết công nợ xuất',               'CT công nợ xuất',      'Payable Detail',        '销售应收明细'],
  ['Báo cáo chi tiết công nợ nhập',               'CT công nợ nhập',      'Receivable Detail',     '采购应付明细'],
  ['Danh mục phương thức thu chi',                 'Phương thức thu chi',  'Payment Methods',       '收支方式'],
  ['Nhân Viên Sử Dụng Phần Mềm',                  'NV phần mềm',          'Software Users',        '软件用户'],
  ['Định mức nguyên vật liệu',                     'Định mức NVL',         'Material Standard',     '原材料定额'],
  ['Xem công nợ nhà cung cấp',                     'Công nợ NCC',          'Supplier Payables',     '供应商应付款'],
  ['Nhật ký  xuất  nhập hàng',                     'Nhật ký XNH',          'In/Out Journal',        '进出货日记账'],
  ['Danh mục tồn quỹ đầu kỳ',                     'Tồn quỹ đầu kỳ',       'Opening Cash Balance',  '期初现金余额'],
  ['Xem công nợ khách hàng',                       'Công nợ khách hàng',   'Customer Receivables',  '客户应收款'],
  ['Danh mục nhóm hàng hóa',                       'Nhóm hàng hóa',        'Product Groups',        '商品分组'],
  ['Danh mục Loại hàng hóa',                       'Loại hàng hóa',        'Product Types',         '商品类型'],
  // ── Vemaybay ──
  ['Báo cáo công nợ bán vé',                       'Công nợ bán vé',       'Ticket Sales Debt',     '售票应收账款'],
  ['Doanh số công nợ tour',                         'DS & CN tour',         'Tour Sales & Debt',     '团队销售与应收'],
];

const nfc = s => (s || '').normalize('NFC');

function renameInTree(items, oldLabel, newLabel, newEn, newZh) {
  if (!items) return;
  items.forEach(m => {
    if (nfc(m.label) === nfc(oldLabel)) {
      m.label = newLabel;
      m.label_en = newEn;
      m.label_zh = newZh;
      m.name = newLabel;
    }
    renameInTree(m.children, oldLabel, newLabel, newEn, newZh);
    renameInTree(m.nodes, oldLabel, newLabel, newEn, newZh);
  });
}

function patchFile(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let count = 0;

  for (const [oldVI, newVI, newEN, newZH] of RENAMES) {
    let found = false;
    data.menus_flat.forEach(m => {
      if (nfc(m.label) === nfc(oldVI)) {
        m.label = newVI;
        m.label_en = newEN;
        m.label_zh = newZH;
        m.name = newVI;
        found = true;
        count++;
      }
    });
    if (found) renameInTree(data.menus, oldVI, newVI, newEN, newZH);
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`✓ ${path.basename(filePath)}: ${count} labels shortened`);
}

patchFile('backend/csm_datas/public/banhang/new_system_20260424/banhang_menu_full_newsystem_20260424.json');
patchFile('backend/csm_datas/public/vemaybay/new_system_20260428/vemaybay_menu_full_newsystem_20260428.json');
