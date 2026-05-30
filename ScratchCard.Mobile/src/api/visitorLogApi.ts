import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { VisitorDirectory, VisitorLogDailyLog, VisitorLogEntry } from "../types/models";

function normalizeDateOnly(value: unknown) {
  const raw = typeof value === "string" ? value : "";
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

function normalizeTimeOnly(value: unknown) {
  const raw = typeof value === "string" ? value : "";
  if (!raw) return raw;
  return raw.length >= 5 ? raw.slice(0, 5) : raw;
}

function mapEntry(raw: any): VisitorLogEntry {
  return {
    id: String(raw.id),
    shopId: String(raw.shopId),
    visitorId: raw.visitorId ? String(raw.visitorId) : undefined,
    sequenceNo: Number(raw.sequenceNo ?? 0),
    visitDate: normalizeDateOnly(raw.visitDate),
    timeIn: normalizeTimeOnly(raw.timeIn),
    timeOut: raw.timeOut ? normalizeTimeOnly(raw.timeOut) : undefined,
    isOnSite: Boolean(raw.isOnSite),
    visitorName: String(raw.visitorName ?? ""),
    organisation: raw.organisation ?? undefined,
    visitType: String(raw.visitType ?? ""),
    purpose: raw.purpose ?? undefined,
    hostName: raw.hostName ?? undefined,
    vehicleRegistration: raw.vehicleRegistration ?? undefined,
    isInspector: Boolean(raw.isInspector),
    hasSignature: Boolean(raw.hasSignature),
    hasPhoto: Boolean(raw.hasPhoto),
    notes: raw.notes ?? undefined,
    spaPassportRef: raw.spaPassportRef ?? undefined,
    permitToWorkRef: raw.permitToWorkRef ?? undefined,
    inductionAcknowledged: Boolean(raw.inductionAcknowledged),
    recordedOn: String(raw.recordedOn ?? ""),
    recordedByName: raw.recordedByName ?? undefined,
  };
}

export type VisitorLogEntryPayload = {
  shopId: string;
  visitDate: string;
  timeIn: string;
  visitorName: string;
  organisation?: string;
  visitType: string;
  purpose?: string;
  hostName?: string;
  vehicleRegistration?: string;
  signatureDataUrl: string;
  photoDataUrl?: string;
  notes?: string;
  spaPassportRef?: string;
  permitToWorkRef?: string;
  inductionAcknowledged?: boolean;
};

export async function createVisitorEntry(payload: VisitorLogEntryPayload) {
  const response = await apiClient.post<ApiResponse<VisitorLogEntry>>("/visitor-log/entries", payload);
  return mapEntry(response.data.data);
}

export async function updateVisitorEntry(
  entryId: string,
  payload: Omit<VisitorLogEntryPayload, "shopId" | "visitDate" | "signatureDataUrl"> & {
    signatureDataUrl?: string;
    timeOut?: string;
  }
) {
  const response = await apiClient.put<ApiResponse<VisitorLogEntry>>(`/visitor-log/entries/${entryId}`, payload);
  return mapEntry(response.data.data);
}

export async function getVisitorEntry(entryId: string) {
  const response = await apiClient.get<ApiResponse<VisitorLogEntry>>(`/visitor-log/entries/${entryId}`);
  return mapEntry(response.data.data);
}

export async function signOutVisitor(entryId: string) {
  const response = await apiClient.post<ApiResponse<VisitorLogEntry>>(`/visitor-log/entries/${entryId}/sign-out`);
  return mapEntry(response.data.data);
}

export async function getVisitorDailyLog(shopId: string, date: string): Promise<VisitorLogDailyLog> {
  const response = await apiClient.get<ApiResponse<VisitorLogDailyLog>>("/visitor-log/daily", { params: { shopId, date } });
  const raw = response.data.data;
  return {
    shopId: String(raw.shopId),
    date: normalizeDateOnly(raw.date),
    onSiteCount: Number(raw.onSiteCount ?? 0),
    entries: (raw.entries ?? []).map(mapEntry),
  };
}

export async function listVisitorsOnSite(shopId: string) {
  const response = await apiClient.get<ApiResponse<VisitorLogEntry[]>>("/visitor-log/on-site", { params: { shopId } });
  return (response.data.data ?? []).map(mapEntry);
}

export async function listVisitorEntriesByRange(shopId: string, from: string, to: string) {
  const response = await apiClient.get<ApiResponse<VisitorLogEntry[]>>("/visitor-log/entries/range", {
    params: { shopId, from, to },
  });
  return (response.data.data ?? []).map(mapEntry);
}

export async function searchVisitorDirectory(shopId: string, query: string) {
  const response = await apiClient.get<ApiResponse<VisitorDirectory[]>>("/visitor-log/directory", {
    params: { shopId, query },
  });
  return (response.data.data ?? []).map((raw: any) => ({
    id: String(raw.id),
    fullName: String(raw.fullName ?? ""),
    organisation: raw.organisation ?? undefined,
    phone: raw.phone ?? undefined,
    defaultVisitType: raw.defaultVisitType ?? undefined,
    visitCount: Number(raw.visitCount ?? 0),
    lastVisitedOn: raw.lastVisitedOn ?? undefined,
  })) as VisitorDirectory[];
}

export type VisitorOrganisationSuggestion = { id: string; name: string; usageCount: number };

export async function searchVisitorOrganisations(shopId: string, query: string): Promise<VisitorOrganisationSuggestion[]> {
  const response = await apiClient.get<ApiResponse<VisitorOrganisationSuggestion[]>>("/visitor-log/organisations", {
    params: { shopId, query },
  });
  return (response.data.data ?? []).map((raw: any) => ({
    id: String(raw.id),
    name: String(raw.name ?? ""),
    usageCount: Number(raw.usageCount ?? 0),
  }));
}

export async function getVisitorEntrySignature(entryId: string) {
  const response = await apiClient.get<ApiResponse<string | null>>(`/visitor-log/entries/${entryId}/signature`);
  return response.data.data ?? undefined;
}

export async function getVisitorEntryPhoto(entryId: string) {
  const response = await apiClient.get<ApiResponse<string | null>>(`/visitor-log/entries/${entryId}/photo`);
  return response.data.data ?? undefined;
}
