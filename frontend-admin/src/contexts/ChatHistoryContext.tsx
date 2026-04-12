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
import { toPermissionBigInt, isSuperPermissionProfile } from '#src/utils/permission-bitfield';

type ChatActor = 'guest' | 'admin' | 'user';

interface ChatHistoryContextValue {
  // Lịch sử chat theo room/guest
  messages: Record<string, ChatMessage[]>; // key: room hoặc guestPhone
  
  // Actions
  sendMessage: (
    room: string,
    message: string,
    to?: string,
    extra?: {
      attachments?: ChatMessage['attachments'];
      checkinMeta?: ChatMessage['checkinMeta'];
      eventType?: string;
    }
  ) => void;
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
  recallMessage: (room: string, timestamp: number) => Promise<boolean>;
}

type AdminChatHistorySnapshot = {
  appId?: string;
  limit?: number;
  timestamp?: number;
  messages?: ChatMessage[];
};

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
  const isAdminUser = !!user.dev || isSuperPermissionProfile(toPermissionBigInt((user as any).permissionBitfield));
  const isPortalUser = !isGuest && !!String(user.userId || '').trim();
  const isDevUser = !!user.dev;
  const chatActor: ChatActor = isGuest ? 'guest' : (isPortalUser ? 'admin' : 'user');
  
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
  const adminSnapshotLoadedRef = useRef<Record<string, boolean>>({});

  const LOAD_HISTORY_ERROR_BACKOFF_MS = 5000;
  const MARK_AS_READ_ERROR_BACKOFF_MS = 5000;
  const MARK_AS_READ_THROTTLE_MS = 2000;
  const READ_UPDATE_RELOAD_THROTTLE_MS = 3000;

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
    if (value.startsWith('guest:')) return true;
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

  const mapApiRoomToUiRoom = useCallback((apiRoom?: string) => {
    const room = (apiRoom || '').trim();
    if (!room) return '';
    if (room.startsWith('guest:')) {
      return room;
    }
    if (room === `app:${appId}`) return appId;
    return room;
  }, [appId]);

  const applyAdminSnapshot = useCallback((snapshotMessages: ChatMessage[], snapshotAppId?: string) => {
    const effectiveAppId = (snapshotAppId || appId || '').trim();
    if (!effectiveAppId || !Array.isArray(snapshotMessages)) return;

    const normalized = snapshotMessages
      .filter((msg: ChatMessage) => !!msg)
      .filter((msg: ChatMessage) => isDevUser || !msg.appId || msg.appId === effectiveAppId);

    const guestBuckets: Record<string, ChatMessage[]> = {};
    const privateBuckets: Record<string, ChatMessage[]> = {};
    normalized.forEach((msg: ChatMessage) => {
      const guestKey = String(msg.guestSessionId || msg.guestPhone || '').trim();
      if (!guestKey) {
        // Bucket private room messages (portal user ↔ portal user)
        const msgRoom = (msg.room || '').trim();
        if (msgRoom.startsWith('private:')) {
          if (!privateBuckets[msgRoom]) privateBuckets[msgRoom] = [];
          privateBuckets[msgRoom].push(msg);
        }
        return;
      }
      const guestRoom = `guest:${(msg.appId || effectiveAppId || appId).trim()};${guestKey}`;
      if (!guestBuckets[guestRoom]) guestBuckets[guestRoom] = [];
      guestBuckets[guestRoom].push(msg);
    });

    setMessages(prev => {
      // For private room buckets: only replace if snapshot has >= messages (avoids wiping freshly-loaded history)
      const mergedPrivate: Record<string, ChatMessage[]> = {};
      Object.entries(privateBuckets).forEach(([room, msgs]) => {
        const existing = prev[room] || [];
        if (msgs.length >= existing.length) {
          mergedPrivate[room] = msgs;
        }
      });
      return {
        ...prev,
        [effectiveAppId]: normalized,
        ...guestBuckets,
        ...mergedPrivate,
      };
    });

    if (user.userId) {
      const nextUnread: Record<string, number> = {};
      Object.entries(guestBuckets).forEach(([guestKey, msgs]) => {
        const unread = msgs.filter((msg: ChatMessage) => !msg.readBy || !msg.readBy.includes(user.userId)).length;
        if (unread > 0) nextUnread[guestKey] = unread;
      });
      if (!isDevUser) {
        const appUnread = normalized.filter((msg: ChatMessage) => !msg.readBy || !msg.readBy.includes(user.userId)).length;
        if (appUnread > 0) nextUnread[effectiveAppId] = appUnread;
      }
      setUnreadCounts(nextUnread);
    }
  }, [appId, user.userId, isDevUser]);

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
      if (room.startsWith('private:')) {
        return {
          actualRoom: room,
          targetGuestIdentity: undefined,
        };
      }
      if (room.startsWith('user:')) {
        return {
          actualRoom: room,
          targetGuestIdentity: undefined,
        };
      }
      if (room.startsWith('guest:')) {
        const identity = room.split(';').slice(1).join(';').trim();
        return {
          actualRoom: room,
          targetGuestIdentity: identity || undefined,
        };
      }
      if (targetGuestIdentity) {
        return {
          actualRoom: resolveGuestApiRoom(targetGuestIdentity),
          targetGuestIdentity,
        };
      }
      if (to) {
        if (user.userId) {
          const ids = [String(user.userId), String(to)].filter(Boolean).sort();
          if (ids.length === 2) {
            return {
              actualRoom: `private:${appId};${ids.join(';')}`,
              targetGuestIdentity: undefined,
            };
          }
        }
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
      if (room.startsWith('guest:')) {
        return {
          mode: 'admin-guest' as const,
          uiRoom: room,
          identity: room.split(';').slice(1).join(';').trim(),
          apiRoom: room,
        };
      }
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
  
  // Helper: Save to localStorage
  const saveToLocalStorage = useCallback((room: string, msgs: ChatMessage[]) => {
    try {
      const key = getStorageKey(room);
      localStorage.setItem(key, JSON.stringify(msgs.slice(-100))); // Keep last 100 messages
    } catch (error) {
      console.warn('Failed to save chat to localStorage:', error);
    }
  }, [getStorageKey]);
  
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
    // Load from localStorage for offline support (both guest and admin)
    if (!localHistoryHydratedRef.current[room]) {
      localHistoryHydratedRef.current[room] = true;
      const localMessages = loadFromLocalStorage(room);
      if (localMessages.length > 0) {
        console.log(`💾 [ChatHistory] Restored ${localMessages.length} messages from localStorage for room: ${room}`);
        updateRoomMessages(room, localMessages);
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
          console.log(`📥 [ChatHistory] Loaded ${history.length} messages from server for guest ${identity}`);
          updateRoomMessages(room, history);
          saveToLocalStorage(room, history);
        }
      } else if (chatActor === 'admin') {
        const target = resolveAdminHistoryTarget(room, guestIdentityOverride);
        if (!adminSnapshotLoadedRef.current[appId]) {
          socket.emit('request_chat_history_app_snapshot', appId);
        }

        if (target.mode === 'admin-system') {
          history = await (window as any).loadAdminChatHistory?.(target.apiRoom, 100, appId) || [];
          const existingSystem = messagesRef.current[target.uiRoom] || [];
          if (Array.isArray(history) && history.length === 0 && existingSystem.length > 0) {
            // Do not wipe visible messages when backend has not indexed this room yet.
            updateRoomMessages(target.uiRoom, existingSystem);
          } else {
            updateRoomMessages(target.uiRoom, history || []);
            saveToLocalStorage(target.uiRoom, history || []);
          }
        } else {
          // For internal direct rooms (private/user/app), always pull server history so offline->online resumes immediately.
          history = await (window as any).loadAdminChatHistory?.(target.apiRoom, 100, appId) || [];
          const existingRoomMessages = messagesRef.current[target.uiRoom] || [];
          if (Array.isArray(history) && history.length === 0 && existingRoomMessages.length > 0) {
            // Keep current room content instead of flashing to empty state.
            updateRoomMessages(target.uiRoom, existingRoomMessages);
          } else {
            updateRoomMessages(target.uiRoom, history || []);
            saveToLocalStorage(target.uiRoom, history || []);
          }
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
  }, [isGuest, chatActor, resolveGuestIdentity, guestPhone, appId, loadFromLocalStorage, saveToLocalStorage, resolveAdminHistoryTarget, connected, socket, updateRoomMessages]);
  
  // Update loadHistory ref whenever it changes (for initialization to use latest)
  useEffect(() => {
    loadHistoryRef.current = loadHistory;
  }, [loadHistory]);
  
  // Send message
  const sendMessage = useCallback((
    room: string,
    message: string,
    to?: string,
    extra?: {
      attachments?: ChatMessage['attachments'];
      checkinMeta?: ChatMessage['checkinMeta'];
      eventType?: string;
    }
  ) => {
    const hasText = !!message.trim();
    const hasMedia = Array.isArray(extra?.attachments) && extra!.attachments!.length > 0;
    if (!socket || (!hasText && !hasMedia)) return;
    const { actualRoom, targetGuestIdentity } = resolveOutgoingRoom(room, to);
    const forcePrivateInternal = chatActor === 'admin' && room.startsWith('private:') && !!to;
    
    const msg: ChatMessage = {
      room: actualRoom,
      username: chatActor === 'guest' ? (guestPhone || "Guest") : (user.username || "Admin"),
      userId: user.userId,
      avatar: user.avatar,
      isAdmin: forcePrivateInternal ? false : isAdminUser,
      message: message.trim(),
      eventType: extra?.eventType,
      readBy: [],
      appId,
      to,
      guestPhone: chatActor === 'guest' ? (guestPhone || "") : undefined,
      guestSessionId: chatActor === 'guest' ? (targetGuestIdentity || "") : (targetGuestIdentity || undefined),
      timestamp: Date.now(),
      attachments: extra?.attachments,
      checkinMeta: extra?.checkinMeta,
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
        setMessages(prev => {
          const roomMsgs = prev[target.uiRoom] || [];
          if (!roomMsgs.length) return prev;
          const updated = roomMsgs.map(msg => {
            const readBy = Array.isArray(msg.readBy) ? msg.readBy : [];
            if (readBy.includes(user.userId)) return msg;
            return { ...msg, readBy: [...readBy, user.userId] };
          });
          return { ...prev, [target.uiRoom]: updated };
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
      if (room.startsWith('private:')) {
        socket.emit('join_room', room);
      }
      loadHistory(room);
    }
  }, [loadHistory, connected, socket]);
  
  const closeChat = useCallback((room: string) => {
    setActiveChats(prev => (prev.includes(room) ? prev.filter(r => r !== room) : prev));
  }, []);

  // Re-join private rooms and reload history for active chats on (re)connect.
  // This ensures that if openChat() was called before the socket was ready,
  // or if the user was viewing a chat when the connection dropped and came back,
  // messages are always loaded and private room membership is restored.
  const joinedActiveRoomsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!socket || !connected) {
      joinedActiveRoomsRef.current.clear();
      return;
    }
    activeChats.forEach(room => {
      if (joinedActiveRoomsRef.current.has(room)) return;
      joinedActiveRoomsRef.current.add(room);
      if (room.startsWith('private:')) {
        socket.emit('join_room', room);
      }
      // Small delay so the join/snapshot can process first
      setTimeout(() => {
        loadHistoryRef.current?.(room);
      }, 400);
    });
  }, [socket, connected, activeChats]);

  const recallMessage = useCallback(async (room: string, timestamp: number): Promise<boolean> => {
    if (!socket || !connected || !timestamp) return false;
    const payload = {
      room,
      appId,
      timestamp,
    };

    return await new Promise<boolean>((resolve) => {
      socket.emit('chat_recall_message', payload, (ack: any) => {
        try {
          const parsed = typeof ack === 'string' ? JSON.parse(ack) : ack;
          resolve(Boolean(parsed?.success));
        } catch {
          resolve(false);
        }
      });
    });
  }, [socket, connected, appId]);
  
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

      if (chatActor === 'admin') {
        socket.emit('request_chat_history_app_snapshot', appId);
      }
      
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
        
        if (!isDevUser && !isSystemMessage && !belongsToCurrentApp) {
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
          targetRoom = `guest:${(msg.appId || appId).trim()};${msg.guestSessionId}`;
        } else if (msg.guestPhone) {
          targetRoom = `guest:${(msg.appId || appId).trim()};${msg.guestPhone}`;
        } else if (String(msg.room || '').startsWith('private:')) {
          targetRoom = msg.room;
        } else if (targetRoom === `app:${appId}`) {
          // Normalize app:appId → appId so internal group chat messages are stored
          // under the same key that InternalChatBox looks up (roomKey = appId).
          targetRoom = appId;
        }
      }
      
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

        const isOwnMessage = isGuest
          ? (!msg.isAdmin && !msg.userId && (msg.guestSessionId === guestIdentity || msg.guestPhone === guestPhone))
          : (msg.userId === user.userId);

        if (isGuest && !activeChats.includes(targetRoom) && !isOwnMessage) {
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

    const handleAdminSnapshot = (payload: AdminChatHistorySnapshot | string) => {
      if (isGuest) return;
      let parsed: AdminChatHistorySnapshot;
      try {
        parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
      } catch (err) {
        console.warn('Failed to parse chat_history_app_snapshot payload', err);
        return;
      }

      const snapshotAppId = (parsed?.appId || '').trim();
      if (!snapshotAppId || snapshotAppId !== appId) {
        return;
      }

      const snapshotMessages = Array.isArray(parsed?.messages) ? parsed!.messages! : [];
      adminSnapshotLoadedRef.current[snapshotAppId] = true;
      applyAdminSnapshot(snapshotMessages, snapshotAppId);
    };

    socket.on('chat_history_app_snapshot', handleAdminSnapshot);

    // Listen for broadcast notifications from CSM admin
    const handleNotification = (msg: ChatMessage) => {
      console.log('📢 Received broadcast notification:', msg);
      
      // Only show if message belongs to current app
      if (!isDevUser && msg.appId !== appId) {
        console.log(`🚫 Rejected notification from different appId: ${msg.appId} (current: ${appId})`);
        return;
      }
      
      // Show notification in app room
      const targetRoom = (msg.appId || appId || '').trim() || appId;
      
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

        if (isGuest && !activeChats.includes(targetRoom)) {
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

    const handleGuestCleanup = (payload: any) => {
      if (isGuest) return;

      const cleanupAppId = String(payload?.appId || '').trim();
      if (!cleanupAppId || cleanupAppId !== appId) return;

      const guestSessionId = String(payload?.guestSessionId || '').trim();
      const guestPhone = String(payload?.guestPhone || '').trim();
      const eventTypePrefix = String(payload?.eventTypePrefix || 'ai_auto_welcome').trim();

      setMessages(prev => {
        const next = { ...prev };
        let changed = false;

        Object.entries(next).forEach(([roomKey, msgs]) => {
          const filtered = (msgs || []).filter((msg: ChatMessage) => {
            const msgGuestSession = String(msg.guestSessionId || '').trim();
            const msgGuestPhone = String(msg.guestPhone || '').trim();
            const matchGuest = !!(
              (guestSessionId && msgGuestSession === guestSessionId)
              || (guestPhone && msgGuestPhone === guestPhone)
            );
            const isTransientAuto = String(msg.eventType || '').startsWith(eventTypePrefix);
            return !(matchGuest && isTransientAuto);
          });

          if (filtered.length !== msgs.length) {
            changed = true;
            next[roomKey] = filtered;
          }
        });

        if (!changed) return prev;

        setUnreadCounts(prevCounts => {
          const updated: Record<string, number> = {};
          Object.entries(next).forEach(([roomKey, msgs]) => {
            const unread = (msgs || []).filter((m: ChatMessage) => !m.readBy || !m.readBy.includes(user.userId || '')).length;
            if (unread > 0) {
              updated[roomKey] = unread;
            }
          });
          return updated;
        });

        return next;
      });
    };

    socket.on('chat_guest_cleanup', handleGuestCleanup);

    // Listen for read status updates from other clients
    const handleReadUpdate = (data: any) => {
      const { room, userId: readerId, action } = data;
      if (action === 'markAllAsRead' && room) {
        const uiRoom = mapApiRoomToUiRoom(room);
        if (!uiRoom) return;
        const now = Date.now();
        const lastReloadAt = readUpdateReloadLastRunRef.current[uiRoom] || 0;
        if (now - lastReloadAt < READ_UPDATE_RELOAD_THROTTLE_MS) {
          return;
        }
        readUpdateReloadLastRunRef.current[uiRoom] = now;

        setMessages(prev => {
          const roomMessages = prev[uiRoom] || [];
          if (!roomMessages.length) return prev;
          const updated = roomMessages.map(msg => {
            const readBy = Array.isArray(msg.readBy) ? msg.readBy : [];
            if (!readerId || readBy.includes(readerId)) return msg;
            return { ...msg, readBy: [...readBy, readerId] };
          });
          return { ...prev, [uiRoom]: updated };
        });
      }
    };

    socket.on("chat_read_update", handleReadUpdate);

    const handleMessageRecalled = (payload: any) => {
      const targetTs = Number(payload?.timestamp || 0);
      if (!targetTs) return;
      setMessages(prev => {
        const next: Record<string, ChatMessage[]> = { ...prev };
        let changed = false;
        Object.entries(prev).forEach(([roomKey, msgs]) => {
          const updated = (msgs || []).map((msg) => {
            if (Number(msg?.timestamp || 0) !== targetTs) return msg;
            changed = true;
            return {
              ...msg,
              eventType: 'message_recalled',
              message: 'Tin nhan da duoc thu hoi',
              attachments: [],
              checkinMeta: undefined,
            } as ChatMessage;
          });
          next[roomKey] = updated;
        });
        return changed ? next : prev;
      });
    };

    socket.on('chat_message_recalled', handleMessageRecalled);

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
      socket.off?.('chat_history_app_snapshot', handleAdminSnapshot);
      socket.off?.("notification", handleNotification);
      socket.off?.("chat_message_deleted", handleMessageDeleted);
      socket.off?.('chat_guest_cleanup', handleGuestCleanup);
      socket.off?.("chat_read_update", handleReadUpdate);
      socket.off?.('chat_message_recalled', handleMessageRecalled);
      socket.off?.("user_typing", handleTyping);
    };
  }, [socket, isGuest, guestIdentity, guestPhone, appId, user.userId, activeChats, saveToLocalStorage, loadHistory, emitAutoOpenChat, applyAdminSnapshot, mapApiRoomToUiRoom, isDevUser]);
  
  // Load initial history for ALL rooms with messages in localStorage (not just activeChats)
  useEffect(() => {
    if (connected && appId && !isInitialized) {
      if (isInitializingRef.current) {
        return;
      }
      isInitializingRef.current = true;
      console.log(`📌 [ChatHistory] Starting initialization with connected=${connected}, appId="${appId}", isGuest=${isGuest}, userId=${user.userId}, isInitialized=${isInitialized}`);
      const initializeChat = async () => {
        try {
          // Hydrate all rooms with messages from localStorage for this user
          const userKey = isGuest ? guestIdentity : (user.userId || 'admin');
          const hydratedRooms = new Set<string>();
          for (let i = 0; i < localStorage.length; ++i) {
            const key = localStorage.key(i) || "";
            if (key.startsWith("chat_history_") && key.endsWith(String(userKey))) {
              // Extract room name
              const room = key.substring("chat_history_".length, key.length - String(userKey).length - 1);
              if (room) {
                hydratedRooms.add(room);
                const msgs = loadFromLocalStorage(room);
                if (msgs && msgs.length > 0) {
                  setMessages(prev => ({ ...prev, [room]: msgs }));
                }
              }
            }
          }

          // Also hydrate activeChats (in case any new rooms are opened)
          for (const room of activeChats) {
            if (!hydratedRooms.has(room)) {
              await loadHistoryRef.current?.(room);
            }
          }

          // Guest: restore unread counts from localStorage
          if (isGuest && guestIdentity) {
            try {
              const unreadKey = `chat_unread_${appId}`;
              const stored = localStorage.getItem(unreadKey);
              if (stored) {
                setUnreadCounts(JSON.parse(stored));
              }
            } catch (e) {
              console.warn('Failed to restore unread counts for guest:', e);
            }
          }

          // Admin: request snapshot to sync all rooms from server
          if (!isGuest && user.userId) {
            socket?.emit('request_chat_history_app_snapshot', appId);
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
  }, [connected, appId, isGuest, guestIdentity, user.userId, isInitialized, socket, activeChats, loadFromLocalStorage]);
  
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
        socket?.emit('request_chat_history_app_snapshot', appId);
        console.log(`✅ [ChatHistory] Requested socket snapshot refresh for appId="${appId}"`);
      } else if (isGuest && guestIdentity) {
        // For guest, reload their chat history
        await loadHistoryRef.current?.(guestIdentity, guestIdentity);
      }
    } catch (error) {
      console.error('❌ [ChatHistory] Failed to refresh messages:', error);
    }
  }, [connected, appId, isGuest, guestIdentity, user.userId, socket]);
  
  // Broadcast notification (CSM admin only)
  const broadcastNotification = useCallback((targetAppId: string, message: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error('Socket not connected'));
        return;
      }
      
      const isAdmin = !!user.dev || isSuperPermissionProfile(toPermissionBigInt((user as any).permissionBitfield));
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
    recallMessage,
  };
  
  return (
    <ChatHistoryContext.Provider value={value}>
      {children}
    </ChatHistoryContext.Provider>
  );
};
