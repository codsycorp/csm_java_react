import type { ButtonProps } from "antd";
import type { NotificationItem } from "./types";

import { BasicButton } from "#src/components";
import { MailCheckIcon } from "#src/icons";
import { cn } from "#src/utils";

import { BellOutlined } from "@ant-design/icons";
import { useToggle } from "ahooks";
import { Popover, theme, Divider } from "antd";
import { clsx } from "clsx";
import { useMemo, useState, useEffect, useCallback } from "react";
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
	const [open, action] = useToggle();
	const [input, setInput] = useState("");
	const [openChats, setOpenChats] = useState<{room: string, username: string}[]>([]);
	const [selectedAppFilter, setSelectedAppFilter] = useState<string>("all");
	const classes = useStyles();
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const user = useUserStore();
	const isDevUser = !!user.dev;
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

	// Notification popup relies on ChatHistoryContext initialization + realtime socket updates.
	// Avoid extra refresh calls here to prevent chat-history request storms.
	
	// No longer tracking 'csm' room unread separately; system messages count is derived from broadcast messages for current app

	// Parse all users (internal + guests) from contextMessages with single unified logic
	// Group 1: Internal users - chat giữa các user trong cùng app (userId hoặc username, nhưng không phải guest, không phải broadcast)
	// Group 2: Guests - messages có guestPhone (khách vãng lai)
	const { internalUsersWithUnread, guestUsersWithUnread } = useMemo(() => {
		const internalMap = new Map<string, { key: string; room: string; username: string; avatar?: string; unread: number; lastTs: number; appId?: string }>();
		const guestMap = new Map<string, { key: string; room: string; label: string; unread: number; lastTs: number; appId?: string }>();
		
		// Duyệt TẤT CẢ rooms trong contextMessages để không bỏ lỡ tin của guests
		Object.entries(contextMessages).forEach(([roomKey, msgs]) => {
			msgs.forEach((msg: any) => {
				// Skip broadcast notifications - xử lý riêng ở section System Messages
				if (msg.eventType === 'broadcast_notification') {
					return;
				}
				
				// Admin chỉ nhận tin thuộc app hiện tại
				if (!isDevUser && msg.appId && msg.appId !== appId) {
					return;
				}
				
				const hasRead = Array.isArray(msg.readBy) && user.userId ? msg.readBy.includes(user.userId) : false;
				const isUnread = !hasRead;
				
				// PRIORITY: Check guestPhone FIRST - guest messages go to guests section
				if (msg.guestSessionId || msg.guestPhone) {
					const guestKey = String(msg.guestSessionId || msg.guestPhone).trim();
					if (guestKey) {
						const guestRoom = String(roomKey || '').startsWith('guest:')
							? String(roomKey)
							: `guest:${(msg.appId || appId || '').trim()};${guestKey}`;
						const guestLabel = formatGuestLabel(guestKey, msg.guestPhone, msg.username, msg.isAdmin);
						const existing = guestMap.get(guestRoom) || {
							key: guestRoom,
							room: guestRoom,
							label: guestLabel,
							unread: 0,
							lastTs: 0,
							appId: (msg.appId || '').trim(),
						};
						existing.label = guestLabel || existing.label;
						existing.appId = (msg.appId || existing.appId || '').trim();
						existing.lastTs = Math.max(existing.lastTs || 0, Number(msg.timestamp || 0));
						if (isUnread && !msg.isAdmin) existing.unread++;
						guestMap.set(guestRoom, existing);
					}
				} 
				// THEN: Check internal user (userId or username) - must NOT have guestPhone
				else if (msg.userId || msg.username) {
					const username = (msg.username || msg.to || '').trim();
					if (!username) return;
					const currentUser = (user.username || '').trim();
					if (username === currentUser) return; // Skip self-messages
					const appToken = (msg.appId || appId || '').trim();
					const internalRoom = String(roomKey || '').trim() || `user:${appToken};${username}`;
					const internalKey = isDevUser ? `${appToken}::${username}` : username;
					const existing = internalMap.get(internalKey) || {
						key: internalKey,
						room: internalRoom,
						username,
						avatar: msg.avatar,
						unread: 0,
						lastTs: 0,
						appId: appToken,
					};
					existing.lastTs = Math.max(existing.lastTs || 0, Number(msg.timestamp || 0));
					existing.appId = (msg.appId || existing.appId || '').trim();
					existing.room = internalRoom || existing.room;
					if (isUnread) existing.unread++;
					internalMap.set(internalKey, existing);
				}
			});
		});
		
		const internalUsersWithUnread = Array.from(internalMap.values())
			.sort((a, b) => (b.unread - a.unread) || (b.lastTs - a.lastTs));
		const guestUsersWithUnread = Array.from(guestMap.values())
			.sort((a, b) => (b.unread - a.unread) || (b.lastTs - a.lastTs));
		
		console.log(`👥 [Notification] Parsed ${internalUsersWithUnread.length} internal users & ${guestUsersWithUnread.length} guests`);
		console.log(`📊 [Notification] Internal users:`, internalUsersWithUnread.map(u => u.username));
		console.log(`📱 [Notification] Guests:`, guestUsersWithUnread.map(g => g.key));
		
		return { internalUsersWithUnread, guestUsersWithUnread };
	}, [contextMessages, appId, user.userId, user.username, formatGuestLabel, isDevUser]);

	const totalGuestUnread = useMemo(() => guestUsersWithUnread.reduce((sum, g) => sum + g.unread, 0), [guestUsersWithUnread]);
	const totalInternalUnread = useMemo(() => internalUsersWithUnread.reduce((sum, u) => sum + u.unread, 0), [internalUsersWithUnread]);

	const appFilterOptions = useMemo(() => {
		const set = new Set<string>();
		if (appId) set.add(appId);
		internalUsersWithUnread.forEach((u: any) => {
			if (u?.appId) set.add(String(u.appId));
		});
		guestUsersWithUnread.forEach((g: any) => {
			if (g?.appId) set.add(String(g.appId));
		});
		Object.values(contextMessages).flat().forEach((msg: any) => {
			if (msg?.eventType === 'broadcast_notification' && msg?.to) {
				set.add(String(msg.to));
			}
			if (msg?.appId) {
				set.add(String(msg.appId));
			}
		});
		return Array.from(set).filter(Boolean).sort();
	}, [appId, internalUsersWithUnread, guestUsersWithUnread, contextMessages]);

	useEffect(() => {
		if (!isDevUser) {
			setSelectedAppFilter(appId || "all");
			return;
		}
		if (selectedAppFilter !== "all" && !appFilterOptions.includes(selectedAppFilter)) {
			setSelectedAppFilter("all");
		}
	}, [isDevUser, appId, selectedAppFilter, appFilterOptions]);

	const displayedInternalUsers = useMemo(() => {
		if (!isDevUser || selectedAppFilter === "all") {
			return internalUsersWithUnread;
		}
		return internalUsersWithUnread.filter((u: any) => String(u?.appId || "") === selectedAppFilter);
	}, [internalUsersWithUnread, isDevUser, selectedAppFilter]);

	const displayedGuestUsers = useMemo(() => {
		if (!isDevUser || selectedAppFilter === "all") {
			return guestUsersWithUnread;
		}
		return guestUsersWithUnread.filter((g: any) => String(g?.appId || "") === selectedAppFilter);
	}, [guestUsersWithUnread, isDevUser, selectedAppFilter]);
	
	// System messages: broadcast notifications từ CSM admin (appId='csm') gửi đến app hiện tại
	// CRITICAL: Đây là thông báo hệ thống từ admin CSM broadcast đến app của user
	const systemMessages = useMemo(() => {
		const allMsgs = Object.values(contextMessages).flat();
		return allMsgs.filter((msg: any) => {
			if (msg.eventType !== 'broadcast_notification') {
				return false;
			}
			if (isDevUser) {
				return true;
			}
			return msg.to === appId;
		});
	}, [contextMessages, appId, isDevUser]);

	const displayedSystemMessages = useMemo(() => {
		if (!isDevUser || selectedAppFilter === "all") {
			return systemMessages;
		}
		return systemMessages.filter((msg: any) => String(msg?.to || msg?.appId || "") === selectedAppFilter);
	}, [systemMessages, isDevUser, selectedAppFilter]);

	const systemMessagesUnread = useMemo(() => {
		let count = 0;
		displayedSystemMessages.forEach((msg: any) => {
			const hasRead = Array.isArray(msg.readBy) && user.userId ? msg.readBy.includes(user.userId) : false;
			if (!hasRead) count++;
		});
		return count;
	}, [displayedSystemMessages, user.userId]);

	const totalSystemUnreadGlobal = useMemo(() => {
		let count = 0;
		systemMessages.forEach((msg: any) => {
			const hasRead = Array.isArray(msg.readBy) && user.userId ? msg.readBy.includes(user.userId) : false;
			if (!hasRead) count++;
		});
		return count;
	}, [systemMessages, user.userId]);

	// Total system unread for bell badge (global, not affected by local filter selection).
	const totalSystemUnread = useMemo(() => totalSystemUnreadGlobal, [totalSystemUnreadGlobal]);

	// Ensure any chat opened from notification is immediately marked as read
	const openChatAndMarkRead = useCallback((room: string, username?: string) => {
		const normalizedRoom = (room || '').trim();
		const normalizedUsername = (username || normalizedRoom).trim();
		if (!normalizedRoom) return;

		setOpenChats(prev => {
			const exists = prev.some(chat => chat.room === normalizedRoom);
			if (exists) {
				return prev.map(chat =>
					chat.room === normalizedRoom
						? { ...chat, username: normalizedUsername || chat.username }
						: chat
				);
			}
			return [...prev, { room: normalizedRoom, username: normalizedUsername || normalizedRoom }];
		});

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

	// Force refresh when opening notification popup
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
							{isDevUser && appFilterOptions.length > 1 && (
								<div style={{ marginBottom: 10 }}>
									<div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 4 }}>
										Lọc theo app
									</div>
									<select
										value={selectedAppFilter}
										onChange={(e) => setSelectedAppFilter(e.target.value)}
										style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${token.colorBorder}` }}
									>
										<option value="all">Tất cả app</option>
										{appFilterOptions.map((opt) => (
											<option key={opt} value={opt}>{opt}</option>
										))}
									</select>
								</div>
							)}
							{/* Section 1: Internal Users (same appId) - unified from contextMessages[appId] */}
							{displayedInternalUsers.length > 0 && (
								<>
									<div style={{ fontWeight: 600, color: token.colorTextSecondary, marginBottom: 6 }}>{t('common.notification.internalUsers', 'Người dùng nội bộ')}</div>
									{displayedInternalUsers.map(u => (
										<div key={u.key} className={classes.userItem} onClick={() => openChatAndMarkRead(u.room, u.username)}>
											<Avatar src={u.avatar} icon={<UserOutlined />} size="small" />
											<div style={{ flex: 1 }}>
												<div className={classes.username}>{u.username}</div>
												<div style={{ fontSize: 12, color: '#8c8c8c' }}>{isDevUser ? `${t('common.notification.sameApp', 'Cùng appId')} • ${(u.appId || 'n/a')}` : t('common.notification.sameApp', 'Cùng appId')}</div>
											</div>
											{u.unread > 0 && <span className={classes.unreadBadge}>{u.unread}</span>}
										</div>
									))}
									<Divider style={{ margin: '8px 0' }} />
								</>
							)}

							{/* Section 2: Guest Users - unified from contextMessages[appId] */}
							{displayedGuestUsers.length > 0 && (
								<>
									<div style={{ fontWeight: 600, color: token.colorTextSecondary, marginBottom: 6 }}>{t('common.notification.guests', 'Khách vãng lai')}</div>
									{displayedGuestUsers.map(g => (
										<div key={g.key} className={classes.userItem} onClick={() => openChatAndMarkRead(g.room, g.label)}>
											<Avatar icon={<UserOutlined />} size="small" />
											<div style={{ flex: 1 }}>
												<div className={classes.username}>{g.label}</div>
												<div style={{ fontSize: 12, color: '#8c8c8c' }}>{isDevUser ? `${t('common.notification.guestDesc', 'Khách của web/app')} • ${(g.appId || 'n/a')}` : t('common.notification.guestDesc', 'Khách của web/app')}</div>
											</div>
											{g.unread > 0 && <span className={classes.unreadBadge}>{g.unread}</span>}
										</div>
									))}
									<Divider style={{ margin: '8px 0' }} />
								</>
							)}

							{/* Section 3: System Messages (Broadcast to this appId) */}
							{displayedSystemMessages.length > 0 && (
								<>
									<div style={{ fontWeight: 600, color: token.colorTextSecondary, marginBottom: 6 }}>{t('common.notification.systemMessages', 'Tin nhắn hệ thống')}</div>
									
									{/* Show system notifications for this appId (broadcast) */}
									<div className={classes.userItem} onClick={() => openChatAndMarkRead((isDevUser && selectedAppFilter !== 'all') ? selectedAppFilter : appId, 'Thông báo hệ thống')}>
										<Avatar icon={<BellOutlined />} size="small" style={{ backgroundColor: '#52c41a' }} />
										<div style={{ flex: 1 }}>
											<div className={classes.username}>Thông báo hệ thống</div>
											<div style={{ fontSize: 12, color: '#8c8c8c' }}>{isDevUser && selectedAppFilter !== 'all' ? `Thông báo gửi đến ứng dụng: ${selectedAppFilter}` : 'Thông báo gửi đến ứng dụng của bạn'}</div>
										</div>
										{systemMessagesUnread > 0 && <span className={classes.unreadBadge}>{systemMessagesUnread}</span>}
									</div>
									
									<Divider style={{ margin: '8px 0' }} />
								</>
							)}
							
							{/* Show placeholder if all sections empty */}
							{(displayedInternalUsers.length === 0 && displayedGuestUsers.length === 0 && displayedSystemMessages.length === 0 && systemMessagesUnread === 0) && (
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
					onClose={() => setOpenChats(prev => prev.filter(item => item.room !== chat.room))}
					username={chat.username}
					room={chat.room}
					index={index}
				/>
			))}
		</>
	);
};

export default NotificationPopup;
