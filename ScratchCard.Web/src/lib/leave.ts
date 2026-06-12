import { api, unwrap } from "./api";

// Leave management (LeaveManagement module) — same backend contract as the mobile app.

export type LeaveType = "Holiday" | "Sick" | "Unpaid" | "Other";
export type LeaveStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";

export type LeaveRequest = {
  id: string;
  shopId: string;
  userId?: string | null;
  rotaStaffMemberId?: string | null;
  isExternal: boolean;
  userName: string;
  type: LeaveType;
  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd
  hoursPerDay: number;
  totalDays: number;
  totalHours: number;
  isPaid: boolean;
  status: LeaveStatus;
  staffNote?: string | null;
  managerNote?: string | null;
  decidedOn?: string | null; // ISO
  requestedOn: string; // ISO
};

export type LeaveEntitlement = {
  id: string;
  userId?: string | null;
  rotaStaffMemberId?: string | null;
  isExternal: boolean;
  userName: string;
  yearStart: string; // yyyy-MM-dd
  entitledHours: number;
  usualHoursPerDay: number;
};

/** One approved leave day for a person (per-day expansion of approved requests). */
export type LeaveDay = {
  date: string; // yyyy-MM-dd
  type: LeaveType;
  hours: number;
  isPaid: boolean;
};

// Manager records leave for a person via userId/rotaStaffMemberId → saved instantly Approved.
export type CreateLeavePayload = {
  shopId: string;
  userId?: string;
  rotaStaffMemberId?: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  staffNote?: string;
};

export type SaveLeaveEntitlementPayload = {
  shopId: string;
  userId?: string;
  rotaStaffMemberId?: string;
  yearStart: string;
  entitledHours: number;
  usualHoursPerDay: number;
};

export const leaveApi = {
  list: async (shopId: string, from: string, to: string) =>
    unwrap<LeaveRequest[]>((await api.get("/rota/leave", { params: { shopId, from, to } })).data),
  create: async (p: CreateLeavePayload) => unwrap<LeaveRequest>((await api.post("/rota/leave", p)).data),
  approve: async (id: string, p: { managerNote?: string; hoursPerDay?: number; isPaid?: boolean }) =>
    unwrap<LeaveRequest>((await api.post(`/rota/leave/${id}/approve`, p)).data),
  reject: async (id: string, managerNote: string) =>
    unwrap<LeaveRequest>((await api.post(`/rota/leave/${id}/reject`, { managerNote })).data),
  cancel: async (id: string) => unwrap<LeaveRequest>((await api.post(`/rota/leave/${id}/cancel`)).data),
  entitlements: async (shopId: string) =>
    unwrap<LeaveEntitlement[]>((await api.get("/rota/leave/entitlements", { params: { shopId } })).data),
  saveEntitlement: async (p: SaveLeaveEntitlementPayload) =>
    unwrap<LeaveEntitlement>((await api.put("/rota/leave/entitlements", p)).data),
  // Approved leave expanded per day for one person.
  days: async (shopId: string, person: { userId?: string | null; rotaStaffMemberId?: string | null }, from: string, to: string) =>
    unwrap<LeaveDay[]>(
      (await api.get("/rota/leave/days", {
        params: { shopId, userId: person.userId ?? undefined, rotaStaffMemberId: person.rotaStaffMemberId ?? undefined, from, to },
      })).data,
    ),
};
