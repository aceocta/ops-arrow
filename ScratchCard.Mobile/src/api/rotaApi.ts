import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { AssignableUser, AttendanceApprovalRow, BusinessDayStaff, RotaShift, RotaShiftTemplate, ShiftAttendance, TimesheetRow } from "../types/models";

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

export async function getTimesheet(shopId: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<TimesheetRow[]>>("/rota/timesheet", { params: { shopId, from, to } });
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
