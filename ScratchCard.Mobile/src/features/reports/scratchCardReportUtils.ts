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

function formatSignedMoney(value: number) {
  const absoluteValue = Math.abs(value);
  const formatted = formatMoney(absoluteValue);
  if (value > 0.009) {
    return `+${formatted}`;
  }
  if (value < -0.009) {
    return `-${formatted}`;
  }
  return formatted;
}

function formatWholeNumber(value: number) {
  return Math.trunc(value).toLocaleString("en-GB");
}

function getVarianceClass(value: number) {
  if (value > 0.009) {
    return "is-positive";
  }
  if (value < -0.009) {
    return "is-negative";
  }
  return "is-neutral";
}

function getVarianceLabel(value: number) {
  if (value > 0.009) {
    return "Over";
  }
  if (value < -0.009) {
    return "Short";
  }
  return "Balanced";
}

function getPayoutBasedDifference(row: {
  difference?: number;
  lottoPayout?: number | null;
  scratchCardPayout?: number | null;
  tillPayout?: number | null;
}) {
  if (row.lottoPayout != null && row.scratchCardPayout != null && row.tillPayout != null) {
    return Number(row.lottoPayout) + Number(row.scratchCardPayout) - Number(row.tillPayout);
  }

  return Number(row.difference ?? 0);
}

