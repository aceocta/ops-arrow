import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { UserListItem } from "../types/models";

export async function listUsers(shopId: string) {
  const response = await apiClient.get<ApiResponse<UserListItem[]>>("/users", { params: { shopId } });
  return response.data.data;
}

export async function updateUserRole(userId: string, payload: { shopId: string; roleId: string }) {
  const response = await apiClient.put<ApiResponse<{ updated: boolean }>>(`/users/${userId}/role`, payload);
  return response.data.data;
}

export async function deactivateUser(userId: string, shopId: string) {
  const response = await apiClient.post<ApiResponse<{ updated: boolean }>>(`/users/${userId}/deactivate`, null, {
    params: { shopId },
  });
  return response.data.data;
}

export async function reactivateUser(userId: string, shopId: string) {
  const response = await apiClient.post<ApiResponse<{ updated: boolean }>>(`/users/${userId}/reactivate`, null, {
    params: { shopId },
  });
  return response.data.data;
}

/**
 * Manager-only edit of another user's profile (first/last name + optional phone). The phone is
 * never validated server-side; pass empty string to clear it.
 */
export async function updateUserDetails(
  userId: string,
  shopId: string,
  payload: { firstName?: string; lastName?: string; phoneNumber?: string },
) {
  const response = await apiClient.put<ApiResponse<UserListItem>>(`/users/${userId}/details`, payload, {
    params: { shopId },
  });
  return response.data.data;
}
