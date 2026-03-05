import { useEffect, useMemo, useState, useRef } from "react";
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { useLocation, useNavigate } from "react-router";
import { notification, Table, Tabs, Button, Input, Select, Card, Space, Popconfirm, ConfigProvider, theme as antdThemeLib } from "antd";
import { useTranslation, I18nextProvider } from "react-i18next";
import { useAppStore, useUserStore } from "#src/store";
import { usePreferences } from "#src/hooks";
import { 
  getTableData, 
  updateTableData, 
  andWhere, 
  // Legacy Google Index APIs
  googleIndexUrl, 
  checkGoogleIndexQuota, 
  checkGoogleIndexStatus, 
  getGoogleSearchConsoleSites, 
  checkAndAutoPublish,
  // NEW Queue Management APIs
  addToQueue,
  addBatchToQueue,
  getQueueInfo,
  getQueueItems,
  processQueue,
  removeFromQueue,
  getUrlHistory,
  getRecentHistory
} from "#src/components/csm-grid/CsmApi";
import { csmEncrypt, csmDecrypt } from "#src/components/csm-grid/CsmCrypto";
import CsmDynamicGrid from "#src/components/csm-grid/CsmDynamicGrid";
import { ANT_DESIGN_LOCALE } from "#src/locales";
import { customAntdDarkTheme, customAntdLightTheme } from "#src/styles/theme/antd/antd-theme";
import { generateSeoContent, csm_ai_generate_seo_content, generateSeoContentWithPrompt, formatSeoPrompt, PROMPT_GENERATE_POST } from "#src/api/ai";
import { request } from "#src/utils";

function base64Encode(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return "";
  }
}

function base64Decode(str: string): string {
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch {
    return "";
  }
}

// Facebook API helpers - exposed via seft object to auto code
const FACEBOOK_POST_TIMEOUT_MS = 120000;

async function postToFacebookWithImages(pageId: string, pageAccessToken: string, message: string, images: string[] = [], link?: string) {
  try {
    const payload = {
      pageId,
      pageAccessToken,
      message,
      images,
      link: link || null
    };
    const response = await request
      .post<any>('facebook/post-with-images', {
        json: payload,
        ignoreLoading: true,
        timeout: FACEBOOK_POST_TIMEOUT_MS
      })
      .json<any>();
    if (response?.success) {
      return {
        success: true,
        post_id: response.data?.post_id,
        images_count: response.data?.images_count || images.length
      };
    } else {
      throw new Error(response?.message || 'Facebook post failed');
    }
  } catch (error: any) {
    console.error('❌ Error posting to Facebook with images:', error);
    throw error;
  }
}

async function postToFacebook(pageId: string, pageAccessToken: string, message: string, imageUrl?: string, link?: string) {
  try {
    const payload = {
      pageId,
      pageAccessToken,
      message,
      imageUrl: imageUrl || null,
      link: link || null
    };
    const response = await request
      .post<any>('facebook/post', {
        json: payload,
        ignoreLoading: true,
        timeout: FACEBOOK_POST_TIMEOUT_MS
      })
      .json<any>();
    if (response?.success) {
      return {
        success: true,
        post_id: response.data?.post_id
      };
    } else {
      throw new Error(response?.message || 'Facebook post failed');
    }
  } catch (error: any) {
    console.error('❌ Error posting to Facebook:', error);
    throw error;
  }
}

// Facebook Backend API helpers (for token management)
async function facebookValidateToken(accessToken: string) {
  try {
    const response = await request.post<any>('facebook/me', { 
      json: { accessToken }, 
      ignoreLoading: true 
    }).json<any>();
    return response;
  } catch (error: any) {
    console.error('❌ Error validating Facebook token:', error);
    throw error;
  }
}

