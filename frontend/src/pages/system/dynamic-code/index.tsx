/**
 * Dynamic Code Menu Renderer
 * Loads and executes JavaScript code from sys_autos (p_type=0)
 * Similar to AutoSetup.tsx and home/index.tsx
 */

import { BasicContent } from "#src/components";
import { getTableData, andWhere } from "#src/components/csm-grid/CsmApi";
import * as CsmApi from "#src/components/csm-grid/CsmApi";
import { csmDecrypt } from "#src/components/csm-grid/CsmCrypto";
import { useAppStore } from "#src/store/app";
import { useUserStore } from "#src/store/user";
import { usePreferences } from "#src/hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation, useNavigate } from "react-router";
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { Spin, Empty, Alert } from "antd";

declare global {
  interface Window {
    csmApi?: Record<string, any>;
    csmCurrentUser?: any;
    csmTheme?: Record<string, any>;
  }
}

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

  // Expose theme preferences for dynamic code
  if (typeof window !== "undefined") {
    window.csmApi = {
      ...window.csmApi,
      ...CsmApi,
    };
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

        const response = await getTableData<any>({
          app_id: "csm",
          obj_name: "sys_autos",
          where,
          take: 1,
        });

        const rows = (response as any)?.rows || (response as any)?.data || [];
        const codeRecord = rows[0];

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
    return {
      appId: user.app_id || appId || "csm",
      menuId,
      user: window.csmCurrentUser || user,
      t,
      navigate,
      ...CsmApi,
    };
  }, [user, appId, menuId, t, navigate]);

  const executeCode = (code: string) => {
    try {
      const fn = new Function(
        "seft",
        `try{\n${code}\n} catch (sca_err) {console.error(sca_err); alert('Menu Error: ' + sca_err);}`
      );
      
      // Defer execution to avoid blocking initial route render
      setTimeout(() => {
        try {
          fn(seft);
        } catch (err: any) {
          const msg = err?.message || String(err);
          console.error("❌ [DynamicCodeMenu] Error executing code:", msg);
        }
      }, 0);
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
          id={containerId}
          className={containerClassName}
          style={{
            width: "100%",
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
    props?: Record<string, any>
  ) => {
    const container = document.getElementById("dynamic-code-root");
    if (!container) {
      console.error("Dynamic code root container not found");
      return null;
    }
    
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(Component, props));
    return root;
  },

  /**
   * Get container element for direct DOM manipulation
   */
  getContainer: (containerId: string = "dynamic-code-root") => document.getElementById(containerId),

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
