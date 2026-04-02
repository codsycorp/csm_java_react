export interface NotificationItem {
	avatar: string;
	date: string;
	isRead?: boolean;
	message: string;
	title: string;
	type?: 'system' | 'chat'; // Phân biệt loại thông báo
	roomId?: string; // Nếu là chat thì lưu phòng/nhóm
	fromUserId?: string; // Nếu là chat thì lưu user gửi
	guestPhone?: string; // Số điện thoại guest user
	guestSessionId?: string; // Định danh phiên chat của guest user
	appId?: string; // AppId của chat
}
