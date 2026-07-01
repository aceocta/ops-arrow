import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { listBusinessDays } from "../../api/businessDaysApi";
import { getConfigurations } from "../../api/configurationsApi";
import { listPacks } from "../../api/packsApi";
import { deleteShift, getShift, getShiftSales, listShiftCloseCandidates, listShifts, openShift, startScheduledShift } from "../../api/shiftsApi";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { LoadingState } from "../../components/LoadingState";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SegmentedControl } from "../../components/SegmentedControl";
import { toastError, toastSuccess } from "../../components/toast";
import { PrimaryButton } from "../../components/PrimaryButton";
import { deriveShopOperationalSetup } from "../settings/shopConfiguration";
import { formatGbp } from "../../utils/currency";
import { formatDayLabel } from "../../utils/dateLabels";
import { PackStatus, ShiftStatus } from "../../types/enums";
import { ShiftCloseCandidate } from "../../types/models";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type OpenShiftProps = NativeStackScreenProps<MainStackParamList, "OpenShift">;
type CloseShiftProps = NativeStackScreenProps<MainStackParamList, "CloseShift">;
type ReconciliationProps = NativeStackScreenProps<MainStackParamList, "ShiftReconciliation">;

function getDefaultShiftNameForNow(reference = new Date()) {
  const hour = reference.getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Evening";
  return "Night";
}

function comparePacksByDisplayOrder(a: { displayNumber?: number; packNumber: string }, b: { displayNumber?: number; packNumber: string }) {
  const aDisplay = a.displayNumber;
  const bDisplay = b.displayNumber;
  if (aDisplay != null && bDisplay != null && aDisplay !== bDisplay) {
    return aDisplay - bDisplay;
  }
  if (aDisplay != null && bDisplay == null) return -1;
  if (aDisplay == null && bDisplay != null) return 1;
  return a.packNumber.localeCompare(b.packNumber);
}

