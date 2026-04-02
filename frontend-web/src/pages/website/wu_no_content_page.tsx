/**
 * WuNoContentPage - Display "No Content Available" message for menu items
 * This page is shown when:
 * - Menu item has is_service = false
 * - No dynamic_code_name defined
 */

import React from 'react';
import { useParams } from 'react-router';
import { Result } from 'antd';
import { useTranslation } from 'react-i18next';
import WebsiteLayout from '#src/layout/website/WebsiteLayout';
import { useWebsiteMenu } from '#src/layout/website/wu_menu';

export default function WuNoContentPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const menuItems = useWebsiteMenu();

  return (
    <WebsiteLayout menuItems={menuItems}>
      <Result
        status="warning"
        title={t('website.error.no_content_title', 'Trang chưa có nội dung')}
        subTitle={t(
          'website.error.no_content_description',
          'Trang này chưa có nội dung để hiển thị cho các ngôn ngữ: Tiếng Việt, English, 中文'
        )}
        style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
      />
    </WebsiteLayout>
  );
}
