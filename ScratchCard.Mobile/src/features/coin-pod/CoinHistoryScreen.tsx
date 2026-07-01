import React, { useMemo, useState } from "react";
import { Modal, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { CoinBagTransaction, getCoinTransactions, reverseCoinTransaction } from "../../api/coinPodApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { EmptyState } from "../../components/EmptyState";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { LoadingState } from "../../components/LoadingState";
import { ModalBackdropBlur } from "../../components/ModalBackdropBlur";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { toastError, toastSuccess } from "../../components/toast";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

const MANAGE_ROLES = ["PlatformAdmin", "CompanyOwner", "Manager"];

const TYPE_LABELS: Record<string, string> = {
  OpeningBalance: "Opening balance",
  NotesToCoins: "Notes → Coins",
  CoinsToNotes: "Coins → Notes",
  ManualAdjustment: "Manual adjustment",
  BankRefill: "Bank refill",
  BankDeposit: "Coin removal",
  Reversal: "Reversal",
  StockCount: "Value count",
};

function money(value: number) {
  return `£${(value ?? 0).toFixed(2)}`;
}

function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateValue(d);
}

function statusTone(status: string): "neutral" | "warning" | "danger" | "success" {
  if (status === "Cancelled" || status === "Reversed") return "danger";
  return "neutral";
}

export function CoinHistoryScreen() {
  const queryClient = useQueryClient();
  const { activeShopId, activeShop, profile } = useAuth();
  const canManage = MANAGE_ROLES.includes(activeShop?.role ?? "") || (profile?.roles?.some((r) => MANAGE_ROLES.includes(r)) ?? false);

  const today = formatDateValue(new Date());
  const [from, setFrom] = useState(addDaysIso(today, -7));
  const [to, setTo] = useState(today);
  const [reversing, setReversing] = useState<CoinBagTransaction | null>(null);
  const [reason, setReason] = useState("");

  const range = useMemo(() => (from <= to ? { from, to } : { from: to, to: from }), [from, to]);

  const query = useQuery({
    queryKey: ["coin-pod-transactions", activeShopId, range.from, range.to],
    queryFn: () => getCoinTransactions(activeShopId as string, range.from, range.to),
    enabled: Boolean(activeShopId),
  });

  const reverseMutation = useMutation({
    mutationFn: () => reverseCoinTransaction(activeShopId as string, (reversing as CoinBagTransaction).id, reason.trim()),
    onSuccess: () => {
      toastSuccess("Transaction reversed.");
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-transactions", activeShopId] });
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-dashboard", activeShopId] });
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-alerts", activeShopId] });
      setReversing(null);
      setReason("");
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Unable to reverse the transaction.")),
  });

  const transactions = query.data ?? [];
  const canReverse = (t: CoinBagTransaction) => canManage && t.status === "Active" && t.transactionType !== "Reversal";

  return (
    <ScreenContainer
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={appTheme.colors.primary} />}
    >
      <View style={[ui.card, styles.dateRow]}>
        <View style={styles.cell}>
          <Text style={styles.fieldLabel}>From</Text>
          <DateTimeField mode="date" value={from} onChange={setFrom} />
        </View>
        <View style={styles.cell}>
          <Text style={styles.fieldLabel}>To</Text>
          <DateTimeField mode="date" value={to} onChange={setTo} />
        </View>
      </View>

      {query.isLoading ? (
        <View style={ui.card}><LoadingState message="Loading history…" inline /></View>
      ) : transactions.length === 0 ? (
        <EmptyState icon="time-outline" title="No transactions" message="No coin movements in this date range." />
      ) : (
        <View style={styles.list}>
          {transactions.map((t) => (
            <TransactionRow key={t.id} t={t} onReverse={canReverse(t) ? () => { setReversing(t); setReason(""); } : undefined} />
          ))}
        </View>
      )}

      <Modal visible={reversing !== null} transparent animationType="fade" onRequestClose={() => setReversing(null)}>
        <View style={styles.modalBackdrop}>
          <ModalBackdropBlur />
          <View style={styles.modalCard}>
            <Text style={ui.sectionTitle}>Reverse transaction</Text>
            {reversing ? (
              <Text style={styles.modalMeta}>
                {TYPE_LABELS[reversing.transactionType] ?? reversing.transactionType} · {reversing.displayLabel} · {reversing.bagQuantity} bag(s) · {reversing.transactionNumber}
              </Text>
            ) : null}
            <Text style={styles.modalNote}>This creates a compensating entry that restores stock and marks the original as reversed.</Text>
            <FloatingLabelInput label="Reason (required)" value={reason} onChangeText={setReason} />
            <PrimaryButton
              label={reverseMutation.isPending ? "Reversing…" : "Reverse"}
              tone="danger"
              onPress={() => reverseMutation.mutate()}
              disabled={reverseMutation.isPending || reason.trim().length === 0}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setReversing(null)} disabled={reverseMutation.isPending} />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function TransactionRow({ t, onReverse }: { t: CoinBagTransaction; onReverse?: () => void }) {
  const isOut = t.direction === "Out";
  return (
    <View style={[ui.listItem, styles.row]}>
      <View style={styles.coinBadge}><Text style={styles.coinBadgeText}>{t.displayLabel}</Text></View>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>{TYPE_LABELS[t.transactionType] ?? t.transactionType}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {t.performedOn.slice(0, 16).replace("T", " ")} · {t.transactionNumber}
        </Text>
        {t.comment ? <Text style={styles.rowComment} numberOfLines={2}>{t.comment}</Text> : null}
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.qty, isOut ? styles.qtyOut : styles.qtyIn]}>{isOut ? "−" : "+"}{t.bagQuantity}</Text>
        <Text style={styles.value}>{money(t.totalCoinValue)}</Text>
        {t.status !== "Active" ? <StatusBadge label={t.status} tone={statusTone(t.status)} /> : null}
        {onReverse ? (
          <Pressable onPress={onReverse} hitSlop={8} style={styles.reverseBtn} accessibilityRole="button" accessibilityLabel="Reverse transaction">
            <Ionicons name="arrow-undo-outline" size={14} color={appTheme.colors.danger} />
            <Text style={styles.reverseText}>Reverse</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: "row", gap: appTheme.spacing.sm },
  cell: { flex: 1 },
  fieldLabel: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 16, marginBottom: 2 },
  list: { gap: appTheme.spacing.xs, marginTop: appTheme.spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.sm },
  coinBadge: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: appTheme.colors.surfaceBrandSoft, borderWidth: 1, borderColor: appTheme.colors.primary },
  coinBadgeText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.heading, fontSize: 12 },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  rowMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 11, lineHeight: 15 },
  rowComment: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 11, lineHeight: 15 },
  rowRight: { alignItems: "flex-end", gap: 2 },
  qty: { fontFamily: appTheme.fonts.heading, fontSize: 15 },
  qtyOut: { color: appTheme.colors.danger },
  qtyIn: { color: appTheme.colors.primary },
  value: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  reverseBtn: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  reverseText: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11 },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: appTheme.spacing.md, backgroundColor: appTheme.colors.overlay },
  modalCard: { backgroundColor: appTheme.colors.background, borderRadius: appTheme.radius.lg, padding: appTheme.spacing.md, gap: appTheme.spacing.sm },
  modalMeta: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  modalNote: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
});
