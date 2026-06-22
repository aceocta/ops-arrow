import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { Link } from "react-router-dom";
import { rotaApi, fmtDate, shortTime, sessionIsos, type TimesheetRow, type TimesheetReviewRow, type TimesheetReviewStatus, type TimesheetSession } from "../../lib/rota";
import { leaveApi } from "../../lib/leave";
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
const lh = (hours: number) => `${Number(hours.toFixed(2))}h`;
const staffKeyOf = (r: { userId?: string | null; rotaStaffMemberId?: string | null; userName: string }) =>
  r.userId ?? r.rotaStaffMemberId ?? r.userName;

// Leave hours within the range, as "Holiday 8h" segments (paid types sky, unpaid slate).
function leaveSegments(r: TimesheetRow) {
  const segs: { label: string; paid: boolean }[] = [];
  if (r.holidayHours) segs.push({ label: `Holiday ${lh(r.holidayHours)}`, paid: true });
  if (r.sickHours) segs.push({ label: `Sick ${lh(r.sickHours)}`, paid: true });
  if (r.otherLeaveHours) segs.push({ label: `Other leave ${lh(r.otherLeaveHours)}`, paid: true });
  if (r.unpaidLeaveHours) segs.push({ label: `Unpaid ${lh(r.unpaidLeaveHours)}`, paid: false });
  return segs;
}

