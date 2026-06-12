import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { leaveApi, type LeaveRequest, type LeaveEntitlement, type LeaveType } from "../../lib/leave";
import { rotaApi, fmtDate, type AssignableUser } from "../../lib/rota";
import { apiErrorMessage } from "../../lib/api";
import { confirmDialog, toast } from "../../components/feedback";
import { X, Check, Plus, Pencil, CalendarOff, CheckCircle2 } from "lucide-react";
import clsx from "clsx";

const LEAVE_TYPES: LeaveType[] = ["Holiday", "Sick", "Unpaid", "Other"];

// Type badges — sky family for info, slate for unpaid.
const TYPE_BADGES: Record<LeaveType, string> = {
  Holiday: "bg-sky-100 text-sky-700",
  Sick: "bg-sky-100 text-sky-700",
  Other: "bg-sky-100 text-sky-700",
  Unpaid: "bg-slate-100 text-slate-600",
};

function TypeBadge({ type, isPaid }: { type: LeaveType; isPaid?: boolean }) {
  return (
    <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium", isPaid === false ? TYPE_BADGES.Unpaid : TYPE_BADGES[type])}>
      {type}{isPaid === false && type !== "Unpaid" ? " (unpaid)" : ""}
    </span>
  );
}

function dayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function dateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function period(r: LeaveRequest) {
  return r.startDate === r.endDate ? dayLabel(r.startDate) : `${dayLabel(r.startDate)} → ${dayLabel(r.endDate)}`;
}
const h = (n: number) => `${Number(n.toFixed(2))}h`;

// Stable key for an assignable person (registered user or external roster member).
const personKey = (p: { userId?: string | null; rotaStaffMemberId?: string | null }) =>
  p.userId ? `u:${p.userId}` : `s:${p.rotaStaffMemberId}`;
const personIds = (key: string) =>
  key.startsWith("u:") ? { userId: key.slice(2) } : { rotaStaffMemberId: key.slice(2) };

