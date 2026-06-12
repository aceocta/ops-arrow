import React, { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
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
  getTimesheetLock,
  setTimesheetLock,
  approveAttendance,
  updateAttendance,
  rejectAttendance,
  saveManualAttendance,
  updateRotaShift,
  requestTimesheetReviews,
  getTimesheetReviews,
  getMyTimesheetReviews,
  getTimesheetReviewHistory,
  getMyTimesheetReviewHistory,
  getTimesheetReviewSessions,
  confirmTimesheetReview,
  disputeTimesheetReview,
  resolveTimesheetReview,
  approveTimesheetReview,
  cancelLeaveRequest,
  createLeaveRequest,
  getLeaveBalance,
  getLeaveDays,
  getLeaveRequests,
  getMyLeaveRequests,
  type RotaTimesheetReview,
  type SaveRotaShiftAssignment,
  type SaveRotaShiftPayload,
} from "../../api/rotaApi";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { DateRangeQuickPicks } from "../../components/DateRangeQuickPicks";
import { LoadingState } from "../../components/LoadingState";
import { SkeletonList } from "../../components/Skeleton";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { EmptyState } from "../../components/EmptyState";
import { confirmDestructive } from "../../utils/confirm";
import { formatDayLabel } from "../../utils/dateLabels";
import { DEFAULT_WEEK_START_DAY, startOfWeekFor } from "../../utils/week";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { toastError, toastSuccess } from "../../components/toast";
import { useFeature } from "../subscription/useFeature";
import { AssignableUser, AttendanceApprovalRow, LeaveRequest, LeaveType, RotaAssignee, RotaShift, RotaShiftTemplate, RotaStaffMember, TimesheetRow, TimesheetSession } from "../../types/models";
import { LEAVE_TYPES, leavePeriodLabel, parseHours } from "./LeaveScreens";
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

function next7() {
  const from = new Date();
  const to = new Date(from);
  to.setDate(to.getDate() + 6);
  return { from: formatDateValue(from), to: formatDateValue(to) };
}

function thisMonth() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: formatDateValue(first), to: formatDateValue(last) };
}

