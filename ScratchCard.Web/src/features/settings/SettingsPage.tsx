import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { apiErrorMessage } from "../../lib/api";
import { configApi, lookupsApi, type ConfigurationItem } from "../../lib/config";
import clsx from "clsx";
import { rotaApi, shortTime, isOvernight, type RotaShiftTemplate } from "../../lib/rota";
import { toast } from "../../components/feedback";
import { Save, Clock, Plus, Trash2 } from "lucide-react";

const humanize = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1 $2");

// Config keys whose value is a comma-separated list of role names.
const ROLE_LIST_KEYS = new Set([
  "WhoCanReopenShift",
  "WhoCanReopenDay",
  "ManualEntryNotificationRecipients",
  "CashDifferenceNotificationRecipients",
  "HighPrizePayoutNotificationRecipients",
]);

// Comma-separated multi-select with a fixed option set (non-role).
const MULTI_OPTIONS: Record<string, string[]> = {
  NotificationChannels: ["Email", "SMS", "InApp", "WhatsApp"],
  AllowedPayoutMethods: ["Cash", "Card", "Transfer"],
};

// Single-select dropdowns with a fixed option set.
const SELECT_OPTIONS: Record<string, string[]> = {
  DefaultSellingOrder: ["Ascending", "Descending"],
  PackSellingOrder: ["Ascending", "Descending"],
  Currency: ["GBP", "EUR", "USD"],
};

// Keys whose value is a time of day (HH:mm).
const TIME_KEYS = new Set([
  "BusinessStartTime",
  "BusinessEndTime",
  "BusinessDateCutOffTime",
  "ShiftStartTime",
  "ShiftEndTime",
]);

const COMMON_TIMEZONES = [
  "Europe/London", "Europe/Dublin", "UTC", "Europe/Paris", "Europe/Berlin",
  "America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Dubai", "Asia/Kolkata", "Australia/Sydney",
];
function timezoneOptions(current: string) {
  const supported = (Intl as any).supportedValuesOf?.("timeZone") as string[] | undefined;
  const list = supported && supported.length ? supported : COMMON_TIMEZONES;
  return Array.from(new Set([current, ...list].filter(Boolean)));
}

