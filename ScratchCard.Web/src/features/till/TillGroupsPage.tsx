import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { tillGroupsApi, tillShopFieldsApi, type CashEffect, type TillGroup, type TillShopField } from "../../lib/tillGroups";
import { apiErrorMessage } from "../../lib/api";
import { confirmDialog, toast } from "../../components/feedback";

export default function TillGroupsPage() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId!;
  const qc = useQueryClient();

  const groupsQ = useQuery({ queryKey: ["till-groups", shopId], queryFn: () => tillGroupsApi.list(shopId), enabled: !!shopId });
  const fieldsQ = useQuery({ queryKey: ["till-fields-flat", shopId], queryFn: () => tillGroupsApi.listFields(shopId), enabled: !!shopId });
  const overridesQ = useQuery({ queryKey: ["till-overrides", shopId], queryFn: () => tillGroupsApi.listOverrides(shopId), enabled: !!shopId });
  const shopFieldsQ = useQuery({ queryKey: ["till-shop-fields", shopId], queryFn: () => tillShopFieldsApi.list(shopId), enabled: !!shopId });

  const groups = groupsQ.data ?? [];
  const groupName = useMemo(() => new Map(groups.map((g) => [g.code, g.displayName])), [groups]);
  const overrideByField = useMemo(
    () => new Map((overridesQ.data ?? []).map((o) => [o.canonicalField, o.groupCode])),
    [overridesQ.data],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["till-groups", shopId] });
    qc.invalidateQueries({ queryKey: ["till-overrides", shopId] });
    qc.invalidateQueries({ queryKey: ["till-shop-fields", shopId] });
    qc.invalidateQueries({ queryKey: ["till-fields-flat", shopId] });
  };

  const effectLabel = (e: CashEffect) => (e === "In" ? "Money in" : e === "Out" ? "Money out" : "No cash effect");

  const [fName, setFName] = useState("");
  const [fGroup, setFGroup] = useState("");
  const [fEffect, setFEffect] = useState<CashEffect>("Out");
  const createFieldM = useMutation({
    mutationFn: () => tillShopFieldsApi.create({ shopId, displayName: fName.trim(), groupCode: fGroup || groups[0]?.code || "Movement", cashEffect: fEffect }),
    onSuccess: () => { setFName(""); invalidate(); toast("Field added.", "success"); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  const deleteFieldM = useMutation({
    mutationFn: (id: string) => tillShopFieldsApi.remove(id),
    onSuccess: () => { invalidate(); toast("Field deleted.", "success"); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });
  const removeField = async (f: TillShopField) => {
    if (await confirmDialog({
      title: `Delete "${f.displayName}"?`,
      message: "Past reconciliations that used it stay readable.",
      confirmLabel: "Delete",
      tone: "danger",
    })) deleteFieldM.mutate(f.id);
  };

  const [newName, setNewName] = useState("");
  const createM = useMutation({
    mutationFn: () => tillGroupsApi.create(shopId, newName.trim()),
    onSuccess: () => { setNewName(""); invalidate(); toast("Group added.", "success"); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const renameM = useMutation({
    mutationFn: (g: TillGroup) => tillGroupsApi.update({ id: g.id, displayName: editName.trim(), sortOrder: g.sortOrder, isActive: true }),
    onSuccess: () => { setEditId(null); invalidate(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => tillGroupsApi.remove(id),
    onSuccess: () => { invalidate(); toast("Group deleted.", "success"); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const assignM = useMutation({
    mutationFn: (p: { code: string; groupCode: string | null }) => tillGroupsApi.assignField(shopId, p.code, p.groupCode),
    onSuccess: () => invalidate(),
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const removeGroup = async (g: TillGroup) => {
    if (await confirmDialog({
      title: `Delete "${g.displayName}"?`,
      message: "Any fields assigned to it move back to their default group.",
      confirmLabel: "Delete",
      tone: "danger",
    })) deleteM.mutate(g.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Reconciliation groups</h1>
        <p className="text-sm text-slate-500">
          Groups are the sections your till lines are organised into (e.g. Cash movements, Totals). Create your own and
          assign fields to them — they apply to this shop's reconciliations.
        </p>
      </div>

      {/* Create + list groups */}
      <div className="card p-5">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="label">New group name</label>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Cash movement" />
          </div>
          <button className="btn-primary" disabled={!newName.trim() || createM.isPending} onClick={() => createM.mutate()}>
            <Plus className="h-4 w-4" /> Add group
          </button>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {groups.map((g) => (
            <div key={g.code} className="flex items-center justify-between gap-3 py-2.5">
              {editId === g.id ? (
                <input className="input max-w-xs" value={editName} autoFocus onChange={(e) => setEditName(e.target.value)} />
              ) : (
                <div>
                  <span className="font-medium text-slate-800">{g.displayName}</span>
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                    {g.isBuiltIn ? "Built-in" : "Custom"}
                  </span>
                </div>
              )}
              {!g.isBuiltIn ? (
                <div className="flex items-center gap-2">
                  {editId === g.id ? (
                    <>
                      <button className="btn border border-emerald-200 text-emerald-700 hover:bg-emerald-50" disabled={!editName.trim() || renameM.isPending} onClick={() => renameM.mutate(g)}>
                        <Check className="h-4 w-4" />
                      </button>
                      <button className="btn-ghost" onClick={() => setEditId(null)}><X className="h-4 w-4" /></button>
                    </>
                  ) : (
                    <>
                      <button className="btn-ghost" onClick={() => { setEditId(g.id); setEditName(g.displayName); }}><Pencil className="h-4 w-4" /></button>
                      <button className="btn border border-red-200 text-red-600 hover:bg-red-50" onClick={() => removeGroup(g)}><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Custom fields */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">Custom fields</h2>
        <p className="text-xs text-slate-500">
          Add your own till line (e.g. "Wages from till"). "Money out" reduces the expected drawer, "Money in" adds to it,
          "No cash effect" just records a figure.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1">
            <label className="label">Name</label>
            <input className="input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Wages from till" />
          </div>
          <div>
            <label className="label">Cash effect</label>
            <select className="input w-auto" value={fEffect} onChange={(e) => setFEffect(e.target.value as CashEffect)}>
              <option value="Out">Money out</option>
              <option value="In">Money in</option>
              <option value="None">No cash effect</option>
            </select>
          </div>
          <div>
            <label className="label">Group</label>
            <select className="input w-auto" value={fGroup || groups[0]?.code || ""} onChange={(e) => setFGroup(e.target.value)}>
              {groups.map((g) => <option key={g.code} value={g.code}>{g.displayName}</option>)}
            </select>
          </div>
          <button className="btn-primary" disabled={!fName.trim() || createFieldM.isPending} onClick={() => createFieldM.mutate()}>
            <Plus className="h-4 w-4" /> Add field
          </button>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {(shopFieldsQ.data ?? []).map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <span className="font-medium text-slate-800">{f.displayName}</span>
                <span className="ml-2 text-xs text-slate-500">{effectLabel(f.cashEffect)} · {groupName.get(f.groupCode) ?? f.groupCode}</span>
              </div>
              <button className="btn border border-red-200 text-red-600 hover:bg-red-50" onClick={() => removeField(f)}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {(shopFieldsQ.data?.length ?? 0) === 0 ? <p className="py-2 text-sm text-slate-400">No custom fields yet.</p> : null}
        </div>
      </div>

      {/* Assign fields */}
      <div className="card overflow-x-auto">
        <div className="px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Assign fields to groups</h2>
          <p className="text-xs text-slate-500">Choose which group each till field appears under for this shop.</p>
        </div>
        <table className="w-full border-t border-slate-100 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2 font-medium">Field</th>
              <th className="px-5 py-2 font-medium">Group</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(fieldsQ.data ?? []).filter((f) => f.isBuiltIn).map((f) => {
              const current = overrideByField.get(f.code) ?? f.groupCode;
              return (
                <tr key={f.code}>
                  <td className="px-5 py-2.5 text-slate-800">{f.displayName}</td>
                  <td className="px-5 py-2.5">
                    <select
                      className="input w-auto"
                      value={groupName.has(current) ? current : f.groupCode}
                      onChange={(e) => assignM.mutate({ code: f.code, groupCode: e.target.value === f.groupCode ? null : e.target.value })}
                    >
                      {groups.map((g) => (
                        <option key={g.code} value={g.code}>{g.displayName}{g.code === f.groupCode ? " (default)" : ""}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