function getDayPayoutDifference(rows: DailySalesReportRow[]) {
  const snapshot = rows.find((row) =>
    row.lottoPayout != null ||
    row.scratchCardPayout != null ||
    row.tillPayout != null
  );

  if (snapshot) {
    return getPayoutBasedDifference(snapshot);
  }

  return rows.reduce((sum, row) => sum + Number(row.difference ?? 0), 0);
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
  const businessDayByDate = new Map((input.businessDays ?? []).map((day) => [day.businessDate, day]));

  const totalSales = input.rows.reduce((sum, row) => sum + Number(row.salesAmount ?? 0), 0);
  const totalSoldQuantity = input.rows.reduce((sum, row) => sum + Number(row.soldQuantity ?? 0), 0);
  const totalDifference = groups.reduce((sum, group) => sum + getDayPayoutDifference(group.rows), 0);
  const totalMissingTickets = (input.businessDays ?? []).reduce(
    (sum, day) => sum + Number(day.missingOpeningTicketCount ?? 0),
    0,
  );
  const netVarianceClass = getVarianceClass(totalDifference);

  const groupsHtml = groups
    .map((group) => {
      const dayMeta = businessDayByDate.get(group.businessDate);
      const dayMissingTickets = Number(dayMeta?.missingOpeningTicketCount ?? 0);
      const daySales = group.rows.reduce((sum, row) => sum + Number(row.salesAmount ?? 0), 0);
      const daySoldQuantity = group.rows.reduce((sum, row) => sum + Number(row.soldQuantity ?? 0), 0);
      const dayDifference = getDayPayoutDifference(group.rows);
      const dayVarianceClass = getVarianceClass(dayDifference);

      const rowsHtml = group.rows
        .map((row) => {
          const rowDifference = getPayoutBasedDifference(row);
          const rowVarianceClass = getVarianceClass(rowDifference);
          const rowVarianceLabel = getVarianceLabel(rowDifference);
          return `
            <tr class="data-row">
              <td>
                <div class="shift-name">${escapeHtml(row.shiftName)}</div>
                <div class="row-caption">${escapeHtml(rowVarianceLabel)}</div>
              </td>
              <td class="align-right">${escapeHtml(formatMoney(Number(row.salesAmount ?? 0)))}</td>
              <td class="align-right">${escapeHtml(formatWholeNumber(Number(row.soldQuantity ?? 0)))}</td>
              <td class="align-right ${rowVarianceClass}">${escapeHtml(formatSignedMoney(rowDifference))}</td>
            </tr>
          `;
        })
        .join("");

      return `
        <section class="day-card">
          <div class="day-header">
            <div class="day-title-wrap">
              <div class="day-caption">Business Date</div>
              <div class="day-title">${escapeHtml(group.businessDate)}</div>
            </div>
            <div class="badge-row">
              <span class="badge ${dayVarianceClass}">
                ${escapeHtml(getVarianceLabel(dayDifference))}: ${escapeHtml(formatSignedMoney(dayDifference))}
              </span>
              <span class="badge ${dayMissingTickets > 0 ? "is-negative" : "is-neutral"}">
                Missing Tickets: ${escapeHtml(formatWholeNumber(dayMissingTickets))}
              </span>
            </div>
          </div>
          <table class="report-table">
            <thead>
              <tr>
                <th class="col-shift">Shift</th>
                <th class="col-money align-right">Sales</th>
                <th class="col-qty align-right">Qty</th>
                <th class="col-diff align-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="4" class="empty-row">No shift records for this business date.</td></tr>`}
              <tr class="summary-row">
                <td>Day Total</td>
                <td class="align-right">${escapeHtml(formatMoney(daySales))}</td>
                <td class="align-right">${escapeHtml(formatWholeNumber(daySoldQuantity))}</td>
                <td class="align-right ${dayVarianceClass}">${escapeHtml(formatSignedMoney(dayDifference))}</td>
              </tr>
            </tbody>
          </table>
        </section>
      `;
    })
    .join("");

  const grandTotalHtml = input.rows.length
    ? `
      <section class="totals-card">
        <div class="totals-title">Final Totals</div>
        <table class="report-table">
          <thead>
            <tr>
              <th class="col-shift">Shift</th>
              <th class="col-money align-right">Sales</th>
              <th class="col-qty align-right">Qty</th>
              <th class="col-diff align-right">Difference</th>
            </tr>
          </thead>
          <tbody>
            <tr class="grand-total-row">
              <td>All Dates Total</td>
              <td class="align-right">${escapeHtml(formatMoney(totalSales))}</td>
              <td class="align-right">${escapeHtml(formatWholeNumber(totalSoldQuantity))}</td>
              <td class="align-right ${netVarianceClass}">${escapeHtml(formatSignedMoney(totalDifference))}</td>
            </tr>
          </tbody>
        </table>
      </section>
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
            margin: 9mm;
          }
          body {
            margin: 0;
            padding: 18px;
            font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #13293d;
            background: #eef3f9;
            font-size: 12px;
          }
          .report-shell {
            background: #ffffff;
            border: 1px solid #d7e1ec;
            border-radius: 14px;
            overflow: hidden;
          }
          .hero {
            background: linear-gradient(135deg, #0f4d82 0%, #1b7fb9 100%);
            color: #ffffff;
            padding: 18px 20px 16px;
          }
          .hero-title {
            font-size: 22px;
            line-height: 26px;
            font-weight: 700;
            margin-bottom: 5px;
          }
          .hero-subtitle {
            font-size: 12px;
            line-height: 16px;
            color: #d4e8f6;
          }
          .hero-meta {
            margin-top: 8px;
            font-size: 12px;
            line-height: 16px;
            color: #f0f7fc;
          }
          .content {
            padding: 14px 16px 16px;
          }
          .stats-grid {
            margin-bottom: 12px;
          }
          .stat-card {
            display: inline-block;
            width: 24%;
            margin-right: 0.8%;
            vertical-align: top;
            border: 1px solid #d6e2ee;
            border-radius: 10px;
            background: #f8fbff;
            padding: 10px;
            box-sizing: border-box;
          }
          .stat-card:last-child {
            margin-right: 0;
          }
          .stat-label {
            color: #5e7388;
            font-size: 10px;
            line-height: 13px;
            text-transform: uppercase;
            letter-spacing: 0.45px;
            margin-bottom: 5px;
          }
          .stat-value {
            color: #13293d;
            font-size: 16px;
            line-height: 20px;
            font-weight: 700;
          }
          .day-card {
            border: 1px solid #d8e2ed;
            border-radius: 12px;
            background: #ffffff;
            margin-bottom: 12px;
            overflow: hidden;
          }
          .day-header {
            border-bottom: 1px solid #e3ebf3;
            background: #f7fbff;
            padding: 10px 12px;
          }
          .day-title-wrap {
            margin-bottom: 8px;
          }
          .day-title {
            color: #102a43;
            font-size: 15px;
            line-height: 18px;
            font-weight: 700;
          }
          .day-caption {
            color: #486581;
            font-size: 10px;
            line-height: 12px;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            margin-bottom: 4px;
          }
          .badge-row {
            margin-top: 1px;
          }
          .badge {
            display: inline-block;
            font-size: 10px;
            line-height: 13px;
            font-weight: 700;
            padding: 3px 7px;
            border-radius: 999px;
            margin-right: 6px;
            margin-bottom: 4px;
            border: 1px solid #ccd9e5;
            background: #edf3f9;
            color: #304960;
          }
          .report-table {
            border-collapse: collapse;
            width: 100%;
            table-layout: fixed;
          }
          th, td {
            border: 1px solid #d7e1eb;
            padding: 7px 8px;
            vertical-align: top;
            word-break: break-word;
          }
          th {
            background: #f2f7fc;
            text-align: left;
            font-size: 10px;
            color: #334e68;
            letter-spacing: 0.3px;
            text-transform: uppercase;
          }
          td {
            font-size: 11px;
            color: #243b53;
          }
          .data-row td {
            background: #ffffff;
          }
          .shift-name {
            font-weight: 600;
            color: #102a43;
            margin-bottom: 1px;
          }
          .row-caption {
            color: #5f7287;
            font-size: 10px;
            line-height: 12px;
          }
          .align-right {
            text-align: right;
          }
          .summary-row td {
            background: #f5f9fe;
            font-weight: 700;
          }
          .grand-total-row td {
            background: #e3f0fc;
            font-weight: 700;
          }
          .col-shift { width: 45%; }
          .col-money { width: 21%; }
          .col-qty { width: 14%; }
          .col-diff { width: 20%; }
          .is-positive {
            color: #8b5e00;
            border-color: #d9b56f;
            background: #fff3dd;
          }
          .is-negative {
            color: #a2212f;
            border-color: #f2b2bb;
            background: #ffe9ed;
          }
          .is-neutral {
            color: #2f4a63;
          }
          .totals-card {
            border: 1px solid #d8e2ed;
            border-radius: 12px;
            overflow: hidden;
            margin-top: 8px;
          }
          .totals-title {
            padding: 10px 12px;
            background: #edf5fd;
            border-bottom: 1px solid #d8e2ed;
            color: #16324a;
            font-size: 13px;
            line-height: 16px;
            font-weight: 700;
          }
          .empty-row {
            text-align: center;
            color: #5f7287;
            background: #ffffff;
          }
          .empty-state {
            border: 1px dashed #c7d6e4;
            border-radius: 10px;
            background: #f7fbff;
            color: #486581;
            text-align: center;
            padding: 18px 14px;
            font-size: 12px;
            line-height: 16px;
          }
          .foot {
            margin-top: 12px;
            color: #5f7388;
            font-size: 11px;
            line-height: 14px;
            text-align: right;
          }
        </style>
      </head>
      <body>
        <div class="report-shell">
          <div class="hero">
            <div class="hero-title">Scratch Card Daily Sales Report</div>
            <div class="hero-subtitle">Shop: ${escapeHtml(input.shopName)} | Date Range: ${escapeHtml(input.from)} to ${escapeHtml(input.to)}</div>
            <div class="hero-meta">Report Date Time: ${escapeHtml(reportDateTime)}</div>
          </div>
          <div class="content">
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-label">Business Days</div>
                <div class="stat-value">${escapeHtml(formatWholeNumber(groups.length))}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Shifts</div>
                <div class="stat-value">${escapeHtml(formatWholeNumber(input.rows.length))}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Sales</div>
                <div class="stat-value">${escapeHtml(formatMoney(totalSales))}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Tickets / Missing</div>
                <div class="stat-value">${escapeHtml(formatWholeNumber(totalSoldQuantity))} / ${escapeHtml(formatWholeNumber(totalMissingTickets))}</div>
              </div>
            </div>
            <div class="totals-card">
              <div class="totals-title">Net Difference</div>
              <table class="report-table">
                <tbody>
                  <tr class="summary-row">
                    <td class="col-shift">All Dates Variance</td>
                    <td class="align-right ${netVarianceClass}">${escapeHtml(formatSignedMoney(totalDifference))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            ${groupsHtml || `<div class="empty-state">No scratch card sales found for this date range.</div>`}
            ${grandTotalHtml}
            <div class="foot">Generated from scratch card daily sales records.</div>
          </div>
        </div>
      </body>
    </html>
  `;
}
