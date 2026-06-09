import { api, unwrap } from "./api";

export type RotaAssignee = {
  userId?: string | null;
  rotaStaffMemberId?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  isExternal?: boolean;
};

export type RotaShift = {
  id: string;
  shopId: string;
  shiftDate: string;
  endDate: string;
  shiftTemplateId?: string | null;
  shiftName: string;
  startTime: string; // HH:mm:ss
  endTime: string;
  position?: string | null;
  notes?: string | null;
  assignees: RotaAssignee[];
};

export type RotaShiftTemplate = { templateId: string; name: string; startTime: string; endTime: string };
export type AssignableUser = { userId?: string | null; rotaStaffMemberId?: string | null; isExternal?: boolean; name: string; role: string };
export type RotaStaffMember = { id: string; name: string; phone?: string | null; email?: string | null; isActive: boolean };

export type SaveRotaShiftPayload = {
  shopId: string;
  shiftDate: string;
  shiftTemplateId: string;
  position?: string;
  notes?: string;
  assigneeUserIds: string[];
  assigneeStaffMemberIds: string[];
};

export type TimesheetRow = {
  userId?: string | null;
  rotaStaffMemberId?: string | null;
  isExternal?: boolean;
  userName: string;
  shiftsWorked: number;
  openSessions: number;
  totalHours: number;
  hourlyRate?: number | null;
  labourCost?: number | null;
};
export type ShiftTimesheetRow = {
  shiftName: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  staffCount: number;
  shiftsWorked: number;
  openSessions: number;
  totalHours: number;
};
export type TimesheetSession = {
  id: string;
  date: string;
  shiftName?: string | null;
  checkInAt: string;
  checkOutAt?: string | null;
  hours: number;
  entryMethod: "Clocked" | "Manual";
  isApproved: boolean;
};

export type AttendanceApprovalRow = {
  id: string;
  userId?: string | null;
  userName: string;
  shiftName?: string | null;
  shiftDate?: string | null;
  shiftEndDate?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  checkInAt: string;
  checkOutAt?: string | null;
  entryMethod: "Clocked" | "Manual";
  submittedOn: string;
  notes?: string | null;
};

export const rotaApi = {
  list: async (shopId: string, from: string, to: string) =>
    unwrap<RotaShift[]>((await api.get("/rota", { params: { shopId, from, to } })).data),
  templates: async (shopId: string) =>
    unwrap<RotaShiftTemplate[]>((await api.get("/rota/shift-templates", { params: { shopId } })).data),
  assignable: async (shopId: string) =>
    unwrap<AssignableUser[]>((await api.get("/rota/assignable", { params: { shopId } })).data),
  create: async (p: SaveRotaShiftPayload) => unwrap<RotaShift>((await api.post("/rota", p)).data),
  update: async (id: string, p: SaveRotaShiftPayload) => unwrap<RotaShift>((await api.put(`/rota/${id}`, p)).data),
  remove: async (id: string) => api.delete(`/rota/${id}`),
  generateWeek: async (shopId: string, weekStart: string) =>
    unwrap<RotaShift[]>((await api.post("/rota/generate-week", null, { params: { shopId, weekStart } })).data),
  timesheet: async (shopId: string, from: string, to: string) =>
    unwrap<TimesheetRow[]>((await api.get("/rota/timesheet", { params: { shopId, from, to } })).data),
  shiftTimesheet: async (shopId: string, from: string, to: string) =>
    unwrap<ShiftTimesheetRow[]>((await api.get("/rota/timesheet/by-shift", { params: { shopId, from, to } })).data),
  staffSessions: async (shopId: string, person: { userId?: string | null; rotaStaffMemberId?: string | null }, from: string, to: string) =>
    unwrap<TimesheetSession[]>(
      (await api.get("/rota/timesheet/staff", {
        params: { shopId, userId: person.userId ?? undefined, rotaStaffMemberId: person.rotaStaffMemberId ?? undefined, from, to },
      })).data,
    ),
  staffMembers: async (shopId: string) =>
    unwrap<RotaStaffMember[]>((await api.get("/rota/staff-members", { params: { shopId } })).data),
  createStaffMember: async (p: { shopId: string; name: string; phone?: string; email?: string }) =>
    unwrap<RotaStaffMember>((await api.post("/rota/staff-members", p)).data),
  updateStaffMember: async (id: string, p: { shopId: string; name: string; phone?: string; email?: string }) =>
    unwrap<RotaStaffMember>((await api.put(`/rota/staff-members/${id}`, p)).data),
  deleteStaffMember: async (id: string) => api.delete(`/rota/staff-members/${id}`),
  pendingApprovals: async (shopId: string) =>
    unwrap<AttendanceApprovalRow[]>((await api.get("/rota/attendance/pending", { params: { shopId } })).data),
  approve: async (id: string) => api.post(`/rota/attendance/${id}/approve`),
  reject: async (id: string) => api.delete(`/rota/attendance/${id}`),
  adjust: async (id: string, p: { checkInAt: string; checkOutAt?: string; notes?: string }) =>
    api.put(`/rota/attendance/${id}`, p),
};

// Build check-in/out ISO from a date + HH:mm times (overnight → check-out next day).
export function sessionIsos(dateStr: string, inHHmm: string, outHHmm: string) {
  const toIso = (d: string, t: string) => new Date(`${d}T${t}:00`).toISOString();
  const outDate = outHHmm > inHHmm ? dateStr : addDays(dateStr, 1);
  return { checkInAt: toIso(dateStr, inHHmm), checkOutAt: toIso(outDate, outHHmm) };
}

// --- date helpers (Mon–Sun weeks) ---
export function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function mondayOf(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return fmtDate(d);
}
export function addDays(dateStr: string, n: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}
export const shortTime = (t?: string | null) => (t && t.length >= 5 ? t.slice(0, 5) : t ?? "");
export function weekdayLabel(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return { weekday: d.toLocaleDateString("en-GB", { weekday: "short" }), day: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) };
}
export const isOvernight = (start?: string | null, end?: string | null) =>
  !!start && !!end && shortTime(end) <= shortTime(start);
