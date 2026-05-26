import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { BusinessDay, Canister, CanisterDrop } from "../types/models";

export async function listBusinessDays(shopId: string, params?: { from?: string; to?: string }) {
  const response = await apiClient.get<ApiResponse<BusinessDay[]>>("/business-days", {
    params: { shopId, ...params },
  });
  return response.data.data;
}

export async function openBusinessDay(payload: { shopId: string; businessDate: string }) {
  const response = await apiClient.post<ApiResponse<BusinessDay>>("/business-days/open", payload);
  return response.data.data;
}

export async function getBusinessDay(businessDayId: string) {
  const response = await apiClient.get<ApiResponse<BusinessDay>>(`/business-days/${businessDayId}`);
  return response.data.data;
}

export async function closeBusinessDay(
  businessDayId: string,
  payload: {
    lottoPayout: number;
    scratchCardPayout: number;
    tillPayout: number;
    notes?: string;
    attachments?: Array<{
      fileName: string;
      base64: string;
      contentType?: string;
    }>;
    attachmentFileName?: string;
    attachmentBase64?: string;
  },
) {
  const response = await apiClient.post<ApiResponse<BusinessDay>>(`/business-days/${businessDayId}/close`, payload);
  return response.data.data;
}

export async function reopenBusinessDay(businessDayId: string, payload: { reason?: string }) {
  const response = await apiClient.post<ApiResponse<BusinessDay>>(`/business-days/${businessDayId}/reopen`, payload);
  return response.data.data;
}

export async function getBusinessDayCloseAttachmentContent(attachmentId: string) {
  const response = await apiClient.get<ApiResponse<string | null>>(`/business-days/attachments/${attachmentId}/content`);
  return response.data.data ?? undefined;
}

export async function listCanisterDrops(businessDayId: string) {
  const response = await apiClient.get<ApiResponse<CanisterDrop[]>>(`/business-days/${businessDayId}/safe-drop/canister-drops`);
  return response.data.data;
}

export async function listCanisters(businessDayId: string) {
  const response = await apiClient.get<ApiResponse<Canister[]>>(`/business-days/${businessDayId}/safe-drop/canisters`);
  return response.data.data;
}

export async function addCanisterDrop(
  businessDayId: string,
  payload: {
    canisterNumber: string;
    amount: number;
    droppedByName?: string;
  },
) {
  const response = await apiClient.post<ApiResponse<CanisterDrop>>(`/business-days/${businessDayId}/safe-drop/canister-drops`, payload);
  return response.data.data;
}

export async function approveCanisterDrop(canisterDropId: string, notes?: string) {
  const response = await apiClient.post<ApiResponse<CanisterDrop>>(
    `/business-days/safe-drop/canister-drops/${canisterDropId}/approve`,
    { notes },
  );
  return response.data.data;
}
