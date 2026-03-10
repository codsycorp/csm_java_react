/**
 * WuDynamicMenuPage - Load and render dynamic code for non-service menu items
 * This page handles menu items with is_service = false and dynamic_code_name
 * 
 * It:
 * 1. Receives slug from URL params
 * 2. Finds the category from SSR categories using slug
 * 3. Loads dynamic code from sys_autos using dynamic_code_name
 * 4. Renders the dynamic code
 * 5. If no dynamic code found, shows "Chưa có nội dung" message
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Result, Spin, Empty, message, notification } from 'antd';
import { useTranslation } from 'react-i18next';
import WebsiteLayout from '#src/layout/website/WebsiteLayout';
import { useWebsiteMenu } from '#src/layout/website/wu_menu';
import type { SSRCategoryObject } from '#src/types/ssr-category-object';
import { request } from '#src/utils';

interface DynamicMenuCategory extends SSRCategoryObject {
  dynamic_code_name?: string;
  dynamic_code?: string;
}

export default function WuDynamicMenuPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const menuItems = useWebsiteMenu();
  const executedRef = useRef(false);
  
  const [category, setCategory] = useState<DynamicMenuCategory | null>(null);
  const [autoCode, setAutoCode] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Find category from SSR data using slug and load dynamic code
  useEffect(() => {
    if (!slug) {
      setError(t('website.error.invalid_slug', 'Slug không hợp lệ'));
      setLoading(false);
      return;
    }

    try {
      const ssrCategories: SSRCategoryObject[] = 
        (typeof window !== 'undefined' && (window as any).__SSR_WEBSITE_CATEGORIES__) || [];
      
      const found = ssrCategories.find((cat) => cat.slug === slug);
      
      if (!found) {
        setError(t('website.error.category_not_found', 'Danh mục không tìm thấy'));
        setLoading(false);
        return;
      }

      // Check if it's a non-service item
      if ((found as any).is_service !== false) {
        // This is a service item, redirect to service page
        navigate(`/${slug}`, { replace: true });
        return;
      }

      const dynamicCodeName = (found as any).dynamic_code_name as string | undefined;
      
      if (!dynamicCodeName || !dynamicCodeName.trim()) {
        setError(
          t('website.error.no_content', 
            'Trang này chưa có nội dung để hiển thị cho các ngôn ngữ: Tiếng Việt, English, 中文')
        );
        setLoading(false);
        return;
      }

      setCategory(found as DynamicMenuCategory);
      
      // Load dynamic code from sys_autos
      request
        .post<any>('api/table', {
          json: {
            obj_name: 'sys_autos',
            where: {
              field: 'auto_name',
              type: 'eq',
              value: dynamicCodeName
            },
            take: 1
          }
        })
        .json<any>()
        .then((result: any) => {
          const rows = result?.rows || [];
          if (rows.length > 0) {
            const autoData = rows[0];
            const code = autoData.auto_code || autoData.code || '';
            setAutoCode(code);
          } else {
            setError(t('website.error.no_dynamic_code', 'Không tìm thấy mã code động'));
          }
          setLoading(false);
        })
        .catch((err: any) => {
          console.error('[WuDynamicMenuPage] Error loading dynamic code:', err);
          setError(t('website.error.load_failed', 'Lỗi khi tải trang'));
          setLoading(false);
        });
    } catch (err) {
      console.error('[WuDynamicMenuPage] Error finding category:', err);
      setError(t('website.error.load_failed', 'Lỗi khi tải trang'));
      setLoading(false);
    }
  }, [slug, navigate, t]);

  // Execute dynamic code when loaded
  useEffect(() => {
    if (autoCode === undefined) {
      return; // Still fetching
    }

    if (!autoCode || !autoCode.trim()) {
      return; // Empty code
    }

    if (executedRef.current) {
      return;
    }
    executedRef.current = true;

    try {
      const fn = new Function(
        'seft',
        `try{\n${autoCode}\n} catch (sca_err) {console.error(sca_err); alert('Menu Error: ' + sca_err);}`
      );
      
      // Call function with available context
      fn({
        t,
        navigate,
        slug,
      });
    } catch (error: any) {
      console.error('[WuDynamicMenuPage] Error executing code:', error);
      notification.error({
        message: t('website.error.execution_failed', 'Lỗi khi thực thi code'),
        description: error?.message || String(error),
      });
    }
  }, [autoCode, t, navigate, slug]);

  if (loading) {
    return (
      <WebsiteLayout menuItems={menuItems}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <Spin size="large" />
        </div>
      </WebsiteLayout>
    );
  }

  if (error || !category) {
    return (
      <WebsiteLayout menuItems={menuItems}>
        <Result
          status="404"
          title={error || t('website.error.not_found', 'Không tìm thấy')}
          subTitle={error || t('website.error.page_not_found', 'Trang bạn tìm kiếm không tồn tại')}
          style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
        />
      </WebsiteLayout>
    );
  }

  return (
    <WebsiteLayout menuItems={menuItems}>
      <div id={`dynamic-code-${slug}`} className="website-dynamic-content" style={{ minHeight: '60vh' }} />
    </WebsiteLayout>
  );
}
