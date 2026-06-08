import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { apiErrorMessage } from "../../lib/api";
import { rotaApi, type RotaStaffMember } from "../../lib/rota";
import { Plus, X, Trash2, Phone, Mail } from "lucide-react";

export default function StaffPage() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId!;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RotaStaffMember | "new" | null>(null);

  const q = useQuery({ queryKey: ["rota-staff-members", shopId], queryFn: () => rotaApi.staffMembers(shopId), enabled: !!shopId });
  const members = q.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">External staff</h1>
          <p className="text-sm text-slate-500">People you roster &amp; record hours for who aren't Ops Arrow users</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add person</button>
      </div>

      {q.isLoading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}
      {!q.isLoading && members.length === 0 ? <div className="card p-6 text-sm text-slate-400">No external staff yet.</div> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {members.map((m) => (
          <button key={m.id} className="card card-hover flex items-center gap-3 p-4 text-left hover:border-brand-200" onClick={() => setEditing(m)}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700">
              {m.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium text-slate-800">{m.name}</div>
              <div className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                {m.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{m.phone}</span> : null}
                {m.email ? <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{m.email}</span> : null}
                {!m.phone && !m.email ? <span className="italic">No contact details</span> : null}
              </div>
            </div>
          </button>
        ))}
      </div>

      {editing ? <StaffModal shopId={shopId} member={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["rota-staff-members", shopId] }); }} /> : null}
    </div>
  );
}

function StaffModal({ shopId, member, onClose, onSaved }: { shopId: string; member: RotaStaffMember | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(member?.name ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "+44 ");
  const [email, setEmail] = useState(member?.email ?? "");

  const saveM = useMutation({
    mutationFn: () => {
      const p = phone.trim();
      const payload = { shopId, name: name.trim(), phone: p && p !== "+44" ? p : undefined, email: email.trim() || undefined };
      return member ? rotaApi.updateStaffMember(member.id, payload) : rotaApi.createStaffMember(payload);
    },
    onSuccess: onSaved,
    onError: (e) => alert(apiErrorMessage(e)),
  });
  const deleteM = useMutation({ mutationFn: () => rotaApi.deleteStaffMember(member!.id), onSuccess: onSaved, onError: (e) => alert(apiErrorMessage(e)) });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="card w-full max-w-md p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{member ? "Edit person" : "Add external person"}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="label">Phone (optional)</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><label className="label">Email (optional)</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <div className="mt-5 flex items-center justify-between">
          {member ? (
            <button className="btn text-red-600 hover:bg-red-50" onClick={() => { if (confirm(`Remove ${member.name}?`)) deleteM.mutate(); }}><Trash2 className="h-4 w-4" /> Remove</button>
          ) : <span />}
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={!name.trim() || saveM.isPending} onClick={() => saveM.mutate()}>{saveM.isPending ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
