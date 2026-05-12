import { RefusalRegisterEntry } from "../../types/models";

export type RefusalReportPdfEntry = {
  sequenceNo: number;
  refusalDate: string;
  product: string;
  refusalTime: string;
  personDescription: string;
  observations?: string;
  staffMemberInitials: string;
  staffSignatureDataUrl?: string;
  reviewedOn?: string;
  reviewedByName?: string;
  reviewNotes?: string;
  managerSignatureDataUrl?: string;
};

export type RefusalReviewedGroup<TEntry> = {
  key: string;
  title: string;
  sortValue: number;
  pending: boolean;
  entries: TEntry[];
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatReviewedOn(value?: string) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return `${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatReportDateTime(value: Date) {
  return `${value.toLocaleDateString()} ${value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function buildReviewedGroupMetadata(reviewedOn?: string) {
  if (!reviewedOn) {
    return {
      key: "pending",
      title: "Pending Manager Review",
      sortValue: Number.NEGATIVE_INFINITY,
      pending: true,
    };
  }

  const parsed = new Date(reviewedOn);
  if (Number.isNaN(parsed.getTime())) {
    return {
      key: `raw:${reviewedOn}`,
      title: `Reviewed Date: ${reviewedOn}`,
      sortValue: Number.MIN_SAFE_INTEGER,
      pending: false,
    };
  }

  const normalized = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());

  const yyyy = normalized.getFullYear();
  const mm = String(normalized.getMonth() + 1).padStart(2, "0");
  const dd = String(normalized.getDate()).padStart(2, "0");

  return {
    key: `${yyyy}-${mm}-${dd}`,
    title: `Reviewed Date: ${normalized.toLocaleDateString()}`,
    sortValue: normalized.getTime(),
    pending: false,
  };
}

export function groupEntriesByReviewedDateTime<TEntry extends { reviewedOn?: string }>(
  entries: TEntry[]
): RefusalReviewedGroup<TEntry>[] {
  const groupedMap = new Map<string, RefusalReviewedGroup<TEntry>>();

  entries.forEach((entry) => {
    const metadata = buildReviewedGroupMetadata(entry.reviewedOn);
    const existing = groupedMap.get(metadata.key);

    if (existing) {
      existing.entries.push(entry);
      return;
    }

    groupedMap.set(metadata.key, {
      ...metadata,
      entries: [entry],
    });
  });

  return [...groupedMap.values()].sort((left, right) => {
    if (left.pending && right.pending) {
      return 0;
    }

    if (left.pending) {
      return 1;
    }

    if (right.pending) {
      return -1;
    }

    return right.sortValue - left.sortValue;
  });
}

function buildRowHtml(entry: RefusalReportPdfEntry) {
  const staffSignatureCell = entry.staffSignatureDataUrl
    ? `<img alt="staff signature" class="sig" src="${entry.staffSignatureDataUrl}" />`
    : `<span class="sig-missing">No signature</span>`;

  const managerSignatureCell = entry.managerSignatureDataUrl
    ? `<img alt="manager signature" class="sig" src="${entry.managerSignatureDataUrl}" />`
    : `<span class="sig-missing">${entry.reviewedOn ? "No manager signature" : "-"}</span>`;

  return `
    <tr>
      <td>${entry.sequenceNo}</td>
      <td>${escapeHtml(entry.refusalDate)}</td>
      <td>${escapeHtml(entry.product)}</td>
      <td>${escapeHtml(entry.refusalTime || "--:--")}</td>
      <td>${escapeHtml(entry.personDescription)}</td>
      <td>${escapeHtml(entry.observations ?? "")}</td>
      <td>${escapeHtml(entry.staffMemberInitials)}</td>
      <td>${staffSignatureCell}</td>
      <td>${escapeHtml(entry.reviewedByName ?? "-")}</td>
      <td>${escapeHtml(formatReviewedOn(entry.reviewedOn))}</td>
      <td>${escapeHtml(entry.reviewNotes ?? "-")}</td>
      <td>${managerSignatureCell}</td>
    </tr>
  `;
}

export function buildRefusalRangeReportHtml(input: {
  shopName: string;
  from: string;
  to: string;
  entries: RefusalReportPdfEntry[];
  reportGeneratedOn?: string;
}) {
  const groupedEntries = groupEntriesByReviewedDateTime(input.entries);
  const generatedOnDate = input.reportGeneratedOn ? new Date(input.reportGeneratedOn) : new Date();
  const reportDateTime = Number.isNaN(generatedOnDate.getTime())
    ? input.reportGeneratedOn ?? "-"
    : formatReportDateTime(generatedOnDate);

  const groupsHtml = groupedEntries
    .map((group) => {
      const rows = group.entries.map(buildRowHtml).join("");

      return `
        <div class="group-title">${escapeHtml(group.title)}</div>
        <table>
          <thead>
            <tr>
              <th class="col-no">No.</th>
              <th class="col-date">Date</th>
              <th class="col-product">Product</th>
              <th class="col-time">Time</th>
              <th class="col-person">Name of person or description</th>
              <th class="col-obs">Observations</th>
              <th class="col-staff">Staff</th>
              <th class="col-sign">Staff Sign</th>
              <th class="col-manager">Manager</th>
              <th class="col-reviewed-on">Reviewed On</th>
              <th class="col-review-note">Review Notes</th>
              <th class="col-sign">Manager Sign</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="12">No entries found for this group.</td></tr>`}
          </tbody>
        </table>
      `;
    })
    .join("");

  return `
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
            min-height: 20px;
            font-size: 9px;
          }
          .col-no { width: 4%; }
          .col-date { width: 7%; }
          .col-product { width: 11%; }
          .col-time { width: 6%; }
          .col-person { width: 15%; }
          .col-obs { width: 14%; }
          .col-staff { width: 6%; }
          .col-sign { width: 8%; }
          .col-manager { width: 8%; }
          .col-reviewed-on { width: 9%; }
          .col-review-note { width: 12%; }
          .sig {
            max-width: 100%;
            max-height: 40px;
            display: block;
            margin: 0 auto;
          }
          .sig-missing {
            color: #6c7a85;
            font-size: 8px;
          }
          .foot {
            margin-top: 14px;
            color: #425463;
            font-size: 11px;
          }
        </style>
      </head>
      <body>
        <div class="title">No ID / No Sale Refusal Report</div>
        <div class="subtitle">Shop: ${escapeHtml(input.shopName)} | Date Range: ${escapeHtml(input.from)} to ${escapeHtml(input.to)}</div>
        <div class="report-meta">Report Date Time: ${escapeHtml(reportDateTime)}</div>
        ${groupsHtml || "<div>No entries found for this date range.</div>"}
        <div class="foot">Generated from digital No ID / No Sale register.</div>
      </body>
    </html>
  `;
}

export function sortRefusalEntriesForReport(entries: RefusalRegisterEntry[]) {
  return [...entries].sort((left, right) => {
    const dateCompare = right.refusalDate.localeCompare(left.refusalDate);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    const timeCompare = right.refusalTime.localeCompare(left.refusalTime);
    if (timeCompare !== 0) {
      return timeCompare;
    }

    return right.sequenceNo - left.sequenceNo;
  });
}
