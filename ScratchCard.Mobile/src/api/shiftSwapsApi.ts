import { apiClient } from "./client";
import { ApiResponse } from "./types";

export type ShiftSwapType = "Swap" | "GiveAway";
export type ShiftSwapStatus = "Pending" | "Completed" | "Declined" | "Cancelled";

export type ShiftSwapRequest = {
  id: string;
  shopId: string;
  type: ShiftSwapType;
  status: ShiftSwapStatus;
  requesterUserId: string;
  requesterName: string;
  fromShiftId: string;
  fromShiftLabel: string;
  targetUserId?: string | null;
  targetRotaStaffMemberId?: string | null;
  targetIsExternal: boolean;
  targetName: string;
  toShiftId?: string | null;
  toShiftLabel?: string | null;
  note?: string | null;
  createdOn: string;
  canRespond: boolean;
};

export async function listShiftSwaps(shopId: string) {
  const res = await apiClient.get<ApiResponse<ShiftSwapRequest[]>>("/shift-swaps", { params: { shopId } });
  return res.data.data;
}

export async function createShiftSwap(payload: {
  shopId: string;
  type: ShiftSwapType;
  fromShiftId: string;
  targetUserId?: string;
  targetRotaStaffMemberId?: string;
  toShiftId?: string;
  note?: string;
}) {
  const res = await apiClient.post<ApiResponse<ShiftSwapRequest>>("/shift-swaps", payload);
  return res.data.data;
}

export async function respondShiftSwap(id: string, accept: boolean) {
  const res = await apiClient.post<ApiResponse<ShiftSwapRequest>>(`/shift-swaps/${id}/respond`, null, { params: { accept } });
  return res.data.data;
}

export async function cancelShiftSwap(id: string) {
  const res = await apiClient.post<ApiResponse<ShiftSwapRequest>>(`/shift-swaps/${id}/cancel`);
  return res.data.data;
}
