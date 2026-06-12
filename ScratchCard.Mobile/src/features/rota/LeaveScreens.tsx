import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import {
  approveLeaveRequest,
  cancelLeaveRequest,
  createLeaveRequest,
  getAssignableUsers,
  getLeaveEntitlements,
  getLeaveRequests,
  rejectLeaveRequest,
  saveLeaveEntitlement,
} from "../../api/rotaApi";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { DateRangeQuickPicks } from "../../components/DateRangeQuickPicks";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { confirmDestructive } from "../../utils/confirm";
import { formatDayLabel } from "../../utils/dateLabels";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { toastError, toastSuccess } from "../../components/toast";
import { AssignableUser, LeaveEntitlement, LeaveRequest, LeaveType } from "../../types/models";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

export const LEAVE_TYPES: LeaveType[] = ["Holiday", "Sick", "Unpaid", "Other"];

// "Mon, 1 Jun – Fri, 5 Jun 2026 · 40h" — the standard one-line summary of a request's span.
export const leavePeriodLabel = (r: LeaveRequest) =>
  r.startDate === r.endDate
    ? `${formatDayLabel(r.startDate)} · ${r.totalHours.toFixed(1)}h`
    : `${formatDayLabel(r.startDate)} – ${formatDayLabel(r.endDate)} · ${r.totalHours.toFixed(1)}h`;

function thisMonth() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: formatDateValue(first), to: formatDateValue(last) };
}

// Wide fixed window for the pending-requests query so it stays independent of the range
// selector (and can power a drawer badge later via the ["leave-pending", shopId] key).
function pendingWindow() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 365);
  const to = new Date(now);
  to.setDate(to.getDate() + 365);
  return { from: formatDateValue(from), to: formatDateValue(to) };
}

// "8" / "7.5" → hours, null when not a positive number (also accepts a comma decimal separator).
export function parseHours(value: string): number | null {
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}

const personKey = (u: AssignableUser) => u.userId ?? u.rotaStaffMemberId ?? u.name;

// Default holiday-year start: 1 January of the current year.
const defaultYearStart = () => formatDateValue(new Date(new Date().getFullYear(), 0, 1));

type RecordDraft = {
  person: AssignableUser | null;
  type: LeaveType;
  startDate: string;
  endDate: string;
  hoursPerDay: string;
  note: string;
};

const emptyRecordDraft = (): RecordDraft => ({
  person: null,
  type: "Holiday",
  startDate: formatDateValue(new Date()),
  endDate: formatDateValue(new Date()),
  hoursPerDay: "8",
  note: "",
});

type EntitlementDraft = {
  id: string | null;
  person: AssignableUser | null;
  userName: string;
  yearStart: string;
  entitledHours: string;
  usualHoursPerDay: string;
};