async function facebookExchangeToken(accessToken: string, clientId: string, appSecret: string) {
  try {
    const response = await request.post<any>('facebook/exchange-token', { 
      json: { accessToken, clientId, appSecret }, 
      ignoreLoading: true 
    }).json<any>();
    return response;
  } catch (error: any) {
    console.error('❌ Error exchanging Facebook token:', error);
    throw error;
  }
}

async function facebookGetPages(accessToken: string) {
  try {
    const response = await request.post<any>('facebook/pages', { 
      json: { accessToken }, 
      ignoreLoading: true 
    }).json<any>();
    return response;
  } catch (error: any) {
    console.error('❌ Error getting Facebook pages:', error);
    throw error;
  }
}

// Expose user_address utils globally for legacy and dynamic grid usage
// TypeScript: add type for window.csmUserAddress
declare global {
  interface Window {
    csmUserData?: {
      get: () => any[];
      fetchFromDatabase?: (callback?: (success: boolean, data?: any[], error?: string) => void) => Promise<void>;
      set: (newUserAddress: any, callback?: (success: boolean, error?: string) => void) => void;
    };
    csmApi?: {
      getTableData?: (params: any) => Promise<any>;
      updateTableData?: (params: any) => Promise<{ data?: string; error?: string; success?: boolean; code?: number; message?: string }>;
      // Legacy Google Index APIs
      googleIndexUrl?: (urls: string | string[], action?: "publish" | "remove", timeoutMs?: number) => Promise<any>;
      checkGoogleIndexQuota?: () => Promise<any>;
      checkGoogleIndexStatus?: (url: string) => Promise<any>;
      getGoogleSearchConsoleSites?: () => Promise<any>;
      checkAndAutoPublish?: (url: string) => Promise<any>;
      // NEW Queue Management APIs
      addToQueue?: (url: string, action?: "publish" | "remove", priority?: number) => Promise<any>;
      addBatchToQueue?: (urls: string[], action?: "publish" | "remove", priority?: number) => Promise<any>;
      getQueueInfo?: () => Promise<any>;
      getQueueItems?: (page?: number, pageSize?: number) => Promise<any>;
      processQueue?: (batchSize?: number) => Promise<any>;
      removeFromQueue?: (url: string) => Promise<any>;
      getUrlHistory?: (url: string) => Promise<any>;
      getRecentHistory?: (limit?: number) => Promise<any>;
    };
    csmCurrentUser?: any;
  }
}

