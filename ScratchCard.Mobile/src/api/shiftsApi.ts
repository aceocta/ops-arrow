import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { ScratchCardPack, Shift, ShiftCloseCandidate, ShiftCloseResult, ShiftSalesEntry } from "../types/models";
import { EntryMethod } from "../types/enums";
import { parsePackStatus, parseSellingOrder } from "../utils/enumParsers";

export type ShiftPackClosing = {
  packId: string;
  packNumber: string;
  displayNumber?: number | null;
  gameName: string;
  openingSerialNumber: string;
  closingSerialNumber: string;
  originalScannedSerialNumber?: string | null;
  entryMethod: EntryMethod;
  manualEntryReason?: string | null;
  notes?: string | null;
  soldQuantity: number;
  ticketPrice: number;
  salesAmount: number;
  remainingTickets: number;
  enteredOn: string;
};

export type UpsertShiftPackClosingPayload = {
  packId: string;
  closingSerialNumber: string;
  originalScannedSerialNumber?: string;
  // Numeric EntryMethod (1=Scanned, 2=Manual, 3=ScannedEdited) to match the API enum binding.
  entryMethod: number;
  manualEntryReason?: string;
  notes?: string;
};

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

export async function openShift(payload: {
  businessDayId: string;
  shopId: string;
  shiftName?: string;
  openingSerialConfirmations?: Array<{ packId: string; openingSerialNumber: string }>;
}) {
  const response = await apiClient.post<ApiResponse<Shift>>("/shifts/open", payload);
  return response.data.data;
}

export async function startScheduledShift(
  shiftId: string,
  payload?: {
    openingSerialConfirmations?: Array<{ packId: string; openingSerialNumber: string }>;
  },
) {
  const response = await apiClient.post<ApiResponse<Shift>>(`/shifts/${shiftId}/start`, payload ?? {});
  return response.data.data;
}

export async function getShift(shiftId: string) {
  const response = await apiClient.get<ApiResponse<Shift>>(`/shifts/${shiftId}`);
  return response.data.data;
}

export async function listShiftCloseCandidates(shopId: string) {
  const response = await apiClient.get<ApiResponse<ShiftCloseCandidate[]>>("/shifts/close-candidates", {
    params: { shopId },
  });
  return response.data.data;
}

export async function reopenShift(shiftId: string, payload: { reason?: string }) {
  const response = await apiClient.post<ApiResponse<Shift>>(`/shifts/${shiftId}/reopen`, payload);
  return response.data.data;
}

export async function deleteShift(shiftId: string, payload?: { reason?: string }) {
  const response = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/shifts/${shiftId}`, {
    data: payload ?? {},
  });
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

export type ShiftSalesTotal = {
  shiftId: string;
  soldQuantity: number;
  salesAmount: number;
};

// Per-shift sales totals for a whole business day in one request (replaces fetching each shift's
// sales individually on the day-management screen).
export async function getDayShiftSalesTotals(businessDayId: string) {
  const response = await apiClient.get<ApiResponse<ShiftSalesTotal[]>>("/shift-sales/day-totals", {
    params: { businessDayId },
  });
  return response.data.data;
}

export async function getShiftCloseAttachmentContent(attachmentId: string) {
  const response = await apiClient.get<ApiResponse<string | null>>(`/shifts/attachments/${attachmentId}/content`);
  return response.data.data ?? undefined;
}

export async function listShiftClosingNumbers(shiftId: string) {
  const response = await apiClient.get<ApiResponse<ShiftPackClosing[]>>(`/shift-sales/${shiftId}/closing-numbers`);
  return response.data.data;
}

export async function upsertShiftClosingNumber(shiftId: string, payload: UpsertShiftPackClosingPayload) {
  const response = await apiClient.put<ApiResponse<ShiftPackClosing>>(`/shift-sales/${shiftId}/closing-numbers`, payload);
  return response.data.data;
}

export async function deleteShiftClosingNumber(shiftId: string, packId: string) {
  const response = await apiClient.delete<ApiResponse<boolean>>(`/shift-sales/${shiftId}/closing-numbers/${packId}`);
  return response.data.data;
}
