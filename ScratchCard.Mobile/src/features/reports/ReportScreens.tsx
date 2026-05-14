import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
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
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
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
  return `\u00A3 ${Number(value ?? 0).toFixed(2)}`;
}

function DailyReportActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.dailyActionButton, disabled ? styles.dailyActionButtonDisabled : null]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={16} color={appTheme.colors.primary} />
      <Text style={styles.dailyActionButtonText}>{label}</Text>
    </Pressable>
  );
}

function getDifferenceValue(row: { difference?: number }) {
  return Number(row.difference ?? 0);
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

function getDayAggregate(rows: Array<{ soldQuantity?: number; salesAmount: number; difference?: number }>) {
  const totalQuantity = rows.reduce((acc, row) => acc + Number(row.soldQuantity ?? 0), 0);
  const totalSales = rows.reduce((acc, row) => acc + Number(row.salesAmount ?? 0), 0);
  const totalDifference = rows.reduce((acc, row) => acc + getDifferenceValue(row), 0);
  return { totalQuantity, totalSales, totalDifference };
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
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;
  const [from, setFrom] = useState(formatDateValue(new Date()));
  const [to, setTo] = useState(formatDateValue(new Date()));

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
    () => (query.data ?? []).reduce((sum, row) => sum + getDifferenceValue(row), 0),
    [query.data]
  );

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
      Alert.alert("Failed", error?.message ?? "Unable to open print dialog.");
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
      Alert.alert("Failed", error?.message ?? "Unable to generate or share PDF.");
    }
  };

  const emailReport = async () => {
    try {
      await emailReportMutation.mutateAsync();
      const recipient = profile?.email ?? "your inbox";
      Alert.alert("Email sent", `Report has been sent to ${recipient}.`);
    } catch (error: any) {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to send report email.");
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
          <View style={styles.dailyReportHeader}>
            <View style={styles.dailyReportHeaderMain}>
              <Text style={styles.reportEyebrow}>Scratch Card</Text>
              <Text style={styles.reportTitle}>Daily Sales Report</Text>
              <Text style={styles.reportShop}>Shop: {activeShop?.shopName ?? "-"}</Text>
              <Text style={styles.reportMetaText}>Report Date Time: {reportDateTime}</Text>
            </View>
            <StatusBadge label={`${totalDays} days`} tone="neutral" />
          </View>

          <DateRangeInputs from={from} to={to} setFrom={setFrom} setTo={setTo} />

          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValueLarge}>{totalDays}</Text>
              <Text style={styles.metricLabel}>Days</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValueLarge}>{totalShifts}</Text>
              <Text style={styles.metricLabel}>Shifts</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{formatCurrency(totalSales)}</Text>
              <Text style={styles.metricLabel}>Total Sales</Text>
            </View>
            <View style={styles.metricCard}>
              <Text
                style={[
                  styles.metricValueLarge,
                  totalMissingTickets > 0 ? styles.varianceTextNegative : null,
                ]}
              >
                {totalMissingTickets}
              </Text>
              <Text style={styles.metricLabel}>Missing Tickets</Text>
            </View>
          </View>

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
            <DailyReportActionButton
              icon="print-outline"
              label="Print"
              onPress={() => void printReport()}
              disabled={query.isLoading || totalShifts === 0}
            />
            <DailyReportActionButton
              icon="mail-outline"
              label={emailReportMutation.isPending ? "Sending..." : "Email"}
              onPress={() => void emailReport()}
              disabled={query.isLoading || totalShifts === 0 || emailReportMutation.isPending}
            />
            <DailyReportActionButton
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
                    <Text style={styles.groupTitle}>{businessDate}</Text>
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
                    <Text style={styles.meta}>Total Sales: {formatCurrency(dayAggregate.totalSales)}</Text>
                    <Text style={styles.meta}>Number of Tickets: {dayAggregate.totalQuantity}</Text>
                    <Text style={[styles.meta, dayMissingCount > 0 ? styles.varianceTextNegative : null]}>
                      Missing Tickets: {dayMissingCount}
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.dayReviewCard}>
                  <Text style={styles.dayReviewTitle}>Day Close Payouts</Text>
                  <Text style={styles.meta}>
                    Lotto Payout: {dayClosePayouts?.lottoPayout != null ? formatCurrency(Number(dayClosePayouts.lottoPayout)) : "-"}
                  </Text>
                  <Text style={styles.meta}>
                    Scratch Card Payout: {dayClosePayouts?.scratchCardPayout != null ? formatCurrency(Number(dayClosePayouts.scratchCardPayout)) : "-"}
                  </Text>
                  <Text style={styles.meta}>
                    Till Payout: {dayClosePayouts?.tillPayout != null ? formatCurrency(Number(dayClosePayouts.tillPayout)) : "-"}
                  </Text>
                  <Text
                    style={[
                      styles.meta,
                      payoutDifference != null && payoutDifference > 0.009 ? styles.varianceTextPositive : null,
                      payoutDifference != null && payoutDifference < -0.009 ? styles.varianceTextNegative : null,
                    ]}
                  >
                    Difference ((Lotto + Scratch) - Till): {payoutDifference != null ? formatCurrency(payoutDifference) : "-"}
                  </Text>
                </View>
                <View style={styles.dayReviewCard}>
                  <Text style={styles.dayReviewTitle}>Missing Ticket Details (Opening Serial)</Text>
                  {dayMissingDetails.length === 0 ? (
                    <Text style={styles.meta}>No missing-ticket detail rows recorded for this day.</Text>
                  ) : (
                    dayMissingDetails.map((detail, index) => (
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
                    ))
                  )}
                </View>
                <View style={styles.shiftTableWrap}>
                  <View style={styles.shiftTableHeaderRow}>
                    <Text style={[styles.shiftTableHeaderCell, styles.shiftColName]}>Shift</Text>
                    <Text style={[styles.shiftTableHeaderCell, styles.shiftColSales]}>Sales</Text>
                    <Text style={[styles.shiftTableHeaderCell, styles.shiftColQty]}>Qty</Text>
                    <Text style={[styles.shiftTableHeaderCell, styles.shiftColDiff]}>Difference</Text>
                  </View>
                  {(rows ?? []).map((row, index) => (
                    <Pressable
                      key={`${row.businessDate}-${row.shiftName}-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Open shift details for ${row.shiftName} on ${row.businessDate}`}
                      style={[
                        styles.shiftTableRow,
                        isPositiveVariance(row) ? styles.shiftTableRowPositive : null,
                        isNegativeVariance(row) ? styles.shiftTableRowNegative : null,
                      ]}
                      onPress={() => openShiftDetailsFromReport(row.businessDate, row.shiftName)}
                    >
                      <View style={styles.shiftColName}>
                        <Text style={styles.shiftTablePrimary}>{row.shiftName}</Text>
                        <Text
                          style={[
                            styles.shiftTableSecondary,
                            isPositiveVariance(row) ? styles.varianceTextPositive : null,
                            isNegativeVariance(row) ? styles.varianceTextNegative : null,
                          ]}
                        >
                          {isPositiveVariance(row) ? "Over" : isNegativeVariance(row) ? "Short" : "Balanced"}
                        </Text>
                      </View>
                      <Text style={[styles.shiftTableValue, styles.shiftColSales]}>
                        {formatCurrency(Number(row.salesAmount))}
                      </Text>
                      <Text style={[styles.shiftTableValue, styles.shiftColQty]}>
                        {Number(row.soldQuantity ?? 0)}
                      </Text>
                      <Text
                        style={[
                          styles.shiftTableValue,
                          styles.shiftColDiff,
                          isPositiveVariance(row) ? styles.varianceTextPositive : null,
                          isNegativeVariance(row) ? styles.varianceTextNegative : null,
                        ]}
                      >
                        {formatCurrency(getDifferenceValue(row))}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

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

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <DateRangeInputs from={from} to={to} setFrom={setFrom} setTo={setTo} />
          {(query.data ?? []).map((row, index) => (
            <View
              style={[
                styles.item,
                isPositiveVariance(row) ? styles.itemVariancePositive : null,
                isNegativeVariance(row) ? styles.itemVarianceNegative : null,
              ]}
              key={`${row.businessDate}-${row.shiftName}-${index}`}
            >
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>{row.businessDate} | {row.shiftName}</Text>
                {isPositiveVariance(row) ? <StatusBadge label="Over" tone="warning" /> : null}
                {isNegativeVariance(row) ? <StatusBadge label="Short" tone="danger" /> : null}
                {!hasVariance(row) ? <StatusBadge label="Balanced" tone="success" /> : null}
              </View>
              <Text style={styles.meta}>Total Sales: {formatCurrency(Number(row.salesAmount))}</Text>
              <Text style={styles.meta}>Qty: {Number(row.soldQuantity ?? 0)}</Text>
              <Text
                style={[
                  styles.meta,
                  isPositiveVariance(row) ? styles.varianceTextPositive : null,
                  isNegativeVariance(row) ? styles.varianceTextNegative : null,
                ]}
              >
                Difference: {formatCurrency(getDifferenceValue(row))}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
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
  const query = useQuery({
    queryKey: ["report-audit-log", shopId, from, to],
    queryFn: () => getAuditLogReport(shopId as string, from, to),
    enabled: Boolean(shopId) && from.length === 10 && to.length === 10,
  });

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
    gap: appTheme.spacing.xs,
  },
  metricCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingVertical: appTheme.spacing.xs,
    paddingHorizontal: appTheme.spacing.xs,
    alignItems: "center",
    gap: 2,
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
  dailyActionButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#F2F6FC",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
  },
  dailyActionButtonDisabled: {
    opacity: 0.5,
  },
  dailyActionButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
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

