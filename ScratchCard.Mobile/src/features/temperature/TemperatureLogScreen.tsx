import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getTemperatureDailyLog,
  listTemperatureUnits,
  recordTemperatureReading,
} from "../../api/temperatureLogsApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue, formatTimeValue } from "../../components/DateTimeField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function formatTemperature(value: number) {
  return `${value.toFixed(1)} C`;
}

function readingStatusTone(isOutOfRange: boolean): "success" | "danger" {
  return isOutOfRange ? "danger" : "success";
}

function isOutOfRangeTemperature(temperature: number, min: number, max: number) {
  return temperature < min || temperature > max;
}

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

export function TemperatureLogScreen() {
  const queryClient = useQueryClient();
  const { activeShopId, profile } = useAuth();
  const shopId = activeShopId;
  const [selectedDate, setSelectedDate] = useState(formatDateValue(new Date()));
  const [entryDate, setEntryDate] = useState(formatDateValue(new Date()));
  const [readingTime, setReadingTime] = useState(formatTimeValue(new Date()));
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [temperatureCelsius, setTemperatureCelsius] = useState("");
  const [checkedByInitials, setCheckedByInitials] = useState("");
  const [notes, setNotes] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [textEditorField, setTextEditorField] = useState<"notes" | "action" | null>(null);
  const [textEditorValue, setTextEditorValue] = useState("");
  const [isLogEntryModalVisible, setIsLogEntryModalVisible] = useState(false);

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
      Alert.alert("Saved", "Temperature reading recorded.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["temperature-daily-log", shopId, entryDate] }),
      ]);
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to save reading.");
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
    setIsLogEntryModalVisible(false);
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.screenContent}>
        {/* <View style={styles.heroCard}>
          <Text style={styles.heroSubtitle}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <Text style={styles.heroNote}>Digitize daily checks with quick entry, alerts, and supervisor signoff.</Text>
        </View> */}

        <View style={[ui.card, styles.quickEntryCard]}>
          <View style={styles.quickEntryHeader}>
            <Text style={styles.sectionTitle}>Temperature Log</Text>
            {summary.outOfRange > 0 ? (
              <StatusBadge label={`${summary.outOfRange} out of range`} tone="danger" />
            ) : (
              <StatusBadge label="In range" tone="success" />
            )}
          </View>
          <View style={styles.row}>
            <DateTimeField style={{ flex: 1 }} mode="date" value={selectedDate} onChange={setSelectedDate} />
            <DateTimeField style={{ flex: 1 }} mode="time" value={readingTime} onChange={setReadingTime} />
          </View>

         

          <Text style={styles.fieldLabel}>Monitoring Units</Text>
          {dailyLogQuery.isLoading ? <Text style={styles.meta}>Loading units...</Text> : null}
          <View style={styles.unitList}>
            {dailyUnitLogs.map((unitLog) => {
              const unit = unitLog.unit;
              const latestReading =
                unitLog.readings.length > 0
                  ? unitLog.readings[unitLog.readings.length - 1]
                  : undefined;

              return (
                <Pressable
                  key={unit.id}
                  style={styles.unitRow}
                  onPress={() => openLogEntryModal(unit.id)}
                  accessibilityRole="button"
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
                      <Text style={styles.unitRowPending}>Pending</Text>
                    )}
                  </View>
                  <View style={styles.unitRowBottom}>
                    <Text style={styles.unitRowRange}>
                      Range: {formatTemperature(unit.minTemperatureCelsius)} to {formatTemperature(unit.maxTemperatureCelsius)}
                    </Text>
                    <Text style={styles.unitRowLast}>
                      {latestReading
                        ? `Last: ${latestReading.readingTime} | ${formatTemperature(Number(latestReading.temperatureCelsius))}`
                        : "Last: No reading"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            {!dailyLogQuery.isLoading && dailyUnitLogs.length === 0 ? (
              <Text style={styles.meta}>No active units available.</Text>
            ) : null}
          </View>
        </View>

        <View style={[ui.card, styles.readingsCard]}>
          <Text style={styles.sectionTitle}>Readings · {selectedDate}</Text>
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
                unitLog.readings.map((reading) => (
                  <View key={reading.id} style={styles.logRowBlock}>
                    <View style={styles.logRow}>
                      <Text style={[styles.logCell, styles.logColTime]}>{reading.readingTime || "--:--"}</Text>
                      <Text style={[styles.logCellStrong, styles.logColTemp]}>
                        {formatTemperature(Number(reading.temperatureCelsius))}
                      </Text>
                      <Text
                        style={[
                          styles.logCell,
                          styles.logColStatus,
                          reading.isOutOfRange ? styles.logStatusOutOfRange : styles.logStatusInRange,
                        ]}
                      >
                        {reading.isOutOfRange ? "Out of range " : "In range"}
                      </Text>
                      <Text style={[styles.logCell, styles.logColBy]}>{reading.checkedByInitials || "-"}</Text>
                    </View>
                    {reading.actionTaken ? <Text style={styles.logDetail}>Action: {reading.actionTaken}</Text> : null}
                    {reading.notes ? <Text style={styles.logDetail}>Notes: {reading.notes}</Text> : null}
                  </View>
                ))
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
                <DateTimeField style={{ flex: 1 }} mode="date" value={entryDate} onChange={setEntryDate} />
                <DateTimeField style={{ flex: 1 }} mode="time" value={readingTime} onChange={setReadingTime} />
              </View>

              <View style={styles.entryRow}>

                   <View style={styles.entryColumn}>
                  <Text style={styles.fieldLabel}>Initials</Text>
                  <TextInput
                    style={styles.input}
                    value={checkedByInitials}
                    onChangeText={setCheckedByInitials}
                    placeholder="Initials"
                    placeholderTextColor={appTheme.colors.textSubtle}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.entryColumn}>
                  <Text style={styles.fieldLabel}>Temperature (C)</Text>
                  <TextInput
                    style={styles.input}
                    value={temperatureCelsius}
                    onChangeText={setTemperatureCelsius}
                    placeholder="Temperature"
                    placeholderTextColor={appTheme.colors.textSubtle}
                    keyboardType="decimal-pad"
                  />
                </View>
             
              </View>

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
            </View>
          </View>
        </Modal>

        <Modal
          visible={textEditorField !== null}
          transparent
          animationType="fade"
          onRequestClose={closeTextEditor}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
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
        </Modal>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
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
  unitRowBottom: {
    gap: 2,
  },
  unitRowRange: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  unitRowLast: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
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



