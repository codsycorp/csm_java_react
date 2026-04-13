/**
 * Chat Helper APIs cho Web WU_ và Admin Dashboard
 * Các functions này sử dụng CsmApi để gọi backend
 */

import { getChatHistory, getChatHistoryGuest, getChatHistoryApp, getChatGuestsList, getChatHistoryWithAppId, markChatAsReadGuest, markChatAsReadAll, deleteChatMessage } from '#src/components/csm-grid/CsmApi';

const CHAT_HISTORY_TTL_MS = 8000;
const CHAT_GUESTS_LIST_TTL_MS = 10000;
const CHAT_RATE_LIMIT_BACKOFF_MS = 30000;
const SOCKET_ACK_TIMEOUT_MS = 6000;
const chatHistoryInFlight = new Map<string, Promise<any>>();
const chatHistoryCache = new Map<string, { expiresAt: number; data: any }>();
const chatRateLimitBackoff = new Map<string, number>();

function extractHttpStatus(errorLike: any): number | undefined {
  return errorLike?.response?.status
    || errorLike?.error?.response?.status
    || errorLike?.status
    || errorLike?.error?.status;
}

function isRateLimitedError(errorLike: any): boolean {
  const status = extractHttpStatus(errorLike);
  if (status === 429) return true;
  const msg = String(errorLike?.message || errorLike?.error?.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('too many requests') || msg.includes('rate limit');
}

function inBackoffWindow(key: string): boolean {
  const until = chatRateLimitBackoff.get(key) || 0;
  return Date.now() < until;
}

function markRateLimitBackoff(key: string) {
  chatRateLimitBackoff.set(key, Date.now() + CHAT_RATE_LIMIT_BACKOFF_MS);
}

function getRealtimeSocket(): any | null {
  if (typeof window === 'undefined') return null;
  return (window as any).__socketInstance || null;
}

function emitWithAck<T = any>(event: string, payload: any, fallbackValue: T): Promise<T> {
  return new Promise((resolve) => {
    const socket = getRealtimeSocket();
    if (!socket || typeof socket.emit !== 'function' || !socket.connected) {
      resolve(fallbackValue);
      return;
    }

    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallbackValue);
    }, SOCKET_ACK_TIMEOUT_MS);

    try {
      socket.emit(event, payload, (ackData: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(ackData as T);
      });
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        resolve(fallbackValue);
      }
    }
  });
}

function parseSocketJson<T>(raw: any, fallback: T): T {
  try {
    if (Array.isArray(raw) || (raw && typeof raw === 'object')) {
      return raw as T;
    }
    if (typeof raw === 'string' && raw.trim()) {
      return JSON.parse(raw) as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

async function guardedHistoryRequest<T>(key: string, fetcher: () => Promise<T>, fallback: T): Promise<T> {
  if (inBackoffWindow(key)) {
    return fallback;
  }

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
    } catch (error: any) {
      if (isRateLimitedError(error)) {
        markRateLimitBackoff(key);
      }
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
    const trimmedIdentity = String(guestIdentity || '').trim();
    const looksLikePhone = /^\+?\d[\d\s-]{7,}$/.test(trimmedIdentity);
    const socketRaw = await emitWithAck<any>('chat_history_guest', {
      appId,
      guestSessionId: looksLikePhone ? '' : trimmedIdentity,
      guestPhone: looksLikePhone ? trimmedIdentity : (guestPhone || ''),
    }, '[]');
    const socketHistory = parseSocketJson<any[]>(socketRaw, []);
    if (Array.isArray(socketHistory) && socketHistory.length > 0) {
      return socketHistory;
    }

    const response = await getChatHistoryGuest(appId, guestIdentity, limit, guestPhone);
    if (response?.success && response.data?.messages) {
      return response.data.messages;
    }
    if (isRateLimitedError(response)) {
      markRateLimitBackoff(key);
      return [];
    }
    console.warn('Failed to load guest chat history:', response?.message || response?.error || response);
    return [];
  }, []);
}

/**
 * Load lịch sử chat cho admin (theo room)
 */
export async function loadAdminChatHistory(room: string, limit: number = 100, appId?: string) {
  const key = `admin:${appId || 'default'}:${room}:${limit}`;
  return guardedHistoryRequest(key, async () => {
    const socketRaw = await emitWithAck<any>('chat_history', room, '[]');
    const socketHistory = parseSocketJson<any[]>(socketRaw, []);
    if (Array.isArray(socketHistory) && socketHistory.length > 0) {
      return socketHistory;
    }

    const response = appId
      ? await getChatHistoryWithAppId(room, appId, limit)
      : await getChatHistory(room, limit);
    if (response?.success && response.data?.messages) {
      return response.data.messages;
    }
    if (isRateLimitedError(response)) {
      markRateLimitBackoff(key);
      return [];
    }
    console.warn('Failed to load admin chat history:', response?.message || response?.error || response);
    return [];
  }, []);
}

/**
 * Load tất cả chat history trong app (admin view)
 */
export async function loadAllAppChatHistory(appId: string, limit: number = 200) {
  const key = `app:${appId}:${limit}`;
  return guardedHistoryRequest(key, async () => {
    const socketRaw = await emitWithAck<any>('chat_history_app', appId, '[]');
    const socketHistory = parseSocketJson<any[]>(socketRaw, []);
    if (Array.isArray(socketHistory) && socketHistory.length > 0) {
      return { messages: socketHistory };
    }

    const response = await getChatHistoryApp(appId, limit);
    if (response?.success && response.data) {
      return response.data;
    }
    if (isRateLimitedError(response)) {
      markRateLimitBackoff(key);
      return {};
    }
    console.warn('Failed to load app chat history:', response?.message || response?.error || response);
    return {};
  }, {});
}

/**
 * Load danh sách guests đã chat
 */
export async function loadChatGuestsList(appId: string) {
  const key = `guests:${appId}`;
  if (inBackoffWindow(key)) {
    return (chatHistoryCache.get(key)?.data as any[]) || [];
  }

  const now = Date.now();
  const cached = chatHistoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const inFlight = chatHistoryInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async () => {
    try {
      const socketRaw = await emitWithAck<any>('chat_guests_list', appId, '[]');
      const socketGuests = parseSocketJson<any[]>(socketRaw, []);
      if (Array.isArray(socketGuests) && socketGuests.length > 0) {
        chatHistoryCache.set(key, {
          expiresAt: Date.now() + CHAT_GUESTS_LIST_TTL_MS,
          data: socketGuests,
        });
        return socketGuests;
      }

      const response = await getChatGuestsList(appId);
      if (response?.success && response.data?.guests) {
        const guests = Array.isArray(response.data.guests) ? response.data.guests : [];
        chatHistoryCache.set(key, {
          expiresAt: Date.now() + CHAT_GUESTS_LIST_TTL_MS,
          data: guests,
        });
        return guests;
      }

      if (isRateLimitedError(response)) {
        markRateLimitBackoff(key);
        return (chatHistoryCache.get(key)?.data as any[]) || [];
      }

      return [];
    } catch (error) {
      if (isRateLimitedError(error)) {
        markRateLimitBackoff(key);
        return (chatHistoryCache.get(key)?.data as any[]) || [];
      }
      console.warn('Failed to load chat guests list:', error);
      return [];
    } finally {
      chatHistoryInFlight.delete(key);
    }
  })();

  chatHistoryInFlight.set(key, promise);
  return promise;
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
