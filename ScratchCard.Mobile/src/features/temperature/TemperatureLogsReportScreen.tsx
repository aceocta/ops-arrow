import React, { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Print from "expo-print";
import { sendReportEmail } from "../../api/reportsApi";
import { listTemperatureReadings } from "../../api/temperatureLogsApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue, parseDateValue } from "../../components/DateTimeField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
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

export function TemperatureLogsReportScreen() {
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;

  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(formatDateValue(monthAgo(today)));
  const [toDate, setToDate] = useState(formatDateValue(today));
  const rangeIsValid = isValidRange(fromDate, toDate);

  const readingsQuery = useQuery({
    queryKey: ["temperature-range-report", shopId, fromDate, toDate],
    queryFn: () => listTemperatureReadings(shopId as string, fromDate, toDate),
    enabled: Boolean(shopId) && rangeIsValid,
  });

  const readings = useMemo(
    () => sortTemperatureReadingsForReport(readingsQuery.data ?? []),
    [readingsQuery.data]
  );
  const groups = useMemo(() => groupTemperatureReadingsByDateAndUnit(readings), [readings]);
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

      await sendReportEmail({
        recipientEmail: profile?.email,
        subject: `Temperature Logs Report (${fromDate} to ${toDate})`,
        body: html,
        isBodyHtml: true,
      });
    },
  });

  const printReport = async () => {
    try {
      const html = buildTemperatureRangeReportHtml({
        shopName: activeShop?.shopName ?? "-",
        from: fromDate,
        to: toDate,
        generatedOn: new Date().toISOString(),
        readings,
      });

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

  const emailReport = async () => {
    try {
      await emailReportMutation.mutateAsync();
      const recipient = profile?.email ?? "your inbox";
      Alert.alert("Email sent", `Report has been sent to ${recipient}.`);
    } catch (error: any) {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to send report email.");
    }
  };

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Temperature Logs Range Report</Text>
        <Text style={styles.subtitle}>Shop: {activeShop?.shopName ?? "-"}</Text>
        <Text style={styles.meta}>Report Date Time: {reportDateTime}</Text>
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
          <PrimaryButton
            label="Print Report PDF"
            onPress={() => void printReport()}
            tone="neutral"
            disabled={!rangeIsValid || readingsQuery.isLoading || readings.length === 0}
          />
          <PrimaryButton
            label={emailReportMutation.isPending ? "Sending..." : "Email Report"}
            onPress={() => void emailReport()}
            tone="neutral"
            disabled={!rangeIsValid || readingsQuery.isLoading || readings.length === 0 || emailReportMutation.isPending}
          />
        </View>
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Loaded Logs ({fromDate} to {toDate})</Text>
        {readingsQuery.isLoading ? <Text style={styles.meta}>Loading logs...</Text> : null}
        {!readingsQuery.isLoading && readings.length === 0 ? (
          <Text style={styles.meta}>No temperature logs found for this date range.</Text>
        ) : null}
        {groups.map((group) => {
          const totalReadings = group.units.reduce((sum, unit) => sum + unit.entries.length, 0);

          return (
            <View key={group.date} style={styles.groupBlock}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>Date: {group.date}</Text>
                <StatusBadge
                  label={`${totalReadings} reading${totalReadings === 1 ? "" : "s"}`}
                  tone="neutral"
                />
              </View>
              {group.units.map((unit) => (
                <View key={`${group.date}-${unit.unitName}`} style={styles.unitBlock}>
                  <View style={styles.unitHeader}>
                    <Text style={styles.unitTitle}>Unit: {unit.unitName}</Text>
                    <StatusBadge
                      label={`${unit.entries.length} reading${unit.entries.length === 1 ? "" : "s"}`}
                      tone="neutral"
                    />
                  </View>
                  {unit.entries.map((reading) => (
                    <View key={reading.id} style={styles.entryCard}>
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
                  ))}
                </View>
              ))}
            </View>
          );
        })}
      </View>
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
