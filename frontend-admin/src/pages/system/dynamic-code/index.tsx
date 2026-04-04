/**
 * Dynamic Code Menu Renderer
 * Loads and executes JavaScript code from sys_autos (p_type=0)
 * Similar to AutoSetup.tsx and home/index.tsx
 */

import { BasicContent } from "#src/components";
import { getTableData, andWhere } from "#src/components/csm-grid/CsmApi";
import * as CsmApi from "#src/components/csm-grid/CsmApi";
import { csmDecrypt, csmEncrypt } from "#src/components/csm-grid/CsmCrypto";
import CsmDynamicGrid from "#src/components/csm-grid/CsmDynamicGrid";
import CsmCrmWorkspace from "#src/components/csm-crm/CsmCrmWorkspace";
import { CsmKanbanBoard } from "#src/components/csm-kanban";
import { generateSeoContent, csm_ai_generate_seo_content, generateSeoContentWithPrompt, formatSeoPrompt, PROMPT_GENERATE_POST } from "#src/api/ai";
import { useAppStore } from "#src/store/app";
import { useUserStore } from "#src/store/user";
import { usePreferences } from "#src/hooks";
import { ANT_DESIGN_LOCALE } from "#src/locales";
import { request } from "#src/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation, I18nextProvider } from "react-i18next";
import { useParams, useLocation, useNavigate } from "react-router";
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { Spin, Empty, Alert, notification, Table, Tabs, Button, Input, InputNumber, Select, Card, Space, Popconfirm, ConfigProvider, DatePicker, Row, Col, Switch, Progress, Tag } from "antd";
import dayjs from "dayjs";
import i18nInstance from "i18next";

import { customAntdDarkTheme, customAntdLightTheme } from "#src/styles/theme/antd/antd-theme";

const dynamicReactRoots = new Map<string, ReactDOM.Root>();
const LEGACY_CONTAINER_IDS = new Set(["context-auto", "dynamic-code-root"]);

type ScopedRuntime = {
  windowProxy: Window;
  documentProxy: Document;
  cleanup: () => void;
};

function normalizeJsZipGlobal() {
  const w = window as any;
  const ctor = w.JSZip || w.jszip || w?.XLSX?.JSZip;
  if (typeof ctor === "function") {
    w.JSZip = ctor;
    w.jszip = ctor;
  }
}

function loadScriptCandidates(candidates: string[], ready?: () => boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    if (ready?.()) {
      resolve("already-loaded");
      return;
    }

    const list = candidates.filter((item, index, arr) => item && arr.indexOf(item) === index);
    let idx = 0;

    const run = () => {
      if (ready?.()) {
        resolve("ready");
        return;
      }
      if (idx >= list.length) {
        reject(new Error(`Unable to load script candidates: ${list.join(", ")}`));
        return;
      }

      const src = list[idx++];
      const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
      if (existing) {
        if (ready?.()) {
          resolve(src);
          return;
        }
        existing.addEventListener("load", () => (ready?.() ? resolve(src) : run()), { once: true });
        existing.addEventListener("error", () => run(), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => (ready?.() ? resolve(src) : run());
      script.onerror = () => run();
      document.head.appendChild(script);
    };

    run();
  });
}

async function ensureSpreadsheetLibraries() {
  normalizeJsZipGlobal();

  if (typeof (window as any).JSZip !== "function") {
    await loadScriptCandidates(
      [
        "/assets/jszip/jszip.js",
        "./assets/jszip/jszip.js",
        "/csm_datas/public/assets/jszip/jszip.js",
        "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
      ],
      () => typeof (window as any).JSZip === "function" || typeof (window as any).jszip === "function",
    );
  }

  normalizeJsZipGlobal();

  if (!(window as any).XLSX || typeof (window as any).XLSX.writeFile !== "function") {
    await loadScriptCandidates(
      [
        "/assets/xlsx.js",
        "./assets/xlsx.js",
        "/csm_datas/public/assets/xlsx.js",
        "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
      ],
      () => Boolean((window as any).XLSX && typeof (window as any).XLSX.writeFile === "function"),
    );
  }

  normalizeJsZipGlobal();
}

