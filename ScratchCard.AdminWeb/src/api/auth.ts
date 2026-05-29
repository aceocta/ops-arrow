import { apiClient } from "./client";
import type { ApiResponse, AuthTokenResponse } from "../types";

export async function login(email: string, password: string): Promise<AuthTokenResponse> {
  const res = await apiClient.post<ApiResponse<AuthTokenResponse>>("/auth/login", { email, password });
  return res.data.data;
}
