import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../auth/AuthContext";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { LoadingState } from "../../components/LoadingState";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { toastError, toastSuccess } from "../../components/toast";
import { confirmDestructive } from "../../utils/confirm";
import { appTheme } from "../../ui/theme";
import { ui } from "../../ui/primitives";
import { formatDateValue } from "../../components/DateTimeField";
import { getRota } from "../../api/rotaApi";
import {
  listShiftSwaps,
  createShiftSwap,
  respondShiftSwap,
  cancelShiftSwap,
  ShiftSwapRequest,
  ShiftSwapType,
} from "../../api/shiftSwapsApi";
import { RotaShift } from "../../types/models";

const statusTone: Record<string, string> = {
  Pending: appTheme.colors.warning,
  Completed: appTheme.colors.success,
  Declined: appTheme.colors.danger,
  Cancelled: appTheme.colors.textSubtle,
};

export function ShiftSwapsScreen() {
  const { activeShopId, profile } = useAuth();
  const shopId = activeShopId as string;
  const me = profile?.userId;
  const qc = useQueryClient();
  const [composing, setComposing] = useState(false);

  const today = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 28);
  const from = formatDateValue(today);
  const to = formatDateValue(horizon);

  const swapsQ = useQuery({ queryKey: ["shift-swaps", shopId], queryFn: () => listShiftSwaps(shopId), enabled: Boolean(shopId) });
  const rotaQ = useQuery({ queryKey: ["rota", shopId, from, to], queryFn: () => getRota(shopId, from, to), enabled: Boolean(shopId) });

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => respondShiftSwap(id, accept),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shift-swaps", shopId] }); toastSuccess("Done."); },
    onError: (e: any) => toastError(e?.response?.data?.message ?? "Couldn't respond."),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelShiftSwap(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shift-swaps", shopId] }); toastSuccess("Cancelled."); },
    onError: (e: any) => toastError(e?.response?.data?.message ?? "Couldn't cancel."),
  });

  const swaps = swapsQ.data ?? [];
  const incoming = swaps.filter((s) => s.status === "Pending" && s.canRespond);
  const mine = swaps.filter((s) => s.requesterUserId === me);
  const others = swaps.filter((s) => !incoming.includes(s) && !mine.includes(s));

  if (!shopId) return <ScreenContainer><Text style={styles.muted}>Select a shop first.</Text></ScreenContainer>;

  const footer = (
    <PrimaryButton label="Request a swap" icon="swap-horizontal-outline" onPress={() => setComposing(true)} />
  );

  return (
    <ScreenContainer footer={footer}>
      {swapsQ.isLoading ? <LoadingState inline /> : null}

      <Section title="To respond" rows={incoming} me={me}
        action={(s) => (
          <View style={styles.actionRow}>
            <Pressable style={[styles.actBtn, styles.actAccept]} onPress={() => respond.mutate({ id: s.id, accept: true })} disabled={respond.isPending}>
              <Text style={styles.actAcceptText}>Accept</Text>
            </Pressable>
            <Pressable style={[styles.actBtn, styles.actDecline]} onPress={() => respond.mutate({ id: s.id, accept: false })} disabled={respond.isPending}>
              <Text style={styles.actDeclineText}>Decline</Text>
            </Pressable>
          </View>
        )} />

      <Section title="My requests" rows={mine} me={me}
        action={(s) => s.status === "Pending" ? (
          <Pressable style={[styles.actBtn, styles.actDecline]} onPress={async () => {
            if (await confirmDestructive({ title: "Cancel request?", confirmLabel: "Cancel request" })) cancel.mutate(s.id);
          }}>
            <Text style={styles.actDeclineText}>Cancel</Text>
          </Pressable>
        ) : null} />

      {others.length > 0 ? <Section title="Shop activity" rows={others} me={me} action={() => null} /> : null}

      {!swapsQ.isLoading && swaps.length === 0 ? (
        <Text style={styles.muted}>No swap requests. Tap "Request a swap" to start one.</Text>
      ) : null}

      {composing ? (
        <ComposeSwapModal
          shopId={shopId}
          me={me}
          rota={rotaQ.data ?? []}
          onClose={() => setComposing(false)}
          onCreated={() => { setComposing(false); qc.invalidateQueries({ queryKey: ["shift-swaps", shopId] }); }}
        />
      ) : null}
    </ScreenContainer>
  );
}

