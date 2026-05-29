import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { Till } from "../types/models";

export async function listTills(shopId: string, includeInactive = false) {
  const response = await apiClient.get<ApiResponse<Till[]>>("/tills", {
    params: { shopId, includeInactive },
  });
  return response.data.data;
}

export async function createTill(input: { shopId: string; name: string; code?: string }) {
  const response = await apiClient.post<ApiResponse<Till>>("/tills", input);
  return response.data.data;
}

export async function updateTill(id: string, input: { name: string; code?: string; isActive: boolean }) {
  const response = await apiClient.put<ApiResponse<Till>>(`/tills/${id}`, input);
  return response.data.data;
}

export async function deleteTill(id: string) {
  await apiClient.delete(`/tills/${id}`);
}
