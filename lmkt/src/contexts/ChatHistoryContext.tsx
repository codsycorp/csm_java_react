/**
 * ChatHistoryContext - Quản lý lịch sử chat toàn cục cho cả website và admin
 * 
 * Tính năng:
 * - Đồng bộ chat giữa website (guest) và admin
 * - Lưu và load lịch sử chat từ server + localStorage
 * - Realtime updates qua Socket.IO
 * - Hỗ trợ offline: lưu localStorage, đồng bộ khi online lại
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSocket } from '#src/hooks/useSocket';
import { useUserStore } from '#src/store/user';
import { useAppStore } from '#src/store/app';
import { useGuestPhone } from '#src/hooks/useGuestPhone';
import type { ChatMessage } from '#src/model/ChatMessage';

interface ChatHistoryContextValue {
  // Lịch sử chat theo room/guest
  messages: Record<string, ChatMessage[]>; // key: room hoặc guestPhone
  
  // Actions
  sendMessage: (room: string, message: string, to?: string) => void;
  loadHistory: (room: string, guestPhone?: string) => Promise<void>;
  markAsRead: (room: string) => void;
  registerGuestPhone: (phone: string) => Promise<void>;
  
  // Unread counts
  unreadCounts: Record<string, number>;
  
  // Typing indicators
  typingUsers: Record<string, string[]>; // room => [list of typing users]
  
  // Connection status
  connected: boolean;
  
  // Active chats
  activeChats: string[]; // list of room/guestPhone đang mở
  openChat: (room: string) => void;
  closeChat: (room: string) => void;
}

const ChatHistoryContext = createContext<ChatHistoryContextValue | null>(null);

export const useChatHistory = () => {
  const context = useContext(ChatHistoryContext);
  if (!context) {
    throw new Error('useChatHistory must be used within ChatHistoryProvider');
  }
  return context;
};

interface ChatHistoryProviderProps {
  children: React.ReactNode;
}

export const ChatHistoryProvider: React.FC<ChatHistoryProviderProps> = ({ children }) => {
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
  const [activeChats, setActiveChats] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const isInitializingRef = useRef(false);
  
  const { socket, connected } = useSocket();
  const user = useUserStore();
  // CRITICAL: Use same pattern as permission.ts for getting effective appId
  // Priority: user.app_id (from login) > store.currentAppId (from AppStore) > fallback to "csm"
  const appId = useMemo(
    () => (user.app_id || "").trim() || useAppStore.getState().getCurrentAppId() || "csm",
    [user.app_id]
  );
  const { guestPhone, guestSessionId, ensureGuestSessionId, isGuest } = useGuestPhone();
  
  // Debug logging for appId
  useEffect(() => {
    console.log(`🔍 [ChatHistory] AppId resolved:`, {
      fromUser: user.app_id,
      fromStore: useAppStore.getState().currentAppId,
      final: appId,
      isGuest
    });
  }, [appId, user.app_id, isGuest]);
  
  // Ref để tránh re-render khi socket listeners change
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  
  // Ref to track loadHistory callback to avoid circular dependency
  const loadHistoryRef = useRef<typeof loadHistory | null>(null);

  const emitAutoOpenChat = useCallback((detail: {
    targetRoom: string;
    appId: string;
    username?: string;
    guestPhone?: string;
    guestSessionId?: string;
    eventType?: string;
    isAdmin?: boolean;
    eventTimestamp?: number;
    source: 'message' | 'notification';
  }) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('csm-chat-auto-open', { detail }));
  }, []);
  
  const guestIdentity = useMemo(
    () => (guestSessionId || "").trim(),
    [guestSessionId]
  );
  const WELCOME_CLIENT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  const WELCOME_EVENT_TYPES = useMemo(
    () => new Set(['ai_auto_welcome', 'ai_auto_welcome_fallback']),
    []
  );

  const resolveUiLocale = useCallback(() => {
    if (typeof window === 'undefined') {
      return 'vi-VN';
    }
    const fromDoc = (document?.documentElement?.lang || '').trim();
    if (fromDoc) {
      return fromDoc;
    }
    const fromStorage = (localStorage.getItem('language') || localStorage.getItem('i18nextLng') || '').trim();
    if (fromStorage) {
      return fromStorage;
    }
    return 'vi-VN';
  }, []);

  const getWelcomeDedupStorageKey = useCallback((identity?: string) => {
    const stableIdentity = (identity || guestIdentity || '').trim();
    if (!stableIdentity) {
      return '';
    }
    return `csm_welcome_seen_${appId}_${stableIdentity}`;
  }, [appId, guestIdentity]);

  const hasRecentWelcomeInClient = useCallback((identity?: string, incomingTs?: number) => {
    if (!isGuest || typeof window === 'undefined') {
      return false;
    }

    const key = getWelcomeDedupStorageKey(identity);
    if (!key) {
      return false;
    }

    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return false;
      }

      const lastTs = Number(raw);
      if (!Number.isFinite(lastTs) || lastTs <= 0) {
        localStorage.removeItem(key);
        return false;
      }

      const incoming = Number(incomingTs || Date.now());
      return incoming - lastTs < WELCOME_CLIENT_COOLDOWN_MS;
    } catch {
      return false;
    }
  }, [isGuest, getWelcomeDedupStorageKey]);

  const markWelcomeSeenInClient = useCallback((identity?: string, incomingTs?: number) => {
    if (!isGuest || typeof window === 'undefined') {
      return;
    }

    const key = getWelcomeDedupStorageKey(identity);
    if (!key) {
      return;
    }

    try {
      localStorage.setItem(key, String(Number(incomingTs || Date.now())));
    } catch {
      // ignore storage failures
    }
  }, [isGuest, getWelcomeDedupStorageKey]);

  const collapseWelcomeDuplicates = useCallback((input: ChatMessage[]) => {
    if (!Array.isArray(input) || input.length <= 1) {
      return input;
    }

    let latestWelcome: ChatMessage | null = null;
    const nonWelcome: ChatMessage[] = [];

    input.forEach((msg) => {
      const eventType = (msg?.eventType || '').trim();
      if (!WELCOME_EVENT_TYPES.has(eventType)) {
        nonWelcome.push(msg);
        return;
      }

      if (!latestWelcome || (msg?.timestamp || 0) >= (latestWelcome.timestamp || 0)) {
        latestWelcome = msg;
      }
    });

    const merged = latestWelcome ? [...nonWelcome, latestWelcome] : nonWelcome;
    return merged.sort((a, b) => (a?.timestamp || 0) - (b?.timestamp || 0));
  }, [WELCOME_EVENT_TYPES]);

  // Helper: Get localStorage key
  const getStorageKey = useCallback((room: string) => {
    return `chat_history_${room}_${isGuest ? guestIdentity : user.userId || 'admin'}`;
  }, [isGuest, guestIdentity, user.userId]);
  
  // Helper: Save to localStorage (only for guest)
  const saveToLocalStorage = useCallback((room: string, msgs: ChatMessage[]) => {
    // Only save for guest, not for admin
    if (!isGuest) return;
    
    try {
      const key = getStorageKey(room);
      localStorage.setItem(key, JSON.stringify(msgs.slice(-100))); // Keep last 100
    } catch (error) {
      console.warn('Failed to save chat to localStorage:', error);
    }
  }, [getStorageKey, isGuest]);
  
  // Helper: Load from localStorage
  const loadFromLocalStorage = useCallback((room: string): ChatMessage[] => {
    try {
      const key = getStorageKey(room);
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.warn('Failed to load chat from localStorage:', error);
      return [];
    }
  }, [getStorageKey]);
  
  // Load history from server
  const loadHistory = useCallback(async (room: string, guestIdentityOverride?: string) => {
    // ONLY guest loads from localStorage for offline support
    // Admin ALWAYS loads fresh from server for real-time data
    if (isGuest) {
      const localMessages = loadFromLocalStorage(room);
      if (localMessages.length > 0) {
        const normalizedLocalMessages = collapseWelcomeDuplicates(localMessages);
        console.log(`💾 [ChatHistory] Guest restored ${normalizedLocalMessages.length} messages from localStorage for room: ${room}`);
        setMessages(prev => ({ ...prev, [room]: normalizedLocalMessages }));
      }
    }

    if (!connected || !socket) {
      return;
    }
    
    // LMKT: Only guest mode - load chat history for guest
    try {
      // In lmkt, only guest mode exists - always use loadGuestChatHistory
      const phone = guestIdentityOverride || guestIdentity || ensureGuestSessionId();
      
      if (!phone) {
        console.log('📥 [ChatHistory] Guest phone not available yet, skipping history load');
        return;
      }
      
      const history = await (window as any).loadGuestChatHistory?.(appId, phone, 100, guestPhone) || [];
      if (history && Array.isArray(history) && history.length > 0) {
        const normalizedHistory = collapseWelcomeDuplicates(history);
        console.log(`📥 [ChatHistory] Loaded ${normalizedHistory.length} messages from server for guest ${phone}`);
        setMessages(prev => ({ ...prev, [room]: normalizedHistory }));
        saveToLocalStorage(room, normalizedHistory);
      }
    } catch (error) {
      console.warn('Failed to load chat history from server:', error);
    }
  }, [isGuest, guestIdentity, ensureGuestSessionId, guestPhone, appId, loadFromLocalStorage, saveToLocalStorage, connected, socket, collapseWelcomeDuplicates]);
  
  // Update loadHistory ref whenever it changes (for initialization to use latest)
  useEffect(() => {
    loadHistoryRef.current = loadHistory;
  }, [loadHistory]);

  const registerGuestPhone = useCallback(async (phone: string): Promise<void> => {
    if (!phone || !socket || !connected || !isGuest) return;
    const currentIdentity = (guestIdentity || ensureGuestSessionId() || '').trim();
    if (!currentIdentity || currentIdentity === phone) return;

    return new Promise<void>((resolve) => {
      socket.emit(
        'register_guest_phone',
        { appId, guestSessionId: currentIdentity, phone },
        (ack: any) => {
          try {
            const result = typeof ack === 'string' ? JSON.parse(ack) : ack;
            if (result?.success) {
              console.log(`📱 [LMKT ChatHistory] Guest phone registered: ${currentIdentity} → ${phone}, rebound=${result.rebound}`);
              loadHistoryRef.current?.(phone, phone).catch(console.warn);
            }
          } catch (e) {
            console.warn('[LMKT ChatHistory] register_guest_phone ack parse error', e);
          }
          resolve();
        }
      );
    });
  }, [socket, connected, isGuest, guestIdentity, ensureGuestSessionId, appId]);

  useEffect(() => {
    if (!isGuest) return;
    const handlePhoneChanged = (e: Event) => {
      const phone = (e as CustomEvent<string>).detail;
      if (phone) registerGuestPhone(phone).catch(console.warn);
    };
    window.addEventListener('csm-guest-phone-changed', handlePhoneChanged);
    return () => window.removeEventListener('csm-guest-phone-changed', handlePhoneChanged);
  }, [isGuest, registerGuestPhone]);
  
  // Send message - LMKT: Guest only
  const sendMessage = useCallback((room: string, message: string, to?: string) => {
    if (!socket || !message.trim()) return;
    
    // ⚠️ CRITICAL: For guest, extract phone from room parameter if provided (stale state workaround)
    // This handles case where setGuestPhone is async and state not ready yet
    let effectiveIdentity = guestIdentity || ensureGuestSessionId();
    
    if (room && room !== appId && !room.includes(':')) {
      effectiveIdentity = room;
    } else if (!effectiveIdentity && typeof window !== 'undefined') {
      const stored = localStorage.getItem(`csm_guest_session_${appId}`);
      if (stored) {
        effectiveIdentity = stored;
        console.log(`📱 [ChatHistory] Using stored guest identity from localStorage: ${effectiveIdentity}`);
      }
    }
    
    if (!effectiveIdentity) {
      console.warn('❌ [ChatHistory] No guest identity available for sending message');
      return;
    }
    
    // Guest always uses their private guest room
    const actualRoom = `guest:${appId};${effectiveIdentity}`;
    
    const msg: ChatMessage = {
      room: actualRoom,
      username: guestPhone || 'Guest',
      userId: undefined,
      avatar: undefined,
      isAdmin: false,
      message: message.trim(),
      eventType: undefined,
      readBy: [],
      appId,
      to,
      guestPhone: guestPhone || undefined,
      guestSessionId: effectiveIdentity,
      locale: resolveUiLocale(),
      timestamp: Date.now(),
    };
    
    // Add to local state - use UI room for grouping
    setMessages(prev => {
      const roomMessages = prev[room] || [];
      const updated = [...roomMessages, msg];
      saveToLocalStorage(room, updated);
      return { ...prev, [room]: updated };
    });
    
    // Send via socket
    socket.emit("chat", msg);
    
    console.log(`📤 [ChatHistory] Guest sent message:`, {
      guestPhone,
      guestSessionId: effectiveIdentity,
      appId,
      actualRoom,
      uiRoom: room,
      message: msg.message.substring(0, 50)
    });
  }, [socket, guestIdentity, ensureGuestSessionId, guestPhone, appId, saveToLocalStorage, resolveUiLocale]);
  
  // Mark as read - LMKT: Guest only
  const markAsRead = useCallback((room: string) => {
    if (!socket || !connected || !guestIdentity) return;
    
    // LMKT: Only guest mode
    (window as any).markGuestMessagesAsRead?.(appId, guestIdentity).catch((err: any) => {
      console.warn("Failed to mark guest messages as read", err);
    });
    
    // Clear unread count and save to localStorage
    setUnreadCounts(prev => {
      const updated = { ...prev, [room]: 0 };
      try {
        localStorage.setItem(`chat_unread_${appId}`, JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save unread counts:', e);
      }
      return updated;
    });
  }, [socket, connected, guestIdentity, appId]);
  
  // Open/close chat
  const openChat = useCallback((room: string) => {
    setActiveChats(prev => [...new Set([...prev, room])]);
    if (connected && socket) {
      loadHistory(room);
    }
  }, [loadHistory, connected, socket]);
  
  const closeChat = useCallback((room: string) => {
    setActiveChats(prev => prev.filter(r => r !== room));
  }, []);
  
  // Clear messages when appId changes
  useEffect(() => {
    console.log(`🔄 [ChatHistory] AppId changed to: ${appId}, clearing old messages`);
    setMessages({});
    setUnreadCounts({});
    setIsInitialized(false);
  }, [appId]);
  
  // Join room on connect - LMKT: Guest only
  useEffect(() => {
    if (socket && connected && guestIdentity) {
      const joinData: ChatMessage = {
        room: appId, // Backend will create guest:appId:phone room
        username: guestPhone || guestIdentity,
        userId: undefined,
        avatar: undefined,
        isAdmin: false,
        message: "",
        eventType: undefined,
        readBy: [],
        appId,
        guestPhone,
        guestSessionId: guestIdentity,
        locale: resolveUiLocale(),
      };
      socket.emit("join", joinData);
      
      console.log(`🔌 [ChatHistory] Guest joined:`, {
        appId,
        guestPhone,
        guestSessionId: guestIdentity,
        room: `guest:${appId};${guestIdentity}`
      });
    }
  }, [socket, connected, appId, guestPhone, guestIdentity, resolveUiLocale]);
  
  // Listen for messages
  useEffect(() => {
    if (!socket) return;
    
    const handleMessage = (msg: ChatMessage) => {
      // LMKT: Guest only - only accept messages for this guest
      if (!guestIdentity) return;
      
      // Only accept messages for this guest
      if (msg.to !== guestIdentity && msg.guestSessionId !== guestIdentity && msg.guestPhone !== guestPhone) {
        return;
      }
      
      // Only accept messages from current appId
      if (msg.appId !== appId) {
        console.log(`🚫 [ChatHistory] Rejected message from different appId: ${msg.appId} (current: ${appId})`);
        return;
      }
      
      // Use guest identity as target room key so UI room mapping is consistent.
      const targetRoom = guestIdentity || appId;
      
      setMessages(prev => {
        const roomMessages = prev[targetRoom] || [];
        const incomingEventType = (msg.eventType || '').trim();
        const isWelcomeEvent = WELCOME_EVENT_TYPES.has(incomingEventType);

        if (isWelcomeEvent) {
          const dedupeIdentity = (msg.guestSessionId || guestIdentity || '').trim();
          if (hasRecentWelcomeInClient(dedupeIdentity, msg.timestamp)) {
            return prev;
          }
          markWelcomeSeenInClient(dedupeIdentity, msg.timestamp);
        }

        const normalizedRoomMessages = isWelcomeEvent
          ? roomMessages.filter(m => !WELCOME_EVENT_TYPES.has((m.eventType || '').trim()))
          : roomMessages;
        
        // Check duplicate
        const isDuplicate = normalizedRoomMessages.some(m =>
          m.message === msg.message &&
          m.username === msg.username &&
          Math.abs((m.timestamp || 0) - (msg.timestamp || 0)) < 1000
        );
        
        if (isDuplicate) return prev;
        
        const updated = [...normalizedRoomMessages, msg];
        saveToLocalStorage(targetRoom, updated);

        const isOwnMessage = !msg.isAdmin && !msg.userId && (msg.guestSessionId === guestIdentity || msg.guestPhone === guestPhone);
        if (!activeChats.includes(targetRoom) && !isOwnMessage) {
          emitAutoOpenChat({
            targetRoom,
            appId,
            username: msg.username,
            guestPhone: msg.guestPhone,
            guestSessionId: msg.guestSessionId,
            eventType: msg.eventType,
            isAdmin: !!msg.isAdmin,
            eventTimestamp: msg.timestamp,
            source: 'message',
          });
        }
        
        // Update unread count if chat not active (messages from admin)
        if (!activeChats.includes(targetRoom) && msg.guestSessionId !== guestIdentity) {
          setUnreadCounts(prevCounts => {
            const updated = {
              ...prevCounts,
              [targetRoom]: (prevCounts[targetRoom] || 0) + 1
            };
            try {
              localStorage.setItem(`chat_unread_${appId}`, JSON.stringify(updated));
            } catch (e) {
              console.warn('Failed to save unread counts:', e);
            }
            return updated;
          });
        }
        
        return { ...prev, [targetRoom]: updated };
      });
    };
    
    socket.on("message", handleMessage);
    
    // Listen for broadcast notifications from CSM admin
    const handleNotification = (msg: ChatMessage) => {
      console.log('📢 LMKT received broadcast notification:', msg);
      
      // Only show if message belongs to current app
      if (msg.appId !== appId) {
        console.log(`🚫 Rejected notification from different appId: ${msg.appId} (current: ${appId})`);
        return;
      }
      
      // Show notification in app room
      const targetRoom = appId;
      
      setMessages(prev => {
        const roomMessages = prev[targetRoom] || [];
        
        // Check duplicate
        const isDuplicate = roomMessages.some(m =>
          m.message === msg.message &&
          m.username === msg.username &&
          Math.abs((m.timestamp || 0) - (m.timestamp || 0)) < 1000
        );
        
        if (isDuplicate) return prev;
        
        const updated = [...roomMessages, msg];
        saveToLocalStorage(targetRoom, updated);

        if (!activeChats.includes(targetRoom)) {
          emitAutoOpenChat({
            targetRoom,
            appId,
            username: msg.username,
            guestPhone: msg.guestPhone,
            guestSessionId: msg.guestSessionId,
            eventType: msg.eventType,
            isAdmin: !!msg.isAdmin,
            eventTimestamp: msg.timestamp,
            source: 'notification',
          });
        }
        
        // Update unread count
        if (!activeChats.includes(targetRoom)) {
          setUnreadCounts(prevCounts => {
            const updated = {
              ...prevCounts,
              [targetRoom]: (prevCounts[targetRoom] || 0) + 1
            };
            try {
              localStorage.setItem(`chat_unread_${appId}`, JSON.stringify(updated));
            } catch (e) {
              console.warn('Failed to save unread counts:', e);
            }
            return updated;
          });
        }
        
        return { ...prev, [targetRoom]: updated };
      });
    };
    
    socket.on("notification", handleNotification);

    // Listen for typing indicators
    const handleTyping = (data: any) => {
      const { room, username, isTyping } = data;
      if (!room || !username) return;

      setTypingUsers(prev => {
        const roomUsers = prev[room] || [];
        let updated: string[];

        if (isTyping) {
          // Add typing user if not already present
          if (!roomUsers.includes(username)) {
            updated = [...roomUsers, username];
          } else {
            return prev;
          }
        } else {
          // Remove typing user
          updated = roomUsers.filter(u => u !== username);
        }

        return { ...prev, [room]: updated };
      });
    };

    socket.on("user_typing", handleTyping);

    return () => {
      socket.off?.("message", handleMessage);
      socket.off?.("notification", handleNotification);
      socket.off?.("user_typing", handleTyping);
    };
  }, [socket, guestIdentity, guestPhone, appId, activeChats, saveToLocalStorage, loadHistory, emitAutoOpenChat, WELCOME_EVENT_TYPES, hasRecentWelcomeInClient, markWelcomeSeenInClient]);
  
  // Load initial history khi connect - LMKT: Guest only
  useEffect(() => {
    if (connected && appId && guestIdentity && !isInitialized) {
      if (isInitializingRef.current) {
        return;
      }
      isInitializingRef.current = true;
      const initializeChat = async () => {
        try {
          // LMKT: Only guest mode - restore chat history + unread from localStorage
          await loadHistoryRef.current?.(guestIdentity, guestIdentity);
          
          // Load unread counts from localStorage
          try {
            const unreadKey = `chat_unread_${appId}`;
            const stored = localStorage.getItem(unreadKey);
            if (stored) {
              setUnreadCounts(JSON.parse(stored));
            }
          } catch (e) {
            console.warn('Failed to restore unread counts:', e);
          }
        } catch (error) {
          console.warn('Failed to initialize chat:', error);
        } finally {
          isInitializingRef.current = false;
          setIsInitialized(true);
        }
      };
      
      initializeChat();
    }
  }, [connected, appId, guestIdentity, isInitialized]);
  
  const value: ChatHistoryContextValue = {
    messages,
    sendMessage,
    loadHistory,
    markAsRead,
    registerGuestPhone,
    unreadCounts,
    typingUsers,
    connected,
    activeChats,
    openChat,
    closeChat,
  };
  
  return (
    <ChatHistoryContext.Provider value={value}>
      {children}
    </ChatHistoryContext.Provider>
  );
};
