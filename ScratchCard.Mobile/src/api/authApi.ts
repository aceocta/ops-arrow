import { apiClient } from "./client";
import { AuthProfile } from "../types/models";

export async function getCurrentUserProfile() {
  const response = await apiClient.get<{ success: boolean; data: AuthProfile }>("/auth/me");
  return response.data.data;
}

export async function signInWithPassword(payload: { email: string; password: string }) {
  const response = await apiClient.post<{
    success: boolean;
    data: {
      accessToken: string;
      expiresOn: string;
      tokenType: string;
      profile: AuthProfile;
    };
  }>("/auth/login", payload);

  return response.data.data;
}

export async function signUpWithPassword(payload: { email: string; password: string; firstName?: string; lastName?: string }) {
  const response = await apiClient.post<{
    success: boolean;
    data: {
      accessToken: string;
      expiresOn: string;
      tokenType: string;
      profile: AuthProfile;
    };
  }>("/auth/signup", payload);

  return response.data.data;
}

export async function acceptInvitation(payload: {
  token: string;
  firstName: string;
  lastName: string;
  password: string;
}) {
  const response = await apiClient.post("/invitations/accept", payload);
  return response.data;
}

export async function signUpCompany(payload: {
  companyName: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  phoneNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postCode?: string;
  country: string;
  firstShopName?: string;
  password: string;
}) {
  const response = await apiClient.post<{
    success: boolean;
    data: {
      accessToken: string;
      expiresOn: string;
      tokenType: string;
      profile: AuthProfile;
    };
  }>("/companies/signup", payload);

  return response.data.data;
}

export async function signInWithDevBypass(payload: {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  shopId?: string;
}) {
  const response = await apiClient.post<{
    success: boolean;
    data: {
      accessToken: string;
      expiresOn: string;
      tokenType: string;
      profile: AuthProfile;
    };
  }>("/auth/dev-login", payload);

  return response.data.data;
}
