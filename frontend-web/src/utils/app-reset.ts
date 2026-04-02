import { useAuthStore, usePermissionStore, usePreferencesStore, useTabsStore, useUserStore } from "#src/store";
import { clearGuestToken } from "#src/utils/guest-auth";
import { globalProgress } from "#src/utils/request/global-progress";
import { message } from "#src/utils/static-antd";
import i18n from "i18next";

/**
 * Clear all client-side caches and stores to a pristine state.
 * Preserves user's system preferences (language, theme, layout settings).
 */
export function clearAllClientState() {
  // Save current preferences before clearing
  let savedPreferences: any = null;
  try {
    const prefsState = usePreferencesStore.getState();
    savedPreferences = {
      language: prefsState.language,
      theme: prefsState.theme,
      colorBlindMode: prefsState.colorBlindMode,
      colorGrayMode: prefsState.colorGrayMode,
      themeRadius: prefsState.themeRadius,
      themeColorPrimary: prefsState.themeColorPrimary,
      builtinTheme: prefsState.builtinTheme,
      navigationStyle: prefsState.navigationStyle,
      sidebarWidth: prefsState.sidebarWidth,
      sideCollapseWidth: prefsState.sideCollapseWidth,
      tabbarStyleType: prefsState.tabbarStyleType,
      tabbarEnable: prefsState.tabbarEnable,
      tabbarShowIcon: prefsState.tabbarShowIcon,
      tabbarPersist: prefsState.tabbarPersist,
      tabbarDraggable: prefsState.tabbarDraggable,
      tabbarShowMore: prefsState.tabbarShowMore,
      tabbarShowMaximize: prefsState.tabbarShowMaximize,
      transitionProgress: prefsState.transitionProgress,
      transitionLoading: prefsState.transitionLoading,
      transitionEnable: prefsState.transitionEnable,
      transitionName: prefsState.transitionName,
    };
  } catch {}

  try {
    // Finish any global loading
    globalProgress.forceFinish();
  } catch {}

  // Reset zustand stores
  try { useAuthStore.getState().reset(); } catch {}
  try { useUserStore.getState().reset(); } catch {}
  try { usePermissionStore.getState().reset(); } catch {}
  try { useTabsStore.getState().resetTabs(); } catch {}

  // Clear persisted storage keys used by stores (except preferences which we'll restore)
  try { localStorage.removeItem("access-token"); } catch {}
  try { localStorage.removeItem("user-info"); } catch {}
  try { localStorage.removeItem("refreshToken"); } catch {} // For nwjs

  // Clear website/admin mode flag
  try { sessionStorage.removeItem("forceAdminMode"); } catch {}

  // Clear guest token if any
  try { clearGuestToken(); } catch {}

  // Restore system preferences after reset
  if (savedPreferences) {
    try {
      usePreferencesStore.getState().setPreferences(savedPreferences);
    } catch {}
  }
}

/**
 * Force logout user and hard reload to login page to prevent stuck states.
 */
export function forceLogoutAndReload(reason?: string) {
  try {
    console.warn("[Auth] Force reset due to:", reason || "unauthorized");
  } catch {}

  clearAllClientState();

  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const isWebsitePath = /^\/wu_/i.test(pathname) || pathname === "/";
  const isAdminPath = /^(\/home|\/system\b|\/personal-center\b|\/about\b)/.test(pathname);
  const isForcedAdmin = typeof window !== "undefined" && window.sessionStorage.getItem("forceAdminMode") === "true";
  const shouldRedirectToLogin = !isWebsitePath && (isForcedAdmin || isAdminPath);

  if (!shouldRedirectToLogin) {
    return;
  }

  // Check if already on login page to prevent infinite redirect loop
  const isAlreadyOnLogin = typeof window !== "undefined" && window.location.pathname.includes("/login");
  
  if (isAlreadyOnLogin) {
    // Already on login page, just show message and return
    try {
      message.warning({
        content: i18n.t("common.sessionExpired"),
        duration: 2,
      });
    } catch {}
    return;
  }

  // Show user-friendly notification in user's language
  try {
    message.warning({
      content: i18n.t("common.sessionExpired"),
      duration: 2,
    });
  } catch {}

  // Hard redirect to login to ensure a fresh app bootstrap
  // Use setTimeout to ensure message is displayed before redirect
  setTimeout(() => {
    try {
      const base = import.meta.env.BASE_URL || "/";
      // Preserve a safe redirect only when on admin routes
      const redirect = 
        typeof window !== "undefined" && /^(\/home|\/system\b|\/personal-center\b)/.test(window.location.pathname)
          ? "?redirect=admin" : "";
      window.location.replace(`${base}login${redirect}`);
    } catch {
      // Fallback to reload
      try { window.location.reload(); } catch {}
    }
  }, 1500); // Short delay to show message
}
