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
  
  const { socket, connected } = useSocket();
  const user = useUserStore();
  // CRITICAL: Use same pattern as permission.ts for getting effective appId
  // Priority: user.app_id (from login) > store.currentAppId (from AppStore) > fallback to "csm"
  // IMPORTANT: Wrap in useMemo to stable appId and prevent unnecessary re-calculations
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
    source: 'message' | 'notification';
  }) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('csm-chat-auto-open', { detail }));
  }, []);
  
  const guestIdentity = useMemo(
    () => (guestSessionId || guestPhone || "").trim(),
    [guestSessionId, guestPhone]
  );

  const isPhoneLike = useCallback((val?: string) => !!val && /^(\+?\d[\d\s\-]{7,})$/.test(val), []);

  const isGuestConversationKey = useCallback((value?: string) => {
    if (!value) return false;
    return value !== appId && value !== 'csm' && !value.includes(':');
  }, [appId]);

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
    // ONLY guest loads from localStorage for offline support
    // Admin ALWAYS loads fresh from server for real-time data
    if (isGuest) {
      const localMessages = loadFromLocalStorage(room);
      if (localMessages.length > 0) {
        console.log(`💾 [ChatHistory] Guest restored ${localMessages.length} messages from localStorage for room: ${room}`);
        setMessages(prev => ({ ...prev, [room]: localMessages }));
      }
    }
    
    // Then load from server (always for both guest and admin)
    try {
      let history: ChatMessage[] = [];
      
      if (isGuest && (guestIdentity || guestIdentityOverride)) {
        const identity = guestIdentityOverride || guestIdentity || ensureGuestSessionId();
        history = await (window as any).loadGuestChatHistory?.(appId, identity, 100, guestPhone) || [];
        if (history && Array.isArray(history) && history.length > 0) {
          console.log(`📥 [ChatHistory] Loaded ${history.length} messages from server for guest ${identity}`);
          setMessages(prev => ({ ...prev, [room]: history }));
          saveToLocalStorage(room, history);
        }
      } else if (!isGuest) {
        // Admin: load based on room type
        if (guestIdentityOverride && isGuestConversationKey(guestIdentityOverride)) {
          history = await (window as any).loadGuestChatHistory?.(appId, guestIdentityOverride, 200) || [];
          const guestRoom = guestIdentityOverride;
          if (history && Array.isArray(history) && history.length > 0) {
            console.log(`📥 [ChatHistory] Admin loaded ${history.length} messages from server for guest ${guestIdentityOverride}`);
            setMessages(prev => ({ ...prev, [guestRoom]: history }));
            // No localStorage save for admin
          }
        } else if (room === 'csm') {
          // Load system chat (room = "csm" is the system room name)
          history = await (window as any).loadAdminChatHistory?.(room, 100, appId) || [];
          if (history && Array.isArray(history) && history.length > 0) {
            console.log(`📥 [ChatHistory] Admin loaded ${history.length} messages from server for system room`);
            setMessages(prev => ({ ...prev, [room]: history }));
            // No localStorage save for admin
          }
        } else if (room === appId) {
          // Load internal app room (messages between users in this app) - use getChatHistoryApp
          const appHistory = await (window as any).loadAllAppChatHistory?.(appId, 200) || {};
          console.log('📥 [ChatHistory] loadAllAppChatHistory response:', appHistory);
          // appHistory structure: {appId, messages, count}
          const msgs = appHistory.messages || [];
          console.log(`📥 [ChatHistory] Admin loaded ${msgs.length} messages for appId "${appId}"`);
          if (msgs.length > 0) {
            console.log('📥 [ChatHistory] Sample messages:', msgs.slice(0, 2));
            setMessages(prev => ({ ...prev, [appId]: msgs }));
            // No localStorage save for admin
          }
        } else {
          // Load by room (backward compatibility for other rooms)
          history = await (window as any).loadAdminChatHistory?.(room, 100, appId) || [];
          if (history && Array.isArray(history) && history.length > 0) {
            console.log(`📥 [ChatHistory] Admin loaded ${history.length} messages from server for room ${room}`);
            setMessages(prev => ({ ...prev, [room]: history }));
            // No localStorage save for admin
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load chat history from server:', error);
    }
  }, [isGuest, guestIdentity, ensureGuestSessionId, guestPhone, appId, loadFromLocalStorage, saveToLocalStorage, isGuestConversationKey]);
  
  // Update loadHistory ref whenever it changes (for initialization to use latest)
  useEffect(() => {
    loadHistoryRef.current = loadHistory;
  }, [loadHistory]);
  
  // Send message
  const sendMessage = useCallback((room: string, message: string, to?: string) => {
    if (!socket || !message.trim()) return;
    
    const isAdminUser = !!user.dev || (user.roles && user.roles.includes("admin"));
    
    // Determine target guestPhone for admin->guest messages
    // If room looks like a phone number, it's a guest identifier
    const targetGuestIdentity = isAdminUser && isGuestConversationKey(room) ? room : undefined;
    
    // 🔴 CRITICAL FIX: For guest user, extract guestPhone from room parameter
    // When InternalChatBox calls sendMessage, it passes guestPhone as room for guests
    // Also check localStorage as backup for stale state issue
    let effectiveGuestIdentity = guestIdentity || ensureGuestSessionId();
    if (isGuest && room && isGuestConversationKey(room)) {
      effectiveGuestIdentity = room;
    }
    
    // Determine actual backend room based on user type
    let actualRoom = room;
    if (isGuest && effectiveGuestIdentity) {
      // Guest always uses their private guest room
      actualRoom = `guest:${appId};${effectiveGuestIdentity}`;
    } else if (isAdminUser) {
      if (targetGuestIdentity) {
        // Admin → specific guest
        actualRoom = `guest:${appId};${targetGuestIdentity}`;
      } else if (to) {
        // Admin → specific user
        actualRoom = `user:${appId};${to}`;
      } else {
        // Admin → broadcast to app
        actualRoom = `app:${appId}`;
      }
    } else if (user.userId) {
      // Authenticated user
      if (to) {
        // User → specific user (private chat)
        const ids = [user.userId, to].sort();
        actualRoom = `private:${appId};${ids.join(';')}`;
      } else {
        // User → all users in app
        actualRoom = `app:${appId}`;
      }
    }
    
    const msg: ChatMessage = {
      room: actualRoom,
      username: isGuest ? (guestPhone || "Guest") : (user.username || "Admin"),
      userId: user.userId,
      avatar: user.avatar,
      isAdmin: isAdminUser,
      message: message.trim(),
      eventType: undefined,
      readBy: [],
      appId,
      to,
      guestPhone: isGuest ? (guestPhone || "") : undefined,
      guestSessionId: isGuest ? (effectiveGuestIdentity || "") : (targetGuestIdentity || undefined),
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
      isGuest,
      actualRoom,
      uiRoom: room,
      guestPhone: msg.guestPhone,
      guestSessionId: msg.guestSessionId,
      message: msg.message.substring(0, 50)
    });
  }, [socket, user, isGuest, guestIdentity, guestPhone, ensureGuestSessionId, appId, saveToLocalStorage, isGuestConversationKey]);
  
  // Mark as read with refresh
  const markAsRead = useCallback((room: string) => {
    if (!socket) return;
    
    console.log(`📖 [ChatHistory] Marking room as read: ${room}`);
    
    if (isGuest && guestIdentity) {
      (window as any).markGuestMessagesAsRead?.(appId, guestIdentity).then(() => {
        // Reload history to refresh readBy flags
        loadHistoryRef.current?.(room, guestIdentity).catch((err: any) => {
          console.warn("Failed to reload history after marking as read", err);
        });
      }).catch((err: any) => {
        console.warn("Failed to mark guest messages as read", err);
      });
    } else if (!isGuest && user.userId) {
      // For admin: infer actual room for API call
      let apiRoom = room;
      if (isGuestConversationKey(room)) {
        apiRoom = `guest:${appId};${room}`;
      } else if (!room.includes(':') && room !== appId) {
        // Normalize room names for API
        apiRoom = room;
      }
      
      (window as any).markAllMessagesAsRead?.(apiRoom, user.userId).then(() => {
        // Reload history to refresh readBy flags
        loadHistoryRef.current?.(room).catch((err: any) => {
          console.warn("Failed to reload history after marking as read", err);
        });
      }).catch((err: any) => {
        console.warn("Failed to mark admin messages as read", err);
      });
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
  }, [socket, isGuest, guestIdentity, appId, user.userId, loadHistoryRef, isGuestConversationKey]);
  
  // Open/close chat
  const openChat = useCallback((room: string) => {
    setActiveChats(prev => [...new Set([...prev, room])]);
    loadHistory(room);
  }, [loadHistory]);
  
  const closeChat = useCallback((room: string) => {
    setActiveChats(prev => prev.filter(r => r !== room));
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
      const isAdminUser = !!user.dev || (user.roles && user.roles.includes("admin"));
      
      const joinData: ChatMessage = {
        room: appId, // Will be processed by backend based on isAdmin/guestPhone
        username: user.username || (isGuest ? guestPhone || guestIdentity : "Admin"),
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
        isAdmin: isAdminUser,
        isGuest,
        guestPhone,
        guestSessionId: guestIdentity,
        appId,
        room: isAdminUser ? `app:${appId}` : isGuest ? `guest:${appId};${guestIdentity}` : appId
      });
    }
  }, [socket, connected, appId, user, isGuest, guestPhone, guestIdentity]);
  
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
        targetRoom = appId;
      } else {
        // Admin: nhận msg từ guest hoặc msg của mình
        if (msg.guestSessionId || msg.guestPhone) {
          targetRoom = (msg.guestSessionId || msg.guestPhone)!;
        } else if (msg.to && msg.userId !== user.userId) {
          // Msg tới người khác
          return;
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

        if (!activeChats.includes(targetRoom) && !isOwnMessage) {
          emitAutoOpenChat({
            targetRoom,
            appId,
            username: msg.username,
            guestPhone: msg.guestPhone,
            guestSessionId: msg.guestSessionId,
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
  }, [socket, isGuest, guestIdentity, guestPhone, appId, user.userId, activeChats, saveToLocalStorage, loadHistory, emitAutoOpenChat]);
  
  // Load initial history khi connect
  useEffect(() => {
    if (connected && appId && !isInitialized) {
      console.log(`📌 [ChatHistory] Starting initialization with connected=${connected}, appId="${appId}", isGuest=${isGuest}, userId=${user.userId}, isInitialized=${isInitialized}`);
      const initializeChat = async () => {
        try {
          if (isGuest && guestIdentity) {
            // Guest: restore chat history + unread từ localStorage
            await loadHistoryRef.current?.(appId);
            
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
              const guestsList = await (window as any).loadChatGuestsList?.(appId) || [];
              console.log(`📱 [ChatHistory] Loaded guests list for appId "${appId}":`, guestsList);
              
              // 3. Load lịch sử chat cho từng guest
              if (guestsList && Array.isArray(guestsList) && guestsList.length > 0) {
                console.log(`📱 [ChatHistory] Loading history for ${guestsList.length} guests...`);
                for (const guestIdentityValue of guestsList) {
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
        const guestsList = await (window as any).loadChatGuestsList?.(appId) || [];
        console.log(`✅ [ChatHistory] Refreshed ${guestsList.length} conversations`);
        
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
        await loadHistoryRef.current?.(appId, guestIdentity);
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