function sanitizeIdPart(value?: string): string {
  if (!value) return "default";
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

function escapeCssId(value: string): string {
  return String(value).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

function cleanupOwnedContainer(containerId: string) {
  const root = dynamicReactRoots.get(containerId);
  if (root) {
    try {
      root.unmount();
    } catch (error) {
      console.warn(`[DynamicCode] Failed to unmount root ${containerId}:`, error);
    }
    dynamicReactRoots.delete(containerId);
  }

  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = "";
  }
}

function createScopedRuntime(containerId: string): ScopedRuntime {
  const rawWindow = window;
  const rawDocument = document;
  const runtimeStore: Record<string, any> = Object.create(null);
  runtimeStore.csmDynamicCodeContainerId = containerId;
  const timerRefs = {
    intervals: new Set<number>(),
    timeouts: new Set<number>(),
  };
  const windowListeners: Array<{ type: string; listener: EventListenerOrEventListenerObject; options?: boolean | AddEventListenerOptions }> = [];
  const documentListeners: Array<{ type: string; listener: EventListenerOrEventListenerObject; options?: boolean | AddEventListenerOptions }> = [];

  const resolveContainer = () => {
    return rawDocument.getElementById(containerId)
      || rawDocument.getElementById("dynamic-code-root")
      || rawDocument.getElementById("context-auto");
  };

  const documentProxy = new Proxy(rawDocument, {
    get(target, prop, receiver) {
      if (prop === "getElementById") {
        return (id: string) => {
          if (LEGACY_CONTAINER_IDS.has(String(id))) {
            return resolveContainer();
          }
          return target.getElementById(id);
        };
      }
      if (prop === "querySelector") {
        return (selector: string) => {
          if (selector === "#context-auto" || selector === "#dynamic-code-root") {
            return resolveContainer();
          }
          return target.querySelector(selector);
        };
      }
      if (prop === "querySelectorAll") {
        return (selector: string) => {
          if (selector === "#context-auto" || selector === "#dynamic-code-root") {
            return target.querySelectorAll(`#${containerId}`);
          }
          return target.querySelectorAll(selector);
        };
      }
      if (prop === "addEventListener") {
        return (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
          documentListeners.push({ type, listener, options });
          target.addEventListener(type, listener, options);
        };
      }
      if (prop === "removeEventListener") {
        return (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
          target.removeEventListener(type, listener, options);
        };
      }

      // Use native target as receiver to avoid browser brand-check failures (Illegal invocation).
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as unknown as Document;

  const windowProxy = new Proxy(rawWindow, {
    get(target, prop, receiver) {
      if (prop === "window" || prop === "self" || prop === "globalThis") {
        return windowProxy;
      }
      if (prop === "document") {
        return documentProxy;
      }
      if (prop === "setInterval") {
        return (...args: any[]) => {
          const id = (target.setInterval as any)(...args);
          timerRefs.intervals.add(Number(id));
          return id;
        };
      }
      if (prop === "clearInterval") {
        return (id: number) => {
          timerRefs.intervals.delete(Number(id));
          return target.clearInterval(id);
        };
      }
      if (prop === "setTimeout") {
        return (...args: any[]) => {
          const id = (target.setTimeout as any)(...args);
          timerRefs.timeouts.add(Number(id));
          return id;
        };
      }
      if (prop === "clearTimeout") {
        return (id: number) => {
          timerRefs.timeouts.delete(Number(id));
          return target.clearTimeout(id);
        };
      }
      if (prop === "addEventListener") {
        return (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
          windowListeners.push({ type, listener, options });
          target.addEventListener(type, listener, options);
        };
      }
      if (prop === "removeEventListener") {
        return (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
          target.removeEventListener(type, listener, options);
        };
      }

      const key = String(prop);
      if (Object.prototype.hasOwnProperty.call(runtimeStore, key)) {
        return runtimeStore[key];
      }

      // Use native target as receiver to avoid browser brand-check failures (Illegal invocation).
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, prop, value, receiver) {
      const key = String(prop);
      if (key === "csmDynamicCodeContainerId") {
        runtimeStore[key] = value;
        return true;
      }
      if (
        key.startsWith("csm")
        || key === "React"
        || key === "ReactDOM"
        || key === "antd"
        || key === "thongbao"
        || key === "canhbao"
      ) {
        return Reflect.set(target, prop, value, receiver);
      }

      runtimeStore[key] = value;
      return true;
    },
    has(target, prop) {
      const key = String(prop);
      return Object.prototype.hasOwnProperty.call(runtimeStore, key) || key in target;
    },
  }) as unknown as Window;

  const cleanup = () => {
    ["__crmDynamicDispose", "__dynamicCodeDispose", "__autoUploadDispose", "__autoDispose"].forEach((fnName) => {
      const disposer = runtimeStore[fnName];
      if (typeof disposer === "function") {
        try {
          disposer();
        } catch (error) {
          console.warn(`[DynamicCode] Failed to invoke scoped disposer ${fnName}:`, error);
        }
      }
    });

    timerRefs.intervals.forEach((id) => {
      try { rawWindow.clearInterval(id); } catch {}
    });
    timerRefs.timeouts.forEach((id) => {
      try { rawWindow.clearTimeout(id); } catch {}
    });
    timerRefs.intervals.clear();
    timerRefs.timeouts.clear();

    windowListeners.forEach(({ type, listener, options }) => {
      try { rawWindow.removeEventListener(type, listener, options); } catch {}
    });
    documentListeners.forEach(({ type, listener, options }) => {
      try { rawDocument.removeEventListener(type, listener, options); } catch {}
    });
  };

  return {
    windowProxy,
    documentProxy,
    cleanup,
  };
}

declare global {
  interface Window {
    csmApi?: Record<string, any>;
    csmCurrentUser?: any;
    seft?: any;
    csmTheme?: Record<string, any>;
    csmDynamicCodeContainerId?: string;
    csmUserData?: {
      get: () => any[];
      fetchFromDatabase?: (callback?: (success: boolean, data?: any[], error?: string) => void) => Promise<void>;
      set: (newUserAddress: any[], callback?: (success: boolean, error?: string) => void) => Promise<void>;
    };
  }
}

// ============================================================================
// Helper Functions (from AutoSetup.tsx)
// ============================================================================

/**
 * Base64 encode with UTF-8 support
 */
function base64Encode(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return "";
  }
}

/**
 * Base64 decode with UTF-8 support
 */
function base64Decode(str: string): string {
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch {
    return "";
  }
}

// Facebook API helpers - exposed via self object to auto code
const FACEBOOK_POST_TIMEOUT_MS = 120000;

// Type definitions for Facebook responses
type FacebookResponse = {
  success: boolean;
  message?: string;
  data?: any;
  error?: any;
};

/**
 * Check if auth is valid before posting (for debugging 403 errors)
 */
async function facebookCheckAuth(): Promise<FacebookResponse> {
  console.log(`🔐 [facebookCheckAuth] Checking if auth is valid...`);
  let response: any;
  try {
    response = await request
      .post<FacebookResponse>('user-info', {
        json: {},
        ignoreLoading: true,
      })
      .json<FacebookResponse>();
    
    if (response?.success || response?.data) {
      console.log(`✅ [facebookCheckAuth] Auth is valid, user:`, response?.data?.username);
      return {
        success: true,
        message: 'Auth valid',
        data: response?.data,
      };
    } else {
      console.warn(`⚠️ [facebookCheckAuth] Auth check failed:`, response);
      return {
        success: false,
        message: response?.message || 'Auth check failed',
        data: response?.data,
      };
    }
  } catch (error: any) {
    console.error('❌ [facebookCheckAuth] Auth error:', error);
    return {
      success: false,
      message: error?.message || 'Auth check error',
      error,
    };
  }
}

/**
 * Post to Facebook page with multiple images and/or videos (Google Index pattern)
 * @param params Structured params object
 * @returns Promise<FacebookResponse>
 * 
 * Usage (new - recommended):
 *   postToFacebookWithImages({ pageId, pageAccessToken, message, images: [], videos: [], link })
 * 
 * Usage (old - backward compat):
 *   postToFacebookWithImages(pageId, pageAccessToken, message, images, videosOrLink, linkMaybe)
 */
async function postToFacebookWithImages(
  pageIdOrParams: string | {
    pageId: string;
    pageAccessToken: string;
    message: string;
    images?: string[];
    videos?: string[];
    link?: string;
  },
  pageAccessTokenArg?: string,
  messageArg?: string,
  imagesArg?: string[],
  videosOrLinkArg?: string[] | string,
  linkMaybeArg?: string,
): Promise<FacebookResponse> {
  let response: any;
  try {
    let pageId: string;
    let pageAccessToken: string;
    let message: string;
    let images: string[];
    let videos: string[];
    let link: string | null;

    // Handle both new (object) and old (args) calling conventions
    if (typeof pageIdOrParams === 'object') {
      // New pattern: structured params
      pageId = pageIdOrParams.pageId;
      pageAccessToken = pageIdOrParams.pageAccessToken;
      message = pageIdOrParams.message;
      images = pageIdOrParams.images || [];
      videos = pageIdOrParams.videos || [];
      link = pageIdOrParams.link || null;
    } else {
      // Old pattern: individual args (backward compat)
      pageId = pageIdOrParams;
      pageAccessToken = pageAccessTokenArg || '';
      message = messageArg || '';
      images = imagesArg || [];
      videos = Array.isArray(videosOrLinkArg) ? videosOrLinkArg : [];
      link = typeof videosOrLinkArg === 'string' ? videosOrLinkArg : linkMaybeArg || null;
    }

    const payload = {
      pageId,
      pageAccessToken,
      message,
      images,
      videos,
      link,
    };

    // Call API with retry for transient errors
    const callApi = async () => {
      console.log(`🔐 [postToFacebookWithImages] Sending request to facebook/post-with-images with csm-token...`);
      const result = await request
        .post<FacebookResponse>('facebook/post-with-images', {
          json: payload,
          ignoreLoading: true,
          timeout: FACEBOOK_POST_TIMEOUT_MS,
        })
        .json<FacebookResponse>();
      console.log(`✅ [postToFacebookWithImages] Got response:`, result);
      return result;
    };

    try {
      response = await callApi();
    } catch (firstError: any) {
      const messageText = `${firstError?.message || ''}`;
      const isTransient =
        messageText.includes('HTTP 502') ||
        messageText.includes('HTTP 503') ||
        messageText.includes('HTTP 504') ||
        messageText.includes('timeout') ||
        messageText.includes('403');  // Add 403 as transient (might be CSRF token issue)
      if (!isTransient) {
        throw firstError;
      }
      console.warn('⚠️ Transient error posting Facebook media, retrying once...', firstError);
      // Wait 500ms before retry to allow token refresh
      await new Promise(resolve => setTimeout(resolve, 500));
      response = await callApi();
    }

    // Return response (success or error)
    if (response?.success) {
      return {
        success: true,
        message: response?.message,
        data: {
          post_id: response.data?.post_id,
          images_count: response.data?.images_count || images.length,
          videos_count: response.data?.videos_count || videos.length,
        },
      };
    } else {
      return {
        success: false,
        message: response?.message || 'Facebook post failed',
        data: response?.data,
      };
    }
  } catch (error: any) {
    console.error('❌ Error posting to Facebook with images:', error);
    return {
      success: false,
      message: error?.message || 'Failed to post to Facebook',
      error,
    };
  }
}

/**
 * Post to Facebook page with single image (Google Index pattern)
 * @param pageId Facebook page ID
 * @param pageAccessToken Facebook page access token
 * @param message Post message/caption
 * @param imageUrl Optional image URL
 * @param link Optional link to attach
 * @returns Promise<FacebookResponse>
 */
async function postToFacebook(
  pageId: string,
  pageAccessToken: string,
  message: string,
  imageUrl?: string,
  link?: string,
): Promise<FacebookResponse> {
  let response: any;
  try {
    const payload = {
      pageId,
      pageAccessToken,
      message,
      imageUrl: imageUrl || null,
      link: link || null,
    };

    response = await request
      .post<FacebookResponse>('facebook/post', {
        json: payload,
        ignoreLoading: true,
        timeout: FACEBOOK_POST_TIMEOUT_MS,
      })
      .json<FacebookResponse>();

    if (response?.success) {
      return {
        success: true,
        message: response?.message,
        data: {
          post_id: response.data?.post_id,
        },
      };
    } else {
      return {
        success: false,
        message: response?.message || 'Facebook post failed',
        data: response?.data,
      };
    }
  } catch (error: any) {
    console.error('❌ Error posting to Facebook:', error);
    return {
      success: false,
      message: error?.message || 'Failed to post to Facebook',
      error,
    };
  }
}

/**
 * Validate Facebook access token (Google Index pattern)
 * @param accessToken Facebook user access token
 * @returns Promise<FacebookResponse>
 */
async function facebookValidateToken(accessToken: string): Promise<FacebookResponse> {
  let response: any;
  try {
    response = await request
      .post<FacebookResponse>('facebook/me', {
        json: { accessToken },
        ignoreLoading: true,
      })
      .json<FacebookResponse>();
    return response;
  } catch (error: any) {
    console.error('❌ Error validating Facebook token:', error);
    return {
      success: false,
      message: error?.message || 'Token validation failed',
      error,
    };
  }
}

/**
 * Exchange short-lived Facebook token for long-lived token (Google Index pattern)
 * @param accessToken Short-lived access token
 * @param clientId Facebook app ID
 * @param appSecret Facebook app secret
 * @returns Promise<FacebookResponse>
 */
async function facebookExchangeToken(
  accessToken: string,
  clientId: string,
  appSecret: string,
): Promise<FacebookResponse> {
  let response: any;
  try {
    response = await request
      .post<FacebookResponse>('facebook/exchange-token', {
        json: { accessToken, clientId, appSecret },
        ignoreLoading: true,
      })
      .json<FacebookResponse>();
    return response;
  } catch (error: any) {
    console.error('❌ Error exchanging Facebook token:', error);
    return {
      success: false,
      message: error?.message || 'Token exchange failed',
      error,
    };
  }
}

/**
 * Get Facebook pages for the user (Google Index pattern)
 * @param accessToken Facebook user access token
 * @returns Promise<FacebookResponse>
 */
async function facebookGetPages(accessToken: string): Promise<FacebookResponse> {
  let response: any;
  try {
    response = await request
      .post<FacebookResponse>('facebook/pages', {
        json: { accessToken },
        ignoreLoading: true,
      })
      .json<FacebookResponse>();
    return response;
  } catch (error: any) {
    console.error('❌ Error getting Facebook pages:', error);
    return {
      success: false,
      message: error?.message || 'Failed to get pages',
      error,
    };
  }
}

// ============================================================================
// Component Props
// ============================================================================

interface DynamicCodeMenuProps {
  menuId?: string;
  menuData?: any;
  autoCodeName?: string;
  inlineCode?: string;
  containerId?: string;
  containerClassName?: string;
  rootPadding?: number;
  noCodeMessage?: string;
  /** Khi true: nếu load lỗi (template không tồn tại, v.v.) thì ẩn hoàn toàn thay vì hiện Alert lỗi */
  hideOnError?: boolean;
}

export default function DynamicCodeMenu({
  menuId: propMenuId,
  menuData: propMenuData,
  autoCodeName: propAutoCodeName,
  inlineCode,
  containerId = "dynamic-code-root",
  containerClassName,
  rootPadding = 16,
  noCodeMessage,
  hideOnError = false,
}: DynamicCodeMenuProps = {}) {
  const { menuId: paramMenuId } = useParams<{ menuId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const menuId = propMenuId || paramMenuId;
  const { i18n, t } = useTranslation();
  const user = useUserStore();
  const appId = useAppStore(state => state.currentAppId);
  const effectiveAppId = user.app_id || appId || "csm";
  const preferences = usePreferences();
  const { isDark, themeColorPrimary, language } = preferences;
  const executedRef = useRef(false);
  const runtimeRef = useRef<ScopedRuntime | null>(null);
  
  const [autoCode, setAutoCode] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scope default container ID by menu/template/tab instance to avoid cross-tab collisions.
  const resolvedContainerId = useMemo(() => {
    if (containerId !== "dynamic-code-root") {
      return containerId;
    }
    const scopeSource = [propAutoCodeName || menuId || "default", location.key || "tab"]
      .filter(Boolean)
      .join("_");
    return `dynamic-code-root-${sanitizeIdPart(scopeSource)}`;
  }, [containerId, propAutoCodeName, menuId, location.key]);

  const resolvedContainerSelector = useMemo(() => `#${escapeCssId(resolvedContainerId)}`, [resolvedContainerId]);

  const scopedLayoutCss = useMemo(() => {
    return `${resolvedContainerSelector} {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  overflow-x: auto;
  overflow-y: visible;
  box-sizing: border-box;
}

${resolvedContainerSelector},
${resolvedContainerSelector} * {
  box-sizing: border-box;
}

${resolvedContainerSelector} > * {
  max-width: 100%;
}

${resolvedContainerSelector} img,
${resolvedContainerSelector} video,
${resolvedContainerSelector} canvas,
${resolvedContainerSelector} svg,
${resolvedContainerSelector} iframe,
${resolvedContainerSelector} table,
${resolvedContainerSelector} pre {
  max-width: 100%;
}

${resolvedContainerSelector} .ant-table-wrapper,
${resolvedContainerSelector} .ant-table,
${resolvedContainerSelector} .ant-table-container,
${resolvedContainerSelector} .ant-table-content {
  max-width: 100%;
}

${resolvedContainerSelector} .ant-table-content {
  overflow-x: auto;
}

${resolvedContainerSelector} input,
${resolvedContainerSelector} textarea,
${resolvedContainerSelector} select {
  max-width: 100%;
}
`;
  }, [resolvedContainerSelector]);

  // ============================================
  // SETUP WINDOW OBJECTS - IMMEDIATELY (NOT IN useEffect)
  // ============================================
  // Setup window.csmApi immediately using Object.defineProperty to avoid conflicts
  if (typeof window !== "undefined" && !window.csmApi) {
    Object.defineProperty(window, 'csmApi', {
      get() {
        return {
          ...CsmApi,
          getTableData: CsmApi.getTableData,
          updateTableData: (CsmApi as any).updateTableData,
          andWhere: CsmApi.andWhere,
        };
      },
      configurable: true,
      enumerable: true
    });
  }

  // ✅ CRITICAL FIX: Sync csmCurrentUser BEFORE initializing csmUserData so that
  // fetchFromDatabase can resolve pkValue when called immediately from auto-upload scripts.
  if (typeof window !== "undefined") {
    const latestUser = JSON.parse(JSON.stringify(user));
    if (!window.csmCurrentUser || !(window.csmCurrentUser as any).email) {
      window.csmCurrentUser = latestUser;
    }
  }

  // Initialize/refresh window.csmUserData for auto-upload-lmkt.js compatibility.
  // Always refresh to avoid stale closures (old app_id/user after permission/session changes).
  if (typeof window !== "undefined") {
    const parseUserAddress = (raw: any): any[] => {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === "string" && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    const stableStringify = (value: any): string => {
      const sortObject = (input: any): any => {
        if (Array.isArray(input)) {
          return input.map(sortObject);
        }
        if (input && typeof input === "object") {
          return Object.keys(input)
            .sort()
            .reduce((acc: Record<string, any>, key) => {
              acc[key] = sortObject(input[key]);
              return acc;
            }, {});
        }
        return input;
      };

      try {
        return JSON.stringify(sortObject(value));
      } catch {
        return "";
      }
    };

    const getIdentityCandidates = (currentUser: any) => {
      const candidates = [
        { field: "login_identifier", value: currentUser?.login_identifier },
        { field: "email", value: currentUser?.email },
        { field: "username", value: currentUser?.username },
        { field: "phone_number", value: currentUser?.phone_number || currentUser?.phoneNumber },
        { field: "phoneNumber", value: currentUser?.phoneNumber || currentUser?.phone_number },
        { field: "app_token", value: currentUser?.app_token || currentUser?.appToken },
        { field: "id", value: currentUser?.id || currentUser?.user_id || currentUser?.account_id },
      ];
      return candidates.filter((x) => x.value !== undefined && x.value !== null && String(x.value).trim() !== "");
    };

    const getAppIdCandidates = (currentUser: any) => {
      const appIds = [currentUser?.app_id, effectiveAppId, appId, "csm"]
        .filter(Boolean)
        .map((x) => String(x));
      return Array.from(new Set(appIds));
    };

    const fetchAccountRow = async (): Promise<{ row: any; pkField: string; pkValue: any; tableName: string; requestAppId: string } | null> => {
      const currentUser = (window as any).csmCurrentUser || {};
      const identities = getIdentityCandidates(currentUser);
      if (identities.length === 0) return null;

      // Main account records are stored in csm_accounts (app_id context = csm).
      for (const identity of identities) {
        try {
          const response = await (window as any).csmApi.getTableData({
            app_id: "csm",
            obj_name: "csm_accounts",
            where: {
              field: identity.field,
              type: "eq",
              value: identity.value,
            },
            take: 1,
          });

          const rows = (response as any)?.rows || (response as any)?.data || [];
          if (Array.isArray(rows) && rows.length > 0) {
            return { row: rows[0], pkField: identity.field, pkValue: identity.value, tableName: "csm_accounts", requestAppId: "csm" };
          }
        } catch {
          // Try next candidate.
        }
      }

      // Sub-user records are stored in csm_group_members (app context of logged-in user).
      const appIds = getAppIdCandidates(currentUser);
      for (const app_id of appIds) {
        for (const identity of identities) {
          try {
            const response = await (window as any).csmApi.getTableData({
              app_id,
              obj_name: "csm_group_members",
              where: {
                field: identity.field,
                type: "eq",
                value: identity.value,
              },
              take: 1,
            });

            const rows = (response as any)?.rows || (response as any)?.data || [];
            if (Array.isArray(rows) && rows.length > 0) {
              return {
                row: rows[0],
                pkField: identity.field,
                pkValue: identity.value,
                tableName: "csm_group_members",
                requestAppId: String(app_id || effectiveAppId || "csm"),
              };
            }
          } catch {
            // Try next candidate.
          }
        }
      }

      return null;
    };

    const getUserAddressFallback = (): any[] => {
      try {
        const currentUser = (window as any).csmCurrentUser || {};
        const fromCurrentUser = parseUserAddress(currentUser.user_address ?? currentUser.user_adress);
        if (fromCurrentUser.length > 0) return fromCurrentUser;

        const fromSeft = parseUserAddress((window as any).seft?.Uinfos?.userAddress);
        if (fromSeft.length > 0) return fromSeft;

        const localRaw = localStorage.getItem("user_address");
        return parseUserAddress(localRaw);
      } catch {
        return [];
      }
    };

    (window as any).csmUserData = {
        /**
         * Get user_address from window.csmCurrentUser
         */
        get: function(): any[] {
          try {
            return getUserAddressFallback();
          } catch {}
          return [];
        },

        /**
         * Fetch user_address from csm_accounts or csm_group_members
         */
        fetchFromDatabase: async function(callback?: (success: boolean, data?: any[], error?: string) => void): Promise<void> {
          try {
            if (!(window as any).csmApi || !(window as any).csmApi.getTableData) {
              const fallbackData = getUserAddressFallback();
              if (typeof callback === "function") callback(true, fallbackData, "API not available, using local fallback");
              return;
            }

            const account = await fetchAccountRow();
            if (!account) {
              const fallbackData = getUserAddressFallback();
              if (Array.isArray(fallbackData) && fallbackData.length > 0) {
                (window as any).csmCurrentUser = (window as any).csmCurrentUser || {};
                (window as any).csmCurrentUser.user_address = JSON.stringify(fallbackData);
                localStorage.setItem("user_address", JSON.stringify(fallbackData));
                if (typeof callback === "function") callback(true, fallbackData, "Restricted by policy, using self data");
                return;
              }
              if (typeof callback === "function") callback(true, [], "Restricted by policy, no fallback data");
              return;
            }

            const userAddress = parseUserAddress(account.row?.user_address ?? account.row?.user_adress);

            (window as any).csmCurrentUser = (window as any).csmCurrentUser || {};
            (window as any).csmCurrentUser.user_address = JSON.stringify(userAddress);

            localStorage.setItem("user_address", JSON.stringify(userAddress));

            if (typeof callback === "function") callback(true, userAddress);
          } catch (error: any) {
            if (typeof callback === "function") {
              callback(false, [], error?.message || String(error));
            }
          }
        },

        /**
         * Set user_address and update to csm_accounts or csm_group_members
         */
        set: async function(newUserData: any[], callback?: (success: boolean, error?: string) => void): Promise<void> {
          try {
            console.log("Dữ liệu user_address đưa vào là:", newUserData);
            let arr = Array.isArray(newUserData) ? newUserData : [];
            const nextSerialized = stableStringify(arr);
            (window as any).csmCurrentUser = (window as any).csmCurrentUser || {};
            (window as any).csmCurrentUser.user_address = JSON.stringify(arr);
            localStorage.setItem("user_address", JSON.stringify(arr));

            const account = await fetchAccountRow();
            if (!account) {
              // Keep backend security unchanged: if csm_accounts is restricted, save locally and continue.
              console.warn("[csmUserData.set] csm_accounts restricted or not accessible, saved to local fallback only");
              if (typeof callback === "function") callback(true, "Saved locally (restricted backend access)");
              return;
            }
            
            // Prepare update data
            const updateData: any = {
              [account.pkField]: account.pkValue
            };

            const currentUserAddress = parseUserAddress(account.row?.user_address ?? account.row?.user_adress);
            const currentSerialized = stableStringify(currentUserAddress);
            if (currentSerialized === nextSerialized) {
              console.log("ℹ️ [csmUserData.set] Skipped database update because user_address is unchanged");
              if (typeof callback === "function") callback(true);
              return;
            }

            if (Array.isArray(arr) && arr.length > 0) {
              updateData.user_address = JSON.stringify(arr);
            } else {
              updateData.user_address = null;
            }
            updateData.user_adress = updateData.user_address;
            
            if (window.csmApi && (window.csmApi as any).updateTableData) {
              const response = await (window.csmApi as any).updateTableData({
                app_id: String(account.requestAppId || account.row?.app_id || effectiveAppId || "csm"),
                obj_name: account.tableName,
                command: "update",
                obj_update: updateData,
                pk_fields: [account.pkField],
              });
              
              if (response?.success) {
                console.log("✅ Updated user_address to database successfully");
                if (typeof callback === "function") callback(true);
              } else {
                const errorMsg = response?.message || response?.error || "Update failed";
                console.error("❌ Failed to update user_address:", errorMsg);
                if (typeof callback === "function") callback(false, errorMsg);
              }
            } else {
              if (typeof callback === "function") callback(false, "updateTableData API not available");
            }
          } catch (error: any) {
            const errorMsg = error?.message || String(error);
            console.error("❌ Error setting user_address:", errorMsg);
            if (typeof callback === "function") callback(false, errorMsg);
          }
        }
      };

      console.log('✅ [DynamicCode] window.csmUserData initialized/refreshed (compatible with AutoSetup.tsx)');
    }

  // Sync current user to window
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.csmCurrentUser = JSON.parse(JSON.stringify(user));
    }
  }, [user]);

  // Sync locale to DOM + notify injected dynamic scripts.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const html = document.documentElement;
    if (html && i18n?.language) {
      html.lang = i18n.language;
    }

    window.dispatchEvent(new CustomEvent("csm:locale-change", {
      detail: { language: i18n?.language || "vi" }
    }));
  }, [i18n.language]);

  // Sync theme preferences to window
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).csmTheme = {
        isDark,
        themeColorPrimary,
        getBackgroundColor: () => isDark ? '#141414' : '#ffffff',
        getTextColor: () => isDark ? '#ffffff' : '#000000',
        getSecondaryTextColor: () => isDark ? '#8c8c8c' : '#666666',
        getBorderColor: () => isDark ? '#303030' : '#f0f0f0',
        getCardBackground: () => isDark ? '#1f1f1f' : '#ffffff',
      };

      window.dispatchEvent(new CustomEvent("csm:theme-change", {
        detail: { isDark, themeColorPrimary }
      }));
    }
  }, [isDark, themeColorPrimary]);

  // ============================================
  // GLOBAL WINDOW OBJECTS - Lazy Loading for Auto Code
  // ============================================
  // CRITICAL: Expose dependencies IMMEDIATELY (not in useEffect) to ensure they're available when code executes
  // ============================================
  if (typeof window !== 'undefined') {
    // Notification helpers - always available
    if (!(window as any).thongbao) {
      (window as any).thongbao = (msg: string) => notification.success({ message: msg });
    }
    if (!(window as any).canhbao) {
      (window as any).canhbao = (msg: string) => notification.warning({ message: msg });
    }
    
    // React - lazy loaded via getter
    if (!Object.getOwnPropertyDescriptor(window, 'React')) {
      Object.defineProperty(window, 'React', {
        get() { return React; },
        configurable: true,
        enumerable: false
      });
    }
    
    // ReactDOM - lazy loaded via getter
    if (!Object.getOwnPropertyDescriptor(window, 'ReactDOM')) {
      Object.defineProperty(window, 'ReactDOM', {
        get() { return ReactDOM; },
        configurable: true,
        enumerable: false
      });
    }
    
    // Ant Design components - lazy loaded via getter
    if (!Object.getOwnPropertyDescriptor(window, 'antd')) {
      Object.defineProperty(window, 'antd', {
        get() {
          return {
            notification, Table, Tabs, Button, Input, InputNumber, Select, Card, Space, Popconfirm, ConfigProvider, DatePicker, Row, Col, Switch, Progress, Tag, dayjs, CsmDynamicGrid,
            CsmCrmWorkspace,
            CsmKanbanBoard,
            antdLocale: ANT_DESIGN_LOCALE[language],
            antdThemeConfig: isDark ? customAntdDarkTheme : customAntdLightTheme,
            googleIndexUrl: (CsmApi as any).googleIndexUrl,
            checkGoogleIndexQuota: (CsmApi as any).checkGoogleIndexQuota,
            checkGoogleIndexStatus: (CsmApi as any).checkGoogleIndexStatus,
            getGoogleSearchConsoleSites: (CsmApi as any).getGoogleSearchConsoleSites,
            checkAndAutoPublish: (CsmApi as any).checkAndAutoPublish,
            addToQueue: (CsmApi as any).addToQueue,
            addBatchToQueue: (CsmApi as any).addBatchToQueue,
            getQueueInfo: (CsmApi as any).getQueueInfo,
            getQueueItems: (CsmApi as any).getQueueItems,
            processQueue: (CsmApi as any).processQueue,
            removeFromQueue: (CsmApi as any).removeFromQueue,
            getUrlHistory: (CsmApi as any).getUrlHistory,
            getRecentHistory: (CsmApi as any).getRecentHistory,
          };
        },
        configurable: true,
        enumerable: false
      });
    }
    
    // I18nextProvider - lazy loaded via getter
    if (!Object.getOwnPropertyDescriptor(window, 'I18nextProvider')) {
      Object.defineProperty(window, 'I18nextProvider', {
        get() { return I18nextProvider; },
        configurable: true,
        enumerable: false
      });
    }

    if (!Object.getOwnPropertyDescriptor(window, 'i18n')) {
      Object.defineProperty(window, 'i18n', {
        get() { return i18n || i18nInstance; },
        configurable: true,
        enumerable: false
      });
    }
    
    // Crypto functions - lazy loaded via getter
    if (!Object.getOwnPropertyDescriptor(window, 'csmCrypto')) {
      Object.defineProperty(window, 'csmCrypto', {
        get() { return { encrypt: csmEncrypt, decrypt: csmDecrypt }; },
        configurable: true,
        enumerable: false
      });
    }
    
    // AI functions - lazy loaded via getter
    if (!Object.getOwnPropertyDescriptor(window, 'csmAI')) {
      Object.defineProperty(window, 'csmAI', {
        get() {
          return {
            generateSeoContent, csm_ai_generate_seo_content,
            generateSeoContentWithPrompt, formatSeoPrompt,
            PROMPT_GENERATE_POST
          };
        },
        configurable: true,
        enumerable: false
      });
    }
  }

  // Ensure menu instances are isolated: clean old dynamic instances when switching menus.
  useEffect(() => {
    if (runtimeRef.current) {
      runtimeRef.current.cleanup();
      runtimeRef.current = null;
    }
    cleanupOwnedContainer(resolvedContainerId);
    executedRef.current = false;

    return () => {
      if (runtimeRef.current) {
        runtimeRef.current.cleanup();
        runtimeRef.current = null;
      }
      cleanupOwnedContainer(resolvedContainerId);
    };
  }, [menuId, resolvedContainerId, location.key]);


  // Load inline code or fetch template code from sys_autos
  useEffect(() => {
    let cancelled = false;

    async function loadAutoCode() {
      try {
        if (inlineCode !== undefined) {
          setError(null);
          setLoading(false);
          setAutoCode(inlineCode);
          return;
        }

        setLoading(true);
        setError(null);

        const autoCodeName =
          propAutoCodeName
          || propMenuData?.auto_code_name
          || (location.state as any)?.menuData?.auto_code_name
          || "";

        if (!autoCodeName) {
          setError("Auto code template name not configured");
          setAutoCode("");
          return;
        }

        // Load the code template STRICTLY from app_id=csm, table=sys_autos.
        const where = andWhere([
          { field: "p_name", type: "eq", value: autoCodeName },
          { field: "p_type", type: "eq", value: 0 },
        ]);

        const response = await getTableData<any>({
          app_id: "csm",
          obj_name: "sys_autos",
          where,
          take: 1,
        });

        const rows = (response as any)?.rows || (response as any)?.data || [];
        const codeRecord = Array.isArray(rows)
          ? rows.find((r: any) => r?.p_name === autoCodeName)
          : undefined;

        if (!codeRecord?.p_code) {
          setError(`Code template "${autoCodeName}" not found in sys_autos`);
          setAutoCode("");
          return;
        }

        // Decrypt the code
        const decrypted = codeRecord.p_code ? csmDecrypt(codeRecord.p_code) : "";

        if (!cancelled) {
          if (decrypted && decrypted.trim()) {
            setAutoCode(decrypted);
          } else {
            setError("Code template is empty or invalid");
            setAutoCode("");
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          const msg = err?.message || String(err);
          console.error("❌ [DynamicCodeMenu] Error loading code:", msg);
          setError(msg);
          setAutoCode("");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAutoCode();
    return () => {
      cancelled = true;
      executedRef.current = false;
    };
  }, [menuId, location.state, propAutoCodeName, propMenuData, inlineCode]);

  const seft = useMemo(() => {
    const userAddressRaw = localStorage.getItem("user_address");
    let userAddress: any = undefined;
    try { userAddress = userAddressRaw ? JSON.parse(userAddressRaw) : undefined; } catch {}
    const currentUserAny = (window as any).csmCurrentUser || user || {};
    if (!Array.isArray(userAddress)) {
      try {
        const fromCurrent = currentUserAny?.user_address;
        userAddress = typeof fromCurrent === "string" ? JSON.parse(fromCurrent) : fromCurrent;
      } catch {
        userAddress = undefined;
      }
    }
    
    return {
      // App and user info
      app_id: currentUserAny.app_id || user.app_id || appId,
      appId: currentUserAny.app_id || user.app_id || appId || "csm",
      menuId,
      containerId: resolvedContainerId,
      getContainer: () => document.getElementById(resolvedContainerId),
      user: currentUserAny,
      t,
      navigate,
      
      Uinfos: {
        appToken: currentUserAny.app_token || currentUserAny.appToken || user.app_token || (user as any).appToken || "",
        userAddress: userAddress,
      },
      
      // Base64 utilities
      Base64: {
        encode: base64Encode,
        decode: base64Decode,
      },
      
      // Auth check (for debugging 403 errors)
      facebookCheckAuth: facebookCheckAuth,
      
      // Facebook Posting APIs
      postToFacebookWithImages: postToFacebookWithImages,
      postToFacebook: postToFacebook,
      
      // Facebook Backend APIs (for token management)
      facebookValidateToken: facebookValidateToken,
      facebookExchangeToken: facebookExchangeToken,
      facebookGetPages: facebookGetPages,
      
      // AI SEO Content Generation
      csm_ai_generate_seo_content: csm_ai_generate_seo_content,
      generateSeoContent: generateSeoContent,
      generateSeoContentWithPrompt: generateSeoContentWithPrompt,
      formatSeoPrompt: formatSeoPrompt,
      PROMPT_GENERATE_POST: PROMPT_GENERATE_POST,
      
      // Crypto utilities
      csm_encrypt: (code: string) => csmEncrypt(code),
      csm_decrypt: (code: string) => csmDecrypt(code),
      
      // Database operations
      csm_obj_tables: (params: any, fn?: (res: any) => void) => {
        getTableData<any>({
          app_id: params?.app_id || appId,
          obj_name: params?.obj_name,
          where: params?.e_where || params?.where,
          take: params?.take,
          lastkey: params?.lastkey,
        })
          .then(res => {
            const rows = (res as any)?.rows ?? (res as any)?.data ?? [];
            fn?.({ success: true, rows, raw: res });
          })
          .catch(error => {
            fn?.({ success: false, error: (error as any)?.message || error });
          });
      },
      
      csm_obj_updates: (params: any, fn?: (res: any) => void) => {
        if (!params?.obj_name) {
          fn?.({ success: false, error: "Missing obj_name" });
          return;
        }
        (CsmApi as any).updateTableData({
          app_id: params?.app_id || appId,
          obj_name: params?.obj_name,
          command: (params?.command as any) || "update",
          obj_update: params?.obj_update || params?.obj || {},
          pk_fields: params?.pk_fields,
        } as any)
          .then((res: any) => fn?.(res))
          .catch((error: any) => fn?.({ success: false, error: (error as any)?.message || error }));
      },
      
      csm_savedb: (key: string, data: any, fn?: (res: any) => void) => {
        try {
          localStorage.setItem(key, JSON.stringify(data));
          fn?.({ status: true });
        } catch (e: any) {
          fn?.({ status: false, error: e?.message || String(e) });
        }
      },
      
      csm_userinfo_update: (app_token: string, userInfoUp: any, fn?: (res: any) => void) => {
        const self = {
          csm_obj_tables: (params: any, callback: (res: any) => void) => {
            getTableData<any>({
              app_id: params?.app_id || appId,
              obj_name: params?.obj_name,
              where: params?.e_where || params?.where,
              take: params?.take,
              lastkey: params?.lastkey,
            })
              .then(res => {
                const rows = (res as any)?.rows ?? (res as any)?.data ?? [];
                callback({ success: true, rows, raw: res });
              })
              .catch(error => {
                callback({ success: false, error: (error as any)?.message || error });
              });
          },
          csm_obj_updates: (params: any, callback: (res: any) => void) => {
            if (!params?.obj_name) {
              callback({ success: false, error: "Missing obj_name" });
              return;
            }
            (CsmApi as any).updateTableData({
              app_id: params?.app_id || appId,
              obj_name: params?.obj_name,
              command: (params?.command as any) || "update",
              obj_update: params?.obj_update || params?.obj || {},
              pk_fields: params?.pk_fields,
            } as any)
              .then((res: any) => callback(res))
              .catch((error: any) => callback({ success: false, error: (error as any)?.message || error }));
          },
          csm_savedb: (key: string, data: any, callback: (res: any) => void) => {
            try {
              localStorage.setItem(key, JSON.stringify(data));
              callback({ status: true });
            } catch (e: any) {
              callback({ status: false, error: e?.message || String(e) });
            }
          }
        };

        // Implementation matching AutoSetup.tsx
        self.csm_obj_tables({
          app_id: effectiveAppId,
          obj_name: "csm_accounts",
          e_where: {
            field: "app_token",
            type: "eq",
            value: app_token
          }
        }, function(rs) {
          if (!rs.success) {
            fn?.({ status: false, error: rs.error });
            return;
          }
          
          const rows = rs.rows || [];
          if (rows.length === 0) {
            fn?.({ status: false, error: "User not found" });
            return;
          }
          
          const currentUser = rows[0];
          const updateObj: any = { app_token: app_token };
          
          // Map userInfoUp fields to database fields
          if (userInfoUp.username !== undefined) updateObj.username = userInfoUp.username;
          if (userInfoUp.fullName !== undefined) updateObj.full_name = userInfoUp.fullName;
          if (userInfoUp.phoneNumber !== undefined) updateObj.phone_number = userInfoUp.phoneNumber;
          if (userInfoUp.email !== undefined) updateObj.email = userInfoUp.email;
          if (userInfoUp.avatar !== undefined) updateObj.avatar = userInfoUp.avatar;
          if (userInfoUp.address !== undefined) updateObj.address = userInfoUp.address;
          
          self.csm_obj_updates({
            app_id: effectiveAppId,
            obj_name: "csm_accounts",
            command: "update",
            obj_update: updateObj,
            pk_fields: ["app_token"]
          }, function(updateRes) {
            if (updateRes?.success || updateRes?.data === "success") {
              fn?.({ status: true, data: updateObj });
            } else {
              fn?.({ status: false, error: updateRes?.error || updateRes?.message || "Update failed" });
            }
          });
        });
      },
      
      // Expose all CsmApi functions
      ...CsmApi,
    };
  }, [user, appId, menuId, t, navigate, resolvedContainerId]);

  // Legacy compatibility: many auto_code scripts expect global window.seft/Uinfos.
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as any).seft = seft;

    try {
      const currentUserAny = (window as any).csmCurrentUser || user || {};
      const currentAddress = currentUserAny?.user_address;
      const parsedAddress = Array.isArray(currentAddress)
        ? currentAddress
        : (typeof currentAddress === "string" && currentAddress.trim()
          ? JSON.parse(currentAddress)
          : undefined);

      if (Array.isArray(parsedAddress) && parsedAddress.length > 0) {
        localStorage.setItem("user_address", JSON.stringify(parsedAddress));
      }
    } catch {
      // Keep compatibility sync best-effort only.
    }
  }, [seft, user]);

  const executeCode = (code: string) => {
    try {
      if (runtimeRef.current) {
        runtimeRef.current.cleanup();
        runtimeRef.current = null;
      }

      const scopedRuntime = createScopedRuntime(resolvedContainerId);
      runtimeRef.current = scopedRuntime;

      const fn = new Function(
        "seft",
        "__dynamicContainerId",
        "__scopedWindow",
        "__scopedDocument",
        `const window = __scopedWindow;\n`
        + `const self = __scopedWindow;\n`
        + `const globalThis = __scopedWindow;\n`
        + `const document = __scopedDocument;\n`
        + `try{\n${code}\n} catch (sca_err) {console.error(sca_err); alert('Menu Error: ' + sca_err);}`
      );
      
      // Wait for dynamic container to be rendered before executing code
      const waitForDynamicRoot = (attempt = 0) => {
        const dynamicRoot = document.getElementById(resolvedContainerId);
        
        if (dynamicRoot) {
          // ✅ CRITICAL FIX: Defer execution to ensure window.React/ReactDOM are exposed first
          // Without this setTimeout, executeCode useEffect may run BEFORE the expose useEffect,
          // causing "window.React is not defined" errors
          setTimeout(async () => {
            try {
              try {
                await ensureSpreadsheetLibraries();
              } catch (libError) {
                console.warn("[DynamicCodeMenu] Spreadsheet libraries preload failed:", libError);
              }

              (window as any).ensureSpreadsheetLibraries = ensureSpreadsheetLibraries;
              (scopedRuntime.windowProxy as any).ensureSpreadsheetLibraries = ensureSpreadsheetLibraries;
              fn(seft, resolvedContainerId, scopedRuntime.windowProxy, scopedRuntime.documentProxy);
              console.log('✅ [DynamicCodeMenu] Code executed successfully after DOM ready');
            } catch (err: any) {
              const msg = err?.message || String(err);
              console.error("❌ [DynamicCodeMenu] Error executing code:", msg);
            }
          }, 0);
        } else if (attempt < 20) {
          // Retry after 50ms (max 20 attempts = 1 second)
          setTimeout(() => waitForDynamicRoot(attempt + 1), 50);
          if (attempt === 0) {
            console.log('⏳ [DynamicCodeMenu] Waiting for dynamic root container to render...');
          }
        } else {
          console.error('❌ [DynamicCodeMenu] Timeout waiting for dynamic root container after 1 second');
        }
      };
      
      // Start waiting for DOM
      waitForDynamicRoot();
    } catch (error: any) {
      const msg = error?.message || String(error);
      console.error("❌ [DynamicCodeMenu] Error creating function:", msg);
    }
  };

  useEffect(() => {
    // Only execute when autoCode has been successfully loaded from API
    if (autoCode === undefined) {
      return; // Still fetching from API
    }

    if (!autoCode || !autoCode.trim()) {
      return; // Empty code, nothing to execute
    }

    if (executedRef.current) {
      return;
    }
    executedRef.current = true;

    executeCode(autoCode);
  }, [autoCode, seft]);

  // Ẩn hoàn toàn khi có lỗi và hideOnError=true
  if (hideOnError && error && !loading) {
    return null;
  }

  return (
    <BasicContent key={i18n.language}>
      <div style={{ padding: rootPadding, width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
        <style>{scopedLayoutCss}</style>
        {loading && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin size="large" tip={t("common.loading", "Đang tải...")} />
          </div>
        )}

        {error && !loading && (
          <Alert
            message="Lỗi tải menu"
            description={error}
            type="error"
            showIcon
            closable
            style={{ marginBottom: 16 }}
          />
        )}

        {!loading && !error && autoCode === "" && (
          <Empty
            description={noCodeMessage || t("system.dynamic_code.no_code", "Không có code để chạy")}
            style={{ marginTop: 40 }}
          />
        )}

        {/* Container for dynamic code output */}
        <div
          id={resolvedContainerId}
          className={containerClassName}
          style={{
            width: "100%",
            maxWidth: "100%",
            margin: "0 auto",
            overflowX: "auto",
            minHeight: 400,
            ...(loading ? { display: "none" } : {})
          }}
        />
        
      </div>
    </BasicContent>
  );
}

/**
 * Helper exports for custom code templates
 */
export const DynamicCodeHelpers = {
  /**
   * Create a React component and render it to the container
   */
  renderComponent: (
    Component: React.ComponentType<any>,
    props?: Record<string, any>,
    containerId?: string
  ) => {
    const preferredContainerId = containerId
      || (typeof window !== "undefined" ? window.csmDynamicCodeContainerId : undefined)
      || (document.getElementById("dynamic-code-root") ? "dynamic-code-root" : undefined)
      || (document.getElementById("context-auto") ? "context-auto" : "dynamic-code-root");

    const container = document.getElementById(preferredContainerId);
    if (!container) {
      console.error(`Dynamic code root container not found: ${preferredContainerId}`);
      return null;
    }

    let root = dynamicReactRoots.get(preferredContainerId);
    if (!root) {
      root = ReactDOM.createRoot(container);
      dynamicReactRoots.set(preferredContainerId, root);
    }
    root.render(React.createElement(Component, props));
    return root;
  },

  /**
   * Get container element for direct DOM manipulation
   */
  getContainer: (containerId?: string) => {
    const preferredContainerId = containerId
      || (typeof window !== "undefined" ? window.csmDynamicCodeContainerId : undefined)
      || (document.getElementById("dynamic-code-root") ? "dynamic-code-root" : undefined)
      || (document.getElementById("context-auto") ? "context-auto" : "dynamic-code-root");
    return document.getElementById(preferredContainerId);
  },

  /**
   * Log with prefix for easy debugging
   */
  log: (message: string, data?: any) => {
    console.log(`[DynamicCode] ${message}`, data);
  },

  /**
   * Show error notification
   */
  showError: (message: string) => {
    if (typeof window !== "undefined" && (window as any).canhbao) {
      (window as any).canhbao(message);
    } else {
      console.error(message);
    }
  },

  /**
   * Show success notification
   */
  showSuccess: (message: string) => {
    if (typeof window !== "undefined" && (window as any).thongbao) {
      (window as any).thongbao(message);
    } else {
      console.log(message);
    }
  },
};
