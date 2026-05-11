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
