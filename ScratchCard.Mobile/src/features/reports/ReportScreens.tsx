import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { listBusinessDays } from "../../api/businessDaysApi";
import { useAuth } from "../../auth/AuthContext";
import {
  getAuditLogReport,
  getDailySalesReport,
  getManualReviewReport,
  getNotificationLogReport,
  sendReportEmail,
  getShiftSalesReport,
  getStockReport,
} from "../../api/reportsApi";
import { listShifts } from "../../api/shiftsApi";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { ReportActionButton } from "../../components/ReportActionButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { toastError } from "../../components/toast";
import { useFeature } from "../subscription/useFeature";
import { UpgradeNotice } from "../subscription/FeatureGate";
import { StatusBadge } from "../../components/StatusBadge";
import { formatGbp } from "../../utils/currency";
import type { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { buildScratchCardDailySalesReportHtml } from "./scratchCardReportUtils";

function DateRangeInputs({
  from,
  to,
  setFrom,
  setTo,
}: {
  from: string;
  to: string;
  setFrom: (value: string) => void;
  setTo: (value: string) => void;
}) {
  return (
    <View style={styles.row}>
      <DateTimeField style={{ flex: 1 }} mode="date" value={from} onChange={setFrom} placeholder="From date" />
      <DateTimeField style={{ flex: 1 }} mode="date" value={to} onChange={setTo} placeholder="To date" />
    </View>
  );
}

function formatCurrency(value: number) {
  return formatGbp(Number(value ?? 0));
}

function getDifferenceValue(row: { difference?: number }) {
  return Number(row.difference ?? 0);
}

function getPayoutBasedDifference(row: {
  difference?: number;
  lottoPayout?: number | null;
  scratchCardPayout?: number | null;
  tillPayout?: number | null;
}) {
  if (row.lottoPayout != null && row.scratchCardPayout != null && row.tillPayout != null) {
    return Number(row.lottoPayout) + Number(row.scratchCardPayout) - Number(row.tillPayout);
  }

  return getDifferenceValue(row);
}

function hasVariance(row: { difference?: number }) {
  return Math.abs(getDifferenceValue(row)) > 0.009;
}

function isPositiveVariance(row: { difference?: number }) {
  return getDifferenceValue(row) > 0.009;
}

function isNegativeVariance(row: { difference?: number }) {
  return getDifferenceValue(row) < -0.009;
}

function getDayAggregate(rows: Array<{ soldQuantity?: number; salesAmount: number; prizePayout?: number; difference?: number }>) {
  const totalQuantity = rows.reduce((acc, row) => acc + Number(row.soldQuantity ?? 0), 0);
  const totalSales = rows.reduce((acc, row) => acc + Number(row.salesAmount ?? 0), 0);
  const totalPrizePayout = rows.reduce((acc, row) => acc + Number(row.prizePayout ?? 0), 0);
  const totalNetTake = totalSales - totalPrizePayout;
  const avgTicketPrice = totalQuantity > 0 ? totalSales / totalQuantity : 0;
  const totalDifference = rows.reduce((acc, row) => acc + getDifferenceValue(row), 0);
  return { totalQuantity, totalSales, totalPrizePayout, totalNetTake, avgTicketPrice, totalDifference };
}

const REPORT_MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const REPORT_WEEKDAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatBusinessDate(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (monthIndex < 0 || monthIndex > 11) return isoDate;
  const date = new Date(Date.UTC(year, monthIndex, day));
  const weekday = REPORT_WEEKDAY_NAMES_SHORT[date.getUTCDay()];
  const monthShort = REPORT_MONTH_NAMES_SHORT[monthIndex];
  const dayStr = String(day).padStart(2, "0");
  return `${weekday}, ${dayStr} ${monthShort} ${year}`;
}

function getDayClosePayoutSnapshot(rows: Array<{ lottoPayout?: number; scratchCardPayout?: number; tillPayout?: number }>) {
  const firstWithPayouts = rows.find((row) =>
    row.lottoPayout != null ||
    row.scratchCardPayout != null ||
    row.tillPayout != null
  );
  return firstWithPayouts;
}

function normalizeShiftName(shiftName: string) {
  return shiftName.trim().toLowerCase();
}

export function DailySalesReportScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, "DailySalesReport">>();
  const initialDate = route.params?.date ?? formatDateValue(new Date());
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;
  const [from, setFrom] = useState(initialDate);
  const [to, setTo] = useState(initialDate);

  const query = useQuery({
    queryKey: ["report-daily-sales", shopId, from, to],
    queryFn: () => getDailySalesReport(shopId as string, from, to),
    enabled: Boolean(shopId) && from.length === 10 && to.length === 10,
  });

  const groupedRows = useMemo(() => {
    const groups: Record<string, typeof query.data> = {};
    for (const row of query.data ?? []) {
      const key = row.businessDate;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key]?.push(row);
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [query.data]);

  const totalShifts = query.data?.length ?? 0;
  const totalDays = groupedRows.length;
  const totalSales = useMemo(
    () => (query.data ?? []).reduce((sum, row) => sum + Number(row.salesAmount ?? 0), 0),
    [query.data]
  );
  const totalDifference = useMemo(
    () => {
      const differenceByDate = new Map<string, number>();
      for (const row of query.data ?? []) {
        if (!differenceByDate.has(row.businessDate)) {
          differenceByDate.set(row.businessDate, getPayoutBasedDifference(row));
        }
      }

      return [...differenceByDate.values()].reduce((sum, value) => sum + value, 0);
    },
    [query.data]
  );
  const totalPrizePayouts = useMemo(
    () => (query.data ?? []).reduce((sum, row) => sum + Number(row.prizePayout ?? 0), 0),
    [query.data],
  );
  const totalNetTake = totalSales - totalPrizePayouts;
  const totalSoldQuantity = useMemo(
    () => (query.data ?? []).reduce((sum, row) => sum + Number(row.soldQuantity ?? 0), 0),
    [query.data],
  );
  const avgTicketPrice = totalSoldQuantity > 0 ? totalSales / totalSoldQuantity : 0;
  const topDay = useMemo(() => {
    if (groupedRows.length < 2) return null;
    let bestDate = "";
    let bestSales = -Infinity;
    for (const [date, rows] of groupedRows) {
      const sales = (rows ?? []).reduce((sum, row) => sum + Number(row.salesAmount ?? 0), 0);
      if (sales > bestSales) {
        bestSales = sales;
        bestDate = date;
      }
    }
    return bestSales > 0 ? { businessDate: bestDate, sales: bestSales } : null;
  }, [groupedRows]);

  const reportDateTime = useMemo(() => {
    const now = new Date();
    return `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }, [from, to, totalShifts]);

  const businessDaysQuery = useQuery({
    queryKey: ["business-days-for-daily-report", shopId, from, to],
    queryFn: () => listBusinessDays(shopId as string, { from, to }),
    enabled: Boolean(shopId) && from.length === 10 && to.length === 10,
  });
  const totalMissingTickets = useMemo(
    () => (businessDaysQuery.data ?? []).reduce((sum, day) => sum + Number(day.missingOpeningTicketCount ?? 0), 0),
    [businessDaysQuery.data],
  );
  const businessDayByDate = useMemo(
    () => new Map((businessDaysQuery.data ?? []).map((day) => [day.businessDate, day])),
    [businessDaysQuery.data],
  );

  const shiftsQuery = useQuery({
    queryKey: ["shifts-for-daily-report", shopId],
    queryFn: () => listShifts(shopId as string),
    enabled: Boolean(shopId),
  });

  const buildDailyReportHtml = () =>
    buildScratchCardDailySalesReportHtml({
      shopName: activeShop?.shopName ?? "-",
      from,
      to,
      rows: query.data ?? [],
      businessDays: businessDaysQuery.data ?? [],
      generatedOn: new Date().toISOString(),
    });

  const emailReportMutation = useMutation({
    mutationFn: async () => {
      const html = buildDailyReportHtml();
      const { uri } = await Print.printToFileAsync({
        html,
        width: 792,
        height: 612,
      });
      const attachmentBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const attachmentFileName = `scratch-card-daily-sales-${from}-to-${to}.pdf`;

      await sendReportEmail({
        recipientEmail: profile?.email,
        subject: `Scratch Card Daily Sales Report (${from} to ${to})`,
        body: `Please find attached the Scratch Card Daily Sales Report for ${from} to ${to}.`,
        attachmentFileName,
        attachmentBase64,
      });
    },
  });

  const printReport = async () => {
    try {
      const html = buildDailyReportHtml();

      await Print.printAsync({
        html,
        width: 792,
        height: 612,
        orientation: Print.Orientation.landscape,
      });
    } catch (error: any) {
      toastError(error?.message ?? "Unable to open print dialog.");
    }
  };

  const shareReport = async () => {
    try {
      const html = buildDailyReportHtml();

      const { uri } = await Print.printToFileAsync({
        html,
        width: 792,
        height: 612,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Share unavailable", "Sharing is not available on this device.");
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Daily Sales Report ${from} to ${to}`,
        UTI: "com.adobe.pdf",
      });
    } catch (error: any) {
      toastError(error?.message ?? "Unable to generate or share PDF.");
    }
  };

  const emailReport = async () => {
    try {
      await emailReportMutation.mutateAsync();
      const recipient = profile?.email ?? "your inbox";
      Alert.alert("Email sent", `Report has been sent to ${recipient}.`);
    } catch (error: any) {
      toastError(error?.response?.data?.message ?? error?.message ?? "Unable to send report email.");
    }
  };

  function openBusinessDateDayManagement(businessDate: string) {
    const matchedDay = (businessDaysQuery.data ?? []).find((day) => day.businessDate === businessDate);
    if (!matchedDay) {
      Alert.alert("Day not found", `No business day record found for ${businessDate}.`);
      return;
    }

    navigation.navigate("DayEndClose", { businessDayId: matchedDay.id });
  }

  function openShiftDetailsFromReport(businessDate: string, shiftName: string) {
    if (!shopId) {
      Alert.alert("Missing shop", "No active shop is selected.");
      return;
    }

    if (businessDaysQuery.isLoading) {
      Alert.alert("Please wait", "Loading business days...");
      return;
    }

    if (shiftsQuery.isLoading) {
      Alert.alert("Please wait", "Loading shifts...");
      return;
    }

    const matchedDay = (businessDaysQuery.data ?? []).find((day) => day.businessDate === businessDate);
    if (!matchedDay) {
      Alert.alert("Day not found", `No business day record found for ${businessDate}.`);
      return;
    }

    const matchedShift = (shiftsQuery.data ?? []).find(
      (shift) =>
        shift.businessDayId === matchedDay.id &&
        normalizeShiftName(shift.shiftName) === normalizeShiftName(shiftName),
    );

    if (!matchedShift) {
      Alert.alert("Shift not found", `No shift details found for ${shiftName} on ${businessDate}.`);
      return;
    }

    navigation.navigate("ShiftDetails", { shiftId: matchedShift.id, shopId });
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.dailyPageContent}>
        <View style={[ui.card, styles.dailyReportCard]}>
       

          <DateRangeInputs from={from} to={to} setFrom={setFrom} setTo={setTo} />

          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, styles.metricCardEmphasis]}>
              <Text style={styles.metricLabel}>Total Sales</Text>
              <Text style={styles.metricValue}>{formatCurrency(totalSales)}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Prize Payouts</Text>
              <Text style={styles.metricValue}>{formatCurrency(totalPrizePayouts)}</Text>
            </View>
            <View style={[styles.metricCard, styles.metricCardEmphasis]}>
              <Text style={styles.metricLabel}>Net Take</Text>
              <Text style={styles.metricValue}>{formatCurrency(totalNetTake)}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Tickets · {formatCurrency(avgTicketPrice)} avg</Text>
              <Text style={styles.metricValueLarge}>{totalSoldQuantity}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Days · Shifts</Text>
              <Text style={styles.metricValueLarge}>{totalDays} · {totalShifts}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Missing Tickets</Text>
              <Text
                style={[
                  styles.metricValueLarge,
                  totalMissingTickets > 0 ? styles.varianceTextNegative : null,
                ]}
              >
                {totalMissingTickets}
              </Text>
            </View>
          </View>

          {topDay ? (
            <View style={styles.topDayCallout}>
              <Text style={styles.topDayLabel}>Top Day</Text>
              <Text style={styles.topDayValue}>
                {formatBusinessDate(topDay.businessDate)} · {formatCurrency(topDay.sales)}
              </Text>
            </View>
          ) : null}

