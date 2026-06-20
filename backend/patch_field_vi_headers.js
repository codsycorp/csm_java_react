'use strict';
const fs = require('fs');

// Map: field_code → [vi_header, en_header, zh_header]
// Used when f_header_vi is empty OR is still the raw field code
const CODE_TO_HEADERS = {
  // ── Common ───────────────────────────────────────────────────────────────────
  'id':             ['ID',              'ID',                    'ID'],
  'parent_id':      ['ID cha',          'Parent ID',             '父级ID'],
  // ── Banhang field codes ───────────────────────────────────────────────────────
  'loai_ct':        ['Loại CT',         'Doc Type',              '凭证类型'],
  'loai_nx':        ['Loại XN',         'In/Out Type',           '进出库类型'],
  'xuat_bc':        ['Xuất BC',         'Export Report',         '导出报表'],
  'xuat_dhtong':    ['Xuất ĐH tổng',   'Export Total Orders',   '导出总订单'],
  'con_lai':        ['Còn lại',         'Remaining',             '剩余'],
  'no_cu':          ['Nợ cũ',           'Old Debt',              '旧欠款'],
  'thanh_toan':     ['Thanh toán',      'Payment',               '付款'],
  'alert_color_red':['Cảnh báo',        'Alert',                 '警报'],
  'lo_hang':        ['Lô hàng',         'Batch',                 '批次'],
  'so_hd':          ['Số HĐ',           'Invoice No.',           '发票号'],
  // ── Vemaybay field codes ─────────────────────────────────────────────────────
  'pass':           ['Hộ chiếu',        'Passport',              '护照'],
  'userid':         ['Người dùng',      'User ID',               '用户ID'],
  'ch_kt':          ['KT duyệt',        'Acct. Check',           '会计审核'],
  'cp_trungve':     ['CP trùng vé',     'Dup. Ticket Cost',      '重叠票成本'],
  'in_phieuchi':    ['In phiếu chi',    'Print Payment',         '打印付款单'],
  'so_phieuchi':    ['Số phiếu chi',    'Payment No.',           '付款单号'],
  'xem_phieuchi':   ['Xem phiếu chi',  'View Payment',          '查看付款单'],
  'den_ngay':       ['Đến ngày',        'To Date',               '截止日期'],
  'tu_ngay':        ['Từ ngày',         'From Date',             '起始日期'],
  'so_ct':          ['Số CT',           'Voucher No.',           '凭证编号'],
  'so_tien_final':  ['Số tiền (final)', 'Final Amount',          '最终金额'],
  'nhan_vien':      ['Nhân viên',       'Employee',              '员工'],
  'so_bien_nhan':   ['Số biên nhận',    'Receipt No.',           '收据编号'],
  'ten_khach_hang': ['Tên khách hàng',  'Customer Name',         '客户名称'],
  'ten_hang_ve':    ['Tên hãng vé',     'Airline Name',          '航空公司名称'],
  'in_biennhan':    ['In biên nhận',    'Print Receipt',         '打印收据'],
  'so_biennhan':    ['Số biên nhận',    'Receipt No.',           '收据编号'],
  'xem_biennhan':   ['Xem biên nhận',  'View Receipt',          '查看收据'],
  'khach_hang_cn':  ['KH công nợ',      'Customer (Debt)',        '欠款客户'],
  'loai_cong_no':   ['Loại CN',         'Debt Type',             '应收应付类型'],
  'ghi_chu':        ['Ghi chú',         'Note',                  '备注'],
  'loi_nhuan':      ['Lợi nhuận',       'Profit',                '利润'],
  'ngay_chi':       ['Ngày chi',        'Payment Date',          '付款日期'],
  'ngay_thu':       ['Ngày thu',        'Collection Date',       '收款日期'],
  'ly_do':          ['Lý do',           'Reason',                '原因'],
  'so_ve_mb':       ['Số vé MB',        'Airline Ticket No.',    '机票号'],
  'gia_ban':        ['Giá bán',         'Sale Price',            '销售价格'],
  'gia_ban_hd':     ['Giá bán HĐ',      'Contract Sale Price',   '合同销售价格'],
  'gia_ban_tigia':  ['Giá bán (TG)',    'Sale Price (FX)',       '销售价格（汇率）'],
  'gia_ve':         ['Giá vé',          'Ticket Price',          '票价'],
  'gia_von':        ['Giá vốn',         'Cost Price',            '成本价'],
  'gia_von_hd':     ['Giá vốn HĐ',     'Contract Cost Price',   '合同成本价'],
  'gia_von_tigia':  ['Giá vốn (TG)',    'Cost Price (FX)',       '成本价（汇率）'],
  'hanh_trinh':     ['Hành trình',      'Itinerary',             '行程'],
  'khach_hang':     ['Khách hàng',      'Customer',              '客户'],
  'khach_quen':     ['Khách quen',      'Regular Customer',      '老客户'],
  'loai_ve':        ['Loại vé',         'Ticket Type',           '机票类型'],
  'tax':            ['Tax',             'Tax',                   '税'],
  'ten_hang':       ['Tên hàng',        'Product Name',          '商品名称'],
  'ten_ncc':        ['Tên NCC',         'Supplier Name',         '供应商名称'],
  'thue_1':         ['Thuế 1',          'Tax 1',                 '税1'],
  'thue_2':         ['Thuế 2',          'Tax 2',                 '税2'],
  'thue_3':         ['Thuế 3',          'Tax 3',                 '税3'],
  'thue_4':         ['Thuế 4',          'Tax 4',                 '税4'],
  'thue_gtgt':      ['Thuế GTGT',       'VAT',                   '增值税'],
  'sotien_thu_du':  ['Tiền thu dư',     'Surplus Amount',        '多收款金额'],
  'hangve_booker':  ['Hãng/Booker',     'Airline/Booker',        '航空公司/订票人'],
  'loai_loc':       ['Loại lọc',        'Filter Type',           '筛选类型'],
  'tt':             ['Thành tiền',      'Amount',                '金额'],
  'nha_cung_cap':   ['Nhà cung cấp',   'Supplier',              '供应商'],
  'dia_chi_kh':     ['Địa chỉ KH',     'Customer Address',      '客户地址'],
  'ma_so_thue':     ['Mã số thuế',     'Tax Code',              '税务代码'],
  'dt':             ['Ngày',            'Date',                  '日期'],
  'kh_ncc':         ['KH / NCC',        'Customer/Supplier',     '客户/供应商'],
  'ten_kh_ncc':     ['Tên KH / NCC',   'Cust./Supplier Name',   '客户/供应商名称'],
  'hang_ve':        ['Hãng vé',         'Airline',               '航空公司'],
  'loai_thu_chi':   ['Loại thu chi',    'Inc/Exp Type',          '收支类型'],
  'tc':             ['Tỉ giá',          'Exchange Rate',         '汇率'],
  'thu_chi':        ['Thu chi',         'Income/Expense',        '收支'],
  'den_so':         ['Đến số',          'To No.',                '截止编号'],
  'ma_hd':          ['Mã HĐ',           'Contract Code',         '合同代码'],
  'tu_so':          ['Từ số',           'From No.',              '起始编号'],
  'ten_nhan_vien':  ['Tên nhân viên',   'Employee Name',         '员工姓名'],
  // Fields with no header at all (identified from analysis)
  'am_duong':       ['Âm/Dương',        '+/-',                   '正/负'],
};

