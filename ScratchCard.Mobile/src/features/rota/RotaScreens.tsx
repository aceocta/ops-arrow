import React, { useMemo, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainStackParamList } from "../../types/navigation";
import { useAuth } from "../../auth/AuthContext";
import { getRoleOptions } from "../../api/lookupsApi";
import {
  checkInShift,
  checkOutShift,
  createRotaShift,
  generateRotaWeek,
  deleteRotaShift,
  getAssignableUsers,
  createRotaStaffMember,
  getRotaStaffMembers,
  updateRotaStaffMember,
  deleteRotaStaffMember,
  getMyCurrentAttendance,
  getMyShifts,
  getRota,
  getShiftTemplates,
  getTimesheet,
  getShiftTimesheet,
  getStaffSessions,
  getShiftSessions,
  getPendingApprovals,
  approveAttendance,
  updateAttendance,
  rejectAttendance,
  saveManualAttendance,
  updateRotaShift,
  type SaveRotaShiftPayload,
} from "../../api/rotaApi";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { DateRangeQuickPicks } from "../../components/DateRangeQuickPicks";
import { LoadingState } from "../../components/LoadingState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { confirmDestructive } from "../../utils/confirm";
import { toastError, toastSuccess } from "../../components/toast";
import { AssignableUser, AttendanceApprovalRow, RotaAssignee, RotaShift, RotaStaffMember } from "../../types/models";
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

// Monday that starts the week containing dateStr (weeks run Mon–Sun).
function mondayOf(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const mondayOffset = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - mondayOffset);
  return formatDateValue(d);
}

function addDaysStr(dateStr: string, n: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return formatDateValue(d);
}

const dayOfMonth = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

const GRACE_MIN = 5;
const clockTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";

const dateTimeLabel = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

// Combine a yyyy-MM-dd date with an HH:mm time (device-local) into a UTC ISO string for the API.
const toIso = (dateStr: string, hhmm: string) => new Date(`${dateStr}T${hhmm}:00`).toISOString();

function nextDayStr(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return formatDateValue(d);
}

// Build check-in/out ISO timestamps for a shift on dateStr. If the out time isn't after the in
// time, the shift runs overnight, so check-out lands on the next day (app convention: end <= start
// means the next day).
function sessionIsos(dateStr: string, inHHmm: string, outHHmm: string) {
  const outDate = outHHmm > inHHmm ? dateStr : nextDayStr(dateStr);
  return { checkInAt: toIso(dateStr, inHHmm), checkOutAt: toIso(outDate, outHHmm) };
}

// True when the two HH:mm[:ss] times describe an overnight shift (end not after start).
const isOvernight = (startHHmm: string, endHHmm: string) => Boolean(startHHmm) && Boolean(endHHmm) && endHHmm <= startHHmm;

// Display a start–end range, flagging overnight shifts that finish the next day.
function timeRange(start?: string | null, end?: string | null) {
  if (!start) return "";
  const s = shortTime(start);
  const e = shortTime(end ?? "");
  return isOvernight(s, e) ? `${s}–${e} (+1d)` : `${s}–${e}`;
}

const weekday = (date?: string | null) => {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { weekday: "short" });
};

// " · ends Wed" suffix for an overnight shift (endDate after the start date), else "".
const overnightSuffix = (shiftDate?: string | null, endDate?: string | null) =>
  endDate && shiftDate && endDate > shiftDate ? ` · ends ${weekday(endDate)}` : "";

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

// Variance of an actual time vs the scheduled time, with a small grace window. The caller passes the
// exact calendar date the scheduled time falls on (the shift's start date for check-in, its end date
// for check-out) so overnight shifts compare correctly.
function variance(actualIso: string, schedDateStr: string, schedTimeHHmmss: string, kind: "in" | "out") {
  const sched = new Date(`${schedDateStr}T${schedTimeHHmmss}`).getTime();
  const diff = Math.round((new Date(actualIso).getTime() - sched) / 60000); // minutes, +late / -early
  if (Math.abs(diff) <= GRACE_MIN) return { text: "on time", tone: "on" as const };
  const mag = Math.abs(diff);
  const span = mag >= 60 ? `${Math.floor(mag / 60)}h ${mag % 60}m` : `${mag}m`;
  // For check-in: late = bad. For check-out: leaving early = bad, staying late = neutral.
  if (kind === "in") return diff > 0 ? { text: `${span} late`, tone: "bad" as const } : { text: `${span} early`, tone: "good" as const };
  return diff < 0 ? { text: `left ${span} early`, tone: "bad" as const } : { text: `${span} late out`, tone: "neutral" as const };
}

