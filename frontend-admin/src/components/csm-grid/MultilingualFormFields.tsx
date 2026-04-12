import React, { useState, useEffect } from "react";
import { Form, Input, Tabs, Space, Card, Row, Col, Button } from "antd";
import type { TabsProps } from "antd";
import { HtmlEditor } from "./HtmlEditor";

const { TextArea } = Input;

const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 8, fontWeight: 500 };

const FieldWrapper: React.FC<{ label: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ label, children, style }) => (
  <div style={style}>
    <label style={labelStyle}>{label}</label>
    {children}
  </div>
);

/**
 * Component cho seo_meta field: 3 ngôn ngữ với đầy đủ meta tags
 */
export function SeoMetaFormField({ value, onChange, activeLang }: { value?: any; onChange?: (v: any) => void; activeLang?: string }) {
  const [data, setData] = useState<any>(() => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return {
          vi: { meta_title: "", meta_description: "", canonical: "", keywords: "", robots: "index,follow", og_title: "", og_description: "", og_image: "" },
          en: { meta_title: "", meta_description: "", canonical: "", keywords: "", robots: "index,follow", og_title: "", og_description: "", og_image: "" },
          zh: { meta_title: "", meta_description: "", canonical: "", keywords: "", robots: "index,follow", og_title: "", og_description: "", og_image: "" }
        };
      }
    }
    return value || {
      vi: { meta_title: "", meta_description: "", canonical: "", keywords: "", robots: "index,follow", og_title: "", og_description: "", og_image: "" },
      en: { meta_title: "", meta_description: "", canonical: "", keywords: "", robots: "index,follow", og_title: "", og_description: "", og_image: "" },
      zh: { meta_title: "", meta_description: "", canonical: "", keywords: "", robots: "index,follow", og_title: "", og_description: "", og_image: "" }
    };
  });

  useEffect(() => {
    if (value && typeof value === 'string') {
      try {
        setData(JSON.parse(value));
      } catch {}
    } else if (value && typeof value === 'object') {
      setData(value);
    }
  }, [value]);

  const updateLang = (lang: string, field: string, val: string) => {
    const newData = {
      ...data,
      [lang]: {
        ...(data[lang] || {}),
        [field]: val
      }
    };
    setData(newData);
    onChange?.(JSON.stringify(newData));
  };

  const renderLangForm = (lang: string, langName: string) => (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <FieldWrapper label="Meta Title">
        <Input
          value={data[lang]?.meta_title || ''}
          onChange={(e) => updateLang(lang, 'meta_title', e.target.value)}
          placeholder={`${langName} meta title (50-60 ký tự)`}
          maxLength={60}
          showCount
        />
      </FieldWrapper>

      <FieldWrapper label="Meta Description">
        <TextArea
          value={data[lang]?.meta_description || ''}
          onChange={(e) => updateLang(lang, 'meta_description', e.target.value)}
          placeholder={`${langName} meta description (150-160 ký tự)`}
          rows={3}
          maxLength={160}
          showCount
        />
      </FieldWrapper>

      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <FieldWrapper label="Canonical URL">
            <Input
              value={data[lang]?.canonical || ''}
              onChange={(e) => updateLang(lang, 'canonical', e.target.value)}
              placeholder="https://example.com/page"
            />
          </FieldWrapper>
        </Col>
        <Col xs={24} sm={12}>
          <FieldWrapper label="Robots">
            <Input
              value={data[lang]?.robots || 'index,follow'}
              onChange={(e) => updateLang(lang, 'robots', e.target.value)}
              placeholder="index,follow"
            />
          </FieldWrapper>
        </Col>
      </Row>

      <FieldWrapper label="Keywords">
        <Input
          value={data[lang]?.keywords || ''}
          onChange={(e) => updateLang(lang, 'keywords', e.target.value)}
          placeholder="keyword1, keyword2, keyword3"
        />
      </FieldWrapper>

      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
        <label style={{ display: 'block', marginBottom: 12, fontWeight: 500, color: '#1890ff' }}>Open Graph (Facebook/Social)</label>
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Input
            value={data[lang]?.og_title || ''}
            onChange={(e) => updateLang(lang, 'og_title', e.target.value)}
            placeholder="OG Title"
            addonBefore="og:title"
          />
          <TextArea
            value={data[lang]?.og_description || ''}
            onChange={(e) => updateLang(lang, 'og_description', e.target.value)}
            placeholder="OG Description"
            rows={2}
          />
          <Input
            value={data[lang]?.og_image || ''}
            onChange={(e) => updateLang(lang, 'og_image', e.target.value)}
            placeholder="https://example.com/image.jpg"
            addonBefore="og:image"
          />
        </Space>
      </div>
    </Space>
  );

  const tabItems: TabsProps['items'] = [
    {
      key: 'vi',
      label: '🇻🇳 Tiếng Việt',
      children: renderLangForm('vi', 'Tiếng Việt'),
    },
    {
      key: 'en',
      label: '🇬🇧 English',
      children: renderLangForm('en', 'English'),
    },
    {
      key: 'zh',
      label: '🇨🇳 中文',
      children: renderLangForm('zh', '中文'),
    },
  ];

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      {activeLang ? renderLangForm(activeLang, activeLang === 'vi' ? 'Tiếng Việt' : activeLang === 'en' ? 'English' : '中文') : <Tabs items={tabItems} />}
    </Card>
  );
}

