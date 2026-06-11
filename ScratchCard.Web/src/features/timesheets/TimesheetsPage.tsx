import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { Link } from "react-router-dom";
import { rotaApi, fmtDate, shortTime, sessionIsos, type TimesheetRow, type TimesheetReviewRow, type TimesheetReviewStatus, type TimesheetSession } from "../../lib/rota";
import { downloadCsv } from "../../lib/csv";
import { apiErrorMessage } from "../../lib/api";
import { confirmDialog, toast } from "../../components/feedback";
import ExportButton from "../../components/ExportButton";
import { X, ChevronRight, Plus, Lock, Unlock, Check, Send, History } from "lucide-react";
import clsx from "clsx";

function clock(iso?: string | null) {
  return iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
}
function dayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function longDay(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    weekday: d.toLocaleDateString("en-GB", { weekday: "long" }),
    date: d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  };
}
function hm(hours: number) {
  const m = Math.round(hours * 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export default function TimesheetsPage() {
  const { activeShopId, features, isOwner, isManager } = useAuth();
  const shopId = activeShopId!;
  const showCost = features.includes("staff_rota.labour_cost");
  const canManage = isOwner || isManager;
  const canRecord = canManage && features.includes("staff_rota.manual_approval");
  const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);
  const [view, setView] = useState<"staff" | "shift">("staff");
  const [recordOpen, setRecordOpen] = useState(false);
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 6);
    return { from: fmtDate(from), to: fmtDate(to) };
  });
  const [selected, setSelected] = useState<{ row: TimesheetRow } | null>(null);

  const setQuick = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    setRange({ from: fmtDate(from), to: fmtDate(to) });
  };

  const staffQ = useQuery({
    queryKey: ["ts-staff", shopId, range.from, range.to],
    queryFn: () => rotaApi.timesheet(shopId, range.from, range.to),
    enabled: !!shopId && view === "staff",
  });
  const shiftQ = useQuery({
    queryKey: ["ts-shift", shopId, range.from, range.to],
    queryFn: () => rotaApi.shiftTimesheet(shopId, range.from, range.to),
    enabled: !!shopId && view === "shift",
  });

  const total = useMemo(() => {
    const rows = view === "staff" ? staffQ.data ?? [] : shiftQ.data ?? [];
    return rows.reduce((s: number, r: { totalHours: number }) => s + r.totalHours, 0);
  }, [view, staffQ.data, shiftQ.data]);

  // Wage split: approved vs pending (awaiting approval), so the total is never inflated silently.
  const wage = useMemo(() => {
    const rows = (view === "staff" ? staffQ.data ?? [] : shiftQ.data ?? []) as {
      labourCost?: number | null; pendingLabourCost?: number | null; pendingHours?: number;
    }[];
    const totalCost = rows.reduce((s, r) => s + (r.labourCost ?? 0), 0);
    const pendingCost = rows.reduce((s, r) => s + (r.pendingLabourCost ?? 0), 0);
    const pendingHours = rows.reduce((s, r) => s + (r.pendingHours ?? 0), 0);
    return { total: totalCost, pending: pendingCost, approved: totalCost - pendingCost, pendingHours };
  }, [view, staffQ.data, shiftQ.data]);

  // Open (not checked out) sessions contribute no hours — flag them so totals aren't trusted blindly.
  const openTotal = useMemo(() => {
    const rows = (view === "staff" ? staffQ.data ?? [] : shiftQ.data ?? []) as { openSessions: number }[];
    return rows.reduce((s, r) => s + r.openSessions, 0);
  }, [view, staffQ.data, shiftQ.data]);

  const loading = view === "staff" ? staffQ.isLoading : shiftQ.isLoading;

  // Pending manual approvals — same endpoint/key the nav badge uses, narrowed to the selected range.
  const pendingApprovalsQ = useQuery({
    queryKey: ["rota-pending", shopId],
    queryFn: () => rotaApi.pendingApprovals(shopId),
    enabled: !!shopId && canRecord,
  });
  const pendingApprovalCount = useMemo(() => {
    return (pendingApprovalsQ.data ?? []).filter((r) => {
      const d = r.shiftDate ?? (r.checkInAt ? fmtDate(new Date(r.checkInAt)) : null);
      return !d || (d >= range.from && d <= range.to);
    }).length;
  }, [pendingApprovalsQ.data, range.from, range.to]);

  const exportCsv = () => {
    if (view === "staff") {
      downloadCsv(
        `timesheet-by-staff_${range.from}_${range.to}`,
        ["Staff", "External", "Shifts worked", "Open sessions", "Total hours", "Reasons", ...(showCost ? ["Wage", "Pending wage"] : [])],
        (staffQ.data ?? []).map((r) => [
          r.userName, r.isExternal ? "Yes" : "", r.shiftsWorked, r.openSessions, r.totalHours.toFixed(2), r.reasons?.join("; ") ?? "",
          ...(showCost ? [r.labourCost != null ? r.labourCost.toFixed(2) : "", (r.pendingLabourCost ?? 0).toFixed(2)] : []),
        ]),
      );
    } else {
      downloadCsv(
        `timesheet-by-shift_${range.from}_${range.to}`,
        ["Date", "Shift", "Start", "End", "Employees", "Total hours", "Reasons", ...(showCost ? ["Wage", "Pending wage"] : [])],
        (shiftQ.data ?? []).map((r) => [
          r.date, r.shiftName, shortTime(r.startTime), shortTime(r.endTime), r.staffCount, r.totalHours.toFixed(2), r.reasons?.join("; ") ?? "",
          ...(showCost ? [r.labourCost != null ? r.labourCost.toFixed(2) : "", (r.pendingLabourCost ?? 0).toFixed(2)] : []),
        ]),
      );
    }
  };

  // Group the by-shift rows under their date (backend returns them date-ordered, so insertion order holds).
  const shiftGroups = useMemo(() => {
    const m = new Map<string, typeof shiftQ.data>();
    for (const r of shiftQ.data ?? []) {
      const list = (m.get(r.date) ?? []) as NonNullable<typeof shiftQ.data>;
      list.push(r);
      m.set(r.date, list);
    }
    return [...m.entries()] as [string, NonNullable<typeof shiftQ.data>][];
  }, [shiftQ.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Timesheets</h1>
          <p className="text-sm text-slate-500">Worked hours · {range.from} → {range.to}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            {[
              { label: "7 days", days: 7 },
              { label: "30 days", days: 30 },
            ].map((q) => (
              <button key={q.days} onClick={() => setQuick(q.days)} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                {q.label}
              </button>
            ))}
          </div>
          <input type="date" className="input w-auto" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          <input type="date" className="input w-auto" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          {canRecord ? (
            <button className="btn-primary" onClick={() => setRecordOpen(true)}><Plus className="h-4 w-4" /> Record hours</button>
          ) : null}
          <ExportButton onClick={exportCsv} disabled={loading} />
        </div>
      </div>

      {/* View toggle */}
      <div className="flex w-fit rounded-lg border border-slate-200 bg-white p-1">
        {(["staff", "shift"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={clsx("rounded-md px-4 py-1.5 text-sm font-medium", view === v ? "bg-brand-600 text-white" : "text-slate-600")}
          >
            {v === "staff" ? "By staff" : "By shift"}
          </button>
        ))}
      </div>

      {/* Wage split — approved vs awaiting approval */}
      {showCost && !loading && wage.total > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Approved wage</div>
            <div className="mt-1 text-xl font-semibold text-emerald-600">{gbp(wage.approved)}</div>
          </div>
          <div className={clsx("card p-4", wage.pending > 0 && "ring-1 ring-amber-200")}>
            <div className="text-xs uppercase tracking-wide text-slate-400">Pending approval</div>
            <div className="mt-1 text-xl font-semibold text-amber-600">{gbp(wage.pending)}</div>
            {wage.pendingHours > 0 ? <div className="text-xs text-slate-400">{hm(wage.pendingHours)} awaiting approval</div> : null}
          </div>
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Total if all approved</div>
            <div className="mt-1 text-xl font-semibold text-slate-800">{gbp(wage.total)}</div>
          </div>
        </div>
      ) : null}

      {canManage ? <PayrollSection shopId={shopId} from={range.from} to={range.to} /> : null}

      {!loading && openTotal > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {openTotal} open session{openTotal === 1 ? "" : "s"} — hours missing from totals.
        </div>
      ) : null}

      {pendingApprovalCount > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <Link to="/approvals" className="font-medium underline hover:text-amber-900">
            {pendingApprovalCount} manual {pendingApprovalCount === 1 ? "entry" : "entries"} awaiting approval
          </Link>
        </div>
      ) : null}

      {loading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}

      {view === "staff" ? (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-medium">Staff</th>
                <th className="px-5 py-2 font-medium">Shifts</th>
                <th className="px-5 py-2 font-medium">Hours</th>
                {showCost ? <th className="px-5 py-2 font-medium">Rate</th> : null}
                {showCost ? <th className="px-5 py-2 font-medium">Cost</th> : null}
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(staffQ.data ?? []).map((r) => (
                <tr key={r.userId ?? r.rotaStaffMemberId} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected({ row: r })}>
                  <td className="px-5 py-3">
                    <span className="font-medium text-slate-800">{r.userName}</span>
                    {r.isExternal ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">External</span> : null}
                    {r.reasons?.length ? <div className="text-xs text-slate-500">{r.reasons.join(" · ")}</div> : null}
                  </td>
                  <td className="px-5 py-3 text-slate-700">{r.shiftsWorked}{r.openSessions > 0 ? ` (+${r.openSessions})` : ""}</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{hm(r.totalHours)}</td>
                  {showCost ? <td className="px-5 py-3 text-slate-700">{r.hourlyRate != null ? gbp(r.hourlyRate) : <span className="text-amber-600">— set</span>}</td> : null}
                  {showCost ? (
                    <td className="px-5 py-3 font-medium text-slate-800">
                      {r.labourCost != null ? gbp(r.labourCost) : "—"}
                      {r.pendingLabourCost ? <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{gbp(r.pendingLabourCost)} pending</span> : null}
                    </td>
                  ) : null}
                  <td className="px-5 py-3 text-right"><ChevronRight className="ml-auto h-4 w-4 text-slate-300" /></td>
                </tr>
              ))}
              {!loading && (staffQ.data?.length ?? 0) === 0 ? (
                <tr><td colSpan={showCost ? 6 : 4} className="px-5 py-6 text-center text-slate-400">No hours in this range.</td></tr>
              ) : null}
            </tbody>
            {(staffQ.data?.length ?? 0) > 0 ? (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td className="px-5 py-3">Total</td>
                  <td></td>
                  <td className="px-5 py-3">{hm(total)}</td>
                  {showCost ? <td></td> : null}
                  {showCost ? <td className="px-5 py-3">{gbp((staffQ.data ?? []).reduce((s, r) => s + (r.labourCost ?? 0), 0))}</td> : null}
                  <td></td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-medium">Date</th>
                <th className="px-5 py-2 font-medium">Shift</th>
                <th className="px-5 py-2 font-medium">Staff</th>
                <th className="px-5 py-2 font-medium">Hours</th>
                {showCost ? <th className="px-5 py-2 font-medium">Wage</th> : null}
              </tr>
            </thead>
            <tbody>
              {shiftGroups.map(([date, rows]) =>
                rows.map((r, i) => (
                  <tr
                    key={`${r.date}-${r.shiftName}`}
                    className={clsx("hover:bg-slate-50", i === 0 ? "border-t-2 border-slate-200" : "border-t border-slate-100")}
                  >
                    <td className="whitespace-nowrap px-5 py-3 align-top">
                      {i === 0 ? <span className="font-semibold text-slate-800">{dayLabel(date)}</span> : null}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      <span className="font-medium text-slate-800">{r.shiftName}</span>
                      {r.startTime ? <span className="ml-1 text-xs text-slate-400">{shortTime(r.startTime)}–{shortTime(r.endTime)}</span> : null}
                      {r.reasons?.length ? <div className="text-xs text-slate-500">{r.reasons.join(" · ")}</div> : null}
                    </td>
                    <td className="px-5 py-3 text-slate-700">{r.staffCount}</td>
                    <td className="px-5 py-3 font-medium text-slate-800">{hm(r.totalHours)}</td>
                    {showCost ? (
                      <td className="px-5 py-3 font-medium text-slate-800">
                        {r.labourCost != null ? gbp(r.labourCost) : "—"}
                        {r.pendingLabourCost ? <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{gbp(r.pendingLabourCost)} pending</span> : null}
                      </td>
                    ) : null}
                  </tr>
                )),
              )}
              {!loading && shiftGroups.length === 0 ? (
                <tr><td colSpan={showCost ? 5 : 4} className="px-5 py-6 text-center text-slate-400">No hours in this range.</td></tr>
              ) : null}
            </tbody>
            {shiftGroups.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td className="px-5 py-3">Total</td>
                  <td></td>
                  <td></td>
                  <td className="px-5 py-3">{hm(total)}</td>
                  {showCost ? <td className="px-5 py-3">{gbp((shiftQ.data ?? []).reduce((s, r) => s + (r.labourCost ?? 0), 0))}</td> : null}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}

      {selected ? (
        <StaffSessions shopId={shopId} row={selected.row} from={range.from} to={range.to} canManage={canManage} onClose={() => setSelected(null)} />
      ) : null}

      {recordOpen ? <RecordHoursModal shopId={shopId} onClose={() => setRecordOpen(false)} /> : null}
    </div>
  );
}

const REVIEW_BADGES: Record<TimesheetReviewStatus, { label: string; cls: string }> = {
  PendingStaff: { label: "Awaiting staff", cls: "bg-amber-100 text-amber-700" },
  Confirmed: { label: "Confirmed", cls: "bg-brand-50 text-brand-700" },
  Disputed: { label: "Issue raised", cls: "bg-red-100 text-red-700" },
  ManagerApproved: { label: "Approved", cls: "bg-emerald-100 text-emerald-700" },
};

// Manager-side payroll close-out: staff sign-off reviews for the selected range + the period lock.
function PayrollSection({ shopId, from, to }: { shopId: string; from: string; to: string }) {
  const qc = useQueryClient();
  const [resolving, setResolving] = useState<TimesheetReviewRow | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const lockQ = useQuery({ queryKey: ["ts-lock", shopId], queryFn: () => rotaApi.timesheetLock(shopId), enabled: !!shopId });
  const reviewsQ = useQuery({
    queryKey: ["ts-reviews", shopId, from, to],
    queryFn: () => rotaApi.timesheetReviews(shopId, from, to),
    enabled: !!shopId,
  });
  const refreshReviews = () => qc.invalidateQueries({ queryKey: ["ts-reviews", shopId] });

  const lockM = useMutation({
    mutationFn: (lockedThrough: string | null) => rotaApi.setTimesheetLock({ shopId, lockedThrough }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["ts-lock", shopId] });
      toast(d ? `Payroll locked through ${d.lockedThrough}.` : "Payroll period unlocked.", "success");
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  const requestM = useMutation({
    mutationFn: () => rotaApi.requestTimesheetReviews({ shopId, from, to }),
    onSuccess: (rows) => {
      refreshReviews();
      toast(`Sign-off requested from ${rows.length} staff.`, "success");
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  const approveM = useMutation({
    mutationFn: (id: string) => rotaApi.approveTimesheetReview(id),
    onSuccess: () => {
      refreshReviews();
      toast("Timesheet approved.", "success");
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const lock = lockQ.data ?? null;
  const reviews = reviewsQ.data ?? [];
  const allApproved = reviews.length > 0 && reviews.every((r) => r.status === "ManagerApproved");

  // Lock target: end of the selected range, but never today or later (API requires a past date).
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return fmtDate(d);
  })();
  const lockTarget = to < yesterday ? to : yesterday; // yyyy-MM-dd compares lexicographically
  const canLockToTarget = !lock || lock.lockedThrough < lockTarget;

  const requestReviews = async () => {
    const resend = reviews.length > 0;
    if (
      await confirmDialog({
        title: resend ? "Re-send sign-off requests?" : "Request staff sign-off?",
        message: `Staff will be asked to confirm their hours for ${from} → ${to}.`,
        confirmLabel: "Send",
        tone: "primary",
      })
    )
      requestM.mutate();
  };

  const lockPeriod = async () => {
    if (
      await confirmDialog({
        title: `Lock payroll through ${lockTarget}?`,
        message: "Timesheets up to this date can no longer be changed by staff or managers.",
        confirmLabel: "Lock period",
        tone: "primary",
      })
    )
      lockM.mutate(lockTarget);
  };

  const unlockPeriod = async () => {
    if (
      await confirmDialog({
        title: "Unlock payroll period?",
        message: `Attendance through ${lock?.lockedThrough} will become editable again.`,
        confirmLabel: "Unlock",
      })
    )
      lockM.mutate(null);
  };

  return (
    <div className="space-y-3">
      {/* Payroll lock */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", lock ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400")}>
            {lock ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </span>
          <div>
            <div className="text-sm font-semibold text-slate-800">Payroll lock</div>
            <div className="text-xs text-slate-500">
              {lockQ.isLoading
                ? "Loading…"
                : lock
                  ? `Locked through ${lock.lockedThrough}${lock.lockedByName ? ` by ${lock.lockedByName}` : ""}`
                  : "No period locked — hours can still be changed."}
            </div>
            {allApproved && canLockToTarget ? (
              <div className="mt-0.5 text-xs font-medium text-emerald-600">All staff approved — lock the period to finish.</div>
            ) : null}
          </div>
        </div>
        {!lockQ.isLoading ? (
          <div className="flex gap-2">
            {lock ? (
              <button className="btn border border-red-200 text-red-600 hover:bg-red-50" disabled={lockM.isPending} onClick={unlockPeriod}>
                <Unlock className="h-4 w-4" /> Unlock
              </button>
            ) : null}
            {canLockToTarget ? (
              <button className="btn-primary" disabled={lockM.isPending} onClick={lockPeriod}>
                <Lock className="h-4 w-4" /> {lockM.isPending ? "Locking…" : `Lock period to ${lockTarget}`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Staff sign-off */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Staff sign-off</h2>
            <p className="text-xs text-slate-500">{from} → {to}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setHistoryOpen(true)}>
              <History className="h-4 w-4" /> Approved history
            </button>
            <button className="btn-primary" disabled={requestM.isPending} onClick={requestReviews}>
              <Send className="h-4 w-4" /> {requestM.isPending ? "Sending…" : reviews.length > 0 ? "Re-send requests" : "Request staff reviews"}
            </button>
          </div>
        </div>
        {reviewsQ.isLoading ? <div className="border-t border-slate-100 px-5 py-6 text-sm text-slate-500">Loading…</div> : null}
        {!reviewsQ.isLoading && reviews.length === 0 ? (
          <div className="border-t border-slate-100 px-5 py-6 text-sm text-slate-400">No sign-off requested for this range yet.</div>
        ) : null}
        {reviews.length > 0 ? (
          <table className="w-full border-t border-slate-100 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-medium">Staff</th>
                <th className="px-5 py-2 font-medium">Hours</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reviews.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 font-medium text-slate-800">{r.userName}</td>
                  <td className="px-5 py-3 text-slate-700">
                    {hm(r.totalHours)}
                    {r.openSessions > 0 ? (
                      <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">+{r.openSessions} open</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3">
                    <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium", REVIEW_BADGES[r.status].cls)}>
                      {REVIEW_BADGES[r.status].label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {r.status === "PendingStaff" || r.status === "Confirmed" ? (
                      <button
                        className="btn border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        disabled={approveM.isPending}
                        onClick={() => approveM.mutate(r.id)}
                      >
                        <Check className="h-4 w-4" /> Approve
                      </button>
                    ) : r.status === "Disputed" ? (
                      <button className="btn border border-red-200 text-red-600 hover:bg-red-50" onClick={() => setResolving(r)}>
                        Resolve
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {resolving ? (
        <ResolveReviewModal row={resolving} onClose={() => setResolving(null)} onSaved={() => { setResolving(null); refreshReviews(); }} />
      ) : null}

      {historyOpen ? <ApprovedHistoryModal shopId={shopId} onClose={() => setHistoryOpen(false)} /> : null}
    </div>
  );
}

// Past approved sign-off periods — read-only; only fetched while the modal is mounted.
function ApprovedHistoryModal({ shopId, onClose }: { shopId: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["ts-review-history", shopId],
    queryFn: () => rotaApi.timesheetReviewHistory(shopId),
    enabled: !!shopId,
  });

  // Group rows by period, preserving the API's newest-first order. Only approved rows belong here.
  const groups = useMemo(() => {
    const m = new Map<string, TimesheetReviewRow[]>();
    for (const r of q.data ?? []) {
      if (r.status !== "ManagerApproved") continue;
      const key = `${r.periodFrom}|${r.periodTo}`;
      const list = m.get(key) ?? [];
      list.push(r);
      m.set(key, list);
    }
    return [...m.entries()];
  }, [q.data]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Approved history</h2>
            <p className="text-sm text-slate-500">Past timesheet sign-offs</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[60vh] space-y-4 overflow-auto">
          {q.isLoading ? <div className="py-6 text-center text-sm text-slate-500">Loading…</div> : null}
          {!q.isLoading && groups.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">No approved timesheets yet.</div>
          ) : null}
          {groups.map(([key, rows]) => {
            const [pFrom, pTo] = key.split("|");
            return (
              <div key={key}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {dayLabel(pFrom.slice(0, 10))} – {dayLabel(pTo.slice(0, 10))}
                </div>
                <div className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="truncate font-medium text-slate-800">{r.userName}</span>
                      <span className="shrink-0 text-slate-600">
                        {hm(r.totalHours)}
                        {r.resolvedOn ? (
                          <span className="ml-2 text-xs text-slate-400">approved {dayLabel(fmtDate(new Date(r.resolvedOn)))}</span>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Disputed review: show what the staff member raised, then either fix & re-ask or reject & approve.
function ResolveReviewModal({ row, onClose, onSaved }: { row: TimesheetReviewRow; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState("");

  const resolveM = useMutation({
    mutationFn: (reRequest: boolean) =>
      rotaApi.resolveTimesheetReview(row.id, { approved: !reRequest, managerNote: note.trim() || undefined, reRequestConfirmation: reRequest }),
    onSuccess: (_d, reRequest) => {
      toast(reRequest ? "Sent back to staff to re-confirm." : "Issue rejected — timesheet approved.", "success");
      onSaved();
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Resolve issue</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-slate-500">{row.userName} · {row.periodFrom} → {row.periodTo} · {hm(row.totalHours)}</p>

        <div className="mb-3 rounded-lg border border-red-100 bg-red-50/50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-red-400">Staff note</div>
          <div className="text-sm italic text-slate-700">{row.staffNote ? `“${row.staffNote}”` : "No note left."}</div>
        </div>

        <label className="label">Manager note (optional)</label>
        <input className="input mb-4" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. adjusted Tuesday's check-out" />

        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn border border-brand-200 text-brand-700 hover:bg-brand-50" disabled={resolveM.isPending} onClick={() => resolveM.mutate(true)}>
            Fixed — ask to re-confirm
          </button>
          <button className="btn-primary bg-emerald-600 hover:bg-emerald-700" disabled={resolveM.isPending} onClick={() => resolveM.mutate(false)}>
            Reject issue & approve
          </button>
        </div>
      </div>
    </div>
  );
}

// Manager records worked hours for an external (roster-only) staff member. Saved already approved.
function RecordHoursModal({ shopId, onClose }: { shopId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const membersQ = useQuery({ queryKey: ["rota-staff-members", shopId], queryFn: () => rotaApi.staffMembers(shopId) });
  const [memberId, setMemberId] = useState("");
  const [date, setDate] = useState(fmtDate(new Date()));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [notes, setNotes] = useState("");

  const save = useMutation({
    mutationFn: () => {
      const { checkInAt, checkOutAt } = sessionIsos(date, start, end);
      return rotaApi.recordManual({ shopId, rotaStaffMemberId: memberId, checkInAt, checkOutAt, notes: notes.trim() || undefined });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ts-staff"] });
      qc.invalidateQueries({ queryKey: ["ts-shift"] });
      toast("Hours recorded.", "success");
      onClose();
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const members = membersQ.data ?? [];
  const valid = memberId && start && end;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Record hours</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-slate-500">For an external (roster-only) staff member. Saved as approved.</p>

        <label className="label">Staff member</label>
        <select className="input mb-3" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Select…</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {!membersQ.isLoading && members.length === 0 ? (
          <p className="mb-3 text-xs text-amber-600">No external staff yet — add them from the Rota when assigning a shift.</p>
        ) : null}

        <label className="label">Date</label>
        <input type="date" className="input mb-3" value={date} onChange={(e) => setDate(e.target.value)} />

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label">Start</label>
            <input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">End {end <= start ? <span className="text-xs text-slate-400">(+1 day)</span> : null}</label>
            <input type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <label className="label">Notes (optional)</label>
        <input className="input mb-4" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. covered late shift" />

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Record hours"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StaffSessions({
  shopId,
  row,
  from,
  to,
  canManage,
  onClose,
}: {
  shopId: string;
  row: TimesheetRow;
  from: string;
  to: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["ts-sessions", shopId, row.userId, row.rotaStaffMemberId, from, to],
    queryFn: () => rotaApi.staffSessions(shopId, { userId: row.userId, rotaStaffMemberId: row.rotaStaffMemberId }, from, to),
  });

  // Per-row chosen end time for open sessions, defaulting to "now".
  const [defaultEnd] = useState(() => new Date().toTimeString().slice(0, 5));
  const [endTimes, setEndTimes] = useState<Record<string, string>>({});

  const endM = useMutation({
    mutationFn: ({ s, time }: { s: TimesheetSession; time: string }) => {
      // Check-out on the session's date at the chosen time; at/before check-in means overnight → next day.
      let out = new Date(`${s.date}T${time}:00`);
      if (out.getTime() <= new Date(s.checkInAt).getTime()) out = new Date(out.getTime() + 24 * 60 * 60 * 1000);
      return rotaApi.adjust(s.id, { checkInAt: s.checkInAt, checkOutAt: out.toISOString() });
    },
    onSuccess: () => {
      toast("Session ended.", "success");
      q.refetch();
      qc.invalidateQueries({ queryKey: ["ts-staff"] });
      qc.invalidateQueries({ queryKey: ["ts-shift"] });
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="card w-full max-w-lg p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{row.userName}</h2>
            <p className="text-sm text-slate-500">{from} → {to}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[60vh] divide-y divide-slate-100 overflow-auto">
          {q.isLoading ? <div className="py-6 text-center text-sm text-slate-500">Loading…</div> : null}
          {!q.isLoading && (q.data?.length ?? 0) === 0 ? <div className="py-6 text-center text-sm text-slate-400">No sessions.</div> : null}
          {(q.data ?? []).map((s) => (
            <div key={s.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">{dayLabel(s.date)}</div>
                <div className="text-xs text-slate-500">
                  {s.shiftName ? `${s.shiftName} · ` : ""}{s.reason ? `${s.reason} · ` : ""}{clock(s.checkInAt)} → {clock(s.checkOutAt)}
                  {s.entryMethod === "Manual" ? (s.isApproved ? "  · manual" : "  · pending") : ""}
                </div>
              </div>
              {s.checkOutAt ? (
                <div className="text-sm font-semibold text-slate-800">{hm(s.hours)}</div>
              ) : canManage ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    className="input w-auto py-1 text-sm"
                    value={endTimes[s.id] ?? defaultEnd}
                    onChange={(e) => setEndTimes((m) => ({ ...m, [s.id]: e.target.value }))}
                  />
                  <button
                    className="btn border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    disabled={endM.isPending}
                    onClick={() => endM.mutate({ s, time: endTimes[s.id] ?? defaultEnd })}
                  >
                    <Check className="h-4 w-4" /> End session
                  </button>
                </div>
              ) : (
                <div className="text-sm font-semibold text-slate-800">open</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