export default function LeavePage() {
  const { activeShopId, features, isOwner, isManager } = useAuth();
  const shopId = activeShopId!;
  const qc = useQueryClient();
  const enabled = features.includes("LeaveManagement") && (isOwner || isManager);

  // Default range: this month.
  const [range, setRange] = useState(() => {
    const now = new Date();
    return {
      from: fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  });
  const setMonth = (offset: number) => {
    const now = new Date();
    setRange({
      from: fmtDate(new Date(now.getFullYear(), now.getMonth() + offset, 1)),
      to: fmtDate(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)),
    });
  };

  const [approving, setApproving] = useState<LeaveRequest | null>(null);
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);

  const requestsQ = useQuery({
    queryKey: ["leave-requests", shopId, range.from, range.to],
    queryFn: () => leaveApi.list(shopId, range.from, range.to),
    enabled: !!shopId && enabled,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["leave-requests", shopId] });
    qc.invalidateQueries({ queryKey: ["leave-pending", shopId] }); // nav badge
    qc.invalidateQueries({ queryKey: ["ts-staff", shopId] }); // leave hours feed the timesheet
  };

  const cancelM = useMutation({
    mutationFn: (id: string) => leaveApi.cancel(id),
    onSuccess: () => { toast("Leave cancelled.", "success"); refresh(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const rows = requestsQ.data ?? [];
  const pending = rows.filter((r) => r.status === "Pending");
  const approved = useMemo(
    () => [...rows.filter((r) => r.status === "Approved")].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [rows],
  );

  // Approved leave grouped by start date (already sorted, so insertion order holds).
  const offGroups = useMemo(() => {
    const m = new Map<string, LeaveRequest[]>();
    for (const r of approved) {
      const list = m.get(r.startDate) ?? [];
      list.push(r);
      m.set(r.startDate, list);
    }
    return [...m.entries()];
  }, [approved]);

  if (!enabled) {
    return <div className="card p-6 text-sm text-slate-400">Leave management is not available.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Leave</h1>
          <p className="text-sm text-slate-500">Holiday & absence · {range.from} → {range.to}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            {[
              { label: "This month", offset: 0 },
              { label: "Next month", offset: 1 },
            ].map((q) => (
              <button key={q.label} onClick={() => setMonth(q.offset)} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                {q.label}
              </button>
            ))}
          </div>
          <input type="date" className="input w-auto" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          <input type="date" className="input w-auto" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          <button className="btn-primary" onClick={() => setRecordOpen(true)}><Plus className="h-4 w-4" /> Record leave</button>
        </div>
      </div>

      {requestsQ.isLoading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}

      {/* Pending requests */}
      {!requestsQ.isLoading ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Pending requests</h2>
          {pending.length === 0 ? (
            <div className="card flex items-center gap-2 px-5 py-4 text-sm text-slate-500">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" /> No leave requests awaiting a decision in this range.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {pending.map((r) => (
                <div key={r.id} className="card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{r.userName}</div>
                      <div className="text-xs text-slate-500">{period(r)} · {r.totalDays} day{r.totalDays === 1 ? "" : "s"} · {h(r.totalHours)}</div>
                    </div>
                    <TypeBadge type={r.type} />
                  </div>
                  {r.staffNote ? <div className="mt-2 text-sm italic text-slate-500">“{r.staffNote}”</div> : null}
                  <div className="mt-1 text-xs text-slate-400">Requested {dateTime(r.requestedOn)}</div>
                  <div className="mt-4 flex gap-2">
                    <button className="btn border border-red-200 text-red-600 hover:bg-red-50" onClick={() => setRejecting(r)}>
                      <X className="h-4 w-4" /> Reject
                    </button>
                    <button className="btn-primary ml-auto bg-emerald-600 hover:bg-emerald-700" onClick={() => setApproving(r)}>
                      <Check className="h-4 w-4" /> Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* Who's off — approved leave grouped by start date */}
      {!requestsQ.isLoading ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Who's off</h2>
          {offGroups.length === 0 ? (
            <div className="card flex items-center gap-2 px-5 py-4 text-sm text-slate-400">
              <CalendarOff className="h-5 w-5 text-slate-300" /> No approved leave in this range.
            </div>
          ) : (
            <div className="card divide-y divide-slate-100 overflow-hidden">
              {offGroups.map(([date, list]) => (
                <div key={date} className="px-5 py-3">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{dayLabel(date)}</div>
                  {list.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-slate-800">{r.userName}</span>
                        <TypeBadge type={r.type} isPaid={r.isPaid} />
                        <span className="text-slate-500">{period(r)} · {h(r.totalHours)}</span>
                      </div>
                      <button
                        className="btn border border-red-200 py-1 text-red-600 hover:bg-red-50"
                        disabled={cancelM.isPending}
                        onClick={async () => {
                          if (
                            await confirmDialog({
                              title: "Cancel leave?",
                              message: `Cancel ${r.userName}'s ${r.type.toLowerCase()} leave (${period(r)})?`,
                              confirmLabel: "Cancel leave",
                            })
                          )
                            cancelM.mutate(r.id);
                        }}
                      >
                        <X className="h-4 w-4" /> Cancel
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <EntitlementsSection shopId={shopId} />

      {approving ? <ApproveModal row={approving} onClose={() => setApproving(null)} onSaved={() => { setApproving(null); refresh(); }} /> : null}
      {rejecting ? <RejectModal row={rejecting} onClose={() => setRejecting(null)} onSaved={() => { setRejecting(null); refresh(); }} /> : null}
      {recordOpen ? <RecordLeaveModal shopId={shopId} onClose={() => setRecordOpen(false)} onSaved={() => { setRecordOpen(false); refresh(); }} /> : null}
    </div>
  );
}

// Approve: hoursPerDay is adjustable; Sick/Other can be paid or unpaid (Holiday is always paid, Unpaid never).
function ApproveModal({ row, onClose, onSaved }: { row: LeaveRequest; onClose: () => void; onSaved: () => void }) {
  const [hours, setHours] = useState(String(row.hoursPerDay));
  const [paid, setPaid] = useState(row.isPaid);
  const [note, setNote] = useState("");
  const canTogglePaid = row.type === "Sick" || row.type === "Other";
  const hoursNum = Number(hours);
  const valid = Number.isFinite(hoursNum) && hoursNum > 0 && hoursNum <= 24;

  const approveM = useMutation({
    mutationFn: () =>
      leaveApi.approve(row.id, {
        managerNote: note.trim() || undefined,
        hoursPerDay: hoursNum !== row.hoursPerDay ? hoursNum : undefined,
        isPaid: canTogglePaid ? paid : undefined,
      }),
    onSuccess: () => { toast("Leave approved.", "success"); onSaved(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Approve leave</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          {row.userName} · <TypeBadge type={row.type} /> · {period(row)} ({row.totalDays} day{row.totalDays === 1 ? "" : "s"})
        </p>
        {row.staffNote ? <div className="mb-3 text-sm italic text-slate-500">“{row.staffNote}”</div> : null}

        <label className="label">Hours per day</label>
        <input type="number" min={0.25} max={24} step={0.25} className="input mb-3" value={hours} onChange={(e) => setHours(e.target.value)} />

        {canTogglePaid ? (
          <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
            Paid leave
          </label>
        ) : null}

        <label className="label">Manager note (optional)</label>
        <input className="input mb-4" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. enjoy your break" />

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary bg-emerald-600 hover:bg-emerald-700" disabled={!valid || approveM.isPending} onClick={() => approveM.mutate()}>
            {approveM.isPending ? "Approving…" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ row, onClose, onSaved }: { row: LeaveRequest; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState("");
  const rejectM = useMutation({
    mutationFn: () => leaveApi.reject(row.id, note.trim()),
    onSuccess: () => { toast("Leave rejected.", "success"); onSaved(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Reject leave</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-slate-500">{row.userName} · {row.type} · {period(row)}</p>

        <label className="label">Reason (sent to the staff member)</label>
        <input className="input mb-4" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. too many people off that week" />

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary bg-red-600 hover:bg-red-700" disabled={!note.trim() || rejectM.isPending} onClick={() => rejectM.mutate()}>
            {rejectM.isPending ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Manager records leave on someone's behalf — saved instantly Approved by the backend.
function RecordLeaveModal({ shopId, onClose, onSaved }: { shopId: string; onClose: () => void; onSaved: () => void }) {
  const peopleQ = useQuery({ queryKey: ["rota-assignable", shopId], queryFn: () => rotaApi.assignable(shopId) });
  const [person, setPerson] = useState("");
  const [type, setType] = useState<LeaveType>("Holiday");
  const [startDate, setStartDate] = useState(fmtDate(new Date()));
  const [endDate, setEndDate] = useState(fmtDate(new Date()));
  const [hoursPerDay, setHoursPerDay] = useState("8");
  const [note, setNote] = useState("");

  const hoursNum = Number(hoursPerDay);
  const valid = !!person && !!startDate && !!endDate && endDate >= startDate && Number.isFinite(hoursNum) && hoursNum > 0 && hoursNum <= 24;

  const saveM = useMutation({
    mutationFn: () =>
      leaveApi.create({ shopId, ...personIds(person), type, startDate, endDate, hoursPerDay: hoursNum, staffNote: note.trim() || undefined }),
    onSuccess: () => { toast("Leave recorded.", "success"); onSaved(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const people = peopleQ.data ?? [];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Record leave</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-slate-500">Recorded on a staff member's behalf — saved as approved.</p>

        <label className="label">Staff member</label>
        <select className="input mb-3" value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">Select…</option>
          {people.map((p: AssignableUser) => (
            <option key={personKey(p)} value={personKey(p)}>{p.name}{p.isExternal ? " (external)" : ""}</option>
          ))}
        </select>

        <label className="label">Type</label>
        <select className="input mb-3" value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
          {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label">First day</label>
            <input type="date" className="input" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} />
          </div>
          <div>
            <label className="label">Last day</label>
            <input type="date" className="input" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <label className="label">Hours per day</label>
        <input type="number" min={0.25} max={24} step={0.25} className="input mb-3" value={hoursPerDay} onChange={(e) => setHoursPerDay(e.target.value)} />

        <label className="label">Note (optional)</label>
        <input className="input mb-4" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. booked over the phone" />

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!valid || saveM.isPending} onClick={() => saveM.mutate()}>
            {saveM.isPending ? "Saving…" : "Record leave"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Annual allowance per person — drives the staff-side balance and default hours/day.
function EntitlementsSection({ shopId }: { shopId: string }) {
  const [editing, setEditing] = useState<LeaveEntitlement | "new" | null>(null);
  const q = useQuery({ queryKey: ["leave-entitlements", shopId], queryFn: () => leaveApi.entitlements(shopId), enabled: !!shopId });
  const rows = q.data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Entitlements</h2>
        <button className="btn-ghost" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add entitlement</button>
      </div>
      <div className="card overflow-x-auto">
        {q.isLoading ? <div className="px-5 py-6 text-sm text-slate-500">Loading…</div> : null}
        {!q.isLoading && rows.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-400">No entitlements set — staff won't see a holiday balance.</div>
        ) : null}
        {rows.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-medium">Staff</th>
                <th className="px-5 py-2 font-medium">Year start</th>
                <th className="px-5 py-2 font-medium">Entitled</th>
                <th className="px-5 py-2 font-medium">Usual hours/day</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3">
                    <span className="font-medium text-slate-800">{r.userName}</span>
                    {r.isExternal ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">External</span> : null}
                  </td>
                  <td className="px-5 py-3 text-slate-700">{dayLabel(r.yearStart)}</td>
                  <td className="px-5 py-3 text-slate-700">{h(r.entitledHours)}</td>
                  <td className="px-5 py-3 text-slate-700">{h(r.usualHoursPerDay)}</td>
                  <td className="px-5 py-3 text-right">
                    <button className="btn-ghost py-1" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /> Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {editing ? (
        <EntitlementModal
          shopId={shopId}
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); q.refetch(); }}
        />
      ) : null}
    </section>
  );
}

function EntitlementModal({ shopId, row, onClose, onSaved }: { shopId: string; row: LeaveEntitlement | null; onClose: () => void; onSaved: () => void }) {
  const peopleQ = useQuery({ queryKey: ["rota-assignable", shopId], queryFn: () => rotaApi.assignable(shopId), enabled: !row });
  const [person, setPerson] = useState(row ? personKey(row) : "");
  const [yearStart, setYearStart] = useState(row?.yearStart ?? `${new Date().getFullYear()}-01-01`);
  const [entitled, setEntitled] = useState(row ? String(row.entitledHours) : "224");
  const [perDay, setPerDay] = useState(row ? String(row.usualHoursPerDay) : "8");

  const entitledNum = Number(entitled);
  const perDayNum = Number(perDay);
  const valid =
    !!person && !!yearStart &&
    Number.isFinite(entitledNum) && entitledNum >= 0 &&
    Number.isFinite(perDayNum) && perDayNum > 0 && perDayNum <= 24;

  const saveM = useMutation({
    mutationFn: () =>
      leaveApi.saveEntitlement({ shopId, ...personIds(person), yearStart, entitledHours: entitledNum, usualHoursPerDay: perDayNum }),
    onSuccess: () => { toast("Entitlement saved.", "success"); onSaved(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const people = peopleQ.data ?? [];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{row ? "Edit entitlement" : "Add entitlement"}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <label className="label">Staff member</label>
        {row ? (
          <input className="input mb-3" value={row.userName} disabled />
        ) : (
          <select className="input mb-3" value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Select…</option>
            {people.map((p: AssignableUser) => (
              <option key={personKey(p)} value={personKey(p)}>{p.name}{p.isExternal ? " (external)" : ""}</option>
            ))}
          </select>
        )}

        <label className="label">Holiday year start</label>
        <input type="date" className="input mb-3" value={yearStart} onChange={(e) => setYearStart(e.target.value)} />

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label">Entitled hours/year</label>
            <input type="number" min={0} step={0.5} className="input" value={entitled} onChange={(e) => setEntitled(e.target.value)} />
          </div>
          <div>
            <label className="label">Usual hours/day</label>
            <input type="number" min={0.25} max={24} step={0.25} className="input" value={perDay} onChange={(e) => setPerDay(e.target.value)} />
          </div>
        </div>
        <p className="mb-4 text-xs text-slate-400">e.g. 28 days × 8h = 224h. Hours/day pre-fills new requests.</p>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!valid || saveM.isPending} onClick={() => saveM.mutate()}>
            {saveM.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
