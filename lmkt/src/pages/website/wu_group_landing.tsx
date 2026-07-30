import React from 'react';
import { useParams } from 'react-router';
import { Card, Col, Row, Typography } from 'antd';
import { useTranslation } from 'react-i18next';

import WebsiteLayout from '#src/layout/website/WebsiteLayout';
import { useWebsiteMenu } from '#src/layout/website/wu_menu';

const { Title, Paragraph } = Typography;

type SSRCategory = {
  slug?: string;
  category?: string;
  category_en?: string;
  category_zh?: string;
  description?: string;
  description_en?: string;
  description_zh?: string;
  content?: string;
  is_group_slug?: boolean;
  group_slug?: string;
  is_service?: boolean;
};

const sanitizeHtml = (html?: string) => {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script,iframe,object,embed').forEach((n) => n.remove());
    return doc.body.innerHTML;
  } catch {
    return html;
  }
};

const getLocalized = (cat: SSRCategory | undefined, lang: string, field: 'category' | 'description') => {
  if (!cat) return '';
  if (lang.includes('en')) {
    return (field === 'category' ? cat.category_en : cat.description_en) || (cat as any)[field] || '';
  }
  if (lang.includes('zh')) {
    return (field === 'category' ? cat.category_zh : cat.description_zh) || (cat as any)[field] || '';
  }
  return (cat as any)[field] || '';
};

export default function WuGroupLandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const { i18n, t } = useTranslation();
  const menuItems = useWebsiteMenu();

  const categories: SSRCategory[] =
    (typeof window !== 'undefined' ? (window as any).__SSR_WEBSITE_CATEGORIES__ : null) || [];

  const group = slug
    ? categories.find((c) => c && c.slug === slug && c.is_group_slug === true)
    : undefined;

  const children = slug
    ? categories.filter((c) => c && c.group_slug === slug && c.is_group_slug !== true && c.is_service === true)
    : [];

  const lang = i18n.language || 'vi';
  const title = getLocalized(group, lang, 'category') || slug || t('website.menu.services', 'Dich vu');
  const description = getLocalized(group, lang, 'description');
  const content = sanitizeHtml(group?.content || '');

  const withLang = (path: string) => {
    if (lang.startsWith('vi')) return path;
    const code = lang.slice(0, 2);
    return `${path}?hl=${code}`;
  };

  return (
    <WebsiteLayout menuItems={menuItems} selectedKey={slug ? `/${slug}` : '/'}>
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24, paddingBottom: 96 }}>
        <section style={{ marginBottom: 24 }}>
          <Title level={1} style={{ marginBottom: 8 }}>{title}</Title>
          {description ? <Paragraph style={{ fontSize: 16 }}>{description}</Paragraph> : null}
          {content ? (
            <div
              style={{
                marginTop: 16,
                padding: '16px 20px',
                background: '#fff',
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                lineHeight: 1.8,
              }}
              dangerouslySetInnerHTML={{ __html: content }}
            />
          ) : null}
        </section>

        {children.length > 0 ? (
          <section>
            <Title level={3} style={{ marginBottom: 16 }}>
              {t('website.services.related_services', 'Dich vu lien quan')}
            </Title>
            <Row gutter={[16, 16]}>
              {children.map((child) => {
                const childTitle = getLocalized(child, lang, 'category') || child.slug || '';
                const childDesc = getLocalized(child, lang, 'description');
                return (
                  <Col xs={24} md={12} lg={8} key={child.slug}>
                    <a href={withLang(`/${child.slug || ''}`)} style={{ textDecoration: 'none' }}>
                      <Card hoverable style={{ height: '100%' }}>
                        <Title level={4} style={{ marginBottom: 8 }}>{childTitle}</Title>
                        {childDesc ? <Paragraph style={{ marginBottom: 0 }}>{childDesc}</Paragraph> : null}
                      </Card>
                    </a>
                  </Col>
                );
              })}
            </Row>
          </section>
        ) : null}
      </main>
    </WebsiteLayout>
  );
}
