import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { sendReportEmail } from "../../api/reportsApi";
import {
  getRefusalEntryReviewSignature,
  getRefusalEntrySignature,
  listRefusalEntriesByRange,
} from "../../api/refusalRegisterApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue, parseDateValue } from "../../components/DateTimeField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import {
  buildRefusalRangeReportHtml,
  groupEntriesByReviewedDateTime,
  sortRefusalEntriesForReport,
} from "./refusalReportUtils";
import { getStaffDisplayName } from "./refusalStaffUtils";

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

export function RefusalReportScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;

  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(formatDateValue(monthAgo(today)));
  const [toDate, setToDate] = useState(formatDateValue(today));

  const rangeIsValid = isValidRange(fromDate, toDate);

  const rangeQuery = useQuery({
    queryKey: ["refusal-range-report", shopId, fromDate, toDate],
    queryFn: () => listRefusalEntriesByRange(shopId as string, fromDate, toDate),
    enabled: Boolean(shopId) && rangeIsValid,
  });

  const entries = useMemo(() => sortRefusalEntriesForReport(rangeQuery.data ?? []), [rangeQuery.data]);
  const groupedEntries = useMemo(() => groupEntriesByReviewedDateTime(entries), [entries]);
  const reviewedCount = useMemo(() => entries.filter((entry) => Boolean(entry.reviewedOn)).length, [entries]);
  const pendingCount = entries.length - reviewedCount;
  const reviewRate = entries.length > 0 ? Math.round((reviewedCount / entries.length) * 100) : 0;
  const reportDateTime = useMemo(() => {
    const now = new Date();
    return `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }, [entries.length, fromDate, toDate]);
  const emailReportMutation = useMutation({
    mutationFn: async () => {
      const html = await buildReportHtml();
      await sendReportEmail({
        recipientEmail: profile?.email,
        subject: `No ID / No Sale Refusal Report (${fromDate} to ${toDate})`,
        body: html,
        isBodyHtml: true,
      });
    },
  });

  const buildReportHtml = async () => {
    const pdfEntries = await Promise.all(
      entries.map(async (entry) => {
        const [staffSignatureDataUrl, managerSignatureDataUrl] = await Promise.all([
          entry.signatureImagePath ? getRefusalEntrySignature(entry.id).catch(() => undefined) : Promise.resolve(undefined),
          entry.reviewSignatureImagePath
            ? getRefusalEntryReviewSignature(entry.id).catch(() => undefined)
            : Promise.resolve(undefined),
        ]);

        return {
          sequenceNo: entry.sequenceNo,
          refusalDate: entry.refusalDate,
          product: entry.product,
          refusalTime: entry.refusalTime,
          personDescription: entry.personDescription,
          observations: entry.observations,
          staffMemberInitials: getStaffDisplayName(entry),
          staffSignatureDataUrl,
          reviewedOn: entry.reviewedOn,
          reviewedByName: entry.reviewedByName,
          reviewNotes: entry.reviewNotes,
          managerSignatureDataUrl,
        };
      })
    );

    return buildRefusalRangeReportHtml({
      shopName: activeShop?.shopName ?? "-",
      from: fromDate,
      to: toDate,
      entries: pdfEntries,
      reportGeneratedOn: new Date().toISOString(),
    });
  };

  const printReport = async () => {
    try {
      const html = await buildReportHtml();
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
      const html = await buildReportHtml();
      const { uri } = await Print.printToFileAsync({ html, width: 792, height: 612 });
      const canShare = await Sharing.isAvailableAsync();

      if (!canShare) {
        Alert.alert("Share unavailable", "Sharing is not available on this device.");
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Refusals Register ${fromDate} to ${toDate}`,
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

  return (
    <ScreenContainer>
      <View style={styles.screenHeaderCard}>
        <View style={styles.screenHeaderTop}>
          <View style={styles.screenHeaderTitleWrap}>
            {/* <Text style={styles.screenHeaderEyebrow}>No ID / No Sale</Text> */}
            <Text style={styles.screenHeaderTitle}>Refusal Report</Text>
            <Text style={styles.subtitle}>Shop: {activeShop?.shopName ?? "-"}</Text>
          </View>
          <StatusBadge label={pendingCount > 0 ? "Attention Needed" : "Healthy"} tone={pendingCount > 0 ? "warning" : "success"} />
        </View>
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{entries.length}</Text>
            <Text style={styles.metricLabel}>Total</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{reviewedCount}</Text>
            <Text style={styles.metricLabel}>Reviewed</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{reviewRate}%</Text>
            <Text style={styles.metricLabel}>Reviewed</Text>
          </View>
        </View>
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Report Filters</Text>
        <Text style={styles.sectionSubtitle}>Choose the date range and generate printable output.</Text>
        <Text style={styles.meta}>Report Date Time: {reportDateTime}</Text>
        <View style={styles.rangeRow}>
          <DateTimeField style={{ flex: 1 }} mode="date" value={fromDate} onChange={setFromDate} />
          <DateTimeField style={{ flex: 1 }} mode="date" value={toDate} onChange={setToDate} />
        </View>
        {!rangeIsValid ? <Text style={styles.warning}>From date must be earlier than or equal to To date.</Text> : null}
        <View style={styles.actionRow}>
          <PrimaryButton
            label="Print Report PDF"
            onPress={() => void printReport()}
            disabled={!rangeIsValid || rangeQuery.isLoading || entries.length === 0}
          />
          <PrimaryButton
            label={emailReportMutation.isPending ? "Sending..." : "Email Report"}
            onPress={() => void emailReport()}
            tone="neutral"
            disabled={!rangeIsValid || rangeQuery.isLoading || entries.length === 0 || emailReportMutation.isPending}
          />
          <PrimaryButton
            label="Share / Email PDF"
            onPress={() => void shareReport()}
            tone="neutral"
            disabled={!rangeIsValid || rangeQuery.isLoading || entries.length === 0}
          />
        </View>
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Refusal Entries ({fromDate} to {toDate})</Text>
        <Text style={styles.sectionSubtitle}>Grouped by review completion timestamp.</Text>
        {rangeQuery.isLoading ? <Text style={styles.meta}>Loading entries...</Text> : null}
        {!rangeQuery.isLoading && entries.length === 0 ? (
          <Text style={styles.meta}>No refusal entries found for this date range.</Text>
        ) : null}
        {groupedEntries.map((group) => (
          <View key={group.key} style={styles.groupBlock}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              <StatusBadge
                label={`${group.entries.length} entr${group.entries.length === 1 ? "y" : "ies"}`}
                tone={group.pending ? "warning" : "success"}
              />
            </View>
            {group.entries.map((entry) => (
              <View key={entry.id} style={styles.entryItem}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryNo}>No. {entry.sequenceNo}</Text>
                  <StatusBadge label={entry.reviewedOn ? "Reviewed" : "Pending"} tone={entry.reviewedOn ? "success" : "warning"} />
                </View>
                <Text style={styles.entryProduct}>{entry.product}</Text>
                <Text style={styles.entryTime}>{entry.refusalDate} {entry.refusalTime || "--:--"}</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Person</Text>
                  <Text style={styles.detailValue}>{entry.personDescription}</Text>
                </View>
                {entry.observations ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Observations</Text>
                    <Text style={styles.detailValue}>{entry.observations}</Text>
                  </View>
                ) : null}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Staff</Text>
                  <Text style={styles.detailValue}>{getStaffDisplayName(entry)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Manager</Text>
                  <Text style={styles.detailValue}>{entry.reviewedOn ? `Reviewed by ${entry.reviewedByName ?? "-"}` : "Pending"}</Text>
                </View>
                <View style={styles.entryFooterRow}>
                  <StatusBadge label={entry.signatureImagePath ? "Signed" : "No Signature"} tone={entry.signatureImagePath ? "success" : "danger"} />
                  <Pressable
                    style={styles.rowActionButton}
                    onPress={() => navigation.navigate("RefusalEntryDetails", { entryId: entry.id })}
                  >
                    <Text style={styles.rowActionButtonText}>View Details</Text>
                  </Pressable>
                </View>
              </View>
            ))}
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
    backgroundColor: "#F1F6FC",
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
  sectionSubtitle: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
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
  entryItem: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    padding: appTheme.spacing.sm,
    gap: 6,
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
  detailRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  detailLabel: {
    width: 85,
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  detailValue: {
    flex: 1,
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
  rowActionButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  rowActionButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  entryFooterRow: {
    marginTop: appTheme.spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
});
