import type { ButtonProps } from "antd";
import type { NotificationItem } from "./types";

import { fetchNotifications } from "#src/api/notifications";
import { useEffect, useState, useRef } from "react";
import { NotificationPopup } from "./index";
import { useSocket } from "#src/hooks/useSocket";
import { useUserStore } from "#src/store/user";
import { useAppStore } from "#src/store/app";
import type { ChatMessage } from "#src/model/ChatMessage";

const NOTIFICATIONS_CACHE_TTL_MS = 30000;
const NOTIFICATIONS_429_BACKOFF_MS = 30000;
const notificationsCache = new Map<string, { expiresAt: number; data: NotificationItem[] }>();
const notificationsInFlight = new Map<string, Promise<NotificationItem[]>>();
const notificationsBackoffUntil = new Map<string, number>();

export function NotificationContainer({ ...restProps }: ButtonProps) {
       const [notifications, setNotifications] = useState<NotificationItem[]>([]);
       const { socket, connected } = useSocket();
       const user = useUserStore();
       // CRITICAL: Use same pattern as permission.ts for getting effective appId
       // Priority: user.app_id (from login) > store.currentAppId (from AppStore) > fallback to "csm"
       const appId = (user.app_id || "").trim() || useAppStore.getState().getCurrentAppId() || "csm";
       const isAdmin = !!user.dev || (user.roles && user.roles.includes("admin"));
       
       // Track which apps' chat history has been loaded to avoid duplicate requests
       const chatHistoryLoadedRef = useRef<Record<string, boolean>>({});

	       useEffect(() => {
		       if (isAdmin && connected && socket) {
			       return;
		       }

		       let disposed = false;
		       const cacheKey = appId || 'default';
		       const now = Date.now();

		       const cached = notificationsCache.get(cacheKey);
		       if (cached && cached.expiresAt > now) {
			       setNotifications(cached.data);
			       return () => {
				       disposed = true;
			       };
		       }

		       const backoffUntil = notificationsBackoffUntil.get(cacheKey) || 0;
		       if (now < backoffUntil) {
			       if (cached?.data?.length) {
				       setNotifications(cached.data);
			       }
			       return () => {
				       disposed = true;
			       };
		       }

		       const inFlight = notificationsInFlight.get(cacheKey);
		       const requestPromise = inFlight || fetchNotifications()
			       .then((res) => {
				       const result = Array.isArray(res?.result) ? res.result : [];
				       return Array.from({ length: 20 }).flatMap(() => result);
			       })
			       .catch((error: any) => {
				       const status = error?.response?.status;
				       if (status === 429) {
					       notificationsBackoffUntil.set(cacheKey, Date.now() + NOTIFICATIONS_429_BACKOFF_MS);
					       return (notificationsCache.get(cacheKey)?.data || []);
				       }
				       console.warn('[Notification] Failed to fetch notifications:', error);
				       return [];
			       })
			       .finally(() => {
				       notificationsInFlight.delete(cacheKey);
			       });

		       if (!inFlight) {
			       notificationsInFlight.set(cacheKey, requestPromise);
		       }

		       requestPromise.then((data) => {
			       if (disposed) return;
			       notificationsCache.set(cacheKey, {
				       expiresAt: Date.now() + NOTIFICATIONS_CACHE_TTL_MS,
				       data,
			       });
			       setNotifications(data);
		       });

		       return () => {
			       disposed = true;
		       };
	       }, [appId, isAdmin, connected, socket]);

	       // Load lịch sử chat từ guest users khi admin đăng nhập - reload khi socket reconnect
	// Track để chỉ load 1 lần per connection
	useEffect(() => {
		if (!socket || !connected || !isAdmin || !appId) return;
		
		const cacheKey = `${appId}:${socket.id || 'default'}`;
		
		// Nếu đã load cho connection này, skip
		if (chatHistoryLoadedRef.current[cacheKey]) {
			console.log(`💾 [Notification] Chat history already loaded for ${cacheKey}`);
			return;
		}
		
		const getGuestKey = (msg: ChatMessage) => (msg.guestSessionId || msg.guestPhone || '').trim();
		
		// Mark as loading to prevent duplicate requests
		chatHistoryLoadedRef.current[cacheKey] = true;
		
		// Load tất cả chat history của appId này
		console.log(`📥 [Notification] Emitting chat_history_app for appId: ${appId}`);
		socket.emit("chat_history_app", appId, (data: string) => {
			try {
				const history: ChatMessage[] = JSON.parse(data);
				// Chuyển đổi sang notifications
				const chatNotifs = history
					.filter(msg => getGuestKey(msg) && !msg.isAdmin) // Chỉ lấy tin từ guest
					.map(msg => ({
						avatar: msg.avatar || '',
						date: new Date(msg.timestamp || Date.now()).toLocaleString(),
						isRead: msg.readBy?.includes(user.userId || '') || false,
						message: msg.message,
						title: msg.guestPhone || msg.username || 'Khách mới',
						type: 'chat' as const,
						roomId: msg.room,
						fromUserId: msg.userId,
						guestPhone: msg.guestPhone,
						guestSessionId: msg.guestSessionId,
						appId: msg.appId,
					}));
				// Chỉ giữ lại non-chat notifications và merge với chat mới
				setNotifications(prev => {
					const nonChatNotifs = prev.filter(n => n.type !== 'chat');
					return [...chatNotifs, ...nonChatNotifs];
				});
				console.log(`✅ [Notification] Loaded ${chatNotifs.length} chat notifications`);
			} catch (e) {
				console.error('Error loading chat history', e);
			}
		});
	}, [socket, connected, isAdmin, appId, user.userId]);
	       // Lắng nghe tin nhắn chat mới từ guest users
	       useEffect(() => {
		       if (!socket || !isAdmin) return;
		       const getGuestKey = (msg: ChatMessage) => (msg.guestSessionId || msg.guestPhone || '').trim();
		       const handler = (msg: ChatMessage) => {
			       // Chỉ nhận tin nhắn từ guest trong appId hiện tại
			       if (msg.appId === appId && getGuestKey(msg) && !msg.isAdmin) {
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
	       }, [socket, isAdmin, appId]);

       useEffect(() => {
	       if (!socket) return;
	       // Ví dụ: lắng nghe event "notification" từ server
	       const handler = (data: NotificationItem) => {
		       setNotifications((prev) => [data, ...prev]);
	       };
		       socket.on("notification", handler);
		       return () => {
			       if (typeof socket.off === "function") {
				       socket.off("notification", handler);
			       }
		       };
       }, [socket]);

       return (
	       <NotificationPopup
		       notifications={notifications}
		       setNotifications={setNotifications}
		       {...restProps}
	       />
       );
}
