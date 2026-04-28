import React, { useState, useEffect } from "react";
import { Form, Input, Tabs, Space, Card, Badge } from "antd";
import type { TabsProps } from "antd";
import { HtmlEditor } from "./HtmlEditor";

const { TextArea } = Input;

/**
 * Component tổ chức các trường đa ngôn ngữ thành tabs
 * Mỗi tab chứa tất cả fields của một ngôn ngữ
 */
export function MultilingualTabsLayout({ 
  form,
  fields 
}: { 
  form: any;
  fields: {
    title?: boolean;
    excerpt?: boolean;
    content?: boolean;
    metaTitle?: boolean;
    metaDescription?: boolean;
    keywords?: boolean;
  };
}) {
  const [activeKey, setActiveKey] = useState('vi');
  
  // Theo dõi fields nào đã được điền
  const [filledFields, setFilledFields] = useState({
    vi: { count: 0, total: 0 },
    en: { count: 0, total: 0 },
    zh: { count: 0, total: 0 }
  });

  useEffect(() => {
    const checkFilledFields = () => {
      const values = form.getFieldsValue();
      const langs = ['vi', 'en', 'zh'];
      const newFilled: any = {};
      
      langs.forEach(lang => {
        let count = 0;
        let total = 0;
        
        if (fields.title) {
          total++;
          if (values[`title_${lang}`]) count++;
        }
        if (fields.excerpt) {
          total++;
          if (values[`excerpt_${lang}`]) count++;
        }
        if (fields.content) {
          total++;
          if (values[`content_${lang}`]) count++;
        }
        if (fields.metaTitle) {
          total++;
          if (values[`meta_title_${lang}`]) count++;
        }
        if (fields.metaDescription) {
          total++;
          if (values[`meta_description_${lang}`]) count++;
        }
        if (fields.keywords) {
          total++;
          if (values[`keywords_${lang}`]) count++;
        }
        
        newFilled[lang] = { count, total };
      });
      
      setFilledFields(newFilled);
    };

    // Check initially and on form change
    checkFilledFields();
    const interval = setInterval(checkFilledFields, 1000);
    return () => clearInterval(interval);
  }, [form, fields]);

  const renderVietnameseTab = () => (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {fields.title && (
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 15 }}>
            Tiêu đề <span style={{ color: 'red' }}>*</span>
          </label>
          <Form.Item name="title_vi" noStyle rules={[{ required: true, message: 'Vui lòng nhập tiêu đề tiếng Việt' }]}>
            <Input 
              size="large"
              placeholder="Nhập tiêu đề tiếng Việt" 
            />
          </Form.Item>
        </div>
      )}

      {fields.excerpt && (
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 15 }}>Tóm tắt</label>
          <Form.Item name="excerpt_vi" noStyle>
            <TextArea
              rows={4}
              placeholder="Nhập tóm tắt ngắn gọn bằng tiếng Việt"
              showCount
              maxLength={500}
            />
          </Form.Item>
        </div>
      )}

      {fields.content && (
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 15 }}>Nội dung HTML</label>
          <Form.Item name="content_vi" noStyle>
            <div style={{ border: '1px solid var(--ant-colorBorder)', borderRadius: 4, padding: 8, background: 'var(--ant-colorFillAlter)' }}>
              <HtmlEditor
                rows={20}
                placeholder="Nhập nội dung chi tiết bằng tiếng Việt..."
              />
            </div>
          </Form.Item>
        </div>
      )}

      {(fields.metaTitle || fields.metaDescription || fields.keywords) && (
        <Card size="small" title="SEO Metadata" style={{ marginTop: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {fields.metaTitle && (
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Meta Title</label>
                <Form.Item name="meta_title_vi" noStyle>
                  <Input
                    placeholder="Meta title cho SEO (50-60 ký tự)"
                    maxLength={60}
                    showCount
                  />
                </Form.Item>
              </div>
            )}

            {fields.metaDescription && (
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Meta Description</label>
                <Form.Item name="meta_description_vi" noStyle>
                  <TextArea
                    rows={3}
                    placeholder="Meta description cho SEO (150-160 ký tự)"
                    maxLength={160}
                    showCount
                  />
                </Form.Item>
              </div>
            )}

            {fields.keywords && (
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Keywords</label>
                <Form.Item name="keywords_vi" noStyle>
                  <Input placeholder="keyword1, keyword2, keyword3" />
                </Form.Item>
              </div>
            )}
          </Space>
        </Card>
      )}
    </Space>
  );

  const renderEnglishTab = () => (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {fields.title && (
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 15 }}>
            Title
          </label>
          <Form.Item name="title_en" noStyle>
            <Input 
              size="large"
              placeholder="Enter English title" 
            />
          </Form.Item>
        </div>
      )}

      {fields.excerpt && (
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 15 }}>Excerpt</label>
          <Form.Item name="excerpt_en" noStyle>
            <TextArea
              rows={4}
              placeholder="Enter short excerpt in English"
              showCount
              maxLength={500}
            />
          </Form.Item>
        </div>
      )}

      {fields.content && (
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 15 }}>HTML Content</label>
          <Form.Item name="content_en" noStyle>
            <div style={{ border: '1px solid var(--ant-colorBorder)', borderRadius: 4, padding: 8, background: 'var(--ant-colorFillAlter)' }}>
              <HtmlEditor
                rows={20}
                placeholder="Enter detailed content in English..."
              />
            </div>
          </Form.Item>
        </div>
      )}

      {(fields.metaTitle || fields.metaDescription || fields.keywords) && (
        <Card size="small" title="SEO Metadata" style={{ marginTop: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {fields.metaTitle && (
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Meta Title</label>
                <Form.Item name="meta_title_en" noStyle>
                  <Input
                    placeholder="Meta title for SEO (50-60 characters)"
                    maxLength={60}
                    showCount
                  />
                </Form.Item>
              </div>
            )}

            {fields.metaDescription && (
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Meta Description</label>
                <Form.Item name="meta_description_en" noStyle>
                  <TextArea
                    rows={3}
                    placeholder="Meta description for SEO (150-160 characters)"
                    maxLength={160}
                    showCount
                  />
                </Form.Item>
              </div>
            )}

            {fields.keywords && (
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Keywords</label>
                <Form.Item name="keywords_en" noStyle>
                  <Input placeholder="keyword1, keyword2, keyword3" />
                </Form.Item>
              </div>
            )}
          </Space>
        </Card>
      )}
    </Space>
  );

  const renderChineseTab = () => (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {fields.title && (
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 15 }}>
            标题
          </label>
          <Form.Item name="title_zh" noStyle>
            <Input 
              size="large"
              placeholder="输入中文标题" 
            />
          </Form.Item>
        </div>
      )}

      {fields.excerpt && (
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 15 }}>摘要</label>
          <Form.Item name="excerpt_zh" noStyle>
            <TextArea
              rows={4}
              placeholder="输入中文摘要"
              showCount
              maxLength={500}
            />
          </Form.Item>
        </div>
      )}

      {fields.content && (
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 15 }}>HTML内容</label>
          <Form.Item name="content_zh" noStyle>
            <div style={{ border: '1px solid var(--ant-colorBorder)', borderRadius: 4, padding: 8, background: 'var(--ant-colorFillAlter)' }}>
              <HtmlEditor
                rows={20}
                placeholder="输入中文详细内容..."
              />
            </div>
          </Form.Item>
        </div>
      )}

      {(fields.metaTitle || fields.metaDescription || fields.keywords) && (
        <Card size="small" title="SEO Metadata" style={{ marginTop: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {fields.metaTitle && (
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Meta Title</label>
                <Form.Item name="meta_title_zh" noStyle>
                  <Input
                    placeholder="SEO元标题 (50-60字符)"
                    maxLength={60}
                    showCount
                  />
                </Form.Item>
              </div>
            )}

            {fields.metaDescription && (
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Meta Description</label>
                <Form.Item name="meta_description_zh" noStyle>
                  <TextArea
                    rows={3}
                    placeholder="SEO元描述 (150-160字符)"
                    maxLength={160}
                    showCount
                  />
                </Form.Item>
              </div>
            )}

            {fields.keywords && (
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Keywords</label>
                <Form.Item name="keywords_zh" noStyle>
                  <Input placeholder="关键词1, 关键词2, 关键词3" />
                </Form.Item>
              </div>
            )}
          </Space>
        </Card>
      )}
    </Space>
  );

  const tabItems: TabsProps['items'] = [
    {
      key: 'vi',
      label: (
        <span>
          🇻🇳 Tiếng Việt
          {filledFields.vi.total > 0 && (
            <Badge 
              count={`${filledFields.vi.count}/${filledFields.vi.total}`} 
              style={{ marginLeft: 8, backgroundColor: filledFields.vi.count === filledFields.vi.total ? '#52c41a' : '#faad14' }}
            />
          )}
        </span>
      ),
      children: renderVietnameseTab(),
    },
    {
      key: 'en',
      label: (
        <span>
          🇬🇧 English
          {filledFields.en.total > 0 && (
            <Badge 
              count={`${filledFields.en.count}/${filledFields.en.total}`} 
              style={{ marginLeft: 8, backgroundColor: filledFields.en.count === filledFields.en.total ? '#52c41a' : '#faad14' }}
            />
          )}
        </span>
      ),
      children: renderEnglishTab(),
    },
    {
      key: 'zh',
      label: (
        <span>
          🇨🇳 中文
          {filledFields.zh.total > 0 && (
            <Badge 
              count={`${filledFields.zh.count}/${filledFields.zh.total}`} 
              style={{ marginLeft: 8, backgroundColor: filledFields.zh.count === filledFields.zh.total ? '#52c41a' : '#faad14' }}
            />
          )}
        </span>
      ),
      children: renderChineseTab(),
    },
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      <Tabs 
        activeKey={activeKey}
        onChange={setActiveKey}
        items={tabItems}
        size="large"
        style={{ background: 'var(--ant-colorBgContainer)', padding: '16px', borderRadius: 8, border: '1px solid var(--ant-colorBorderSecondary)' }}
      />
    </div>
  );
}
