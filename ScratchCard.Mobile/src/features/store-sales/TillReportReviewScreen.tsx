import React from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  classifyTillReportLine,
  confirmTillReport,
  getTillReport,
  upsertTillPayment,
} from "../../api/tillReportsApi";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { MainStackParamList } from "../../types/navigation";
import { listShopPaymentTypes } from "../../api/shopPaymentTypesApi";
import { TillLineClassification, TillLineSource, TillReportStatus, TillReportType } from "../../types/enums";
import { ShopPaymentType, TillReportLine } from "../../types/models";
import { formatGbp } from "../../utils/currency";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<MainStackParamList, "TillReportReview">;

export function TillReportReviewScreen({ route, navigation }: Props) {
  const { reportId } = route.params;
  const queryClient = useQueryClient();

  const reportQuery = useQuery({
    queryKey: ["till-report", reportId],
    queryFn: () => getTillReport(reportId),
  });

  const classifyMutation = useMutation({
    mutationFn: (input: { lineId: string; classification: TillLineClassification }) =>
      classifyTillReportLine(reportId, input.lineId, input.classification),
    onSuccess: (updated) => {
      queryClient.setQueryData(["till-report", reportId], updated);
    },
    onError: () => Alert.alert("Update failed", "Could not update that line. Please try again."),
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmTillReport(reportId),
    onSuccess: (updated) => {
      queryClient.setQueryData(["till-report", reportId], updated);
      void queryClient.invalidateQueries({ queryKey: ["till-reports"] });
      navigation.navigate("TillReportHistory");
    },
    onError: () => Alert.alert("Confirm failed", "Could not confirm this report. Please try again."),
  });

  const report = reportQuery.data;

  const paymentTypesQuery = useQuery({
    queryKey: ["shop-payment-types", report?.shopId],
    queryFn: () => listShopPaymentTypes(report?.shopId as string),
    enabled: Boolean(report?.shopId),
  });
  const paymentTypes: ShopPaymentType[] = paymentTypesQuery.data ?? [];

  // Keyed by payment type id; allows any number of tenders the shop has configured.
  const [tenders, setTenders] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (!report) return;
    const next: Record<string, string> = {};
    for (const payment of report.payments) {
      if (payment.paymentTypeId) {
        next[payment.paymentTypeId] = String(payment.amount);
      }
    }
    setTenders(next);
  }, [report]);

  const saveTenderMutation = useMutation({
    mutationFn: async () => {
      const parse = (value: string) => {
        const trimmed = value.trim();
        if (trimmed === "") return null;
        const num = Number(trimmed);
        return Number.isFinite(num) && num >= 0 ? num : null;
      };
      let latest = report!;
      for (const type of paymentTypes) {
        const raw = tenders[type.id];
        if (raw === undefined) continue;
        const amount = parse(raw);
        if (amount !== null) {
          latest = await upsertTillPayment(reportId, type.id, amount);
        }
      }
      return latest;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["till-report", reportId], updated);
      Alert.alert("Saved", "Tender amounts updated.");
    },
    onError: () => Alert.alert("Save failed", "Could not save tender amounts."),
  });

  const isConfirmed = report?.status === TillReportStatus.Confirmed;
  const unclassifiedCount = report?.unclassifiedCount ?? 0;
  const isBusy = classifyMutation.isPending || confirmMutation.isPending || saveTenderMutation.isPending;

  return (
    <ScreenContainer
      footer={
        report && !isConfirmed ? (
          <PrimaryButton
            label={confirmMutation.isPending ? "Saving..." : unclassifiedCount > 0 ? `Confirm (${unclassifiedCount} untagged)` : "Confirm ledger"}
            onPress={() => confirmMutation.mutate()}
            disabled={isBusy}
          />
        ) : undefined
      }
    >
      {reportQuery.isLoading ? <Text style={ui.bodyText}>Loading…</Text> : null}
      {reportQuery.isError ? <Text style={styles.error}>Could not load this till report.</Text> : null}

      {report ? (
        <>
          <View style={ui.card}>
            <Text style={ui.sectionTitle}>{report.businessDate}</Text>
            <Text style={ui.caption}>
              {report.reportType === TillReportType.Shift ? "Shift report" : "Day-end report"}
              {report.attachmentCount > 1 ? ` · ${report.attachmentCount} photos` : ""}
            </Text>
            <View style={styles.totalsRow}>
              <View style={styles.totalTile}>
                <Text style={styles.totalLabel}>Income</Text>
                <Text style={[styles.totalValue, styles.income]}>{formatGbp(report.totalIncome)}</Text>
              </View>
              <View style={styles.totalTile}>
                <Text style={styles.totalLabel}>Expense</Text>
                <Text style={[styles.totalValue, styles.expense]}>{formatGbp(report.totalExpense)}</Text>
              </View>
              <View style={styles.totalTile}>
                <Text style={styles.totalLabel}>Net</Text>
                <Text style={styles.totalValue}>{formatGbp(report.net)}</Text>
              </View>
            </View>
            {isConfirmed ? (
              <Text style={styles.confirmedNote}>This report is confirmed and locked.</Text>
            ) : unclassifiedCount > 0 ? (
              <Text style={styles.warnNote}>{unclassifiedCount} line(s) still need tagging.</Text>
            ) : (
              <Text style={ui.caption}>All lines tagged. Ready to confirm.</Text>
            )}
          </View>

          <View style={ui.card}>
            <Text style={ui.sectionTitle}>Payments (tender)</Text>
            <Text style={ui.caption}>How takings were paid. Auto-read where possible — adjust if needed.</Text>
            {paymentTypes.length === 0 ? (
              <Text style={styles.warnNote}>No payment types configured for this shop yet.</Text>
            ) : (
              paymentTypes.map((type) => (
                <TenderRow
                  key={type.id}
                  label={type.name}
                  value={tenders[type.id] ?? ""}
                  disabled={isConfirmed || isBusy}
                  onChange={(v) => setTenders((s) => ({ ...s, [type.id]: v }))}
                />
              ))
            )}
            {!isConfirmed && paymentTypes.length > 0 ? (
              <PrimaryButton
                size="sm"
                tone="neutral"
                label={saveTenderMutation.isPending ? "Saving..." : "Save tender"}
                onPress={() => saveTenderMutation.mutate()}
                disabled={isBusy}
              />
            ) : null}
            {report.businessDayId ? (
              <Pressable
                style={styles.summaryLink}
                onPress={() => navigation.navigate("TillPaymentSummary", { businessDayId: report.businessDayId! })}
              >
                <Text style={styles.summaryLinkText}>View shift & day payment totals</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={ui.card}>
            <Text style={ui.sectionTitle}>Lines</Text>
            {report.lines.length === 0 ? (
              <Text style={ui.bodyText}>No lines were read from this report.</Text>
            ) : (
              report.lines.map((line) => (
                <LineRow
                  key={line.id}
                  line={line}
                  disabled={isBusy || isConfirmed}
                  onClassify={(classification) => classifyMutation.mutate({ lineId: line.id, classification })}
                />
              ))
            )}
          </View>
        </>
      ) : null}
    </ScreenContainer>
  );
}

function LineRow({
  line,
  disabled,
  onClassify,
}: {
  line: TillReportLine;
  disabled: boolean;
  onClassify: (classification: TillLineClassification) => void;
}) {
  const isIncome = line.classification === TillLineClassification.Income;
  const isExpense = line.classification === TillLineClassification.Expense;
  const accentStyle = isIncome ? styles.accentIncome : isExpense ? styles.accentExpense : styles.accentNeutral;
  const amountStyle = isIncome ? styles.amountIncome : isExpense ? styles.amountExpense : styles.amountNeutral;

  return (
    <View style={styles.lineRow}>
      <View style={[styles.accent, accentStyle]} />
      <View style={styles.lineBody}>
        <View style={styles.lineMain}>
          <View style={styles.lineDescWrap}>
            <Text style={styles.lineDesc} numberOfLines={2}>
              {line.rawDescription}
            </Text>
            {line.source === TillLineSource.Ai ? (
              <View style={styles.aiTag}>
                <Text style={styles.aiTagText}>AI · tap to confirm</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.lineAmount, amountStyle]}>{formatGbp(line.amount)}</Text>
        </View>
        <View style={styles.segment}>
          <SegmentOption
            label="Income"
            tone="income"
            active={isIncome}
            disabled={disabled}
            onPress={() => onClassify(TillLineClassification.Income)}
          />
          <View style={styles.segmentDivider} />
          <SegmentOption
            label="Expense"
            tone="expense"
            active={isExpense}
            disabled={disabled}
            onPress={() => onClassify(TillLineClassification.Expense)}
          />
        </View>
      </View>
    </View>
  );
}

function TenderRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.tenderRow}>
      <Text style={styles.tenderLabel}>{label}</Text>
      <View style={styles.tenderInputWrap}>
        <Text style={styles.tenderPrefix}>£</Text>
        <TextInput
          style={styles.tenderInput}
          value={value}
          onChangeText={onChange}
          editable={!disabled}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={appTheme.colors.textSubtle}
        />
      </View>
    </View>
  );
}