/**
 * Auto-sync SEO meta from content/title/excerpt fields.
 * - Watches `title_{lang}`, `excerpt_{lang}`, and the composite content field (if present under `name`).
 * - Fills the form field `name` with an object { vi, en, zh } containing meta_title and meta_description.
 * - By default the UI hides detailed inputs; user can click "Chỉnh sửa" to edit manually.
 */
export function SeoMetaAutoSync({ name, form, hidden }: { name: string; form: any; hidden?: boolean }) {
  const [editing, setEditing] = useState(false);

  // watch the composite i18n_content field (contains title/excerpt/content per lang) and slug
  const i18n_content = Form.useWatch?.('i18n_content', form);
  const slug = Form.useWatch?.('slug', form);

  const stripHtml = (s: string = '') => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  useEffect(() => {
    // build meta object from i18n_content (title/excerpt per lang) and derive canonical from slug
    const langs = ['vi', 'en', 'zh'] as const;
    const out: any = {};
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const canonical = slug ? `${baseUrl}/${slug}` : '';

    langs.forEach((lg) => {
      const langData = i18n_content?.[lg] || {};
      const t = langData.title || '';
      const ex = langData.excerpt || '';
      const content = langData.content ? stripHtml(langData.content) : '';

      const meta_title = t || (content ? content.slice(0, 60) : '');
      const meta_description = ex || (content ? content.slice(0, 160) : '');

      out[lg] = {
        meta_title,
        meta_description,
        canonical,
        keywords: '',
        robots: 'index,follow',
        og_title: meta_title,
        og_description: meta_description,
        og_image: ''
      };
    });

    // Only set when not editing (don't overwrite user edits)
    if (!editing) {
      form.setFieldsValue({ [name]: out });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n_content, slug, editing]);

  const current = form.getFieldValue(name) || {};

  // If hidden, do not render any UI but keep effect active to populate values silently
  if (hidden) return null;

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 600 }}>SEO Meta (tự động sinh từ Nội dung)</div>
        <div>
          <Button size="small" onClick={() => setEditing((v) => !v)}>{editing ? 'Hoàn tác' : 'Chỉnh sửa'}</Button>
        </div>
      </div>
      {!editing ? (
        <div>
          <div style={{ color: '#6b7280', marginBottom: 8 }}>Đã tự động lấy tiêu đề và mô tả từ phần Nội dung. Nếu cần, nhấn "Chỉnh sửa" để tùy chỉnh.</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, margin: 0 }}>{JSON.stringify(current, null, 2)}</pre>
        </div>
      ) : (
        React.createElement(SeoMetaFormField as any, { value: current, onChange: (v: any) => form.setFieldsValue({ [name]: v }) })
      )}
    </Card>
  );
}

