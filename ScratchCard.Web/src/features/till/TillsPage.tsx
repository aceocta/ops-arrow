import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { tillsApi, type Till } from "../../lib/tills";
import { apiErrorMessage } from "../../lib/api";
import { toast } from "../../components/feedback";
import { Plus, Power, Trash2, Pencil, Wand2 } from "lucide-react";
import clsx from "clsx";

export default function TillsPage() {
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId!;
  const companyId = activeShop?.companyId ?? null;
  const qc = useQueryClient();
  const key = ["tills", shopId];
  const q = useQuery({ queryKey: key, queryFn: () => tillsApi.list(shopId, true), enabled: !!shopId });
  const [editing, setEditing] = useState<Till | "new" | null>(null);
  const [showDefaults, setShowDefaults] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: key });
  const toggle = useMutation({
    mutationFn: (t: Till) => tillsApi.update(t.id, { name: t.name, code: t.code ?? undefined, isActive: !t.isActive, defaultFloat: t.defaultFloat }),
    onSuccess: invalidate,
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => tillsApi.remove(id),
    onSuccess: () => { invalidate(); toast("Till removed.", "success"); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const tills = q.data ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Tills</h1>
          <p className="page-subtitle">Cash points / drawers reconciled separately at this shop</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => setShowDefaults(true)}><Wand2 className="h-4 w-4" /> Set up defaults</button>
          <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add till</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2 font-medium">Name</th>
              <th className="px-5 py-2 font-medium">Code</th>
              <th className="px-5 py-2 font-medium">Default float</th>
              <th className="px-5 py-2 font-medium">Status</th>
              <th className="px-5 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tills.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">{t.name}</td>
                <td className="px-5 py-3 text-slate-500">{t.code || "—"}</td>
                <td className="px-5 py-3 text-slate-700">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(t.defaultFloat || 0)}</td>
                <td className="px-5 py-3">
                  <span className={clsx("badge", t.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                    {t.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" title="Edit" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></button>
                    <button className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" title={t.isActive ? "Deactivate" : "Activate"} onClick={() => toggle.mutate(t)}><Power className="h-4 w-4" /></button>
                    <button className="rounded-lg p-2 text-red-500 transition hover:bg-red-50" title="Remove" onClick={() => { if (confirm(`Remove "${t.name}"?`)) remove.mutate(t.id); }}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!q.isLoading && tills.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">No tills yet. Add one — or leave empty to reconcile a single drawer.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {editing ? <TillEditor shopId={shopId} till={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); invalidate(); }} /> : null}
      {showDefaults ? <DefaultsModal shopId={shopId} companyId={companyId} onClose={() => setShowDefaults(false)} onDone={invalidate} /> : null}
    </div>
  );
}

function DefaultsModal({ shopId, companyId, onClose, onDone }: { shopId: string; companyId: string | null; onClose: () => void; onDone: () => void }) {
  const apply = useMutation({
    mutationFn: (body: { shopId?: string; companyId?: string }) => tillsApi.applyDefaults(body),
    onSuccess: (r) => { toast(`Default till data applied to ${r.seeded} shop${r.seeded === 1 ? "" : "s"}.`, "success"); onDone(); onClose(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-800">Set up default till data</h2>
        <p className="text-sm text-slate-500">
          Adds the common payment types (Cash, Card, Credit Card, Fuel Card, Cheque) and a default "Till 1" — only where they're
          missing, so your existing tills and payment types are never changed.
        </p>
        <div className="space-y-2 pt-1">
          <button className="btn-primary w-full justify-center" disabled={apply.isPending} onClick={() => apply.mutate({ shopId })}>
            Apply to this shop
          </button>
          {companyId ? (
            <button className="btn-ghost w-full justify-center" disabled={apply.isPending} onClick={() => apply.mutate({ companyId })}>
              Apply to all shops in my company
            </button>
          ) : null}
          <button className="btn-ghost w-full justify-center" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function TillEditor({ shopId, till, onClose, onSaved }: { shopId: string; till: Till | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(till?.name ?? "");
  const [code, setCode] = useState(till?.code ?? "");
  const [defaultFloat, setDefaultFloat] = useState(till?.defaultFloat != null ? String(till.defaultFloat) : "");
  const save = useMutation({
    mutationFn: () => till
      ? tillsApi.update(till.id, { name: name.trim(), code: code.trim() || undefined, isActive: till.isActive, defaultFloat: Number(defaultFloat) || 0 })
      : tillsApi.create({ shopId, name: name.trim(), code: code.trim() || undefined, defaultFloat: Number(defaultFloat) || 0 }),
    onSuccess: () => { toast("Saved.", "success"); onSaved(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">{till ? "Edit till" : "Add till"}</h2>
        <label className="label">Name</label>
        <input className="input mb-3" placeholder="e.g. Front counter" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <label className="label">Code (optional)</label>
        <input className="input mb-3" placeholder="e.g. T1" value={code} onChange={(e) => setCode(e.target.value)} />
        <label className="label">Default float (£)</label>
        <input className="input mb-4" inputMode="decimal" placeholder="e.g. 150" value={defaultFloat} onChange={(e) => setDefaultFloat(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
