import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { payRatesApi } from "../../lib/payRates";
import { rotaApi, type AssignableUser } from "../../lib/rota";
import { apiErrorMessage } from "../../lib/api";
import { toast } from "../../components/feedback";
import { Plus, Trash2 } from "lucide-react";

const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);
const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function PayRatesPage() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId!;
  const qc = useQueryClient();
  const key = ["pay-rates", shopId];
  const ratesQ = useQuery({ queryKey: key, queryFn: () => payRatesApi.list(shopId), enabled: !!shopId });
  const staffQ = useQuery({ queryKey: ["assignable", shopId], queryFn: () => rotaApi.assignable(shopId), enabled: !!shopId });
  const [adding, setAdding] = useState(false);

  const remove = useMutation({
    mutationFn: (id: string) => payRatesApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast("Rate removed.", "success"); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const rates = ratesQ.data ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Pay rates</h1>
          <p className="page-subtitle">Effective-dated hourly rates — drive labour cost on timesheets</p>
        </div>
        <button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add rate</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2 font-medium">Staff</th>
              <th className="px-5 py-2 font-medium">Hourly rate</th>
              <th className="px-5 py-2 font-medium">Effective from</th>
              <th className="px-5 py-2 font-medium">Notes</th>
              <th className="px-5 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rates.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">{r.staffName}{r.isExternal ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">External</span> : null}</td>
                <td className="px-5 py-3 text-slate-800">{gbp(r.hourlyRate)}</td>
                <td className="px-5 py-3 text-slate-700">{r.effectiveFrom}</td>
                <td className="px-5 py-3 text-slate-500">{r.notes || "—"}</td>
                <td className="px-5 py-3 text-right">
                  <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Remove" onClick={() => { if (confirm("Remove this rate?")) remove.mutate(r.id); }}><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {!ratesQ.isLoading && rates.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">No rates set. Add one to enable labour cost.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {adding ? (
        <RateEditor
          shopId={shopId}
          staff={staffQ.data ?? []}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); qc.invalidateQueries({ queryKey: key }); }}
        />
      ) : null}
    </div>
  );
}

function RateEditor({ shopId, staff, onClose, onSaved }: { shopId: string; staff: AssignableUser[]; onClose: () => void; onSaved: () => void }) {
  const [staffKey, setStaffKey] = useState("");
  const [rate, setRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(fmtDate(new Date()));
  const [notes, setNotes] = useState("");

  const save = useMutation({
    mutationFn: () => {
      const sel = staff.find((s) => (s.userId ?? s.rotaStaffMemberId) === staffKey);
      if (!sel) throw new Error("Select a staff member.");
      return payRatesApi.set({
        shopId,
        userId: sel.userId ?? undefined,
        rotaStaffMemberId: sel.rotaStaffMemberId ?? undefined,
        hourlyRate: Number(rate) || 0,
        effectiveFrom,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => { toast("Rate saved.", "success"); onSaved(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Add pay rate</h2>
        <label className="label">Staff</label>
        <select className="input mb-3" value={staffKey} onChange={(e) => setStaffKey(e.target.value)}>
          <option value="">Select staff…</option>
          {staff.map((s) => {
            const k = s.userId ?? s.rotaStaffMemberId ?? "";
            return <option key={k} value={k}>{s.name}{s.isExternal ? " (external)" : ""}</option>;
          })}
        </select>
        <label className="label">Hourly rate (£)</label>
        <input className="input mb-3" inputMode="decimal" placeholder="e.g. 11.44" value={rate} onChange={(e) => setRate(e.target.value)} />
        <label className="label">Effective from</label>
        <input type="date" className="input mb-3" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        <label className="label">Notes (optional)</label>
        <input className="input mb-4" placeholder="e.g. April pay review" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!staffKey || !rate.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
