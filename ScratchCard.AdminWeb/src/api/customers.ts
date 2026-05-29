import { apiClient } from "./client";
import type {
  AdminUpdateCustomerRequest,
  ApiResponse,
  CustomerDetail,
  CustomerListItem,
  PagedResult,
} from "../types";

export async function listCustomers(search: string, page: number, pageSize: number) {
  const res = await apiClient.get<ApiResponse<PagedResult<CustomerListItem>>>("/admin/customers", {
    params: { search: search || undefined, page, pageSize },
  });
  return res.data.data;
}

export async function getCustomer(id: string) {
  const res = await apiClient.get<ApiResponse<CustomerDetail>>(`/admin/customers/${id}`);
  return res.data.data;
}

export async function updateCustomer(id: string, body: AdminUpdateCustomerRequest) {
  const res = await apiClient.put<ApiResponse<CustomerDetail>>(`/admin/customers/${id}`, body);
  return res.data.data;
}

export async function setCustomerStatus(id: string, isActive: boolean) {
  const action = isActive ? "activate" : "suspend";
  const res = await apiClient.post<ApiResponse<CustomerDetail>>(`/admin/customers/${id}/${action}`);
  return res.data.data;
}
