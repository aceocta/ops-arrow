import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { RoleOption } from "../types/models";

export async function getRoleOptions() {
  const response = await apiClient.get<ApiResponse<RoleOption[]>>("/lookups/roles");
  return response.data.data;
}
