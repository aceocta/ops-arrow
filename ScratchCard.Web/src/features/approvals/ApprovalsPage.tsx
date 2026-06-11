import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { apiErrorMessage } from "../../lib/api";
import { rotaApi, sessionIsos, shortTime, type AttendanceApprovalRow } from "../../lib/rota";
import { confirmDialog, toast } from "../../components/feedback";
import { Check, CheckCheck, X, Pencil, CheckCircle2 } from "lucide-react";

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

export default function ApprovalsPage() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId!;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AttendanceApprovalRow | null>(null);

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
          <button
            className="btn-primary bg-emerald-600 hover:bg-emerald-700"
            disabled={bulkRunning || approveM.isPending || rejectM.isPending}
            onClick={approveAll}
          >
            <CheckCheck className="h-4 w-4" /> {bulkRunning ? "Approving…" : "Approve all"}
          </button>
        </div>
      ) : null}

      {q.isLoading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}
      {!q.isLoading && rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <div className="text-sm font-medium text-slate-700">All caught up — nothing to approve.</div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

            <div className="mt-4 flex gap-2">
              <button className="btn border border-red-200 text-red-600 hover:bg-red-50" disabled={bulkRunning} onClick={async () => { if (await confirmDialog({ title: "Reject times?", message: `Reject ${r.userName}'s manually entered times?`, confirmLabel: "Reject" })) rejectM.mutate(r.id); }}>
                <X className="h-4 w-4" /> Reject
              </button>
              <button className="btn-ghost" disabled={bulkRunning} onClick={() => setEditing(r)}>
                <Pencil className="h-4 w-4" /> Adjust
              </button>
              <button className="btn-primary ml-auto bg-emerald-600 hover:bg-emerald-700" onClick={() => approveM.mutate(r.id)} disabled={approveM.isPending || bulkRunning}>
                <Check className="h-4 w-4" /> Approve
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing ? <AdjustModal row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} /> : null}
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

function AdjustModal({ row, onClose, onSaved }: { row: AttendanceApprovalRow; onClose: () => void; onSaved: () => void }) {
  const [inT, setInT] = useState(clock(row.checkInAt).replace(/[^\d:]/g, "") || "09:00");
  const [outT, setOutT] = useState(row.checkOutAt ? clock(row.checkOutAt).replace(/[^\d:]/g, "") : shortTime(row.shiftEnd) || "17:00");

  const saveM = useMutation({
    mutationFn: () => {
      const dateStr = row.shiftDate ?? row.checkInAt.slice(0, 10);
      const { checkInAt, checkOutAt } = sessionIsos(dateStr, inT, outT);
      return rotaApi.adjust(row.id, { checkInAt, checkOutAt: outT ? checkOutAt : undefined });
    },
    onSuccess: onSaved,
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="card w-full max-w-md p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Adjust times</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-slate-500">{row.userName} · {row.shiftName}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Check in</label>
            <input type="time" className="input" value={inT} onChange={(e) => setInT(e.target.value)} />
          </div>
          <div>
            <label className="label">Check out</label>
            <input type="time" className="input" value={outT} onChange={(e) => setOutT(e.target.value)} />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">Saving approves the entry with the adjusted times.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!inT || outT === inT || saveM.isPending} onClick={() => saveM.mutate()}>
            {saveM.isPending ? "Saving…" : "Save & approve"}
          </button>
        </div>
      </div>
    </div>
  );
}
