import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { listBusinessDays } from "../../api/businessDaysApi";
import { getConfigurations } from "../../api/configurationsApi";
import { deleteShift, getShift, getShiftSales, listShifts, openShift, startScheduledShift } from "../../api/shiftsApi";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { deriveShopOperationalSetup } from "../settings/shopConfiguration";
import { ShiftStatus } from "../../types/enums";
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

export function OpenShiftScreen({ navigation }: OpenShiftProps) {
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;
  const canDeleteAutoShift = profile?.roles?.some((role) => role === "ShopOwner" || role === "Manager") ?? false;

  const [viewMode, setViewMode] = useState<"open" | "close">("open");
  const [selectedBusinessDayId, setSelectedBusinessDayId] = useState("");
  const [shiftName, setShiftName] = useState("");

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

  useEffect(() => {
    if (viewMode !== "open") {
      return;
    }

    setShiftName((previous) => previous || shopOperationalSetup.shiftDefaultName.trim() || getDefaultShiftNameForNow());
  }, [shopOperationalSetup.shiftDefaultName, viewMode]);

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

      return openShift({
        businessDayId: selectedBusinessDayId,
        shopId,
        shiftName: normalizedShiftName,
      });
    },
    onSuccess: async (shift) => {
      Alert.alert("Shift opened", `Shift '${shift.shiftName}' opened.`);
      await shiftsQuery.refetch();
      setShiftName(shopOperationalSetup.shiftDefaultName.trim() || getDefaultShiftNameForNow());
      setViewMode("close");
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to open shift.");
    },
  });

  const startScheduledShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => startScheduledShift(shiftId),
    onSuccess: async (shift) => {
      Alert.alert("Shift started", `Shift '${shift.shiftName}' is now open.`);
      await shiftsQuery.refetch();
      setViewMode("close");
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to start scheduled shift.");
    },
  });

  const deleteAutoShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => deleteShift(shiftId, { reason: "Removed from shift operations." }),
    onSuccess: async () => {
      Alert.alert("Removed", "Auto-created scheduled shift removed.");
      await shiftsQuery.refetch();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to remove scheduled shift.");
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
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <View style={styles.modeRow}>
            <Pressable
              onPress={() => setViewMode("open")}
              style={[styles.modeChip, viewMode === "open" ? styles.modeChipSelected : null]}
            >
              <Text style={[styles.modeChipText, viewMode === "open" ? styles.modeChipTextSelected : null]}>Open Shift</Text>
            </Pressable>
            <Pressable
              onPress={() => setViewMode("close")}
              style={[styles.modeChip, viewMode === "close" ? styles.modeChipSelected : null]}
            >
              <Text style={[styles.modeChipText, viewMode === "close" ? styles.modeChipTextSelected : null]}>Close Shift</Text>
            </Pressable>
          </View>
        </View>

        {viewMode === "open" ? (
          <View style={ui.card}>
            <Text style={styles.sectionTitle}>Shift Setup for Day</Text>
            <PrimaryButton
              label="Refresh Business Days"
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
                  <Text style={styles.dayTitle}>{day.businessDate}</Text>
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
                    onPress={() => startScheduledShiftMutation.mutate(shift.id)}
                    disabled={startScheduledShiftMutation.isPending || deleteAutoShiftMutation.isPending}
                  >
                    <Text style={styles.smallButtonText}>{startScheduledShiftMutation.isPending ? "Starting..." : "Start"}</Text>
                  </Pressable>
                  {canDeleteAutoShift ? (
                    <Pressable
                      style={[styles.smallButton, styles.smallButtonDanger]}
                      onPress={() => deleteAutoShiftMutation.mutate(shift.id)}
                      disabled={startScheduledShiftMutation.isPending || deleteAutoShiftMutation.isPending}
                    >
                      <Text style={styles.smallButtonText}>{deleteAutoShiftMutation.isPending ? "Removing..." : "Remove"}</Text>
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
              <>
                <Text style={styles.fieldLabel}>Shift Name</Text>
                <TextInput style={styles.input} value={shiftName} onChangeText={setShiftName} placeholder="Shift name" />
              </>
            ) : (
              <View style={styles.item}>
                <Text style={styles.fieldLabel}>Shift Name</Text>
                <Text style={styles.meta}>{shopOperationalSetup.shiftDefaultName}</Text>
              </View>
            )}
            <PrimaryButton
              label={openShiftMutation.isPending ? "Creating..." : "Create Manual Shift"}
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
                label="Refresh Business Days"
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
                    <Text style={styles.dayTitle}>{day.businessDate}</Text>
                    <Text style={styles.meta}>Status: {day.status}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={ui.card}>
              <Text style={styles.sectionTitle}>Open / Reopened Shifts</Text>
              <PrimaryButton
                label="Refresh Shifts"
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
                      onPress={() => navigation.navigate("ShiftClose", { shiftId: shift.id, shopId: shift.shopId })}
                    >
                      <Text style={styles.smallButtonText}>Close Shift</Text>
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
      </ScrollView>
    </ScreenContainer>
  );
}

type ClosableShiftItem = {
  id: string;
  shopId: string;
  businessDayId: string;
  businessDate: string;
  businessDayStatus: string;
  shiftName: string;
  status: string;
  syncStatus?: string;
  startTime: string;
  endTime?: string;
};

export function CloseShiftScreen({ navigation }: CloseShiftProps) {
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;
  const autoOpenedShiftIdRef = useRef<string | null>(null);

  const closeShiftCandidatesQuery = useQuery({
    queryKey: ["close-shift-candidates", shopId],
    queryFn: async () => {
      if (!shopId) {
        return [] as ClosableShiftItem[];
      }

      const businessDays = await listBusinessDays(shopId);
      const selectableDays = businessDays
        .filter((day) => day.status === "Open" || day.status === "Reopened" || day.status === "ReadyToClose")
        .sort((a, b) => new Date(b.businessDate).getTime() - new Date(a.businessDate).getTime());

      const groupedShifts = await Promise.all(
        selectableDays.map(async (day) => {
          const shifts = await listShifts(shopId, day.id);
          return shifts
            .filter((shift) => shift.status === "Open" || shift.status === "Reopened")
            .map((shift) => ({
              id: shift.id,
              shopId: shift.shopId,
              businessDayId: shift.businessDayId,
              businessDate: day.businessDate,
              businessDayStatus: day.status,
              shiftName: shift.shiftName,
              status: shift.status,
              syncStatus: shift.syncStatus,
              startTime: shift.startTime,
              endTime: shift.endTime,
            }));
        }),
      );

      return groupedShifts
        .flat()
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
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
    navigation.navigate("ShiftClose", { shiftId: singleShift.id, shopId: singleShift.shopId });
  }, [candidates, navigation]);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <Text style={styles.hint}>
            Quick path to shift close. If only one open shift exists, it opens automatically.
          </Text>
          <PrimaryButton
            label={closeShiftCandidatesQuery.isFetching ? "Refreshing..." : "Refresh Open Shifts"}
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
                <Text style={styles.meta}>Business Day: {shift.businessDate} ({shift.businessDayStatus})</Text>
                <Text style={styles.meta}>Status: {shift.status}</Text>
                <Text style={styles.meta}>Sync: {shift.syncStatus ?? "-"}</Text>
                <Text style={styles.meta}>Start: {new Date(shift.startTime).toLocaleString()}</Text>
                {shift.endTime ? <Text style={styles.meta}>End: {new Date(shift.endTime).toLocaleString()}</Text> : null}
                <Text style={styles.detailsHint}>Tap to view shift details</Text>
              </Pressable>

              <View style={styles.row}>
                <Pressable
                  style={styles.smallButton}
                  onPress={() => navigation.navigate("ShiftClose", { shiftId: shift.id, shopId: shift.shopId })}
                >
                  <Text style={styles.smallButtonText}>Close Shift</Text>
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
          <PrimaryButton label="Go To Shift Operations" tone="neutral" onPress={() => navigation.navigate("OpenShift")} />
        </View>
      </ScrollView>
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
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shift: {shiftQuery.data?.shiftName ?? shiftId}</Text>
          <Text style={styles.meta}>Status: {shiftQuery.data?.status ?? "-"}</Text>
          <Text style={styles.meta}>Expected Cash: £ {expectedCash.toFixed(2)}</Text>
          <Text style={styles.hint}>
            Reconciliation is calculated here for review. Final server reconciliation is captured during shift close submission.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 28, fontFamily: appTheme.fonts.heading, color: appTheme.colors.text },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontFamily: appTheme.fonts.bodyMedium, color: appTheme.colors.text },
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
    backgroundColor: "#E9F7F6",
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
    color: "#F4FFFE",
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
    backgroundColor: "#E4F3F1",
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
    gap: 4,
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
  smallButtonText: { color: "#FFF", fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 14 },
});

