import type { ButtonProps } from "antd";
import type { NotificationItem } from "./types";

import { BasicButton } from "#src/components";
import { MailCheckIcon } from "#src/icons";
import { cn } from "#src/utils";

import { BellOutlined } from "@ant-design/icons";
import { useToggle } from "ahooks";
import { Popover, theme, Divider } from "antd";
import { clsx } from "clsx";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { createUseStyles } from "react-jss";
import { useAppStore } from "#src/store/app";
import { useSocket } from "#src/hooks/useSocket";
import { useUserStore } from "#src/store/user";
import type { ChatMessage } from "#src/model/ChatMessage";
import { Input, Button, Avatar } from "antd";
import { SendOutlined, UserOutlined } from "@ant-design/icons";
import InternalChatBox from "#src/components/InternalChatBox";
import { useChatHistory } from "#src/contexts/ChatHistoryContext";

const useStyles = createUseStyles(({ token }) => (
	{
		notification: {
			"& .ant-popover-inner": {
				padding: 0,
			},
			"& .ant-list-footer": {
				borderTop: `1px solid ${token.colorBorder}`,
			},
			"& .ant-list-items": {
				height: 380,
				overflowY: "auto",
			},
		},
		userItem: {
			padding: '12px 16px',
			borderRadius: 8,
			margin: '4px 8px',
			transition: 'all 0.2s ease',
			cursor: 'pointer',
			'&:hover': {
				backgroundColor: token.colorBgTextHover,
				boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
			},
			display: 'flex',
			alignItems: 'center',
			gap: 12,
		},
		username: {
			fontWeight: 500,
			color: token.colorText,
		},
		unreadBadge: {
			backgroundColor: token.colorError,
			color: 'white',
			borderRadius: '50%',
			padding: '2px 6px',
			fontSize: 12,
			fontWeight: 'bold',
		},
	}
));

type NotificationEventType = "viewAll" | "makeAll" | "clear" | "read";

interface Props extends ButtonProps {
	/**
	 * 显示圆点
	 */
	onEventChange?: (event: NotificationEventType, item?: NotificationItem) => void
	/**
	 * 显示圆点
	 */
	dot?: boolean
	/**
	 * 消息列表
	 */
	notifications?: NotificationItem[]
	/**
	 * Cập nhật notifications
	 */
	setNotifications?: (value: NotificationItem[] | ((prev: NotificationItem[]) => NotificationItem[])) => void
}


