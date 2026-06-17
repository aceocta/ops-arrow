import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getProductExpiryScoreboard } from "../../api/productExpiryApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { LoadingState } from "../../components/LoadingState";
import { ScreenContainer } from "../../components/ScreenContainer";
import { formatGbp } from "../../utils/currency";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function offsetDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatDateValue(d);
}

export function ProductExpiryScoreboardScreen() {
  const { activeShopId } = useAuth();
  const [from, setFrom] = useState(offsetDays(-30));
  const [to, setTo] = useState(formatDateValue(new Date()));

  const query = useQuery({
    queryKey: ["product-expiry-scoreboard", activeShopId, from, to],
    queryFn: () => getProductExpiryScoreboard(activeShopId as string, from, to),
    enabled: Boolean(activeShopId),
  });
  const data = query.data;
  const hasActivity = Boolean(data && (data.savedUnits > 0 || data.binnedUnits > 0));
  const savePct = data ? Math.round(data.saveRate * 100) : 0;

  return (
    <ScreenContainer>
      <View style={[ui.card, styles.card]}>
        <Text style={ui.sectionTitle}>Period</Text>
        <View style={styles.row}>
          <View style={styles.cell}>
            <Text style={styles.fieldLabel}>From</Text>
            <DateTimeField mode="date" value={from} onChange={setFrom} />
          </View>
          <View style={styles.cell}>
            <Text style={styles.fieldLabel}>To</Text>
            <DateTimeField mode="date" value={to} onChange={setTo} />
          </View>
        </View>
      </View>

      {query.isLoading ? (
        <View style={ui.card}><LoadingState message="Loading scoreboard…" inline /></View>
      ) : data ? (
        <>
          <View style={[ui.card, styles.kpiCard]}>
            <Text style={styles.saveRate}>{hasActivity ? `${savePct}%` : "—"}</Text>
            <Text style={styles.saveRateLabel}>{hasActivity ? "saved from the bin" : "No activity in this period"}</Text>
            <View style={styles.kpiRow}>
              <View style={styles.kpi}>
                <Text style={[styles.kpiValue, styles.good]}>{data.savedUnits}</Text>
                <Text style={styles.kpiLabel}>saved · {formatGbp(data.savedValue)}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={[styles.kpiValue, styles.bad]}>{data.binnedUnits}</Text>
                <Text style={styles.kpiLabel}>binned · {formatGbp(data.binnedValue)}</Text>
              </View>
            </View>
          </View>

          <View style={[ui.card, styles.card]}>
            <Text style={ui.sectionTitle}>By disposition</Text>
            {data.byDisposition.length === 0 ? (
              <Text style={styles.meta}>No final dispositions in this period.</Text>
            ) : (
              data.byDisposition.map((d) => (
                <View key={d.actionType} style={styles.dispRow}>
                  <Text style={[styles.dispName, d.isSave ? styles.good : styles.bad]}>{d.actionType}</Text>
                  <Text style={styles.dispMeta}>{d.units} · {formatGbp(d.value)}</Text>
                </View>
              ))
            )}
          </View>
        </>
      ) : (
        <View style={ui.card}><Text style={styles.meta}>No data.</Text></View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { gap: appTheme.spacing.sm },
  row: { flexDirection: "row", gap: appTheme.spacing.sm },
  cell: { flex: 1, gap: 4 },
  fieldLabel: { color: appTheme.colors.text, fontSize: 13, lineHeight: 16, fontFamily: appTheme.fonts.bodyMedium },
  kpiCard: { alignItems: "center", gap: 2 },
  saveRate: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.heading, fontSize: 44, lineHeight: 50 },
  saveRateLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, marginBottom: appTheme.spacing.sm },
  kpiRow: { flexDirection: "row", gap: appTheme.spacing.md },
  kpi: { alignItems: "center", gap: 2 },
  kpiValue: { fontFamily: appTheme.fonts.heading, fontSize: 24, lineHeight: 28 },
  kpiLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  good: { color: appTheme.colors.success },
  bad: { color: appTheme.colors.danger },
  dispRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  dispName: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  dispMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13 },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
});
