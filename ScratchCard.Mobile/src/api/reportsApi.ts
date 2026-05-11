import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { AuditLogRow, DailySalesReportRow, ManualEntryReviewRow, NotificationLogRow, StockReportRow } from "../types/models";

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

export async function sendReportEmail(payload: SendReportEmailPayload) {
  const response = await apiClient.post<ApiResponse<boolean>>("/reports/email", payload);
  return response.data.data;
}
