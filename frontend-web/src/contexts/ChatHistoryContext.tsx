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

type ChatActor = 'guest' | 'admin' | 'user';

interface ChatHistoryContextValue {
  // Lịch sử chat theo room/guest
  messages: Record<string, ChatMessage[]>; // key: room hoặc guestPhone
  
  // Actions
  sendMessage: (room: string, message: string, to?: string) => void;
  loadHistory: (room: string, guestPhone?: string) => Promise<void>;
  markAsRead: (room: string) => void;
  broadcastNotification: (targetAppId: string, message: string) => Promise<boolean>; // CSM admin broadcast
  refreshAllMessages: () => Promise<void>; // Force refresh all messages from backend
  
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
  // IMPORTANT: Wrap in useMemo to stable appId and prevent unnecessary re-calculations
  const appId = useMemo(
    () => (user.app_id || "").trim() || useAppStore.getState().getCurrentAppId() || "csm",
    [user.app_id]
  );
  const { guestPhone, guestSessionId, isGuest } = useGuestPhone();
  const isAdminUser = !!user.dev || !!user.roles?.includes('admin');
  const chatActor: ChatActor = isGuest ? 'guest' : (isAdminUser ? 'admin' : 'user');
  
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
  const loadHistoryInFlightRef = useRef<Record<string, Promise<void>>>({});
  const loadHistoryBackoffUntilRef = useRef<Record<string, number>>({});
  const localHistoryHydratedRef = useRef<Record<string, boolean>>({});
  const markAsReadInFlightRef = useRef<Record<string, boolean>>({});
  const markAsReadBackoffUntilRef = useRef<Record<string, number>>({});
  const markAsReadLastAttemptRef = useRef<Record<string, number>>({});
  const readUpdateReloadLastRunRef = useRef<Record<string, number>>({});

  const LOAD_HISTORY_ERROR_BACKOFF_MS = 5000;
  const MARK_AS_READ_ERROR_BACKOFF_MS = 5000;
  const MARK_AS_READ_THROTTLE_MS = 2000;
  const READ_UPDATE_RELOAD_THROTTLE_MS = 3000;
  const WELCOME_CLIENT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  const WELCOME_EVENT_TYPES = useMemo(
    () => new Set(['ai_auto_welcome', 'ai_auto_welcome_fallback']),
    []
  );

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

  const isPhoneLike = useCallback((val?: string) => !!val && /^(\+?\d[\d\s\-]{7,})$/.test(val), []);

  const isGuestConversationKey = useCallback((value?: string) => {
    if (!value) return false;
    return value !== appId && value !== 'csm' && !value.includes(':');
  }, [appId]);

  const resolveGuestIdentity = useCallback((guestIdentityOverride?: string) => {
    const override = (guestIdentityOverride || '').trim();
    if (override) return override;

    const fromState = (guestIdentity || '').trim();
    if (fromState) return fromState;

    if (typeof window !== 'undefined') {
      const fromStorage = (
        localStorage.getItem(`csm_guest_session_${appId}`)
        || ''
      ).trim();
      if (fromStorage) return fromStorage;
    }

    return '';
  }, [guestIdentity, appId]);

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

  const updateRoomMessages = useCallback((room: string, nextMessages: ChatMessage[]) => {
    setMessages(prev => {
      const current = prev[room] || [];
      const unchanged =
        current.length === nextMessages.length
        && current.every((msg, idx) => {
          const next = nextMessages[idx];
          return (
            msg?.timestamp === next?.timestamp
            && msg?.message === next?.message
            && msg?.userId === next?.userId
            && msg?.username === next?.username
          );
        });

      if (unchanged) {
        return prev;
      }

      return { ...prev, [room]: nextMessages };
    });
  }, []);

  const resolveGuestApiRoom = useCallback((identity: string) => {
    return `guest:${appId};${identity}`;
  }, [appId]);

  const resolveAdminHistoryTarget = useCallback((room: string, guestIdentityOverride?: string) => {
    if (guestIdentityOverride && isGuestConversationKey(guestIdentityOverride)) {
      return {
        mode: 'admin-guest' as const,
        uiRoom: guestIdentityOverride,
        apiRoom: resolveGuestApiRoom(guestIdentityOverride),
      };
    }

    if (room === 'csm') {
      return {
        mode: 'admin-system' as const,
        uiRoom: room,
        apiRoom: room,
      };
    }

    if (room === appId) {
      return {
        mode: 'admin-app' as const,
        uiRoom: room,
        apiRoom: `app:${appId}`,
      };
    }

    return {
      mode: 'admin-room' as const,
      uiRoom: room,
      apiRoom: room,
    };
  }, [appId, isGuestConversationKey, resolveGuestApiRoom]);

