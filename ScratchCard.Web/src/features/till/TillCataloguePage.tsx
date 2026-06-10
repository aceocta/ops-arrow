import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tillCatalogueApi, type TillFieldDefinition, GROUPS, CASH_DIRECTIONS, VATS, LEDGERS } from "../../lib/tillCatalogue";
import { apiErrorMessage } from "../../lib/api";
import { toast } from "../../components/feedback";
import { RefreshCw, Trash2, Plus } from "lucide-react";
const BLANK: TillFieldDefinition = { id: "", code: "", displayName: "", group: "Department", cashDirection: "None", affectsDrawer: false, vat: "Standard20", isCommissionIncome: false, defaultLedger: "Sales", sortOrder: 0, isBuiltIn: false, isActive: true };

export default function TillCataloguePage() {
  const qc = useQueryClient();
  const defsQ = useQuery({ queryKey: ["till-defs"], queryFn: tillCatalogueApi.listDefs });
  const aliasesQ = useQuery({ queryKey: ["till-aliases"], queryFn: tillCatalogueApi.listAliases });
  const [editing, setEditing] = useState<TillFieldDefinition | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useMutation({
    mutationFn: tillCatalogueApi.reload,
    onSuccess: () => toast("Catalogue cache reloaded.", "success"),
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const defs = defsQ.data ?? [];
  const aliases = aliasesQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Till field catalogue</h1>
          <p className="page-subtitle">The canonical taxonomy — edit categories, VAT & ledger without a deploy</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => reload.mutate()} disabled={reload.isPending}>
            <RefreshCw className="h-4 w-4" /> Reload cache
          </button>
          <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add field</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">Field</th>
              <th className="px-4 py-2 font-medium">Group</th>
              <th className="px-4 py-2 font-medium">Cash</th>
              <th className="px-4 py-2 font-medium">VAT</th>
              <th className="px-4 py-2 font-medium">Ledger</th>
              <th className="px-4 py-2 font-medium">Drawer</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {defs.map((d) => (
              <tr key={d.id} className={d.isActive ? "" : "opacity-50"}>
                <td className="px-4 py-2">
                  <div className="font-medium text-slate-800">{d.displayName}</div>
                  <div className="text-xs text-slate-400">{d.code}</div>
                </td>
                <td className="px-4 py-2 text-slate-600">{d.group}</td>
                <td className="px-4 py-2 text-slate-600">{d.cashDirection}</td>
                <td className="px-4 py-2 text-slate-600">{d.vat}</td>
                <td className="px-4 py-2 text-slate-600">{d.defaultLedger}</td>
                <td className="px-4 py-2 text-slate-600">{d.affectsDrawer ? "Yes" : "—"}</td>
                <td className="px-4 py-2 text-right">
                  <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEditing(d)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AliasesSection aliases={aliases} defs={defs} onChanged={() => qc.invalidateQueries({ queryKey: ["till-aliases"] })} />

      {editing ? (
        <DefEditor def={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["till-defs"] }); }} />
      ) : null}
      {creating ? (
        <DefEditor def={BLANK} isNew onClose={() => setCreating(false)} onSaved={() => { setCreating(false); qc.invalidateQueries({ queryKey: ["till-defs"] }); }} />
      ) : null}
    </div>
  );
}

function DefEditor({ def, isNew, onClose, onSaved }: { def: TillFieldDefinition; isNew?: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ ...def });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: form.code, displayName: form.displayName, group: form.group, cashDirection: form.cashDirection,
        affectsDrawer: form.affectsDrawer, vat: form.vat, isCommissionIncome: form.isCommissionIncome,
        defaultLedger: form.defaultLedger, isActive: form.isActive,
      };
      return isNew ? tillCatalogueApi.createDef(body) : tillCatalogueApi.updateDef(body);
    },
    onSuccess: () => { toast("Saved.", "success"); onSaved(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  const Sel = ({ label, value, opts, onChange }: { label: string; value: string; opts: string[]; onChange: (v: string) => void }) => (
    <div><label className="label">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>
    </div>
  );
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-800">{isNew ? "New field" : def.code}</h2>
        {isNew ? (
          <div><label className="label">Code (alphanumeric, e.g. CharityBox)</label>
            <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
        ) : null}
        <div><label className="label">Display name</label>
          <input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <Sel label="Group" value={form.group} opts={GROUPS} onChange={(v) => setForm({ ...form, group: v })} />
          <Sel label="Cash direction" value={form.cashDirection} opts={CASH_DIRECTIONS} onChange={(v) => setForm({ ...form, cashDirection: v })} />
          <Sel label="VAT" value={form.vat} opts={VATS} onChange={(v) => setForm({ ...form, vat: v })} />
          <Sel label="Ledger" value={form.defaultLedger} opts={LEDGERS} onChange={(v) => setForm({ ...form, defaultLedger: v })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.affectsDrawer} onChange={(e) => setForm({ ...form, affectsDrawer: e.target.checked })} /> Affects cash drawer
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.isCommissionIncome} onChange={(e) => setForm({ ...form, isCommissionIncome: e.target.checked })} /> Commission income
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function AliasesSection({ aliases, defs, onChanged }: { aliases: { id: string; normalizedAlias: string; code: string }[]; defs: TillFieldDefinition[]; onChanged: () => void }) {
  const [code, setCode] = useState("");
  const [alias, setAlias] = useState("");
  const add = useMutation({
    mutationFn: () => tillCatalogueApi.addAlias(code, alias),
    onSuccess: () => { setAlias(""); toast("Alias added.", "success"); onChanged(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => tillCatalogueApi.deleteAlias(id),
    onSuccess: () => { toast("Alias removed.", "success"); onChanged(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  return (
    <div className="card p-5">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">Aliases ({aliases.length})</h2>
      <p className="mb-3 text-xs text-slate-400">Map common till labels to a field. Matching is case/spacing-insensitive.</p>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div><label className="label">Field</label>
          <select className="input" value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">Select field…</option>
            {defs.map((d) => <option key={d.code} value={d.code}>{d.displayName} ({d.code})</option>)}
          </select>
        </div>
        <div className="flex-1"><label className="label">Alias text</label>
          <input className="input" value={alias} placeholder="e.g. CASH TAKINGS" onChange={(e) => setAlias(e.target.value)} /></div>
        <button className="btn-primary" disabled={!code || !alias.trim() || add.isPending} onClick={() => add.mutate()}>
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {aliases.map((a) => (
          <span key={a.id} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            <span className="font-medium text-slate-700">{a.normalizedAlias}</span> → {a.code}
            <button className="text-slate-400 hover:text-red-500" onClick={() => remove.mutate(a.id)}><Trash2 className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
    </div>
  );
}
