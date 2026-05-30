import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { TillCategoryRule, TillPaymentSummary, TillReport, TillReportListItem, TillReportScopeSummary } from "../types/models";
import { TillLineClassification, TillReportType, TillRuleMatchType } from "../types/enums";

type PagedResult<T> = {
  items: T[];
  totalCount: number;
};

export type TillReportPhoto = {
  uri: string;
  fileName?: string;
  mimeType?: string;
};

export async function parseTillReport(input: {
  shopId: string;
  tillId?: string;
  reportType: TillReportType;
  shiftId?: string;
  businessDayId?: string;
  photos: TillReportPhoto[];
}) {
  const formData = new FormData();
  formData.append("shopId", input.shopId);
  formData.append("reportType", input.reportType);
  if (input.tillId) {
    formData.append("tillId", input.tillId);
  }
  if (input.shiftId) {
    formData.append("shiftId", input.shiftId);
  }
  if (input.businessDayId) {
    formData.append("businessDayId", input.businessDayId);
  }
  input.photos.forEach((photo, index) => {
    formData.append("files", {
      uri: photo.uri,
      name: photo.fileName ?? `till-report-${index + 1}.jpg`,
      type: photo.mimeType ?? "image/jpeg",
    } as any);
  });

  const response = await apiClient.post<ApiResponse<TillReport>>("/till-reports/parse", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    // OCR across several photos can take a while (and the server may be cold-starting).
    timeout: 90000,
  });
  return response.data.data;
}

export async function getTillReport(id: string) {
  const response = await apiClient.get<ApiResponse<TillReport>>(`/till-reports/${id}`);
  return response.data.data;
}

export async function listTillReports(input: {
  shopId: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const response = await apiClient.get<ApiResponse<PagedResult<TillReportListItem>>>("/till-reports", {
    params: {
      shopId: input.shopId,
      from: input.from,
      to: input.to,
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 50,
    },
  });
  return response.data.data;
}

export async function classifyTillReportLine(reportId: string, lineId: string, classification: TillLineClassification) {
  const response = await apiClient.post<ApiResponse<TillReport>>(
    `/till-reports/${reportId}/lines/${lineId}/classify`,
    { classification }
  );
  return response.data.data;
}

export async function deleteTillReportLine(reportId: string, lineId: string) {
  const response = await apiClient.delete<ApiResponse<TillReport>>(
    `/till-reports/${reportId}/lines/${lineId}`,
  );
  return response.data.data;
}

export async function confirmTillReport(reportId: string) {
  const response = await apiClient.post<ApiResponse<TillReport>>(`/till-reports/${reportId}/confirm`, {});
  return response.data.data;
}

export async function upsertTillPayment(reportId: string, paymentTypeId: string, amount: number) {
  const response = await apiClient.post<ApiResponse<TillReport>>(`/till-reports/${reportId}/payments`, {
    paymentTypeId,
    amount,
  });
  return response.data.data;
}

export async function getTillPaymentSummary(shopId: string, businessDayId: string) {
  const response = await apiClient.get<ApiResponse<TillPaymentSummary>>("/till-reports/payments/summary", {
    params: { shopId, businessDayId },
  });
  return response.data.data;
}

export async function getTillDaySummary(shopId: string, businessDayId: string) {
  const response = await apiClient.get<ApiResponse<TillReportScopeSummary>>("/till-reports/summary/day", {
    params: { shopId, businessDayId },
  });
  return response.data.data;
}

export async function getTillShiftSummary(shopId: string, shiftId: string) {
  const response = await apiClient.get<ApiResponse<TillReportScopeSummary>>("/till-reports/summary/shift", {
    params: { shopId, shiftId },
  });
  return response.data.data;
}

export async function listTillRules(shopId: string) {
  const response = await apiClient.get<ApiResponse<TillCategoryRule[]>>("/till-reports/rules", {
    params: { shopId },
  });
  return response.data.data;
}

export async function createTillRule(input: {
  shopId: string;
  pattern: string;
  matchType: TillRuleMatchType;
  classification: TillLineClassification;
  priority: number;
}) {
  const response = await apiClient.post<ApiResponse<TillCategoryRule>>("/till-reports/rules", input);
  return response.data.data;
}

export async function deleteTillRule(ruleId: string) {
  await apiClient.delete(`/till-reports/rules/${ruleId}`);
}
