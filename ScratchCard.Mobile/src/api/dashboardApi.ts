import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { DailySalesReportRow } from "../types/models";

export async function getDashboardSnapshot(shopId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const response = await apiClient.get<ApiResponse<DailySalesReportRow[]>>("/reports/daily-sales", {
    params: {
      shopId,
      from: today,
      to: today,
    },
  });

  return response.data.data;
}
