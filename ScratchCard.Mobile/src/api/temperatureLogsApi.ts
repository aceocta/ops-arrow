import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { TemperatureDailyLog, TemperatureMonitoringUnit, TemperatureReading, TemperatureUnitDailyLog } from "../types/models";
import { TemperatureEquipmentType } from "../types/enums";

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

function mapUnit(raw: any): TemperatureMonitoringUnit {
  return {
    id: String(raw.id),
    shopId: String(raw.shopId),
    unitName: String(raw.unitName ?? ""),
    equipmentType: (raw.equipmentType as TemperatureEquipmentType) ?? TemperatureEquipmentType.Other,
    minTemperatureCelsius: Number(raw.minTemperatureCelsius ?? 0),
    maxTemperatureCelsius: Number(raw.maxTemperatureCelsius ?? 0),
    isActive: Boolean(raw.isActive),
    location: raw.location ?? undefined,
    notes: raw.notes ?? undefined,
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
    checkedByInitials: String(raw.checkedByInitials ?? ""),
    notes: raw.notes ?? undefined,
    actionTaken: raw.actionTaken ?? undefined,
    recordedOn: String(raw.recordedOn ?? ""),
    recordedByName: raw.recordedByName ?? undefined,
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
  minTemperatureCelsius: number;
  maxTemperatureCelsius: number;
  isActive?: boolean;
  location?: string;
  notes?: string;
}) {
  const response = await apiClient.post<ApiResponse<TemperatureMonitoringUnit>>("/temperature-logs/units", payload);
  return mapUnit(response.data.data);
}

export async function updateTemperatureUnit(
  unitId: string,
  payload: {
    unitName: string;
    equipmentType: TemperatureEquipmentType;
    minTemperatureCelsius: number;
    maxTemperatureCelsius: number;
    isActive: boolean;
    location?: string;
    notes?: string;
  }
) {
  const response = await apiClient.put<ApiResponse<TemperatureMonitoringUnit>>(`/temperature-logs/units/${unitId}`, payload);
  return mapUnit(response.data.data);
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
}) {
  const response = await apiClient.post<ApiResponse<TemperatureReading>>("/temperature-logs/readings", payload);
  return mapReading(response.data.data);
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
