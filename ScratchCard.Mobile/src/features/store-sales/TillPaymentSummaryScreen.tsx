import React from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { getTillPaymentSummary } from "../../api/tillReportsApi";
import { ScreenContainer } from "../../components/ScreenContainer";
import { MainStackParamList } from "../../types/navigation";
import { TillPaymentTypeAmount } from "../../types/models";
import { formatGbp } from "../../utils/currency";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<MainStackParamList, "TillPaymentSummary">;

export function TillPaymentSummaryScreen({ route }: Props) {
  const { businessDayId } = route.params;
  const { activeShopId } = useAuth();
  const shopId = activeShopId;

  const summaryQuery = useQuery({
    queryKey: ["till-payment-summary", shopId, businessDayId],
    queryFn: () => getTillPaymentSummary(shopId as string, businessDayId),
    enabled: Boolean(shopId) && Boolean(businessDayId),
  });

  const summary = summaryQuery.data;

  return (
    <ScreenContainer
      refreshControl={<RefreshControl refreshing={summaryQuery.isFetching} onRefresh={() => void summaryQuery.refetch()} />}
    >
      {summaryQuery.isLoading ? <Text style={ui.bodyText}>Loading…</Text> : null}

      {summary ? (
        <>
          <View style={ui.card}>
            <Text style={ui.sectionTitle}>Day totals {summary.businessDate ? `· ${summary.businessDate}` : ""}</Text>
            <TenderTotals totals={summary.dayTotals} emptyText="No day-end tender recorded yet." />
          </View>

          <View style={ui.card}>
            <Text style={ui.sectionTitle}>By shift</Text>
            {summary.shifts.length === 0 ? (
              <Text style={ui.bodyText}>No shift till reports recorded for this day.</Text>
            ) : (
              summary.shifts.map((shift) => (
                <View key={shift.shiftId} style={styles.shiftBlock}>
                  <Text style={styles.shiftName}>{shift.shiftName}</Text>
                  <TenderTotals totals={shift.totals} emptyText="No tender recorded." />
                </View>
              ))
            )}
          </View>
        </>
      ) : null}
    </ScreenContainer>
  );
}

function TenderTotals({ totals, emptyText }: { totals: TillPaymentTypeAmount[]; emptyText: string }) {
  if (totals.length === 0) {
    return <Text style={ui.caption}>{emptyText}</Text>;
  }
  const grandTotal = totals.reduce((sum, t) => sum + t.amount, 0);
  return (
    <View style={styles.totalsBlock}>
      {totals.map((total, index) => (
        <View key={total.paymentTypeId ?? `${total.name}-${index}`} style={styles.totalRow}>
          <Text style={styles.totalLabel}>{total.name}</Text>
          <Text style={styles.totalValue}>{formatGbp(total.amount)}</Text>
        </View>
      ))}
      <View style={[styles.totalRow, styles.grandRow]}>
        <Text style={styles.grandLabel}>Total</Text>
        <Text style={styles.grandValue}>{formatGbp(grandTotal)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  totalsBlock: { gap: 6 },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 14, lineHeight: 18 },
  totalValue: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  grandRow: { borderTopWidth: 1, borderTopColor: appTheme.colors.borderSoft, paddingTop: 6, marginTop: 2 },
  grandLabel: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  grandValue: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15, lineHeight: 19 },
  shiftBlock: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: 10,
    gap: 6,
  },
  shiftName: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
});
