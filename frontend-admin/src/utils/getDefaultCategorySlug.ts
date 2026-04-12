// src/utils/getDefaultCategorySlug.ts
// Helper to get default category slug from SSR categories (SSR-safe)
export function getDefaultCategorySlug(): string {
  if (typeof window !== 'undefined' && (window as any).__SSR_WEBSITE_CATEGORIES__) {
    const categories = (window as any).__SSR_WEBSITE_CATEGORIES__;
    const cat = categories.find(
      (c: any) => typeof c === 'object' && c !== null && 'is_group_slug_default' in c && c.is_group_slug_default === true
    );
    if (cat && cat.slug) return cat.slug;
  }
  // Fallback: use SSR-injected global or default
  if (typeof window !== 'undefined' && (window as any).__SSR_DEFAULT_CATEGORY__) {
    return (window as any).__SSR_DEFAULT_CATEGORY__;
  }
  return 'phan-mem';
}
