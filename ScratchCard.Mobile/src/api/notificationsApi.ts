import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { NotificationLogRow } from "../types/models";

export async function getNotificationLogs(shopId: string) {
  const response = await apiClient.get<ApiResponse<NotificationLogRow[]>>("/notifications", {
    params: { shopId },
  });
  return response.data.data;
}

export async function retryNotification(notificationId: string) {
  const response = await apiClient.post<ApiResponse<{ retried: boolean }>>(`/notifications/${notificationId}/retry`);
  return response.data.data;
}

type RegisterPushTokenPayload = {
  shopId: string;
  pushToken: string;
  platform: string;
  deviceName?: string;
};

type UnregisterPushTokenPayload = {
  shopId: string;
  pushToken: string;
};

export async function registerPushToken(payload: RegisterPushTokenPayload) {
  const response = await apiClient.post<ApiResponse<{ registered: boolean }>>("/notifications/push/register", payload);
  return response.data.data;
}

export async function unregisterPushToken(payload: UnregisterPushTokenPayload) {
  const response = await apiClient.post<ApiResponse<{ unregistered: boolean }>>("/notifications/push/unregister", payload);
  return response.data.data;
}