  const resolveOutgoingRoom = useCallback((room: string, to?: string) => {
    const targetGuestIdentity = chatActor === 'admin' && isGuestConversationKey(room) ? room : undefined;
    const effectiveGuestIdentity = chatActor === 'guest'
      ? (isGuestConversationKey(room) ? room : resolveGuestIdentity())
      : '';

    if (chatActor === 'guest' && effectiveGuestIdentity) {
      return {
        actualRoom: resolveGuestApiRoom(effectiveGuestIdentity),
        targetGuestIdentity: effectiveGuestIdentity,
      };
    }

    if (chatActor === 'admin') {
      if (targetGuestIdentity) {
        return {
          actualRoom: resolveGuestApiRoom(targetGuestIdentity),
          targetGuestIdentity,
        };
      }
      if (to) {
        return {
          actualRoom: `user:${appId};${to}`,
          targetGuestIdentity: undefined,
        };
      }
      return {
        actualRoom: `app:${appId}`,
        targetGuestIdentity: undefined,
      };
    }

    if (user.userId && to) {
      const ids = [user.userId, to].sort();
      return {
        actualRoom: `private:${appId};${ids.join(';')}`,
        targetGuestIdentity: undefined,
      };
    }

    return {
      actualRoom: `app:${appId}`,
      targetGuestIdentity: undefined,
    };
  }, [appId, chatActor, isGuestConversationKey, resolveGuestApiRoom, resolveGuestIdentity, user.userId]);

  const resolveReadRoom = useCallback((room: string) => {
    if (chatActor === 'guest') {
      return {
        mode: 'guest' as const,
        uiRoom: room,
        identity: resolveGuestIdentity(),
        apiRoom: room,
      };
    }

    if (chatActor === 'admin' && isGuestConversationKey(room)) {
      return {
        mode: 'admin-guest' as const,
        uiRoom: room,
        identity: room,
        apiRoom: resolveGuestApiRoom(room),
      };
    }

    return {
      mode: 'default' as const,
      uiRoom: room,
      identity: '',
      apiRoom: room,
    };
  }, [chatActor, isGuestConversationKey, resolveGuestApiRoom, resolveGuestIdentity]);

  // Helper: Get localStorage key
  const getStorageKey = useCallback((room: string) => {
    return `chat_history_${room}_${isGuest ? guestIdentity : user.userId || 'admin'}`;
  }, [isGuest, guestIdentity, user.userId]);
  
