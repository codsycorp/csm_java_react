/**
 * WuCategoryPage - Smart dispatcher for all /:slug routes.
 *
 * Reads window.__SSR_WEBSITE_CATEGORIES__ at render time and directly renders
 * the appropriate page component without any client-side redirect.
 *
 * Benefits vs the old /dynamic-code/:slug / /no-content/:slug approach:
 * - Clean, SEO-friendly URLs: every dynamic menu item lives at /:slug
 * - No 302 redirects that crawlers and users would see
 * - Single route definition handles all dynamic categories
 */

import React from 'react';
import { useParams } from 'react-router';
import WuServices from './wu_services';
import WuNoContentPage from './wu_no_content_page';

export default function WuCategoryPage() {
  const { slug } = useParams<{ slug: string }>();

  const ssrCategories: any[] =
    (typeof window !== 'undefined' ? (window as any).__SSR_WEBSITE_CATEGORIES__ : null) || [];

  const catObj = slug ? ssrCategories.find((c) => c && c.slug === slug) : null;

  // Service / project listing (default)
  if (!catObj || catObj.is_service !== false) {
    return <WuServices />;
  }

  // Non-service pages in web source show static no-content page.
  return <WuNoContentPage />;
}