export function OpenShiftScreen({ navigation }: OpenShiftProps) {
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;
  const canDeleteAutoShift = profile?.roles?.some((role) => role === "CompanyOwner" || role === "Manager") ?? false;

  const [viewMode, setViewMode] = useState<"open" | "close">("open");
  const [selectedBusinessDayId, setSelectedBusinessDayId] = useState("");
  const [shiftName, setShiftName] = useState("");
  const [confirmedOpeningSerialByPackId, setConfirmedOpeningSerialByPackId] = useState<Record<string, boolean>>({});
  const [openingSerialNumberByPackId, setOpeningSerialNumberByPackId] = useState<Record<string, string>>({});

  const dayListQuery = useQuery({
    queryKey: ["business-days", shopId],
    queryFn: () => listBusinessDays(shopId as string),
    enabled: Boolean(shopId),
  });

  const selectableDays = useMemo(
    () =>
      (dayListQuery.data ?? []).filter((day) => day.status === "Open" || day.status === "Reopened" || day.status === "ReadyToClose"),
    [dayListQuery.data],
  );

  useEffect(() => {
    if (!selectedBusinessDayId && selectableDays.length > 0) {
      setSelectedBusinessDayId(selectableDays[0].id);
    }
  }, [selectedBusinessDayId, selectableDays]);

  const shiftsQuery = useQuery({
    queryKey: ["shifts", shopId, selectedBusinessDayId],
    queryFn: () => listShifts(shopId as string, selectedBusinessDayId),
    enabled: Boolean(shopId) && selectedBusinessDayId.length > 0,
  });
  const configurationQuery = useQuery({
    queryKey: ["configurations", shopId],
    queryFn: () => getConfigurations(shopId as string),
    enabled: Boolean(shopId),
  });
  const shopOperationalSetup = useMemo(
    () => deriveShopOperationalSetup(configurationQuery.data),
    [configurationQuery.data],
  );
  const packsQuery = useQuery({
    queryKey: ["packs", shopId],
    queryFn: () => listPacks(shopId as string),
    enabled: Boolean(shopId),
  });
  const activePacksForOpening = useMemo(
    () =>
      (packsQuery.data ?? [])
        .filter((pack) => pack.status === PackStatus.Active)
        .slice()
        .sort(comparePacksByDisplayOrder),
    [packsQuery.data],
  );

  useEffect(() => {
    if (viewMode !== "open") {
      return;
    }

    setShiftName((previous) => previous || shopOperationalSetup.shiftDefaultName.trim() || getDefaultShiftNameForNow());
  }, [shopOperationalSetup.shiftDefaultName, viewMode]);

  useEffect(() => {
    setConfirmedOpeningSerialByPackId((previous) => {
      const next: Record<string, boolean> = {};
      for (const pack of activePacksForOpening) {
        next[pack.id] = previous[pack.id] ?? false;
      }
      return next;
    });
    setOpeningSerialNumberByPackId((previous) => {
      const next: Record<string, string> = {};
      for (const pack of activePacksForOpening) {
        next[pack.id] = previous[pack.id] ?? pack.currentSerialNumber;
      }
      return next;
    });
  }, [activePacksForOpening]);

  function getOpeningSerialForPack(packId: string, fallback: string) {
    return (openingSerialNumberByPackId[packId] ?? fallback).trim();
  }

  function getUnconfirmedOpeningSerialPacks() {
    return activePacksForOpening.filter((pack) => {
      const enteredSerial = getOpeningSerialForPack(pack.id, pack.currentSerialNumber);
      return !confirmedOpeningSerialByPackId[pack.id] || enteredSerial.length === 0;
    });
  }

  const hasUnconfirmedOpeningSerials = activePacksForOpening.some((pack) => {
    const enteredSerial = getOpeningSerialForPack(pack.id, pack.currentSerialNumber);
    return !confirmedOpeningSerialByPackId[pack.id] || enteredSerial.length === 0;
  });
  const confirmedOpeningSerialCount = activePacksForOpening.reduce((count, pack) => {
    const enteredSerial = getOpeningSerialForPack(pack.id, pack.currentSerialNumber);
    return confirmedOpeningSerialByPackId[pack.id] && enteredSerial.length > 0 ? count + 1 : count;
  }, 0);

  function confirmAllOpeningSerials() {
    setConfirmedOpeningSerialByPackId(() => {
      const next: Record<string, boolean> = {};
      for (const pack of activePacksForOpening) {
        next[pack.id] = getOpeningSerialForPack(pack.id, pack.currentSerialNumber).length > 0;
      }
      return next;
    });
  }

  function getExistingOpenShiftNames() {
    return (shiftsQuery.data ?? [])
      .filter((shift) => shift.status === "Open" || shift.status === "Reopened")
      .map((shift) => shift.shiftName)
      .filter((name, index, all) => all.findIndex((value) => value.toLowerCase() === name.toLowerCase()) === index);
  }

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) {
        throw new Error("No shop selected.");
      }
      if (!selectedBusinessDayId) {
        throw new Error("Select a business day first.");
      }
      const defaultShiftName = shopOperationalSetup.shiftDefaultName.trim() || getDefaultShiftNameForNow();
      const normalizedShiftName = shopOperationalSetup.allowCustomShiftName
        ? (shiftName.trim() || defaultShiftName)
        : defaultShiftName;
      const duplicateShift = shopOperationalSetup.allowCustomShiftName
        ? shiftsQuery.data?.find(
            (shift) => shift.shiftName.trim().toLowerCase() === normalizedShiftName.toLowerCase(),
          )
        : undefined;
      if (duplicateShift) {
        throw new Error(`Shift '${normalizedShiftName}' already exists for the selected business day.`);
      }

      const existingOpenShiftNames = getExistingOpenShiftNames();
      if (existingOpenShiftNames.length > 0) {
        throw new Error(`Close existing open shift(s) first: ${existingOpenShiftNames.join(", ")}.`);
      }

      const unconfirmedPacks = getUnconfirmedOpeningSerialPacks();
      if (unconfirmedPacks.length > 0) {
        throw new Error("Confirm starting serial numbers for all active packs before opening a shift.");
      }

      return openShift({
        businessDayId: selectedBusinessDayId,
        shopId,
        shiftName: normalizedShiftName,
        openingSerialConfirmations: activePacksForOpening.map((pack) => ({
          packId: pack.id,
          openingSerialNumber: getOpeningSerialForPack(pack.id, pack.currentSerialNumber),
        })),
      });
    },
    onSuccess: async (shift) => {
      toastSuccess(`Shift '${shift.shiftName}' opened.`);
      await shiftsQuery.refetch();
      setShiftName(shopOperationalSetup.shiftDefaultName.trim() || getDefaultShiftNameForNow());
      setViewMode("close");
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message ?? error?.message ?? "Unable to open shift.");
    },
  });

  const startScheduledShiftMutation = useMutation({
    mutationFn: async (payload: { shiftId: string; openingSerialConfirmations: Array<{ packId: string; openingSerialNumber: string }> }) =>
      startScheduledShift(payload.shiftId, { openingSerialConfirmations: payload.openingSerialConfirmations }),
    onSuccess: async (shift) => {
      toastSuccess(`Shift '${shift.shiftName}' is now open.`);
      await shiftsQuery.refetch();
      setViewMode("close");
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message ?? error?.message ?? "Unable to start scheduled shift.");
    },
  });

  const deleteAutoShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => deleteShift(shiftId, { reason: "Removed from shift operations." }),
    onSuccess: async () => {
      toastSuccess("Auto-created scheduled shift removed.");
      await shiftsQuery.refetch();
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message ?? error?.message ?? "Unable to remove scheduled shift.");
    },
  });

  const closableShifts = useMemo(
    () => (shiftsQuery.data ?? []).filter((shift) => shift.status === "Open" || shift.status === "Reopened"),
    [shiftsQuery.data],
  );
  const scheduledShifts = useMemo(
    () => (shiftsQuery.data ?? []).filter((shift) => shift.status === ShiftStatus.Scheduled),
    [shiftsQuery.data],
  );
  const closedShifts = useMemo(
    () => (shiftsQuery.data ?? []).filter((shift) => shift.status !== "Open" && shift.status !== "Reopened" && shift.status !== ShiftStatus.Scheduled),
    [shiftsQuery.data],
  );

  return (
    <ScreenContainer>
      <View style={styles.screenContent}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <SegmentedControl
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "open", label: "Open shift" },
              { value: "close", label: "Close shift" },
            ]}
          />
        </View>

        {viewMode === "open" ? (
          <View style={ui.card}>
            <Text style={styles.sectionTitle}>Shift Setup for Day</Text>
            <PrimaryButton
              label="Refresh business days"
              tone="neutral"
              onPress={() => void dayListQuery.refetch()}
              disabled={!shopId || dayListQuery.isFetching}
            />

            {selectableDays.map((day) => {
              const selected = day.id === selectedBusinessDayId;
              return (
                <Pressable
                  key={day.id}
                  onPress={() => setSelectedBusinessDayId(day.id)}
                  style={[styles.dayRow, selected ? styles.dayRowSelected : null]}
                >
                  <Text style={styles.dayTitle}>{formatDayLabel(day.businessDate)}</Text>
                  <Text style={styles.meta}>Status: {day.status}</Text>
                </Pressable>
              );
            })}

            {selectableDays.length === 0 && !dayListQuery.isFetching ? (
              <Text style={styles.meta}>No open business day found. Open a business day first.</Text>
            ) : null}

            <Text style={styles.meta}>
              Configured templates: {shopOperationalSetup.shiftTemplates.map((x) => `${x.name} (${x.startTime}-${x.endTime})`).join(", ")}
              {shopOperationalSetup.enforceShiftTimeWindow ? " (enforced)." : " (advisory)."}
            </Text>

            <Text style={styles.sectionTitle}>Scheduled Shifts</Text>
            <View style={styles.item}>
              <View style={styles.serialConfirmHeaderRow}>
                <View style={styles.serialConfirmHeaderTextWrap}>
                  <Text style={styles.sectionTitle}>Confirm Scratch Card Starting Serials</Text>
                  {/* <Text style={styles.meta}>Confirm each active pack before opening the shift.</Text> */}
                </View>
                {activePacksForOpening.length > 0 ? (
                <View style={styles.serialConfirmActionRow}>
                  <Pressable
                    style={[
                      styles.choiceChip,
                      !hasUnconfirmedOpeningSerials ? styles.choiceChipSelected : null,
                      !hasUnconfirmedOpeningSerials ? styles.choiceChipDisabled : null,
                    ]}
                    onPress={confirmAllOpeningSerials}
                    disabled={!hasUnconfirmedOpeningSerials}
                  >
                    <Text style={[styles.choiceChipText, !hasUnconfirmedOpeningSerials ? styles.choiceChipTextSelected : null]}>
                      {hasUnconfirmedOpeningSerials ? "Confirm All" : "All Confirmed"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              </View>
             
              {packsQuery.isFetching ? <LoadingState message="Loading active packs…" inline /> : null}
              {!packsQuery.isFetching && activePacksForOpening.length === 0 ? (
                <Text style={styles.meta}>No active packs found for this shop.</Text>
              ) : null}
              {activePacksForOpening.map((pack) => {
                const isConfirmed = Boolean(confirmedOpeningSerialByPackId[pack.id]);
                const enteredOpeningSerial = openingSerialNumberByPackId[pack.id] ?? pack.currentSerialNumber;
                const hasSerialValue = enteredOpeningSerial.trim().length > 0;
                return (
                  <View key={pack.id} style={styles.serialConfirmRow}>
                    <View style={styles.serialPackLabelWrap}>
                      <Text style={styles.serialPackNum} numberOfLines={1}>
                        {pack.displayNumber != null ? `#${pack.displayNumber}` : pack.packNumber}
                      </Text>
                      {pack.displayNumber != null ? (
                        <Text style={styles.serialPackSub} numberOfLines={1}>{pack.packNumber}</Text>
                      ) : null}
                    </View>

                    <View style={styles.vDivider} />

                    <TextInput
                      style={[styles.input, styles.serialConfirmInput]}
                      value={enteredOpeningSerial}
                      placeholder="Open serial"
                      placeholderTextColor={appTheme.colors.textSubtle}
                      keyboardType="numeric"
                      onChangeText={(value) => {
                        setOpeningSerialNumberByPackId((previous) => ({
                          ...previous,
                          [pack.id]: value,
                        }));
                        setConfirmedOpeningSerialByPackId((previous) => ({
                          ...previous,
                          [pack.id]: false,
                        }));
                      }}
                    />

                    <Pressable
                      style={[
                        styles.choiceChip,
                        styles.serialConfirmChip,
                        isConfirmed ? styles.choiceChipSelected : null,
                        !hasSerialValue ? styles.choiceChipDisabled : null,
                      ]}
                      disabled={!hasSerialValue}
                      onPress={() =>
                        setConfirmedOpeningSerialByPackId((previous) => ({
                          ...previous,
                          [pack.id]: !isConfirmed,
                        }))
                      }
                    >
                      <Text style={[styles.choiceChipText, isConfirmed ? styles.choiceChipTextSelected : null]}>
                        {isConfirmed ? "Confirmed" : "Confirm"}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
            {scheduledShifts.length === 0 && !shiftsQuery.isFetching ? (
              <Text style={styles.meta}>No scheduled shifts available for the selected business day.</Text>
            ) : null}
            {scheduledShifts.map((shift) => (
              <View key={shift.id} style={styles.item}>
                <Text style={styles.itemTitle}>{shift.shiftName}</Text>
                <Text style={styles.meta}>Status: {shift.status}</Text>
                <Text style={styles.meta}>Planned Start: {new Date(shift.startTime).toLocaleString()}</Text>
                {shift.endTime ? <Text style={styles.meta}>Planned End: {new Date(shift.endTime).toLocaleString()}</Text> : null}
                <View style={styles.row}>
                  <Pressable
                    style={styles.smallButton}
                    onPress={() => {
                      const existingOpenShiftNames = getExistingOpenShiftNames();
                      if (existingOpenShiftNames.length > 0) {
                        Alert.alert(
                          "Close open shifts first",
                          `Close existing open shift(s) first: ${existingOpenShiftNames.join(", ")}.`,
                        );
                        return;
                      }

                      const unconfirmedPacks = getUnconfirmedOpeningSerialPacks();
                      if (unconfirmedPacks.length > 0) {
                        Alert.alert("Confirmation required", "Confirm starting serial numbers for all active packs first.");
                        return;
                      }
                      startScheduledShiftMutation.mutate({
                        shiftId: shift.id,
                        openingSerialConfirmations: activePacksForOpening.map((pack) => ({
                          packId: pack.id,
                          openingSerialNumber: getOpeningSerialForPack(pack.id, pack.currentSerialNumber),
                        })),
                      });
                    }}
                    disabled={startScheduledShiftMutation.isPending || deleteAutoShiftMutation.isPending}
                  >
                    <Text style={styles.smallButtonText}>{startScheduledShiftMutation.isPending ? "Starting…" : "Start"}</Text>
                  </Pressable>
                  {canDeleteAutoShift ? (
                    <Pressable
                      style={[styles.smallButton, styles.smallButtonDanger]}
                      onPress={() =>
                        Alert.alert(
                          "Remove scheduled shift?",
                          "This removes the scheduled shift. This can't be undone.",
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Remove", style: "destructive", onPress: () => deleteAutoShiftMutation.mutate(shift.id) },
                          ],
                        )
                      }
                      disabled={startScheduledShiftMutation.isPending || deleteAutoShiftMutation.isPending}
                    >
                      <Text style={styles.smallButtonText}>{deleteAutoShiftMutation.isPending ? "Removing…" : "Remove"}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}

            <View style={styles.item}>
              <Text style={styles.sectionTitle}>Manual Exception Shift</Text>
              <Text style={styles.meta}>
                Use this only for exceptions. Anyone with shift access can create a manual shift.
              </Text>
            {shopOperationalSetup.allowCustomShiftName ? (
              <FloatingLabelInput
                label="Shift name"
                value={shiftName}
                onChangeText={setShiftName}
                autoCapitalize="words"
                returnKeyType="done"
              />
            ) : (
              <View style={styles.item}>
                <Text style={styles.fieldLabel}>Shift Name</Text>
                <Text style={styles.meta}>{shopOperationalSetup.shiftDefaultName}</Text>
              </View>
            )}
            <PrimaryButton
              label={openShiftMutation.isPending ? "Creating…" : "Create manual shift"}
              onPress={() => openShiftMutation.mutate()}
              disabled={openShiftMutation.isPending || !shopId || !selectedBusinessDayId}
            />
            </View>
          </View>
        ) : null}

        {viewMode === "close" ? (
          <>
            <View style={ui.card}>
              <Text style={styles.sectionTitle}>Select Business Day</Text>
              <PrimaryButton
                label="Refresh business days"
                tone="neutral"
                onPress={() => void dayListQuery.refetch()}
                disabled={!shopId || dayListQuery.isFetching}
              />
              {selectableDays.map((day) => {
                const selected = day.id === selectedBusinessDayId;
                return (
                  <Pressable
                    key={day.id}
                    onPress={() => setSelectedBusinessDayId(day.id)}
                    style={[styles.dayRow, selected ? styles.dayRowSelected : null]}
                  >
                    <Text style={styles.dayTitle}>{formatDayLabel(day.businessDate)}</Text>
                    <Text style={styles.meta}>Status: {day.status}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={ui.card}>
              <Text style={styles.sectionTitle}>Open / Reopened Shifts</Text>
              <PrimaryButton
                label="Refresh shifts"
                tone="neutral"
                onPress={() => void shiftsQuery.refetch()}
                disabled={!selectedBusinessDayId || shiftsQuery.isFetching}
              />

              {closableShifts.length === 0 && !shiftsQuery.isFetching ? (
                <Text style={styles.meta}>No open shifts available to close for the selected day.</Text>
              ) : null}

              {closableShifts.map((shift) => (
                <View key={shift.id} style={styles.item}>
                  {shift.closeAttachments?.length ? (
                    <Text style={styles.meta}>Attachments: {shift.closeAttachments.length}</Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${shift.shiftName} shift details`}
                    style={styles.shiftDetailsTapArea}
                    onPress={() => navigation.navigate("ShiftDetails", { shiftId: shift.id, shopId: shift.shopId })}
                  >
                    <Text style={styles.itemTitle}>{shift.shiftName}</Text>
                    <Text style={styles.meta}>Status: {shift.status}</Text>
                    <Text style={styles.meta}>Sync: {shift.syncStatus ?? "-"}</Text>
                    <Text style={styles.meta}>Start: {new Date(shift.startTime).toLocaleString()}</Text>
                    {shift.endTime ? <Text style={styles.meta}>End: {new Date(shift.endTime).toLocaleString()}</Text> : null}
                    <Text style={styles.detailsHint}>Tap to view shift details</Text>
                  </Pressable>
                  <View style={styles.row}>
                    <Pressable
                      style={styles.smallButton}
                      onPress={() => navigation.navigate("EnterClosingNumbers", { shiftId: shift.id, shopId: shift.shopId, shiftName: shift.shiftName })}
                    >
                      <Text style={styles.smallButtonText}>Closing numbers</Text>
                    </Pressable>
                    <Pressable
                      style={styles.smallButton}
                      onPress={() => navigation.navigate("ShiftDetails", { shiftId: shift.id, shopId: shift.shopId })}
                    >
                      <Text style={styles.smallButtonText}>Close shift</Text>
                    </Pressable>
                    <Pressable style={styles.smallButton} onPress={() => navigation.navigate("ShiftReconciliation", { shiftId: shift.id })}>
                      <Text style={styles.smallButtonText}>Reconciliation</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>

            <View style={ui.card}>
              <Text style={styles.sectionTitle}>Closed Shifts</Text>
              {closedShifts.length === 0 && !shiftsQuery.isFetching ? (
                <Text style={styles.meta}>No closed shifts found for the selected day.</Text>
              ) : null}
              {closedShifts.map((shift) => (
                <View key={shift.id} style={styles.item}>
                  {shift.closeAttachments?.length ? (
                    <Text style={styles.meta}>Attachments: {shift.closeAttachments.length}</Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${shift.shiftName} shift details`}
                    style={styles.shiftDetailsTapArea}
                    onPress={() => navigation.navigate("ShiftDetails", { shiftId: shift.id, shopId: shift.shopId })}
                  >
                    <Text style={styles.itemTitle}>{shift.shiftName}</Text>
                    <Text style={styles.meta}>Status: {shift.status}</Text>
                    <Text style={styles.meta}>Start: {new Date(shift.startTime).toLocaleString()}</Text>
                    {shift.endTime ? <Text style={styles.meta}>End: {new Date(shift.endTime).toLocaleString()}</Text> : null}
                    <Text style={styles.detailsHint}>Tap to view shift details</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

export function CloseShiftScreen({ navigation }: CloseShiftProps) {
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;
  const autoOpenedShiftIdRef = useRef<string | null>(null);

  const closeShiftCandidatesQuery = useQuery({
    queryKey: ["close-shift-candidates", shopId],
    queryFn: async () => {
      if (!shopId) {
        return [] as ShiftCloseCandidate[];
      }

      return listShiftCloseCandidates(shopId);
    },
    enabled: Boolean(shopId),
  });

  const candidates = closeShiftCandidatesQuery.data ?? [];

  useEffect(() => {
    if (candidates.length !== 1) {
      return;
    }

    const singleShift = candidates[0];
    if (autoOpenedShiftIdRef.current === singleShift.id) {
      return;
    }

    autoOpenedShiftIdRef.current = singleShift.id;
    navigation.navigate("ShiftDetails", { shiftId: singleShift.id, shopId: singleShift.shopId });
  }, [candidates, navigation]);

  return (
    <ScreenContainer>
      <View style={styles.screenContent}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <Text style={styles.hint}>
            Quick path to shift close. If only one open shift exists, it opens automatically.
          </Text>
          <PrimaryButton
            label={closeShiftCandidatesQuery.isFetching ? "Refreshing…" : "Refresh open shifts"}
            tone="neutral"
            onPress={() => void closeShiftCandidatesQuery.refetch()}
            disabled={!shopId || closeShiftCandidatesQuery.isFetching}
          />
        </View>

        <View style={ui.card}>
          <Text style={styles.sectionTitle}>Open / Reopened Shifts</Text>
          {shopId && !closeShiftCandidatesQuery.isFetching && candidates.length === 0 ? (
            <Text style={styles.meta}>No open shifts available to close right now.</Text>
          ) : null}

          {candidates.map((shift) => (
            <View key={shift.id} style={styles.item}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${shift.shiftName} shift details`}
                style={styles.shiftDetailsTapArea}
                onPress={() => navigation.navigate("ShiftDetails", { shiftId: shift.id, shopId: shift.shopId })}
              >
                <Text style={styles.itemTitle}>{shift.shiftName}</Text>
                <Text style={styles.meta}>Business Day: {formatDayLabel(shift.businessDate)} ({shift.businessDayStatus})</Text>
                <Text style={styles.meta}>Status: {shift.status}</Text>
                <Text style={styles.meta}>Sync: {shift.syncStatus ?? "-"}</Text>
                <Text style={styles.meta}>Start: {new Date(shift.startTime).toLocaleString()}</Text>
                {shift.endTime ? <Text style={styles.meta}>End: {new Date(shift.endTime).toLocaleString()}</Text> : null}
                <Text style={styles.detailsHint}>Tap to view shift details</Text>
              </Pressable>

              <View style={styles.row}>
                <Pressable
                  style={styles.smallButton}
                  onPress={() => navigation.navigate("ShiftDetails", { shiftId: shift.id, shopId: shift.shopId })}
                >
                  <Text style={styles.smallButtonText}>Close shift</Text>
                </Pressable>
                <Pressable style={styles.smallButton} onPress={() => navigation.navigate("ShiftReconciliation", { shiftId: shift.id })}>
                  <Text style={styles.smallButtonText}>Reconciliation</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <View style={ui.card}>
          <Text style={styles.sectionTitle}>Need to open a shift first?</Text>
          <PrimaryButton label="Go to shift operations" tone="neutral" onPress={() => navigation.navigate("OpenShift")} />
        </View>
      </View>
    </ScreenContainer>
  );
}

export function ShiftReconciliationScreen({ route }: ReconciliationProps) {
  const { shiftId } = route.params;
  const shiftQuery = useQuery({
    queryKey: ["shift", shiftId],
    queryFn: () => getShift(shiftId),
  });

  const salesQuery = useQuery({
    queryKey: ["shift-sales", shiftId],
    queryFn: () => getShiftSales(shiftId),
  });

  const totals = useMemo(() => {
    const rows = (salesQuery.data as any[] | undefined) ?? [];
    const totalSales = rows.reduce((acc, row) => acc + Number(row.salesAmount ?? 0), 0);
    return { totalSales };
  }, [salesQuery.data]);

  const expectedCash = totals.totalSales;

  return (
    <ScreenContainer>
      <View style={styles.screenContent}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shift: {shiftQuery.data?.shiftName ?? shiftId}</Text>
          <Text style={styles.meta}>Status: {shiftQuery.data?.status ?? "-"}</Text>
          <Text style={styles.meta}>Expected Cash: {formatGbp(expectedCash)}</Text>
          <Text style={styles.hint}>
            Reconciliation is calculated here for review. Final server reconciliation is captured during shift close submission.
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: 12,
  },
  title: { fontSize: 24, lineHeight: 28, fontFamily: appTheme.fonts.heading, color: appTheme.colors.text },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontFamily: appTheme.fonts.bodyMedium, color: appTheme.colors.text },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    color: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
  },
  modeRow: { flexDirection: "row", gap: 8 },
  modeChip: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  modeChipSelected: {
    backgroundColor: appTheme.colors.primary,
  },
  modeChipText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  modeChipTextSelected: {
    color: appTheme.colors.textOnDark,
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  choiceChipSelected: {
    backgroundColor: appTheme.colors.primary,
  },
  choiceChipDisabled: {
    opacity: 0.72,
  },
  choiceChipText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 17,
  },
  choiceChipTextSelected: {
    color: appTheme.colors.textOnDark,
  },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, lineHeight: 18, fontSize: 13 },
  hint: { color: appTheme.colors.textSubtle, fontSize: 12, lineHeight: 16, fontFamily: appTheme.fonts.body },
  dayRow: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  dayRowSelected: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surfaceSuccessMuted,
  },
  dayTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  item: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: 10,
    gap: 8,
  },
  itemTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  shiftDetailsTapArea: {
    gap: 2,
  },
  detailsHint: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  serialConfirmHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  serialConfirmHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  serialProgressPill: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  serialProgressText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
  },
  serialConfirmRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
  },
  serialPackLabelWrap: {
    gap: 1,
    width: 78,
    flexShrink: 0,
  },
  serialPackTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  serialPackNum: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 18,
    lineHeight: 21,
  },
  serialPackSub: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 16,
  },
  // Thin vertical rule between the display/pack label and the serial input (matches closing screen).
  vDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: appTheme.colors.border,
  },
  serialConfirmActionRow: {
    flexDirection: "row",
  },
  serialConfirmInputRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  serialConfirmInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    paddingVertical: 4,
    textAlign: "center",
    fontSize: 19,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  serialConfirmChip: {
    marginLeft: "auto",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  smallButton: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallButtonDanger: {
    backgroundColor: appTheme.colors.danger,
  },
  smallButtonText: { color: appTheme.colors.onPrimary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 14 },
});





