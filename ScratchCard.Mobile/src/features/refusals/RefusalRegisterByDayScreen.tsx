import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { getRefusalDailyLog } from "../../api/refusalRegisterApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue, parseDateValue } from "../../components/DateTimeField";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
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
  const reviewedCount = entries.filter((entry) => Boolean(entry.reviewedOn)).length;
  const pendingCount = entries.length - reviewedCount;

  return (
    <ScreenContainer>
      <View style={styles.screenHeaderCard}>
        <View style={styles.screenHeaderTop}>
          <View style={styles.screenHeaderTitleWrap}>
            <Text style={styles.screenHeaderEyebrow}>No ID / No Sale</Text>
            <Text style={styles.screenHeaderTitle}>Daily Register</Text>
            <Text style={styles.screenHeaderMeta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          </View>
          <StatusBadge label={pendingCount > 0 ? "Pending Reviews" : "Reviewed"} tone={pendingCount > 0 ? "warning" : "success"} />
        </View>
        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{entries.length}</Text>
            <Text style={styles.metricLabel}>Total</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{reviewedCount}</Text>
            <Text style={styles.metricLabel}>Reviewed</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{pendingCount}</Text>
            <Text style={styles.metricLabel}>Pending</Text>
          </View>
        </View>
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Select Date</Text>
        <Text style={styles.sectionSubtitle}>Choose a day to review refusal records in chronological order.</Text>
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
        <Text style={styles.meta}>{entries.length} refusal entries in the selected day.</Text>
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Register Entries</Text>
        <Text style={styles.sectionSubtitle}>Tap each item to inspect or edit the record.</Text>
        {dailyLogQuery.isLoading ? <Text style={styles.meta}>Loading entries...</Text> : null}
        {!dailyLogQuery.isLoading && entries.length === 0 ? <Text style={styles.meta}>No refusals recorded for this date.</Text> : null}
        {entries.map((entry) => (
          <View key={entry.id} style={styles.entryItem}>
            <View style={styles.entryHeader}>
              <Text style={styles.entryNo}>No. {entry.sequenceNo}</Text>
              <Text style={styles.entryTime}>{entry.refusalTime || "--:--"}</Text>
            </View>
            <View style={styles.entryBadgeRow}>
              <StatusBadge label={entry.signatureImagePath ? "Signed" : "No Signature"} tone={entry.signatureImagePath ? "success" : "danger"} />
              <StatusBadge label={entry.reviewedOn ? "Reviewed" : "Pending Review"} tone={entry.reviewedOn ? "success" : "warning"} />
            </View>
            <Text style={styles.entryProduct}>{entry.product}</Text>
            <Text style={styles.meta}>Person: {entry.personDescription}</Text>
            {entry.observations ? <Text style={styles.meta}>Observations: {entry.observations}</Text> : null}
            <Text style={styles.meta}>Staff: {getStaffDisplayName(entry)}</Text>
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
  screenHeaderCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surfaceNeutralSoft,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  screenHeaderTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: appTheme.spacing.sm,
  },
  screenHeaderTitleWrap: {
    flex: 1,
    gap: 2,
  },
  screenHeaderEyebrow: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  screenHeaderTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 25,
    lineHeight: 30,
  },
  screenHeaderMeta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 17,
  },
  metricRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  metricCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingVertical: appTheme.spacing.xs,
    alignItems: "center",
    gap: 2,
  },
  metricValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 18,
    lineHeight: 21,
  },
  metricLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 11,
    lineHeight: 14,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  sectionSubtitle: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
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
  entryBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
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

