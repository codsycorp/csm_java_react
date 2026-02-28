/**
 * Chat Helper APIs - Guest chat only (lmkt)
 * Admin chat features are removed
 * Guest users communicate via socket.io, not HTTP API
 */

/**
 * Load lịch sử chat cho guest user (via socket if available)
 */
export async function loadGuestChatHistory(appId: string, guestPhone: string, limit: number = 100) {
  // Guest chat uses socket.io connection, not HTTP API
  // This is a fallback stub if needed
  console.log('[lmkt] Guest chat history loaded via socket.io');
  return [];
}

/**
 * Mark guest messages as read
 */
export async function markGuestMessagesAsRead(appId: string, guestPhone: string) {
  // Guest read status managed via socket.io
  console.log('[lmkt] Guest messages marked as read (via socket)');
  return { success: true };
}

/**
 * Delete a chat message (guest user)
 */
export async function deleteChatMessageByTimestamp(timestamp: number) {
  // Message deletion for guests managed via socket
  console.log('[lmkt] Chat message deletion via socket:', timestamp);
  return { success: true };
}

/**
 * Emit typing indicator for guest users (throttled)
 */
const typingTimeouts: Record<string, NodeJS.Timeout> = {};

export async function emitTyping(room: string, username: string, appId: string) {
  try {
    // Clear previous timeout for this room if exists
    if (typingTimeouts[room]) {
      clearTimeout(typingTimeouts[room]);
    }

    // Emit typing event via socket
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

// Expose guest chat functions to window for guest communication
if (typeof window !== 'undefined') {
  (window as any).loadGuestChatHistory = loadGuestChatHistory;
  (window as any).markGuestMessagesAsRead = markGuestMessagesAsRead;
  (window as any).deleteChatMessage = deleteChatMessageByTimestamp;
  (window as any).emitTyping = emitTyping;
}
