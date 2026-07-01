import React, { useMemo, useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { CoinPodReport, getCoinPodReport } from "../../api/coinPodApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

const TYPE_LABELS: Record<string, string> = {
  OpeningBalance: "Opening balance",
  NotesToCoins: "Notes → Coins",
  CoinsToNotes: "Coins → Notes",
  ManualAdjustment: "Manual adjustment",
  BankRefill: "Bank refill",
  BankDeposit: "Coin removal",
  Reversal: "Reversal",
  StockCount: "Value count",
};

function money(value: number) {
  return `£${(value ?? 0).toFixed(2)}`;
}

function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateValue(d);
}

function statusTone(status: string): "neutral" | "warning" | "danger" | "success" {
  if (status === "OutOfStock") return "danger";
  if (status === "LowStock") return "warning";
  if (status === "Disabled") return "neutral";
  return "success";
}

export function CoinReportsScreen() {
  const { activeShopId } = useAuth();
  const today = formatDateValue(new Date());
  const [from, setFrom] = useState(addDaysIso(today, -30));
  const [to, setTo] = useState(today);

  const range = useMemo(() => (from <= to ? { from, to } : { from: to, to: from }), [from, to]);

  const query = useQuery({
    queryKey: ["coin-pod-report", activeShopId, range.from, range.to],
    queryFn: () => getCoinPodReport(activeShopId as string, range.from, range.to),
    enabled: Boolean(activeShopId),
  });

  const report: CoinPodReport | undefined = query.data;

  return (
    <ScreenContainer
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={appTheme.colors.primary} />}
    >
      <View style={[ui.card, styles.dateRow]}>
        <View style={styles.cell}>
          <Text style={styles.fieldLabel}>From</Text>
          <DateTimeField mode="date" value={from} onChange={setFrom} />
        </View>
        <View style={styles.cell}>
          <Text style={styles.fieldLabel}>To</Text>
          <DateTimeField mode="date" value={to} onChange={setTo} />
        </View>
      </View>

      {query.isLoading ? (
        <View style={ui.card}><LoadingState message="Building report…" inline /></View>
      ) : !report ? (
        <EmptyState icon="bar-chart-outline" title="No report" message="Pull down to retry." />
      ) : (
        <>
          <View style={[ui.card, styles.totalCard]}>
            <Text style={styles.totalLabel}>Current total coin bag value</Text>
            <Text style={styles.totalValue}>{money(report.totalCoinValue)}</Text>
          </View>

          <Text style={ui.sectionTitle}>Stock summary</Text>
          <View style={[ui.card, styles.tableCard]}>
            {report.stockSummary.map((s) => (
              <View key={s.coinDenominationId} style={styles.tableRow}>
                <Text style={styles.tdLabel}>{s.displayLabel}</Text>
                <Text style={styles.td}>{s.currentBagQuantity} bag(s)</Text>
                <Text style={styles.td}>{money(s.currentTotalValue)}</Text>
                <StatusBadge label={s.status === "OutOfStock" ? "Out" : s.status === "LowStock" ? "Low" : s.status === "Disabled" ? "Off" : "OK"} tone={statusTone(s.status)} />
              </View>
            ))}
          </View>

          <Text style={ui.sectionTitle}>Movements ({report.from} → {report.to})</Text>
          {report.movementSummary.length === 0 ? (
            <View style={ui.card}><Text style={styles.empty}>No movements in this range.</Text></View>
          ) : (
            <View style={[ui.card, styles.tableCard]}>
              {report.movementSummary.map((m) => (
                <View key={m.transactionType} style={styles.tableRow}>
                  <Text style={[styles.tdLabel, styles.flex2]}>{TYPE_LABELS[m.transactionType] ?? m.transactionType}</Text>
                  <Text style={styles.td}>×{m.count}</Text>
                  <Text style={styles.td}>{m.totalBags} bag(s)</Text>
                  <Text style={styles.td}>{money(m.totalCoinValue)}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={ui.sectionTitle}>Exceptions (notes ≠ coins)</Text>
          {report.exceptions.length === 0 ? (
            <View style={ui.card}><Text style={styles.empty}>No mismatches — every swap balanced.</Text></View>
          ) : (
            <View style={styles.list}>
              {report.exceptions.map((t) => (
                <View key={t.id} style={[ui.listItem, styles.exceptionRow]}>
                  <View style={styles.exMain}>
                    <Text style={styles.exTitle}>{t.displayLabel} · {TYPE_LABELS[t.transactionType] ?? t.transactionType}</Text>
                    <Text style={styles.exMeta}>{t.performedOn.slice(0, 16).replace("T", " ")} · notes {money(t.noteAmount)} vs coins {money(t.totalCoinValue)}</Text>
                    {t.comment ? <Text style={styles.exComment} numberOfLines={2}>{t.comment}</Text> : null}
                  </View>
                  <Text style={[styles.diff, t.differenceAmount < 0 ? styles.diffNeg : styles.diffPos]}>
                    {t.differenceAmount > 0 ? "+" : ""}{money(t.differenceAmount)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Text style={ui.sectionTitle}>Alerts in range</Text>
          {report.alerts.length === 0 ? (
            <View style={ui.card}><Text style={styles.empty}>No alerts triggered in this range.</Text></View>
          ) : (
            <View style={styles.list}>
              {report.alerts.map((a) => (
                <View key={a.id} style={[ui.listItem, styles.alertRow]}>
                  <View style={styles.exMain}>
                    <Text style={styles.exTitle}>{a.displayLabel} · {a.alertType === "OutOfStock" ? "Out of stock" : "Low stock"}</Text>
                    <Text style={styles.exMeta}>{a.triggeredOn.slice(0, 16).replace("T", " ")}</Text>
                  </View>
                  <StatusBadge label={a.status} tone={a.status === "Active" ? "danger" : a.status === "Resolved" ? "success" : "neutral"} />
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: "row", gap: appTheme.spacing.sm },
  cell: { flex: 1 },
  fieldLabel: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 16, marginBottom: 2 },
  totalCard: { marginTop: appTheme.spacing.sm, alignItems: "center" },
  totalLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  totalValue: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 26, marginTop: 2 },
  tableCard: { gap: 6 },
  tableRow: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.xs },
  tdLabel: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  td: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, textAlign: "right", minWidth: 56 },
  flex2: { flex: 2 },
  list: { gap: appTheme.spacing.xs },
  empty: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 12 },
  exceptionRow: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.sm },
  alertRow: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.sm },
  exMain: { flex: 1, gap: 2 },
  exTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  exMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 11 },
  exComment: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 11 },
  diff: { fontFamily: appTheme.fonts.heading, fontSize: 14 },
  diffNeg: { color: appTheme.colors.danger },
  diffPos: { color: appTheme.colors.primary },
});