export default function SettingsPage() {
  const { activeShopId, features } = useAuth();
  const shopId = activeShopId!;
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const q = useQuery({
    queryKey: ["configurations", shopId],
    queryFn: () => configApi.get(shopId),
    enabled: !!shopId,
  });

  const templatesQ = useQuery({
    queryKey: ["rota-templates", shopId],
    queryFn: () => rotaApi.templates(shopId),
    enabled: !!shopId && features.includes("StaffRota"),
  });
  const templates = templatesQ.data ?? [];

  const rolesQ = useQuery({ queryKey: ["roles"], queryFn: lookupsApi.roles, enabled: !!shopId });
  const roleNames = (rolesQ.data ?? []).filter((r) => r.name.replace(/\s+/g, "").toLowerCase() !== "platformadmin").map((r) => r.name);

  useEffect(() => setEdits({}), [shopId]);

  const groups = useMemo(() => {
    const m = new Map<string, ConfigurationItem[]>();
    for (const c of q.data ?? []) {
      if (c.configKey === "ShiftTemplates") continue; // shown in the dedicated editor below
      const list = m.get(c.groupName) ?? [];
      list.push(c);
      m.set(c.groupName, list);
    }
    return [...m.entries()];
  }, [q.data]);

  const valueOf = (c: ConfigurationItem) => edits[c.configKey] ?? c.configValue;
  const setValue = (key: string, v: string) => { setEdits((e) => ({ ...e, [key]: v })); setSaved(false); };
  const changed = Object.keys(edits);

  const saveM = useMutation({
    mutationFn: () => {
      const items = changed.map((key) => {
        const item = (q.data ?? []).find((c) => c.configKey === key)!;
        return { groupName: item.groupName, configKey: key, configValue: edits[key] };
      });
      return configApi.update(shopId, items);
    },
    onSuccess: () => {
      setEdits({});
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["configurations", shopId] });
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const label = (k: string) => k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Shop settings</h1>
          <p className="text-sm text-slate-500">Configuration for the active shop</p>
        </div>
        <div className="flex items-center gap-3">
          {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
          <button className="btn-primary" disabled={changed.length === 0 || saveM.isPending} onClick={() => saveM.mutate()}>
            <Save className="h-4 w-4" /> {saveM.isPending ? "Saving…" : `Save${changed.length ? ` (${changed.length})` : ""}`}
          </button>
        </div>
      </div>

      {q.isLoading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}

      {/* Shift templates (editable) */}
      {features.includes("StaffRota") && !templatesQ.isLoading ? (
        <ShiftTemplatesEditor key={templates.map((t) => t.templateId).join("|")} shopId={shopId} initial={templates} />
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {groups.map(([group, items]) => (
          <div key={group} className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">{group}</div>
            <div className="divide-y divide-slate-100">
              {items.map((c) => {
                const v = valueOf(c);
                const isBool = c.dataType === "bool";
                const isInt = c.dataType === "int";
                const isJson = c.dataType === "json";
                const isRoleList = ROLE_LIST_KEYS.has(c.configKey);
                const multiOpts = MULTI_OPTIONS[c.configKey];
                const selectOpts = SELECT_OPTIONS[c.configKey];
                const isTimeZone = c.configKey === "TimeZone";
                const isTime = TIME_KEYS.has(c.configKey);
                const wide = isRoleList || !!multiOpts;
                return (
                  <div key={c.configKey} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium capitalize text-slate-800">{label(c.configKey)}</div>
                      {c.description ? <div className="text-xs text-slate-400">{c.description}</div> : null}
                    </div>
                    <div className={clsx("w-full shrink-0", wide ? "sm:w-72" : "sm:w-48")}>
                      {isRoleList ? (
                        <ChipMultiSelect value={v} options={roleNames} humanizeLabels onChange={(next) => setValue(c.configKey, next)} />
                      ) : multiOpts ? (
                        <ChipMultiSelect value={v} options={multiOpts} onChange={(next) => setValue(c.configKey, next)} />
                      ) : isTimeZone ? (
                        <select className="input" value={v} onChange={(e) => setValue(c.configKey, e.target.value)}>
                          {timezoneOptions(v).map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                      ) : selectOpts ? (
                        <select className="input" value={v} onChange={(e) => setValue(c.configKey, e.target.value)}>
                          {selectOpts.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : isTime ? (
                        <input type="time" className="input" value={v.slice(0, 5)} onChange={(e) => setValue(c.configKey, e.target.value)} />
                      ) : isBool ? (
                        <button
                          onClick={() => setValue(c.configKey, v === "true" ? "false" : "true")}
                          className={`relative h-6 w-11 rounded-full transition ${v === "true" ? "bg-brand-600" : "bg-slate-300"}`}
                        >
                          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${v === "true" ? "left-[22px]" : "left-0.5"}`} />
                        </button>
                      ) : isJson ? (
                        <textarea className="input h-20 font-mono text-xs" value={v} onChange={(e) => setValue(c.configKey, e.target.value)} />
                      ) : (
                        <input
                          className="input"
                          type={isInt ? "number" : "text"}
                          value={v}
                          onChange={(e) => setValue(c.configKey, e.target.value)}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChipMultiSelect({
  value,
  options,
  onChange,
  humanizeLabels = false,
}: {
  value: string;
  options: string[];
  onChange: (next: string) => void;
  humanizeLabels?: boolean;
}) {
  const selected = value.split(",").map((s) => s.trim()).filter(Boolean);
  const all = Array.from(new Set([...options, ...selected]));
  const toggle = (name: string) => {
    const next = selected.includes(name) ? selected.filter((x) => x !== name) : [...selected, name];
    onChange(next.join(","));
  };
  return (
    <div className="flex flex-wrap justify-start gap-1.5 sm:justify-end">
      {all.length === 0 ? <span className="text-xs text-slate-400">Loading…</span> : null}
      {all.map((name) => {
        const on = selected.includes(name);
        return (
          <button
            key={name}
            onClick={() => toggle(name)}
            className={clsx(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition",
              on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-500 hover:bg-slate-50",
            )}
          >
            {humanizeLabels ? humanize(name) : name}
          </button>
        );
      })}
    </div>
  );
}

type TemplateRow = { key: string; id: string; name: string; start: string; end: string; active: boolean };

function ShiftTemplatesEditor({ shopId, initial }: { shopId: string; initial: RotaShiftTemplate[] }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<TemplateRow[]>(() =>
    initial.map((t) => ({ key: t.templateId, id: t.templateId, name: t.name, start: shortTime(t.startTime), end: shortTime(t.endTime), active: true })),
  );
  const [saved, setSaved] = useState(false);

  const update = (key: string, patch: Partial<TemplateRow>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setSaved(false);
  };
  const addRow = () => {
    setRows((rs) => [...rs, { key: crypto.randomUUID(), id: "", name: "", start: "09:00", end: "17:00", active: true }]);
    setSaved(false);
  };
  const removeRow = (key: string) => { setRows((rs) => rs.filter((r) => r.key !== key)); setSaved(false); };

  const valid = rows.every((r) => r.name.trim() && r.start && r.end);

  const saveM = useMutation({
    mutationFn: () => {
      const json = rows
        .filter((r) => r.name.trim() && r.start && r.end)
        .map((r) => ({ id: r.id || undefined, name: r.name.trim(), startTime: r.start, endTime: r.end, isActive: r.active }));
      return configApi.update(shopId, [{ groupName: "Shift Settings", configKey: "ShiftTemplates", configValue: JSON.stringify(json) }]);
    },
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["rota-templates", shopId] });
      qc.invalidateQueries({ queryKey: ["configurations", shopId] });
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Clock className="h-4 w-4 text-slate-400" /> Shift templates
        </span>
        <div className="flex items-center gap-3">
          {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
          <button className="btn-primary" disabled={!valid || saveM.isPending} onClick={() => saveM.mutate()}>
            <Save className="h-4 w-4" /> {saveM.isPending ? "Saving…" : "Save templates"}
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {rows.length === 0 ? <div className="px-5 py-4 text-sm text-slate-400">No shift templates. Add one below.</div> : null}
        {rows.map((r) => (
          <div key={r.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <input
              className="input min-w-[180px] flex-1"
              placeholder="Shift name (e.g. Morning Shift)"
              value={r.name}
              onChange={(e) => update(r.key, { name: e.target.value })}
            />
            <input type="time" className="input w-32" value={r.start} onChange={(e) => update(r.key, { start: e.target.value })} />
            <span className="text-slate-400">–</span>
            <input type="time" className="input w-32" value={r.end} onChange={(e) => update(r.key, { end: e.target.value })} />
            <span className="w-10 text-xs text-amber-600">{isOvernight(r.start, r.end) ? "+1d" : ""}</span>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={r.active} onChange={(e) => update(r.key, { active: e.target.checked })} />
              Active
            </label>
            <button className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => removeRow(r.key)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
        <button className="btn-ghost" onClick={addRow}><Plus className="h-4 w-4" /> Add shift template</button>
        <span className="text-xs text-slate-400">An end time earlier than the start means the shift ends the next day.</span>
      </div>
    </div>
  );
}
