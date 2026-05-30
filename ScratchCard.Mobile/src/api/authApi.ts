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

export async function requestSignupVerificationCode(payload: { email: string }) {
  const response = await apiClient.post<{ success: boolean; data: { expiresOn: string } }>(
    "/auth/signup/request-verification-code",
    payload
  );
  return response.data.data;
}

export async function signUpWithPassword(payload: {
  email: string;
  password: string;
  verificationCode: string;
  firstName?: string;
  lastName?: string;
  ownerPhoneNumber?: string;
}) {
  const response = await apiClient.post("/auth/signup", payload);
  return parseAuthTokenResult(response.data);
}

/**
 * Updates the signed-in user's own profile (first/last name and optional phone number).
 * Phone is never mandatory — pass empty string to clear, omit to leave unchanged.
 */
export async function updateMyProfile(payload: {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
}) {
  const response = await apiClient.put("/auth/me", payload);
  return response.data?.data;
}

export type ValidateInvitationResult = {
  isValid: boolean;
  email: string;
  shopId: string;
  roleName: string;
  expiresOn: string;
  // True when the email already has an account — the invitee just joins the new shop and
  // signs in with their existing password (no name/password setup needed).
  accountExists: boolean;
};

export async function validateInvitation(token: string) {
  const response = await apiClient.get<{ success: boolean; data: ValidateInvitationResult }>(
    "/invitations/validate",
    { params: { token }, timeout: 45000 }
  );
  return response.data.data;
}

export async function acceptInvitation(payload: {
  token: string;
  firstName?: string;
  lastName?: string;
  password?: string;
  phoneNumber?: string;
}) {
  // Accept is often the first call after a cold app open from the email link, so
  // give the (possibly cold-starting) server more headroom than the global 15s.
  const response = await apiClient.post("/invitations/accept", payload, { timeout: 45000 });
  return response.data;
}

export async function signUpCompany(payload: {
  companyName: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  /** Optional user phone number with country code, for WhatsApp alerts. */
  ownerPhoneNumber?: string;
  /** Optional company contact phone. Independent of the user's personal phone. */
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

export async function requestPasswordReset(payload: { email: string }) {
  const response = await apiClient.post("/auth/forgot-password", payload);
  return response.data;
}

export async function resetPassword(payload: { token: string; newPassword: string }) {
  const response = await apiClient.post("/auth/reset-password", payload);
  return response.data;
}
