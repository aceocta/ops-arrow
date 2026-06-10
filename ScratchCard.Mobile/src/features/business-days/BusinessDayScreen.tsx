import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { listBusinessDays, openBusinessDay } from "../../api/businessDaysApi";
import { BusinessDayStaffCard } from "../rota/BusinessDayStaffCard";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { ScreenContainer } from "../../components/ScreenContainer";
import { toastError } from "../../components/toast";
import { PrimaryButton } from "../../components/PrimaryButton";
import { StatusBadge } from "../../components/StatusBadge";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { haptics } from "../../utils/haptics";

function getStatusTone(status?: string): "neutral" | "warning" | "danger" | "success" {
  if (!status) return "neutral";
  if (status === "Closed") return "success";
  if (status === "ReadyToClose") return "warning";
  if (status === "Reopened") return "danger";
  return "neutral";
}

function isActiveStatus(status?: string) {
  const s = (status ?? "").toLowerCase();
  return s === "open" || s === "reopened" || s === "readytoclose";
}


export function BusinessDayScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;
  const [viewMode, setViewMode] = useState<"open" | "manage">("open");
  const [businessDate, setBusinessDate] = useState(formatDateValue(new Date()));

  const dayListQuery = useQuery({
    queryKey: ["business-days", shopId],
    queryFn: () => listBusinessDays(shopId as string),
    enabled: Boolean(shopId),
  });

  // After closing/opening a day from a child screen and navigating back, the list otherwise
  // shows stale status badges until pull-to-refresh. Refetch on focus to keep the screen honest.
  useFocusEffect(
    useCallback(() => {
      if (shopId) void dayListQuery.refetch();
    }, [dayListQuery.refetch, shopId]),
  );

  // Default to Manage if there's already an active day, so users don't accidentally try to
  // open a duplicate.
  const activeDay = useMemo(
    () => (dayListQuery.data ?? []).find((d) => isActiveStatus(d.status)),
    [dayListQuery.data],
  );

  const [hasAppliedInitialMode, setHasAppliedInitialMode] = useState(false);
  useEffect(() => {
    if (hasAppliedInitialMode) return;
    if (dayListQuery.isLoading) return;
    if (activeDay) {
      setViewMode("manage");
    }
    setHasAppliedInitialMode(true);
  }, [activeDay, dayListQuery.isLoading, hasAppliedInitialMode]);

  const existingDayForSelectedDate = useMemo(
    () => (dayListQuery.data ?? []).find((d) => d.businessDate === businessDate),
    [dayListQuery.data, businessDate],
  );

  const openMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) {
        throw new Error("No shop selected.");
      }

      return openBusinessDay({ shopId, businessDate });
    },
    onSuccess: async (day) => {
      haptics.success();
      Alert.alert("Opened", `Business day opened (${day.businessDate}).`);
      await dayListQuery.refetch();
    },
    onError: (error: any) => {
      haptics.error();
      toastError(error?.response?.data?.message ?? "Unable to open business day.");
    },
  });

  const openDisabled =
    openMutation.isPending || !shopId || Boolean(existingDayForSelectedDate);

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <View style={styles.headerRow}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          {activeDay ? (
            <StatusBadge label={`Day ${activeDay.status}`} tone={getStatusTone(activeDay.status)} />
          ) : (
            <StatusBadge label="No open day" tone="neutral" />
          )}
        </View>
        <View style={styles.modeRow}>
          <Pressable
            onPress={() => {
              haptics.selection();
              setViewMode("open");
            }}
            style={[styles.modeChip, viewMode === "open" ? styles.modeChipSelected : null]}
          >
            <Text style={[styles.modeChipText, viewMode === "open" ? styles.modeChipTextSelected : null]}>Open Day</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              haptics.selection();
              setViewMode("manage");
            }}
            style={[styles.modeChip, viewMode === "manage" ? styles.modeChipSelected : null]}
          >
            <Text style={[styles.modeChipText, viewMode === "manage" ? styles.modeChipTextSelected : null]}>Manage Day</Text>
          </Pressable>
        </View>
      </View>

      {shopId ? <BusinessDayStaffCard shopId={shopId} date={businessDate} /> : null}

      {viewMode === "open" ? (
        <View style={ui.card}>
          <Text style={styles.sectionTitle}>Open New Business Day</Text>
          <Text style={styles.meta}>Choose the business date and open a new day.</Text>
          <DateTimeField mode="date" value={businessDate} onChange={setBusinessDate} />
          {existingDayForSelectedDate ? (
            <View style={styles.inlineNotice}>
              <Text style={styles.inlineNoticeText}>
                A {existingDayForSelectedDate.status} day already exists for {businessDate}. Switch to Manage Day to open it.
              </Text>
              <PrimaryButton
                tone="neutral"
                label="Manage This Day"
                onPress={() => {
                  haptics.selection();
                  navigation.navigate("DayEndClose", { businessDayId: existingDayForSelectedDate.id });
                }}
              />
            </View>
          ) : null}
          <PrimaryButton
            label={openMutation.isPending ? "Opening..." : "Open Business Day"}
            onPress={() => openMutation.mutate()}
            disabled={openDisabled}
          />
        </View>
      ) : null}

      {viewMode === "manage" ? (
        <>
          <View style={ui.card}>
            <Text style={styles.sectionTitle}>Select Existing Business Day</Text>
            <PrimaryButton tone="neutral" label="Refresh Days" onPress={() => void dayListQuery.refetch()} disabled={!shopId || dayListQuery.isFetching} />

            {(dayListQuery.data ?? []).slice(0, 20).map((day) => {
              const missing = day.missingOpeningTicketCount ?? 0;
              return (
                <Pressable
                  key={day.id}
                  onPress={() => {
                    haptics.selection();
                    navigation.navigate("DayEndClose", { businessDayId: day.id });
                  }}
                  android_ripple={{ color: appTheme.colors.borderBrandSoft }}
                  style={({ pressed }) => [styles.dayRow, pressed ? styles.dayRowPressed : null]}
                >
                  <View style={styles.dayRowHeader}>
                    <Text style={styles.dayTitle}>{day.businessDate}</Text>
                    <StatusBadge label={day.status} tone={getStatusTone(day.status)} />
                  </View>
                  {missing > 0 ? (
                    <View style={styles.dayRowMetaRow}>
                      <StatusBadge label={`${missing} missing ticket${missing === 1 ? "" : "s"}`} tone="warning" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}

            {!dayListQuery.isFetching && (dayListQuery.data?.length ?? 0) === 0 ? (
              <Text style={styles.meta}>No business days found for this shop.</Text>
            ) : null}
          </View>
        </>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 17, lineHeight: 22, fontFamily: appTheme.fonts.bodyMedium, color: appTheme.colors.text },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, lineHeight: 18, fontSize: 13 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  inlineNotice: {
    gap: appTheme.spacing.xs,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceWarningSoft,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
  },
  inlineNoticeText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
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
  dayRow: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 6,
  },
  dayRowPressed: {
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  dayRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  dayRowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dayTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
});
