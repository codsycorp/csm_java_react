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
  
  const { socket, connected } = useSocket();
  const user = useUserStore();
  // CRITICAL: Use same pattern as permission.ts for getting effective appId
  // Priority: user.app_id (from login) > store.currentAppId (from AppStore) > fallback to "csm"
  const appId = useMemo(
    () => (user.app_id || "").trim() || useAppStore.getState().getCurrentAppId() || "csm",
    [user.app_id]
  );
  const { guestPhone, isGuest } = useGuestPhone();
  
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
  
  // Helper: Get localStorage key
  const getStorageKey = useCallback((room: string) => {
    return `chat_history_${room}_${isGuest ? guestPhone : user.userId || 'admin'}`;
  }, [isGuest, guestPhone, user.userId]);
  
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
  const loadHistory = useCallback(async (room: string, guestPhoneOverride?: string) => {
    // ONLY guest loads from localStorage for offline support
    // Admin ALWAYS loads fresh from server for real-time data
    if (isGuest) {
      const localMessages = loadFromLocalStorage(room);
      if (localMessages.length > 0) {
        console.log(`💾 [ChatHistory] Guest restored ${localMessages.length} messages from localStorage for room: ${room}`);
        setMessages(prev => ({ ...prev, [room]: localMessages }));
      }
    }
    
    // LMKT: Only guest mode - load chat history for guest
    try {
      // In lmkt, only guest mode exists - always use loadGuestChatHistory
      const phone = guestPhoneOverride || guestPhone;
      
      if (!phone) {
        console.log('📥 [ChatHistory] Guest phone not available yet, skipping history load');
        return;
      }
      
      const history = await (window as any).loadGuestChatHistory?.(appId, phone, 100) || [];
      if (history && Array.isArray(history) && history.length > 0) {
        console.log(`📥 [ChatHistory] Loaded ${history.length} messages from server for guest ${phone}`);
        setMessages(prev => ({ ...prev, [room]: history }));
        saveToLocalStorage(room, history);
      }
    } catch (error) {
      console.warn('Failed to load chat history from server:', error);
    }
  }, [isGuest, guestPhone, appId, loadFromLocalStorage, saveToLocalStorage]);
  
  // Update loadHistory ref whenever it changes (for initialization to use latest)
  useEffect(() => {
    loadHistoryRef.current = loadHistory;
  }, [loadHistory]);
  
  // Send message - LMKT: Guest only
  const sendMessage = useCallback((room: string, message: string, to?: string) => {
    if (!socket || !message.trim()) return;
    
    // ⚠️ CRITICAL: For guest, extract phone from room parameter if provided (stale state workaround)
    // This handles case where setGuestPhone is async and state not ready yet
    const isPhoneLike = (val?: string) => !!val && /^(\+?\d[\d\s\-]{7,})$/.test(val);
    let effectivePhone = guestPhone;
    
    if (isPhoneLike(room)) {
      // room parameter is phone number - use it directly
      effectivePhone = room;
    } else if (!effectivePhone && typeof window !== 'undefined') {
      // Fallback to localStorage
      const stored = localStorage.getItem(`csm_guest_phone_${appId}`);
      if (stored) {
        effectivePhone = stored;
        console.log(`📱 [ChatHistory] Using stored phone from localStorage: ${effectivePhone}`);
      }
    }
    
    if (!effectivePhone) {
      console.warn('❌ [ChatHistory] No phone number available for sending message');
      return;
    }
    
    // Guest always uses their private guest room
    const actualRoom = `guest:${appId};${effectivePhone}`;
    
    const msg: ChatMessage = {
      room: actualRoom,
      username: effectivePhone,
      userId: undefined,
      avatar: undefined,
      isAdmin: false,
      message: message.trim(),
      eventType: undefined,
      readBy: [],
      appId,
      to,
      guestPhone: effectivePhone,
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
      appId,
      actualRoom,
      uiRoom: room,
      message: msg.message.substring(0, 50)
    });
  }, [socket, guestPhone, appId, saveToLocalStorage]);
  
  // Mark as read - LMKT: Guest only
  const markAsRead = useCallback((room: string) => {
    if (!socket || !guestPhone) return;
    
    // LMKT: Only guest mode
    (window as any).markGuestMessagesAsRead?.(appId, guestPhone).catch((err: any) => {
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
  }, [socket, guestPhone, appId]);
  
  // Open/close chat
  const openChat = useCallback((room: string) => {
    setActiveChats(prev => [...new Set([...prev, room])]);
    loadHistory(room);
  }, [loadHistory]);
  
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
    if (socket && connected && guestPhone) {
      const joinData: ChatMessage = {
        room: appId, // Backend will create guest:appId:phone room
        username: guestPhone,
        userId: undefined,
        avatar: undefined,
        isAdmin: false,
        message: "",
        eventType: undefined,
        readBy: [],
        appId,
        guestPhone,
      };
      socket.emit("join", joinData);
      
      console.log(`🔌 [ChatHistory] Guest joined:`, {
        appId,
        guestPhone,
        room: `guest:${appId};${guestPhone}`
      });
    }
  }, [socket, connected, appId, guestPhone]);
  
  // Listen for messages
  useEffect(() => {
    if (!socket) return;
    
    const handleMessage = (msg: ChatMessage) => {
      // LMKT: Guest only - only accept messages for this guest
      if (!guestPhone) return;
      
      // Only accept messages for this guest
      if (msg.to !== guestPhone && msg.guestPhone !== guestPhone) {
        return;
      }
      
      // Only accept messages from current appId
      if (msg.appId !== appId) {
        console.log(`🚫 [ChatHistory] Rejected message from different appId: ${msg.appId} (current: ${appId})`);
        return;
      }
      
      // Use appId as targetRoom for guest
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
        
        // Update unread count if chat not active (messages from admin)
        if (!activeChats.includes(targetRoom) && msg.guestPhone !== guestPhone) {
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
  }, [socket, guestPhone, appId, activeChats, saveToLocalStorage, loadHistory]);
  
  // Load initial history khi connect - LMKT: Guest only
  useEffect(() => {
    if (connected && appId && guestPhone && !isInitialized) {
      const initializeChat = async () => {
        try {
          // LMKT: Only guest mode - restore chat history + unread from localStorage
          await loadHistoryRef.current?.(appId);
          
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
          setIsInitialized(true);
        }
      };
      
      initializeChat();
    }
  }, [connected, appId, guestPhone, isInitialized]);
  
  const value: ChatHistoryContextValue = {
    messages,
    sendMessage,
    loadHistory,
    markAsRead,
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
