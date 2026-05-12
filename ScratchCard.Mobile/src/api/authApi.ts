import { apiClient } from "./client";
import { AuthProfile } from "../types/models";

export type AuthTokenResult = {
  accessToken: string;
  expiresOn?: string;
  tokenType: string;
  profile?: AuthProfile | null;
};

type RawAuthPayload = {
  accessToken?: string;
  AccessToken?: string;
  token?: string;
  Token?: string;
  expiresOn?: string;
  ExpiresOn?: string;
  tokenType?: string;
  TokenType?: string;
  profile?: AuthProfile | null;
  Profile?: AuthProfile | null;
};

function parseAuthTokenResult(rawResponse: unknown): AuthTokenResult {
  const envelope = rawResponse as { data?: unknown } | undefined;
  const rawPayload = (envelope?.data ?? rawResponse) as RawAuthPayload | undefined;

  const accessToken = rawPayload?.accessToken ?? rawPayload?.AccessToken ?? rawPayload?.token ?? rawPayload?.Token;
  if (!accessToken || !accessToken.trim()) {
    throw new Error("Authentication token was not returned by the server.");
  }

  return {
    accessToken,
    expiresOn: rawPayload?.expiresOn ?? rawPayload?.ExpiresOn,
    tokenType: rawPayload?.tokenType ?? rawPayload?.TokenType ?? "Bearer",
    profile: rawPayload?.profile ?? rawPayload?.Profile ?? null,
  };
}

export async function getCurrentUserProfile() {
  const response = await apiClient.get<{ success: boolean; data: AuthProfile }>("/auth/me");
  return response.data.data;
}

export async function refreshAuthToken() {
  const response = await apiClient.post("/auth/refresh");
  return parseAuthTokenResult(response.data);
}

export async function signInWithPassword(payload: { email: string; password: string }) {
  const response = await apiClient.post("/auth/login", payload);
  return parseAuthTokenResult(response.data);
}

export async function signUpWithPassword(payload: { email: string; password: string; firstName?: string; lastName?: string }) {
  const response = await apiClient.post("/auth/signup", payload);
  return parseAuthTokenResult(response.data);
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
  const response = await apiClient.post("/companies/signup", payload);
  return parseAuthTokenResult(response.data);
}

export async function signInWithDevBypass(payload: {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  shopId?: string;
}) {
  const response = await apiClient.post("/auth/dev-login", payload);
  return parseAuthTokenResult(response.data);
}
