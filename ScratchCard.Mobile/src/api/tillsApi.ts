import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { Till } from "../types/models";

export async function listTills(shopId: string, includeInactive = false) {
  const response = await apiClient.get<ApiResponse<Till[]>>("/tills", {
    params: { shopId, includeInactive },
  });
  return response.data.data;
}

export async function createTill(input: { shopId: string; name: string; code?: string; defaultFloat?: number }) {
  const response = await apiClient.post<ApiResponse<Till>>("/tills", input);
  return response.data.data;
}

export async function updateTill(id: string, input: { name: string; code?: string; isActive: boolean; defaultFloat?: number }) {
  const response = await apiClient.put<ApiResponse<Till>>(`/tills/${id}`, input);
  return response.data.data;
}

export async function deleteTill(id: string) {
  await apiClient.delete(`/tills/${id}`);
}

// Seed default Till Report data (payment types + a default till) for one shop or every shop in a company.
export async function applyTillReportDefaults(body: { shopId?: string; companyId?: string }) {
  const response = await apiClient.post<ApiResponse<{ seeded: number }>>("/till-report-defaults/apply", body);
  return response.data.data;
}
