import { BusinessDay, DailySalesReportRow } from "../../types/models";

type ScratchCardDailyGroup = {
  businessDate: string;
  rows: DailySalesReportRow[];
};

const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const fixed = absolute.toFixed(2);
  const [whole, fraction] = fixed.split(".");
  const wholeWithSeparators = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}£${wholeWithSeparators}.${fraction}`;
}

function formatSignedMoney(value: number) {
  if (value > 0.009) {
    return `+${formatMoney(value)}`;
  }
  if (value < -0.009) {
    return formatMoney(value);
  }
  return formatMoney(0);
}

function formatWholeNumber(value: number) {
  return Math.trunc(value).toLocaleString("en-GB");
}

function formatBusinessDate(isoDate: string) {
  // Expect "YYYY-MM-DD"; render as "Mon, 01 Jun 2026". Falls back to input on bad parse.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (monthIndex < 0 || monthIndex > 11) return isoDate;
  const date = new Date(Date.UTC(year, monthIndex, day));
  const weekday = WEEKDAY_NAMES_SHORT[date.getUTCDay()];
  const monthShort = MONTH_NAMES_SHORT[monthIndex];
  const dayStr = String(day).padStart(2, "0");
  return `${weekday}, ${dayStr} ${monthShort} ${year}`;
}

function getVarianceClass(value: number) {
  if (value > 0.009) return "is-positive";
  if (value < -0.009) return "is-negative";
  return "is-neutral";
}

function getVarianceLabel(value: number) {
  if (value > 0.009) return "Over";
  if (value < -0.009) return "Short";
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
  // The till-vs-expected variance is recorded once per business day, not per shift. Use the
  // first row that carries the payout snapshot; fall back to summed per-shift differences.
  const snapshot = rows.find(
    (row) => row.lottoPayout != null || row.scratchCardPayout != null || row.tillPayout != null,
  );
  if (snapshot) return getPayoutBasedDifference(snapshot);
  return rows.reduce((sum, row) => sum + Number(row.difference ?? 0), 0);
}

function buildGroups(rows: DailySalesReportRow[]): ScratchCardDailyGroup[] {
  const groups = new Map<string, DailySalesReportRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.businessDate) ?? [];
    existing.push(row);
    groups.set(row.businessDate, existing);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([businessDate, dailyRows]) => ({
      businessDate,
      rows: [...dailyRows].sort((a, b) => a.shiftName.localeCompare(b.shiftName)),
    }));
}

function formatReportDateTime(value: Date) {
  return `${value.toLocaleDateString()} ${value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function safeNumber(value: number | undefined | null) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
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

  // Top-line KPIs across the full range.
  const totalSales = input.rows.reduce((sum, row) => sum + safeNumber(row.salesAmount), 0);
  const totalPrizePayouts = input.rows.reduce((sum, row) => sum + safeNumber(row.prizePayout), 0);
  const totalNetTake = totalSales - totalPrizePayouts;
  const totalSoldQuantity = input.rows.reduce((sum, row) => sum + safeNumber(row.soldQuantity), 0);
  const avgTicketPrice = totalSoldQuantity > 0 ? totalSales / totalSoldQuantity : 0;
  const totalDifference = groups.reduce((sum, group) => sum + getDayPayoutDifference(group.rows), 0);
  const totalMissingTickets = (input.businessDays ?? []).reduce(
    (sum, day) => sum + safeNumber(day.missingOpeningTicketCount),
    0,
  );

  // Top-day highlight: useful for owners reviewing a week or month.
  const topDay = groups.length
    ? groups.reduce((best, current) => {
        const bestSales = best.rows.reduce((s, r) => s + safeNumber(r.salesAmount), 0);
        const currentSales = current.rows.reduce((s, r) => s + safeNumber(r.salesAmount), 0);
        return currentSales > bestSales ? current : best;
      })
    : null;
  const topDaySales = topDay
    ? topDay.rows.reduce((s, r) => s + safeNumber(r.salesAmount), 0)
    : 0;

  const netVarianceClass = getVarianceClass(totalDifference);

  const dayCardsHtml = groups
    .map((group) => {
      const dayMeta = businessDayByDate.get(group.businessDate);
      const dayMissingTickets = safeNumber(dayMeta?.missingOpeningTicketCount);
      const dayStatus = dayMeta?.status;
      const daySales = group.rows.reduce((sum, row) => sum + safeNumber(row.salesAmount), 0);
      const dayPrizePayouts = group.rows.reduce((sum, row) => sum + safeNumber(row.prizePayout), 0);
      const dayNetTake = daySales - dayPrizePayouts;
      const daySoldQuantity = group.rows.reduce((sum, row) => sum + safeNumber(row.soldQuantity), 0);
      const dayDifference = getDayPayoutDifference(group.rows);
      const dayVarianceClass = getVarianceClass(dayDifference);
      const dayAvgTicket = daySoldQuantity > 0 ? daySales / daySoldQuantity : 0;

      const rowsHtml = group.rows
        .map((row) => {
          const rowSales = safeNumber(row.salesAmount);
          const rowPrizePayout = safeNumber(row.prizePayout);
          const rowNet = rowSales - rowPrizePayout;
          const rowQty = safeNumber(row.soldQuantity);
          const rowAvgTicket = rowQty > 0 ? rowSales / rowQty : 0;
          // Width of inline sales-share bar within this day.
          const sharePct = daySales > 0 ? Math.min(100, Math.round((rowSales / daySales) * 100)) : 0;
          return `
            <tr class="data-row">
              <td>
                <div class="shift-name">${escapeHtml(row.shiftName)}</div>
                <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${sharePct}%"></div></div>
              </td>
              <td class="align-right">${escapeHtml(formatMoney(rowSales))}</td>
              <td class="align-right is-muted">${escapeHtml(formatMoney(rowPrizePayout))}</td>
              <td class="align-right">${escapeHtml(formatMoney(rowNet))}</td>
              <td class="align-right">${escapeHtml(formatWholeNumber(rowQty))}</td>
              <td class="align-right is-muted">${escapeHtml(formatMoney(rowAvgTicket))}</td>
            </tr>
          `;
        })
        .join("");

      const statusBadge = dayStatus
        ? `<span class="badge is-neutral status-badge">${escapeHtml(dayStatus)}</span>`
        : "";
      const missingBadge = dayMissingTickets > 0
        ? `<span class="badge is-negative">Missing Tickets: ${escapeHtml(formatWholeNumber(dayMissingTickets))}</span>`
        : "";

      return `
        <section class="day-card">
          <div class="day-header">
            <div class="day-title-wrap">
              <div class="day-caption">Business Date</div>
              <div class="day-title">${escapeHtml(formatBusinessDate(group.businessDate))}</div>
            </div>
            <div class="badge-row">
              <span class="badge ${dayVarianceClass}">
                ${escapeHtml(getVarianceLabel(dayDifference))}: ${escapeHtml(formatSignedMoney(dayDifference))}
              </span>
              ${statusBadge}
              ${missingBadge}
            </div>
          </div>

          <div class="day-summary">
            <div class="day-summary-item">
              <div class="day-summary-label">Sales</div>
              <div class="day-summary-value">${escapeHtml(formatMoney(daySales))}</div>
            </div>
            <div class="day-summary-item">
              <div class="day-summary-label">Prize Payouts</div>
              <div class="day-summary-value">${escapeHtml(formatMoney(dayPrizePayouts))}</div>
            </div>
            <div class="day-summary-item">
              <div class="day-summary-label">Net Take</div>
              <div class="day-summary-value">${escapeHtml(formatMoney(dayNetTake))}</div>
            </div>
            <div class="day-summary-item">
              <div class="day-summary-label">Tickets Sold</div>
              <div class="day-summary-value">${escapeHtml(formatWholeNumber(daySoldQuantity))}</div>
            </div>
            <div class="day-summary-item">
              <div class="day-summary-label">Avg Ticket</div>
              <div class="day-summary-value">${escapeHtml(formatMoney(dayAvgTicket))}</div>
            </div>
          </div>

          <table class="report-table">
            <thead>
              <tr>
                <th class="col-shift">Shift</th>
                <th class="col-money align-right">Sales</th>
                <th class="col-money align-right">Prize Payouts</th>
                <th class="col-money align-right">Net Take</th>
                <th class="col-qty align-right">Qty</th>
                <th class="col-money align-right">Avg Ticket</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="6" class="empty-row">No shift records for this business date.</td></tr>`}
              <tr class="summary-row">
                <td>Day Total</td>
                <td class="align-right">${escapeHtml(formatMoney(daySales))}</td>
                <td class="align-right">${escapeHtml(formatMoney(dayPrizePayouts))}</td>
                <td class="align-right">${escapeHtml(formatMoney(dayNetTake))}</td>
                <td class="align-right">${escapeHtml(formatWholeNumber(daySoldQuantity))}</td>
                <td class="align-right">${escapeHtml(formatMoney(dayAvgTicket))}</td>
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
        <div class="totals-title">Period Totals</div>
        <table class="report-table">
          <thead>
            <tr>
              <th class="col-shift">All Business Dates</th>
              <th class="col-money align-right">Sales</th>
              <th class="col-money align-right">Prize Payouts</th>
              <th class="col-money align-right">Net Take</th>
              <th class="col-qty align-right">Qty</th>
              <th class="col-money align-right">Avg Ticket</th>
            </tr>
          </thead>
          <tbody>
            <tr class="grand-total-row">
              <td>${escapeHtml(formatWholeNumber(groups.length))} day(s) · ${escapeHtml(formatWholeNumber(input.rows.length))} shift(s)</td>
              <td class="align-right">${escapeHtml(formatMoney(totalSales))}</td>
              <td class="align-right">${escapeHtml(formatMoney(totalPrizePayouts))}</td>
              <td class="align-right">${escapeHtml(formatMoney(totalNetTake))}</td>
              <td class="align-right">${escapeHtml(formatWholeNumber(totalSoldQuantity))}</td>
              <td class="align-right">${escapeHtml(formatMoney(avgTicketPrice))}</td>
            </tr>
          </tbody>
        </table>
      </section>
    `
    : "";

  const topDayHtml = topDay && groups.length > 1
    ? `
      <div class="callout">
        <span class="callout-label">Top Day</span>
        <span class="callout-value">${escapeHtml(formatBusinessDate(topDay.businessDate))} · ${escapeHtml(formatMoney(topDaySales))}</span>
      </div>
    `
    : "";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: landscape; margin: 9mm; }
          body {
            margin: 0;
            padding: 16px;
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
            background: linear-gradient(135deg, #0b3b6c 0%, #1577b4 60%, #1da1c4 100%);
            color: #ffffff;
            padding: 20px 22px 18px;
          }
          .hero-eyebrow {
            font-size: 10px;
            letter-spacing: 1px;
            text-transform: uppercase;
            color: #c7e3f7;
            margin-bottom: 6px;
          }
          .hero-title {
            font-size: 22px;
            line-height: 26px;
            font-weight: 700;
            margin-bottom: 8px;
          }
          .hero-meta-row {
            display: table;
            width: 100%;
            border-collapse: separate;
            border-spacing: 8px 0;
            margin-top: 4px;
          }
          .hero-meta-item {
            display: table-cell;
            background: rgba(255, 255, 255, 0.10);
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 8px;
            padding: 7px 10px;
            vertical-align: top;
            width: 33%;
          }
          .hero-meta-label {
            font-size: 10px;
            letter-spacing: 0.4px;
            text-transform: uppercase;
            color: #d4e8f6;
            margin-bottom: 3px;
          }
          .hero-meta-value {
            font-size: 12px;
            line-height: 15px;
            color: #ffffff;
            font-weight: 600;
            word-break: break-word;
          }
          .content { padding: 14px 16px 16px; }

          /* KPI grid */
          .stats-grid { margin-bottom: 12px; }
          .stat-card {
            display: inline-block;
            width: 16%;
            margin-right: 0.8%;
            vertical-align: top;
            border: 1px solid #d6e2ee;
            border-radius: 10px;
            background: #f8fbff;
            padding: 10px;
            box-sizing: border-box;
          }
          .stat-card:last-child { margin-right: 0; }
          .stat-card.is-emphasis {
            border-color: #b4d4ee;
            background: linear-gradient(180deg, #f0f7ff 0%, #e3f0ff 100%);
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
            color: #102a43;
            font-size: 15px;
            line-height: 19px;
            font-weight: 700;
            word-break: break-word;
          }
          .stat-sub {
            margin-top: 3px;
            color: #5e7388;
            font-size: 10px;
            line-height: 13px;
          }

          /* Top day callout */
          .callout {
            margin-bottom: 12px;
            padding: 8px 12px;
            background: #f0f7ff;
            border: 1px dashed #b4d4ee;
            border-radius: 8px;
            color: #102a43;
            font-size: 11px;
          }
          .callout-label {
            display: inline-block;
            margin-right: 8px;
            color: #1577b4;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            font-size: 10px;
          }
          .callout-value { font-weight: 700; }

          /* Day cards */
          .day-card {
            border: 1px solid #d8e2ed;
            border-radius: 12px;
            background: #ffffff;
            margin-bottom: 12px;
            overflow: hidden;
            page-break-inside: avoid;
          }
          .day-header {
            border-bottom: 1px solid #e3ebf3;
            background: #f7fbff;
            padding: 10px 12px;
          }
          .day-title-wrap { margin-bottom: 8px; }
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
          .badge-row { margin-top: 1px; }
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
          .status-badge {
            text-transform: uppercase;
            letter-spacing: 0.4px;
            background: #eaf2fb;
            color: #1c3b5a;
            border-color: #c2d6ec;
          }

          /* Per-day summary strip */
          .day-summary {
            display: table;
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            background: #fafcff;
            border-bottom: 1px solid #e3ebf3;
          }
          .day-summary-item {
            display: table-cell;
            padding: 8px 10px;
            border-right: 1px solid #e3ebf3;
            vertical-align: top;
          }
          .day-summary-item:last-child { border-right: none; }
          .day-summary-label {
            color: #5e7388;
            font-size: 9px;
            letter-spacing: 0.4px;
            text-transform: uppercase;
            margin-bottom: 3px;
          }
          .day-summary-value {
            color: #102a43;
            font-size: 12px;
            font-weight: 700;
          }

          /* Table */
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
          .data-row td { background: #ffffff; }
          .data-row:nth-child(even) td { background: #fbfdff; }
          .shift-name {
            font-weight: 600;
            color: #102a43;
            margin-bottom: 4px;
          }
          .bar-track {
            height: 4px;
            background: #e9eff6;
            border-radius: 999px;
            overflow: hidden;
          }
          .bar-fill {
            height: 4px;
            background: linear-gradient(90deg, #1577b4, #1da1c4);
            border-radius: 999px;
          }
          .align-right { text-align: right; }
          .is-muted { color: #54708c; }
          .summary-row td {
            background: #f5f9fe;
            font-weight: 700;
            color: #102a43;
          }
          .grand-total-row td {
            background: #e3f0fc;
            font-weight: 700;
            color: #0c2540;
          }

          .col-shift { width: 28%; }
          .col-money { width: 14%; }
          .col-qty   { width: 10%; }

          .is-positive { color: #8b5e00; border-color: #d9b56f; background: #fff3dd; }
          .is-negative { color: #a2212f; border-color: #f2b2bb; background: #ffe9ed; }
          .is-neutral  { color: #2f4a63; }

          .totals-card {
            border: 1px solid #d8e2ed;
            border-radius: 12px;
            overflow: hidden;
            margin-top: 8px;
            page-break-inside: avoid;
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
            padding: 22px 14px;
            font-size: 12px;
            line-height: 16px;
          }
          .foot {
            margin-top: 14px;
            padding-top: 10px;
            border-top: 1px solid #e3ebf3;
            color: #5f7388;
            font-size: 10px;
            line-height: 14px;
          }
          .foot-row {
            display: table;
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
          }
          .foot-left  { display: table-cell; text-align: left; }
          .foot-right { display: table-cell; text-align: right; }
        </style>
      </head>
      <body>
        <div class="report-shell">
          <div class="hero">
            <div class="hero-eyebrow">Scratch Card · Daily Sales Report</div>
            <div class="hero-title">${escapeHtml(input.shopName || "-")}</div>
            <div class="hero-meta-row">
              <div class="hero-meta-item">
                <div class="hero-meta-label">Period</div>
                <div class="hero-meta-value">${escapeHtml(formatBusinessDate(input.from))} &mdash; ${escapeHtml(formatBusinessDate(input.to))}</div>
              </div>
              <div class="hero-meta-item">
                <div class="hero-meta-label">Coverage</div>
                <div class="hero-meta-value">${escapeHtml(formatWholeNumber(groups.length))} business day(s) · ${escapeHtml(formatWholeNumber(input.rows.length))} shift(s)</div>
              </div>
              <div class="hero-meta-item">
                <div class="hero-meta-label">Generated</div>
                <div class="hero-meta-value">${escapeHtml(reportDateTime)}</div>
              </div>
            </div>
          </div>
          <div class="content">
            <div class="stats-grid">
              <div class="stat-card is-emphasis">
                <div class="stat-label">Total Sales</div>
                <div class="stat-value">${escapeHtml(formatMoney(totalSales))}</div>
                <div class="stat-sub">Gross before payouts</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Prize Payouts</div>
                <div class="stat-value">${escapeHtml(formatMoney(totalPrizePayouts))}</div>
                <div class="stat-sub">Cash paid to winners</div>
              </div>
              <div class="stat-card is-emphasis">
                <div class="stat-label">Net Take</div>
                <div class="stat-value">${escapeHtml(formatMoney(totalNetTake))}</div>
                <div class="stat-sub">Sales &minus; Prize Payouts</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Tickets Sold</div>
                <div class="stat-value">${escapeHtml(formatWholeNumber(totalSoldQuantity))}</div>
                <div class="stat-sub">Avg ticket ${escapeHtml(formatMoney(avgTicketPrice))}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Till Variance</div>
                <div class="stat-value ${netVarianceClass}">${escapeHtml(formatSignedMoney(totalDifference))}</div>
                <div class="stat-sub">${escapeHtml(getVarianceLabel(totalDifference))} for the period</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Missing Tickets</div>
                <div class="stat-value ${totalMissingTickets > 0 ? "is-negative" : ""}">${escapeHtml(formatWholeNumber(totalMissingTickets))}</div>
                <div class="stat-sub">Opening serial gaps</div>
              </div>
            </div>

            ${topDayHtml}

            ${dayCardsHtml || `<div class="empty-state">No scratch card sales found for this period.</div>`}

            ${grandTotalHtml}

            <div class="foot">
              <div class="foot-row">
                <div class="foot-left">
                  Shop: ${escapeHtml(input.shopName || "-")} &nbsp;·&nbsp;
                  Range: ${escapeHtml(input.from)} to ${escapeHtml(input.to)}
                </div>
                <div class="foot-right">
                  Confidential &nbsp;·&nbsp; Generated ${escapeHtml(reportDateTime)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}
