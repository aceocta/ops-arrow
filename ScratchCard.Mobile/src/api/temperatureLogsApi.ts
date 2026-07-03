import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { TemperatureAttachment, TemperatureDailyLog, TemperatureEquipmentIssue, TemperatureMonitoringUnit, TemperatureReading, TemperatureSchedule, TemperatureScheduleGrid, TemperatureUnitDailyLog } from "../types/models";
import { EquipmentWorkingStatus, FoodCategory, TemperatureEquipmentType, TemperatureResult } from "../types/enums";

// A photo to upload with a reading/issue: base64 payload plus optional filename/content type.
export type TemperatureAttachmentUpload = {
  fileName: string;
  base64: string;
  contentType?: string;
};

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

function mapAttachment(raw: any): TemperatureAttachment {
  return {
    id: String(raw.id),
    fileName: String(raw.fileName ?? ""),
    contentType: raw.contentType ?? undefined,
    fileSizeBytes: Number(raw.fileSizeBytes ?? 0),
    uploadedOn: String(raw.uploadedOn ?? ""),
  };
}

function mapUnit(raw: any): TemperatureMonitoringUnit {
  return {
    id: String(raw.id),
    shopId: String(raw.shopId),
    unitName: String(raw.unitName ?? ""),
    equipmentType: (raw.equipmentType as TemperatureEquipmentType) ?? TemperatureEquipmentType.Other,
    foodCategory: (raw.foodCategory as FoodCategory) ?? FoodCategory.ColdFood,
    minTemperatureCelsius: Number(raw.minTemperatureCelsius ?? 0),
    maxTemperatureCelsius: Number(raw.maxTemperatureCelsius ?? 0),
    isActive: Boolean(raw.isActive),
    currentWorkingStatus: (raw.currentWorkingStatus as EquipmentWorkingStatus) ?? EquipmentWorkingStatus.Working,
    location: raw.location ?? undefined,
    notes: raw.notes ?? undefined,
    displayOrder: Number(raw.displayOrder ?? 0),
  };
}

function mapReading(raw: any): TemperatureReading {
  return {
    id: String(raw.id),
    shopId: String(raw.shopId),
    temperatureMonitoringUnitId: String(raw.temperatureMonitoringUnitId),
    unitName: String(raw.unitName ?? ""),
    equipmentType: (raw.equipmentType as TemperatureEquipmentType) ?? TemperatureEquipmentType.Other,
    minTemperatureCelsius: Number(raw.minTemperatureCelsius ?? 0),
    maxTemperatureCelsius: Number(raw.maxTemperatureCelsius ?? 0),
    readingDate: normalizeDateOnly(raw.readingDate),
    readingTime: normalizeTimeOnly(raw.readingTime),
    temperatureCelsius: Number(raw.temperatureCelsius ?? 0),
    isOutOfRange: Boolean(raw.isOutOfRange),
    result: (raw.result as TemperatureResult) ?? TemperatureResult.Pass,
    checkedByInitials: String(raw.checkedByInitials ?? ""),
    notes: raw.notes ?? undefined,
    actionTaken: raw.actionTaken ?? undefined,
    correctiveActions: raw.correctiveActions ?? undefined,
    temperatureEquipmentIssueId: raw.temperatureEquipmentIssueId ? String(raw.temperatureEquipmentIssueId) : undefined,
    recordedOn: String(raw.recordedOn ?? ""),
    recordedByName: raw.recordedByName ?? undefined,
    scheduleId: raw.scheduleId ? String(raw.scheduleId) : undefined,
    scheduleLabel: raw.scheduleLabel ?? undefined,
    isLateForSchedule: Boolean(raw.isLateForSchedule),
    attachments: (raw.attachments ?? []).map(mapAttachment),
  };
}

