import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import {
  checkInShift,
  checkOutShift,
  createRotaShift,
  deleteRotaShift,
  getAssignableUsers,
  getMyCurrentAttendance,
  getMyShifts,
  getRota,
  getShiftTemplates,
  getTimesheet,
  getPendingApprovals,
  approveAttendance,
  saveManualAttendance,
  updateRotaShift,
  type SaveRotaShiftPayload,
} from "../../api/rotaApi";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { DateRangeQuickPicks } from "../../components/DateRangeQuickPicks";
import { LoadingState } from "../../components/LoadingState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { confirmDestructive } from "../../utils/confirm";
import { toastError } from "../../components/toast";
import { RotaShift } from "../../types/models";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

const shortTime = (t: string) => (t && t.length >= 5 ? t.slice(0, 5) : t);

function dayLabel(date: string) {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function last7() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  return { from: formatDateValue(from), to: formatDateValue(to) };
}

function next14() {
  const from = new Date();
  const to = new Date(from);
  to.setDate(to.getDate() + 13);
  return { from: formatDateValue(from), to: formatDateValue(to) };
}

// Manager rota defaults to the week ahead (today → +6) so newly rostered shifts are visible.
function weekAhead() {
  const from = new Date();
  const to = new Date(from);
  to.setDate(to.getDate() + 6);
  return { from: formatDateValue(from), to: formatDateValue(to) };
}

const GRACE_MIN = 5;
const clockTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";

// Combine a yyyy-MM-dd date with an HH:mm time (device-local) into a UTC ISO string for the API.
const toIso = (dateStr: string, hhmm: string) => new Date(`${dateStr}T${hhmm}:00`).toISOString();

