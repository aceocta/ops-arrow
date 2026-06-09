import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../auth/AuthContext";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { LoadingState } from "../../components/LoadingState";
import { toastError, toastSuccess } from "../../components/toast";
import { confirmDestructive } from "../../utils/confirm";
import { appTheme } from "../../ui/theme";
import { ui } from "../../ui/primitives";
import {
  FIELD_OPTIONS,
  VARIANCE_REASONS,
  Reconciliation,
  ReconciliationLine,
  TillCanonicalField,
  getOrCreateReconciliation,
  saveReconciliationLine,
  deleteReconciliationLine,
  setReconciliationCashCount,
  setReconciliationVarianceReason,
  setReconciliationStatus,
} from "../../api/tillReconciliationApi";

const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);

const GROUP_TITLE: Record<string, string> = {
  Tender: "Tenders",
  Counter: "Service counters",
  Movement: "Cash movements",
  Exception: "Exceptions",
  Income: "Income",
  Total: "Totals",
  Stat: "Stats",
  Department: "Departments",
  Control: "Other",
};

const DENOMS = [
  { label: "£50", value: 50 }, { label: "£20", value: 20 }, { label: "£10", value: 10 }, { label: "£5", value: 5 },
  { label: "£2", value: 2 }, { label: "£1", value: 1 }, { label: "50p", value: 0.5 }, { label: "20p", value: 0.2 },
  { label: "10p", value: 0.1 }, { label: "5p", value: 0.05 }, { label: "2p", value: 0.02 }, { label: "1p", value: 0.01 },
];

