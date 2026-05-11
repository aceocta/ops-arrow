import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { getRefusalDailyLog } from "../../api/refusalRegisterApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue, parseDateValue } from "../../components/DateTimeField";
import { ScreenContainer } from "../../components/ScreenContainer";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { getStaffDisplayName } from "./refusalStaffUtils";

function shiftDate(value: string, days: number) {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return value;
  }

  parsed.setDate(parsed.getDate() + days);
  return formatDateValue(parsed);
}

export function RefusalRegisterByDayScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;
  const [selectedDate, setSelectedDate] = useState(formatDateValue(new Date()));

  const dailyLogQuery = useQuery({
    queryKey: ["refusal-daily-log-view", shopId, selectedDate],
    queryFn: () => getRefusalDailyLog(shopId as string, selectedDate),
    enabled: Boolean(shopId) && selectedDate.length === 10,
  });

  const entries = dailyLogQuery.data?.entries ?? [];

  return (
    <ScreenContainer>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Refusals Register by Day</Text>
        <Text style={styles.heroSubtitle}>Shop: {activeShop?.shopName ?? "-"}</Text>
        <Text style={styles.heroNote}>Review all refusal records for a specific date in paper-style order.</Text>
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Select Date</Text>
        <View style={styles.dateRow}>
          <Pressable
            style={styles.dayButton}
            onPress={() => setSelectedDate((current) => shiftDate(current, -1))}
            accessibilityRole="button"
          >
            <Text style={styles.dayButtonText}>Prev</Text>
          </Pressable>
          <DateTimeField style={{ flex: 1 }} mode="date" value={selectedDate} onChange={setSelectedDate} />
          <Pressable
            style={styles.dayButton}
            onPress={() => setSelectedDate((current) => shiftDate(current, 1))}
            accessibilityRole="button"
          >
            <Text style={styles.dayButtonText}>Next</Text>
          </Pressable>
        </View>
        <Text style={styles.meta}>{entries.length} refusal entries</Text>
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Register Entries</Text>
        {dailyLogQuery.isLoading ? <Text style={styles.meta}>Loading entries...</Text> : null}
        {!dailyLogQuery.isLoading && entries.length === 0 ? <Text style={styles.meta}>No refusals recorded for this date.</Text> : null}
        {entries.map((entry) => (
          <View key={entry.id} style={styles.entryItem}>
            <View style={styles.entryHeader}>
              <Text style={styles.entryNo}>No. {entry.sequenceNo}</Text>
              <Text style={styles.entryTime}>{entry.refusalTime || "--:--"}</Text>
            </View>
            <Text style={styles.entryProduct}>{entry.product}</Text>
            <Text style={styles.meta}>Person: {entry.personDescription}</Text>
            {entry.observations ? <Text style={styles.meta}>Observations: {entry.observations}</Text> : null}
            <Text style={styles.meta}>Staff: {getStaffDisplayName(entry)}</Text>
            <Text style={styles.meta}>Signature: {entry.signatureImagePath ? "Saved" : "Missing"}</Text>
            <Text style={styles.meta}>Manager Review: {entry.reviewedOn ? `Reviewed by ${entry.reviewedByName ?? "-"}` : "Pending"}</Text>
            <View style={styles.entryActions}>
              <Pressable
                style={styles.rowActionButton}
                onPress={() => navigation.navigate("RefusalEntryDetails", { entryId: entry.id })}
              >
                <Text style={styles.rowActionButtonText}>View Details</Text>
              </Pressable>
              <Pressable
                style={styles.rowActionButton}
                onPress={() => navigation.navigate("RefusalEntryEdit", { entryId: entry.id })}
              >
                <Text style={styles.rowActionButtonText}>Edit</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.primaryPressed,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.xs,
  },
  heroTitle: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.heading,
    fontSize: 20,
    lineHeight: 24,
  },
  heroSubtitle: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  heroNote: {
    color: "#DCEAF4",
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 17,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  dayButton: {
    minWidth: 58,
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  dayButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  entryItem: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
    gap: 3,
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  entryNo: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  entryTime: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  entryProduct: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  entryActions: {
    marginTop: appTheme.spacing.xs,
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  rowActionButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  rowActionButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
});
