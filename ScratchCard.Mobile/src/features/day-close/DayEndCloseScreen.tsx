import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { closeBusinessDay, getBusinessDay, listBusinessDays, openBusinessDay, reopenBusinessDay } from "../../api/businessDaysApi";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { getShiftSales, listShifts, openShift, reopenShift } from "../../api/shiftsApi";
import { StatusBadge } from "../../components/StatusBadge";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ShiftStatus } from "../../types/enums";
import { MainStackParamList } from "../../types/navigation";
import { BusinessDay } from "../../types/models";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<MainStackParamList, "DayEndClose">;

function getStatusTone(status?: string): "neutral" | "warning" | "danger" | "success" {
  if (!status) return "neutral";
  if (status === "Closed") return "success";
  if (status === "ReadyToClose") return "warning";
  if (status === "Reopened") return "danger";
  return "neutral";
}

function getShiftTone(status: ShiftStatus): "neutral" | "warning" | "danger" | "success" {
  if (status === ShiftStatus.Open) return "success";
  if (status === ShiftStatus.Reopened) return "warning";
  if (status === ShiftStatus.Closed || status === ShiftStatus.Approved) return "neutral";
  return "neutral";
}

function getDefaultShiftNameForNow(reference = new Date()) {
  const hour = reference.getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Evening";
  return "Night";
}

