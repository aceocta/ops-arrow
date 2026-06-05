import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { getTemperatureLogsReport, sendReportEmail } from "../../api/reportsApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue, parseDateValue } from "../../components/DateTimeField";
import { DateRangeQuickPicks } from "../../components/DateRangeQuickPicks";
import { ReportActionButton } from "../../components/ReportActionButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SkeletonList } from "../../components/Skeleton";
import { toastError } from "../../components/toast";
import { StatusBadge } from "../../components/StatusBadge";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import {
  buildTemperatureRangeReportHtml,
  groupTemperatureReadingsByDateAndUnit,
  sortTemperatureReadingsForReport,
} from "./temperatureReportUtils";

function monthAgo(baseDate: Date) {
  const next = new Date(baseDate);
  const day = next.getDate();
  next.setMonth(next.getMonth() - 1);

  if (next.getDate() !== day) {
    next.setDate(0);
  }

  return next;
}

function isValidRange(from: string, to: string) {
  const fromDate = parseDateValue(from);
  const toDate = parseDateValue(to);

  if (!fromDate || !toDate) {
    return false;
  }

  return fromDate.getTime() <= toDate.getTime();
}

function formatTemperature(value: number) {
  return `${value.toFixed(1)} C`;
}

type FlatReadingRow =
  | { kind: "date"; key: string; date: string; totalReadings: number }
  | { kind: "unit"; key: string; date: string; unitName: string; readingCount: number }
  | {
      kind: "reading";
      key: string;
      reading: {
        id: string;
        equipmentType: string;
        isOutOfRange: boolean;
        readingTime?: string;
        temperatureCelsius: number;
        minTemperatureCelsius: number;
        maxTemperatureCelsius: number;
        recordedByName?: string;
        checkedByInitials?: string;
        actionTaken?: string;
        notes?: string;
      };
    };

