import { api, unwrap } from "./api";

export type ShiftSwapType = "Swap" | "GiveAway";
export type ShiftSwapStatus = "Pending" | "Completed" | "Declined" | "Cancelled";

export type ShiftSwap = {
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

export const shiftSwapsApi = {
  list: async (shopId: string) =>
    unwrap<ShiftSwap[]>((await api.get("/shift-swaps", { params: { shopId } })).data),
  respond: async (id: string, accept: boolean) =>
    unwrap<ShiftSwap>((await api.post(`/shift-swaps/${id}/respond`, null, { params: { accept } })).data),
  cancel: async (id: string) =>
    unwrap<ShiftSwap>((await api.post(`/shift-swaps/${id}/cancel`)).data),
};
