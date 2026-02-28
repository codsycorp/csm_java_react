const e={id:"web_services",label:"Quản lý Danh mục Dịch vụ",table_name:"web_services",g_readonly:!1,table_pagesize:20,struct:{fieldsPK:["domain","service_code","status"]},table:[{f_name:"id",f_header:"ID",f_show:0,f_stt:0,f_types:"ed",f_align:"left",width:100},{f_name:"service_code",f_header:"Mã dịch vụ",f_show:1,f_stt:1,f_types:"ed",f_align:"left",width:150},{f_name:"slug",f_header:"Slug",f_show:1,f_stt:2,f_types:"ed",f_align:"left",width:150},{f_name:"group_slug",f_header:"Group Slug",f_show:1,f_stt:3,f_types:"ed",f_align:"left",width:150},{f_name:"is_service",f_header:"Là dịch vụ",f_show:1,f_stt:4,f_types:"bool",f_align:"center",width:100},{f_name:"is_group_slug",f_header:"Là group slug",f_show:1,f_stt:5,f_types:"bool",f_align:"center",width:100},{f_name:"is_group_slug_default",f_header:"Group slug mặc định",f_show:1,f_stt:6,f_types:"bool",f_align:"center",width:120},{f_name:"category",f_header:"Danh mục (Việt)",f_show:1,f_stt:7,f_types:"ed",f_align:"left",width:200},{f_name:"category_en",f_header:"Danh mục (English)",f_show:1,f_stt:8,f_types:"ed",f_align:"left",width:200},{f_name:"category_zh",f_header:"Danh mục (中文)",f_show:1,f_stt:9,f_types:"ed",f_align:"left",width:200},{f_name:"image",f_header:"Ảnh đại diện",f_show:1,f_stt:10,f_types:"image",f_align:"center",width:120},{f_name:"attributes_icon",f_header:"Icon",f_show:1,f_stt:11,f_types:"ed",f_align:"left",width:120},{f_name:"attributes_color",f_header:"Màu sắc",f_show:1,f_stt:12,f_types:"ed",f_align:"left",width:100},{f_name:"attributes_priority",f_header:"Ưu tiên",f_show:1,f_stt:13,f_types:"number",f_align:"center",width:80},{f_name:"attributes_title",f_header:"Tiêu đề (Việt)",f_show:1,f_stt:14,f_types:"ed",f_align:"left",width:200},{f_name:"attributes_title_en",f_header:"Tiêu đề (English)",f_show:1,f_stt:15,f_types:"ed",f_align:"left",width:200},{f_name:"attributes_title_zh",f_header:"Tiêu đề (中文)",f_show:1,f_stt:16,f_types:"ed",f_align:"left",width:200},{f_name:"attributes_keywords",f_header:"Keywords (Việt)",f_show:1,f_stt:17,f_types:"textarea",f_align:"left",width:200},{f_name:"attributes_keywords_en",f_header:"Keywords (English)",f_show:1,f_stt:18,f_types:"textarea",f_align:"left",width:200},{f_name:"attributes_keywords_zh",f_header:"Keywords (中文)",f_show:1,f_stt:19,f_types:"textarea",f_align:"left",width:200},{f_name:"attributes_description",f_header:"Mô tả (Việt)",f_show:1,f_stt:20,f_types:"textarea",f_align:"left",width:300},{f_name:"attributes_description_en",f_header:"Mô tả (English)",f_show:1,f_stt:21,f_types:"textarea",f_align:"left",width:300},{f_name:"attributes_description_zh",f_header:"Mô tả (中文)",f_show:1,f_stt:22,f_types:"textarea",f_align:"left",width:300},{f_name:"status",f_header:"Trạng thái",f_show:1,f_stt:23,f_types:"cbo",f_align:"center",width:120,f_cbo_query:"return {options: [{ value: 'active', label: 'Hoạt động' },{ value: 'inactive', label: 'Không hoạt động' },{ value: 'draft', label: 'Nháp' }]}"},{f_name:"domain",f_header:"Domain",f_show:1,f_stt:24,f_types:"ed",f_align:"left",width:150}],trigger:{load_db:`
      const tableName = seft.m_configs.table_name;
      return db[tableName]?.rows || [];
    `,filter:`
      // Có thể filter theo domain hoặc status
      // return obj.status === 'active';
      return true; // Hiển thị tất cả
    `,datacolumntemplate:`
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
    `}},t={id:"web_service_detail",label:"Quản lý Chi tiết Dịch vụ",table_name:"web_service_detail",g_readonly:!1,table_pagesize:20,struct:{fieldsPK:["slug","domain","status"]},table:[{f_name:"id",f_header:"ID",f_show:0,f_stt:0,f_types:"ed",f_align:"left",width:100},{f_name:"service_type",f_header:"Loại dịch vụ",f_show:1,f_stt:1,f_types:"cbo",f_align:"left",width:150,f_cbo_query:"return { options: [{ value: 'phan-mem', label: 'Phần Mềm' }, { value: 'bat-dong-san', label: 'Bất Động Sản' }, { value: 'lam-dep-my-pham', label: 'Mỹ Phẩm & Làm Đẹp' }, { value: 'cho-thue-xe', label: 'Cho Thuê Xe' }, { value: 'booking-online', label: 'Đặt Lịch Online' }] }"},{f_name:"slug",f_header:"Slug (URL)",f_show:1,f_stt:2,f_types:"ed",f_align:"left",width:200},{f_name:"title",f_header:"Tiêu đề (Tiếng Việt)",f_show:1,f_stt:3,f_types:"ed",f_align:"left",width:250},{f_name:"title_en",f_header:"Tiêu đề (English)",f_show:1,f_stt:4,f_types:"ed",f_align:"left",width:250},{f_name:"title_zh",f_header:"Tiêu đề (中文)",f_show:1,f_stt:5,f_types:"ed",f_align:"left",width:250},{f_name:"keywords",f_header:"Từ khóa (Việt)",f_show:1,f_stt:6,f_types:"textarea",f_align:"left",width:200},{f_name:"keywords_en",f_header:"Từ khóa (English)",f_show:1,f_stt:7,f_types:"textarea",f_align:"left",width:200},{f_name:"keywords_zh",f_header:"Từ khóa (中文)",f_show:1,f_stt:8,f_types:"textarea",f_align:"left",width:200},{f_name:"excerpt",f_header:"Tóm tắt (Tiếng Việt)",f_show:1,f_stt:9,f_types:"textarea",f_align:"left",width:300},{f_name:"excerpt_en",f_header:"Tóm tắt (English)",f_show:1,f_stt:10,f_types:"textarea",f_align:"left",width:300},{f_name:"excerpt_zh",f_header:"Tóm tắt (中文)",f_show:1,f_stt:11,f_types:"textarea",f_align:"left",width:300},{f_name:"content",f_header:"Nội dung (Tiếng Việt)",f_show:1,f_stt:12,f_types:"richtext",f_align:"left",width:400},{f_name:"content_en",f_header:"Nội dung (English)",f_show:1,f_stt:13,f_types:"richtext",f_align:"left",width:400},{f_name:"content_zh",f_header:"Nội dung (中文)",f_show:1,f_stt:14,f_types:"richtext",f_align:"left",width:400},{f_name:"image",f_header:"Ảnh chính",f_show:1,f_stt:15,f_types:"image",f_align:"center",width:120},{f_name:"author",f_header:"Tác giả",f_show:1,f_stt:16,f_types:"ed",f_align:"left",width:150},{f_name:"avatar",f_header:"Avatar",f_show:1,f_stt:17,f_types:"image",f_align:"center",width:120},{f_name:"publishDate",f_header:"Ngày xuất bản",f_show:1,f_stt:18,f_types:"datetime",f_align:"center",width:160},{f_name:"readTime",f_header:"Thời gian đọc (phút)",f_show:1,f_stt:19,f_types:"number",f_align:"center",width:80},{f_name:"views",f_header:"Lượt xem",f_show:1,f_stt:20,f_types:"number",f_align:"center",width:80},{f_name:"tags",f_header:"Tags (JSON)",f_show:1,f_stt:21,f_types:"textarea",f_align:"left",width:150,f_format:"json"},{f_name:"thumbnail",f_header:"Ảnh đại diện",f_show:1,f_stt:22,f_types:"image",f_align:"center",width:120},{f_name:"images",f_header:"Album ảnh",f_show:1,f_stt:23,f_types:"album",f_align:"left",width:200,f_format:"json"},{f_name:"featured",f_header:"Nổi bật",f_show:1,f_stt:24,f_types:"bool",f_align:"center",width:100},{f_name:"activeHome",f_header:"Hiển thị trang chủ",f_show:1,f_stt:25,f_types:"bool",f_align:"center",width:120},{f_name:"priority",f_header:"Độ ưu tiên",f_show:1,f_stt:26,f_types:"number",f_align:"center",width:80},{f_name:"created_at",f_header:"Ngày tạo",f_show:1,f_stt:27,f_types:"datetime",f_align:"center",width:160},{f_name:"updated_at",f_header:"Ngày cập nhật",f_show:1,f_stt:28,f_types:"datetime",f_align:"center",width:160},{f_name:"domain",f_header:"Domain",f_show:0,f_stt:29,f_types:"ed",f_align:"left",width:150},{f_name:"status",f_header:"Trạng thái",f_show:1,f_stt:30,f_types:"cbo",f_align:"center",width:120,f_cbo_query:"return {options: [{ value: 'active', label: 'Hoạt động' },{ value: 'inactive', label: 'Không hoạt động' },{ value: 'draft', label: 'Nháp' }]}"}],trigger:{load_db:`
      const tableName = seft.m_configs.table_name;
      const allRows = db[tableName]?.rows || [];
      
      // Filter by service_type from master selection
      if (seft.context?.select_row) {
        const masterServiceCode = seft.context.select_row.service_code;
        console.log('🔍 Filtering detail by service_type:', masterServiceCode);
        const filtered = allRows.filter(row => row.service_type === masterServiceCode);
        console.log('📊 Detail records found:', filtered.length, 'from total:', allRows.length);
        return filtered;
      }
      
      // No master selected, return all
      console.log('⚠️ No master row selected, showing all detail records:', allRows.length);
      return allRows;
    `,filter:"return true;",datacolumntemplate:`
      columns.forEach(col => {
        if (['thumbnail', 'avatar', 'image'].includes(col.dataIndex)) {
          col.render = (text) => {
            if (!text) return React.createElement('span', { style: { color: '#ccc' } }, 'Chưa có');
            const url = typeof text === 'string' ? text : (text?.url || text);
            return React.createElement('img', { src: url, alt: col.dataIndex, style: { maxWidth: '60px', maxHeight: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd' } });
          };
        }
        if (col.dataIndex === 'featured') {
          col.render = (val) => {
            const isTrue = val === 1 || val === true;
            return React.createElement('span', { style: { color: isTrue ? '#52c41a' : '#ccc', fontSize: '18px' } }, isTrue ? '✓' : '✗');
          };
        }
      });
      return columns;
    `}};export{e as a,t as w};