const num = (s: string) => {
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function TillReconciliationScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId as string;
  const qc = useQueryClient();
  const [businessDate, setBusinessDate] = useState(formatDateValue(new Date()));
  const [editingLine, setEditingLine] = useState<ReconciliationLine | "new" | null>(null);
  const [cashOpen, setCashOpen] = useState(false);

  const key = ["till-recon", shopId, businessDate];
  const q = useQuery({
    queryKey: key,
    queryFn: () => getOrCreateReconciliation({ shopId, businessDate, reportType: "DayEnd" }),
    enabled: Boolean(shopId),
  });
  const data = q.data;
  const setData = (r: Reconciliation) => qc.setQueryData(key, r);
  const locked = data?.status === "Approved";

  const reasonMutation = useMutation({
    mutationFn: (p: { reasonCode: string; notes?: string }) =>
      setReconciliationVarianceReason({ reconciliationId: data!.id, ...p }),
    onSuccess: setData,
    onError: (e: any) => toastError(e?.response?.data?.message ?? "Couldn't save reason."),
  });

  const statusMutation = useMutation({
    mutationFn: (status: Reconciliation["status"]) => setReconciliationStatus(data!.id, status),
    onSuccess: (r) => { setData(r); toastSuccess(r.status === "Approved" ? "Approved." : "Saved."); },
    onError: (e: any) => toastError(e?.response?.data?.message ?? "Couldn't update."),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, ReconciliationLine[]>();
    for (const l of data?.lines ?? []) {
      const g = l.group;
      map.set(g, [...(map.get(g) ?? []), l]);
    }
    return [...map.entries()];
  }, [data?.lines]);

  if (!shopId) {
    return <ScreenContainer><Text style={styles.muted}>Select a shop first.</Text></ScreenContainer>;
  }

  const v = data?.cashVariance ?? 0;
  const varianceColor =
    data?.varianceStatus === "Ok" ? appTheme.colors.success
      : data?.varianceStatus === "Warning" ? appTheme.colors.warning
        : appTheme.colors.danger;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[ui.card, styles.row]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Business date</Text>
            <DateTimeField mode="date" value={businessDate} onChange={setBusinessDate} />
          </View>
          {data ? <StatusPill status={data.status} /> : null}
        </View>

        {q.isLoading ? <LoadingState inline /> : null}

        {data ? (
          <>
            {/* Summary */}
            <View style={ui.card}>
              <Text style={ui.sectionTitle}>Reconciliation</Text>
              <Row k="Opening float" v={gbp(data.openingFloat)} />
              <Row k="Expected cash" v={gbp(data.expectedCash)} />
              <Row k="Counted cash" v={data.countedCash != null ? gbp(data.countedCash) : "—"} />
              <View style={styles.divider} />
              <View style={styles.varianceRow}>
                <Text style={styles.varianceLabel}>Over / Short</Text>
                <Text style={[styles.varianceValue, { color: varianceColor }]}>
                  {v >= 0 ? "+" : "−"}{gbp(Math.abs(v))}
                </Text>
              </View>
              <Pressable style={styles.countBtn} onPress={() => !locked && setCashOpen(true)} disabled={locked}>
                <Ionicons name="calculator-outline" size={16} color={appTheme.colors.primary} />
                <Text style={styles.countBtnText}>{data.countedCash != null ? "Edit cash count" : "Count cash"}</Text>
              </Pressable>
            </View>

            {/* Income / owed */}
            {(data.summary.commissionIncome !== 0 || data.summary.owedToProviders.length > 0) ? (
              <View style={ui.card}>
                {data.summary.commissionIncome !== 0 ? <Row k="Commission income" v={gbp(data.summary.commissionIncome)} /> : null}
                {data.summary.owedToProviders.map((o) => (
                  <Row key={o.provider} k={`Owed · ${o.provider}`} v={gbp(o.amount)} muted />
                ))}
              </View>
            ) : null}

            {/* Lines grouped */}
            {grouped.map(([group, lines]) => (
              <View key={group} style={ui.card}>
                <Text style={ui.sectionTitle}>{GROUP_TITLE[group] ?? group}</Text>
                {lines.map((l) => (
                  <Pressable key={l.id} style={styles.lineRow} onPress={() => !locked && setEditingLine(l)} disabled={locked}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineName}>{l.fieldName}</Text>
                      {l.rawLabel ? <Text style={styles.muted} numberOfLines={1}>{l.rawLabel}</Text> : null}
                    </View>
                    <Text style={styles.lineAmount}>
                      {l.canonicalField === "NoSale" ? `× ${l.quantity ?? 0}` : gbp(l.verifiedAmount)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}

            {!locked ? (
              <Pressable style={styles.addBtn} onPress={() => setEditingLine("new")}>
                <Ionicons name="add-circle-outline" size={18} color={appTheme.colors.primary} />
                <Text style={styles.addBtnText}>Add line</Text>
              </Pressable>
            ) : null}

            {/* Exceptions chips */}
            {(data.summary.noSaleCount > 0 || data.summary.voids !== 0 || data.summary.refunds !== 0) ? (
              <Text style={styles.exceptions}>
                ⚠ No-sale ×{data.summary.noSaleCount} · Voids {gbp(data.summary.voids)} · Refunds {gbp(data.summary.refunds)}
              </Text>
            ) : null}

            {/* Variance reason */}
            {data.requiresReason && !locked ? (
              <View style={[ui.card, { borderColor: appTheme.colors.borderWarningSoft, borderWidth: 1 }]}>
                <Text style={ui.sectionTitle}>Variance reason required</Text>
                <View style={styles.chipWrap}>
                  {VARIANCE_REASONS.map((r) => {
                    const active = data.varianceReasonCode === r;
                    return (
                      <Pressable key={r} onPress={() => reasonMutation.mutate({ reasonCode: r, notes: data.varianceNotes ?? undefined })}
                        style={[styles.chip, active ? styles.chipActive : null]}>
                        <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{r}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Status actions */}
            {!locked ? (
              <PrimaryButton
                label={data.status === "Reconciled" ? "Approve & lock" : "Mark reconciled"}
                onPress={() => statusMutation.mutate(data.status === "Reconciled" ? "Approved" : "Reconciled")}
                disabled={statusMutation.isPending || (data.status === "Reconciled" && data.requiresReason && !data.varianceReasonCode)}
              />
            ) : (
              <View style={[ui.card, { alignItems: "center" }]}>
                <Text style={styles.approved}>✓ Approved{data.confirmedOn ? ` · ${new Date(data.confirmedOn).toLocaleString("en-GB")}` : ""}</Text>
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      {editingLine ? (
        <LineEditor
          reconciliationId={data!.id}
          line={editingLine === "new" ? null : editingLine}
          onClose={() => setEditingLine(null)}
          onSaved={(r) => { setData(r); setEditingLine(null); }}
        />
      ) : null}

      {cashOpen && data ? (
        <CashCountModal recon={data} onClose={() => setCashOpen(false)} onSaved={(r) => { setData(r); setCashOpen(false); }} />
      ) : null}
    </ScreenContainer>
  );
}

function Row({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <View style={styles.kvRow}>
      <Text style={[styles.kvKey, muted ? styles.muted : null]}>{k}</Text>
      <Text style={[styles.kvVal, muted ? styles.muted : null]}>{v}</Text>
    </View>
  );
}

function StatusPill({ status }: { status: Reconciliation["status"] }) {
  const tone = status === "Approved" ? appTheme.colors.success : status === "Reconciled" ? appTheme.colors.info : appTheme.colors.textSubtle;
  return <View style={[styles.pill, { borderColor: tone }]}><Text style={[styles.pillText, { color: tone }]}>{status}</Text></View>;
}

function LineEditor({ reconciliationId, line, onClose, onSaved }: {
  reconciliationId: string; line: ReconciliationLine | null; onClose: () => void; onSaved: (r: Reconciliation) => void;
}) {
  const [field, setField] = useState<TillCanonicalField | null>(line?.canonicalField ?? null);
  const [amount, setAmount] = useState(line ? String(line.verifiedAmount) : "");
  const [quantity, setQuantity] = useState(line?.quantity != null ? String(line.quantity) : "");
  const isCount = field === "NoSale";

  const saveMutation = useMutation({
    mutationFn: () => saveReconciliationLine({
      reconciliationId,
      lineId: line?.id,
      canonicalField: field!,
      verifiedAmount: isCount ? 0 : num(amount),
      quantity: isCount ? Math.round(num(quantity)) : undefined,
      captureMethod: "Manual",
      status: "Verified",
    }),
    onSuccess: onSaved,
    onError: (e: any) => toastError(e?.response?.data?.message ?? "Couldn't save line."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteReconciliationLine(line!.id),
    onSuccess: onSaved,
    onError: (e: any) => toastError(e?.response?.data?.message ?? "Couldn't delete."),
  });

  const valid = field && (isCount ? num(quantity) >= 0 : amount.trim().length > 0);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={ui.sectionTitle}>{line ? "Edit line" : "Add line"}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={appTheme.colors.text} /></Pressable>
          </View>
          <ScrollView style={{ maxHeight: 340 }}>
            {FIELD_OPTIONS.map((g) => (
              <View key={g.group} style={{ marginBottom: 8 }}>
                <Text style={styles.muted}>{g.group}</Text>
                <View style={styles.chipWrap}>
                  {g.fields.map((f) => {
                    const active = field === f.value;
                    return (
                      <Pressable key={f.value} onPress={() => setField(f.value)} style={[styles.chip, active ? styles.chipActive : null]}>
                        <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{f.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
          {isCount ? (
            <FloatingLabelInput label="Count" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
          ) : (
            <FloatingLabelInput label="Amount (£)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" prefix="£" />
          )}
          <View style={{ height: 10 }} />
          <PrimaryButton label={saveMutation.isPending ? "Saving…" : "Save line"} onPress={() => saveMutation.mutate()} disabled={!valid || saveMutation.isPending} />
          {line ? (
            <PrimaryButton label="Remove" tone="danger" onPress={async () => {
              if (await confirmDestructive({ title: "Remove line?", confirmLabel: "Remove" })) deleteMutation.mutate();
            }} />
          ) : null}
          <PrimaryButton label="Cancel" tone="neutral" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function CashCountModal({ recon, onClose, onSaved }: {
  recon: Reconciliation; onClose: () => void; onSaved: (r: Reconciliation) => void;
}) {
  const [openingFloat, setOpeningFloat] = useState(String(recon.openingFloat || ""));
  const [counted, setCounted] = useState(recon.countedCash != null ? String(recon.countedCash) : "");
  const [floatToCarry, setFloatToCarry] = useState(recon.floatToCarry != null ? String(recon.floatToCarry) : "");
  const [cardCounted, setCardCounted] = useState(recon.cardCounted != null ? String(recon.cardCounted) : "");
  const [denomOpen, setDenomOpen] = useState(false);
  const [qty, setQty] = useState<Record<number, string>>({});

  const denomTotal = useMemo(() => DENOMS.reduce((s, d) => s + d.value * (num(qty[d.value] ?? "")), 0), [qty]);

  const saveMutation = useMutation({
    mutationFn: () => setReconciliationCashCount({
      reconciliationId: recon.id,
      openingFloat: num(openingFloat),
      countedCash: num(counted),
      floatToCarry: floatToCarry.trim() ? num(floatToCarry) : undefined,
      cardCounted: cardCounted.trim() ? num(cardCounted) : undefined,
      denominationJson: Object.keys(qty).length ? JSON.stringify(qty) : undefined,
    }),
    onSuccess: (r) => { onSaved(r); toastSuccess("Cash count saved."); },
    onError: (e: any) => toastError(e?.response?.data?.message ?? "Couldn't save count."),
  });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={ui.sectionTitle}>Cash count</Text>
            <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={appTheme.colors.text} /></Pressable>
          </View>

          {denomOpen ? (
            <ScrollView style={{ maxHeight: 320 }}>
              {DENOMS.map((d) => (
                <View key={d.value} style={styles.denomRow}>
                  <Text style={styles.denomLabel}>{d.label}</Text>
                  <FloatingLabelInput label="Qty" value={qty[d.value] ?? ""} onChangeText={(t) => setQty((p) => ({ ...p, [d.value]: t }))} keyboardType="number-pad" containerStyle={{ width: 110 }} />
                  <Text style={styles.denomSub}>{gbp(d.value * num(qty[d.value] ?? ""))}</Text>
                </View>
              ))}
              <View style={styles.kvRow}><Text style={styles.kvKey}>Total</Text><Text style={styles.kvVal}>{gbp(denomTotal)}</Text></View>
              <PrimaryButton label={`Use ${gbp(denomTotal)}`} onPress={() => { setCounted(String(denomTotal.toFixed(2))); setDenomOpen(false); }} />
              <PrimaryButton label="Back" tone="neutral" onPress={() => setDenomOpen(false)} />
            </ScrollView>
          ) : (
            <>
              <FloatingLabelInput label="Opening float (£)" value={openingFloat} onChangeText={setOpeningFloat} keyboardType="decimal-pad" prefix="£" />
              <FloatingLabelInput label="Counted cash (£)" value={counted} onChangeText={setCounted} keyboardType="decimal-pad" prefix="£" />
              <Pressable style={styles.countBtn} onPress={() => setDenomOpen(true)}>
                <Ionicons name="calculator-outline" size={16} color={appTheme.colors.primary} />
                <Text style={styles.countBtnText}>Count by denomination</Text>
              </Pressable>
              <FloatingLabelInput label="Float to carry (£)" value={floatToCarry} onChangeText={setFloatToCarry} keyboardType="decimal-pad" prefix="£" />
              <FloatingLabelInput label="Card terminal total (£)" value={cardCounted} onChangeText={setCardCounted} keyboardType="decimal-pad" prefix="£" />
              <View style={{ height: 10 }} />
              <PrimaryButton label={saveMutation.isPending ? "Saving…" : "Save count"} onPress={() => saveMutation.mutate()} disabled={!counted.trim() || saveMutation.isPending} />
              <PrimaryButton label="Cancel" tone="neutral" onPress={onClose} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { gap: appTheme.spacing.sm, paddingBottom: appTheme.spacing.xl },
  row: { flexDirection: "row", alignItems: "flex-end", gap: appTheme.spacing.sm },
  label: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, marginBottom: 4 },
  muted: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 12 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  kvKey: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 14 },
  kvVal: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  divider: { height: 1, backgroundColor: appTheme.colors.borderSoft, marginVertical: 6 },
  varianceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  varianceLabel: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 16 },
  varianceValue: { fontFamily: appTheme.fonts.heading, fontSize: 20 },
  countBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, paddingVertical: 10, borderRadius: appTheme.radius.sm, borderWidth: 1, borderColor: appTheme.colors.border },
  countBtnText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  lineName: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  lineAmount: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: appTheme.radius.sm, borderWidth: 1, borderColor: appTheme.colors.border, borderStyle: "dashed" },
  addBtnText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  exceptions: { color: appTheme.colors.warning, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, paddingHorizontal: 4 },
  approved: { color: appTheme.colors.success, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 11 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: appTheme.colors.border },
  chipActive: { backgroundColor: appTheme.colors.surfaceTint, borderColor: appTheme.colors.primary },
  chipText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13 },
  chipTextActive: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium },
  sheetBackdrop: { flex: 1, backgroundColor: appTheme.colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: appTheme.colors.background, borderTopLeftRadius: appTheme.radius.lg, borderTopRightRadius: appTheme.radius.lg, padding: appTheme.spacing.md, gap: 6 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  denomRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  denomLabel: { width: 48, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  denomSub: { flex: 1, textAlign: "right", color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13 },
});
