import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { DateTimeField, formatDateValue, parseDateValue } from "../../components/DateTimeField";
import { DateRangeQuickPicks } from "../../components/DateRangeQuickPicks";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { ReportActionBar } from "../../components/ReportActionBar";
import { ScreenContainer } from "../../components/ScreenContainer";
import { toastError, toastSuccess } from "../../components/toast";
import { listVisitorEntriesByRange, signOutVisitor } from "../../api/visitorLogApi";
import { sendReportEmail } from "../../api/reportsApi";
import { useAuth } from "../../auth/AuthContext";
import { MainStackParamList } from "../../types/navigation";
import { VisitorLogEntry } from "../../types/models";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function buildReportHtml(shopName: string, from: string, to: string, entries: VisitorLogEntry[]) {
  const rows = entries
    .map(
      (e) => `
      <tr>
        <td>${escapeHtml(e.visitDate)}</td>
        <td>${escapeHtml(e.visitorName)}${e.isInspector ? " <b>(Inspector)</b>" : ""}</td>
        <td>${escapeHtml(e.organisation ?? "-")}</td>
        <td>${escapeHtml(e.visitType)}</td>
        <td>${escapeHtml(e.timeIn)}</td>
        <td>${escapeHtml(e.timeOut ?? "-")}</td>
        <td>${escapeHtml(e.hostName ?? "-")}</td>
        <td>${escapeHtml(e.vehicleRegistration ?? "-")}</td>
        <td>${escapeHtml(e.purpose ?? "-")}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <style>
      @page { size: landscape; margin: 10mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #0f1720; font-size: 12px; margin: 20px; }
      .title { font-size: 20px; font-weight: 700; }
      .subtitle { color: #475569; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; vertical-align: top; }
      th { background: #f1f5f9; }
      .foot { margin-top: 14px; color: #64748b; }
    </style></head><body>
      <div class="title">Visitors Log Report</div>
      <div class="subtitle">Shop: ${escapeHtml(shopName)} | Range: ${escapeHtml(from)} to ${escapeHtml(to)} | Total: ${entries.length}</div>
      <table>
        <thead><tr>
          <th>Date</th><th>Visitor</th><th>Organisation</th><th>Type</th><th>In</th><th>Out</th><th>Host</th><th>Vehicle</th><th>Reason</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="9">No visitors found for this range.</td></tr>'}</tbody>
      </table>
      <div class="foot">Generated from the digital Visitors Log.</div>
    </body></html>`;
}

export function VisitorLogReportScreen() {
  const { activeShopId, activeShop, profile } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, "VisitorLogReport">>();
  const queryClient = useQueryClient();
  const [fromDate, setFromDate] = useState(() => {
    if (route.params?.from) return route.params.from;
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return formatDateValue(d);
  });
  const [toDate, setToDate] = useState(() => route.params?.to ?? formatDateValue(new Date()));
  const [emailing, setEmailing] = useState(false);

  const signOutMutation = useMutation({
    mutationFn: (entryId: string) => signOutVisitor(entryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["visitor-range"] });
      void queryClient.invalidateQueries({ queryKey: ["visitor-daily-log"] });
      void queryClient.invalidateQueries({ queryKey: ["visitor-on-site"] });
    },
    onError: (e: any) =>
      toastError(e?.response?.data?.message ?? "Unable to sign visitor out."),
  });

  const confirmSignOut = (entry: VisitorLogEntry) => {
    Alert.alert("Sign out visitor?", `Mark ${entry.visitorName} as left now?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", onPress: () => signOutMutation.mutate(entry.id) },
    ]);
  };

  const rangeIsValid = useMemo(() => {
    const f = parseDateValue(fromDate);
    const t = parseDateValue(toDate);
    return Boolean(f && t && f.getTime() <= t.getTime());
  }, [fromDate, toDate]);

  const reportQuery = useQuery({
    queryKey: ["visitor-range", activeShopId, fromDate, toDate],
    queryFn: () => listVisitorEntriesByRange(activeShopId as string, fromDate, toDate),
    enabled: Boolean(activeShopId) && rangeIsValid,
  });
  const entries = reportQuery.data ?? [];
  const onSiteCount = entries.filter((e) => e.isOnSite).length;

  const buildHtml = () => buildReportHtml(activeShop?.shopName ?? "-", fromDate, toDate, entries);

  const printReport = async () => {
    try {
      await Print.printAsync({ html: buildHtml(), orientation: Print.Orientation.landscape });
    } catch (e: any) {
      toastError(e?.message ?? "Unable to open print dialog.");
    }
  };

  const shareReport = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html: buildHtml() });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Share unavailable", "Sharing is not available on this device.");
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Visitors Log ${fromDate} to ${toDate}`, UTI: "com.adobe.pdf" });
    } catch (e: any) {
      toastError(e?.message ?? "Unable to generate or share PDF.");
    }
  };

  const emailReport = async () => {
    try {
      setEmailing(true);
      const { uri } = await Print.printToFileAsync({ html: buildHtml() });
      const attachmentBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      await sendReportEmail({
        recipientEmail: profile?.email,
        subject: `Visitors Log Report (${fromDate} to ${toDate})`,
        body: `Please find attached the Visitors Log Report for ${fromDate} to ${toDate}. Total visits: ${entries.length}.`,
        isBodyHtml: false,
        attachmentFileName: `visitors-log-${fromDate}-to-${toDate}.pdf`,
        attachmentBase64,
      });
      toastSuccess(`Report sent to ${profile?.email ?? "your inbox"}.`);
    } catch (e: any) {
      toastError(e?.response?.data?.message ?? e?.message ?? "Unable to send report email.");
    } finally {
      setEmailing(false);
    }
  };

  const disabled = !rangeIsValid || reportQuery.isLoading || entries.length === 0;

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
        <DateRangeQuickPicks from={fromDate} to={toDate} onSelect={(f, t) => { setFromDate(f); setToDate(t); }} style={{ marginBottom: 8 }} />
        <View style={styles.rangeRow}>
          <DateTimeField style={styles.flex1} mode="date" value={fromDate} onChange={setFromDate} maximumDate={new Date()} />
          <DateTimeField style={styles.flex1} mode="date" value={toDate} onChange={setToDate} maximumDate={new Date()} />
        </View>
        {!rangeIsValid ? <Text style={styles.warning}>From date must be on or before To date.</Text> : null}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{entries.length}</Text>
            <Text style={styles.metricLabel}>Visits</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{onSiteCount}</Text>
            <Text style={styles.metricLabel}>Still on site</Text>
          </View>
        </View>
        <ReportActionBar
          actions={[
            { icon: "print-outline", label: "Print", onPress: () => void printReport(), disabled },
            { icon: "mail-outline", label: emailing ? "Sending…" : "Email", onPress: () => void emailReport(), disabled: disabled || emailing },
            { icon: "share-social-outline", label: "Share", onPress: () => void shareReport(), disabled },
          ]}
        />
      </View>

      <View style={ui.card}>
        <Text style={styles.cardTitle}>Loaded visits ({fromDate} to {toDate})</Text>
        {reportQuery.isLoading ? <LoadingState inline /> : null}
        {!reportQuery.isLoading && entries.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No visitors found"
            message="No visitors found for this range."
          />
        ) : null}
        {entries.map((e) => {
          const onSite = !e.timeOut;
          const signingOutThisRow = signOutMutation.isPending && signOutMutation.variables === e.id;
          return (
            <Pressable
              key={e.id}
              style={styles.rowItem}
              onPress={() => navigation.navigate("VisitorLogEntryEdit", { entryId: e.id })}
              accessibilityRole="button"
              accessibilityLabel={`Open visit by ${e.visitorName}`}
            >
              <Text style={styles.rowName} numberOfLines={1}>{e.visitDate} · {e.visitorName}{e.isInspector ? " ⚑" : ""}</Text>
              <Text style={styles.meta}>
                {e.visitType}{e.organisation ? ` · ${e.organisation}` : ""} · In {e.timeIn}{e.timeOut ? ` · Out ${e.timeOut}` : " · on site"}
              </Text>
              {onSite ? (
                <Pressable
                  style={styles.signOutButton}
                  onPress={() => confirmSignOut(e)}
                  disabled={signingOutThisRow}
                  accessibilityRole="button"
                  accessibilityLabel={`Sign out ${e.visitorName}`}
                  hitSlop={6}
                >
                  <Text style={styles.signOutButtonText}>{signingOutThisRow ? "Signing out…" : "Sign out"}</Text>
                </Pressable>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 18, lineHeight: 23 },
  cardTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 16, lineHeight: 20 },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
  warning: { color: appTheme.colors.warning, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  rangeRow: { flexDirection: "row", gap: appTheme.spacing.xs },
  flex1: { flex: 1 },
  metricsRow: { flexDirection: "row", gap: appTheme.spacing.xs },
  metricCard: { flex: 1, borderWidth: 1, borderColor: appTheme.colors.border, borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceMuted, paddingVertical: appTheme.spacing.xs, alignItems: "center", gap: 2 },
  metricValue: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 18, lineHeight: 20 },
  metricLabel: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 11 },
  actionRow: { flexDirection: "row", gap: appTheme.spacing.xs },
  rowItem: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: appTheme.colors.borderSoft, gap: 4 },
  rowName: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  signOutButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surface,
    marginTop: 2,
  },
  signOutButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
});
