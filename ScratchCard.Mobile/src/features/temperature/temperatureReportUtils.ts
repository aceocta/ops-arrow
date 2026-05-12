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
}) {
  const generatedAt = input.generatedOn ? new Date(input.generatedOn) : new Date();
  const reportDateTime = Number.isNaN(generatedAt.getTime())
    ? input.generatedOn ?? "-"
    : formatDateTimeValue(generatedAt);
  const groups = groupTemperatureReadingsByDateAndUnit(input.readings);

  const groupHtml = groups
    .map((group) => {
      const unitRows = group.units
        .map((unitGroup) => {
          const rows = unitGroup.entries
            .map((reading) => {
              return `
                <tr>
                  <td>${escapeHtml(reading.readingTime || "--:--")}</td>
                  <td>${escapeHtml(reading.equipmentType)}</td>
                  <td>${escapeHtml(formatTemperature(Number(reading.temperatureCelsius)))}</td>
                  <td>${escapeHtml(reading.recordedByName ?? reading.checkedByInitials ?? "-")}</td>
                  <td>${escapeHtml(reading.actionTaken ?? "-")}</td>
                  <td>${escapeHtml(reading.notes ?? "-")}</td>
                </tr>
              `;
            })
            .join("");

          return `
            <tr class="unit-row">
              <td colspan="6">
                Unit: ${escapeHtml(unitGroup.unitName)} (${unitGroup.entries.length} reading${unitGroup.entries.length === 1 ? "" : "s"})
              </td>
            </tr>
            ${rows || `<tr><td colspan="6">No readings for this unit.</td></tr>`}
          `;
        })
        .join("");

      return `
        <div class="group-title">Date: ${escapeHtml(group.date)}</div>
        <table>
          <thead>
            <tr>
              <th class="col-time">Time</th>
              <th class="col-type">Type</th>
              <th class="col-temp">Temp</th>
              <th class="col-by">Checked By</th>
              <th class="col-action">Action</th>
              <th class="col-notes">Notes</th>
            </tr>
          </thead>
          <tbody>
            ${unitRows || `<tr><td colspan="6">No readings for this date.</td></tr>`}
          </tbody>
        </table>
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
          .group-title {
            margin-top: 12px;
            margin-bottom: 6px;
            font-size: 12px;
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
          .unit-row td {
            background: #f7fafc;
            font-weight: 700;
            font-size: 10px;
          }
          .col-time { width: 10%; }
          .col-type { width: 12%; }
          .col-temp { width: 10%; }
          .col-by { width: 14%; }
          .col-action { width: 22%; }
          .col-notes { width: 32%; }
        </style>
      </head>
      <body>
        <div class="title">Temperature Logs Range Report</div>
        <div class="subtitle">Shop: ${escapeHtml(input.shopName)} | Date Range: ${escapeHtml(input.from)} to ${escapeHtml(input.to)}</div>
        <div class="meta">Report Date Time: ${escapeHtml(reportDateTime)}</div>
        ${groupHtml || "<div>No readings found for this date range.</div>"}
      </body>
    </html>
  `;
}
