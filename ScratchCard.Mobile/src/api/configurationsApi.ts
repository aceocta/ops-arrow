import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { ConfigurationItem } from "../types/models";

export async function getConfigurations(shopId?: string) {
  const response = await apiClient.get<ApiResponse<ConfigurationItem[]>>("/configurations", {
    params: { shopId },
  });
  return response.data.data;
}

export async function updateConfigurations(payload: { shopId?: string; items: { configKey: string; configValue: string }[] }) {
  const response = await apiClient.put<ApiResponse<{ updated: boolean }>>("/configurations", payload);
  return response.data.data;
}
