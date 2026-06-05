import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useAuth } from "../../auth/AuthContext";
import { getOwnerOverview } from "../../api/reportsApi";
import { LoadingState } from "../../components/LoadingState";
import { formatDateValue } from "../../components/DateTimeField";
import { toastError } from "../../components/toast";
import { OwnerOverview, OwnerShopOverview } from "../../types/models";
import { MainStackParamList } from "../../types/navigation";
import { formatGbp } from "../../utils/currency";
import { appTheme } from "../../ui/theme";
import { ui } from "../../ui/primitives";

type RangeKey = "today" | "7d" | "30d";

const RANGE_LABEL: Record<RangeKey, string> = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days" };

function rangeDates(key: RangeKey): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  if (key === "7d") from.setDate(from.getDate() - 6);
  if (key === "30d") from.setDate(from.getDate() - 29);
  return { from: formatDateValue(from), to: formatDateValue(to) };
}

function scoreColor(percent: number) {
  if (percent >= 95) return appTheme.colors.success;
  if (percent >= 80) return appTheme.colors.warning;
  return appTheme.colors.danger;
}

function dayStatusLabel(status: string) {
  switch (status) {
    case "Closed":
      return "Day closed";
    case "Open":
      return "Day open";
    case "Reopened":
      return "Day reopened";
    default:
      return "Not started";
  }
}

// Percentage change vs the previous period; null when there's no prior baseline to compare against.
function salesDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

const CHART_HEIGHT = 104;