function isCode(s) {
  return s && /^[a-z0-9_]+$/.test(s);
}

function patchFile(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let fixed = 0, missing = new Set();

  data.menus_flat.forEach(m => {
    (m.table || []).forEach(f => {
      const vi = (f.f_header_vi || '').trim();
      const hdr = (f.f_header || '').trim();
      const fname = (f.f_name || '').trim();

      // Case 1: f_header_vi is empty – check by field name
      // Case 2: f_header_vi is a raw field code
      const needsFix = !vi || isCode(vi);
      if (!needsFix) return;

      // Try to resolve by f_name first, then by f_header_vi (the code)
      const lookup = CODE_TO_HEADERS[fname] || CODE_TO_HEADERS[vi];
      if (lookup) {
        const [newVi, newEn, newZh] = lookup;
        if (!vi || isCode(vi)) f.f_header_vi = newVi;
        if (!f.f_header_en) f.f_header_en = newEn;
        if (!f.f_header_zh) f.f_header_zh = newZh;
        // Also patch f_header if it was the raw code
        if (!hdr || isCode(hdr)) f.f_header = newVi;
        fixed++;
      } else {
        missing.add(fname + ' (vi=' + JSON.stringify(vi) + ')');
      }
    });
  });

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  const base = filePath.split('/').pop();
  console.log(`✓ ${base}: ${fixed} field headers fixed`);
  if (missing.size) {
    console.log('  Still missing (no mapping):');
    [...missing].sort().forEach(x => console.log('    ' + x));
  }
}

patchFile('backend/csm_datas/public/banhang/new_system_20260424/banhang_menu_full_newsystem_20260424.json');
patchFile('backend/csm_datas/public/vemaybay/new_system_20260428/vemaybay_menu_full_newsystem_20260428.json');