{Math.abs(totalDifference) > 0.009 ? (
          <View
            style={[
              styles.summaryCard,
              totalDifference > 0.009 ? styles.summaryCardPositive : null,
              totalDifference < -0.009 ? styles.summaryCardNegative : null,
            ]}
          >
            <Text
              style={[
                styles.summaryText,
                totalDifference > 0.009 ? styles.varianceTextPositive : null,
                totalDifference < -0.009 ? styles.varianceTextNegative : null,
              ]}
            >
              Net Difference: {formatCurrency(totalDifference)}
            </Text>
          </View>
          ) : null}


          <View style={styles.dailyActionRow}>
            <ReportActionButton
              icon="print-outline"
              label="Print"
              onPress={() => void printReport()}
              disabled={query.isLoading || totalShifts === 0}
            />
            <ReportActionButton
              icon="mail-outline"
              label={emailReportMutation.isPending ? "Sending..." : "Email"}
              onPress={() => void emailReport()}
              disabled={query.isLoading || totalShifts === 0 || emailReportMutation.isPending}
            />
            <ReportActionButton
              icon="share-social-outline"
              label="Share"
              onPress={() => void shareReport()}
              disabled={query.isLoading || totalShifts === 0}
            />
          </View>

          {query.isLoading ? <Text style={styles.meta}>Loading report rows...</Text> : null}
          {!query.isLoading && totalShifts === 0 ? (
            <Text style={styles.meta}>No scratch card sales found for this date range.</Text>
          ) : null}

          {groupedRows.map(([businessDate, rows]) => {
            const dayAggregate = getDayAggregate(rows ?? []);
            const dayClosePayouts = getDayClosePayoutSnapshot(rows ?? []);
            const payoutDifference =
              dayClosePayouts?.lottoPayout != null &&
              dayClosePayouts?.scratchCardPayout != null &&
              dayClosePayouts?.tillPayout != null
                ? Number(dayClosePayouts.lottoPayout) +
                  Number(dayClosePayouts.scratchCardPayout) -
                  Number(dayClosePayouts.tillPayout)
                : null;
            const dayContext = businessDayByDate.get(businessDate);
            const dayMissingCount = Number(dayContext?.missingOpeningTicketCount ?? 0);
            const dayMissingDetails = dayContext?.missingOpeningTicketDetails ?? [];
            const isDayPositive = payoutDifference != null && payoutDifference > 0.009;
            const isDayNegative = payoutDifference != null && payoutDifference < -0.009;

            return (
              <View
                key={businessDate}
                style={[
                  styles.groupSection,
                  styles.groupCard,
                  isDayPositive ? styles.groupCardPositive : null,
                  isDayNegative ? styles.groupCardNegative : null,
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open day management for ${businessDate}`}
                  style={styles.groupHeaderPressable}
                  onPress={() => openBusinessDateDayManagement(businessDate)}
                >
                  <View style={styles.groupHeaderRow}>
                    <Text style={styles.groupTitle}>{formatBusinessDate(businessDate)}</Text>
                    {isDayPositive ? <StatusBadge label="Day Over" tone="warning" /> : null}
                    {isDayNegative ? <StatusBadge label="Day Short" tone="danger" /> : null}
                    {!isDayPositive && !isDayNegative ? <StatusBadge label="Day Balanced" tone="success" /> : null}
                  </View>
                </Pressable>
                <Text style={styles.groupHeaderHint}>Tap day header or summary to open Day Management</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open day management summary for ${businessDate}`}
                  style={styles.daySummaryPressable}
                  onPress={() => openBusinessDateDayManagement(businessDate)}
                >
                  <View style={styles.daySummaryCard}>
                    <View style={styles.shiftStatGrid}>
                      <View style={[styles.shiftStatCell, styles.shiftStatCellHalf]}>
                        <Text style={styles.shiftStatLabel}>Sales</Text>
                        <Text style={styles.shiftStatValue}>{formatCurrency(dayAggregate.totalSales)}</Text>
                      </View>
                      <View style={[styles.shiftStatCell, styles.shiftStatCellHalf]}>
                        <Text style={styles.shiftStatLabel}>Prize Payouts</Text>
                        <Text style={styles.shiftStatValue}>{formatCurrency(dayAggregate.totalPrizePayout)}</Text>
                      </View>
                      <View style={[styles.shiftStatCell, styles.shiftStatCellHalf]}>
                        <Text style={styles.shiftStatLabel}>Net Take</Text>
                        <Text style={styles.shiftStatValue}>{formatCurrency(dayAggregate.totalNetTake)}</Text>
                      </View>
                      <View style={[styles.shiftStatCell, styles.shiftStatCellHalf]}>
                        <Text style={styles.shiftStatLabel}>Tickets</Text>
                        <Text style={styles.shiftStatValue}>{dayAggregate.totalQuantity}</Text>
                      </View>
                      <View style={[styles.shiftStatCell, styles.shiftStatCellHalf]}>
                        <Text style={styles.shiftStatLabel}>Missing Tickets</Text>
                        <Text
                          style={[
                            styles.shiftStatValue,
                            dayMissingCount > 0 ? styles.varianceTextNegative : null,
                          ]}
                        >
                          {dayMissingCount}
                        </Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
                {dayClosePayouts?.lottoPayout != null ||
                dayClosePayouts?.scratchCardPayout != null ||
                dayClosePayouts?.tillPayout != null ? (
                  <View style={styles.dayReviewCard}>
                    <Text style={styles.dayReviewTitle}>Day Close Payouts</Text>
                    <View style={styles.shiftStatGrid}>
                      <View style={[styles.shiftStatCell, styles.shiftStatCellHalf]}>
                        <Text style={styles.shiftStatLabel}>Lotto Payout</Text>
                        <Text style={styles.shiftStatValue}>
                          {dayClosePayouts?.lottoPayout != null ? formatCurrency(Number(dayClosePayouts.lottoPayout)) : "—"}
                        </Text>
                      </View>
                      <View style={[styles.shiftStatCell, styles.shiftStatCellHalf]}>
                        <Text style={styles.shiftStatLabel}>Scratch Card Payout</Text>
                        <Text style={styles.shiftStatValue}>
                          {dayClosePayouts?.scratchCardPayout != null ? formatCurrency(Number(dayClosePayouts.scratchCardPayout)) : "—"}
                        </Text>
                      </View>
                      <View style={[styles.shiftStatCell, styles.shiftStatCellHalf]}>
                        <Text style={styles.shiftStatLabel}>Till Payout</Text>
                        <Text style={styles.shiftStatValue}>
                          {dayClosePayouts?.tillPayout != null ? formatCurrency(Number(dayClosePayouts.tillPayout)) : "—"}
                        </Text>
                      </View>
                      <View style={[styles.shiftStatCell, styles.shiftStatCellHalf]}>
                        <Text style={styles.shiftStatLabel}>Variance</Text>
                        <Text
                          style={[
                            styles.shiftStatValue,
                            payoutDifference != null && payoutDifference > 0.009 ? styles.varianceTextPositive : null,
                            payoutDifference != null && payoutDifference < -0.009 ? styles.varianceTextNegative : null,
                          ]}
                        >
                          {payoutDifference != null ? formatCurrency(payoutDifference) : "—"}
                        </Text>
                      </View>
                    </View>
                   
                  </View>
                ) : null}
                {dayMissingDetails.length > 0 ? (
                  <View style={styles.dayReviewCard}>
                    <Text style={styles.dayReviewTitle}>Missing Ticket Details (Opening Serial)</Text>
                    {dayMissingDetails.map((detail, index) => (
                      <View key={`${detail.shiftId}-${detail.packId}-${index}`} style={styles.dayMissingDetailItem}>
                        <Text style={styles.meta}>Shift: {detail.shiftName}</Text>
                        <Text style={styles.meta}>
                          Display: {detail.displayNumber != null ? `#${detail.displayNumber}` : "-"} | {detail.gameName}
                        </Text>
                        <Text style={styles.meta}>Game Code: {detail.gameCode || "-"}</Text>
                        <Text style={styles.meta}>Pack: {detail.packNumber}</Text>
                        <Text style={styles.meta}>
                          Expected: {detail.expectedOpeningSerialNumber} | Actual: {detail.actualOpeningSerialNumber}
                        </Text>
                        <Text style={[styles.meta, styles.varianceTextNegative]}>Missing Qty: {detail.missingQuantity}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View style={styles.shiftListWrap}>
                  <Text style={styles.shiftListTitle}>Shifts ({(rows ?? []).length})</Text>
                  {(rows ?? []).map((row, index) => {
                    const rowDifference = getPayoutBasedDifference(row);
                    const isRowPositive = rowDifference > 0.009;
                    const isRowNegative = rowDifference < -0.009;
                    const rowSales = Number(row.salesAmount ?? 0);
                    const rowPrizePayout = Number(row.prizePayout ?? 0);
                    const rowNetTake = rowSales - rowPrizePayout;
                    const rowQty = Number(row.soldQuantity ?? 0);
                    const rowAvgTicket = rowQty > 0 ? rowSales / rowQty : 0;
                    return (
                      <Pressable
                        key={`${row.businessDate}-${row.shiftName}-${index}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Open shift details for ${row.shiftName} on ${row.businessDate}`}
                        style={[
                          styles.shiftCard,
                          isRowPositive ? styles.shiftCardPositive : null,
                          isRowNegative ? styles.shiftCardNegative : null,
                        ]}
                        onPress={() => openShiftDetailsFromReport(row.businessDate, row.shiftName)}
                      >
                        <View style={styles.shiftCardHeader}>
                          <Text style={styles.shiftCardTitle}>{row.shiftName}</Text>
                          {isRowPositive ? <StatusBadge label="Over" tone="warning" /> : null}
                          {isRowNegative ? <StatusBadge label="Short" tone="danger" /> : null}
                          {!isRowPositive && !isRowNegative ? <StatusBadge label="Balanced" tone="success" /> : null}
                        </View>
                        <View style={styles.shiftStatGrid}>
                          <View style={styles.shiftStatCell}>
                            <Text style={styles.shiftStatLabel}>Sales</Text>
                            <Text style={styles.shiftStatValue}>{formatCurrency(rowSales)}</Text>
                          </View>
                          <View style={styles.shiftStatCell}>
                            <Text style={styles.shiftStatLabel}>Prize Payouts</Text>
                            <Text style={styles.shiftStatValue}>{formatCurrency(rowPrizePayout)}</Text>
                          </View>
                          <View style={styles.shiftStatCell}>
                            <Text style={styles.shiftStatLabel}>Net Take</Text>
                            <Text style={styles.shiftStatValue}>{formatCurrency(rowNetTake)}</Text>
                          </View>
                          <View style={styles.shiftStatCell}>
                            <Text style={styles.shiftStatLabel}>Tickets</Text>
                            <Text style={styles.shiftStatValue}>{rowQty}</Text>
                          </View>
                          <View style={styles.shiftStatCell}>
                            <Text style={styles.shiftStatLabel}>Avg Ticket</Text>
                            <Text style={styles.shiftStatValue}>{formatCurrency(rowAvgTicket)}</Text>
                          </View>
                          <View style={styles.shiftStatCell}>
                            <Text style={styles.shiftStatLabel}>Variance</Text>
                            <Text
                              style={[
                                styles.shiftStatValue,
                                isRowPositive ? styles.varianceTextPositive : null,
                                isRowNegative ? styles.varianceTextNegative : null,
                              ]}
                            >
                              {formatCurrency(rowDifference)}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

type ShiftSalesRow = {
  businessDate: string;
  shiftName: string;
  salesAmount?: number;
  soldQuantity?: number;
  difference?: number;
};

const ShiftSalesRowItem = React.memo(function ShiftSalesRowItem({ row }: { row: ShiftSalesRow }) {
  const positive = isPositiveVariance(row);
  const negative = isNegativeVariance(row);
  return (
    <View
      style={[
        styles.item,
        positive ? styles.itemVariancePositive : null,
        negative ? styles.itemVarianceNegative : null,
      ]}
    >
      <View style={styles.itemHeader}>
        <Text style={styles.itemTitle}>{row.businessDate} | {row.shiftName}</Text>
        {positive ? <StatusBadge label="Over" tone="warning" /> : null}
        {negative ? <StatusBadge label="Short" tone="danger" /> : null}
        {!hasVariance(row) ? <StatusBadge label="Balanced" tone="success" /> : null}
      </View>
      <Text style={styles.meta}>Total Sales: {formatCurrency(Number(row.salesAmount))}</Text>
      <Text style={styles.meta}>Qty: {Number(row.soldQuantity ?? 0)}</Text>
      <Text
        style={[
          styles.meta,
          positive ? styles.varianceTextPositive : null,
          negative ? styles.varianceTextNegative : null,
        ]}
      >
        Difference: {formatCurrency(getDifferenceValue(row))}
      </Text>
    </View>
  );
});

export function ShiftSalesReportScreen() {
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;
  const [from, setFrom] = useState(formatDateValue(new Date()));
  const [to, setTo] = useState(formatDateValue(new Date()));
  const query = useQuery({
    queryKey: ["report-shift-sales", shopId, from, to],
    queryFn: () => getShiftSalesReport(shopId as string, from, to),
    enabled: Boolean(shopId) && from.length === 10 && to.length === 10,
  });

  const data = (query.data ?? []) as ShiftSalesRow[];
  const renderItem = useCallback(
    ({ item }: { item: ShiftSalesRow }) => <ShiftSalesRowItem row={item} />,
    []
  );
  const keyExtractor = useCallback(
    (row: ShiftSalesRow, index: number) => `${row.businessDate}-${row.shiftName}-${index}`,
    []
  );
  const ListHeader = useMemo(
    () => (
      <View style={[ui.card, { marginBottom: 12 }]}>
        <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
        <DateRangeInputs from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </View>
    ),
    [activeShop?.shopName, from, to]
  );

  return (
    <ScreenContainer scrollable={false}>
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: 32 }}
        removeClippedSubviews
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
      />
    </ScreenContainer>
  );
}

export function ManualClosingReviewScreen() {
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;
  const [from, setFrom] = useState(formatDateValue(new Date()));
  const [to, setTo] = useState(formatDateValue(new Date()));
  const query = useQuery({
    queryKey: ["report-manual-review", shopId, from, to],
    queryFn: () => getManualReviewReport(shopId as string, from, to),
    enabled: Boolean(shopId) && from.length === 10 && to.length === 10,
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <DateRangeInputs from={from} to={to} setFrom={setFrom} setTo={setTo} />
          {(query.data ?? []).map((row, index) => (
            <View style={styles.item} key={`${row.businessDate}-${row.shiftName}-${index}`}>
              <Text style={styles.itemTitle}>{row.businessDate} | {row.shiftName}</Text>
              <Text style={styles.meta}>Cashier: {row.cashier}</Text>
              <Text style={styles.meta}>Pack: {row.packNumber} | Game: {row.gameName}</Text>
              <Text style={styles.meta}>Opening: {row.openingSerial}</Text>
              <Text style={styles.meta}>Original Scanned: {row.originalScannedSerial ?? "-"}</Text>
              <Text style={styles.meta}>Final Closing: {row.finalClosingSerial}</Text>
              <Text style={styles.meta}>Method: {row.entryMethod}</Text>
              <Text style={styles.meta}>Reason: {row.reason || "No reason provided"}</Text>
              <Text style={styles.meta}>Notification Sent: {row.notificationSent ? "Yes" : "No"}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

export function StockReportScreen() {
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;
  const query = useQuery({
    queryKey: ["report-stock", shopId],
    queryFn: () => getStockReport(shopId as string),
    enabled: Boolean(shopId),
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          {(query.data ?? []).map((row, index) => (
            <View style={styles.item} key={`${row.packNumber}-${index}`}>
              <Text style={styles.itemTitle}>{row.packNumber} | {row.gameName}</Text>
              <Text style={styles.meta}>Status: {row.status}</Text>
              <Text style={styles.meta}>Current Serial: {row.currentSerialNumber}</Text>
              <Text style={styles.meta}>Remaining Tickets: {row.remainingTickets}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

export function AuditLogScreen() {
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;
  const [from, setFrom] = useState(formatDateValue(new Date()));
  const [to, setTo] = useState(formatDateValue(new Date()));
  const auditAllowed = useFeature("audit_log.basic");
  const query = useQuery({
    queryKey: ["report-audit-log", shopId, from, to],
    queryFn: () => getAuditLogReport(shopId as string, from, to),
    enabled: Boolean(shopId) && from.length === 10 && to.length === 10 && auditAllowed.isAllowed,
  });

  if (!auditAllowed.isLoading && !auditAllowed.isAllowed) {
    return (
      <ScreenContainer>
        <UpgradeNotice
          feature="audit_log.basic"
          title="Audit Log is a Growth feature"
          message="Upgrade this shop's plan to Growth or Pro to view the audit log."
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <DateRangeInputs from={from} to={to} setFrom={setFrom} setTo={setTo} />
          {(query.data ?? []).map((row) => (
            <View style={styles.item} key={row.id}>
              <Text style={styles.itemTitle}>{row.actionType}</Text>
              <Text style={styles.meta}>Entity: {row.entityName}</Text>
              <Text style={styles.meta}>Entity ID: {row.entityId ?? "-"}</Text>
              <Text style={styles.meta}>Changed By: {row.changedByUserId ?? "-"}</Text>
              <Text style={styles.meta}>Changed On: {new Date(row.changedOn).toLocaleString()}</Text>
              <Text style={styles.meta}>Reason: {row.reason || "-"}</Text>
              <Text style={styles.meta}>IP: {row.ipAddress || "-"}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

export function NotificationLogScreen() {
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;
  const query = useQuery({
    queryKey: ["report-notification-log", shopId],
    queryFn: () => getNotificationLogReport(shopId as string),
    enabled: Boolean(shopId),
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          {(query.data ?? []).map((row) => (
            <View style={styles.item} key={row.id}>
              <Text style={styles.itemTitle}>{row.notificationType} | {row.status}</Text>
              <Text style={styles.meta}>Channel: {row.channel}</Text>
              <Text style={styles.meta}>Recipient: {row.recipient}</Text>
              <Text style={styles.meta}>Subject: {row.subject}</Text>
              <Text style={styles.meta}>Sent: {row.sentOn ? new Date(row.sentOn).toLocaleString() : "-"}</Text>
              {row.failedReason ? <Text style={styles.meta}>Error: {row.failedReason}</Text> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  title: { fontSize: 24, lineHeight: 28, color: appTheme.colors.text, fontFamily: appTheme.fonts.heading },
  dailyPageContent: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
  },
  dailyReportCard: {
    gap: appTheme.spacing.sm,
  },
  dailyReportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: appTheme.spacing.sm,
  },
  dailyReportHeaderMain: {
    flex: 1,
    gap: 2,
  },
  reportEyebrow: {
    color: appTheme.colors.primary,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: appTheme.fonts.bodyMedium,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  reportTitle: {
    color: appTheme.colors.text,
    fontSize: 22,
    lineHeight: 27,
    fontFamily: appTheme.fonts.heading,
  },
  reportShop: {
    color: appTheme.colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  reportMetaText: {
    color: appTheme.colors.textSubtle,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.body,
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  metricCard: {
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingVertical: appTheme.spacing.xs,
    paddingHorizontal: appTheme.spacing.sm,
    alignItems: "flex-start",
    gap: 2,
  },
  metricCardEmphasis: {
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    borderColor: appTheme.colors.primary,
  },
  topDayCallout: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: appTheme.spacing.xs,
    paddingHorizontal: appTheme.spacing.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  topDayLabel: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  topDayValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  metricValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  metricValueLarge: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 17,
    lineHeight: 20,
  },
  metricLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
    textTransform: "uppercase",
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    padding: appTheme.spacing.sm,
  },
  summaryText: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  summaryCardPositive: {
    backgroundColor: appTheme.colors.badgeWarningBg,
    borderColor: appTheme.colors.badgeWarningBorder,
  },
  summaryCardNegative: {
    backgroundColor: appTheme.colors.badgeDangerBg,
    borderColor: appTheme.colors.badgeDangerBorder,
  },
  dailyActionRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  actionRow: {
    gap: appTheme.spacing.xs,
  },
  groupSection: {
    gap: 8,
  },
  groupCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.backgroundAlt,
    padding: appTheme.spacing.sm,
  },
  groupCardPositive: {
    borderColor: appTheme.colors.badgeWarningBorder,
  },
  groupCardNegative: {
    borderColor: appTheme.colors.badgeDangerBorder,
  },
  groupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  groupHeaderPressable: {
    borderRadius: appTheme.radius.sm,
    paddingVertical: 2,
  },
  groupHeaderHint: {
    color: appTheme.colors.primary,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  groupTitle: {
    color: appTheme.colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  daySummaryCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    padding: 10,
    gap: 4,
  },
  daySummaryPressable: {
    borderRadius: appTheme.radius.sm,
  },
  shiftListWrap: {
    gap: 8,
    marginTop: 2,
  },
  shiftItemPressable: {
    borderRadius: appTheme.radius.sm,
  },
  shiftTableWrap: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    overflow: "hidden",
  },
  shiftTableHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: appTheme.colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 8,
  },
  shiftTableHeaderCell: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 12,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  shiftTableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
  },
  shiftTableRowPositive: {
    backgroundColor: appTheme.colors.badgeWarningBg,
  },
  shiftTableRowNegative: {
    backgroundColor: appTheme.colors.badgeDangerBg,
  },
  shiftColName: {
    flex: 2.2,
    minWidth: 0,
  },
  shiftColSales: {
    flex: 1.1,
    textAlign: "right",
  },
  shiftColQty: {
    width: 52,
    textAlign: "right",
  },
  shiftColDiff: {
    width: 92,
    textAlign: "right",
  },
  shiftTablePrimary: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  shiftTableSecondary: {
    color: appTheme.colors.textSubtle,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: appTheme.fonts.body,
  },
  shiftTableValue: {
    color: appTheme.colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  shiftListTitle: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 4,
  },
  shiftCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    padding: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
  },
  shiftCardPositive: {
    backgroundColor: appTheme.colors.badgeWarningBg,
    borderColor: appTheme.colors.badgeWarningBg,
  },
  shiftCardNegative: {
    backgroundColor: appTheme.colors.badgeDangerBg,
    borderColor: appTheme.colors.badgeDangerBg,
  },
  shiftCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  shiftCardTitle: {
    flexShrink: 1,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 14,
    lineHeight: 17,
  },
  shiftStatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: appTheme.spacing.xs,
  },
  shiftStatCell: {
    flexBasis: "33.33%",
    paddingVertical: 2,
    paddingRight: 6,
  },
  shiftStatCellHalf: {
    flexBasis: "49%",
    flexGrow: 1,
    paddingRight: 0,
  },
  shiftStatLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 12,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  shiftStatValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
    marginTop: 2,
  },
  dayReviewFormula: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 10,
    lineHeight: 13,
    fontStyle: "italic",
    marginTop: appTheme.spacing.xs,
  },
  dayReviewCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: 10,
    gap: 4,
  },
  dayMissingDetailItem: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    padding: 8,
    gap: 2,
  },
  dayReviewTitle: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  item: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: 10,
    gap: 4,
  },
  itemVariancePositive: {
    borderColor: appTheme.colors.badgeWarningBorder,
    backgroundColor: appTheme.colors.badgeWarningBg,
  },
  itemVarianceNegative: {
    borderColor: appTheme.colors.badgeDangerBorder,
    backgroundColor: appTheme.colors.badgeDangerBg,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  itemTitle: { color: appTheme.colors.text, fontSize: 14, lineHeight: 18, fontFamily: appTheme.fonts.bodyMedium },
  meta: { color: appTheme.colors.textMuted, fontSize: 13, lineHeight: 18, fontFamily: appTheme.fonts.body },
  varianceTextPositive: { color: appTheme.colors.warning, fontFamily: appTheme.fonts.bodyMedium },
  varianceTextNegative: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.bodyMedium },
});


