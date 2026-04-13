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
			"& .ant-popover-inner-content": {
				display: 'flex',
				flexDirection: 'column',
				maxHeight: '90vh',
			},
		},
		notificationWrapper: {
			display: 'flex',
			flexDirection: 'column',
			maxHeight: 'min(90vh, 600px)',
			minHeight: '100px',
			'@media (max-width: 640px)': {
				maxHeight: '70vh',
			},
		},
		notificationHeader: {
			flexShrink: 0,
			padding: '12px 16px',
			background: token.colorBgContainer,
			borderBottom: `1px solid ${token.colorBorder}`,
			fontWeight: 600,
		},
		notificationContent: {
			flex: 1,
			overflowY: 'auto',
			overflowX: 'hidden',
			padding: '12px 0',
			'&::-webkit-scrollbar': {
				width: '6px',
			},
			'&::-webkit-scrollbar-track': {
				background: 'transparent',
			},
			'&::-webkit-scrollbar-thumb': {
				background: token.colorBorder,
				borderRadius: '3px',
				'&:hover': {
					background: token.colorBorderBg,
				},
			},
		},
		notificationSection: {
			padding: '0 12px',
			marginBottom: '8px',
		},
		notificationSectionTitle: {
			fontWeight: 600,
			color: token.colorTextSecondary,
			marginBottom: 8,
			paddingLeft: '4px',
			fontSize: '12px',
			textTransform: 'uppercase',
			letterSpacing: '0.5px',
		},
		notificationEmpty: {
			textAlign: 'center',
			padding: '40px 20px',
			color: token.colorTextSecondary,
		},
		userItem: {
			padding: '10px 12px',
			borderRadius: 6,
			margin: '2px 8px',
			transition: 'all 0.2s ease',
			cursor: 'pointer',
			'&:hover': {
				backgroundColor: token.colorBgTextHover,
				boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
			},
			display: 'flex',
			alignItems: 'center',
			gap: 10,
			minHeight: '44px',
		},
		username: {
			fontWeight: 500,
			color: token.colorText,
			fontSize: '14px',
		},
		userDesc: {
			fontSize: '12px',
			color: token.colorTextSecondary,
			marginTop: '2px',
		},
		unreadBadge: {
			backgroundColor: token.colorError,
			color: 'white',
			borderRadius: '50%',
			minWidth: '24px',
			height: '24px',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			fontSize: 11,
			fontWeight: 'bold',
			flexShrink: 0,
		},
		bellBadge: {
			backgroundColor: '#ff4d4f',
			color: 'white',
			borderRadius: '50%',
			minWidth: '22px',
			height: '22px',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			fontSize: '11px',
			fontWeight: 'bold',
			border: '2px solid white',
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
	const { sendMessage: sendChatMessage, unreadCounts: contextUnreadCounts, messages: contextMessages, markAsRead } = useChatHistory();

	const formatGuestLabel = useCallback((guestKey: string, guestPhone?: string, username?: string, isAdminMessage?: boolean) => {
		const phone = String(guestPhone || '').trim();
		if (phone) return phone;

		const name = String(username || '').trim();
		if (!isAdminMessage && name && name !== guestKey) return name;

		const shortId = guestKey.slice(-6);
		return shortId ? `Khách ${shortId}` : 'Khách mới';
	}, []);

	const getChatSessionKey = useCallback((room: string, username?: string) => {
		const normalizedRoom = (room || '').trim();
		const normalizedUser = (username || normalizedRoom).trim();
		return `${normalizedRoom}::${normalizedUser}`;
	}, []);

	// Notification popup relies on ChatHistoryContext initialization + realtime socket updates.
	// Avoid extra refresh calls here to prevent chat-history request storms.
	
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
			.sort((a, b) => (b.unread - a.unread) || a.username.localeCompare(b.username));
		const guestUsersWithUnread = Array.from(guestMap.values())
			.sort((a, b) => (b.unread - a.unread) || a.label.localeCompare(b.label));
		
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

	// Calculate total badge count and log for debugging
	const totalUnreadCount = useMemo(() => {
		const total = totalSystemUnread + totalGuestUnread + totalInternalUnread;
		if (total > 0) {
			console.log(`🔔 [Notification Badge] Total: ${total} = System:${totalSystemUnread} + Guests:${totalGuestUnread} + Internal:${totalInternalUnread}`);
			console.log(`📌 [Notification Details] Guests: ${guestUsersWithUnread.map(g => `${g.label}(${g.unread})`).join(', ') || 'none'}`);
			console.log(`📌 [Notification Details] Internal: ${internalUsersWithUnread.map(u => `${u.username}(${u.unread})`).join(', ') || 'none'}`);
		}
		return total;
	}, [totalSystemUnread, totalGuestUnread, totalInternalUnread, guestUsersWithUnread, internalUsersWithUnread]);

	// Ensure any chat opened from notification is immediately marked as read
	const openChatAndMarkRead = useCallback((room: string, username?: string) => {
		const resolvedUsername = username || room;
		setOpenChats(prev => {
			const sessionKey = getChatSessionKey(room, resolvedUsername);
			const exists = prev.some(item => getChatSessionKey(item.room, item.username) === sessionKey);
			if (exists) return prev;
			return [...prev, { room, username: resolvedUsername }];
		});
		const key = (username || room || "").trim();
		if (key) {
			markAsRead(key);
		}
		if (room && room !== key) {
			markAsRead(room);
		}
	}, [markAsRead, getChatSessionKey]);

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

	const formatNotificationBadge = useCallback((count: number): string => {
		if (count === 0) return '';
		if (count > 99) return '99+';
		return String(count);
	}, []);

	const handleOpenChange = useCallback((visible: boolean) => {
		action.set(visible);
	}, [action]);

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
				overlayClassName={clsx(classes.notification, "sm:w-80 md:w-96 lg:w-[420px]")}
				open={open}
				arrow={false}
				trigger="click"
				onOpenChange={handleOpenChange}
				content={(
					<div className={classes.notificationWrapper}>
						<div className={classes.notificationHeader}>
							Thông báo
						</div>
						<div className={classes.notificationContent}>
							{/* Section 1: Guest Users (Priority: most important) */}
							{guestUsersWithUnread.length > 0 && (
								<div className={classes.notificationSection}>
									<div className={classes.notificationSectionTitle}>👥 Khách vãng lai ({guestUsersWithUnread.length})</div>
									{guestUsersWithUnread.map(g => (
										<div key={g.key} className={classes.userItem} onClick={() => openChatAndMarkRead(g.key, g.label)}>
											<Avatar icon={<UserOutlined />} size="small" style={{ backgroundColor: '#2563eb' }} />
											<div style={{ flex: 1, minWidth: 0 }}>
												<div className={classes.username}>{g.label}</div>
												<div className={classes.userDesc}>Khách của web/app</div>
											</div>
											{g.unread > 0 && <span className={classes.unreadBadge}>{formatNotificationBadge(g.unread)}</span>}
										</div>
									))}
									<Divider style={{ margin: '8px 0' }} />
								</div>
							)}

							{/* Section 2: Internal Users (same appId) */}
							{internalUsersWithUnread.length > 0 && (
								<div className={classes.notificationSection}>
									<div className={classes.notificationSectionTitle}>👨‍💼 Người dùng nội bộ ({internalUsersWithUnread.length})</div>
									{internalUsersWithUnread.map(u => (
										<div key={u.username} className={classes.userItem} onClick={() => openChatAndMarkRead(appId, u.username)}>
											<Avatar src={u.avatar} icon={<UserOutlined />} size="small" />
											<div style={{ flex: 1, minWidth: 0 }}>
												<div className={classes.username}>{u.username}</div>
												<div className={classes.userDesc}>Cùng ứng dụng</div>
											</div>
											{u.unread > 0 && <span className={classes.unreadBadge}>{formatNotificationBadge(u.unread)}</span>}
										</div>
									))}
									<Divider style={{ margin: '8px 0' }} />
								</div>
							)}

							{/* Section 3: System Messages (Broadcast to this appId) */}
							{systemMessages.length > 0 && (
								<div className={classes.notificationSection}>
									<div className={classes.notificationSectionTitle}>🔔 Thông báo hệ thống</div>
									<div className={classes.userItem} onClick={() => openChatAndMarkRead(appId, 'Thông báo hệ thống')}>
										<Avatar icon={<BellOutlined />} size="small" style={{ backgroundColor: '#52c41a' }} />
										<div style={{ flex: 1, minWidth: 0 }}>
											<div className={classes.username}>Thông báo từ CSM</div>
											<div className={classes.userDesc}>Gửi đến ứng dụng của bạn</div>
										</div>
										{systemMessagesUnread > 0 && <span className={classes.unreadBadge}>{formatNotificationBadge(systemMessagesUnread)}</span>}
									</div>
									<Divider style={{ margin: '8px 0' }} />
								</div>
							)}
							
							{/* Empty state */}
							{(internalUsersWithUnread.length === 0 && guestUsersWithUnread.length === 0 && systemMessages.length === 0) && (
								<div className={classes.notificationEmpty}>
									<BellOutlined style={{ fontSize: '32px', color: token.colorBorder, marginBottom: '12px', display: 'block' }} />
									<div>Chưa có tin nhắn</div>
									<div style={{ fontSize: '12px', marginTop: '4px', color: token.colorTextTertiary }}>Tin nhắn sẽ xuất hiện ở đây</div>
								</div>
							)}
						</div>
					</div>
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
					{totalUnreadCount > 0 && (
						<span className={clsx(classes.bellBadge, "absolute -right-2 -top-2 z-10 animate-pulse")}>
							{formatNotificationBadge(totalUnreadCount)}
						</span>
					)}
				</div>
			</Popover>
			{openChats.map((chat, index) => (
				<InternalChatBox
					key={getChatSessionKey(chat.room, chat.username)}
					visible={true}
					onClose={() => setOpenChats(prev => prev.filter(item => getChatSessionKey(item.room, item.username) !== getChatSessionKey(chat.room, chat.username)))}
					username={chat.username}
					room={chat.room}
					index={index}
				/>
			))}
		</>
	);
};

export default NotificationPopup;
