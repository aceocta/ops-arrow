import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RouteProp, useRoute } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  getTemperatureDailyLog,
  listTemperatureUnits,
  recordTemperatureReading,
} from "../../api/temperatureLogsApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue, formatTimeValue, parseDateTimeValue } from "../../components/DateTimeField";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { toastError, toastSuccess } from "../../components/toast";
import { ModalBackdropBlur } from "../../components/ModalBackdropBlur";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { KpiGrid, KpiTile } from "../../components/KpiTile";
import { Skeleton } from "../../components/Skeleton";
import { StatusBadge } from "../../components/StatusBadge";
import type { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function formatTemperature(value: number) {
  return `${value.toFixed(1)}°C`;
}

function readingStatusTone(isOutOfRange: boolean): "success" | "danger" {
  return isOutOfRange ? "danger" : "success";
}

function isOutOfRangeTemperature(temperature: number, min: number, max: number) {
  return temperature < min || temperature > max;
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

export function TemperatureLogScreen() {
  const route = useRoute<RouteProp<MainStackParamList, "TemperatureLogs">>();
  const initialDate = route.params?.date ?? formatDateValue(new Date());
  const queryClient = useQueryClient();
  const { activeShopId, profile } = useAuth();
  const shopId = activeShopId;
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [entryDate, setEntryDate] = useState(formatDateValue(new Date()));
  const [readingTime, setReadingTime] = useState(formatTimeValue(new Date()));
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [temperatureCelsius, setTemperatureCelsius] = useState("");
  const [checkedByInitials, setCheckedByInitials] = useState("");
  const [notes, setNotes] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [textEditorField, setTextEditorField] = useState<"notes" | "action" | null>(null);
  const initialsRef = useRef<TextInput>(null);
  const [textEditorValue, setTextEditorValue] = useState("");
  const [isLogEntryModalVisible, setIsLogEntryModalVisible] = useState(false);
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

  const onPullRefresh = useCallback(async () => {
    await Promise.all([unitsQuery.refetch(), dailyLogQuery.refetch()]);
  }, [unitsQuery, dailyLogQuery]);
  const isRefreshing = unitsQuery.isRefetching || dailyLogQuery.isRefetching;

  const recordMutation = useMutation({
    mutationFn: async () => {
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
      });
    },
    onSuccess: async () => {
      setTemperatureCelsius("");
      setNotes("");
      setActionTaken("");
      setReadingTime(formatTimeValue(new Date()));
      setIsLogEntryModalVisible(false);
      setSelectedDate(entryDate);
      toastSuccess("Temperature reading recorded.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["temperature-daily-log", shopId, entryDate] }),
      ]);
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message ?? error?.message ?? "Unable to save reading.");
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
  const selectedUnitLog = dailyUnitLogs.find((x) => x.unit.id === selectedUnitId);
  const selectedUnit = selectedUnitLog?.unit ?? activeUnits.find((x) => x.id === selectedUnitId);
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
  const openLogEntryModal = (unitId: string) => {
    setSelectedUnitId(unitId);
    setEntryDate(selectedDate);
    setTemperatureCelsius("");
    setNotes("");
    setActionTaken("");
    setReadingTime(formatTimeValue(new Date()));
    setIsLogEntryModalVisible(true);
  };
  const closeLogEntryModal = () => {
    closeTextEditor();
    setIsLogEntryModalVisible(false);
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
            {!isToday ? (
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
            ) : null}
          </View>

          <KpiGrid columns={2}>
            <KpiTile
              label="Done"
              value={summary.recorded}
              tone={summary.total > 0 && summary.recorded === summary.total ? "success" : "default"}
            />
            
            <KpiTile
              label="Out of range"
              value={summary.outOfRange}
              tone={summary.outOfRange > 0 ? "danger" : "default"}
            />
          </KpiGrid>

          <View style={styles.filterRow}>
            {(
              [
                { key: "all", label: "All" },
                // { key: "pending", label: "Pending" },
                { key: "outOfRange", label: "Out of range" },
              ] as Array<{ key: DailyFilter; label: string }>
            ).map((option) => {
              const selected = dailyFilter === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setDailyFilter(option.key)}
                  style={[styles.filterChip, selected ? styles.filterChipSelected : null]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.filterChipText, selected ? styles.filterChipTextSelected : null]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
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

              return (
                <Pressable
                  key={unit.id}
                  style={styles.unitRow}
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

        <View style={[ui.card, styles.readingsCard]}>
          <SectionHeader
            title="Daily Readings"
            subtitle={selectedDate}
            icon="list-outline"
          />
          {dailyLogQuery.isLoading ? <Text style={styles.meta}>Loading daily readings...</Text> : null}
          {dailyUnitLogs.map((unitLog) => (
            <View key={unitLog.unit.id} style={styles.unitSheet}>
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
        >
          <View style={styles.modalBackdrop}>
            <ModalBackdropBlur />
            <View style={styles.modalCard}>
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
              <Text style={styles.sectionTitle}>{selectedUnit?.unitName ?? "Unit"}</Text>
              {selectedUnit ? (
                <View style={styles.rowBetween}>
                  <Text style={styles.meta}>
                    {selectedUnit.equipmentType}{selectedUnit.location ? ` | ${selectedUnit.location}` : ""}
                  </Text>
                  <Text style={styles.meta}>
                    Range: {formatTemperature(selectedUnit.minTemperatureCelsius)} to {formatTemperature(selectedUnit.maxTemperatureCelsius)}
                  </Text>
                </View>
              ) : null}
              <View style={styles.row}>
                <DateTimeField
                  style={{ flex: 1 }}
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
              </View>

              <View style={styles.entryRow}>
                <View style={styles.entryColumn}>
                  <FloatingLabelInput
                    ref={initialsRef}
                    label="Initials"
                    value={checkedByInitials}
                    onChangeText={setCheckedByInitials}
                    autoCapitalize="characters"
                    returnKeyType="done"
                  />
                </View>
                <View style={styles.entryColumn}>
                  <View style={styles.tempInputRow}>
                      <Pressable
                      style={styles.tempSignButton}
                      onPress={() => {
                        // Toggle the sign of whatever's currently entered. Empty stays empty
                        // (so the next keystroke starts cleanly), "-x" becomes "x", and "x"
                        // becomes "-x". The decimal-pad keyboard has no minus key, so this is
                        // the only way to enter freezer temperatures on Android.
                        const trimmed = temperatureCelsius.trim();
                        if (!trimmed) {
                          setTemperatureCelsius("-");
                          return;
                        }
                        if (trimmed.startsWith("-")) {
                          setTemperatureCelsius(trimmed.slice(1));
                          return;
                        }
                        setTemperatureCelsius(`-${trimmed}`);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Toggle negative temperature"
                    >
                      <Text style={styles.tempSignButtonText}>±</Text>
                    </Pressable>
                    <View style={styles.tempInputField}>
                      <FloatingLabelInput
                        label="Temperature"
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
                        onSubmitEditing={() => initialsRef.current?.focus()}
                      />
                    </View>
                  
                  </View>
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
              ) : null}

              <View style={styles.entryRow}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.noteActionTile}
                  onPress={() => openTextEditor("notes")}
                >
                  <Text style={styles.noteActionLabel}>Notes</Text>
                  <Text style={[styles.noteActionValue, !notes.trim() ? styles.noteActionPlaceholder : null]} numberOfLines={2}>
                    {notes.trim() || "None"}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.noteActionTile}
                  onPress={() => openTextEditor("action")}
                >
                  <Text style={styles.noteActionLabel}>Action Taken</Text>
                  <Text style={[styles.noteActionValue, !actionTaken.trim() ? styles.noteActionPlaceholder : null]} numberOfLines={2}>
                    {actionTaken.trim() || "None"}
                  </Text>
                </Pressable>
              </View>

              <PrimaryButton
                label={recordMutation.isPending ? "Saving..." : "Save Reading"}
                onPress={() => recordMutation.mutate()}
                disabled={recordMutation.isPending || !shopId || !selectedUnit}
              />
              <View style={styles.modalActionRow}>
                <Pressable
                  style={[styles.modalActionButton, styles.modalActionSecondary]}
                  onPress={closeLogEntryModal}
                  disabled={recordMutation.isPending}
                >
                  <Text style={styles.modalActionSecondaryText}>Close</Text>
                </Pressable>
              </View>
              </ScrollView>

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
          </View>
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
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  entryColumn: {
    flex: 1,
    gap: 2,
  },
  tempInputRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: appTheme.spacing.xs,
  },
  tempInputField: {
    flex: 1,
  },
  tempSignButton: {
    width: 44,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  tempSignButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 20,
    lineHeight: 24,
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
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    padding: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
    backgroundColor: appTheme.colors.surfaceNeutralMuted,
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
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: 6,
    marginTop: 2,
  },
  logHeaderCell: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
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



