import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { AssignableUser, AttendanceApprovalRow, BusinessDayStaff, LeaveBalance, LeaveDay, LeaveEntitlement, LeaveRequest, LeaveType, RotaShift, RotaShiftTemplate, RotaStaffMember, ShiftAttendance, ShiftSession, ShiftTimesheetRow, TimesheetRow, TimesheetSession } from "../types/models";

export async function getBusinessDayStaff(shopId: string, date: string) {
  const response = await apiClient.get<ApiResponse<BusinessDayStaff>>("/rota/day-staff", { params: { shopId, date } });
  return response.data.data;
}

export type SaveRotaShiftAssignment = {
  userId?: string;
  rotaStaffMemberId?: string;
  /** Omitted/empty/"Regular shift" normalizes to null (regular) server-side. */
  reason?: string;
  note?: string;
};

export type SaveRotaShiftPayload = {
  shopId: string;
  shiftDate: string; // yyyy-MM-dd
  shiftTemplateId: string;
  position?: string;
  notes?: string;
  assigneeUserIds: string[];
  assigneeStaffMemberIds: string[];
  /** When present, authoritative — replaces assigneeUserIds/assigneeStaffMemberIds. */
  assignments?: SaveRotaShiftAssignment[];
};

export async function getShiftTemplates(shopId: string) {
  const response = await apiClient.get<ApiResponse<RotaShiftTemplate[]>>("/rota/shift-templates", { params: { shopId } });
  return response.data.data;
}

export async function getRota(shopId: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<RotaShift[]>>("/rota", { params: { shopId, from, to } });
  return response.data.data;
}

export async function createRotaShift(payload: SaveRotaShiftPayload) {
  const response = await apiClient.post<ApiResponse<RotaShift>>("/rota", payload);
  return response.data.data;
}

export async function generateRotaWeek(shopId: string, weekStart: string) {
  const response = await apiClient.post<ApiResponse<RotaShift[]>>("/rota/generate-week", null, { params: { shopId, weekStart } });
  return response.data.data;
}

export async function updateRotaShift(id: string, payload: SaveRotaShiftPayload) {
  const response = await apiClient.put<ApiResponse<RotaShift>>(`/rota/${id}`, payload);
  return response.data.data;
}

export async function deleteRotaShift(id: string) {
  await apiClient.delete<ApiResponse<boolean>>(`/rota/${id}`);
}

export async function getAssignableUsers(shopId: string) {
  const response = await apiClient.get<ApiResponse<AssignableUser[]>>("/rota/assignable", { params: { shopId } });
  return response.data.data;
}

export async function getRotaStaffMembers(shopId: string) {
  const response = await apiClient.get<ApiResponse<RotaStaffMember[]>>("/rota/staff-members", { params: { shopId } });
  return response.data.data;
}

export async function createRotaStaffMember(payload: { shopId: string; name: string; phone?: string; email?: string }) {
  const response = await apiClient.post<ApiResponse<RotaStaffMember>>("/rota/staff-members", payload);
  return response.data.data;
}

export async function updateRotaStaffMember(id: string, payload: { shopId: string; name: string; phone?: string; email?: string }) {
  const response = await apiClient.put<ApiResponse<RotaStaffMember>>(`/rota/staff-members/${id}`, payload);
  return response.data.data;
}

export async function deleteRotaStaffMember(id: string) {
  await apiClient.delete<ApiResponse<boolean>>(`/rota/staff-members/${id}`);
}

export async function getTimesheet(shopId: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<TimesheetRow[]>>("/rota/timesheet", { params: { shopId, from, to } });
  return response.data.data;
}

export async function getShiftTimesheet(shopId: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<ShiftTimesheetRow[]>>("/rota/timesheet/by-shift", { params: { shopId, from, to } });
  return response.data.data;
}

export async function getStaffSessions(shopId: string, person: { userId?: string | null; rotaStaffMemberId?: string | null }, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<TimesheetSession[]>>("/rota/timesheet/staff", {
    params: { shopId, userId: person.userId ?? undefined, rotaStaffMemberId: person.rotaStaffMemberId ?? undefined, from, to },
  });
  return response.data.data;
}

export async function getShiftSessions(shopId: string, shiftName: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<ShiftSession[]>>("/rota/timesheet/by-shift/sessions", { params: { shopId, shiftName, from, to } });
  return response.data.data;
}

export type RotaTimesheetLock = {
  shopId: string;
  lockedThrough: string; // yyyy-MM-dd
  lockedByUserId: string;
  lockedByName: string;
  lockedOn: string; // ISO
  notes?: string;
};

