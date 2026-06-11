import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { apiErrorMessage } from "../../lib/api";
import {
  rotaApi,
  type RotaShift,
  type AssignableUser,
  addDays,
  fmtDate,
  mondayOf,
  shortTime,
  weekdayLabel,
  isOvernight,
} from "../../lib/rota";
import { confirmDialog, toast } from "../../components/feedback";
import { ChevronLeft, ChevronRight, Plus, Sparkles, Trash2, X, UserPlus, Info } from "lucide-react";
import clsx from "clsx";

const AVATAR_COLORS = [
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700",
];
function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// Assignment reasons — "Regular shift" is stored as null on the API, "Other…" opens a free-text input.
const REASON_REGULAR = "Regular shift";
const REASON_OTHER = "Other…";
const REASON_OPTIONS = [REASON_REGULAR, "Cleaning", "Delivery", "Stock take", "Training", "Cover", REASON_OTHER];

type AssignmentDraft = {
  userId?: string;
  rotaStaffMemberId?: string;
  reason: string;
  otherReason: string;
  note: string;
};

// Map a stored reason onto the preset list (anything unknown becomes "Other…" + free text).
function seedReason(reason?: string | null) {
  if (!reason || reason === REASON_REGULAR) return { reason: REASON_REGULAR, otherReason: "" };
  if (reason !== REASON_OTHER && REASON_OPTIONS.includes(reason)) return { reason, otherReason: "" };
  return { reason: REASON_OTHER, otherReason: reason };
}