function shortGbp(value: number): string {
  if (value >= 1000) return `£${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `£${Math.round(value)}`;
}

type SalesBucket = { label: string; value: number };

// 7-day view → one bar per day; 30-day view → one bar per week (chunks of 7 from the start).
function buildSalesBuckets(range: RangeKey, points: { date: string; amount: number }[]): SalesBucket[] {
  if (range === "7d") {
    return points.map((p) => ({
      label: new Date(`${p.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" }),
      value: p.amount,
    }));
  }
  if (range === "30d") {
    const buckets: SalesBucket[] = [];
    for (let i = 0; i < points.length; i += 7) {
      const chunk = points.slice(i, i + 7);
      if (chunk.length === 0) break;
      buckets.push({
        label: new Date(`${chunk[0].date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        value: chunk.reduce((sum, p) => sum + p.amount, 0),
      });
    }
    return buckets;
  }
  return [];
}

function SalesBarChart({ buckets }: { buckets: SalesBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.value));
  return (
    <View style={styles.chartRow}>
      {buckets.map((b, i) => (
        <View key={i} style={styles.chartCol}>
          <Text style={styles.chartValue} numberOfLines={1}>{b.value > 0 ? shortGbp(b.value) : ""}</Text>
          <View style={styles.chartBarTrack}>
            <View style={[styles.chartBar, { height: Math.max(2, Math.round((b.value / max) * CHART_HEIGHT)) }]} />
          </View>
          <Text style={styles.chartLabel} numberOfLines={1}>{b.label}</Text>
        </View>
      ))}
    </View>
  );
}

type TempBucket = { label: string; inRange: number; outOfRange: number };

// Daily buckets for 7-day, weekly for 30-day. Each bucket carries in-range vs out-of-range counts.
function buildTempBuckets(range: RangeKey, points: { date: string; inRange: number; outOfRange: number }[]): TempBucket[] {
  const groups = range === "30d"
    ? Array.from({ length: Math.ceil(points.length / 7) }, (_, i) => points.slice(i * 7, i * 7 + 7))
    : points.map((p) => [p]);
  return groups
    .filter((g) => g.length > 0)
    .map((g) => {
      const date = new Date(`${g[0].date}T00:00:00`);
      const label = range === "30d"
        ? date.toLocaleDateString(undefined, { day: "numeric", month: "short" })
        : date.toLocaleDateString(undefined, { weekday: "short" });
      return {
        label,
        inRange: g.reduce((s, p) => s + p.inRange, 0),
        outOfRange: g.reduce((s, p) => s + p.outOfRange, 0),
      };
    });
}

// 100%-stacked bar of readings taken: green = in range, red = out of range. Label = out-of-range %.
function TempRangeChart({ buckets }: { buckets: TempBucket[] }) {
  return (
    <View style={styles.chartRow}>
      {buckets.map((b, i) => {
        const taken = b.inRange + b.outOfRange;
        const outPct = taken > 0 ? Math.round((b.outOfRange / taken) * 100) : 0;
        const outH = taken > 0 ? Math.round((b.outOfRange / taken) * CHART_HEIGHT) : 0;
        const inH = taken > 0 ? CHART_HEIGHT - outH : 0;
        return (
          <View key={i} style={styles.chartCol}>
            <Text
              style={[styles.chartValue, b.outOfRange > 0 ? { color: appTheme.colors.danger } : null]}
              numberOfLines={1}
            >
              {taken > 0 ? `${outPct}%` : ""}
            </Text>
            <View style={styles.chartBarTrack}>
              {taken > 0 ? (
                <View style={styles.stackBar}>
                  {outH > 0 ? <View style={[styles.stackOut, { height: outH }]} /> : null}
                  <View style={[styles.stackIn, { height: Math.max(inH, b.inRange > 0 ? 2 : 0) }]} />
                </View>
              ) : null}
            </View>
            <Text style={styles.chartLabel} numberOfLines={1}>{b.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function buildSummaryHtml(overview: OwnerOverview, rangeLabel: string): string {
  const delta = salesDelta(overview.totalSalesAmount, overview.previousTotalSalesAmount);
  const rows = [...overview.shops]
    .sort((a, b) => b.salesAmount - a.salesAmount)
    .map(
      (s) => `<tr>
        <td>${s.shopName}</td>
        <td style="text-align:right">${formatGbp(s.salesAmount)}</td>
        <td style="text-align:center">${s.complianceScore}</td>
        <td style="text-align:center">${s.temperatureCompliancePercent}%</td>
        <td style="text-align:center">${s.openComplianceActions}</td>
        <td style="text-align:center">${s.activePacks}${s.lowStockPacks > 0 ? ` (${s.lowStockPacks} low)` : ""}</td>
        <td style="text-align:center">${s.refusals}</td>
        <td style="text-align:center">${s.visitors}</td>
      </tr>`,
    )
    .join("");
  return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/>
    <style>
      body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2430;padding:20px}
      h1{font-size:20px;margin:0 0 4px} .sub{color:#5b6b7c;margin:0 0 16px;font-size:13px}
      .kpis{display:flex;gap:12px;margin-bottom:18px;flex-wrap:wrap}
      .kpi{border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;min-width:120px}
      .kpi .v{font-size:18px;font-weight:600} .kpi .l{font-size:12px;color:#5b6b7c}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border-bottom:1px solid #eaeef2;padding:8px 6px;text-align:left}
      th{color:#5b6b7c;font-weight:600;font-size:11px;text-transform:uppercase}
    </style></head><body>
    <h1>Company operations overview</h1>
    <p class="sub">${rangeLabel} · ${overview.from} to ${overview.to} · ${overview.shopCount} shop(s)</p>
    <div class="kpis">
      <div class="kpi"><div class="v">${formatGbp(overview.totalSalesAmount)}${delta != null ? ` (${delta >= 0 ? "+" : ""}${delta}%)` : ""}</div><div class="l">Scratch card sales</div></div>
      <div class="kpi"><div class="v">${overview.averageComplianceScore}</div><div class="l">Avg compliance score</div></div>
      <div class="kpi"><div class="v">${overview.shopsNeedingAttention}</div><div class="l">Shops needing attention</div></div>
      <div class="kpi"><div class="v">${overview.totalOpenComplianceActions}</div><div class="l">Open actions</div></div>
    </div>
    <table>
      <thead><tr><th>Shop</th><th style="text-align:right">Card sales</th><th style="text-align:center">Score</th><th style="text-align:center">Temp</th><th style="text-align:center">Actions</th><th style="text-align:center">Packs</th><th style="text-align:center">Refusals</th><th style="text-align:center">Visitors</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`;
}

// One stat inside a dual card; tappable when an onPress is supplied (single-shop deep links).
function StatItem({ value, label, tone, onPress }: {
  value: React.ReactNode;
  label: string;
  tone?: "warn" | "danger";
  onPress?: () => void;
}) {
  const Comp: React.ComponentType<any> = onPress ? Pressable : View;
  return (
    <Comp style={styles.dualStat} onPress={onPress}>
      <Text style={[styles.dualValue, tone === "danger" ? styles.kpiDanger : tone === "warn" ? styles.kpiWarn : null]}>
        {value}
      </Text>
      <Text style={styles.dualLabel}>{label}</Text>
    </Comp>
  );
}

// Two-stat summary card; tappable at card level when onPress is supplied.
function DualCard({ title, children, onPress }: { title: string; children: React.ReactNode; onPress?: () => void }) {
  const Comp: React.ComponentType<any> = onPress ? Pressable : View;
  return (
    <Comp style={[ui.card, styles.dualCard]} onPress={onPress}>
      <Text style={styles.dualTitle}>{title}</Text>
      <View style={styles.dualStatsRow}>{children}</View>
    </Comp>
  );
}

export function OwnerOverviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { setActiveShop } = useAuth();
  // Default to the last 7 days for all owners — a single day is too little, and the charts need a range.
  const [range, setRange] = useState<RangeKey>("7d");
  const { from, to } = useMemo(() => rangeDates(range), [range]);

  const overviewQuery = useQuery({
    queryKey: ["owner-overview", from, to],
    queryFn: () => getOwnerOverview(from, to),
  });
  const overview = overviewQuery.data;

  const goToShop = async (shopId: string, route: keyof MainStackParamList, params?: object) => {
    try {
      await setActiveShop(shopId);
      (navigation.navigate as (name: string, params?: object) => void)(route, params);
    } catch {
      // setActiveShop guards membership; ignore failures.
    }
  };

  const shareSummary = async () => {
    if (!overview) return;
    try {
      const { uri } = await Print.printToFileAsync({ html: buildSummaryHtml(overview, RANGE_LABEL[range]) });
      if (!(await Sharing.isAvailableAsync())) {
        toastError("Sharing is not available on this device.");
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Company overview" });
    } catch (error: any) {
      toastError(error?.message ?? "Couldn't create the summary.");
    }
  };

  const allShops = overview?.shops ?? [];
  // Single-shop owners get a focused scorecard (no cross-shop comparison or "All shops" list).
  const isSingleShop = allShops.length === 1;
  const singleShop = isSingleShop ? allShops[0] : null;
  const tempAttentionShops = allShops.filter((s) => s.temperatureIssues > 0 || s.temperatureOutOfRangeUnits > 0);
  const compAttentionShops = allShops.filter((s) => s.complianceNonCompliantCount > 0 || s.openComplianceActions > 0);
  const topShop = useMemo(
    () => (allShops.length ? [...allShops].sort((a, b) => b.salesAmount - a.salesAmount)[0] : null),
    [allShops],
  );
  const focusShop = useMemo(
    () => (allShops.length ? [...allShops].sort((a, b) => a.complianceScore - b.complianceScore)[0] : null),
    [allShops],
  );
  const delta = overview ? salesDelta(overview.totalSalesAmount, overview.previousTotalSalesAmount) : null;

  // Summary-card values: a single shop's own figures, or company totals across all shops.
  const sum = (pick: (s: OwnerShopOverview) => number) => allShops.reduce((acc, s) => acc + pick(s), 0);
  const summary = {
    tempLateMissed: singleShop ? singleShop.temperatureIssues : sum((s) => s.temperatureIssues),
    tempOutOfRange: singleShop ? singleShop.temperatureOutOfRangeUnits : sum((s) => s.temperatureOutOfRangeUnits),
    nonCompliant: singleShop ? singleShop.complianceNonCompliantCount : sum((s) => s.complianceNonCompliantCount),
    openActions: singleShop ? singleShop.openComplianceActions : sum((s) => s.openComplianceActions),
    refusals: singleShop ? singleShop.refusals : sum((s) => s.refusals),
    visitors: singleShop ? singleShop.visitors : sum((s) => s.visitors),
  };
  const shopId = singleShop?.shopId;

  // Shops with the most temperature issues — out-of-range first, then late/missed. Top 5.
  const topTempShops = [...allShops]
    .filter((s) => s.temperatureOutOfRangeUnits > 0 || s.temperatureIssues > 0)
    .sort((a, b) => b.temperatureOutOfRangeUnits - a.temperatureOutOfRangeUnits || b.temperatureIssues - a.temperatureIssues)
    .slice(0, 5);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={overviewQuery.isRefetching} onRefresh={() => overviewQuery.refetch()} />
      }
    >
      <View style={styles.topRow}>
        <View style={styles.rangeRow}>
          {(["today", "7d", "30d"] as RangeKey[]).map((key) => (
            <Pressable
              key={key}
              style={[styles.rangeChip, range === key ? styles.rangeChipActive : null]}
              onPress={() => setRange(key)}
            >
              <Text style={[styles.rangeChipText, range === key ? styles.rangeChipTextActive : null]}>
                {key === "today" ? "Today" : key === "7d" ? "7 days" : "30 days"}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={styles.shareBtn}
          onPress={() => navigation.navigate("BestEntry")}
          accessibilityLabel="Go to home"
        >
          <Ionicons name="home-outline" size={18} color={appTheme.colors.primary} />
        </Pressable>
      </View>

      {overviewQuery.isLoading ? (
        <LoadingState />
      ) : !overview ? (
        <View style={ui.card}>
          <Text style={styles.muted}>Couldn't load the overview. Pull to retry.</Text>
        </View>
      ) : (
        <>
          {/* {isSingleShop && singleShop ? (
            <Text style={styles.shopSubtitle} numberOfLines={1}>
              {singleShop.shopName} · {dayStatusLabel(singleShop.dayStatus)}
            </Text>
          ) : null} */}

          {/* Top summary: same 4 cards for single & multi shop. Single shop shows its own figures
              (tappable to reports); multi shop shows company totals across all shops. */}
          <View style={styles.kpiRow}>
            <View style={[ui.card, styles.kpiCard]}>
              <Text style={styles.kpiValue}>{formatGbp(overview.totalSalesAmount)}</Text>
              <View style={styles.kpiLabelRow}>
                <Text style={styles.kpiLabel}>Scratch card sales</Text>
                {delta != null ? (
                  <View style={styles.deltaWrap}>
                    <Ionicons
                      name={delta >= 0 ? "trending-up" : "trending-down"}
                      size={12}
                      color={delta >= 0 ? appTheme.colors.success : appTheme.colors.danger}
                    />
                    <Text style={[styles.deltaText, { color: delta >= 0 ? appTheme.colors.success : appTheme.colors.danger }]}>
                      {delta >= 0 ? "+" : ""}{delta}%
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.kpiHint}>vs previous period</Text>
            </View>
            <DualCard
              title="Temperature"
              onPress={shopId ? () => goToShop(shopId, "TemperatureScheduleGrid", { from, to }) : undefined}
            >
              <StatItem value={summary.tempLateMissed} label="Late / missed" tone={summary.tempLateMissed > 0 ? "warn" : undefined} />
              <StatItem value={summary.tempOutOfRange} label="Out of range" tone={summary.tempOutOfRange > 0 ? "danger" : undefined} />
            </DualCard>
          </View>
          <View style={styles.kpiRow}>
            <DualCard title="Refusals & visitors">
              <StatItem
                value={summary.refusals}
                label="Refusals"
                onPress={shopId ? () => goToShop(shopId, "RefusalReport", { from, to }) : undefined}
              />
              <StatItem
                value={summary.visitors}
                label="Visitors"
                onPress={shopId ? () => goToShop(shopId, "VisitorLogReport", { from, to }) : undefined}
              />
            </DualCard>
            <DualCard
              title="Compliance"
              onPress={shopId ? () => goToShop(shopId, "ComplianceActions", { from, to }) : undefined}
            >
              <StatItem value={summary.nonCompliant} label="Non-compliant" tone={summary.nonCompliant > 0 ? "warn" : undefined} />
              <StatItem value={summary.openActions} label="Open actions" tone={summary.openActions > 0 ? "warn" : undefined} />
            </DualCard>
          </View>

          {/* Sales chart — daily bars for the 7-day view, weekly bars for the 30-day view. */}
          {range !== "today" && (overview.salesByDay?.length ?? 0) > 0 ? (
            <View style={[ui.card, styles.chartCard]}>
              <Text style={styles.chartTitle}>Scratch card sales · {range === "7d" ? "by day" : "by week"}</Text>
              <SalesBarChart buckets={buildSalesBuckets(range, overview.salesByDay)} />
            </View>
          ) : null}

          {/* Top shops by temperature issues — out-of-range first, then late/missed (multi-shop). */}
          {!isSingleShop && topTempShops.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top shops — temperature issues</Text>
              <View style={ui.card}>
                <View style={styles.tableHead}>
                  <Text style={styles.thShop}>Shop</Text>
                  <Text style={styles.thNum}>Out of range</Text>
                  <Text style={styles.thNum}>Late / missed</Text>
                  <View style={styles.thChevron} />
                </View>
                {topTempShops.map((shop) => (
                  <Pressable
                    key={shop.shopId}
                    style={styles.tableRow}
                    onPress={() => goToShop(shop.shopId, "TemperatureScheduleGrid", { from, to })}
                  >
                    <Text style={styles.tdShop} numberOfLines={1}>{shop.shopName}</Text>
                    <Text style={[styles.tdNum, shop.temperatureOutOfRangeUnits > 0 ? styles.kpiDanger : null]}>
                      {shop.temperatureOutOfRangeUnits}
                    </Text>
                    <Text style={[styles.tdNum, shop.temperatureIssues > 0 ? styles.kpiWarn : null]}>
                      {shop.temperatureIssues}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textMuted} style={styles.thChevron} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* Refusals & visitors — per-shop section (multi-shop only; single-shop shows it beside sales). */}
          {!isSingleShop && allShops.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Refusals & visitors</Text>
              {allShops.map((shop) => (
                <View key={shop.shopId} style={[ui.card, styles.shopCard]}>
                  {!isSingleShop ? <Text style={styles.shopName} numberOfLines={1}>{shop.shopName}</Text> : null}
                  <View style={styles.shopMetricsRow}>
                    <Pressable style={styles.shopMetric} onPress={() => goToShop(shop.shopId, "RefusalReport", { from, to })}>
                      <Text style={styles.shopMetricValue}>{shop.refusals}</Text>
                      <Text style={styles.shopMetricLabel}>Refusals</Text>
                    </Pressable>
                    <Pressable style={styles.shopMetric} onPress={() => goToShop(shop.shopId, "VisitorLogReport", { from, to })}>
                      <Text style={styles.shopMetricValue}>{shop.visitors}</Text>
                      <Text style={styles.shopMetricLabel}>Visitors</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {/* Top / focus highlights */}
          {allShops.length > 1 && topShop && focusShop ? (
            <View style={styles.kpiRow}>
              <Pressable style={[ui.card, styles.highlightCard]} onPress={() => goToShop(topShop.shopId, "DailySalesReport")}>
                <View style={styles.highlightHeader}>
                  <Ionicons name="trophy-outline" size={14} color={appTheme.colors.success} />
                  <Text style={styles.highlightLabel}>Top card sales</Text>
                </View>
                <Text style={styles.highlightShop} numberOfLines={1}>{topShop.shopName}</Text>
                <Text style={styles.highlightValue}>{formatGbp(topShop.salesAmount)}</Text>
              </Pressable>
              <Pressable style={[ui.card, styles.highlightCard]} onPress={() => goToShop(focusShop.shopId, "TemperatureLogs")}>
                <View style={styles.highlightHeader}>
                  <Ionicons name="flag-outline" size={14} color={appTheme.colors.warning} />
                  <Text style={styles.highlightLabel}>Needs focus</Text>
                </View>
                <Text style={styles.highlightShop} numberOfLines={1}>{focusShop.shopName}</Text>
                <Text style={[styles.highlightValue, { color: scoreColor(focusShop.complianceScore) }]}>
                  Score {focusShop.complianceScore}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Temperature checks needing attention. Hidden for a single shop — the KPI card above
              already shows its temperature issues. */}
          {!isSingleShop && tempAttentionShops.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Temperature checks — need attention</Text>
              {tempAttentionShops.map((shop) => (
                <Pressable
                  key={shop.shopId}
                  style={[ui.card, styles.attentionCard]}
                  onPress={() => goToShop(shop.shopId, "TemperatureScheduleGrid", { from, to })}
                >
                  <View style={styles.attentionHeader}>
                    <Ionicons name="thermometer-outline" size={16} color={appTheme.colors.danger} />
                    <Text style={styles.attentionShop} numberOfLines={1}>{shop.shopName}</Text>
                    <Ionicons name="chevron-forward" size={15} color={appTheme.colors.textMuted} />
                  </View>
                  {shop.temperatureIssues > 0 ? (
                    <Text style={styles.issueText}>• {shop.temperatureIssues} late/missed record{shop.temperatureIssues === 1 ? "" : "s"}</Text>
                  ) : null}
                  {shop.temperatureOutOfRangeUnits > 0 ? (
                    <Text style={styles.issueText}>• {shop.temperatureOutOfRangeUnits} unit{shop.temperatureOutOfRangeUnits === 1 ? "" : "s"} have out-of-range records</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Compliance needing attention */}
          {compAttentionShops.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Compliance — need attention</Text>
              {compAttentionShops.map((shop) => (
                <Pressable
                  key={shop.shopId}
                  style={[ui.card, styles.attentionCard]}
                  onPress={() => goToShop(shop.shopId, "ComplianceActions", { from, to })}
                >
                  <View style={styles.attentionHeader}>
                    <Ionicons name="clipboard-outline" size={16} color={appTheme.colors.danger} />
                    <Text style={styles.attentionShop} numberOfLines={1}>{shop.shopName}</Text>
                    <Ionicons name="chevron-forward" size={15} color={appTheme.colors.textMuted} />
                  </View>
                  {shop.complianceNonCompliantCount > 0 ? (
                    <Text style={styles.issueText}>• {shop.complianceNonCompliantCount} non-compliant check{shop.complianceNonCompliantCount === 1 ? "" : "s"}</Text>
                  ) : null}
                  {shop.openComplianceActions > 0 ? (
                    <Text style={styles.issueText}>• {shop.openComplianceActions} open action{shop.openComplianceActions === 1 ? "" : "s"}</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          {!isSingleShop && tempAttentionShops.length === 0 && compAttentionShops.length === 0 ? (
            <View style={[ui.card, styles.allClearCard]}>
              <Ionicons name="checkmark-circle-outline" size={18} color={appTheme.colors.success} />
              <Text style={styles.allClearText}>All shops look good for this period.</Text>
            </View>
          ) : null}

          {/* All shops — only useful when there's more than one to compare. */}
          {isSingleShop ? null : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>All shops ({allShops.length})</Text>
            {allShops.map((shop) => (
              <Pressable key={shop.shopId} style={[ui.card, styles.shopCard]} onPress={() => goToShop(shop.shopId, "Dashboard")}>
                <View style={styles.shopHeader}>
                  <Text style={styles.shopName} numberOfLines={1}>{shop.shopName}</Text>
                  <View style={[styles.scorePill, { backgroundColor: scoreColor(shop.complianceScore) }]}>
                    <Text style={styles.scorePillText}>{shop.complianceScore}</Text>
                  </View>
                </View>
                <Text style={styles.shopDayStatus}>{dayStatusLabel(shop.dayStatus)}</Text>
                <View style={styles.shopMetricsRow}>
                  <View style={styles.shopMetric}>
                    <Text style={styles.shopMetricValue}>{formatGbp(shop.salesAmount)}</Text>
                    <Text style={styles.shopMetricLabel}>Card sales</Text>
                  </View>
                  <View style={styles.shopMetric}>
                    <Text style={[styles.shopMetricValue, { color: scoreColor(shop.temperatureCompliancePercent) }]}>
                      {shop.temperatureCompliancePercent}%
                    </Text>
                    <Text style={styles.shopMetricLabel}>Temp</Text>
                  </View>
                  <View style={styles.shopMetric}>
                    <Text style={[styles.shopMetricValue, shop.openComplianceActions > 0 ? styles.kpiWarn : null]}>
                      {shop.openComplianceActions}
                    </Text>
                    <Text style={styles.shopMetricLabel}>Actions</Text>
                  </View>
                  <View style={styles.shopMetric}>
                    <Text style={[styles.shopMetricValue, shop.lowStockPacks > 0 ? styles.kpiWarn : null]}>
                      {shop.activePacks}
                    </Text>
                    <Text style={styles.shopMetricLabel}>Packs</Text>
                  </View>
                </View>
              </Pressable>
            ))}
            {allShops.length === 0 ? (
              <View style={ui.card}>
                <Text style={styles.muted}>No shops found for your account.</Text>
              </View>
            ) : null}
          </View>
          )}

        </>
      )}
    </ScrollView>
  );
}

// Soft, modern elevation shared by the dashboard cards — borderless, separated by shadow alone.
const cardShadow = {
  borderWidth: 0,
  shadowColor: "#0f172a",
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: appTheme.colors.background },
  content: { padding: appTheme.spacing.md, gap: appTheme.spacing.md, paddingBottom: appTheme.spacing.xl },
  muted: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
  shopSubtitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: appTheme.spacing.sm },
  // Segmented pill range selector.
  rangeRow: {
    flexDirection: "row",
    gap: 2,
    flex: 1,
    padding: 3,
    borderRadius: 999,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  rangeChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 999,
  },
  rangeChipActive: {
    backgroundColor: appTheme.colors.surface,
    ...cardShadow,
    shadowOpacity: 0.1,
    elevation: 1,
  },
  rangeChipText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  rangeChipTextActive: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium },
  shareBtn: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: appTheme.colors.surface,
    ...cardShadow,
  },
  kpiRow: { flexDirection: "row", gap: appTheme.spacing.sm },
  kpiCard: { flex: 1, gap: 3, alignItems: "flex-start", ...cardShadow },
  kpiValue: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 25, lineHeight: 30, letterSpacing: -0.4 },
  kpiLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  kpiLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
  deltaWrap: { flexDirection: "row", alignItems: "center", gap: 1 },
  deltaText: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  kpiDanger: { color: appTheme.colors.danger },
  kpiWarn: { color: appTheme.colors.warning },
  dualCard: { flex: 1, gap: 10, ...cardShadow },
  dualTitle: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  dualStatsRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  dualStat: { flex: 1, gap: 1 },
  dualValue: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 22, lineHeight: 26, letterSpacing: -0.3 },
  dualLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 11, lineHeight: 14 },
  chartCard: { gap: appTheme.spacing.sm, ...cardShadow },
  chartTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 15, lineHeight: 20, letterSpacing: -0.2 },
  chartRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  chartCol: { flex: 1, alignItems: "center", gap: 4 },
  chartValue: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 9, lineHeight: 12 },
  chartBarTrack: { width: "100%", height: CHART_HEIGHT, justifyContent: "flex-end", alignItems: "center" },
  chartBar: { width: "60%", minHeight: 2, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: appTheme.colors.primary },
  chartLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 10, lineHeight: 13 },
  stackBar: { width: "60%", height: CHART_HEIGHT, flexDirection: "column", borderRadius: 6, overflow: "hidden" },
  stackOut: { width: "100%", backgroundColor: appTheme.colors.danger },
  stackIn: { width: "100%", backgroundColor: appTheme.colors.success },
  legendRow: { flexDirection: "row", gap: appTheme.spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 11 },
  kpiHint: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 10, lineHeight: 13, marginTop: 1 },
  highlightCard: { flex: 1, gap: 4, alignItems: "flex-start", ...cardShadow },
  highlightHeader: { flexDirection: "row", alignItems: "center", gap: 4 },
  highlightLabel: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  highlightShop: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  highlightValue: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  section: { gap: appTheme.spacing.sm, marginTop: appTheme.spacing.xs },
  sectionTitle: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 16, textTransform: "uppercase", letterSpacing: 0.6, marginLeft: 2 },
  attentionCard: { gap: 4, borderLeftWidth: 3, borderLeftColor: appTheme.colors.danger, ...cardShadow },
  attentionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  attentionShop: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  issueText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
  allClearCard: { flexDirection: "row", alignItems: "center", gap: 8, ...cardShadow },
  allClearText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  shopCard: { gap: 8, ...cardShadow },
  shopHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  shopName: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  scorePill: { minWidth: 32, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, alignItems: "center" },
  scorePillText: { color: appTheme.colors.onPrimary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  shopDayStatus: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  shopMetricsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  shopMetric: { alignItems: "center", flex: 1, gap: 2 },
  shopMetricValue: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 16, lineHeight: 20, letterSpacing: -0.2 },
  shopMetricLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 11, lineHeight: 14 },
  tableHead: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingBottom: 8 },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: appTheme.colors.borderSoft,
  },
  thShop: { flex: 1, color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  thNum: { width: 74, textAlign: "center", color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, lineHeight: 14, textTransform: "uppercase", letterSpacing: 0.4 },
  thChevron: { width: 18 },
  tdShop: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  tdNum: { width: 74, textAlign: "center", color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 16, lineHeight: 20, letterSpacing: -0.2 },
});
