// Toàn bộ CSS styles
export const responsiveStyles = `
/* Đảm bảo toàn bộ Ant Design dùng màu hệ thống */
.kqxs, .kqxs-responsive {
  background: var(--kqxs-bg) !important;
  color: var(--kqxs-text) !important;
}
.kqxs .ant-card, .kqxs-responsive .ant-card {
  background: var(--kqxs-bg) !important;
  color: var(--kqxs-text) !important;
  border-color: var(--kqxs-border) !important;
}
.kqxs .ant-card-head, .kqxs-responsive .ant-card-head {
  background: var(--kqxs-bg) !important;
  color: var(--kqxs-text) !important;
}
.kqxs .ant-btn, .kqxs-responsive .ant-btn {
  background: var(--kqxs-bg) !important;
  color: var(--kqxs-text) !important;
  border-color: var(--kqxs-border) !important;
}
.kqxs .ant-btn-primary, .kqxs-responsive .ant-btn-primary {
  background: var(--kqxs-primary) !important;
  color: var(--kqxs-primary-text) !important;
  border-color: var(--kqxs-primary) !important;
}
.kqxs .ant-input, .kqxs-responsive .ant-input,
.kqxs .ant-picker-input input, .kqxs-responsive .ant-picker-input input {
  background: var(--kqxs-bg) !important;
  color: var(--kqxs-text) !important;
  border-color: var(--kqxs-border) !important;
}
.kqxs .ant-select-selector, .kqxs-responsive .ant-select-selector {
  background: var(--kqxs-bg) !important;
  color: var(--kqxs-text) !important;
  border-color: var(--kqxs-border) !important;
}
.kqxs .ant-select-selection-item, .kqxs-responsive .ant-select-selection-item {
  color: var(--kqxs-text) !important;
}
.kqxs .ant-tabs-nav, .kqxs-responsive .ant-tabs-nav {
  background: var(--kqxs-bg) !important;
  color: var(--kqxs-text) !important;
}
.kqxs .ant-tabs-tab, .kqxs-responsive .ant-tabs-tab {
  color: var(--kqxs-text) !important;
}
.kqxs .ant-tabs-tab-active, .kqxs-responsive .ant-tabs-tab-active {
  color: var(--kqxs-primary) !important;
}
.kqxs .ant-table, .kqxs-responsive .ant-table {
  background: var(--kqxs-bg) !important;
  color: var(--kqxs-text) !important;
}
.kqxs .ant-table-thead > tr > th, .kqxs-responsive .ant-table-thead > tr > th {
  background: var(--kqxs-hover-bg) !important;
  color: var(--kqxs-text) !important;
}
.kqxs .ant-table-tbody > tr > td, .kqxs-responsive .ant-table-tbody > tr > td {
  background: var(--kqxs-bg) !important;
  color: var(--kqxs-text) !important;
}
.kqxs .ant-picker, .kqxs-responsive .ant-picker {
  background: var(--kqxs-bg) !important;
  color: var(--kqxs-text) !important;
  border-color: var(--kqxs-border) !important;
}
.kqxs .ant-picker-input input, .kqxs-responsive .ant-picker-input input {
  color: var(--kqxs-text) !important;
}
.kqxs .ant-picker-suffix, .kqxs-responsive .ant-picker-suffix {
  color: var(--kqxs-text) !important;
}
.kqxs .ant-select-arrow, .kqxs-responsive .ant-select-arrow {
  color: var(--kqxs-text) !important;
}
.kqxs .ant-btn:hover, .kqxs-responsive .ant-btn:hover {
  background: var(--kqxs-hover-bg) !important;
  color: var(--kqxs-primary) !important;
}
.kqxs .ant-btn-primary:hover, .kqxs-responsive .ant-btn-primary:hover {
  background: var(--kqxs-primary) !important;
  color: var(--kqxs-primary-text) !important;
}
.kqxs .ant-card-bordered, .kqxs-responsive .ant-card-bordered {
  border-color: var(--kqxs-border) !important;
}
.kqxs .ant-card, .kqxs-responsive .ant-card {
  box-shadow: 0 2px 8px 0 rgba(0,0,0,0.06);
}
.kqxs, .kqxs-responsive {
	background: var(--kqxs-bg);
	color: var(--kqxs-text);
	transition: background 0.2s, color 0.2s;
}
.kqxs .ant-card, .kqxs-responsive .ant-card {
	background: var(--kqxs-bg);
	color: var(--kqxs-text);
	border-color: var(--kqxs-border);
}
.kqxs .ant-card-head, .kqxs-responsive .ant-card-head {
	background: var(--kqxs-bg);
	color: var(--kqxs-text);
}
.kqxs .ant-btn-primary, .kqxs-responsive .ant-btn-primary {
	background: var(--kqxs-primary);
	color: var(--kqxs-primary-text);
	border-color: var(--kqxs-primary);
}
.kqxs .ant-btn, .kqxs-responsive .ant-btn {
	color: var(--kqxs-text);
}
.kqxs .ant-select-selector, .kqxs-responsive .ant-select-selector {
	background: var(--kqxs-bg);
	color: var(--kqxs-text);
	border-color: var(--kqxs-border);
}
.kqxs .ant-input, .kqxs-responsive .ant-input {
	background: var(--kqxs-bg);
	color: var(--kqxs-text);
	border-color: var(--kqxs-border);
}
.kqxs .ant-table, .kqxs-responsive .ant-table {
	background: var(--kqxs-bg);
	color: var(--kqxs-text);
}
.kqxs .ant-table-thead > tr > th, .kqxs-responsive .ant-table-thead > tr > th {
	background: var(--kqxs-hover-bg);
	color: var(--kqxs-text);
}
.kqxs .ant-table-tbody > tr > td, .kqxs-responsive .ant-table-tbody > tr > td {
	background: var(--kqxs-bg);
	color: var(--kqxs-text);
}
.kqxs .giaiSo, .kqxs-responsive .giaiSo {
	background: var(--kqxs-bg);
	color: var(--kqxs-primary);
}
.kqxs .ketquaHightlight, .kqxs .ketquadaysoHightlight, .kqxs-responsive .ketquaHightlight, .kqxs-responsive .ketquadaysoHightlight {
	background: var(--kqxs-primary);
	color: var(--kqxs-primary-text);
}
/* System theme color variables for light/dark mode support */
/* Sử dụng biến native hệ điều hành cho màu nền và chữ */
/* Biến màu chỉ áp dụng cho vùng kqxs */
.kqxs, .kqxs-responsive {
  --kqxs-primary: var(--brand-primary, #1a365d);
  --kqxs-primary-text: #fff;
  --kqxs-bg: var(--bg-primary, #fff);
  --kqxs-text: var(--text-primary, #1a365d);
  --kqxs-border: var(--card-border, #eee);
  --kqxs-hover-bg: var(--bg-secondary, #f8fafc);
  --kqxs-error: #ff4d4f;
  --kqxs-success: #52c41a;
}

@media (prefers-color-scheme: dark) {
  .kqxs, .kqxs-responsive {
    --kqxs-primary: var(--brand-primary, #4a90e2);
    --kqxs-primary-text: #fff;
    --kqxs-bg: var(--bg-primary, #141414);
    --kqxs-text: var(--text-primary, #fff);
    --kqxs-border: var(--card-border, #222c37);
    --kqxs-hover-bg: var(--bg-secondary, #1a1a1a);
    --kqxs-error: #ff7875;
    --kqxs-success: #73d13d;
  }
}
/* ... (The rest of the extensive CSS content from the original file) ... */
.kqxs-responsive { padding: 24px; }
.kqxs .box_kqxs { width: 100%; margin-bottom: 16px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
/* ... (More styles like .kqxs .card, .kqxs .bkqtinhmienbac .giaidb, .kqxs .giaiSo, etc.) ... */
.kqxs .dx-datagrid td.text-left { text-align: left !important; }
.kqxs .hang-chuc-don-vi-table { /* ... styles for the table ... */ }
.kqxs .hang-chuc-don-vi-table td.chuc-column { /* ... styles ... */ }
.kqxs .ketquaHightlight, .kqxs .ketquadaysoHightlight { /* ... styles for highlights ... */ }
/* Responsive breakpoints */
@media (max-width: 768px) { /* ... mobile styles ... */ }
@media (max-width: 480px) { /* ... more mobile styles ... */ }
`; // NOTE: The full CSS content is assumed to be here, but is truncated for brevity.

/**
 * Hàm thiết lập styles bằng cách inject vào document head
 */
export const setupKQXSStyles = () => {
	if (typeof document !== "undefined" && !document.getElementById("kqxs-responsive-styles")) {
		const styleElement = document.createElement("style");
		styleElement.id = "kqxs-responsive-styles";
		styleElement.textContent = responsiveStyles;
		document.head.appendChild(styleElement);
	}
};