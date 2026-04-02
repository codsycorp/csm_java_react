import type { MConfig } from "../components/csm-grid/CsmDynamicGrid";

/**
 * Cấu hình động cho bảng web_services (Danh mục dịch vụ)
 * Dựa trên cấu trúc WEB_SERVICES_STRUCT trong seed_services_v2.mjs
 * Hỗ trợ đa ngôn ngữ: Việt (vi), Trung (zh), Anh (en)
 */
export const webServicesConfig: MConfig = {
  id: "web_services",
  label: "Quản lý Danh mục Dịch vụ",
  table_name: "web_services",
  g_readonly: false,
  table_pagesize: 20,
  
  // Primary key definition from backend - composite key
  struct: {
    fieldsPK: ["domain", "service_code", "status"]
  },
  
  table: [
    { f_name: "id", f_header: "ID", f_show: 0, f_stt: 0, f_types: "ed", f_align: "left", width: 100 },
    { f_name: "service_code", f_header: "Mã dịch vụ", f_show: 1, f_stt: 1, f_types: "ed", f_align: "left", width: 150 },
    { f_name: "slug", f_header: "Slug", f_show: 1, f_stt: 2, f_types: "ed", f_align: "left", width: 150 },
    { f_name: "group_slug", f_header: "Group Slug", f_show: 1, f_stt: 3, f_types: "ed", f_align: "left", width: 150 },
    { f_name: "is_service", f_header: "Là dịch vụ", f_show: 1, f_stt: 4, f_types: "bool", f_align: "center", width: 100 },
    { f_name: "is_group_slug", f_header: "Là group slug", f_show: 1, f_stt: 5, f_types: "bool", f_align: "center", width: 100 },
    { f_name: "is_group_slug_default", f_header: "Group slug mặc định", f_show: 1, f_stt: 6, f_types: "bool", f_align: "center", width: 120 },
    { f_name: "category", f_header: "Danh mục (Việt)", f_show: 1, f_stt: 7, f_types: "ed", f_align: "left", width: 200 },
    { f_name: "category_en", f_header: "Danh mục (English)", f_show: 1, f_stt: 8, f_types: "ed", f_align: "left", width: 200 },
    { f_name: "category_zh", f_header: "Danh mục (中文)", f_show: 1, f_stt: 9, f_types: "ed", f_align: "left", width: 200 },
    { f_name: "image", f_header: "Ảnh đại diện", f_show: 1, f_stt: 10, f_types: "image", f_align: "center", width: 120 },
    { f_name: "attributes_icon", f_header: "Icon", f_show: 1, f_stt: 11, f_types: "ed", f_align: "left", width: 120 },
    { f_name: "attributes_color", f_header: "Màu sắc", f_show: 1, f_stt: 12, f_types: "ed", f_align: "left", width: 100 },
    { f_name: "attributes_priority", f_header: "Ưu tiên", f_show: 1, f_stt: 13, f_types: "number", f_align: "center", width: 80 },
    { f_name: "attributes_title", f_header: "Tiêu đề (Việt)", f_show: 1, f_stt: 14, f_types: "ed", f_align: "left", width: 200 },
    { f_name: "attributes_title_en", f_header: "Tiêu đề (English)", f_show: 1, f_stt: 15, f_types: "ed", f_align: "left", width: 200 },
    { f_name: "attributes_title_zh", f_header: "Tiêu đề (中文)", f_show: 1, f_stt: 16, f_types: "ed", f_align: "left", width: 200 },
    { f_name: "attributes_keywords", f_header: "Keywords (Việt)", f_show: 1, f_stt: 17, f_types: "textarea", f_align: "left", width: 200 },
    { f_name: "attributes_keywords_en", f_header: "Keywords (English)", f_show: 1, f_stt: 18, f_types: "textarea", f_align: "left", width: 200 },
    { f_name: "attributes_keywords_zh", f_header: "Keywords (中文)", f_show: 1, f_stt: 19, f_types: "textarea", f_align: "left", width: 200 },
    { f_name: "attributes_description", f_header: "Mô tả (Việt)", f_show: 1, f_stt: 20, f_types: "textarea", f_align: "left", width: 300 },
    { f_name: "attributes_description_en", f_header: "Mô tả (English)", f_show: 1, f_stt: 21, f_types: "textarea", f_align: "left", width: 300 },
    { f_name: "attributes_description_zh", f_header: "Mô tả (中文)", f_show: 1, f_stt: 22, f_types: "textarea", f_align: "left", width: 300 },
    { f_name: "status", f_header: "Trạng thái", f_show: 1, f_stt: 23, f_types: "cbo", f_align: "center", width: 120, f_cbo_query: `return {options: [{ value: 'active', label: 'Hoạt động' },{ value: 'inactive', label: 'Không hoạt động' },{ value: 'draft', label: 'Nháp' }]}` },
    { f_name: "domain", f_header: "Domain", f_show: 1, f_stt: 24, f_types: "ed", f_align: "left", width: 150 },
  ],
  
  trigger: {
    // Load dữ liệu từ database
    load_db: `
      const tableName = seft.m_configs.table_name;
      return db[tableName]?.rows || [];
    `,
    
    // Filter theo domain hiện tại (nếu cần)
    filter: `
      // Có thể filter theo domain hoặc status
      // return obj.status === 'active';
      return true; // Hiển thị tất cả
    `,
    
    // Tùy chỉnh columns nếu cần
    datacolumntemplate: `
      columns.forEach(col => {
        // Icon column
        if (col.dataIndex === 'attributes_icon') {
          col.render = (text) => text ? React.createElement('span', { className: \`anticon anticon-\${text}\`, style: { fontSize: '20px', color: '#1890ff' } }) : null;
        }
        if (col.dataIndex === 'attributes_color') {
          col.render = (text) => React.createElement('span', { style: { color: text || '#1890ff', fontWeight: 'bold' } }, text || '');
        }
        if (col.dataIndex === 'attributes_priority') {
          col.render = (text) => React.createElement('span', { style: { color: '#faad14', fontWeight: 'bold' } }, text || '');
        }
        // Các trường title/description đa ngôn ngữ
        if (col.dataIndex === 'attributes_title') {
          col.render = (text, record) => {
            const titles = [
              text && \`🇻🇳 \${text}\`,
              record.attributes_title_en && \`🇬🇧 \${record.attributes_title_en}\`,
              record.attributes_title_zh && \`🇨🇳 \${record.attributes_title_zh}\`
            ].filter(Boolean).join(' | ');
            return React.createElement('span', null, titles);
          };
        }
        if (col.dataIndex === 'attributes_description') {
          col.render = (text, record) => {
            const descs = [
              text && \`🇻🇳 \${text}\`,
              record.attributes_description_en && \`🇬🇧 \${record.attributes_description_en}\`,
              record.attributes_description_zh && \`🇨🇳 \${record.attributes_description_zh}\`
            ].filter(Boolean).join(' | ');
            return React.createElement('span', null, descs);
          };
        }
        
        // Đã xoá logic render seo_meta
        
        // Hiển thị tên đa ngôn ngữ
        if (col.dataIndex === 'name') {
          col.render = (text, record) => {
            const names = [
              text,
              record.name_zh && \`(中: \${record.name_zh})\`,
              record.name_en && \`(EN: \${record.name_en})\`
            ].filter(Boolean).join(' ');
            return React.createElement('div', {
              style: { fontSize: '13px' }
            }, names);
          };
        }
      });
      return columns;
    `,
  },
};

export default webServicesConfig;
