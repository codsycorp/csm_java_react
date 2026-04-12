import type { ButtonProps } from "antd";
import type { NotificationItem } from "./types";

import { fetchNotifications } from "#src/api/notifications";
import { useEffect, useState } from "react";
import { NotificationPopup } from "./index";
import { useSocket } from "#src/hooks/useSocket";
import { useUserStore } from "#src/store/user";
import { useAppStore } from "#src/store/app";
import type { ChatMessage } from "#src/model/ChatMessage";

export function NotificationContainer({ ...restProps }: ButtonProps) {
       const [notifications, setNotifications] = useState<NotificationItem[]>([]);
       const { socket, connected } = useSocket();
       const user = useUserStore();
       // CRITICAL: Use same pattern as permission.ts for getting effective appId
       // Priority: user.app_id (from login) > store.currentAppId (from AppStore) > fallback to "csm"
       const appId = (user.app_id || "").trim() || useAppStore.getState().getCurrentAppId() || "csm";
	   const isPortalUser = !!String(user?.userId || '').trim();

	       useEffect(() => {
		       fetchNotifications().then((res) => {
			       const safe = Array.isArray(res?.result) ? res.result : [];
			       setNotifications(safe);
		       });
	       }, []);

	       // Initial chat history is now delivered from backend via socket snapshot in ChatHistoryContext.
	       // Keep NotificationContainer focused on realtime incremental updates only.

	       // Lắng nghe tin nhắn chat mới từ guest users
	       useEffect(() => {
		       if (!socket || !isPortalUser) return;
		       const getGuestKey = (msg: ChatMessage) => (msg.guestSessionId || msg.guestPhone || '').trim();
		       const isSystemGuestEvent = (eventType?: string) => {
			       const normalized = String(eventType || '').trim().toLowerCase();
			       return normalized.startsWith('ai_auto_welcome') || normalized === 'guest_auto_welcome_alert';
		       };
		       const handler = (msg: ChatMessage) => {
			       // Chỉ nhận tin nhắn từ guest trong appId hiện tại
			       if (msg.appId === appId && getGuestKey(msg) && (!msg.isAdmin || isSystemGuestEvent(msg.eventType))) {
				       setNotifications(prev => {
					       // Kiểm tra duplicate
					       const guestKey = getGuestKey(msg);
					       const isDuplicate = prev.some(n => 
						       n.type === 'chat' && 
						       n.message === msg.message && 
						       (n.guestSessionId || n.guestPhone) === guestKey &&
						       Math.abs(new Date(n.date).getTime() - (msg.timestamp || Date.now())) < 2000
					       );
					       if (isDuplicate) return prev;
					       
					       return [
						       {
							       avatar: msg.avatar || '',
							       date: new Date(msg.timestamp || Date.now()).toLocaleString(),
							       isRead: false,
							       message: msg.message,
							       title: msg.guestPhone || msg.username || 'Khách mới',
							       type: 'chat',
							       roomId: msg.room,
							       fromUserId: msg.userId,
							       guestPhone: msg.guestPhone,
							       guestSessionId: msg.guestSessionId,
							       appId: msg.appId,
						       },
						       ...prev
					       ];
				       });
			       }
		       };
		       socket.on("message", handler);
		       return () => { socket.off && socket.off("message", handler); };
	       }, [socket, isPortalUser, appId]);

       useEffect(() => {
	       if (!socket) return;
	       // Lắng nghe event "notification" và map về NotificationItem thống nhất
	       const handler = (data: NotificationItem | ChatMessage) => {
		       const msg = data as ChatMessage;
		       const guestKey = (msg.guestSessionId || msg.guestPhone || '').trim();
		       if (isPortalUser && msg.appId && msg.appId !== appId) {
			       return;
		       }
		       // Nếu notification là chat event có guest -> đưa vào danh sách chat notifications
		       if (guestKey) {
			       const title = msg.guestPhone || msg.username || 'Khách mới';
			       const date = new Date(msg.timestamp || Date.now()).toLocaleString();
			       setNotifications(prev => {
				       const duplicated = prev.some((n) =>
					       n.type === 'chat'
					       && (n.guestSessionId || n.guestPhone) === guestKey
					       && n.message === String(msg.message || '')
					       && Math.abs(new Date(n.date).getTime() - Number(msg.timestamp || Date.now())) < 2000
				       );
				       if (duplicated) return prev;
				       return [{
					       avatar: msg.avatar || '',
					       date,
					       isRead: false,
					       message: String(msg.message || ''),
					       title,
					       type: 'chat',
					       roomId: msg.room,
					       fromUserId: msg.userId,
					       guestPhone: msg.guestPhone,
					       guestSessionId: msg.guestSessionId,
					       appId: msg.appId,
				       }, ...prev];
			       });
			       return;
		       }

		       // fallback notification item thường
		       const safe = data as NotificationItem;
		       if (!safe || !safe.message) return;
		       setNotifications((prev) => [safe, ...prev]);
	       };
		       socket.on("notification", handler);
		       return () => {
			       if (typeof socket.off === "function") {
				       socket.off("notification", handler);
			       }
		       };
	       }, [socket, isPortalUser, appId]);

	       // Backend cleanup event: remove transient guest notifications immediately
	       useEffect(() => {
		       if (!socket || !isPortalUser) return;

		       const cleanupHandler = (payload: any) => {
			       const cleanupAppId = String(payload?.appId || '').trim();
			       if (!cleanupAppId || cleanupAppId !== appId) return;

			       const guestSessionId = String(payload?.guestSessionId || '').trim();
			       const guestPhone = String(payload?.guestPhone || '').trim();
			       if (!guestSessionId && !guestPhone) return;

			       setNotifications(prev => prev.filter((n) => {
				       if (n.type !== 'chat') return true;
				       const itemGuestSessionId = String(n.guestSessionId || '').trim();
				       const itemGuestPhone = String(n.guestPhone || '').trim();
				       const matched = (guestSessionId && itemGuestSessionId === guestSessionId)
					       || (guestPhone && itemGuestPhone === guestPhone);
				       return !matched;
			       }));
		       };

		       socket.on('chat_guest_cleanup', cleanupHandler);
		       return () => {
			       if (typeof socket.off === 'function') {
				       socket.off('chat_guest_cleanup', cleanupHandler);
			       }
		       };
	       }, [socket, isPortalUser, appId]);

       return (
	       <NotificationPopup
		       notifications={notifications}
		       setNotifications={setNotifications}
		       {...restProps}
	       />
       );
}
