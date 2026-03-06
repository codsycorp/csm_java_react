/**
 * Broadcast & CRM Dashboard Page - CSM Admin Only
 * 
 * Page để CSM admin:
 * - Gửi thông báo broadcast đến users của các apps
 * - Quản lý CRM: khách hàng từ chat, website, quảng cáo
 * - Thống kê website: posts, views, Google bot visits
 * - Thống kê quảng cáo Facebook/Google
 * - Quản lý quảng cáo campaigns
 * - DYNAMIC CODE: Chạy auto_code từ sys_autos như AutoSetup.tsx
 * 
 * Hỗ trợ đa ngôn ngữ: vi-VN, en-US, zh-CN
 */

import { PageContainer } from '@ant-design/pro-components';
import { useTranslation } from 'react-i18next';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useAppStore } from '#src/store/app';
import { useUserStore } from '#src/store/user';
import { useNavigate, useLocation } from 'react-router';
import { getTableData, andWhere } from '#src/components/csm-grid/CsmApi';
import { usePreferences } from '#src/hooks';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { ANT_DESIGN_LOCALE } from '#src/locales';

// Import CRM API functions globally accessible to auto_code
import * as CsmApi from '#src/components/csm-grid/CsmApi';

// ✅ Expose CRM APIs globally for auto_code (similar to AutoSetup.tsx)
if (typeof window !== 'undefined') {
  window.csmApi = {
    ...window.csmApi,
    ...CsmApi, // Expose all CRM APIs
  };
}

