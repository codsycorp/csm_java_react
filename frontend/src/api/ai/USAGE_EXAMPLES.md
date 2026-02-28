# Hướng dẫn sử dụng AI SEO trong Auto Code và Dynamic Grid

## 1. Sử dụng trong Auto Code (auto_setup)

### Cách 1: Sử dụng từ seft object (Khuyến nghị)

```javascript
// Trong auto_code của sys_autos
// Callback pattern
seft.csm_ai_generate_seo_content(
  "Bất động sản",
  "Căn hộ cao cấp Vinhomes Central Park",
  "Căn 2PN, 80m2, view sông Sài Gòn, giá 5 tỷ",
  "căn hộ Vinhomes Central Park",
  ["căn hộ cao cấp", "Vinhomes", "view sông", "Bình Thạnh"],
  function(result) {
    if (result.success) {
      console.log("Title:", result.data.title);
      console.log("Description:", result.data.description);
      console.log("HTML Content:", result.data.html_content);
      
      // Sử dụng kết quả
      document.getElementById("title").value = result.data.title;
      document.getElementById("description").value = result.data.description;
      document.getElementById("content").innerHTML = result.data.html_content;
    } else {
      canhbao(result.error || "Có lỗi xảy ra");
    }
  }
);

// Hoặc async/await
(async function() {
  const result = await seft.generateSeoContent({
    articleType: "Việc làm",
    topic: "Tuyển dụng Frontend Developer",
    additionalInfo: "Mức lương: 20-30 triệu, Địa điểm: Hà Nội",
    primaryKeyword: "tuyển dụng frontend developer",
    secondaryKeywords: ["tuyển frontend", "ReactJS", "việc làm IT"]
  });
  
  if (result.success) {
    // Xử lý kết quả
    thongbao("Tạo nội dung thành công!");
  }
})();
```

### Cách 2: Sử dụng từ window.csmAI (Legacy)

```javascript
// Trong auto_code
window.csmAI.csm_ai_generate_seo_content(
  "Bất động sản",
  "Căn hộ chung cư",
  "2PN, 80m2, giá tốt",
  "căn hộ chung cư",
  ["bất động sản", "chung cư"],
  function(result) {
    if (result.success) {
      console.log(result.data);
    }
  }
);
```

## 2. Sử dụng trong Dynamic Grid Form

### Thông qua trigger beforeSave

Trong cấu hình `m_configs.trigger.beforeSave`:

```javascript
// Tự động tạo SEO content khi lưu bài viết
function beforeSave(row, seft) {
  return new Promise((resolve, reject) => {
    // Kiểm tra nếu chưa có title hoặc description
    if (!row.title || !row.description) {
      seft.csm_ai_generate_seo_content(
        row.article_type || "Bất động sản",
        row.topic || row.name,
        row.additional_info || "",
        row.primary_keyword || row.name,
        row.secondary_keywords ? row.secondary_keywords.split(',') : [],
        function(result) {
          if (result.success) {
            // Gán kết quả vào row
            row.title = result.data.title;
            row.description = result.data.description;
            row.html_content = result.data.html_content;
            resolve(row);
          } else {
            reject(new Error(result.error));
          }
        }
      );
    } else {
      resolve(row);
    }
  });
}
```

### Thông qua custom button trong grid

Tạo button tùy chỉnh để generate SEO:

```javascript
// Trong auto_code hoặc custom script
const { Button } = window.antd;
const { React } = window;

function SeoGenerateButton({ record, onUpdate }) {
  const [loading, setLoading] = React.useState(false);
  
  const handleGenerate = () => {
    setLoading(true);
    
    window.csmAI.csm_ai_generate_seo_content(
      record.article_type,
      record.topic,
      record.additional_info,
      record.primary_keyword,
      record.secondary_keywords?.split(',') || [],
      function(result) {
        setLoading(false);
        if (result.success) {
          // Cập nhật record
          onUpdate({
            ...record,
            title: result.data.title,
            description: result.data.description,
            html_content: result.data.html_content
          });
          window.thongbao("Tạo SEO content thành công!");
        } else {
          window.canhbao(result.error);
        }
      }
    );
  };
  
  return React.createElement(
    Button,
    { 
      type: "primary", 
      loading: loading, 
      onClick: handleGenerate 
    },
    "Tạo SEO"
  );
}
```

## 3. Ví dụ tích hợp hoàn chỉnh trong Auto Code

