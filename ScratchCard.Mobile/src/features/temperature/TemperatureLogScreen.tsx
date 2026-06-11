import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { NavigationProp, RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  getTemperatureDailyLog,
  listTemperatureSchedules,
  listTemperatureUnits,
  recordTemperatureReading,
} from "../../api/temperatureLogsApi";
import { useAuth } from "../../auth/AuthContext";
import { useTemperatureDisplaySettings } from "./useTemperatureDisplaySettings";
import { DateTimeField, formatDateValue, formatTimeValue, parseDateTimeValue } from "../../components/DateTimeField";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { toastError, toastSuccess } from "../../components/toast";
import { ModalBackdropBlur } from "../../components/ModalBackdropBlur";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { Skeleton } from "../../components/Skeleton";
import { StatusBadge } from "../../components/StatusBadge";
import type { MainStackParamList } from "../../types/navigation";
import type {
  TemperatureMonitoringUnit,
  TemperatureReading,
  TemperatureSchedule,
  TemperatureScheduleCellState,
} from "../../types/models";
import { ui } from "../../ui/primitives";
import { appTheme, surfaceShadow } from "../../ui/theme";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";

function formatTemperature(value: number) {
  return `${value.toFixed(1)}°C`;
}

function readingStatusTone(isOutOfRange: boolean): "success" | "danger" {
  return isOutOfRange ? "danger" : "success";
}

function isOutOfRangeTemperature(temperature: number, min: number, max: number) {
  return temperature < min || temperature > max;
}

// Pre-fills the temperature box with a leading "-" for units whose whole range sits at or below
// zero (freezers, e.g. -10 to 0), so the operator just types the digits. The ± button still lets
// them flip to positive. Units that can read positive start blank.
function defaultTemperatureEntryForRange(min: number, max: number): string {
  return max <= 0 && min < 0 ? "-" : "";
}

// Formats a numeric reading for the entry box, keeping the explicit +/- sign convention the UI uses.
function formatTemperatureEntryValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  return value < 0 ? String(value) : `+${value}`;
}

// Produces "+4.4° over" or "−1.2° below" so a glance at a row tells the reader how far
// outside the safe band the reading actually was — the raw "Out of range" badge alone
// doesn't communicate severity.
function formatOutOfRangeDelta(temperature: number, min: number, max: number): string {
  if (temperature > max) {
    const diff = temperature - max;
    return `+${diff.toFixed(1)}° over`;
  }
  if (temperature < min) {
    const diff = min - temperature;
    return `−${diff.toFixed(1)}° below`;
  }
  return "";
}

function isSameDateValue(a: string, b: string) {
  return a === b;
}

type DailyFilter = "all" | "pending" | "outOfRange";

