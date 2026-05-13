import { BusinessDay, DailySalesReportRow } from "../../types/models";

type ScratchCardDailyGroup = {
  businessDate: string;
  rows: DailySalesReportRow[];
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(value: number) {
  return `GBP ${value.toFixed(2)}`;
}

function getDifferenceValue(row: DailySalesReportRow) {
  return Number(row.difference ?? 0);
}

function getVarianceStatus(difference: number) {
  if (difference > 0.009) {
    return "Over";
  }

  if (difference < -0.009) {
    return "Short";
  }

  return "Balanced";
}

function buildGroups(rows: DailySalesReportRow[]): ScratchCardDailyGroup[] {
  const groups = new Map<string, DailySalesReportRow[]>();

  rows.forEach((row) => {
    const existingRows = groups.get(row.businessDate) ?? [];
    existingRows.push(row);
    groups.set(row.businessDate, existingRows);
  });

  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([businessDate, dailyRows]) => ({
      businessDate,
      rows: [...dailyRows].sort((left, right) => left.shiftName.localeCompare(right.shiftName)),
    }));
}

function formatReportDateTime(value: Date) {
  return `${value.toLocaleDateString()} ${value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function buildScratchCardDailySalesReportHtml(input: {
  shopName: string;
  from: string;
  to: string;
  rows: DailySalesReportRow[];
  businessDays?: BusinessDay[];
  generatedOn?: string;
}) {
  const generatedOnDate = input.generatedOn ? new Date(input.generatedOn) : new Date();
  const reportDateTime = Number.isNaN(generatedOnDate.getTime())
    ? input.generatedOn ?? "-"
    : formatReportDateTime(generatedOnDate);
  const groups = buildGroups(input.rows);
  const businessDayByDate = new Map<string, BusinessDay>(
    (input.businessDays ?? []).map((day) => [day.businessDate, day]),
  );

  const totalSales = input.rows.reduce((sum, row) => sum + Number(row.salesAmount ?? 0), 0);
  const totalPayout = input.rows.reduce((sum, row) => sum + Number(row.prizePayout ?? 0), 0);
  const totalExpected = input.rows.reduce((sum, row) => sum + Number(row.expectedCash ?? 0), 0);
  const totalDifference = input.rows.reduce((sum, row) => sum + getDifferenceValue(row), 0);
  const totalMissingTickets = (input.businessDays ?? []).reduce(
    (sum, day) => sum + Number(day.missingOpeningTicketCount ?? 0),
    0,
  );

  const groupsHtml = groups
    .map((group) => {
      const dayContext = businessDayByDate.get(group.businessDate);
      const dayMissingCount = Number(dayContext?.missingOpeningTicketCount ?? 0);
      const dayMissingDetails = dayContext?.missingOpeningTicketDetails ?? [];

      const rowsHtml = group.rows
        .map((row) => {
          const difference = getDifferenceValue(row);
          return `
            <tr>
              <td>${escapeHtml(row.shiftName)}</td>
              <td>${escapeHtml(formatMoney(Number(row.salesAmount ?? 0)))}</td>
              <td>${escapeHtml(formatMoney(Number(row.prizePayout ?? 0)))}</td>
              <td>${escapeHtml(formatMoney(Number(row.expectedCash ?? 0)))}</td>
              <td>${escapeHtml(formatMoney(difference))}</td>
              <td>${escapeHtml(getVarianceStatus(difference))}</td>
            </tr>
          `;
        })
        .join("");

      const daySales = group.rows.reduce((sum, row) => sum + Number(row.salesAmount ?? 0), 0);
      const dayPayout = group.rows.reduce((sum, row) => sum + Number(row.prizePayout ?? 0), 0);
      const dayExpected = group.rows.reduce((sum, row) => sum + Number(row.expectedCash ?? 0), 0);
      const dayDifference = group.rows.reduce((sum, row) => sum + getDifferenceValue(row), 0);

      const dayMissingDetailsHtml = dayMissingDetails
        .map((detail) => `
          <tr>
            <td>${escapeHtml(detail.shiftName)}</td>
            <td>${escapeHtml(detail.displayNumber != null ? String(detail.displayNumber) : "-")}</td>
            <td>${escapeHtml(detail.gameName)}</td>
            <td>${escapeHtml(detail.gameCode || "-")}</td>
            <td>${escapeHtml(detail.packNumber)}</td>
            <td>${escapeHtml(detail.expectedOpeningSerialNumber)}</td>
            <td>${escapeHtml(detail.actualOpeningSerialNumber)}</td>
            <td>${escapeHtml(String(detail.missingQuantity))}</td>
          </tr>
        `)
        .join("");

      return `
        <div class="group-title">Business Date: ${escapeHtml(group.businessDate)}</div>
        <table>
          <thead>
            <tr>
              <th class="col-shift">Shift</th>
              <th class="col-money">Sales</th>
              <th class="col-money">Payout</th>
              <th class="col-money">Expected</th>
              <th class="col-money">Difference</th>
              <th class="col-status">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="6">No shift records for this business date.</td></tr>`}
            <tr class="summary-row">
              <td>Day Total</td>
              <td>${escapeHtml(formatMoney(daySales))}</td>
              <td>${escapeHtml(formatMoney(dayPayout))}</td>
              <td>${escapeHtml(formatMoney(dayExpected))}</td>
              <td>${escapeHtml(formatMoney(dayDifference))}</td>
              <td>${escapeHtml(getVarianceStatus(dayDifference))}</td>
            </tr>
          </tbody>
        </table>
        <div class="missing-wrap">
          <div class="missing-title">Missing Tickets (Opening Serial): ${escapeHtml(String(dayMissingCount))}</div>
          ${
            dayMissingDetails.length === 0
              ? `<div class="missing-empty">No missing-ticket detail rows recorded.</div>`
              : `
              <table>
                <thead>
                  <tr>
                    <th>Shift</th>
                    <th>Display</th>
                    <th>Game</th>
                    <th>Code</th>
                    <th>Pack</th>
                    <th>Expected Serial</th>
                    <th>Actual Serial</th>
                    <th>Missing Qty</th>
                  </tr>
                </thead>
                <tbody>
                  ${dayMissingDetailsHtml}
                </tbody>
              </table>
            `
          }
        </div>
      `;
    })
    .join("");

  const grandTotalHtml = input.rows.length
    ? `
      <div class="group-title">Final Totals</div>
      <table>
        <thead>
          <tr>
            <th class="col-shift">Shift</th>
            <th class="col-money">Sales</th>
            <th class="col-money">Payout</th>
            <th class="col-money">Expected</th>
            <th class="col-money">Difference</th>
            <th class="col-status">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr class="grand-total-row">
            <td>All Dates Total</td>
            <td>${escapeHtml(formatMoney(totalSales))}</td>
            <td>${escapeHtml(formatMoney(totalPayout))}</td>
            <td>${escapeHtml(formatMoney(totalExpected))}</td>
            <td>${escapeHtml(formatMoney(totalDifference))}</td>
            <td>${escapeHtml(getVarianceStatus(totalDifference))}</td>
          </tr>
        </tbody>
      </table>
    `
    : "";

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
          .report-meta {
            font-size: 12px;
            color: #425463;
            margin-bottom: 12px;
          }
          .summary {
            border: 1px solid #9aa9b5;
            border-radius: 8px;
            background: #f5f8fa;
            padding: 8px 10px;
            margin-bottom: 12px;
            font-size: 11px;
            color: #223542;
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
            margin-bottom: 10px;
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
          .summary-row td {
            background: #f7fafc;
            font-weight: 700;
          }
          .grand-total-row td {
            background: #e9f3fb;
            font-weight: 700;
          }
          .col-shift { width: 24%; }
          .col-money { width: 12%; }
          .col-status { width: 8%; }
          .missing-wrap {
            border: 1px solid #9aa9b5;
            border-radius: 8px;
            background: #faf7f7;
            padding: 8px 10px;
            margin-bottom: 10px;
          }
          .missing-title {
            font-size: 12px;
            font-weight: 700;
            margin-bottom: 6px;
            color: #4a1f1f;
          }
          .missing-empty {
            font-size: 10px;
            color: #425463;
          }
          .foot {
            margin-top: 14px;
            color: #425463;
            font-size: 11px;
          }
        </style>
      </head>
      <body>
        <div class="title">Scratch Card Daily Sales Report</div>
        <div class="subtitle">Shop: ${escapeHtml(input.shopName)} | Date Range: ${escapeHtml(input.from)} to ${escapeHtml(input.to)}</div>
        <div class="report-meta">Report Date Time: ${escapeHtml(reportDateTime)}</div>
        <div class="summary">
          Days: ${groups.length} | Shifts: ${input.rows.length} | Total Sales: ${escapeHtml(formatMoney(totalSales))} | Total Payout: ${escapeHtml(formatMoney(totalPayout))} | Net Difference: ${escapeHtml(formatMoney(totalDifference))} | Missing Tickets: ${escapeHtml(String(totalMissingTickets))}
        </div>
        ${groupsHtml || "<div>No scratch card sales found for this date range.</div>"}
        ${grandTotalHtml}
        <div class="foot">Generated from scratch card daily sales records.</div>
      </body>
    </html>
  `;
}