export default function RotaPage() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId!;
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => mondayOf(fmtDate(new Date())));
  const [editor, setEditor] = useState<RotaShift | "new" | null>(null);
  const [editorDate, setEditorDate] = useState<string>(weekStart);

  const range = { from: weekStart, to: addDays(weekStart, 6) };
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = fmtDate(new Date());

  const [addTemplateId, setAddTemplateId] = useState<string>("");

  const shiftsQ = useQuery({
    queryKey: ["rota", shopId, range.from, range.to],
    queryFn: () => rotaApi.list(shopId, range.from, range.to),
    enabled: !!shopId,
  });
  const templatesQ = useQuery({ queryKey: ["rota-templates", shopId], queryFn: () => rotaApi.templates(shopId), enabled: !!shopId });
  const templates = templatesQ.data ?? [];
  const assignableQ = useQuery({ queryKey: ["rota-assignable", shopId], queryFn: () => rotaApi.assignable(shopId), enabled: !!shopId });
  const roleByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of assignableQ.data ?? []) {
      const key = u.rotaStaffMemberId ?? u.userId;
      if (key) m.set(key, u.isExternal ? "External" : u.role);
    }
    return m;
  }, [assignableQ.data]);
  const roleOf = (a: { userId?: string | null; rotaStaffMemberId?: string | null; isExternal?: boolean }) =>
    a.isExternal ? "External" : roleByKey.get((a.rotaStaffMemberId ?? a.userId) as string) ?? "Staff";

  const byDate = useMemo(() => {
    const m = new Map<string, RotaShift[]>();
    for (const s of shiftsQ.data ?? []) {
      const list = m.get(s.shiftDate) ?? [];
      list.push(s);
      m.set(s.shiftDate, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return m;
  }, [shiftsQ.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["rota", shopId] });

  const generateM = useMutation({
    mutationFn: () => rotaApi.generateWeek(shopId, weekStart),
    onSuccess: (created) => {
      invalidate();
      toast(created.length ? `Added ${created.length} shift(s) for this week.` : "This week's rota is already complete.", "success");
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const openAdd = (date: string, templateId = "") => { setEditorDate(date); setAddTemplateId(templateId); setEditor("new"); };

  const label = `${weekdayLabel(weekStart).day} – ${weekdayLabel(addDays(weekStart, 6)).day}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Rota</h1>
          <p className="text-sm text-slate-500">Plan shifts &amp; assign staff</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-200 bg-white">
            <button className="px-2 py-2 text-slate-500 hover:text-slate-800" onClick={() => setWeekStart((w) => addDays(w, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="px-3 text-sm font-medium text-slate-700" onClick={() => setWeekStart(mondayOf(today))}>{label}</button>
            <button className="px-2 py-2 text-slate-500 hover:text-slate-800" onClick={() => setWeekStart((w) => addDays(w, 7))}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button className="btn-ghost" onClick={() => generateM.mutate()} disabled={generateM.isPending}>
            <Sparkles className="h-4 w-4" /> {generateM.isPending ? "Generating…" : "Generate week"}
          </button>
          <button className="btn-primary" onClick={() => openAdd(today >= weekStart && today <= range.to ? today : weekStart)}>
            <Plus className="h-4 w-4" /> Add shift
          </button>
        </div>
      </div>

      {shiftsQ.isLoading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}

      {/* Rota grid — dates down the side, shifts across the top */}
      <div className="card overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-36 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Date
              </th>
              {templates.map((t) => (
                <th key={t.templateId} className="border-b border-l border-slate-200 bg-slate-50 px-4 py-3 text-left">
                  <div className="text-sm font-semibold text-slate-700">{t.name}</div>
                  <div className="text-xs font-normal text-slate-400">
                    {shortTime(t.startTime)}–{shortTime(t.endTime)}{isOvernight(t.startTime, t.endTime) ? " (+1d)" : ""}
                  </div>
                </th>
              ))}
              {templates.length === 0 ? (
                <th className="border-b border-l border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-400">No shift templates</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {days.map((date) => {
              const wl = weekdayLabel(date);
              const isToday = date === today;
              const list = byDate.get(date) ?? [];
              return (
                <tr key={date} className={clsx(isToday && "bg-brand-50/40")}>
                  <td className={clsx("sticky left-0 z-10 border-r border-t border-slate-200 px-4 py-3", isToday ? "bg-brand-50/60" : "bg-white")}>
                    <div className={clsx("text-sm font-semibold", isToday ? "text-brand-700" : "text-slate-800")}>{wl.weekday}</div>
                    <div className="text-xs text-slate-400">{wl.day}</div>
                  </td>
                  {templates.map((t) => {
                    const s = list.find((x) => x.shiftTemplateId === t.templateId);
                    return (
                      <td key={t.templateId} className="border-l border-t border-slate-200 p-2 align-top">
                        {s ? (
                          <button
                            onClick={() => setEditor(s)}
                            className="group w-full rounded-lg p-2 text-left transition hover:bg-brand-50"
                          >
                            {s.assignees.length === 0 ? (
                              <div className="flex items-center gap-1.5 text-xs italic text-slate-400">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-slate-300">
                                  <Plus className="h-3 w-3" />
                                </span>
                                Assign…
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                {s.assignees.map((a) => (
                                  <div key={a.userId ?? a.rotaStaffMemberId ?? a.name} className="flex items-center gap-2">
                                    <span
                                      className={clsx(
                                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                                        a.isExternal ? "bg-amber-100 text-amber-700" : avatarColor(a.name),
                                      )}
                                    >
                                      {initials(a.name)}
                                    </span>
                                    <span className="truncate text-xs font-medium text-slate-800">{a.name}</span>
                                    {a.reason ? (
                                      <span className="shrink-0 rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-medium text-sky-700">
                                        {a.reason}
                                      </span>
                                    ) : null}
                                    <span className={clsx("ml-auto shrink-0 text-[10px]", a.isExternal ? "text-amber-600" : "text-slate-400")}>
                                      {roleOf(a)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => openAdd(date, t.templateId)}
                            className="flex h-full min-h-[40px] w-full items-center justify-center rounded-lg text-slate-300 transition hover:bg-brand-50 hover:text-brand-500"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editor ? (
        <ShiftEditor
          shopId={shopId}
          shift={editor === "new" ? null : editor}
          date={editor === "new" ? editorDate : editor.shiftDate}
          initialTemplateId={editor === "new" ? addTemplateId : ""}
          daysShifts={byDate.get(editor === "new" ? editorDate : editor.shiftDate) ?? []}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); invalidate(); }}
        />
      ) : null}
    </div>
  );
}

function ShiftEditor({
  shopId,
  shift,
  date,
  initialTemplateId,
  daysShifts,
  onClose,
  onSaved,
}: {
  shopId: string;
  shift: RotaShift | null;
  date: string;
  initialTemplateId?: string;
  daysShifts: RotaShift[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [shiftDate, setShiftDate] = useState(shift?.shiftDate ?? date);
  const [templateId, setTemplateId] = useState(shift?.shiftTemplateId ?? initialTemplateId ?? "");
  const [assignments, setAssignments] = useState<AssignmentDraft[]>(() =>
    (shift?.assignees ?? []).map((a) => ({
      userId: a.userId ?? undefined,
      rotaStaffMemberId: a.rotaStaffMemberId ?? undefined,
      ...seedReason(a.reason),
      note: a.note ?? "",
    })),
  );
  const [extName, setExtName] = useState("");
  const [extPhone, setExtPhone] = useState("+44 ");
  const [extEmail, setExtEmail] = useState("");
  const [showExt, setShowExt] = useState(false);

  const templatesQ = useQuery({ queryKey: ["rota-templates", shopId], queryFn: () => rotaApi.templates(shopId) });
  const assignableQ = useQuery({ queryKey: ["rota-assignable", shopId], queryFn: () => rotaApi.assignable(shopId) });

  // Another shift on this day whose window overlaps the selected one. Allowed (for different staff) —
  // the hint just reminds the manager each overlapping shift needs its own till.
  const overlapShift = useMemo(() => {
    const selected = (templatesQ.data ?? []).find((t) => t.templateId === templateId);
    if (!selected || shiftDate !== date) return null;
    const toMin = (hhmm?: string | null) => {
      const [h, m] = (hhmm ?? "").split(":");
      return (Number(h) || 0) * 60 + (Number(m) || 0);
    };
    const overlaps = (aS: number, aE: number, bS: number, bE: number) => {
      if (aE <= aS) aE += 1440;
      if (bE <= bS) bE += 1440;
      return aS < bE && bS < aE;
    };
    const aS = toMin(selected.startTime), aE = toMin(selected.endTime);
    return daysShifts.find((s) =>
      s.shiftTemplateId !== templateId &&
      overlaps(aS, aE, toMin(s.startTime), toMin(s.endTime)),
    ) ?? null;
  }, [templatesQ.data, templateId, shiftDate, date, daysShifts]);

  const saveM = useMutation({
    mutationFn: () => {
      const payload = {
        shopId,
        shiftDate,
        shiftTemplateId: templateId,
        // Legacy id arrays kept alongside `assignments` (authoritative when present on the API).
        assigneeUserIds: assignments.filter((a) => a.userId).map((a) => a.userId!),
        assigneeStaffMemberIds: assignments.filter((a) => a.rotaStaffMemberId).map((a) => a.rotaStaffMemberId!),
        assignments: assignments.map((a) => {
          const reason = (a.reason === REASON_OTHER ? a.otherReason.trim() : a.reason).slice(0, 100);
          const regular = !reason || reason === REASON_REGULAR;
          const note = a.note.trim().slice(0, 300);
          return {
            userId: a.userId,
            rotaStaffMemberId: a.rotaStaffMemberId,
            reason: regular ? undefined : reason,
            note: regular || !note ? undefined : note,
          };
        }),
      };
      return shift ? rotaApi.update(shift.id, payload) : rotaApi.create(payload);
    },
    onSuccess: onSaved,
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const deleteM = useMutation({
    mutationFn: () => rotaApi.remove(shift!.id),
    onSuccess: onSaved,
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const addExtM = useMutation({
    mutationFn: () => {
      const phone = extPhone.trim();
      return rotaApi.createStaffMember({
        shopId,
        name: extName.trim(),
        phone: phone && phone !== "+44" ? phone : undefined,
        email: extEmail.trim() || undefined,
      });
    },
    onSuccess: (m) => {
      setAssignments((list) => [...list, { rotaStaffMemberId: m.id, reason: REASON_REGULAR, otherReason: "", note: "" }]);
      setExtName(""); setExtPhone("+44 "); setExtEmail(""); setShowExt(false);
      qc.invalidateQueries({ queryKey: ["rota-assignable", shopId] });
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const keyOf = (x: { userId?: string | null; rotaStaffMemberId?: string | null }) => x.rotaStaffMemberId ?? x.userId ?? "";
  const draftFor = (u: AssignableUser) => assignments.find((a) => keyOf(a) === keyOf(u));
  const toggle = (u: AssignableUser) =>
    setAssignments((list) =>
      list.some((a) => keyOf(a) === keyOf(u))
        ? list.filter((a) => keyOf(a) !== keyOf(u))
        : [
            ...list,
            { userId: u.userId ?? undefined, rotaStaffMemberId: u.rotaStaffMemberId ?? undefined, reason: REASON_REGULAR, otherReason: "", note: "" },
          ],
    );
  const updateDraft = (u: AssignableUser, patch: Partial<AssignmentDraft>) =>
    setAssignments((list) => list.map((a) => (keyOf(a) === keyOf(u) ? { ...a, ...patch } : a)));

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="card w-full max-w-lg p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{shift ? "Edit shift" : "Add shift"}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} />
          </div>

          <div>
            <label className="label">Shift</label>
            <div className="flex flex-wrap gap-2">
              {(templatesQ.data ?? []).map((t) => (
                <button
                  key={t.templateId}
                  onClick={() => setTemplateId(t.templateId)}
                  className={clsx(
                    "rounded-lg border px-3 py-1.5 text-sm",
                    templateId === t.templateId ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600",
                  )}
                >
                  {t.name}
                  <span className="ml-1 text-xs text-slate-400">{shortTime(t.startTime)}–{shortTime(t.endTime)}</span>
                </button>
              ))}
              {(templatesQ.data?.length ?? 0) === 0 ? (
                <span className="text-sm text-slate-400">No shift templates — configure them in Shop settings.</span>
              ) : null}
            </div>
            {overlapShift ? (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-slate-600">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>
                  Overlaps the {overlapShift.shiftName} shift ({shortTime(overlapShift.startTime)}–{shortTime(overlapShift.endTime)}).
                  That's fine for a different staff member — just give each overlapping shift its own till when reconciling.
                </span>
              </div>
            ) : null}
          </div>

          <div>
            <label className="label">Assign staff</label>
            <div className="max-h-64 space-y-1 overflow-auto rounded-lg border border-slate-200 p-1">
              {(assignableQ.data ?? []).map((u) => {
                const draft = draftFor(u);
                return (
                  <div key={u.rotaStaffMemberId ?? u.userId ?? u.name} className={clsx("rounded-md", draft && "bg-brand-50")}>
                    <button
                      onClick={() => toggle(u)}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{u.name}</span>
                        <span className={clsx("text-xs", u.isExternal ? "text-amber-600" : "text-slate-400")}>
                          {u.isExternal ? "External" : u.role}
                        </span>
                      </span>
                      <input type="checkbox" readOnly checked={!!draft} className="h-4 w-4 accent-brand-600" />
                    </button>
                    {draft ? (
                      <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
                        <select
                          className="input h-8 w-auto py-1 text-xs"
                          value={draft.reason}
                          onChange={(e) => {
                            const reason = e.target.value;
                            // Back to regular → drop the now-hidden free text + note so stale values aren't sent.
                            updateDraft(u, reason === REASON_REGULAR ? { reason, otherReason: "", note: "" } : { reason });
                          }}
                        >
                          {REASON_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        {draft.reason === REASON_OTHER ? (
                          <input
                            className="input h-8 min-w-[8rem] flex-1 py-1 text-xs"
                            maxLength={100}
                            placeholder="Reason"
                            value={draft.otherReason}
                            onChange={(e) => updateDraft(u, { otherReason: e.target.value })}
                          />
                        ) : null}
                        {draft.reason !== REASON_REGULAR ? (
                          <input
                            className="input h-8 w-full py-1 text-xs"
                            maxLength={300}
                            placeholder="Note (optional)"
                            value={draft.note}
                            onChange={(e) => updateDraft(u, { note: e.target.value })}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {showExt ? (
              <div className="mt-2 space-y-2 rounded-lg border border-slate-200 p-3">
                <input className="input" placeholder="Full name" value={extName} onChange={(e) => setExtName(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <input className="input" placeholder="+44 7700 900000" value={extPhone} onChange={(e) => setExtPhone(e.target.value)} />
                  <input className="input" placeholder="email (optional)" value={extEmail} onChange={(e) => setExtEmail(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" disabled={!extName.trim() || addExtM.isPending} onClick={() => addExtM.mutate()}>
                    {addExtM.isPending ? "Adding…" : "Add & assign"}
                  </button>
                  <button className="btn-ghost" onClick={() => setShowExt(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="btn-ghost mt-2 w-full" onClick={() => setShowExt(true)}>
                <UserPlus className="h-4 w-4" /> Add external person
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          {shift ? (
            <button className="btn text-red-600 hover:bg-red-50" onClick={async () => { if (await confirmDialog({ title: "Delete shift?", message: "This removes the shift and its assignments.", confirmLabel: "Delete" })) deleteM.mutate(); }}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={!templateId || saveM.isPending} onClick={() => saveM.mutate()}>
              {saveM.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
