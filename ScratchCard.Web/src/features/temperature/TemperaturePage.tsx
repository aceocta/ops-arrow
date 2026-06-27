import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { temperatureApi, type TempCellState, type TempGridCell } from "../../lib/temperature";
import { fmtDate, shortTime, addDays } from "../../lib/rota";
import { downloadCsv } from "../../lib/csv";
import { apiErrorMessage } from "../../lib/api";
import { toast } from "../../components/feedback";
import ExportButton from "../../components/ExportButton";
import { X, Activity, Settings2, Thermometer } from "lucide-react";
import clsx from "clsx";

const GLYPH: Record<TempCellState, string> = { OnTime: "✓", Early: "«", Late: "⚠", Missed: "✗", Upcoming: "–" };
const STATE_LABEL: Record<TempCellState, string> = { OnTime: "On time", Early: "Early", Late: "Late", Missed: "Missed", Upcoming: "Upcoming" };
function stateColor(s: TempCellState) {
  if (s === "OnTime") return "text-emerald-600";
  if (s === "Early" || s === "Late") return "text-amber-600";
  if (s === "Missed") return "text-red-600";
  return "text-slate-300";
}
function shortDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

type SelectedCell = { cell: TempGridCell; unitName: string; slotLabel: string; expectedTime: string };

