// Canonical types for Website data across SSR, APIs, and UI

export type Status = 'active' | 'inactive' | 'draft' | string;

export interface WebServiceMenu {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  icon?: string | null;
  sortOrder?: number | null;
  status?: Status;
  description?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ServicePost {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  content?: string;
  thumbnail?: string;
  images?: string[];
  serviceType?: string; // e.g. phan-mem, bat-dong-san, lam-dep-my-pham, cho-thue-xe, booking-online
  category?: string; // human readable category label
  serviceId?: string; // FK to WebServiceMenu.id
  serviceCode?: string; // logical code if used (service_code)
  publishDate?: string;
  expiryDate?: string;
  featured?: boolean;
  activeHome?: boolean;
  attributes?: Record<string, any>;
}

export interface SeoMeta {
  title?: string;
  description?: string;
  keywords?: string;
  canonical?: string;
  ogImage?: string;
  noIndex?: boolean;
}

export interface InitialReactData {
  route?: string;
  menu?: WebServiceMenu[];
  homeDetailList?: ServicePost[];
  serviceDetailList?: ServicePost[];
  seo?: SeoMeta;
  // Allow extra fields as needed without breaking
  [k: string]: any;
}
