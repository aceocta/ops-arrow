import { apiClient } from "./client";
import type { AdminShopListItem, ApiResponse, PagedResult } from "../types";

export async function listShops(search: string, page: number, pageSize: number) {
  const res = await apiClient.get<ApiResponse<PagedResult<AdminShopListItem>>>("/admin/shops", {
    params: { search: search || undefined, page, pageSize },
  });
  return res.data.data;
}