export function TemperatureLogsReportScreen() {
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;

  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(formatDateValue(monthAgo(today)));
  const [toDate, setToDate] = useState(formatDateValue(today));
  const rangeIsValid = isValidRange(fromDate, toDate);

  const readingsQuery = useQuery({
    queryKey: ["temperature-range-report", shopId, fromDate, toDate],
    queryFn: () => getTemperatureLogsReport(shopId as string, fromDate, toDate),
    enabled: Boolean(shopId) && rangeIsValid,
  });

  const readings = useMemo(
    () => sortTemperatureReadingsForReport(readingsQuery.data ?? []),
    [readingsQuery.data]
  );
  const groups = useMemo(() => groupTemperatureReadingsByDateAndUnit(readings), [readings]);
  const flatRows = useMemo<FlatReadingRow[]>(() => {
    const rows: FlatReadingRow[] = [];
    for (const group of groups) {
      const totalReadings = group.units.reduce((sum, unit) => sum + unit.entries.length, 0);
      rows.push({ kind: "date", key: `date:${group.date}`, date: group.date, totalReadings });
      for (const unit of group.units) {
        rows.push({
          kind: "unit",
          key: `unit:${group.date}:${unit.unitName}`,
          date: group.date,
          unitName: unit.unitName,
          readingCount: unit.entries.length,
        });
        for (const reading of unit.entries) {
          rows.push({ kind: "reading", key: `reading:${reading.id}`, reading: reading as any });
        }
      }
    }
    return rows;
  }, [groups]);
  const outOfRangeCount = useMemo(
    () => readings.filter((reading) => reading.isOutOfRange).length,
    [readings]
  );
  const inRangeCount = readings.length - outOfRangeCount;
  const reportDateTime = useMemo(() => {
    const now = new Date();
    return `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }, [readings.length, fromDate, toDate]);
  const emailReportMutation = useMutation({
    mutationFn: async () => {
      const html = buildTemperatureRangeReportHtml({
        shopName: activeShop?.shopName ?? "-",
        from: fromDate,
        to: toDate,
        generatedOn: new Date().toISOString(),
        readings,
      });

      const { uri } = await Print.printToFileAsync({
        html,
        width: 792,
        height: 612,
      });
      const attachmentBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const attachmentFileName = `temperature-logs-report-${fromDate}-to-${toDate}.pdf`;
      const outOfRange = readings.filter((entry) => entry.isOutOfRange).length;
      const inRange = readings.length - outOfRange;

      await sendReportEmail({
        recipientEmail: profile?.email,
        subject: `Temperature Logs Report (${fromDate} to ${toDate})`,
        body: `Please find attached the Temperature Logs Report for ${fromDate} to ${toDate}. In range: ${inRange}. Out of range: ${outOfRange}.`,
        isBodyHtml: false,
        attachmentFileName,
        attachmentBase64,
      });
    },
  });

  const buildReportHtml = () =>
    buildTemperatureRangeReportHtml({
      shopName: activeShop?.shopName ?? "-",
      from: fromDate,
      to: toDate,
      generatedOn: new Date().toISOString(),
      readings,
    });

  const printReport = async () => {
    try {
      const html = buildReportHtml();

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
      const html = buildReportHtml();
      const { uri } = await Print.printToFileAsync({ html, width: 792, height: 612 });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Share unavailable", "Sharing is not available on this device.");
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Temperature Logs Report ${fromDate} to ${toDate}`,
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

  const keyExtractor = useCallback((row: FlatReadingRow) => row.key, []);
  const renderItem = useCallback(({ item }: { item: FlatReadingRow }) => {
    if (item.kind === "date") {
      return (
        <View style={styles.groupHeader}>
          <Text style={styles.groupTitle}>Date: {item.date}</Text>
          <StatusBadge
            label={`${item.totalReadings} reading${item.totalReadings === 1 ? "" : "s"}`}
            tone="neutral"
          />
        </View>
      );
    }
    if (item.kind === "unit") {
      return (
        <View style={styles.unitHeader}>
          <Text style={styles.unitTitle}>{item.unitName}</Text>
          <StatusBadge
            label={`${item.readingCount} reading${item.readingCount === 1 ? "" : "s"}`}
            tone="neutral"
          />
        </View>
      );
    }
    const reading = item.reading;
    return (
      <View style={styles.entryCard}>
        <View style={styles.entryHeader}>
          <Text style={styles.entryUnit}>{reading.equipmentType}</Text>
          <StatusBadge
            label={reading.isOutOfRange ? "Out of range" : "In range"}
            tone={reading.isOutOfRange ? "danger" : "success"}
          />
        </View>
        <Text style={styles.entryMeta}>{reading.readingTime || "--:--"}</Text>
        <Text style={styles.entryTemp}>
          {formatTemperature(Number(reading.temperatureCelsius))} (Range{" "}
          {formatTemperature(reading.minTemperatureCelsius)} to{" "}
          {formatTemperature(reading.maxTemperatureCelsius)})
        </Text>
        <Text style={styles.meta}>
          Checked by: {reading.recordedByName ?? reading.checkedByInitials ?? "-"}
        </Text>
        {reading.actionTaken ? <Text style={styles.meta}>Action: {reading.actionTaken}</Text> : null}
        {reading.notes ? <Text style={styles.meta}>Notes: {reading.notes}</Text> : null}
      </View>
    );
  }, []);

  const ListHeader = useMemo(
    () => (
      <View>
        <View style={ui.card}>
          <Text style={styles.sectionTitle}>Temperature Logs Range Report</Text>
          <Text style={styles.subtitle}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <Text style={styles.meta}>Report Date Time: {reportDateTime}</Text>
          <DateRangeQuickPicks from={fromDate} to={toDate} onSelect={(f, t) => { setFromDate(f); setToDate(t); }} style={{ marginBottom: 8 }} />
          <View style={styles.rangeRow}>
            <DateTimeField style={{ flex: 1 }} mode="date" value={fromDate} onChange={setFromDate} />
            <DateTimeField style={{ flex: 1 }} mode="date" value={toDate} onChange={setToDate} />
          </View>
          {!rangeIsValid ? <Text style={styles.warning}>From date must be earlier than or equal to To date.</Text> : null}
          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{readings.length}</Text>
              <Text style={styles.metricLabel}>Total</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{inRangeCount}</Text>
              <Text style={styles.metricLabel}>In range</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{outOfRangeCount}</Text>
              <Text style={styles.metricLabel}>Out of range</Text>
            </View>
          </View>
          <View style={styles.actionRow}>
            <ReportActionButton
              icon="print-outline"
              label="Print"
              onPress={() => void printReport()}
              disabled={!rangeIsValid || readingsQuery.isLoading || readings.length === 0}
            />
            <ReportActionButton
              icon="mail-outline"
              label={emailReportMutation.isPending ? "Sending..." : "Email"}
              onPress={() => void emailReport()}
              disabled={!rangeIsValid || readingsQuery.isLoading || readings.length === 0 || emailReportMutation.isPending}
            />
            <ReportActionButton
              icon="share-social-outline"
              label="Share"
              onPress={() => void shareReport()}
              disabled={!rangeIsValid || readingsQuery.isLoading || readings.length === 0}
            />
          </View>
        </View>

        <View style={[ui.card, { marginTop: 16 }]}>
          <Text style={styles.sectionTitle}>Loaded Logs ({fromDate} to {toDate})</Text>
          {readingsQuery.isLoading ? <SkeletonList count={4} rowHeight={92} /> : null}
          {!readingsQuery.isLoading && readings.length === 0 ? (
            <Text style={styles.meta}>No temperature logs found for this date range.</Text>
          ) : null}
        </View>
      </View>
    ),
    [
      activeShop?.shopName,
      reportDateTime,
      fromDate,
      toDate,
      rangeIsValid,
      readings.length,
      inRangeCount,
      outOfRangeCount,
      readingsQuery.isLoading,
      emailReportMutation.isPending,
    ]
  );

  return (
    <ScreenContainer scrollable={false}>
      <FlatList
        data={flatRows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: 32 }}
        removeClippedSubviews
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={9}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  subtitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  warning: {
    color: appTheme.colors.warning,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  rangeRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
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
    alignItems: "center",
    gap: 2,
  },
  metricValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 18,
    lineHeight: 20,
  },
  metricLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 11,
    lineHeight: 13,
  },
  actionRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  groupBlock: {
    gap: appTheme.spacing.xs,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  groupTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  unitBlock: {
    gap: appTheme.spacing.xs,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    padding: appTheme.spacing.sm,
  },
  unitHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  unitTitle: {
    flex: 1,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  entryCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    padding: appTheme.spacing.sm,
    gap: 4,
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  entryUnit: {
    flex: 1,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  entryMeta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  entryTemp: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
});
