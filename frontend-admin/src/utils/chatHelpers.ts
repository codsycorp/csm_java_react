/**
 * Chat Helper APIs cho Web WU_ và Admin Dashboard
 * Các functions này sử dụng CsmApi để gọi backend
 */

import { getChatHistory, getChatHistoryGuest, getChatHistoryApp, getChatGuestsList, getChatHistoryWithAppId, markChatAsReadGuest, markChatAsReadAll, deleteChatMessage } from '#src/components/csm-grid/CsmApi';

const CHAT_HISTORY_TTL_MS = 1500;
const chatHistoryInFlight = new Map<string, Promise<any>>();
const chatHistoryCache = new Map<string, { expiresAt: number; data: any }>();

async function guardedHistoryRequest<T>(key: string, fetcher: () => Promise<T>, fallback: T): Promise<T> {
  const now = Date.now();
  const cached = chatHistoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }

  const inFlight = chatHistoryInFlight.get(key);
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  const promise = (async () => {
    try {
      const data = await fetcher();
      chatHistoryCache.set(key, { expiresAt: Date.now() + CHAT_HISTORY_TTL_MS, data });
      return data;
    } catch {
      return fallback;
    } finally {
      chatHistoryInFlight.delete(key);
    }
  })();

  chatHistoryInFlight.set(key, promise);
  return promise;
}

/**
 * Load danh sách tất cả apps từ sys_apps (cho CSM admin broadcast)
 */
export async function loadAppsList() {
  try {
    const response = await fetch('/api/apps-list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });
    const data = await response.json();
    if (data?.success && data.data) {
      return data.data;
    }
    return [];
  } catch (error) {
    console.warn('Failed to load apps list:', error);
    return [];
  }
}

/**
 * Load lịch sử chat cho guest user
 */
export async function loadGuestChatHistory(appId: string, guestIdentity: string, limit: number = 100, guestPhone?: string) {
  const key = `guest:${appId}:${guestIdentity}:${guestPhone || ''}:${limit}`;
  return guardedHistoryRequest(key, async () => {
    try {
      const response = await getChatHistoryGuest(appId, guestIdentity, limit, guestPhone);
      if (response?.success && response.data?.messages) {
        return response.data.messages;
      }
      return [];
    } catch (error) {
      console.warn('Failed to load guest chat history:', error);
      return [];
    }
  }, []);
}

/**
 * Load lịch sử chat cho admin (theo room)
 */
export async function loadAdminChatHistory(room: string, limit: number = 100, appId?: string) {
  const key = `admin:${appId || 'default'}:${room}:${limit}`;
  return guardedHistoryRequest(key, async () => {
    try {
      const response = appId
        ? await getChatHistoryWithAppId(room, appId, limit)
        : await getChatHistory(room, limit);
      if (response?.success && response.data?.messages) {
        return response.data.messages;
      }
      return [];
    } catch (error) {
      console.warn('Failed to load admin chat history:', error);
      return [];
    }
  }, []);
}

/**
 * Load tất cả chat history trong app (admin view)
 */
export async function loadAllAppChatHistory(appId: string, limit: number = 200) {
  const key = `app:${appId}:${limit}`;
  return guardedHistoryRequest(key, async () => {
    try {
      const response = await getChatHistoryApp(appId, limit);
      if (response?.success && response.data) {
        return response.data;
      }
      return {};
    } catch (error) {
      console.warn('Failed to load app chat history:', error);
      return {};
    }
  }, {});
}

/**
 * Load danh sách guests đã chat
 */
export async function loadChatGuestsList(appId: string) {
  try {
    const response = await getChatGuestsList(appId);
    if (response?.success && response.data?.guests) {
      return response.data.guests;
    }
    return [];
  } catch (error) {
    console.warn('Failed to load chat guests list:', error);
    return [];
  }
}

/**
 * Mark messages as read cho guest
 */
export async function markGuestMessagesAsRead(appId: string, guestIdentity: string) {
  try {
    const response = await markChatAsReadGuest(appId, guestIdentity);
    return response;
  } catch (error) {
    console.warn('Failed to mark guest messages as read:', error);
    return { success: false };
  }
}

/**
 * Mark all messages in room as read (admin)
 */
export async function markAllMessagesAsRead(room: string, userId: string) {
  try {
    const response = await markChatAsReadAll(room, userId);
    return response;
  } catch (error) {
    console.warn('Failed to mark all messages as read:', error);
    return { success: false };
  }
}

/**
 * Emit typing indicator to a room (throttled to prevent spam)
 */
const typingTimeouts: Record<string, NodeJS.Timeout> = {};

export async function emitTyping(room: string, username: string, appId: string) {
  try {
    // Clear previous timeout for this room if exists
    if (typingTimeouts[room]) {
      clearTimeout(typingTimeouts[room]);
    }

    // Emit typing event
    const socket = (window as any).__socketInstance;
    if (socket && socket.emit) {
      socket.emit("user_typing", {
        room,
        username,
        appId,
        isTyping: true,
        timestamp: Date.now()
      });
    }

    // Auto-clear typing after 2 seconds of inactivity
    typingTimeouts[room] = setTimeout(() => {
      if (socket && socket.emit) {
        socket.emit("user_typing", {
          room,
          username,
          appId,
          isTyping: false,
          timestamp: Date.now()
        });
      }
      delete typingTimeouts[room];
    }, 2000);

  } catch (error) {
    console.warn('Failed to emit typing event:', error);
  }
}

/**
 * Delete a chat message by timestamp
 */
export async function deleteChatMessageByTimestamp(timestamp: number) {
  try {
    const response = await deleteChatMessage(timestamp);
    return response;
  } catch (error) {
    console.warn('Failed to delete chat message:', error);
    return { success: false, message: 'Failed to delete message' };
  }
}

// Expose lên window để dễ sử dụng
if (typeof window !== 'undefined') {
  (window as any).loadAppsList = loadAppsList;
  (window as any).loadGuestChatHistory = loadGuestChatHistory;
  (window as any).loadAdminChatHistory = loadAdminChatHistory;
  (window as any).loadAllAppChatHistory = loadAllAppChatHistory;
  (window as any).loadChatGuestsList = loadChatGuestsList;
  (window as any).markGuestMessagesAsRead = markGuestMessagesAsRead;
  (window as any).markAllMessagesAsRead = markAllMessagesAsRead;
  (window as any).deleteChatMessage = deleteChatMessageByTimestamp;
  (window as any).emitTyping = emitTyping;
}