/**
 * Helpers exported so `CsmDynamicGrid` / dynamic builder can use these components as custom editors.
 * Usage (example):
 *  - import { MultilangFieldComponents, renderMultilangEditor } from './MultilingualFormFields'
 *  - In dynamic config, set `f_types` to one of: 'attributes' | 'seo_meta' | 'i18n_content'
 *  - In grid/editor mapping, if field type matches, render `renderMultilangEditor(typeKey, { value, onChange })`
 */
export const MultilangFieldComponents: Record<string, React.FC<any>> = {
  i18n_content: ContentMultilangFormField,
};

export function renderMultilangEditor(typeKey: string, props: { value?: any; onChange?: (v: any) => void }) {
  const key = String(typeKey || '').toLowerCase();
  const Component = MultilangFieldComponents[key] || MultilangFieldComponents['i18n_content'];
  return React.createElement(Component as any, props);
}

/**
 * Component cho i18n_content field: title, excerpt, content cho 3 ngôn ngữ
 */
export function ContentMultilangFormField({ value, onChange }: { value?: any; onChange?: (v: any) => void }) {
  const [data, setData] = useState<any>(() => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return {
          vi: { title: "", excerpt: "", content: "" },
          en: { title: "", excerpt: "", content: "" },
          zh: { title: "", excerpt: "", content: "" }
        };
      }
    }
    return value || {
      vi: { title: "", excerpt: "", content: "" },
      en: { title: "", excerpt: "", content: "" },
      zh: { title: "", excerpt: "", content: "" }
    };
  });

  useEffect(() => {
    if (value && typeof value === 'string') {
      try {
        setData(JSON.parse(value));
      } catch {}
    } else if (value && typeof value === 'object') {
      setData(value);
    }
  }, [value]);

  const updateLang = (lang: string, field: string, val: string) => {
    const newData = {
      ...data,
      [lang]: {
        ...(data[lang] || {}),
        [field]: val
      }
    };
    setData(newData);
    onChange?.(JSON.stringify(newData));
  };

  const renderLangForm = (lang: string, langName: string) => (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Row gutter={16}>
        <Col xs={24} sm={14} md={16}>
          <FieldWrapper label="Tiêu đề">
            <Input
              value={data[lang]?.title || ''}
              onChange={(e) => updateLang(lang, 'title', e.target.value)}
              placeholder={`${langName} - Tiêu đề bài viết`}
            />
          </FieldWrapper>
        </Col>
        <Col xs={24} sm={10} md={8}>
          <FieldWrapper label="Tóm tắt">
            <TextArea
              value={data[lang]?.excerpt || ''}
              onChange={(e) => updateLang(lang, 'excerpt', e.target.value)}
              placeholder={`${langName} - Tóm tắt ngắn gọn`}
              rows={3}
            />
          </FieldWrapper>
        </Col>
      </Row>

      <FieldWrapper label="Nội dung HTML">
        <div style={{ border: '1px solid #d9d9d9', borderRadius: 4, padding: 0, background: 'transparent' }}>
          <HtmlEditor
            value={data[lang]?.content || ''}
            onChange={(val: string) => updateLang(lang, 'content', val)}
            rows={12}
            placeholder={`${langName} - Nhập nội dung HTML chi tiết...`}
          />
        </div>
      </FieldWrapper>
    </Space>
  );

  const tabItems: TabsProps['items'] = [
    {
      key: 'vi',
      label: '🇻🇳 Tiếng Việt',
      children: renderLangForm('vi', 'Tiếng Việt'),
    },
    {
      key: 'en',
      label: '🇬🇧 English',
      children: renderLangForm('en', 'English'),
    },
    {
      key: 'zh',
      label: '🇨🇳 中文',
      children: renderLangForm('zh', '中文'),
    },
  ];

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Tabs items={tabItems} />
    </Card>
  );
}
