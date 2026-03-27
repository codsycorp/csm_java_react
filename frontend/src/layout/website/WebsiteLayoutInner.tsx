import MobileBottomNav from "./MobileBottomNav";
import React, { ReactNode, useState, useEffect, useRef, useMemo } from "react";
import { theme, ConfigProvider, Menu, Drawer, Space, Button, Modal, Input } from "antd";
import styles from "./websiteLayout.module.css";
import WebsiteFooter from "./WebsiteFooter";
import { useTranslation } from "react-i18next";
import { usePreferencesStore, useAuthStore } from "#src/store";
import { useUserStore } from "#src/store/user";
import WebsiteHeader from "./WebsiteHeader";
import { GlobalOutlined, LoginOutlined } from "@ant-design/icons";
import InternalChatBox from "#src/components/InternalChatBox";
import FloatingChatButton from "#src/components/FloatingChatButton";
import { useAppStore } from "#src/store/app";
import { useGuestPhone } from "#src/hooks/useGuestPhone";
import { Tooltip } from "antd";
import { useChatHistory } from "#src/contexts/ChatHistoryContext";


interface WebsiteLayoutProps {
  children: ReactNode;
  selectedKey?: string;
  menuItems?: Array<{
    key: string;
    label: React.ReactNode;
    path?: string;
    icon?: React.ReactNode;
    children?: Array<{ key: string; label: React.ReactNode; path?: string }>;
  }>;
  title?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

export default function WebsiteLayoutInner({ children, selectedKey, menuItems, title, breadcrumb }: WebsiteLayoutProps) {
  const AUTO_OPEN_COOLDOWN_MS = 30_000;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openMenuKeys, setOpenMenuKeys] = useState<string[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [inputPhone, setInputPhone] = useState(""); // Local state for phone input (not saved until confirmed)
  const { t, i18n } = useTranslation();
  
  // CRITICAL: Sync SSR app_id to store ASAP before any other logic
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).__INITIAL_REACT_DATA__?.app_id) {
      const ssrAppId = (window as any).__INITIAL_REACT_DATA__.app_id;
      const currentStoreAppId = useAppStore.getState().currentAppId;
      // Only set if different to avoid unnecessary updates
      if (ssrAppId !== currentStoreAppId && ssrAppId !== "csm") {
        useAppStore.getState().setCurrentAppId(ssrAppId);
      }
    }
  }, []);
  
  // CRITICAL: Get appId from useGuestPhone hook to ensure consistency
  // Hook already computes appId with same priority logic, so we use it directly
  const user = useUserStore();
  const { guestPhone, setGuestPhone, setChatUrl, getChatUrlToSend, appId, isGuest } = useGuestPhone();
  const { sendMessage, messages } = useChatHistory(); // Sử dụng context để gửi tin nhắn và lấy messages
  
  // Ref để lưu pending message (tin nhắn cần gửi sau khi có phone)
  const pendingMessageRef = useRef<string | null>(null);
  const autoOpenCooldownRef = useRef<Record<string, number>>({});

  // Helper function to check if current URL is already in chat history
  const hasCurrentUrlInMessages = React.useCallback((currentUrl: string, room: string): boolean => {
    const roomMessages = messages[room] || [];
    if (roomMessages.length === 0) return false;
    
    // Check if any message contains current URL
    return roomMessages.some((msg: any) => 
      msg.message && typeof msg.message === 'string' && msg.message.includes(currentUrl)
    );
  }, [messages]);

  // Lấy số điện thoại mới nhất từ localStorage TRƯỚC (đảm bảo luôn lấy giá trị mới nhất)
  const getEffectiveGuestPhone = React.useCallback(() => {
    // CRITICAL: Luôn check localStorage trước để lấy giá trị mới nhất
    // Điều này đảm bảo ngay cả khi state chưa kịp update, ta vẫn có phone
    // appId from hook closure ensures consistent localStorage key
    try {
      const stored = localStorage.getItem(`csm_guest_phone_${appId}`) || "";
      if (stored) {
        // Sync state nếu khác (không block, chỉ update background)
        if (stored !== guestPhone) {
          setGuestPhone(stored);
        }
        return stored;
      }
    } catch (e) {
      console.warn('Cannot read guest phone from localStorage', e);
    }
    // Fallback to state nếu localStorage không có
    return guestPhone?.trim() || "";
  }, [guestPhone, appId, setGuestPhone]);

  useEffect(() => {
    if (!isGuest) return;

    const handleAutoOpen = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const targetAppId = typeof detail.appId === 'string' ? detail.appId.trim() : '';
      if (targetAppId && targetAppId !== appId) return;

      const targetRoom = typeof detail.targetRoom === 'string' ? detail.targetRoom.trim() : '';
      const phone = getEffectiveGuestPhone();
      if (!phone) return;

      if (targetRoom && targetRoom !== appId && targetRoom !== phone) return;

      const roomKey = targetRoom || appId;
      const now = Date.now();
      const lastOpenedAt = autoOpenCooldownRef.current[roomKey] || 0;
      if (now - lastOpenedAt < AUTO_OPEN_COOLDOWN_MS) return;
      autoOpenCooldownRef.current[roomKey] = now;

      setShowNameInput(false);
      setChatOpen(true);
    };

    window.addEventListener('csm-chat-auto-open', handleAutoOpen as EventListener);
    return () => {
      window.removeEventListener('csm-chat-auto-open', handleAutoOpen as EventListener);
    };
  }, [isGuest, appId, getEffectiveGuestPhone]);

  
  // Get system preferences from admin store
  const { 
    themeColorPrimary, 
    theme: themeMode, 
    language,
    changeLanguage,
    changeSiteTheme 
  } = usePreferencesStore();
  
  const [isMobile, setIsMobile] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Auto theme based on time of day (only if user hasn't set preference)
  useEffect(() => {
    // Only apply auto theme if theme is 'auto' or not set
    if (themeMode === 'auto' || !themeMode) {
      const hour = new Date().getHours();
      // Dark mode: 18:00 (6 PM) to 6:00 (6 AM)
      // Light mode: 6:00 (6 AM) to 18:00 (6 PM)
      const shouldBeDark = hour >= 18 || hour < 6;
      const autoTheme = shouldBeDark ? 'dark' : 'light';
      
      // Apply auto theme
      changeSiteTheme(autoTheme);
    }
  }, [themeMode, changeSiteTheme]);

  useEffect(() => {
    setIsClient(true);
    
    const resizeHandler = () => setIsMobile(window.innerWidth <= 768);
    resizeHandler();
    window.addEventListener('resize', resizeHandler);
    
    return () => {
      window.removeEventListener('resize', resizeHandler);
    };
  }, []);

  // Apply system language setting
  useEffect(() => {
    if (language && i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  // Auto-skip phone input ONLY on initial load when phone was already saved
  useEffect(() => {
    if (guestPhone && guestPhone.trim()) {
      setShowNameInput(false);
    }
    // run once on mount; do NOT depend on guestPhone to avoid closing modal mid-typing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for phone saved event from other components (e.g., contact modal in service detail)
  useEffect(() => {
    const handlePhoneSaved = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.appId === appId && typeof detail.phone === 'string' && detail.phone.trim()) {
        // Phone was saved from another component, close the prompt
        setShowNameInput(false);
      }
    };

    window.addEventListener('csm-guest-phone-changed', handlePhoneSaved as EventListener);
    return () => {
      window.removeEventListener('csm-guest-phone-changed', handlePhoneSaved as EventListener);
    };
  }, [appId]);

  // Pre-fill input when modal opens with saved phone
  useEffect(() => {
    if (showNameInput) {
      setInputPhone(guestPhone || "");
    }
  }, [showNameInput, guestPhone]);

  // Hỗ trợ gửi tin nhắn kèm theo: openWebsiteChat(message)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).openWebsiteChat = (messageToSend?: string) => {
        // Lưu message nếu có
        if (messageToSend) {
          pendingMessageRef.current = messageToSend;
        }
        
        const phone = getEffectiveGuestPhone();
        const currentUrl = typeof window !== 'undefined' ? window.location.href : "";
        
        // Nếu đã có phone, mở chat và gửi tin nhắn luôn
        if (phone) {
          // Đã có phone rồi thì đóng prompt (tránh modal vẫn mở)
          setShowNameInput(false);
          // Kiểm tra xem có URL mới không
          const urlToSend = getChatUrlToSend();
          if (urlToSend) {
            setChatUrl(urlToSend);
          }
          
          setChatOpen(true);
          
          // 🔥 Nếu đã có URL mới và chưa gửi, tự động gửi link + phone ngay khi mở lại chat
          if (urlToSend && !hasCurrentUrlInMessages(urlToSend, phone)) {
            const template = t('website.services.detail.contact_message_text', 'Tôi quan tâm đến tin này: %link% - Số điện thoại của tôi: %phone%');
            const autoMessage = template
              .replace('%link%', urlToSend)
              .replace('%phone%', phone);
            console.log('📤 [Chat] Auto-send link on reopen:', urlToSend);
            sendMessage(phone, autoMessage, undefined);
          }
          
          // Gửi pending message nếu có
          // 🔴 CRITICAL: For guest, pass phone as room identifier, not appId
          if (pendingMessageRef.current) {
            setTimeout(() => {
              sendMessage(phone, pendingMessageRef.current!, undefined);
              pendingMessageRef.current = null;
            }, 500); // Delay để đảm bảo chat box đã mở
          }
        } else {
          // Chưa có phone, lưu URL hiện tại và mở modal nhập phone
          setChatUrl(currentUrl);
          setShowNameInput(true);
        }
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).openWebsiteChat;
      }
    };
  }, [getEffectiveGuestPhone, sendMessage, appId, getChatUrlToSend, setChatUrl, hasCurrentUrlInMessages, t]);

  // Calculate selected keys for menu (không tự động mở submenu)
  const getMenuKeys = () => {
    if (!selectedKey) return { selectedKeys: [] };
    
    // Find if selectedKey is a child of any menu item
    let parentKey: string | undefined;
    let childKey: string | undefined;
    
    menuItems?.forEach(item => {
      if (item.children) {
        const foundChild = item.children.find(child => child.key === selectedKey);
        if (foundChild) {
          parentKey = item.key;
          childKey = selectedKey;
        }
      }
    });
    
    // If we found a parent-child relationship, select both (nhưng không mở)
    if (parentKey && childKey) {
      return {
        selectedKeys: [childKey, parentKey], // Highlight cả child và parent
      };
    }
    
    // Otherwise, just select the current key
    return {
      selectedKeys: [selectedKey],
    };
  };

  const { selectedKeys } = getMenuKeys();

  // Theme configuration with system settings
  const themeConfig = {
    algorithm: themeMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: themeColorPrimary || '#1a365d',
      colorBgContainer: themeMode === 'dark' ? '#141414' : '#ffffff',
      colorBgLayout: themeMode === 'dark' ? '#000000' : '#f8f9fa',
      colorText: themeMode === 'dark' ? '#ffffff' : '#000000',
      colorTextSecondary: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.65)',
      borderRadius: 12,
      boxShadow: themeMode === 'dark' 
        ? '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)'
        : '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
    },
  };

  const menuItemsForMenu = menuItems?.map(item => ({
    key: item.key,
    icon: item.icon ? React.cloneElement(item.icon as React.ReactElement, { fill: "currentColor", color: "currentColor" }) : undefined,
    label: item.path ? (
      <a
        href={item.path}
        className={item.key === selectedKey ? `${styles.wuMenuLink} ${styles.wuMenuLinkActive}` : styles.wuMenuLink}
        style={{ cursor: 'pointer' }}
      >
        {item.label}
      </a>
    ) : item.label,
    children: item.children?.map(child => ({
      key: child.key,
      label: child.path ? (
        <a
          href={child.path}
          className={child.key === selectedKey ? `${styles.wuMenuLink} ${styles.wuMenuLinkActive}` : styles.wuMenuLink}
          style={{ cursor: 'pointer' }}
        >
          {child.label}
        </a>
      ) : child.label
    }))
  }));

  if (!isClient) {
    return (
      <div style={{ padding: '50px', textAlign: 'center' }}>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <ConfigProvider theme={themeConfig}>
      <div className={`${styles.websiteLayoutContainer} ${themeMode === 'dark' ? styles.darkTheme : styles.lightTheme}`}
           data-theme={themeMode}>
        {!isMobile && (
          <WebsiteHeader 
              isMobile={isMobile} 
              onMobileMenuClick={() => setDrawerOpen(true)}
            >
              {menuItems && (
                <Menu
                  mode="horizontal"
                  items={menuItemsForMenu}
                  selectedKeys={selectedKeys}
                  openKeys={openMenuKeys}
                  onOpenChange={setOpenMenuKeys}
                  disabledOverflow={true}
                  className={styles.wuMenu}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    flex: 1,
                    minWidth: 0,
                    justifyContent: 'center'
                  }}
                />
              )}
            </WebsiteHeader>
          )}

          {isMobile && (
            <Drawer
              title="Menu"
              placement="right"
              onClose={() => setDrawerOpen(false)}
              open={drawerOpen}
              className={styles.mobileDrawer}
            >
              {menuItems && (
                <Menu
                  mode="vertical"
                  items={menuItemsForMenu}
                  selectedKeys={selectedKeys}
                  openKeys={openMenuKeys}
                  onOpenChange={setOpenMenuKeys}
                  className={styles.wuMobileMenu}
                  onClick={() => setDrawerOpen(false)}
                />
              )}
              
              {/* Mobile settings section - removed language button for cleaner mobile menu */}
            </Drawer>
          )}

          <main className={styles.websiteMain}>
            {children}
          </main>

        <WebsiteFooter />
      </div>
      {isMobile && <MobileBottomNav selectedKey={drawerOpen ? 'preferences' : selectedKey} />}
      {/* Floating Chat Button */}
      <FloatingChatButton
        onClick={() => {
          const phone = getEffectiveGuestPhone();
          if (phone) {
            // 🔥 MỖI LẦN MỞ CHAT đều kiểm tra và gửi link nếu chưa có
            // Không chỉ lần đầu - mỗi lần click đều check URL hiện tại
            setShowNameInput(false);
            const currentUrl = typeof window !== 'undefined' ? window.location.href : "";
            
            // ✅ Kiểm tra xem URL hiện tại đã có trong lịch sử chat chưa
            // Nếu user chuyển sang trang mới → URL mới → tự động gửi
            if (!hasCurrentUrlInMessages(currentUrl, phone)) {
              console.log('📤 [Chat] Auto-sending contact message - URL not in history:', currentUrl);
              
              // Tự động gửi tin nhắn với URL hiện tại và số điện thoại
              const messageTemplate = t('website.services.detail.contact_message_text', 'Tôi quan tâm đến tin này: %link% - Số điện thoại của tôi: %phone%');
              const autoMessage = messageTemplate
                .replace('%link%', currentUrl)
                .replace('%phone%', phone);
              
              // Lưu URL vào chatUrl
              setChatUrl(currentUrl);
              
              // Gửi tin nhắn sau khi chat mở (delay để đảm bảo chat box đã render)
              setTimeout(() => {
                sendMessage(phone, autoMessage, undefined);
              }, 500);
            } else {
              console.log('✓ [Chat] URL already in messages, skipping auto-send:', currentUrl);
              
              // URL đã có trong lịch sử, chỉ cập nhật chatUrl nếu thay đổi
              const urlToSend = getChatUrlToSend();
              if (urlToSend) {
                setChatUrl(urlToSend);
              }
            }
            
            // Mở chat
            setChatOpen(true);
          } else {
            // Chưa có số điện thoại, hiển thị modal nhập phone
            setShowNameInput(true);
          }
        }}
        label={t('common.chat.title')}
        visible={!chatOpen}
      />
      <Modal
        title={t('common.chat.inputPhone')}
        open={showNameInput}
        onOk={() => {
          const phoneValue = inputPhone.trim();
          if (phoneValue) {
            // ✅ CRITICAL: Save phone to localStorage FIRST so sendMessage can access it immediately
            // setGuestPhone is async and might not be available when sendMessage runs
            localStorage.setItem(`csm_guest_phone_${appId}`, phoneValue);
            
            // Then update state (for consistency with UI)
            setGuestPhone(phoneValue);
            const currentUrl = typeof window !== 'undefined' ? window.location.href : "";
            setChatUrl(currentUrl);
            setShowNameInput(false);
            setChatOpen(true);
            
            console.log('🔵 [Chat Modal] Phone saved to localStorage:', phoneValue, 'Chat opened, sending auto-message...');
            
            // 🔥 Tự động gửi tin nhắn liên hệ kèm URL + số điện thoại
            // Gửi ngay lập tức - không dùng setTimeout để socket.emit chạy realtime
            const messageTemplate = t('website.services.detail.contact_message_text', 'Tôi quan tâm đến tin này: %link% - Số điện thoại của tôi: %phone%');
            const autoMessage = messageTemplate
              .replace('%link%', currentUrl)
              .replace('%phone%', phoneValue);
            
            console.log('📤 [Chat Modal] Calling sendMessage immediately for auto-send');
            // ⚠️ CRITICAL: Pass phoneValue as room parameter so sendMessage detects it's a guest
            // This bypasses relying on stale guestPhone state
            sendMessage(phoneValue, autoMessage, undefined);
          }
        }}
        onCancel={() => {
          setShowNameInput(false);
          setInputPhone(""); // Clear input on cancel
          pendingMessageRef.current = null;
        }}
        okText={t('common.chat.startChat')}
        cancelText={t('common.cancel')}
      >
        <Input
          placeholder={t('common.chat.inputPhonePlaceholder')}
          value={inputPhone}
          onChange={(e) => setInputPhone(e.target.value)}
          onPressEnter={() => {
            const phoneValue = inputPhone.trim();
            if (phoneValue) {
              // ✅ Save phone to localStorage + emit event to sync all components
              setGuestPhone(phoneValue);
              setChatUrl(typeof window !== 'undefined' ? window.location.href : "");
              setShowNameInput(false);
              setChatOpen(true);
            }
          }}
        />
      </Modal>
      {chatOpen && (
        <InternalChatBox
          visible={true}
          onClose={() => setChatOpen(false)}
        />
      )}
    </ConfigProvider>
  );
}