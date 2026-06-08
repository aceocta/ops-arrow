import { api, unwrap } from "./api";

export type TempGridUnit = { unitId: string; unitName: string; displayOrder: number };
export type TempGridSlot = { scheduleId: string; unitId?: string | null; label: string; expectedTime: string; toleranceMinutes: number };
export type TempCellState = "Upcoming" | "OnTime" | "Late" | "Missed" | "Early";
export type TempGridCell = {
  date: string;
  unitId: string;
  scheduleId: string;
  state: TempCellState;
  readingId?: string;
  readingTime?: string;
  temperatureCelsius?: number;
  isOutOfRange?: boolean;
};
export type TemperatureScheduleGrid = {
  from: string;
  to: string;
  units: TempGridUnit[];
  slots: TempGridSlot[];
  cells: TempGridCell[];
  onTimeCount: number;
  earlyCount: number;
  lateCount: number;
  missedCount: number;
};

export type TemperatureReading = {
  id: string;
  unitName: string;
  minTemperatureCelsius: number;
  maxTemperatureCelsius: number;
  readingDate: string;
  readingTime: string;
  temperatureCelsius: number;
  isOutOfRange: boolean;
  checkedByInitials: string;
  notes?: string;
  actionTaken?: string;
  recordedOn: string;
  recordedByName?: string;
  scheduleId?: string;
  scheduleLabel?: string;
  isLateForSchedule: boolean;
};

export const temperatureApi = {
  grid: async (shopId: string, from: string, to: string) =>
    unwrap<TemperatureScheduleGrid>(
      (await api.get("/reports/temperature-schedule-grid", { params: { shopId, from, to } })).data,
    ),
  readings: async (shopId: string, from: string, to: string, unitId?: string) =>
    unwrap<TemperatureReading[]>(
      (await api.get("/temperature-logs/readings", { params: { shopId, from, to, unitId } })).data,
    ),
};
