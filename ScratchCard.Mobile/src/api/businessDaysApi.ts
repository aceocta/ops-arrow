import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { BusinessDay } from "../types/models";

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
    actualCash: number;
    lottoPayout: number;
    scratchCardPayout: number;
    tillPayout: number;
    notes?: string;
  },
) {
  const response = await apiClient.post<ApiResponse<BusinessDay>>(`/business-days/${businessDayId}/close`, payload);
  return response.data.data;
}

export async function reopenBusinessDay(businessDayId: string, payload: { reason?: string }) {
  const response = await apiClient.post<ApiResponse<BusinessDay>>(`/business-days/${businessDayId}/reopen`, payload);
  return response.data.data;
}
