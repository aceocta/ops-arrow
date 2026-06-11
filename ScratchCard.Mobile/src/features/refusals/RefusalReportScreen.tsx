import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { sendReportEmail } from "../../api/reportsApi";
import {
  getRefusalEntryReviewSignature,
  getRefusalEntrySignature,
  listRefusalEntriesByRange,
} from "../../api/refusalRegisterApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue, parseDateValue } from "../../components/DateTimeField";
import { DateRangeQuickPicks } from "../../components/DateRangeQuickPicks";
import { EmptyState } from "../../components/EmptyState";
import { ReportActionBar } from "../../components/ReportActionBar";
import { ScreenContainer } from "../../components/ScreenContainer";
import { toastError, toastSuccess } from "../../components/toast";
import { SkeletonList } from "../../components/Skeleton";
import { StatusBadge } from "../../components/StatusBadge";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { useFeature } from "../subscription/useFeature";
import { UpgradeNotice } from "../subscription/FeatureGate";
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
  const route = useRoute<RouteProp<MainStackParamList, "RefusalReport">>();
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;
  // The date-range refusal report is a Pro analytics feature.
  const analyticsFeature = useFeature("refusal_log.analytics");

  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(route.params?.from ?? formatDateValue(monthAgo(today)));
  const [toDate, setToDate] = useState(route.params?.to ?? formatDateValue(today));

  const rangeIsValid = isValidRange(fromDate, toDate);

  const rangeQuery = useQuery({
    queryKey: ["refusal-range-report", shopId, fromDate, toDate],
    queryFn: () => listRefusalEntriesByRange(shopId as string, fromDate, toDate),
    enabled: Boolean(shopId) && rangeIsValid && analyticsFeature.isAllowed,
  });

  const entries = useMemo(() => sortRefusalEntriesForReport(rangeQuery.data ?? []), [rangeQuery.data]);
  const groupedEntries = useMemo(() => groupEntriesByReviewedDateTime(entries), [entries]);
  type FlatRow =
    | { kind: "group"; key: string; title: string; count: number; pending: boolean }
    | { kind: "entry"; key: string; entry: any };
  const flatRows = useMemo<FlatRow[]>(() => {
    const rows: FlatRow[] = [];
    for (const group of groupedEntries) {
      rows.push({
        kind: "group",
        key: `group:${group.key}`,
        title: group.title,
        count: group.entries.length,
        pending: group.pending,
      });
      for (const entry of group.entries) {
        rows.push({ kind: "entry", key: `entry:${entry.id}`, entry });
      }
    }
    return rows;
  }, [groupedEntries]);
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
      const { uri } = await Print.printToFileAsync({
        html,
        width: 792,
        height: 612,
      });
      const attachmentBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const attachmentFileName = `refusal-report-${fromDate}-to-${toDate}.pdf`;

      await sendReportEmail({
        recipientEmail: profile?.email,
        subject: `Refusal Log Report (${fromDate} to ${toDate})`,
        body: `Please find attached the Refusal Log Report for ${fromDate} to ${toDate}.`,
        attachmentFileName,
        attachmentBase64,
      });
    },
  });

  const signatureCacheRef = useRef(new Map<string, string | undefined>());

  useEffect(() => {
    signatureCacheRef.current.clear();
  }, [shopId, fromDate, toDate]);

  const fetchSignatureCached = useCallback(async (cacheKey: string, fetcher: () => Promise<string | undefined>) => {
    const cache = signatureCacheRef.current;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    const value = await fetcher().catch(() => undefined);
    cache.set(cacheKey, value);
    return value;
  }, []);

  const buildReportHtml = async () => {
    const pdfEntries = await Promise.all(
      entries.map(async (entry) => {
        const [staffSignatureDataUrl, managerSignatureDataUrl] = await Promise.all([
          entry.signatureImagePath
            ? fetchSignatureCached(`staff:${entry.id}`, () => getRefusalEntrySignature(entry.id))
            : Promise.resolve(undefined),
          entry.reviewSignatureImagePath
            ? fetchSignatureCached(`review:${entry.id}`, () => getRefusalEntryReviewSignature(entry.id))
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
      toastError(error?.message ?? "Unable to open print dialog.");
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
      toastError(error?.message ?? "Unable to generate or share PDF.");
    }
  };

  const emailReport = async () => {
    try {
      await emailReportMutation.mutateAsync();
      const recipient = profile?.email ?? "your inbox";
      toastSuccess(`Report sent to ${recipient}.`);
    } catch (error: any) {
      toastError(error?.response?.data?.message ?? error?.message ?? "Unable to send report email.");
    }
  };

  if (!analyticsFeature.isLoading && !analyticsFeature.isAllowed) {
    return (
      <ScreenContainer>
        <UpgradeNotice
          feature="refusal_log.analytics"
          title="Refusal analytics is a Pro feature"
          message="Date-range refusal reports and analytics are available on the Pro plan."
        />
      </ScreenContainer>
    );
  }

  const keyExtractor = useCallback((row: FlatRow) => row.key, []);
  const renderItem = useCallback(
    ({ item }: { item: FlatRow }) => {
      if (item.kind === "group") {
        return (
          <View style={styles.groupHeader}>
            <Text style={styles.groupTitle}>{item.title}</Text>
            <StatusBadge
              label={`${item.count} entr${item.count === 1 ? "y" : "ies"}`}
              tone={item.pending ? "warning" : "success"}
            />
          </View>
        );
      }
      const entry = item.entry;
      return (
        <View style={styles.entryItem}>
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
              <Text style={styles.rowActionButtonText}>View details</Text>
            </Pressable>
          </View>
        </View>
      );
    },
    [navigation]
  );

  const ListHeader = useMemo(
    () => (
      <View>
        <View style={styles.screenHeaderCard}>
          <View style={styles.screenHeaderTop}>
            <View style={styles.screenHeaderTitleWrap}>
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

        <View style={[ui.card, { marginTop: 16 }]}>
          <Text style={styles.sectionTitle}>Report Filters</Text>
          <Text style={styles.sectionSubtitle}>Choose the date range and generate printable output.</Text>
          <Text style={styles.meta}>Report Date Time: {reportDateTime}</Text>
          <DateRangeQuickPicks from={fromDate} to={toDate} onSelect={(f, t) => { setFromDate(f); setToDate(t); }} style={{ marginBottom: 8 }} />
          <View style={styles.rangeRow}>
            <DateTimeField style={{ flex: 1 }} mode="date" value={fromDate} onChange={setFromDate} />
            <DateTimeField style={{ flex: 1 }} mode="date" value={toDate} onChange={setToDate} />
          </View>
          {!rangeIsValid ? <Text style={styles.warning}>From date must be earlier than or equal to To date.</Text> : null}
          <ReportActionBar
            actions={[
              {
                icon: "print-outline",
                label: "Print",
                onPress: () => void printReport(),
                disabled: !rangeIsValid || rangeQuery.isLoading || entries.length === 0,
              },
              {
                icon: "mail-outline",
                label: emailReportMutation.isPending ? "Sending…" : "Email",
                onPress: () => void emailReport(),
                disabled: !rangeIsValid || rangeQuery.isLoading || entries.length === 0 || emailReportMutation.isPending,
              },
              {
                icon: "share-social-outline",
                label: "Share",
                onPress: () => void shareReport(),
                disabled: !rangeIsValid || rangeQuery.isLoading || entries.length === 0,
              },
            ]}
          />
        </View>

        <View style={[ui.card, { marginTop: 16 }]}>
          <Text style={styles.sectionTitle}>Refusal Entries ({fromDate} to {toDate})</Text>
          <Text style={styles.sectionSubtitle}>Grouped by review completion timestamp.</Text>
          {rangeQuery.isLoading ? <SkeletonList count={4} rowHeight={92} /> : null}
          {!rangeQuery.isLoading && entries.length === 0 ? (
            <EmptyState
              icon="hand-left-outline"
              title="No refusal entries"
              message="No refusal entries found for this date range."
            />
          ) : null}
        </View>
      </View>
    ),
    [
      activeShop?.shopName,
      pendingCount,
      entries.length,
      reviewedCount,
      reviewRate,
      reportDateTime,
      fromDate,
      toDate,
      rangeIsValid,
      rangeQuery.isLoading,
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
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenHeaderCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surfaceNeutralSoft,
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
  reportActionRow: {
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