function formatCurrency(value?: number) {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }
  return `\u00A3 ${value.toFixed(2)}`;
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function DayEndCloseScreen({ route, navigation }: Props) {
  const { businessDayId } = route.params;
  const [actualCash, setActualCash] = useState("0");
  const [notes, setNotes] = useState("");
  const [lottoPayoutAmount, setLottoPayoutAmount] = useState("");
  const [scratchCardPayoutAmount, setScratchCardPayoutAmount] = useState("");
  const [tillPayoutAmount, setTillPayoutAmount] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [targetBusinessDate, setTargetBusinessDate] = useState(formatDateValue(new Date()));
  const [isDayPickerModalVisible, setIsDayPickerModalVisible] = useState(false);
  const [isCloseDayModalVisible, setIsCloseDayModalVisible] = useState(false);
  const [isReopenDayModalVisible, setIsReopenDayModalVisible] = useState(false);
  const [isOpenShiftModalVisible, setIsOpenShiftModalVisible] = useState(false);
  const [newShiftName, setNewShiftName] = useState(getDefaultShiftNameForNow());

  const dayQuery = useQuery({
    queryKey: ["business-day", businessDayId],
    queryFn: () => getBusinessDay(businessDayId),
  });

  useEffect(() => {
    const dayCloseSummary = dayQuery.data?.scratchCardDayCloseSummary;
    if (!dayCloseSummary) {
      setLottoPayoutAmount("");
      setScratchCardPayoutAmount("");
      setTillPayoutAmount("");
      return;
    }

    setLottoPayoutAmount(String(dayCloseSummary.lottoPayout));
    setScratchCardPayoutAmount(String(dayCloseSummary.scratchCardPayout));
    setTillPayoutAmount(String(dayCloseSummary.tillPayout));
  }, [
    dayQuery.data?.scratchCardDayCloseSummary?.lottoPayout,
    dayQuery.data?.scratchCardDayCloseSummary?.scratchCardPayout,
    dayQuery.data?.scratchCardDayCloseSummary?.tillPayout,
  ]);

  const closeMutation = useMutation({
    mutationFn: async () => closeBusinessDay(businessDayId, {
      actualCash: Number(actualCash || "0"),
      lottoPayout: Number(lottoPayoutAmount),
      scratchCardPayout: Number(scratchCardPayoutAmount),
      tillPayout: Number(tillPayoutAmount),
      notes: notes.trim() || undefined,
    }),
    onSuccess: () => {
      setIsCloseDayModalVisible(false);
      setLottoPayoutAmount("");
      setScratchCardPayoutAmount("");
      setTillPayoutAmount("");
      setNotes("");
      Alert.alert("Closed", "Business day closed successfully.");
      void dayQuery.refetch();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to close business day.");
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async () => reopenBusinessDay(businessDayId, { reason: reopenReason || undefined }),
    onSuccess: () => {
      setIsReopenDayModalVisible(false);
      Alert.alert("Reopened", "Business day reopened successfully.");
      void dayQuery.refetch();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to reopen business day.");
    },
  });

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      if (!day?.shopId) {
        throw new Error("Shop context is missing.");
      }
      const normalizedShiftName = newShiftName.trim();
      if (!normalizedShiftName) {
        throw new Error("Shift name is required.");
      }
      const duplicateShift = shiftsQuery.data?.find(
        (shift) => shift.shiftName.trim().toLowerCase() === normalizedShiftName.toLowerCase(),
      );
      if (duplicateShift) {
        throw new Error(`Shift '${normalizedShiftName}' already exists for this business day.`);
      }

      return openShift({
        businessDayId,
        shopId: day.shopId,
        shiftName: normalizedShiftName,
      });
    },
    onSuccess: async () => {
      setIsOpenShiftModalVisible(false);
      setNewShiftName(getDefaultShiftNameForNow());
      Alert.alert("Shift opened", "New shift opened successfully.");
      await shiftsQuery.refetch();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to open shift.");
    },
  });
  const reopenShiftMutation = useMutation({
    mutationFn: async ({ shiftId }: { shiftId: string }) => reopenShift(shiftId, { reason: "Reopened from day management." }),
    onSuccess: async () => {
      Alert.alert("Reopened", "Shift reopened successfully.");
      await shiftsQuery.refetch();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to reopen shift.");
    },
  });

  const day = dayQuery.data;
  const status = day?.status;
  const canClose = status === "Open" || status === "Reopened" || status === "ReadyToClose";
  const canReopen = status === "Closed";
  const canManageShifts = canClose;
  const persistedDayCloseSummary = day?.scratchCardDayCloseSummary;
  const displayLottoPayout =
    persistedDayCloseSummary?.lottoPayout != null
      ? Number(persistedDayCloseSummary.lottoPayout)
      : lottoPayoutAmount.trim().length > 0
        ? Number(lottoPayoutAmount)
        : undefined;
  const displayScratchCardPayout =
    persistedDayCloseSummary?.scratchCardPayout != null
      ? Number(persistedDayCloseSummary.scratchCardPayout)
      : scratchCardPayoutAmount.trim().length > 0
        ? Number(scratchCardPayoutAmount)
        : undefined;
  const displayTillPayout =
    persistedDayCloseSummary?.tillPayout != null
      ? Number(persistedDayCloseSummary.tillPayout)
      : tillPayoutAmount.trim().length > 0
        ? Number(tillPayoutAmount)
        : undefined;

  const shiftsQuery = useQuery({
    queryKey: ["shifts", day?.shopId, businessDayId],
    queryFn: () => listShifts(day?.shopId as string, businessDayId),
    enabled: Boolean(day?.shopId),
  });

  useFocusEffect(
    useCallback(() => {
      void dayQuery.refetch();
      if (day?.shopId) {
        void shiftsQuery.refetch();
      }
    }, [day?.shopId, dayQuery.refetch, shiftsQuery.refetch]),
  );

  const shifts = shiftsQuery.data ?? [];
  const closedSummaryStatuses = new Set<ShiftStatus>([ShiftStatus.Closed, ShiftStatus.Approved]);
  const closedShiftIds = useMemo(
    () => shifts.filter((shift) => closedSummaryStatuses.has(shift.status)).map((shift) => shift.id),
    [shifts],
  );
  const shiftIds = useMemo(() => shifts.map((shift) => shift.id), [shifts]);
  const shiftIdsKey = shiftIds.join(",");
  const shiftSalesTotalsQuery = useQuery({
    queryKey: ["day-shift-sales-totals", businessDayId, shiftIdsKey],
    queryFn: async () => {
      if (shiftIds.length === 0) {
        return {} as Record<string, number>;
      }

      const entries = await Promise.all(
        shifts.map(async (shift) => {
          try {
            const sales = await getShiftSales(shift.id);
            const total = sales.reduce((sum, entry) => sum + Number(entry.salesAmount ?? 0), 0);
            return [shift.id, total] as const;
          } catch {
            return [shift.id, 0] as const;
          }
        }),
      );

      return Object.fromEntries(entries);
    },
    enabled: shiftIds.length > 0,
  });
  const closedShiftIdsKey = closedShiftIds.join(",");
  const closedShiftSalesQuery = useQuery({
    queryKey: ["day-summary-closed-shift-sales", businessDayId, closedShiftIdsKey],
    queryFn: async () => {
      if (closedShiftIds.length === 0) {
        return 0;
      }

      const salesCollections = await Promise.all(
        closedShiftIds.map(async (shiftId) => {
          try {
            return await getShiftSales(shiftId);
          } catch {
            return [];
          }
        }),
      );

      return salesCollections
        .flat()
        .reduce((sum, entry) => sum + Number(entry.salesAmount ?? 0), 0);
    },
    enabled: closedShiftIds.length > 0,
  });
  const lotteryMachinePayout = displayLottoPayout;
  const scratchCardPayout = displayScratchCardPayout;
  const tillPayout = displayTillPayout;
  const summaryTotalSales = closedShiftIds.length === 0 ? 0 : Number(closedShiftSalesQuery.data ?? 0);
  const tillPayoutVariance =
    tillPayout != null && lotteryMachinePayout != null && scratchCardPayout != null
      ? tillPayout - (lotteryMachinePayout + scratchCardPayout)
      : undefined;
  const hasTillPayoutVariance = tillPayoutVariance != null && Math.abs(tillPayoutVariance) >= 0.01;
  const tillPayoutVarianceText =
    tillPayoutVariance != null
      ? `${tillPayoutVariance > 0 ? "+" : "-"}\u00A3 ${Math.abs(tillPayoutVariance).toFixed(2)}`
      : "";
  const tillPayoutVarianceStyle =
    hasTillPayoutVariance
      ? [styles.kpiValue, styles.kpiValueNegative]
      : styles.kpiValue;
  const closableStatuses = new Set<ShiftStatus>([ShiftStatus.Open, ShiftStatus.Reopened]);
  const hasOpenShifts = shifts.some((shift) => closableStatuses.has(shift.status));
  const openShiftCount = shifts.filter((shift) => closableStatuses.has(shift.status)).length;
  const closedShiftCount = shifts.filter((shift) => closedSummaryStatuses.has(shift.status)).length;
  const dayStatusMessage = canClose
    ? hasOpenShifts
      ? "Close all open shifts before closing this business day."
      : "All shifts are closed. You can finish this business day now."
    : canReopen
      ? "This business day is closed. Reopen only if more edits are required."
      : "No day action is available for the current status.";
  const openDayMutation = useMutation({
    mutationFn: async () => {
      if (!day?.shopId) {
        throw new Error("Shop context is missing.");
      }
      return openBusinessDay({ shopId: day.shopId, businessDate: targetBusinessDate });
    },
    onSuccess: (openedDay) => {
      setIsDayPickerModalVisible(false);
      Alert.alert("Opened", `Business day opened (${openedDay.businessDate}).`);
      navigation.replace("DayEndClose", { businessDayId: openedDay.id });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to open business day.");
    },
  });

  const daysQuery = useQuery({
    queryKey: ["business-days-for-picker", day?.shopId],
    queryFn: () => listBusinessDays(day?.shopId as string),
    enabled: Boolean(day?.shopId),
  });

  const availableDays = (daysQuery.data ?? []).slice(0, 30);
  const selectedDateDay = useMemo(
    () => (daysQuery.data ?? []).find((item) => item.businessDate === targetBusinessDate),
    [daysQuery.data, targetBusinessDate],
  );

  const selectDay = (selectedDay: BusinessDay) => {
    setIsDayPickerModalVisible(false);
    if (selectedDay.id === businessDayId) {
      return;
    }
    navigation.replace("DayEndClose", { businessDayId: selectedDay.id });
  };

  const validateCloseDayInputs = () => {
    const values = [
      { label: "Lotto payout", raw: lottoPayoutAmount },
      { label: "Scratch card payout", raw: scratchCardPayoutAmount },
      { label: "Till payout", raw: tillPayoutAmount },
      { label: "Actual cash", raw: actualCash },
    ];

    for (const value of values) {
      if (!value.raw.trim().length) {
        Alert.alert("Validation", `${value.label} is required.`);
        return false;
      }

      if (!Number.isFinite(Number(value.raw))) {
        Alert.alert("Validation", `${value.label} must be a valid number.`);
        return false;
      }
    }

    return true;
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.pageContent}>
        <View style={[ui.card, styles.dayHeaderCard]}>
          <View style={styles.summaryHeaderRow}>
            <View style={styles.summaryHeading}>
              <Text style={styles.summaryEyebrow}>Business Date</Text>
              <Text style={styles.summaryDate}>{day?.businessDate ?? "-"}</Text>
            </View>
            <StatusBadge label={status ?? "-"} tone={getStatusTone(status)} />
          </View>
          {/* <Text style={styles.meta}>{dayStatusMessage}</Text> */}
          <View style={styles.summaryMetaGrid}>
            <View style={styles.summaryMetaItem}>
              <Text style={styles.summaryMetaLabel}>Open Shifts</Text>
              <Text style={styles.summaryMetaValue}>{openShiftCount}</Text>
            </View>
            <View style={styles.summaryMetaItem}>
              <Text style={styles.summaryMetaLabel}>Closed Shifts</Text>
              <Text style={styles.summaryMetaValue}>{closedShiftCount}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={daysQuery.isFetching ? "Refreshing available dates" : "Change business date"}
              style={[styles.dateActionInlineButton, daysQuery.isFetching ? styles.dateActionButtonDisabled : null]}
              onPress={() => {
                setTargetBusinessDate(day?.businessDate ?? formatDateValue(new Date()));
                void daysQuery.refetch();
                setIsDayPickerModalVisible(true);
              }}
              disabled={daysQuery.isFetching}
            >
              <Text style={styles.dateActionInlineButtonText}>
                {daysQuery.isFetching ? "Loading..." : "Change Date"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={[ui.card, styles.sectionCard]}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionTitleBlock}>
              <Text style={styles.sectionTitle}>Shift Operations</Text>
              {/* <Text style={styles.meta}>Manage shifts, review times, and close active shifts.</Text> */}
            </View>
            <View style={styles.shiftHeaderActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open new shift"
                style={[styles.shiftOpenButton, !canManageShifts ? styles.shiftOpenButtonDisabled : null]}
                onPress={() => {
                  setNewShiftName(getDefaultShiftNameForNow());
                  setIsOpenShiftModalVisible(true);
                }}
                disabled={!canManageShifts}
              >
                <Text style={styles.shiftOpenButtonText}>Open Shift</Text>
              </Pressable>
              {/* <Pressable
                accessibilityRole="button"
                accessibilityLabel={shiftsQuery.isFetching ? "Refreshing shifts" : "Refresh shifts"}
                style={[styles.iconButton, (!day?.shopId || shiftsQuery.isFetching) ? styles.iconButtonDisabled : null]}
                onPress={() => void shiftsQuery.refetch()}
                disabled={!day?.shopId || shiftsQuery.isFetching}
              >
                <Text style={styles.iconGlyph}>{shiftsQuery.isFetching ? "*" : "\u21BB"}</Text>
              </Pressable> */}
            </View>
          </View>
          <View style={styles.summaryDivider} />
          {shifts.length === 0 && !shiftsQuery.isFetching ? (
            <Text style={styles.meta}>No shifts found for this day.</Text>
          ) : null}

          {shifts.map((shift) => {
            const canCloseShift = closableStatuses.has(shift.status);
            const shiftSalesTotal = shiftSalesTotalsQuery.data?.[shift.id];
            return (
              <View key={shift.id} style={styles.shiftItem}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${shift.shiftName} shift details`}
                  style={styles.shiftDetailsTapArea}
                  onPress={() => navigation.navigate("ShiftDetails", { shiftId: shift.id, shopId: shift.shopId })}
                >
                  <View style={styles.shiftHeader}>
                    <Text style={styles.shiftName}>{shift.shiftName}</Text>
                    <StatusBadge label={shift.status} tone={getShiftTone(shift.status)} />
                  </View>
                  <DetailLine label="Start" value={new Date(shift.startTime).toLocaleString()} />
                  {shift.endTime ? <DetailLine label="End" value={new Date(shift.endTime).toLocaleString()} /> : null}
                  <DetailLine
                    label="Sales Total"
                    value={shiftSalesTotal != null ? formatCurrency(shiftSalesTotal) : "Loading..."}
                  />
                  <Text style={styles.shiftDetailsHint}>Tap to open shift details</Text>
                </Pressable>
                {canCloseShift ? (
                  <View style={styles.shiftActionRow}>
                    <PrimaryButton
                      label="Close Shift"
                      onPress={() => navigation.navigate("ShiftClose", { shiftId: shift.id, shopId: shift.shopId })}
                      disabled={!canManageShifts}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={[ui.card, styles.sectionCard]}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Financial Summary</Text>
            {hasTillPayoutVariance ? (
              <Text style={[styles.summaryVarianceText, tillPayoutVarianceStyle]}>
                {tillPayoutVarianceText}
              </Text>
            ) : null}
          </View>
          <View style={styles.kpiGrid}>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Total Sales</Text>
              <Text style={styles.kpiValue}>{formatCurrency(summaryTotalSales)}</Text>
            </View>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Lotto Payout</Text>
              <Text style={styles.kpiValue}>{formatCurrency(lotteryMachinePayout)}</Text>
            </View>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Scratch Card Payout</Text>
              <Text style={styles.kpiValue}>{formatCurrency(scratchCardPayout)}</Text>
            </View>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Till Payout</Text>
              <Text style={styles.kpiValue}>{formatCurrency(tillPayout)}</Text>
            </View>
          </View>
        </View>

        <View style={[ui.card, styles.sectionCard]}>
          <Text style={styles.sectionTitle}>Day Action</Text>
          <Text style={styles.meta}>{dayStatusMessage}</Text>
          {canClose ? (
            <PrimaryButton
              label="Close Day"
              onPress={() => setIsCloseDayModalVisible(true)}
              disabled={hasOpenShifts}
            />
          ) : null}
          {canReopen ? (
            <PrimaryButton
              label="Reopen Day"
              tone="neutral"
              onPress={() => setIsReopenDayModalVisible(true)}
            />
          ) : null}
        </View>
        <Modal
          visible={isDayPickerModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsDayPickerModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.sectionTitle}>Select Business Date</Text>
              <Text style={styles.meta}>Pick a date, then open or switch to that day.</Text>
              <Text style={styles.fieldLabel}>Date</Text>
              <DateTimeField mode="date" value={targetBusinessDate} onChange={setTargetBusinessDate} />
              {selectedDateDay ? (
                <>
                  <Text style={styles.meta}>Selected day status</Text>
                  <View style={styles.selectedDayStatusRow}>
                    <Text style={styles.dayPickerDate}>{selectedDateDay.businessDate}</Text>
                    <StatusBadge label={selectedDateDay.status} tone={getStatusTone(selectedDateDay.status)} />
                  </View>
                  <PrimaryButton
                    label={selectedDateDay.id === businessDayId ? "Already Managing This Day" : "Go To Selected Day"}
                    tone="neutral"
                    onPress={() => selectDay(selectedDateDay)}
                    disabled={selectedDateDay.id === businessDayId}
                  />
                </>
              ) : (
                <PrimaryButton
                  label={openDayMutation.isPending ? "Opening..." : "Open Day"}
                  onPress={() => openDayMutation.mutate()}
                  disabled={openDayMutation.isPending || !day?.shopId}
                />
              )}
              <View style={styles.dayPickerList}>
                {availableDays.map((item) => {
                  const isSelected = item.id === businessDayId;
                  return (
                    <Pressable
                      key={item.id}
                      style={[styles.dayPickerItem, isSelected ? styles.dayPickerItemSelected : null]}
                      onPress={() => selectDay(item)}
                    >
                      <Text style={styles.dayPickerDate}>{item.businessDate}</Text>
                      <StatusBadge label={item.status} tone={getStatusTone(item.status)} />
                    </Pressable>
                  );
                })}
                {!daysQuery.isFetching && availableDays.length === 0 ? <Text style={styles.meta}>No business days found.</Text> : null}
              </View>
              <View style={styles.modalActionRow}>
                <Pressable
                  style={[styles.modalActionButton, styles.modalActionNeutral]}
                  onPress={() => setIsDayPickerModalVisible(false)}
                >
                  <Text style={styles.modalActionNeutralText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isOpenShiftModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsOpenShiftModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.sectionTitle}>Open New Shift</Text>
              <Text style={styles.meta}>Default shift name follows time of day.</Text>
              <Text style={styles.fieldLabel}>Shift Name</Text>
              <TextInput
                style={styles.input}
                value={newShiftName}
                onChangeText={setNewShiftName}
                placeholder="Shift name"
                placeholderTextColor={appTheme.colors.textSubtle}
              />
              <View style={styles.modalActionRow}>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonLeft,
                    styles.modalActionPrimary,
                    (openShiftMutation.isPending || !canManageShifts) ? styles.modalActionDisabled : null,
                  ]}
                  onPress={() => openShiftMutation.mutate()}
                  disabled={openShiftMutation.isPending || !canManageShifts}
                >
                  <Text style={styles.modalActionPrimaryText}>{openShiftMutation.isPending ? "Opening..." : "Open Shift"}</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonRight,
                    styles.modalActionNeutral,
                    openShiftMutation.isPending ? styles.modalActionDisabled : null,
                  ]}
                  onPress={() => setIsOpenShiftModalVisible(false)}
                  disabled={openShiftMutation.isPending}
                >
                  <Text style={styles.modalActionNeutralText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isCloseDayModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsCloseDayModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.sectionTitle}>Close Day</Text>
              <Text style={styles.meta}>Enter payouts and final cash, then close this business day.</Text>
              <Text style={styles.fieldLabel}>Lotto Payout</Text>
              <TextInput
                style={styles.input}
                value={lottoPayoutAmount}
                onChangeText={setLottoPayoutAmount}
                placeholder="Lotto payout"
                placeholderTextColor={appTheme.colors.textSubtle}
                keyboardType="decimal-pad"
              />
              <Text style={styles.fieldLabel}>Scratch Card Payout</Text>
              <TextInput
                style={styles.input}
                value={scratchCardPayoutAmount}
                onChangeText={setScratchCardPayoutAmount}
                placeholder="Scratch card payout"
                placeholderTextColor={appTheme.colors.textSubtle}
                keyboardType="decimal-pad"
              />
              <Text style={styles.fieldLabel}>Till Payout</Text>
              <TextInput
                style={styles.input}
                value={tillPayoutAmount}
                onChangeText={setTillPayoutAmount}
                placeholder="Till payout"
                placeholderTextColor={appTheme.colors.textSubtle}
                keyboardType="decimal-pad"
              />
              <Text style={styles.fieldLabel}>Actual Cash</Text>
              <TextInput
                style={styles.input}
                value={actualCash}
                onChangeText={setActualCash}
                placeholder="Actual cash"
                placeholderTextColor={appTheme.colors.textSubtle}
                keyboardType="decimal-pad"
              />
              <Text style={styles.fieldLabel}>Additional Close Notes</Text>
              <TextInput
                style={styles.input}
                value={notes}
                onChangeText={setNotes}
                placeholder="Additional notes (optional)"
                placeholderTextColor={appTheme.colors.textSubtle}
              />
              <View style={styles.modalActionRow}>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonLeft,
                    styles.modalActionPrimary,
                    (closeMutation.isPending || !canClose) ? styles.modalActionDisabled : null,
                  ]}
                  onPress={() => {
                    if (!validateCloseDayInputs()) {
                      return;
                    }
                    closeMutation.mutate();
                  }}
                  disabled={closeMutation.isPending || !canClose}
                >
                  <Text style={styles.modalActionPrimaryText}>{closeMutation.isPending ? "Closing..." : "Close Day"}</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonRight,
                    styles.modalActionNeutral,
                    closeMutation.isPending ? styles.modalActionDisabled : null,
                  ]}
                  onPress={() => setIsCloseDayModalVisible(false)}
                  disabled={closeMutation.isPending}
                >
                  <Text style={styles.modalActionNeutralText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isReopenDayModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsReopenDayModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.sectionTitle}>Reopen Day</Text>
              <Text style={styles.meta}>Provide a reason and reopen this day.</Text>
              <Text style={styles.fieldLabel}>Reopen Reason</Text>
              <TextInput
                style={styles.input}
                value={reopenReason}
                onChangeText={setReopenReason}
                placeholder="Reason (optional)"
                placeholderTextColor={appTheme.colors.textSubtle}
              />
              <View style={styles.modalActionRow}>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonLeft,
                    styles.modalActionPrimary,
                    (reopenMutation.isPending || !canReopen) ? styles.modalActionDisabled : null,
                  ]}
                  onPress={() => reopenMutation.mutate()}
                  disabled={reopenMutation.isPending || !canReopen}
                >
                  <Text style={styles.modalActionPrimaryText}>{reopenMutation.isPending ? "Reopening..." : "Reopen Day"}</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonRight,
                    styles.modalActionNeutral,
                    reopenMutation.isPending ? styles.modalActionDisabled : null,
                  ]}
                  onPress={() => setIsReopenDayModalVisible(false)}
                  disabled={reopenMutation.isPending}
                >
                  <Text style={styles.modalActionNeutralText}>Cancel</Text>
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
  pageContent: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
  },
  dayHeaderCard: {
    gap: appTheme.spacing.sm,
  },
  summaryHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: appTheme.spacing.sm,
  },
  summaryHeading: {
    gap: 2,
    flexShrink: 1,
  },
  summaryEyebrow: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  summaryDate: {
    color: appTheme.colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontFamily: appTheme.fonts.heading,
  },
  summaryMetaGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  summaryMetaItem: {
    flex: 1,
    minWidth: 112,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 2,
  },
  summaryMetaLabel: {
    color: appTheme.colors.textSubtle,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  summaryMetaValue: {
    color: appTheme.colors.text,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: appTheme.fonts.heading,
  },
  dateActionInlineButton: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.primary,
    minHeight: 48,
    paddingHorizontal: appTheme.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  dateActionButtonDisabled: {
    opacity: 0.55,
  },
  dateActionInlineButtonText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  summaryDivider: {
    marginTop: 2,
    borderTopWidth: 0,
    borderTopColor: "transparent",
    paddingTop: appTheme.spacing.xs,
  },
  sectionCard: {
    gap: appTheme.spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: appTheme.spacing.xs,
  },
  sectionTitleBlock: {
    flex: 1,
    gap: 2,
  },
  shiftHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  shiftOpenButton: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#DDF5F1",
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  shiftOpenButtonDisabled: {
    opacity: 0.55,
  },
  shiftOpenButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  summaryVarianceText: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
    backgroundColor: "#FFF1F3",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: appTheme.radius.pill,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  kpiTile: {
    width: "48.8%",
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#F4F8FF",
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: 4,
  },
  kpiLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  kpiValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 16,
    lineHeight: 20,
  },
  kpiValueNegative: {
    color: appTheme.colors.danger,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F2FA",
  },
  iconButtonDisabled: {
    opacity: 0.5,
  },
  iconGlyph: {
    color: appTheme.colors.primary,
    fontSize: 18,
    lineHeight: 18,
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
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 84,
    textAlignVertical: "top",
  },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, lineHeight: 19, fontSize: 13 },
  detailLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 8,
  },
  detailLabel: {
    minWidth: 84,
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  detailValue: {
    flex: 1,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "right",
  },
  reviewSnapshotCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 3,
  },
  reviewSnapshotTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  reviewSummaryCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 3,
    marginTop: appTheme.spacing.xs,
  },
  reviewSummaryTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  reviewHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  shiftItem: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#EEF3FB",
    padding: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
  },
  shiftDetailsTapArea: {
    gap: 8,
  },
  shiftHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: appTheme.spacing.xs,
  },
  shiftName: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 19,
    flexShrink: 1,
  },
  shiftDetailsHint: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 15,
  },
  shiftActionRow: {
    marginTop: 2,
  },
  dayPickerList: {
    maxHeight: 320,
    gap: appTheme.spacing.xs,
  },
  selectedDayStatusRow: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  dayPickerItem: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  dayPickerItemSelected: {
    borderColor: appTheme.colors.primary,
    backgroundColor: "#E9F7F6",
  },
  dayPickerDate: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 28, 0.45)",
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.md,
  },
  modalCard: {
    backgroundColor: appTheme.colors.background,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  modalActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  modalActionButton: {
    flex: 1,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalActionButtonLeft: {
    marginRight: appTheme.spacing.xs,
  },
  modalActionButtonRight: {
    marginLeft: appTheme.spacing.xs,
  },
  modalActionPrimary: {
    backgroundColor: appTheme.colors.primary,
    borderColor: appTheme.colors.primaryPressed,
  },
  modalActionNeutral: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.borderStrong,
  },
  modalActionPrimaryText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  modalActionNeutralText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  modalActionDisabled: {
    opacity: 0.55,
  },
});


