# AI SEO Content Generation API

API để tạo nội dung SEO tự động sử dụng AI.

## Sử dụng

### Cách 1: Async/Await (Khuyến khích)

```typescript
import { generateSeoContent } from "#src/api/ai";

// Trong component hoặc function
const handleGenerateContent = async () => {
  const result = await generateSeoContent({
    articleType: "Bất động sản",
    topic: "Căn hộ cao cấp Vinhomes Central Park",
    additionalInfo: "Căn 2PN, 80m2, view sông Sài Gòn, giá 5 tỷ",
    primaryKeyword: "căn hộ Vinhomes Central Park",
    secondaryKeywords: ["căn hộ cao cấp", "Vinhomes", "view sông", "Bình Thạnh"]
  });

  if (result.success) {
    console.log("Title:", result.data.title);
    console.log("Description:", result.data.description);
    console.log("HTML Content:", result.data.html_content);
    
    // Sử dụng kết quả
    setTitle(result.data.title);
    setDescription(result.data.description);
    setHtmlContent(result.data.html_content);
  } else {
    console.error("Error:", result.error);
  }
};
```

### Cách 2: Callback Pattern (Để tương thích code cũ)

```typescript
import { csm_ai_generate_seo_content } from "#src/api/ai";

csm_ai_generate_seo_content(
  "Việc làm",
  "Tuyển dụng Frontend Developer",
  "Mức lương: 20-30 triệu, Địa điểm: Hà Nội, Kinh nghiệm: 2-3 năm",
  "tuyển dụng frontend developer",
  ["tuyển frontend", "lập trình viên ReactJS", "việc làm IT", "Hà Nội"],
  (result) => {
    if (result.success) {
      console.log(result.data);
    } else {
      console.error(result.error);
    }
  }
);
```

## Ví dụ sử dụng trong React Component

```tsx
import { useState } from "react";
import { generateSeoContent, type SeoContentResult } from "#src/api/ai";
import { Button, Form, Input, message } from "antd";

export function SeoContentGenerator() {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<SeoContentResult | null>(null);
  const [form] = Form.useForm();

  const handleGenerate = async (values: any) => {
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
        setContent(result.data);
        message.success("Tạo nội dung thành công!");
      } else {
        message.error(result.error || "Có lỗi xảy ra");
      }
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Form form={form} onFinish={handleGenerate} layout="vertical">
        <Form.Item label="Loại bài viết" name="articleType" required>
          <Input placeholder="Ví dụ: Bất động sản" />
        </Form.Item>
        
        <Form.Item label="Chủ đề" name="topic" required>
          <Input placeholder="Ví dụ: Căn hộ cao cấp Vinhomes" />
        </Form.Item>
        
        <Form.Item label="Thông tin bổ sung" name="additionalInfo">
          <Input.TextArea placeholder="Ví dụ: 2PN, 80m2, view sông..." />
        </Form.Item>
        
        <Form.Item label="Từ khóa chính" name="primaryKeyword" required>
          <Input placeholder="Ví dụ: căn hộ Vinhomes Central Park" />
        </Form.Item>
        
        <Form.Item label="Từ khóa phụ (phân cách bằng dấu phẩy)" name="secondaryKeywords">
          <Input placeholder="Ví dụ: căn hộ cao cấp, view sông, Bình Thạnh" />
        </Form.Item>
        
        <Button type="primary" htmlType="submit" loading={loading}>
          Tạo nội dung SEO
        </Button>
      </Form>

      {content && (
        <div style={{ marginTop: 24 }}>
          <h3>Kết quả:</h3>
          <p><strong>Tiêu đề:</strong> {content.title}</p>
          <p><strong>Mô tả:</strong> {content.description}</p>
          <div dangerouslySetInnerHTML={{ __html: content.html_content }} />
        </div>
      )}
    </div>
  );
}
```

## Types

### SeoContentParams
```typescript
interface SeoContentParams {
  articleType: string;        // Loại bài viết
  topic: string;              // Chủ đề
  additionalInfo: string;     // Thông tin bổ sung
  primaryKeyword: string;     // Từ khóa chính
  secondaryKeywords: string[]; // Từ khóa phụ
}
```

### SeoContentResult
```typescript
interface SeoContentResult {
  title: string;           // Tiêu đề (50-65 ký tự)
  description: string;     // Mô tả (155 ký tự)
  html_content: string;    // Nội dung HTML
}
```

## Lưu ý

- API sử dụng AI để tạo nội dung, thời gian phản hồi có thể dao động từ 5-30 giây
- Nội dung HTML được tạo ra sử dụng Bootstrap v4.5.3
- Độ dài `html_content` không vượt quá 4096 chữ
- `description` không chứa ký tự đặc biệt (!?#*emoji), chỉ dùng dấu chấm và phẩy
