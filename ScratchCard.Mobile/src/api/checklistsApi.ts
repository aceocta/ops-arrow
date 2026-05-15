import { apiClient } from "./client";
import { ApiResponse } from "./types";
import {
  ChecklistCompletionHistoryRow,
  ChecklistDailyGroup,
  ChecklistDailyLog,
  ChecklistDailyTask,
  ChecklistTaskCompletion,
  ShopChecklistGroup,
  ShopChecklistTask,
} from "../types/models";

function normalizeDateOnly(value: unknown) {
  const raw = typeof value === "string" ? value : "";
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

function mapChecklistTask(raw: any): ShopChecklistTask {
  return {
    id: String(raw.id),
    shopId: String(raw.shopId),
    checklistGroupId: String(raw.checklistGroupId),
    taskName: String(raw.taskName ?? ""),
    description: typeof raw.description === "string" ? raw.description : undefined,
    displayOrder: Number(raw.displayOrder ?? 0),
    isRequired: Boolean(raw.isRequired),
    isActive: Boolean(raw.isActive),
    notesRequiredOnComplete: Boolean(raw.notesRequiredOnComplete),
    requiredForShopOpen: Boolean(raw.requiredForShopOpen),
    requiredForShiftClose: Boolean(raw.requiredForShiftClose),
    requiredForDayClose: Boolean(raw.requiredForDayClose),
    isSystemDefault: Boolean(raw.isSystemDefault),
  };
}

function mapChecklistGroup(raw: any): ShopChecklistGroup {
  return {
    id: String(raw.id),
    shopId: String(raw.shopId),
    groupName: String(raw.groupName ?? ""),
    description: typeof raw.description === "string" ? raw.description : undefined,
    displayOrder: Number(raw.displayOrder ?? 0),
    isActive: Boolean(raw.isActive),
    isSystemDefault: Boolean(raw.isSystemDefault),
    tasks: Array.isArray(raw.tasks) ? raw.tasks.map(mapChecklistTask) : [],
  };
}

function mapChecklistCompletion(raw: any): ChecklistTaskCompletion {
  return {
    id: String(raw.id),
    shopId: String(raw.shopId),
    companyId: raw.companyId ? String(raw.companyId) : undefined,
    businessDate: normalizeDateOnly(raw.businessDate),
    shiftId: raw.shiftId ? String(raw.shiftId) : undefined,
    checklistGroupId: String(raw.checklistGroupId),
    checklistTaskId: String(raw.checklistTaskId),
    isCompleted: Boolean(raw.isCompleted),
    completedByUserId: raw.completedByUserId ? String(raw.completedByUserId) : undefined,
    completedByName: typeof raw.completedByName === "string" ? raw.completedByName : undefined,
    completedOn: typeof raw.completedOn === "string" ? raw.completedOn : undefined,
    notes: typeof raw.notes === "string" ? raw.notes : undefined,
  };
}

function mapChecklistDailyTask(raw: any): ChecklistDailyTask {
  return {
    task: mapChecklistTask(raw.task),
    completion: raw.completion ? mapChecklistCompletion(raw.completion) : undefined,
  };
}

function mapChecklistDailyGroup(raw: any): ChecklistDailyGroup {
  return {
    group: mapChecklistGroup(raw.group),
    completedCount: Number(raw.completedCount ?? 0),
    totalCount: Number(raw.totalCount ?? 0),
    tasks: Array.isArray(raw.tasks) ? raw.tasks.map(mapChecklistDailyTask) : [],
  };
}

function mapChecklistDailyLog(raw: any): ChecklistDailyLog {
  return {
    shopId: String(raw.shopId),
    businessDate: normalizeDateOnly(raw.businessDate),
    shiftId: raw.shiftId ? String(raw.shiftId) : undefined,
    completedCount: Number(raw.completedCount ?? 0),
    totalCount: Number(raw.totalCount ?? 0),
    groups: Array.isArray(raw.groups) ? raw.groups.map(mapChecklistDailyGroup) : [],
  };
}

function mapChecklistHistoryRow(raw: any): ChecklistCompletionHistoryRow {
  return {
    completionId: String(raw.completionId),
    shopId: String(raw.shopId),
    companyId: raw.companyId ? String(raw.companyId) : undefined,
    businessDate: normalizeDateOnly(raw.businessDate),
    shiftId: raw.shiftId ? String(raw.shiftId) : undefined,
    checklistGroupId: String(raw.checklistGroupId),
    checklistGroupName: String(raw.checklistGroupName ?? ""),
    checklistTaskId: String(raw.checklistTaskId),
    checklistTaskName: String(raw.checklistTaskName ?? ""),
    isCompleted: Boolean(raw.isCompleted),
    completedByUserId: raw.completedByUserId ? String(raw.completedByUserId) : undefined,
    completedByName: typeof raw.completedByName === "string" ? raw.completedByName : undefined,
    completedOn: typeof raw.completedOn === "string" ? raw.completedOn : undefined,
    notes: typeof raw.notes === "string" ? raw.notes : undefined,
  };
}

export async function listChecklistConfiguration(shopId: string) {
  const response = await apiClient.get<ApiResponse<ShopChecklistGroup[]>>("/shop-checklists/config", {
    params: { shopId },
  });

  return (response.data.data ?? []).map(mapChecklistGroup);
}

export async function createChecklistGroup(payload: {
  shopId: string;
  groupName: string;
  description?: string;
  isActive?: boolean;
}) {
  const response = await apiClient.post<ApiResponse<ShopChecklistGroup>>("/shop-checklists/groups", payload);
  return mapChecklistGroup(response.data.data);
}

export async function updateChecklistGroup(
  groupId: string,
  payload: {
    groupName: string;
    description?: string;
    isActive: boolean;
  }
) {
  const response = await apiClient.put<ApiResponse<ShopChecklistGroup>>(`/shop-checklists/groups/${groupId}`, payload);
  return mapChecklistGroup(response.data.data);
}

export async function reorderChecklistGroups(payload: {
  shopId: string;
  orderedGroupIds: string[];
}) {
  await apiClient.post<ApiResponse<boolean>>("/shop-checklists/groups/reorder", payload);
}

export async function createChecklistTask(payload: {
  shopId: string;
  checklistGroupId: string;
  taskName: string;
  description?: string;
  isRequired?: boolean;
  isActive?: boolean;
  notesRequiredOnComplete?: boolean;
  requiredForShopOpen?: boolean;
  requiredForShiftClose?: boolean;
  requiredForDayClose?: boolean;
}) {
  const response = await apiClient.post<ApiResponse<ShopChecklistTask>>("/shop-checklists/tasks", payload);
  return mapChecklistTask(response.data.data);
}

export async function updateChecklistTask(
  taskId: string,
  payload: {
    taskName: string;
    description?: string;
    isRequired: boolean;
    isActive: boolean;
    notesRequiredOnComplete: boolean;
    requiredForShopOpen: boolean;
    requiredForShiftClose: boolean;
    requiredForDayClose: boolean;
  }
) {
  const response = await apiClient.put<ApiResponse<ShopChecklistTask>>(`/shop-checklists/tasks/${taskId}`, payload);
  return mapChecklistTask(response.data.data);
}

export async function reorderChecklistTasks(payload: {
  shopId: string;
  checklistGroupId: string;
  orderedTaskIds: string[];
}) {
  await apiClient.post<ApiResponse<boolean>>("/shop-checklists/tasks/reorder", payload);
}

export async function getChecklistDailyLog(shopId: string, date: string, shiftId?: string) {
  const response = await apiClient.get<ApiResponse<ChecklistDailyLog>>("/shop-checklists/daily", {
    params: { shopId, date, shiftId },
  });
  return mapChecklistDailyLog(response.data.data);
}

export async function upsertChecklistTaskCompletion(payload: {
  shopId: string;
  businessDate: string;
  shiftId?: string;
  checklistTaskId: string;
  isCompleted: boolean;
  notes?: string;
}) {
  const response = await apiClient.post<ApiResponse<ChecklistTaskCompletion>>("/shop-checklists/daily/completion", payload);
  return mapChecklistCompletion(response.data.data);
}

export async function syncOfflineChecklistCompletions(payload: {
  items: Array<{
    shopId: string;
    businessDate: string;
    shiftId?: string;
    checklistTaskId: string;
    isCompleted: boolean;
    notes?: string;
  }>;
}) {
  const response = await apiClient.post<ApiResponse<ChecklistTaskCompletion[]>>("/shop-checklists/daily/sync-offline", payload);
  return (response.data.data ?? []).map(mapChecklistCompletion);
}

export async function listChecklistCompletionHistory(shopId: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<ChecklistCompletionHistoryRow[]>>("/shop-checklists/history", {
    params: { shopId, from, to },
  });
  return (response.data.data ?? []).map(mapChecklistHistoryRow);
}

