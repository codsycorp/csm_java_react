import type { NotificationItem } from "#src/layout/widgets/notification/types";
import { request } from "#src/utils";

export function fetchNotifications() {
	return request
		.get("notifications", {
			ignoreLoading: true,
			retry: 0,
		})
		.json<ApiResponse<NotificationItem[]>>();
}
