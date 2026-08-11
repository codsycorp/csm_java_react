export type SeoRouteCategory = {
  key?: string;
  slug?: string;
  title?: string;
  category?: string;
  description?: string;
  color?: string;
  content?: string;
  content_en?: string;
  content_zh?: string;
  [key: string]: any;
};

export function normalizeSeoRouteKey(value?: string): string {
  return String(value || '').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
}

export function resolveRouteCategoryKey(
  routeSlug: string | undefined,
  categories: SeoRouteCategory[] = [],
  defaultKey = 'phan-mem'
): string {
  const normalizedSlug = normalizeSeoRouteKey(routeSlug);

  if (normalizedSlug) {
    const match = categories.find((category) => {
      const candidate = normalizeSeoRouteKey(category?.key || category?.slug);
      return candidate && candidate === normalizedSlug;
    });

    if (match) {
      return String(match.key || match.slug || normalizedSlug);
    }
  }

  if (categories.length === 0) {
    return defaultKey;
  }

  const first = categories[0];
  return String(first.key || first.slug || defaultKey);
}

export function resolveCategoryMeta(
  categoryKey: string | undefined,
  categories: SeoRouteCategory[] = [],
  language: string = 'vi'
): SeoRouteCategory | null {
  const normalizedKey = normalizeSeoRouteKey(categoryKey);

  const match = categories.find((category) => {
    const candidate = normalizeSeoRouteKey(category?.key || category?.slug);
    return candidate && candidate === normalizedKey;
  });

  if (match) {
    return {
      ...match,
      key: String(match.key || match.slug || categoryKey || ''),
      title: pickLocalizedText(match, 'title', 'category', language),
      description: pickLocalizedText(match, 'description', 'description', language),
      content: pickLocalizedContent(match, language),
    };
  }

  if (categories.length === 0) {
    return null;
  }

  const first = categories[0];
  return {
    ...first,
    key: String(first.key || first.slug || categoryKey || ''),
    title: pickLocalizedText(first, 'title', 'category', language),
    description: pickLocalizedText(first, 'description', 'description', language),
    content: pickLocalizedContent(first, language),
  };
}

function pickLocalizedText(
  category: SeoRouteCategory,
  fieldName: 'title' | 'description',
  fallbackField: 'title' | 'category' | 'description',
  language: string
): string {
  const normalizedLang = String(language || 'vi').toLowerCase();

  const candidates: Record<string, string | undefined> = {
    vi: category[`${fieldName}`] ?? category[fallbackField] ?? category[`${fieldName}_vi`],
    en: category[`${fieldName}_en`] ?? category[`${fallbackField}_en`] ?? category[`${fieldName}`] ?? category[fallbackField],
    zh: category[`${fieldName}_zh`] ?? category[`${fallbackField}_zh`] ?? category[`${fieldName}`] ?? category[fallbackField],
  };

  if (normalizedLang.includes('en')) return String(candidates.en || candidates.vi || '').trim();
  if (normalizedLang.includes('zh')) return String(candidates.zh || candidates.vi || '').trim();
  return String(candidates.vi || candidates.en || candidates.zh || '').trim();
}

function pickLocalizedContent(category: SeoRouteCategory, language: string): string {
  const normalizedLang = String(language || 'vi').toLowerCase();

  if (normalizedLang.includes('en')) {
    return String(category.content_en || category.content || '').trim();
  }

  if (normalizedLang.includes('zh')) {
    return String(category.content_zh || category.content || '').trim();
  }

  return String(category.content || '').trim();
}
