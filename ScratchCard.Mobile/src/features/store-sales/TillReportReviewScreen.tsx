import React from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
import { TillLineClassification, TillLineSource, TillPaymentType, TillReportStatus, TillReportType } from "../../types/enums";
import { TillReportLine } from "../../types/models";
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

  const [tender, setTender] = React.useState({ cash: "", card: "", other: "" });
  React.useEffect(() => {
    if (!report) return;
    const amountFor = (type: TillPaymentType) => {
      const found = report.payments.find((p) => p.paymentType === type);
      return found ? String(found.amount) : "";
    };
    setTender({
      cash: amountFor(TillPaymentType.Cash),
      card: amountFor(TillPaymentType.Card),
      other: amountFor(TillPaymentType.Other),
    });
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
      const entries: Array<[TillPaymentType, string]> = [
        [TillPaymentType.Cash, tender.cash],
        [TillPaymentType.Card, tender.card],
        [TillPaymentType.Other, tender.other],
      ];
      for (const [type, raw] of entries) {
        const amount = parse(raw);
        if (amount !== null) {
          latest = await upsertTillPayment(reportId, type, amount);
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
            <TenderRow label="Cash" value={tender.cash} disabled={isConfirmed || isBusy} onChange={(v) => setTender((s) => ({ ...s, cash: v }))} />
            <TenderRow label="Card" value={tender.card} disabled={isConfirmed || isBusy} onChange={(v) => setTender((s) => ({ ...s, card: v }))} />
            <TenderRow label="Other" value={tender.other} disabled={isConfirmed || isBusy} onChange={(v) => setTender((s) => ({ ...s, other: v }))} />
            {!isConfirmed ? (
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
  return (
    <View style={styles.lineRow}>
      <View style={styles.lineMain}>
        <View style={styles.lineDescWrap}>
          <Text style={styles.lineDesc} numberOfLines={2}>
            {line.rawDescription}
          </Text>
          {line.source === TillLineSource.Ai ? (
            <View style={styles.aiTag}>
              <Text style={styles.aiTagText}>AI · verify</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.lineAmount}>{formatGbp(line.amount)}</Text>
      </View>
      <View style={styles.toggleRow}>
        <ClassifyChip
          label="Income"
          active={line.classification === TillLineClassification.Income}
          tone="income"
          disabled={disabled}
          onPress={() => onClassify(TillLineClassification.Income)}
        />
        <ClassifyChip
          label="Expense"
          active={line.classification === TillLineClassification.Expense}
          tone="expense"
          disabled={disabled}
          onPress={() => onClassify(TillLineClassification.Expense)}
        />
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

function ClassifyChip({
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
  const activeStyle = tone === "income" ? styles.chipIncomeActive : styles.chipExpenseActive;
  return (
    <Pressable
      style={[styles.chip, active ? activeStyle : null, disabled ? styles.chipDisabled : null]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
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
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    padding: 10,
    gap: 8,
  },
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
  lineAmount: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  toggleRow: { flexDirection: "row", gap: 8 },
  chip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 7,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  chipIncomeActive: { backgroundColor: appTheme.colors.success, borderColor: appTheme.colors.success },
  chipExpenseActive: { backgroundColor: appTheme.colors.danger, borderColor: appTheme.colors.danger },
  chipDisabled: { opacity: 0.5 },
  chipText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 14 },
  chipTextActive: { color: appTheme.colors.onPrimary },
});