// Pulsing skeleton placeholder rendered while the day's units + readings load for the first
// time. Mirrors the Day Management initial-load pattern so the two screens feel like the same
// app while the network call is in flight.
function TemperatureLogLoadingState() {
  return (
    <View style={loadingStyles.shell}>
      <View style={[ui.card, loadingStyles.card]}>
        <View style={loadingStyles.dateRow}>
          <Skeleton width={32} height={32} radius={appTheme.radius.sm} />
          <Skeleton height={42} radius={appTheme.radius.sm} style={{ flex: 1 }} />
          <Skeleton width={32} height={32} radius={appTheme.radius.sm} />
        </View>
        <View style={loadingStyles.chipRow}>
          <Skeleton width={90} height={26} radius={appTheme.radius.pill} />
          <Skeleton width={100} height={26} radius={appTheme.radius.pill} />
          <Skeleton width={120} height={26} radius={appTheme.radius.pill} />
        </View>
        <View style={loadingStyles.chipRow}>
          <Skeleton width={60} height={28} radius={appTheme.radius.pill} />
          <Skeleton width={80} height={28} radius={appTheme.radius.pill} />
          <Skeleton width={110} height={28} radius={appTheme.radius.pill} />
        </View>
      </View>

      <View style={loadingStyles.unitList}>
        {[0, 1, 2].map((idx) => (
          <View key={idx} style={loadingStyles.unitCard}>
            <View style={loadingStyles.unitCardTop}>
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width="55%" height={16} />
                <Skeleton width="40%" height={12} />
              </View>
              <Skeleton width={80} height={22} radius={appTheme.radius.pill} />
            </View>
            <View style={loadingStyles.unitCardBottom}>
              <Skeleton width="50%" height={12} />
              <Skeleton width="35%" height={12} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const loadingStyles = StyleSheet.create({
  shell: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
  },
  card: {
    gap: appTheme.spacing.sm,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  chipRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  unitList: {
    gap: appTheme.spacing.xs,
  },
  unitCard: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintAlt,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: 8,
  },
  unitCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  unitCardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
});

function buildDefaultInitials(firstName?: string, lastName?: string, email?: string, displayName?: string) {
  const resolvedName = (displayName ?? `${firstName ?? ""} ${lastName ?? ""}`).trim();
  const fromName = resolvedName
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  if (fromName) {
    return fromName.slice(0, 20);
  }

  const fromEmail = (email ?? "").trim().slice(0, 1).toUpperCase();
  return fromEmail || "";
}

function shiftDateByDays(dateValue: string, days: number) {
  const parts = dateValue.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return dateValue;
  }

  const [year, month, day] = parts;
  const shifted = new Date(year, month - 1, day);
  shifted.setDate(shifted.getDate() + days);
  return formatDateValue(shifted);
}

// A scheduled check for one unit on the selected day: the expected slot plus whatever reading
// (if any) was logged against it. State mirrors the schedule-grid report: OnTime / Late when a
// reading matched, Pending / Missed when none did.
type ScheduledSlotView = {
  scheduleId: string;
  label: string;
  expectedTime: string; // "HH:mm"
  // "Early" = logged before the slot but outside tolerance; "Late" = after. Both derive from the
  // server's isLateForSchedule flag (which conflates the two) split by reading-vs-expected time.
  state: TemperatureScheduleCellState | "Pending" | "Early";
  reading?: TemperatureReading;
};

function slotStateMeta(state: ScheduledSlotView["state"]): { label: string; color: string } {
  switch (state) {
    case "OnTime":
      return { label: "On time", color: appTheme.colors.success };
    case "Early":
      return { label: "Early", color: appTheme.colors.warning };
    case "Late":
      return { label: "Late", color: appTheme.colors.warning };
    case "Missed":
      return { label: "Missed", color: appTheme.colors.danger };
    default:
      return { label: "Pending", color: appTheme.colors.textSubtle };
  }
}

function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

// One selectable check in the entry modal's "Which check?" picker. id is the scheduled slot's id,
// or null for the "Random / extra check" option (logged against the shop's random bucket server-side).
type ScheduleOption = { id: string | null; time: string; label: string; expectedMinutes: number | null };

// The scheduled slot whose time window contains readingTime — used to pre-select the most likely
// check when the entry modal opens (the last slot at or before the reading; readings before the
// first slot pick it). Returns null (Random) when the unit has no scheduled slots. Slots with a
// null id (the Random option) are ignored as default targets.
function defaultScheduleIdForTime(options: ScheduleOption[], readingTime: string): string | null {
  const minutes = parseTimeToMinutes(readingTime);
  const slots = options.filter((opt) => opt.id != null);
  if (minutes == null || slots.length === 0) return null;
  let chosen = slots[0];
  for (const slot of slots) {
    if (slot.expectedMinutes != null && slot.expectedMinutes <= minutes) chosen = slot;
  }
  return chosen.id;
}

// Assigns the day's readings to this unit's scheduled checks. A reading goes to the check it was
// explicitly logged against (its scheduleId); a Random/extra check (or any id that isn't one of
// this unit's slots) is left out of the grid. Legacy readings with no scheduleId fall back to the
// time window they fall in (the last slot at or before the reading; readings before the first slot
// belong to it). Status within the slot: within tolerance = OnTime, before tolerance = Early, after
// tolerance = Late. A slot with no reading is Missed once its window has passed (today: past
// expectedTime + tolerance; earlier days: always), otherwise Pending.
// nowMinutes is the current minute-of-day, or null when the selected day isn't today.
function buildScheduledSlots(
  unit: TemperatureMonitoringUnit,
  readings: TemperatureReading[],
  schedules: TemperatureSchedule[],
  selectedDate: string,
  today: string,
  nowMinutes: number | null,
): ScheduledSlotView[] {
  const slots = schedules
    .filter(
      (schedule) =>
        schedule.isActive &&
        (!schedule.temperatureMonitoringUnitId || schedule.temperatureMonitoringUnitId === unit.id),
    )
    .sort((a, b) => a.expectedTime.localeCompare(b.expectedTime))
    .map((schedule) => ({
      schedule,
      expectedMinutes: parseTimeToMinutes(schedule.expectedTime),
      expectedTime: schedule.expectedTime.slice(0, 5),
    }));

  if (slots.length === 0) return [];

  // Bucket each reading against the check it was logged for. Prefer the explicit scheduleId binding;
  // fall back to time-window assignment only for legacy readings that have no binding.
  const slotIds = new Set(slots.map((slot) => slot.schedule.id));
  const readingsBySlot = new Map<string, TemperatureReading[]>();
  for (const reading of readings) {
    const readingMinutes = parseTimeToMinutes(reading.readingTime);
    if (readingMinutes == null) continue;

    let slotId: string | null;
    if (reading.scheduleId) {
      // Explicit check. If it isn't one of this unit's slots (e.g. a Random/extra check), skip it.
      slotId = slotIds.has(reading.scheduleId) ? reading.scheduleId : null;
    } else {
      // Legacy unbound reading: the last slot whose expected time is at or before it (slot 0 if none).
      let assignedIndex = 0;
      for (let i = 0; i < slots.length; i += 1) {
        const expected = slots[i].expectedMinutes;
        if (expected != null && expected <= readingMinutes) assignedIndex = i;
      }
      slotId = slots[assignedIndex].schedule.id;
    }
    if (slotId == null) continue;

    const bucket = readingsBySlot.get(slotId);
    if (bucket) bucket.push(reading);
    else readingsBySlot.set(slotId, [reading]);
  }

  return slots.map(({ schedule, expectedMinutes, expectedTime }) => {
    const tolerance = Math.max(0, schedule.toleranceMinutes);
    const assigned = readingsBySlot.get(schedule.id) ?? [];

    if (assigned.length > 0) {
      // Represent the slot with the reading closest to its expected time, so an on-time reading
      // wins over a stray early/late one bucketed into the same window.
      let chosen = assigned[0];
      let chosenDelta = Number.POSITIVE_INFINITY;
      for (const reading of assigned) {
        const readingMinutes = parseTimeToMinutes(reading.readingTime);
        const delta =
          readingMinutes != null && expectedMinutes != null
            ? Math.abs(readingMinutes - expectedMinutes)
            : Number.POSITIVE_INFINITY;
        if (delta < chosenDelta) {
          chosenDelta = delta;
          chosen = reading;
        }
      }

      const chosenMinutes = parseTimeToMinutes(chosen.readingTime);
      let state: ScheduledSlotView["state"] = "OnTime";
      // Early/Late only make sense for today or past days. A reading logged for a future date can't
      // be "late" — its scheduled time hasn't arrived — so leave it OnTime regardless of clock time.
      if (selectedDate <= today && chosenMinutes != null && expectedMinutes != null) {
        if (chosenMinutes < expectedMinutes - tolerance) state = "Early";
        else if (chosenMinutes > expectedMinutes + tolerance) state = "Late";
      }

      return { scheduleId: schedule.id, label: schedule.label, expectedTime, state, reading: chosen };
    }

    let state: ScheduledSlotView["state"];
    if (selectedDate < today) {
      state = "Missed";
    } else if (selectedDate > today) {
      state = "Pending";
    } else {
      state =
        expectedMinutes != null && nowMinutes != null && nowMinutes > expectedMinutes + tolerance
          ? "Missed"
          : "Pending";
    }

    return { scheduleId: schedule.id, label: schedule.label, expectedTime, state };
  });
}


type MatrixColumn = { label: string; expectedTime: string };
type MatrixRow = { unit: TemperatureMonitoringUnit; cells: Array<ScheduledSlotView | null> };

// Single-day overview: units down the side, scheduled slots across the top — the wall-sheet
// layout. A null cell means that slot's schedule doesn't apply to that unit (renders blank). The
// unit column is fixed; the slot columns scroll horizontally when there are many slots.
function DailyScheduleMatrix({
  columns,
  rows,
  outOfRangeCount,
  showTiming,
  showReadingTime,
  showRange,
  onCellPress,
}: {
  columns: MatrixColumn[];
  rows: MatrixRow[];
  outOfRangeCount: number;
  // Early/late/missed timing is only shown to a company owner when the shop setting allows it.
  showTiming: boolean;
  // The reading clock-time is likewise owner-only + shop-setting controlled.
  showReadingTime: boolean;
  // In/out-of-range status (header badge + cell colour) is owner-only + shop-setting controlled.
  showRange: boolean;
  onCellPress: (unitId: string, scheduleId: string) => void;
}) {
  if (columns.length === 0 || rows.length === 0) return null;
  return (
    <View style={styles.matrixCard}>
      <SectionHeader
        title="Scheduled Checks"
        icon="grid-outline"
        right={
          !showRange ? undefined : outOfRangeCount > 0 ? (
            <StatusBadge label={`${outOfRangeCount} out of range`} tone="danger" />
          ) : (
            <StatusBadge label="In range" tone="success" />
          )
        }
      />
      <View style={styles.matrixRow}>
        {/* Fixed unit column. */}
        <View style={styles.matrixUnitCol}>
          <View style={[styles.matrixUnitCell, styles.matrixCornerCell]}>
            <Text style={styles.matrixHeaderText}>Unit</Text>
          </View>
          {rows.map((row) => (
            <View key={row.unit.id} style={[styles.matrixUnitCell, styles.matrixUnitBodyCell]}>
              <Text style={styles.matrixUnitText} numberOfLines={2}>
                {row.unit.displayOrder ? `${row.unit.displayOrder}. ` : ""}{row.unit.unitName}
              </Text>
              <Text style={styles.matrixUnitType} numberOfLines={1}>
                {row.unit.equipmentType}
              </Text>
            </View>
          ))}
        </View>

        {/* Slot columns stretch to share the remaining width equally. */}
        <View style={styles.matrixSlotArea}>
            <View style={styles.matrixHeaderLine}>
              {columns.map((col, i) => (
                <View key={`${col.label}|${col.expectedTime}|${i}`} style={styles.matrixSlotHeaderCell}>
                  <Text style={styles.matrixHeaderText} numberOfLines={1}>
                    {col.label}
                  </Text>
                  <Text style={styles.matrixHeaderSubText}>{col.expectedTime}</Text>
                </View>
              ))}
            </View>
            {rows.map((row) => (
              <View key={row.unit.id} style={styles.matrixBodyRow}>
                {row.cells.map((cell, i) => {
                  const col = columns[i];
                  if (!cell) {
                    return (
                      <View key={`${row.unit.id}|${i}`} style={[styles.matrixCell, styles.matrixCellEmpty]}>
                        <Text style={styles.matrixCellNa}>—</Text>
                      </View>
                    );
                  }
                  // Hide early/late/missed timing unless allowed: a no-reading slot shows a neutral
                  // "Pending" instead of "Missed", and the Early/Late tag is suppressed.
                  const meta = slotStateMeta(showTiming ? cell.state : cell.reading ? "OnTime" : "Pending");
                  return (
                    <Pressable
                      key={`${row.unit.id}|${i}`}
                      style={styles.matrixCell}
                      onPress={() => onCellPress(row.unit.id, cell.scheduleId)}
                      accessibilityRole="button"
                      accessibilityLabel={`${row.unit.unitName}, ${col.label} ${col.expectedTime}, ${meta.label}`}
                    >
                      {cell.reading ? (
                        <>
                          <Text
                            style={[
                              styles.matrixCellTemp,
                              !showRange ? styles.matrixCellTempNeutral : cell.reading.isOutOfRange ? styles.scheduleSlotDanger : styles.scheduleSlotOk,
                            ]}
                            numberOfLines={1}
                          >
                            {formatTemperature(Number(cell.reading.temperatureCelsius))}
                          </Text>
                          <View style={styles.matrixCellMetaRow}>
                            {showReadingTime ? (
                              <Text style={styles.matrixCellMeta} numberOfLines={1}>
                                {cell.reading.readingTime}
                              </Text>
                            ) : null}
                            {showTiming && (cell.state === "Late" || cell.state === "Early") ? (
                              <Text style={styles.scheduleSlotLateTag} numberOfLines={1}>
                                {cell.state === "Early" ? "Early" : "Late"}
                              </Text>
                            ) : null}
                          </View>
                        </>
                      ) : (
                        <>
                          <Text style={[styles.matrixCellState, { color: meta.color }]} numberOfLines={1}>
                            {meta.label}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
        </View>
      </View>
    </View>
  );
}

export function TemperatureLogScreen() {
  const route = useRoute<RouteProp<MainStackParamList, "TemperatureLogs">>();
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const initialDate = route.params?.date ?? formatDateValue(new Date());
  const queryClient = useQueryClient();
  const { activeShopId, profile } = useAuth();
  const shopId = activeShopId;
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [entryDate, setEntryDate] = useState(formatDateValue(new Date()));
  const [readingTime, setReadingTime] = useState(formatTimeValue(new Date()));
  const [selectedUnitId, setSelectedUnitId] = useState("");
  // Which check the in-progress entry is logged against: a scheduled slot's id, or null = "Random /
  // extra check" (the server stores it against the shop's random bucket). Pre-selected on open.
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [temperatureCelsius, setTemperatureCelsius] = useState("");
  // The unit's last reading, used to pre-fill the box, restore it if left blank, and show as a hint.
  const [previousReadingValue, setPreviousReadingValue] = useState("");
  // Mirrors the temperature field's focus so the joined ± button can show the same active state.
  const [isTempFocused, setIsTempFocused] = useState(false);
  const [checkedByInitials, setCheckedByInitials] = useState("");
  const [notes, setNotes] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [textEditorField, setTextEditorField] = useState<"notes" | "action" | null>(null);
  const initialsRef = useRef<TextInput>(null);
  const tempInputRef = useRef<TextInput>(null);
  const [textEditorValue, setTextEditorValue] = useState("");
  const [isLogEntryModalVisible, setIsLogEntryModalVisible] = useState(false);
  // Inline "saved" confirmation shown in the live-status banner after a Save & Next, replacing
  // the toast so the operator gets feedback right where the in/out-of-range verdict appears.
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dailyFilter, setDailyFilter] = useState<DailyFilter>("all");

  const today = formatDateValue(new Date());
  const isToday = isSameDateValue(selectedDate, today);

  const defaultInitials = useMemo(
    () => buildDefaultInitials(profile?.firstName, profile?.lastName, profile?.email, profile?.displayName),
    [profile?.displayName, profile?.email, profile?.firstName, profile?.lastName]
  );

  useEffect(() => {
    if (!checkedByInitials.trim() && defaultInitials) {
      setCheckedByInitials(defaultInitials);
    }
  }, [checkedByInitials, defaultInitials]);

  const unitsQuery = useQuery({
    queryKey: ["temperature-units", shopId],
    queryFn: () => listTemperatureUnits(shopId as string),
    enabled: Boolean(shopId),
  });

  useEffect(() => {
    const activeUnits = (unitsQuery.data ?? []).filter((x) => x.isActive);
    if (activeUnits.length > 0 && !selectedUnitId) {
      setSelectedUnitId(activeUnits[0].id);
    }
  }, [unitsQuery.data, selectedUnitId]);

  const dailyLogQuery = useQuery({
    queryKey: ["temperature-daily-log", shopId, selectedDate],
    queryFn: () => getTemperatureDailyLog(shopId as string, selectedDate),
    enabled: Boolean(shopId) && selectedDate.length === 10,
  });

  const schedulesQuery = useQuery({
    queryKey: ["temperature-schedules", shopId],
    queryFn: () => listTemperatureSchedules(shopId as string),
    enabled: Boolean(shopId),
    staleTime: 10 * 60 * 1000,
  });

  const { showTiming, showReadingTime, showRange } = useTemperatureDisplaySettings();

  // Current minute-of-day, only when the selected day is today — drives Pending vs Missed for
  // slots with no reading. Null on other days so past = Missed, future = Pending without a clock.
  const nowMinutes = useMemo(() => {
    if (selectedDate !== today) return null;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, [selectedDate, today]);

  const scheduledSlotsFor = useCallback(
    (unit: TemperatureMonitoringUnit, readings: TemperatureReading[]) =>
      buildScheduledSlots(unit, readings, schedulesQuery.data ?? [], selectedDate, today, nowMinutes),
    [schedulesQuery.data, selectedDate, today, nowMinutes],
  );

  const onPullRefresh = useCallback(async () => {
    await Promise.all([unitsQuery.refetch(), dailyLogQuery.refetch()]);
  }, [unitsQuery, dailyLogQuery]);
  const isRefreshing = unitsQuery.isRefetching || dailyLogQuery.isRefetching;

  // Reset all entry-form fields and prime readingTime so the next unit's entry starts fresh.
  // Used by chip taps, chevron navigation, and the post-save "advance to next" path.
  const resetEntryFormForUnit = useCallback((unitId: string) => {
    setSelectedUnitId(unitId);
    const unit = (unitsQuery.data ?? []).find((x) => x.id === unitId);
    // Pre-fill with the unit's most recent reading so the operator can confirm or tweak it (they
    // still have to hit Save to record). Fall back to the freezer "-" hint when there's no prior
    // reading for the day.
    const unitLog = dailyLogQuery.data?.units?.find((u) => u.unit.id === unitId);
    const previousReading =
      unitLog && unitLog.readings.length > 0 ? unitLog.readings[unitLog.readings.length - 1] : undefined;
    const previousValue = previousReading
      ? formatTemperatureEntryValue(Number(previousReading.temperatureCelsius))
      : "";
    setPreviousReadingValue(previousValue);
    setTemperatureCelsius(
      previousValue || (unit ? defaultTemperatureEntryForRange(unit.minTemperatureCelsius, unit.maxTemperatureCelsius) : ""),
    );
    setNotes("");
    setActionTaken("");
    setReadingTime(formatTimeValue(new Date()));
  }, [unitsQuery.data, dailyLogQuery.data]);

  type RecordPostAction = "close" | "next";
  // Holds the unit we should jump to after a successful save when the user picks "Save & Next".
  // Captured before invoking the mutation so onSuccess can advance even after the form resets.
  const pendingNextUnitRef = useRef<string | null>(null);
  // Carries an explicit check into the pre-select effect, set by a grid-cell launch or by Save &
  // Next. undefined = no explicit pick pending (use the time-window default); null = Random;
  // a string = that slot's schedule id.
  const pendingScheduleIdRef = useRef<string | null | undefined>(undefined);
  const recordMutation = useMutation({
    mutationFn: async (_postAction: RecordPostAction) => {
      if (!shopId) throw new Error("No shop selected.");
      if (!selectedUnitId) throw new Error("Select a unit.");
      if (!temperatureCelsius.trim()) throw new Error("Enter temperature.");

      const parsedTemperature = Number(temperatureCelsius);
      if (Number.isNaN(parsedTemperature)) {
        throw new Error("Temperature must be numeric.");
      }

      const selectedUnitForRange = (unitsQuery.data ?? []).find((unit) => unit.id === selectedUnitId);
      let normalizedActionTaken = actionTaken.trim();
      if (
        selectedUnitForRange &&
        isOutOfRangeTemperature(
          parsedTemperature,
          selectedUnitForRange.minTemperatureCelsius,
          selectedUnitForRange.maxTemperatureCelsius
        ) &&
        !normalizedActionTaken
      ) {
        normalizedActionTaken = "Nothing";
      }

      return recordTemperatureReading({
        shopId,
        temperatureMonitoringUnitId: selectedUnitId,
        readingDate: entryDate,
        readingTime,
        temperatureCelsius: parsedTemperature,
        checkedByInitials: checkedByInitials.trim() || undefined,
        notes: notes.trim() || undefined,
        actionTaken: normalizedActionTaken || undefined,
        // null = Random / extra check → omit so the server stores it against the shop's random bucket.
        scheduleId: selectedScheduleId ?? undefined,
      });
    },
    onSuccess: async (_data, postAction) => {
      setSelectedDate(entryDate);
      // On "Save & Next" we stay in the modal and jump to the next unit, so skip the toast —
      // it fires repeatedly and gets in the way. Only confirm on the final save (close).
      if (postAction !== "next") {
        toastSuccess("Temperature reading recorded.");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["temperature-daily-log", shopId, entryDate] }),
      ]);

      if (postAction === "next" && pendingNextUnitRef.current) {
        // Stay in the modal and switch to the next pending unit. Clear form first so the
        // operator sees an empty entry ready for the next fridge.
        const savedUnitName = selectedUnit?.unitName;
        const nextUnitId = pendingNextUnitRef.current;
        pendingNextUnitRef.current = null;
        // Carry the same check to the next unit, but resolve THAT unit's own schedule record for it
        // (per-unit schedules differ by unit). Null (Random) stays distinct from undefined.
        pendingScheduleIdRef.current = nextUnitId
          ? scheduleIdForUnitCheck(nextUnitId, currentCheck)
          : selectedScheduleId;
        resetEntryFormForUnit(nextUnitId);
        // Inline "saved" confirmation in the live-status banner (replaces the toast for this flow).
        if (savedFlashTimerRef.current) {
          clearTimeout(savedFlashTimerRef.current);
        }
        setSavedFlash(savedUnitName ? `${savedUnitName} saved` : "Reading saved");
        savedFlashTimerRef.current = setTimeout(() => setSavedFlash(null), 2500);
        // No auto-focus: the next unit's box is pre-filled with its last reading, so the operator
        // only taps in when they actually need to change the value.
        return;
      }

      // Default behaviour (Save & Close, or Save & Next with nothing pending left): tear down
      // the modal and reset the form so the next time it opens it's clean.
      pendingNextUnitRef.current = null;
      setSavedFlash(null);
      setTemperatureCelsius("");
      setNotes("");
      setActionTaken("");
      setReadingTime(formatTimeValue(new Date()));
      setIsLogEntryModalVisible(false);
    },
    onError: (error: any) => {
      toastError(getApiErrorMessage(error, "Couldn't save the reading. Please try again."));
    },
  });

  const activeUnits = useMemo(
    () => (unitsQuery.data ?? []).filter((unit) => unit.isActive),
    [unitsQuery.data]
  );
  const dailyUnitLogs = useMemo(() => {
    const fromDailyLog = dailyLogQuery.data?.units ?? [];
    if (fromDailyLog.length > 0) {
      return fromDailyLog;
    }

    return activeUnits.map((unit) => ({ unit, readings: [] }));
  }, [activeUnits, dailyLogQuery.data?.units]);

  // Units × scheduled-slots matrix for the day. Columns are the union of every unit's slots,
  // de-duplicated by label + time and ordered by time; a unit that has no schedule for a given
  // column gets a null cell (rendered blank).
  const scheduleMatrix = useMemo(() => {
    const perUnit = dailyUnitLogs.map((unitLog) => ({
      unit: unitLog.unit,
      views: scheduledSlotsFor(unitLog.unit, unitLog.readings),
    }));

    const seen = new Set<string>();
    const columns: MatrixColumn[] = [];
    for (const entry of perUnit) {
      for (const view of entry.views) {
        const key = `${view.label}|${view.expectedTime}`;
        if (seen.has(key)) continue;
        seen.add(key);
        columns.push({ label: view.label, expectedTime: view.expectedTime });
      }
    }
    columns.sort((a, b) => a.expectedTime.localeCompare(b.expectedTime));

    const rows: MatrixRow[] = perUnit.map((entry) => ({
      unit: entry.unit,
      cells: columns.map(
        (col) =>
          entry.views.find((view) => view.label === col.label && view.expectedTime === col.expectedTime) ?? null,
      ),
    }));

    return { columns, rows };
  }, [dailyUnitLogs, scheduledSlotsFor]);
  const selectedUnitLog = dailyUnitLogs.find((x) => x.unit.id === selectedUnitId);
  const selectedUnit = selectedUnitLog?.unit ?? activeUnits.find((x) => x.id === selectedUnitId);

  // Scheduled checks applicable to the selected unit (its own + shop-wide slots), time-ordered, as
  // the options for the entry modal's "Which check?" picker. The random bucket is excluded from the
  // schedules API, so it's offered as a separate null-id option rather than coming from this list.
  const unitScheduleOptions = useMemo<ScheduleOption[]>(() => {
    if (!selectedUnit) return [];
    return (schedulesQuery.data ?? [])
      .filter(
        (schedule) =>
          schedule.isActive &&
          (!schedule.temperatureMonitoringUnitId || schedule.temperatureMonitoringUnitId === selectedUnit.id),
      )
      .map((schedule) => ({
        id: schedule.id,
        time: schedule.expectedTime.slice(0, 5),
        label: schedule.label,
        expectedMinutes: parseTimeToMinutes(schedule.expectedTime),
      }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [schedulesQuery.data, selectedUnit]);

  // Pre-select the check when the modal opens or the unit changes: the slot whose window contains
  // the reading time, else Random. Intentionally not keyed on readingTime so editing the time after
  // opening doesn't override a pick the user made by hand.
  useEffect(() => {
    if (!isLogEntryModalVisible || !selectedUnit) return;
    // A grid-cell launch pre-selects that exact slot; otherwise fall back to the time-window default.
    if (pendingScheduleIdRef.current !== undefined) {
      setSelectedScheduleId(pendingScheduleIdRef.current);
      pendingScheduleIdRef.current = undefined;
    } else {
      setSelectedScheduleId(defaultScheduleIdForTime(unitScheduleOptions, readingTime));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogEntryModalVisible, selectedUnitId, unitScheduleOptions]);

  const summary = useMemo(() => {
    const total = dailyUnitLogs.length;
    let recorded = 0;
    let outOfRange = 0;

    for (const unitLog of dailyUnitLogs) {
      const latestReading = unitLog.readings.length > 0 ? unitLog.readings[unitLog.readings.length - 1] : undefined;
      if (latestReading) {
        recorded += 1;
        if (latestReading.isOutOfRange) {
          outOfRange += 1;
        }
      }
    }

    return {
      total,
      recorded,
      pending: Math.max(total - recorded, 0),
      outOfRange,
    };
  }, [dailyUnitLogs]);

  // Live in-range / out-of-range hint shown while the user types into the modal so they
  // can see the verdict before saving — and the corrective-action prompt feels less abrupt.
  const liveStatus = useMemo(() => {
    if (!selectedUnit) return null;
    const trimmed = temperatureCelsius.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    const outOfRange = isOutOfRangeTemperature(
      parsed,
      selectedUnit.minTemperatureCelsius,
      selectedUnit.maxTemperatureCelsius
    );
    return {
      outOfRange,
      deltaLabel: outOfRange
        ? formatOutOfRangeDelta(parsed, selectedUnit.minTemperatureCelsius, selectedUnit.maxTemperatureCelsius)
        : "",
    };
  }, [selectedUnit, temperatureCelsius]);

  useEffect(() => () => {
    if (savedFlashTimerRef.current) {
      clearTimeout(savedFlashTimerRef.current);
    }
  }, []);

  const filteredUnitLogs = useMemo(() => {
    if (dailyFilter === "all") return dailyUnitLogs;
    return dailyUnitLogs.filter((unitLog) => {
      const latest = unitLog.readings.length > 0
        ? unitLog.readings[unitLog.readings.length - 1]
        : undefined;
      if (dailyFilter === "pending") return !latest;
      // outOfRange: only units whose latest reading is flagged.
      return !!latest && latest.isOutOfRange;
    });
  }, [dailyFilter, dailyUnitLogs]);
  useEffect(() => {
    if (!selectedUnit) {
      return;
    }

    const parsedTemperature = Number(temperatureCelsius);
    if (!Number.isFinite(parsedTemperature)) {
      return;
    }

    const outOfRange = isOutOfRangeTemperature(
      parsedTemperature,
      selectedUnit.minTemperatureCelsius,
      selectedUnit.maxTemperatureCelsius
    );
    if (!outOfRange || actionTaken.trim().length > 0) {
      return;
    }

    setActionTaken("Nothing");
  }, [
    actionTaken,
    selectedUnit,
    temperatureCelsius,
  ]);
  const openTextEditor = (field: "notes" | "action") => {
    setTextEditorField(field);
    setTextEditorValue(field === "notes" ? notes : actionTaken);
  };
  const closeTextEditor = () => {
    setTextEditorField(null);
    setTextEditorValue("");
  };
  const saveTextEditor = () => {
    if (textEditorField === "notes") {
      setNotes(textEditorValue);
    } else if (textEditorField === "action") {
      setActionTaken(textEditorValue);
    }

    closeTextEditor();
  };
  const openLogEntryModal = (unitId: string, scheduleId?: string | null) => {
    pendingNextUnitRef.current = null;
    // When launched from a grid cell or a quick-add button, bind the entry to that check (null =
    // Random); the pre-select effect reads this. undefined falls back to the time-window default.
    pendingScheduleIdRef.current = scheduleId;
    setEntryDate(selectedDate);
    // Always default the reading time to "now" (resetEntryFormForUnit handles this). The slot's
    // early/late/missed status is derived from the entered time, so stamping the tapped slot's
    // scheduled time would make every entry look on-time regardless of when it was actually logged.
    resetEntryFormForUnit(unitId);
    setIsLogEntryModalVisible(true);
  };
  // Quick-add: open the entry popup for a specific check (scheduleId, or null = Random) against the
  // currently selected unit (or the first active one). The unit can still be switched in the modal.
  const openQuickEntry = (scheduleId: string | null) => {
    const unitId = selectedUnitId || activeUnits[0]?.id;
    if (!unitId) return;
    openLogEntryModal(unitId, scheduleId);
  };
  const closeLogEntryModal = () => {
    closeTextEditor();
    pendingNextUnitRef.current = null;
    setIsLogEntryModalVisible(false);
  };


  // The "check" the popup is currently entering, identified by label + time. Each unit has its OWN
  // schedule record for a given check, so navigation/counter below are scoped to the units that this
  // check applies to — that's why "1 of 3" reflects only those units, not every unit.
  const currentCheck = useMemo(() => {
    if (!selectedScheduleId) return null;
    const s = (schedulesQuery.data ?? []).find((x) => x.id === selectedScheduleId);
    return s ? { label: s.label, time: s.expectedTime.slice(0, 5) } : null;
  }, [selectedScheduleId, schedulesQuery.data]);

  // Resolve a unit's own schedule record for a given check (label + time). Null for the random bucket.
  const scheduleIdForUnitCheck = useCallback(
    (unitId: string, check: { label: string; time: string } | null): string | null => {
      if (!check) return null;
      const match = (schedulesQuery.data ?? []).find(
        (s) =>
          s.isActive &&
          s.label === check.label &&
          s.expectedTime.slice(0, 5) === check.time &&
          (!s.temperatureMonitoringUnitId || s.temperatureMonitoringUnitId === unitId),
      );
      return match?.id ?? null;
    },
    [schedulesQuery.data],
  );

  // Units the current check applies to. Random / no specific check → every unit.
  const entryUnitLogs = useMemo(() => {
    if (!currentCheck) return dailyUnitLogs;
    return dailyUnitLogs.filter((u) => scheduleIdForUnitCheck(u.unit.id, currentCheck) != null);
  }, [dailyUnitLogs, currentCheck, scheduleIdForUnitCheck]);

  const selectedUnitIndex = useMemo(
    () => entryUnitLogs.findIndex((x) => x.unit.id === selectedUnitId),
    [entryUnitLogs, selectedUnitId],
  );

  // Whether a unit still needs a reading FOR THE CURRENT CHECK (not just any reading today). Without
  // this, a unit that did an earlier check counts as "recorded" and the Save button wrongly flips to
  // "Save & Finish" while other units still need this check's reading.
  const isPendingForCheck = useCallback(
    (unitLog: typeof dailyUnitLogs[number]) => {
      if (!currentCheck) return unitLog.readings.length === 0;
      // Use the same per-unit slot resolution the grid uses (handles explicit scheduleId AND legacy
      // time-window readings). A unit is pending for this check if its matching slot has no reading.
      const view = scheduledSlotsFor(unitLog.unit, unitLog.readings)
        .find((v) => v.label === currentCheck.label && v.expectedTime === currentCheck.time);
      if (!view) return false; // this check doesn't apply to this unit
      return !view.reading;
    },
    [currentCheck, scheduledSlotsFor],
  );

  // Order of "next" candidates: start at selected+1, wrap around to the start, exclude current.
  // Returns the first pending unit if one exists; otherwise the next unit regardless of status
  // (so the operator can still move forward to review/re-enter).
  const nextUnitId = useMemo(() => {
    if (entryUnitLogs.length < 2 || selectedUnitIndex < 0) return null;
    const orderedFromHere = [
      ...entryUnitLogs.slice(selectedUnitIndex + 1),
      ...entryUnitLogs.slice(0, selectedUnitIndex),
    ];
    const pending = orderedFromHere.find((u) => isPendingForCheck(u));
    return (pending ?? orderedFromHere[0]).unit.id;
  }, [entryUnitLogs, selectedUnitIndex, isPendingForCheck]);

  // Walk through every unit for this check IN ORDER — even units that already have a value — so the
  // operator can review/confirm each one. "Save & Next Unit" until the last unit; "Save & Finish"
  // only on the final unit (no wrap-around). Drives the Save button.
  const nextPendingUnitId = useMemo(() => {
    if (entryUnitLogs.length === 0) return null;
    const idx = entryUnitLogs.findIndex((x) => x.unit.id === selectedUnitId);
    if (idx < 0) return entryUnitLogs[0].unit.id;
    return idx < entryUnitLogs.length - 1 ? entryUnitLogs[idx + 1].unit.id : null;
  }, [entryUnitLogs, selectedUnitId]);

  const prevUnitId = useMemo(() => {
    if (entryUnitLogs.length < 2 || selectedUnitIndex < 0) return null;
    const prevIndex = selectedUnitIndex === 0 ? entryUnitLogs.length - 1 : selectedUnitIndex - 1;
    return entryUnitLogs[prevIndex].unit.id;
  }, [entryUnitLogs, selectedUnitIndex]);

  // Switch to a different unit without saving — used by chip taps and chevron buttons. Carry the
  // current check across so the next unit opens on ITS schedule record for that same check.
  const switchToUnit = (unitId: string) => {
    if (unitId === selectedUnitId) return;
    closeTextEditor();
    pendingNextUnitRef.current = null;
    pendingScheduleIdRef.current = scheduleIdForUnitCheck(unitId, currentCheck);
    resetEntryFormForUnit(unitId);
  };

  const triggerSave = (postAction: RecordPostAction) => {
    if (postAction === "next") {
      pendingNextUnitRef.current = nextPendingUnitId;
    } else {
      pendingNextUnitRef.current = null;
    }
    recordMutation.mutate(postAction);
  };
  const moveSelectedDate = (days: number) => {
    setSelectedDate((current) => shiftDateByDays(current, days));
  };
  const selectedDateTimeValue = `${selectedDate} ${readingTime}`;
  const entryDateTimeValue = `${entryDate} ${readingTime}`;

  // First-load only — refetches use the pull-to-refresh spinner, not the skeleton.
  const isInitialLoading = unitsQuery.isLoading || (Boolean(shopId) && dailyLogQuery.isLoading);
  if (isInitialLoading) {
    return (
      <ScreenContainer>
        <TemperatureLogLoadingState />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onPullRefresh}
          tintColor={appTheme.colors.primary}
        />
      }
    >
      <View style={styles.screenContent}>
        {/* <View style={styles.heroCard}>
          <Text style={styles.heroSubtitle}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <Text style={styles.heroNote}>Digitize daily checks with quick entry, alerts, and supervisor signoff.</Text>
        </View> */}

        <View style={[ui.card, styles.quickEntryCard]}>
          <View style={styles.dateNavRow}>
            <Pressable
              style={styles.dateNavButton}
              onPress={() => moveSelectedDate(-1)}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
            >
              <Ionicons name="chevron-back" size={18} color={appTheme.colors.text} />
            </Pressable>
            <DateTimeField
              style={{ flex: 1 }}
              mode="datetime"
              value={selectedDateTimeValue}
              onChange={(value) => {
                const parsed = parseDateTimeValue(value);
                if (!parsed) {
                  return;
                }

                setSelectedDate(formatDateValue(parsed));
                setReadingTime(formatTimeValue(parsed));
              }}
            />
            <Pressable
              style={styles.dateNavButton}
              onPress={() => moveSelectedDate(1)}
              accessibilityRole="button"
              accessibilityLabel="Next day"
            >
              <Ionicons name="chevron-forward" size={18} color={appTheme.colors.text} />
            </Pressable>
            {/* {!isToday ? (
              <Pressable
                style={styles.todayButton}
                onPress={() => {
                  setSelectedDate(today);
                  setReadingTime(formatTimeValue(new Date()));
                }}
                accessibilityRole="button"
                accessibilityLabel="Jump to today"
              >
                <Text style={styles.todayButtonText}>Today</Text>
              </Pressable>
            ) : null} */}
          </View>

          <View style={styles.summaryRow}>
            {/* <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel} numberOfLines={1}>Done</Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.summaryCardValue,
                  summary.total > 0 && summary.recorded === summary.total ? styles.summaryValueSuccess : null,
                ]}
              >
                {summary.recorded}/{summary.total}
              </Text>
            </View> */}
          </View>

          {/* <Text style={styles.quickAddLabel}>Add reading to check</Text> */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickAddRow}
            keyboardShouldPersistTaps="handled"
          >
            {(schedulesQuery.data ?? [])
              .slice()
              .sort((a, b) => a.expectedTime.localeCompare(b.expectedTime))
              .map((schedule) => (
                <Pressable
                  key={schedule.id}
                  onPress={() => openQuickEntry(schedule.id)}
                  style={[styles.quickAddChip, styles.quickAddChipColumn]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${schedule.label} reading`}
                >
                  <View style={styles.quickAddChipTop}>
                    <Ionicons name="add" size={14} color={appTheme.colors.primary} />
                    <Text style={styles.quickAddChipText}>{schedule.label}</Text>
                  </View>
                  <Text style={styles.quickAddChipTime}>{schedule.expectedTime.slice(0, 5)}</Text>
                </Pressable>
              ))}
            <Pressable
              onPress={() => openQuickEntry(null)}
              style={styles.quickAddChip}
              accessibilityRole="button"
              accessibilityLabel="Add random reading"
            >
              <Ionicons name="add" size={14} color={appTheme.colors.primary} />
              <Text style={styles.quickAddChipText}>Random</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("TemperatureSchedules")}
              style={[styles.quickAddChip, styles.quickAddManageChip]}
              accessibilityRole="button"
              accessibilityLabel="Add or edit scheduled checks"
            >
              <Ionicons name="settings-outline" size={14} color={appTheme.colors.textMuted} />
              <Text style={styles.quickAddManageText}>Edit</Text>
            </Pressable>
          </ScrollView>
        </View>
        {/* Monitoring Units list — hidden on the main screen per request. Code kept intact;
            flip this `false` to `true` (or a real flag) to bring it back. */}
        {false ? (
        <View style={[ui.card, styles.unitsCard]}>
          <SectionHeader
            title="Monitoring Units"
            icon="thermometer-outline"
            right={
              <StatusBadge
                label={`${filteredUnitLogs.length} of ${dailyUnitLogs.length}`}
                tone="neutral"
              />
            }
          />
          {dailyLogQuery.isLoading ? <Text style={styles.meta}>Loading units...</Text> : null}
          <View style={styles.unitList}>
            {filteredUnitLogs.map((unitLog) => {
              const unit = unitLog.unit;
              const latestReading =
                unitLog.readings.length > 0
                  ? unitLog.readings[unitLog.readings.length - 1]
                  : undefined;
              const latestTemp = latestReading ? Number(latestReading.temperatureCelsius) : null;
              const deltaLabel = latestReading && latestReading.isOutOfRange && latestTemp != null
                ? formatOutOfRangeDelta(latestTemp, unit.minTemperatureCelsius, unit.maxTemperatureCelsius)
                : "";

              const rowStatusBg = !latestReading
                ? styles.unitRowPendingBg
                : latestReading.isOutOfRange
                  ? styles.unitRowOutOfRangeBg
                  : styles.unitRowInRangeBg;

              return (
                <Pressable
                  key={unit.id}
                  style={[styles.unitRow, rowStatusBg]}
                  onPress={() => openLogEntryModal(unit.id)}
                  accessibilityRole="button"
                  accessibilityHint="Opens the reading entry modal"
                >
                  <View style={styles.unitRowTop}>
                    <View style={styles.unitRowIdentity}>
                      <Text style={styles.unitRowTitle}>{unit.unitName}</Text>
                      <Text style={styles.unitRowSubtext}>
                        {unit.equipmentType}{unit.location ? ` | ${unit.location}` : ""}
                      </Text>
                    </View>
                    {latestReading ? (
                      <StatusBadge
                        label={latestReading.isOutOfRange ? "Out of range" : "In range"}
                        tone={readingStatusTone(latestReading.isOutOfRange)}
                      />
                    ) : (
                      <View style={styles.pendingBadge}>
                        <Ionicons name="time-outline" size={11} color={appTheme.colors.warning} />
                        <Text style={styles.pendingBadgeText}>Pending</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.unitRowBottom}>
                    <Text style={styles.unitRowRange} numberOfLines={1}>
                      Range: {formatTemperature(unit.minTemperatureCelsius)} – {formatTemperature(unit.maxTemperatureCelsius)}
                    </Text>
                    <View style={styles.unitRowLastWrap}>
                      <Text style={styles.unitRowLast} numberOfLines={1}>
                        {latestReading
                          ? `${latestReading.readingTime} · ${formatTemperature(Number(latestReading.temperatureCelsius))}`
                          : "No reading"}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={appTheme.colors.textSubtle} />
                    </View>
                  </View>
                  {deltaLabel ? (
                    <Text style={styles.unitRowDelta}>{deltaLabel}</Text>
                  ) : null}
                </Pressable>
              );
            })}
            {!dailyLogQuery.isLoading && dailyUnitLogs.length === 0 ? (
              <Text style={styles.meta}>No active units available.</Text>
            ) : null}
            {!dailyLogQuery.isLoading && dailyUnitLogs.length > 0 && filteredUnitLogs.length === 0 ? (
              <Text style={styles.meta}>
                {dailyFilter === "pending"
                  ? "Nothing pending — every unit has a reading."
                  : "No out-of-range units."}
              </Text>
            ) : null}
          </View>
        </View>
        ) : null}

        <DailyScheduleMatrix
          columns={scheduleMatrix.columns}
          rows={scheduleMatrix.rows}
          outOfRangeCount={summary.outOfRange}
          showTiming={showTiming}
          showReadingTime={showReadingTime}
          showRange={showRange}
          onCellPress={openLogEntryModal}
        />

        <View style={styles.readingsSection}>
          <SectionHeader
            title="Daily Readings"
            subtitle={selectedDate}
            icon="list-outline"
          />
          {dailyLogQuery.isLoading ? <Text style={styles.meta}>Loading daily readings...</Text> : null}
          {dailyUnitLogs.map((unitLog) => (
            <View key={unitLog.unit.id} style={[ui.card, styles.unitSheet]}>
              <View style={styles.unitSheetHeader}>
                <View style={styles.unitSheetIdentity}>
                  <Text style={styles.itemTitle}>{unitLog.unit.unitName}</Text>
                  <Text style={styles.meta}>
                    {unitLog.unit.equipmentType}{unitLog.unit.location ? ` | ${unitLog.unit.location}` : ""}
                  </Text>
                </View>
                <Text style={styles.unitSheetRange}>
                  {formatTemperature(unitLog.unit.minTemperatureCelsius)} to {formatTemperature(unitLog.unit.maxTemperatureCelsius)}
                </Text>
              </View>

              <View style={styles.logHeaderRow}>
                <Text style={[styles.logHeaderCell, styles.logColTime]}>Time</Text>
                <Text style={[styles.logHeaderCell, styles.logColTemp]}>Temp</Text>
                <Text style={[styles.logHeaderCell, styles.logColStatus]}>Status</Text>
                <Text style={[styles.logHeaderCell, styles.logColBy]}>By</Text>
              </View>

              {unitLog.readings.length === 0 ? (
                <Text style={styles.meta}>No readings for this date.</Text>
              ) : (
                unitLog.readings.map((reading) => {
                  const tempValue = Number(reading.temperatureCelsius);
                  const deltaLabel = reading.isOutOfRange && Number.isFinite(tempValue)
                    ? formatOutOfRangeDelta(
                        tempValue,
                        unitLog.unit.minTemperatureCelsius,
                        unitLog.unit.maxTemperatureCelsius
                      )
                    : "";
                  return (
                    <View key={reading.id} style={styles.logRowBlock}>
                      <View style={styles.logRow}>
                        <Text style={[styles.logCell, styles.logColTime]}>{reading.readingTime || "--:--"}</Text>
                        <Text style={[styles.logCellStrong, styles.logColTemp]}>
                          {formatTemperature(tempValue)}
                        </Text>
                        <Text
                          style={[
                            styles.logCell,
                            styles.logColStatus,
                            reading.isOutOfRange ? styles.logStatusOutOfRange : styles.logStatusInRange,
                          ]}
                        >
                          {reading.isOutOfRange ? "Out of range" : "In range"}
                        </Text>
                        <Text style={[styles.logCell, styles.logColBy]}>{reading.checkedByInitials || "-"}</Text>
                      </View>
                      {deltaLabel ? <Text style={styles.logDetail}>{deltaLabel}</Text> : null}
                      {reading.actionTaken ? <Text style={styles.logDetail}>Action: {reading.actionTaken}</Text> : null}
                      {reading.notes ? <Text style={styles.logDetail}>Notes: {reading.notes}</Text> : null}
                    </View>
                  );
                })
              )}
            </View>
          ))}
          {!dailyLogQuery.isLoading && dailyUnitLogs.length === 0 ? (
            <Text style={styles.meta}>No units configured for this shop.</Text>
          ) : null}
        </View>

        {/* <View style={ui.card}>
          <Text style={styles.sectionTitle}>Recent History</Text>
          <View style={styles.row}>
            <DateTimeField style={{ flex: 1 }} mode="date" value={historyFrom} onChange={setHistoryFrom} />
            <DateTimeField style={{ flex: 1 }} mode="date" value={historyTo} onChange={setHistoryTo} />
          </View>
          {(historyQuery.data ?? []).slice(0, 20).map((reading) => (
            <View key={reading.id} style={styles.item}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{reading.unitName}</Text>
                <StatusBadge
                  label={reading.isOutOfRange ? "Out of range" : "In range"}
                  tone={readingStatusTone(reading.isOutOfRange)}
                />
              </View>
              <Text style={styles.meta}>
                {reading.readingDate} {reading.readingTime} | {formatTemperature(Number(reading.temperatureCelsius))}
              </Text>
              <Text style={styles.meta}>By: {reading.checkedByInitials}</Text>
              {reading.actionTaken ? <Text style={styles.meta}>Action: {reading.actionTaken}</Text> : null}
              {reading.notes ? <Text style={styles.meta}>Notes: {reading.notes}</Text> : null}
            </View>
          ))}
          {(historyQuery.data ?? []).length === 0 ? <Text style={styles.meta}>No records in selected range.</Text> : null}
        </View> */}

        <Modal
          visible={isLogEntryModalVisible}
          transparent
          animationType="fade"
          onRequestClose={closeLogEntryModal}
          onShow={() => {
            setSavedFlash(null);
          }}
        >
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ModalBackdropBlur />
            <View style={styles.modalCard}>
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
              <View style={styles.unitHeaderRow}>
                <Pressable
                  style={[styles.unitNavButton, !prevUnitId ? styles.unitNavButtonDisabled : null]}
                  onPress={() => prevUnitId && switchToUnit(prevUnitId)}
                  disabled={!prevUnitId || recordMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Previous unit"
                >
                  <Ionicons name="chevron-back" size={18} color={appTheme.colors.text} />
                </Pressable>
                <View style={styles.unitHeaderTitleWrap}>
                  <Text style={styles.sectionTitle} numberOfLines={1}>
                    {selectedUnit?.unitName ?? "Unit"}
                  </Text>
                  {entryUnitLogs.length > 1 && selectedUnitIndex >= 0 ? (
                    <Text style={styles.unitHeaderCounter}>
                      {selectedUnitIndex + 1} of {entryUnitLogs.length}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  style={[styles.unitNavButton, !nextUnitId ? styles.unitNavButtonDisabled : null]}
                  onPress={() => nextUnitId && switchToUnit(nextUnitId)}
                  disabled={!nextUnitId || recordMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Next unit"
                >
                  <Ionicons name="chevron-forward" size={18} color={appTheme.colors.text} />
                </Pressable>
              </View>
              {selectedUnit ? (
                <Text style={styles.unitHeaderMeta} numberOfLines={1}>
                  {[
                    selectedUnit.equipmentType,
                    `${formatTemperature(selectedUnit.minTemperatureCelsius)} – ${formatTemperature(selectedUnit.maxTemperatureCelsius)}`,
                    selectedUnit.location || null,
                  ]
                    .filter(Boolean)
                    .join("  ·  ")}
                </Text>
              ) : null}
              <View style={styles.unitHeaderDivider} />
              {unitScheduleOptions.length > 0 ? (
                <View style={styles.checkPickerWrap}>
                  <View style={styles.checkPickerRow}>
                    {unitScheduleOptions.map((option) => {
                      const selected = selectedScheduleId === option.id;
                      return (
                        <Pressable
                          key={option.id ?? "random"}
                          onPress={() => setSelectedScheduleId(option.id)}
                          style={[styles.checkChip, selected ? styles.checkChipSelected : null]}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`${option.label} at ${option.time}`}
                        >
                          <Text style={[styles.checkChipTime, selected ? styles.checkChipTextSelected : null]}>
                            {option.time}
                          </Text>
                          <Text
                            style={[styles.checkChipLabel, selected ? styles.checkChipTextSelected : null]}
                            numberOfLines={1}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => setSelectedScheduleId(null)}
                      style={[styles.checkChip, selectedScheduleId === null ? styles.checkChipSelected : null]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selectedScheduleId === null }}
                      accessibilityLabel="Random or extra check"
                    >
                      <Text style={[styles.checkChipTime, selectedScheduleId === null ? styles.checkChipTextSelected : null]}>
                        Random
                      </Text>
                      <Text
                        style={[styles.checkChipLabel, selectedScheduleId === null ? styles.checkChipTextSelected : null]}
                        numberOfLines={1}
                      >
                        Extra check
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <DateTimeField
                mode="datetime"
                value={entryDateTimeValue}
                onChange={(value) => {
                  const parsed = parseDateTimeValue(value);
                  if (!parsed) {
                    return;
                  }

                  setEntryDate(formatDateValue(parsed));
                  setReadingTime(formatTimeValue(parsed));
                }}
              />

              <View style={[styles.row, { alignItems: "stretch" }]}>
                <View style={styles.entryHalf}>
                  <FloatingLabelInput
                    ref={initialsRef}
                    label="Initials"
                    value={checkedByInitials}
                    onChangeText={setCheckedByInitials}
                    autoCapitalize="characters"
                    returnKeyType="done"
                  />
                </View>
                <View style={styles.entryHalf}>
                  <View style={styles.tempInputRow}>
                      <Pressable
                      style={[styles.tempSignButton, isTempFocused ? styles.tempSignButtonActive : null]}
                      onPress={() => {
                        // Flip the explicit sign between "+x" and "-x". Empty starts a "-" entry
                        // so the next keystroke types digits straight after the sign. The
                        // decimal-pad keyboard has no minus key, so this button is the only way
                        // to enter freezer values.
                        const trimmed = temperatureCelsius.trim();
                        if (!trimmed) {
                          setTemperatureCelsius("-");
                          return;
                        }
                        if (trimmed.startsWith("-")) {
                          setTemperatureCelsius(`+${trimmed.slice(1)}`);
                          return;
                        }
                        if (trimmed.startsWith("+")) {
                          setTemperatureCelsius(`-${trimmed.slice(1)}`);
                          return;
                        }
                        setTemperatureCelsius(`-${trimmed}`);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Toggle negative temperature"
                    >
                      <Text style={[styles.tempSignButtonText, isTempFocused ? styles.tempSignButtonTextActive : null]}>±</Text>
                    </Pressable>
                    <View style={styles.tempInputField}>
                      <FloatingLabelInput
                        ref={tempInputRef}
                        label="Temperature"
                        containerStyle={styles.tempInputFieldContainer}
                        value={temperatureCelsius}
                        onChangeText={(raw) => {
                          // Always show an explicit sign in front of the number so freezer (-)
                          // vs fridge (+) readings are obvious at a glance. Empty stays empty so
                          // the placeholder still shows; the "-" prefix from the ± button is
                          // preserved; otherwise a positive value gets a "+" prefix.
                          const trimmed = raw.replace(/\s/g, "");
                          if (trimmed.length === 0) {
                            setTemperatureCelsius("");
                            return;
                          }
                          if (trimmed === "-" || trimmed === "+") {
                            setTemperatureCelsius(trimmed);
                            return;
                          }
                          if (trimmed.startsWith("-") || trimmed.startsWith("+")) {
                            setTemperatureCelsius(trimmed);
                            return;
                          }
                          setTemperatureCelsius(`+${trimmed}`);
                        }}
                        keyboardType="decimal-pad"
                        returnKeyType="next"
                        submitBehavior="submit"
                        onFocus={() => {
                          setIsTempFocused(true);
                          // Tapping in to type a fresh reading clears the pre-filled previous value.
                          if (previousReadingValue && temperatureCelsius === previousReadingValue) {
                            setTemperatureCelsius("");
                          }
                        }}
                        onBlur={() => {
                          setIsTempFocused(false);
                          // Left blank → keep the previous reading (operator confirmed no change).
                          if (!temperatureCelsius.trim() && previousReadingValue) {
                            setTemperatureCelsius(previousReadingValue);
                          }
                        }}
                        onSubmitEditing={() => initialsRef.current?.focus()}
                      />
                    </View>
                  </View>
                  {previousReadingValue && temperatureCelsius.trim() !== previousReadingValue ? (
                    <Text style={styles.previousReadingHint}>Previous: {previousReadingValue}°C</Text>
                  ) : null}
                </View>
              </View>

              {liveStatus ? (
                <View
                  style={[
                    styles.liveStatusBanner,
                    liveStatus.outOfRange ? styles.liveStatusBannerDanger : styles.liveStatusBannerOk,
                  ]}
                >
                  <Ionicons
                    name={liveStatus.outOfRange ? "warning" : "checkmark-circle"}
                    size={16}
                    color={liveStatus.outOfRange ? appTheme.colors.danger : appTheme.colors.success}
                  />
                  <Text
                    style={[
                      styles.liveStatusText,
                      liveStatus.outOfRange ? styles.liveStatusTextDanger : styles.liveStatusTextOk,
                    ]}
                  >
                    {liveStatus.outOfRange
                      ? `Out of range · ${liveStatus.deltaLabel}`
                      : "In range"}
                  </Text>
                </View>
              ) : savedFlash ? (
                <View style={[styles.liveStatusBanner, styles.liveStatusBannerOk]}>
                  <Ionicons name="checkmark-circle" size={16} color={appTheme.colors.success} />
                  <Text style={[styles.liveStatusText, styles.liveStatusTextOk]}>{savedFlash}</Text>
                </View>
              ) : null}

              {/* Notes hidden — managers wanted a tighter form. Action Taken only surfaces when the
                  live reading is out of range, since that's the only case where a corrective
                  action is meaningful to record. */}
              {liveStatus?.outOfRange ? (
                <View style={styles.entryRow}>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.noteActionTile}
                    onPress={() => openTextEditor("action")}
                  >
                    <Text style={styles.noteActionLabel}>Action Taken</Text>
                    <Text style={[styles.noteActionValue, !actionTaken.trim() ? styles.noteActionPlaceholder : null]} numberOfLines={2}>
                      {actionTaken.trim() || "Tap to record corrective action"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              </ScrollView>

              {/* Action buttons live outside the ScrollView so they stay pinned above the
                  keyboard (the KeyboardAvoidingView lifts the whole card) while typing. */}
              <View style={[styles.modalFooter, styles.modalFooterRow]}>
                <Pressable
                  style={[styles.modalActionButton, styles.modalActionSecondary, styles.modalFooterClose]}
                  onPress={closeLogEntryModal}
                  disabled={recordMutation.isPending}
                >
                  <Text style={styles.modalActionSecondaryText}>Close</Text>
                </Pressable>
                <View style={styles.modalFooterSave}>
                  <PrimaryButton
                    label={
                      recordMutation.isPending
                        ? "Saving…"
                        : nextPendingUnitId
                          ? "Save & next unit"
                          : "Save & finish"
                    }
                    onPress={() => triggerSave(nextPendingUnitId ? "next" : "close")}
                    disabled={recordMutation.isPending || !shopId || !selectedUnit}
                  />
                </View>
              </View>

              {textEditorField ? (
                <View style={styles.inlineEditorOverlay}>
                  <Pressable style={StyleSheet.absoluteFill} onPress={closeTextEditor} />
                  <View style={styles.inlineEditorCard}>
                    <Text style={styles.sectionTitle}>
                      {textEditorField === "notes" ? "Edit Notes" : "Edit Action Taken"}
                    </Text>
                    <TextInput
                      style={[styles.input, styles.modalTextArea]}
                      value={textEditorValue}
                      onChangeText={setTextEditorValue}
                      placeholder={textEditorField === "notes" ? "Enter notes" : "Enter corrective action"}
                      placeholderTextColor={appTheme.colors.textSubtle}
                      multiline
                      textAlignVertical="top"
                    />
                    <View style={styles.modalActionRow}>
                      <Pressable
                        style={[styles.modalActionButton, styles.modalActionPrimary]}
                        onPress={saveTextEditor}
                      >
                        <Text style={styles.modalActionPrimaryText}>Save</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.modalActionButton, styles.modalActionSecondary]}
                        onPress={closeTextEditor}
                      >
                        <Text style={styles.modalActionSecondaryText}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
  },
  unitsCard: {
    gap: appTheme.spacing.sm,
  },
  quickEntryCard: {
    gap: appTheme.spacing.sm,
  },
  quickEntryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
  summaryRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  summaryTile: {
    flex: 1,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTint,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 2,
  },
  summaryLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  summaryValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 17,
    lineHeight: 21,
  },
  readingsCard: {
    gap: appTheme.spacing.sm,
  },
  // Container for the Daily Readings section: header + one card per unit.
  readingsSection: {
    gap: appTheme.spacing.md,
    marginTop:appTheme.spacing.lg
  },
  heroCard: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.primaryPressed,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.xs,
  },
  heroSubtitle: {
    color: appTheme.colors.onPrimary,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  heroNote: {
    color: appTheme.colors.textOnDark,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
    marginTop: 2,
  },
  input: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    color: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
  },
  entryRow: {
    flexDirection: "column",
    gap: appTheme.spacing.sm,
  },
  entryColumn: {
    width: "100%",
    gap: 2,
  },
  // Half-width cell for the Initials | Temperature row.
  entryHalf: {
    flex: 1,
    gap: 2,
  },
  previousReadingHint: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "right",
  },
  tempInputRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 0,
  },
  tempInputField: {
    flex: 1,
  },
  // Squares the temperature field's left corners so it sits flush against the ± button.
  tempInputFieldContainer: {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  tempSignButton: {
    width: 44,
    borderWidth: 1,
    // No right border/radius — it shares the seam with the temperature field for a joined control.
    borderRightWidth: 0,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  tempSignButtonActive: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surface,
  },
  tempSignButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 20,
    lineHeight: 24,
  },
  tempSignButtonTextActive: {
    color: appTheme.colors.primary,
  },
  unitChipRow: {
    gap: 6,
    paddingBottom: 4,
  },
  unitChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: appTheme.colors.surface,
    maxWidth: 140,
  },
  unitChipActive: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.primary,
  },
  unitChipRecorded: {
    borderColor: appTheme.colors.success,
  },
  unitChipOutOfRange: {
    borderColor: appTheme.colors.danger,
    borderWidth: 2,
  },
  unitChipIndex: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 12,
  },
  unitChipIndexActive: {
    color: appTheme.colors.onPrimary,
  },
  unitChipLabel: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
    flexShrink: 1,
  },
  unitChipLabelActive: {
    color: appTheme.colors.onPrimary,
  },
  checkPickerWrap: {
    gap: 6,
  },
  checkPickerLabel: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    textTransform: "uppercase",
  },
  checkPickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
    paddingVertical: 2,
  },
  checkChip: {
    // Stretch to fill the row (equal share of available width); wrap to a new line when there are
    // more checks than fit. minWidth keeps each readable before wrapping.
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 72,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 6,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surfaceTintAlt,
    alignItems: "center",
    gap: 1,
  },
  checkChipSelected: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.primary,
  },
  checkChipTime: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  checkChipLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 11,
    lineHeight: 14,
    maxWidth: 96,
  },
  checkChipTextSelected: {
    color: appTheme.colors.onPrimary,
  },
  scheduleBlock: {
    gap: 4,
    paddingVertical: appTheme.spacing.xs,
  },
  scheduleBlockTitle: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    textTransform: "uppercase",
  },
  scheduleSlotRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSoft,
  },
  scheduleSlotHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  scheduleSlotTime: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  scheduleSlotLabel: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
  scheduleSlotValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scheduleSlotTemp: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  scheduleSlotOk: {
    color: appTheme.colors.success,
  },
  scheduleSlotDanger: {
    color: appTheme.colors.danger,
  },
  scheduleSlotState: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  scheduleSlotLateTag: {
    color: appTheme.colors.warning,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
  },
  matrixCard: {
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.lg,
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    padding: appTheme.spacing.md,
    ...surfaceShadow,
  },
  matrixRow: {
    flexDirection: "row",
    // Framed grid; clipped corners. The soft elevation lives on the section card (matrixCard)
    // because overflow:hidden here would clip a shadow on iOS.
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    borderRadius: appTheme.radius.sm,
    overflow: "hidden",
    backgroundColor: appTheme.colors.surface,
  },
  matrixSlotArea: {
    flex: 1,
  },
  matrixUnitCol: {
    width: 104,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: appTheme.colors.borderSoft,
  },
  matrixUnitCell: {
    width: 104,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical:14,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appTheme.colors.borderSoft,
  },
  matrixCornerCell: {
    height: 45,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  matrixUnitBodyCell: {
    height: 60,
  },
  matrixUnitText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  matrixUnitType: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 10,
    lineHeight: 13,
    marginTop: 1,
  },
  matrixHeaderLine: {
    flexDirection: "row",
  },
  matrixSlotHeaderCell: {
    flex: 1,
    height: 45,
    paddingHorizontal: 4,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appTheme.colors.borderSoft,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: appTheme.colors.borderSoft,
  },
  matrixHeaderText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  matrixHeaderSubText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 11,
    lineHeight: 13,
  },
  matrixBodyRow: {
    flexDirection: "row",
    height: 60,
  },
  matrixCell: {
    flex: 1,
    height: 64,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appTheme.colors.borderSoft,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: appTheme.colors.borderSoft,
  },
  matrixCellEmpty: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  matrixCellNa: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 16,
  },
  matrixCellTemp: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  matrixCellTempNeutral: {
    color: appTheme.colors.text,
  },
  matrixCellState: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  matrixCellMeta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 10,
    lineHeight: 12,
  },
  matrixCellMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  unitHeaderDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: appTheme.colors.border,
    marginTop: 2,
    marginBottom: 2,
  },
  unitHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    marginTop: 6,
  },
  unitNavButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  unitNavButtonDisabled: {
    opacity: 0.35,
  },
  unitHeaderTitleWrap: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  unitHeaderCounter: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
  },
  // Single centered line under the unit name: equipment type · range · location.
  unitHeaderMeta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 2,
  },
  noteActionTile: {
    flex: 1,
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 3,
    minHeight: 64,
  },
  noteActionLabel: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  noteActionValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 17,
  },
  noteActionPlaceholder: {
    color: appTheme.colors.textSubtle,
  },
  dropdownTrigger: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
  },
  dropdownTriggerDisabled: {
    opacity: 0.55,
  },
  dropdownTriggerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  dropdownTriggerIdentity: {
    flex: 1,
    gap: 2,
  },
  dropdownTriggerTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  dropdownTriggerSubtext: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  dropdownTriggerChevron: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 14,
  },
  unitSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
  unitSummaryColumn: {
    flex: 1,
    gap: 2,
  },
  unitSummaryColumnRight: {
    alignItems: "flex-end",
  },
  unitSummaryLabel: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  unitSummaryValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  unitSummaryValueRight: {
    textAlign: "right",
  },
  unitsListButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quickActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  unitsListButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  dateNavRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  dateNavButton: {
    width: 32,
    height: 32,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  todayButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  todayButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  summaryChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  summaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: appTheme.radius.pill,
  },
  summaryChipDone: {
    backgroundColor: appTheme.colors.surfaceTintSoft,
  },
  summaryChipPending: {
    backgroundColor: appTheme.colors.surfaceWarningSoft,
  },
  summaryChipDanger: {
    backgroundColor: appTheme.colors.surfaceWarningSoft,
  },
  summaryChipMuted: {
    backgroundColor: appTheme.colors.surfaceTint,
  },
  summaryChipText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  filterRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  summaryCard: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 10,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintAlt,
  },
  summaryCardLabel: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  summaryCardValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 20,
  },
  summaryValueSuccess: {
    color: appTheme.colors.success,
  },
  summaryValueDanger: {
    color: appTheme.colors.danger,
  },
  quickAddLabel: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    textTransform: "uppercase",
  },
  quickAddRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
    paddingVertical: 2,
  },
  quickAddChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 8,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surfaceTintAlt,
  },
  quickAddChipColumn: {
    flexDirection: "column",
    gap: 1,
    borderRadius: appTheme.radius.sm,
  },
  quickAddChipTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  quickAddChipText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  quickAddChipTime: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 11,
    lineHeight: 16,
  },
  quickAddManageChip: {
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  quickAddManageText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  filterChipSelected: {
    backgroundColor: appTheme.colors.primary,
  },
  filterChipText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  filterChipTextSelected: {
    color: appTheme.colors.onPrimary,
  },
  dateNavButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 18,
  },
  row: { flexDirection: "row", gap: appTheme.spacing.xs },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  unitList: {
    gap: appTheme.spacing.xs,
  },
  unitPickerListScroll: {
    maxHeight: 440,
  },
  unitRow: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintAlt,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 6,
  },
  // Status-tinted backgrounds so each unit's state reads at a glance.
  unitRowPendingBg: {
    backgroundColor: appTheme.colors.surfaceWarningSoft,
  },
  unitRowInRangeBg: {
    backgroundColor: appTheme.colors.surfaceSuccessSoft,
  },
  unitRowOutOfRangeBg: {
    backgroundColor: appTheme.colors.surfaceDangerSoft,
  },
  unitRowSelected: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  unitRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  unitRowIdentity: {
    flex: 1,
    gap: 2,
  },
  unitRowTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  unitRowTitleSelected: {
    color: appTheme.colors.primary,
  },
  unitRowSubtext: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  unitRowPending: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceWarningSoft,
  },
  pendingBadgeText: {
    color: appTheme.colors.warning,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
  },
  unitRowLastWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  unitRowDelta: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  liveStatusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 8,
  },
  liveStatusBannerOk: {
    backgroundColor: appTheme.colors.surfaceTintSoft,
  },
  liveStatusBannerDanger: {
    backgroundColor: appTheme.colors.surfaceWarningSoft,
  },
  liveStatusText: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
    flex: 1,
  },
  liveStatusTextOk: {
    color: appTheme.colors.success,
  },
  liveStatusTextDanger: {
    color: appTheme.colors.danger,
  },
  unitRowBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  unitRowRange: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  unitRowLast: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "right",
  },
  unitRowActionHint: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  choice: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  choiceSelected: {
    backgroundColor: appTheme.colors.primary,
    borderColor: appTheme.colors.primary,
  },
  choiceText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  choiceTextSelected: { color: appTheme.colors.onPrimary },
  item: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    padding: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  itemTitle: {
    fontFamily: appTheme.fonts.bodyMedium,
    color: appTheme.colors.text,
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 1,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  unitSheet: {
    // Rendered as its own ui.card now (padding/background/radius come from ui.card);
    // keep only the internal gap between the unit header and its readings table.
    gap: appTheme.spacing.xs,
  },
  unitSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  unitSheetIdentity: {
    flex: 1,
    gap: 2,
  },
  unitSheetRange: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "right",
  },
  logHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    // Tinted background distinguishes the column-title row from the card surface below it.
    backgroundColor: appTheme.colors.surfaceTintAlt,
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: 6,
    marginTop: 2,
  },
  logHeaderCell: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  logRowBlock: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
    paddingVertical: 6,
    gap: 2,
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: appTheme.spacing.xs,
    gap: appTheme.spacing.xs,
  },
  logCell: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  logCellStrong: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  logColTime: {
    flex: 0.9,
  },
  logColTemp: {
    flex: 1.1,
  },
  logColStatus: {
    flex: 0.9,
  },
  logColBy: {
    flex: 0.8,
    textAlign: "right",
  },
  logStatusInRange: {
    color: appTheme.colors.success,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  logStatusOutOfRange: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  logDetail: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: appTheme.spacing.xs,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: appTheme.colors.overlay,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.md,
  },
  modalCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.lg,
    borderWidth: 0,
    padding: appTheme.spacing.md,
    maxHeight: "88%",
    overflow: "hidden",
  },
  inlineEditorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: appTheme.colors.overlay,
    justifyContent: "center",
    padding: appTheme.spacing.sm,
    zIndex: 2,
  },
  inlineEditorCard: {
    borderWidth: 0,
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surface,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    gap: appTheme.spacing.sm,
  },
  modalTextArea: {
    minHeight: 132,
  },
  modalFooter: {
    gap: appTheme.spacing.sm,
    // Span the divider edge-to-edge across the popup (cancel the card's padding), so it's clearly
    // visible as a separator above the action buttons.
    marginHorizontal: -appTheme.spacing.md,
    paddingHorizontal: appTheme.spacing.md,
    // Breathing room between the form controls and the footer divider/buttons.
    marginTop: appTheme.spacing.md,
    paddingTop: appTheme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.border,
  },
  // Close on the left, Save (& Next) on the right — equal 50/50 width.
  modalFooterRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  modalFooterClose: {
    flex: 1,
  },
  modalFooterSave: {
    flex: 1,
  },
  modalActionRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  modalActionButton: {
    flex: 1,
    borderRadius: appTheme.radius.md,
    borderWidth: 0,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  modalActionPrimary: {
    backgroundColor: appTheme.colors.primary,
  },
  modalActionSecondary: {
    backgroundColor: appTheme.colors.surfaceTintSoft,
  },
  modalActionPrimaryText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  modalActionSecondaryText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
});



