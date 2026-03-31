import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '#src/store/app';
import { useUserStore } from '#src/store/user';

/**
 * Hook để quản lý số điện thoại của guest user và URL khởi tạo chat
 * - Lưu và lấy từ localStorage theo appId
 * - Chỉ áp dụng cho guest user (chưa đăng nhập)
 * - Lưu URL của trang nơi khách tạo chat lần đầu
 */
export const useGuestPhone = () => {
  const user = useUserStore();
  // CRITICAL: Subscribe to store changes to ensure appId updates when SSR data is synced
  // Use zustand selector to make this reactive
  const storeAppId = useAppStore((state) => state.currentAppId);
  
  // Priority: user.app_id (from login) > store.currentAppId (reactive from zustand) > fallback to "csm"
  const appId = useMemo(
    () => (user.app_id || "").trim() || storeAppId || "csm",
    [user.app_id, storeAppId]
  );
  const isGuest = !user.userId;
  const CLIENT_ID_COOKIE = "csm_client_id";
  const CLIENT_ID_STORAGE_KEY = "csm_client_id";
  const LEGACY_SHARED_GUEST_KEY = "csm_guest_session_shared";

  const readCookie = (name: string) => {
    if (typeof document === 'undefined') return "";
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  };

  const getCookieDomain = () => {
    if (typeof window === 'undefined') return "";
    const hostname = window.location.hostname.trim().toLowerCase();
    if (!hostname || hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return "";
    }
    const parts = hostname.split('.');
    if (parts.length < 2) return "";
    if (hostname.endsWith('.com.vn') && parts.length >= 3) {
      return `.${parts.slice(-3).join('.')}`;
    }
    return `.${parts.slice(-2).join('.')}`;
  };

  const writeClientCookie = (value: string) => {
    if (typeof document === 'undefined' || !value) return;
    const maxAge = 365 * 24 * 60 * 60;
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
    const domain = getCookieDomain();
    const domainPart = domain ? `; Domain=${domain}` : '';
    document.cookie = `${CLIENT_ID_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}${domainPart}`;
  };

  const persistSharedClientId = (value: string) => {
    if (!value) return "";
    try {
      localStorage.setItem(CLIENT_ID_STORAGE_KEY, value);
      localStorage.setItem(LEGACY_SHARED_GUEST_KEY, value);
      localStorage.setItem(`csm_guest_session_${appId}`, value);
    } catch {
      // ignore storage failures and still try cookie persistence
    }
    writeClientCookie(value);
    return value;
  };
  
  const getStoredPhone = () => {
    if (!isGuest) return "";
    try {
      return localStorage.getItem(`csm_guest_phone_${appId}`) || "";
    } catch {
      return "";
    }
  };

  const getStoredChatUrl = () => {
    if (!isGuest) return "";
    try {
      return localStorage.getItem(`csm_guest_chat_url_${appId}`) || "";
    } catch {
      return "";
    }
  };

  const createGuestSessionId = () => {
    const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    return `csm-${randomPart}`;
  };

  const getSharedClientId = () => {
    if (!isGuest) return "";
    const fromCookie = readCookie(CLIENT_ID_COOKIE);
    if (fromCookie) {
      return persistSharedClientId(fromCookie);
    }
    try {
      const fromStorage = localStorage.getItem(CLIENT_ID_STORAGE_KEY)
        || localStorage.getItem(LEGACY_SHARED_GUEST_KEY)
        || localStorage.getItem(`csm_guest_session_${appId}`)
        || "";
      if (fromStorage) {
        return persistSharedClientId(fromStorage);
      }
    } catch {
      // ignore and generate below
    }
    return persistSharedClientId(createGuestSessionId());
  };

  const getStoredGuestSessionId = () => {
    if (!isGuest) return "";
    try {
      const storageKey = `csm_guest_session_${appId}`;
      const existing = localStorage.getItem(storageKey) || "";
      const sharedClientId = getSharedClientId();
      if (existing && !sharedClientId) {
        return persistSharedClientId(existing);
      }
      if (sharedClientId) {
        if (existing !== sharedClientId) {
          localStorage.setItem(storageKey, sharedClientId);
        }
        return sharedClientId;
      }
      const created = persistSharedClientId(createGuestSessionId());
      localStorage.setItem(storageKey, created);
      return created;
    } catch {
      return getSharedClientId();
    }
  };
  
  const [guestPhone, setGuestPhoneState] = useState<string>(getStoredPhone());
  const [chatUrl, setChatUrlState] = useState<string>(getStoredChatUrl());
  const [guestSessionId, setGuestSessionIdState] = useState<string>(getStoredGuestSessionId());

  // Broadcast helper so all hook instances (floating chat + detail page) stay in sync
  const emitPhoneChange = (phone: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('csm-guest-phone-changed', { detail: { appId, phone } }));
  };

  const emitChatUrlChange = (url: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('csm-guest-chat-url-changed', { detail: { appId, url } }));
  };

  const emitGuestSessionChange = (guestSessionIdValue: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('csm-guest-session-changed', { detail: { appId, guestSessionId: guestSessionIdValue } }));
  };
  
  const setGuestPhone = (phone: string) => {
    if (!isGuest) return;
    try {
      localStorage.setItem(`csm_guest_phone_${appId}`, phone);
      setGuestPhoneState(phone);
      emitPhoneChange(phone);
    } catch (e) {
      console.warn('Cannot save guest phone to localStorage', e);
    }
  };

  /**
   * Lưu URL của trang khởi tạo chat lần đầu
   * Được gọi khi guest nhập phone lần đầu hoặc click floating-chat-btn lần đầu
   */
  const setChatUrl = (url: string) => {
    if (!isGuest) return;
    try {
      localStorage.setItem(`csm_guest_chat_url_${appId}`, url);
      setChatUrlState(url);
      emitChatUrlChange(url);
    } catch (e) {
      console.warn('Cannot save chat URL to localStorage', e);
    }
  };

  const ensureGuestSessionId = () => {
    if (!isGuest) return "";
    const current = getStoredGuestSessionId();
    if (current && current !== guestSessionId) {
      setGuestSessionIdState(current);
      emitGuestSessionChange(current);
    }
    return current;
  };

  /**
   * Lấy URL cần gửi khi chat
   * - Nếu chưa có URL lưu (lần đầu chat), trả về URL hiện tại
   * - Nếu có URL lưu, kiểm tra xem URL hiện tại có khác không
   * - Nếu khác, trả về URL mới; nếu giống, trả về ""
   */
  const getChatUrlToSend = () => {
    if (!isGuest) return "";
    const currentUrl = typeof window !== 'undefined' ? window.location.href : "";
    const storedUrl = chatUrl;
    
    if (!storedUrl) {
      // Lần đầu chat, gửi URL hiện tại
      return currentUrl;
    }
    
    if (currentUrl !== storedUrl) {
      // URL thay đổi, gửi URL mới
      return currentUrl;
    }
    
    // URL không thay đổi, không gửi
    return "";
  };
  
  const clearGuestPhone = () => {
    if (!isGuest) return;
    try {
      localStorage.removeItem(`csm_guest_phone_${appId}`);
      setGuestPhoneState("");
      emitPhoneChange("");
    } catch (e) {
      console.warn('Cannot clear guest phone from localStorage', e);
    }
  };

  const clearChatUrl = () => {
    if (!isGuest) return;
    try {
      localStorage.removeItem(`csm_guest_chat_url_${appId}`);
      setChatUrlState("");
      emitChatUrlChange("");
    } catch (e) {
      console.warn('Cannot clear chat URL from localStorage', e);
    }
  };
  
  // Reload từ localStorage khi appId thay đổi
  // Avoid wiping in-memory phone if storage is empty (prevents double prompt on first load)
  useEffect(() => {
    if (!isGuest) return;
    const storedPhone = getStoredPhone();
    const storedUrl = getStoredChatUrl();
    const storedGuestSessionId = getStoredGuestSessionId();

    if (storedPhone) {
      setGuestPhoneState(storedPhone);
    }
    if (storedUrl) {
      setChatUrlState(storedUrl);
    }
    if (storedGuestSessionId) {
      setGuestSessionIdState(storedGuestSessionId);
    }
  }, [appId, isGuest]);

  // Sync across components/tabs when any instance updates phone or chat URL
  useEffect(() => {
    if (!isGuest) return;

    const handlePhoneEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.appId === appId && typeof detail.phone === 'string') {
        setGuestPhoneState(detail.phone || "");
      }
    };

    const handleChatUrlEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.appId === appId && typeof detail.url === 'string') {
        setChatUrlState(detail.url || "");
      }
    };

    const handleGuestSessionEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.appId === appId && typeof detail.guestSessionId === 'string') {
        setGuestSessionIdState(detail.guestSessionId || "");
      }
    };

    const handleStorage = (evt: StorageEvent) => {
      if (evt.key === `csm_guest_phone_${appId}`) {
        setGuestPhoneState(evt.newValue || "");
      }
      if (evt.key === `csm_guest_chat_url_${appId}`) {
        setChatUrlState(evt.newValue || "");
      }
      if (evt.key === `csm_guest_session_${appId}`) {
        setGuestSessionIdState(evt.newValue || "");
      }
    };

    window.addEventListener('csm-guest-phone-changed', handlePhoneEvent as EventListener);
    window.addEventListener('csm-guest-chat-url-changed', handleChatUrlEvent as EventListener);
    window.addEventListener('csm-guest-session-changed', handleGuestSessionEvent as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('csm-guest-phone-changed', handlePhoneEvent as EventListener);
      window.removeEventListener('csm-guest-chat-url-changed', handleChatUrlEvent as EventListener);
      window.removeEventListener('csm-guest-session-changed', handleGuestSessionEvent as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, [appId, isGuest]);
  
  return {
    guestPhone,
    guestSessionId,
    ensureGuestSessionId,
    setGuestPhone,
    clearGuestPhone,
    isGuest,
    chatUrl,
    setChatUrl,
    clearChatUrl,
    getChatUrlToSend,
    appId, // Export appId để component dùng chung, tránh mismatch
  };
};