export async function getTimesheetLock(shopId: string) {
  const response = await apiClient.get<ApiResponse<RotaTimesheetLock | null>>("/rota/timesheet-lock", { params: { shopId } });
  return response.data.data;
}

export async function setTimesheetLock(payload: { shopId: string; lockedThrough: string | null; notes?: string }) {
  const response = await apiClient.put<ApiResponse<RotaTimesheetLock | null>>("/rota/timesheet-lock", payload);
  return response.data.data;
}

export async function getMyShifts(shopId: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<RotaShift[]>>("/rota/mine", { params: { shopId, from, to } });
  return response.data.data;
}

export async function getMyCurrentAttendance(shopId: string) {
  const response = await apiClient.get<ApiResponse<ShiftAttendance | null>>("/rota/attendance/current", { params: { shopId } });
  return response.data.data;
}

export async function checkInShift(shopId: string, rotaShiftId?: string) {
  const response = await apiClient.post<ApiResponse<ShiftAttendance>>("/rota/attendance/check-in", null, { params: { shopId, rotaShiftId } });
  return response.data.data;
}

export async function checkOutShift(shopId: string) {
  const response = await apiClient.post<ApiResponse<ShiftAttendance>>("/rota/attendance/check-out", null, { params: { shopId } });
  return response.data.data;
}

export type ManualAttendancePayload = {
  shopId: string;
  rotaShiftId?: string;
  rotaStaffMemberId?: string; // set when a manager records hours for a roster-only member
  userId?: string; // set when a manager records hours for another internal user
  checkInAt: string; // ISO
  checkOutAt?: string; // ISO
  notes?: string;
};

export async function saveManualAttendance(payload: ManualAttendancePayload) {
  const response = await apiClient.post<ApiResponse<ShiftAttendance>>("/rota/attendance/manual", payload);
  return response.data.data;
}

export async function getPendingApprovals(shopId: string) {
  const response = await apiClient.get<ApiResponse<AttendanceApprovalRow[]>>("/rota/attendance/pending", { params: { shopId } });
  return response.data.data;
}

export async function approveAttendance(id: string) {
  const response = await apiClient.post<ApiResponse<ShiftAttendance>>(`/rota/attendance/${id}/approve`, null);
  return response.data.data;
}

export async function updateAttendance(id: string, payload: { checkInAt: string; checkOutAt?: string; notes?: string }) {
  const response = await apiClient.put<ApiResponse<ShiftAttendance>>(`/rota/attendance/${id}`, payload);
  return response.data.data;
}

export async function rejectAttendance(id: string) {
  await apiClient.delete<ApiResponse<boolean>>(`/rota/attendance/${id}`);
}

export type RotaTimesheetReviewStatus = "PendingStaff" | "Confirmed" | "Disputed" | "ManagerApproved";

export type RotaTimesheetReview = {
  id: string;
  shopId: string;
  periodFrom: string; // yyyy-MM-dd
  periodTo: string; // yyyy-MM-dd
  userId: string;
  userName: string;
  status: RotaTimesheetReviewStatus;
  staffNote?: string;
  managerNote?: string;
  confirmedOn?: string; // ISO
  resolvedByUserId?: string;
  resolvedOn?: string; // ISO
  totalHours: number;
  openSessions: number;
};

export async function requestTimesheetReviews(payload: { shopId: string; from: string; to: string }) {
  const response = await apiClient.post<ApiResponse<RotaTimesheetReview[]>>("/rota/timesheet-reviews/request", payload);
  return response.data.data;
}

export async function getTimesheetReviews(shopId: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<RotaTimesheetReview[]>>("/rota/timesheet-reviews", { params: { shopId, from, to } });
  return response.data.data;
}

export async function getMyTimesheetReviews(shopId: string) {
  const response = await apiClient.get<ApiResponse<RotaTimesheetReview[]>>("/rota/timesheet-reviews/mine", { params: { shopId } });
  return response.data.data;
}

export async function getTimesheetReviewSessions(reviewId: string) {
  const response = await apiClient.get<ApiResponse<TimesheetSession[]>>(`/rota/timesheet-reviews/${reviewId}/sessions`);
  return response.data.data;
}

// Approved timesheet periods, newest period first (manager view — all staff).
export async function getTimesheetReviewHistory(shopId: string, take?: number) {
  const response = await apiClient.get<ApiResponse<RotaTimesheetReview[]>>("/rota/timesheet-reviews/history", { params: { shopId, take } });
  return response.data.data;
}

// The signed-in staff member's own approved timesheet periods, newest first.
export async function getMyTimesheetReviewHistory(shopId: string, take?: number) {
  const response = await apiClient.get<ApiResponse<RotaTimesheetReview[]>>("/rota/timesheet-reviews/mine/history", { params: { shopId, take } });
  return response.data.data;
}

