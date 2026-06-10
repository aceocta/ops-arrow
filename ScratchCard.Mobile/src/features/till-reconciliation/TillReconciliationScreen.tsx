import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { compressForUpload } from "../../utils/imageCompression";
import { useAuth } from "../../auth/AuthContext";
import { useFeature } from "../subscription/useFeature";
import { listTills } from "../../api/tillsApi";
import { listShifts } from "../../api/shiftsApi";
import { listBusinessDays } from "../../api/businessDaysApi";
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
  FieldOptionGroup,
  FieldCode,
  Reconciliation,
  ReconciliationLine,
  getFieldOptions,
  getOrCreateReconciliation,
  saveReconciliationLine,
  deleteReconciliationLine,
  restoreReconciliationLine,
  setReconciliationCashCount,
  setReconciliationVarianceReason,
  setReconciliationStatus,
  ingestReconciliationPhoto,
  getReconciliationAttachment,
  ReconciliationAttachment,
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
  const canOcr = useFeature("store_sales.ocr").isAllowed;
  const shopId = activeShopId as string;
  const qc = useQueryClient();
  const [businessDate, setBusinessDate] = useState(formatDateValue(new Date()));
  const [editingLine, setEditingLine] = useState<ReconciliationLine | "new" | null>(null);
  const [cashOpen, setCashOpen] = useState(false);
  const [tillId, setTillId] = useState<string | undefined>(undefined);
  const [reportType, setReportType] = useState<"DayEnd" | "Shift">("DayEnd");
  const [shiftId, setShiftId] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const toggleSelect = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // The shop's tills. With 0–1 tills we stay single-drawer (tillId undefined); with several, the
  // cashier picks which till they're reconciling and each gets its own reconciliation.
  const tillsQ = useQuery({
    queryKey: ["tills", shopId],
    queryFn: () => listTills(shopId),
    enabled: Boolean(shopId),
  });
  const tills = tillsQ.data ?? [];
  const multiTill = tills.length > 1;
  // Default to the first till once they load (only in multi-till shops).
  useEffect(() => {
    if (multiTill && !tillId) setTillId(tills[0].id);
  }, [multiTill, tillId, tills]);

  // Shifts for the selected date (used only when reconciling shift-wise). Resolve the business day
  // for the date, then its shifts.
  const businessDayQ = useQuery({
    queryKey: ["recon-bizday", shopId, businessDate],
    queryFn: () => listBusinessDays(shopId, { from: businessDate, to: businessDate }),
    enabled: Boolean(shopId) && reportType === "Shift",
  });
  const businessDayId = businessDayQ.data?.[0]?.id;
  const shiftsQ = useQuery({
    queryKey: ["recon-shifts", shopId, businessDayId],
    queryFn: () => listShifts(shopId, businessDayId),
    enabled: Boolean(shopId) && reportType === "Shift" && Boolean(businessDayId),
  });
  const shifts = shiftsQ.data ?? [];
  useEffect(() => {
    if (reportType === "Shift" && !shiftId && shifts.length > 0) setShiftId(shifts[0].id);
  }, [reportType, shiftId, shifts]);

  const effectiveTillId = multiTill ? tillId : undefined;
  const effectiveShiftId = reportType === "Shift" ? shiftId : undefined;
  const key = ["till-recon", shopId, businessDate, effectiveTillId ?? "single", reportType, effectiveShiftId ?? "day"];
  const q = useQuery({
    queryKey: key,
    queryFn: () => getOrCreateReconciliation({ shopId, businessDate, reportType, tillId: effectiveTillId, shiftId: effectiveShiftId }),
    enabled: Boolean(shopId) && (!multiTill || Boolean(effectiveTillId)) && (reportType !== "Shift" || Boolean(effectiveShiftId)),
  });
  const data = q.data;
  const setData = (r: Reconciliation) => qc.setQueryData(key, r);
  const locked = data?.status === "Approved";
  const hasLines = (data?.lines?.length ?? 0) > 0;

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

  // Field picker options come from the data-driven catalogue (built-in + custom), falling back to
  // the bundled defaults until the list loads.
  const fieldOptionsQ = useQuery({ queryKey: ["till-fields"], queryFn: getFieldOptions, staleTime: 5 * 60 * 1000 });
  const fieldOptions = fieldOptionsQ.data ?? FIELD_OPTIONS;

  // Bulk actions on the checkbox-selected lines: remove them, or reassign them to another field.
  const bulkMutation = useMutation({
    mutationFn: async (action: { type: "delete" } | { type: "move"; field: FieldCode }) => {
      let result: Reconciliation | null = null;
      for (const id of selected) {
        if (action.type === "delete") {
          result = await deleteReconciliationLine(id);
        } else {
          const line = data?.lines.find((l) => l.id === id);
          if (!line) continue;
          result = await saveReconciliationLine({
            reconciliationId: data!.id,
            lineId: id,
            canonicalField: action.field,
            rawLabel: line.rawLabel ?? undefined,
            verifiedAmount: line.verifiedAmount,
            quantity: line.quantity ?? undefined,
            captureMethod: line.captureMethod,
            status: "Verified",
            learnMapping: true,
          });
        }
      }
      return result;
    },
    onSuccess: (r) => { if (r) setData(r); setSelected(new Set()); setMoveOpen(false); toastSuccess("Lines updated."); },
    onError: (e: any) => toastError(e?.response?.data?.message ?? "Couldn't update lines."),
  });

  const ingestMutation = useMutation({
    mutationFn: async (source: "camera" | "library") => {
      const perm = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new Error("Camera/photo permission is required.");
      const picked = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.85, allowsMultipleSelection: true, selectionLimit: 10 });
      if (picked.canceled || picked.assets.length === 0) return null;
      // A report can span several photos — ingest each; each call accumulates lines + attachments.
      let result: Reconciliation | null = null;
      for (const asset of picked.assets) {
        const out = await compressForUpload(asset.uri);
        result = await ingestReconciliationPhoto({ id: data!.id, uri: out.uri, mimeType: "image/jpeg" });
      }
      return result;
    },
    onSuccess: (r) => { if (r) { setData(r); toastSuccess("Photo(s) read — verify the amounts."); } },
    onError: (e: any) => toastError(e?.response?.data?.message ?? e?.message ?? "Couldn't read the photo."),
  });

  // Auto-ignored lines (labels the user previously removed) are shown in their own strip, not the groups.
  const autoIgnored = useMemo(() => (data?.lines ?? []).filter((l) => l.canonicalField === "SubtotalIgnore"), [data?.lines]);
  const [showIgnored, setShowIgnored] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, ReconciliationLine[]>();
    for (const l of data?.lines ?? []) {
      if (l.canonicalField === "SubtotalIgnore") continue;
      const g = l.group;
      map.set(g, [...(map.get(g) ?? []), l]);
    }
    return [...map.entries()];
  }, [data?.lines]);

  // Summary counts for the origin banner.
  const counts = useMemo(() => {
    const ls = data?.lines ?? [];
    return {
      history: ls.filter((l) => l.notes === "history" && l.canonicalField !== "SubtotalIgnore" && l.canonicalField !== "Unmapped").length,
      ai: ls.filter((l) => (l.notes ?? "").includes("ai")).length,
      newCount: ls.filter((l) => l.canonicalField === "Unmapped").length,
      ignored: autoIgnored.length,
    };
  }, [data?.lines, autoIgnored]);

  const restoreMutation = useMutation({
    mutationFn: (lineId: string) => restoreReconciliationLine(lineId),
    onSuccess: (r) => { setData(r); toastSuccess("Restored — assign it below."); },
    onError: (e: any) => toastError(e?.response?.data?.message ?? "Couldn't restore."),
  });

  if (!shopId) {
    return <ScreenContainer><Text style={styles.muted}>Select a shop first.</Text></ScreenContainer>;
  }

  const v = data?.cashVariance ?? 0;
  const varianceColor =
    data?.varianceStatus === "Ok" ? appTheme.colors.success
      : data?.varianceStatus === "Warning" ? appTheme.colors.warning
        : appTheme.colors.danger;

  const approveDisabled = !data || statusMutation.isPending ||
    (data.status === "Reconciled" && data.requiresReason && !data.varianceReasonCode);

  // Sticky action bar — Add line + advance the status. Hidden once approved (read-only).
  const footerBar = data && !locked ? (
    <View style={styles.footerRow}>
      <Pressable style={[styles.footerBtn, styles.footerBtnOutline]} onPress={() => setEditingLine("new")}>
        <Ionicons name="add-circle-outline" size={18} color={appTheme.colors.primary} />
        <Text style={styles.footerBtnOutlineText}>Add line</Text>
      </Pressable>
      <Pressable
        style={[styles.footerBtn, styles.footerBtnPrimary, approveDisabled ? styles.footerBtnDisabled : null]}
        disabled={approveDisabled}
        onPress={() => statusMutation.mutate(data.status === "Reconciled" ? "Approved" : "Reconciled")}
      >
        <Text style={styles.footerBtnPrimaryText}>{data.status === "Reconciled" ? "Approve & lock" : "Mark reconciled"}</Text>
      </Pressable>
    </View>
  ) : undefined;

  return (
    <ScreenContainer footer={footerBar}>
        <View style={[ui.card, styles.groupCard]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Business date</Text>
              <DateTimeField mode="date" value={businessDate} onChange={(d) => { setBusinessDate(d); setShiftId(undefined); }} />
            </View>
            {data ? <StatusPill status={data.status} /> : null}
            <Pressable style={styles.helpBtn} onPress={() => setHelpOpen(true)} hitSlop={8} accessibilityLabel="How till reconciliation works">
              <Ionicons name="help-circle-outline" size={22} color={appTheme.colors.primary} />
            </Pressable>
          </View>

          <View style={styles.tillPickerBlock}>
            <Text style={styles.label}>Reconcile by</Text>
            <Segmented
              options={[{ key: "DayEnd", label: "Day-end" }, { key: "Shift", label: "Shift" }]}
              value={reportType}
              onChange={setReportType}
            />
          </View>

          {reportType === "Shift" ? (
            <View style={styles.tillPickerBlock}>
              <Text style={styles.label}>Shift</Text>
              {shifts.length === 0 ? (
                <Text style={styles.muted}>{shiftsQ.isLoading || businessDayQ.isLoading ? "Loading shifts…" : "No shifts for this date."}</Text>
              ) : (
                <Segmented options={shifts.map((s) => ({ key: s.id, label: s.shiftName }))} value={effectiveShiftId} onChange={setShiftId} />
              )}
            </View>
          ) : null}

          {multiTill ? (
            <View style={styles.tillPickerBlock}>
              <Text style={styles.label}>Till</Text>
              <Segmented options={tills.map((t) => ({ key: t.id, label: t.name }))} value={effectiveTillId} onChange={setTillId} />
            </View>
          ) : null}
        </View>

        {q.isLoading ? <LoadingState inline /> : null}

        {data && !locked && canOcr ? (
          <View style={[ui.card, styles.groupCard]}>
            {!hasLines ? (
              <>
                <Text style={[ui.sectionTitle, styles.groupTitle]}>Start here — add your till report</Text>
                <HowItWorksSteps />
              </>
            ) : (
              <Text style={[ui.sectionTitle, styles.groupTitle]}>Add another photo</Text>
            )}
            <View style={styles.captureRow}>
              <Pressable
                style={({ pressed }) => [styles.captureBtn, styles.captureBtnPrimary, pressed && styles.capturePressed, ingestMutation.isPending && styles.captureDisabled]}
                onPress={() => ingestMutation.mutate("camera")}
                disabled={ingestMutation.isPending}
              >
                <Ionicons name="camera" size={20} color={appTheme.colors.onPrimary} />
                <Text style={[styles.captureText, styles.captureTextPrimary]}>{ingestMutation.isPending ? "Reading…" : "Take photo"}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.captureBtn, styles.captureBtnOutline, pressed && styles.capturePressed, ingestMutation.isPending && styles.captureDisabled]}
                onPress={() => ingestMutation.mutate("library")}
                disabled={ingestMutation.isPending}
              >
                <Ionicons name="image" size={20} color={appTheme.colors.primary} />
                <Text style={[styles.captureText, styles.captureTextOutline]}>Upload</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {data && data.attachments.length > 0 ? <AttachmentsCard attachments={data.attachments} /> : null}

        {data && (counts.history + counts.ai + counts.newCount + counts.ignored) > 0 ? (
          <View style={styles.banner}>
            {counts.history > 0 ? <Text style={styles.bannerChip}>✓ {counts.history} auto-mapped</Text> : null}
            {counts.ai > 0 ? <Text style={[styles.bannerChip, { color: appTheme.colors.warning }]}>🔍 {counts.ai} to review</Text> : null}
            {counts.newCount > 0 ? <Text style={[styles.bannerChip, { color: appTheme.colors.warning }]}>● {counts.newCount} new</Text> : null}
            {counts.ignored > 0 ? <Text style={[styles.bannerChip, { color: appTheme.colors.textSubtle }]}>🚫 {counts.ignored} ignored</Text> : null}
          </View>
        ) : null}

        {data ? (
          <>
            {/* Summary */}
            <View style={[ui.card, styles.groupCard]}>
              <Text style={[ui.sectionTitle, styles.groupTitle]}>Reconciliation</Text>
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

            {/* Proof of cash — where the cash came from and where it went */}
            {data.countedCash != null ? <ProofOfCashCard data={data} /> : null}

            {/* Income / owed */}
            {(data.summary.commissionIncome !== 0 || data.summary.owedToProviders.length > 0) ? (
              <View style={[ui.card, styles.groupCard]}>
                {data.summary.commissionIncome !== 0 ? <Row k="Commission income" v={gbp(data.summary.commissionIncome)} /> : null}
                {data.summary.owedToProviders.map((o) => (
                  <Row key={o.provider} k={`Owed · ${o.provider}`} v={gbp(o.amount)} muted />
                ))}
              </View>
            ) : null}

            {/* Bulk-action bar for checkbox-selected lines */}
            {!locked && selected.size > 0 ? (
              <View style={[ui.card, styles.groupCard, styles.selectBar]}>
                <Text style={styles.selectCount}>{selected.size} selected</Text>
                <View style={styles.selectActions}>
                  <Pressable style={styles.selectBtn} onPress={() => setMoveOpen(true)} disabled={bulkMutation.isPending}>
                    <Ionicons name="swap-horizontal-outline" size={16} color={appTheme.colors.primary} />
                    <Text style={styles.selectBtnText}>Move to…</Text>
                  </Pressable>
                  <Pressable style={styles.selectBtn} onPress={async () => {
                    if (await confirmDestructive({ title: `Remove ${selected.size} line(s)?`, confirmLabel: "Remove" })) bulkMutation.mutate({ type: "delete" });
                  }} disabled={bulkMutation.isPending}>
                    <Ionicons name="trash-outline" size={16} color={appTheme.colors.danger} />
                    <Text style={[styles.selectBtnText, { color: appTheme.colors.danger }]}>Remove</Text>
                  </Pressable>
                  <Pressable style={styles.selectBtn} onPress={() => setSelected(new Set())} disabled={bulkMutation.isPending}>
                    <Text style={styles.selectBtnText}>Clear</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* Lines grouped */}
            {grouped.map(([group, lines]) => {
              const subtotal = lines.reduce((s, l) => s + l.verifiedAmount, 0);
              return (
                <View key={group} style={[ui.card, styles.groupCard]}>
                  <Text style={[ui.sectionTitle, styles.groupTitle]}>{GROUP_TITLE[group] ?? group}</Text>
                  {lines.map((l) => {
                    const isSel = selected.has(l.id);
                    return (
                      <View key={l.id} style={styles.lineRow}>
                        {!locked ? (
                          <Pressable hitSlop={8} onPress={() => toggleSelect(l.id)}>
                            <Ionicons name={isSel ? "checkbox" : "square-outline"} size={20} color={isSel ? appTheme.colors.primary : appTheme.colors.textSubtle} />
                          </Pressable>
                        ) : null}
                        {l.status !== "Verified" ? <View style={styles.verifyDot} /> : null}
                        <Pressable style={styles.lineBody} onPress={() => !locked && setEditingLine(l)} disabled={locked}>
                          <View style={{ flex: 1 }}>
                            <View style={styles.lineNameRow}>
                              <Text style={styles.lineName}>
                                {l.canonicalField === "Unmapped" ? (l.rawLabel || "Unmapped") : l.fieldName}
                              </Text>
                              <OriginBadge line={l} />
                            </View>
                            {l.rawLabel && l.canonicalField !== "Unmapped" ? <Text style={styles.muted} numberOfLines={1}>{l.rawLabel}</Text> : null}
                            {l.status !== "Verified" ? <Text style={styles.verifyHint}>Tap to verify</Text> : null}
                          </View>
                          <Text style={styles.lineAmount}>
                            {l.canonicalField === "NoSale" ? `× ${l.quantity ?? 0}` : gbp(l.verifiedAmount)}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                  <View style={styles.sectionTotalRow}>
                    <Text style={styles.sectionTotalLabel}>Total</Text>
                    <Text style={styles.sectionTotal}>{gbp(subtotal)}</Text>
                  </View>
                </View>
              );
            })}

            {/* Auto-ignored (labels the user removed before) — collapsed, with restore */}
            {autoIgnored.length > 0 ? (
              <View style={[ui.card, styles.groupCard]}>
                <Pressable style={styles.ignoredHeader} onPress={() => setShowIgnored((s) => !s)}>
                  <Text style={styles.muted}>🚫 Auto-ignored ({autoIgnored.length})</Text>
                  <Ionicons name={showIgnored ? "chevron-up" : "chevron-down"} size={16} color={appTheme.colors.textSubtle} />
                </Pressable>
                {showIgnored ? autoIgnored.map((l) => (
                  <View key={l.id} style={styles.lineRow}>
                    <Text style={[styles.lineName, { flex: 1, color: appTheme.colors.textMuted }]} numberOfLines={1}>{l.rawLabel || "—"}</Text>
                    {!locked ? (
                      <Pressable style={styles.restoreBtn} onPress={() => restoreMutation.mutate(l.id)} disabled={restoreMutation.isPending}>
                        <Ionicons name="arrow-undo-outline" size={15} color={appTheme.colors.primary} />
                        <Text style={styles.restoreText}>Restore</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )) : null}
              </View>
            ) : null}

            {/* Exceptions chips */}
            {(data.summary.noSaleCount > 0 || data.summary.voids !== 0 || data.summary.refunds !== 0 || data.summary.driveOffs !== 0) ? (
              <Text style={styles.exceptions}>
                ⚠ No-sale ×{data.summary.noSaleCount} · Voids {gbp(data.summary.voids)} · Refunds {gbp(data.summary.refunds)}
                {data.summary.driveOffs !== 0 ? ` · Drive-offs ${gbp(data.summary.driveOffs)}` : ""}
              </Text>
            ) : null}

            {/* Variance reason */}
            {data.requiresReason && !locked ? (
              <View style={[ui.card, styles.groupCard, { borderColor: appTheme.colors.borderWarningSoft, borderWidth: 1 }]}>
                <Text style={[ui.sectionTitle, styles.groupTitle]}>Variance reason required</Text>
                <VarianceReasonInput
                  initial={data.varianceReasonCode ?? ""}
                  busy={reasonMutation.isPending}
                  onSave={(reasonCode) => reasonMutation.mutate({ reasonCode, notes: data.varianceNotes ?? undefined })}
                />
              </View>
            ) : null}

            {/* Approved (read-only) banner */}
            {locked ? (
              <View style={[ui.card, styles.groupCard, { alignItems: "center" }]}>
                <Text style={styles.approved}>✓ Approved{data.confirmedOn ? ` · ${new Date(data.confirmedOn).toLocaleString("en-GB")}` : ""}</Text>
              </View>
            ) : null}
          </>
        ) : null}

      {editingLine ? (
        <LineEditor
          reconciliationId={data!.id}
          line={editingLine === "new" ? null : editingLine}
          fieldOptions={fieldOptions}
          onClose={() => setEditingLine(null)}
          onSaved={(r) => { setData(r); setEditingLine(null); }}
        />
      ) : null}

      {cashOpen && data ? (
        <CashCountModal recon={data} onClose={() => setCashOpen(false)} onSaved={(r) => { setData(r); setCashOpen(false); }} />
      ) : null}

      {moveOpen ? (
        <MoveLinesModal
          count={selected.size}
          busy={bulkMutation.isPending}
          fieldOptions={fieldOptions}
          onPick={(field) => bulkMutation.mutate({ type: "move", field })}
          onClose={() => setMoveOpen(false)}
        />
      ) : null}

      <IngestOverlay visible={ingestMutation.isPending} />
      <HowItWorksModal visible={helpOpen} onClose={() => setHelpOpen(false)} />
    </ScreenContainer>
  );
}

const HOW_IT_WORKS_STEPS: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }[] = [
  { icon: "camera", title: "Add your till report", detail: "Take a photo of the end-of-day printout, or upload one — we read the figures for you." },
  { icon: "checkmark-circle", title: "Check the figures", detail: "Tap any line with a dot to confirm the amount. Fix anything the scan got wrong." },
  { icon: "cash", title: "Count your cash", detail: "Enter your counted drawer so we can work out any over or short." },
  { icon: "lock-closed", title: "Approve & lock", detail: "Mark it reconciled, then approve to lock the day. Add a reason if there's a variance." },
];

// Shared 4-step explainer — rendered inline as an intro when the reconciliation is empty, and
// inside the help modal reopened from the header (?).
function HowItWorksSteps() {
  return (
    <View style={styles.stepsWrap}>
      {HOW_IT_WORKS_STEPS.map((s, i) => (
        <View key={s.title} style={styles.stepRow}>
          <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
          <Ionicons name={s.icon} size={18} color={appTheme.colors.primary} style={styles.stepIcon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>{s.title}</Text>
            <Text style={styles.stepDetail}>{s.detail}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function HowItWorksModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.helpBackdrop}>
        <View style={styles.helpSheet}>
          <View style={styles.helpHeader}>
            <Text style={ui.sectionTitle}>How till reconciliation works</Text>
            <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={appTheme.colors.text} /></Pressable>
          </View>
          <HowItWorksSteps />
          <PrimaryButton label="Got it" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

// Reading a till photo runs OCR + AI matching on the server (~10s). A blocking overlay with cycling
// status reassures the user the app hasn't frozen — used for both the Photo and Upload buttons.
function IngestOverlay({ visible }: { visible: boolean }) {
  const messages = ["Uploading your photo…", "Reading the till report…", "Matching lines to categories…", "Almost there…"];
  const [idx, setIdx] = useState(0);
  React.useEffect(() => {
    if (!visible) {
      setIdx(0);
      return;
    }
    const timer = setInterval(() => setIdx((current) => Math.min(current + 1, messages.length - 1)), 2500);
    return () => clearInterval(timer);
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.ingestBackdrop}>
        <View style={styles.ingestCard}>
          <ActivityIndicator size="large" color={appTheme.colors.primary} />
          <Text style={styles.ingestTitle}>Reading your till report</Text>
          <Text style={styles.ingestMsg}>{messages[idx]}</Text>
          <Text style={styles.ingestHint}>Please keep the app open.</Text>
        </View>
      </View>
    </Modal>
  );
}

function VarianceReasonInput({ initial, busy, onSave }: { initial: string; busy: boolean; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial);
  React.useEffect(() => { setText(initial); }, [initial]);
  return (
    <TextInput
      style={styles.reasonInput}
      value={text}
      onChangeText={setText}
      onEndEditing={() => { const t = text.trim(); if (t && t !== initial) onSave(t); }}
      placeholder="Type the reason for the over / short…"
      placeholderTextColor={appTheme.colors.textSubtle}
      maxLength={60}
      editable={!busy}
      returnKeyType="done"
    />
  );
}

function MoveLinesModal({ count, busy, fieldOptions, onPick, onClose }: {
  count: number; busy: boolean; fieldOptions: FieldOptionGroup[]; onPick: (field: FieldCode) => void; onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={ui.sectionTitle}>Move {count} line(s) to…</Text>
            <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={appTheme.colors.text} /></Pressable>
          </View>
          <ScrollView style={{ maxHeight: 380 }}>
            {fieldOptions.map((g) => (
              <View key={g.group} style={{ marginBottom: 8 }}>
                <Text style={styles.muted}>{g.group}</Text>
                <View style={styles.chipWrap}>
                  {g.fields.map((f) => (
                    <Pressable key={f.value} onPress={() => onPick(f.value)} disabled={busy} style={[styles.chip, busy ? { opacity: 0.5 } : null]}>
                      <Text style={styles.chipText}>{f.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
          <PrimaryButton label="Cancel" tone="neutral" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

// Segmented pill selector — matches the "Today / 7 days / 30 days" style used across the app.
function Segmented<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string }[]; value?: T; onChange: (key: T) => void;
}) {
  return (
    <View style={styles.segRow}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <Pressable key={o.key} style={[styles.segChip, active ? styles.segChipActive : null]} onPress={() => onChange(o.key)}>
            <Text style={[styles.segText, active ? styles.segTextActive : null]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function OriginBadge({ line }: { line: ReconciliationLine }) {
  const notes = line.notes ?? "";
  let label: string | null = null;
  let color = appTheme.colors.textSubtle;
  if (line.canonicalField === "Unmapped") { label = "new"; color = appTheme.colors.warning; }
  else if (notes === "history") { label = "auto"; color = appTheme.colors.success; }
  else if (notes.includes("ai")) { label = "Review"; color = appTheme.colors.warning; }
  else if (notes.includes("fuzzy")) { label = "~"; color = appTheme.colors.textSubtle; }
  if (!label) return null;
  return (
    <View style={[styles.originBadge, { borderColor: color }]}>
      <Text style={[styles.originBadgeText, { color }]}>{label}</Text>
    </View>
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

function AttachmentsCard({ attachments }: { attachments: ReconciliationAttachment[] }) {
  const [viewing, setViewing] = useState<ReconciliationAttachment | null>(null);
  const shown = attachments.slice(0, 3);
  const extra = attachments.length - shown.length;
  return (
    <View style={styles.attachRow}>
      <Ionicons name="images-outline" size={15} color={appTheme.colors.textMuted} />
      <Text style={styles.attachLabel}>Captured ({attachments.length})</Text>
      <View style={styles.attachThumbs}>
        {shown.map((a) => <AttachmentThumb key={a.id} attachment={a} size={34} onPress={() => setViewing(a)} />)}
        {extra > 0 ? (
          <Pressable style={styles.attachMore} onPress={() => setViewing(attachments[shown.length])}>
            <Text style={styles.attachMoreText}>+{extra}</Text>
          </Pressable>
        ) : null}
      </View>
      {viewing ? <ImageViewerModal attachment={viewing} onClose={() => setViewing(null)} /> : null}
    </View>
  );
}

function useAttachmentData(id: string) {
  return useQuery({
    queryKey: ["recon-attachment", id],
    queryFn: () => getReconciliationAttachment(id),
    staleTime: 5 * 60 * 1000,
  });
}

function AttachmentThumb({ attachment, onPress, size = 56 }: { attachment: ReconciliationAttachment; onPress: () => void; size?: number }) {
  const q = useAttachmentData(attachment.id);
  return (
    <Pressable style={[styles.thumb, { width: size, height: size }]} onPress={onPress}>
      {q.data ? (
        <Image source={{ uri: q.data }} style={styles.thumbImg} resizeMode="cover" />
      ) : (
        <View style={styles.thumbLoading}><ActivityIndicator size="small" color={appTheme.colors.textSubtle} /></View>
      )}
    </Pressable>
  );
}

function ImageViewerModal({ attachment, onClose }: { attachment: ReconciliationAttachment; onClose: () => void }) {
  const q = useAttachmentData(attachment.id);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    if (!q.data) return;
    try {
      setBusy(true);
      const base64 = q.data.split(",")[1] ?? "";
      const ext = q.data.startsWith("data:image/png") ? "png" : "jpg";
      const fileUri = `${FileSystem.cacheDirectory}${attachment.fileName || `till-${attachment.id}.${ext}`}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        toastError("Sharing isn't available on this device.");
      }
    } catch {
      toastError("Couldn't share the image.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.viewerBackdrop}>
        <View style={styles.viewerHeader}>
          <Text style={styles.viewerTitle} numberOfLines={1}>{attachment.sourceLabel || attachment.fileName || "Image"}</Text>
          <View style={styles.viewerActions}>
            <Pressable onPress={share} hitSlop={8} disabled={busy || !q.data} style={styles.viewerAction}>
              <Ionicons name="download-outline" size={22} color={busy || !q.data ? appTheme.colors.textSubtle : appTheme.colors.onPrimary} />
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8} style={styles.viewerAction}>
              <Ionicons name="close" size={24} color={appTheme.colors.onPrimary} />
            </Pressable>
          </View>
        </View>
        {q.data ? (
          <ZoomableImage uri={q.data} />
        ) : (
          <View style={styles.viewerImg}><ActivityIndicator color="#fff" size="large" /></View>
        )}
        <Text style={styles.viewerHint}>Pinch to zoom · double-tap · drag to pan</Text>
      </GestureHandlerRootView>
    </Modal>
  );
}

// Pinch-zoom + pan + double-tap-to-zoom image (gesture-handler + reanimated).
function ZoomableImage({ uri }: { uri: string }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const reset = () => {
    "worklet";
    scale.value = withTiming(1); savedScale.value = 1;
    tx.value = withTiming(0); ty.value = withTiming(0); savedTx.value = 0; savedTy.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => { scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5)); })
    .onEnd(() => { savedScale.value = scale.value; if (scale.value <= 1) reset(); });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => { savedTx.value = tx.value; savedTy.value = ty.value; });

  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    if (scale.value > 1) reset();
    else { scale.value = withTiming(2.5); savedScale.value = 2.5; }
  });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.Image source={{ uri }} style={[styles.viewerImg, animStyle]} resizeMode="contain" />
    </GestureDetector>
  );
}

function ProofOfCashCard({ data }: { data: Reconciliation }) {
  const p = data.summary.proofOfCash;
  const x = data.summary.safeDropCrossCheck;
  if (!p) return null; // older API build without proof-of-cash
  return (
    <View style={[ui.card, styles.groupCard]}>
      <Text style={[ui.sectionTitle, styles.groupTitle]}>Proof of cash</Text>
      <Row k="Cash in (float + takings)" v={gbp(p.cashIn)} />
      {p.paidOut !== 0 ? <Row k="Paid out" v={`− ${gbp(p.paidOut)}`} muted /> : null}
      {p.safeDrop !== 0 ? <Row k="Safe drop" v={`− ${gbp(p.safeDrop)}`} muted /> : null}
      {p.banking !== 0 ? <Row k="Banking" v={`− ${gbp(p.banking)}`} muted /> : null}
      {p.pickup !== 0 ? <Row k="Pickup" v={`− ${gbp(p.pickup)}`} muted /> : null}
      {p.cashback !== 0 ? <Row k="Cashback" v={`− ${gbp(p.cashback)}`} muted /> : null}
      {p.prizesPaid !== 0 ? <Row k="Prizes paid" v={`− ${gbp(p.prizesPaid)}`} muted /> : null}
      <View style={styles.divider} />
      <Row k="Expected in drawer" v={gbp(p.expectedDrawer)} />
      <Row k="Counted in drawer" v={gbp(p.countedDrawer)} />
      <Text style={[styles.proofFlag, { color: p.accountedFor ? appTheme.colors.success : appTheme.colors.danger }]}>
        {p.accountedFor ? "✓ All cash accounted for" : `✗ Unaccounted: ${p.variance >= 0 ? "+" : "−"}${gbp(Math.abs(p.variance))}`}
      </Text>

      {x ? (
        <View style={[styles.crossCheck, { borderColor: x.matches ? appTheme.colors.borderSoft : appTheme.colors.danger }]}>
          <Text style={styles.muted}>Safe-drop cross-check</Text>
          <Row k="Declared on report" v={gbp(x.declaredOnReport)} muted />
          <Row k="Recorded in Safe Drop" v={gbp(x.recordedInSafeModule)} muted />
          <Text style={[styles.proofFlag, { color: x.matches ? appTheme.colors.success : appTheme.colors.danger }]}>
            {x.matches ? "✓ Matches the safe" : `✗ Off by ${gbp(Math.abs(x.difference))} — drop not backed by the safe`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function StatusPill({ status }: { status: Reconciliation["status"] }) {
  const tone = status === "Approved" ? appTheme.colors.success : status === "Reconciled" ? appTheme.colors.info : appTheme.colors.textSubtle;
  return <View style={[styles.pill, { borderColor: tone }]}><Text style={[styles.pillText, { color: tone }]}>{status}</Text></View>;
}

function LineEditor({ reconciliationId, line, fieldOptions, onClose, onSaved }: {
  reconciliationId: string; line: ReconciliationLine | null; fieldOptions: FieldOptionGroup[]; onClose: () => void; onSaved: (r: Reconciliation) => void;
}) {
  const [field, setField] = useState<FieldCode | null>(line?.canonicalField ?? null);
  const [amount, setAmount] = useState(line ? String(line.verifiedAmount) : "");
  const [quantity, setQuantity] = useState(line?.quantity != null ? String(line.quantity) : "");
  const isCount = field === "NoSale";
  const insets = useSafeAreaInsets();

  const saveMutation = useMutation({
    mutationFn: () => saveReconciliationLine({
      reconciliationId,
      lineId: line?.id,
      canonicalField: field!,
      rawLabel: line?.rawLabel ?? undefined,
      verifiedAmount: isCount ? 0 : num(amount),
      quantity: isCount ? Math.round(num(quantity)) : undefined,
      captureMethod: "Manual",
      status: "Verified",
      learnMapping: true,
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
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetBackdropTop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheetTop, { paddingTop: insets.top + appTheme.spacing.sm, paddingBottom: insets.bottom + appTheme.spacing.md }]}>
          <View style={styles.sheetHeader}>
            <Text style={ui.sectionTitle}>{line ? "Edit line" : "Add line"}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={appTheme.colors.text} /></Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: appTheme.spacing.sm }}>
            {fieldOptions.map((g) => (
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
          <View style={styles.modalInputRow}>
            {isCount ? (
              <FloatingLabelInput label="Count" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
            ) : (
              <FloatingLabelInput label="Amount (£)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" prefix="£" />
            )}
          </View>
          <View style={styles.modalFooter}>
            <PrimaryButton label={saveMutation.isPending ? "Saving…" : "Save line"} onPress={() => saveMutation.mutate()} disabled={!valid || saveMutation.isPending} />
            {line ? (
              <PrimaryButton label="Remove" tone="danger" onPress={async () => {
                if (await confirmDestructive({ title: "Remove line?", confirmLabel: "Remove" })) deleteMutation.mutate();
              }} />
            ) : null}
            <PrimaryButton label="Cancel" tone="neutral" onPress={onClose} />
          </View>
        </View>
      </KeyboardAvoidingView>
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
  const insets = useSafeAreaInsets();

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
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sheetBackdropTop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.sheetTop, { paddingTop: insets.top + appTheme.spacing.sm, paddingBottom: insets.bottom + appTheme.spacing.md }]}>
          <View style={styles.sheetHeader}>
            <Text style={ui.sectionTitle}>Cash count</Text>
            <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={appTheme.colors.text} /></Pressable>
          </View>

          {denomOpen ? (
            <>
              <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: appTheme.spacing.sm }}>
                {DENOMS.map((d) => (
                  <View key={d.value} style={styles.denomRow}>
                    <Text style={styles.denomLabel}>{d.label}</Text>
                    <FloatingLabelInput label="Qty" value={qty[d.value] ?? ""} onChangeText={(t) => setQty((p) => ({ ...p, [d.value]: t }))} keyboardType="number-pad" containerStyle={{ width: 110 }} />
                    <Text style={styles.denomSub}>{gbp(d.value * num(qty[d.value] ?? ""))}</Text>
                  </View>
                ))}
                <View style={styles.kvRow}><Text style={styles.kvKey}>Total</Text><Text style={styles.kvVal}>{gbp(denomTotal)}</Text></View>
              </ScrollView>
              <View style={styles.modalFooter}>
                <PrimaryButton label={`Use ${gbp(denomTotal)}`} onPress={() => { setCounted(String(denomTotal.toFixed(2))); setDenomOpen(false); }} />
                <PrimaryButton label="Back" tone="neutral" onPress={() => setDenomOpen(false)} />
              </View>
            </>
          ) : (
            <>
              <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, paddingBottom: appTheme.spacing.sm }}>
                <FloatingLabelInput label="Opening float (£)" value={openingFloat} onChangeText={setOpeningFloat} keyboardType="decimal-pad" prefix="£" />
                <FloatingLabelInput label="Counted cash (£)" value={counted} onChangeText={setCounted} keyboardType="decimal-pad" prefix="£" />
                <Pressable style={styles.countBtn} onPress={() => setDenomOpen(true)}>
                  <Ionicons name="calculator-outline" size={16} color={appTheme.colors.primary} />
                  <Text style={styles.countBtnText}>Count by denomination</Text>
                </Pressable>
                <FloatingLabelInput label="Float to carry (£)" value={floatToCarry} onChangeText={setFloatToCarry} keyboardType="decimal-pad" prefix="£" />
                <FloatingLabelInput label="Card terminal total (£)" value={cardCounted} onChangeText={setCardCounted} keyboardType="decimal-pad" prefix="£" />
              </ScrollView>
              <View style={styles.modalFooter}>
                <PrimaryButton label={saveMutation.isPending ? "Saving…" : "Save count"} onPress={() => saveMutation.mutate()} disabled={!counted.trim() || saveMutation.isPending} />
                <PrimaryButton label="Cancel" tone="neutral" onPress={onClose} />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { gap: appTheme.spacing.xs, paddingBottom: appTheme.spacing.xl },
  groupCard: { paddingVertical: appTheme.spacing.sm, paddingHorizontal: appTheme.spacing.md },
  groupTitle: { marginBottom: 2 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: appTheme.spacing.sm },
  tillPickerBlock: { marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft, paddingTop: 2 },
  segRow: { flexDirection: "row", gap: 2, padding: 2, borderRadius: 999, backgroundColor: appTheme.colors.surfaceMuted, marginTop: 2 },
  segChip: { flex: 1, alignItems: "center", paddingVertical: 6, paddingHorizontal: 6, borderRadius: 999 },
  segChipActive: { backgroundColor: appTheme.colors.surface, shadowColor: "#0f172a", shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  segText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  segTextActive: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium },
  label: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, marginBottom: 2 },
  muted: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 12 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  kvKey: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 14 },
  kvVal: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  divider: { height: 1, backgroundColor: appTheme.colors.borderSoft, marginVertical: 4 },
  varianceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  varianceLabel: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 16 },
  varianceValue: { fontFamily: appTheme.fonts.heading, fontSize: 20 },
  captureHint: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16, marginBottom: 10 },
  captureRow: { flexDirection: "row", gap: appTheme.spacing.sm },
  captureBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 13, paddingHorizontal: 12, borderRadius: appTheme.radius.md, borderWidth: 1 },
  captureBtnPrimary: { backgroundColor: appTheme.colors.primary, borderColor: appTheme.colors.primary },
  captureBtnOutline: { backgroundColor: appTheme.colors.surface, borderColor: appTheme.colors.primary },
  capturePressed: { opacity: 0.8 },
  captureDisabled: { opacity: 0.5 },
  captureText: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  captureTextPrimary: { color: appTheme.colors.onPrimary },
  captureTextOutline: { color: appTheme.colors.primary },
  helpBtn: { paddingLeft: 4, paddingBottom: 2, alignSelf: "flex-end" },
  stepsWrap: { gap: 12, marginTop: 4, marginBottom: 12 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: appTheme.colors.surfaceBrandSoft, alignItems: "center", justifyContent: "center" },
  stepNumText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 15 },
  stepIcon: { marginTop: 1 },
  stepTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  stepDetail: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16, marginTop: 1 },
  helpBackdrop: { flex: 1, backgroundColor: appTheme.colors.overlay, justifyContent: "flex-end" },
  helpSheet: { backgroundColor: appTheme.colors.background, borderTopLeftRadius: appTheme.radius.lg, borderTopRightRadius: appTheme.radius.lg, padding: appTheme.spacing.md, gap: 8 },
  helpHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: appTheme.spacing.sm },
  ingestBackdrop: { flex: 1, backgroundColor: appTheme.colors.overlay, alignItems: "center", justifyContent: "center", padding: appTheme.spacing.lg },
  ingestCard: { width: "100%", maxWidth: 320, alignItems: "center", gap: 10, backgroundColor: appTheme.colors.surface, borderRadius: appTheme.radius.lg, paddingVertical: 28, paddingHorizontal: 24 },
  ingestTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 16, lineHeight: 20, marginTop: 4 },
  ingestMsg: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18, textAlign: "center" },
  ingestHint: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16, textAlign: "center" },
  reasonInput: { marginTop: 6, borderWidth: 1, borderColor: appTheme.colors.border, borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceMuted, color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  attachRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  attachLabel: { flex: 1, color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13 },
  attachThumbs: { flexDirection: "row", alignItems: "center", gap: 4 },
  attachMore: { width: 34, height: 34, borderRadius: appTheme.radius.sm, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: appTheme.colors.border, backgroundColor: appTheme.colors.surfaceMuted },
  attachMoreText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  thumbRow: { gap: appTheme.spacing.xs, paddingVertical: 2 },
  thumb: { width: 56, height: 56, borderRadius: appTheme.radius.sm, overflow: "hidden", borderWidth: 1, borderColor: appTheme.colors.border, backgroundColor: appTheme.colors.surfaceMuted },
  thumbImg: { width: "100%", height: "100%" },
  thumbLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  viewerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)" },
  viewerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 44, paddingHorizontal: appTheme.spacing.md, paddingBottom: appTheme.spacing.sm },
  viewerTitle: { flex: 1, color: appTheme.colors.onPrimary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  viewerActions: { flexDirection: "row", gap: appTheme.spacing.md },
  viewerAction: { padding: 4 },
  viewerImg: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  viewerHint: { textAlign: "center", color: "rgba(255,255,255,0.5)", fontFamily: appTheme.fonts.body, fontSize: 12, paddingVertical: 10 },
  verifyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: appTheme.colors.warning },
  verifyHint: { color: appTheme.colors.warning, fontFamily: appTheme.fonts.body, fontSize: 11, marginTop: 2 },
  proofFlag: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, marginTop: 8 },
  crossCheck: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: appTheme.colors.borderSoft, borderRadius: appTheme.radius.sm, borderWidth: 1, padding: 10 },
  countBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 6, paddingVertical: 8, borderRadius: appTheme.radius.sm, borderWidth: 1, borderColor: appTheme.colors.border },
  countBtnText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  lineBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  lineNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  originBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  originBadgeText: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 10 },
  banner: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 4 },
  bannerChip: { color: appTheme.colors.success, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  ignoredHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  restoreBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  restoreText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  sectionTotalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2, paddingTop: 6, borderTopWidth: 1, borderTopColor: appTheme.colors.border },
  sectionTotalLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  sectionTotal: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 14 },
  selectBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderColor: appTheme.colors.primary, borderWidth: 1 },
  selectCount: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  selectActions: { flexDirection: "row", gap: appTheme.spacing.sm },
  selectBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6 },
  selectBtnText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  lineName: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  lineAmount: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: appTheme.radius.sm, borderWidth: 1, borderColor: appTheme.colors.border, borderStyle: "dashed" },
  addBtnText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  footerRow: { flexDirection: "row", gap: appTheme.spacing.sm },
  footerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: appTheme.radius.md },
  footerBtnOutline: { flex: 1, borderWidth: 1, borderColor: appTheme.colors.primary, backgroundColor: appTheme.colors.surface },
  footerBtnOutlineText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  footerBtnPrimary: { flex: 2, backgroundColor: appTheme.colors.primary },
  footerBtnPrimaryText: { color: appTheme.colors.onPrimary, fontFamily: appTheme.fonts.heading, fontSize: 15 },
  footerBtnDisabled: { opacity: 0.45 },
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
  sheetBackdropTop: { flex: 1, backgroundColor: appTheme.colors.background },
  sheetTop: { flex: 1, backgroundColor: appTheme.colors.background, paddingHorizontal: appTheme.spacing.md, gap: 6 },
  modalInputRow: { paddingTop: appTheme.spacing.sm },
  modalFooter: { paddingTop: appTheme.spacing.sm, marginTop: appTheme.spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft, gap: appTheme.spacing.sm },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  denomRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  denomLabel: { width: 48, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  denomSub: { flex: 1, textAlign: "right", color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13 },
});
