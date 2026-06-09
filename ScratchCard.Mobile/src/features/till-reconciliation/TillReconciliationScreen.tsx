import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
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
        <View style={ui.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Business date</Text>
              <DateTimeField mode="date" value={businessDate} onChange={(d) => { setBusinessDate(d); setShiftId(undefined); }} />
            </View>
            {data ? <StatusPill status={data.status} /> : null}
          </View>

          <View style={styles.tillPickerBlock}>
            <Text style={styles.label}>Reconcile by</Text>
            <View style={styles.chipWrap}>
              {(["DayEnd", "Shift"] as const).map((rt) => {
                const active = reportType === rt;
                return (
                  <Pressable key={rt} onPress={() => setReportType(rt)} style={[styles.chip, active ? styles.chipActive : null]}>
                    <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{rt === "DayEnd" ? "Day-end" : "Shift"}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {reportType === "Shift" ? (
            <View style={styles.tillPickerBlock}>
              <Text style={styles.label}>Shift</Text>
              {shifts.length === 0 ? (
                <Text style={styles.muted}>{shiftsQ.isLoading || businessDayQ.isLoading ? "Loading shifts…" : "No shifts for this date."}</Text>
              ) : (
                <View style={styles.chipWrap}>
                  {shifts.map((s) => {
                    const active = effectiveShiftId === s.id;
                    return (
                      <Pressable key={s.id} onPress={() => setShiftId(s.id)} style={[styles.chip, active ? styles.chipActive : null]}>
                        <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{s.shiftName}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}

          {multiTill ? (
            <View style={styles.tillPickerBlock}>
              <Text style={styles.label}>Till</Text>
              <View style={styles.chipWrap}>
                {tills.map((t) => {
                  const active = effectiveTillId === t.id;
                  return (
                    <Pressable key={t.id} onPress={() => setTillId(t.id)} style={[styles.chip, active ? styles.chipActive : null]}>
                      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{t.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>

        {q.isLoading ? <LoadingState inline /> : null}

        {data && !locked && canOcr ? (
          <View style={styles.captureRow}>
            <Pressable style={styles.captureBtn} onPress={() => ingestMutation.mutate("camera")} disabled={ingestMutation.isPending}>
              <Ionicons name="camera-outline" size={18} color={appTheme.colors.primary} />
              <Text style={styles.captureText}>{ingestMutation.isPending ? "Reading…" : "Photo"}</Text>
            </Pressable>
            <Pressable style={styles.captureBtn} onPress={() => ingestMutation.mutate("library")} disabled={ingestMutation.isPending}>
              <Ionicons name="image-outline" size={18} color={appTheme.colors.primary} />
              <Text style={styles.captureText}>Upload</Text>
            </Pressable>
          </View>
        ) : null}

        {data && data.attachments.length > 0 ? <AttachmentsCard attachments={data.attachments} /> : null}

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

            {/* Proof of cash — where the cash came from and where it went */}
            {data.countedCash != null ? <ProofOfCashCard data={data} /> : null}

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
                    {l.status !== "Verified" ? <View style={styles.verifyDot} /> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineName}>
                        {l.canonicalField === "Unmapped" ? (l.rawLabel || "Unmapped") : l.fieldName}
                      </Text>
                      {l.rawLabel && l.canonicalField !== "Unmapped" ? <Text style={styles.muted} numberOfLines={1}>{l.rawLabel}</Text> : null}
                      {l.status !== "Verified" ? <Text style={styles.verifyHint}>Tap to verify</Text> : null}
                    </View>
                    <Text style={styles.lineAmount}>
                      {l.canonicalField === "NoSale" ? `× ${l.quantity ?? 0}` : gbp(l.verifiedAmount)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}

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

            {/* Approved (read-only) banner */}
            {locked ? (
              <View style={[ui.card, { alignItems: "center" }]}>
                <Text style={styles.approved}>✓ Approved{data.confirmedOn ? ` · ${new Date(data.confirmedOn).toLocaleString("en-GB")}` : ""}</Text>
              </View>
            ) : null}
          </>
        ) : null}

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

function AttachmentsCard({ attachments }: { attachments: ReconciliationAttachment[] }) {
  const [viewing, setViewing] = useState<ReconciliationAttachment | null>(null);
  return (
    <View style={ui.card}>
      <Text style={ui.sectionTitle}>Captured images ({attachments.length})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
        {attachments.map((a) => <AttachmentThumb key={a.id} attachment={a} onPress={() => setViewing(a)} />)}
      </ScrollView>
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

function AttachmentThumb({ attachment, onPress }: { attachment: ReconciliationAttachment; onPress: () => void }) {
  const q = useAttachmentData(attachment.id);
  return (
    <Pressable style={styles.thumb} onPress={onPress}>
      {q.data ? (
        <Image source={{ uri: q.data }} style={styles.thumbImg} resizeMode="cover" />
      ) : (
        <View style={styles.thumbLoading}><ActivityIndicator color={appTheme.colors.textSubtle} /></View>
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
      <View style={styles.viewerBackdrop}>
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
          <Image source={{ uri: q.data }} style={styles.viewerImg} resizeMode="contain" />
        ) : (
          <View style={styles.viewerImg}><ActivityIndicator color="#fff" size="large" /></View>
        )}
      </View>
    </Modal>
  );
}

function ProofOfCashCard({ data }: { data: Reconciliation }) {
  const p = data.summary.proofOfCash;
  const x = data.summary.safeDropCrossCheck;
  if (!p) return null; // older API build without proof-of-cash
  return (
    <View style={ui.card}>
      <Text style={ui.sectionTitle}>Proof of cash</Text>
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
              <PrimaryButton label={`Use ${gbp(denomTotal)}`} onPress={() => { setCounted(String(denomTotal.toFixed(2))); setDenomOpen(false); }} />
              <PrimaryButton label="Back" tone="neutral" onPress={() => setDenomOpen(false)} />
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
              <PrimaryButton label={saveMutation.isPending ? "Saving…" : "Save count"} onPress={() => saveMutation.mutate()} disabled={!counted.trim() || saveMutation.isPending} />
              <PrimaryButton label="Cancel" tone="neutral" onPress={onClose} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { gap: appTheme.spacing.sm, paddingBottom: appTheme.spacing.xl },
  row: { flexDirection: "row", alignItems: "flex-end", gap: appTheme.spacing.sm },
  tillPickerBlock: { marginTop: appTheme.spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft, paddingTop: appTheme.spacing.sm },
  label: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, marginBottom: 4 },
  muted: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 12 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  kvKey: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 14 },
  kvVal: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  divider: { height: 1, backgroundColor: appTheme.colors.borderSoft, marginVertical: 6 },
  varianceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  varianceLabel: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 16 },
  varianceValue: { fontFamily: appTheme.fonts.heading, fontSize: 20 },
  captureRow: { flexDirection: "row", gap: appTheme.spacing.sm },
  captureBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: appTheme.radius.sm, borderWidth: 1, borderColor: appTheme.colors.border, backgroundColor: appTheme.colors.surface },
  captureText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  thumbRow: { gap: appTheme.spacing.sm, paddingVertical: 6 },
  thumb: { width: 84, height: 84, borderRadius: appTheme.radius.sm, overflow: "hidden", borderWidth: 1, borderColor: appTheme.colors.border, backgroundColor: appTheme.colors.surfaceMuted },
  thumbImg: { width: "100%", height: "100%" },
  thumbLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  viewerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)" },
  viewerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 44, paddingHorizontal: appTheme.spacing.md, paddingBottom: appTheme.spacing.sm },
  viewerTitle: { flex: 1, color: appTheme.colors.onPrimary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  viewerActions: { flexDirection: "row", gap: appTheme.spacing.md },
  viewerAction: { padding: 4 },
  viewerImg: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  verifyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: appTheme.colors.warning },
  verifyHint: { color: appTheme.colors.warning, fontFamily: appTheme.fonts.body, fontSize: 11, marginTop: 2 },
  proofFlag: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, marginTop: 8 },
  crossCheck: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: appTheme.colors.borderSoft, borderRadius: appTheme.radius.sm, borderWidth: 1, padding: 10 },
  countBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, paddingVertical: 10, borderRadius: appTheme.radius.sm, borderWidth: 1, borderColor: appTheme.colors.border },
  countBtnText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
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
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  denomRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  denomLabel: { width: 48, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  denomSub: { flex: 1, textAlign: "right", color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13 },
});
