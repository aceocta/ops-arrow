import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { listBusinessDays, openBusinessDay } from "../../api/businessDaysApi";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

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

  const openMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) {
        throw new Error("No shop selected.");
      }

      return openBusinessDay({ shopId, businessDate });
    },
    onSuccess: async (day) => {
      Alert.alert("Opened", `Business day opened (${day.businessDate}).`);
      await dayListQuery.refetch();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to open business day.");
    },
  });

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
              <Text style={[styles.modeChipText, viewMode === "open" ? styles.modeChipTextSelected : null]}>Open Day</Text>
            </Pressable>
            <Pressable
              onPress={() => setViewMode("manage")}
              style={[styles.modeChip, viewMode === "manage" ? styles.modeChipSelected : null]}
            >
              <Text style={[styles.modeChipText, viewMode === "manage" ? styles.modeChipTextSelected : null]}>Manage Day</Text>
            </Pressable>
          </View>
        </View>

        {viewMode === "open" ? (
          <View style={ui.card}>
            <Text style={styles.sectionTitle}>Open New Business Day</Text>
            <Text style={styles.meta}>Choose the business date and open a new day.</Text>
            <DateTimeField mode="date" value={businessDate} onChange={setBusinessDate} />
            <PrimaryButton
              label={openMutation.isPending ? "Opening..." : "Open Business Day"}
              onPress={() => openMutation.mutate()}
              disabled={openMutation.isPending || !shopId}
            />
          </View>
        ) : null}

        {viewMode === "manage" ? (
          <>
            <View style={ui.card}>
              <Text style={styles.sectionTitle}>Select Existing Business Day</Text>
              <PrimaryButton tone="neutral" label="Refresh Days" onPress={() => void dayListQuery.refetch()} disabled={!shopId || dayListQuery.isFetching} />

              {(dayListQuery.data ?? []).slice(0, 20).map((day) => {
                return (
                  <Pressable
                    key={day.id}
                    onPress={() => navigation.navigate("DayEndClose", { businessDayId: day.id })}
                    style={styles.dayRow}
                  >
                    <Text style={styles.dayTitle}>{day.businessDate}</Text>
                    <Text style={styles.meta}>Status: {day.status}</Text>
                    <Text
                      style={[
                        styles.meta,
                        (day.missingOpeningTicketCount ?? 0) > 0 ? styles.metaWarning : null,
                      ]}
                    >
                      Missing Tickets: {day.missingOpeningTicketCount ?? 0}
                    </Text>
                  </Pressable>
                );
              })}

              {!dayListQuery.isFetching && (dayListQuery.data?.length ?? 0) === 0 ? (
                <Text style={styles.meta}>No business days found for this shop.</Text>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 17, lineHeight: 22, fontFamily: appTheme.fonts.bodyMedium, color: appTheme.colors.text },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, lineHeight: 18, fontSize: 13 },
  metaWarning: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.bodyMedium },
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
  dayRow: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  dayTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
  },
});
