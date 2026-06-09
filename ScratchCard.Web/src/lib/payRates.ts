import { api, unwrap } from "./api";

export type StaffPayRate = {
  id: string;
  shopId: string;
  userId?: string | null;
  rotaStaffMemberId?: string | null;
  staffName: string;
  isExternal: boolean;
  hourlyRate: number;
  effectiveFrom: string;
  notes?: string | null;
};

export const payRatesApi = {
  list: async (shopId: string) =>
    unwrap<StaffPayRate[]>((await api.get("/staff-pay-rates", { params: { shopId } })).data),
  set: async (p: {
    shopId: string; userId?: string; rotaStaffMemberId?: string;
    hourlyRate: number; effectiveFrom: string; notes?: string;
  }) => unwrap<StaffPayRate>((await api.post("/staff-pay-rates", p)).data),
  remove: async (id: string) => { await api.delete(`/staff-pay-rates/${id}`); },
};
