export interface ChatMessage {
  room: string;
  username: string;
  userId?: string;
  avatar?: string;
  isAdmin?: boolean;
  eventType?: string;
  tableName?: string;
  action?: string;
  message: string;
  primaryKeys?: Record<string, any>;
  readBy?: string[];
  appId?: string;
  to?: string;
  guestPhone?: string; // Số điện thoại của khách (dùng làm identifier)
  guestSessionId?: string; // Định danh phiên chat ẩn danh của khách
  locale?: string; // Ngôn ngữ UI hiện tại (vi-VN, en-US, zh-CN...)
  timestamp?: number; // Thời gian gửi tin nhắn (milliseconds)
}
