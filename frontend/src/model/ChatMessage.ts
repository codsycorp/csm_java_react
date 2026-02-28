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
  timestamp?: number; // Thời gian gửi tin nhắn (milliseconds)
}
