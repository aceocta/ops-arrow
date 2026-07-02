import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { Company } from "../types/models";

export type CreateCompanyPayload = {
  companyName: string;
  registrationNumber?: string;
};

export type UpdateCompanyPayload = {
  companyName: string;
  registrationNumber?: string;
  isActive: boolean;
};

export async function listMyCompanies() {
  const response = await apiClient.get<ApiResponse<Company[]>>("/companies/mine");
  return response.data.data;
}

export async function getCompany(companyId: string) {
  const response = await apiClient.get<ApiResponse<Company>>(`/companies/${companyId}`);
  return response.data.data;
}

export async function createCompany(payload: CreateCompanyPayload) {
  const response = await apiClient.post<ApiResponse<Company>>("/companies", payload);
  return response.data.data;
}

export async function updateCompany(companyId: string, payload: UpdateCompanyPayload) {
  const response = await apiClient.put<ApiResponse<Company>>(`/companies/${companyId}`, payload);
  return response.data.data;
}

// Emails the signed-in owner their company details + the web-platform link to set up/manage their shop.
export async function emailCompanySetupInfo(companyId: string) {
  await apiClient.post<ApiResponse<boolean>>(`/companies/${companyId}/email-setup-info`);
}
