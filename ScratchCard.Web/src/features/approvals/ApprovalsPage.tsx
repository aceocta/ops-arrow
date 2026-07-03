import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { apiErrorMessage } from "../../lib/api";
import { rotaApi, sessionIsos, shortTime, type AttendanceApprovalRow } from "../../lib/rota";
import { confirmDialog, toast } from "../../components/feedback";
import { Check, CheckCheck, X, CheckCircle2 } from "lucide-react";
import clsx from "clsx";

function clock(iso?: string | null) {
  return iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
}
function hm(inIso: string, outIso?: string | null) {
  if (!outIso) return "open";
  const m = Math.max(0, Math.round((new Date(outIso).getTime() - new Date(inIso).getTime()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}
function dateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function toIso(dateStr: string, hhmm: string) {
  return new Date(`${dateStr}T${hhmm}:00`).toISOString();
}
// 30-minute rounding: In-time rounds to the nearest :00/:30, ties (exact :15) round DOWN; Out-time
// rounds to the nearest :00/:30, ties round UP. Operates on the displayed local time.
function roundToHalfHour(iso: string, mode: "in" | "out"): string {
  const d = new Date(iso);
  const mins = d.getMinutes();
  const lower = Math.floor(mins / 30) * 30;
  const mid = lower + 15;
  let rounded: number;
  if (mins < mid) rounded = lower;
  else if (mins > mid) rounded = lower + 30;
  else rounded = mode === "in" ? lower : lower + 30;
  const out = new Date(d);
  out.setMinutes(rounded, 0, 0);
  return out.toISOString();
}
function rangeLabel(inIso: string | null, outIso: string | null) {
  return inIso ? `${clock(inIso)} → ${outIso ? clock(outIso) : "—"}` : "—";
}
function hoursLabel(inIso: string | null, outIso: string | null) {
  return inIso ? hm(inIso, outIso) : "—";
}

type ApproveMode = "employee" | "scheduled" | "rounded" | "custom";

export default function ApprovalsPage() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId!;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AttendanceApprovalRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["rota-pending", shopId],
    queryFn: () => rotaApi.pendingApprovals(shopId),
    enabled: !!shopId,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["rota-pending", shopId] });
    qc.invalidateQueries({ queryKey: ["ts-staff", shopId] });
  };

  const approveM = useMutation({ mutationFn: (id: string) => rotaApi.approve(id), onSuccess: refresh, onError: (e) => toast(apiErrorMessage(e), "error") });
  const rejectM = useMutation({ mutationFn: (id: string) => rotaApi.reject(id), onSuccess: refresh, onError: (e) => toast(apiErrorMessage(e), "error") });

  const rows = q.data ?? [];

  // Group pending entries by staff member for the web table.
  const staffGroups = useMemo(() => {
    const m = new Map<string, { key: string; name: string; rows: AttendanceApprovalRow[] }>();
    for (const r of q.data ?? []) {
      const key = r.userId ?? r.userName;
      const g = m.get(key) ?? { key, name: r.userName, rows: [] };
      g.rows.push(r);
      m.set(key, g);
    }
    return [...m.values()];
  }, [q.data]);

  // Bulk-select state for the web table checkboxes.
  const allIds = rows.map((r) => r.id);
  const selectedCount = selectedIds.size;
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const setMany = (ids: string[], on: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Summary: total pending hours (entries without a check-out contribute 0 and are flagged).
  const pendingHours = rows.reduce(
    (s, r) => (r.checkOutAt ? s + Math.max(0, (new Date(r.checkOutAt).getTime() - new Date(r.checkInAt).getTime()) / 3_600_000) : s),
    0,
  );
  const noCheckout = rows.filter((r) => !r.checkOutAt).length;

  const [bulkRunning, setBulkRunning] = useState(false);
  const approveAll = async () => {
    if (
      !(await confirmDialog({
        title: "Approve all?",
        message: `Approve all ${rows.length} pending entries as submitted?`,
        confirmLabel: "Approve all",
        tone: "primary",
      }))
    )
      return;
    setBulkRunning(true);
    let ok = 0;
    let firstError: unknown = null;
    for (const r of rows) {
      try {
        await rotaApi.approve(r.id);
        ok += 1;
      } catch (e) {
        if (firstError == null) firstError = e;
      }
    }
    setBulkRunning(false);
    if (ok > 0) toast(`Approved ${ok} entr${ok === 1 ? "y" : "ies"}.`, "success");
    if (firstError != null) toast(apiErrorMessage(firstError), "error");
    refresh();
  };

  const approveSelected = async () => {
    const ids = rows.filter((r) => selectedIds.has(r.id)).map((r) => r.id);
    if (ids.length === 0) return;
    if (
      !(await confirmDialog({
        title: "Approve selected?",
        message: `Approve ${ids.length} selected entr${ids.length === 1 ? "y" : "ies"}?`,
        confirmLabel: "Approve",
        tone: "primary",
      }))
    )
      return;
    setBulkRunning(true);
    let ok = 0;
    let firstError: unknown = null;
    for (const id of ids) {
      try {
        await rotaApi.approve(id);
        ok += 1;
      } catch (e) {
        if (firstError == null) firstError = e;
      }
    }
    setBulkRunning(false);
    if (ok > 0) toast(`Approved ${ok} entr${ok === 1 ? "y" : "ies"}.`, "success");
    if (firstError != null) toast(apiErrorMessage(firstError), "error");
    setSelectedIds(new Set());
    refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Time Approvals</h1>
        <p className="text-sm text-slate-500">Manually entered times awaiting your approval</p>
      </div>

      {rows.length > 0 ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{rows.length} entr{rows.length === 1 ? "y" : "ies"}</span>
            <span className="text-slate-400"> · </span>
            {pendingHours.toFixed(1)}h pending
            {noCheckout > 0 ? <span className="text-amber-600"> · {noCheckout} without check-out</span> : null}
          </div>
          <div className="flex items-center gap-2">
            {selectedCount > 0 ? (
              <button className="btn-primary" disabled={bulkRunning} onClick={approveSelected}>
                <Check className="h-4 w-4" /> Approve selected ({selectedCount})
              </button>
            ) : null}
            <button
              className="btn-primary bg-emerald-600 hover:bg-emerald-700"
              disabled={bulkRunning || approveM.isPending || rejectM.isPending}
              onClick={approveAll}
            >
              <CheckCheck className="h-4 w-4" /> {bulkRunning ? "Approving…" : "Approve all"}
            </button>
          </div>
        </div>
      ) : null}

      {q.isLoading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}
      {!q.isLoading && rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <div className="text-sm font-medium text-slate-700">All caught up — nothing to approve.</div>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <>
          {/* Web view: table */}
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="w-10 px-5 py-2.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = selectedCount > 0 && !allSelected; }}
                      onChange={() => setMany(allIds, !allSelected)}
                    />
                  </th>
                  <th className="px-5 py-2.5 font-medium">Shift</th>
                  <th className="px-5 py-2.5 font-medium">Scheduled</th>
                  <th className="px-5 py-2.5 font-medium">Entered</th>
                  <th className="px-5 py-2.5 font-medium">Worked</th>
                  <th className="px-5 py-2.5 font-medium">Submitted</th>
                  <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffGroups.map((g) => {
                  const gHours = g.rows.reduce(
                    (s, r) => (r.checkOutAt ? s + Math.max(0, (new Date(r.checkOutAt).getTime() - new Date(r.checkInAt).getTime()) / 3_600_000) : s),
                    0,
                  );
                  const groupIds = g.rows.map((r) => r.id);
                  const groupAll = groupIds.every((id) => selectedIds.has(id));
                  const groupSome = groupIds.some((id) => selectedIds.has(id));
                  return (
                    <Fragment key={g.key}>
                      <tr className="border-t-2 border-slate-200 bg-slate-50/70">
                        <td colSpan={7} className="px-5 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <label className="flex cursor-pointer items-center gap-3">
                              <input
                                type="checkbox"
                                className="h-4 w-4 cursor-pointer"
                                checked={groupAll}
                                ref={(el) => { if (el) el.indeterminate = groupSome && !groupAll; }}
                                onChange={(e) => setMany(groupIds, e.target.checked)}
                              />
                              <span className="text-sm font-semibold text-slate-800">{g.name}</span>
                            </label>
                            <span className="text-xs text-slate-500">
                              {g.rows.length} entr{g.rows.length === 1 ? "y" : "ies"} · {gHours.toFixed(1)}h pending
                            </span>
                          </div>
                        </td>
                      </tr>
                      {g.rows.map((r) => (
                        <tr key={r.id} className={clsx("hover:bg-slate-50", selectedIds.has(r.id) && "bg-brand-50/40")}>
                          <td className="px-5 py-3 align-top">
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer"
                              checked={selectedIds.has(r.id)}
                              onChange={() => toggleOne(r.id)}
                            />
                          </td>
                          <td className="px-5 py-3 align-top">
                            <div className="text-slate-700">{r.shiftName ?? "Not rostered"}</div>
                            {r.shiftDate ? <div className="text-xs text-slate-500">{r.shiftDate}</div> : null}
                            {r.notes ? <div className="mt-0.5 text-xs italic text-slate-400">“{r.notes}”</div> : null}
                          </td>
                          <td className="px-5 py-3 align-top text-slate-700">{r.shiftStart ? `${shortTime(r.shiftStart)}–${shortTime(r.shiftEnd)}` : "—"}</td>
                          <td className="px-5 py-3 align-top text-slate-700">{clock(r.checkInAt)} → {r.checkOutAt ? clock(r.checkOutAt) : "—"}</td>
                          <td className="px-5 py-3 align-top font-medium text-slate-800">
                            {r.checkOutAt ? hm(r.checkInAt, r.checkOutAt) : <span className="text-amber-600">open</span>}
                          </td>
                          <td className="px-5 py-3 align-top text-xs text-slate-400">{dateTime(r.submittedOn)}</td>
                          <td className="px-5 py-3 align-top">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                title="Reject"
                                disabled={bulkRunning}
                                onClick={async () => { if (await confirmDialog({ title: "Reject times?", message: `Reject ${r.userName}'s manually entered times?`, confirmLabel: "Reject" })) rejectM.mutate(r.id); }}
                              >
                                <X className="h-4 w-4" />
                              </button>
                              <button
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                title="Review & approve time"
                                disabled={bulkRunning}
                                onClick={() => setEditing(r)}
                              >
                                <Check className="h-4 w-4" /> Approve
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile view: cards */}
          <div className="grid grid-cols-1 gap-4 lg:hidden">
            {rows.map((r) => (
              <div key={r.id} className="card p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{r.userName}</div>
                    <div className="text-xs text-slate-500">{r.shiftName ? `${r.shiftName} · ` : ""}{r.shiftDate ?? "Not rostered"}</div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Manual</span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3 text-sm">
                  <Field label="Scheduled" value={r.shiftStart ? `${shortTime(r.shiftStart)}–${shortTime(r.shiftEnd)}` : "—"} />
                  <Field label="Entered" value={`${clock(r.checkInAt)} → ${r.checkOutAt ? clock(r.checkOutAt) : "—"}`} />
                  <Field label="Worked" value={hm(r.checkInAt, r.checkOutAt)} />
                </div>

                {r.notes ? <div className="mt-2 text-sm italic text-slate-500">“{r.notes}”</div> : null}
                <div className="mt-1 text-xs text-slate-400">Submitted {dateTime(r.submittedOn)}</div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn border border-red-200 text-red-600 hover:bg-red-50" disabled={bulkRunning} onClick={async () => { if (await confirmDialog({ title: "Reject times?", message: `Reject ${r.userName}'s manually entered times?`, confirmLabel: "Reject" })) rejectM.mutate(r.id); }}>
                    <X className="h-4 w-4" /> Reject
                  </button>
                  <button className="btn-primary ml-auto bg-emerald-600 hover:bg-emerald-700" onClick={() => setEditing(r)} disabled={bulkRunning}>
                    <Check className="h-4 w-4" /> Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {editing ? <TimeApprovalModal row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} /> : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-medium text-slate-800">{value}</div>
    </div>
  );
}

// The Time Approval popup: review the employee-entered time and pick the final payable time from the
// 4 options (or a custom adjustment). Nothing is forced to a fixed length — the options only suggest.
function TimeApprovalModal({ row, onClose, onSaved }: { row: AttendanceApprovalRow; onClose: () => void; onSaved: () => void }) {
  const employeeIn = row.checkInAt;
  const employeeOut = row.checkOutAt ?? null;
  const hasSchedule = !!(row.shiftStart && row.shiftDate);
  const schedIn = hasSchedule ? toIso(row.shiftDate as string, shortTime(row.shiftStart)) : null;
  const schedOut = hasSchedule && row.shiftEnd ? toIso((row.shiftEndDate ?? row.shiftDate) as string, shortTime(row.shiftEnd)) : null;
  const roundedIn = roundToHalfHour(employeeIn, "in");
  const roundedOut = employeeOut ? roundToHalfHour(employeeOut, "out") : null;

  const [mode, setMode] = useState<ApproveMode>("employee");
  const [customIn, setCustomIn] = useState(() => clock(employeeIn));
  const [customOut, setCustomOut] = useState(() => (employeeOut ? clock(employeeOut) : shortTime(row.shiftEnd) || ""));

  const customBase = row.shiftDate ?? row.checkInAt.slice(0, 10);
  const customInIso = customIn ? toIso(customBase, customIn) : null;
  const customOutIso = customIn && customOut && customOut !== customIn ? sessionIsos(customBase, customIn, customOut).checkOutAt : null;

  const approved: { in: string; out: string | null } =
    mode === "scheduled"
      ? { in: schedIn ?? employeeIn, out: schedOut }
      : mode === "rounded"
        ? { in: roundedIn, out: roundedOut }
        : mode === "custom"
          ? { in: customInIso ?? employeeIn, out: customOutIso }
          : { in: employeeIn, out: employeeOut };

  const customInvalid = mode === "custom" && (!customIn || customOut === customIn);

  const saveM = useMutation({
    mutationFn: () => {
      // Option 1 approves the entered times as-is; the others save the chosen payable time (the server
      // keeps the original in SubmittedCheckIn/OutAt for audit).
      if (mode === "employee") return rotaApi.approve(row.id);
      return rotaApi.adjust(row.id, { checkInAt: approved.in, checkOutAt: approved.out ?? undefined });
    },
    onSuccess: onSaved,
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const options: { key: ApproveMode; label: string; available: boolean; range: string; hours: string }[] = [
    { key: "employee", label: "Employee entered time", available: true, range: rangeLabel(employeeIn, employeeOut), hours: hoursLabel(employeeIn, employeeOut) },
    { key: "scheduled", label: "Scheduled shift time", available: hasSchedule, range: hasSchedule ? rangeLabel(schedIn, schedOut) : "No scheduled shift", hours: hasSchedule ? hoursLabel(schedIn, schedOut) : "—" },
    { key: "rounded", label: "Rounded time (30 min)", available: true, range: rangeLabel(roundedIn, roundedOut), hours: hoursLabel(roundedIn, roundedOut) },
    { key: "custom", label: "Custom manager adjustment", available: true, range: customInIso ? rangeLabel(customInIso, customOutIso) : "Choose the times", hours: customInIso ? hoursLabel(customInIso, customOutIso) : "—" },
  ];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Approve time</h2>
            <p className="text-sm text-slate-500">{row.userName} · {row.shiftName ?? "Not rostered"}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-slate-500">Employee entered {rangeLabel(employeeIn, employeeOut)} · {hoursLabel(employeeIn, employeeOut)}</p>

        <div className="space-y-2">
          {options.map((opt) => {
            const active = mode === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={!opt.available || saveM.isPending}
                onClick={() => opt.available && setMode(opt.key)}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition",
                  active ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50",
                  !opt.available && "cursor-not-allowed opacity-50",
                )}
              >
                <span className={clsx("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-brand-600" : "border-slate-300")}>
                  {active ? <span className="h-2.5 w-2.5 rounded-full bg-brand-600" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800">{opt.label}</span>
                  <span className="block truncate text-sm text-slate-500">{opt.range}</span>
                </span>
                <span className={clsx("shrink-0 text-xl font-semibold tabular-nums", active ? "text-brand-700" : "text-slate-800")}>{opt.hours}</span>
              </button>
            );
          })}
        </div>

        {mode === "custom" ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label">In time</label>
              <input type="time" className="input" value={customIn} onChange={(e) => setCustomIn(e.target.value)} />
            </div>
            <div>
              <label className="label">Out time</label>
              <input type="time" className="input" value={customOut} onChange={(e) => setCustomOut(e.target.value)} />
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="font-medium text-slate-800">Approved: {rangeLabel(approved.in, approved.out)} · {hoursLabel(approved.in, approved.out)}</span>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={saveM.isPending}>Cancel</button>
          <button className="btn-primary bg-emerald-600 hover:bg-emerald-700" disabled={customInvalid || saveM.isPending} onClick={() => saveM.mutate()}>
            <Check className="h-4 w-4" /> {saveM.isPending ? "Approving…" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}
