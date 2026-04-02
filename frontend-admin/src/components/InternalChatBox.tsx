import React, { useState, useEffect, useRef } from "react";
import { UserOutlined, SendOutlined, CloseOutlined, MinusOutlined, DeleteOutlined } from "@ant-design/icons";
import { Input, Button, List, Avatar, theme, Tooltip, Popconfirm } from "antd";
import { useTranslation } from "react-i18next";
import { useChatHistory } from "#src/contexts/ChatHistoryContext";
import { useUserStore } from "#src/store/user";
import { useAppStore } from "#src/store/app";
import { useGuestPhone } from "#src/hooks/useGuestPhone";
import type { ChatMessage } from "#src/model/ChatMessage";
import FloatingChatButton from "./FloatingChatButton";




const InternalChatBox: React.FC<{visible: boolean, onClose: () => void, username?: string, room?: string, index?: number}> = ({ visible, onClose, username, room, index }) => {
  const [input, setInput] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [deletedMessageIds, setDeletedMessageIds] = useState<Set<string>>(new Set());
  const user = useUserStore();
  // CRITICAL: Use same pattern as permission.ts for getting effective appId
  // Priority: user.app_id (from login) > store.currentAppId (from AppStore) > fallback to "csm"
  const appId = (user.app_id || "").trim() || useAppStore.getState().getCurrentAppId() || "csm";
  const chatRoom = room || appId;
  const listRef = useRef<HTMLDivElement>(null);
  const lastMarkReadRef = useRef<{ room: string; at: number } | null>(null);
  const [position, setPosition] = useState({ x: 20 + (index || 0) * 320, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const { token } = theme.useToken();
  const { t } = useTranslation();
  
  // Use ChatHistoryContext instead of local state
  const { 
    messages: allMessages, 
    sendMessage: sendMessageContext, 
    loadHistory, 
    markAsRead, 
    unreadCounts,
    connected,
    openChat: openChatContext,
    closeChat: closeChatContext,
    typingUsers
  } = useChatHistory();
  const openChatRef = useRef(openChatContext);
  const closeChatRef = useRef(closeChatContext);
  
  const { guestPhone: guestPhoneFromHook, guestSessionId, ensureGuestSessionId, isGuest, setChatUrl, getChatUrlToSend } = useGuestPhone();

  useEffect(() => {
    openChatRef.current = openChatContext;
    closeChatRef.current = closeChatContext;
  }, [openChatContext, closeChatContext]);

  // Ensure we always pick the latest guest phone (state or localStorage)
  const storedGuestPhone = React.useMemo(() => {
    if (!isGuest) return "";
    try {
      return localStorage.getItem(`csm_guest_phone_${appId}`) || "";
    } catch (e) {
      console.warn("Cannot read guest phone from localStorage", e);
      return "";
    }
  }, [isGuest, appId, guestPhoneFromHook]);

  const storedGuestSessionId = React.useMemo(() => {
    if (!isGuest) return "";
    try {
      return localStorage.getItem(`csm_guest_session_${appId}`) || guestSessionId || "";
    } catch (e) {
      console.warn("Cannot read guest session from localStorage", e);
      return guestSessionId || "";
    }
  }, [isGuest, appId, guestSessionId]);
  
  // Use priority: prop.username (if provided) > hook state > localStorage
  const effectiveGuestPhone = isGuest
    ? ((username && username.trim()) || guestPhoneFromHook || storedGuestPhone)
    : "";

  const effectiveGuestSessionId = isGuest
    ? (guestSessionId || storedGuestSessionId || ensureGuestSessionId())
    : "";

  const isGuestConversation = !isGuest && !!room && room !== appId && room !== 'csm' && !room.includes(':');

  // Consistent room key for guests: use session id; for admin guest chats use room, for internal chats keep username
  const roomKey = isGuest
    ? (effectiveGuestSessionId || effectiveGuestPhone || storedGuestPhone || chatRoom)
    : (isGuestConversation ? room : (username || chatRoom));

  // Get messages for this specific chat
  const messages = allMessages[roomKey] || [];
  const unreadCount = unreadCounts[roomKey] || 0;

  // Filter out deleted messages
  const visibleMessages = messages.filter((msg: ChatMessage) => !deletedMessageIds.has(msg.timestamp?.toString() || ''));

  // Handle delete message
  const handleDeleteMessage = async (msgTimestamp?: number) => {
    if (!msgTimestamp) return;
    
    try {
      // 🔥 CRITICAL: Pass correct appId - use appId from user login or store
      console.log(`🗑️ [InternalChatBox] Deleting message - appId=${appId}, timestamp=${msgTimestamp}`);
      const data = await (window as any).deleteChatMessage?.(msgTimestamp, appId);
      
      if (data?.success || data?.code === 200) {
        // Remove from UI
        setDeletedMessageIds(prev => new Set(prev).add(msgTimestamp.toString()));
        console.log('✅ Message deleted successfully');
      } else {
        console.error('❌ Failed to delete message:', data?.message);
      }
    } catch (error) {
      console.error('❌ Error deleting message:', error);
    }
  };

  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 576);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Open chat khi component mount
  useEffect(() => {
    if (visible) {
      openChatRef.current(roomKey);
    }
    return () => {
      if (visible) {
        closeChatRef.current(roomKey);
      }
    };
  }, [visible, roomKey]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Center the chat box when it becomes visible; still draggable afterwards
  useEffect(() => {
    if (!visible) return;
    const width = 300;
    const height = 400;
    const padding = 16;
    const nextX = Math.max(padding, (window.innerWidth - width) / 2);
    const nextY = Math.max(padding, (window.innerHeight - height) / 2);
    setPosition({ x: nextX, y: nextY });
  }, [visible]);

  // Mark as read when chat box opens (consolidated single effect)
  useEffect(() => {
    if (visible) {
      const now = Date.now();
      const last = lastMarkReadRef.current;
      if (last && last.room === roomKey && now - last.at < 2000) {
        return;
      }
      lastMarkReadRef.current = { room: roomKey, at: now };
      console.log(`📖 [InternalChatBox] Marking as read for room: ${roomKey}`);
      markAsRead(roomKey);
    }
  }, [visible, roomKey, markAsRead]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  }, [messages]);

  // Handle input with typing indicator
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    
    // Emit typing event if socket connected
    const guestIdentifier = effectiveGuestSessionId || effectiveGuestPhone || storedGuestPhone;
    const roomIdentifier = isGuest ? guestIdentifier : roomKey;
    
    if (connected && roomIdentifier) {
      const actualRoom = isGuest && guestIdentifier
        ? `guest:${appId};${guestIdentifier}`
        : (isGuestConversation ? `guest:${appId};${roomKey}` : (username ? `user:${appId};${username}` : `app:${appId}`));
      
      (window as any).emitTyping?.(actualRoom, isGuest ? (effectiveGuestPhone || guestIdentifier) : username, appId);
    }
  };

  const sendMessage = () => {
    if (input.trim()) {
      // Lần đầu gửi tin, lưu URL hiện tại nếu chưa có
      const urlToSend = getChatUrlToSend();
      if (urlToSend) {
        setChatUrl(urlToSend);
      }
      
      // 🔴 CRITICAL: For guest users, MUST pass guestPhone as room identifier
      // The context's sendMessage will detect it and construct proper room
      const guestIdentifier = effectiveGuestSessionId || effectiveGuestPhone || storedGuestPhone;
      const roomIdentifier = isGuest ? guestIdentifier : roomKey;

      // Guest chỉ cần session id, không bắt buộc phone
      if (isGuest && !roomIdentifier) {
        console.warn("Guest identity is missing; cannot send message.");
        return;
      }
      
      sendMessageContext(
        roomIdentifier,
        input,
        isGuest ? undefined : (isGuestConversation ? undefined : username)
      );
      setInput("");
    }
  };

  const formatMessageTime = (rawTimestamp?: number) => {
    if (!rawTimestamp) return '';

    const normalizedTimestamp = rawTimestamp < 1000000000000 ? rawTimestamp * 1000 : rawTimestamp;
    const date = new Date(normalizedTimestamp);

    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Mobile: show floating button + modal
  if (isMobile) {
    return (
      <>
        {/* Floating Chat Button */}
        <FloatingChatButton
          onClick={() => {
            setIsMinimized(false);
          }}
          label={username ? t('common.chat.with', { name: username }) : t('common.chat.withAdmin')}
          visible={visible && isMinimized}
          badge={unreadCount}
        />

        {/* Chat Box Modal */}
        {!isMinimized && visible && (
          <div
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.45)',
              zIndex: 1998,
              display: 'flex',
              flexDirection: 'column',
              animation: 'fadeIn 0.3s ease-out',
            }}
            onClick={() => setIsMinimized(true)}
          >
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes slideUp {
                from { transform: translateY(100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
            `}</style>
            <div
              style={{
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                maxHeight: '90vh',
                background: token.colorBgContainer,
                borderRadius: '16px 16px 0 0',
                boxShadow: '0 -8px 24px rgba(0,0,0,0.15)',
                zIndex: 1999,
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideUp 0.3s ease-out',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                style={{
                  padding: '16px',
                  borderBottom: `1px solid ${token.colorBorder}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: `linear-gradient(135deg, ${token.colorPrimaryBg} 0%, ${token.colorBgTextHover} 100%)`,
                  borderRadius: '16px 16px 0 0',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 16, color: token.colorPrimary }}>
                  {username ? t('common:chat.with', { name: username }) : t('common:chat.withAdmin')}
                </span>
                <Button
                  type="text"
                  icon={<MinusOutlined />}
                  size="middle"
                  onClick={() => {
                    setIsMinimized(true);
                  }}
                  title={t('common.chat.minimize')}
                />
              </div>

              {/* Messages */}
              <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: 12 }}>
                <List
                  dataSource={visibleMessages}
                  renderItem={item => {
                    const isMyMessage = isGuest
                      ? (item.guestSessionId === effectiveGuestSessionId || item.guestPhone === effectiveGuestPhone || (!item.isAdmin && !item.userId))
                      : item.userId === user.userId;
                    const displayName = isMyMessage ? t('common.chat.you') : item.username;
                    const messageTime = formatMessageTime(item.timestamp);
                    const isReadForCurrent = (() => {
                      if (item.readBy && item.readBy.length > 0) {
                        if (user.userId) return item.readBy.includes(user.userId);
                        if (isGuest && effectiveGuestSessionId) return item.readBy.includes(`guest:${effectiveGuestSessionId}`) || item.readBy.includes(effectiveGuestSessionId);
                      }
                      return false;
                    })();

                    const showUnreadEmphasis = !isMyMessage && !isReadForCurrent;

                    return (
                      <List.Item
                        style={{
                          background: isMyMessage ? token.colorBgTextHover : showUnreadEmphasis ? token.colorPrimaryBg : undefined,
                          padding: '8px 4px',
                          marginBottom: 8,
                          borderRadius: 4,
                          borderLeft: showUnreadEmphasis ? `3px solid ${token.colorPrimary}` : undefined,
                        }}
                      >
                        <List.Item.Meta
                          avatar={item.avatar ? <Avatar src={item.avatar} size="small" /> : <Avatar icon={<UserOutlined />} size="small" />}
                          title={
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>
                                {displayName}
                                {item.isAdmin && !isMyMessage && (
                                  <span style={{ color: token.colorWarning, marginLeft: 6 }}>
                                    [{t('common.chat.admin')}]
                                  </span>
                                )}
                                {isMyMessage && item.readBy && item.readBy.length > 0 && (
                                  <span style={{ color: token.colorSuccess, marginLeft: 8, fontSize: 10 }}>
                                    ✓ {t('common.chat.read')}
                                  </span>
                                )}
                                {!isMyMessage && !isReadForCurrent && (
                                  <span style={{ color: token.colorPrimary, marginLeft: 8, fontSize: 10 }}>
                                    • {t('common.chat.unread', 'Chưa đọc')}
                                  </span>
                                )}
                              </span>
                              {messageTime && (
                                <span style={{ fontSize: 10, color: token.colorTextSecondary, fontWeight: 400, whiteSpace: 'nowrap' }}>
                                  {messageTime}
                                </span>
                              )}
                            </div>
                          }
                          description={<span style={{ fontSize: 13, color: showUnreadEmphasis ? token.colorText : token.colorTextSecondary, fontWeight: showUnreadEmphasis ? 600 : 400 }}>
                            {item.message}
                          </span>}
                        />
                        {/* Only show delete button for logged-in admin users */}
                        {!isGuest && user.userId && (
                          <Tooltip title={t('common.chat.deleteMessage', 'Xoá tin nhắn')}>
                            <Popconfirm
                              title={t('common.chat.deleteMessageTitle', 'Xoá tin nhắn')}
                              description={t('common.chat.deleteMessageDesc', 'Bạn có chắc chắn muốn xoá tin nhắn này?')}
                              onConfirm={() => handleDeleteMessage(item.timestamp)}
                              okText={t('common.confirm', 'Xác nhận')}
                              cancelText={t('common.cancel', 'Hủy')}
                            >
                              <Button
                                type="text"
                                size="small"
                                icon={<DeleteOutlined />}
                                danger
                                style={{ opacity: 0.6, transition: 'opacity 0.2s' }}
                                onMouseEnter={(e) => {
                                  if (e.currentTarget) e.currentTarget.style.opacity = '1';
                                }}
                                onMouseLeave={(e) => {
                                  if (e.currentTarget) e.currentTarget.style.opacity = '0.6';
                                }}
                              />
                            </Popconfirm>
                          </Tooltip>
                        )}
                      </List.Item>
                    );
                  }}
                />
              </div>

              {/* Typing Indicator */}
              {typingUsers[roomKey] && typingUsers[roomKey].length > 0 && (
                <div style={{ padding: '6px 12px', background: token.colorBgElevated, borderTop: `1px solid ${token.colorBorder}`, fontSize: 11, color: token.colorTextSecondary, fontStyle: 'italic' }}>
                  💬 {typingUsers[roomKey].join(', ')} {t('common.chat.isTyping', 'đang nhập...')}
                </div>
              )}

              {/* Input */}
              <Input.Group compact style={{ padding: 12, borderTop: `1px solid ${token.colorBorder}`, background: token.colorBgElevated }}>
                <Input
                  style={{ width: 'calc(100% - 44px)' }}
                  value={input}
                  onChange={handleInputChange}
                  onPressEnter={sendMessage}
                  placeholder={t('common.chat.messagePlaceholder')}
                  size="large"
                />
                <Button type="primary" icon={<SendOutlined />} onClick={sendMessage} size="large" />
              </Input.Group>
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop: show floating window
  return (
    <>
      {/* Floating Chat Button (Desktop fallback khi minimize) */}
      {isMinimized && visible && (
        <FloatingChatButton
          onClick={() => {
            setIsMinimized(false);
          }}
          label={username ? t('common.chat.with', { name: username }) : t('common.chat.withAdmin')}
          visible={true}
          badge={unreadCount}
          isLarge={true}
        />
      )}

      {/* Chat Window */}
      {!isMinimized && visible && (
        <div
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            width: 360,
            height: 480,
            background: token.colorBgContainer,
            border: `1px solid ${token.colorBorder}`,
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'box-shadow 0.3s ease',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            el.style.boxShadow = '0 12px 32px rgba(0,0,0,0.2)';
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget;
            el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: `1px solid ${token.colorBorder}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: `linear-gradient(135deg, ${token.colorPrimaryBg} 0%, ${token.colorBgTextHover} 100%)`,
              borderRadius: '12px 12px 0 0',
              cursor: 'move',
              userSelect: 'none',
            }}
            onMouseDown={handleMouseDown}
          >
            <span style={{ fontWeight: 700, color: token.colorPrimary }}>
              {username ? t('common.chat.with', { name: username }) : t('common.chat.withAdmin')}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                type="text"
                icon={<MinusOutlined />}
                size="small"
                onClick={() => setIsMinimized(true)}
                title={t('common.chat.minimize')}
              />
              <Button type="text" icon={<CloseOutlined />} size="small" onClick={onClose} title={t('common.chat.close', 'Đóng')} />
            </div>
          </div>

          {/* Messages */}
          <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: 12, background: token.colorBgBase }}>
            <List
              dataSource={visibleMessages}
              renderItem={item => {
                const isMyMessage = isGuest
                  ? (item.guestSessionId === effectiveGuestSessionId || item.guestPhone === effectiveGuestPhone || (!item.isAdmin && !item.userId))
                  : item.userId === user.userId;
                const displayName = isMyMessage ? t('common.chat.you') : item.username;
                const messageTime = formatMessageTime(item.timestamp);
                const isReadForCurrent = (() => {
                  if (item.readBy && item.readBy.length > 0) {
                    if (user.userId) return item.readBy.includes(user.userId);
                    if (isGuest && effectiveGuestSessionId) return item.readBy.includes(`guest:${effectiveGuestSessionId}`) || item.readBy.includes(effectiveGuestSessionId);
                  }
                  return false;
                })();
                const showUnreadEmphasis = !isMyMessage && !isReadForCurrent;

                return (
                  <List.Item
                    style={{
                      background: isMyMessage ? token.colorBgTextHover : showUnreadEmphasis ? token.colorPrimaryBg : undefined,
                      padding: '8px 4px',
                      marginBottom: 6,
                      borderRadius: 4,
                      borderLeft: showUnreadEmphasis ? `3px solid ${token.colorPrimary}` : undefined,
                    }}
                  >
                    <List.Item.Meta
                      avatar={item.avatar ? <Avatar src={item.avatar} size="small" /> : <Avatar icon={<UserOutlined />} size="small" />}
                      title={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>
                            {displayName}
                            {item.isAdmin && !isMyMessage && (
                              <span style={{ color: token.colorWarning, marginLeft: 6 }}>
                                [{t('common.chat.admin')}]
                              </span>
                            )}
                            {isMyMessage && item.readBy && item.readBy.length > 0 && (
                              <span style={{ color: token.colorSuccess, marginLeft: 8, fontSize: 10 }}>
                                ✓ {t('common.chat.read')}
                              </span>
                            )}
                            {!isMyMessage && !isReadForCurrent && (
                              <span style={{ color: token.colorPrimary, marginLeft: 8, fontSize: 10 }}>
                                • {t('common.chat.unread', 'Chưa đọc')}
                              </span>
                            )}
                          </span>
                          {messageTime && (
                            <span style={{ fontSize: 10, color: token.colorTextSecondary, fontWeight: 400, whiteSpace: 'nowrap' }}>
                              {messageTime}
                            </span>
                          )}
                        </div>
                      }
                      description={
                        <span style={{ fontSize: 12, color: showUnreadEmphasis ? token.colorText : token.colorTextSecondary, marginTop: 4, fontWeight: showUnreadEmphasis ? 600 : 400 }}>
                          {item.message}
                        </span>
                      }
                    />
                    {/* Only show delete button for logged-in admin users */}
                    {!isGuest && user.userId && (
                      <Tooltip title={t('common.chat.deleteMessage', 'Xoá tin nhắn')}>
                        <Popconfirm
                          title={t('common.chat.deleteMessageTitle', 'Xoá tin nhắn')}
                          description={t('common.chat.deleteMessageDesc', 'Bạn có chắc chắn muốn xoá tin nhắn này?')}
                          onConfirm={() => handleDeleteMessage(item.timestamp)}
                          okText={t('common.confirm', 'Xác nhận')}
                          cancelText={t('common.cancel', 'Hủy')}
                        >
                          <Button
                            type="text"
                            size="small"
                            icon={<DeleteOutlined />}
                            danger
                            style={{ opacity: 0.6, transition: 'opacity 0.2s' }}
                            onMouseEnter={(e) => {
                              if (e.currentTarget) e.currentTarget.style.opacity = '1';
                            }}
                            onMouseLeave={(e) => {
                              if (e.currentTarget) e.currentTarget.style.opacity = '0.6';
                            }}
                          />
                        </Popconfirm>
                      </Tooltip>
                    )}
                  </List.Item>
                );
              }}
            />
          </div>

          {/* Typing Indicator */}
          {typingUsers[roomKey] && typingUsers[roomKey].length > 0 && (
            <div style={{ padding: '6px 12px', background: token.colorBgElevated, borderTop: `1px solid ${token.colorBorder}`, fontSize: 11, color: token.colorTextSecondary, fontStyle: 'italic' }}>
              💬 {typingUsers[roomKey].join(', ')} {t('common.chat.isTyping', 'đang nhập...')}
            </div>
          )}

          {/* Input */}
          <Input.Group compact style={{ padding: 12, borderTop: `1px solid ${token.colorBorder}`, background: token.colorBgElevated }}>
            <Input
              style={{ width: 'calc(100% - 48px)' }}
              value={input}
              onChange={handleInputChange}
              onPressEnter={sendMessage}
              placeholder={t('common.chat.messagePlaceholder')}
              size="small"
              autoFocus
            />
            <Button type="primary" icon={<SendOutlined />} onClick={sendMessage} size="small" />
          </Input.Group>
        </div>
      )}
    </>
  );
};

export default InternalChatBox;