if (typeof window !== 'undefined') {
  window.csmUserData = window.csmUserData || {
    get: function(): any[] {
      try {
        const user = window.csmCurrentUser || {};
        let arr = [];
        if (typeof user.user_address === "string") {
          try { arr = JSON.parse(user.user_address); } catch { arr = []; }
        } else if (Array.isArray(user.user_address)) {
          arr = user.user_address;
        }
        if (!Array.isArray(arr)) arr = [];
        return arr;
      } catch {}
      return [];
    },
    fetchFromDatabase: async function(callback?: (success: boolean, data?: any[], error?: string) => void): Promise<void> {
      try {
        const user = window.csmCurrentUser || {};
        let pkField = user.email ? "email" : (user.username ? "username" : "phoneNumber");
        let pkValue = user.email || user.username || user.phoneNumber;
        
        if (!pkValue) {
          if (typeof callback === "function") callback(false, [], "No user info");
          return;
        }

        if (window.csmApi && window.csmApi.getTableData) {
          const response = await window.csmApi.getTableData({
            app_id: "csm",
            obj_name: "csm_accounts",
            where: {
              field: pkField,
              type: "eq",
              value: pkValue
            },
            take: 1
          });

          const rows = response?.rows || response?.data || [];
          if (rows.length > 0) {
            const userData = rows[0];
            let userAddress = [];
            
            if (typeof userData.user_address === "string") {
              try { userAddress = JSON.parse(userData.user_address); } catch { userAddress = []; }
            } else if (Array.isArray(userData.user_address)) {
              userAddress = userData.user_address;
            }
            
            // Cập nhật vào window.csmCurrentUser
            if (window.csmCurrentUser) {
              window.csmCurrentUser.user_address = Array.isArray(userAddress) ? JSON.stringify(userAddress) : userAddress;
            }
            
            // Cập nhật localStorage
            if (Array.isArray(userAddress) && userAddress.length > 0) {
              localStorage.setItem('user_address', JSON.stringify(userAddress));
            }
            
            if (typeof callback === "function") callback(true, userAddress);
          } else {
            if (typeof callback === "function") callback(false, [], "User not found");
          }
        } else {
          if (typeof callback === "function") callback(false, [], "API not available");
        }
      } catch (error: any) {
        if (typeof callback === "function") {
          callback(false, [], (error && typeof error === 'object' && 'message' in error) ? error.message : String(error));
        }
      }
    },
    set: async function(newUserData: any[], callback?: (success: boolean, error?: string) => void): Promise<void> {
      try {
        console.log("Dữ liệu user_address đưa vào là:", newUserData);
        let arr = Array.isArray(newUserData) ? newUserData : [];
        window.csmCurrentUser = window.csmCurrentUser || {};
        window.csmCurrentUser.user_address = JSON.stringify(arr);
        const user = window.csmCurrentUser;
        let pkField = user.email ? "email" : (user.username ? "username" : "phoneNumber");
        let pkValue = user.email || user.username || user.phoneNumber;
        if (!pkValue) {
          if (typeof callback === "function") callback(false, "No user info");
          return;
        }
        // Nếu arr là mảng rỗng, không gửi user_address hoặc gửi null
        const updateData: any = {
          [pkField]: pkValue
        };
        if (Array.isArray(arr) && arr.length > 0) {
          updateData.user_address = JSON.stringify(arr);
        } else {
          updateData.user_address = null;
        }
        if (window.csmApi && window.csmApi.updateTableData) {
          const response = await window.csmApi.updateTableData({
            app_id: "csm",
            obj_name: "csm_accounts",
            command: "update",
            obj_update: updateData,
            pk_fields: [pkField],
          });
          if (response.data === "success" || response?.success === true || response.code === 200) {
            if (typeof callback === "function") callback(true);
          } else {
            const errMsg = response?.error || response?.message || response?.data || "Update failed";
            if (typeof callback === "function") callback(false, errMsg);
          }
        } else {
          if (typeof callback === "function") callback(false, "API not available");
        }
      } catch (error: any) {
        if (typeof callback === "function") callback(false, (error && typeof error === 'object' && 'message' in error) ? error.message : String(error));
      }
    }
  };
}

