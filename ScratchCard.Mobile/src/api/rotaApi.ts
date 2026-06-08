import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { AssignableUser, AttendanceApprovalRow, BusinessDayStaff, RotaShift, RotaShiftTemplate, RotaStaffMember, ShiftAttendance, ShiftSession, ShiftTimesheetRow, TimesheetRow, TimesheetSession } from "../types/models";

export async function getBusinessDayStaff(shopId: string, date: string) {
  const response = await apiClient.get<ApiResponse<BusinessDayStaff>>("/rota/day-staff", { params: { shopId, date } });
  return response.data.data;
}

export type SaveRotaShiftPayload = {
  shopId: string;
  shiftDate: string; // yyyy-MM-dd
  shiftTemplateId: string;
  position?: string;
  notes?: string;
  assigneeUserIds: string[];
  assigneeStaffMemberIds: string[];
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

export async function createRotaStaffMember(payload: { shopId: string; name: string; phone?: string }) {
  const response = await apiClient.post<ApiResponse<RotaStaffMember>>("/rota/staff-members", payload);
  return response.data.data;
}

export async function updateRotaStaffMember(id: string, payload: { shopId: string; name: string; phone?: string }) {
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
