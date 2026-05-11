import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { RefusalRegisterDailyLog, RefusalRegisterEntry } from "../types/models";

function normalizeDateOnly(value: unknown) {
  const raw = typeof value === "string" ? value : "";
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

function normalizeTimeOnly(value: unknown) {
  const raw = typeof value === "string" ? value : "";
  if (!raw) {
    return raw;
  }
  return raw.length >= 5 ? raw.slice(0, 5) : raw;
}

function mapEntry(raw: any): RefusalRegisterEntry {
  return {
    id: String(raw.id),
    shopId: String(raw.shopId),
    sequenceNo: Number(raw.sequenceNo ?? 0),
    refusalDate: normalizeDateOnly(raw.refusalDate),
    refusalTime: normalizeTimeOnly(raw.refusalTime),
    product: String(raw.product ?? ""),
    personDescription: String(raw.personDescription ?? ""),
    observations: raw.observations ?? undefined,
    staffMemberInitials: String(raw.staffMemberInitials ?? ""),
    signatureImagePath: raw.signatureImagePath ?? undefined,
    recordedOn: String(raw.recordedOn ?? ""),
    recordedByName: raw.recordedByName ?? undefined,
    reviewedOn: raw.reviewedOn ? String(raw.reviewedOn) : undefined,
    reviewedByUserId: raw.reviewedByUserId ? String(raw.reviewedByUserId) : undefined,
    reviewedByName: raw.reviewedByName ?? undefined,
    reviewNotes: raw.reviewNotes ?? undefined,
    reviewSignatureImagePath: raw.reviewSignatureImagePath ?? undefined,
  };
}

function mapDailyLog(raw: any): RefusalRegisterDailyLog {
  return {
    shopId: String(raw.shopId),
    date: normalizeDateOnly(raw.date),
    signoff: raw.signoff
      ? {
          id: String(raw.signoff.id),
          shopId: String(raw.signoff.shopId),
          signoffDate: normalizeDateOnly(raw.signoff.signoffDate),
          signedOn: String(raw.signoff.signedOn ?? ""),
          signedByUserId: String(raw.signoff.signedByUserId),
          signedByInitials: String(raw.signoff.signedByInitials ?? ""),
          signedByName: String(raw.signoff.signedByName ?? ""),
          notes: raw.signoff.notes ?? undefined,
          signatureImagePath: raw.signoff.signatureImagePath ?? undefined,
        }
      : undefined,
    entries: (raw.entries ?? []).map(mapEntry),
  };
}

export async function recordRefusalEntry(payload: {
  shopId: string;
  refusalDate: string;
  refusalTime: string;
  product: string;
  personDescription: string;
  observations?: string;
  staffMemberInitials?: string;
  signatureDataUrl: string;
}) {
  const response = await apiClient.post<ApiResponse<RefusalRegisterEntry>>("/refusal-register/entries", payload);
  return mapEntry(response.data.data);
}

export async function listRefusalEntries(shopId: string, date: string) {
  const response = await apiClient.get<ApiResponse<RefusalRegisterEntry[]>>("/refusal-register/entries", {
    params: { shopId, date },
  });
  return response.data.data.map(mapEntry);
}

export async function listRefusalEntriesByRange(shopId: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<RefusalRegisterEntry[]>>("/refusal-register/entries/range", {
    params: { shopId, from, to },
  });
  return response.data.data.map(mapEntry);
}

export async function getRefusalEntry(entryId: string) {
  const response = await apiClient.get<ApiResponse<RefusalRegisterEntry>>(`/refusal-register/entries/${entryId}`);
  return mapEntry(response.data.data);
}

export async function getRefusalEntrySignature(entryId: string) {
  const response = await apiClient.get<ApiResponse<string | null>>(`/refusal-register/entries/${entryId}/signature`);
  return response.data.data ?? undefined;
}

export async function getRefusalEntryReviewSignature(entryId: string) {
  const response = await apiClient.get<ApiResponse<string | null>>(`/refusal-register/entries/${entryId}/review-signature`);
  return response.data.data ?? undefined;
}

export async function updateRefusalEntry(
  entryId: string,
  payload: {
    refusalTime: string;
    product: string;
    personDescription: string;
    observations?: string;
    staffMemberInitials?: string;
    signatureDataUrl?: string;
  }
) {
  const response = await apiClient.put<ApiResponse<RefusalRegisterEntry>>(`/refusal-register/entries/${entryId}`, payload);
  return mapEntry(response.data.data);
}

export async function reviewRefusalEntry(entryId: string, payload: { notes?: string; signatureDataUrl?: string }) {
  const response = await apiClient.post<ApiResponse<RefusalRegisterEntry>>(`/refusal-register/entries/${entryId}/review`, payload);
  return mapEntry(response.data.data);
}

export async function reviewRefusalEntries(payload: {
  shopId: string;
  entryIds: string[];
  notes?: string;
  signatureDataUrl: string;
}) {
  const response = await apiClient.post<ApiResponse<RefusalRegisterEntry[]>>("/refusal-register/entries/review", payload);
  return (response.data.data ?? []).map(mapEntry);
}

export async function getRefusalDailyLog(shopId: string, date: string) {
  const response = await apiClient.get<ApiResponse<RefusalRegisterDailyLog>>("/refusal-register/daily", {
    params: { shopId, date },
  });
  return mapDailyLog(response.data.data);
}

export async function signOffRefusalDailyLog(payload: {
  shopId: string;
  signoffDate: string;
  signedByInitials?: string;
  notes?: string;
  signatureDataUrl: string;
}) {
  const response = await apiClient.post<ApiResponse<RefusalRegisterDailyLog["signoff"]>>("/refusal-register/signoff", payload);
  const signoff = response.data.data;
  if (!signoff) {
    return undefined;
  }

  return {
    id: String(signoff.id),
    shopId: String(signoff.shopId),
    signoffDate: normalizeDateOnly(signoff.signoffDate),
    signedOn: String(signoff.signedOn ?? ""),
    signedByUserId: String(signoff.signedByUserId),
    signedByInitials: String(signoff.signedByInitials ?? ""),
    signedByName: String(signoff.signedByName ?? ""),
    notes: signoff.notes ?? undefined,
    signatureImagePath: signoff.signatureImagePath ?? undefined,
  };
}

export async function reopenRefusalDailyLog(payload: {
  shopId: string;
  signoffDate: string;
}) {
  await apiClient.post<ApiResponse<boolean>>("/refusal-register/reopen", payload);
}
