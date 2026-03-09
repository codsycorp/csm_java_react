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
import { generateSeoContent, csm_ai_generate_seo_content, generateSeoContentWithPrompt, formatSeoPrompt, PROMPT_GENERATE_POST } from "#src/api/ai";
import { useAppStore } from "#src/store/app";
import { useUserStore } from "#src/store/user";
import { usePreferences } from "#src/hooks";
import { request } from "#src/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation, I18nextProvider } from "react-i18next";
import { useParams, useLocation, useNavigate } from "react-router";
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { Spin, Empty, Alert, notification, Table, Tabs, Button, Input, Select, Card, Space, Popconfirm } from "antd";

const dynamicReactRoots = new Map<string, ReactDOM.Root>();

function sanitizeIdPart(value?: string): string {
  if (!value) return "default";
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

declare global {
  interface Window {
    csmApi?: Record<string, any>;
    csmCurrentUser?: any;
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

/**
 * Post to Facebook page with multiple images
 */
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

/**
 * Post to Facebook page with single image
 */
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

/**
 * Validate Facebook access token
 */
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

/**
 * Exchange short-lived Facebook token for long-lived token
 */
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

/**
 * Get Facebook pages for the user
 */
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
}: DynamicCodeMenuProps = {}) {
  const { menuId: paramMenuId } = useParams<{ menuId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const menuId = propMenuId || paramMenuId;
  const { i18n, t } = useTranslation();
  const user = useUserStore();
  const appId = useAppStore(state => state.currentAppId);
  const preferences = usePreferences();
  const { isDark, themeColorPrimary } = preferences;
  const executedRef = useRef(false);
  
  const [autoCode, setAutoCode] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scope default container ID by menu/template to avoid cross-menu collisions.
  const resolvedContainerId = useMemo(() => {
    if (containerId !== "dynamic-code-root") {
      return containerId;
    }
    const scopeSource = propAutoCodeName || menuId || "default";
    return `dynamic-code-root-${sanitizeIdPart(scopeSource)}`;
  }, [containerId, propAutoCodeName, menuId]);

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

  // Initialize window.csmUserData for auto-upload-lmkt.js compatibility
  // This matches the original AutoSetup.tsx implementation
  if (typeof window !== "undefined" && !(window as any).csmUserData) {
    (window as any).csmUserData = {
        /**
         * Get user_address from window.csmCurrentUser
         */
        get: function(): any[] {
          try {
            const currentUser = (window as any).csmCurrentUser || {};
            let arr = [];
            if (typeof currentUser.user_address === "string") {
              try { arr = JSON.parse(currentUser.user_address); } catch { arr = []; }
            } else if (Array.isArray(currentUser.user_address)) {
              arr = currentUser.user_address;
            }
            if (!Array.isArray(arr)) arr = [];
            return arr;
          } catch {}
          return [];
        },

        /**
         * Fetch user_address from csm_accounts database
         */
        fetchFromDatabase: async function(callback?: (success: boolean, data?: any[], error?: string) => void): Promise<void> {
          try {
            const currentUser = (window as any).csmCurrentUser || {};
            let pkField = currentUser.email ? "email" : (currentUser.username ? "username" : "phoneNumber");
            let pkValue = currentUser.email || currentUser.username || currentUser.phoneNumber;
            
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

              const rows = (response as any)?.rows || (response as any)?.data || [];
              if (rows.length > 0) {
                const userData = rows[0];
                let userAddress = [];
                
                if (typeof userData.user_address === "string") {
                  try { userAddress = JSON.parse(userData.user_address); } catch { userAddress = []; }
                } else if (Array.isArray(userData.user_address)) {
                  userAddress = userData.user_address;
                }
                
                // Update window.csmCurrentUser
                if ((window as any).csmCurrentUser) {
                  (window as any).csmCurrentUser.user_address = Array.isArray(userAddress) ? JSON.stringify(userAddress) : userAddress;
                }
                
                // Update localStorage
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
              callback(false, [], error?.message || String(error));
            }
          }
        },

        /**
         * Set user_address and update to csm_accounts database
         */
        set: async function(newUserData: any[], callback?: (success: boolean, error?: string) => void): Promise<void> {
          try {
            console.log("Dữ liệu user_address đưa vào là:", newUserData);
            let arr = Array.isArray(newUserData) ? newUserData : [];
            (window as any).csmCurrentUser = (window as any).csmCurrentUser || {};
            (window as any).csmCurrentUser.user_address = JSON.stringify(arr);
            const currentUser = (window as any).csmCurrentUser;
            let pkField = currentUser.email ? "email" : (currentUser.username ? "username" : "phoneNumber");
            let pkValue = currentUser.email || currentUser.username || currentUser.phoneNumber;
            if (!pkValue) {
              if (typeof callback === "function") callback(false, "No user info");
              return;
            }
            
            // Prepare update data
            const updateData: any = {
              [pkField]: pkValue
            };
            if (Array.isArray(arr) && arr.length > 0) {
              updateData.user_address = JSON.stringify(arr);
            } else {
              updateData.user_address = null;
            }
            
            if (window.csmApi && (window.csmApi as any).updateTableData) {
              const response = await (window.csmApi as any).updateTableData({
                app_id: "csm",
                obj_name: "csm_accounts",
                command: "update",
                obj_update: updateData,
                pk_fields: [pkField],
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

      console.log('✅ [DynamicCode] window.csmUserData initialized (from AutoSetup.tsx pattern)');
    }

  // Sync current user to window
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.csmCurrentUser = JSON.parse(JSON.stringify(user));
    }
  }, [user]);

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
    }
  }, [isDark, themeColorPrimary]);

  // ============================================
  // GLOBAL WINDOW OBJECTS - Lazy Loading for Auto Code
  // ============================================
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.csmDynamicCodeContainerId = resolvedContainerId;
    }

    return () => {
      if (typeof window !== "undefined" && window.csmDynamicCodeContainerId === resolvedContainerId) {
        delete window.csmDynamicCodeContainerId;
      }
    };
  }, [resolvedContainerId]);

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
      delete (window as any).I18nextProvider;
      delete (window as any).csmCrypto;
      delete (window as any).csmAI;
    };
  }, []);

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

    // Override setTimeout to auto-register (only for long-running ones > 10s)
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
      console.log('🛑 [DynamicCodeMenu] Component unmounting, cleaning up...');
      (window as any).__cleanupAllTimers();
      
      // Restore original functions
      window.setInterval = originalSetInterval;
      window.setTimeout = originalSetTimeout;
      
      delete (window as any).__cleanupAllTimers;
      delete (window as any).__isAutoShuttingDown;
    };
  }, []);


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

        // Load the code template from sys_autos
        const where = andWhere([
          { field: "p_name", type: "eq", value: autoCodeName },
          { field: "p_type", type: "eq", value: 0 },
        ]);

        let response = await getTableData<any>({
          app_id: "csm",
          obj_name: "sys_autos",
          where,
          take: 1,
        });

        let rows = (response as any)?.rows || (response as any)?.data || [];

        // Backward-compatible fallback from old AutoSetup:
        // if exact p_name is missing, fetch shared p_type=0 templates.
        if (!Array.isArray(rows) || rows.length === 0) {
          const fallbackWhere = andWhere([
            { field: "p_type", type: "eq", value: 0 },
          ]);

          response = await getTableData<any>({
            app_id: "csm",
            obj_name: "sys_autos",
            where: fallbackWhere,
            take: 5,
          });

          rows = (response as any)?.rows || (response as any)?.data || [];
        }

        const codeRecord = Array.isArray(rows)
          ? (rows.find((r: any) => r?.p_name === autoCodeName) || rows[0])
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
    
    return {
      // App and user info
      app_id: user.app_id || appId,
      appId: user.app_id || appId || "csm",
      menuId,
      containerId: resolvedContainerId,
      getContainer: () => document.getElementById(resolvedContainerId),
      user: window.csmCurrentUser || user,
      t,
      navigate,
      
      Uinfos: {
        appToken: user.app_token || "",
        userAddress: userAddress,
      },
      
      // Base64 utilities
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
            app_id: "csm",
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

  const executeCode = (code: string) => {
    try {
      const fn = new Function(
        "seft",
        `try{\n${code}\n} catch (sca_err) {console.error(sca_err); alert('Menu Error: ' + sca_err);}`
      );
      
      // Wait for dynamic container to be rendered before executing code
      const waitForDynamicRoot = (attempt = 0) => {
        const dynamicRoot = document.getElementById(resolvedContainerId);
        
        if (dynamicRoot) {
          // Container exists, execute code
          try {
            fn(seft);
            console.log('✅ [DynamicCodeMenu] Code executed successfully after DOM ready');
          } catch (err: any) {
            const msg = err?.message || String(err);
            console.error("❌ [DynamicCodeMenu] Error executing code:", msg);
          }
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

  return (
    <BasicContent key={i18n.language}>
      <div style={{ padding: rootPadding }}>
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
            minHeight: 400,
            ...(loading ? { display: "none" } : {})
          }}
        />

        {resolvedContainerId !== "context-auto" && (
          <div
            id="context-auto"
            className={containerClassName}
            style={{
              width: "100%",
              minHeight: 400,
              ...(loading ? { display: "none" } : {})
            }}
          />
        )}
        
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
