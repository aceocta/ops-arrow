import { apiClient } from "./client";
import type { ApiResponse, RoleOption } from "../types";

export async function listRoles() {
  const res = await apiClient.get<ApiResponse<RoleOption[]>>("/lookups/roles");
  return res.data.data;
}
