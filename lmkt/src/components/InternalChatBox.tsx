
import React, { useState, useEffect, useRef } from "react";
import { UserOutlined, SendOutlined, CloseOutlined, MinusOutlined } from "@ant-design/icons";
import { Input, Button, List, Avatar, theme, Tooltip } from "antd";
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
  const user = useUserStore();
  // CRITICAL: Use same pattern as permission.ts for getting effective appId
  // Priority: user.app_id (from login) > store.currentAppId (from AppStore) > fallback to "csm"
  const appId = (user.app_id || "").trim() || useAppStore.getState().getCurrentAppId() || "csm";
  const chatRoom = room || appId;
  const listRef = useRef<HTMLDivElement>(null);
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
  
  // Get messages for this specific chat
  const messages = allMessages[username || chatRoom] || [];
  const unreadCount = unreadCounts[username || chatRoom] || 0;

  const { guestPhone: guestPhoneFromHook, isGuest, setChatUrl, getChatUrlToSend } = useGuestPhone();
  
  // Use username prop if provided (from WebsiteLayout), otherwise use hook value
  const effectiveGuestPhone = isGuest ? (username || guestPhoneFromHook) : "";

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
      openChatContext(username || chatRoom);
      loadHistory(username || chatRoom, isGuest ? effectiveGuestPhone : username);
    }
    return () => {
      if (visible) {
        closeChatContext(username || chatRoom);
      }
    };
  }, [visible, username, chatRoom, isGuest, effectiveGuestPhone, openChatContext, closeChatContext, loadHistory]);

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

  // Mark as read khi chat box mở
  useEffect(() => {
    if (visible) {
      markAsRead(username || chatRoom);
    }
  }, [visible, username, chatRoom, markAsRead]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  }, [messages]);

  // Mark as read khi chat box mở
  useEffect(() => {
    if (visible) {
      markAsRead(username || chatRoom);
    }
  }, [visible, username, chatRoom, markAsRead]);

  // Handle input with typing indicator
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    
    // Emit typing event if socket connected
    const roomIdentifier = username || chatRoom;
    
    if (connected && roomIdentifier) {
      const actualRoom = username ? `user:${appId};${username}` : `app:${appId}`;
      
      (window as any).emitTyping?.(actualRoom, username || effectiveGuestPhone, appId);
    }
  };

  const sendMessage = () => {
    if (input.trim()) {
      // Save chat URL on first message from guest
      if (isGuest) {
        setChatUrl(window.location.href);
      }
      
      sendMessageContext(
        username || chatRoom,
        input,
        isGuest ? undefined : username
      );
      setInput("");
    }
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
                  dataSource={messages}
                  renderItem={item => {
                    const isMyMessage = isGuest ? item.username === username : item.userId === user.userId;
                    const displayName = isMyMessage ? t('common.chat.you') : item.username;

                    return (
                      <List.Item
                        style={{
                          background: isMyMessage ? token.colorBgTextHover : undefined,
                          padding: '8px 4px',
                          marginBottom: 8,
                          borderRadius: 4,
                        }}
                      >
                        <List.Item.Meta
                          avatar={item.avatar ? <Avatar src={item.avatar} size="small" /> : <Avatar icon={<UserOutlined />} size="small" />}
                          title={
                            <span style={{ fontSize: 12, fontWeight: 600 }}>
                              {displayName}
                              {item.isAdmin && !isMyMessage && (
                                <span style={{ color: token.colorWarning, marginLeft: 6 }}>
                                  [{t('common.chat.admin')}]
                                </span>
                              )}
                            </span>
                          }
                          description={<span style={{ fontSize: 13, color: token.colorTextSecondary }}>
                            {item.message}
                          </span>}
                        />
                      </List.Item>
                    );
                  }}
                />
              </div>

              {/* Typing Indicator */}
              {typingUsers[username || chatRoom] && typingUsers[username || chatRoom].length > 0 && (
                <div style={{ padding: '6px 12px', background: token.colorBgElevated, borderTop: `1px solid ${token.colorBorder}`, fontSize: 11, color: token.colorTextSecondary, fontStyle: 'italic' }}>
                  💬 {typingUsers[username || chatRoom].join(', ')} {t('common.chat.isTyping', 'đang nhập...')}
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
              dataSource={messages}
              renderItem={item => {
                const isMyMessage = isGuest ? item.username === username : item.userId === user.userId;
                const displayName = isMyMessage ? t('common.chat.you') : item.username;

                return (
                  <List.Item
                    style={{
                      background: isMyMessage ? token.colorBgTextHover : undefined,
                      padding: '8px 4px',
                      marginBottom: 6,
                      borderRadius: 4,
                    }}
                  >
                    <List.Item.Meta
                      avatar={item.avatar ? <Avatar src={item.avatar} size="small" /> : <Avatar icon={<UserOutlined />} size="small" />}
                      title={
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
                        </span>
                      }
                      description={
                        <span style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>
                          {item.message}
                        </span>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </div>

          {/* Input */}
          {typingUsers[username || chatRoom] && typingUsers[username || chatRoom].length > 0 && (
            <div style={{ padding: '6px 12px', background: token.colorBgElevated, borderTop: `1px solid ${token.colorBorder}`, fontSize: 11, color: token.colorTextSecondary, fontStyle: 'italic' }}>
              💬 {typingUsers[username || chatRoom].join(', ')} {t('common.chat.isTyping', 'đang nhập...')}
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
