import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { tillsApi, type Till } from "../../lib/tills";
import { apiErrorMessage } from "../../lib/api";
import { toast } from "../../components/feedback";
import { Plus, Power, Trash2, Pencil } from "lucide-react";
import clsx from "clsx";

export default function TillsPage() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId!;
  const qc = useQueryClient();
  const key = ["tills", shopId];
  const q = useQuery({ queryKey: key, queryFn: () => tillsApi.list(shopId, true), enabled: !!shopId });
  const [editing, setEditing] = useState<Till | "new" | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: key });
  const toggle = useMutation({
    mutationFn: (t: Till) => tillsApi.update(t.id, { name: t.name, code: t.code ?? undefined, isActive: !t.isActive }),
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
        <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add till</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2 font-medium">Name</th>
              <th className="px-5 py-2 font-medium">Code</th>
              <th className="px-5 py-2 font-medium">Status</th>
              <th className="px-5 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tills.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">{t.name}</td>
                <td className="px-5 py-3 text-slate-500">{t.code || "—"}</td>
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
              <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">No tills yet. Add one — or leave empty to reconcile a single drawer.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {editing ? <TillEditor shopId={shopId} till={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); invalidate(); }} /> : null}
    </div>
  );
}

function TillEditor({ shopId, till, onClose, onSaved }: { shopId: string; till: Till | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(till?.name ?? "");
  const [code, setCode] = useState(till?.code ?? "");
  const save = useMutation({
    mutationFn: () => till
      ? tillsApi.update(till.id, { name: name.trim(), code: code.trim() || undefined, isActive: till.isActive })
      : tillsApi.create({ shopId, name: name.trim(), code: code.trim() || undefined }),
    onSuccess: () => { toast("Saved.", "success"); onSaved(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">{till ? "Edit till" : "Add till"}</h2>
        <label className="label">Name</label>
        <input className="input mb-3" placeholder="e.g. Front counter" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <label className="label">Code (optional)</label>
        <input className="input mb-4" placeholder="e.g. T1" value={code} onChange={(e) => setCode(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