// Manager rota defaults to the week ahead (today → +6) so newly rostered shifts are visible.
function weekAhead() {
  const from = new Date();
  const to = new Date(from);
  to.setDate(to.getDate() + 6);
  return { from: formatDateValue(from), to: formatDateValue(to) };
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

// Planned hours of a shift: end − start, +24h when it runs overnight (end not after start).
function plannedHours(start: string, end: string) {
  const toMin = (t: string) => {
    const [h, m] = t.split(":");
    return (Number(h) || 0) * 60 + (Number(m) || 0);
  };
  let mins = toMin(end) - toMin(start);
  if (mins <= 0) mins += 1440;
  return mins / 60;
}

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

// Escape a CSV field: wrap in quotes when it contains a comma, quote or newline, doubling inner quotes.
function csvField(value: string | number) {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

// Total hours for a review's session breakdown: sum of completed sessions, but defer to the
// server's figure when they drift apart (the server total is authoritative).
function breakdownTotal(sessions: TimesheetSession[], serverTotalHours: number) {
  const summed = sessions.filter((s) => s.checkOutAt).reduce((sum, s) => sum + s.hours, 0);
  const total = Math.abs(summed - serverTotalHours) > 0.05 ? serverTotalHours : summed;
  return `${total.toFixed(1)}h`;
}

// Assignment reasons. "Regular shift" is the default and normalizes to null server-side;
// anything outside the presets is a free-text "Other…" reason.
const REGULAR_REASON = "Regular shift";
const ASSIGNMENT_REASONS = [REGULAR_REASON, "Cleaning", "Delivery", "Stock take", "Training", "Cover"];

type AssignmentMeta = { reason: string; note: string };

// Per-person assignment metadata keyed by person id (userId ?? rotaStaffMemberId).
function metaFromAssignees(assignees: RotaAssignee[]): Record<string, AssignmentMeta> {
  const meta: Record<string, AssignmentMeta> = {};
  for (const a of assignees) {
    const key = a.userId ?? a.rotaStaffMemberId;
    if (key) meta[key] = { reason: a.reason ?? REGULAR_REASON, note: a.note ?? "" };
  }
  return meta;
}

// Identity key for a shift assignee — userId ?? rotaStaffMemberId, with name as a last resort.
const assigneePersonKey = (a: { userId?: string | null; rotaStaffMemberId?: string | null; name: string }) =>
  a.userId ?? a.rotaStaffMemberId ?? a.name;

// The "approved {date}" suffix for a history row — resolvedOn is an ISO timestamp.
const approvedOnLabel = (resolvedOn?: string) => formatDayLabel(resolvedOn ? resolvedOn.slice(0, 10) : null);

// Compact hours label for leave figures — trims a trailing ".0" ("8h", "7.5h").
const leaveHoursLabel = (n: number) => `${Number(n.toFixed(1))}h`;

// Non-zero approved-leave segments for a by-staff timesheet row ("Holiday 8h · Sick 4h").
// Unpaid leave renders muted — it doesn't add paid hours — while the rest use the info-blue style.
function leaveHourSegments(row: TimesheetRow): Array<{ label: string; muted: boolean }> {
  const segments: Array<{ label: string; muted: boolean }> = [];
  if (row.holidayHours) segments.push({ label: `Holiday ${leaveHoursLabel(row.holidayHours)}`, muted: false });
  if (row.sickHours) segments.push({ label: `Sick ${leaveHoursLabel(row.sickHours)}`, muted: false });
  if (row.otherLeaveHours) segments.push({ label: `Other leave ${leaveHoursLabel(row.otherLeaveHours)}`, muted: false });
  if (row.unpaidLeaveHours) segments.push({ label: `Unpaid ${leaveHoursLabel(row.unpaidLeaveHours)}`, muted: true });
  return segments;
}

// ---------------------------------------------------------------------------
// My Shifts + check in/out (staff)
// ---------------------------------------------------------------------------
export function MyShiftsScreen() {
  const { activeShopId, profile } = useAuth();
  const shopId = activeShopId;
  const queryClient = useQueryClient();
  const [range, setRange] = useState(() => next7());
  const { from, to } = range;
  const [manualShift, setManualShift] = useState<RotaShift | null>(null);
  const [manualIn, setManualIn] = useState("09:00");
  const [manualOut, setManualOut] = useState("17:00");
  // Timesheet review the staff member is raising an issue against (opens the note modal).
  const [disputeTarget, setDisputeTarget] = useState<RotaTimesheetReview | null>(null);
  const [disputeNote, setDisputeNote] = useState("");
  // Review whose per-session breakdown is expanded (one at a time).
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  // Past (approved) timesheet periods modal.
  const [pastOpen, setPastOpen] = useState(false);
  // Leave (gated on the LeaveManagement feature) — request-leave modal state.
  const leaveFeature = useFeature("LeaveManagement");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>("Holiday");
  const [leaveStart, setLeaveStart] = useState(() => formatDateValue(new Date()));
  const [leaveEnd, setLeaveEnd] = useState(() => formatDateValue(new Date()));
  const [leaveHours, setLeaveHours] = useState("8");
  const [leaveNote, setLeaveNote] = useState("");

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
  const myReviewsQuery = useQuery({
    queryKey: ["rota-my-reviews", shopId],
    queryFn: () => getMyTimesheetReviews(shopId as string),
    enabled: Boolean(shopId),
  });
  // Only periods that still need the staff member's attention surface on this screen.
  const actionableReviews = useMemo(
    () => (myReviewsQuery.data ?? []).filter((r) => r.status === "PendingStaff" || r.status === "Disputed"),
    [myReviewsQuery.data],
  );
  // Per-session breakdown of the expanded review (fetched only while expanded).
  const reviewSessionsQuery = useQuery({
    queryKey: ["rota-review-sessions", expandedReviewId],
    queryFn: () => getTimesheetReviewSessions(expandedReviewId as string),
    enabled: Boolean(expandedReviewId),
  });
  // My approved timesheet history (fetched only while the modal is open).
  const pastReviewsQuery = useQuery({
    queryKey: ["rota-my-review-history", shopId],
    queryFn: () => getMyTimesheetReviewHistory(shopId as string),
    enabled: Boolean(shopId) && pastOpen,
  });
  // My holiday balance + leave requests — only fetched when Leave Management is enabled.
  const leaveBalanceQuery = useQuery({
    queryKey: ["leave-balance", shopId, "mine"],
    queryFn: () => getLeaveBalance(shopId as string),
    enabled: Boolean(shopId) && leaveFeature.isAllowed,
  });
  const myLeaveQuery = useQuery({
    queryKey: ["leave-mine", shopId],
    queryFn: () => getMyLeaveRequests(shopId as string),
    enabled: Boolean(shopId) && leaveFeature.isAllowed,
  });
  const leaveBalance = leaveBalanceQuery.data ?? null;
  // What's worth showing on the card: anything pending, plus approved/rejected leave that
  // hasn't finished yet (history stays out of the way).
  const visibleLeave = useMemo(() => {
    const today = formatDateValue(new Date());
    return (myLeaveQuery.data ?? [])
      .filter((r) => r.status === "Pending" || ((r.status === "Approved" || r.status === "Rejected") && r.endDate >= today))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [myLeaveQuery.data]);

  const current = attendanceQuery.data;
  const isCheckedInSomewhere = Boolean(current && !current.checkOutAt);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["rota-attendance", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["rota-my-shifts", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["rota-my-reviews", shopId] });
    if (leaveFeature.isAllowed) {
      void queryClient.invalidateQueries({ queryKey: ["leave-mine", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["leave-balance", shopId] });
    }
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

  const confirmReviewMutation = useMutation({
    mutationFn: (id: string) => confirmTimesheetReview(id),
    onSuccess: () => {
      toastSuccess("Hours confirmed.");
      void queryClient.invalidateQueries({ queryKey: ["rota-my-reviews", shopId] });
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't confirm your hours.")),
  });
  const disputeMutation = useMutation({
    mutationFn: () => disputeTimesheetReview(disputeTarget!.id, disputeNote.trim()),
    onSuccess: () => {
      setDisputeTarget(null);
      setDisputeNote("");
      toastSuccess("Issue sent to your manager.");
      void queryClient.invalidateQueries({ queryKey: ["rota-my-reviews", shopId] });
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't send the issue.")),
  });

  const requestLeaveMutation = useMutation({
    mutationFn: () =>
      createLeaveRequest({
        shopId: shopId as string,
        type: leaveType,
        startDate: leaveStart,
        endDate: leaveEnd,
        hoursPerDay: parseHours(leaveHours) as number,
        staffNote: leaveNote.trim() || undefined,
      }),
    onSuccess: () => {
      setLeaveOpen(false);
      toastSuccess("Leave request sent.");
      void queryClient.invalidateQueries({ queryKey: ["leave-mine", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["leave-balance", shopId] });
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't send the leave request.")),
  });
  const cancelLeaveMutation = useMutation({
    mutationFn: (id: string) => cancelLeaveRequest(id),
    onSuccess: () => {
      toastSuccess("Leave request cancelled.");
      void queryClient.invalidateQueries({ queryKey: ["leave-mine", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["leave-balance", shopId] });
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't cancel the leave request.")),
  });

  const openRequestLeave = () => {
    setLeaveType("Holiday");
    const today = formatDateValue(new Date());
    setLeaveStart(today);
    setLeaveEnd(today);
    setLeaveHours(String(leaveBalance?.usualHoursPerDay ?? 8));
    setLeaveNote("");
    setLeaveOpen(true);
  };
  const startCancelLeave = async (r: LeaveRequest) => {
    const ok = await confirmDestructive({
      title: "Cancel request",
      message: `Cancel your ${r.type.toLowerCase()} leave request for ${formatDayLabel(r.startDate)}${r.endDate !== r.startDate ? ` – ${formatDayLabel(r.endDate)}` : ""}?`,
      confirmLabel: "Cancel request",
      cancelLabel: "Keep",
    });
    if (ok) cancelLeaveMutation.mutate(r.id);
  };

  const startConfirmReview = async (r: RotaTimesheetReview) => {
    const ok = await confirmDestructive({
      title: "Confirm your hours?",
      message: `You're confirming ${r.totalHours.toFixed(1)}h for ${formatDayLabel(r.periodFrom)} – ${formatDayLabel(r.periodTo)} is correct.`,
      confirmLabel: "Confirm",
    });
    if (ok) confirmReviewMutation.mutate(r.id);
  };

  const openDispute = (r: RotaTimesheetReview) => {
    setDisputeNote("");
    setDisputeTarget(r);
  };

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
          // My own assignment on this shift — carries the reason when it isn't a regular shift.
          const myAssignment = profile?.userId ? shift.assignees.find((a) => a.userId === profile.userId) : undefined;
          const open = Boolean(att && !att.checkOutAt);
          const completed = Boolean(att && att.checkOutAt);
          const onAnotherShift = isCheckedInSomewhere && current?.rotaShiftId !== shift.id;
          const vIn = att ? variance(att.checkInAt, shift.shiftDate, shift.startTime, "in") : null;
          const vOut = att?.checkOutAt ? variance(att.checkOutAt, shift.endDate, shift.endTime, "out") : null;

          const statusLabel = open ? "On shift" : completed ? "Completed" : "Upcoming";
          const statusTone: "success" | "neutral" = open ? "success" : "neutral";

          const dotColor = open ? appTheme.colors.success : completed ? appTheme.colors.textSubtle : appTheme.colors.primary;

          return (
            <View key={shift.id} style={[ui.card, styles.myShiftCard, open ? styles.myShiftCardActive : null]}>
              {/* Header: status dot + shift name + status chip */}
              <View style={styles.myShiftHeader}>
                <View style={styles.myShiftTitleWrap}>
                  <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                  <Text style={styles.myShiftName} numberOfLines={1}>{shift.shiftName || "Shift"}</Text>
                </View>
                <StatusBadge label={statusLabel} tone={statusTone} />
              </View>

              {/* Schedule chips */}
              <View style={styles.chipLine}>
                <View style={styles.infoChip}>
                  <Ionicons name="time-outline" size={13} color={appTheme.colors.textMuted} />
                  <Text style={styles.infoChipText}>{timeRange(shift.startTime, shift.endTime)}{overnightSuffix(shift.shiftDate, shift.endDate)}</Text>
                </View>
                {shift.position ? (
                  <View style={styles.infoChip}>
                    <Ionicons name="briefcase-outline" size={13} color={appTheme.colors.textMuted} />
                    <Text style={styles.infoChipText}>{shift.position}</Text>
                  </View>
                ) : null}
                {myAssignment?.reason ? (
                  <View style={[styles.infoChip, styles.infoChipReason]}>
                    <Ionicons name="pricetag-outline" size={13} color={appTheme.colors.textInfoStrong} />
                    <Text style={[styles.infoChipText, styles.infoChipReasonText]}>{myAssignment.reason}</Text>
                  </View>
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
                  <Pressable style={({ pressed }) => [styles.actBtn, styles.actBtnOut, pressed && styles.actBtnPressed]} onPress={() => checkOutMutation.mutate()} disabled={busy}>
                    <Ionicons name="log-out-outline" size={16} color={appTheme.colors.onPrimary} />
                    <Text style={styles.actBtnText}>{checkOutMutation.isPending ? "Checking out…" : "Check out"}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={({ pressed }) => [styles.actBtn, onAnotherShift ? styles.actBtnDisabled : null, pressed && !onAnotherShift ? styles.actBtnPressed : null]}
                    onPress={() => checkInMutation.mutate(shift.id)}
                    disabled={busy || onAnotherShift}
                  >
                    <Ionicons name="log-in-outline" size={16} color={appTheme.colors.onPrimary} />
                    <Text style={styles.actBtnText}>{checkInMutation.isPending ? "Checking in…" : completed ? "Check in again" : "Check in"}</Text>
                  </Pressable>
                )}
                <Pressable style={({ pressed }) => [styles.actGhost, pressed && styles.actGhostPressed]} onPress={() => openManual(shift)}>
                  <Ionicons name="create-outline" size={16} color={appTheme.colors.primary} />
                  <Text style={styles.actGhostText}>{att ? "Edit" : "Enter times"}</Text>
                </Pressable>
              </View>
              {onAnotherShift ? <Text style={styles.mutedSmall}>Check out of your current shift first.</Text> : null}
            </View>
    );
  };

  const refreshing = shiftsQuery.isRefetching || attendanceQuery.isRefetching;
  const dayCount = Math.max(
    1,
    Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000) + 1,
  );

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={appTheme.colors.primary} colors={[appTheme.colors.primary]} />
      }
    >
      <View style={styles.content}>
        {/* Timesheet review — periods the manager has asked this staff member to sign off */}
        {actionableReviews.length > 0 ? (
          <View style={[ui.card, styles.reviewCard]}>
            <View style={styles.reviewCardHeader}>
              <Ionicons name="receipt-outline" size={16} color={appTheme.colors.primary} />
              <Text style={styles.sectionTitle}>Timesheet review</Text>
            </View>
            {actionableReviews.map((review) => {
              const disputed = review.status === "Disputed";
              const confirmingThis = confirmReviewMutation.isPending && confirmReviewMutation.variables === review.id;
              const expanded = expandedReviewId === review.id;
              return (
                <View key={review.id} style={styles.reviewRow}>
                  <View style={styles.reviewRowTop}>
                    <Pressable
                      style={({ pressed }) => [styles.reviewPeriodBtn, pressed ? styles.reviewPeriodBtnPressed : null]}
                      onPress={() => setRange({ from: review.periodFrom, to: review.periodTo })}
                      accessibilityRole="button"
                      accessibilityLabel={`Show your shifts for ${formatDayLabel(review.periodFrom)} to ${formatDayLabel(review.periodTo)}`}
                    >
                      <Text style={styles.reviewPeriod}>
                        {formatDayLabel(review.periodFrom)} – {formatDayLabel(review.periodTo)} · {review.totalHours.toFixed(1)}h
                      </Text>
                      <Text style={styles.reviewPeriodHint}>Tap to see these shifts below</Text>
                    </Pressable>
                    <StatusBadge label={disputed ? "Issue raised" : "Awaiting your review"} tone={disputed ? "warning" : "neutral"} />
                  </View>
                  {disputed && review.staffNote ? <Text style={styles.noteQuote}>“{review.staffNote}”</Text> : null}
                  {disputed && review.managerNote ? <Text style={styles.mutedSmall}>Manager: {review.managerNote}</Text> : null}
                  <Pressable
                    style={({ pressed }) => [styles.actGhost, styles.reviewGhostBtn, pressed ? styles.actGhostPressed : null]}
                    onPress={() => setExpandedReviewId(expanded ? null : review.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${expanded ? "Hide" : "View"} the session breakdown for ${formatDayLabel(review.periodFrom)} to ${formatDayLabel(review.periodTo)}`}
                  >
                    <Ionicons name="list-outline" size={16} color={appTheme.colors.primary} />
                    <Text style={styles.actGhostText}>{expanded ? "Hide breakdown" : "View breakdown"}</Text>
                  </Pressable>
                  {expanded ? (
                    reviewSessionsQuery.isLoading ? (
                      <LoadingState inline />
                    ) : (reviewSessionsQuery.data?.length ?? 0) === 0 ? (
                      <Text style={styles.muted}>No sessions in this period.</Text>
                    ) : (
                      <View>
                        {(reviewSessionsQuery.data ?? []).map((s) => (
                          <View key={s.id} style={styles.sessionRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.sessionDate}>{dayLabel(s.date)} · {s.shiftName ?? "Shift"}</Text>
                              <Text style={styles.muted} numberOfLines={1}>
                                {s.reason ? <Text style={styles.reasonText}>{`${s.reason} · `}</Text> : ""}{clockTime(s.checkInAt)} → {s.checkOutAt ? clockTime(s.checkOutAt) : "—"}
                                {s.entryMethod === "Manual" && !s.isApproved ? "  · manual · pending" : ""}
                              </Text>
                            </View>
                            <Text style={styles.sessionHours}>{s.checkOutAt ? workedLabel(s.checkInAt, s.checkOutAt) : "open"}</Text>
                          </View>
                        ))}
                        <View style={styles.sessionRow}>
                          <Text style={[styles.sessionDate, { flex: 1 }]}>Total</Text>
                          <Text style={styles.sessionHours}>{breakdownTotal(reviewSessionsQuery.data ?? [], review.totalHours)}</Text>
                        </View>
                      </View>
                    )
                  ) : null}
                  <PrimaryButton
                    label={confirmingThis ? "Confirming…" : "Confirm my hours"}
                    icon="checkmark-circle-outline"
                    onPress={() => void startConfirmReview(review)}
                    disabled={confirmReviewMutation.isPending}
                  />
                  {disputed ? (
                    <Text style={styles.mutedSmall}>Waiting for your manager. Confirming your hours withdraws the issue.</Text>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [styles.actGhost, styles.reviewGhostBtn, pressed ? styles.actGhostPressed : null]}
                      onPress={() => openDispute(review)}
                      disabled={confirmReviewMutation.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={`Raise an issue with your hours for ${formatDayLabel(review.periodFrom)} to ${formatDayLabel(review.periodTo)}`}
                    >
                      <Ionicons name="alert-circle-outline" size={16} color={appTheme.colors.primary} />
                      <Text style={styles.actGhostText}>Raise an issue</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
            <Pressable
              style={({ pressed }) => [styles.pastLink, pressed ? styles.reviewPeriodBtnPressed : null]}
              onPress={() => setPastOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="View your past approved timesheets"
            >
              <Text style={styles.resendText}>Past timesheets</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.pastLink, pressed ? styles.reviewPeriodBtnPressed : null]}
            onPress={() => setPastOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="View your past approved timesheets"
          >
            <Text style={styles.resendText}>Past timesheets</Text>
          </Pressable>
        )}

        {/* Leave — balance, upcoming/pending requests and a way to ask for more */}
        {leaveFeature.isAllowed ? (
          <View style={[ui.card, styles.reviewCard]}>
            <View style={styles.reviewCardHeader}>
              <Ionicons name="airplane-outline" size={16} color={appTheme.colors.primary} />
              <Text style={styles.sectionTitle}>Leave</Text>
            </View>

            {leaveBalance ? (
              <Text style={styles.leaveBalanceText}>
                Holiday left: {leaveBalance.remainingHours.toFixed(0)}h of {leaveBalance.entitledHours.toFixed(0)}h
              </Text>
            ) : leaveBalanceQuery.isSuccess ? (
              <Text style={styles.mutedSmall}>No holiday allowance set yet — ask your manager.</Text>
            ) : null}

            {myLeaveQuery.isLoading ? <LoadingState inline /> : null}
            {myLeaveQuery.isSuccess && visibleLeave.length === 0 ? (
              <Text style={styles.mutedSmall}>No upcoming or pending leave.</Text>
            ) : null}

            {visibleLeave.map((r) => {
              const badge =
                r.status === "Pending"
                  ? { label: "Pending", tone: "neutral" as const }
                  : r.status === "Approved"
                    ? { label: "Approved", tone: "success" as const }
                    : { label: "Rejected", tone: "danger" as const };
              const cancellingThis = cancelLeaveMutation.isPending && cancelLeaveMutation.variables === r.id;
              return (
                <View key={r.id} style={styles.reviewRow}>
                  <View style={styles.reviewRowTop}>
                    <Text style={styles.reviewPeriod}>
                      <Text style={styles.reasonText}>{r.type}</Text> · {leavePeriodLabel(r)}
                    </Text>
                    <StatusBadge label={badge.label} tone={badge.tone} />
                  </View>
                  {r.status !== "Pending" && r.managerNote ? (
                    <Text style={styles.mutedSmall}>Manager: {r.managerNote}</Text>
                  ) : null}
                  {r.status === "Pending" ? (
                    <Pressable
                      style={({ pressed }) => [styles.actGhost, styles.reviewGhostBtn, pressed ? styles.actGhostPressed : null]}
                      onPress={() => void startCancelLeave(r)}
                      disabled={cancelLeaveMutation.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={`Cancel your ${r.type} leave request starting ${formatDayLabel(r.startDate)}`}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={appTheme.colors.primary} />
                      <Text style={styles.actGhostText}>{cancellingThis ? "Cancelling…" : "Cancel request"}</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}

            <PrimaryButton label="Request leave" icon="airplane-outline" onPress={openRequestLeave} disabled={!shopId} />
          </View>
        ) : null}

        {/* Date range */}
        <View style={[ui.card, styles.rangeCard]}>
          <View style={styles.rangeTopRow}>
            <View style={styles.rangeTopLeft}>
              <Ionicons name="calendar-outline" size={16} color={appTheme.colors.primary} />
              <Text style={styles.rangeSummary} numberOfLines={1}>{dayLabel(from)} → {dayLabel(to)}</Text>
            </View>
            <Text style={styles.rangeCount}>{dayCount} day{dayCount === 1 ? "" : "s"}</Text>
          </View>

          {/* Quick presets — segmented */}
          <View style={styles.presetRow}>
            {[
              { label: "Last 7 days", value: last7() },
              { label: "Next 7 days", value: next7() },
              { label: "This month", value: thisMonth() },
            ].map((p) => {
              const active = p.value.from === from && p.value.to === to;
              return (
                <Pressable key={p.label} style={[styles.presetChip, active ? styles.presetChipActive : null]} onPress={() => setRange(p.value)}>
                  <Text style={[styles.presetText, active ? styles.presetTextActive : null]} numberOfLines={1}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Custom range */}
          <View style={styles.customRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>From</Text>
              <DateTimeField mode="date" value={from} onChange={(v) => setRange((r) => ({ ...r, from: v }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>To</Text>
              <DateTimeField mode="date" value={to} onChange={(v) => setRange((r) => ({ ...r, to: v }))} />
            </View>
          </View>
        </View>

        {isCheckedInSomewhere ? (
          <Text style={styles.muted}>You're on shift since {clockTime(current?.checkInAt)}. Check out before starting another.</Text>
        ) : null}

        {shiftsQuery.isLoading ? <SkeletonList count={4} /> : null}
        {!shiftsQuery.isLoading && grouped.length === 0 ? (
          <EmptyState icon="calendar-outline" title="No shifts scheduled" message="No shifts in this date range. Adjust the dates above or pull down to refresh." />
        ) : null}

        {grouped.map(([date, shifts]) => (
          <View key={date} style={styles.dayGroup}>
            <Text style={styles.dayHeader}>{dayLabel(date)}</Text>
            {shifts.map(renderShiftCard)}
          </View>
        ))}
      </View>

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
              label={manualMutation.isPending ? "Saving…" : "Save hours"}
              onPress={() => manualMutation.mutate()}
              disabled={manualMutation.isPending || !manualShift || manualOut === manualIn}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setManualShift(null)} disabled={manualMutation.isPending} />
          </View>
        </View>
      </Modal>

      {/* Raise an issue against a timesheet review period */}
      <Modal visible={disputeTarget !== null} transparent animationType="fade" onRequestClose={() => setDisputeTarget(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="alert-circle-outline" size={22} color={appTheme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitleSm}>Raise an issue</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {disputeTarget
                    ? `${formatDayLabel(disputeTarget.periodFrom)} – ${formatDayLabel(disputeTarget.periodTo)} · ${disputeTarget.totalHours.toFixed(1)}h`
                    : ""}
                </Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>What's wrong?</Text>
            <TextInput
              style={[styles.externalInput, styles.noteInput]}
              value={disputeNote}
              onChangeText={setDisputeNote}
              placeholder="What's wrong? e.g. missing Saturday shift…"
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
              maxLength={500}
            />
            <Text style={styles.mutedSmall}>Your manager will see this note and can fix your recorded times.</Text>

            <PrimaryButton
              label={disputeMutation.isPending ? "Submitting…" : "Submit"}
              onPress={() => disputeMutation.mutate()}
              disabled={disputeMutation.isPending || disputeNote.trim().length === 0}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setDisputeTarget(null)} disabled={disputeMutation.isPending} />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Request leave */}
      <Modal visible={leaveOpen} transparent animationType="fade" onRequestClose={() => setLeaveOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="airplane-outline" size={22} color={appTheme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitleSm}>Request leave</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {leaveBalance ? `Holiday left: ${leaveBalance.remainingHours.toFixed(0)}h of ${leaveBalance.entitledHours.toFixed(0)}h` : "Sent to your manager for approval"}
                </Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.chipRow}>
              {LEAVE_TYPES.map((t) => {
                const active = leaveType === t;
                return (
                  <Pressable
                    key={t}
                    style={({ pressed }) => [styles.chip, active ? styles.chipActive : null, pressed ? styles.chipPressed : null]}
                    onPress={() => setLeaveType(t)}
                    accessibilityRole="button"
                    accessibilityLabel={`Set the leave type to ${t}`}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>First day</Text>
                <DateTimeField
                  mode="date"
                  value={leaveStart}
                  onChange={(v) => {
                    setLeaveStart(v);
                    setLeaveEnd((e) => (e < v ? v : e));
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Last day</Text>
                <DateTimeField mode="date" value={leaveEnd} onChange={setLeaveEnd} />
              </View>
            </View>
            {leaveEnd < leaveStart ? (
              <Text style={[styles.mutedSmall, { color: appTheme.colors.danger }]}>The last day can't be before the first day.</Text>
            ) : null}

            <Text style={styles.fieldLabel}>Hours per day</Text>
            <TextInput
              style={styles.externalInput}
              value={leaveHours}
              onChangeText={setLeaveHours}
              placeholder={String(leaveBalance?.usualHoursPerDay ?? 8)}
              placeholderTextColor={appTheme.colors.textSubtle}
              keyboardType="decimal-pad"
              maxLength={5}
            />
            {parseHours(leaveHours) === null ? (
              <Text style={[styles.mutedSmall, { color: appTheme.colors.danger }]}>Enter the hours each leave day counts for.</Text>
            ) : null}

            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.externalInput, styles.noteInput]}
              value={leaveNote}
              onChangeText={setLeaveNote}
              placeholder="Anything your manager should know"
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
              maxLength={500}
            />

            <PrimaryButton
              label={requestLeaveMutation.isPending ? "Sending…" : "Send request"}
              onPress={() => requestLeaveMutation.mutate()}
              disabled={requestLeaveMutation.isPending || leaveEnd < leaveStart || parseHours(leaveHours) === null}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setLeaveOpen(false)} disabled={requestLeaveMutation.isPending} />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Past (approved) timesheet periods */}
      <Modal visible={pastOpen} transparent animationType="slide" onRequestClose={() => setPastOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheetCard, { maxHeight: "80%" }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="receipt-outline" size={22} color={appTheme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitleSm}>Past timesheets</Text>
                <Text style={styles.muted}>Periods your manager has approved</Text>
              </View>
              <Pressable onPress={() => setPastOpen(false)} style={styles.editorHeaderBtn} accessibilityRole="button" accessibilityLabel="Close past timesheets">
                <Ionicons name="close" size={22} color={appTheme.colors.text} />
              </Pressable>
            </View>

            {pastReviewsQuery.isLoading ? <LoadingState inline /> : null}
            {pastReviewsQuery.isSuccess && (pastReviewsQuery.data?.length ?? 0) === 0 ? (
              <EmptyState icon="receipt-outline" title="No approved timesheets yet" message="Approved periods will appear here once your manager signs them off." />
            ) : null}

            <ScrollView contentContainerStyle={{ gap: 2 }}>
              {(pastReviewsQuery.data ?? []).map((r) => (
                <View key={r.id} style={styles.sessionRow}>
                  <Text style={[styles.sessionDate, { flex: 1 }]} numberOfLines={1}>
                    {formatDayLabel(r.periodFrom)} – {formatDayLabel(r.periodTo)}
                  </Text>
                  <Text style={styles.sessionHours}>{r.totalHours.toFixed(1)}h</Text>
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
  // Per-person reason/note keyed by person id (userId ?? rotaStaffMemberId).
  assignmentMeta: Record<string, AssignmentMeta>;
};

function emptyDraft(): ShiftDraft {
  return { id: null, shiftDate: formatDateValue(new Date()), shiftTemplateId: "", position: "", notes: "", assigneeUserIds: [], assigneeStaffMemberIds: [], assignmentMeta: {} };
}

export function RotaManageScreen() {
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;
  // Weeks run from the shop's configured start-of-week day (0 = Sunday … 6 = Saturday).
  const weekStartDay = activeShop?.weekStartDay ?? DEFAULT_WEEK_START_DAY;
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [weekStart, setWeekStart] = useState(() => startOfWeekFor(formatDateValue(new Date()), weekStartDay));
  // Re-align the displayed week when the shop (and so its start-of-week day) changes.
  useEffect(() => {
    setWeekStart((current) => startOfWeekFor(current, weekStartDay));
  }, [weekStartDay]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<ShiftDraft>(emptyDraft());
  // Snapshot of the draft as opened, for the discard-changes guard on close.
  const [openedDraftJson, setOpenedDraftJson] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [addExternalOpen, setAddExternalOpen] = useState(false);
  const [extName, setExtName] = useState("");
  const [extPhone, setExtPhone] = useState("+44 ");
  const [extEmail, setExtEmail] = useState("");
  // Person id (userId ?? rotaStaffMemberId) whose reason chip row is expanded — one at a time.
  const [expandedReasonKey, setExpandedReasonKey] = useState<string | null>(null);
  const [selectedAssignee, setSelectedAssignee] = useState<{ assignee: RotaAssignee; shift: RotaShift } | null>(null);
  // Reason/note being edited in the contact sheet for the selected assignee — reset on open.
  const [assigneeMeta, setAssigneeMeta] = useState<AssignmentMeta>({ reason: REGULAR_REASON, note: "" });
  const [recordTarget, setRecordTarget] = useState<{ shift: RotaShift; name: string; memberId?: string | null; userId?: string | null } | null>(null);
  const [recIn, setRecIn] = useState("09:00");
  const [recOut, setRecOut] = useState("17:00");
  // Week layout: by day (default) or by staff. Session-only — resets when the screen remounts.
  const [rotaView, setRotaView] = useState<"day" | "staff">("day");
  // Free-text filter over the week below the toggle — matches assignee names and assignment
  // reasons. Render-side only; never touches mutations or the week-stats chips.
  const [rotaSearch, setRotaSearch] = useState("");
  // Person + date the quick-assign sheet is open for (empty day cells in the by-staff view).
  const [quickAssign, setQuickAssign] = useState<{ name: string; date: string; userId?: string | null; rotaStaffMemberId?: string | null } | null>(null);

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
  // Light timesheet peek for the displayed week — only used to surface forgotten check-outs.
  const weekTimesheetQuery = useQuery({
    queryKey: ["rota-timesheet", shopId, range.from, range.to],
    queryFn: () => getTimesheet(shopId as string, range.from, range.to),
    enabled: Boolean(shopId),
    staleTime: 60_000,
  });
  const weekOpenSessions = useMemo(
    () => (weekTimesheetQuery.data ?? []).reduce((sum, r) => sum + r.openSessions, 0),
    [weekTimesheetQuery.data],
  );

  // Approved leave for the displayed week (one range call, filtered client-side) — drives the
  // day-card "who's off" chips. (The shift editor has its own draft-date query below.) Rota stays
  // fully functional when Leave Management isn't on the plan: the query simply never runs.
  const leaveFeature = useFeature("LeaveManagement");
  const weekLeaveQuery = useQuery({
    queryKey: ["leave", shopId, range.from, range.to],
    queryFn: () => getLeaveRequests(shopId as string, range.from, range.to),
    enabled: Boolean(shopId) && leaveFeature.isAllowed,
    staleTime: 60_000,
  });
  const approvedWeekLeave = useMemo(
    () => (weekLeaveQuery.data ?? []).filter((r) => r.status === "Approved"),
    [weekLeaveQuery.data],
  );
  // Approved leave per displayed day, for the day-card chips.
  const leaveByDate = useMemo(() => {
    const map = new Map<string, LeaveRequest[]>();
    for (const r of approvedWeekLeave) {
      for (const date of weekDays) {
        if (date >= r.startDate && date <= r.endDate) {
          const list = map.get(date) ?? [];
          list.push(r);
          map.set(date, list);
        }
      }
    }
    return map;
  }, [approvedWeekLeave, weekDays]);
  // Approved leave for the editor's draft date specifically — the date field can move
  // draft.shiftDate outside the displayed week, so the editor can't rely on the week query.
  const editorLeaveQuery = useQuery({
    queryKey: ["leave", shopId, draft.shiftDate],
    queryFn: () => getLeaveRequests(shopId as string, draft.shiftDate, draft.shiftDate),
    enabled: Boolean(shopId) && editorOpen && Boolean(draft.shiftDate) && leaveFeature.isAllowed,
    staleTime: 60_000,
  });
  const editorApprovedLeave = useMemo(
    () => (editorLeaveQuery.data ?? []).filter((r) => r.status === "Approved"),
    [editorLeaveQuery.data],
  );
  // Does this person have approved leave covering the draft's date? Backed by the draft-date
  // query above so it stays accurate for any picked date. The server enforces the block too
  // (rota_assignee_on_leave) — this is the friendly front line.
  const personOnLeave = (u: AssignableUser) =>
    editorApprovedLeave.some(
      (r) =>
        draft.shiftDate >= r.startDate &&
        draft.shiftDate <= r.endDate &&
        (u.rotaStaffMemberId ? r.rotaStaffMemberId === u.rotaStaffMemberId : Boolean(u.userId) && r.userId === u.userId),
    );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rota", shopId] });

  const saveMutation = useMutation({
    mutationFn: () => {
      // Authoritative assignment list: each assigned person with their reason/note.
      // "Regular shift" (or blank) reasons are omitted; notes ride along only with a reason.
      const toAssignment = (person: { userId?: string; rotaStaffMemberId?: string }, key: string) => {
        const meta = draft.assignmentMeta[key];
        const reason = meta?.reason.trim() ?? "";
        const note = meta?.note.trim() ?? "";
        const isRegular = !reason || reason === REGULAR_REASON;
        return {
          ...person,
          reason: isRegular ? undefined : reason,
          note: isRegular || !note ? undefined : note,
        };
      };
      const assignments = [
        ...draft.assigneeUserIds.map((id) => toAssignment({ userId: id }, id)),
        ...draft.assigneeStaffMemberIds.map((id) => toAssignment({ rotaStaffMemberId: id }, id)),
      ];
      const payload: SaveRotaShiftPayload = {
        shopId: shopId as string,
        shiftDate: draft.shiftDate,
        shiftTemplateId: draft.shiftTemplateId,
        position: draft.position.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        assigneeUserIds: draft.assigneeUserIds,
        assigneeStaffMemberIds: draft.assigneeStaffMemberIds,
        assignments,
      };
      return draft.id ? updateRotaShift(draft.id, payload) : createRotaShift(payload);
    },
    onSuccess: () => {
      // Jump to the saved shift's week so it's visible after saving.
      setWeekStart(startOfWeekFor(draft.shiftDate, weekStartDay));
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

  // Quick assign from the by-staff view: add one person to a day's template slot without opening
  // the editor. Builds the same payload shape as saveMutation — when the slot's shift already
  // exists, its current assignees ride along unchanged (reasons/notes preserved) with this person
  // appended; otherwise a new shift is created with just this person.
  const quickAssignMutation = useMutation({
    mutationFn: ({ date, template, person }: { date: string; template: RotaShiftTemplate; person: { name: string; userId?: string | null; rotaStaffMemberId?: string | null } }) => {
      const existing = (rotaQuery.data ?? []).find((s) => s.shiftDate === date && s.shiftTemplateId === template.templateId);
      const newAssignment: SaveRotaShiftAssignment = person.userId
        ? { userId: person.userId }
        : { rotaStaffMemberId: person.rotaStaffMemberId as string };
      const assignments: SaveRotaShiftAssignment[] = [
        ...(existing?.assignees ?? []).map((a) => {
          const reason = a.reason ?? undefined;
          return {
            userId: a.userId ?? undefined,
            rotaStaffMemberId: a.rotaStaffMemberId ?? undefined,
            reason,
            // As in saveMutation, a note only rides along with a reason.
            note: reason ? a.note ?? undefined : undefined,
          };
        }),
        newAssignment,
      ];
      const payload: SaveRotaShiftPayload = {
        shopId: shopId as string,
        shiftDate: date,
        shiftTemplateId: template.templateId,
        position: existing?.position ?? undefined,
        notes: existing?.notes ?? undefined,
        assigneeUserIds: assignments.filter((a) => a.userId).map((a) => a.userId as string),
        assigneeStaffMemberIds: assignments.filter((a) => a.rotaStaffMemberId).map((a) => a.rotaStaffMemberId as string),
        assignments,
      };
      return existing ? updateRotaShift(existing.id, payload) : createRotaShift(payload);
    },
    onSuccess: (_shift, vars) => {
      setQuickAssign(null);
      toastSuccess(`${vars.person.name} assigned.`);
      void invalidate();
    },
    // Surface the server message as-is — it carries the on-leave block among other validations.
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't assign."),
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

  const openRecordHours = (shift: RotaShift, assignee: { name: string; rotaStaffMemberId?: string | null; userId?: string | null }) => {
    setRecIn(shortTime(shift.startTime));
    setRecOut(shortTime(shift.endTime));
    setRecordTarget({ shift, name: assignee.name, memberId: assignee.rotaStaffMemberId, userId: assignee.userId });
  };

  const recordHoursMutation = useMutation({
    mutationFn: () => {
      const { checkInAt, checkOutAt } = sessionIsos(recordTarget!.shift.shiftDate, recIn, recOut);
      return saveManualAttendance({
        shopId: shopId as string,
        rotaShiftId: recordTarget!.shift.id,
        // External (roster-only) people are addressed by member id; internal staff by user id.
        rotaStaffMemberId: recordTarget!.memberId ?? undefined,
        userId: recordTarget!.memberId ? undefined : recordTarget!.userId ?? undefined,
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

  // Open the contact sheet for one assignee, seeding the reason/note editor with their
  // current assignment (null reason = regular shift).
  const openAssigneeSheet = (assignee: RotaAssignee, shift: RotaShift) => {
    setAssigneeMeta({ reason: assignee.reason ?? REGULAR_REASON, note: assignee.note ?? "" });
    setSelectedAssignee({ assignee, shift });
  };

  // Rebuild a shift's full save payload from an assignee list — mirrors saveMutation's shape so a
  // per-person edit/removal round-trips everyone else's reason/note untouched.
  const shiftPayloadFrom = (shift: RotaShift, assignees: RotaAssignee[]): SaveRotaShiftPayload => {
    const assignments: SaveRotaShiftAssignment[] = assignees.map((a) => {
      const reason = a.reason ?? undefined;
      return {
        userId: a.userId ?? undefined,
        rotaStaffMemberId: a.rotaStaffMemberId ?? undefined,
        reason,
        // As in saveMutation, a note only rides along with a reason.
        note: reason ? a.note ?? undefined : undefined,
      };
    });
    return {
      shopId: shopId as string,
      shiftDate: shift.shiftDate,
      shiftTemplateId: shift.shiftTemplateId ?? "",
      position: shift.position ?? undefined,
      notes: shift.notes ?? undefined,
      assigneeUserIds: assignments.filter((a) => a.userId).map((a) => a.userId as string),
      assigneeStaffMemberIds: assignments.filter((a) => a.rotaStaffMemberId).map((a) => a.rotaStaffMemberId as string),
      assignments,
    };
  };

  // Sheet reason-editor state, normalized the same way saveMutation does: "Other…" with no text
  // (or "Regular shift") collapses to regular, and a note only counts alongside a reason.
  const sheetReasonIsOther = !ASSIGNMENT_REASONS.includes(assigneeMeta.reason);
  const sheetReasonIsRegular = !sheetReasonIsOther && assigneeMeta.reason === REGULAR_REASON;
  const sheetTrimmedReason = assigneeMeta.reason.trim();
  const sheetEffectiveReason = !sheetTrimmedReason || sheetTrimmedReason === REGULAR_REASON ? REGULAR_REASON : sheetTrimmedReason;
  const sheetEffectiveNote = sheetEffectiveReason === REGULAR_REASON ? "" : assigneeMeta.note.trim();
  const assigneeMetaChanged =
    selectedAssignee !== null &&
    (sheetEffectiveReason !== (selectedAssignee.assignee.reason ?? REGULAR_REASON) ||
      sheetEffectiveNote !== (selectedAssignee.assignee.note ?? ""));

  // Save the sheet person's edited reason/note — only their assignment changes.
  const assigneeReasonMutation = useMutation({
    mutationFn: () => {
      const sel = selectedAssignee!;
      const key = assigneePersonKey(sel.assignee);
      const isRegular = sheetEffectiveReason === REGULAR_REASON;
      const assignees = sel.shift.assignees.map((a) =>
        assigneePersonKey(a) === key
          ? { ...a, reason: isRegular ? null : sheetEffectiveReason, note: isRegular || !sheetEffectiveNote ? null : sheetEffectiveNote }
          : a,
      );
      return updateRotaShift(sel.shift.id, shiftPayloadFrom(sel.shift, assignees));
    },
    onSuccess: () => {
      setSelectedAssignee(null);
      toastSuccess("Reason updated.");
      void invalidate();
    },
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't update the reason."),
  });

  // Take the sheet person off the shift entirely (everyone else rides along unchanged).
  const removeAssigneeMutation = useMutation({
    mutationFn: () => {
      const sel = selectedAssignee!;
      const key = assigneePersonKey(sel.assignee);
      return updateRotaShift(sel.shift.id, shiftPayloadFrom(sel.shift, sel.shift.assignees.filter((a) => assigneePersonKey(a) !== key)));
    },
    onSuccess: () => {
      const name = selectedAssignee?.assignee.name ?? "Person";
      setSelectedAssignee(null);
      toastSuccess(`${name} removed.`);
      void invalidate();
    },
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't remove them from the shift."),
  });

  const confirmRemoveAssignee = async () => {
    const sel = selectedAssignee;
    if (!sel) return;
    const ok = await confirmDestructive({
      title: "Remove from shift",
      message: `Take ${sel.assignee.name} off the ${sel.shift.shiftName || "shift"} shift on ${formatDayLabel(sel.shift.shiftDate)}?`,
      confirmLabel: "Remove",
    });
    if (ok) removeAssigneeMutation.mutate();
  };

  const confirmGenerate = async () => {
    const ok = await confirmDestructive({
      title: "Generate week",
      message: "Add a shift for every configured shift on each day this week, copying last week's staff where set? Existing shifts are kept.",
      confirmLabel: "Generate",
    });
    if (ok) generateMutation.mutate();
  };

  const openAdd = (shiftDate?: string) => {
    const next = { ...emptyDraft(), shiftDate: shiftDate ?? emptyDraft().shiftDate };
    setDraft(next);
    setOpenedDraftJson(JSON.stringify(next));
    setUserSearch("");
    setExpandedReasonKey(null);
    setEditorOpen(true);
  };
  const openEdit = (shift: RotaShift) => {
    const next: ShiftDraft = {
      id: shift.id,
      shiftDate: shift.shiftDate,
      shiftTemplateId: shift.shiftTemplateId ?? "",
      position: shift.position ?? "",
      notes: shift.notes ?? "",
      assigneeUserIds: shift.assignees.filter((a) => a.userId).map((a) => a.userId as string),
      assigneeStaffMemberIds: shift.assignees.filter((a) => a.rotaStaffMemberId).map((a) => a.rotaStaffMemberId as string),
      assignmentMeta: metaFromAssignees(shift.assignees),
    };
    setDraft(next);
    setOpenedDraftJson(JSON.stringify(next));
    setUserSearch("");
    setExpandedReasonKey(null);
    setEditorOpen(true);
  };
  // Closing the editor with unsaved edits asks before discarding them.
  const requestCloseEditor = async () => {
    if (JSON.stringify(draft) !== openedDraftJson) {
      const ok = await confirmDestructive({
        title: "Discard changes",
        message: "You have unsaved changes to this shift. Discard them?",
        confirmLabel: "Discard",
      });
      if (!ok) return;
    }
    setEditorOpen(false);
  };
  const deleteFromEditor = async () => {
    if (!draft.id) return;
    const ok = await confirmDestructive({
      title: "Delete shift",
      message: "Remove this shift and its staff assignments from the rota?",
    });
    if (ok) {
      setEditorOpen(false);
      deleteMutation.mutate(draft.id);
    }
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
      assignmentMeta: existing ? metaFromAssignees(existing.assignees) : {},
    }));
    setExpandedReasonKey(null);
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

  // Reason/note metadata for an assigned person — keyed by userId ?? rotaStaffMemberId,
  // defaulting to a regular shift when nothing has been set.
  const metaKeyOf = (u: AssignableUser) => (u.userId ?? u.rotaStaffMemberId ?? u.name) as string;
  const metaFor = (key: string): AssignmentMeta => draft.assignmentMeta[key] ?? { reason: REGULAR_REASON, note: "" };
  const setMetaFor = (key: string, patch: Partial<AssignmentMeta>) =>
    setDraft((d) => ({
      ...d,
      assignmentMeta: {
        ...d.assignmentMeta,
        [key]: { ...(d.assignmentMeta[key] ?? { reason: REGULAR_REASON, note: "" }), ...patch },
      },
    }));

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

  // By-staff view rows: every assignable person (incl. externals) plus anyone on the week's
  // shifts who isn't in that list, with their shifts keyed by date and planned weekly hours.
  // People with shifts come first (by name), then everyone else (by name).
  const staffWeekRows = useMemo(() => {
    type StaffWeekRow = {
      key: string;
      name: string;
      userId?: string | null;
      rotaStaffMemberId?: string | null;
      isExternal?: boolean;
      role?: string;
      shiftsByDate: Map<string, RotaShift[]>;
      totalHours: number;
    };
    const rows = new Map<string, StaffWeekRow>();
    for (const u of usersQuery.data ?? []) {
      const key = u.userId ?? u.rotaStaffMemberId ?? u.name;
      rows.set(key, { key, name: u.name, userId: u.userId, rotaStaffMemberId: u.rotaStaffMemberId, isExternal: u.isExternal, role: u.role, shiftsByDate: new Map(), totalHours: 0 });
    }
    for (const s of rotaQuery.data ?? []) {
      for (const a of s.assignees) {
        const key = a.userId ?? a.rotaStaffMemberId ?? a.name;
        let row = rows.get(key);
        if (!row) {
          row = { key, name: a.name, userId: a.userId, rotaStaffMemberId: a.rotaStaffMemberId, isExternal: a.isExternal, shiftsByDate: new Map(), totalHours: 0 };
          rows.set(key, row);
        }
        const list = row.shiftsByDate.get(s.shiftDate) ?? [];
        list.push(s);
        row.shiftsByDate.set(s.shiftDate, list);
        row.totalHours += plannedHours(s.startTime, s.endTime);
      }
    }
    const all = [...rows.values()];
    for (const row of all) {
      for (const list of row.shiftsByDate.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    all.sort((a, b) => {
      const aHas = a.shiftsByDate.size > 0;
      const bHas = b.shiftsByDate.size > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return all;
  }, [usersQuery.data, rotaQuery.data]);

  // Approved leave covering this person on this date (by-staff day cells; same week data
  // that drives the day-card leave chips).
  const staffLeaveOn = (row: { userId?: string | null; rotaStaffMemberId?: string | null }, date: string) =>
    approvedWeekLeave.some(
      (r) =>
        date >= r.startDate &&
        date <= r.endDate &&
        (row.rotaStaffMemberId ? r.rotaStaffMemberId === row.rotaStaffMemberId : Boolean(row.userId) && r.userId === row.userId),
    );

  // Free-text week filter (case-insensitive substring). rotaQRaw keeps the typed casing for the
  // "No matches" message; rotaQ drives the matching below.
  const rotaQRaw = rotaSearch.trim();
  const rotaQ = rotaQRaw.toLowerCase();

  // By-day while searching: each date keeps only shifts with ≥1 assignee whose name or
  // assignment reason matches; dates left with no matching shifts drop out of the map.
  const filteredShiftsByDate = useMemo(() => {
    if (!rotaQ) return shiftsByDate;
    const matches = (a: RotaAssignee) => a.name.toLowerCase().includes(rotaQ) || (a.reason ?? "").toLowerCase().includes(rotaQ);
    const map = new Map<string, RotaShift[]>();
    for (const [date, list] of shiftsByDate) {
      const matching = list.filter((s) => s.assignees.some(matches));
      if (matching.length > 0) map.set(date, matching);
    }
    return map;
  }, [shiftsByDate, rotaQ]);

  // By-day while searching: leave chips reduced to people whose name matches.
  const filteredLeaveByDate = useMemo(() => {
    if (!rotaQ) return leaveByDate;
    const map = new Map<string, LeaveRequest[]>();
    for (const [date, list] of leaveByDate) {
      const matching = list.filter((r) => r.userName.toLowerCase().includes(rotaQ));
      if (matching.length > 0) map.set(date, matching);
    }
    return map;
  }, [leaveByDate, rotaQ]);

  // Day cards to render: all seven when not searching, otherwise only days with a matching
  // shift or a matching person on leave.
  const visibleWeekDays = useMemo(() => {
    if (!rotaQ) return weekDays;
    return weekDays.filter(
      (date) => (filteredShiftsByDate.get(date)?.length ?? 0) > 0 || (filteredLeaveByDate.get(date)?.length ?? 0) > 0,
    );
  }, [weekDays, rotaQ, filteredShiftsByDate, filteredLeaveByDate]);

  // By-staff while searching: person cards whose name matches, or with any assignment this week
  // whose reason matches. Card content itself stays unfiltered (all seven day rows).
  const visibleStaffRows = useMemo(() => {
    if (!rotaQ) return staffWeekRows;
    return staffWeekRows.filter((row) => {
      if (row.name.toLowerCase().includes(rotaQ)) return true;
      for (const list of row.shiftsByDate.values()) {
        for (const s of list) {
          const mine = s.assignees.find((a) => assigneePersonKey(a) === row.key);
          if (mine?.reason && mine.reason.toLowerCase().includes(rotaQ)) return true;
        }
      }
      return false;
    });
  }, [staffWeekRows, rotaQ]);

  // The day's shift templates for the quick-assign sheet, ordered by start time.
  const sortedTemplates = useMemo(
    () => [...(templatesQuery.data ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [templatesQuery.data],
  );

  const todayStr = formatDateValue(new Date());
  const weekLabel = `${dayOfMonth(weekStart)} – ${dayOfMonth(addDaysStr(weekStart, 6))}`;
  const canSave = draft.shiftTemplateId.length > 0 && !saveMutation.isPending;

  // Week-at-a-glance counts for the header: total shifts and how many still have no one assigned.
  const weekShiftCount = rotaQuery.data?.length ?? 0;
  const unstaffedCount = useMemo(
    () => (rotaQuery.data ?? []).filter((s) => s.assignees.length === 0).length,
    [rotaQuery.data],
  );

  // Another shift on the same day whose time window overlaps the one being edited. Allowed (for
  // different staff) — the hint just reminds the manager each shift needs its own till.
  const overlapShift = useMemo(() => {
    const selected = (templatesQuery.data ?? []).find((t) => t.templateId === draft.shiftTemplateId);
    if (!selected) return null;
    const toMin = (hhmm?: string | null) => {
      const [h, m] = (hhmm ?? "").split(":");
      return (Number(h) || 0) * 60 + (Number(m) || 0);
    };
    const overlaps = (aS: number, aE: number, bS: number, bE: number) => {
      if (aE <= aS) aE += 1440;
      if (bE <= bS) bE += 1440;
      return aS < bE && bS < aE;
    };
    const aS = toMin(selected.startTime), aE = toMin(selected.endTime);
    return (rotaQuery.data ?? []).find((s) =>
      s.shiftDate === draft.shiftDate &&
      s.shiftTemplateId !== draft.shiftTemplateId &&
      overlaps(aS, aE, toMin(s.startTime), toMin(s.endTime)),
    ) ?? null;
  }, [templatesQuery.data, rotaQuery.data, draft.shiftDate, draft.shiftTemplateId]);

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl
          refreshing={rotaQuery.isRefetching}
          onRefresh={() => void rotaQuery.refetch()}
          tintColor={appTheme.colors.primary}
          colors={[appTheme.colors.primary]}
        />
      }
    >
      {/* Week navigator */}
      <View style={[ui.card, styles.weekNav]}>
        <View style={styles.weekNavRow}>
          <Pressable
            style={({ pressed }) => [styles.weekNavBtn, pressed ? styles.weekNavBtnPressed : null]}
            onPress={() => setWeekStart((w) => addDaysStr(w, -7))}
            accessibilityRole="button"
            accessibilityLabel="Previous week"
          >
            <Ionicons name="chevron-back" size={20} color={appTheme.colors.primary} />
          </Pressable>
          <Pressable style={{ flex: 1, alignItems: "center" }} onPress={() => setWeekStart(startOfWeekFor(todayStr, weekStartDay))}>
            <Text style={styles.weekNavLabel}>{weekLabel}</Text>
            <Text style={styles.weekNavHint}>{weekStart === startOfWeekFor(todayStr, weekStartDay) ? "This week" : "Tap for this week"}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.weekNavBtn, pressed ? styles.weekNavBtnPressed : null]}
            onPress={() => setWeekStart((w) => addDaysStr(w, 7))}
            accessibilityRole="button"
            accessibilityLabel="Next week"
          >
            <Ionicons name="chevron-forward" size={20} color={appTheme.colors.primary} />
          </Pressable>
        </View>

        {/* Week at a glance — shift count plus a staffing-gap warning the manager can act on. */}
        {!rotaQuery.isLoading ? (
          <View style={styles.weekStatsRow}>
            <View style={styles.weekStatChip}>
              <Ionicons name="layers-outline" size={13} color={appTheme.colors.textMuted} />
              <Text style={styles.weekStatText}>
                {weekShiftCount} shift{weekShiftCount === 1 ? "" : "s"}
              </Text>
            </View>
            {unstaffedCount > 0 ? (
              <View style={[styles.weekStatChip, styles.weekStatChipWarning]}>
                <Ionicons name="alert-circle-outline" size={13} color={appTheme.colors.warning} />
                <Text style={[styles.weekStatText, styles.weekStatTextWarning]}>
                  {unstaffedCount} need{unstaffedCount === 1 ? "s" : ""} staff
                </Text>
              </View>
            ) : weekShiftCount > 0 ? (
              <View style={[styles.weekStatChip, styles.weekStatChipSuccess]}>
                <Ionicons name="checkmark-circle-outline" size={13} color={appTheme.colors.success} />
                <Text style={[styles.weekStatText, styles.weekStatTextSuccess]}>Fully staffed</Text>
              </View>
            ) : null}
            {weekOpenSessions > 0 ? (
              <View style={[styles.weekStatChip, styles.weekStatChipWarning]}>
                <Ionicons name="alert-circle-outline" size={13} color={appTheme.colors.warning} />
                <Text style={[styles.weekStatText, styles.weekStatTextWarning]}>
                  {weekOpenSessions} open session{weekOpenSessions === 1 ? "" : "s"}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <PrimaryButton
        label={generateMutation.isPending ? "Generating…" : "Auto-generate this week"}
        icon="sparkles-outline"
        onPress={() => void confirmGenerate()}
        disabled={!shopId || generateMutation.isPending}
      />

      {/* View toggle for the week below — by day (default) or by staff. */}
      <View style={styles.segment}>
        {(["day", "staff"] as const).map((v) => {
          const active = rotaView === v;
          return (
            <Pressable
              key={v}
              style={({ pressed }) => [styles.segmentBtn, active ? styles.segmentBtnActive : null, pressed && !active ? styles.chipPressed : null]}
              onPress={() => setRotaView(v)}
              accessibilityRole="button"
              accessibilityLabel={v === "day" ? "Show the week by day" : "Show the week by staff"}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>{v === "day" ? "By day" : "By staff"}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Free-text filter for the week below — names and assignment reasons. */}
      <View style={[styles.searchBox, styles.rotaSearchBox]}>
        <Ionicons name="search-outline" size={16} color={appTheme.colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={rotaSearch}
          onChangeText={setRotaSearch}
          placeholder="Search staff or reason"
          placeholderTextColor={appTheme.colors.textSubtle}
        />
        {rotaSearch.length > 0 ? (
          <Pressable
            style={({ pressed }) => (pressed ? styles.searchClearPressed : null)}
            onPress={() => setRotaSearch("")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={16} color={appTheme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {rotaQuery.isLoading ? <SkeletonList count={5} /> : null}

      {/* One row per weekday, Mon–Sun, with its shifts + assigned users. */}
      {rotaView === "day" && rotaQ.length > 0 && visibleWeekDays.length === 0 ? (
        <View style={ui.card}>
          <EmptyState icon="search-outline" title="No matches" message={`No staff or reasons match "${rotaQRaw}" this week.`} />
        </View>
      ) : null}
      {rotaView === "day" ? visibleWeekDays.map((date) => {
        const shifts = filteredShiftsByDate.get(date) ?? [];
        const isToday = date === todayStr;
        return (
          <View key={date} style={[ui.card, styles.dayCard, isToday ? styles.dayCardToday : null]}>
            <View style={styles.dayCardHead}>
              <View style={styles.dayCardHeadLeft}>
                <View>
                  <Text style={[styles.dayName, isToday ? styles.dayNameToday : null]}>{weekday(date)}</Text>
                  <Text style={styles.dayDate}>{dayOfMonth(date)}</Text>
                </View>
                {isToday ? (
                  <View style={styles.todayPill}>
                    <Text style={styles.todayPillText}>Today</Text>
                  </View>
                ) : null}
              </View>
              <Pressable
                style={({ pressed }) => [styles.dayAddBtn, pressed ? styles.dayAddBtnPressed : null]}
                onPress={() => openAdd(date)}
                disabled={!shopId}
                accessibilityRole="button"
                accessibilityLabel={`Add shift on ${weekday(date)}`}
              >
                <Ionicons name="add" size={18} color={appTheme.colors.primary} />
              </Pressable>
            </View>

            {/* Who's on approved leave this day (Leave Management feature) */}
            {(filteredLeaveByDate.get(date)?.length ?? 0) > 0 ? (
              <View style={styles.leaveChipRow}>
                {(filteredLeaveByDate.get(date) ?? []).map((r) => (
                  <View key={r.id} style={styles.leaveChip}>
                    <Text style={styles.leaveChipText} numberOfLines={1}>🏖 {r.userName} · {r.type}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {shifts.length === 0 ? (
              // While searching, a shift-less card is leave-only — skip the add prompt.
              rotaQ ? null : (
                <Pressable
                  style={({ pressed }) => [styles.dayEmptyAdd, pressed ? styles.dayEmptyAddPressed : null]}
                  onPress={() => openAdd(date)}
                  disabled={!shopId}
                  accessibilityRole="button"
                  accessibilityLabel={`Add a shift on ${weekday(date)}`}
                >
                  <Ionicons name="add-circle-outline" size={16} color={appTheme.colors.textSubtle} />
                  <Text style={styles.dayEmptyAddText}>No shifts — tap to add</Text>
                </Pressable>
              )
            ) : (
              <View style={styles.rotaTable}>
                {shifts.map((shift, shiftIdx) => {
                  const unstaffed = shift.assignees.length === 0;
                  return (
                    <Pressable
                      key={shift.id}
                      style={({ pressed }) => [
                        styles.rotaShiftBlock,
                        unstaffed ? styles.rotaShiftBlockUnstaffed : null,
                        pressed ? styles.rotaShiftBlockPressed : null,
                      ]}
                      onPress={() => openEdit(shift)}
                    >
                      <View style={styles.rotaShiftTopRow}>
                        <Text style={[styles.weekShiftTitle, styles.rotaShiftName]} numberOfLines={1}>{shift.shiftName || "Shift"}</Text>
                        <Text style={[styles.tdSub, styles.rotaShiftTime]} numberOfLines={1}>{timeRange(shift.startTime, shift.endTime)}{overnightSuffix(shift.shiftDate, shift.endDate)}</Text>
                        {!unstaffed ? (
                          <Pressable
                            style={({ pressed }) => [styles.rotaShiftIconBtn, pressed ? styles.rotaShiftIconPressed : null]}
                            onPress={() => openEdit(shift)}
                            hitSlop={4}
                            accessibilityRole="button"
                            accessibilityLabel={`Assign staff to ${shift.shiftName || "Shift"} on ${dayLabel(date)}`}
                          >
                            <Ionicons name="person-add-outline" size={19} color={appTheme.colors.primary} />
                          </Pressable>
                        ) : null}
                        {/* <Pressable
                          style={({ pressed }) => (pressed ? styles.rotaShiftIconPressed : null)}
                          onPress={() => openEdit(shift)}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel="Edit shift"
                        >
                          <Ionicons name="create-outline" size={16} color={appTheme.colors.primary} />
                        </Pressable> */}
                        <Pressable
                          style={({ pressed }) => [styles.rotaShiftIconBtn, pressed ? styles.rotaShiftIconPressed : null]}
                          onPress={() => confirmDelete(shift)}
                          hitSlop={4}
                          accessibilityRole="button"
                          accessibilityLabel="Delete shift"
                        >
                          <Ionicons name="trash-outline" size={19} color={appTheme.colors.danger} />
                        </Pressable>
                      </View>
                      {shift.assignees.length > 0 ? (
                        <View style={styles.rotaAssigneeList}>
                          {shift.assignees.map((a) => (
                            <Pressable
                              key={a.rotaStaffMemberId ?? a.userId ?? a.name}
                              onPress={() => openAssigneeSheet(a, shift)}
                              hitSlop={4}
                            >
                              <View style={styles.rotaStaffLine}>
                                <Text style={[styles.rotaStaffText, styles.tdLink]} numberOfLines={1}>{a.name}</Text>
                                {a.reason ? (
                                  <View style={styles.reasonTag}>
                                    <Text style={styles.reasonTagText} numberOfLines={1}>{a.reason}</Text>
                                  </View>
                                ) : null}
                              </View>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                      {/* Loud assign call-to-action only where it's needed — unstaffed shifts.
                          Staffed shifts get the quiet person-add icon in the top row instead. */}
                      {unstaffed ? (
                        <Pressable
                          style={({ pressed }) => [
                            styles.assignPill,
                            styles.assignPillUnstaffed,
                            pressed ? styles.assignPillPressed : null,
                          ]}
                          onPress={() => openEdit(shift)}
                          hitSlop={4}
                          accessibilityRole="button"
                          accessibilityLabel={`Assign staff to ${shift.shiftName || "Shift"} on ${dayLabel(date)}`}
                        >
                          <Ionicons name="person-add-outline" size={13} color={appTheme.colors.textWarningStrong} />
                          <Text style={[styles.assignPillText, styles.assignPillTextUnstaffed]}>Assign staff</Text>
                        </Pressable>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      }) : null}

      {/* One card per person with their week strip — assignable people plus anyone rostered. */}
      {rotaView === "staff" && !rotaQuery.isLoading ? (
        <>
          {usersQuery.isLoading ? <SkeletonList count={4} /> : null}
          {!usersQuery.isLoading && staffWeekRows.length === 0 ? (
            <View style={ui.card}>
              <EmptyState icon="people-outline" title="No staff to show" message="Add staff or assign people to shifts to see them here." />
            </View>
          ) : null}
          {!usersQuery.isLoading && staffWeekRows.length > 0 && rotaQ.length > 0 && visibleStaffRows.length === 0 ? (
            <View style={ui.card}>
              <EmptyState icon="search-outline" title="No matches" message={`No staff or reasons match "${rotaQRaw}" this week.`} />
            </View>
          ) : null}
          {visibleStaffRows.map((row) => {
            const zeroHours = row.totalHours === 0;
            return (
              <View key={row.key} style={[ui.card, styles.staffWeekCard]}>
                <View style={styles.staffWeekHead}>
                  <View style={[styles.userAvatar, !zeroHours ? styles.userAvatarOn : null]}>
                    <Text style={styles.userAvatarText}>{initials(row.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName} numberOfLines={1}>{row.name}</Text>
                    {row.isExternal || row.role ? (
                      <Text style={styles.mutedSmall} numberOfLines={1}>{row.isExternal ? "External" : row.role}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.staffWeekTotal, zeroHours ? styles.staffWeekTotalZero : null]}>
                    {leaveHoursLabel(row.totalHours)}
                  </Text>
                </View>
                <View>
                  {weekDays.map((date, dayIdx) => {
                    const dayShifts = row.shiftsByDate.get(date) ?? [];
                    const onLeave = dayShifts.length === 0 && staffLeaveOn(row, date);
                    const isToday = date === todayStr;
                    return (
                      <View key={date} style={[styles.staffDayRow, dayIdx > 0 ? styles.staffDayRowDivider : null]}>
                        <Text style={[styles.staffDayLabel, isToday ? styles.staffDayLabelToday : null]}>
                          {weekday(date)} {dayOfMonth(date)}
                        </Text>
                        {dayShifts.length > 0 ? (
                          <View style={styles.staffDayShifts}>
                            {dayShifts.map((shift) => (
                              <Pressable
                                key={shift.id}
                                style={({ pressed }) => [styles.staffDayShift, pressed ? styles.staffDayShiftPressed : null]}
                                onPress={() => openEdit(shift)}
                                accessibilityRole="button"
                                accessibilityLabel={`Edit ${row.name}'s ${shift.shiftName || "shift"} shift on ${formatDayLabel(date)}`}
                              >
                                <Text style={styles.staffDayShiftName} numberOfLines={1}>
                                  {shift.shiftName || "Shift"}
                                  <Text style={styles.staffDayShiftTime}> {shortTime(shift.startTime)}–{shortTime(shift.endTime)}</Text>
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        ) : onLeave ? (
                          <View style={styles.staffDayLeave} accessible accessibilityLabel={`${row.name} is on approved leave on ${formatDayLabel(date)}`}>
                            <Ionicons name="airplane-outline" size={13} color={appTheme.colors.textInfoStrong} />
                            <Text style={styles.staffDayLeaveText}>On leave</Text>
                          </View>
                        ) : (
                          <Pressable
                            style={({ pressed }) => [styles.staffDayEmpty, pressed ? styles.dayEmptyAddPressed : null]}
                            onPress={() => setQuickAssign({ name: row.name, date, userId: row.userId, rotaStaffMemberId: row.rotaStaffMemberId })}
                            disabled={!shopId}
                            accessibilityRole="button"
                            accessibilityLabel={`Assign ${row.name} on ${formatDayLabel(date)}`}
                          >
                            <Ionicons name="add" size={13} color={appTheme.colors.textSubtle} />
                            <Text style={styles.staffDayEmptyText}>Assign</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </>
      ) : null}

      <Modal visible={editorOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => void requestCloseEditor()}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.editorScreen, { paddingTop: insets.top }]}>
          <View style={styles.editorHeader}>
            <Pressable style={styles.editorHeaderBtn} onPress={() => void requestCloseEditor()} accessibilityRole="button" accessibilityLabel="Close">
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
                {saveMutation.isPending ? "Saving…" : "Save"}
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
                    style={({ pressed }) => [styles.chip, active ? styles.chipActive : null, pressed ? styles.chipPressed : null]}
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
            {(templatesQuery.data?.length ?? 0) > 0 && !draft.shiftTemplateId ? (
              <Text style={styles.mutedSmall}>Select a shift time to continue.</Text>
            ) : null}

            {overlapShift ? (
              <View style={styles.overlapHint}>
                <Ionicons name="information-circle-outline" size={16} color={appTheme.colors.primary} />
                <Text style={styles.overlapHintText}>
                  Overlaps the {overlapShift.shiftName} shift ({timeRange(overlapShift.startTime, overlapShift.endTime)}). That's fine for a different staff member — just give each overlapping shift its own till when reconciling.
                </Text>
              </View>
            ) : null}

            {/* Staff search */}
            <Text style={[styles.fieldLabel, { marginTop: appTheme.spacing.xs }]}>Staff</Text>
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
                    assigned.map((u) => {
                      const metaKey = metaKeyOf(u);
                      const meta = metaFor(metaKey);
                      const reasonExpanded = expandedReasonKey === metaKey;
                      // Anything outside the presets is a free-text "Other…" reason.
                      const isOtherReason = !ASSIGNMENT_REASONS.includes(meta.reason);
                      const isRegular = !isOtherReason && meta.reason === REGULAR_REASON;
                      return (
                        <View key={keyOf(u)}>
                          <Pressable
                            style={({ pressed }) => [styles.userRow, pressed ? styles.userRowPressed : null]}
                            onPress={() => toggleAssignee(u)}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${u.name} from this shift`}
                          >
                            <View style={[styles.userAvatar, styles.userAvatarOn]}>
                              <Text style={styles.userAvatarText}>{initials(u.name)}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={styles.userNameRow}>
                                <Text style={styles.userName} numberOfLines={1}>{u.name}</Text>
                                {personOnLeave(u) ? (
                                  <View style={styles.onLeaveTag}>
                                    <Ionicons name="airplane-outline" size={11} color={appTheme.colors.textWarningStrong} />
                                    <Text style={styles.onLeaveTagText}>On leave</Text>
                                  </View>
                                ) : null}
                              </View>
                              <Text style={styles.muted}>{u.isExternal ? "External" : u.role}</Text>
                              <Pressable
                                style={({ pressed }) => [styles.reasonChip, !isRegular ? styles.reasonChipInfo : null, pressed ? styles.userRowPressed : null]}
                                onPress={() => setExpandedReasonKey(reasonExpanded ? null : metaKey)}
                                accessibilityRole="button"
                                accessibilityLabel={`Change ${u.name}'s assignment reason, currently ${meta.reason.trim() || REGULAR_REASON}`}
                              >
                                <Ionicons name="pricetag-outline" size={11} color={isRegular ? appTheme.colors.textMuted : appTheme.colors.textInfoStrong} />
                                <Text style={[styles.reasonChipText, !isRegular ? styles.reasonChipTextInfo : null]} numberOfLines={1}>{meta.reason.trim() || "Other…"}</Text>
                                <Ionicons name={reasonExpanded ? "chevron-up" : "chevron-down"} size={11} color={isRegular ? appTheme.colors.textMuted : appTheme.colors.textInfoStrong} />
                              </Pressable>
                            </View>
                            <Ionicons name="checkmark-circle" size={24} color={appTheme.colors.success} />
                          </Pressable>
                          {reasonExpanded ? (
                            <View style={styles.reasonBox}>
                              <View style={styles.reasonPickRow}>
                                {ASSIGNMENT_REASONS.map((r) => {
                                  const active = !isOtherReason && meta.reason === r;
                                  return (
                                    <Pressable
                                      key={r}
                                      style={({ pressed }) => [styles.reasonPickChip, active ? styles.reasonPickChipActive : null, pressed ? styles.chipPressed : null]}
                                      onPress={() => setMetaFor(metaKey, { reason: r })}
                                      accessibilityRole="button"
                                      accessibilityLabel={`Set ${u.name}'s reason to ${r}`}
                                    >
                                      <Text style={[styles.reasonPickText, active ? styles.reasonPickTextActive : null]}>{r}</Text>
                                    </Pressable>
                                  );
                                })}
                                <Pressable
                                  style={({ pressed }) => [styles.reasonPickChip, isOtherReason ? styles.reasonPickChipActive : null, pressed ? styles.chipPressed : null]}
                                  onPress={() => { if (!isOtherReason) setMetaFor(metaKey, { reason: "" }); }}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Set a custom reason for ${u.name}`}
                                >
                                  <Text style={[styles.reasonPickText, isOtherReason ? styles.reasonPickTextActive : null]}>Other…</Text>
                                </Pressable>
                              </View>
                              {isOtherReason ? (
                                <TextInput
                                  style={[styles.externalInput, styles.reasonInput]}
                                  value={meta.reason}
                                  onChangeText={(v) => setMetaFor(metaKey, { reason: v })}
                                  placeholder="Reason"
                                  placeholderTextColor={appTheme.colors.textSubtle}
                                  maxLength={100}
                                />
                              ) : null}
                              {!isRegular ? (
                                <TextInput
                                  style={[styles.externalInput, styles.reasonInput]}
                                  value={meta.note}
                                  onChangeText={(v) => setMetaFor(metaKey, { note: v })}
                                  placeholder="Note (optional)"
                                  placeholderTextColor={appTheme.colors.textSubtle}
                                  maxLength={300}
                                />
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      );
                    })
                  )}

                  <Text style={[styles.fieldLabel, { marginTop: appTheme.spacing.sm }]}>Available ({available.length})</Text>
                  {available.length === 0 ? (
                    <Text style={styles.muted}>
                      {q ? "No staff match your search." : "Everyone available is already assigned."}
                    </Text>
                  ) : null}
                  {available.map((u) => {
                    // Approved leave on the draft's date blocks assigning — the row is muted,
                    // the add icon becomes the leave tag, and tapping explains instead of adding.
                    const onLeave = personOnLeave(u);
                    return (
                      <Pressable
                        key={keyOf(u)}
                        style={({ pressed }) => [styles.userRow, onLeave ? styles.userRowOnLeave : null, pressed && !onLeave ? styles.userRowPressed : null]}
                        onPress={() => {
                          if (onLeave) {
                            toastError(`${u.name} is on approved leave that day.`);
                            return;
                          }
                          toggleAssignee(u);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={onLeave ? `${u.name} is on approved leave that day` : `Assign ${u.name} to this shift`}
                      >
                        <View style={styles.userAvatar}>
                          <Text style={styles.userAvatarText}>{initials(u.name)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.userNameRow}>
                            <Text style={styles.userName} numberOfLines={1}>{u.name}</Text>
                          </View>
                          <Text style={styles.muted}>{u.isExternal ? "External" : u.role}</Text>
                        </View>
                        {onLeave ? (
                          <View style={styles.onLeaveTag}>
                            <Ionicons name="airplane-outline" size={11} color={appTheme.colors.textWarningStrong} />
                            <Text style={styles.onLeaveTagText}>On leave</Text>
                          </View>
                        ) : (
                          <Ionicons name="add-circle-outline" size={24} color={appTheme.colors.primary} />
                        )}
                      </Pressable>
                    );
                  })}

                  {/* Add someone who isn't an Ops Arrow user (external / casual). */}
                  <Pressable
                    style={({ pressed }) => [styles.addExternalOpenBtn, pressed ? styles.userRowPressed : null]}
                    onPress={() => setAddExternalOpen(true)}
                    accessibilityRole="button"
                  >
                    <Ionicons name="person-add-outline" size={16} color={appTheme.colors.primary} />
                    <Text style={styles.adjustBtnText}>Add external person</Text>
                  </Pressable>

                  {draft.id ? (
                    <Pressable
                      style={({ pressed }) => [styles.editorDeleteBtn, pressed ? styles.userRowPressed : null]}
                      onPress={() => void deleteFromEditor()}
                      disabled={deleteMutation.isPending}
                      accessibilityRole="button"
                      accessibilityLabel="Delete this shift"
                    >
                      <Ionicons name="trash-outline" size={16} color={appTheme.colors.danger} />
                      <Text style={styles.editorDeleteText}>Delete this shift</Text>
                    </Pressable>
                  ) : null}
                </>
              );
            })()}
          </ScrollView>

          {/* Always-visible save bar so the action is never missed at the bottom of a long form. */}
          <View style={[styles.editorFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <PrimaryButton
              label={saveMutation.isPending ? "Saving…" : draft.id ? "Save changes" : "Add shift"}
              onPress={() => saveMutation.mutate()}
              disabled={!canSave}
            />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Staff contact details — tap a name on the rota to call/email them, change their
          assignment reason, or take them off the shift. */}
      <Modal visible={selectedAssignee !== null} transparent animationType="fade" onRequestClose={() => setSelectedAssignee(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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

            {/* Per-person assignment reason — the same chips + "Other…" control as the shift editor. */}
            <Text style={styles.fieldLabel}>Reason</Text>
            <View style={styles.reasonPickRow}>
              {ASSIGNMENT_REASONS.map((r) => {
                const active = !sheetReasonIsOther && assigneeMeta.reason === r;
                return (
                  <Pressable
                    key={r}
                    style={({ pressed }) => [styles.reasonPickChip, active ? styles.reasonPickChipActive : null, pressed ? styles.chipPressed : null]}
                    onPress={() => setAssigneeMeta((m) => ({ ...m, reason: r }))}
                    accessibilityRole="button"
                    accessibilityLabel={`Set ${selectedAssignee?.assignee.name ?? "this person"}'s reason to ${r}`}
                  >
                    <Text style={[styles.reasonPickText, active ? styles.reasonPickTextActive : null]}>{r}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                style={({ pressed }) => [styles.reasonPickChip, sheetReasonIsOther ? styles.reasonPickChipActive : null, pressed ? styles.chipPressed : null]}
                onPress={() => { if (!sheetReasonIsOther) setAssigneeMeta((m) => ({ ...m, reason: "" })); }}
                accessibilityRole="button"
                accessibilityLabel={`Set a custom reason for ${selectedAssignee?.assignee.name ?? "this person"}`}
              >
                <Text style={[styles.reasonPickText, sheetReasonIsOther ? styles.reasonPickTextActive : null]}>Other…</Text>
              </Pressable>
            </View>
            {sheetReasonIsOther ? (
              <TextInput
                style={[styles.externalInput, styles.reasonInput]}
                value={assigneeMeta.reason}
                onChangeText={(v) => setAssigneeMeta((m) => ({ ...m, reason: v }))}
                placeholder="Reason"
                placeholderTextColor={appTheme.colors.textSubtle}
                maxLength={100}
              />
            ) : null}
            {!sheetReasonIsRegular ? (
              <TextInput
                style={[styles.externalInput, styles.reasonInput]}
                value={assigneeMeta.note}
                onChangeText={(v) => setAssigneeMeta((m) => ({ ...m, note: v }))}
                placeholder="Note (optional)"
                placeholderTextColor={appTheme.colors.textSubtle}
                maxLength={300}
              />
            ) : null}
            <PrimaryButton
              label={assigneeReasonMutation.isPending ? "Saving…" : "Save reason"}
              onPress={() => assigneeReasonMutation.mutate()}
              disabled={!assigneeMetaChanged || assigneeReasonMutation.isPending || removeAssigneeMutation.isPending}
            />

            <PrimaryButton
              label="Record hours"
              onPress={() => {
                const sel = selectedAssignee;
                setSelectedAssignee(null);
                if (sel) openRecordHours(sel.shift, sel.assignee);
              }}
            />
            <Pressable
              style={({ pressed }) => [styles.editorDeleteBtn, pressed ? styles.userRowPressed : null]}
              onPress={() => void confirmRemoveAssignee()}
              disabled={removeAssigneeMutation.isPending || assigneeReasonMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${selectedAssignee?.assignee.name ?? "this person"} from this shift`}
            >
              <Ionicons name="person-remove-outline" size={16} color={appTheme.colors.danger} />
              <Text style={styles.editorDeleteText}>{removeAssigneeMutation.isPending ? "Removing…" : "Remove from this shift"}</Text>
            </Pressable>
            <PrimaryButton label="Close" tone="neutral" onPress={() => setSelectedAssignee(null)} />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add an external (roster-only) person — name required, phone & email optional. */}
      <Modal visible={addExternalOpen} transparent animationType="fade" onRequestClose={() => setAddExternalOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
              label={addExternalMutation.isPending ? "Adding…" : "Add & assign"}
              onPress={() => addExternalMutation.mutate()}
              disabled={!extName.trim() || addExternalMutation.isPending}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setAddExternalOpen(false)} disabled={addExternalMutation.isPending} />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Record hours for an assignee — external (roster-only) people or internal staff */}
      <Modal visible={recordTarget !== null} transparent animationType="fade" onRequestClose={() => setRecordTarget(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <Text style={styles.modalTitleSm}>Record hours</Text>
            <Text style={styles.muted} numberOfLines={1}>
              {recordTarget?.name} · {recordTarget ? `${recordTarget.shift.shiftName || "Shift"} · ${dayLabel(recordTarget.shift.shiftDate)}` : ""}
            </Text>
            {recordTarget && !recordTarget.memberId ? (
              <Text style={styles.mutedSmall}>Recorded by a manager — saved as approved.</Text>
            ) : null}
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
              label={recordHoursMutation.isPending ? "Saving…" : "Save hours"}
              onPress={() => recordHoursMutation.mutate()}
              disabled={recordHoursMutation.isPending || recOut === recIn}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setRecordTarget(null)} disabled={recordHoursMutation.isPending} />
          </View>
        </View>
      </Modal>

      {/* Quick assign (by-staff view) — put a person on one of the day's template slots. */}
      <Modal visible={quickAssign !== null} transparent animationType="fade" onRequestClose={() => setQuickAssign(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheetCard, { maxHeight: "80%" }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="person-add-outline" size={22} color={appTheme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitleSm} numberOfLines={2}>
                  {quickAssign ? `Assign ${quickAssign.name} — ${formatDayLabel(quickAssign.date)}` : ""}
                </Text>
                <Text style={styles.muted}>Pick a shift to put them on.</Text>
              </View>
            </View>

            <ScrollView contentContainerStyle={{ gap: 2 }}>
              {sortedTemplates.map((t) => {
                const existing = quickAssign
                  ? (rotaQuery.data ?? []).find((s) => s.shiftDate === quickAssign.date && s.shiftTemplateId === t.templateId)
                  : undefined;
                const already = Boolean(
                  existing &&
                    quickAssign &&
                    existing.assignees.some((a) =>
                      quickAssign.userId
                        ? a.userId === quickAssign.userId
                        : Boolean(quickAssign.rotaStaffMemberId) && a.rotaStaffMemberId === quickAssign.rotaStaffMemberId,
                    ),
                );
                const assigningThis = quickAssignMutation.isPending && quickAssignMutation.variables?.template.templateId === t.templateId;
                return (
                  <Pressable
                    key={t.templateId}
                    style={({ pressed }) => [styles.userRow, already ? styles.quickTemplateRowDisabled : null, pressed && !already ? styles.userRowPressed : null]}
                    onPress={() => {
                      if (quickAssign && !already) quickAssignMutation.mutate({ date: quickAssign.date, template: t, person: quickAssign });
                    }}
                    disabled={already || quickAssignMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={
                      already
                        ? `${quickAssign?.name} is already on the ${t.name} shift`
                        : `Assign ${quickAssign?.name} to the ${t.name} shift, ${timeRange(t.startTime, t.endTime)}`
                    }
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName} numberOfLines={1}>{t.name}</Text>
                      <Text style={styles.mutedSmall} numberOfLines={1}>
                        {timeRange(t.startTime, t.endTime)}
                        {existing
                          ? ` · ${existing.assignees.length} assigned`
                          : " · new shift will be added"}
                      </Text>
                    </View>
                    {already ? (
                      <Text style={styles.quickAlreadyText}>Already assigned</Text>
                    ) : assigningThis ? (
                      <Text style={styles.mutedSmall}>Assigning…</Text>
                    ) : (
                      <Ionicons name="add-circle-outline" size={22} color={appTheme.colors.primary} />
                    )}
                  </Pressable>
                );
              })}
              {sortedTemplates.length === 0 ? (
                <Text style={styles.muted}>No shifts configured. Set them up in Shop Configuration → Shifts.</Text>
              ) : null}
            </ScrollView>

            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setQuickAssign(null)} disabled={quickAssignMutation.isPending} />
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
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const exportFeature = useFeature("staff_rota.timesheet_export");
  const [range, setRange] = useState(() => last7());
  const [view, setView] = useState<"staff" | "shift">("staff");
  const [selectedStaff, setSelectedStaff] = useState<{ userId?: string | null; rotaStaffMemberId?: string | null; name: string } | null>(null);
  const [selectedShift, setSelectedShift] = useState<{ shiftName: string; date: string } | null>(null);
  // Open session being closed from the drill-down (inline expansion in the sessions list).
  const [endingSession, setEndingSession] = useState<TimesheetSession | null>(null);
  const [endOut, setEndOut] = useState("17:00");
  // Completed session whose times are being corrected (inline expansion, same pattern as End session).
  const [editingSession, setEditingSession] = useState<TimesheetSession | null>(null);
  const [editIn, setEditIn] = useState("09:00");
  const [editOut, setEditOut] = useState("17:00");
  // Disputed review being resolved (opens the resolve modal with the staff member's note).
  const [resolveTarget, setResolveTarget] = useState<RotaTimesheetReview | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  // Approved timesheet history modal (all staff, grouped by period).
  const [historyOpen, setHistoryOpen] = useState(false);

  const sessionsQuery = useQuery({
    queryKey: ["rota-staff-sessions", shopId, selectedStaff?.userId, selectedStaff?.rotaStaffMemberId, range.from, range.to],
    queryFn: () => getStaffSessions(shopId as string, { userId: selectedStaff!.userId, rotaStaffMemberId: selectedStaff!.rotaStaffMemberId }, range.from, range.to),
    enabled: Boolean(shopId) && Boolean(selectedStaff),
  });
  // Approved leave days for the drilled-into person — rendered alongside their sessions.
  const leaveFeature = useFeature("LeaveManagement");
  const staffLeaveDaysQuery = useQuery({
    queryKey: ["leave-days", shopId, selectedStaff?.userId, selectedStaff?.rotaStaffMemberId, range.from, range.to],
    queryFn: () => getLeaveDays(shopId as string, { userId: selectedStaff!.userId, rotaStaffMemberId: selectedStaff!.rotaStaffMemberId }, range.from, range.to),
    enabled: Boolean(shopId) && Boolean(selectedStaff) && leaveFeature.isAllowed,
  });
  const staffLeaveDays = staffLeaveDaysQuery.data ?? [];
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

  // Pending manual approvals — the endpoint isn't range-filtered, so narrow client-side to the
  // selected range (by shift date when rostered, otherwise the check-in's calendar date).
  const pendingQuery = useQuery({
    queryKey: ["rota-pending", shopId],
    queryFn: () => getPendingApprovals(shopId as string),
    enabled: Boolean(shopId),
  });
  const pendingInRange = useMemo(
    () =>
      (pendingQuery.data ?? []).filter((p) => {
        const d = p.shiftDate ?? formatDateValue(new Date(p.checkInAt));
        return d >= range.from && d <= range.to;
      }),
    [pendingQuery.data, range.from, range.to],
  );

  // Payroll period lock — freezes attendance edits up to a date so payroll stays trustworthy.
  const lockQuery = useQuery({
    queryKey: ["rota-timesheet-lock", shopId],
    queryFn: () => getTimesheetLock(shopId as string),
    enabled: Boolean(shopId),
  });
  const lock = lockQuery.data ?? null;
  // Lock target: the earlier of the range end and yesterday (the server rejects today/future).
  // Hidden when the range starts after yesterday — there's nothing sensible to lock.
  const lockTarget = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = formatDateValue(d);
    const target = range.to < yesterday ? range.to : yesterday;
    return range.from > target ? null : target;
  }, [range.from, range.to]);

  const lockMutation = useMutation({
    mutationFn: (lockedThrough: string | null) => setTimesheetLock({ shopId: shopId as string, lockedThrough }),
    onSuccess: (_data, lockedThrough) => {
      toastSuccess(lockedThrough ? "Period locked." : "Period unlocked.");
      void queryClient.invalidateQueries({ queryKey: ["rota-timesheet-lock", shopId] });
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't update the payroll lock.")),
  });

  const startUnlock = async () => {
    if (!lock) return;
    const ok = await confirmDestructive({
      title: "Unlock period",
      message: `Allow editing of attendance up to ${formatDayLabel(lock.lockedThrough)} again? Payroll based on it may become out of date.`,
      confirmLabel: "Unlock",
    });
    if (ok) lockMutation.mutate(null);
  };
  const startLock = async () => {
    if (!lockTarget) return;
    const ok = await confirmDestructive({
      title: "Lock period",
      message: `Freeze all attendance up to ${formatDayLabel(lockTarget)}? Times in this period can no longer be edited or approved until unlocked.`,
      confirmLabel: "Lock",
    });
    if (ok) lockMutation.mutate(lockTarget);
  };

  // Staff sign-off — review/confirmation state for the selected period.
  const reviewsQuery = useQuery({
    queryKey: ["rota-reviews", shopId, range.from, range.to],
    queryFn: () => getTimesheetReviews(shopId as string, range.from, range.to),
    enabled: Boolean(shopId),
  });
  const reviews = reviewsQuery.data ?? [];
  const allReviewsApproved = reviews.length > 0 && reviews.every((r) => r.status === "ManagerApproved");
  const refreshReviews = () => void queryClient.invalidateQueries({ queryKey: ["rota-reviews", shopId] });

  // Approved history — fetched only while the modal is open, grouped by period (newest first).
  const historyQuery = useQuery({
    queryKey: ["rota-review-history", shopId],
    queryFn: () => getTimesheetReviewHistory(shopId as string),
    enabled: Boolean(shopId) && historyOpen,
  });
  const historyGroups = useMemo(() => {
    const map = new Map<string, RotaTimesheetReview[]>();
    for (const r of historyQuery.data ?? []) {
      const key = `${r.periodFrom}|${r.periodTo}`;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [historyQuery.data]);

  const requestReviewsMutation = useMutation({
    mutationFn: () => requestTimesheetReviews({ shopId: shopId as string, from: range.from, to: range.to }),
    onSuccess: () => {
      toastSuccess("Review requests sent.");
      refreshReviews();
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't send review requests.")),
  });
  const approveReviewMutation = useMutation({
    mutationFn: (id: string) => approveTimesheetReview(id),
    onSuccess: () => {
      toastSuccess("Hours approved.");
      refreshReviews();
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't approve the hours.")),
  });
  const resolveReviewMutation = useMutation({
    mutationFn: (action: { approved: boolean; reRequestConfirmation: boolean }) =>
      resolveTimesheetReview(resolveTarget!.id, {
        approved: action.approved,
        managerNote: resolveNote.trim() || undefined,
        reRequestConfirmation: action.reRequestConfirmation,
      }),
    onSuccess: (_row, action) => {
      setResolveTarget(null);
      setResolveNote("");
      toastSuccess(action.reRequestConfirmation ? "Asked the staff member to re-confirm." : "Issue rejected — hours approved.");
      refreshReviews();
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't resolve the issue.")),
  });

  const startRequestReviews = async () => {
    const ok = await confirmDestructive({
      title: "Request staff reviews",
      message: `Ask all staff who worked ${formatDayLabel(range.from)} – ${formatDayLabel(range.to)} to review and confirm their hours?`,
      confirmLabel: "Send",
    });
    if (ok) requestReviewsMutation.mutate();
  };

  const openResolve = (review: RotaTimesheetReview) => {
    setResolveNote("");
    setResolveTarget(review);
  };

  const staffRows = timesheetQuery.data ?? [];
  const shiftRows = shiftTimesheetQuery.data ?? [];
  const loading = view === "staff" ? timesheetQuery.isLoading : shiftTimesheetQuery.isLoading;
  const rowCount = view === "staff" ? staffRows.length : shiftRows.length;
  const totalHours = (view === "staff" ? staffRows : shiftRows).reduce((s: number, r: { totalHours: number }) => s + r.totalHours, 0);
  const openSessionCount = (view === "staff" ? staffRows : shiftRows).reduce((s: number, r: { openSessions: number }) => s + r.openSessions, 0);
  const readinessReady = !loading && !pendingQuery.isLoading;

  // Close a forgotten check-out from the staff drill-down. updateAttendance also approves the entry.
  const endSessionMutation = useMutation({
    mutationFn: () => {
      const s = endingSession!;
      const { checkOutAt } = sessionIsos(s.date, toHHmm(s.checkInAt), endOut);
      return updateAttendance(s.id, { checkInAt: s.checkInAt, checkOutAt });
    },
    onSuccess: () => {
      setEndingSession(null);
      toastSuccess("Session closed.");
      void sessionsQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["rota-timesheet", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["rota-timesheet-by-shift", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["rota-pending", shopId] });
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't close the session.")),
  });

  const startEndSession = (s: TimesheetSession) => {
    setEndOut(toHHmm(new Date().toISOString()));
    setEditingSession(null);
    setEndingSession(s);
  };

  // Correct a completed session's times from the staff drill-down (manager-authoritative;
  // updateAttendance also approves the entry).
  const editSessionMutation = useMutation({
    mutationFn: () => {
      const s = editingSession!;
      const { checkInAt, checkOutAt } = sessionIsos(s.date, editIn, editOut);
      return updateAttendance(s.id, { checkInAt, checkOutAt });
    },
    onSuccess: () => {
      setEditingSession(null);
      toastSuccess("Times updated.");
      void sessionsQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["rota-timesheet", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["rota-timesheet-by-shift", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["rota-pending", shopId] });
      // Edited hours change staff sign-off totals, so refresh the reviews too.
      void queryClient.invalidateQueries({ queryKey: ["rota-reviews", shopId] });
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't update the times.")),
  });

  const startEditSession = (s: TimesheetSession) => {
    setEndingSession(null);
    setEditIn(toHHmm(s.checkInAt));
    setEditOut(s.checkOutAt ? toHHmm(s.checkOutAt) : "17:00");
    setEditingSession(s);
  };
  const closeStaffModal = () => {
    setSelectedStaff(null);
    setEndingSession(null);
    setEditingSession(null);
  };

  // Build a CSV of the current view and hand it to the system share sheet.
  const exportMutation = useMutation({
    mutationFn: async () => {
      const lines: string[] = [];
      if (view === "staff") {
        // Leave-hour columns ride along only when the Leave Management feature is on the plan.
        const withLeave = leaveFeature.isAllowed;
        const leaveHeaders = withLeave ? ["Holiday hours", "Sick hours", "Other leave hours", "Unpaid leave hours"] : [];
        const leaveValues = (r: TimesheetRow) =>
          withLeave
            ? [(r.holidayHours ?? 0).toFixed(1), (r.sickHours ?? 0).toFixed(1), (r.otherLeaveHours ?? 0).toFixed(1), (r.unpaidLeaveHours ?? 0).toFixed(1)]
            : [];
        lines.push(["Staff", "Shifts worked", "Open sessions", "Hours", "Reasons", ...leaveHeaders].map(csvField).join(","));
        for (const r of staffRows) {
          lines.push([r.userName, r.shiftsWorked, r.openSessions, r.totalHours.toFixed(1), r.reasons?.join("; ") ?? "", ...leaveValues(r)].map(csvField).join(","));
        }
        lines.push(
          [
            "Total",
            staffRows.reduce((s, r) => s + r.shiftsWorked, 0),
            staffRows.reduce((s, r) => s + r.openSessions, 0),
            staffRows.reduce((s, r) => s + r.totalHours, 0).toFixed(1),
            "",
            ...(withLeave
              ? [
                  staffRows.reduce((s, r) => s + (r.holidayHours ?? 0), 0).toFixed(1),
                  staffRows.reduce((s, r) => s + (r.sickHours ?? 0), 0).toFixed(1),
                  staffRows.reduce((s, r) => s + (r.otherLeaveHours ?? 0), 0).toFixed(1),
                  staffRows.reduce((s, r) => s + (r.unpaidLeaveHours ?? 0), 0).toFixed(1),
                ]
              : []),
          ].map(csvField).join(","),
        );
      } else {
        lines.push(["Shift", "Date", "Staff count", "Hours", "Reasons"].map(csvField).join(","));
        for (const r of shiftRows) {
          lines.push([r.shiftName, r.date, r.staffCount, r.totalHours.toFixed(1), r.reasons?.join("; ") ?? ""].map(csvField).join(","));
        }
        lines.push(
          [
            "Total",
            "",
            shiftRows.reduce((s, r) => s + r.staffCount, 0),
            shiftRows.reduce((s, r) => s + r.totalHours, 0).toFixed(1),
            "",
          ].map(csvField).join(","),
        );
      }
      const targetDirectory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!targetDirectory) {
        throw new Error("Storage directory is unavailable on this device.");
      }
      const fileUri = `${targetDirectory}timesheet_${range.from}_${range.to}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, lines.join("\r\n"), { encoding: FileSystem.EncodingType.UTF8 });
      return fileUri;
    },
    onSuccess: async (fileUri) => {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        toastSuccess(`File saved to:\n${fileUri}`);
        return;
      }
      await Sharing.shareAsync(fileUri, { mimeType: "text/csv", dialogTitle: "Export timesheet CSV" });
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't export the timesheet.")),
  });

  return (
    <ScreenContainer>
      <View style={styles.content}>
        <View style={ui.card}>
          <DateRangeQuickPicks from={range.from} to={range.to} onSelect={(from, to) => setRange({ from, to })} style={{ marginBottom: 8 }} />
          <View style={styles.row}>
            <DateTimeField style={{ flex: 1 }} mode="date" value={range.from} onChange={(from) => setRange((r) => ({ ...r, from }))} />
            <DateTimeField style={{ flex: 1 }} mode="date" value={range.to} onChange={(to) => setRange((r) => ({ ...r, to }))} />
          </View>
        </View>

        {/* View toggle + export */}
        <View style={styles.segmentRow}>
          <View style={[styles.segment, { flex: 1 }]}>
            {(["staff", "shift"] as const).map((v) => (
              <Pressable key={v} style={[styles.segmentBtn, view === v ? styles.segmentBtnActive : null]} onPress={() => setView(v)}>
                <Text style={[styles.segmentText, view === v ? styles.segmentTextActive : null]}>
                  {v === "staff" ? "By staff" : "By shift"}
                </Text>
              </Pressable>
            ))}
          </View>
          {exportFeature.isAllowed ? (
            <Pressable
              style={({ pressed }) => [styles.exportBtn, pressed ? styles.exportBtnPressed : null, rowCount === 0 || exportMutation.isPending ? styles.exportBtnDisabled : null]}
              onPress={() => exportMutation.mutate()}
              disabled={rowCount === 0 || exportMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Export timesheet as CSV"
            >
              <Ionicons name="download-outline" size={15} color={appTheme.colors.primary} />
              <Text style={styles.exportBtnText}>{exportMutation.isPending ? "Exporting…" : "Export CSV"}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Payroll readiness for the selected range */}
        {readinessReady ? (
          openSessionCount > 0 || pendingInRange.length > 0 ? (
            <View style={styles.readinessRow}>
              {openSessionCount > 0 ? (
                <View style={[styles.weekStatChip, styles.weekStatChipWarning]}>
                  <Ionicons name="alert-circle-outline" size={13} color={appTheme.colors.warning} />
                  <Text style={[styles.weekStatText, styles.weekStatTextWarning]}>
                    {openSessionCount} open session{openSessionCount === 1 ? "" : "s"} — hours missing from totals
                  </Text>
                </View>
              ) : null}
              {pendingInRange.length > 0 ? (
                <Pressable
                  style={({ pressed }) => [styles.weekStatChip, styles.weekStatChipWarning, pressed ? styles.exportBtnPressed : null]}
                  onPress={() => navigation.navigate("RotaApprovals")}
                  accessibilityRole="button"
                  accessibilityLabel={`Review ${pendingInRange.length} manual ${pendingInRange.length === 1 ? "entry" : "entries"} awaiting approval`}
                >
                  <Ionicons name="time-outline" size={13} color={appTheme.colors.warning} />
                  <Text style={[styles.weekStatText, styles.weekStatTextWarning]}>
                    {pendingInRange.length} manual {pendingInRange.length === 1 ? "entry" : "entries"} awaiting approval
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={appTheme.colors.textWarningStrong} />
                </Pressable>
              ) : null}
            </View>
          ) : pendingQuery.isSuccess ? (
            <View style={styles.readinessRow}>
              <View style={[styles.weekStatChip, styles.weekStatChipSuccess]}>
                <Ionicons name="checkmark-circle-outline" size={13} color={appTheme.colors.success} />
                <Text style={[styles.weekStatText, styles.weekStatTextSuccess]}>
                  Ready — no open sessions or pending approvals in this range.
                </Text>
              </View>
            </View>
          ) : null
        ) : null}

        {/* Payroll lock — freeze attendance up to a date once it has been paid out */}
        {lockQuery.isSuccess && (lock || lockTarget) ? (
          <View style={styles.readinessRow}>
            {lock ? (
              <>
                <View style={styles.weekStatChip}>
                  <Ionicons name="lock-closed-outline" size={13} color={appTheme.colors.textMuted} />
                  <Text style={styles.weekStatText}>
                    Locked through {formatDayLabel(lock.lockedThrough)} · by {lock.lockedByName}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.weekStatChip, pressed ? styles.exportBtnPressed : null, lockMutation.isPending ? styles.exportBtnDisabled : null]}
                  onPress={() => void startUnlock()}
                  disabled={lockMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Unlock the payroll period locked through ${formatDayLabel(lock.lockedThrough)}`}
                >
                  <Ionicons name="lock-open-outline" size={13} color={appTheme.colors.primary} />
                  <Text style={[styles.weekStatText, { color: appTheme.colors.primary }]}>
                    {lockMutation.isPending ? "Unlocking…" : "Unlock"}
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.weekStatChip, pressed ? styles.exportBtnPressed : null, lockMutation.isPending ? styles.exportBtnDisabled : null]}
                onPress={() => void startLock()}
                disabled={lockMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel={`Lock the payroll period to ${formatDayLabel(lockTarget)}`}
              >
                <Ionicons name="lock-closed-outline" size={13} color={appTheme.colors.textMuted} />
                <Text style={styles.weekStatText}>
                  {lockMutation.isPending ? "Locking…" : `Lock period to ${formatDayLabel(lockTarget)}`}
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {/* Staff sign-off — ask staff to confirm their hours for this period before locking */}
        <View style={[ui.card, styles.signoffCard]}>
          <View style={styles.signoffHeader}>
            <Text style={styles.sectionTitle}>Staff sign-off</Text>
            <View style={styles.signoffHeaderActions}>
              <Pressable
                style={({ pressed }) => [pressed ? styles.exportBtnPressed : null]}
                onPress={() => setHistoryOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="View approved timesheet history"
              >
                <Text style={styles.resendText}>Approved history</Text>
              </Pressable>
              {reviews.length > 0 ? (
                <Pressable
                  style={({ pressed }) => [pressed ? styles.exportBtnPressed : null, requestReviewsMutation.isPending ? styles.exportBtnDisabled : null]}
                  onPress={() => void startRequestReviews()}
                  disabled={requestReviewsMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Re-send review requests to staff still awaiting review"
                >
                  <Text style={styles.resendText}>{requestReviewsMutation.isPending ? "Sending…" : "Re-send requests"}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {reviewsQuery.isLoading ? <LoadingState inline /> : null}

          {reviewsQuery.isSuccess && reviews.length === 0 ? (
            <>
              <Text style={styles.muted}>No reviews requested for this range yet.</Text>
              <PrimaryButton
                label={requestReviewsMutation.isPending ? "Sending…" : "Request staff reviews"}
                icon="paper-plane-outline"
                onPress={() => void startRequestReviews()}
                disabled={!shopId || requestReviewsMutation.isPending}
              />
            </>
          ) : null}

          {reviews.map((review) => {
            const badge =
              review.status === "PendingStaff"
                ? { label: "Awaiting staff", tone: "neutral" as const }
                : review.status === "Confirmed"
                  ? { label: "Confirmed", tone: "success" as const }
                  : review.status === "Disputed"
                    ? { label: "Issue raised", tone: "danger" as const }
                    : { label: "Approved", tone: "success" as const };
            const approvingThis = approveReviewMutation.isPending && approveReviewMutation.variables === review.id;
            return (
              <View key={review.id} style={styles.signoffRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tdName} numberOfLines={1}>{review.userName}</Text>
                  <Text style={styles.tdSub}>
                    {review.totalHours.toFixed(1)}h
                    {review.openSessions > 0 ? (
                      <Text style={{ color: appTheme.colors.textWarningStrong }}> (+{review.openSessions} open)</Text>
                    ) : null}
                  </Text>
                </View>
                <StatusBadge label={badge.label} tone={badge.tone} />
                {review.status === "PendingStaff" || review.status === "Confirmed" ? (
                  <Pressable
                    style={({ pressed }) => [styles.signoffActionBtn, pressed ? styles.exportBtnPressed : null, approveReviewMutation.isPending ? styles.exportBtnDisabled : null]}
                    onPress={() => approveReviewMutation.mutate(review.id)}
                    disabled={approveReviewMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Approve ${review.userName}'s hours`}
                  >
                    <Text style={styles.signoffActionText}>{approvingThis ? "Approving…" : "Approve"}</Text>
                  </Pressable>
                ) : review.status === "Disputed" ? (
                  <Pressable
                    style={({ pressed }) => [styles.signoffActionBtn, pressed ? styles.exportBtnPressed : null]}
                    onPress={() => openResolve(review)}
                    accessibilityRole="button"
                    accessibilityLabel={`Resolve ${review.userName}'s issue`}
                  >
                    <Text style={styles.signoffActionText}>Resolve</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}

          {allReviewsApproved ? (
            <View style={[styles.weekStatChip, styles.weekStatChipSuccess, styles.signoffDoneChip]}>
              <Ionicons name="checkmark-circle-outline" size={13} color={appTheme.colors.success} />
              <Text style={[styles.weekStatText, styles.weekStatTextSuccess]}>All staff approved — lock the period to finish.</Text>
            </View>
          ) : null}
        </View>

        {loading ? <LoadingState inline /> : null}
        {!loading && rowCount === 0 ? (
          <View style={ui.card}>
            <EmptyState
              icon="time-outline"
              title="No clocked hours"
              message="No clocked hours in this range. Adjust the dates above."
            />
          </View>
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
                    // External staff have no userId (only rotaStaffMemberId) — keying on
                    // userId alone gives several rows the same null key.
                    key={row.userId ?? row.rotaStaffMemberId ?? row.userName}
                    style={({ pressed }) => [styles.tRow, pressed ? styles.tRowPressed : null]}
                    onPress={() => setSelectedStaff({ userId: row.userId, rotaStaffMemberId: row.rotaStaffMemberId, name: row.userName })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tdName, styles.tdLink]} numberOfLines={1}>{row.userName}</Text>
                      {row.reasons?.length ? (
                        <Text style={[styles.tdSub, styles.reasonText]} numberOfLines={1}>{row.reasons.join(" · ")}</Text>
                      ) : null}
                      {leaveFeature.isAllowed && leaveHourSegments(row).length > 0 ? (
                        <Text style={styles.tdSub} numberOfLines={1}>
                          {leaveHourSegments(row).map((seg, i) => (
                            <Text key={seg.label} style={seg.muted ? null : styles.reasonText}>
                              {i > 0 ? " · " : ""}{seg.label}
                            </Text>
                          ))}
                        </Text>
                      ) : null}
                    </View>
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
                        {row.reasons?.length ? <Text style={styles.reasonText}>{` · ${row.reasons.join(" · ")}`}</Text> : ""}
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
      </View>

      {/* Staff sessions drill-down */}
      <Modal visible={selectedStaff !== null} transparent animationType="slide" onRequestClose={closeStaffModal}>
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
              <Pressable onPress={closeStaffModal} style={styles.editorHeaderBtn}>
                <Ionicons name="close" size={22} color={appTheme.colors.text} />
              </Pressable>
            </View>

            {sessionsQuery.isLoading || (leaveFeature.isAllowed && staffLeaveDaysQuery.isLoading) ? <LoadingState inline /> : null}
            {!sessionsQuery.isLoading && !staffLeaveDaysQuery.isLoading && (sessionsQuery.data?.length ?? 0) === 0 && staffLeaveDays.length === 0 ? (
              <Text style={styles.muted}>No sessions in this range.</Text>
            ) : null}

            <ScrollView contentContainerStyle={{ gap: 2 }} keyboardShouldPersistTaps="handled">
              {(sessionsQuery.data ?? []).map((s) => (
                <View key={s.id}>
                  <View style={styles.sessionRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sessionDate}>{dayLabel(s.date)}</Text>
                      <Text style={styles.muted} numberOfLines={1}>
                        {s.shiftName ? `${s.shiftName} · ` : ""}{s.reason ? <Text style={styles.reasonText}>{`${s.reason} · `}</Text> : ""}{clockTime(s.checkInAt)} → {s.checkOutAt ? clockTime(s.checkOutAt) : "—"}
                        {s.entryMethod === "Manual" ? (s.isApproved ? "  · manual" : "  · pending") : ""}
                      </Text>
                    </View>
                    {s.checkOutAt ? (
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text style={styles.sessionHours}>{workedLabel(s.checkInAt, s.checkOutAt)}</Text>
                        <Pressable
                          style={({ pressed }) => [styles.editTimesBtn, pressed ? styles.exportBtnPressed : null]}
                          onPress={() => (editingSession?.id === s.id ? setEditingSession(null) : startEditSession(s))}
                          disabled={editSessionMutation.isPending}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit the times for ${dayLabel(s.date)}`}
                        >
                          <Ionicons name="create-outline" size={14} color={appTheme.colors.primary} />
                          <Text style={styles.editTimesBtnText}>Edit times</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        style={({ pressed }) => [styles.endSessionBtn, pressed ? styles.exportBtnPressed : null]}
                        onPress={() => (endingSession?.id === s.id ? setEndingSession(null) : startEndSession(s))}
                        disabled={endSessionMutation.isPending}
                        accessibilityRole="button"
                        accessibilityLabel={`End the open session from ${dayLabel(s.date)}`}
                      >
                        <Ionicons name="log-out-outline" size={14} color={appTheme.colors.textWarningStrong} />
                        <Text style={styles.endSessionBtnText}>End session</Text>
                      </Pressable>
                    )}
                  </View>
                  {/* Inline time editor for a completed session (manager correction). */}
                  {editingSession?.id === s.id ? (
                    <View style={styles.endSessionBox}>
                      <Text style={styles.mutedSmall}>Correct this session’s times — saved as approved.</Text>
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
                      {editIn && editOut && editOut === editIn ? (
                        <Text style={[styles.mutedSmall, { color: appTheme.colors.danger }]}>Check-in and check-out can’t be the same.</Text>
                      ) : editIn && editOut && isOvernight(editIn, editOut) ? (
                        <Text style={styles.mutedSmall}>Overnight — check-out is on the next day.</Text>
                      ) : null}
                      <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <PrimaryButton size="sm" tone="neutral" label="Cancel" onPress={() => setEditingSession(null)} disabled={editSessionMutation.isPending} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <PrimaryButton
                            size="sm"
                            label={editSessionMutation.isPending ? "Saving…" : "Save times"}
                            onPress={() => editSessionMutation.mutate()}
                            disabled={editSessionMutation.isPending || !editIn || !editOut || editOut === editIn}
                          />
                        </View>
                      </View>
                    </View>
                  ) : null}
                  {/* Inline check-out picker for a forgotten check-out. */}
                  {endingSession?.id === s.id ? (
                    <View style={styles.endSessionBox}>
                      <Text style={styles.mutedSmall}>Checked in {clockTime(s.checkInAt)} — set when this session ended.</Text>
                      <Text style={styles.fieldLabel}>Check out</Text>
                      <DateTimeField mode="time" value={endOut} onChange={setEndOut} />
                      {endOut === toHHmm(s.checkInAt) ? (
                        <Text style={[styles.mutedSmall, { color: appTheme.colors.danger }]}>Check-in and check-out can’t be the same.</Text>
                      ) : isOvernight(toHHmm(s.checkInAt), endOut) ? (
                        <Text style={styles.mutedSmall}>Overnight — check-out is on the next day.</Text>
                      ) : null}
                      <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <PrimaryButton size="sm" tone="neutral" label="Cancel" onPress={() => setEndingSession(null)} disabled={endSessionMutation.isPending} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <PrimaryButton
                            size="sm"
                            label={endSessionMutation.isPending ? "Closing…" : "Close session"}
                            onPress={() => endSessionMutation.mutate()}
                            disabled={endSessionMutation.isPending || !endOut || endOut === toHHmm(s.checkInAt)}
                          />
                        </View>
                      </View>
                    </View>
                  ) : null}
                </View>
              ))}
              {/* Approved leave days in the range (Leave Management feature) */}
              {staffLeaveDays.map((d) => (
                <View key={`${d.leaveRequestId}-${d.date}`} style={styles.sessionRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionDate}>{dayLabel(d.date)}</Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      <Text style={styles.reasonText}>{d.type === "Other" ? "Other leave" : `${d.type} leave`}</Text>
                      {d.isPaid ? "" : "  · unpaid"}
                    </Text>
                  </View>
                  <Text style={styles.sessionHours}>{leaveHoursLabel(d.hours)}</Text>
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
                      {s.reason ? <Text style={styles.reasonText}>{`${s.reason} · `}</Text> : ""}{clockTime(s.checkInAt)} → {s.checkOutAt ? clockTime(s.checkOutAt) : "—"}
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

      {/* Resolve a disputed timesheet review */}
      <Modal visible={resolveTarget !== null} transparent animationType="fade" onRequestClose={() => setResolveTarget(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="alert-circle-outline" size={22} color={appTheme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitleSm}>Resolve issue</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {resolveTarget ? `${resolveTarget.userName} · ${resolveTarget.totalHours.toFixed(1)}h` : ""}
                </Text>
              </View>
            </View>

            {resolveTarget?.staffNote ? <Text style={styles.noteQuote}>“{resolveTarget.staffNote}”</Text> : null}

            <Text style={styles.fieldLabel}>Manager note (optional)</Text>
            <TextInput
              style={[styles.externalInput, styles.noteInput]}
              value={resolveNote}
              onChangeText={setResolveNote}
              placeholder="e.g. Added the missing Saturday shift"
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
              maxLength={500}
            />

            <View style={styles.noticeRow}>
              <Ionicons name="information-circle-outline" size={15} color={appTheme.colors.textMuted} />
              <Text style={styles.mutedSmall}>Fix the times from this person’s row in the timesheet list below, then re-request confirmation.</Text>
            </View>

            <PrimaryButton
              label={resolveReviewMutation.isPending && resolveReviewMutation.variables?.reRequestConfirmation ? "Sending…" : "Fixed — ask to re-confirm"}
              onPress={() => resolveReviewMutation.mutate({ approved: true, reRequestConfirmation: true })}
              disabled={resolveReviewMutation.isPending}
            />
            <PrimaryButton
              label={resolveReviewMutation.isPending && resolveReviewMutation.variables && !resolveReviewMutation.variables.reRequestConfirmation ? "Approving…" : "Reject issue & approve"}
              tone="danger"
              onPress={() => resolveReviewMutation.mutate({ approved: false, reRequestConfirmation: false })}
              disabled={resolveReviewMutation.isPending}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setResolveTarget(null)} disabled={resolveReviewMutation.isPending} />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Approved timesheet history — past periods grouped by period, newest first */}
      <Modal visible={historyOpen} transparent animationType="slide" onRequestClose={() => setHistoryOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheetCard, { maxHeight: "80%" }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="receipt-outline" size={22} color={appTheme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitleSm}>Approved history</Text>
                <Text style={styles.muted}>Past approved timesheet periods</Text>
              </View>
              <Pressable onPress={() => setHistoryOpen(false)} style={styles.editorHeaderBtn} accessibilityRole="button" accessibilityLabel="Close approved history">
                <Ionicons name="close" size={22} color={appTheme.colors.text} />
              </Pressable>
            </View>

            {historyQuery.isLoading ? <LoadingState inline /> : null}
            {historyQuery.isSuccess && historyGroups.length === 0 ? (
              <EmptyState icon="receipt-outline" title="No approved timesheets yet" message="Approved periods will appear here once staff hours are signed off." />
            ) : null}

            <ScrollView contentContainerStyle={{ gap: 2 }}>
              {historyGroups.map(([key, rows]) => (
                <View key={key}>
                  <Text style={styles.historyPeriodHead}>
                    {formatDayLabel(rows[0].periodFrom)} – {formatDayLabel(rows[0].periodTo)}
                  </Text>
                  {rows.map((r) => (
                    <View key={r.id} style={styles.sessionRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sessionDate} numberOfLines={1}>{r.userName}</Text>
                        <Text style={styles.muted} numberOfLines={1}>Approved {approvedOnLabel(r.resolvedOn)}</Text>
                      </View>
                      <Text style={styles.sessionHours}>{r.totalHours.toFixed(1)}h</Text>
                    </View>
                  ))}
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

  // Total pending hours (entries without a check-out count as 0 and are flagged separately).
  const pendingStats = useMemo(() => {
    let minutes = 0;
    let withoutCheckOut = 0;
    for (const p of pending) {
      if (p.checkOutAt) minutes += Math.max(0, (new Date(p.checkOutAt).getTime() - new Date(p.checkInAt).getTime()) / 60000);
      else withoutCheckOut += 1;
    }
    return { hours: minutes / 60, withoutCheckOut };
  }, [pending]);

  const [approvingAll, setApprovingAll] = useState(false);
  const approveAll = async () => {
    const ok = await confirmDestructive({
      title: "Approve all",
      message: `Approve all ${pending.length} pending entries as submitted?`,
      confirmLabel: "Approve all",
    });
    if (!ok) return;
    setApprovingAll(true);
    let failures = 0;
    let firstError: unknown = null;
    for (const p of pending) {
      try {
        await approveAttendance(p.id);
      } catch (error) {
        failures += 1;
        if (firstError === null) firstError = error;
      }
    }
    setApprovingAll(false);
    if (failures > 0) {
      toastError(getApiErrorMessage(firstError, `Couldn't approve ${failures} ${failures === 1 ? "entry" : "entries"}.`));
    } else {
      toastSuccess(`Approved ${pending.length} ${pending.length === 1 ? "entry" : "entries"}.`);
    }
    refresh();
  };

  const anyBusy = approvingAll || approveMutation.isPending || rejectMutation.isPending;

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl
          refreshing={pendingQuery.isRefetching}
          onRefresh={() => void pendingQuery.refetch()}
          tintColor={appTheme.colors.primary}
          colors={[appTheme.colors.primary]}
        />
      }
    >
      <View style={styles.content}>
        <Text style={styles.muted}>Manually entered times awaiting your approval.</Text>

        {pending.length > 0 ? (
          <View style={[ui.card, styles.pendingSummaryCard]}>
            <Text style={styles.pendingSummaryText}>
              {pending.length} {pending.length === 1 ? "entry" : "entries"} · {pendingStats.hours.toFixed(1)} hours pending
              {pendingStats.withoutCheckOut > 0
                ? ` · ${pendingStats.withoutCheckOut} without check-out (counted as 0)`
                : ""}
            </Text>
            <PrimaryButton
              label={approvingAll ? "Approving…" : "Approve all"}
              tone="success"
              icon="checkmark-done-outline"
              onPress={() => void approveAll()}
              disabled={anyBusy}
            />
          </View>
        ) : null}

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
                <Pressable style={styles.rejectBtn} onPress={() => confirmReject(p)} disabled={anyBusy}>
                  <Ionicons name="close" size={16} color={appTheme.colors.danger} />
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </Pressable>
                <Pressable style={styles.adjustBtn} onPress={() => openAdjust(p)} disabled={anyBusy}>
                  <Ionicons name="create-outline" size={16} color={appTheme.colors.primary} />
                  <Text style={styles.adjustBtnText}>Adjust</Text>
                </Pressable>
                <Pressable style={styles.approveBtnFlex} onPress={() => approveMutation.mutate(p.id)} disabled={anyBusy}>
                  <Ionicons name="checkmark" size={16} color={appTheme.colors.onPrimary} />
                  <Text style={styles.actBtnText}>{approveMutation.isPending || approvingAll ? "Approving…" : "Approve"}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

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
              label={adjustMutation.isPending ? "Saving…" : "Save & approve"}
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
      <View style={styles.content}>
        <Text style={styles.muted}>People who aren't Ops Arrow users but you roster &amp; record hours for.</Text>
        <PrimaryButton label="Add external person" icon="person-add-outline" onPress={openNew} disabled={!shopId} />

        {membersQuery.isLoading ? <SkeletonList count={4} /> : null}
        {!membersQuery.isLoading && members.length === 0 ? (
          <View style={ui.card}>
            <EmptyState
              icon="people-outline"
              title="No external staff yet"
              message="Add people you roster and record hours for who don't use the app."
            />
          </View>
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
            <Ionicons name="chevron-forward" size={18} color={appTheme.colors.textSubtle} />
          </Pressable>
        ))}
      </View>

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <Text style={styles.modalTitleSm}>{editing && editing !== "new" ? "Edit external person" : "Add external person"}</Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput style={styles.externalInput} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={appTheme.colors.textSubtle} autoCapitalize="words" />

            <Text style={styles.fieldLabel}>Phone (optional)</Text>
            <TextInput style={styles.externalInput} value={phone} onChangeText={setPhone} placeholder="+44 7700 900000" placeholderTextColor={appTheme.colors.textSubtle} keyboardType="phone-pad" />

            <Text style={styles.fieldLabel}>Email (optional)</Text>
            <TextInput style={styles.externalInput} value={email} onChangeText={setEmail} placeholder="name@example.com" placeholderTextColor={appTheme.colors.textSubtle} autoCapitalize="none" keyboardType="email-address" />

            <PrimaryButton label={saveMutation.isPending ? "Saving…" : "Save"} onPress={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending} />

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
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: appTheme.spacing.sm, paddingBottom: appTheme.spacing.xl },
  rangeCard: { gap: appTheme.spacing.sm },
  rangeTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rangeTopLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  rangeSummary: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, flexShrink: 1 },
  rangeCount: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  // Segmented preset control.
  presetRow: { flexDirection: "row", gap: 6, backgroundColor: appTheme.colors.surfaceMuted, borderRadius: appTheme.radius.md, padding: 4 },
  presetChip: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, borderRadius: appTheme.radius.sm },
  presetChipActive: { backgroundColor: appTheme.colors.surface, ...appTheme.elevation.sm },
  presetText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  presetTextActive: { color: appTheme.colors.primary },
  customRow: { flexDirection: "row", gap: appTheme.spacing.sm },
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
  weekNav: { gap: 10, paddingVertical: 12 },
  weekNavRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  weekNavBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceBrandSoft },
  weekNavBtnPressed: { opacity: 0.6 },
  weekNavLabel: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 16 },
  weekNavHint: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, marginTop: 1 },
  weekStatsRow: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 6 },
  weekStatChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  weekStatChipWarning: { backgroundColor: appTheme.colors.surfaceWarningSoft },
  weekStatChipSuccess: { backgroundColor: appTheme.colors.surfaceSuccessSoft },
  weekStatText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  weekStatTextWarning: { color: appTheme.colors.textWarningStrong },
  weekStatTextSuccess: { color: appTheme.colors.textSuccessStrong },
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
  editorDeleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: appTheme.spacing.md,
    paddingVertical: 11,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.borderDangerSoft,
    backgroundColor: appTheme.colors.surfaceDangerSoft,
  },
  editorDeleteText: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  addExternalBtn: { paddingHorizontal: 18, paddingVertical: 11, alignItems: "center", justifyContent: "center", borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.primary },
  addExternalOpenBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: appTheme.spacing.sm, paddingVertical: 11, borderRadius: appTheme.radius.sm, borderWidth: 1, borderColor: appTheme.colors.border },
  memberCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  contactValue: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  dayCard: { gap: 8 },
  dayCardToday: { borderWidth: 1, borderColor: appTheme.colors.primary },
  dayCardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayCardHeadLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  dayName: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 15 },
  dayNameToday: { color: appTheme.colors.primary },
  dayDate: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, marginTop: 1 },
  todayPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  todayPillText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11 },
  dayAddBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceBrandSoft },
  dayAddBtnPressed: { opacity: 0.6 },
  dayEmptyAdd: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: appTheme.colors.border,
  },
  dayEmptyAddPressed: { backgroundColor: appTheme.colors.surfaceMuted },
  dayEmptyAddText: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  // Shifts stack as separate bordered sections inside the day card.
  rotaTable: { gap: 8 },
  // Stacked shift section: name + time + actions on top, assignees underneath.
  rotaShiftBlock: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 6,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    overflow: "hidden",
  },
  rotaShiftBlockUnstaffed: { backgroundColor: appTheme.colors.surfaceWarningMuted },
  rotaShiftBlockPressed: { opacity: 0.7 },
  // Header band: hairline underline separates the shift name/actions from the assignee list.
  rotaShiftTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appTheme.colors.borderSoft,
  },
  rotaShiftName: { flexShrink: 1 },
  // Time fills the middle so the action icons stay pinned to the far right.
  rotaShiftTime: { flex: 1 },
  // Padded touch targets with breathing room between the row's action icons.
  rotaShiftIconBtn: { padding: 6, marginLeft: 8 },
  rotaShiftIconPressed: { opacity: 0.5 },
  rotaAssigneeList: { gap: 6 },
  // Compact secondary pill that makes assignment discoverable; amber variant on unstaffed blocks.
  assignPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  assignPillUnstaffed: { backgroundColor: appTheme.colors.surfaceWarningSoft },
  assignPillPressed: { opacity: 0.7 },
  assignPillText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
  assignPillTextUnstaffed: { color: appTheme.colors.textWarningStrong },
  rotaStaffText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 20, paddingVertical: 2 },
  // Assignee name + optional reason tag on the week grid.
  rotaStaffLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  reasonTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceInfoSoft,
    maxWidth: 120,
  },
  reasonTagText: { color: appTheme.colors.textInfoStrong, fontFamily: appTheme.fonts.bodyMedium, fontSize: 10, lineHeight: 14 },
  // Approved-leave chips on a rota day card (info-blue, like other informational tags).
  leaveChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  leaveChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceInfoSoft,
    maxWidth: "100%",
  },
  leaveChipText: { color: appTheme.colors.textInfoStrong, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, lineHeight: 15 },
  // "On leave" hint next to a person in the shift editor — warn, don't block.
  userNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  onLeaveTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceWarningSoft,
  },
  onLeaveTagText: { color: appTheme.colors.textWarningStrong, fontFamily: appTheme.fonts.bodyMedium, fontSize: 10, lineHeight: 14 },
  weekShiftRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  weekShiftBar: { width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: appTheme.colors.primary },
  weekShiftTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceMuted },

  // By-staff week view — one card per person with a vertical Mon–Sun list of slim day rows.
  staffWeekCard: { gap: 10 },
  staffWeekHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  // Weekly planned-hours total, styled like the paper sheet's totals column.
  staffWeekTotal: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 15 },
  staffWeekTotalZero: { color: appTheme.colors.textSubtle },
  staffDayRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 38, paddingVertical: 3 },
  staffDayRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  staffDayLabel: { width: 64, color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11 },
  staffDayLabelToday: { color: appTheme.colors.primary },
  staffDayShifts: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  staffDayShift: { borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceBrandSoft, paddingHorizontal: 8, paddingVertical: 4 },
  staffDayShiftPressed: { opacity: 0.6 },
  staffDayShiftName: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, lineHeight: 15 },
  staffDayShiftTime: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 11, lineHeight: 15 },
  // Approved-leave day marker — informational (info-blue), not pressable.
  staffDayLeave: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceInfoSoft, paddingHorizontal: 8, paddingVertical: 4 },
  staffDayLeaveText: { color: appTheme.colors.textInfoStrong, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, lineHeight: 15 },
  // Ghost "+ Assign" affordance for an empty day.
  staffDayEmpty: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", borderRadius: appTheme.radius.sm, borderWidth: 1, borderStyle: "dashed", borderColor: appTheme.colors.border, paddingHorizontal: 8, paddingVertical: 4 },
  staffDayEmptyText: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, lineHeight: 15 },
  // Quick-assign sheet rows.
  quickTemplateRowDisabled: { opacity: 0.5 },
  quickAlreadyText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11 },

  // My Shifts cards
  dayGroup: { gap: appTheme.spacing.xs },
  dayHeader: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 19, marginTop: 4 },
  myShiftCard: { gap: 12 },
  myShiftCardActive: { borderColor: appTheme.colors.success, borderWidth: 1 },
  myShiftHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  myShiftTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  myShiftName: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 16, lineHeight: 21 },
  metaLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 },
  metaText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13 },
  metaDivider: { color: appTheme.colors.textSubtle, fontSize: 13 },
  chipLine: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  infoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: appTheme.radius.pill,
  },
  infoChipText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  // Assignment-reason chip — info-tinted so the reason reads as a tag, not a problem.
  infoChipReason: { backgroundColor: appTheme.colors.surfaceInfoSoft },
  infoChipReasonText: { color: appTheme.colors.textInfoStrong },
  attBlock: {
    gap: 3,
    padding: 10,
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  attMainRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  attMain: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  attWorked: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 14 },
  attVariance: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, marginLeft: 20 },
  attNote: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, marginLeft: 20 },
  attNotePending: { color: appTheme.colors.danger },
  mutedSmall: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  actBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 11, borderRadius: appTheme.radius.md, backgroundColor: appTheme.colors.primary },
  actBtnOut: { backgroundColor: appTheme.colors.danger },
  actBtnDisabled: { backgroundColor: appTheme.colors.textSubtle },
  actBtnPressed: { opacity: 0.85 },
  actBtnText: { color: appTheme.colors.onPrimary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  actGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  actGhostPressed: { opacity: 0.7 },
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
  segmentRow: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  segment: { flexDirection: "row", backgroundColor: appTheme.colors.surfaceMuted, borderRadius: appTheme.radius.md, padding: 3 },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  exportBtnPressed: { opacity: 0.6 },
  exportBtnDisabled: { opacity: 0.45 },
  exportBtnText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  // Payroll-readiness chips above the timesheet table (mirrors the week-stats chips).
  readinessRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  // Inline "close a forgotten check-out" editor inside the staff sessions drill-down.
  endSessionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceWarningSoft,
  },
  endSessionBtnText: { color: appTheme.colors.textWarningStrong, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  editTimesBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceInfoSoft,
  },
  editTimesBtnText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  endSessionBox: {
    gap: appTheme.spacing.xs,
    padding: 10,
    marginBottom: 6,
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  // Approvals summary (count + total pending hours + bulk approve).
  pendingSummaryCard: { gap: appTheme.spacing.sm },
  pendingSummaryText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 19 },
  segmentBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: appTheme.radius.sm },
  segmentBtnActive: { backgroundColor: appTheme.colors.surface, borderWidth: 1, borderColor: appTheme.colors.border },
  segmentText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  segmentTextActive: { color: appTheme.colors.text },
  tRowPressed: { opacity: 0.6 },
  tdLink: { color: appTheme.colors.primary },
  tdSub: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 15 },
  // Inline assignment-reason segments — info-blue so they stand out from muted metadata.
  reasonText: { color: appTheme.colors.textInfoStrong, fontFamily: appTheme.fonts.bodyMedium },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  sessionDate: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  sessionHours: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 14 },
  approvalActions: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2 },
  rejectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: appTheme.colors.danger },
  rejectBtnText: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  adjustBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: appTheme.colors.border },
  adjustBtnText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  approveBtnFlex: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 999, backgroundColor: appTheme.colors.success },
  sheetBackdrop: { flex: 1, backgroundColor: appTheme.colors.overlayStrong, justifyContent: "center", padding: appTheme.spacing.md },
  sheetBackdropLight: { flex: 1, backgroundColor: appTheme.colors.overlay, justifyContent: "center", padding: appTheme.spacing.md },
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
  overlapHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  overlapHintText: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
  chip: { alignItems: "center", gap: 1, paddingHorizontal: 14, paddingVertical: 8, borderRadius: appTheme.radius.md, borderWidth: 1, borderColor: appTheme.colors.border, backgroundColor: appTheme.colors.surface },
  chipActive: { borderColor: appTheme.colors.primary, backgroundColor: appTheme.colors.surfaceBrandSoft },
  chipPressed: { opacity: 0.7 },
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
  // The week search sits between gap-spaced screen children — drop searchBox's editor margin.
  rotaSearchBox: { marginTop: 0 },
  searchClearPressed: { opacity: 0.5 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appTheme.colors.borderSoft,
  },
  userRowPressed: { opacity: 0.6 },
  // Available-list row for someone on approved leave that day — visible but not selectable.
  userRowOnLeave: { opacity: 0.5 },
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

  // Per-assignee reason control in the shift editor.
  reasonChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  reasonChipText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, maxWidth: 180 },
  // Info tint applied when the current reason isn't "Regular shift".
  reasonChipInfo: { backgroundColor: appTheme.colors.surfaceInfoSoft },
  reasonChipTextInfo: { color: appTheme.colors.textInfoStrong },
  reasonBox: {
    gap: appTheme.spacing.xs,
    padding: 10,
    marginBottom: 6,
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  reasonPickRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reasonPickChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  reasonPickChipActive: { borderColor: appTheme.colors.primary, backgroundColor: appTheme.colors.surfaceBrandSoft },
  reasonPickText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  reasonPickTextActive: { color: appTheme.colors.primary },
  reasonInput: { minHeight: 38, paddingVertical: 8, fontSize: 13 },

  // Leave card on My Shifts.
  leaveBalanceText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 19 },
  // Timesheet review card on My Shifts (staff sign-off of a period).
  reviewCard: { gap: appTheme.spacing.sm },
  reviewCardHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  reviewRow: { gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  reviewRowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
  reviewPeriod: { flexShrink: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 19 },
  reviewPeriodBtn: { flexShrink: 1, gap: 1 },
  reviewPeriodBtnPressed: { opacity: 0.6 },
  reviewPeriodHint: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.body, fontSize: 11, lineHeight: 14 },
  reviewGhostBtn: { justifyContent: "center" },
  // Multiline note input (dispute / resolve modals).
  noteInput: { minHeight: 84, paddingTop: 10, textAlignVertical: "top" },
  // Staff sign-off section on the manager timesheet.
  signoffCard: { gap: appTheme.spacing.sm },
  signoffHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  signoffHeaderActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  // Period heading inside the approved-history modal.
  historyPeriodHead: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 18, marginTop: 8 },
  // "Past timesheets" text action on My Shifts.
  pastLink: { alignSelf: "flex-start", paddingVertical: 4 },
  signoffRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  signoffActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  signoffActionText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  signoffDoneChip: { alignSelf: "flex-start" },
  resendText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },

  tHead: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingBottom: 8 },
  tRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  thName: { flex: 1, color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  thNum: { width: 70, textAlign: "center", color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  tdName: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  tdNum: { width: 70, textAlign: "center", color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 15 },
  tTotal: { borderTopWidth: 1, borderTopColor: appTheme.colors.border },
  tTotalText: { fontFamily: appTheme.fonts.heading },
});