function SegmentOption({
  label,
  active,
  tone,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  tone: "income" | "expense";
  disabled: boolean;
  onPress: () => void;
}) {
  const activeBg = tone === "income" ? styles.segIncomeOn : styles.segExpenseOn;
  const activeText = tone === "income" ? styles.segTextIncomeOn : styles.segTextExpenseOn;
  const activeColor = tone === "income" ? appTheme.colors.success : appTheme.colors.danger;
  return (
    <Pressable
      style={[styles.segOption, active ? activeBg : null, disabled ? styles.segDisabled : null]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {active ? <Ionicons name="checkmark-circle" size={14} color={activeColor} /> : null}
      <Text style={[styles.segText, active ? activeText : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  error: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.body, fontSize: 13 },
  totalsRow: { flexDirection: "row", gap: appTheme.spacing.sm },
  totalTile: {
    flex: 1,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: 10,
    gap: 4,
  },
  totalLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 14 },
  totalValue: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15, lineHeight: 19 },
  income: { color: appTheme.colors.success },
  expense: { color: appTheme.colors.danger },
  confirmedNote: { color: appTheme.colors.success, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
  warnNote: { color: appTheme.colors.warning, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
  tenderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  tenderLabel: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  tenderInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: 10,
    minWidth: 130,
  },
  tenderPrefix: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 14 },
  tenderInput: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, paddingVertical: 9, textAlign: "right" },
  summaryLink: { paddingTop: 4 },
  summaryLinkText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 17 },
  lineRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    overflow: "hidden",
  },
  accent: { width: 3, alignSelf: "stretch" },
  accentIncome: { backgroundColor: appTheme.colors.success },
  accentExpense: { backgroundColor: appTheme.colors.danger },
  accentNeutral: { backgroundColor: appTheme.colors.warning },
  lineBody: { flex: 1, padding: 10, gap: 8 },
  lineMain: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  lineDescWrap: { flex: 1, gap: 3 },
  lineDesc: { color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 17 },
  aiTag: {
    alignSelf: "flex-start",
    backgroundColor: appTheme.colors.surfaceInfoMuted,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  aiTagText: { color: appTheme.colors.info, fontFamily: appTheme.fonts.bodyMedium, fontSize: 10, lineHeight: 13 },
  lineAmount: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 15, lineHeight: 19 },
  amountIncome: { color: appTheme.colors.success },
  amountExpense: { color: appTheme.colors.danger },
  amountNeutral: { color: appTheme.colors.text },
  segment: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    overflow: "hidden",
  },
  segmentDivider: { width: 1, backgroundColor: appTheme.colors.border },
  segOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
  },
  segIncomeOn: { backgroundColor: appTheme.colors.surfaceSuccessMuted },
  segExpenseOn: { backgroundColor: appTheme.colors.surfaceDangerSoft },
  segDisabled: { opacity: 0.5 },
  segText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 15 },
  segTextIncomeOn: { color: appTheme.colors.success },
  segTextExpenseOn: { color: appTheme.colors.danger },
});