  // Helper: Save to localStorage (ONLY for guest, not admin)
  const saveToLocalStorage = useCallback((room: string, msgs: ChatMessage[]) => {
    // Admin always loads fresh from server - no localStorage caching
    if (!isGuest) return;
    
    try {
      const key = getStorageKey(room);
      localStorage.setItem(key, JSON.stringify(msgs.slice(-100))); // Keep last 100 for guest
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
    const identityKey = chatActor === 'guest'
      ? resolveGuestIdentity(guestIdentityOverride)
      : (guestIdentityOverride || '').trim();
    const requestKey = `${room}::${identityKey}`;
    const now = Date.now();
    const backoffUntil = loadHistoryBackoffUntilRef.current[requestKey] || 0;

    if (now < backoffUntil) {
      return;
    }

    const inFlight = loadHistoryInFlightRef.current[requestKey];
    if (inFlight) {
      return inFlight;
    }

    const executeLoad = (async () => {
    // ONLY guest loads from localStorage for offline support
    // Admin ALWAYS loads fresh from server for real-time data
    if (isGuest && !localHistoryHydratedRef.current[room]) {
      localHistoryHydratedRef.current[room] = true;
      const localMessages = loadFromLocalStorage(room);
      if (localMessages.length > 0) {
        const normalizedLocalMessages = collapseWelcomeDuplicates(localMessages);
        console.log(`💾 [ChatHistory] Guest restored ${normalizedLocalMessages.length} messages from localStorage for room: ${room}`);
        updateRoomMessages(room, normalizedLocalMessages);
      }
    }

    // Only call server when socket is connected.
    if (!connected || !socket) {
      return;
    }
    
    // Then load from server (always for both guest and admin)
    try {
      let history: ChatMessage[] = [];
      
      if (chatActor === 'guest') {
        const identity = resolveGuestIdentity(guestIdentityOverride);
        if (!identity) return;
        history = await (window as any).loadGuestChatHistory?.(appId, identity, 100, guestPhone) || [];
        if (history && Array.isArray(history) && history.length > 0) {
          const normalizedHistory = collapseWelcomeDuplicates(history);
          console.log(`📥 [ChatHistory] Loaded ${normalizedHistory.length} messages from server for guest ${identity}`);
          updateRoomMessages(room, normalizedHistory);
          saveToLocalStorage(room, normalizedHistory);
        }
      } else if (chatActor === 'admin') {
        const target = resolveAdminHistoryTarget(room, guestIdentityOverride);
        if (target.mode === 'admin-app') {
          const appHistory = await (window as any).loadAllAppChatHistory?.(appId, 200) || {};
          console.log('📥 [ChatHistory] loadAllAppChatHistory response:', appHistory);
          const msgs = (appHistory.messages || []).filter((msg: ChatMessage) => msg?.appId === appId);
          console.log(`📥 [ChatHistory] Admin loaded ${msgs.length} messages for appId "${appId}"`);
          if (msgs.length > 0) {
            console.log('📥 [ChatHistory] Sample messages:', msgs.slice(0, 2));
          }
          updateRoomMessages(appId, msgs);
        } else {
          history = await (window as any).loadAdminChatHistory?.(target.apiRoom, 100, appId) || [];
          const filteredHistory = target.mode === 'admin-system'
            ? history
            : (history || []).filter((msg: ChatMessage) => msg?.appId === appId);
          if (filteredHistory && Array.isArray(filteredHistory) && filteredHistory.length > 0) {
            console.log(`📥 [ChatHistory] Admin loaded ${filteredHistory.length} messages from server for ${target.mode}`);
          }
          updateRoomMessages(target.uiRoom, collapseWelcomeDuplicates(filteredHistory || []));
        }
      }
    } catch (error) {
      loadHistoryBackoffUntilRef.current[requestKey] = Date.now() + LOAD_HISTORY_ERROR_BACKOFF_MS;
      console.warn('Failed to load chat history from server:', error);
    }
    })();

    loadHistoryInFlightRef.current[requestKey] = executeLoad;
    await executeLoad.finally(() => {
      delete loadHistoryInFlightRef.current[requestKey];
    });
  }, [isGuest, chatActor, resolveGuestIdentity, guestPhone, appId, loadFromLocalStorage, saveToLocalStorage, resolveAdminHistoryTarget, connected, socket, updateRoomMessages, collapseWelcomeDuplicates]);
  
  // Update loadHistory ref whenever it changes (for initialization to use latest)
  useEffect(() => {
    loadHistoryRef.current = loadHistory;
  }, [loadHistory]);
  
  // Send message
  const sendMessage = useCallback((room: string, message: string, to?: string) => {
    if (!socket || !message.trim()) return;
    const { actualRoom, targetGuestIdentity } = resolveOutgoingRoom(room, to);
    
    const msg: ChatMessage = {
      room: actualRoom,
      username: chatActor === 'guest' ? (guestPhone || "Guest") : (user.username || "Admin"),
      userId: user.userId,
      avatar: user.avatar,
      isAdmin: isAdminUser,
      message: message.trim(),
      eventType: undefined,
      readBy: [],
      appId,
      to,
      guestPhone: chatActor === 'guest' ? (guestPhone || "") : undefined,
      guestSessionId: chatActor === 'guest' ? (targetGuestIdentity || "") : (targetGuestIdentity || undefined),
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
    
    console.log(`📤 [ChatHistory] Sent message:`, {
      isAdmin: isAdminUser,
      actor: chatActor,
      actualRoom,
      uiRoom: room,
      guestPhone: msg.guestPhone,
      guestSessionId: msg.guestSessionId,
      message: msg.message.substring(0, 50)
    });
  }, [socket, user, guestPhone, appId, saveToLocalStorage, resolveOutgoingRoom, isAdminUser, chatActor]);
  
  // Mark as read with refresh
  const markAsRead = useCallback((room: string) => {
    if (!socket || !connected) return;
    
    console.log(`📖 [ChatHistory] Marking room as read: ${room}`);

    const target = resolveReadRoom(room);
    const markKey = `${target.mode}:${target.uiRoom}:${target.identity || ''}`;
    const now = Date.now();
    const backoffUntil = markAsReadBackoffUntilRef.current[markKey] || 0;
    const lastAttempt = markAsReadLastAttemptRef.current[markKey] || 0;

    if (markAsReadInFlightRef.current[markKey]) {
      return;
    }

    if (now < backoffUntil || now - lastAttempt < MARK_AS_READ_THROTTLE_MS) {
      return;
    }

    markAsReadLastAttemptRef.current[markKey] = now;
    markAsReadInFlightRef.current[markKey] = true;

    if (target.mode === 'guest' && target.identity) {
      (window as any).markGuestMessagesAsRead?.(appId, target.identity).then(() => {
        // Reload history to refresh readBy flags
        loadHistoryRef.current?.(target.uiRoom, target.identity).catch((err: any) => {
          console.warn("Failed to reload history after marking as read", err);
        });
      }).catch((err: any) => {
        markAsReadBackoffUntilRef.current[markKey] = Date.now() + MARK_AS_READ_ERROR_BACKOFF_MS;
        console.warn("Failed to mark guest messages as read", err);
      }).finally(() => {
        delete markAsReadInFlightRef.current[markKey];
      });
    } else if (chatActor !== 'guest' && user.userId) {
      (window as any).markAllMessagesAsRead?.(target.apiRoom, user.userId).then(() => {
        // Reload history to refresh readBy flags
        loadHistoryRef.current?.(target.uiRoom, target.mode === 'admin-guest' ? target.identity : undefined).catch((err: any) => {
          console.warn("Failed to reload history after marking as read", err);
        });
      }).catch((err: any) => {
        markAsReadBackoffUntilRef.current[markKey] = Date.now() + MARK_AS_READ_ERROR_BACKOFF_MS;
        console.warn("Failed to mark admin messages as read", err);
      }).finally(() => {
        delete markAsReadInFlightRef.current[markKey];
      });
    } else {
      delete markAsReadInFlightRef.current[markKey];
    }
    
    // Clear unread count
    setUnreadCounts(prev => {
      const updated = { ...prev, [room]: 0 };
      if (isGuest) {
        try {
          localStorage.setItem(`chat_unread_${appId}`, JSON.stringify(updated));
        } catch (e) {
          console.warn('Failed to save unread counts:', e);
        }
      }
      return updated;
    });
  }, [socket, connected, appId, user.userId, loadHistoryRef, resolveReadRoom, chatActor]);
  
  // Open/close chat
  const openChat = useCallback((room: string) => {
    setActiveChats(prev => (prev.includes(room) ? prev : [...prev, room]));
    if (connected && socket) {
      loadHistory(room);
    }
  }, [loadHistory, connected, socket]);
  
  const closeChat = useCallback((room: string) => {
    setActiveChats(prev => (prev.includes(room) ? prev.filter(r => r !== room) : prev));
  }, []);
  
  // Clear messages when appId changes (user switches app or logs in to different app)
  useEffect(() => {
    if (!isGuest) {
      console.log(`🔄 [ChatHistory] AppId changed to: ${appId}, clearing old messages`);
      setMessages({});
      setUnreadCounts({});
      setIsInitialized(false);
    }
  }, [appId, isGuest]);
  
  // Join room on connect
  useEffect(() => {
    if (socket && connected) {
      const joinData: ChatMessage = {
        room: appId, // Will be processed by backend based on isAdmin/guestPhone
        username: user.username || (chatActor === 'guest' ? guestPhone || guestIdentity : "Admin"),
        userId: user.userId,
        avatar: user.avatar,
        isAdmin: isAdminUser,
        message: "",
        eventType: undefined,
        readBy: [],
        appId,
        guestPhone: isGuest ? guestPhone : undefined,
        guestSessionId: isGuest ? guestIdentity : undefined,
      };
      socket.emit("join", joinData);
      
      console.log(`🔌 [ChatHistory] Socket join:`, {
        actor: chatActor,
        guestPhone,
        guestSessionId: guestIdentity,
        appId,
        room: chatActor === 'admin' ? `app:${appId}` : chatActor === 'guest' ? `guest:${appId};${guestIdentity}` : appId
      });
    }
  }, [socket, connected, appId, user, guestPhone, guestIdentity, isAdminUser, chatActor]);
  
  // Listen for messages
  useEffect(() => {
    if (!socket) return;
    
    const handleMessage = (msg: ChatMessage) => {
      // CRITICAL: Filter messages by current appId for admin
      // Admin should only see messages from their own app, not from other apps
      if (!isGuest) {
        // For admin: only accept messages that belong to current appId
        // Exception: system messages in 'csm' room are global
        const isSystemMessage = msg.room === 'csm';
        const belongsToCurrentApp = msg.appId === appId;
        
        if (!isSystemMessage && !belongsToCurrentApp) {
          console.log(`🚫 [ChatHistory] Rejected message from different appId: ${msg.appId} (current: ${appId})`);
          return;
        }
      }
      
      // Xác định room/key để lưu message
      let targetRoom = msg.room;
      
      if (isGuest) {
        // Guest: chỉ nhận msg cho mình
        if (msg.to !== guestIdentity && msg.guestSessionId !== guestIdentity && msg.guestPhone !== guestPhone) {
          return;
        }
        targetRoom = guestIdentity || appId;
      } else {
        // Admin: nhận msg từ guest hoặc msg của mình
        if (msg.guestSessionId) {
          targetRoom = msg.guestSessionId;
        } else if (msg.guestPhone) {
          targetRoom = `phone:${msg.guestPhone}`;
        } else if (msg.to && msg.userId !== user.userId) {
          // Msg tới người khác
          return;
        }
      }
      
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

        const isOwnMessage = isGuest
          ? (!msg.isAdmin && !msg.userId && (msg.guestSessionId === guestIdentity || msg.guestPhone === guestPhone))
          : (msg.userId === user.userId);

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
        
        // Update unread count if chat not active
        if (!activeChats.includes(targetRoom) && msg.userId !== user.userId) {
          setUnreadCounts(prevCounts => {
            const updated = {
              ...prevCounts,
              [targetRoom]: (prevCounts[targetRoom] || 0) + 1
            };
            // Persist unread counts ONLY for guest, not admin
            if (isGuest) {
              try {
                localStorage.setItem(`chat_unread_${appId}`, JSON.stringify(updated));
              } catch (e) {
                console.warn('Failed to save unread counts:', e);
              }
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
      console.log('📢 Received broadcast notification:', msg);
      
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
          Math.abs((m.timestamp || 0) - (msg.timestamp || 0)) < 1000
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
        
        // Update unread count for broadcast notifications
        if (!activeChats.includes(targetRoom)) {
          setUnreadCounts(prevCounts => {
            const updated = {
              ...prevCounts,
              [targetRoom]: (prevCounts[targetRoom] || 0) + 1
            };
            if (isGuest) {
              try {
                localStorage.setItem(`chat_unread_${appId}`, JSON.stringify(updated));
              } catch (e) {
                console.warn('Failed to save unread counts:', e);
              }
            }
            return updated;
          });
        }
        
        return { ...prev, [targetRoom]: updated };
      });
    };
    
    socket.on("notification", handleNotification);

    // Listen for deletion events (admin may delete broadcast or chat messages)
    const handleMessageDeleted = (payload: any) => {
      const { timestamp, appId: payloadAppId } = payload || {};
      if (!timestamp) return;

      // Ignore deletions for other apps
      if (payloadAppId && payloadAppId !== appId) {
        return;
      }

      setMessages(prev => {
        let changed = false;
        const removedCounts: Record<string, number> = {};

        const next = Object.fromEntries(
          Object.entries(prev).map(([room, msgs]) => {
            const filtered = msgs.filter(m => m.timestamp !== timestamp);
            const removed = msgs.length - filtered.length;
            if (removed > 0) {
              changed = true;
              removedCounts[room] = removed;
            }
            return [room, filtered];
          })
        );

        if (!changed) return prev;

        setUnreadCounts(prevCounts => {
          const updated = { ...prevCounts };
          Object.entries(removedCounts).forEach(([room, removed]) => {
            if (prevCounts[room]) {
              updated[room] = Math.max(0, (prevCounts[room] || 0) - removed);
            }
          });
          return updated;
        });

        return next;
      });
    };

    socket.on("chat_message_deleted", handleMessageDeleted);

    // Listen for read status updates from other clients
    const handleReadUpdate = (data: any) => {
      const { room, userId: readerId, action } = data;
      if (action === 'markAllAsRead' && room) {
        const now = Date.now();
        const lastReloadAt = readUpdateReloadLastRunRef.current[room] || 0;
        if (now - lastReloadAt < READ_UPDATE_RELOAD_THROTTLE_MS) {
          return;
        }
        readUpdateReloadLastRunRef.current[room] = now;
        console.log(`🔄 [ChatHistory] Received read update for room ${room} by ${readerId}`);
        // Reload history for the updated room to get latest readBy status
        loadHistory(room).catch(err => console.warn('Failed to reload after read update:', err));
      }
    };

    socket.on("chat_read_update", handleReadUpdate);

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
      socket.off?.("chat_message_deleted", handleMessageDeleted);
      socket.off?.("chat_read_update", handleReadUpdate);
      socket.off?.("user_typing", handleTyping);
    };
  }, [socket, isGuest, guestIdentity, guestPhone, appId, user.userId, activeChats, saveToLocalStorage, loadHistory, emitAutoOpenChat, WELCOME_EVENT_TYPES, hasRecentWelcomeInClient, markWelcomeSeenInClient]);
  
  // Load initial history khi connect
  useEffect(() => {
    if (connected && appId && !isInitialized) {
      if (isInitializingRef.current) {
        return;
      }
      isInitializingRef.current = true;
      console.log(`📌 [ChatHistory] Starting initialization with connected=${connected}, appId="${appId}", isGuest=${isGuest}, userId=${user.userId}, isInitialized=${isInitialized}`);
      const initializeChat = async () => {
        try {
          if (isGuest && guestIdentity) {
            // Guest: restore chat history + unread từ localStorage
            await loadHistoryRef.current?.(guestIdentity, guestIdentity);
            
            // Load unread counts từ localStorage cho guest
            try {
              const unreadKey = `chat_unread_${appId}`;
              const stored = localStorage.getItem(unreadKey);
              if (stored) {
                setUnreadCounts(JSON.parse(stored));
              }
            } catch (e) {
              console.warn('Failed to restore unread counts for guest:', e);
            }
          } else if (!isGuest && user.userId) {
            // Admin: Load system chat + all guest chats on reload
            console.log(`🔹 [ChatHistory] Admin initialization: user.app_id="${user.app_id}", final appId="${appId}"`);
            // 1. Load hệ thống chat
            await loadHistoryRef.current?.("csm");
            // 1b. Load nội bộ app room (group/internal chat)
            await loadHistoryRef.current?.(appId);
            
            // 2. Load danh sách tất cả guests đã chat trong app này
            try {
              console.log(`📱 [ChatHistory] About to call loadChatGuestsList with appId="${appId}"`);
              const rawGuestsList = await (window as any).loadChatGuestsList?.(appId) || [];
              const guestsList = (Array.isArray(rawGuestsList) ? rawGuestsList : [])
                .map((entry: any) => {
                  if (typeof entry === 'string') return entry.trim();
                  const candidate = entry?.guestSessionId || entry?.guestPhone || entry?.guestIdentity || entry?.room || '';
                  return typeof candidate === 'string' ? candidate.trim() : '';
                })
                .filter((value: string) => !!value);
              const uniqueGuests = Array.from(new Set(guestsList));
              console.log(`📱 [ChatHistory] Loaded guests list for appId "${appId}":`, uniqueGuests);
              
              // 3. Load lịch sử chat cho từng guest
              if (uniqueGuests.length > 0) {
                console.log(`📱 [ChatHistory] Loading history for ${uniqueGuests.length} guests...`);
                for (const guestIdentityValue of uniqueGuests) {
                  try {
                    console.log(`📱 [ChatHistory] Loading history for guest: ${guestIdentityValue}`);
                    await loadHistoryRef.current?.(guestIdentityValue, guestIdentityValue);
                  } catch (error) {
                    console.warn(`Failed to load history for guest ${guestIdentityValue}:`, error);
                  }
                }
                console.log('📱 [ChatHistory] Finished loading all guest histories');
              } else {
                console.warn('📱 [ChatHistory] No guests found or invalid guests list');
              }
              
              // 4. Calculate unread counts based on loaded messages
              // For admin: count messages not read by current user
              setMessages(prevMessages => {
                const newUnreadCounts: Record<string, number> = {};
                
                // Iterate through all loaded messages
                Object.entries(prevMessages).forEach(([room, msgs]) => {
                  let unreadCount = 0;
                  msgs.forEach(msg => {
                    // Count messages not marked as read by current admin
                    if (!msg.readBy || !msg.readBy.includes(user.userId)) {
                      unreadCount++;
                    }
                  });
                  if (unreadCount > 0) {
                    newUnreadCounts[room] = unreadCount;
                  }
                });
                
                // Update unread counts
                setUnreadCounts(newUnreadCounts);
                console.log("📊 Calculated unread counts for admin:", newUnreadCounts);
                
                return prevMessages;
              });
            } catch (error) {
              console.warn('Failed to load guests list on admin init:', error);
            }
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
  }, [connected, appId, isGuest, guestIdentity, user.userId, isInitialized]);
  
  // Refresh all messages - force reload from backend
  const refreshAllMessages = useCallback(async () => {
    if (!connected || !appId) {
      console.warn('❌ [ChatHistory] Cannot refresh - not connected or appId missing');
      return;
    }
    
    try {
      console.log(`🔄 [ChatHistory] Refreshing all messages for appId="${appId}"`);
      
      // For admin users, reload all guests list which will refresh all messages
      if (!isGuest && user.userId) {
        await loadHistoryRef.current?.('csm');
        await loadHistoryRef.current?.(appId);

        const rawGuestsList = await (window as any).loadChatGuestsList?.(appId) || [];
        const guestsList = (Array.isArray(rawGuestsList) ? rawGuestsList : [])
          .map((entry: any) => {
            if (typeof entry === 'string') return entry.trim();
            const candidate = entry?.guestSessionId || entry?.guestPhone || entry?.guestIdentity || entry?.room || '';
            return typeof candidate === 'string' ? candidate.trim() : '';
          })
          .filter((value: string) => !!value);
        const uniqueGuests = Array.from(new Set(guestsList));

        for (const guestIdentityValue of uniqueGuests) {
          await loadHistoryRef.current?.(guestIdentityValue, guestIdentityValue);
        }

        console.log(`✅ [ChatHistory] Refreshed ${uniqueGuests.length} guest conversations for appId="${appId}"`);
        
        // Recalculate unread counts
        setMessages(prevMessages => {
          const newUnreadCounts: Record<string, number> = {};
          
          Object.entries(prevMessages).forEach(([room, msgs]) => {
            let unreadCount = 0;
            msgs.forEach(msg => {
              if (!msg.readBy || !msg.readBy.includes(user.userId)) {
                unreadCount++;
              }
            });
            if (unreadCount > 0) {
              newUnreadCounts[room] = unreadCount;
            }
          });
          
          setUnreadCounts(newUnreadCounts);
          console.log("📊 [ChatHistory] Recalculated unread counts:", newUnreadCounts);
          
          return prevMessages;
        });
      } else if (isGuest && guestIdentity) {
        // For guest, reload their chat history
        await loadHistoryRef.current?.(guestIdentity, guestIdentity);
      }
    } catch (error) {
      console.error('❌ [ChatHistory] Failed to refresh messages:', error);
    }
  }, [connected, appId, isGuest, guestIdentity, user.userId]);
  
  // Broadcast notification (CSM admin only)
  const broadcastNotification = useCallback((targetAppId: string, message: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error('Socket not connected'));
        return;
      }
      
      const isAdmin = !!user.dev || (user.roles && user.roles.includes("admin"));
      if (!isAdmin || appId !== 'csm') {
        reject(new Error('Only CSM admins can broadcast notifications'));
        return;
      }
      
      const msg: ChatMessage = {
        room: `app:${targetAppId}`,
        username: user.username || 'CSM Admin',
        userId: user.userId,
        avatar: user.avatar,
        isAdmin: true,
        message: message.trim(),
        eventType: 'broadcast_notification',
        readBy: [],
        appId: 'csm', // Sender's appId
        to: targetAppId, // Target appId
        timestamp: Date.now(),
      };
      
      socket.emit('broadcast_notification', msg, (response: any) => {
        try {
          const result = typeof response === 'string' ? JSON.parse(response) : response;
          if (result.success) {
            console.log(`✅ Broadcast sent to ${targetAppId}`);
            resolve(true);
          } else {
            console.error(`❌ Broadcast failed: ${result.error}`);
            reject(new Error(result.error));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
  }, [socket, user, appId]);
  
  const value: ChatHistoryContextValue = {
    messages,
    sendMessage,
    loadHistory,
    markAsRead,
    broadcastNotification,
    refreshAllMessages,
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