// ---------------------------------------------------------------------------
// Leave management (manager): pending requests, who's off, record leave, entitlements
// ---------------------------------------------------------------------------
export function LeaveManagementScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const queryClient = useQueryClient();
  const [range, setRange] = useState(() => thisMonth());

  // Approve editor (hours/day + paid toggle + optional note).
  const [approveTarget, setApproveTarget] = useState<LeaveRequest | null>(null);
  const [approveHours, setApproveHours] = useState("8");
  const [approvePaid, setApprovePaid] = useState(true);
  const [approveNote, setApproveNote] = useState("");
  // Reject editor (note required).
  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  // Record-on-behalf modal (instantly approved).
  const [recordOpen, setRecordOpen] = useState(false);
  const [record, setRecord] = useState<RecordDraft>(emptyRecordDraft());
  const [personSearch, setPersonSearch] = useState("");
  // Entitlement add/edit modal.
  const [entDraft, setEntDraft] = useState<EntitlementDraft | null>(null);
  const [entSearch, setEntSearch] = useState("");

  const pendingQuery = useQuery({
    queryKey: ["leave-pending", shopId],
    queryFn: async () => {
      const w = pendingWindow();
      const all = await getLeaveRequests(shopId as string, w.from, w.to);
      return all.filter((r) => r.status === "Pending");
    },
    enabled: Boolean(shopId),
  });
  const rangeQuery = useQuery({
    queryKey: ["leave", shopId, range.from, range.to],
    queryFn: () => getLeaveRequests(shopId as string, range.from, range.to),
    enabled: Boolean(shopId),
  });
  const entitlementsQuery = useQuery({
    queryKey: ["leave-entitlements", shopId],
    queryFn: () => getLeaveEntitlements(shopId as string),
    enabled: Boolean(shopId),
  });
  const usersQuery = useQuery({
    queryKey: ["rota-assignable", shopId],
    queryFn: () => getAssignableUsers(shopId as string),
    enabled: Boolean(shopId),
  });

  const pending = pendingQuery.data ?? [];
  // "Who's off" — approved leave in the selected range, grouped by start date.
  const whosOffGroups = useMemo(() => {
    const approved = (rangeQuery.data ?? []).filter((r) => r.status === "Approved");
    const map = new Map<string, LeaveRequest[]>();
    for (const r of approved) {
      const list = map.get(r.startDate) ?? [];
      list.push(r);
      map.set(r.startDate, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rangeQuery.data]);

  const invalidateLeave = () => {
    void queryClient.invalidateQueries({ queryKey: ["leave-pending", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["leave", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["leave-mine", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["leave-balance", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["leave-days", shopId] });
  };

  const approveMutation = useMutation({
    mutationFn: () => {
      const target = approveTarget!;
      const hours = parseHours(approveHours);
      return approveLeaveRequest(target.id, {
        managerNote: approveNote.trim() || undefined,
        hoursPerDay: hours ?? undefined,
        // Paid/unpaid is only a manager decision for Sick/Other; Holiday and Unpaid are fixed.
        isPaid: target.type === "Sick" || target.type === "Other" ? approvePaid : undefined,
      });
    },
    onSuccess: () => {
      setApproveTarget(null);
      toastSuccess("Leave approved.");
      invalidateLeave();
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't approve the leave.")),
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectLeaveRequest(rejectTarget!.id, rejectNote.trim()),
    onSuccess: () => {
      setRejectTarget(null);
      toastSuccess("Leave request rejected.");
      invalidateLeave();
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't reject the leave request.")),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelLeaveRequest(id),
    onSuccess: () => {
      toastSuccess("Leave cancelled.");
      invalidateLeave();
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't cancel the leave.")),
  });

  const recordMutation = useMutation({
    mutationFn: () => {
      const person = record.person!;
      return createLeaveRequest({
        shopId: shopId as string,
        userId: person.rotaStaffMemberId ? undefined : person.userId ?? undefined,
        rotaStaffMemberId: person.rotaStaffMemberId ?? undefined,
        type: record.type,
        startDate: record.startDate,
        endDate: record.endDate,
        hoursPerDay: parseHours(record.hoursPerDay) as number,
        staffNote: record.note.trim() || undefined,
      });
    },
    onSuccess: () => {
      setRecordOpen(false);
      toastSuccess("Leave recorded.");
      invalidateLeave();
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't record the leave.")),
  });

  const entitlementMutation = useMutation({
    mutationFn: () => {
      const d = entDraft!;
      return saveLeaveEntitlement({
        shopId: shopId as string,
        userId: d.person ? (d.person.rotaStaffMemberId ? undefined : d.person.userId ?? undefined) : undefined,
        rotaStaffMemberId: d.person ? d.person.rotaStaffMemberId ?? undefined : undefined,
        yearStart: d.yearStart,
        entitledHours: parseHours(d.entitledHours) as number,
        usualHoursPerDay: parseHours(d.usualHoursPerDay) as number,
      });
    },
    onSuccess: () => {
      setEntDraft(null);
      toastSuccess("Entitlement saved.");
      void queryClient.invalidateQueries({ queryKey: ["leave-entitlements", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["leave-balance", shopId] });
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Couldn't save the entitlement.")),
  });

  const openApprove = (r: LeaveRequest) => {
    setApproveHours(String(r.hoursPerDay));
    setApprovePaid(r.isPaid);
    setApproveNote("");
    setApproveTarget(r);
  };
  const openReject = (r: LeaveRequest) => {
    setRejectNote("");
    setRejectTarget(r);
  };
  const openRecord = () => {
    setRecord(emptyRecordDraft());
    setPersonSearch("");
    setRecordOpen(true);
  };
  const openEditEntitlement = (e: LeaveEntitlement) => {
    setEntSearch("");
    setEntDraft({
      id: e.id,
      // Existing rows keep their person — re-submitting the same ids upserts in place.
      person: { userId: e.userId, rotaStaffMemberId: e.rotaStaffMemberId, isExternal: e.isExternal, name: e.userName, role: "" },
      userName: e.userName,
      yearStart: e.yearStart,
      entitledHours: String(e.entitledHours),
      usualHoursPerDay: String(e.usualHoursPerDay),
    });
  };
  const openAddEntitlement = () => {
    setEntSearch("");
    setEntDraft({ id: null, person: null, userName: "", yearStart: defaultYearStart(), entitledHours: "", usualHoursPerDay: "8" });
  };

  const startCancelApproved = async (r: LeaveRequest) => {
    const ok = await confirmDestructive({
      title: "Cancel leave",
      message: `Cancel ${r.userName}'s approved ${r.type.toLowerCase()} leave (${formatDayLabel(r.startDate)} – ${formatDayLabel(r.endDate)})?`,
      confirmLabel: "Cancel leave",
      cancelLabel: "Keep",
    });
    if (ok) cancelMutation.mutate(r.id);
  };

  // Person rows filtered by the search text — shared by the record-leave and entitlement pickers.
  const filteredPeople = (q: string) => {
    const query = q.trim().toLowerCase();
    return (usersQuery.data ?? []).filter((u) => !query || u.name.toLowerCase().includes(query) || u.role.toLowerCase().includes(query));
  };

  const renderPersonPicker = (
    selected: AssignableUser | null,
    onSelect: (u: AssignableUser) => void,
    search: string,
    setSearch: (v: string) => void,
  ) => (
    <>
      <Text style={styles.fieldLabel}>Person</Text>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={16} color={appTheme.colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search staff"
          placeholderTextColor={appTheme.colors.textSubtle}
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={16} color={appTheme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {usersQuery.isLoading ? <LoadingState inline /> : null}
      <View style={styles.personList}>
        {filteredPeople(search).map((u) => {
          const isSelected = selected !== null && personKey(selected) === personKey(u);
          return (
            <Pressable
              key={personKey(u)}
              style={({ pressed }) => [styles.userRow, pressed ? styles.userRowPressed : null]}
              onPress={() => onSelect(u)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${u.name}`}
              accessibilityState={{ selected: isSelected }}
            >
              <View style={[styles.userAvatar, isSelected ? styles.userAvatarOn : null]}>
                <Text style={styles.userAvatarText}>{initials(u.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName} numberOfLines={1}>{u.name}</Text>
                <Text style={styles.muted}>{u.isExternal ? "External" : u.role}</Text>
              </View>
              {isSelected ? <Ionicons name="checkmark-circle" size={22} color={appTheme.colors.success} /> : null}
            </Pressable>
          );
        })}
        {!usersQuery.isLoading && filteredPeople(search).length === 0 ? (
          <Text style={styles.muted}>No staff match your search.</Text>
        ) : null}
      </View>
    </>
  );

  const renderTypeChips = (value: LeaveType, onChange: (t: LeaveType) => void) => (
    <View style={styles.chipRow}>
      {LEAVE_TYPES.map((t) => {
        const active = value === t;
        return (
          <Pressable
            key={t}
            style={({ pressed }) => [styles.chip, active ? styles.chipActive : null, pressed ? styles.chipPressed : null]}
            onPress={() => onChange(t)}
            accessibilityRole="button"
            accessibilityLabel={`Set the leave type to ${t}`}
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{t}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const recordValid =
    record.person !== null &&
    record.endDate >= record.startDate &&
    parseHours(record.hoursPerDay) !== null;
  const entValid =
    entDraft !== null &&
    entDraft.person !== null &&
    parseHours(entDraft.entitledHours) !== null &&
    parseHours(entDraft.usualHoursPerDay) !== null;
  const showApprovePaidToggle = approveTarget?.type === "Sick" || approveTarget?.type === "Other";

  const refreshing = pendingQuery.isRefetching || rangeQuery.isRefetching || entitlementsQuery.isRefetching;
  const refresh = () => {
    void pendingQuery.refetch();
    void rangeQuery.refetch();
    void entitlementsQuery.refetch();
  };

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={appTheme.colors.primary} colors={[appTheme.colors.primary]} />
      }
    >
      <View style={styles.content}>
        {/* Date range for "Who's off" */}
        <View style={ui.card}>
          <DateRangeQuickPicks from={range.from} to={range.to} onSelect={(from, to) => setRange({ from, to })} style={{ marginBottom: 8 }} />
          <View style={styles.row}>
            <DateTimeField style={{ flex: 1 }} mode="date" value={range.from} onChange={(from) => setRange((r) => ({ ...r, from }))} />
            <DateTimeField style={{ flex: 1 }} mode="date" value={range.to} onChange={(to) => setRange((r) => ({ ...r, to }))} />
          </View>
        </View>

        {/* Pending requests */}
        <SectionHeader
          title="Pending requests"
          icon="hourglass-outline"
          right={pending.length > 0 ? <StatusBadge label={`${pending.length} waiting`} tone="warning" /> : null}
        />
        {pendingQuery.isLoading ? <LoadingState inline /> : null}
        {pendingQuery.isSuccess && pending.length === 0 ? (
          <View style={ui.card}>
            <EmptyState icon="checkmark-done-outline" title="No pending requests" message="New leave requests from staff will appear here for approval." />
          </View>
        ) : null}
        {pending.map((r) => (
          <View key={r.id} style={[ui.card, styles.requestCard]}>
            <View style={styles.requestHead}>
              <Text style={styles.requestName} numberOfLines={1}>{r.userName}</Text>
              <View style={styles.typeTag}>
                <Text style={styles.typeTagText}>{r.type}</Text>
              </View>
            </View>
            <Text style={styles.requestPeriod}>{leavePeriodLabel(r)}</Text>
            <Text style={styles.mutedSmall}>
              {r.totalDays} day{r.totalDays === 1 ? "" : "s"} · {r.hoursPerDay}h/day · requested {formatDayLabel(r.requestedOn.slice(0, 10))}
            </Text>
            {r.staffNote ? <Text style={styles.noteQuote}>“{r.staffNote}”</Text> : null}
            <View style={styles.requestActions}>
              <Pressable
                style={({ pressed }) => [styles.rejectBtn, pressed ? styles.btnPressed : null]}
                onPress={() => openReject(r)}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel={`Reject ${r.userName}'s leave request`}
              >
                <Ionicons name="close" size={16} color={appTheme.colors.danger} />
                <Text style={styles.rejectBtnText}>Reject</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.approveBtn, pressed ? styles.btnPressed : null]}
                onPress={() => openApprove(r)}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel={`Approve ${r.userName}'s leave request`}
              >
                <Ionicons name="checkmark" size={16} color={appTheme.colors.onPrimary} />
                <Text style={styles.approveBtnText}>Approve</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {/* Who's off in the selected range */}
        <SectionHeader title="Who's off" subtitle={`Approved leave · ${formatDayLabel(range.from)} – ${formatDayLabel(range.to)}`} icon="airplane-outline" />
        {rangeQuery.isLoading ? <LoadingState inline /> : null}
        {rangeQuery.isSuccess && whosOffGroups.length === 0 ? (
          <View style={ui.card}>
            <EmptyState icon="sunny-outline" title="No one is off" message="No approved leave in this date range. Adjust the dates above." />
          </View>
        ) : null}
        {whosOffGroups.length > 0 ? (
          <View style={ui.card}>
            {whosOffGroups.map(([date, requests]) => (
              <View key={date}>
                <Text style={styles.groupHead}>{formatDayLabel(date)}</Text>
                {requests.map((r) => (
                  <View key={r.id} style={styles.offRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.offName} numberOfLines={1}>{r.userName}</Text>
                      <Text style={styles.mutedSmall} numberOfLines={1}>
                        <Text style={styles.typeInline}>{r.type}</Text>
                        {` · ${r.startDate === r.endDate ? `${r.hoursPerDay}h` : `until ${formatDayLabel(r.endDate)} · ${r.totalHours.toFixed(1)}h`}${r.isPaid ? "" : " · unpaid"}`}
                      </Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.cancelChip, pressed ? styles.btnPressed : null, cancelMutation.isPending ? styles.btnDisabled : null]}
                      onPress={() => void startCancelApproved(r)}
                      disabled={cancelMutation.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={`Cancel ${r.userName}'s leave starting ${formatDayLabel(r.startDate)}`}
                    >
                      <Text style={styles.cancelChipText}>{cancelMutation.isPending && cancelMutation.variables === r.id ? "Cancelling…" : "Cancel"}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        <PrimaryButton label="Record leave" icon="add-circle-outline" onPress={openRecord} disabled={!shopId} />

        {/* Entitlements */}
        <SectionHeader
          title="Holiday entitlements"
          subtitle="Yearly allowance per person — powers the balance staff see"
          icon="calculator-outline"
          right={
            <Pressable
              style={({ pressed }) => [pressed ? styles.btnPressed : null]}
              onPress={openAddEntitlement}
              accessibilityRole="button"
              accessibilityLabel="Add an entitlement"
            >
              <Text style={styles.linkText}>Add</Text>
            </Pressable>
          }
        />
        {entitlementsQuery.isLoading ? <LoadingState inline /> : null}
        {entitlementsQuery.isSuccess && (entitlementsQuery.data?.length ?? 0) === 0 ? (
          <View style={ui.card}>
            <EmptyState
              icon="calculator-outline"
              title="No entitlements set"
              message="Set each person's yearly holiday hours so balances and remaining allowance can be tracked."
            />
          </View>
        ) : null}
        {(entitlementsQuery.data?.length ?? 0) > 0 ? (
          <View style={ui.card}>
            {(entitlementsQuery.data ?? []).map((e) => (
              <Pressable
                key={e.id}
                style={({ pressed }) => [styles.entRow, pressed ? styles.userRowPressed : null]}
                onPress={() => openEditEntitlement(e)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${e.userName}'s entitlement`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.offName} numberOfLines={1}>{e.userName}</Text>
                  <Text style={styles.mutedSmall}>
                    {e.entitledHours}h/year · {e.usualHoursPerDay}h/day · from {formatDayLabel(e.yearStart)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textSubtle} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {/* Approve — confirm/adjust hours per day, paid flag (Sick/Other) and an optional note */}
      <Modal visible={approveTarget !== null} transparent animationType="fade" onRequestClose={() => setApproveTarget(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="checkmark-circle-outline" size={22} color={appTheme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitleSm}>Approve leave</Text>
                <Text style={styles.muted} numberOfLines={2}>
                  {approveTarget ? `${approveTarget.userName} · ${approveTarget.type} · ${leavePeriodLabel(approveTarget)}` : ""}
                </Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Hours per day</Text>
            <TextInput
              style={styles.externalInput}
              value={approveHours}
              onChangeText={setApproveHours}
              placeholder="8"
              placeholderTextColor={appTheme.colors.textSubtle}
              keyboardType="decimal-pad"
              maxLength={5}
            />
            {parseHours(approveHours) === null ? (
              <Text style={[styles.mutedSmall, { color: appTheme.colors.danger }]}>Enter the hours each leave day counts for.</Text>
            ) : null}

            {showApprovePaidToggle ? (
              <>
                <Text style={styles.fieldLabel}>Pay</Text>
                <View style={styles.chipRow}>
                  {[{ label: "Paid", value: true }, { label: "Unpaid", value: false }].map((opt) => {
                    const active = approvePaid === opt.value;
                    return (
                      <Pressable
                        key={opt.label}
                        style={({ pressed }) => [styles.chip, active ? styles.chipActive : null, pressed ? styles.chipPressed : null]}
                        onPress={() => setApprovePaid(opt.value)}
                        accessibilityRole="button"
                        accessibilityLabel={`Mark this leave as ${opt.label.toLowerCase()}`}
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.externalInput, styles.noteInput]}
              value={approveNote}
              onChangeText={setApproveNote}
              placeholder="e.g. Enjoy your break"
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
              maxLength={500}
            />

            <PrimaryButton
              label={approveMutation.isPending ? "Approving…" : "Approve leave"}
              onPress={() => approveMutation.mutate()}
              disabled={approveMutation.isPending || parseHours(approveHours) === null}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setApproveTarget(null)} disabled={approveMutation.isPending} />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Reject — note required so the staff member knows why */}
      <Modal visible={rejectTarget !== null} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="close-circle-outline" size={22} color={appTheme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitleSm}>Reject request</Text>
                <Text style={styles.muted} numberOfLines={2}>
                  {rejectTarget ? `${rejectTarget.userName} · ${rejectTarget.type} · ${leavePeriodLabel(rejectTarget)}` : ""}
                </Text>
              </View>
            </View>

            {rejectTarget?.staffNote ? <Text style={styles.noteQuote}>“{rejectTarget.staffNote}”</Text> : null}

            <Text style={styles.fieldLabel}>Reason</Text>
            <TextInput
              style={[styles.externalInput, styles.noteInput]}
              value={rejectNote}
              onChangeText={setRejectNote}
              placeholder="Why can't this leave be approved? The staff member will see this."
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
              maxLength={500}
            />

            <PrimaryButton
              label={rejectMutation.isPending ? "Rejecting…" : "Reject request"}
              tone="danger"
              onPress={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending || rejectNote.trim().length === 0}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setRejectTarget(null)} disabled={rejectMutation.isPending} />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Record leave on someone's behalf — saved instantly as approved */}
      <Modal visible={recordOpen} transparent animationType="slide" onRequestClose={() => setRecordOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheetCard, { maxHeight: "88%" }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="airplane-outline" size={22} color={appTheme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitleSm}>Record leave</Text>
                <Text style={styles.muted}>Recorded by a manager — saved as approved.</Text>
              </View>
              <Pressable onPress={() => setRecordOpen(false)} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Close record leave">
                <Ionicons name="close" size={22} color={appTheme.colors.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              {renderPersonPicker(record.person, (u) => setRecord((d) => ({ ...d, person: u })), personSearch, setPersonSearch)}

              <Text style={styles.fieldLabel}>Type</Text>
              {renderTypeChips(record.type, (t) => setRecord((d) => ({ ...d, type: t })))}

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>First day</Text>
                  <DateTimeField
                    mode="date"
                    value={record.startDate}
                    onChange={(v) => setRecord((d) => ({ ...d, startDate: v, endDate: d.endDate < v ? v : d.endDate }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Last day</Text>
                  <DateTimeField mode="date" value={record.endDate} onChange={(v) => setRecord((d) => ({ ...d, endDate: v }))} />
                </View>
              </View>
              {record.endDate < record.startDate ? (
                <Text style={[styles.mutedSmall, { color: appTheme.colors.danger }]}>The last day can't be before the first day.</Text>
              ) : null}

              <Text style={styles.fieldLabel}>Hours per day</Text>
              <TextInput
                style={styles.externalInput}
                value={record.hoursPerDay}
                onChangeText={(v) => setRecord((d) => ({ ...d, hoursPerDay: v }))}
                placeholder="8"
                placeholderTextColor={appTheme.colors.textSubtle}
                keyboardType="decimal-pad"
                maxLength={5}
              />

              <Text style={styles.fieldLabel}>Note (optional)</Text>
              <TextInput
                style={[styles.externalInput, styles.noteInput]}
                value={record.note}
                onChangeText={(v) => setRecord((d) => ({ ...d, note: v }))}
                placeholder="e.g. Agreed over the phone"
                placeholderTextColor={appTheme.colors.textSubtle}
                multiline
                maxLength={500}
              />
            </ScrollView>

            <PrimaryButton
              label={recordMutation.isPending ? "Recording…" : "Record leave"}
              onPress={() => recordMutation.mutate()}
              disabled={recordMutation.isPending || !recordValid}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setRecordOpen(false)} disabled={recordMutation.isPending} />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add / edit an entitlement */}
      <Modal visible={entDraft !== null} transparent animationType="slide" onRequestClose={() => setEntDraft(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheetCard, { maxHeight: "88%" }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="calculator-outline" size={22} color={appTheme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitleSm}>{entDraft?.id ? "Edit entitlement" : "Add entitlement"}</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {entDraft?.id ? entDraft.userName : "Set a person's yearly holiday allowance"}
                </Text>
              </View>
              <Pressable onPress={() => setEntDraft(null)} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Close entitlement editor">
                <Ionicons name="close" size={22} color={appTheme.colors.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              {entDraft && !entDraft.id
                ? renderPersonPicker(entDraft.person, (u) => setEntDraft((d) => (d ? { ...d, person: u } : d)), entSearch, setEntSearch)
                : null}

              <Text style={styles.fieldLabel}>Holiday year starts</Text>
              <DateTimeField mode="date" value={entDraft?.yearStart ?? defaultYearStart()} onChange={(v) => setEntDraft((d) => (d ? { ...d, yearStart: v } : d))} />

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Entitled hours / year</Text>
                  <TextInput
                    style={styles.externalInput}
                    value={entDraft?.entitledHours ?? ""}
                    onChangeText={(v) => setEntDraft((d) => (d ? { ...d, entitledHours: v } : d))}
                    placeholder="224"
                    placeholderTextColor={appTheme.colors.textSubtle}
                    keyboardType="decimal-pad"
                    maxLength={6}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Usual hours / day</Text>
                  <TextInput
                    style={styles.externalInput}
                    value={entDraft?.usualHoursPerDay ?? ""}
                    onChangeText={(v) => setEntDraft((d) => (d ? { ...d, usualHoursPerDay: v } : d))}
                    placeholder="8"
                    placeholderTextColor={appTheme.colors.textSubtle}
                    keyboardType="decimal-pad"
                    maxLength={5}
                  />
                </View>
              </View>
              <Text style={styles.mutedSmall}>
                Example: 28 days × 8h = 224 entitled hours. The usual hours per day pre-fills leave requests.
              </Text>
            </ScrollView>

            <PrimaryButton
              label={entitlementMutation.isPending ? "Saving…" : "Save entitlement"}
              onPress={() => entitlementMutation.mutate()}
              disabled={entitlementMutation.isPending || !entValid}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setEntDraft(null)} disabled={entitlementMutation.isPending} />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: appTheme.spacing.sm, paddingBottom: appTheme.spacing.xl },
  row: { flexDirection: "row", gap: appTheme.spacing.sm },
  muted: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
  mutedSmall: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  fieldLabel: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  linkText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  btnPressed: { opacity: 0.7 },
  btnDisabled: { opacity: 0.45 },

  // Pending request cards
  requestCard: { gap: 8 },
  requestHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  requestName: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  requestPeriod: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  // Leave-type tag — info-blue family, like assignment-reason tags on the rota.
  typeTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceInfoSoft,
  },
  typeTagText: { color: appTheme.colors.textInfoStrong, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11 },
  typeInline: { color: appTheme.colors.textInfoStrong, fontFamily: appTheme.fonts.bodyMedium },
  noteQuote: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, fontStyle: "italic" },
  requestActions: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2 },
  rejectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: appTheme.colors.danger },
  rejectBtnText: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  approveBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 999, backgroundColor: appTheme.colors.success },
  approveBtnText: { color: appTheme.colors.onPrimary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },

  // Who's off
  groupHead: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 18, marginTop: 8 },
  offRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  offName: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  cancelChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  cancelChipText: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },

  // Entitlements
  entRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },

  // Modals (shared sheet styling, matching RotaScreens)
  sheetBackdrop: { flex: 1, backgroundColor: appTheme.colors.overlayStrong, justifyContent: "center", padding: appTheme.spacing.md },
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
  modalBody: { gap: appTheme.spacing.xs, paddingBottom: appTheme.spacing.sm },
  headerBtn: { minWidth: 44, height: 40, alignItems: "center", justifyContent: "center" },
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
  noteInput: { minHeight: 84, paddingTop: 10, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: appTheme.radius.md, borderWidth: 1, borderColor: appTheme.colors.border, backgroundColor: appTheme.colors.surface },
  chipActive: { borderColor: appTheme.colors.primary, backgroundColor: appTheme.colors.surfaceBrandSoft },
  chipPressed: { opacity: 0.7 },
  chipText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 17 },
  chipTextActive: { color: appTheme.colors.primary },

  // Person picker (record leave / entitlement modals)
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  searchInput: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 14, padding: 0 },
  personList: { marginBottom: 4 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appTheme.colors.borderSoft,
  },
  userRowPressed: { opacity: 0.6 },
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
});