export const NotificationPopup: React.FC<Props> = ({ dot: dotProp, notifications, setNotifications, onEventChange, ...restProps }) => {
	const AUTO_OPEN_COOLDOWN_MS = 30_000;
	const [open, action] = useToggle();
	const [input, setInput] = useState("");
	const [openChats, setOpenChats] = useState<{room: string, username: string}[]>([]);
	const autoOpenCooldownRef = useRef<Record<string, number>>({});
	const classes = useStyles();
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const user = useUserStore();
	// CRITICAL: Use same pattern as permission.ts and ChatHistoryContext for getting effective appId
	// Priority: user.app_id (from login) > store.currentAppId (from AppStore) > fallback to "csm"
	const appId = (user.app_id || "").trim() || useAppStore.getState().getCurrentAppId() || "csm";
    const { socket, connected } = useSocket();
	const { sendMessage: sendChatMessage, unreadCounts: contextUnreadCounts, messages: contextMessages, refreshAllMessages, markAsRead } = useChatHistory();

	const formatGuestLabel = useCallback((guestKey: string, guestPhone?: string, username?: string, isAdminMessage?: boolean) => {
		const phone = String(guestPhone || '').trim();
		if (phone) return phone;

		const name = String(username || '').trim();
		if (!isAdminMessage && name && name !== guestKey) return name;

		const shortId = guestKey.slice(-6);
		return shortId ? `Khách ${shortId}` : 'Khách mới';
	}, []);

	// Load guest list from backend API when component mounts or appId changes
	useEffect(() => {
		if (!connected) return;
		
		// Load guest list từ backend API (giống logic trong ChatHistoryContext)
		const loadGuestList = async () => {
			try {
				console.log(`📱 [Notification] Loading guests list for appId="${appId}"`);
				const guestsList = await (window as any).loadChatGuestsList?.(appId) || [];
				console.log(`📱 [Notification] Loaded ${guestsList.length} guests:`, guestsList);
			} catch (error) {
				console.error('❌ [Notification] Failed to load guests list:', error);
			}
		};
		
		loadGuestList();
	}, [connected, appId]);

	// Socket-first: only do one sync when connected/app changes.
	// Realtime updates are handled by ChatHistoryContext socket listeners.
	useEffect(() => {
		if (!connected) return;

		const syncNotificationData = async () => {
			try {
				console.log(`🔄 [Notification] Initial sync for appId="${appId}"`);
				await refreshAllMessages();
			} catch (error) {
				console.error('❌ [Notification] Initial sync failed:', error);
			}
		};

		syncNotificationData();
	}, [connected, appId, refreshAllMessages]);
	
	// No longer tracking 'csm' room unread separately; system messages count is derived from broadcast messages for current app

	// Parse all users (internal + guests) from contextMessages with single unified logic
	// Group 1: Internal users - chat giữa các user trong cùng app (userId hoặc username, nhưng không phải guest, không phải broadcast)
	// Group 2: Guests - messages có guestPhone (khách vãng lai)
	const { internalUsersWithUnread, guestUsersWithUnread } = useMemo(() => {
		const internalMap = new Map<string, { username: string; avatar?: string; unread: number }>();
		const guestMap = new Map<string, { key: string; label: string; unread: number }>();
		
		// Duyệt TẤT CẢ rooms trong contextMessages để không bỏ lỡ tin của guests
		Object.entries(contextMessages).forEach(([roomKey, msgs]) => {
			msgs.forEach((msg: any) => {
				// Skip broadcast notifications - xử lý riêng ở section System Messages
				if (msg.eventType === 'broadcast_notification') {
					return;
				}
				
				// Admin chỉ nhận tin thuộc app hiện tại
				if (msg.appId && msg.appId !== appId) {
					return;
				}
				
				const hasRead = Array.isArray(msg.readBy) && user.userId ? msg.readBy.includes(user.userId) : false;
				const isUnread = !hasRead;
				
				// PRIORITY: Check guestPhone FIRST - guest messages go to guests section
				if (msg.guestSessionId || msg.guestPhone) {
					const guestKey = String(msg.guestSessionId || msg.guestPhone).trim();
					if (guestKey) {
						const guestLabel = formatGuestLabel(guestKey, msg.guestPhone, msg.username, msg.isAdmin);
						const existing = guestMap.get(guestKey) || { key: guestKey, label: guestLabel, unread: 0 };
						existing.label = guestLabel || existing.label;
						if (isUnread && !msg.isAdmin) existing.unread++;
						guestMap.set(guestKey, existing);
					}
				} 
				// THEN: Check internal user (userId or username) - must NOT have guestPhone
				else if (msg.userId || msg.username) {
					const username = (msg.username || msg.to || '').trim();
					if (!username) return;
					const currentUser = (user.username || '').trim();
					if (username === currentUser) return; // Skip self-messages
					const existing = internalMap.get(username) || { username, avatar: msg.avatar, unread: 0 };
					if (isUnread) existing.unread++;
					internalMap.set(username, existing);
				}
			});
		});
		
		const internalUsersWithUnread = Array.from(internalMap.values())
			.filter(item => item.unread > 0)
			.sort((a, b) => b.unread - a.unread);
		const guestUsersWithUnread = Array.from(guestMap.values())
			.filter(item => item.unread > 0)
			.sort((a, b) => b.unread - a.unread);
		
		console.log(`👥 [Notification] Parsed ${internalUsersWithUnread.length} internal users & ${guestUsersWithUnread.length} guests`);
		console.log(`📊 [Notification] Internal users:`, internalUsersWithUnread.map(u => u.username));
		console.log(`📱 [Notification] Guests:`, guestUsersWithUnread.map(g => g.key));
		
		return { internalUsersWithUnread, guestUsersWithUnread };
	}, [contextMessages, appId, user.userId, user.username, formatGuestLabel]);

	const totalGuestUnread = useMemo(() => guestUsersWithUnread.reduce((sum, g) => sum + g.unread, 0), [guestUsersWithUnread]);
	const totalInternalUnread = useMemo(() => internalUsersWithUnread.reduce((sum, u) => sum + u.unread, 0), [internalUsersWithUnread]);
	
	// System messages: broadcast notifications từ CSM admin (appId='csm') gửi đến app hiện tại
	// CRITICAL: Đây là thông báo hệ thống từ admin CSM broadcast đến app của user
	const systemMessages = useMemo(() => {
		const appRoomMsgs = contextMessages[appId] || [];
		return appRoomMsgs.filter((msg: any) => 
			msg.eventType === 'broadcast_notification' && 
			msg.appId === 'csm' && // From CSM admin
			msg.to === appId // To current app
		);
	}, [contextMessages, appId]);

	const systemMessagesUnread = useMemo(() => {
		let count = 0;
		systemMessages.forEach((msg: any) => {
			const hasRead = Array.isArray(msg.readBy) && user.userId ? msg.readBy.includes(user.userId) : false;
			if (!hasRead) count++;
		});
		return count;
	}, [systemMessages, user.userId]);

	// Total system unread = broadcast notifications unread for this appId
	const totalSystemUnread = useMemo(() => systemMessagesUnread, [systemMessagesUnread]);

	// Ensure any chat opened from notification is immediately marked as read
	const openChatAndMarkRead = useCallback((room: string, username?: string) => {
		setOpenChats([{ room, username: username || room }]);
		const key = (username || room || "").trim();
		if (key) {
			markAsRead(key);
		}
		if (room && room !== key) {
			markAsRead(room);
		}
	}, [markAsRead]);

	useEffect(() => {
		if (!openChats.length) return;
		openChats.forEach(chat => {
			const key = (chat.username || chat.room || "").trim();
			if (key) {
				markAsRead(key);
			}
			if (chat.room && chat.room !== key) {
				markAsRead(chat.room);
			}
		});
	}, [openChats, markAsRead]);

	useEffect(() => {
		const handleAutoOpen = (event: Event) => {
			const detail = (event as CustomEvent).detail || {};
			const targetAppId = typeof detail.appId === 'string' ? detail.appId.trim() : '';
			if (targetAppId && targetAppId !== appId) return;

			const room = typeof detail.targetRoom === 'string' ? detail.targetRoom.trim() : '';
			if (!room) return;

			const now = Date.now();
			const lastOpenedAt = autoOpenCooldownRef.current[room] || 0;
			if (now - lastOpenedAt < AUTO_OPEN_COOLDOWN_MS) return;
			autoOpenCooldownRef.current[room] = now;

			const candidateUsername = typeof detail.guestPhone === 'string' && detail.guestPhone.trim()
				? detail.guestPhone.trim()
				: (typeof detail.guestSessionId === 'string' && detail.guestSessionId.trim()
					? formatGuestLabel(detail.guestSessionId.trim(), detail.guestPhone, detail.username, detail.isAdmin === true)
					: (typeof detail.username === 'string' && detail.username.trim() ? detail.username.trim() : room));

			openChatAndMarkRead(room, candidateUsername);
		};

		window.addEventListener('csm-chat-auto-open', handleAutoOpen as EventListener);
		return () => {
			window.removeEventListener('csm-chat-auto-open', handleAutoOpen as EventListener);
		};
	}, [appId, openChatAndMarkRead, formatGuestLabel]);

	// Force refresh when opening notification popup
	const handleOpenChange = useCallback(async (visible: boolean) => {
		action.set(visible);
		
		if (visible && connected) {
			// Force refresh notification data when opening popup
			try {
				console.log(`🔄 [Notification] Force refresh on open for appId="${appId}"`);
				await refreshAllMessages();
			} catch (error) {
				console.error('❌ [Notification] Force refresh failed:', error);
			}
		}
	}, [connected, appId, action, refreshAllMessages]);

	const close = () => { action.set(false); };
	const handleViewAll = () => { onEventChange && onEventChange("viewAll"); close(); };
	const handleMakeAll = () => { onEventChange && onEventChange("makeAll"); };
	const handleClear = () => { onEventChange && onEventChange("clear"); };
	const handleClick = (item: NotificationItem) => { onEventChange && onEventChange("read", item); };
	const dot = useMemo(() => { return !!notifications?.filter((item: NotificationItem) => !item.isRead).length; }, [notifications]);

	const sendMessage = () => {
		if (input.trim()) {
			sendChatMessage(appId, input);
			setInput("");
		}
	};

	return (
		<>
			<Popover
				placement="bottomLeft"
				overlayClassName={clsx(classes.notification, "w-72 md:w-96 !right-3")}
				open={open}
				arrow={false}
				trigger="click"
				onOpenChange={handleOpenChange}
				content={(
					<>
						<div className="flex items-center justify-between mb-2" style={{ padding: '12px 16px', background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorder}` }}>
							<div style={{ fontWeight: 600, color: token.colorText }}>Thông báo</div>
						</div>
						<div style={{ padding: '12px 16px' }}>
							{/* Section 1: Internal Users (same appId) - unified from contextMessages[appId] */}
							{internalUsersWithUnread.length > 0 && (
								<>
									<div style={{ fontWeight: 600, color: token.colorTextSecondary, marginBottom: 6 }}>{t('common.notification.internalUsers', 'Người dùng nội bộ')}</div>
									{internalUsersWithUnread.map(u => (
										<div key={u.username} className={classes.userItem} onClick={() => openChatAndMarkRead(appId, u.username)}>
											<Avatar src={u.avatar} icon={<UserOutlined />} size="small" />
											<div style={{ flex: 1 }}>
												<div className={classes.username}>{u.username}</div>
												<div style={{ fontSize: 12, color: '#8c8c8c' }}>{t('common.notification.sameApp', 'Cùng appId')}</div>
											</div>
											{u.unread > 0 && <span className={classes.unreadBadge}>{u.unread}</span>}
										</div>
									))}
									<Divider style={{ margin: '8px 0' }} />
								</>
							)}

							{/* Section 2: Guest Users - unified from contextMessages[appId] */}
							{guestUsersWithUnread.length > 0 && (
								<>
									<div style={{ fontWeight: 600, color: token.colorTextSecondary, marginBottom: 6 }}>{t('common.notification.guests', 'Khách vãng lai')}</div>
									{guestUsersWithUnread.map(g => (
										<div key={g.key} className={classes.userItem} onClick={() => openChatAndMarkRead(g.key, g.label)}>
											<Avatar icon={<UserOutlined />} size="small" />
											<div style={{ flex: 1 }}>
												<div className={classes.username}>{g.label}</div>
												<div style={{ fontSize: 12, color: '#8c8c8c' }}>{t('common.notification.guestDesc', 'Khách của web/app')}</div>
											</div>
											{g.unread > 0 && <span className={classes.unreadBadge}>{g.unread}</span>}
										</div>
									))}
									<Divider style={{ margin: '8px 0' }} />
								</>
							)}

							{/* Section 3: System Messages (Broadcast to this appId) */}
							{systemMessages.length > 0 && (
								<>
									<div style={{ fontWeight: 600, color: token.colorTextSecondary, marginBottom: 6 }}>{t('common.notification.systemMessages', 'Tin nhắn hệ thống')}</div>
									
									{/* Show system notifications for this appId (broadcast) */}
									<div className={classes.userItem} onClick={() => openChatAndMarkRead(appId, 'Thông báo hệ thống')}>
										<Avatar icon={<BellOutlined />} size="small" style={{ backgroundColor: '#52c41a' }} />
										<div style={{ flex: 1 }}>
											<div className={classes.username}>Thông báo hệ thống</div>
											<div style={{ fontSize: 12, color: '#8c8c8c' }}>Thông báo gửi đến ứng dụng của bạn</div>
										</div>
										{systemMessagesUnread > 0 && <span className={classes.unreadBadge}>{systemMessagesUnread}</span>}
									</div>
									
									<Divider style={{ margin: '8px 0' }} />
								</>
							)}
							
							{/* Show placeholder if all sections empty */}
							{(internalUsersWithUnread.length === 0 && guestUsersWithUnread.length === 0 && systemMessages.length === 0 && totalSystemUnread === 0) && (
								<div style={{ textAlign: 'center', padding: '20px', color: token.colorTextSecondary }}>
									Chưa có tin nhắn
								</div>
							)}
						</div>
					</>
				)}
			>
				<div style={{ position: "relative" }}>
					<BasicButton
						size="large"
						type="text"
						{...restProps}
						className={cn("relative group", restProps.className)}
						icon={<BellOutlined className="group-hover:animate-wiggle" />}
					>
						{dotProp ?? dot ? <span className="bg-blue-600 absolute right-2 top-1.5 h-2 w-2 rounded"></span> : null}
					</BasicButton>
				{(totalSystemUnread + totalGuestUnread + totalInternalUnread) > 0 && (
					<span className="bg-red-500 animate-pulse absolute -right-2 -top-2 h-4 w-4 rounded-full flex items-center justify-center text-xs text-white font-bold z-10 border-2 border-white">{totalSystemUnread + totalGuestUnread + totalInternalUnread}</span>
					)}
				</div>
			</Popover>
			{openChats.map((chat, index) => (
				<InternalChatBox
					key={chat.room}
					visible={true}
					onClose={() => setOpenChats([])}
					username={chat.username}
					room={chat.room}
					index={index}
				/>
			))}
		</>
	);
};

export default NotificationPopup;
