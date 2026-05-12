import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { listBusinessDays, openBusinessDay } from "../../api/businessDaysApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

export function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { activeShopId, activeShop } = useAuth();
  const [businessDate, setBusinessDate] = useState(formatDateValue(new Date()));
  const selectedShopId = activeShopId ?? "";

  const dayListQuery = useQuery({
    queryKey: ["dashboard-business-days", selectedShopId],
    queryFn: () => listBusinessDays(selectedShopId),
    enabled: Boolean(selectedShopId),
  });

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
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to open business day.");
    },
  });

  const preferredDay = useMemo(() => {
    const days = dayListQuery.data ?? [];
    if (days.length === 0) {
      return null;
    }

    const sortedDays = [...days].sort((a, b) => b.businessDate.localeCompare(a.businessDate));
    const activeDay = sortedDays.find((day) => day.status === "Open" || day.status === "Reopened" || day.status === "ReadyToClose");
    return activeDay ?? sortedDays[0];
  }, [dayListQuery.data]);

  useEffect(() => {
    if (!preferredDay) {
      return;
    }
    navigation.replace("DayEndClose", { businessDayId: preferredDay.id });
  }, [navigation, preferredDay]);

  return (
    <ScreenContainer>
      {/* <View style={styles.hero}>
        <View style={styles.heroTop}>
          <StatusBadge label={dayListQuery.isFetching ? "Loading" : "Ready"} tone="success" />
        </View>
        <Text style={styles.heroTitle}>Day Management</Text>
        <Text style={styles.heroSubtitle}>{activeShop?.shopName ?? "No active shop selected"}</Text>
        <Text style={styles.heroNote}>Open, track, and close the active business day.</Text>
      </View> */}

      <View style={ui.card}>
        {selectedShopId ? (
          preferredDay ? (
            <>
              <Text style={styles.sectionTitle}>Opening Day Management...</Text>
              <Text style={styles.meta}>Date: {preferredDay.businessDate}</Text>
              <Text style={styles.meta}>Status: {preferredDay.status}</Text>
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Open Business Day</Text>
              <Text style={styles.meta}>No existing business day found. Open one to continue.</Text>
              {/* <Text style={styles.fieldLabel}>Date</Text> */}
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
  hero: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.lg,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.xs,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  heroTitle: {
    color: appTheme.colors.text,
    fontSize: 21,
    lineHeight: 25,
    fontFamily: appTheme.fonts.heading,
  },
  heroSubtitle: {
    color: appTheme.colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  heroNote: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
    marginTop: 2,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
  },
});
