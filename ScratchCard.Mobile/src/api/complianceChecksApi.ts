import { apiClient } from "./client";
import { ApiResponse } from "./types";
import {
  ComplianceActionReportRow,
  ComplianceCheckEntry,
  ComplianceCheckFrequency,
  ComplianceCheckGroup,
  ComplianceCheckItem,
  ComplianceCheckPeriodGroup,
  ComplianceCheckPeriodLog,
  ComplianceCheckPeriodRow,
  ComplianceCheckResult,
} from "../types/models";

function normalizeDateOnly(value: unknown) {
  const raw = typeof value === "string" ? value : "";
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

function normalizeOptionalDateOnly(value: unknown) {
  const normalized = normalizeDateOnly(value);
  return normalized.length > 0 ? normalized : undefined;
}

function mapFrequency(value: unknown): ComplianceCheckFrequency {
  if (value === "Weekly") return "Weekly";
  if (value === "Monthly") return "Monthly";
  return "Daily";
}

function mapResult(value: unknown): ComplianceCheckResult {
  if (value === "Compliant") return "Compliant";
  if (value === "NonCompliant") return "NonCompliant";
  if (value === "NotApplicable") return "NotApplicable";
  return "Pending";
}

function mapItem(raw: any): ComplianceCheckItem {
  return {
    id: String(raw.id),
    shopId: String(raw.shopId),
    complianceCheckGroupId: String(raw.complianceCheckGroupId),
    groupName: String(raw.groupName ?? ""),
    frequency: mapFrequency(raw.frequency),
    itemName: String(raw.itemName ?? ""),
    description: typeof raw.description === "string" ? raw.description : undefined,
    displayOrder: Number(raw.displayOrder ?? 0),
    isRequired: Boolean(raw.isRequired),
    isActive: Boolean(raw.isActive),
    isSystemDefault: Boolean(raw.isSystemDefault),
  };
}

function mapGroup(raw: any): ComplianceCheckGroup {
  return {
    id: String(raw.id),
    shopId: String(raw.shopId),
    frequency: mapFrequency(raw.frequency),
    groupName: String(raw.groupName ?? ""),
    description: typeof raw.description === "string" ? raw.description : undefined,
    displayOrder: Number(raw.displayOrder ?? 0),
    isActive: Boolean(raw.isActive),
    isSystemDefault: Boolean(raw.isSystemDefault),
    items: Array.isArray(raw.items) ? raw.items.map(mapItem) : [],
  };
}

function mapEntry(raw: any): ComplianceCheckEntry {
  const periodDate = normalizeDateOnly(raw.periodDate);
  const periodStartDate = normalizeDateOnly(raw.periodStartDate) || periodDate;
  const periodEndDate = normalizeDateOnly(raw.periodEndDate) || periodStartDate;
  const periodLabelRaw = typeof raw.periodLabel === "string" ? raw.periodLabel.trim() : "";

  return {
    id: String(raw.id),
    shopId: String(raw.shopId),
    companyId: raw.companyId ? String(raw.companyId) : undefined,
    complianceCheckItemId: String(raw.complianceCheckItemId),
    frequency: mapFrequency(raw.frequency),
    periodDate,
    periodStartDate,
    periodEndDate,
    periodLabel: periodLabelRaw || (periodStartDate === periodEndDate ? periodStartDate : `${periodStartDate} to ${periodEndDate}`),
    checkDate: normalizeOptionalDateOnly(raw.checkDate),
    weekStartDate: normalizeOptionalDateOnly(raw.weekStartDate),
    weekEndDate: normalizeOptionalDateOnly(raw.weekEndDate),
    monthStartDate: normalizeOptionalDateOnly(raw.monthStartDate),
    monthEndDate: normalizeOptionalDateOnly(raw.monthEndDate),
    monthName: typeof raw.monthName === "string" ? raw.monthName : undefined,
    monthNumber: typeof raw.monthNumber === "number" ? raw.monthNumber : undefined,
    monthYear: typeof raw.monthYear === "number" ? raw.monthYear : undefined,
    result: mapResult(raw.result),
    notes: typeof raw.notes === "string" ? raw.notes : undefined,
    actionRequired: typeof raw.actionRequired === "string" ? raw.actionRequired : undefined,
    checkedByUserId: raw.checkedByUserId ? String(raw.checkedByUserId) : undefined,
    checkedByName: typeof raw.checkedByName === "string" ? raw.checkedByName : undefined,
    checkedOn: typeof raw.checkedOn === "string" ? raw.checkedOn : undefined,
    isActionClosedOut: Boolean(raw.isActionClosedOut),
    closedOutNotes: typeof raw.closedOutNotes === "string" ? raw.closedOutNotes : undefined,
    closedOutByUserId: raw.closedOutByUserId ? String(raw.closedOutByUserId) : undefined,
    closedOutByName: typeof raw.closedOutByName === "string" ? raw.closedOutByName : undefined,
    closedOutOn: typeof raw.closedOutOn === "string" ? raw.closedOutOn : undefined,
  };
}

function mapPeriodRow(raw: any): ComplianceCheckPeriodRow {
  return {
    item: mapItem(raw.item),
    entry: raw.entry ? mapEntry(raw.entry) : undefined,
  };
}

function mapPeriodGroup(raw: any): ComplianceCheckPeriodGroup {
  return {
    group: mapGroup(raw.group),
    completedCount: Number(raw.completedCount ?? 0),
    totalCount: Number(raw.totalCount ?? 0),
    nonCompliantCount: Number(raw.nonCompliantCount ?? 0),
    rows: Array.isArray(raw.rows) ? raw.rows.map(mapPeriodRow) : [],
  };
}

function mapPeriodLog(raw: any): ComplianceCheckPeriodLog {
  const periodDate = normalizeDateOnly(raw.periodDate);
  const periodStartDate = normalizeDateOnly(raw.periodStartDate) || periodDate;
  const periodEndDate = normalizeDateOnly(raw.periodEndDate) || periodStartDate;
  const periodLabelRaw = typeof raw.periodLabel === "string" ? raw.periodLabel.trim() : "";

  return {
    shopId: String(raw.shopId),
    frequency: mapFrequency(raw.frequency),
    periodDate,
    periodStartDate,
    periodEndDate,
    periodLabel: periodLabelRaw || (periodStartDate === periodEndDate ? periodStartDate : `${periodStartDate} to ${periodEndDate}`),
    monthName: typeof raw.monthName === "string" ? raw.monthName : undefined,
    monthNumber: typeof raw.monthNumber === "number" ? raw.monthNumber : undefined,
    monthYear: typeof raw.monthYear === "number" ? raw.monthYear : undefined,
    completedCount: Number(raw.completedCount ?? 0),
    totalCount: Number(raw.totalCount ?? 0),
    nonCompliantCount: Number(raw.nonCompliantCount ?? 0),
    groups: Array.isArray(raw.groups) ? raw.groups.map(mapPeriodGroup) : [],
  };
}

function mapActionRow(raw: any): ComplianceActionReportRow {
  const periodDate = normalizeDateOnly(raw.periodDate);
  const periodStartDate = normalizeDateOnly(raw.periodStartDate) || periodDate;
  const periodEndDate = normalizeDateOnly(raw.periodEndDate) || periodStartDate;
  const periodLabelRaw = typeof raw.periodLabel === "string" ? raw.periodLabel.trim() : "";

  return {
    entryId: String(raw.entryId),
    shopId: String(raw.shopId),
    complianceCheckItemId: String(raw.complianceCheckItemId),
    complianceCheckGroupId: String(raw.complianceCheckGroupId),
    groupName: String(raw.groupName ?? ""),
    frequency: mapFrequency(raw.frequency),
    periodDate,
    periodStartDate,
    periodEndDate,
    periodLabel: periodLabelRaw || (periodStartDate === periodEndDate ? periodStartDate : `${periodStartDate} to ${periodEndDate}`),
    monthName: typeof raw.monthName === "string" ? raw.monthName : undefined,
    monthNumber: typeof raw.monthNumber === "number" ? raw.monthNumber : undefined,
    monthYear: typeof raw.monthYear === "number" ? raw.monthYear : undefined,
    itemName: String(raw.itemName ?? ""),
    notes: typeof raw.notes === "string" ? raw.notes : undefined,
    actionRequired: typeof raw.actionRequired === "string" ? raw.actionRequired : undefined,
    isActionClosedOut: Boolean(raw.isActionClosedOut),
    closedOutNotes: typeof raw.closedOutNotes === "string" ? raw.closedOutNotes : undefined,
    checkedByName: typeof raw.checkedByName === "string" ? raw.checkedByName : undefined,
    checkedOn: typeof raw.checkedOn === "string" ? raw.checkedOn : undefined,
    closedOutByName: typeof raw.closedOutByName === "string" ? raw.closedOutByName : undefined,
    closedOutOn: typeof raw.closedOutOn === "string" ? raw.closedOutOn : undefined,
  };
}

export async function listComplianceCheckConfig(shopId: string, frequency?: ComplianceCheckFrequency) {
  const response = await apiClient.get<ApiResponse<ComplianceCheckGroup[]>>("/compliance-checks/config", {
    params: { shopId, frequency },
  });
  return (response.data.data ?? []).map(mapGroup);
}

export async function createComplianceCheckGroup(payload: {
  shopId: string;
  frequency: ComplianceCheckFrequency;
  groupName: string;
  description?: string;
  isActive?: boolean;
}) {
  const response = await apiClient.post<ApiResponse<ComplianceCheckGroup>>("/compliance-checks/groups", payload);
  return mapGroup(response.data.data);
}

export async function updateComplianceCheckGroup(
  groupId: string,
  payload: {
    frequency: ComplianceCheckFrequency;
    groupName: string;
    description?: string;
    isActive: boolean;
  }
) {
  const response = await apiClient.put<ApiResponse<ComplianceCheckGroup>>(`/compliance-checks/groups/${groupId}`, payload);
  return mapGroup(response.data.data);
}

export async function reorderComplianceCheckGroups(payload: {
  shopId: string;
  frequency: ComplianceCheckFrequency;
  orderedGroupIds: string[];
}) {
  await apiClient.post<ApiResponse<boolean>>("/compliance-checks/groups/reorder", payload);
}

export async function listComplianceCheckItems(shopId: string, frequency?: ComplianceCheckFrequency) {
  const response = await apiClient.get<ApiResponse<ComplianceCheckItem[]>>("/compliance-checks/items", {
    params: { shopId, frequency },
  });
  return (response.data.data ?? []).map(mapItem);
}

export async function createComplianceCheckItem(payload: {
  shopId: string;
  complianceCheckGroupId: string;
  itemName: string;
  description?: string;
  isRequired?: boolean;
  isActive?: boolean;
}) {
  const response = await apiClient.post<ApiResponse<ComplianceCheckItem>>("/compliance-checks/items", payload);
  return mapItem(response.data.data);
}

export async function updateComplianceCheckItem(
  itemId: string,
  payload: {
    complianceCheckGroupId: string;
    itemName: string;
    description?: string;
    isRequired: boolean;
    isActive: boolean;
  }
) {
  const response = await apiClient.put<ApiResponse<ComplianceCheckItem>>(`/compliance-checks/items/${itemId}`, payload);
  return mapItem(response.data.data);
}

export async function reorderComplianceCheckItems(payload: {
  shopId: string;
  complianceCheckGroupId: string;
  orderedItemIds: string[];
}) {
  await apiClient.post<ApiResponse<boolean>>("/compliance-checks/items/reorder", payload);
}

export async function getComplianceCheckPeriodLog(shopId: string, frequency: ComplianceCheckFrequency, date: string) {
  const response = await apiClient.get<ApiResponse<ComplianceCheckPeriodLog>>("/compliance-checks/period-log", {
    params: { shopId, frequency, date },
  });
  return mapPeriodLog(response.data.data);
}

export async function upsertComplianceCheckEntry(payload: {
  shopId: string;
  complianceCheckItemId: string;
  date: string;
  result: ComplianceCheckResult;
  notes?: string;
  actionRequired?: string;
}) {
  const response = await apiClient.post<ApiResponse<ComplianceCheckEntry>>("/compliance-checks/entries", payload);
  return mapEntry(response.data.data);
}

export async function closeComplianceCheckAction(payload: {
  shopId: string;
  entryId: string;
  closedOutNotes?: string;
}) {
  const response = await apiClient.post<ApiResponse<ComplianceCheckEntry>>("/compliance-checks/entries/close-action", payload);
  return mapEntry(response.data.data);
}

export async function getComplianceActionReport(
  shopId: string,
  from: string,
  to: string,
  openOnly: boolean
) {
  const response = await apiClient.get<ApiResponse<ComplianceActionReportRow[]>>("/compliance-checks/actions", {
    params: { shopId, from, to, openOnly },
  });
  return (response.data.data ?? []).map(mapActionRow);
}