export default function AutoSetup() {
  const location = useLocation() as any;
  const navigate = useNavigate();
  const executedRef = useRef(false);
  // auto_code will be fetched from backend sys_autos for current app
  const [autoCode, setAutoCode] = useState<string | undefined>(undefined);
  const appId = useAppStore(state => state.currentAppId);
  const user = useUserStore();
  // Always sync window.csmCurrentUser from zustand store
  // Always sync window.csmCurrentUser from zustand store reactively
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.csmCurrentUser = JSON.parse(JSON.stringify(user));
    }
  }, [user]);
  const { t } = useTranslation();
  const preferences = usePreferences();
  const { language, isDark, themeRadius, themeColorPrimary } = preferences;

  const antdLocale = useMemo(() => ANT_DESIGN_LOCALE[language], [language]);
  const themeConfig = useMemo(() => {
    const baseTheme = isDark ? customAntdDarkTheme : customAntdLightTheme;
    return {
      cssVar: true,
      hashed: false,
      algorithm: isDark ? antdThemeLib.darkAlgorithm : antdThemeLib.defaultAlgorithm,
      ...baseTheme,
      token: {
        ...baseTheme.token,
        borderRadius: themeRadius,
        colorPrimary: themeColorPrimary,
      },
    };
  }, [isDark, themeRadius, themeColorPrimary]);

  const title = useMemo(() => {
    const fallback = location?.state?.menuLabel || sessionStorage.getItem('auto_setup_label') || "Cài đặt tự động";
    return String(t("common.menu.auto_setup", fallback));
  }, [t, location?.state?.menuLabel]);

  // ============================================
  // GLOBAL TIMER CLEANUP SYSTEM - Ngăn Memory Leak & Crash
  // ============================================
  useEffect(() => {
    // Create global timer registry
    const globalTimers = {
      intervals: new Set<number>(),
      timeouts: new Set<number>(),
      isShuttingDown: false,
    };

    // Override setInterval to auto-register
    const originalSetInterval = window.setInterval;
    (window as any).setInterval = function(...args: any[]) {
      const id = originalSetInterval.apply(window, args as any);
      if (!globalTimers.isShuttingDown) {
        globalTimers.intervals.add(id as unknown as number);
      }
      return id;
    };

    // Override setTimeout to auto-register (chỉ cho long-running ones > 10s)
    const originalSetTimeout = window.setTimeout;
    (window as any).setTimeout = function(...args: any[]) {
      const id = originalSetTimeout.apply(window, args as any);
      const delay = typeof args[1] === 'number' ? args[1] : 0;
      if (!globalTimers.isShuttingDown && delay > 10000) { // Only track long timeouts
        globalTimers.timeouts.add(id as unknown as number);
      }
      return id;
    };

    // Expose global cleanup function
    (window as any).__cleanupAllTimers = () => {
      console.log('🧹 [CLEANUP] Clearing all timers...');
      globalTimers.isShuttingDown = true;
      
      let cleared = 0;
      globalTimers.intervals.forEach(id => {
        try {
          clearInterval(id);
          cleared++;
        } catch (e) {
          console.warn('Failed to clear interval:', id);
        }
      });
      
      globalTimers.timeouts.forEach(id => {
        try {
          clearTimeout(id);
          cleared++;
        } catch (e) {
          console.warn('Failed to clear timeout:', id);
        }
      });
      
      globalTimers.intervals.clear();
      globalTimers.timeouts.clear();
      
      console.log(`✅ [CLEANUP] Cleared ${cleared} timers`);
    };

    // Expose isShuttingDown flag for scripts to check
    (window as any).__isAutoShuttingDown = () => globalTimers.isShuttingDown;

    // Cleanup function when component unmounts
    return () => {
      console.log('🛑 [AutoSetup] Component unmounting, cleaning up...');
      (window as any).__cleanupAllTimers();
      
      // Restore original functions
      window.setInterval = originalSetInterval;
      window.setTimeout = originalSetTimeout;
      
      delete (window as any).__cleanupAllTimers;
      delete (window as any).__isAutoShuttingDown;
    };
  }, []);

  // Lightweight global notifications + LAZY-LOAD heavy modules
  useEffect(() => {
    // Expose only essential notification helpers immediately
    (window as any).thongbao = (msg: string) => notification.success({ message: msg });
    (window as any).canhbao = (msg: string) => notification.warning({ message: msg });
    
    // ✅ LAZY LOAD: Use Object.defineProperty with getters to avoid loading heavy modules upfront
    // React (500KB) - only loads when accessed
    Object.defineProperty(window, 'React', {
      get() { return React; },
      configurable: true,
      enumerable: false
    });
    
    // ReactDOM (300KB) - only loads when accessed
    Object.defineProperty(window, 'ReactDOM', {
      get() { return ReactDOM; },
      configurable: true,
      enumerable: false
    });
    
    // Ant Design components - only assembles when first accessed
    Object.defineProperty(window, 'antd', {
      get() {
        return {
          notification, Table, Tabs, Button, Input, Select, Card, Space, Popconfirm, CsmDynamicGrid,
          googleIndexUrl, checkGoogleIndexQuota, checkGoogleIndexStatus, getGoogleSearchConsoleSites, checkAndAutoPublish,
          addToQueue, addBatchToQueue, getQueueInfo, getQueueItems, processQueue, removeFromQueue, getUrlHistory, getRecentHistory,
        };
      },
      configurable: true,
      enumerable: false
    });
    
    // CSM API functions - lazy loaded
    Object.defineProperty(window, 'csmApi', {
      get() {
        return {
          getTableData, updateTableData, andWhere,
          googleIndexUrl, checkGoogleIndexQuota, checkGoogleIndexStatus, getGoogleSearchConsoleSites, checkAndAutoPublish,
          addToQueue, addBatchToQueue, getQueueInfo, getQueueItems, processQueue, removeFromQueue, getUrlHistory, getRecentHistory,
        };
      },
      configurable: true,
      enumerable: false
    });
    
    // I18nextProvider - lazy loaded
    Object.defineProperty(window, 'I18nextProvider', {
      get() { return I18nextProvider; },
      configurable: true,
      enumerable: false
    });
    
    // Crypto functions - lazy loaded
    Object.defineProperty(window, 'csmCrypto', {
      get() { return { encrypt: csmEncrypt, decrypt: csmDecrypt }; },
      configurable: true,
      enumerable: false
    });
    
    // AI functions - lazy loaded
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
    
    return () => {
      delete (window as any).thongbao;
      delete (window as any).canhbao;
      delete (window as any).React;
      delete (window as any).ReactDOM;
      delete (window as any).antd;
      delete (window as any).csmApi;
      delete (window as any).I18nextProvider;
      delete (window as any).csmCrypto;
      delete (window as any).csmAI;
    };
  }, [antdLocale, themeConfig]);

  // Fetch auto_code from sys_autos (p_type = 0) for user's app_id from login
  useEffect(() => {
    let cancelled = false;
    async function loadAutoCode() {
      try {
        // Lấy app_id từ thông tin user đã đăng nhập, không phải từ AppStore
        const userAppId = user.app_id || appId;
        
        const primaryWhere = andWhere([
          { field: "p_name", type: "eq", value: userAppId },
          { field: "p_type", type: "eq", value: 0 },
        ]);

        const sourceAppId = "csm"; // sys_autos is stored under app_id=csm

        let res = await getTableData<any>({
          app_id: sourceAppId,
          obj_name: "sys_autos",
          where: primaryWhere,
          take: 1,
        });
        let rows = (res as any)?.rows || (res as any)?.data || [];

        // Fallback: try without p_name in case records are shared
        if (!rows?.length) {
          const fallbackWhere = andWhere([
            { field: "p_type", type: "eq", value: 0 },
          ]);
          res = await getTableData<any>({ app_id: sourceAppId, obj_name: "sys_autos", where: fallbackWhere, take: 5 });
          rows = (res as any)?.rows || (res as any)?.data || [];
        }

        const picked = Array.isArray(rows)
          ? (rows.find((r: any) => r?.p_name === userAppId) || rows[0])
          : undefined;
        const pCode = picked?.p_code || "";
        const decrypted = pCode ? csmDecrypt(pCode) : "";

        if (!cancelled) {
          if (decrypted && decrypted.trim()) {
            setAutoCode(decrypted);
          } else {
            (window as any).canhbao?.("Không có auto_code để chạy");
            navigate(-1);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          const msg = err?.message || String(err);
          (window as any).canhbao?.(msg);
          navigate(-1);
        }
      }
    }
    loadAutoCode();
    return () => {
      cancelled = true;
    };
  }, [user.app_id, appId, navigate]);

  // ✅ OPTIMIZED: Memoize seft object with proper dependencies
  // Only re-create when appId changes (not user.app_token - use direct access instead)
  const seft = useMemo(() => {
    const userAddressRaw = localStorage.getItem("user_address");
    let userAddress: any = undefined;
    try { userAddress = userAddressRaw ? JSON.parse(userAddressRaw) : undefined; } catch {}

    return {
      // ✅ Get app_id directly from reactive value, not as dependency
      app_id: user.app_id || appId,
      Uinfos: {
        // ✅ Access app_token directly without capturing in closure
        appToken: user.app_token || "",
        userAddress: userAddress,
      },
      Base64: {
        encode: base64Encode,
        decode: base64Decode,
      },
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
      csm_encrypt: (code: string) => csmEncrypt(code),
      csm_decrypt: (code: string) => csmDecrypt(code),
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
        updateTableData<any>({
          app_id: params?.app_id || appId,
          obj_name: params?.obj_name,
          command: (params?.command as any) || "update",
          obj_update: params?.obj_update || params?.obj || {},
          pk_fields: params?.pk_fields,
        } as any)
          .then(res => fn?.(res))
          .catch(error => fn?.({ success: false, error: (error as any)?.message || error }));
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
            updateTableData<any>({
              app_id: params?.app_id || appId,
              obj_name: params?.obj_name,
              command: (params?.command as any) || "update",
              obj_update: params?.obj_update || params?.obj || {},
              pk_fields: params?.pk_fields,
            } as any)
              .then(res => callback(res))
              .catch(error => callback({ success: false, error: (error as any)?.message || error }));
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

        // Implementation matching your code sample
        self.csm_obj_tables({
          app_id: "csm",
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
          if (rs.rows.length > 0) {
            const uInfo = JSON.parse(JSON.stringify(rs.rows[0]));
            Object.assign(uInfo, userInfoUp);
            
            self.csm_obj_updates({
              app_id: "csm",
              obj_name: "csm_accounts",
              command: "update",
              obj_update: uInfo,
              e_where: {
                field: "app_token",
                type: "eq",
                value: app_token
              }
            }, function(msg) {
              delete uInfo["pass"];
              
              self.csm_savedb("csm_Token", uInfo, function() {
                // Also save user_address to localStorage for compatibility
                if (userInfoUp.user_address) {
                  localStorage.setItem("user_address", JSON.stringify(userInfoUp.user_address));
                }
                fn?.(msg);
              });
            });
          } else {
            fn?.({ status: false, error: "User not found" });
          }
        });
      },
    };
  }, [appId]);  // ✅ Only depend on appId, not user.app_token

  useEffect(() => {
    // Only execute when autoCode has been successfully loaded from API
    // undefined = still loading, string = loaded (either empty or with content)
    if (autoCode === undefined) {
      return; // Still fetching from API
    }
    
    // autoCode is now a string (could be empty if no code found, but that's handled in loadAutoCode)
    if (!autoCode || !autoCode.trim()) {
      return; // Empty code, nothing to execute
    }
    
    if (executedRef.current) {
      return; // Prevent double execution (e.g., React 18 dev double-invoke)
    }
    executedRef.current = true;
    try {
      // ✅ FIXED: Removed setMaxListeners(0) - was causing memory leaks!
      // Let Node.js track event listeners normally instead of disabling warnings
      
      const fn = new Function("seft", `try{\n${autoCode}\n} catch (sca_err) {console.error(sca_err); alert(sca_err);}`);
      // Defer execution to avoid blocking initial route render
      setTimeout(() => {
        try {
          fn(seft);
        } catch (err: any) {
          const msg = err?.message || String(err);
          (window as any).canhbao?.(msg);
        }
      }, 0);
    } catch (error: any) {
      const msg = error?.message || String(error);
      (window as any).canhbao?.(msg);
    }
  }, [autoCode, seft]);

  return (
    <div style={{ padding: 16 }}>
      <div id="context-auto" style={{ minHeight: 480, border: "1px dashed #ddd", borderRadius: 8, padding: 8 }} />
    </div>
  );
}
