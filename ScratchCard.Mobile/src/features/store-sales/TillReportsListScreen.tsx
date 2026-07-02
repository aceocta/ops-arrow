import React from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../auth/AuthContext";
import { listTillReports } from "../../api/tillReportsApi";
import { QueryStateGate } from "../../components/QueryStateGate";
import { ScreenContainer } from "../../components/ScreenContainer";
import { MainStackParamList } from "../../types/navigation";
import { TillReportStatus, TillReportType } from "../../types/enums";
import { TillReportListItem } from "../../types/models";
import { formatGbp } from "../../utils/currency";
import { formatDayLabel } from "../../utils/dateLabels";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<MainStackParamList, "TillReportHistory">;

export function TillReportsListScreen({ navigation }: Props) {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;

  const reportsQuery = useQuery({
    queryKey: ["till-reports", shopId],
    queryFn: () => listTillReports({ shopId: shopId as string }),
    enabled: Boolean(shopId),
  });

  const items = reportsQuery.data?.items ?? [];

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl refreshing={reportsQuery.isRefetching} onRefresh={() => void reportsQuery.refetch()} />
      }
    >
      {/* A failed load previously fell through to the "No till reports yet" empty state — misleading on
          an audit-trail screen. Gate the error branch on having no cached rows. */}
      <QueryStateGate
        isLoading={reportsQuery.isLoading}
        isError={reportsQuery.isError && items.length === 0}
        onRetry={() => void reportsQuery.refetch()}
        errorTitle="Couldn't load till reports"
        errorMessage="Check your connection and try again."
        isEmpty={items.length === 0}
        emptyIcon="receipt-outline"
        emptyTitle="No till reports yet"
        emptyMessage="Photograph your first till report to get started."
        emptyActionLabel="Capture till report"
        onEmptyAction={() => navigation.navigate("StoreSales")}
      >
        {items.map((item) => (
          <Pressable
            key={item.id}
            style={ui.card}
            accessibilityRole="button"
            accessibilityLabel={`${formatDayLabel(item.businessDate)}, ${item.reportType === TillReportType.Shift ? "shift report" : "day-end report"}, net ${formatGbp(item.net)}`}
            onPress={() => navigation.navigate("TillReportReview", { reportId: item.id })}
          >
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.date}>{formatDayLabel(item.businessDate)}</Text>
                <Text style={ui.caption}>{item.reportType === TillReportType.Shift ? "Shift report" : "Day-end report"}</Text>
              </View>
              <StatusPill status={item.status} unclassified={item.unclassifiedCount} />
            </View>
            <View style={styles.totalsRow}>
              <Text style={[styles.total, styles.income]}>{formatGbp(item.totalIncome)} in</Text>
              <Text style={[styles.total, styles.expense]}>{formatGbp(item.totalExpense)} out</Text>
              <Text style={styles.total}>{formatGbp(item.net)} net</Text>
            </View>
            <View style={styles.footerRow}>
              <Text style={ui.caption}>{item.lineCount} line{item.lineCount === 1 ? "" : "s"}</Text>
              <Ionicons name="chevron-forward" size={15} color={appTheme.colors.textMuted} />
            </View>
          </Pressable>
        ))}
      </QueryStateGate>
    </ScreenContainer>
  );
}

function StatusPill({ status, unclassified }: { status: TillReportListItem["status"]; unclassified: number }) {
  const isConfirmed = status === TillReportStatus.Confirmed;
  const needsAttention = !isConfirmed && unclassified > 0;
  const pillStyle = isConfirmed ? styles.pillConfirmed : needsAttention ? styles.pillWarn : styles.pillReview;
  const label = isConfirmed ? "Confirmed" : needsAttention ? `${unclassified} to tag` : "Review";
  return (
    <View style={[styles.pill, pillStyle]}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  date: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15, lineHeight: 19 },
  totalsRow: { flexDirection: "row", flexWrap: "wrap", gap: appTheme.spacing.sm },
  total: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 17 },
  income: { color: appTheme.colors.success },
  expense: { color: appTheme.colors.danger },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pill: { borderRadius: appTheme.radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillConfirmed: { backgroundColor: appTheme.colors.badgeSuccessBg },
  pillReview: { backgroundColor: appTheme.colors.surfaceMuted },
  pillWarn: { backgroundColor: appTheme.colors.surfaceWarningSoft },
  pillText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, lineHeight: 14 },
});
