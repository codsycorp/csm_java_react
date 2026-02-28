/**
 * Helper functions cho đa ngôn ngữ (Multilingual support)
 * Hỗ trợ: Tiếng Việt (vi), Trung Quốc (zh), Tiếng Anh (en)
 */

export type SupportedLanguage = 'vi' | 'zh' | 'en';

export const LANGUAGES = {
  vi: { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳', label: 'Vietnamese' },
  zh: { code: 'zh', name: '中文', flag: '🇨🇳', label: 'Chinese' },
  en: { code: 'en', name: 'English', flag: '🇬🇧', label: 'English' },
} as const;

/**
 * Lấy giá trị theo ngôn ngữ hiện tại
 * @param obj Object chứa các field đa ngôn ngữ
 * @param baseField Tên field gốc (vd: 'title', 'name', 'description')
 * @param lang Ngôn ngữ cần lấy
 * @param fallback Fallback language nếu không tìm thấy
 */
export function getLocalizedField<T extends Record<string, any>>(
  obj: T,
  baseField: string,
  lang: SupportedLanguage = 'vi',
  fallback: boolean = true
): string {
  // Thử lấy field theo ngôn ngữ: title_zh, name_en, description_vi
  const langField = lang === 'vi' ? baseField : `${baseField}_${lang}`;
  const value = obj[langField];
  
  if (value) return value;
  
  // Fallback: thử các ngôn ngữ khác
  if (fallback) {
    const fallbackLangs: SupportedLanguage[] = ['vi', 'en', 'zh'];
    for (const fallbackLang of fallbackLangs) {
      if (fallbackLang === lang) continue;
      const fallbackField = fallbackLang === 'vi' ? baseField : `${baseField}_${fallbackLang}`;
      const fallbackValue = obj[fallbackField];
      if (fallbackValue) return fallbackValue;
    }
  }
  
  return obj[baseField] || '';
}

/**
 * Lấy tất cả translations của một field
 */
export function getAllTranslations<T extends Record<string, any>>(
  obj: T,
  baseField: string
): Record<SupportedLanguage, string> {
  return {
    vi: obj[baseField] || '',
    zh: obj[`${baseField}_zh`] || '',
    en: obj[`${baseField}_en`] || '',
  };
}

/**
 * Set giá trị cho một field theo ngôn ngữ
 */
export function setLocalizedField<T extends Record<string, any>>(
  obj: T,
  baseField: string,
  lang: SupportedLanguage,
  value: string
): T {
  const field = lang === 'vi' ? baseField : `${baseField}_${lang}`;
  return { ...obj, [field]: value };
}

/**
 * Parse SEO meta đa ngôn ngữ
 * Format: { vi: {...}, zh: {...}, en: {...} }
 */
export interface SeoMeta {
  meta_title?: string;
  meta_description?: string;
  canonical?: string;
  keywords?: string;
  og_title?: string;
  og_description?: string;
  og_image?: string;
}

export function getSeoMeta(
  obj: Record<string, any>,
  lang: SupportedLanguage = 'vi'
): SeoMeta {
  try {
    const seoMeta = typeof obj.seo_meta === 'string' 
      ? JSON.parse(obj.seo_meta) 
      : obj.seo_meta || {};
    return seoMeta[lang] || {};
  } catch {
    return {};
  }
}

/**
 * Set SEO meta cho một ngôn ngữ
 */
export function setSeoMeta(
  obj: Record<string, any>,
  lang: SupportedLanguage,
  meta: SeoMeta
): string {
  try {
    const current = typeof obj.seo_meta === 'string' 
      ? JSON.parse(obj.seo_meta) 
      : obj.seo_meta || {};
    current[lang] = meta;
    return JSON.stringify(current);
  } catch {
    return JSON.stringify({ [lang]: meta });
  }
}

/**
 * Generate slug từ text (hỗ trợ tiếng Việt)
 */
export function generateSlug(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Validate field theo ngôn ngữ
 */
export function validateMultilangField(
  obj: Record<string, any>,
  baseField: string,
  requiredLangs: SupportedLanguage[] = ['vi']
): { valid: boolean; missing: SupportedLanguage[] } {
  const missing: SupportedLanguage[] = [];
  
  for (const lang of requiredLangs) {
    const field = lang === 'vi' ? baseField : `${baseField}_${lang}`;
    if (!obj[field] || String(obj[field]).trim() === '') {
      missing.push(lang);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Copy content từ ngôn ngữ này sang ngôn ngữ khác
 */
export function copyTranslation<T extends Record<string, any>>(
  obj: T,
  baseField: string,
  fromLang: SupportedLanguage,
  toLang: SupportedLanguage
): T {
  const fromField = fromLang === 'vi' ? baseField : `${baseField}_${fromLang}`;
  const toField = toLang === 'vi' ? baseField : `${baseField}_${toLang}`;
  const value = obj[fromField];
  
  if (!value) return obj;
  
  return { ...obj, [toField]: value };
}

/**
 * Format hiển thị compact cho 3 ngôn ngữ
 */
export function formatMultilangDisplay(
  obj: Record<string, any>,
  baseField: string,
  maxLength: number = 50
): string {
  const parts: string[] = [];
  
  for (const lang of ['vi', 'zh', 'en'] as SupportedLanguage[]) {
    const value = getLocalizedField(obj, baseField, lang, false);
    if (value) {
      const truncated = value.length > maxLength 
        ? value.substring(0, maxLength) + '...' 
        : value;
      parts.push(`${LANGUAGES[lang].flag} ${truncated}`);
    }
  }
  
  return parts.join('\n');
}

/**
 * Kiểm tra xem record có đủ translation chưa
 */
export function getTranslationCompleteness(
  obj: Record<string, any>,
  fields: string[]
): { 
  total: number; 
  completed: number; 
  percentage: number;
  missing: Array<{ field: string; lang: SupportedLanguage }>;
} {
  const required = fields.length * 3; // 3 languages
  let completed = 0;
  const missing: Array<{ field: string; lang: SupportedLanguage }> = [];
  
  for (const field of fields) {
    for (const lang of ['vi', 'zh', 'en'] as SupportedLanguage[]) {
      const value = getLocalizedField(obj, field, lang, false);
      if (value && value.trim()) {
        completed++;
      } else {
        missing.push({ field, lang });
      }
    }
  }
  
  return {
    total: required,
    completed,
    percentage: Math.round((completed / required) * 100),
    missing,
  };
}

/**
 * Export cho external use
 */
export default {
  LANGUAGES,
  getLocalizedField,
  getAllTranslations,
  setLocalizedField,
  getSeoMeta,
  setSeoMeta,
  generateSlug,
  validateMultilangField,
  copyTranslation,
  formatMultilangDisplay,
  getTranslationCompleteness,
};
