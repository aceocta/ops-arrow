import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { ScratchCardPack, Shift, ShiftCloseResult, ShiftSalesEntry } from "../types/models";
import { parsePackStatus, parseSellingOrder } from "../utils/enumParsers";

function mapPack(pack: ScratchCardPack): ScratchCardPack {
  return {
    ...pack,
    status: parsePackStatus((pack as any).status),
    sellingOrder: parseSellingOrder((pack as any).sellingOrder),
  };
}

export async function listShifts(shopId: string, businessDayId?: string) {
  const response = await apiClient.get<ApiResponse<Shift[]>>("/shifts", {
    params: { shopId, businessDayId },
  });
  return response.data.data;
}

export async function openShift(payload: { businessDayId: string; shopId: string; shiftName: string }) {
  const response = await apiClient.post<ApiResponse<Shift>>("/shifts/open", payload);
  return response.data.data;
}

export async function getShift(shiftId: string) {
  const response = await apiClient.get<ApiResponse<Shift>>(`/shifts/${shiftId}`);
  return response.data.data;
}

export async function reopenShift(shiftId: string, payload: { reason?: string }) {
  const response = await apiClient.post<ApiResponse<Shift>>(`/shifts/${shiftId}/reopen`, payload);
  return response.data.data;
}

export async function getActivePacksForShift(shiftId: string) {
  const response = await apiClient.get<ApiResponse<ScratchCardPack[]>>(`/shifts/${shiftId}/active-packs`);
  return response.data.data.map(mapPack);
}

export async function finalizeShift(shiftId: string, payload: unknown) {
  const response = await apiClient.post<ApiResponse<ShiftCloseResult>>(`/shift-sales/${shiftId}/submit`, payload);
  return response.data.data;
}

export async function syncOfflineShiftClose(payload: unknown) {
  const response = await apiClient.post<ApiResponse<ShiftCloseResult>>(`/shift-sales/sync-offline`, payload);
  return response.data.data;
}

export async function getShiftSales(shiftId: string) {
  const response = await apiClient.get<ApiResponse<ShiftSalesEntry[]>>(`/shift-sales/${shiftId}`);
  return response.data.data;
}
