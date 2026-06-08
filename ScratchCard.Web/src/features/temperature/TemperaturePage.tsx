import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { temperatureApi, type TempCellState } from "../../lib/temperature";
import { fmtDate, shortTime, addDays } from "../../lib/rota";
import { downloadCsv } from "../../lib/csv";
import ExportButton from "../../components/ExportButton";
import clsx from "clsx";

const GLYPH: Record<TempCellState, string> = { OnTime: "✓", Early: "«", Late: "⚠", Missed: "✗", Upcoming: "–" };
function stateColor(s: TempCellState) {
  if (s === "OnTime") return "text-emerald-600";
  if (s === "Early" || s === "Late") return "text-amber-600";
  if (s === "Missed") return "text-red-600";
  return "text-slate-300";
}
function shortDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function TemperaturePage() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId!;
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
          <ExportButton onClick={exportCsv} disabled={!grid} />
        </div>
      </div>

      {grid ? (
        <div className="flex flex-wrap gap-3 text-sm font-medium">
          <span className="text-emerald-600">✓ {grid.onTimeCount} on time</span>
          <span className="text-amber-600">« {grid.earlyCount} early</span>
          <span className="text-amber-600">⚠ {grid.lateCount} late</span>
          <span className="text-red-600">✗ {grid.missedCount} missed</span>
        </div>
      ) : null}

      {q.isLoading ? <div className="card p-6 text-sm text-slate-500">Loading…</div> : null}

      {grid ? (
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
                      const cell = cellMap.get(`${d}|${u.unitId}|${sid}`);
                      const state = (cell?.state ?? "Upcoming") as TempCellState;
                      return (
                        <td key={`${d}|${c.label}|${i}`} className={clsx("border-t border-slate-100 px-2 py-1.5", i === 0 && "border-l border-slate-200")}>
                          <div className={clsx("font-bold", stateColor(state))}>{GLYPH[state]}</div>
                          {cell?.readingTime ? <div className="text-[10px] text-slate-400">{shortTime(cell.readingTime)}</div> : null}
                          {cell?.temperatureCelsius != null ? (
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
    </div>
  );
}