function mapIssue(raw: any): TemperatureEquipmentIssue {
  return {
    id: String(raw.id),
    shopId: String(raw.shopId),
    temperatureMonitoringUnitId: String(raw.temperatureMonitoringUnitId),
    unitName: String(raw.unitName ?? ""),
    foodCategory: (raw.foodCategory as FoodCategory) ?? FoodCategory.ColdFood,
    status: (raw.status as EquipmentWorkingStatus) ?? EquipmentWorkingStatus.NotWorking,
    reason: String(raw.reason ?? ""),
    temperatureAtOpenCelsius: raw.temperatureAtOpenCelsius ?? undefined,
    openedFromReading: Boolean(raw.openedFromReading),
    issueStartedOn: String(raw.issueStartedOn ?? ""),
    openedByName: raw.openedByName ?? undefined,
    foodAffected: raw.foodAffected ?? undefined,
    foodMoved: raw.foodMoved ?? undefined,
    foodMovedTo: raw.foodMovedTo ?? undefined,
    foodDiscarded: raw.foodDiscarded ?? undefined,
    managerInformed: raw.managerInformed ?? undefined,
    correctiveActions: raw.correctiveActions ?? undefined,
    maintenanceStartedOn: raw.maintenanceStartedOn ?? undefined,
    resolvedOn: raw.resolvedOn ?? undefined,
    resolvedByName: raw.resolvedByName ?? undefined,
    finalTemperatureCelsius: raw.finalTemperatureCelsius ?? undefined,
    resolutionNotes: raw.resolutionNotes ?? undefined,
    engineerContacted: raw.engineerContacted ?? undefined,
    foodActionCompleted: raw.foodActionCompleted ?? undefined,
    resolvedWithWarning: Boolean(raw.resolvedWithWarning),
    approvedByName: raw.approvedByName ?? undefined,
    approvedOn: raw.approvedOn ?? undefined,
    notes: raw.notes ?? undefined,
    attachments: (raw.attachments ?? []).map(mapAttachment),
  };
}

function mapUnitDailyLog(raw: any): TemperatureUnitDailyLog {
  return {
    unit: mapUnit(raw.unit),
    readings: (raw.readings ?? []).map(mapReading),
  };
}

function mapDailyLog(raw: any): TemperatureDailyLog {
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
        }
      : undefined,
    units: (raw.units ?? []).map(mapUnitDailyLog),
  };
}

export async function listTemperatureUnits(shopId: string) {
  const response = await apiClient.get<ApiResponse<TemperatureMonitoringUnit[]>>("/temperature-logs/units", {
    params: { shopId },
  });
  return response.data.data.map(mapUnit);
}

export async function createTemperatureUnit(payload: {
  shopId: string;
  unitName: string;
  equipmentType: TemperatureEquipmentType;
  foodCategory?: FoodCategory;
  minTemperatureCelsius: number;
  maxTemperatureCelsius: number;
  isActive?: boolean;
  location?: string;
  notes?: string;
  displayOrder?: number;
  shiftConflicts?: boolean;
}) {
  const response = await apiClient.post<ApiResponse<TemperatureMonitoringUnit>>("/temperature-logs/units", payload);
  return mapUnit(response.data.data);
}

export async function updateTemperatureUnit(
  unitId: string,
  payload: {
    unitName: string;
    equipmentType: TemperatureEquipmentType;
    foodCategory?: FoodCategory;
    minTemperatureCelsius: number;
    maxTemperatureCelsius: number;
    isActive: boolean;
    location?: string;
    notes?: string;
    displayOrder?: number;
    shiftConflicts?: boolean;
  }
) {
  const response = await apiClient.put<ApiResponse<TemperatureMonitoringUnit>>(`/temperature-logs/units/${unitId}`, payload);
  return mapUnit(response.data.data);
}

export async function reorderTemperatureUnits(
  shopId: string,
  items: { unitId: string; displayOrder: number }[],
) {
  await apiClient.put("/temperature-logs/units/reorder", { shopId, items });
}

export type TemperaturePrediction = {
  unitId: string;
  unitName: string;
  direction: "Rising" | "Falling";
  currentCelsius: number;
  ratePerHourCelsius: number;
  limitCelsius: number;
  minutesToBreach: number;
  message: string;
};

export type TemperaturePredictiveCheckResult = {
  unitsEvaluated: number;
  predictions: TemperaturePrediction[];
};

