import { request } from "#src/utils";

export type CRMCustomer = Record<string, any>;

export interface GoogleIndexResponse {
  success: boolean;
  message?: string;
  data?: any;
}

async function postApi(path: string, json: Record<string, any>) {
  return request.post(path, { json, ignoreLoading: true } as any).json<any>();
}

export async function getTableData<T = any>(params: Record<string, any>) {
  return postApi("get-table-data", params) as Promise<T>;
}

export async function updateTableData<T = any>(params: Record<string, any>) {
  return postApi("update-table-data", params) as Promise<T>;
}

export async function createOrUpdateCustomer(payload: CRMCustomer) {
  return postApi("create-or-update-customer", payload);
}

export async function getChatHistory(room: string, limit = 100) {
  return postApi("chat-history", { room, limit });
}

export async function getChatHistoryWithAppId(room: string, appId: string, limit = 100) {
  return postApi("chat-history", { room, app_id: appId, limit });
}

export async function getChatHistoryGuest(appId: string, guestIdentity: string, limit = 100, guestPhone?: string) {
  return postApi("chat-history-guest", { app_id: appId, guest_identity: guestIdentity, guest_phone: guestPhone, limit });
}

export async function getChatHistoryApp(appId: string, limit = 200) {
  return postApi("chat-history-app", { app_id: appId, limit });
}

export async function getChatGuestsList(appId: string) {
  return postApi("chat-guests-list", { app_id: appId });
}

export async function markChatAsReadGuest(appId: string, guestIdentity: string) {
  return postApi("chat-mark-read-guest", { app_id: appId, guest_identity: guestIdentity });
}

export async function markChatAsReadAll(room: string, userId: string) {
  return postApi("chat-mark-read-all", { room, user_id: userId });
}

export async function deleteChatMessage(timestamp: number, appId?: string) {
  return postApi("chat-delete-message", { timestamp, app_id: appId });
}

export async function googleIndexUrl(urls: string | string[], type: "publish" | "remove"): Promise<GoogleIndexResponse> {
  return postApi("google-index-url", { urls, type });
}