export async function confirmTimesheetReview(id: string) {
  const response = await apiClient.post<ApiResponse<RotaTimesheetReview>>(`/rota/timesheet-reviews/${id}/confirm`, null);
  return response.data.data;
}

export async function disputeTimesheetReview(id: string, note: string) {
  const response = await apiClient.post<ApiResponse<RotaTimesheetReview>>(`/rota/timesheet-reviews/${id}/dispute`, { note });
  return response.data.data;
}

export async function resolveTimesheetReview(id: string, payload: { approved: boolean; managerNote?: string; reRequestConfirmation: boolean }) {
  const response = await apiClient.post<ApiResponse<RotaTimesheetReview>>(`/rota/timesheet-reviews/${id}/resolve`, payload);
  return response.data.data;
}

export async function approveTimesheetReview(id: string) {
  const response = await apiClient.post<ApiResponse<RotaTimesheetReview>>(`/rota/timesheet-reviews/${id}/approve`, null);
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Leave management
// ---------------------------------------------------------------------------
export type CreateLeaveRequestPayload = {
  shopId: string;
  /** Set one of userId/rotaStaffMemberId when a manager records leave on someone's behalf
   *  (instantly approved). Both omitted = the signed-in user's own request (pending). */
  userId?: string;
  rotaStaffMemberId?: string;
  type: LeaveType;
  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd
  hoursPerDay: number;
  staffNote?: string;
};

export async function createLeaveRequest(payload: CreateLeaveRequestPayload) {
  const response = await apiClient.post<ApiResponse<LeaveRequest>>("/rota/leave", payload);
  return response.data.data;
}

// All staff's leave requests in the range (manager).
export async function getLeaveRequests(shopId: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<LeaveRequest[]>>("/rota/leave", { params: { shopId, from, to } });
  return response.data.data;
}

// The signed-in staff member's own leave requests.
export async function getMyLeaveRequests(shopId: string) {
  const response = await apiClient.get<ApiResponse<LeaveRequest[]>>("/rota/leave/mine", { params: { shopId } });
  return response.data.data;
}

export async function approveLeaveRequest(id: string, payload: { managerNote?: string; hoursPerDay?: number; isPaid?: boolean }) {
  const response = await apiClient.post<ApiResponse<LeaveRequest>>(`/rota/leave/${id}/approve`, payload);
  return response.data.data;
}

export async function rejectLeaveRequest(id: string, managerNote: string) {
  const response = await apiClient.post<ApiResponse<LeaveRequest>>(`/rota/leave/${id}/reject`, { managerNote });
  return response.data.data;
}

// Staff can cancel their own Pending requests; managers any Pending/Approved one.
export async function cancelLeaveRequest(id: string) {
  const response = await apiClient.post<ApiResponse<LeaveRequest>>(`/rota/leave/${id}/cancel`, null);
  return response.data.data;
}

// Holiday balance for the current year. Omit `person` for the signed-in user. Null = no entitlement set.
export async function getLeaveBalance(shopId: string, person?: { userId?: string | null; rotaStaffMemberId?: string | null }) {
  const response = await apiClient.get<ApiResponse<LeaveBalance | null>>("/rota/leave/balance", {
    params: { shopId, userId: person?.userId ?? undefined, rotaStaffMemberId: person?.rotaStaffMemberId ?? undefined },
  });
  return response.data.data;
}

export async function getLeaveEntitlements(shopId: string) {
  const response = await apiClient.get<ApiResponse<LeaveEntitlement[]>>("/rota/leave/entitlements", { params: { shopId } });
  return response.data.data;
}

export type SaveLeaveEntitlementPayload = {
  shopId: string;
  userId?: string;
  rotaStaffMemberId?: string;
  yearStart: string; // yyyy-MM-dd
  entitledHours: number;
  usualHoursPerDay: number;
};

// Upserts the person's entitlement for the holiday year.
export async function saveLeaveEntitlement(payload: SaveLeaveEntitlementPayload) {
  const response = await apiClient.put<ApiResponse<LeaveEntitlement>>("/rota/leave/entitlements", payload);
  return response.data.data;
}

// Approved leave expanded per day. Omit `person` for the signed-in user.
export async function getLeaveDays(shopId: string, person: { userId?: string | null; rotaStaffMemberId?: string | null } | undefined, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<LeaveDay[]>>("/rota/leave/days", {
    params: { shopId, userId: person?.userId ?? undefined, rotaStaffMemberId: person?.rotaStaffMemberId ?? undefined, from, to },
  });
  return response.data.data;
}