function vTextStyle(tone: "good" | "bad" | "neutral" | "on") {
  if (tone === "bad") return { color: appTheme.colors.danger };
  if (tone === "good") return { color: appTheme.colors.success };
  return { color: appTheme.colors.textMuted };
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
    mutationFn: () => {
      const { checkInAt, checkOutAt } = sessionIsos(manualShift!.shiftDate, manualIn, manualOut);
      return saveManualAttendance({
        shopId: shopId as string,
        rotaShiftId: manualShift!.id,
        checkInAt,
        checkOutAt: manualOut ? checkOutAt : undefined,
      });
    },
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

  // Group my shifts by date so each day has a header.
  const grouped = useMemo(() => {
    const map = new Map<string, RotaShift[]>();
    for (const s of shiftsQuery.data ?? []) {
      const list = map.get(s.shiftDate) ?? [];
      list.push(s);
      map.set(s.shiftDate, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shiftsQuery.data]);

  const renderShiftCard = (shift: RotaShift) => {
          const att = shift.myAttendance;
          const open = Boolean(att && !att.checkOutAt);
          const completed = Boolean(att && att.checkOutAt);
          const onAnotherShift = isCheckedInSomewhere && current?.rotaShiftId !== shift.id;
          const vIn = att ? variance(att.checkInAt, shift.shiftDate, shift.startTime, "in") : null;
          const vOut = att?.checkOutAt ? variance(att.checkOutAt, shift.endDate, shift.endTime, "out") : null;

          const statusLabel = open ? "On shift" : completed ? "Completed" : "Upcoming";
          const statusTone: "success" | "neutral" = open ? "success" : "neutral";

          return (
            <View key={shift.id} style={[ui.card, styles.myShiftCard]}>
              {/* Header: shift name + status chip */}
              <View style={styles.myShiftHeader}>
                <Text style={styles.myShiftName} numberOfLines={1}>{shift.shiftName || "Shift"}</Text>
                <StatusBadge label={statusLabel} tone={statusTone} />
              </View>

              {/* Schedule line */}
              <View style={styles.metaLine}>
                <Ionicons name="time-outline" size={14} color={appTheme.colors.textMuted} />
                <Text style={styles.metaText}>{timeRange(shift.startTime, shift.endTime)}{overnightSuffix(shift.shiftDate, shift.endDate)}</Text>
                {shift.position ? (
                  <>
                    <Text style={styles.metaDivider}>·</Text>
                    <Text style={styles.metaText}>{shift.position}</Text>
                  </>
                ) : null}
              </View>

              {/* Attendance summary */}
              {att ? (
                <View style={styles.attBlock}>
                  <View style={styles.attMainRow}>
                    <Ionicons
                      name={open ? "ellipse" : "checkmark-circle"}
                      size={14}
                      color={open ? appTheme.colors.success : appTheme.colors.textMuted}
                    />
                    <Text style={styles.attMain}>
                      {open
                        ? `Checked in ${clockTime(att.checkInAt)}`
                        : `${clockTime(att.checkInAt)} → ${clockTime(att.checkOutAt)}`}
                    </Text>
                    {!open ? <Text style={styles.attWorked}>{workedLabel(att.checkInAt, att.checkOutAt!)}</Text> : null}
                  </View>
                  {(vIn && vIn.tone !== "on") || (vOut && vOut.tone !== "on") ? (
                    <Text style={styles.attVariance}>
                      {vIn && vIn.tone !== "on" ? <Text style={vTextStyle(vIn.tone)}>in {vIn.text}</Text> : null}
                      {vIn && vIn.tone !== "on" && vOut && vOut.tone !== "on" ? "  ·  " : ""}
                      {vOut && vOut.tone !== "on" ? <Text style={vTextStyle(vOut.tone)}>{vOut.text}</Text> : null}
                    </Text>
                  ) : null}
                  {att.entryMethod === "Manual" ? (
                    <Text style={[styles.attNote, att.isApproved ? null : styles.attNotePending]}>
                      {att.isApproved ? "Manually entered" : "Manually entered · pending approval"}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Actions */}
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
              {onAnotherShift ? <Text style={styles.mutedSmall}>Check out of your current shift first.</Text> : null}
            </View>
    );
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        {/* <Text style={styles.sectionTitle}>My shifts</Text> */}
        {isCheckedInSomewhere ? (
          <Text style={styles.muted}>You're on shift since {clockTime(current?.checkInAt)}. Check out before starting another.</Text>
        ) : null}

        {shiftsQuery.isLoading ? <LoadingState inline /> : null}
        {!shiftsQuery.isLoading && grouped.length === 0 ? (
          <View style={ui.card}><Text style={styles.muted}>No shifts scheduled for the next 2 weeks.</Text></View>
        ) : null}

        {grouped.map(([date, shifts]) => (
          <View key={date} style={styles.dayGroup}>
            <Text style={styles.dayHeader}>{dayLabel(date)}</Text>
            {shifts.map(renderShiftCard)}
          </View>
        ))}
      </ScrollView>

      {/* Manual time entry */}
      <Modal visible={manualShift !== null} transparent animationType="fade" onRequestClose={() => setManualShift(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="time-outline" size={22} color={appTheme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitleSm}>{manualShift?.myAttendance ? "Edit your hours" : "Log your hours"}</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {manualShift?.shiftName || "Shift"} · {dayLabel(manualShift?.shiftDate ?? "")}
                </Text>
              </View>
            </View>

            {manualShift ? (
              <Text style={styles.mutedSmall}>Scheduled {timeRange(manualShift.startTime, manualShift.endTime)}</Text>
            ) : null}

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

            {manualShift && manualOut && manualOut !== manualIn ? (
              <Text style={styles.previewText}>
                Total worked: {workedLabel(sessionIsos(manualShift.shiftDate, manualIn, manualOut).checkInAt, sessionIsos(manualShift.shiftDate, manualIn, manualOut).checkOutAt)}
                {isOvernight(manualIn, manualOut) ? "  · ends next day" : ""}
              </Text>
            ) : manualShift && manualOut === manualIn ? (
              <Text style={[styles.mutedSmall, { color: appTheme.colors.danger }]}>Check-in and check-out can’t be the same.</Text>
            ) : null}

            <View style={styles.noticeRow}>
              <Ionicons name="information-circle-outline" size={15} color={appTheme.colors.textMuted} />
              <Text style={styles.mutedSmall}>Manually entered times are sent to your manager for approval.</Text>
            </View>

            <PrimaryButton
              label={manualMutation.isPending ? "Saving..." : "Save hours"}
              onPress={() => manualMutation.mutate()}
              disabled={manualMutation.isPending || !manualShift || manualOut === manualIn}
            />
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
  assigneeStaffMemberIds: string[];
};

function emptyDraft(): ShiftDraft {
  return { id: null, shiftDate: formatDateValue(new Date()), shiftTemplateId: "", position: "", notes: "", assigneeUserIds: [], assigneeStaffMemberIds: [] };
}

export function RotaManageScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [weekStart, setWeekStart] = useState(() => mondayOf(formatDateValue(new Date())));
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<ShiftDraft>(emptyDraft());
  const [userSearch, setUserSearch] = useState("");
  const [addExternalOpen, setAddExternalOpen] = useState(false);
  const [extName, setExtName] = useState("");
  const [extPhone, setExtPhone] = useState("+44 ");
  const [extEmail, setExtEmail] = useState("");
  const [selectedAssignee, setSelectedAssignee] = useState<{ assignee: RotaAssignee; shift: RotaShift } | null>(null);
  const [recordTarget, setRecordTarget] = useState<{ shift: RotaShift; name: string; memberId: string } | null>(null);
  const [recIn, setRecIn] = useState("09:00");
  const [recOut, setRecOut] = useState("17:00");

  const range = useMemo(() => ({ from: weekStart, to: addDaysStr(weekStart, 6) }), [weekStart]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i)), [weekStart]);

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
        assigneeStaffMemberIds: draft.assigneeStaffMemberIds,
      };
      return draft.id ? updateRotaShift(draft.id, payload) : createRotaShift(payload);
    },
    onSuccess: () => {
      // Jump to the saved shift's week so it's visible after saving.
      setWeekStart(mondayOf(draft.shiftDate));
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

  const generateMutation = useMutation({
    mutationFn: () => generateRotaWeek(shopId as string, weekStart),
    onSuccess: (created) => {
      void invalidate();
      toastSuccess(created.length > 0 ? `Added ${created.length} shift${created.length === 1 ? "" : "s"} for this week.` : "This week's rota is already complete.");
    },
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't generate the week."),
  });

  // Create a roster-only (external/casual) person and assign them to the current draft.
  const addExternalMutation = useMutation({
    mutationFn: () => {
      const phone = extPhone.trim();
      return createRotaStaffMember({
        shopId: shopId as string,
        name: extName.trim(),
        phone: phone && phone !== "+44" ? phone : undefined,
        email: extEmail.trim() || undefined,
      });
    },
    onSuccess: (member) => {
      setDraft((d) => ({ ...d, assigneeStaffMemberIds: [...d.assigneeStaffMemberIds, member.id] }));
      setExtName("");
      setExtPhone("+44 ");
      setExtEmail("");
      setAddExternalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["rota-assignable", shopId] });
    },
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't add the person."),
  });

  const openRecordHours = (shift: RotaShift, assignee: { name: string; rotaStaffMemberId?: string | null }) => {
    setRecIn(shortTime(shift.startTime));
    setRecOut(shortTime(shift.endTime));
    setRecordTarget({ shift, name: assignee.name, memberId: assignee.rotaStaffMemberId as string });
  };

  const recordHoursMutation = useMutation({
    mutationFn: () => {
      const { checkInAt, checkOutAt } = sessionIsos(recordTarget!.shift.shiftDate, recIn, recOut);
      return saveManualAttendance({
        shopId: shopId as string,
        rotaShiftId: recordTarget!.shift.id,
        rotaStaffMemberId: recordTarget!.memberId,
        checkInAt,
        checkOutAt,
      });
    },
    onSuccess: () => {
      setRecordTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["rota-timesheet", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["rota-timesheet-by-shift", shopId] });
      toastSuccess("Hours recorded.");
    },
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't record hours."),
  });

  const confirmGenerate = async () => {
    const ok = await confirmDestructive({
      title: "Generate week",
      message: "Add a shift for every configured shift on each day this week, copying last week's staff where set? Existing shifts are kept.",
      confirmLabel: "Generate",
    });
    if (ok) generateMutation.mutate();
  };

  const openAdd = (shiftDate?: string) => {
    setDraft({ ...emptyDraft(), shiftDate: shiftDate ?? emptyDraft().shiftDate });
    setUserSearch("");
    setEditorOpen(true);
  };
  const openEdit = (shift: RotaShift) => {
    setDraft({
      id: shift.id,
      shiftDate: shift.shiftDate,
      shiftTemplateId: shift.shiftTemplateId ?? "",
      position: shift.position ?? "",
      notes: shift.notes ?? "",
      assigneeUserIds: shift.assignees.filter((a) => a.userId).map((a) => a.userId as string),
      assigneeStaffMemberIds: shift.assignees.filter((a) => a.rotaStaffMemberId).map((a) => a.rotaStaffMemberId as string),
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
      assigneeUserIds: existing ? existing.assignees.filter((a) => a.userId).map((a) => a.userId as string) : [],
      assigneeStaffMemberIds: existing ? existing.assignees.filter((a) => a.rotaStaffMemberId).map((a) => a.rotaStaffMemberId as string) : [],
    }));
  };

  // Toggle a registered user or a roster-only member on the draft.
  const toggleAssignee = (person: AssignableUser) =>
    setDraft((d) => {
      if (person.rotaStaffMemberId) {
        const id = person.rotaStaffMemberId;
        return {
          ...d,
          assigneeStaffMemberIds: d.assigneeStaffMemberIds.includes(id)
            ? d.assigneeStaffMemberIds.filter((x) => x !== id)
            : [...d.assigneeStaffMemberIds, id],
        };
      }
      const id = person.userId as string;
      return {
        ...d,
        assigneeUserIds: d.assigneeUserIds.includes(id)
          ? d.assigneeUserIds.filter((x) => x !== id)
          : [...d.assigneeUserIds, id],
      };
    });

  const isAssigned = (u: AssignableUser) =>
    u.rotaStaffMemberId ? draft.assigneeStaffMemberIds.includes(u.rotaStaffMemberId) : draft.assigneeUserIds.includes(u.userId as string);

  // Shifts keyed by date (ordered by start time), for the week-grid render.
  const shiftsByDate = useMemo(() => {
    const map = new Map<string, RotaShift[]>();
    for (const s of rotaQuery.data ?? []) {
      const list = map.get(s.shiftDate) ?? [];
      list.push(s);
      map.set(s.shiftDate, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [rotaQuery.data]);

  const todayStr = formatDateValue(new Date());
  const weekLabel = `${dayOfMonth(weekStart)} – ${dayOfMonth(addDaysStr(weekStart, 6))}`;
  const canSave = draft.shiftTemplateId.length > 0 && !saveMutation.isPending;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Week navigator */}
        <View style={[ui.card, styles.weekNav]}>
          <Pressable style={styles.weekNavBtn} onPress={() => setWeekStart((w) => addDaysStr(w, -7))}>
            <Ionicons name="chevron-back" size={20} color={appTheme.colors.primary} />
          </Pressable>
          <Pressable style={{ flex: 1, alignItems: "center" }} onPress={() => setWeekStart(mondayOf(todayStr))}>
            <Text style={styles.weekNavLabel}>{weekLabel}</Text>
            <Text style={styles.weekNavHint}>{weekStart === mondayOf(todayStr) ? "This week" : "Tap for this week"}</Text>
          </Pressable>
          <Pressable style={styles.weekNavBtn} onPress={() => setWeekStart((w) => addDaysStr(w, 7))}>
            <Ionicons name="chevron-forward" size={20} color={appTheme.colors.primary} />
          </Pressable>
        </View>

        <Pressable style={styles.generateBtn} onPress={confirmGenerate} disabled={!shopId || generateMutation.isPending}>
          <Ionicons name="sparkles-outline" size={16} color={appTheme.colors.onPrimary} />
          <Text style={styles.generateBtnText}>{generateMutation.isPending ? "Generating…" : "Auto-generate this week"}</Text>
        </Pressable>

        {rotaQuery.isLoading ? <LoadingState inline /> : null}

        {/* One row per weekday, Mon–Sun, with its shifts + assigned users. */}
        {weekDays.map((date) => {
          const shifts = shiftsByDate.get(date) ?? [];
          const isToday = date === todayStr;
          return (
            <View key={date} style={[ui.card, styles.dayCard, isToday ? styles.dayCardToday : null]}>
              <View style={styles.dayCardHead}>
                <View>
                  <Text style={[styles.dayName, isToday ? styles.dayNameToday : null]}>{weekday(date)}</Text>
                  <Text style={styles.dayDate}>{dayOfMonth(date)}</Text>
                </View>
                <Pressable style={styles.dayAddBtn} onPress={() => openAdd(date)} disabled={!shopId}>
                  <Ionicons name="add" size={18} color={appTheme.colors.primary} />
                </Pressable>
              </View>

              {shifts.length === 0 ? (
                <Text style={styles.dayEmpty}>No shifts</Text>
              ) : (
                <View style={styles.rotaTable}>
                  <View style={styles.rotaHeadRow}>
                    <Text style={[styles.rotaHeadCell, styles.rotaShiftCol]}>Shift</Text>
                    <Text style={[styles.rotaHeadCell, styles.rotaStaffCol]}>Staff</Text>
                    <View style={styles.rotaActionCol} />
                  </View>
                  {shifts.map((shift) => (
                    <Pressable key={shift.id} style={styles.rotaBodyRow} onPress={() => openEdit(shift)}>
                      <View style={styles.rotaShiftCol}>
                        <Text style={styles.weekShiftTitle} numberOfLines={1}>{shift.shiftName || "Shift"}</Text>
                        <Text style={styles.tdSub}>{timeRange(shift.startTime, shift.endTime)}{overnightSuffix(shift.shiftDate, shift.endDate)}</Text>
                      </View>
                      <View style={styles.rotaStaffCol}>
                        {shift.assignees.length > 0 ? (
                          shift.assignees.map((a) => (
                            <Pressable
                              key={a.rotaStaffMemberId ?? a.userId ?? a.name}
                              onPress={() => setSelectedAssignee({ assignee: a, shift })}
                              hitSlop={4}
                            >
                              <Text style={[styles.rotaStaffText, styles.tdLink]} numberOfLines={1}>{a.name}</Text>
                            </Pressable>
                          ))
                        ) : (
                          <Text style={styles.muted}>No one assigned</Text>
                        )}
                      </View>
                      <Pressable style={styles.rotaActionCol} onPress={() => confirmDelete(shift)} hitSlop={6}>
                        <Ionicons name="trash-outline" size={16} color={appTheme.colors.danger} />
                      </Pressable>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          );
        })}
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
                      {timeRange(t.startTime, t.endTime)}
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
              const match = (u: AssignableUser) => !q || u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
              const keyOf = (u: AssignableUser) => u.rotaStaffMemberId ?? u.userId ?? u.name;
              const assigned = all.filter((u) => isAssigned(u) && match(u));
              const available = all.filter((u) => !isAssigned(u) && match(u));
              const assignedCount = draft.assigneeUserIds.length + draft.assigneeStaffMemberIds.length;
              return (
                <>
                  <Text style={styles.fieldLabel}>Assigned ({assignedCount})</Text>
                  {assigned.length === 0 ? (
                    <Text style={styles.muted}>No one assigned yet — add staff from below.</Text>
                  ) : (
                    assigned.map((u) => (
                      <Pressable key={keyOf(u)} style={styles.userRow} onPress={() => toggleAssignee(u)}>
                        <View style={[styles.userAvatar, styles.userAvatarOn]}>
                          <Text style={styles.userAvatarText}>{initials(u.name)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.userName} numberOfLines={1}>{u.name}</Text>
                          <Text style={styles.muted}>{u.isExternal ? "External" : u.role}</Text>
                        </View>
                        <Ionicons name="checkmark-circle" size={24} color={appTheme.colors.success} />
                      </Pressable>
                    ))
                  )}

                  <Text style={[styles.fieldLabel, { marginTop: appTheme.spacing.sm }]}>Available ({available.length})</Text>
                  {available.map((u) => (
                    <Pressable key={keyOf(u)} style={styles.userRow} onPress={() => toggleAssignee(u)}>
                      <View style={styles.userAvatar}>
                        <Text style={styles.userAvatarText}>{initials(u.name)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.userName} numberOfLines={1}>{u.name}</Text>
                        <Text style={styles.muted}>{u.isExternal ? "External" : u.role}</Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={24} color={appTheme.colors.primary} />
                    </Pressable>
                  ))}

                  {/* Add someone who isn't an Ops Arrow user (external / casual). */}
                  <Pressable style={styles.addExternalOpenBtn} onPress={() => setAddExternalOpen(true)}>
                    <Ionicons name="person-add-outline" size={16} color={appTheme.colors.primary} />
                    <Text style={styles.adjustBtnText}>Add external person</Text>
                  </Pressable>
                </>
              );
            })()}
          </ScrollView>

          {/* Always-visible save bar so the action is never missed at the bottom of a long form. */}
          <View style={[styles.editorFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <PrimaryButton
              label={saveMutation.isPending ? "Saving..." : draft.id ? "Save changes" : "Add shift"}
              onPress={() => saveMutation.mutate()}
              disabled={!canSave}
            />
          </View>
        </View>
      </Modal>

      {/* Staff contact details — tap a name on the rota to call/email them. */}
      <Modal visible={selectedAssignee !== null} transparent animationType="fade" onRequestClose={() => setSelectedAssignee(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <View style={[styles.userAvatar, styles.userAvatarOn]}>
                <Text style={styles.userAvatarText}>{initials(selectedAssignee?.assignee.name ?? "")}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitleSm}>{selectedAssignee?.assignee.name}</Text>
                <Text style={styles.muted}>{selectedAssignee?.assignee.isExternal ? "External staff" : "Team member"}</Text>
              </View>
            </View>

            {selectedAssignee?.assignee.phone ? (
              <Pressable style={styles.contactRow} onPress={() => Linking.openURL(`tel:${selectedAssignee.assignee.phone}`)}>
                <Ionicons name="call-outline" size={18} color={appTheme.colors.primary} />
                <Text style={styles.contactValue}>{selectedAssignee.assignee.phone}</Text>
                <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textMuted} />
              </Pressable>
            ) : null}
            {selectedAssignee?.assignee.email ? (
              <Pressable style={styles.contactRow} onPress={() => Linking.openURL(`mailto:${selectedAssignee.assignee.email}`)}>
                <Ionicons name="mail-outline" size={18} color={appTheme.colors.primary} />
                <Text style={styles.contactValue} numberOfLines={1}>{selectedAssignee.assignee.email}</Text>
                <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textMuted} />
              </Pressable>
            ) : null}
            {!selectedAssignee?.assignee.phone && !selectedAssignee?.assignee.email ? (
              <Text style={styles.muted}>No contact details on file.</Text>
            ) : null}

            {selectedAssignee?.assignee.isExternal ? (
              <PrimaryButton
                label="Record hours"
                onPress={() => {
                  const sel = selectedAssignee;
                  setSelectedAssignee(null);
                  if (sel) openRecordHours(sel.shift, sel.assignee);
                }}
              />
            ) : null}
            <PrimaryButton label="Close" tone="neutral" onPress={() => setSelectedAssignee(null)} />
          </View>
        </View>
      </Modal>

      {/* Add an external (roster-only) person — name required, phone & email optional. */}
      <Modal visible={addExternalOpen} transparent animationType="fade" onRequestClose={() => setAddExternalOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <Text style={styles.modalTitleSm}>Add external person</Text>
            <Text style={styles.muted}>Not an Ops Arrow user — for rostering &amp; recording hours.</Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.externalInput}
              value={extName}
              onChangeText={setExtName}
              placeholder="Full name"
              placeholderTextColor={appTheme.colors.textSubtle}
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>Phone (optional)</Text>
            <TextInput
              style={styles.externalInput}
              value={extPhone}
              onChangeText={setExtPhone}
              placeholder="+44 7700 900000"
              placeholderTextColor={appTheme.colors.textSubtle}
              keyboardType="phone-pad"
            />

            <Text style={styles.fieldLabel}>Email (optional)</Text>
            <TextInput
              style={styles.externalInput}
              value={extEmail}
              onChangeText={setExtEmail}
              placeholder="name@example.com"
              placeholderTextColor={appTheme.colors.textSubtle}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <PrimaryButton
              label={addExternalMutation.isPending ? "Adding..." : "Add & assign"}
              onPress={() => addExternalMutation.mutate()}
              disabled={!extName.trim() || addExternalMutation.isPending}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setAddExternalOpen(false)} disabled={addExternalMutation.isPending} />
          </View>
        </View>
      </Modal>

      {/* Record hours for an external (roster-only) person */}
      <Modal visible={recordTarget !== null} transparent animationType="fade" onRequestClose={() => setRecordTarget(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <Text style={styles.modalTitleSm}>Record hours</Text>
            <Text style={styles.muted} numberOfLines={1}>
              {recordTarget?.name} · {recordTarget ? `${recordTarget.shift.shiftName || "Shift"} · ${dayLabel(recordTarget.shift.shiftDate)}` : ""}
            </Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Check in</Text>
                <DateTimeField mode="time" value={recIn} onChange={setRecIn} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Check out</Text>
                <DateTimeField mode="time" value={recOut} onChange={setRecOut} />
              </View>
            </View>
            {recIn && recOut && recOut === recIn ? (
              <Text style={[styles.mutedSmall, { color: appTheme.colors.danger }]}>Check-in and check-out can’t be the same.</Text>
            ) : recIn && recOut && isOvernight(recIn, recOut) ? (
              <Text style={styles.mutedSmall}>Overnight — check-out is on the next day.</Text>
            ) : null}
            <PrimaryButton
              label={recordHoursMutation.isPending ? "Saving..." : "Save hours"}
              onPress={() => recordHoursMutation.mutate()}
              disabled={recordHoursMutation.isPending || recOut === recIn}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setRecordTarget(null)} disabled={recordHoursMutation.isPending} />
          </View>
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
  const [range, setRange] = useState(() => last7());
  const [view, setView] = useState<"staff" | "shift">("staff");
  const [selectedStaff, setSelectedStaff] = useState<{ userId?: string | null; rotaStaffMemberId?: string | null; name: string } | null>(null);
  const [selectedShift, setSelectedShift] = useState<{ shiftName: string; date: string } | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["rota-staff-sessions", shopId, selectedStaff?.userId, selectedStaff?.rotaStaffMemberId, range.from, range.to],
    queryFn: () => getStaffSessions(shopId as string, { userId: selectedStaff!.userId, rotaStaffMemberId: selectedStaff!.rotaStaffMemberId }, range.from, range.to),
    enabled: Boolean(shopId) && Boolean(selectedStaff),
  });
  const shiftSessionsQuery = useQuery({
    queryKey: ["rota-shift-sessions", shopId, selectedShift?.shiftName, selectedShift?.date],
    queryFn: () => getShiftSessions(shopId as string, selectedShift!.shiftName, selectedShift!.date, selectedShift!.date),
    enabled: Boolean(shopId) && Boolean(selectedShift),
  });

  const timesheetQuery = useQuery({
    queryKey: ["rota-timesheet", shopId, range.from, range.to],
    queryFn: () => getTimesheet(shopId as string, range.from, range.to),
    enabled: Boolean(shopId) && view === "staff",
  });
  const shiftTimesheetQuery = useQuery({
    queryKey: ["rota-timesheet-by-shift", shopId, range.from, range.to],
    queryFn: () => getShiftTimesheet(shopId as string, range.from, range.to),
    enabled: Boolean(shopId) && view === "shift",
  });

  const staffRows = timesheetQuery.data ?? [];
  const shiftRows = shiftTimesheetQuery.data ?? [];
  const loading = view === "staff" ? timesheetQuery.isLoading : shiftTimesheetQuery.isLoading;
  const rowCount = view === "staff" ? staffRows.length : shiftRows.length;
  const totalHours = (view === "staff" ? staffRows : shiftRows).reduce((s: number, r: { totalHours: number }) => s + r.totalHours, 0);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={ui.card}>
          <DateRangeQuickPicks from={range.from} to={range.to} onSelect={(from, to) => setRange({ from, to })} style={{ marginBottom: 8 }} />
          <View style={styles.row}>
            <DateTimeField style={{ flex: 1 }} mode="date" value={range.from} onChange={(from) => setRange((r) => ({ ...r, from }))} />
            <DateTimeField style={{ flex: 1 }} mode="date" value={range.to} onChange={(to) => setRange((r) => ({ ...r, to }))} />
          </View>
        </View>

        {/* View toggle */}
        <View style={styles.segment}>
          {(["staff", "shift"] as const).map((v) => (
            <Pressable key={v} style={[styles.segmentBtn, view === v ? styles.segmentBtnActive : null]} onPress={() => setView(v)}>
              <Text style={[styles.segmentText, view === v ? styles.segmentTextActive : null]}>
                {v === "staff" ? "By staff" : "By shift"}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? <LoadingState inline /> : null}
        {!loading && rowCount === 0 ? (
          <View style={ui.card}><Text style={styles.muted}>No clocked hours in this range.</Text></View>
        ) : null}

        {rowCount > 0 ? (
          <View style={ui.card}>
            <View style={styles.tHead}>
              <Text style={styles.thName}>{view === "staff" ? "Staff" : "Shift"}</Text>
              <Text style={styles.thNum}>{view === "staff" ? "Shifts" : "Staff"}</Text>
              <Text style={styles.thNum}>Hours</Text>
            </View>
            {view === "staff"
              ? staffRows.map((row) => (
                  <Pressable
                    key={row.userId}
                    style={({ pressed }) => [styles.tRow, pressed ? styles.tRowPressed : null]}
                    onPress={() => setSelectedStaff({ userId: row.userId, rotaStaffMemberId: row.rotaStaffMemberId, name: row.userName })}
                  >
                    <Text style={[styles.tdName, styles.tdLink]} numberOfLines={1}>{row.userName}</Text>
                    <Text style={styles.tdNum}>{row.shiftsWorked}{row.openSessions > 0 ? ` (+${row.openSessions})` : ""}</Text>
                    <Text style={styles.tdNum}>{row.totalHours.toFixed(1)}</Text>
                  </Pressable>
                ))
              : shiftRows.map((row) => (
                  <Pressable
                    key={`${row.date}-${row.shiftName}`}
                    style={({ pressed }) => [styles.tRow, pressed ? styles.tRowPressed : null]}
                    onPress={() => setSelectedShift({ shiftName: row.shiftName, date: row.date })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tdName, styles.tdLink]} numberOfLines={1}>{row.shiftName}</Text>
                      <Text style={styles.tdSub}>
                        {dayLabel(row.date)}{row.startTime ? ` · ${timeRange(row.startTime, row.endTime)}` : ""}
                      </Text>
                    </View>
                    <Text style={styles.tdNum}>{row.staffCount}</Text>
                    <Text style={styles.tdNum}>{row.totalHours.toFixed(1)}</Text>
                  </Pressable>
                ))}
            <View style={[styles.tRow, styles.tTotal]}>
              <Text style={[styles.tdName, styles.tTotalText]}>Total</Text>
              <Text style={styles.tdNum} />
              <Text style={[styles.tdNum, styles.tTotalText]}>{totalHours.toFixed(1)}</Text>
            </View>
          </View>
        ) : null}
        <Text style={styles.muted}>
          {view === "staff"
            ? "“Shifts” counts completed check-outs; (+n) shows sessions still open. Tap a row for details."
            : "“Staff” counts distinct people who worked each shift. Tap a row to see who worked it."}
        </Text>
      </ScrollView>

      {/* Staff sessions drill-down */}
      <Modal visible={selectedStaff !== null} transparent animationType="slide" onRequestClose={() => setSelectedStaff(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheetCard, { maxHeight: "80%" }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="person-outline" size={22} color={appTheme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitleSm}>{selectedStaff?.name}</Text>
                <Text style={styles.muted}>{dayLabel(range.from)} – {dayLabel(range.to)}</Text>
              </View>
              <Pressable onPress={() => setSelectedStaff(null)} style={styles.editorHeaderBtn}>
                <Ionicons name="close" size={22} color={appTheme.colors.text} />
              </Pressable>
            </View>

            {sessionsQuery.isLoading ? <LoadingState inline /> : null}
            {!sessionsQuery.isLoading && (sessionsQuery.data?.length ?? 0) === 0 ? (
              <Text style={styles.muted}>No sessions in this range.</Text>
            ) : null}

            <ScrollView contentContainerStyle={{ gap: 2 }}>
              {(sessionsQuery.data ?? []).map((s) => (
                <View key={s.id} style={styles.sessionRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionDate}>{dayLabel(s.date)}</Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      {s.shiftName ? `${s.shiftName} · ` : ""}{clockTime(s.checkInAt)} → {s.checkOutAt ? clockTime(s.checkOutAt) : "—"}
                      {s.entryMethod === "Manual" ? (s.isApproved ? "  · manual" : "  · pending") : ""}
                    </Text>
                  </View>
                  <Text style={styles.sessionHours}>{s.checkOutAt ? workedLabel(s.checkInAt, s.checkOutAt) : "open"}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Shift sessions drill-down (who worked this shift) */}
      <Modal visible={selectedShift !== null} transparent animationType="slide" onRequestClose={() => setSelectedShift(null)}>
        <View style={styles.sheetBackdropLight}>
          <View style={[styles.sheetCard, { maxHeight: "80%" }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="time-outline" size={22} color={appTheme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitleSm}>{selectedShift?.shiftName}</Text>
                <Text style={styles.muted}>{selectedShift ? dayLabel(selectedShift.date) : ""}</Text>
              </View>
              <Pressable onPress={() => setSelectedShift(null)} style={styles.editorHeaderBtn}>
                <Ionicons name="close" size={22} color={appTheme.colors.text} />
              </Pressable>
            </View>

            {shiftSessionsQuery.isLoading ? <LoadingState inline /> : null}
            {!shiftSessionsQuery.isLoading && (shiftSessionsQuery.data?.length ?? 0) === 0 ? (
              <Text style={styles.muted}>No sessions in this range.</Text>
            ) : null}

            <ScrollView contentContainerStyle={{ gap: 2 }}>
              {(shiftSessionsQuery.data ?? []).map((s) => (
                <View key={s.id} style={styles.sessionRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionDate}>{s.userName}</Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      {clockTime(s.checkInAt)} → {s.checkOutAt ? clockTime(s.checkOutAt) : "—"}
                      {s.entryMethod === "Manual" ? (s.isApproved ? "  · manual" : "  · pending") : ""}
                    </Text>
                  </View>
                  <Text style={styles.sessionHours}>{s.checkOutAt ? workedLabel(s.checkInAt, s.checkOutAt) : "open"}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

// ---------------------------------------------------------------------------
// Manual time approvals (manager)
// ---------------------------------------------------------------------------
export function RotaApprovalsScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AttendanceApprovalRow | null>(null);
  const [editIn, setEditIn] = useState("09:00");
  const [editOut, setEditOut] = useState("17:00");

  const pendingQuery = useQuery({
    queryKey: ["rota-pending", shopId],
    queryFn: () => getPendingApprovals(shopId as string),
    enabled: Boolean(shopId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["rota-pending", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["rota-timesheet", shopId] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveAttendance(id),
    onSuccess: refresh,
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't approve."),
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => rejectAttendance(id),
    onSuccess: refresh,
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't reject."),
  });
  const adjustMutation = useMutation({
    mutationFn: () => {
      const dateStr = editing!.shiftDate ?? formatDateValue(new Date(editing!.checkInAt));
      const { checkInAt, checkOutAt } = sessionIsos(dateStr, editIn, editOut);
      return updateAttendance(editing!.id, {
        checkInAt,
        checkOutAt: editOut ? checkOutAt : undefined,
      });
    },
    onSuccess: () => { setEditing(null); refresh(); },
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't save times."),
  });

  const openAdjust = (p: AttendanceApprovalRow) => {
    setEditIn(toHHmm(p.checkInAt));
    setEditOut(p.checkOutAt ? toHHmm(p.checkOutAt) : p.shiftEnd ? shortTime(p.shiftEnd) : "");
    setEditing(p);
  };

  const confirmReject = async (p: AttendanceApprovalRow) => {
    const ok = await confirmDestructive({
      title: "Reject entry",
      message: `Discard ${p.userName}'s manually entered times for ${p.shiftName ?? "this shift"}? They can re-enter them.`,
    });
    if (ok) rejectMutation.mutate(p.id);
  };

  const pending = pendingQuery.data ?? [];

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.muted}>Manually entered times awaiting your approval.</Text>

        {pendingQuery.isLoading ? <LoadingState inline /> : null}
        {!pendingQuery.isLoading && pending.length === 0 ? (
          <View style={[ui.card, styles.emptyCard]}>
            <Ionicons name="checkmark-done-circle-outline" size={32} color={appTheme.colors.success} />
            <Text style={styles.emptyText}>All caught up — no times to approve.</Text>
          </View>
        ) : null}

        {pending.map((p) => {
          const vIn = p.shiftStart && p.shiftDate ? variance(p.checkInAt, p.shiftDate, p.shiftStart, "in") : null;
          const vOut = p.shiftEnd && p.checkOutAt && (p.shiftEndDate ?? p.shiftDate)
            ? variance(p.checkOutAt, (p.shiftEndDate ?? p.shiftDate) as string, p.shiftEnd, "out")
            : null;
          return (
            <View key={p.id} style={[ui.card, styles.approvalCard]}>
              {/* Who + when */}
              <View style={styles.approvalRow}>
                <View style={[styles.userAvatar, styles.userAvatarOn]}>
                  <Text style={styles.userAvatarText}>{initials(p.userName)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName} numberOfLines={1}>{p.userName}</Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {p.shiftName ? `${p.shiftName} · ` : ""}{p.shiftDate ? dayLabel(p.shiftDate) : "Not rostered"}
                  </Text>
                </View>
                <Text style={styles.manualPill}>Manual</Text>
              </View>

              {/* Scheduled vs entered */}
              <View style={styles.detailGrid}>
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>Scheduled</Text>
                  <Text style={styles.detailValue}>
                    {p.shiftStart ? timeRange(p.shiftStart, p.shiftEnd) : "—"}
                  </Text>
                </View>
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>Entered</Text>
                  <Text style={styles.detailValue}>
                    {clockTime(p.checkInAt)} → {p.checkOutAt ? clockTime(p.checkOutAt) : "—"}
                  </Text>
                </View>
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>Worked</Text>
                  <Text style={styles.detailValue}>{p.checkOutAt ? workedLabel(p.checkInAt, p.checkOutAt) : "—"}</Text>
                </View>
              </View>

              {/* Variance vs schedule */}
              {(vIn && vIn.tone !== "on") || (vOut && vOut.tone !== "on") ? (
                <Text style={styles.varianceLine}>
                  {vIn && vIn.tone !== "on" ? <Text style={vTextStyle(vIn.tone)}>in {vIn.text}</Text> : null}
                  {vIn && vIn.tone !== "on" && vOut && vOut.tone !== "on" ? "   " : ""}
                  {vOut && vOut.tone !== "on" ? <Text style={vTextStyle(vOut.tone)}>{vOut.text}</Text> : null}
                </Text>
              ) : p.checkOutAt ? (
                <Text style={[styles.varianceLine, vTextStyle("good")]}>On schedule</Text>
              ) : (
                <Text style={[styles.varianceLine, vTextStyle("bad")]}>No check-out entered</Text>
              )}

              {p.notes ? <Text style={styles.noteQuote} numberOfLines={3}>“{p.notes}”</Text> : null}
              <Text style={styles.submittedLine}>Submitted {dateTimeLabel(p.submittedOn)}</Text>

              <View style={styles.approvalActions}>
                <Pressable style={styles.rejectBtn} onPress={() => confirmReject(p)} disabled={rejectMutation.isPending}>
                  <Ionicons name="close" size={16} color={appTheme.colors.danger} />
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </Pressable>
                <Pressable style={styles.adjustBtn} onPress={() => openAdjust(p)}>
                  <Ionicons name="create-outline" size={16} color={appTheme.colors.primary} />
                  <Text style={styles.adjustBtnText}>Adjust</Text>
                </Pressable>
                <Pressable style={styles.approveBtnFlex} onPress={() => approveMutation.mutate(p.id)} disabled={approveMutation.isPending}>
                  <Ionicons name="checkmark" size={16} color={appTheme.colors.onPrimary} />
                  <Text style={styles.actBtnText}>{approveMutation.isPending ? "..." : "Approve"}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Adjust times before approving */}
      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="create-outline" size={22} color={appTheme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitleSm}>Adjust times</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {editing?.userName} · {editing?.shiftName || "Shift"}
                </Text>
              </View>
            </View>
            {editing?.shiftStart ? (
              <Text style={styles.mutedSmall}>Scheduled {timeRange(editing.shiftStart, editing.shiftEnd)}</Text>
            ) : null}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Check in</Text>
                <DateTimeField mode="time" value={editIn} onChange={setEditIn} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Check out</Text>
                <DateTimeField mode="time" value={editOut} onChange={setEditOut} />
              </View>
            </View>
            {editIn && editOut && isOvernight(editIn, editOut) && editOut !== editIn ? (
              <Text style={styles.mutedSmall}>Overnight — check-out is on the next day.</Text>
            ) : editIn && editOut === editIn ? (
              <Text style={[styles.mutedSmall, { color: appTheme.colors.danger }]}>Check-in and check-out can’t be the same.</Text>
            ) : null}
            <View style={styles.noticeRow}>
              <Ionicons name="information-circle-outline" size={15} color={appTheme.colors.textMuted} />
              <Text style={styles.mutedSmall}>Saving approves this entry with the adjusted times.</Text>
            </View>
            <PrimaryButton
              label={adjustMutation.isPending ? "Saving..." : "Save & approve"}
              onPress={() => adjustMutation.mutate()}
              disabled={adjustMutation.isPending || !editIn || editOut === editIn}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setEditing(null)} disabled={adjustMutation.isPending} />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

// ---------------------------------------------------------------------------
// External staff members (roster-only people, not Ops Arrow users)
// ---------------------------------------------------------------------------
export function RotaStaffMembersScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [editing, setEditing] = useState<RotaStaffMember | "new" | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+44 ");
  const [email, setEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");

  const membersQuery = useQuery({
    queryKey: ["rota-staff-members", shopId],
    queryFn: () => getRotaStaffMembers(shopId as string),
    enabled: Boolean(shopId),
  });
  const rolesQuery = useQuery({ queryKey: ["roles"], queryFn: getRoleOptions, enabled: Boolean(shopId) });
  const inviteRoles = (rolesQuery.data ?? []).filter((r) => r.name.replace(/\s+/g, "").toLowerCase() !== "platformadmin");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["rota-staff-members", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["rota-assignable", shopId] });
  };

  const openNew = () => { setName(""); setPhone("+44 "); setEmail(""); setInviteRoleId(""); setEditing("new"); };
  const openEdit = (m: RotaStaffMember) => { setName(m.name); setPhone(m.phone || "+44 "); setEmail(m.email || ""); setInviteRoleId(""); setEditing(m); };

  const saveMutation = useMutation({
    mutationFn: () => {
      const p = phone.trim();
      const payload = { shopId: shopId as string, name: name.trim(), phone: p && p !== "+44" ? p : undefined, email: email.trim() || undefined };
      return editing && editing !== "new" ? updateRotaStaffMember(editing.id, payload) : createRotaStaffMember(payload);
    },
    onSuccess: () => { setEditing(null); refresh(); toastSuccess("Saved."); },
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't save."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRotaStaffMember(id),
    onSuccess: () => { setEditing(null); refresh(); },
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't remove."),
  });

  const confirmDelete = async (m: RotaStaffMember) => {
    const ok = await confirmDestructive({ title: "Remove staff member", message: `Remove ${m.name}? Past rota/timesheet records are kept.` });
    if (ok) deleteMutation.mutate(m.id);
  };

  const members = membersQuery.data ?? [];

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.muted}>People who aren't Ops Arrow users but you roster &amp; record hours for.</Text>
        <PrimaryButton label="+ Add external person" onPress={openNew} disabled={!shopId} />

        {membersQuery.isLoading ? <LoadingState inline /> : null}
        {!membersQuery.isLoading && members.length === 0 ? (
          <View style={ui.card}><Text style={styles.muted}>No external staff yet.</Text></View>
        ) : null}

        {members.map((m) => (
          <Pressable key={m.id} style={[ui.card, styles.memberCard]} onPress={() => openEdit(m)}>
            <View style={[styles.userAvatar, styles.userAvatarOn]}>
              <Text style={styles.userAvatarText}>{initials(m.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName} numberOfLines={1}>{m.name}</Text>
              <Text style={styles.muted} numberOfLines={1}>
                {[m.phone, m.email].filter(Boolean).join("  ·  ") || "No contact details"}
              </Text>
            </View>
            <Ionicons name="create-outline" size={18} color={appTheme.colors.primary} />
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <Text style={styles.modalTitleSm}>{editing && editing !== "new" ? "Edit external person" : "Add external person"}</Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput style={styles.externalInput} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={appTheme.colors.textSubtle} autoCapitalize="words" />

            <Text style={styles.fieldLabel}>Phone (optional)</Text>
            <TextInput style={styles.externalInput} value={phone} onChangeText={setPhone} placeholder="+44 7700 900000" placeholderTextColor={appTheme.colors.textSubtle} keyboardType="phone-pad" />

            <Text style={styles.fieldLabel}>Email (optional)</Text>
            <TextInput style={styles.externalInput} value={email} onChangeText={setEmail} placeholder="name@example.com" placeholderTextColor={appTheme.colors.textSubtle} autoCapitalize="none" keyboardType="email-address" />

            <PrimaryButton label={saveMutation.isPending ? "Saving..." : "Save"} onPress={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending} />

            {editing && editing !== "new" ? (
              <>
                <Text style={[styles.fieldLabel, { marginTop: appTheme.spacing.sm }]}>Invite to Ops Arrow — role</Text>
                <View style={styles.chipRow}>
                  {inviteRoles.map((r) => {
                    const active = inviteRoleId === r.id;
                    return (
                      <Pressable key={r.id} style={[styles.chip, active ? styles.chipActive : null]} onPress={() => setInviteRoleId(r.id)}>
                        <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{r.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <PrimaryButton
                  label="Invite to Ops Arrow"
                  tone="neutral"
                  onPress={() => {
                    const e = email.trim();
                    setEditing(null);
                    navigation.navigate("UserInvitations", { email: e || undefined, roleId: inviteRoleId || undefined });
                  }}
                />
                <PrimaryButton label="Remove" tone="danger" onPress={() => confirmDelete(editing)} disabled={deleteMutation.isPending} />
              </>
            ) : null}
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setEditing(null)} disabled={saveMutation.isPending} />
          </View>
        </View>
      </Modal>
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

  // Weekly rota grid
  weekNav: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  weekNavBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceBrandSoft },
  weekNavLabel: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 16 },
  weekNavHint: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, marginTop: 1 },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 999, backgroundColor: appTheme.colors.primary },
  generateBtnText: { color: appTheme.colors.onPrimary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  externalInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
    backgroundColor: appTheme.colors.surface,
    textAlignVertical: "center",
  },
  addExternalBtn: { paddingHorizontal: 18, paddingVertical: 11, alignItems: "center", justifyContent: "center", borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.primary },
  addExternalOpenBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: appTheme.spacing.sm, paddingVertical: 11, borderRadius: appTheme.radius.sm, borderWidth: 1, borderColor: appTheme.colors.border },
  memberCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  contactValue: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  dayCard: { gap: 8 },
  dayCardToday: { borderWidth: 1, borderColor: appTheme.colors.primary },
  dayCardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayName: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 15 },
  dayNameToday: { color: appTheme.colors.primary },
  dayDate: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, marginTop: 1 },
  dayAddBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceBrandSoft },
  dayEmpty: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 13, fontStyle: "italic" },
  rotaTable: { borderWidth: 1, borderColor: appTheme.colors.borderSoft, borderRadius: appTheme.radius.sm, overflow: "hidden" },
  rotaHeadRow: { flexDirection: "row", alignItems: "center", backgroundColor: appTheme.colors.surfaceMuted, paddingHorizontal: 10, paddingVertical: 7 },
  rotaHeadCell: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  rotaBodyRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  rotaShiftCol: { width: 110 },
  rotaStaffCol: { flex: 1, paddingLeft: 8, gap: 8 },
  rotaStaffText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 20, paddingVertical: 2 },
  rotaActionCol: { width: 28, alignItems: "flex-end" },
  weekShiftRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  weekShiftBar: { width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: appTheme.colors.primary },
  weekShiftTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceMuted },

  // My Shifts cards
  dayGroup: { gap: appTheme.spacing.xs },
  dayHeader: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 19, marginTop: 4 },
  myShiftCard: { gap: 10 },
  myShiftHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  myShiftName: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 16, lineHeight: 21 },
  metaLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 },
  metaText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13 },
  metaDivider: { color: appTheme.colors.textSubtle, fontSize: 13 },
  attBlock: {
    gap: 3,
    paddingTop: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: appTheme.colors.borderSoft,
  },
  attMainRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  attMain: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  attWorked: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 14 },
  attVariance: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, marginLeft: 20 },
  attNote: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, marginLeft: 20 },
  attNotePending: { color: appTheme.colors.danger },
  mutedSmall: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  actBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: appTheme.colors.primary },
  actBtnOut: { backgroundColor: appTheme.colors.danger },
  actBtnDisabled: { backgroundColor: appTheme.colors.textSubtle },
  actBtnText: { color: appTheme.colors.onPrimary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  actGhost: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 10 },
  actGhostText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  approveBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: appTheme.colors.success },
  emptyCard: { alignItems: "center", gap: 8, paddingVertical: appTheme.spacing.lg },
  emptyText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 14 },
  approvalCard: { gap: 10 },
  approvalRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  manualPill: { overflow: "hidden", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: appTheme.colors.surfaceMuted, color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11 },
  detailGrid: { flexDirection: "row", gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  detailCol: { flex: 1, gap: 2 },
  detailLabel: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 },
  detailValue: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  varianceLine: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  noteQuote: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, fontStyle: "italic" },
  submittedLine: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 11 },
  approveBtnWide: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 999, backgroundColor: appTheme.colors.success },
  segment: { flexDirection: "row", backgroundColor: appTheme.colors.surfaceMuted, borderRadius: appTheme.radius.md, padding: 3 },
  segmentBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: appTheme.radius.sm },
  segmentBtnActive: { backgroundColor: appTheme.colors.surface, borderWidth: 1, borderColor: appTheme.colors.border },
  segmentText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  segmentTextActive: { color: appTheme.colors.text },
  tRowPressed: { opacity: 0.6 },
  tdLink: { color: appTheme.colors.primary },
  tdSub: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 15 },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  sessionDate: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  sessionHours: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 14 },
  approvalActions: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2 },
  rejectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: appTheme.colors.danger },
  rejectBtnText: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  adjustBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: appTheme.colors.border },
  adjustBtnText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  approveBtnFlex: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 999, backgroundColor: appTheme.colors.success },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: appTheme.spacing.md },
  sheetBackdropLight: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: appTheme.spacing.md },
  sheetCard: {
    backgroundColor: appTheme.colors.background,
    borderRadius: appTheme.radius.lg,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  sheetIcon: { width: 42, height: 42, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: appTheme.colors.surfaceBrandSoft },
  modalTitleSm: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 18 },
  previewText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  noticeRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { alignItems: "center", gap: 1, paddingHorizontal: 14, paddingVertical: 8, borderRadius: appTheme.radius.md, borderWidth: 1, borderColor: appTheme.colors.border, backgroundColor: appTheme.colors.surface },
  chipActive: { borderColor: appTheme.colors.primary, backgroundColor: appTheme.colors.surfaceBrandSoft },
  chipText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 17 },
  chipTextActive: { color: appTheme.colors.primary },
  chipSubText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 11, lineHeight: 14 },
  chipSubTextActive: { color: appTheme.colors.primary },

  editorScreen: { flex: 1, backgroundColor: appTheme.colors.background },
  editorFooter: {
    paddingHorizontal: appTheme.spacing.md,
    paddingTop: appTheme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: appTheme.colors.borderSoft,
    backgroundColor: appTheme.colors.surface,
  },
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