export default function BroadcastPage() {
  const { t } = useTranslation();
  const location = useLocation() as any;
  const navigate = useNavigate();
  const executedRef = useRef(false);
  
  // auto_code will be fetched from backend sys_autos (p_type = 2 for broadcast)
  const [autoCode, setAutoCode] = useState<string | undefined>(undefined);
  const appId = useAppStore(state => state.currentAppId);
  const user = useUserStore();
  
  // Always sync window.csmCurrentUser from zustand store
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.csmCurrentUser = user;
    }
  }, [user]);
  
  const preferences = usePreferences();
  const { language, isDark, themeRadius, themeColorPrimary } = preferences;

  const antdLocale = useMemo(() => {
    const localeKey = (language as keyof typeof ANT_DESIGN_LOCALE) || 'en-US';
    return ANT_DESIGN_LOCALE[localeKey] || ANT_DESIGN_LOCALE['en-US'];
  }, [language]);
  const themeConfig = useMemo(() => {
    return {
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: themeColorPrimary,
        borderRadius: themeRadius,
      },
    };
  }, [isDark, themeRadius, themeColorPrimary]);

  const title = useMemo(() => {
    return location?.state?.menuLabel || t('system.broadcast.title');
  }, [t, location?.state?.menuLabel]);

  // ============================================
  // GLOBAL TIMER CLEANUP SYSTEM - Ngăn Memory Leak & Crash
  // ============================================
  useEffect(() => {
    const originalSetInterval = window.setInterval;
    const originalSetTimeout = window.setTimeout;
    const timerRegistry = {
      intervals: new Set<number>(),
      timeouts: new Set<number>(),
      isShuttingDown: false,
    };

    (window as any).setInterval = function(...args: any[]) {
      const id = originalSetInterval.apply(window, args as any);
      if (!timerRegistry.isShuttingDown) {
        timerRegistry.intervals.add(id as unknown as number);
      }
      return id;
    };

    (window as any).setTimeout = function(...args: any[]) {
      const id = originalSetTimeout.apply(window, args as any);
      const delay = typeof args[1] === 'number' ? args[1] : 0;
      if (!timerRegistry.isShuttingDown && delay > 10000) {
        timerRegistry.timeouts.add(id as unknown as number);
      }
      return id;
    };

    return () => {
      timerRegistry.isShuttingDown = true;
      timerRegistry.intervals.forEach((id) => {
        try {
          window.clearInterval(id);
        } catch {}
      });
      timerRegistry.timeouts.forEach((id) => {
        try {
          window.clearTimeout(id);
        } catch {}
      });
      timerRegistry.intervals.clear();
      timerRegistry.timeouts.clear();

      (window as any).setInterval = originalSetInterval;
      (window as any).setTimeout = originalSetTimeout;
    };
  }, []);

  // Fetch auto_code from sys_autos (p_type = 2 for broadcast page)
  useEffect(() => {
    if (executedRef.current) return;
    executedRef.current = true;

    const fetchAutoCode = async () => {
      try {
        // Query sys_autos for broadcast auto_code (p_type = 2)
        // IMPORTANT: read broadcast auto-code by key "broadcast_" + base app id
        const baseAppId = (user.app_id || "").trim() || appId || "csm";
        const broadcastAppId = `broadcast_${baseAppId}`;
        
        const conditions = [
          { field: "app_id", type: "eq", value: broadcastAppId },
          { field: "p_type", type: "eq", value: 2 }, // 2 = broadcast page auto_code
        ];
        
        const response = await getTableData<any>({
          app_id: baseAppId,
          obj_name: "sys_autos",
          take: 1,
          where: andWhere(conditions),
        });

        if (response?.data && response.data.length > 0) {
          const autoRecord = response.data[0];
          const code = autoRecord.auto_code || autoRecord.content || "";
          console.log("✅ [Broadcast] Loaded auto_code from sys_autos:", {
            appId: baseAppId,
            broadcastAppId,
            codeLength: code.length,
          });
          setAutoCode(code);
        } else {
          console.warn("⚠️ [Broadcast] No auto_code found in sys_autos for key:", broadcastAppId);
          // Set empty code to render default UI
          setAutoCode("");
        }
      } catch (error: any) {
        console.error("❌ [Broadcast] Error fetching auto_code:", error);
        setAutoCode(""); // Render default UI on error
      }
    };

    fetchAutoCode();
  }, [user.app_id, appId]);

  // Lightweight global notifications + LAZY-LOAD heavy modules
  useEffect(() => {
    // Similar to AutoSetup.tsx - load Ant Design components globally
    import('antd').then(antd => {
      if (typeof window !== 'undefined') {
        (window as any).antd = antd;
      }
    });
  }, []);

  // ✅ Memoize seft object with CRM APIs exposed
  const seft = useMemo(() => {
    return {
      appId: user.app_id || appId || "csm",
      user: window.csmCurrentUser || user,
      t,
      ...CsmApi, // Expose all CRM APIs
      navigate,
    };
  }, [appId, user, t, navigate]);

  // Execute auto_code when loaded
  useEffect(() => {
    if (autoCode === undefined) return; // Still loading
    if (!autoCode || autoCode.trim().length === 0) {
      console.log("ℹ️ [Broadcast] No auto_code - rendering default Broadcast UI");
      return;
    }

    try {
      console.log("🚀 [Broadcast] Executing auto_code...");
      const executeCode = new Function('seft', autoCode);
      executeCode(seft);
      console.log("✅ [Broadcast] Auto code executed successfully");
    } catch (error: any) {
      console.error("❌ [Broadcast] Error executing auto_code:", error);
    }
  }, [autoCode, seft]);

  return (
    <ConfigProvider locale={antdLocale} theme={themeConfig}>
      <PageContainer
        header={{
          title: '📢 ' + title,
          subTitle: t('system.broadcast.note_all_users'),
        }}
      >
        {/* Auto code will render custom UI here */}
        <div id="broadcast-auto-root" style={{ width: '100%', minHeight: '400px' }}>
          {autoCode === undefined ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p>Loading...</p>
            </div>
          ) : autoCode === "" ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p>{t('system.broadcast.no_auto_code', 'Chưa cấu hình auto_code cho trang này. Vui lòng thêm auto_code vào sys_autos với p_type=2.')}</p>
            </div>
          ) : null}
        </div>
      </PageContainer>
    </ConfigProvider>
  );
}