```javascript
// File: sys_autos.p_code (p_type = 0)

const { React, ReactDOM, antd, I18nextProvider } = window;
const { Button, Input, Form, Card, Space, message } = antd;

function SeoContentGenerator() {
  const [loading, setLoading] = React.useState(false);
  const [content, setContent] = React.useState(null);
  const [form] = Form.useForm();
  
  const handleGenerate = (values) => {
    setLoading(true);
    
    seft.csm_ai_generate_seo_content(
      values.articleType,
      values.topic,
      values.additionalInfo || "",
      values.primaryKeyword,
      values.secondaryKeywords?.split(',').map(k => k.trim()) || [],
      function(result) {
        setLoading(false);
        if (result.success) {
          setContent(result.data);
          message.success("Tạo nội dung thành công!");
        } else {
          message.error(result.error || "Có lỗi xảy ra");
        }
      }
    );
  };
  
  return React.createElement(
    Card,
    { title: "Tạo SEO Content với AI" },
    React.createElement(
      Form,
      { form: form, onFinish: handleGenerate, layout: "vertical" },
      React.createElement(
        Form.Item,
        { label: "Loại bài viết", name: "articleType", rules: [{ required: true }] },
        React.createElement(Input, { placeholder: "Ví dụ: Bất động sản" })
      ),
      React.createElement(
        Form.Item,
        { label: "Chủ đề", name: "topic", rules: [{ required: true }] },
        React.createElement(Input, { placeholder: "Ví dụ: Căn hộ cao cấp" })
      ),
      React.createElement(
        Form.Item,
        { label: "Thông tin bổ sung", name: "additionalInfo" },
        React.createElement(Input.TextArea, { placeholder: "Ví dụ: 2PN, 80m2..." })
      ),
      React.createElement(
        Form.Item,
        { label: "Từ khóa chính", name: "primaryKeyword", rules: [{ required: true }] },
        React.createElement(Input, { placeholder: "Ví dụ: căn hộ vinhomes" })
      ),
      React.createElement(
        Form.Item,
        { label: "Từ khóa phụ", name: "secondaryKeywords" },
        React.createElement(Input, { placeholder: "Ví dụ: bất động sản, chung cư" })
      ),
      React.createElement(
        Button,
        { type: "primary", htmlType: "submit", loading: loading },
        "Tạo nội dung SEO"
      )
    ),
    content && React.createElement(
      "div",
      { style: { marginTop: 24 } },
      React.createElement("h3", {}, "Kết quả:"),
      React.createElement("p", {}, React.createElement("strong", {}, "Tiêu đề: "), content.title),
      React.createElement("p", {}, React.createElement("strong", {}, "Mô tả: "), content.description),
      React.createElement("div", { dangerouslySetInnerHTML: { __html: content.html_content } })
    )
  );
}

// Render vào container
const root = ReactDOM.createRoot(document.getElementById("context-auto"));
root.render(
  React.createElement(
    antd.ConfigProvider,
    { 
      locale: antd.antdLocale,
      theme: antd.antdThemeConfig
    },
    React.createElement(SeoContentGenerator)
  )
);
```

## 4. Sử dụng trong Component TypeScript/TSX

```tsx
import { generateSeoContent } from "#src/api/ai";
import { Button, Form, Input, message } from "antd";

export function MyComponent() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  
  const handleGenerateSeo = async (values: any) => {
    setLoading(true);
    try {
      const result = await generateSeoContent({
        articleType: values.articleType,
        topic: values.topic,
        additionalInfo: values.additionalInfo,
        primaryKeyword: values.primaryKeyword,
        secondaryKeywords: values.secondaryKeywords.split(',').map((k: string) => k.trim())
      });
      
      if (result.success) {
        form.setFieldsValue({
          title: result.data.title,
          description: result.data.description,
          content: result.data.html_content
        });
        message.success("Tạo SEO content thành công!");
      } else {
        message.error(result.error);
      }
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return <Form form={form} onFinish={handleGenerateSeo}>
    {/* Form fields */}
    <Button type="primary" htmlType="submit" loading={loading}>
      Tạo SEO
    </Button>
  </Form>;
}
```

## 5. Lưu ý quan trọng

1. **Thời gian xử lý**: API AI có thể mất 5-30 giây, nên luôn hiển thị loading state
2. **Error handling**: Luôn kiểm tra `result.success` trước khi sử dụng `result.data`
3. **Độ dài nội dung**: `html_content` tối đa 4096 ký tự, `description` tối đa 155 ký tự
4. **Format HTML**: Nội dung HTML sử dụng Bootstrap v4.5.3
5. **Callback vs Async/Await**: Trong auto_code legacy dùng callback, trong TypeScript component dùng async/await

## 6. API Reference

### generateSeoContent (Async/Await)

```typescript
function generateSeoContent(params: {
  articleType: string;
  topic: string;
  additionalInfo: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
}): Promise<{
  success: boolean;
  data?: {
    title: string;
    description: string;
    html_content: string;
  };
  error?: string;
}>
```

### csm_ai_generate_seo_content (Callback)

```typescript
function csm_ai_generate_seo_content(
  articleType: string,
  topic: string,
  additionalInfo: string,
  primaryKeyword: string,
  secondaryKeywords: string[],
  callback: (result: {
    success: boolean;
    data?: {
      title: string;
      description: string;
      html_content: string;
    };
    error?: string;
  }) => void
): void
```

## 7. Troubleshooting

### Lỗi: "csmAI is not defined"
- Đảm bảo code chạy sau khi AutoSetup component đã mount
- Kiểm tra `window.csmAI` có tồn tại không

### Lỗi: "generateSeoContent is not a function"
- Trong auto_code, sử dụng `seft.generateSeoContent` hoặc `window.csmAI.generateSeoContent`
- Trong TypeScript component, import từ `#src/api/ai`

### API trả về lỗi
- Kiểm tra network tab để xem response từ backend
- Kiểm tra token authentication có hợp lệ không
- Kiểm tra backend endpoint `/ai-generate-seo-content` có hoạt động không
