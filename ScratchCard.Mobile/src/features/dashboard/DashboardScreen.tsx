import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { listBusinessDays, openBusinessDay } from "../../api/businessDaysApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { toastError } from "../../components/toast";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function isActiveBusinessDayStatus(status?: string) {
  const normalized = (status ?? "").trim().toLowerCase();
  return normalized === "open" || normalized === "reopened" || normalized === "readytoclose";
}

export function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { activeShopId } = useAuth();
  const [businessDate, setBusinessDate] = useState(formatDateValue(new Date()));
  const selectedShopId = activeShopId ?? "";

  const dayListQuery = useQuery({
    queryKey: ["dashboard-business-days", selectedShopId],
    queryFn: () => listBusinessDays(selectedShopId),
    enabled: Boolean(selectedShopId),
    refetchOnMount: "always",
    refetchOnReconnect: true,
  });

  useFocusEffect(
    useCallback(() => {
      if (!selectedShopId) {
        return;
      }

      void dayListQuery.refetch();
    }, [dayListQuery.refetch, selectedShopId]),
  );

  const openDayMutation = useMutation({
    mutationFn: async () => {
      if (!selectedShopId) {
        throw new Error("No shop selected.");
      }
      return openBusinessDay({ shopId: selectedShopId, businessDate });
    },
    onSuccess: (openedDay) => {
      navigation.replace("DayEndClose", { businessDayId: openedDay.id });
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message ?? "Unable to open business day.");
    },
  });

  const preferredDay = useMemo(() => {
    const days = dayListQuery.data ?? [];
    if (days.length === 0) {
      return null;
    }

    const sortedDays = [...days].sort((a, b) => b.businessDate.localeCompare(a.businessDate));
    const activeDay = sortedDays.find((day) => isActiveBusinessDayStatus(day.status));
    return activeDay ?? sortedDays[0];
  }, [dayListQuery.data]);

  useEffect(() => {
    if (!dayListQuery.isSuccess || !preferredDay) {
      return;
    }

    navigation.replace("DayEndClose", { businessDayId: preferredDay.id });
  }, [dayListQuery.isSuccess, navigation, preferredDay]);

  const dayListErrorMessage = (dayListQuery.error as any)?.response?.data?.message ?? "Unable to load business days.";

  return (
    <ScreenContainer>
      <View style={ui.card}>
        {selectedShopId ? (
          dayListQuery.isError ? (
            <>
              <Text style={styles.sectionTitle}>Unable To Load Day Details</Text>
              <Text style={styles.meta}>{dayListErrorMessage}</Text>
              <PrimaryButton
                tone="neutral"
                label={dayListQuery.isFetching ? "Retrying..." : "Retry"}
                onPress={() => void dayListQuery.refetch()}
                disabled={dayListQuery.isFetching}
              />
            </>
          ) : dayListQuery.isLoading || dayListQuery.isFetching ? (
            <>
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={appTheme.colors.primary} />
                <Text style={styles.sectionTitle}>Loading Day Management...</Text>
              </View>
              <Text style={styles.meta}>Checking the current opened business day.</Text>
            </>
          ) : preferredDay ? (
            <>
              <Text style={styles.sectionTitle}>Opening Day Management...</Text>
              <Text style={styles.meta}>Date: {preferredDay.businessDate}</Text>
              <Text style={styles.meta}>Status: {preferredDay.status}</Text>
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Open Business Day</Text>
              <Text style={styles.meta}>No existing business day found. Open one to continue.</Text>
              <DateTimeField mode="date" value={businessDate} onChange={setBusinessDate} />
              <PrimaryButton
                label={openDayMutation.isPending ? "Opening..." : "Open Day"}
                onPress={() => openDayMutation.mutate()}
                disabled={openDayMutation.isPending}
              />
            </>
          )
        ) : (
          <>
            <Text style={styles.sectionTitle}>No Shop Selected</Text>
            <Text style={styles.meta}>Select an active shop to continue.</Text>
          </>
        )}
      </View>

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
  },
});