export default function TemperaturePage() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId!;
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 6);
    return { from: fmtDate(from), to: fmtDate(to) };
  });
  const setQuick = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    setRange({ from: fmtDate(from), to: fmtDate(to) });
  };

  const q = useQuery({
    queryKey: ["temp-grid", shopId, range.from, range.to],
    queryFn: () => temperatureApi.grid(shopId, range.from, range.to),
    enabled: !!shopId,
  });
  const grid = q.data;

  // Temperature is unusable until the shop has at least one unit AND one check time (defaults are no
  // longer auto-seeded). When either is missing, prompt the owner to finish setup instead of the grid.
  const unitsQ = useQuery({ queryKey: ["temperature-units", shopId], queryFn: () => temperatureApi.units(shopId), enabled: !!shopId });
  const schedulesQ = useQuery({ queryKey: ["temperature-schedules", shopId], queryFn: () => temperatureApi.schedules(shopId), enabled: !!shopId });
  const setupIncomplete =
    !unitsQ.isLoading && !schedulesQ.isLoading && ((unitsQ.data?.length ?? 0) === 0 || (schedulesQ.data?.length ?? 0) === 0);

  // On-demand "check trends now" — surfaces units drifting toward a breach (and pushes alerts).
  const predictiveCheck = useMutation({
    mutationFn: () => temperatureApi.predictiveCheck(shopId),
    onSuccess: (result) => {
      if (result.predictions.length === 0) {
        toast(
          result.unitsEvaluated > 0
            ? "All units stable — nothing trending toward a breach."
            : "Not enough recent readings to analyse trends yet.",
          "success",
        );
        return;
      }
      const lead = result.predictions[0];
      const extra = result.predictions.length - 1;
      toast(extra > 0 ? `${lead.message} (+${extra} more)` : lead.message, "error");
    },
    onError: (e) => toast(apiErrorMessage(e), "error"),
  });

  const dates = useMemo(() => {
    if (!grid) return [];
    const out: string[] = [];
    for (let d = grid.from; d <= grid.to; d = addDays(d, 1)) out.push(d);
    return out;
  }, [grid]);

  const slotCols = useMemo(() => {
    if (!grid) return [];
    const seen = new Set<string>();
    const cols: { label: string; expectedTime: string }[] = [];
    for (const s of [...grid.slots].sort((a, b) => a.expectedTime.localeCompare(b.expectedTime))) {
      const k = `${s.label}|${s.expectedTime}`;
      if (seen.has(k)) continue;
      seen.add(k);
      cols.push({ label: s.label, expectedTime: s.expectedTime });
    }
    return cols;
  }, [grid]);

  const cellMap = useMemo(() => {
    const m = new Map<string, NonNullable<typeof grid>["cells"][number]>();
    grid?.cells.forEach((c) => m.set(`${c.date}|${c.unitId}|${c.scheduleId}`, c));
    return m;
  }, [grid]);

  const schedFor = (label: string, time: string, unitId: string) =>
    grid?.slots.find((s) => s.label === label && s.expectedTime === time && (!s.unitId || s.unitId === unitId))?.scheduleId;

  const exportCsv = () => {
    if (!grid) return;
    const unitName = new Map(grid.units.map((u) => [u.unitId, u.unitName]));
    const slot = new Map(grid.slots.map((s) => [s.scheduleId, s]));
    const rows = grid.cells.map((c) => {
      const s = slot.get(c.scheduleId);
      return [
        c.date, unitName.get(c.unitId) ?? c.unitId, s?.label ?? "", s ? shortTime(s.expectedTime) : "",
        c.state, c.readingTime ? shortTime(c.readingTime) : "", c.temperatureCelsius ?? "", c.isOutOfRange ? "Yes" : "",
      ];
    });
    downloadCsv(
      `temperature_${grid.from}_${grid.to}`,
      ["Date", "Unit", "Slot", "Expected time", "State", "Reading time", "Temperature °C", "Out of range"],
      rows,
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Temperature</h1>
          <p className="text-sm text-slate-500">Scheduled checks · {range.from} → {range.to}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            {[7, 30].map((d) => (
              <button key={d} onClick={() => setQuick(d)} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">{d} days</button>
            ))}
          </div>
          <input type="date" className="input w-auto" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          <input type="date" className="input w-auto" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          <button className="btn-ghost" disabled={predictiveCheck.isPending} onClick={() => predictiveCheck.mutate()} title="Analyse recent readings and alert on units trending toward a breach">
            <Activity className="h-4 w-4" /> {predictiveCheck.isPending ? "Checking…" : "Check trends"}
          </button>
          <Link to="/temperature/config" className="btn-ghost"><Settings2 className="h-4 w-4" /> Set up</Link>
          <ExportButton onClick={exportCsv} disabled={!grid} />
        </div>
      </div>

      {setupIncomplete ? (
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Thermometer className="h-6 w-6" /></div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Finish setting up Temperature</h2>
            <p className="mt-1 text-sm text-slate-500">
              Add at least one fridge or freezer and one check time before staff can record temperatures.
            </p>
          </div>
          <Link to="/temperature/config" className="btn-primary"><Settings2 className="h-4 w-4" /> Set up units &amp; checks</Link>
        </div>
      ) : null}

      {grid && !setupIncomplete ? (
        <div className="flex flex-wrap gap-3 text-sm font-medium">
          <span className="text-emerald-600">✓ {grid.onTimeCount} on time</span>
          <span className="text-amber-600">« {grid.earlyCount} early</span>
          <span className="text-amber-600">⚠ {grid.lateCount} late</span>
          <span className="text-red-600">✗ {grid.missedCount} missed</span>
        </div>
      ) : null}

      {q.isLoading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}

      {grid && !setupIncomplete ? (
        <div className="card overflow-x-auto">
          <table className="min-w-full border-collapse text-center text-xs">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-2 text-left">Unit</th>
                {dates.map((d) => (
                  <th key={d} colSpan={slotCols.length} className="border-b border-l border-slate-200 px-2 py-1 font-semibold text-slate-700">{shortDate(d)}</th>
                ))}
              </tr>
              <tr>
                {dates.map((d) =>
                  slotCols.map((c, i) => (
                    <th key={`${d}|${c.label}|${i}`} className={clsx("border-b border-slate-200 px-2 py-1 font-medium text-slate-500", i === 0 && "border-l")}>
                      {c.label}
                      <div className="font-normal text-slate-400">{shortTime(c.expectedTime)}</div>
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {grid.units.map((u) => (
                <tr key={u.unitId} className="hover:bg-slate-50">
                  <td className="sticky left-0 z-10 border-r border-t border-slate-200 bg-white px-3 py-2 text-left font-medium text-slate-800">
                    {u.displayOrder ? `${u.displayOrder}. ` : ""}{u.unitName}
                  </td>
                  {dates.map((d) =>
                    slotCols.map((c, i) => {
                      const sid = schedFor(c.label, c.expectedTime, u.unitId);
                      if (!sid) return <td key={`${d}|${c.label}|${i}`} className={clsx("border-t border-slate-100 bg-slate-50/50", i === 0 && "border-l border-slate-200")} />;
                      const cell = cellMap.get(`${d}|${u.unitId}|${sid}`) ?? { date: d, unitId: u.unitId, scheduleId: sid, state: "Upcoming" as TempCellState };
                      const state = cell.state;
                      return (
                        <td
                          key={`${d}|${c.label}|${i}`}
                          onClick={() => setSelected({ cell, unitName: u.unitName, slotLabel: c.label, expectedTime: c.expectedTime })}
                          className={clsx("cursor-pointer border-t border-slate-100 px-2 py-1.5 transition hover:bg-brand-50", i === 0 && "border-l border-slate-200")}
                        >
                          <div className={clsx("font-bold", stateColor(state))}>{GLYPH[state]}</div>
                          {cell.readingTime ? <div className="text-[10px] text-slate-400">{shortTime(cell.readingTime)}</div> : null}
                          {cell.temperatureCelsius != null ? (
                            <div className={clsx("text-[11px] font-medium", cell.isOutOfRange ? "text-red-600" : "text-emerald-600")}>
                              {cell.temperatureCelsius.toFixed(1)}°
                            </div>
                          ) : null}
                        </td>
                      );
                    }),
                  )}
                </tr>
              ))}
              {grid.units.length === 0 ? (
                <tr><td colSpan={1 + dates.length * slotCols.length} className="px-3 py-6 text-slate-400">No units configured.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? <TempCellDetail shopId={shopId} selected={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function detailRow(label: string, value: React.ReactNode) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}

function TempCellDetail({ shopId, selected, onClose }: { shopId: string; selected: SelectedCell; onClose: () => void }) {
  const { cell, unitName, slotLabel, expectedTime } = selected;
  const hasReading = !!cell.readingId;

  const q = useQuery({
    queryKey: ["temp-reading", shopId, cell.unitId, cell.date],
    queryFn: () => temperatureApi.readings(shopId, cell.date, cell.date, cell.unitId),
    enabled: hasReading,
  });
  const reading = (q.data ?? []).find((r) => r.id === cell.readingId);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{unitName}</h2>
            <p className="text-sm text-slate-500">{shortDate(cell.date)} · {slotLabel} ({shortTime(expectedTime)})</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-4">
          <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
            cell.state === "OnTime" ? "bg-emerald-100 text-emerald-700"
              : cell.state === "Missed" ? "bg-red-100 text-red-700"
              : cell.state === "Upcoming" ? "bg-slate-100 text-slate-500"
              : "bg-amber-100 text-amber-700")}>
            <span className="font-bold">{GLYPH[cell.state]}</span> {STATE_LABEL[cell.state]}
          </span>
        </div>

        {hasReading ? (
          q.isLoading ? (
            <div className="py-6 text-center text-sm text-slate-500">Loading reading…</div>
          ) : reading ? (
            <dl className="space-y-3 text-sm">
              {detailRow("Temperature", (
                <span className={clsx("font-semibold", reading.isOutOfRange ? "text-red-600" : "text-emerald-600")}>
                  {reading.temperatureCelsius.toFixed(1)}°C {reading.isOutOfRange ? "· out of range" : "· in range"}
                </span>
              ))}
              {detailRow("Target range", `${reading.minTemperatureCelsius}°C to ${reading.maxTemperatureCelsius}°C`)}
              {detailRow("Reading time", `${shortTime(reading.readingTime)}${reading.isLateForSchedule ? " (late)" : ""}`)}
              {detailRow("Checked by", `${reading.checkedByInitials}${reading.recordedByName ? ` · ${reading.recordedByName}` : ""}`)}
              {reading.notes ? detailRow("Notes", reading.notes) : null}
              {reading.actionTaken ? detailRow("Action taken", reading.actionTaken) : null}
              {detailRow("Recorded", new Date(reading.recordedOn).toLocaleString("en-GB"))}
            </dl>
          ) : (
            <dl className="space-y-3 text-sm">
              {detailRow("Temperature", cell.temperatureCelsius != null
                ? <span className={clsx("font-semibold", cell.isOutOfRange ? "text-red-600" : "text-emerald-600")}>{cell.temperatureCelsius.toFixed(1)}°C</span>
                : "—")}
              {cell.readingTime ? detailRow("Reading time", shortTime(cell.readingTime)) : null}
            </dl>
          )
        ) : (
          <p className="text-sm text-slate-500">
            {cell.state === "Missed" ? "No reading was recorded for this scheduled check." : "No reading recorded yet for this slot."}
          </p>
        )}
      </div>
    </div>
  );
}