// Tailwind's sm breakpoint is 640px; below it we keep the modal, above it we expand inline.
function useIsMobile() {
  const query = "(max-width: 639px)";
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

export default function TimesheetsPage() {
  const { activeShopId, features, isOwner, isManager } = useAuth();
  const shopId = activeShopId!;
  const showCost = features.includes("staff_rota.labour_cost");
  const showLeave = features.includes("LeaveManagement");
  const canManage = isOwner || isManager;
  const canRecord = canManage && features.includes("staff_rota.manual_approval");
  const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);
  const [view, setView] = useState<"staff" | "shift" | "week">("week");
  const [metric, setMetric] = useState<"hours" | "both">("hours");
  const [staffFilter, setStaffFilter] = useState<string[]>([]);
  const [recordOpen, setRecordOpen] = useState(false);
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 6);
    return { from: fmtDate(from), to: fmtDate(to) };
  });
  const [selected, setSelected] = useState<{ row: TimesheetRow; from?: string; to?: string } | null>(null);
  // By-staff rows expand inline on desktop; on mobile they open the modal instead.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const setQuick = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    setRange({ from: fmtDate(from), to: fmtDate(to) });
  };

  const staffQ = useQuery({
    queryKey: ["ts-staff", shopId, range.from, range.to],
    queryFn: () => rotaApi.timesheet(shopId, range.from, range.to),
    // The week grid reuses the by-staff rows as its staff list + per-staff totals.
    enabled: !!shopId && (view === "staff" || view === "week"),
  });
  const shiftQ = useQuery({
    queryKey: ["ts-shift", shopId, range.from, range.to],
    queryFn: () => rotaApi.shiftTimesheet(shopId, range.from, range.to),
    enabled: !!shopId && view === "shift",
  });

  // Week grid: one column per day across the range (a 7-day range = a Mon–Sun week), hours per
  // staff per day. Built by fetching each staff member's sessions and bucketing them by date.
  const weekDays = useMemo(() => {
    const days: string[] = [];
    // Noon avoids DST edges; setDate handles month boundaries cleanly.
    const cur = new Date(`${range.from}T12:00:00`);
    const end = new Date(`${range.to}T12:00:00`);
    while (cur <= end && days.length < 31) {
      days.push(fmtDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [range.from, range.to]);

  // Filter the staff-based views (By staff + Weekly) to the chosen people (empty = all).
  const staffRows = useMemo(() => {
    const all = staffQ.data ?? [];
    return staffFilter.length ? all.filter((r) => staffFilter.includes(staffKeyOf(r))) : all;
  }, [staffQ.data, staffFilter]);
  // Drop any selected staff that aren't in the current range's data.
  useEffect(() => {
    const keys = new Set((staffQ.data ?? []).map(staffKeyOf));
    setStaffFilter((prev) => {
      const next = prev.filter((k) => keys.has(k));
      return next.length === prev.length ? prev : next;
    });
  }, [staffQ.data]);

  const weekStaff = staffRows;
  const weekGridQ = useQuery({
    queryKey: ["ts-week", shopId, range.from, range.to, weekStaff.map((r) => r.userId ?? r.rotaStaffMemberId).join(",")],
    enabled: !!shopId && view === "week" && weekStaff.length > 0,
    queryFn: async () =>
      Promise.all(
        weekStaff.map(async (r) => {
          const sessions = await rotaApi.staffSessions(shopId, { userId: r.userId, rotaStaffMemberId: r.rotaStaffMemberId }, range.from, range.to);
          const byDay: Record<string, number> = {};
          for (const s of sessions) byDay[s.date] = (byDay[s.date] ?? 0) + s.hours;
          return { row: r, byDay };
        }),
      ),
  });

  const total = useMemo(() => {
    const rows = view === "shift" ? shiftQ.data ?? [] : staffRows;
    return rows.reduce((s: number, r: { totalHours: number }) => s + r.totalHours, 0);
  }, [view, staffRows, shiftQ.data]);

  // Wage split: approved vs pending (awaiting approval), so the total is never inflated silently.
  const wage = useMemo(() => {
    const rows = (view === "shift" ? shiftQ.data ?? [] : staffRows) as {
      labourCost?: number | null; pendingLabourCost?: number | null; pendingHours?: number;
    }[];
    const totalCost = rows.reduce((s, r) => s + (r.labourCost ?? 0), 0);
    const pendingCost = rows.reduce((s, r) => s + (r.pendingLabourCost ?? 0), 0);
    const pendingHours = rows.reduce((s, r) => s + (r.pendingHours ?? 0), 0);
    return { total: totalCost, pending: pendingCost, approved: totalCost - pendingCost, pendingHours };
  }, [view, staffRows, shiftQ.data]);

  // Open (not checked out) sessions contribute no hours — flag them so totals aren't trusted blindly.
  const openTotal = useMemo(() => {
    const rows = (view === "shift" ? shiftQ.data ?? [] : staffRows) as { openSessions: number }[];
    return rows.reduce((s, r) => s + r.openSessions, 0);
  }, [view, staffRows, shiftQ.data]);

  const loading =
    view === "shift" ? shiftQ.isLoading : view === "week" ? staffQ.isLoading || weekGridQ.isLoading : staffQ.isLoading;

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
    if (view === "week") {
      downloadCsv(
        `timesheet-weekly_${range.from}_${range.to}`,
        ["Staff", "External", ...weekDays.map((d) => dayLabel(d)), "Total"],
        (weekGridQ.data ?? []).map((g) => [
          g.row.userName,
          g.row.isExternal ? "Yes" : "",
          ...weekDays.map((d) => (g.byDay[d] ? g.byDay[d].toFixed(2) : "")),
          g.row.totalHours.toFixed(2),
        ]),
      );
      return;
    }
    if (view === "staff") {
      downloadCsv(
        `timesheet-by-staff_${range.from}_${range.to}`,
        [
          "Staff", "External", "Shifts worked", "Open sessions", "Total hours", "Reasons",
          ...(showLeave ? ["Holiday hours", "Sick hours", "Other leave hours", "Unpaid leave hours"] : []),
          ...(showCost ? ["Wage", "Pending wage"] : []),
        ],
        staffRows.map((r) => [
          r.userName, r.isExternal ? "Yes" : "", r.shiftsWorked, r.openSessions, r.totalHours.toFixed(2), r.reasons?.join("; ") ?? "",
          ...(showLeave
            ? [(r.holidayHours ?? 0).toFixed(2), (r.sickHours ?? 0).toFixed(2), (r.otherLeaveHours ?? 0).toFixed(2), (r.unpaidLeaveHours ?? 0).toFixed(2)]
            : []),
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

  // Highlight a quick-range chip when the range matches "last N days ending today".
  const isQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    return range.to === fmtDate(end) && range.from === fmtDate(start);
  };

  return (
    <div className="space-y-6">
      {/* Title + primary actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Timesheets</h1>
          <p className="page-subtitle">Worked hours · {range.from} → {range.to}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canRecord ? (
            <button className="btn-primary" onClick={() => setRecordOpen(true)}><Plus className="h-4 w-4" /> Record hours</button>
          ) : null}
          <ExportButton onClick={exportCsv} disabled={loading} />
        </div>
      </div>

      {/* Controls: view (left) · metric + range (right) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="segment">
          {(["week", "staff", "shift"] as const).map((v) => (
            <button key={v} data-active={view === v} onClick={() => setView(v)}>
              {v === "staff" ? "By staff" : v === "shift" ? "By shift" : "Weekly"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view !== "shift" ? (
            <StaffMultiSelect
              options={(staffQ.data ?? []).map((r) => ({ key: staffKeyOf(r), label: `${r.userName}${r.isExternal ? " (external)" : ""}` }))}
              selected={staffFilter}
              onChange={setStaffFilter}
            />
          ) : null}

          {view === "week" && showCost ? (
            <div className="segment">
              {(["hours", "both"] as const).map((m) => (
                <button key={m} data-active={metric === m} onClick={() => setMetric(m)}>
                  {m === "hours" ? "Hours" : "Hours + wage"}
                </button>
              ))}
            </div>
          ) : null}

          <div className="segment">
            {[
              { label: "7 days", days: 7 },
              { label: "30 days", days: 30 },
            ].map((q) => (
              <button key={q.days} data-active={isQuickRange(q.days)} onClick={() => setQuick(q.days)}>
                {q.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <input type="date" className="input w-auto" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            <span className="text-slate-400">→</span>
            <input type="date" className="input w-auto" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Wage split — approved vs awaiting approval */}
      {showCost && !loading && wage.total > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Approved wage</div>
            <div className="mt-1 text-xl font-semibold text-emerald-600">{gbp(wage.approved)}</div>
          </div>
          <Link
            to="/approvals"
            className={clsx("card card-hover block p-4", wage.pending > 0 && "ring-1 ring-amber-200")}
            title="Go to time approvals"
          >
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
              Pending approval
              <ChevronRight className="h-4 w-4" />
            </div>
            <div className="mt-1 text-xl font-semibold text-amber-600">{gbp(wage.pending)}</div>
            {wage.pendingHours > 0 ? <div className="text-xs text-slate-400">{hm(wage.pendingHours)} awaiting approval</div> : null}
          </Link>
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Total if all approved</div>
            <div className="mt-1 text-xl font-semibold text-slate-800">{gbp(wage.total)}</div>
          </div>
        </div>
      ) : null}

      {loading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}

      {view === "staff" ? (
        <div className="card overflow-x-auto">
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
              {staffRows.map((r) => {
                const rowKey = r.userId ?? r.rotaStaffMemberId ?? r.userName;
                const isExpanded = !isMobile && expandedKey === rowKey;
                return (
                  <Fragment key={rowKey}>
                    <tr
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => {
                        if (isMobile) setSelected({ row: r });
                        else setExpandedKey((k) => (k === rowKey ? null : rowKey));
                      }}
                    >
                      <td className="px-5 py-3">
                        <span className="font-medium text-slate-800">{r.userName}</span>
                        {r.isExternal ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">External</span> : null}
                        {r.reasons?.length ? <div className="text-xs font-medium text-sky-700">{r.reasons.join(" · ")}</div> : null}
                        {showLeave && leaveSegments(r).length > 0 ? (
                          <div className="text-xs font-medium">
                            {leaveSegments(r).map((s, i) => (
                              <span key={s.label}>
                                {i > 0 ? <span className="text-slate-300"> · </span> : null}
                                <span className={s.paid ? "text-sky-700" : "text-slate-500"}>{s.label}</span>
                              </span>
                            ))}
                          </div>
                        ) : null}
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
                      <td className="px-5 py-3 text-right">
                        <ChevronRight className={clsx("ml-auto h-4 w-4 text-slate-300 transition-transform", isExpanded && "rotate-90")} />
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr>
                        <td colSpan={showCost ? 6 : 4} className="bg-slate-50/60 px-5 py-3">
                          <StaffWeekBreakdown
                            shopId={shopId}
                            row={r}
                            from={range.from}
                            to={range.to}
                            showWage={showCost}
                            gbp={gbp}
                            onSelectDay={(day) => setSelected({ row: r, from: day, to: day })}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {!loading && staffRows.length === 0 ? (
                <tr><td colSpan={showCost ? 6 : 4} className="px-5 py-6 text-center text-slate-400">No hours in this range.</td></tr>
              ) : null}
            </tbody>
            {staffRows.length > 0 ? (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td className="px-5 py-3">Total</td>
                  <td></td>
                  <td className="px-5 py-3">{hm(total)}</td>
                  {showCost ? <td></td> : null}
                  {showCost ? <td className="px-5 py-3">{gbp(staffRows.reduce((s, r) => s + (r.labourCost ?? 0), 0))}</td> : null}
                  <td></td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : view === "shift" ? (
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
                      {r.reasons?.length ? <div className="text-xs font-medium text-sky-700">{r.reasons.join(" · ")}</div> : null}
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
      ) : (
        <WeekGrid days={weekDays} grid={weekGridQ.data ?? []} loading={loading} metric={showCost ? metric : "hours"} gbp={gbp} onSelect={(row, day) => setSelected(day ? { row, from: day, to: day } : { row })} />
      )}

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

      {selected ? (
        <StaffSessions shopId={shopId} row={selected.row} from={selected.from ?? range.from} to={selected.to ?? range.to} canManage={canManage} showLeave={showLeave} onClose={() => setSelected(null)} />
      ) : null}

      {recordOpen ? <RecordHoursModal shopId={shopId} onClose={() => setRecordOpen(false)} /> : null}
    </div>
  );
}

// Multi-select autocomplete for filtering the timesheet by one or more staff members.
function StaffMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "All staff",
}: {
  options: { key: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const labelOf = (k: string) => options.find((o) => o.key === k)?.label ?? k;
  const selectedSet = new Set(selected);
  const filtered = options.filter(
    (o) => !selectedSet.has(o.key) && o.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const add = (key: string) => {
    onChange([...selected, key]);
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  };
  const remove = (key: string) => onChange(selected.filter((k) => k !== key));

  return (
    <div ref={ref} className="relative w-full sm:w-72">
      <div
        className="input flex cursor-text flex-wrap items-center gap-1.5 !py-1.5 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10"
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {selected.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            {labelOf(k)}
            <button type="button" className="text-brand-500 hover:text-brand-700" onClick={(e) => { e.stopPropagation(); remove(k); }}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="min-w-[6rem] flex-1 border-0 bg-transparent p-0 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
          placeholder={selected.length ? "Add staff…" : placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); if (open && filtered[active]) add(filtered[active].key); }
            else if (e.key === "Escape") { setOpen(false); }
            else if (e.key === "Backspace" && query === "" && selected.length) { remove(selected[selected.length - 1]); }
          }}
        />
      </div>

      {open ? (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {selected.length ? (
            <button
              type="button"
              className="mb-1 block w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-slate-500 hover:bg-slate-50"
              onClick={() => { onChange([]); inputRef.current?.focus(); }}
            >
              Clear all ({selected.length})
            </button>
          ) : null}
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">{query ? "No matches" : "All staff selected"}</div>
          ) : (
            filtered.map((o, i) => (
              <button
                key={o.key}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => add(o.key)}
                className={clsx("block w-full rounded-lg px-3 py-2 text-left text-sm", i === active ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50")}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

// Weekly matrix: staff down the rows, each day of the range across the columns, hours in the cells.
// The Staff column is sticky so it stays visible while the days scroll horizontally.
function WeekGrid({
  days,
  grid,
  loading,
  metric,
  gbp,
  onSelect,
}: {
  days: string[];
  grid: { row: TimesheetRow; byDay: Record<string, number> }[];
  loading: boolean;
  metric: "hours" | "both";
  gbp: (n: number) => string;
  onSelect: (row: TimesheetRow, day?: string) => void;
}) {
  const showWage = metric === "both";
  const rateOf = (g: { row: TimesheetRow }) => g.row.hourlyRate ?? 0;
  const dayHourTotals = days.map((d) => grid.reduce((s, g) => s + (g.byDay[d] ?? 0), 0));
  const dayWageTotals = days.map((d) => grid.reduce((s, g) => s + (g.byDay[d] ?? 0) * rateOf(g), 0));
  const grandHours = grid.reduce((s, g) => s + g.row.totalHours, 0);
  const grandWage = grid.reduce((s, g) => s + g.row.totalHours * rateOf(g), 0);
  // Hours on top; wage underneath only in "Hours + wage" mode.
  const stack = (hoursLabel: string, wageLabel: string | null) =>
    showWage && wageLabel ? (
      <div className="leading-tight">
        <div>{hoursLabel}</div>
        <div className="text-[11px] font-medium text-emerald-600">{wageLabel}</div>
      </div>
    ) : (
      hoursLabel
    );
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="sticky left-0 z-10 border-r border-slate-200 bg-white px-5 py-2 font-medium">Staff</th>
            {days.map((d) => {
              const dt = new Date(`${d}T00:00:00`);
              const weekend = dt.getDay() === 0 || dt.getDay() === 6;
              return (
                <th key={d} className={clsx("border-r border-slate-100 px-3 py-2 text-center font-medium", weekend && "text-slate-300")}>
                  <div>{dt.toLocaleDateString("en-GB", { weekday: "short" })}</div>
                  <div className="text-[11px] font-normal normal-case text-slate-400">
                    {dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </div>
                </th>
              );
            })}
            <th className="px-4 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {grid.map((g) => (
            <tr
              key={g.row.userId ?? g.row.rotaStaffMemberId}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => onSelect(g.row)}
            >
              <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-5 py-3">
                <span className="font-medium text-slate-800">{g.row.userName}</span>
                {g.row.isExternal ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">External</span>
                ) : null}
              </td>
              {days.map((d) => {
                const h = g.byDay[d] ?? 0;
                return (
                  <td
                    key={d}
                    onClick={h > 0 ? (e) => { e.stopPropagation(); onSelect(g.row, d); } : undefined}
                    title={h > 0 ? "View this day" : undefined}
                    className={clsx(
                      "border-r border-slate-100 px-3 py-3 text-center tabular-nums",
                      h > 0 ? "cursor-pointer font-medium text-slate-800 hover:bg-brand-50 hover:text-brand-700" : "text-slate-300",
                    )}
                  >
                    {h > 0 ? stack(hm(h), rateOf(g) > 0 ? gbp(h * rateOf(g)) : null) : "·"}
                  </td>
                );
              })}
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
                {stack(hm(g.row.totalHours), rateOf(g) > 0 ? gbp(g.row.totalHours * rateOf(g)) : null)}
              </td>
            </tr>
          ))}
          {!loading && grid.length === 0 ? (
            <tr><td colSpan={days.length + 2} className="px-5 py-6 text-center text-slate-400">No hours in this range.</td></tr>
          ) : null}
        </tbody>
        {grid.length > 0 ? (
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
              <td className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-5 py-3">Total</td>
              {dayHourTotals.map((t, i) => (
                <td key={i} className="border-r border-slate-100 px-3 py-3 text-center tabular-nums">
                  {t > 0 ? stack(hm(t), gbp(dayWageTotals[i])) : "·"}
                </td>
              ))}
              <td className="px-4 py-3 text-right tabular-nums">{stack(hm(grandHours), gbp(grandWage))}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
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
          <div className="overflow-x-auto">
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
          </div>
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
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
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
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
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

// Weekly-style day breakdown for a single staff member — used inside the inline
// expanded row of the By-staff table. Each day is clickable to drill into that day.
function StaffWeekBreakdown({
  shopId,
  row,
  from,
  to,
  showWage,
  gbp,
  onSelectDay,
}: {
  shopId: string;
  row: TimesheetRow;
  from: string;
  to: string;
  showWage: boolean;
  gbp: (n: number) => string;
  onSelectDay: (day: string) => void;
}) {
  const days = useMemo(() => {
    const out: string[] = [];
    const cur = new Date(`${from}T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    while (cur <= end && out.length < 31) {
      out.push(fmtDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [from, to]);

  const q = useQuery({
    queryKey: ["ts-sessions", shopId, row.userId, row.rotaStaffMemberId, from, to],
    queryFn: () => rotaApi.staffSessions(shopId, { userId: row.userId, rotaStaffMemberId: row.rotaStaffMemberId }, from, to),
  });
  const byDay = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of q.data ?? []) m[s.date] = (m[s.date] ?? 0) + s.hours;
    return m;
  }, [q.data]);
  const total = useMemo(() => Object.values(byDay).reduce((s, h) => s + h, 0), [byDay]);
  const rate = row.hourlyRate ?? 0;
  // Hours on top; wage (hours × rate) underneath when the labour-cost feature is on.
  const stack = (hoursLabel: string, wageLabel: string | null) =>
    showWage && wageLabel ? (
      <div className="leading-tight">
        <div>{hoursLabel}</div>
        <div className="text-[11px] font-medium text-emerald-600">{wageLabel}</div>
      </div>
    ) : (
      hoursLabel
    );

  if (q.isLoading) return <div className="py-4 text-center text-sm text-slate-500">Loading…</div>;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
            {days.map((d) => {
              const dt = new Date(`${d}T00:00:00`);
              const weekend = dt.getDay() === 0 || dt.getDay() === 6;
              return (
                <th key={d} className={clsx("border-r border-slate-100 px-3 py-2 text-center font-medium", weekend && "text-slate-300")}>
                  <div>{dt.toLocaleDateString("en-GB", { weekday: "short" })}</div>
                  <div className="text-[11px] font-normal normal-case text-slate-400">
                    {dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </div>
                </th>
              );
            })}
            <th className="px-4 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {days.map((d) => {
              const h = byDay[d] ?? 0;
              const has = h > 0;
              return (
                <td
                  key={d}
                  onClick={has ? () => onSelectDay(d) : undefined}
                  title={has ? "View this day" : undefined}
                  className={clsx(
                    "border-r border-slate-100 px-3 py-3 text-center tabular-nums",
                    has ? "cursor-pointer font-medium text-slate-800 hover:bg-brand-50 hover:text-brand-700" : "text-slate-300",
                  )}
                >
                  {has ? stack(hm(h), rate > 0 ? gbp(h * rate) : null) : "·"}
                </td>
              );
            })}
            <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
              {stack(hm(total), rate > 0 ? gbp(total * rate) : null)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function StaffSessions({
  shopId,
  row,
  from,
  to,
  canManage,
  showLeave,
  onClose,
}: {
  shopId: string;
  row: TimesheetRow;
  from: string;
  to: string;
  canManage: boolean;
  showLeave: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="card w-full max-w-lg p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{row.userName}</h2>
            <p className="text-sm text-slate-500">{from === to ? dayLabel(from) : `${from} → ${to}`}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <StaffSessionsBody shopId={shopId} row={row} from={from} to={to} canManage={canManage} showLeave={showLeave} />
      </div>
    </div>
  );
}

// The sessions + leave list for one staff member over a range. Shared by the modal
// (mobile) and the inline expanded row (desktop) in the By-staff table.
function StaffSessionsBody({
  shopId,
  row,
  from,
  to,
  canManage,
  showLeave,
}: {
  shopId: string;
  row: TimesheetRow;
  from: string;
  to: string;
  canManage: boolean;
  showLeave: boolean;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["ts-sessions", shopId, row.userId, row.rotaStaffMemberId, from, to],
    queryFn: () => rotaApi.staffSessions(shopId, { userId: row.userId, rotaStaffMemberId: row.rotaStaffMemberId }, from, to),
  });
  // Approved leave days for this person in the range — shown after worked sessions.
  const leaveQ = useQuery({
    queryKey: ["ts-leave-days", shopId, row.userId, row.rotaStaffMemberId, from, to],
    queryFn: () => leaveApi.days(shopId, { userId: row.userId, rotaStaffMemberId: row.rotaStaffMemberId }, from, to),
    enabled: showLeave,
  });
  const leaveDays = showLeave ? leaveQ.data ?? [] : [];

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
    <div className="max-h-[60vh] divide-y divide-slate-100 overflow-auto">
          {q.isLoading ? <div className="py-6 text-center text-sm text-slate-500">Loading…</div> : null}
          {!q.isLoading && (q.data?.length ?? 0) === 0 && leaveDays.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">No sessions.</div>
          ) : null}
          {(q.data ?? []).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">{dayLabel(s.date)}</div>
                <div className="text-xs text-slate-500">
                  {s.shiftName ? `${s.shiftName} · ` : ""}{s.reason ? <span className="font-medium text-sky-700">{`${s.reason} · `}</span> : ""}{clock(s.checkInAt)} → {clock(s.checkOutAt)}
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
          {/* Approved leave days (LeaveManagement) — listed after worked sessions. */}
          {leaveDays.map((d, i) => (
            <div key={`leave-${d.date}-${i}`} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">{dayLabel(d.date)}</div>
                <div className={clsx("text-xs font-medium", d.isPaid ? "text-sky-700" : "text-slate-500")}>
                  {d.type}{!d.isPaid && d.type !== "Unpaid" ? " (unpaid)" : ""}
                </div>
              </div>
              <div className="text-sm font-semibold text-slate-800">{lh(d.hours)}</div>
            </div>
          ))}
        </div>
  );
}