// On-demand "check trends now" — evaluates recent readings and (if entitled) pushes alerts for any
// unit projected to breach soon, returning the predictions for immediate display.
export async function runTemperaturePredictiveCheck(shopId: string): Promise<TemperaturePredictiveCheckResult> {
  const response = await apiClient.post<ApiResponse<any>>(
    "/temperature-logs/predictive-check",
    null,
    { params: { shopId } },
  );
  const data = (response.data.data ?? {}) as Record<string, unknown>;
  const rawPredictions = Array.isArray(data.predictions) ? (data.predictions as any[]) : [];
  return {
    unitsEvaluated: Number(data.unitsEvaluated ?? 0),
    predictions: rawPredictions.map((p) => ({
      unitId: String(p.unitId),
      unitName: String(p.unitName ?? ""),
      direction: p.direction === "Falling" ? "Falling" : "Rising",
      currentCelsius: Number(p.currentCelsius ?? 0),
      ratePerHourCelsius: Number(p.ratePerHourCelsius ?? 0),
      limitCelsius: Number(p.limitCelsius ?? 0),
      minutesToBreach: Number(p.minutesToBreach ?? 0),
      message: String(p.message ?? ""),
    })),
  };
}

export async function getTemperatureDailyLog(shopId: string, date: string) {
  const response = await apiClient.get<ApiResponse<TemperatureDailyLog>>("/temperature-logs/daily", {
    params: { shopId, date },
  });
  return mapDailyLog(response.data.data);
}

export async function listTemperatureReadings(shopId: string, from: string, to: string, unitId?: string) {
  const response = await apiClient.get<ApiResponse<TemperatureReading[]>>("/temperature-logs/readings", {
    params: { shopId, from, to, unitId },
  });
  return response.data.data.map(mapReading);
}

export async function recordTemperatureReading(payload: {
  shopId: string;
  temperatureMonitoringUnitId: string;
  readingDate: string;
  readingTime: string;
  temperatureCelsius: number;
  checkedByInitials?: string;
  notes?: string;
  actionTaken?: string;
  // Comma-separated TemperatureCorrectiveAction names selected for a Warning/Fail reading (§17).
  correctiveActions?: string;
  // §12/§14 questions answered on a FAIL reading. equipmentWorking !== true opens an equipment issue.
  equipmentWorking?: boolean;
  managerInformed?: boolean;
  foodMoved?: boolean;
  foodMovedTo?: string;
  foodDiscarded?: boolean;
  // Optional §16 time-control anchor (ISO): when the food is known to have first gone out of range.
  foodOutOfRangeSince?: string;
  // §10 photos for the check.
  attachments?: TemperatureAttachmentUpload[];
  // Scheduled slot to log against, or the shop's random-check schedule for an ad-hoc check.
  // Omit to let the server place the reading (window-match a slot, else the random bucket).
  scheduleId?: string;
}) {
  const response = await apiClient.post<ApiResponse<TemperatureReading>>("/temperature-logs/readings", payload);
  return mapReading(response.data.data);
}

// ── Equipment-issue lifecycle (spec §15/§20/§22/§23) ──

export async function listTemperatureEquipmentIssues(shopId: string, openOnly = true) {
  const response = await apiClient.get<ApiResponse<TemperatureEquipmentIssue[]>>("/temperature-logs/issues", {
    params: { shopId, openOnly },
  });
  return (response.data.data ?? []).map(mapIssue);
}

export async function getTemperatureEquipmentIssue(issueId: string) {
  const response = await apiClient.get<ApiResponse<TemperatureEquipmentIssue>>(`/temperature-logs/issues/${issueId}`);
  return mapIssue(response.data.data);
}

