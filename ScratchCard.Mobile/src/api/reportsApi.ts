import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { AuditLogRow, DailySalesReportRow, ManualEntryReviewRow, NotificationLogRow, OwnerOverview, StockReportRow, TemperatureReading } from "../types/models";
import { TemperatureResult } from "../types/enums";

export async function getOwnerOverview(from: string, to: string) {
  const response = await apiClient.get<ApiResponse<OwnerOverview>>("/reports/owner-overview", {
    params: { from, to },
  });
  return response.data.data;
}

export type SendReportEmailPayload = {
  recipientEmail?: string;
  subject: string;
  body: string;
  isBodyHtml?: boolean;
  attachmentFileName?: string;
  attachmentBase64?: string;
};

export async function getDailySalesReport(shopId: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<DailySalesReportRow[]>>("/reports/daily-sales", {
    params: { shopId, from, to },
  });
  return response.data.data;
}

export async function getShiftSalesReport(shopId: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<DailySalesReportRow[]>>("/reports/shift-sales", {
    params: { shopId, from, to },
  });
  return response.data.data;
}

export async function getManualReviewReport(shopId: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<ManualEntryReviewRow[]>>("/reports/manual-entry-review", {
    params: { shopId, from, to },
  });
  return response.data.data;
}

export async function getStockReport(shopId: string) {
  const response = await apiClient.get<ApiResponse<StockReportRow[]>>("/reports/stock", {
    params: { shopId },
  });
  return response.data.data;
}

export async function getAuditLogReport(shopId: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<AuditLogRow[]>>("/reports/audit-log", {
    params: { shopId, from, to },
  });
  return response.data.data;
}

export async function getNotificationLogReport(shopId: string) {
  const response = await apiClient.get<ApiResponse<NotificationLogRow[]>>("/reports/notification-log", {
    params: { shopId },
  });
  return response.data.data;
}

export async function getSyncStatusReport(shopId: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<unknown[]>>("/reports/sync-status", {
    params: { shopId, from, to },
  });
  return response.data.data;
}

function normalizeDateOnly(value: unknown) {
  const raw = typeof value === "string" ? value : "";
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

function normalizeTimeOnly(value: unknown) {
  const raw = typeof value === "string" ? value : "";
  if (!raw) {
    return raw;
  }
  return raw.length >= 5 ? raw.slice(0, 5) : raw;
}

function mapTemperatureReading(raw: any): TemperatureReading {
  return {
    id: String(raw.id),
    shopId: String(raw.shopId),
    temperatureMonitoringUnitId: String(raw.temperatureMonitoringUnitId),
    unitName: String(raw.unitName ?? ""),
    equipmentType: raw.equipmentType,
    minTemperatureCelsius: Number(raw.minTemperatureCelsius ?? 0),
    maxTemperatureCelsius: Number(raw.maxTemperatureCelsius ?? 0),
    readingDate: normalizeDateOnly(raw.readingDate),
    readingTime: normalizeTimeOnly(raw.readingTime),
    temperatureCelsius: Number(raw.temperatureCelsius ?? 0),
    isOutOfRange: Boolean(raw.isOutOfRange),
    result: (raw.result as TemperatureResult) ?? TemperatureResult.Pass,
    checkedByInitials: String(raw.checkedByInitials ?? ""),
    notes: raw.notes ?? undefined,
    actionTaken: raw.actionTaken ?? undefined,
    correctiveActions: raw.correctiveActions ?? undefined,
    temperatureEquipmentIssueId: raw.temperatureEquipmentIssueId ? String(raw.temperatureEquipmentIssueId) : undefined,
    recordedOn: String(raw.recordedOn ?? ""),
    recordedByName: raw.recordedByName ?? undefined,
    scheduleId: raw.scheduleId ? String(raw.scheduleId) : undefined,
    scheduleLabel: raw.scheduleLabel ?? undefined,
    isLateForSchedule: Boolean(raw.isLateForSchedule),
    attachments: (raw.attachments ?? []).map((a: any) => ({
      id: String(a.id),
      fileName: String(a.fileName ?? ""),
      contentType: a.contentType ?? undefined,
      fileSizeBytes: Number(a.fileSizeBytes ?? 0),
      uploadedOn: String(a.uploadedOn ?? ""),
    })),
  };
}

export async function getTemperatureLogsReport(
  shopId: string,
  from: string,
  to: string,
  unitId?: string,
  filters?: { category?: string; result?: string; checkedBy?: string },
) {
  const response = await apiClient.get<ApiResponse<TemperatureReading[]>>("/reports/temperature-logs", {
    params: {
      shopId,
      from,
      to,
      unitId,
      category: filters?.category,
      result: filters?.result,
      checkedBy: filters?.checkedBy,
    },
  });
  return response.data.data.map(mapTemperatureReading);
}

export async function sendReportEmail(payload: SendReportEmailPayload) {
  const response = await apiClient.post<ApiResponse<boolean>>("/reports/email", payload);
  return response.data.data;
}
