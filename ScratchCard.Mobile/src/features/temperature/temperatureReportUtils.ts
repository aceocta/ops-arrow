import { TemperatureReading, TemperatureScheduleGrid, TemperatureScheduleCellState } from "../../types/models";

export type TemperatureReadingGroup = {
  date: string;
  entries: TemperatureReading[];
};

export type TemperatureUnitReadingGroup = {
  unitName: string;
  entries: TemperatureReading[];
};

export type TemperatureReadingDateUnitGroup = {
  date: string;
  units: TemperatureUnitReadingGroup[];
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTemperature(value: number) {
  return `${value.toFixed(1)} C`;
}

function formatDateTimeValue(value: Date) {
  return `${value.toLocaleDateString()} ${value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatReportDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return value;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatDeviation(value: number, min: number, max: number) {
  if (value < min) {
    return `-${(min - value).toFixed(1)} C`;
  }

  if (value > max) {
    return `+${(value - max).toFixed(1)} C`;
  }

  return "0.0 C";
}

export function sortTemperatureReadingsForReport(readings: TemperatureReading[]) {
  return [...readings].sort((left, right) => {
    const dateCompare = right.readingDate.localeCompare(left.readingDate);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    const timeCompare = right.readingTime.localeCompare(left.readingTime);
    if (timeCompare !== 0) {
      return timeCompare;
    }

    return left.unitName.localeCompare(right.unitName);
  });
}

export function groupTemperatureReadingsByDate(readings: TemperatureReading[]): TemperatureReadingGroup[] {
  const groups = new Map<string, TemperatureReading[]>();

  readings.forEach((reading) => {
    const existing = groups.get(reading.readingDate) ?? [];
    existing.push(reading);
    groups.set(reading.readingDate, existing);
  });

  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, entries]) => ({ date, entries }));
}

export function groupTemperatureReadingsByDateAndUnit(
  readings: TemperatureReading[]
): TemperatureReadingDateUnitGroup[] {
  const dateMap = new Map<string, Map<string, TemperatureReading[]>>();

  readings.forEach((reading) => {
    const dateBucket = dateMap.get(reading.readingDate) ?? new Map<string, TemperatureReading[]>();
    const unitBucket = dateBucket.get(reading.unitName) ?? [];
    unitBucket.push(reading);
    dateBucket.set(reading.unitName, unitBucket);
    dateMap.set(reading.readingDate, dateBucket);
  });

  return [...dateMap.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, unitsMap]) => {
      const units = [...unitsMap.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([unitName, entries]) => ({ unitName, entries }));

      return { date, units };
    });
}

export function buildTemperatureRangeReportHtml(input: {
  shopName: string;
  from: string;
  to: string;
  generatedOn?: string;
  readings: TemperatureReading[];
  // When false, the reading-time column is omitted (shop setting / non-owner). Defaults to true.
  showReadingTime?: boolean;
  // When false, the deviation/status columns and in/out-range counts are omitted. Defaults to true.
  showRange?: boolean;
}) {
  const showReadingTime = input.showReadingTime !== false;
  const showRange = input.showRange !== false;
  const generatedAt = input.generatedOn ? new Date(input.generatedOn) : new Date();
  const reportDateTime = Number.isNaN(generatedAt.getTime())
    ? input.generatedOn ?? "-"
    : formatDateTimeValue(generatedAt);
  const orderedReadings = [...input.readings].sort((left, right) => {
    const dateCompare = right.readingDate.localeCompare(left.readingDate);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    const unitCompare = left.unitName.localeCompare(right.unitName);
    if (unitCompare !== 0) {
      return unitCompare;
    }

    return right.readingTime.localeCompare(left.readingTime);
  });
  const outOfRangeCount = input.readings.filter((reading) => reading.isOutOfRange).length;
  const inRangeCount = input.readings.length - outOfRangeCount;
  const groupedByDateAndUnit = groupTemperatureReadingsByDateAndUnit(orderedReadings);

  const dateSectionsHtml = groupedByDateAndUnit
    .map((dateGroup) => {
      const dateEntries = dateGroup.units.flatMap((unit) => unit.entries);
      const dateOutOfRange = dateEntries.filter((entry) => entry.isOutOfRange).length;
      const dateInRange = dateEntries.length - dateOutOfRange;

      const unitSectionsHtml = dateGroup.units
        .map((unitGroup) => {
          const sample = unitGroup.entries[0];
          const sampleRange = sample
            ? `${formatTemperature(Number(sample.minTemperatureCelsius))} to ${formatTemperature(Number(sample.maxTemperatureCelsius))}`
            : "-";
          const unitOutOfRange = unitGroup.entries.filter((entry) => entry.isOutOfRange).length;
          const unitInRange = unitGroup.entries.length - unitOutOfRange;

          const rowsHtml = unitGroup.entries
            .map((reading) => {
              const minTemperature = Number(reading.minTemperatureCelsius);
              const maxTemperature = Number(reading.maxTemperatureCelsius);
              const recordedTemperature = Number(reading.temperatureCelsius);
              const rangeLabel = `${formatTemperature(minTemperature)} to ${formatTemperature(maxTemperature)}`;
              const deviationLabel = formatDeviation(recordedTemperature, minTemperature, maxTemperature);
              return `
                <tr class="${showRange && reading.isOutOfRange ? "row-out" : ""}">
                  ${showReadingTime ? `<td>${escapeHtml(reading.readingTime || "--:--")}</td>` : ""}
                  <td>${escapeHtml(reading.equipmentType)}</td>
                  <td>${escapeHtml(rangeLabel)}</td>
                  <td>${escapeHtml(formatTemperature(recordedTemperature))}</td>
                  ${showRange ? `<td class="${reading.isOutOfRange ? "deviation-out" : "deviation-in"}">${escapeHtml(deviationLabel)}</td>` : ""}
                  ${showRange ? `<td class="${reading.isOutOfRange ? "status-out" : "status-in"}">${escapeHtml(reading.isOutOfRange ? "Out of range" : "In range")}</td>` : ""}
                  <td>${escapeHtml(reading.recordedByName ?? reading.checkedByInitials ?? "-")}</td>
                  <td>${escapeHtml(reading.actionTaken ?? "-")}</td>
                  <td>${escapeHtml(reading.notes ?? "-")}</td>
                </tr>
              `;
            })
            .join("");

          return `
            <div class="unit-title">Unit: ${escapeHtml(unitGroup.unitName)} | Type: ${escapeHtml(sample?.equipmentType ?? "-")} | Range: ${escapeHtml(sampleRange)} | Total: ${unitGroup.entries.length}${showRange ? ` | In range: ${unitInRange} | Out of range: ${unitOutOfRange}` : ""}</div>
            <table>
              <thead>
                <tr>
                  ${showReadingTime ? '<th class="col-time">Time</th>' : ""}
                  <th class="col-type">Type</th>
                  <th class="col-range">Allowed Range</th>
                  <th class="col-temp">Recorded Temp</th>
                  ${showRange ? '<th class="col-deviation">Deviation</th>' : ""}
                  ${showRange ? '<th class="col-status">Status</th>' : ""}
                  <th class="col-by">Checked By</th>
                  <th class="col-action">Action</th>
                  <th class="col-notes">Notes</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || `<tr><td colspan="${9 - (showReadingTime ? 0 : 1) - (showRange ? 0 : 2)}">No readings found for this unit.</td></tr>`}
              </tbody>
            </table>
          `;
        })
        .join("");

      return `
        <div class="date-title">Date: ${escapeHtml(formatReportDate(dateGroup.date))} | Total: ${dateEntries.length}${showRange ? ` | In range: ${dateInRange} | Out of range: ${dateOutOfRange}` : ""}</div>
        ${unitSectionsHtml}
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page {
            size: landscape;
            margin: 10mm;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #0f1720;
            margin: 20px;
            font-size: 12px;
          }
          .title {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 4px;
          }
          .subtitle {
            font-size: 12px;
            color: #425463;
            margin-bottom: 4px;
          }
          .meta {
            font-size: 12px;
            color: #425463;
            margin-bottom: 10px;
          }
          .date-title {
            margin-top: 16px;
            margin-bottom: 8px;
            font-size: 12px;
            font-weight: 700;
            color: #1a2a36;
          }
          .unit-title {
            margin-top: 10px;
            margin-bottom: 6px;
            font-size: 11px;
            font-weight: 700;
            color: #223542;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            table-layout: fixed;
            margin-bottom: 8px;
          }
          th, td {
            border: 1px solid #9aa9b5;
            padding: 5px 4px;
            vertical-align: top;
            word-wrap: break-word;
          }
          th {
            background: #edf2f5;
            text-align: left;
            font-size: 10px;
          }
          td {
            font-size: 9px;
          }
          tbody tr:nth-child(even) td {
            background: #fafcfd;
          }
          .row-out td {
            background: #fff8f8;
          }
          .status-in {
            color: #0b6b3a;
            font-weight: 700;
          }
          .status-out {
            color: #9d1c20;
            font-weight: 700;
          }
          .deviation-in {
            color: #0f1720;
          }
          .deviation-out {
            color: #9d1c20;
            font-weight: 700;
          }
          .col-time { width: 7%; }
          .col-type { width: 8%; }
          .col-range { width: 14%; }
          .col-temp { width: 10%; }
          .col-deviation { width: 8%; }
          .col-status { width: 9%; }
          .col-by { width: 12%; }
          .col-action { width: 14%; }
          .col-notes { width: 18%; }
        </style>
      </head>
      <body>
        <div class="title">Temperature Logs Range Report</div>
        <div class="subtitle">Shop: ${escapeHtml(input.shopName)} | Date Range: ${escapeHtml(formatReportDate(input.from))} to ${escapeHtml(formatReportDate(input.to))}</div>
        <div class="meta">Report Date Time: ${escapeHtml(reportDateTime)}</div>
        <div class="meta">Total: ${input.readings.length}${showRange ? ` | In range: ${inRangeCount} | Out of range: ${outOfRangeCount}` : ""}</div>
        ${dateSectionsHtml || "<div>No readings found for this date range.</div>"}
      </body>
    </html>
  `;
}

const GRID_GLYPH: Record<TemperatureScheduleCellState, string> = {
  OnTime: "✓",
  Early: "«",
  Late: "⚠",
  Missed: "✗",
  Upcoming: "–",
};

function gridShortDate(value: string) {
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

// Builds the schedule-grid report (units × date/slot matrix) so the printed/emailed PDF matches the
// on-screen grid. Honours the same display settings: showTiming (early/late/missed), showReadingTime
// (clock time in each cell), showRange (in/out-of-range colour + legend).
export function buildTemperatureScheduleGridHtml(input: {
  shopName: string;
  grid: TemperatureScheduleGrid;
  generatedOn?: string;
  showTiming?: boolean;
  showReadingTime?: boolean;
  showRange?: boolean;
}) {
  const showTiming = input.showTiming !== false;
  const showReadingTime = input.showReadingTime !== false;
  const showRange = input.showRange !== false;
  const grid = input.grid;

  const generatedAt = input.generatedOn ? new Date(input.generatedOn) : new Date();
  const reportDateTime = Number.isNaN(generatedAt.getTime()) ? input.generatedOn ?? "-" : formatDateTimeValue(generatedAt);

  // Dates spanning the range.
  const dates: string[] = [];
  for (let d = new Date(`${grid.from}T00:00:00`); d <= new Date(`${grid.to}T00:00:00`); d.setDate(d.getDate() + 1)) {
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }

  // Distinct slot columns (label + time), ordered by time.
  const slotColumns: { label: string; expectedTime: string }[] = [];
  const seenSlot = new Set<string>();
  for (const s of [...grid.slots].sort((a, b) => a.expectedTime.localeCompare(b.expectedTime))) {
    const key = `${s.label}|${s.expectedTime}`;
    if (seenSlot.has(key)) continue;
    seenSlot.add(key);
    slotColumns.push({ label: s.label, expectedTime: s.expectedTime });
  }

  const scheduleIdFor = (col: { label: string; expectedTime: string }, unitId: string) =>
    grid.slots.find((s) => s.label === col.label && s.expectedTime === col.expectedTime && (!s.unitId || s.unitId === unitId))?.scheduleId;

  const cellsByKey = new Map<string, (typeof grid.cells)[number]>();
  for (const c of grid.cells) cellsByKey.set(`${c.date}|${c.unitId}|${c.scheduleId}`, c);

  const stateColor = (state: TemperatureScheduleCellState) => {
    switch (state) {
      case "OnTime": return "#137333";
      case "Early": case "Late": return "#9a6700";
      case "Missed": return "#b3261e";
      default: return "#7a8a96";
    }
  };

  // Header row 1: Unit (spans both header rows) + a date cell per date spanning its slot columns.
  const dateHeaderCells = dates
    .map((date) => `<th colspan="${slotColumns.length}">${escapeHtml(gridShortDate(date))}</th>`)
    .join("");
  // Header row 2: slot label + time under each date.
  const slotHeaderCells = dates
    .map(() => slotColumns.map((col) => `<th class="slot">${escapeHtml(col.label)}<div class="slot-time">${escapeHtml((col.expectedTime || "").slice(0, 5))}</div></th>`).join(""))
    .join("");

  const bodyRows = grid.units
    .map((unit) => {
      const cells = dates
        .map((date) =>
          slotColumns
            .map((col) => {
              const scheduleId = scheduleIdFor(col, unit.unitId);
              if (!scheduleId) return `<td class="na"></td>`;
              const cell = cellsByKey.get(`${date}|${unit.unitId}|${scheduleId}`);
              const rawState = cell?.state ?? "Upcoming";
              const state: TemperatureScheduleCellState = showTiming ? rawState : cell?.readingId ? "OnTime" : "Upcoming";
              const timeHtml = showReadingTime && cell?.readingTime ? `<div class="c-time">${escapeHtml(cell.readingTime.slice(0, 5))}</div>` : "";
              const tempColor = !showRange ? "#0f1720" : cell?.isOutOfRange ? "#b3261e" : "#137333";
              const tempHtml =
                cell?.temperatureCelsius != null
                  ? `<div class="c-temp" style="color:${tempColor}">${showRange ? (cell.isOutOfRange ? "▲ " : "● ") : ""}${cell.temperatureCelsius.toFixed(1)}°</div>`
                  : "";
              // No tick for on-time cells in the export — the temperature/time already convey "done".
              const glyph = state === "OnTime" ? "" : GRID_GLYPH[state];
              const glyphHtml = glyph ? `<div class="c-glyph" style="color:${stateColor(state)}">${glyph}</div>` : "";
              return `<td>${glyphHtml}${timeHtml}${tempHtml}</td>`;
            })
            .join(""),
        )
        .join("");
      return `<tr><th class="unit">${escapeHtml(unit.displayOrder ? `${unit.displayOrder}. ` : "")}${escapeHtml(unit.unitName)}</th>${cells}</tr>`;
    })
    .join("");

  const legend = `
    <div class="legend">
      ${showTiming ? `<span style="color:#137333">On time ${grid.onTimeCount}</span> <span style="color:#9a6700">« ${grid.earlyCount}</span> <span style="color:#9a6700">⚠ ${grid.lateCount}</span> <span style="color:#b3261e">✗ ${grid.missedCount}</span>` : ""}
    </div>`;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: landscape; margin: 10mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #0f1720; margin: 20px; font-size: 11px; }
          .title { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
          .subtitle, .meta { font-size: 11px; color: #425463; margin-bottom: 4px; }
          .legend { margin: 8px 0; font-size: 12px; font-weight: 700; }
          .legend span { margin-right: 12px; }
          table { border-collapse: collapse; width: 100%; table-layout: fixed; }
          th, td { border: 1px solid #9aa9b5; padding: 3px; text-align: center; vertical-align: top; word-wrap: break-word; }
          th.unit { text-align: left; width: 110px; background: #f1f4f6; }
          th.slot { font-size: 10px; }
          .slot-time { font-weight: 400; color: #425463; font-size: 9px; }
          td.na { background: #f7f9fa; }
          .c-glyph { font-size: 12px; font-weight: 700; }
          .c-time { font-size: 9px; color: #425463; }
          .c-temp { font-size: 10px; font-weight: 700; }
        </style>
      </head>
      <body>
        <div class="title">Temperature Schedule Grid</div>
        <div class="subtitle">Shop: ${escapeHtml(input.shopName)} | Date Range: ${escapeHtml(formatReportDate(grid.from))} to ${escapeHtml(formatReportDate(grid.to))}</div>
        <div class="meta">Report Date Time: ${escapeHtml(reportDateTime)}</div>
        ${legend}
        <table>
          <thead>
            <tr><th class="unit" rowspan="2">Unit</th>${dateHeaderCells}</tr>
            <tr>${slotHeaderCells}</tr>
          </thead>
          <tbody>
            ${bodyRows || `<tr><td colspan="${dates.length * slotColumns.length + 1}">No scheduled checks for this range.</td></tr>`}
          </tbody>
        </table>
      </body>
    </html>
  `;
}