// Worked duration as "5h 24m" (or "24m" when under an hour).
function workedLabel(inIso: string, outIso: string) {
  const mins = Math.max(0, Math.round((new Date(outIso).getTime() - new Date(inIso).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// An ISO timestamp as device-local "HH:mm" (24h), suitable for the time picker.
function toHHmm(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Variance of an actual time vs the scheduled time, with a small grace window.
function variance(actualIso: string, dateStr: string, schedTimeHHmmss: string, kind: "in" | "out") {
  const sched = new Date(`${dateStr}T${schedTimeHHmmss}`).getTime();
  const diff = Math.round((new Date(actualIso).getTime() - sched) / 60000); // minutes, +late / -early
  if (Math.abs(diff) <= GRACE_MIN) return { text: "on time", tone: "on" as const };
  const mag = Math.abs(diff);
  const span = mag >= 60 ? `${Math.floor(mag / 60)}h ${mag % 60}m` : `${mag}m`;
  // For check-in: late = bad. For check-out: leaving early = bad, staying late = neutral.
  if (kind === "in") return diff > 0 ? { text: `${span} late`, tone: "bad" as const } : { text: `${span} early`, tone: "good" as const };
  return diff < 0 ? { text: `left ${span} early`, tone: "bad" as const } : { text: `${span} late out`, tone: "neutral" as const };
}

function vStyle(tone: "good" | "bad" | "neutral" | "on") {
  if (tone === "bad") return styles.vBad;
  if (tone === "good") return styles.vGood;
  if (tone === "on") return styles.vOn;
  return styles.vNeutral;
}

// ---------------------------------------------------------------------------
// My Shifts + check in/out (staff)
// ---------------------------------------------------------------------------
export function MyShiftsScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const queryClient = useQueryClient();
  const { from, to } = useMemo(() => next14(), []);
  const [manualShift, setManualShift] = useState<RotaShift | null>(null);
  const [manualIn, setManualIn] = useState("09:00");
  const [manualOut, setManualOut] = useState("17:00");

  const attendanceQuery = useQuery({
    queryKey: ["rota-attendance", shopId],
    queryFn: () => getMyCurrentAttendance(shopId as string),
    enabled: Boolean(shopId),
  });
  const shiftsQuery = useQuery({
    queryKey: ["rota-my-shifts", shopId, from, to],
    queryFn: () => getMyShifts(shopId as string, from, to),
    enabled: Boolean(shopId),
  });

  const current = attendanceQuery.data;
  const isCheckedInSomewhere = Boolean(current && !current.checkOutAt);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["rota-attendance", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["rota-my-shifts", shopId] });
  };

  const checkInMutation = useMutation({
    mutationFn: (rotaShiftId: string) => checkInShift(shopId as string, rotaShiftId),
    onSuccess: refresh,
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't check in."),
  });
  const checkOutMutation = useMutation({
    mutationFn: () => checkOutShift(shopId as string),
    onSuccess: refresh,
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't check out."),
  });
  const manualMutation = useMutation({
    mutationFn: () =>
      saveManualAttendance({
        shopId: shopId as string,
        rotaShiftId: manualShift!.id,
        checkInAt: toIso(manualShift!.shiftDate, manualIn),
        checkOutAt: manualOut ? toIso(manualShift!.shiftDate, manualOut) : undefined,
      }),
    onSuccess: () => { setManualShift(null); refresh(); },
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't save times."),
  });

  const openManual = (shift: RotaShift) => {
    const att = shift.myAttendance;
    // Default to the actual times if already recorded, otherwise the shift's scheduled start/end.
    setManualIn(att?.checkInAt ? toHHmm(att.checkInAt) : shortTime(shift.startTime));
    setManualOut(att?.checkOutAt ? toHHmm(att.checkOutAt) : shortTime(shift.endTime));
    setManualShift(shift);
  };

  const busy = checkInMutation.isPending || checkOutMutation.isPending;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>My shifts</Text>
        {isCheckedInSomewhere ? (
          <Text style={styles.muted}>You're on shift since {clockTime(current?.checkInAt)}. Check out before starting another.</Text>
        ) : null}

        {shiftsQuery.isLoading ? <LoadingState inline /> : null}
        {!shiftsQuery.isLoading && (shiftsQuery.data?.length ?? 0) === 0 ? (
          <View style={ui.card}><Text style={styles.muted}>No shifts scheduled for the next 2 weeks.</Text></View>
        ) : null}

        {(shiftsQuery.data ?? []).map((shift) => {
          const att = shift.myAttendance;
          const open = Boolean(att && !att.checkOutAt);
          const completed = Boolean(att && att.checkOutAt);
          const onAnotherShift = isCheckedInSomewhere && current?.rotaShiftId !== shift.id;
          const vIn = att ? variance(att.checkInAt, shift.shiftDate, shift.startTime, "in") : null;
          const vOut = att?.checkOutAt ? variance(att.checkOutAt, shift.shiftDate, shift.endTime, "out") : null;

          return (
            <View key={shift.id} style={[ui.card, styles.myShiftCard]}>
              <View style={styles.myShiftHeader}>
                <View style={styles.shiftDateBadge}>
                  <Text style={styles.shiftDateText}>{dayLabel(shift.shiftDate)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shiftTime}>{shift.shiftName || "Shift"}</Text>
                  <Text style={styles.muted}>
                    {shortTime(shift.startTime)} – {shortTime(shift.endTime)}{shift.position ? `  ·  ${shift.position}` : ""}
                  </Text>
                </View>
                {open ? <View style={[styles.dot, styles.dotOn]} /> : completed ? <Ionicons name="checkmark-done" size={18} color={appTheme.colors.success} /> : null}
              </View>

              {att ? (
                <View style={styles.attRow}>
                  <Text style={styles.attText}>
                    {open ? `On shift · in ${clockTime(att.checkInAt)}` : `${clockTime(att.checkInAt)} – ${clockTime(att.checkOutAt)} · ${workedLabel(att.checkInAt, att.checkOutAt!)}`}
                  </Text>
                  {vIn ? <Text style={[styles.vPill, vStyle(vIn.tone)]}>in {vIn.text}</Text> : null}
                  {vOut ? <Text style={[styles.vPill, vStyle(vOut.tone)]}>{vOut.text}</Text> : null}
                  {att.entryMethod === "Manual" ? (
                    <Text style={[styles.vPill, att.isApproved ? styles.vNeutral : styles.vBad]}>
                      {att.isApproved ? "manual" : "pending approval"}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.actionsRow}>
                {open ? (
                  <Pressable style={[styles.actBtn, styles.actBtnOut]} onPress={() => checkOutMutation.mutate()} disabled={busy}>
                    <Ionicons name="log-out-outline" size={16} color={appTheme.colors.onPrimary} />
                    <Text style={styles.actBtnText}>{checkOutMutation.isPending ? "..." : "Check out"}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.actBtn, onAnotherShift ? styles.actBtnDisabled : null]}
                    onPress={() => checkInMutation.mutate(shift.id)}
                    disabled={busy || onAnotherShift}
                  >
                    <Ionicons name="log-in-outline" size={16} color={appTheme.colors.onPrimary} />
                    <Text style={styles.actBtnText}>{checkInMutation.isPending ? "..." : completed ? "Check in again" : "Check in"}</Text>
                  </Pressable>
                )}
                <Pressable style={styles.actGhost} onPress={() => openManual(shift)}>
                  <Ionicons name="create-outline" size={16} color={appTheme.colors.primary} />
                  <Text style={styles.actGhostText}>{att ? "Edit times" : "Enter times"}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Manual time entry */}
      <Modal visible={manualShift !== null} transparent animationType="fade" onRequestClose={() => setManualShift(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <Text style={styles.modalTitleSm}>Enter times</Text>
            <Text style={styles.muted}>{manualShift?.shiftName} · {dayLabel(manualShift?.shiftDate ?? "")}</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Check in</Text>
                <DateTimeField mode="time" value={manualIn} onChange={setManualIn} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Check out</Text>
                <DateTimeField mode="time" value={manualOut} onChange={setManualOut} />
              </View>
            </View>
            <Text style={styles.muted}>Manually entered times are sent to your manager for approval.</Text>
            <PrimaryButton label={manualMutation.isPending ? "Saving..." : "Save times"} onPress={() => manualMutation.mutate()} disabled={manualMutation.isPending} />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setManualShift(null)} disabled={manualMutation.isPending} />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

// ---------------------------------------------------------------------------
// Rota management (manager): list + add/edit/delete + assignees
// ---------------------------------------------------------------------------
type ShiftDraft = {
  id: string | null;
  shiftDate: string;
  shiftTemplateId: string;
  position: string;
  notes: string;
  assigneeUserIds: string[];
};

function emptyDraft(): ShiftDraft {
  return { id: null, shiftDate: formatDateValue(new Date()), shiftTemplateId: "", position: "", notes: "", assigneeUserIds: [] };
}

export function RotaManageScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState(() => weekAhead());
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<ShiftDraft>(emptyDraft());
  const [userSearch, setUserSearch] = useState("");

  const rotaQuery = useQuery({
    queryKey: ["rota", shopId, range.from, range.to],
    queryFn: () => getRota(shopId as string, range.from, range.to),
    enabled: Boolean(shopId),
  });
  const usersQuery = useQuery({
    queryKey: ["rota-assignable", shopId],
    queryFn: () => getAssignableUsers(shopId as string),
    enabled: Boolean(shopId),
  });
  const templatesQuery = useQuery({
    queryKey: ["rota-shift-templates", shopId],
    queryFn: () => getShiftTemplates(shopId as string),
    enabled: Boolean(shopId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rota", shopId] });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: SaveRotaShiftPayload = {
        shopId: shopId as string,
        shiftDate: draft.shiftDate,
        shiftTemplateId: draft.shiftTemplateId,
        position: draft.position.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        assigneeUserIds: draft.assigneeUserIds,
      };
      return draft.id ? updateRotaShift(draft.id, payload) : createRotaShift(payload);
    },
    onSuccess: () => {
      // Make sure the saved shift's date is within the visible range so it shows after saving.
      const savedDate = draft.shiftDate;
      setRange((r) => ({ from: savedDate < r.from ? savedDate : r.from, to: savedDate > r.to ? savedDate : r.to }));
      setEditorOpen(false);
      void invalidate();
    },
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't save the shift."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRotaShift(id),
    onSuccess: () => void invalidate(),
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't delete the shift."),
  });

  const openAdd = () => { setDraft(emptyDraft()); setUserSearch(""); setEditorOpen(true); };
  const openEdit = (shift: RotaShift) => {
    setDraft({
      id: shift.id,
      shiftDate: shift.shiftDate,
      shiftTemplateId: shift.shiftTemplateId ?? "",
      position: shift.position ?? "",
      notes: shift.notes ?? "",
      assigneeUserIds: shift.assignees.map((a) => a.userId),
    });
    setUserSearch("");
    setEditorOpen(true);
  };
  const confirmDelete = async (shift: RotaShift) => {
    const ok = await confirmDestructive({ title: "Delete shift", message: `Remove the ${shortTime(shift.startTime)}–${shortTime(shift.endTime)} shift on ${dayLabel(shift.shiftDate)}?` });
    if (ok) deleteMutation.mutate(shift.id);
  };
  // A shift is identified by date + template. When the manager changes either, load that slot's
  // existing shift (its assignees) if one exists, otherwise start a fresh, empty assignment.
  const selectSlot = (shiftDate: string, shiftTemplateId: string) => {
    const existing = shiftTemplateId
      ? (rotaQuery.data ?? []).find((s) => s.shiftDate === shiftDate && s.shiftTemplateId === shiftTemplateId)
      : undefined;
    setDraft((d) => ({
      ...d,
      shiftDate,
      shiftTemplateId,
      id: existing ? existing.id : null,
      position: existing ? existing.position ?? "" : "",
      notes: existing ? existing.notes ?? "" : "",
      assigneeUserIds: existing ? existing.assignees.map((a) => a.userId) : [],
    }));
  };

  const toggleAssignee = (userId: string) =>
    setDraft((d) => ({
      ...d,
      assigneeUserIds: d.assigneeUserIds.includes(userId)
        ? d.assigneeUserIds.filter((x) => x !== userId)
        : [...d.assigneeUserIds, userId],
    }));

  // Group shifts by date for display.
  const grouped = useMemo(() => {
    const map = new Map<string, RotaShift[]>();
    for (const s of rotaQuery.data ?? []) {
      const list = map.get(s.shiftDate) ?? [];
      list.push(s);
      map.set(s.shiftDate, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rotaQuery.data]);

  const canSave = draft.shiftTemplateId.length > 0 && !saveMutation.isPending;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={ui.card}>
          <DateRangeQuickPicks from={range.from} to={range.to} onSelect={(from, to) => setRange({ from, to })} style={{ marginBottom: 8 }} />
          <View style={styles.row}>
            <DateTimeField style={{ flex: 1 }} mode="date" value={range.from} onChange={(from) => setRange((r) => ({ ...r, from }))} />
            <DateTimeField style={{ flex: 1 }} mode="date" value={range.to} onChange={(to) => setRange((r) => ({ ...r, to }))} />
          </View>
          <PrimaryButton label="+ Add shift" onPress={openAdd} disabled={!shopId} />
        </View>

        {rotaQuery.isLoading ? <LoadingState inline /> : null}
        {!rotaQuery.isLoading && grouped.length === 0 ? (
          <View style={ui.card}><Text style={styles.muted}>No shifts in this range. Add one above.</Text></View>
        ) : null}

        {grouped.map(([date, shifts]) => (
          <View key={date} style={styles.section}>
            <Text style={styles.sectionTitle}>{dayLabel(date)}</Text>
            {shifts.map((shift) => (
              <View key={shift.id} style={[ui.card, styles.shiftCard]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.shiftTime}>
                    {shift.shiftName ? `${shift.shiftName} · ` : ""}{shortTime(shift.startTime)}–{shortTime(shift.endTime)}
                    {shift.position ? <Text style={styles.muted}>  ·  {shift.position}</Text> : null}
                  </Text>
                  <Text style={styles.muted} numberOfLines={2}>
                    {shift.assignees.length > 0 ? shift.assignees.map((a) => a.name).join(", ") : "No one assigned"}
                  </Text>
                </View>
                <Pressable style={styles.iconBtn} onPress={() => openEdit(shift)}>
                  <Ionicons name="create-outline" size={18} color={appTheme.colors.primary} />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => confirmDelete(shift)}>
                  <Ionicons name="trash-outline" size={18} color={appTheme.colors.danger} />
                </Pressable>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <Modal visible={editorOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setEditorOpen(false)}>
        <View style={[styles.editorScreen, { paddingTop: insets.top }]}>
          <View style={styles.editorHeader}>
            <Pressable style={styles.editorHeaderBtn} onPress={() => setEditorOpen(false)} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={appTheme.colors.text} />
            </Pressable>
            <Text style={styles.editorTitle}>{draft.id ? "Edit shift" : "Add shift"}</Text>
            <Pressable
              style={styles.editorHeaderBtn}
              onPress={() => saveMutation.mutate()}
              disabled={!canSave}
              accessibilityLabel="Save shift"
            >
              <Text style={[styles.editorSave, !canSave ? styles.editorSaveDisabled : null]}>
                {saveMutation.isPending ? "..." : "Save"}
              </Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.editorBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Date</Text>
            <DateTimeField mode="date" value={draft.shiftDate} onChange={(v) => selectSlot(v, draft.shiftTemplateId)} />

            <Text style={styles.fieldLabel}>Shift</Text>
            <View style={styles.chipRow}>
              {(templatesQuery.data ?? []).map((t) => {
                const active = draft.shiftTemplateId === t.templateId;
                return (
                  <Pressable
                    key={t.templateId}
                    style={[styles.chip, active ? styles.chipActive : null]}
                    onPress={() => selectSlot(draft.shiftDate, t.templateId)}
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{t.name}</Text>
                    <Text style={[styles.chipSubText, active ? styles.chipSubTextActive : null]}>
                      {shortTime(t.startTime)}–{shortTime(t.endTime)}
                    </Text>
                  </Pressable>
                );
              })}
              {(templatesQuery.data?.length ?? 0) === 0 ? (
                <Text style={styles.muted}>No shifts configured. Set them up in Shop Configuration → Shifts.</Text>
              ) : null}
            </View>

            {/* Staff search */}
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={16} color={appTheme.colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={userSearch}
                onChangeText={setUserSearch}
                placeholder="Search staff"
                placeholderTextColor={appTheme.colors.textSubtle}
              />
              {userSearch.length > 0 ? (
                <Pressable onPress={() => setUserSearch("")}><Ionicons name="close-circle" size={16} color={appTheme.colors.textMuted} /></Pressable>
              ) : null}
            </View>

            {(() => {
              const all = usersQuery.data ?? [];
              const q = userSearch.trim().toLowerCase();
              const match = (u: { name: string; role: string }) => !q || u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
              const assigned = all.filter((u) => draft.assigneeUserIds.includes(u.userId) && match(u));
              const available = all.filter((u) => !draft.assigneeUserIds.includes(u.userId) && match(u));
              return (
                <>
                  <Text style={styles.fieldLabel}>Assigned ({draft.assigneeUserIds.length})</Text>
                  {assigned.length === 0 ? (
                    <Text style={styles.muted}>No one assigned yet — add staff from below.</Text>
                  ) : (
                    assigned.map((u) => (
                      <Pressable key={u.userId} style={styles.userRow} onPress={() => toggleAssignee(u.userId)}>
                        <View style={[styles.userAvatar, styles.userAvatarOn]}>
                          <Text style={styles.userAvatarText}>{initials(u.name)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.userName} numberOfLines={1}>{u.name}</Text>
                          <Text style={styles.muted}>{u.role}</Text>
                        </View>
                        <Ionicons name="checkmark-circle" size={24} color={appTheme.colors.success} />
                      </Pressable>
                    ))
                  )}

                  <Text style={[styles.fieldLabel, { marginTop: appTheme.spacing.sm }]}>Available ({available.length})</Text>
                  {all.length === 0 ? (
                    <Text style={styles.muted}>No staff found for this shop.</Text>
                  ) : available.length === 0 ? (
                    <Text style={styles.muted}>Everyone matching is already assigned.</Text>
                  ) : (
                    available.map((u) => (
                      <Pressable key={u.userId} style={styles.userRow} onPress={() => toggleAssignee(u.userId)}>
                        <View style={styles.userAvatar}>
                          <Text style={styles.userAvatarText}>{initials(u.name)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.userName} numberOfLines={1}>{u.name}</Text>
                          <Text style={styles.muted}>{u.role}</Text>
                        </View>
                        <Ionicons name="add-circle-outline" size={24} color={appTheme.colors.primary} />
                      </Pressable>
                    ))
                  )}
                </>
              );
            })()}
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}

// ---------------------------------------------------------------------------
// Timesheet (manager)
// ---------------------------------------------------------------------------
export function RotaTimesheetScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const queryClient = useQueryClient();
  const [range, setRange] = useState(() => last7());

  const timesheetQuery = useQuery({
    queryKey: ["rota-timesheet", shopId, range.from, range.to],
    queryFn: () => getTimesheet(shopId as string, range.from, range.to),
    enabled: Boolean(shopId),
  });
  const pendingQuery = useQuery({
    queryKey: ["rota-pending", shopId],
    queryFn: () => getPendingApprovals(shopId as string),
    enabled: Boolean(shopId),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveAttendance(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["rota-pending", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["rota-timesheet", shopId] });
    },
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't approve."),
  });

  const totalHours = (timesheetQuery.data ?? []).reduce((s, r) => s + r.totalHours, 0);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        {(pendingQuery.data?.length ?? 0) > 0 ? (
          <View style={ui.card}>
            <Text style={styles.sectionTitle}>Pending approvals ({pendingQuery.data?.length})</Text>
            <Text style={styles.muted}>Manually entered times awaiting your approval.</Text>
            {(pendingQuery.data ?? []).map((p) => (
              <View key={p.id} style={styles.pendingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName} numberOfLines={1}>{p.userName}</Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {p.shiftName ? `${p.shiftName} · ` : ""}{p.shiftDate ? dayLabel(p.shiftDate) : ""}
                    {`  ·  ${clockTime(p.checkInAt)}${p.checkOutAt ? `–${clockTime(p.checkOutAt)}` : ""}`}
                  </Text>
                </View>
                <Pressable style={styles.approveBtn} onPress={() => approveMutation.mutate(p.id)} disabled={approveMutation.isPending}>
                  <Ionicons name="checkmark" size={16} color={appTheme.colors.onPrimary} />
                  <Text style={styles.actBtnText}>Approve</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={ui.card}>
          <DateRangeQuickPicks from={range.from} to={range.to} onSelect={(from, to) => setRange({ from, to })} style={{ marginBottom: 8 }} />
          <View style={styles.row}>
            <DateTimeField style={{ flex: 1 }} mode="date" value={range.from} onChange={(from) => setRange((r) => ({ ...r, from }))} />
            <DateTimeField style={{ flex: 1 }} mode="date" value={range.to} onChange={(to) => setRange((r) => ({ ...r, to }))} />
          </View>
        </View>

        {timesheetQuery.isLoading ? <LoadingState inline /> : null}
        {!timesheetQuery.isLoading && (timesheetQuery.data?.length ?? 0) === 0 ? (
          <View style={ui.card}><Text style={styles.muted}>No clocked hours in this range.</Text></View>
        ) : null}

        {(timesheetQuery.data?.length ?? 0) > 0 ? (
          <View style={ui.card}>
            <View style={styles.tHead}>
              <Text style={styles.thName}>Staff</Text>
              <Text style={styles.thNum}>Shifts</Text>
              <Text style={styles.thNum}>Hours</Text>
            </View>
            {(timesheetQuery.data ?? []).map((row) => (
              <View key={row.userId} style={styles.tRow}>
                <Text style={styles.tdName} numberOfLines={1}>{row.userName}</Text>
                <Text style={styles.tdNum}>{row.shiftsWorked}{row.openSessions > 0 ? ` (+${row.openSessions})` : ""}</Text>
                <Text style={styles.tdNum}>{row.totalHours.toFixed(1)}</Text>
              </View>
            ))}
            <View style={[styles.tRow, styles.tTotal]}>
              <Text style={[styles.tdName, styles.tTotalText]}>Total</Text>
              <Text style={styles.tdNum} />
              <Text style={[styles.tdNum, styles.tTotalText]}>{totalHours.toFixed(1)}</Text>
            </View>
          </View>
        ) : null}
        <Text style={styles.muted}>“Shifts” counts completed check-outs; (+n) shows sessions still open (not yet checked out).</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: appTheme.spacing.sm, paddingBottom: appTheme.spacing.xl },
  muted: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: "row", gap: appTheme.spacing.sm },
  section: { gap: appTheme.spacing.xs },
  sectionTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15, lineHeight: 20, marginTop: 4 },
  fieldLabel: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },

  clockCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  clockDot: { width: 12, height: 12, borderRadius: 999, backgroundColor: appTheme.colors.textSubtle },
  clockDotOn: { backgroundColor: appTheme.colors.success },
  clockStatus: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 16, lineHeight: 20 },
  clockHint: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
  clockBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999, backgroundColor: appTheme.colors.primary },
  clockBtnOut: { backgroundColor: appTheme.colors.danger },
  clockBtnText: { color: appTheme.colors.onPrimary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },

  shiftCard: { flexDirection: "row", alignItems: "center", gap: 10 },
  shiftDateBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceBrandSoft },
  shiftDateText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  shiftTime: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceMuted },

  // My Shifts cards
  myShiftCard: { gap: 10 },
  myShiftHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 999, backgroundColor: appTheme.colors.textSubtle },
  dotOn: { backgroundColor: appTheme.colors.success },
  attRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  attText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 13 },
  vPill: { overflow: "hidden", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11 },
  vGood: { backgroundColor: appTheme.colors.badgeSuccessBg, color: appTheme.colors.success },
  vBad: { backgroundColor: appTheme.colors.badgeDangerBg, color: appTheme.colors.danger },
  vNeutral: { backgroundColor: appTheme.colors.surfaceMuted, color: appTheme.colors.textMuted },
  vOn: { backgroundColor: appTheme.colors.surfaceMuted, color: appTheme.colors.textMuted },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  actBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: appTheme.colors.primary },
  actBtnOut: { backgroundColor: appTheme.colors.danger },
  actBtnDisabled: { backgroundColor: appTheme.colors.textSubtle },
  actBtnText: { color: appTheme.colors.onPrimary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  actGhost: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 10 },
  actGhostText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  approveBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: appTheme.colors.success },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: appTheme.spacing.md },
  sheetCard: { backgroundColor: appTheme.colors.background, borderRadius: appTheme.radius.lg, padding: appTheme.spacing.md, gap: appTheme.spacing.sm },
  modalTitleSm: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 18 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { alignItems: "center", gap: 1, paddingHorizontal: 14, paddingVertical: 8, borderRadius: appTheme.radius.md, borderWidth: 1, borderColor: appTheme.colors.border, backgroundColor: appTheme.colors.surface },
  chipActive: { borderColor: appTheme.colors.primary, backgroundColor: appTheme.colors.surfaceBrandSoft },
  chipText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 17 },
  chipTextActive: { color: appTheme.colors.primary },
  chipSubText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 11, lineHeight: 14 },
  chipSubTextActive: { color: appTheme.colors.primary },

  editorScreen: { flex: 1, backgroundColor: appTheme.colors.background },
  editorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appTheme.colors.borderSoft,
    backgroundColor: appTheme.colors.surface,
  },
  editorHeaderBtn: { minWidth: 56, height: 40, alignItems: "center", justifyContent: "center" },
  editorTitle: { flex: 1, textAlign: "center", color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 17 },
  editorSave: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 16 },
  editorSaveDisabled: { color: appTheme.colors.textSubtle },
  editorBody: { padding: appTheme.spacing.md, gap: appTheme.spacing.xs, paddingBottom: appTheme.spacing.xl },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    marginTop: 4,
  },
  searchInput: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 14, padding: 0 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appTheme.colors.borderSoft,
  },
  userAvatar: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  userAvatarOn: { backgroundColor: appTheme.colors.surfaceBrandSoft },
  userAvatarText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  userName: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },

  tHead: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingBottom: 8 },
  tRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  thName: { flex: 1, color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  thNum: { width: 70, textAlign: "center", color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  tdName: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  tdNum: { width: 70, textAlign: "center", color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 15 },
  tTotal: { borderTopWidth: 1, borderTopColor: appTheme.colors.border },
  tTotalText: { fontFamily: appTheme.fonts.heading },
});
