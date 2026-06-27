import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Power, Pencil, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../auth/AuthContext";
import { apiErrorMessage } from "../../lib/api";
import { toast } from "../../components/feedback";
import {
  temperatureApi,
  EQUIPMENT_TYPES,
  type EquipmentType,
  type TemperatureUnit,
  type TemperatureSchedule,
} from "../../lib/temperature";

const EQUIPMENT_LABEL: Record<EquipmentType, string> = {
  Fridge: "Fridge",
  Freezer: "Freezer",
  CoolRoom: "Cool room",
  DisplayChill: "Display chiller",
  HotFoodDisplay: "Hot food display",
  Other: "Other",
};

const hhmm = (t: string) => (t ?? "").slice(0, 5);

export default function TemperatureConfigPage() {
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;
  const qc = useQueryClient();

  const unitsKey = ["temperature-units", shopId];
  const schedKey = ["temperature-schedules", shopId];
  const unitsQ = useQuery({ queryKey: unitsKey, queryFn: () => temperatureApi.units(shopId!), enabled: !!shopId });
  const schedQ = useQuery({ queryKey: schedKey, queryFn: () => temperatureApi.schedules(shopId!), enabled: !!shopId });

  const [editUnit, setEditUnit] = useState<TemperatureUnit | "new" | null>(null);
  const [editSched, setEditSched] = useState<TemperatureSchedule | "new" | null>(null);

  const units = unitsQ.data ?? [];
  const schedules = schedQ.data ?? [];
  const unitNameById = useMemo(() => new Map(units.map((u) => [u.id, u.unitName])), [units]);

  const toggleUnit = useMutation({
    mutationFn: (u: TemperatureUnit) =>
      temperatureApi.updateUnit(u.id, {
        unitName: u.unitName,
        equipmentType: u.equipmentType,
        minTemperatureCelsius: u.minTemperatureCelsius,
        maxTemperatureCelsius: u.maxTemperatureCelsius,
        isActive: !u.isActive,
        location: u.location ?? undefined,
        notes: u.notes ?? undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: unitsKey }),
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const removeSched = useMutation({
    mutationFn: (id: string) => temperatureApi.removeSchedule(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: schedKey }); toast("Check time removed.", "success"); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  if (!shopId) return <div className="card p-6 text-sm text-slate-500">Select a shop first.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/temperature" className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Temperature
          </Link>
          <h1 className="page-title">Temperature setup</h1>
          <p className="page-subtitle">Fridges, freezers and check times for {activeShop?.shopName ?? "this shop"}.</p>
        </div>
      </div>

      {/* Units */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Units</h2>
          <button className="btn-primary" onClick={() => setEditUnit("new")}><Plus className="h-4 w-4" /> Add unit</button>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-medium">Name</th>
                <th className="px-5 py-2 font-medium">Type</th>
                <th className="px-5 py-2 font-medium">Safe range</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {units.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{u.unitName}</td>
                  <td className="px-5 py-3 text-slate-500">{EQUIPMENT_LABEL[u.equipmentType] ?? u.equipmentType}</td>
                  <td className="px-5 py-3 text-slate-700">{u.minTemperatureCelsius}°C to {u.maxTemperatureCelsius}°C</td>
                  <td className="px-5 py-3">
                    <span className={clsx("badge", u.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Edit" onClick={() => setEditUnit(u)}><Pencil className="h-4 w-4" /></button>
                      <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title={u.isActive ? "Deactivate" : "Activate"} onClick={() => toggleUnit.mutate(u)}><Power className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!unitsQ.isLoading && units.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">No fridges or freezers yet. Add the units you check each day.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Check times */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Check times</h2>
          <button className="btn-primary" disabled={units.length === 0} onClick={() => setEditSched("new")}><Plus className="h-4 w-4" /> Add check time</button>
        </div>
        {units.length === 0 ? (
          <div className="card p-4 text-sm text-amber-700">Add at least one unit first — check times need something to monitor.</div>
        ) : null}
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-medium">Label</th>
                <th className="px-5 py-2 font-medium">Time</th>
                <th className="px-5 py-2 font-medium">Tolerance</th>
                <th className="px-5 py-2 font-medium">Applies to</th>
                <th className="px-5 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedules.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{s.label}</td>
                  <td className="px-5 py-3 text-slate-700">{hhmm(s.expectedTime)}</td>
                  <td className="px-5 py-3 text-slate-500">±{s.toleranceMinutes} min</td>
                  <td className="px-5 py-3 text-slate-500">
                    {s.unitIds.length === 0 ? "All units" : s.unitIds.map((id) => unitNameById.get(id) ?? "?").join(", ")}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Edit" onClick={() => setEditSched(s)}><Pencil className="h-4 w-4" /></button>
                      <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Remove" onClick={() => { if (confirm(`Remove "${s.label}"?`)) removeSched.mutate(s.id); }}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!schedQ.isLoading && schedules.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">No check times yet. Add one (e.g. a morning and an evening check).</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {editUnit ? (
        <UnitEditor shopId={shopId} unit={editUnit === "new" ? null : editUnit} onClose={() => setEditUnit(null)} onSaved={() => { setEditUnit(null); qc.invalidateQueries({ queryKey: unitsKey }); }} />
      ) : null}
      {editSched ? (
        <ScheduleEditor shopId={shopId} schedule={editSched === "new" ? null : editSched} units={units} onClose={() => setEditSched(null)} onSaved={() => { setEditSched(null); qc.invalidateQueries({ queryKey: schedKey }); }} />
      ) : null}
    </div>
  );
}

function UnitEditor({ shopId, unit, onClose, onSaved }: { shopId: string; unit: TemperatureUnit | null; onClose: () => void; onSaved: () => void }) {
  const [unitName, setUnitName] = useState(unit?.unitName ?? "");
  const [equipmentType, setEquipmentType] = useState<EquipmentType>(unit?.equipmentType ?? "Fridge");
  const [minTemp, setMinTemp] = useState(unit ? String(unit.minTemperatureCelsius) : "0");
  const [maxTemp, setMaxTemp] = useState(unit ? String(unit.maxTemperatureCelsius) : "5");
  const [location, setLocation] = useState(unit?.location ?? "");

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        unitName: unitName.trim(),
        equipmentType,
        minTemperatureCelsius: Number(minTemp),
        maxTemperatureCelsius: Number(maxTemp),
        isActive: unit?.isActive ?? true,
        location: location.trim() || undefined,
      };
      return unit ? temperatureApi.updateUnit(unit.id, payload) : temperatureApi.createUnit({ shopId, ...payload });
    },
    onSuccess: () => { toast("Saved.", "success"); onSaved(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const valid = unitName.trim() && minTemp !== "" && maxTemp !== "" && Number(minTemp) <= Number(maxTemp);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">{unit ? "Edit unit" : "Add unit"}</h2>
        <label className="label">Name</label>
        <input className="input mb-3" placeholder="e.g. Front fridge" value={unitName} onChange={(e) => setUnitName(e.target.value)} autoFocus />
        <label className="label">Type</label>
        <select className="input mb-3" value={equipmentType} onChange={(e) => setEquipmentType(e.target.value as EquipmentType)}>
          {EQUIPMENT_TYPES.map((t) => <option key={t} value={t}>{EQUIPMENT_LABEL[t]}</option>)}
        </select>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label">Min °C</label>
            <input className="input" inputMode="decimal" value={minTemp} onChange={(e) => setMinTemp(e.target.value)} />
          </div>
          <div>
            <label className="label">Max °C</label>
            <input className="input" inputMode="decimal" value={maxTemp} onChange={(e) => setMaxTemp(e.target.value)} />
          </div>
        </div>
        <label className="label">Location (optional)</label>
        <input className="input mb-4" placeholder="e.g. Back kitchen" value={location} onChange={(e) => setLocation(e.target.value)} />
        {minTemp !== "" && maxTemp !== "" && Number(minTemp) > Number(maxTemp) ? (
          <p className="mb-3 text-xs text-red-500">Min must be less than or equal to Max.</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function ScheduleEditor({ shopId, schedule, units, onClose, onSaved }: { shopId: string; schedule: TemperatureSchedule | null; units: TemperatureUnit[]; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(schedule?.label ?? "");
  const [time, setTime] = useState(schedule ? schedule.expectedTime.slice(0, 5) : "10:00");
  const [tolerance, setTolerance] = useState(schedule ? String(schedule.toleranceMinutes) : "30");
  const [unitIds, setUnitIds] = useState<string[]>(schedule?.unitIds ?? []);

  const toggleUnit = (id: string) =>
    setUnitIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        shopId,
        unitIds,
        label: label.trim(),
        expectedTime: `${time}:00`,
        toleranceMinutes: Number(tolerance) || 0,
        isActive: schedule?.isActive ?? true,
      };
      return schedule ? temperatureApi.updateSchedule(schedule.id, payload) : temperatureApi.createSchedule(payload);
    },
    onSuccess: () => { toast("Saved.", "success"); onSaved(); },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const valid = label.trim() && /^\d{2}:\d{2}$/.test(time);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">{schedule ? "Edit check time" : "Add check time"}</h2>
        <label className="label">Label</label>
        <input className="input mb-3" placeholder="e.g. Morning check" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label">Time</label>
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div>
            <label className="label">Tolerance (min)</label>
            <input className="input" inputMode="numeric" value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
          </div>
        </div>
        <label className="label">Applies to</label>
        <p className="mb-1 text-xs text-slate-400">Leave all unticked to apply to every unit.</p>
        <div className="mb-4 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
          {units.map((u) => (
            <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={unitIds.includes(u.id)} onChange={() => toggleUnit(u.id)} />
              {u.unitName}
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
