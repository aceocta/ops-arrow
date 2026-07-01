import { apiClient } from "./client";
import type { ApiResponse } from "../types";

export interface ConfigurationItem {
  id: string;
  shopId?: string;
  configKey: string;
  configValue: string;
  dataType: string;
  groupName: string;
  description?: string;
  isActive: boolean;
}

export interface ConfigurationUpdateItem {
  groupName?: string;
  configKey: string;
  configValue: string;
}

export async function getConfigurations(shopId: string) {
  const res = await apiClient.get<ApiResponse<ConfigurationItem[]>>("/configurations", {
    params: { shopId },
  });
  return res.data.data;
}

export async function updateConfigurations(shopId: string, items: ConfigurationUpdateItem[]) {
  const res = await apiClient.put<ApiResponse<unknown>>("/configurations", { shopId, items });
  return res.data.data;
}
