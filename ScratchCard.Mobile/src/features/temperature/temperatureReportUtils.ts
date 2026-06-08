import { TemperatureReading } from "../../types/models";

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
}) {
  const showReadingTime = input.showReadingTime !== false;
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
                <tr class="${reading.isOutOfRange ? "row-out" : ""}">
                  ${showReadingTime ? `<td>${escapeHtml(reading.readingTime || "--:--")}</td>` : ""}
                  <td>${escapeHtml(reading.equipmentType)}</td>
                  <td>${escapeHtml(rangeLabel)}</td>
                  <td>${escapeHtml(formatTemperature(recordedTemperature))}</td>
                  <td class="${reading.isOutOfRange ? "deviation-out" : "deviation-in"}">${escapeHtml(deviationLabel)}</td>
                  <td class="${reading.isOutOfRange ? "status-out" : "status-in"}">${escapeHtml(
                    reading.isOutOfRange ? "Out of range" : "In range"
                  )}</td>
                  <td>${escapeHtml(reading.recordedByName ?? reading.checkedByInitials ?? "-")}</td>
                  <td>${escapeHtml(reading.actionTaken ?? "-")}</td>
                  <td>${escapeHtml(reading.notes ?? "-")}</td>
                </tr>
              `;
            })
            .join("");

          return `
            <div class="unit-title">Unit: ${escapeHtml(unitGroup.unitName)} | Type: ${escapeHtml(sample?.equipmentType ?? "-")} | Range: ${escapeHtml(sampleRange)} | Total: ${unitGroup.entries.length} | In range: ${unitInRange} | Out of range: ${unitOutOfRange}</div>
            <table>
              <thead>
                <tr>
                  ${showReadingTime ? '<th class="col-time">Time</th>' : ""}
                  <th class="col-type">Type</th>
                  <th class="col-range">Allowed Range</th>
                  <th class="col-temp">Recorded Temp</th>
                  <th class="col-deviation">Deviation</th>
                  <th class="col-status">Status</th>
                  <th class="col-by">Checked By</th>
                  <th class="col-action">Action</th>
                  <th class="col-notes">Notes</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || `<tr><td colspan="${showReadingTime ? 9 : 8}">No readings found for this unit.</td></tr>`}
              </tbody>
            </table>
          `;
        })
        .join("");

      return `
        <div class="date-title">Date: ${escapeHtml(formatReportDate(dateGroup.date))} | Total: ${dateEntries.length} | In range: ${dateInRange} | Out of range: ${dateOutOfRange}</div>
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
        <div class="meta">Total: ${input.readings.length} | In range: ${inRangeCount} | Out of range: ${outOfRangeCount}</div>
        ${dateSectionsHtml || "<div>No readings found for this date range.</div>"}
      </body>
    </html>
  `;
}
