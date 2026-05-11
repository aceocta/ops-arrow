import { apiClient } from "./client";
import { ApiResponse } from "./types";

export async function listInvitations(shopId: string) {
  const response = await apiClient.get<ApiResponse<any[]>>("/invitations", { params: { shopId } });
  return response.data.data;
}

export async function sendInvitation(payload: {
  shopId: string;
  email: string;
  roleId: string;
  expiryHours?: number;
}) {
  const response = await apiClient.post<ApiResponse<any>>("/invitations", payload);
  return response.data.data;
}

export async function cancelInvitation(invitationId: string) {
  const response = await apiClient.delete<ApiResponse<any>>(`/invitations/${invitationId}`);
  return response.data.data;
}