function Section({ title, rows, action, me }: {
  title: string; rows: ShiftSwapRequest[]; action: (s: ShiftSwapRequest) => React.ReactNode; me?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={ui.card}>
      <Text style={ui.sectionTitle}>{title}</Text>
      {rows.map((s) => (
        <View key={s.id} style={styles.swapRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.swapTitle}>
              {s.type === "Swap" ? "Swap" : "Give-away"} · <Text style={{ color: statusTone[s.status] }}>{s.status}</Text>
            </Text>
            <Text style={styles.swapLine}>{s.requesterUserId === me ? "You" : s.requesterName} → {s.targetName}{s.targetIsExternal ? " (external)" : ""}</Text>
            <Text style={styles.swapMeta}>Gives: {s.fromShiftLabel}</Text>
            {s.toShiftLabel ? <Text style={styles.swapMeta}>Takes: {s.toShiftLabel}</Text> : null}
            {s.note ? <Text style={styles.swapNote}>“{s.note}”</Text> : null}
          </View>
          <View>{action(s)}</View>
        </View>
      ))}
    </View>
  );
}

function ComposeSwapModal({ shopId, me, rota, onClose, onCreated }: {
  shopId: string; me?: string; rota: RotaShift[]; onClose: () => void; onCreated: () => void;
}) {
  const [type, setType] = useState<ShiftSwapType>("Swap");
  const [fromShiftId, setFromShiftId] = useState<string | undefined>();
  const [targetKey, setTargetKey] = useState<string | undefined>(); // for give-away: userId/memberId; for swap: toShiftId
  const [note, setNote] = useState("");

  const label = (s: RotaShift) => `${s.shiftDate} · ${s.shiftName} (${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)})`;
  const myShifts = useMemo(() => rota.filter((s) => s.assignees.some((a) => a.userId === me)), [rota, me]);
  // Swap targets = other people's shifts; give-away targets = distinct staff (not me).
  const otherShifts = useMemo(() => rota.filter((s) => s.id !== fromShiftId && s.assignees.some((a) => a.userId !== me || a.rotaStaffMemberId)), [rota, fromShiftId, me]);
  const giveAwayStaff = useMemo(() => {
    const seen = new Map<string, { key: string; name: string; userId?: string; memberId?: string }>();
    for (const s of rota) for (const a of s.assignees) {
      const key = a.userId ?? a.rotaStaffMemberId;
      if (!key || a.userId === me) continue;
      if (!seen.has(key)) seen.set(key, { key, name: a.name, userId: a.userId ?? undefined, memberId: a.rotaStaffMemberId ?? undefined });
    }
    return [...seen.values()];
  }, [rota, me]);

  const create = useMutation({
    mutationFn: () => {
      if (!fromShiftId) throw new Error("Pick your shift.");
      if (type === "Swap") {
        const toShift = rota.find((s) => s.id === targetKey);
        const assignee = toShift?.assignees[0];
        if (!toShift || !assignee) throw new Error("Pick the shift to swap into.");
        return createShiftSwap({
          shopId, type, fromShiftId, toShiftId: toShift.id,
          targetUserId: assignee.userId ?? undefined,
          targetRotaStaffMemberId: assignee.rotaStaffMemberId ?? undefined,
          note: note.trim() || undefined,
        });
      }
      const staff = giveAwayStaff.find((g) => g.key === targetKey);
      if (!staff) throw new Error("Pick who takes the shift.");
      return createShiftSwap({ shopId, type, fromShiftId, targetUserId: staff.userId, targetRotaStaffMemberId: staff.memberId, note: note.trim() || undefined });
    },
    onSuccess: () => { toastSuccess("Request sent."); onCreated(); },
    onError: (e: any) => toastError(e?.response?.data?.message ?? e?.message ?? "Couldn't send request."),
  });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={ui.sectionTitle}>Request a swap</Text>
            <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={appTheme.colors.text} /></Pressable>
          </View>
          <ScrollView style={{ maxHeight: 460 }}>
            <Text style={styles.label}>Type</Text>
            <View style={styles.seg}>
              {(["Swap", "GiveAway"] as const).map((t) => (
                <Pressable key={t} style={[styles.segChip, type === t ? styles.segChipActive : null]} onPress={() => { setType(t); setTargetKey(undefined); }}>
                  <Text style={[styles.segText, type === t ? styles.segTextActive : null]}>{t === "Swap" ? "Swap" : "Give away"}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Your shift</Text>
            {myShifts.length === 0 ? <Text style={styles.muted}>You have no upcoming shifts.</Text> : myShifts.map((s) => (
              <Pressable key={s.id} style={[styles.pick, fromShiftId === s.id ? styles.pickActive : null]} onPress={() => setFromShiftId(s.id)}>
                <Text style={styles.pickText}>{label(s)}</Text>
              </Pressable>
            ))}

            <Text style={styles.label}>{type === "Swap" ? "Swap into (their shift)" : "Give to"}</Text>
            {type === "Swap" ? (
              otherShifts.length === 0 ? <Text style={styles.muted}>No other shifts to swap into.</Text> : otherShifts.map((s) => (
                <Pressable key={s.id} style={[styles.pick, targetKey === s.id ? styles.pickActive : null]} onPress={() => setTargetKey(s.id)}>
                  <Text style={styles.pickText}>{label(s)} — {s.assignees[0]?.name ?? "?"}</Text>
                </Pressable>
              ))
            ) : (
              giveAwayStaff.length === 0 ? <Text style={styles.muted}>No other staff found.</Text> : giveAwayStaff.map((g) => (
                <Pressable key={g.key} style={[styles.pick, targetKey === g.key ? styles.pickActive : null]} onPress={() => setTargetKey(g.key)}>
                  <Text style={styles.pickText}>{g.name}{g.memberId ? " (external)" : ""}</Text>
                </Pressable>
              ))
            )}

            <View style={{ height: 8 }} />
            <FloatingLabelInput label="Note (optional)" value={note} onChangeText={setNote} />
          </ScrollView>
          <View style={styles.footer}>
            <PrimaryButton label={create.isPending ? "Sending…" : "Send request"} onPress={() => create.mutate()} disabled={!fromShiftId || !targetKey || create.isPending} />
            <PrimaryButton label="Cancel" tone="neutral" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  muted: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 13, padding: 8 },
  swapRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  swapTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  swapLine: { color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 13, marginTop: 2 },
  swapMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, marginTop: 1 },
  swapNote: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 12, fontStyle: "italic", marginTop: 2 },
  actionRow: { flexDirection: "row", gap: 6 },
  actBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: appTheme.radius.sm },
  actAccept: { backgroundColor: appTheme.colors.primary },
  actAcceptText: { color: appTheme.colors.onPrimary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  actDecline: { borderWidth: 1, borderColor: appTheme.colors.border },
  actDeclineText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: appTheme.colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: appTheme.colors.background, borderTopLeftRadius: appTheme.radius.lg, borderTopRightRadius: appTheme.radius.lg, padding: appTheme.spacing.md, gap: 6 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  label: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, marginTop: 10, marginBottom: 4 },
  seg: { flexDirection: "row", gap: 2, padding: 2, borderRadius: 999, backgroundColor: appTheme.colors.surfaceMuted },
  segChip: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 999 },
  segChipActive: { backgroundColor: appTheme.colors.surface },
  segText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  segTextActive: { color: appTheme.colors.primary },
  pick: { paddingVertical: 9, paddingHorizontal: 10, borderRadius: appTheme.radius.sm, borderWidth: 1, borderColor: appTheme.colors.border, marginBottom: 6 },
  pickActive: { borderColor: appTheme.colors.primary, backgroundColor: appTheme.colors.surfaceTint },
  pickText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 13 },
  footer: { paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft, gap: 8 },
});
