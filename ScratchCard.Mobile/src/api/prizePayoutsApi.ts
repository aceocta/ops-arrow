import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { PrizePayout } from "../types/models";

export type CreatePrizePayoutPayload = {
  shopId: string;
  businessDayId: string;
  shiftId: string;
  packId?: string;
  ticketNumber?: string;
  prizeAmount: number;
  paymentMethod: string;
  notes?: string;
};

export async function createPrizePayout(payload: CreatePrizePayoutPayload) {
  const response = await apiClient.post<ApiResponse<PrizePayout>>("/prize-payouts", payload);
  return response.data.data;
}

export async function listPrizePayouts(shiftId: string) {
  const response = await apiClient.get<ApiResponse<PrizePayout[]>>("/prize-payouts", { params: { shiftId } });
  return response.data.data;
}

export async function approvePrizePayout(prizePayoutId: string, payload: { notes?: string }) {
  const response = await apiClient.post<ApiResponse<PrizePayout>>(`/prize-payouts/${prizePayoutId}/approve`, payload);
  return response.data.data;
}