export async function markTemperatureUnitNotWorking(
  unitId: string,
  payload: {
    shopId: string;
    reason: string;
    currentTemperatureCelsius?: number;
    issueNoticedOn?: string;
    foodAffected?: boolean;
    foodMoved?: boolean;
    foodMovedTo?: string;
    foodDiscarded?: boolean;
    managerInformed?: boolean;
    correctiveActions?: string;
    notes?: string;
    attachments?: TemperatureAttachmentUpload[];
  },
) {
  const response = await apiClient.post<ApiResponse<TemperatureEquipmentIssue>>(
    `/temperature-logs/units/${unitId}/mark-not-working`,
    payload,
  );
  return mapIssue(response.data.data);
}

export async function setTemperatureIssueUnderMaintenance(issueId: string, payload: { notes?: string }) {
  const response = await apiClient.post<ApiResponse<TemperatureEquipmentIssue>>(
    `/temperature-logs/issues/${issueId}/under-maintenance`,
    payload,
  );
  return mapIssue(response.data.data);
}

export async function resolveTemperatureIssue(
  issueId: string,
  payload: {
    finalTemperatureCelsius: number;
    resolutionNotes: string;
    engineerContacted?: boolean;
    foodActionCompleted?: boolean;
    notes?: string;
    attachments?: TemperatureAttachmentUpload[];
  },
) {
  const response = await apiClient.post<ApiResponse<TemperatureEquipmentIssue>>(
    `/temperature-logs/issues/${issueId}/resolve`,
    payload,
  );
  return mapIssue(response.data.data);
}

// §24 equipment-issue history report (not-working / under-maintenance / resolved), filterable.
export async function getTemperatureIssuesReport(
  shopId: string,
  from: string,
  to: string,
  filters?: { unitId?: string; category?: string; status?: string },
) {
  const response = await apiClient.get<ApiResponse<TemperatureEquipmentIssue[]>>("/reports/temperature-issues", {
    params: {
      shopId,
      from,
      to,
      unitId: filters?.unitId,
      category: filters?.category,
      status: filters?.status,
    },
  });
  return (response.data.data ?? []).map(mapIssue);
}

// Returns a reading/issue photo as a data URL (data:...;base64,...) for preview/download.
export async function getTemperatureAttachmentContent(attachmentId: string) {
  const response = await apiClient.get<ApiResponse<string | null>>(
    `/temperature-logs/attachments/${attachmentId}/content`,
  );
  return response.data.data ?? null;
}

export async function signOffTemperatureDailyLog(payload: {
  shopId: string;
  signoffDate: string;
  signedByInitials?: string;
  notes?: string;
}) {
  const response = await apiClient.post<ApiResponse<TemperatureDailyLog["signoff"]>>("/temperature-logs/signoff", payload);
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
  };
}

export async function listTemperatureSchedules(shopId: string) {
  const response = await apiClient.get<ApiResponse<TemperatureSchedule[]>>("/temperature-logs/schedules", {
    params: { shopId },
  });
  // Defensive: coerce unitIds to an array so older/missing payloads read as "all units" rather than undefined.
  return (response.data.data ?? []).map((s) => ({ ...s, unitIds: (s.unitIds ?? []).map(String) }));
}

export async function createTemperatureSchedule(payload: {
  shopId: string;
  unitIds: string[];
  label: string;
  expectedTime: string;
  toleranceMinutes: number;
  isActive: boolean;
}) {
  const response = await apiClient.post<ApiResponse<TemperatureSchedule>>("/temperature-logs/schedules", payload);
  return response.data.data;
}

export async function updateTemperatureSchedule(id: string, payload: {
  shopId: string;
  unitIds: string[];
  label: string;
  expectedTime: string;
  toleranceMinutes: number;
  isActive: boolean;
}) {
  const response = await apiClient.put<ApiResponse<TemperatureSchedule>>(`/temperature-logs/schedules/${id}`, payload);
  return response.data.data;
}

export async function deleteTemperatureSchedule(id: string) {
  await apiClient.delete(`/temperature-logs/schedules/${id}`);
}

export async function getTemperatureScheduleGrid(input: {
  shopId: string;
  from: string;
  to: string;
  unitId?: string;
}) {
  const response = await apiClient.get<ApiResponse<TemperatureScheduleGrid>>("/reports/temperature-schedule-grid", {
    params: input,
  });
  return response.data.data;
}
