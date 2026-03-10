export interface SSRCategoryObject {
  slug: string;
  group_slug: string;
  is_group_slug: boolean;
  is_group_slug_default: boolean;
  is_service?: boolean; // true = service item, false = static/dynamic menu item
  category: string;
  category_en?: string;
  category_zh?: string;
  description: string;
  description_en?: string;
  description_zh?: string;
  attributes_icon?: string;
  dynamic_code_name?: string;
  dynamic_code?: string;
}