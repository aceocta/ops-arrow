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

// Equipment types (string-serialised enum). Mirrors Domain.Enums.TemperatureEquipmentType.
export const EQUIPMENT_TYPES = ["Fridge", "Freezer", "CoolRoom", "DisplayChill", "HotFoodDisplay", "Other"] as const;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

export type TemperatureUnit = {
  id: string;
  shopId: string;
  unitName: string;
  equipmentType: EquipmentType;
  minTemperatureCelsius: number;
  maxTemperatureCelsius: number;
  isActive: boolean;
  location?: string | null;
  notes?: string | null;
  displayOrder: number;
};

export type TemperatureSchedule = {
  id: string;
  shopId: string;
  unitIds: string[];
  label: string;
  expectedTime: string; // "HH:mm[:ss]"
  toleranceMinutes: number;
  isActive: boolean;
};

export type SaveUnitPayload = {
  shopId?: string;
  unitName: string;
  equipmentType: EquipmentType;
  minTemperatureCelsius: number;
  maxTemperatureCelsius: number;
  isActive: boolean;
  location?: string;
  notes?: string;
};

export type SaveSchedulePayload = {
  shopId: string;
  unitIds: string[];
  label: string;
  expectedTime: string; // "HH:mm:ss"
  toleranceMinutes: number;
  isActive: boolean;
};

export const temperatureApi = {
  grid: async (shopId: string, from: string, to: string) =>
    unwrap<TemperatureScheduleGrid>(
      (await api.get("/reports/temperature-schedule-grid", { params: { shopId, from, to } })).data,
    ),

  // --- Units (CRUD) ---
  units: async (shopId: string) =>
    unwrap<TemperatureUnit[]>((await api.get("/temperature-logs/units", { params: { shopId } })).data),
  createUnit: async (p: SaveUnitPayload) =>
    unwrap<TemperatureUnit>((await api.post("/temperature-logs/units", p)).data),
  updateUnit: async (id: string, p: SaveUnitPayload) =>
    unwrap<TemperatureUnit>((await api.put(`/temperature-logs/units/${id}`, p)).data),

  // --- Schedules / check times (CRUD; the random bucket is excluded by the API) ---
  schedules: async (shopId: string) =>
    unwrap<TemperatureSchedule[]>((await api.get("/temperature-logs/schedules", { params: { shopId } })).data),
  createSchedule: async (p: SaveSchedulePayload) =>
    unwrap<TemperatureSchedule>((await api.post("/temperature-logs/schedules", p)).data),
  updateSchedule: async (id: string, p: SaveSchedulePayload) =>
    unwrap<TemperatureSchedule>((await api.put(`/temperature-logs/schedules/${id}`, p)).data),
  removeSchedule: async (id: string) => {
    await api.delete(`/temperature-logs/schedules/${id}`);
  },
  readings: async (shopId: string, from: string, to: string, unitId?: string) =>
    unwrap<TemperatureReading[]>(
      (await api.get("/temperature-logs/readings", { params: { shopId, from, to, unitId } })).data,
    ),
  // On-demand "check trends now": analyses recent readings and pushes alerts for units projected to breach.
  predictiveCheck: async (shopId: string) =>
    unwrap<TemperaturePredictiveCheckResult>(
      (await api.post("/temperature-logs/predictive-check", null, { params: { shopId } })).data,
    ),
};
