import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { optimizeImage } from "../../utils/imageOptimizer";
import { useFeature } from "../subscription/useFeature";
import { UpgradeNotice } from "../subscription/FeatureGate";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { NestableDraggableFlatList, NestableScrollContainer } from "react-native-draggable-flatlist";
import {
  closeComplianceCheckAction,
  createComplianceCheckGroup,
  createComplianceCheckItem,
  getComplianceCheckAttachmentContent,
  getComplianceActionReport,
  getComplianceCheckPeriodLog,
  listComplianceCheckConfig,
  reorderComplianceCheckGroups,
  reorderComplianceCheckItems,
  upsertComplianceCheckEntry,
  updateComplianceCheckGroup,
  updateComplianceCheckItem,
} from "../../api/complianceChecksApi";
import { sendReportEmail } from "../../api/reportsApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue, parseDateValue } from "../../components/DateTimeField";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { ModalBackdropBlur } from "../../components/ModalBackdropBlur";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ReportActionButton } from "../../components/ReportActionButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { Skeleton } from "../../components/Skeleton";
import { StatusBadge } from "../../components/StatusBadge";
import { MainStackParamList } from "../../types/navigation";
import {
  ComplianceActionReportRow,
  ComplianceCheckEntry,
  ComplianceCheckFrequency,
  ComplianceCheckGroup,
  ComplianceCheckItem,
  ComplianceCheckPeriodRow,
  ComplianceCheckResult,
} from "../../types/models";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type EntryDraft = {
  result: ComplianceCheckResult;
  notes: string;
  actionRequired: string;
  checkedByName: string;
};

type NoteEditorState = {
  itemId: string;
  field: "notes" | "actionRequired" | "checkedByName";
  title: string;
} | null;

type ComplianceAttachmentState = {
  id: string;
  fileName: string;
  base64: string;
  contentType?: string;
  uri?: string;
  size?: number;
};

type UploadedComplianceAttachment = NonNullable<ComplianceCheckEntry["closeAttachments"]>[number];

type GroupFormState = {
  id?: string;
  frequency: ComplianceCheckFrequency;
  groupName: string;
  description: string;
  isActive: boolean;
};

type ItemFormState = {
  id?: string;
  complianceCheckGroupId: string;
  itemName: string;
  description: string;
  isRequired: boolean;
  isActive: boolean;
};

type CloseActionState = {
  entryId: string;
  itemName: string;
} | null;

type ComplianceReportAction = "print" | "share" | "email";

type ComplianceMatrixReportColumn = {
  key: string;
  label: string;
  date: string;
};

type ComplianceMatrixGroupedItems = {
  groupName: string;
  items: Array<{
    itemId: string;
    itemName: string;
  }>;
};

type ComplianceMatrixReportScope = {
  title: string;
  subtitle: string;
  periodLabel: string;
  filePeriodLabel: string;
  columns: ComplianceMatrixReportColumn[];
};

const frequencyOptions: ComplianceCheckFrequency[] = ["Daily", "Weekly", "Monthly"];
const resultOptions: ComplianceCheckResult[] = ["Compliant", "NonCompliant", "NotApplicable", "Pending"];
const MAX_COMPLIANCE_ATTACHMENTS = 10;
const MAX_COMPLIANCE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const monthOptions = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const initialGroupForm: GroupFormState = {
  frequency: "Daily",
  groupName: "",
  description: "",
  isActive: true,
};

const initialItemForm: ItemFormState = {
  complianceCheckGroupId: "",
  itemName: "",
  description: "",
  isRequired: true,
  isActive: true,
};

function formatDay(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatFileSize(size?: number) {
  if (!size || size <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  const fixed = unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${fixed} ${units[unitIndex]}`;
}

function isImageContentType(contentType?: string) {
  return (contentType ?? "").toLowerCase().startsWith("image/");
}

function getContentTypeFromDataUrl(dataUrl: string) {
  const prefix = "data:";
  const suffix = ";base64,";
  if (!dataUrl.startsWith(prefix)) {
    return "application/octet-stream";
  }

  const endIndex = dataUrl.indexOf(suffix);
  if (endIndex <= prefix.length) {
    return "application/octet-stream";
  }

  return dataUrl.slice(prefix.length, endIndex).trim() || "application/octet-stream";
}

function getBase64Payload(dataUrl: string) {
  const marker = "base64,";
  const markerIndex = dataUrl.indexOf(marker);
  return markerIndex >= 0 ? dataUrl.slice(markerIndex + marker.length).trim() : dataUrl.trim();
}

function getFileExtensionFromContentType(contentType: string) {
  switch (contentType.toLowerCase()) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "application/pdf":
      return ".pdf";
    case "text/plain":
      return ".txt";
    default:
      return "";
  }
}

function ensureFileNameWithExtension(fileName: string, contentType: string) {
  const trimmed = fileName.trim();
  if (trimmed.length === 0) {
    const extension = getFileExtensionFromContentType(contentType);
    return `attachment${extension || ".bin"}`;
  }

  const hasExtension = /\.[A-Za-z0-9]{1,10}$/.test(trimmed);
  if (hasExtension) {
    return trimmed;
  }

  const extension = getFileExtensionFromContentType(contentType);
  return `${trimmed}${extension || ""}`;
}

function resolveResultTone(result: ComplianceCheckResult): "success" | "danger" | "warning" {
  if (result === "Compliant") return "success";
  if (result === "NonCompliant") return "danger";
  return "warning";
}

function formatResultLabel(result: ComplianceCheckResult) {
  return result === "NotApplicable" ? "N/A" : result;
}

function formatResultButtonLabel(result: ComplianceCheckResult) {
  if (result === "Compliant") return "Compliant";
  if (result === "NonCompliant") return "Non-Comp";
  if (result === "NotApplicable") return "N/A";
  return "Pending";
}

function getResultChoiceChipBaseStyle(result: ComplianceCheckResult) {
  if (result === "Compliant") return styles.resultChoiceChipCompliant;
  if (result === "NonCompliant") return styles.resultChoiceChipNonCompliant;
  if (result === "NotApplicable") return styles.resultChoiceChipNotApplicable;
  return styles.resultChoiceChipPending;
}

function getResultChoiceChipSelectedStyle(result: ComplianceCheckResult) {
  if (result === "Compliant") return styles.resultChoiceChipCompliantSelected;
  if (result === "NonCompliant") return styles.resultChoiceChipNonCompliantSelected;
  if (result === "NotApplicable") return styles.resultChoiceChipNotApplicableSelected;
  return styles.resultChoiceChipPendingSelected;
}

function getResultChoiceChipTextBaseStyle(result: ComplianceCheckResult) {
  if (result === "Compliant") return styles.resultChoiceChipTextCompliant;
  if (result === "NonCompliant") return styles.resultChoiceChipTextNonCompliant;
  if (result === "NotApplicable") return styles.resultChoiceChipTextNotApplicable;
  return styles.resultChoiceChipTextPending;
}

function getResultChoiceChipTextSelectedStyle(result: ComplianceCheckResult) {
  if (result === "Compliant") return styles.resultChoiceChipTextCompliantSelected;
  if (result === "NonCompliant") return styles.resultChoiceChipTextNonCompliantSelected;
  if (result === "NotApplicable") return styles.resultChoiceChipTextNotApplicableSelected;
  return styles.resultChoiceChipTextPendingSelected;
}

function normalizeGroups(groups: ComplianceCheckGroup[]) {
  return groups
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder || a.groupName.localeCompare(b.groupName))
    .map((group) => ({
      ...group,
      items: group.items.slice().sort((a, b) => a.displayOrder - b.displayOrder || a.itemName.localeCompare(b.itemName)),
    }));
}

function isManagerLike(roles: string[]) {
  return roles.includes("PlatformAdmin") || roles.includes("CompanyOwner") || roles.includes("Manager");
}

function flattenRows(groups: { rows: ComplianceCheckPeriodRow[] }[]) {
  return groups.flatMap((group) => group.rows);
}

function getWeekRangeFromDateValue(value: string) {
  const parsed = parseDateValue(value) ?? new Date();
  const dayOfWeek = parsed.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + mondayOffset);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  return {
    startDate: formatDateValue(weekStart),
    endDate: formatDateValue(weekEnd),
  };
}

function getMonthAnchorDate(value: string) {
  const parsed = parseDateValue(value) ?? new Date();
  return formatDateValue(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
}

function shiftDateValueByDays(value: string, days: number) {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return value;
  }

  const shifted = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  shifted.setDate(shifted.getDate() + days);
  return formatDateValue(shifted);
}

function resolveDefaultCheckedByName(profile?: {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
}) {
  const displayName = (profile?.displayName ?? "").trim();
  if (displayName.length > 0) {
    return displayName;
  }

  const name = `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();
  if (name.length > 0) {
    return name;
  }

  const email = (profile?.email ?? "").trim();
  if (email.length === 0) {
    return "";
  }

  const prefix = email.split("@")[0] ?? "";
  return prefix || email;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getResultCode(result?: ComplianceCheckResult) {
  if (result === "Compliant") return "C";
  if (result === "NonCompliant") return "NC";
  if (result === "NotApplicable") return "N/A";
  if (result === "Pending") return "P";
  return "";
}

function getResultCellClass(result?: ComplianceCheckResult) {
  if (result === "Compliant") return "result-compliant";
  if (result === "NonCompliant") return "result-non-compliant";
  if (result === "NotApplicable") return "result-not-applicable";
  if (result === "Pending") return "result-pending";
  return "";
}

function toInitials(value?: string) {
  const parts = (value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function getIsoWeekYear(date: Date) {
  const working = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = working.getUTCDay() || 7;
  working.setUTCDate(working.getUTCDate() + 4 - day);
  return working.getUTCFullYear();
}

function getIsoWeekNumber(date: Date) {
  const working = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = working.getUTCDay() || 7;
  working.setUTCDate(working.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(working.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor((working.getTime() - yearStart.getTime()) / 86400000) + 1;
  return Math.ceil(diffDays / 7);
}

function getIsoWeekStartDateValue(isoYear: number, isoWeek: number) {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const weekOneMonday = new Date(jan4);
  weekOneMonday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const targetMonday = new Date(weekOneMonday);
  targetMonday.setUTCDate(weekOneMonday.getUTCDate() + (isoWeek - 1) * 7);

  return formatDateValue(
    new Date(targetMonday.getUTCFullYear(), targetMonday.getUTCMonth(), targetMonday.getUTCDate()),
  );
}

function buildComplianceMatrixReportScope(input: {
  frequency: ComplianceCheckFrequency;
  selectedDate: string;
  weeklyRangeStartDate: string;
  selectedMonthYear: number;
}) {
  if (input.frequency === "Daily") {
    const anchor = parseDateValue(input.selectedDate) ?? new Date();
    const year = anchor.getFullYear();
    const monthIndex = anchor.getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const columns: ComplianceMatrixReportColumn[] = [];

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = formatDateValue(new Date(year, monthIndex, day));
      columns.push({
        key: date,
        label: String(day),
        date,
      });
    }

    const monthLabel = `${monthOptions[monthIndex]} ${year}`;
    return {
      title: "Daily Compliance Checks",
      subtitle: "Daily matrix by day of month",
      periodLabel: monthLabel,
      filePeriodLabel: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
      columns,
    } satisfies ComplianceMatrixReportScope;
  }

  if (input.frequency === "Weekly") {
    const selectedWeekAnchor = parseDateValue(input.weeklyRangeStartDate) ?? new Date();
    const isoYear = getIsoWeekYear(selectedWeekAnchor);
    const selectedWeekNumber = getIsoWeekNumber(selectedWeekAnchor);
    const startWeek = selectedWeekNumber <= 26 ? 1 : 27;
    const endWeek = selectedWeekNumber <= 26 ? 26 : 52;
    const columns: ComplianceMatrixReportColumn[] = [];

    for (let week = startWeek; week <= endWeek; week += 1) {
      const startDate = getIsoWeekStartDateValue(isoYear, week);
      columns.push({
        key: `${isoYear}-W${String(week).padStart(2, "0")}`,
        label: `W${String(week).padStart(2, "0")}`,
        date: startDate,
      });
    }

    return {
      title: "Weekly Compliance Checks",
      subtitle: "Weekly matrix by week number",
      periodLabel: `${isoYear} Weeks ${startWeek}-${endWeek}`,
      filePeriodLabel: `${isoYear}-w${String(startWeek).padStart(2, "0")}-w${String(endWeek).padStart(2, "0")}`,
      columns,
    } satisfies ComplianceMatrixReportScope;
  }

  const year = input.selectedMonthYear;
  const columns = monthOptions.map((monthLabel, monthIndex) => ({
    key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    label: monthLabel,
    date: formatDateValue(new Date(year, monthIndex, 1)),
  }));

  return {
    title: "Monthly Compliance Checks",
    subtitle: "Monthly matrix by calendar month",
    periodLabel: String(year),
    filePeriodLabel: String(year),
    columns,
  } satisfies ComplianceMatrixReportScope;
}

function buildComplianceMatrixReportHtml(input: {
  shopName: string;
  frequency: ComplianceCheckFrequency;
  scope: ComplianceMatrixReportScope;
  groups: ComplianceMatrixGroupedItems[];
  entryByCell: Map<string, ComplianceCheckEntry>;
  checkedByInitialsByColumn: Map<string, string>;
  checkedByLegend: Array<{ initials: string; names: string[] }>;
  unavailableColumns: string[];
  generatedOn: string;
}) {
  const generatedOn = new Date(input.generatedOn);
  const generatedOnText = Number.isNaN(generatedOn.getTime())
    ? input.generatedOn
    : `${generatedOn.toLocaleDateString()} ${generatedOn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  const headerRowHtml = input.scope.columns
    .map((column) => `<th class="period-col">${escapeHtml(column.label)}</th>`)
    .join("");

  const groupRowsHtml = input.groups
    .map((group) => {
      const itemRowsHtml = group.items
        .map((item) => {
          const cellsHtml = input.scope.columns
            .map((column) => {
              const entry = input.entryByCell.get(`${item.itemId}|${column.key}`);
              const code = getResultCode(entry?.result);
              const cellClass = getResultCellClass(entry?.result);
              const title = entry?.checkedByName
                ? `${formatResultLabel(entry.result)} (${entry.checkedByName})`
                : entry?.result
                  ? formatResultLabel(entry.result)
                  : "Not checked";
              return `<td class="result-cell ${cellClass}" title="${escapeHtml(title)}">${escapeHtml(code)}</td>`;
            })
            .join("");

          return `
            <tr>
              <td class="item-col">${escapeHtml(item.itemName)}</td>
              ${cellsHtml}
            </tr>
          `;
        })
        .join("");

      return itemRowsHtml;
    })
    .join("");

  const checkedByRowHtml = input.scope.columns
    .map((column) => `<td class="checked-by-cell">${escapeHtml(input.checkedByInitialsByColumn.get(column.key) ?? "-")}</td>`)
    .join("");

  const failedColumnsHtml = input.unavailableColumns.length > 0
    ? `<div class="warning">Unavailable columns: ${escapeHtml(input.unavailableColumns.join(", "))}</div>`
    : "";
  const checkedByLegendHtml = input.checkedByLegend.length > 0
    ? `
      <section class="checked-by-key">
        <strong>Checked by key:</strong>
        ${input.checkedByLegend
          .map((entry) => `<div class="checked-by-key-item">${escapeHtml(entry.initials)} = ${escapeHtml(entry.names.join(" / "))}</div>`)
          .join("")}
      </section>
    `
    : "";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: landscape; margin: 8mm; }
          body {
            margin: 0;
            padding: 14px;
            font-family: "Segoe UI", Arial, sans-serif;
            color: #0f172a;
            background: #f8fafc;
            font-size: 10px;
          }
          .report-shell {
            background: #ffffff;
            border: 1px solid #d6dde8;
            border-radius: 10px;
            overflow: hidden;
          }
          .hero {
            padding: 12px 14px;
            background: #0b2b4a;
            color: #f8fafc;
          }
          .title {
            font-size: 18px;
            line-height: 22px;
            font-weight: 700;
            margin: 0;
          }
          .subtitle {
            margin: 4px 0 0;
            opacity: 0.9;
            font-size: 11px;
          }
          .meta {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            margin-top: 7px;
            font-size: 10px;
          }
          .warning {
            margin: 10px 14px 0;
            padding: 8px 10px;
            border-radius: 8px;
            background: #fff3cd;
            color: #664d03;
            border: 1px solid #ffe69c;
            font-size: 10px;
          }
          .legend {
            margin: 10px 14px 0;
            font-size: 10px;
            color: #334155;
          }
          .table-wrap {
            padding: 10px 12px 12px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-size: 9px;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 5px 3px;
            text-align: center;
            vertical-align: middle;
          }
          th {
            background: #e2e8f0;
            color: #0f172a;
            font-weight: 700;
          }
          .item-col {
            text-align: left;
            font-weight: 500;
            width: 280px;
            background: #f8fafc;
          }
          .period-col {
            width: 2.8%;
            min-width: 22px;
          }
          .result-cell {
            font-weight: 700;
            font-size: 9px;
          }
          .result-compliant {
            background: #dcfce7;
            color: #14532d;
          }
          .result-non-compliant {
            background: #fee2e2;
            color: #7f1d1d;
          }
          .result-not-applicable {
            background: #fef3c7;
            color: #854d0e;
          }
          .result-pending {
            background: #f1f5f9;
            color: #334155;
          }
          .checked-by-row td {
            background: #e8eef7;
            font-weight: 600;
            white-space: pre-line;
          }
          .checked-by-title {
            text-align: left;
            font-size: 9px;
          }
          .checked-by-key {
            margin: 0 12px 12px;
            padding: 8px 10px;
            border-radius: 8px;
            border: 1px solid #d8e2ef;
            background: #f7fbff;
            color: #1e293b;
            font-size: 10px;
            line-height: 15px;
          }
          .checked-by-key-item {
            display: block;
            margin-top: 3px;
          }
        </style>
      </head>
      <body>
        <section class="report-shell">
          <section class="hero">
            <h1 class="title">${escapeHtml(input.scope.title)}</h1>
            <p class="subtitle">${escapeHtml(input.scope.subtitle)}</p>
            <div class="meta">
              <span><strong>Shop:</strong> ${escapeHtml(input.shopName || "-")}</span>
              <span><strong>Frequency:</strong> ${escapeHtml(input.frequency)}</span>
              <span><strong>Period:</strong> ${escapeHtml(input.scope.periodLabel)}</span>
              <span><strong>Generated:</strong> ${escapeHtml(generatedOnText)}</span>
            </div>
          </section>
          ${failedColumnsHtml}
          <section class="legend">
            <strong>Legend:</strong> C = Compliant, NC = Non-Compliant, N/A = Not Applicable, P = Pending
          </section>
          <section class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th class="item-col">Checks to be carried out</th>
                  ${headerRowHtml}
                </tr>
              </thead>
              <tbody>
                ${groupRowsHtml}
                <tr class="checked-by-row">
                  <td class="checked-by-title">Checked by initials</td>
                  ${checkedByRowHtml}
                </tr>
              </tbody>
            </table>
          </section>
          ${checkedByLegendHtml}
        </section>
      </body>
    </html>
  `;
}

// Pulsing skeleton placeholder rendered while the period log loads for the first time.
// Mirrors the Day Management initial-load pattern.
function ComplianceChecksLoadingState() {
  return (
    <View style={complianceLoadingStyles.shell}>
      <View style={[ui.card, complianceLoadingStyles.card]}>
        <View style={complianceLoadingStyles.headerRow}>
          <Skeleton width={160} height={22} radius={appTheme.radius.sm} />
          <Skeleton width={80} height={24} radius={appTheme.radius.pill} />
        </View>
        <View style={complianceLoadingStyles.tabsRow}>
          <Skeleton width={72} height={32} radius={appTheme.radius.pill} />
          <Skeleton width={72} height={32} radius={appTheme.radius.pill} />
          <Skeleton width={72} height={32} radius={appTheme.radius.pill} />
        </View>
        <Skeleton height={42} radius={appTheme.radius.sm} />
      </View>

      {[0, 1].map((groupIdx) => (
        <View key={groupIdx} style={[ui.card, complianceLoadingStyles.card]}>
          <View style={complianceLoadingStyles.headerRow}>
            <Skeleton width="50%" height={18} radius={appTheme.radius.sm} />
            <Skeleton width={64} height={22} radius={appTheme.radius.pill} />
          </View>
          {[0, 1, 2].map((rowIdx) => (
            <View key={rowIdx} style={complianceLoadingStyles.itemRow}>
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width="80%" height={14} />
                <Skeleton width="55%" height={12} />
              </View>
              <Skeleton width={72} height={28} radius={appTheme.radius.pill} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const complianceLoadingStyles = StyleSheet.create({
  shell: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
  },
  card: {
    gap: appTheme.spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
  tabsRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    paddingVertical: 6,
  },
});

export function ComplianceChecksScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, "ComplianceChecks">>();
  const initialDate = route.params?.date ?? formatDateValue(new Date());
  const queryClient = useQueryClient();
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;
  const { isAllowed: canAttachPhotos } = useFeature("compliance.photo_evidence");
  // Weekly/Monthly compliance is a Growth+ feature. Starter shops see only the Daily tab.
  const { isAllowed: canUseExtendedFrequencies } = useFeature("compliance.daily_weekly_monthly");
  const userRoles = profile?.roles ?? [];
  const canManage = isManagerLike(userRoles);
  const defaultCheckedByName = useMemo(
    () => resolveDefaultCheckedByName(profile ?? undefined),
    [profile?.displayName, profile?.email, profile?.firstName, profile?.lastName],
  );

  const [frequency, setFrequency] = useState<ComplianceCheckFrequency>("Daily");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, EntryDraft>>({});
  const [editorState, setEditorState] = useState<NoteEditorState>(null);
  const [editorValue, setEditorValue] = useState("");
  const [attachmentsByItemId, setAttachmentsByItemId] = useState<Record<string, ComplianceAttachmentState[]>>({});
  const [expandedAttachmentItemId, setExpandedAttachmentItemId] = useState<string | null>(null);
  const [isAttachmentPreviewModalVisible, setIsAttachmentPreviewModalVisible] = useState(false);
  const [attachmentPreviewId, setAttachmentPreviewId] = useState<string | null>(null);
  const [attachmentPreviewTitle, setAttachmentPreviewTitle] = useState("");
  const [attachmentPreviewUri, setAttachmentPreviewUri] = useState<string>();
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);
  const weeklyRange = useMemo(() => getWeekRangeFromDateValue(selectedDate), [selectedDate]);
  const monthAnchorDate = useMemo(() => getMonthAnchorDate(selectedDate), [selectedDate]);
  const monthAnchor = useMemo(() => parseDateValue(monthAnchorDate) ?? new Date(), [monthAnchorDate]);
  const selectedMonthIndex = monthAnchor.getMonth();
  const selectedMonthYear = monthAnchor.getFullYear();
  const effectivePeriodDate = useMemo(() => {
    if (frequency === "Weekly") {
      return weeklyRange.startDate;
    }
    if (frequency === "Monthly") {
      return monthAnchorDate;
    }
    return selectedDate;
  }, [frequency, monthAnchorDate, selectedDate, weeklyRange.startDate]);

  const logQuery = useQuery({
    queryKey: ["compliance-period-log", shopId, frequency, effectivePeriodDate],
    queryFn: () => getComplianceCheckPeriodLog(shopId as string, frequency, effectivePeriodDate),
    enabled: Boolean(shopId),
  });

  const onPullRefresh = useCallback(async () => {
    await logQuery.refetch();
  }, [logQuery]);
  const isRefreshing = logQuery.isRefetching;

  const periodGroups = logQuery.data?.groups;
  const allRows = useMemo(() => flattenRows(periodGroups ?? []), [periodGroups]);
  const visiblePeriodGroups = useMemo(() => {
    const groups = periodGroups ?? [];
    if (!showPendingOnly) {
      return groups;
    }

    return groups
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) => (drafts[row.item.id]?.result ?? row.entry?.result ?? "Pending") === "Pending"),
      }))
      .filter((group) => group.rows.length > 0);
  }, [drafts, periodGroups, showPendingOnly]);
  const rowByItemId = useMemo(() => {
    const next: Record<string, ComplianceCheckPeriodRow> = {};
    for (const row of allRows) {
      next[row.item.id] = row;
    }
    return next;
  }, [allRows]);

  useEffect(() => {
    setDrafts((previous) => {
      const nextDrafts: Record<string, EntryDraft> = {};
      let hasChanges = Object.keys(previous).length !== allRows.length;

      for (const row of allRows) {
        const nextDraft: EntryDraft = {
          result: row.entry?.result ?? "Pending",
          notes: row.entry?.notes ?? "",
          actionRequired: row.entry?.actionRequired ?? "",
          checkedByName: row.entry?.checkedByName ?? defaultCheckedByName,
        };
        nextDrafts[row.item.id] = nextDraft;

        const previousDraft = previous[row.item.id];
        if (
          !previousDraft ||
          previousDraft.result !== nextDraft.result ||
          previousDraft.notes !== nextDraft.notes ||
          previousDraft.actionRequired !== nextDraft.actionRequired ||
          previousDraft.checkedByName !== nextDraft.checkedByName
        ) {
          hasChanges = true;
        }
      }

      return hasChanges ? nextDrafts : previous;
    });
  }, [allRows, defaultCheckedByName]);

  const saveMutation = useMutation({
    mutationFn: async (input: { item: ComplianceCheckItem; draft: EntryDraft; attachments?: ComplianceAttachmentState[] }) => {
      if (!shopId) throw new Error("No shop selected.");
      const pendingAttachments = input.attachments ?? attachmentsByItemId[input.item.id] ?? [];

      return upsertComplianceCheckEntry({
        shopId,
        complianceCheckItemId: input.item.id,
        date: effectivePeriodDate,
        result: input.draft.result,
        notes: input.draft.notes.trim() || undefined,
        actionRequired: input.draft.actionRequired.trim() || undefined,
        checkedByName: input.draft.checkedByName.trim() || undefined,
        attachments: pendingAttachments.length > 0
          ? pendingAttachments.map((attachment) => ({
            fileName: attachment.fileName,
            base64: attachment.base64,
            contentType: attachment.contentType,
          }))
          : undefined,
      });
    },
    onSuccess: async (_result, variables) => {
      setAttachmentsByItemId((previous) => {
        if (!previous[variables.item.id]) {
          return previous;
        }

        const next = { ...previous };
        delete next[variables.item.id];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["compliance-period-log", shopId, frequency, effectivePeriodDate] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to save compliance check.");
    },
  });

  const previewAttachmentMutation = useMutation({
    mutationFn: async ({ attachmentId, fileName }: { attachmentId: string; fileName: string }) => {
      const dataUrl = await getComplianceCheckAttachmentContent(attachmentId);
      if (!dataUrl) {
        throw new Error("Attachment file is not available.");
      }

      return { attachmentId, dataUrl, fileName };
    },
    onSuccess: ({ attachmentId, dataUrl, fileName }) => {
      setAttachmentPreviewId(attachmentId);
      setAttachmentPreviewTitle(fileName);
      setAttachmentPreviewUri(dataUrl);
      setIsAttachmentPreviewModalVisible(true);
    },
    onError: (error: any) => {
      Alert.alert("Preview unavailable", error?.response?.data?.message ?? error?.message ?? "Unable to load attachment.");
    },
  });

  const downloadAttachmentMutation = useMutation({
    mutationFn: async ({ attachmentId, fileName }: { attachmentId: string; fileName: string }) => {
      const dataUrl = await getComplianceCheckAttachmentContent(attachmentId);
      if (!dataUrl) {
        throw new Error("Attachment file is not available.");
      }

      const contentType = getContentTypeFromDataUrl(dataUrl);
      const base64Payload = getBase64Payload(dataUrl);
      const safeFileName = ensureFileNameWithExtension(fileName, contentType);
      const targetDirectory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!targetDirectory) {
        throw new Error("Storage directory is unavailable on this device.");
      }

      const targetUri = `${targetDirectory}${Date.now()}-${safeFileName}`;
      await FileSystem.writeAsStringAsync(targetUri, base64Payload, { encoding: FileSystem.EncodingType.Base64 });
      return { fileUri: targetUri, fileName: safeFileName, contentType };
    },
    onSuccess: async ({ fileUri, fileName, contentType }) => {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Downloaded", `File saved to:\n${fileUri}`);
        return;
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: contentType,
        dialogTitle: `Download ${fileName}`,
      });
    },
    onError: (error: any) => {
      Alert.alert("Download failed", error?.response?.data?.message ?? error?.message ?? "Unable to download attachment.");
    },
  });

  const complianceMatrixReportMutation = useMutation({
    mutationFn: async (action: ComplianceReportAction) => {
      if (!shopId) {
        throw new Error("No shop selected.");
      }

      const scope = buildComplianceMatrixReportScope({
        frequency,
        selectedDate,
        weeklyRangeStartDate: weeklyRange.startDate,
        selectedMonthYear,
      });

      if (scope.columns.length === 0) {
        throw new Error("No report columns available for selected period.");
      }

      const config = normalizeGroups(await listComplianceCheckConfig(shopId, frequency));
      const groups: ComplianceMatrixGroupedItems[] = config
        .filter((group) => group.isActive)
        .map((group) => ({
          groupName: group.groupName,
          items: group.items
            .filter((item) => item.isActive)
            .map((item) => ({
              itemId: item.id,
              itemName: item.itemName,
            })),
        }))
        .filter((group) => group.items.length > 0);

      if (groups.length === 0) {
        throw new Error("No active compliance items configured for the selected frequency.");
      }

      const periodLogResults = await Promise.allSettled(
        scope.columns.map((column) => getComplianceCheckPeriodLog(shopId, frequency, column.date)),
      );

      const entryByCell = new Map<string, ComplianceCheckEntry>();
      const checkedByInitialsSetByColumn = new Map<string, Set<string>>();
      const checkedByNamesByInitials = new Map<string, Set<string>>();
      const unavailableColumns: string[] = [];

      periodLogResults.forEach((result, index) => {
        const column = scope.columns[index];
        if (!column) {
          return;
        }

        if (result.status !== "fulfilled") {
          unavailableColumns.push(column.label);
          return;
        }

        for (const periodGroup of result.value.groups) {
          for (const row of periodGroup.rows) {
            if (!row.entry) {
              continue;
            }

            entryByCell.set(`${row.item.id}|${column.key}`, row.entry);

            const initials = toInitials(row.entry.checkedByName);
            if (!initials) {
              continue;
            }

            const current = checkedByInitialsSetByColumn.get(column.key) ?? new Set<string>();
            current.add(initials);
            checkedByInitialsSetByColumn.set(column.key, current);

            const checkedByName = (row.entry.checkedByName ?? "").trim();
            if (checkedByName.length > 0) {
              const names = checkedByNamesByInitials.get(initials) ?? new Set<string>();
              names.add(checkedByName);
              checkedByNamesByInitials.set(initials, names);
            }
          }
        }
      });

      if (unavailableColumns.length === scope.columns.length) {
        throw new Error("Unable to load report data for the selected period.");
      }

      const checkedByInitialsByColumn = new Map<string, string>();
      scope.columns.forEach((column) => {
        const initialsSet = checkedByInitialsSetByColumn.get(column.key);
        if (!initialsSet || initialsSet.size === 0) {
          return;
        }

        const initials = [...initialsSet].slice(0, 3);
        const suffix = initialsSet.size > 3 ? "+" : "";
        checkedByInitialsByColumn.set(column.key, `${initials.join("\n")}${suffix}`);
      });
      const checkedByLegend = [...checkedByNamesByInitials.entries()]
        .map(([initials, names]) => ({
          initials,
          names: [...names].sort((left, right) => left.localeCompare(right)),
        }))
        .sort((left, right) => left.initials.localeCompare(right.initials));

      const html = buildComplianceMatrixReportHtml({
        shopName: activeShop?.shopName ?? "",
        frequency,
        scope,
        groups,
        entryByCell,
        checkedByInitialsByColumn,
        checkedByLegend,
        unavailableColumns,
        generatedOn: new Date().toISOString(),
      });

      const fileName = `compliance-${frequency.toLowerCase()}-${scope.filePeriodLabel}.pdf`;
      if (action === "print") {
        await Print.printAsync({
          html,
          width: 1123,
          height: 794,
          orientation: Print.Orientation.landscape,
        });
        return;
      }

      const { uri } = await Print.printToFileAsync({
        html,
        width: 1123,
        height: 794,
      });

      if (action === "share") {
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) {
          throw new Error("Sharing is not available on this device.");
        }

        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Share Compliance Report",
        });
        return;
      }

      const attachmentBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await sendReportEmail({
        recipientEmail: profile?.email,
        subject: `${scope.title} (${scope.periodLabel})`,
        body: `Please find attached the ${scope.title} report for ${scope.periodLabel}.`,
        attachmentFileName: fileName,
        attachmentBase64,
      });
    },
    onSuccess: (_value, action) => {
      if (action === "email") {
        Alert.alert("Report emailed", "Compliance report has been emailed successfully.");
      }
    },
    onError: (error: any) => {
      Alert.alert("Report failed", error?.response?.data?.message ?? error?.message ?? "Unable to generate compliance report.");
    },
  });

  function getDraft(itemId: string): EntryDraft {
    return drafts[itemId] ?? { result: "Pending", notes: "", actionRequired: "", checkedByName: defaultCheckedByName };
  }

  function updateDraft(itemId: string, patch: Partial<EntryDraft>) {
    setDrafts((previous) => ({
      ...previous,
      [itemId]: {
        ...(previous[itemId] ?? { result: "Pending", notes: "", actionRequired: "", checkedByName: defaultCheckedByName }),
        ...patch,
      },
    }));
  }

  function openEditor(itemId: string, field: "notes" | "actionRequired" | "checkedByName", itemName: string) {
    const draft = getDraft(itemId);
    const fieldLabel = field === "notes" ? "Notes" : field === "actionRequired" ? "Action Required" : "Checked By";
    setEditorState({
      itemId,
      field,
      title: `${fieldLabel} - ${itemName}`,
    });
    setEditorValue(field === "notes" ? draft.notes : field === "actionRequired" ? draft.actionRequired : draft.checkedByName);
  }

  function getAttachments(itemId: string) {
    return attachmentsByItemId[itemId] ?? [];
  }

  function getUploadedAttachments(itemId: string): UploadedComplianceAttachment[] {
    return rowByItemId[itemId]?.entry?.closeAttachments ?? [];
  }

  function getAttachmentCount(itemId: string) {
    return getUploadedAttachments(itemId).length + getAttachments(itemId).length;
  }

  function toggleAttachmentPanel(itemId: string) {
    setExpandedAttachmentItemId((previous) => (previous === itemId ? null : itemId));
  }

  function removeAttachment(itemId: string, attachmentId: string) {
    setAttachmentsByItemId((previous) => {
      const current = previous[itemId] ?? [];
      const next = current.filter((attachment) => attachment.id !== attachmentId);
      if (next.length === 0) {
        const copy = { ...previous };
        delete copy[itemId];
        return copy;
      }

      return {
        ...previous,
        [itemId]: next,
      };
    });
  }

  function clearAttachments(itemId: string) {
    setAttachmentsByItemId((previous) => {
      const copy = { ...previous };
      delete copy[itemId];
      return copy;
    });
  }

  // Optimise + ingest assets for a compliance item — runs the same compression/limit logic
  // regardless of whether the source was the camera or the photo library.
  async function ingestComplianceAssets(
    item: ComplianceCheckItem,
    draft: EntryDraft,
    assets: ImagePicker.ImagePickerAsset[],
  ) {
    let oversizedCount = 0;
    let failedCount = 0;
    const optimizedAssets = await Promise.all(
      assets.map(async (asset) => {
        try {
          const optimized = await optimizeImage(asset.uri, { maxDimension: 1600, compress: 0.7 });
          if (optimized.byteSize > MAX_COMPLIANCE_ATTACHMENT_BYTES) {
            oversizedCount++;
            return null;
          }
          return {
            id: `${Date.now()}-${Math.random()}`,
            fileName: asset.fileName ?? `compliance-${Date.now()}.jpg`,
            base64: optimized.base64,
            contentType: "image/jpeg",
            uri: optimized.uri,
            size: optimized.byteSize,
          };
        } catch {
          failedCount++;
          return null;
        }
      })
    );

    const selected = optimizedAssets.filter((value): value is NonNullable<typeof value> => Boolean(value));

    if (oversizedCount > 0) {
      Alert.alert("File too large", `${oversizedCount} attachment(s) exceeded 10 MB even after compression and were skipped.`);
    }

    if (selected.length === 0) {
      Alert.alert("Attachment failed", failedCount > 0 ? "Unable to process selected attachment(s)." : "No attachment was added.");
      return;
    }

    const current = getAttachments(item.id);
    const combined = [...current, ...selected];
    const nextAttachments = combined.length <= MAX_COMPLIANCE_ATTACHMENTS
      ? combined
      : combined.slice(0, MAX_COMPLIANCE_ATTACHMENTS);

    if (combined.length > MAX_COMPLIANCE_ATTACHMENTS) {
      Alert.alert("Attachment limit", "A maximum of 10 attachments can be added.");
    }

    setAttachmentsByItemId((previous) => ({
      ...previous,
      [item.id]: nextAttachments,
    }));

    saveDraftForItem(item, draft, nextAttachments);
  }

  async function selectAttachmentsForItem(item: ComplianceCheckItem, draft: EntryDraft) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Photo access is required to add attachments from your library.");
      return;
    }

    const remainingSlots = Math.max(0, MAX_COMPLIANCE_ATTACHMENTS - getAttachments(item.id).length);
    if (remainingSlots === 0) {
      Alert.alert("Attachment limit", "A maximum of 10 attachments can be added.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 1,
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    await ingestComplianceAssets(item, draft, result.assets);
  }

  async function captureAttachmentForItem(item: ComplianceCheckItem, draft: EntryDraft) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Camera access is required to add a photo to this check.");
      return;
    }

    if (getAttachments(item.id).length >= MAX_COMPLIANCE_ATTACHMENTS) {
      Alert.alert("Attachment limit", "A maximum of 10 attachments can be added.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      quality: 1,
      allowsEditing: false,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    await ingestComplianceAssets(item, draft, result.assets);
  }

  function applyEditor() {
    if (!editorState) return;
    const currentDraft = getDraft(editorState.itemId);
    const nextDraft: EntryDraft = (() => {
      if (editorState.field === "notes") {
        return { ...currentDraft, notes: editorValue };
      }
      if (editorState.field === "actionRequired") {
        return { ...currentDraft, actionRequired: editorValue };
      }
      return { ...currentDraft, checkedByName: editorValue };
    })();

    if (editorState.field === "notes") {
      updateDraft(editorState.itemId, { notes: nextDraft.notes });
    } else if (editorState.field === "actionRequired") {
      updateDraft(editorState.itemId, { actionRequired: nextDraft.actionRequired });
    } else {
      updateDraft(editorState.itemId, { checkedByName: nextDraft.checkedByName });
    }

    const row = rowByItemId[editorState.itemId];
    if (row) {
      saveDraftForItem(row.item, nextDraft);
    }
    setEditorState(null);
    setEditorValue("");
  }

  function saveDraftForItem(
    item: ComplianceCheckItem,
    draft: EntryDraft,
    attachmentsOverride?: ComplianceAttachmentState[],
  ) {
    saveMutation.mutate({ item, draft, attachments: attachmentsOverride });
  }

  function onSelectResult(row: ComplianceCheckPeriodRow, result: ComplianceCheckResult) {
    const nextDraft: EntryDraft = { ...getDraft(row.item.id), result };
    updateDraft(row.item.id, { result });
    saveDraftForItem(row.item, nextDraft);
  }

  function onChangeWeeklyStartDate(value: string) {
    setSelectedDate(value);
  }

  function onChangeWeeklyEndDate(value: string) {
    setSelectedDate(value);
  }

  function onSelectMonthlyMonth(monthIndex: number) {
    setSelectedDate(formatDateValue(new Date(selectedMonthYear, monthIndex, 1)));
  }

  function shiftMonthlyYear(delta: number) {
    setSelectedDate(formatDateValue(new Date(selectedMonthYear + delta, selectedMonthIndex, 1)));
  }

  function shiftDailyDate(delta: number) {
    setSelectedDate((previous) => shiftDateValueByDays(previous, delta));
  }

  function runComplianceReport(action: ComplianceReportAction) {
    complianceMatrixReportMutation.mutate(action);
  }

  function closeAttachmentPreviewModal() {
    setIsAttachmentPreviewModalVisible(false);
    setAttachmentPreviewId(null);
    setAttachmentPreviewTitle("");
    setAttachmentPreviewUri(undefined);
  }

  function previewUploadedAttachment(attachmentId: string, fileName: string) {
    setLoadingAttachmentId(attachmentId);
    previewAttachmentMutation.mutate(
      { attachmentId, fileName },
      {
        onSettled: () => {
          setLoadingAttachmentId(null);
        },
      },
    );
  }

  function downloadUploadedAttachment(attachmentId: string, fileName: string) {
    setDownloadingAttachmentId(attachmentId);
    downloadAttachmentMutation.mutate(
      { attachmentId, fileName },
      {
        onSettled: () => {
          setDownloadingAttachmentId(null);
        },
      },
    );
  }

  const summary = useMemo(() => {
    const total = allRows.length;
    let completed = 0;
    let nonCompliant = 0;
    for (const row of allRows) {
      const draft = getDraft(row.item.id);
      if (draft.result !== "Pending") completed += 1;
      if (draft.result === "NonCompliant") nonCompliant += 1;
    }
    return { total, completed, nonCompliant, pending: Math.max(total - completed, 0) };
  }, [allRows, drafts]);
  const reportActionInProgress = complianceMatrixReportMutation.isPending
    ? complianceMatrixReportMutation.variables
    : undefined;

  if (!shopId) {
    return (
      <ScreenContainer>
        <View style={ui.card}>
          <Text style={styles.pageTitle}>Compliance Checks</Text>
          <Text style={styles.meta}>Select a shop to load compliance checks.</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (logQuery.isLoading) {
    return (
      <ScreenContainer>
        <ComplianceChecksLoadingState />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.content}
        stickyHeaderIndices={[0]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onPullRefresh}
            tintColor={appTheme.colors.primary}
          />
        }
      >
        {/* <View style={styles.heroCard}>
          <View style={styles.heroHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pageTitle}>Compliance Checks</Text>
              <Text style={styles.meta}>Digital Daily/Weekly/Monthly operational checks by group.</Text>
            </View>
            <StatusBadge label={frequency} tone="neutral" />
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{summary.completed}</Text>
              <Text style={styles.summaryLabel}>Completed</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{summary.pending}</Text>
              <Text style={styles.summaryLabel}>Pending</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{summary.nonCompliant}</Text>
              <Text style={styles.summaryLabel}>Non-Compliant</Text>
            </View>
          </View>
          <View style={styles.heroActionsWrap}>
            <Text style={styles.actionsLabel}>Actions</Text>
            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate("ComplianceActions")}>
                <Text style={styles.secondaryButtonText}>Action Report</Text>
              </Pressable>
              {canManage ? (
                <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate("ComplianceConfig")}>
                  <Text style={styles.secondaryButtonText}>Setup</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View> */}

        <View style={styles.frequencyStickyWrap}>
          <View style={[ui.card, styles.frequencyStickyCard]}>
            <View style={styles.chipRow}>
              {frequencyOptions.map((option) => {
                const selected = frequency === option;
                const locked = (option === "Weekly" || option === "Monthly") && !canUseExtendedFrequencies;
                return (
                  <Pressable
                    key={option}
                    style={[styles.choiceChip, selected ? styles.choiceChipSelected : null, locked ? { opacity: 0.5 } : null]}
                    onPress={() => {
                      if (locked) {
                        // ChoosePlan lives on the RootStack — cast to bypass the MainStack typing.
                        (navigation as unknown as { navigate: (route: string) => void }).navigate("ChoosePlan");
                        return;
                      }
                      setFrequency(option);
                    }}
                  >
                    <Text style={[styles.choiceChipText, selected ? styles.choiceChipTextSelected : null]}>
                      {option}{locked ? " 🔒" : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <View style={ui.card}>
          {/* <View style={styles.chipRow}>
            <Pressable
              style={[styles.choiceChip, styles.quickFilterChip, !showPendingOnly ? styles.choiceChipSelected : null]}
              onPress={() => setShowPendingOnly(false)}
            >
              <Text style={[styles.choiceChipText, !showPendingOnly ? styles.choiceChipTextSelected : null]}>
                All Checks
              </Text>
            </Pressable>
            <Pressable
              style={[styles.choiceChip, styles.quickFilterChip, showPendingOnly ? styles.choiceChipSelected : null]}
              onPress={() => setShowPendingOnly(true)}
            >
              <Text style={[styles.choiceChipText, showPendingOnly ? styles.choiceChipTextSelected : null]}>
                Pending Only ({summary.pending})
              </Text>
            </Pressable>
          </View> */}
          {frequency === "Daily" ? (
            <>
              <View style={styles.dailyDateNavRow}>
                <Pressable
                  style={styles.dailyDateNavButton}
                  onPress={() => shiftDailyDate(-1)}
                  accessibilityRole="button"
                  accessibilityLabel="Previous day"
                >
                  <Ionicons name="chevron-back" size={18} color={appTheme.colors.text} />
                </Pressable>
                <DateTimeField style={{ flex: 1 }} mode="date" value={selectedDate} onChange={setSelectedDate} />
                <Pressable
                  style={styles.dailyDateNavButton}
                  onPress={() => shiftDailyDate(1)}
                  accessibilityRole="button"
                  accessibilityLabel="Next day"
                >
                  <Ionicons name="chevron-forward" size={18} color={appTheme.colors.text} />
                </Pressable>
              </View>
              {/* <Text style={styles.meta}>Selected date: {formatDay(selectedDate)}</Text> */}
            </>
          ) : null}
          {frequency === "Weekly" ? (
            <View style={styles.periodPickerSection}>
              <Text style={styles.metaLabel}>Week Start Date</Text>
              <DateTimeField mode="date" value={weeklyRange.startDate} onChange={onChangeWeeklyStartDate} />
              <Text style={styles.metaLabel}>Week End Date</Text>
              <DateTimeField mode="date" value={weeklyRange.endDate} onChange={onChangeWeeklyEndDate} />
               </View>
          ) : null}
          {frequency === "Monthly" ? (
            <View style={styles.periodPickerSection}>
              <Text style={styles.metaLabel}>Year</Text>
              <View style={styles.monthYearPickerRow}>
                <Pressable style={styles.secondaryButton} onPress={() => shiftMonthlyYear(-1)}>
                  <Text style={styles.secondaryButtonText}>- Year</Text>
                </Pressable>
                <Text style={styles.monthYearValue}>{selectedMonthYear}</Text>
                <Pressable style={styles.secondaryButton} onPress={() => shiftMonthlyYear(1)}>
                  <Text style={styles.secondaryButtonText}>+ Year</Text>
                </Pressable>
              </View>
              <Text style={styles.metaLabel}>Month</Text>
              <View style={styles.chipRow}>
                {monthOptions.map((monthLabel, index) => {
                  const selected = selectedMonthIndex === index;
                  return (
                    <Pressable
                      key={monthLabel}
                      style={[styles.choiceChip, styles.monthChoiceChip, selected ? styles.choiceChipSelected : null]}
                      onPress={() => onSelectMonthlyMonth(index)}
                    >
                      <Text style={[styles.choiceChipText, selected ? styles.choiceChipTextSelected : null]}>{monthLabel}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.meta}>Selected month: {monthOptions[selectedMonthIndex]} {selectedMonthYear}</Text>
            </View>
          ) : null}

          <View style={styles.reportSection}>
            {/* <Text style={styles.metaLabel}>Entry Report</Text> */}
            <View style={styles.reportButtonRow}>
              <ReportActionButton
                icon="print-outline"
                label={reportActionInProgress === "print" ? "Preparing..." : "Print"}
                onPress={() => runComplianceReport("print")}
                disabled={complianceMatrixReportMutation.isPending}
              />
              <ReportActionButton
                icon="share-social-outline"
                label={reportActionInProgress === "share" ? "Preparing..." : "Share"}
                onPress={() => runComplianceReport("share")}
                disabled={complianceMatrixReportMutation.isPending}
              />
              <ReportActionButton
                icon="mail-outline"
                label={reportActionInProgress === "email" ? "Sending..." : "Email"}
                onPress={() => runComplianceReport("email")}
                disabled={complianceMatrixReportMutation.isPending}
              />
            </View>
            {/* <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate("ComplianceActions")}>
                <Text style={styles.secondaryButtonText}>Action Report</Text>
              </Pressable>
              {canManage ? (
                <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate("ComplianceConfig")}>
                  <Text style={styles.secondaryButtonText}>Setup</Text>
                </Pressable>
              ) : null}
            </View> */}
          </View>
        </View>

        {logQuery.isLoading ? <Text style={styles.meta}>Loading checks...</Text> : null}
        {visiblePeriodGroups.map((periodGroup) => (
          <View key={periodGroup.group.id} style={[ui.card, styles.periodGroupCardTight]}>
            <View style={[styles.rowBetween, styles.groupHeaderRow]}>
              <Text style={styles.groupTitle}>{periodGroup.group.groupName}</Text>
              <StatusBadge
                label={showPendingOnly ? `${periodGroup.rows.length} pending` : `${periodGroup.completedCount}/${periodGroup.totalCount}`}
                tone={showPendingOnly ? "warning" : "neutral"}
              />
            </View>
            {periodGroup.group.description ? <Text style={styles.meta}>{periodGroup.group.description}</Text> : null}
            <View style={styles.groupRows}>
              {periodGroup.rows.map((row) => {
                const draft = getDraft(row.item.id);
                const uploadedAttachments = getUploadedAttachments(row.item.id);
                const pendingAttachments = getAttachments(row.item.id);
                const attachmentCount = uploadedAttachments.length + pendingAttachments.length;
                const isAttachmentPanelOpen = expandedAttachmentItemId === row.item.id;
                const checkedByDisplayName = draft.checkedByName.trim() || defaultCheckedByName;
                const hasNotes = draft.notes.trim().length > 0;
                const hasAction = draft.actionRequired.trim().length > 0;
                const accentStyle =
                  draft.result === "Compliant"
                    ? styles.itemCardAccentCompliant
                    : draft.result === "NonCompliant"
                      ? styles.itemCardAccentNonCompliant
                      : draft.result === "NotApplicable"
                        ? styles.itemCardAccentNotApplicable
                        : styles.itemCardAccentPending;
                return (
                  <View key={row.item.id} style={styles.itemCard}>
                    <View style={[styles.itemCardAccent, accentStyle]} />
                    <View style={styles.itemCardContent}>
                      <Text style={styles.itemTitle} numberOfLines={2}>{row.item.itemName}</Text>

                      <View style={styles.resultChoiceRow}>
                        {resultOptions.map((resultOption) => {
                          const selected = draft.result === resultOption;
                          return (
                            <Pressable
                              key={resultOption}
                              style={[
                                styles.choiceChip,
                                styles.resultChoiceChip,
                                getResultChoiceChipBaseStyle(resultOption),
                                selected ? getResultChoiceChipSelectedStyle(resultOption) : null,
                              ]}
                              onPress={() => onSelectResult(row, resultOption)}
                            >
                              <Text
                                style={[
                                  styles.choiceChipText,
                                  styles.resultChoiceChipText,
                                  getResultChoiceChipTextBaseStyle(resultOption),
                                  selected ? getResultChoiceChipTextSelectedStyle(resultOption) : null,
                                ]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.75}
                              >
                                {formatResultButtonLabel(resultOption)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      <View style={styles.itemActionIconRow}>
                        <Pressable
                          style={[styles.iconActionButton, hasNotes ? styles.iconActionButtonFilled : null]}
                          accessibilityRole="button"
                          accessibilityLabel={hasNotes ? "Edit notes" : "Add notes"}
                          onPress={() => openEditor(row.item.id, "notes", row.item.itemName)}
                        >
                          <Ionicons name="create-outline" size={16} color={appTheme.colors.primary} />
                          {hasNotes ? <View style={styles.iconActionDot} /> : null}
                        </Pressable>
                        <Pressable
                          style={[
                            styles.iconActionButton,
                            hasAction ? styles.iconActionButtonWarningFilled : null,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={hasAction ? "Edit action required" : "Add action required"}
                          onPress={() => openEditor(row.item.id, "actionRequired", row.item.itemName)}
                        >
                          <Ionicons name="warning-outline" size={16} color={appTheme.colors.warning} />
                          {hasAction ? <View style={[styles.iconActionDot, styles.iconActionDotWarning]} /> : null}
                        </Pressable>
                        <Pressable
                          style={[styles.iconActionButton, attachmentCount > 0 ? styles.iconActionButtonInfoFilled : null]}
                          accessibilityRole="button"
                          accessibilityLabel={attachmentCount > 0 ? `Manage ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}` : "Add attachments"}
                          onPress={() => toggleAttachmentPanel(row.item.id)}
                        >
                          <Ionicons name="attach-outline" size={16} color={appTheme.colors.info} />
                          {attachmentCount > 0 ? (
                            <View style={styles.iconActionCountBadge}>
                              <Text style={styles.iconActionCountBadgeText}>{attachmentCount}</Text>
                            </View>
                          ) : null}
                        </Pressable>
                        {/* Only surface the checker when the item has been answered; tapping
                            opens the inline editor — keeps the card uncluttered while pending. */}
                        {draft.result ? (
                          <Pressable
                            style={styles.checkedByPill}
                            accessibilityRole="button"
                            accessibilityLabel="Edit checker name"
                            onPress={() => openEditor(row.item.id, "checkedByName", row.item.itemName)}
                          >
                            <Ionicons name="person-circle-outline" size={14} color={appTheme.colors.textSubtle} />
                            <Text style={styles.checkedByPillText} numberOfLines={1}>
                              {checkedByDisplayName || "Set name"}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>

                    {isAttachmentPanelOpen ? (
                      <View style={styles.inlineAttachmentPanel}>
                        <Text style={styles.fieldLabel}>Attachments (Optional)</Text>
                        {attachmentCount === 0 ? (
                          <Text style={styles.meta}>No attachments selected.</Text>
                        ) : (
                          <Text style={styles.meta}>{attachmentCount} attachment(s) selected.</Text>
                        )}
                        {uploadedAttachments.length > 0 ? (
                          <Text style={styles.meta}>Uploaded: {uploadedAttachments.length}</Text>
                        ) : null}
                        {pendingAttachments.length > 0 ? (
                          <Text style={styles.meta}>Pending upload: {pendingAttachments.length}</Text>
                        ) : null}

                        {uploadedAttachments.length > 0 || pendingAttachments.length > 0 ? (
                          <View style={styles.complianceAttachmentList}>
                            {uploadedAttachments.map((attachment) => {
                              const canPreviewImage = isImageContentType(attachment.contentType);
                              const isLoadingPreview = loadingAttachmentId === attachment.id;
                              const isDownloading = downloadingAttachmentId === attachment.id;
                              return (
                                <View key={attachment.id} style={styles.complianceAttachmentItem}>
                                  {canPreviewImage ? (
                                    <View style={styles.complianceAttachmentImageBadge}>
                                      <Text style={styles.complianceAttachmentImageBadgeText}>IMG</Text>
                                    </View>
                                  ) : (
                                    <View style={styles.complianceAttachmentFileIcon}>
                                      <Text style={styles.complianceAttachmentFileIconText}>FILE</Text>
                                    </View>
                                  )}
                                  <View style={styles.complianceAttachmentMeta}>
                                    <Text style={styles.complianceAttachmentFileName} numberOfLines={1}>
                                      {attachment.fileName}
                                    </Text>
                                    <Text style={styles.meta}>
                                      {(attachment.contentType ?? "application/octet-stream")}
                                      {attachment.fileSizeBytes > 0 ? ` | ${formatFileSize(attachment.fileSizeBytes)}` : ""}
                                    </Text>
                                    <Text style={styles.meta}>Uploaded {new Date(attachment.uploadedOn).toLocaleString()}</Text>
                                  </View>
                                  <View style={styles.complianceAttachmentActionStack}>
                                    <Pressable
                                      style={styles.complianceAttachmentDownloadButton}
                                      onPress={() => downloadUploadedAttachment(attachment.id, attachment.fileName)}
                                      disabled={isDownloading}
                                    >
                                      <Text style={styles.complianceAttachmentDownloadButtonText}>
                                        {isDownloading ? "Saving..." : "Download"}
                                      </Text>
                                    </Pressable>
                                    {canPreviewImage ? (
                                      <Pressable
                                        style={styles.complianceAttachmentViewButton}
                                        onPress={() => previewUploadedAttachment(attachment.id, attachment.fileName)}
                                        disabled={isLoadingPreview}
                                      >
                                        <Text style={styles.complianceAttachmentViewButtonText}>
                                          {isLoadingPreview ? "Loading..." : "Preview"}
                                        </Text>
                                      </Pressable>
                                    ) : (
                                      <View style={styles.complianceAttachmentNoPreviewBadge}>
                                        <Text style={styles.complianceAttachmentNoPreviewBadgeText}>No Preview</Text>
                                      </View>
                                    )}
                                  </View>
                                </View>
                              );
                            })}
                            {pendingAttachments.map((attachment) => {
                              const canPreviewImage = Boolean(attachment.uri) && (attachment.contentType?.startsWith("image/") ?? false);
                              return (
                                <View key={attachment.id} style={styles.complianceAttachmentItem}>
                                  {canPreviewImage ? (
                                    <Image source={{ uri: attachment.uri }} style={styles.complianceAttachmentPreviewImage} resizeMode="cover" />
                                  ) : (
                                    <View style={styles.complianceAttachmentFileIcon}>
                                      <Text style={styles.complianceAttachmentFileIconText}>FILE</Text>
                                    </View>
                                  )}
                                  <View style={styles.complianceAttachmentMeta}>
                                    <Text style={styles.complianceAttachmentFileName} numberOfLines={1}>
                                      {attachment.fileName}
                                    </Text>
                                    <Text style={styles.meta}>
                                      {(attachment.contentType ?? "application/octet-stream")}
                                      {attachment.size ? ` | ${formatFileSize(attachment.size)}` : ""}
                                    </Text>
                                  </View>
                                  <Pressable
                                    style={styles.complianceAttachmentRemoveButton}
                                    onPress={() => removeAttachment(row.item.id, attachment.id)}
                                  >
                                    <Text style={styles.complianceAttachmentRemoveButtonText}>Remove</Text>
                                  </Pressable>
                                </View>
                              );
                            })}
                          </View>
                        ) : null}

                        {canAttachPhotos ? (
                          <>
                            <View style={styles.complianceAttachmentActionRow}>
                              <Pressable
                                style={styles.complianceAttachmentActionButton}
                                accessibilityRole="button"
                                accessibilityLabel="Take a photo for this check"
                                onPress={() => void captureAttachmentForItem(row.item, draft)}
                              >
                                <Ionicons name="camera-outline" size={16} color={appTheme.colors.text} />
                                <Text style={styles.complianceAttachmentActionButtonText}>Take Photo</Text>
                              </Pressable>
                              <Pressable
                                style={styles.complianceAttachmentActionButton}
                                accessibilityRole="button"
                                accessibilityLabel="Pick attachments from gallery"
                                onPress={() => void selectAttachmentsForItem(row.item, draft)}
                              >
                                <Ionicons name="images-outline" size={16} color={appTheme.colors.text} />
                                <Text style={styles.complianceAttachmentActionButtonText}>From Gallery</Text>
                              </Pressable>
                            </View>
                            {pendingAttachments.length > 0 ? (
                              <View style={styles.complianceAttachmentActionRow}>
                                <Pressable
                                  style={[styles.complianceAttachmentActionButton, styles.complianceAttachmentActionButtonDanger]}
                                  accessibilityRole="button"
                                  accessibilityLabel="Clear all pending attachments"
                                  onPress={() => clearAttachments(row.item.id)}
                                >
                                  <Text style={[styles.complianceAttachmentActionButtonText, styles.complianceAttachmentActionButtonTextDanger]}>
                                    Clear All
                                  </Text>
                                </Pressable>
                              </View>
                            ) : null}
                          </>
                        ) : (
                          <View style={styles.complianceAttachmentActionRow}>
                            <View style={{ flex: 1 }}>
                              <UpgradeNotice
                                feature="compliance.photo_evidence"
                                title="Attachments are a Pro feature"
                                message="Upgrade this shop to attach photo evidence to compliance entries."
                                compact
                              />
                            </View>
                          </View>
                        )}
                      </View>
                    ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {visiblePeriodGroups.length === 0 && !logQuery.isLoading ? (
          <View style={[ui.card, styles.periodGroupCardTight]}>
            <Text style={styles.meta}>
              {showPendingOnly ? "No pending checks for this period." : "No compliance groups configured for this frequency."}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={isAttachmentPreviewModalVisible}
        transparent={false}
        animationType="fade"
        onRequestClose={closeAttachmentPreviewModal}
      >
        <View style={styles.attachmentPreviewBackdrop}>
          <View style={styles.attachmentPreviewHeader}>
            <Text style={styles.attachmentPreviewTitle} numberOfLines={1}>{attachmentPreviewTitle || "Attachment Preview"}</Text>
            <View style={styles.attachmentPreviewHeaderActions}>
              <Pressable
                style={styles.attachmentPreviewHeaderButton}
                onPress={() => {
                  if (!attachmentPreviewId || !attachmentPreviewTitle) {
                    return;
                  }

                  downloadUploadedAttachment(attachmentPreviewId, attachmentPreviewTitle);
                }}
                disabled={!attachmentPreviewId || !attachmentPreviewTitle || downloadingAttachmentId === attachmentPreviewId}
              >
                <Text style={styles.attachmentPreviewHeaderButtonText}>
                  {downloadingAttachmentId === attachmentPreviewId ? "Saving..." : "Download"}
                </Text>
              </Pressable>
              <Pressable style={styles.attachmentPreviewHeaderButton} onPress={closeAttachmentPreviewModal}>
                <Text style={styles.attachmentPreviewHeaderButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
          {attachmentPreviewUri ? (
            <Image source={{ uri: attachmentPreviewUri }} style={styles.attachmentPreviewModalImage} resizeMode="contain" />
          ) : (
            <View style={styles.attachmentPreviewEmptyState}>
              <Text style={styles.attachmentPreviewEmptyText}>No preview available.</Text>
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={Boolean(editorState)} transparent animationType="fade" onRequestClose={() => setEditorState(null)}>
        <View style={styles.modalBackdrop}>
          <ModalBackdropBlur />
          <View style={styles.modalCard}>
            <Text style={styles.itemTitle}>{editorState?.title ?? "Edit"}</Text>
            <TextInput
              style={[styles.input, editorState?.field === "checkedByName" ? null : styles.textArea]}
              value={editorValue}
              onChangeText={setEditorValue}
              placeholder={editorState?.field === "checkedByName" ? "Enter person name..." : "Enter details..."}
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline={editorState?.field !== "checkedByName"}
              autoCapitalize="words"
              maxLength={editorState?.field === "checkedByName" ? 120 : 1000}
            />
            <View style={[styles.row, styles.modalActionRow]}>
              <Pressable style={[styles.secondaryButton, styles.modalActionButton]} onPress={() => setEditorState(null)}>
                <Text style={[styles.secondaryButtonText, styles.modalActionButtonText]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.secondaryButton, styles.modalActionButton]} onPress={applyEditor}>
                <Text style={[styles.secondaryButtonText, styles.modalActionButtonText]}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

export function ComplianceChecksConfigScreen() {
  const queryClient = useQueryClient();
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const [frequency, setFrequency] = useState<ComplianceCheckFrequency>("Daily");
  const [groups, setGroups] = useState<ComplianceCheckGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [groupForm, setGroupForm] = useState<GroupFormState>(initialGroupForm);
  const [itemForm, setItemForm] = useState<ItemFormState>(initialItemForm);

  const configQuery = useQuery({
    queryKey: ["compliance-config", shopId, frequency],
    queryFn: () => listComplianceCheckConfig(shopId as string, frequency),
    enabled: Boolean(shopId),
  });

  useEffect(() => {
    const nextGroups = normalizeGroups(configQuery.data ?? []);
    setGroups(nextGroups);
    if (!nextGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(nextGroups[0]?.id ?? "");
    }
  }, [configQuery.data, selectedGroupId]);

  const activeGroup = useMemo(() => groups.find((group) => group.id === selectedGroupId), [groups, selectedGroupId]);

  const totals = useMemo(() => {
    const items = groups.reduce((sum, group) => sum + group.items.length, 0);
    const activeGroups = groups.filter((group) => group.isActive).length;
    return { groups: groups.length, items, activeGroups };
  }, [groups]);

  const groupSaveMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error("No shop selected.");
      if (!groupForm.groupName.trim()) throw new Error("Group name is required.");

      if (groupForm.id) {
        await updateComplianceCheckGroup(groupForm.id, {
          frequency: groupForm.frequency,
          groupName: groupForm.groupName.trim(),
          description: groupForm.description.trim() || undefined,
          isActive: groupForm.isActive,
        });
      } else {
        await createComplianceCheckGroup({
          shopId,
          frequency: groupForm.frequency,
          groupName: groupForm.groupName.trim(),
          description: groupForm.description.trim() || undefined,
          isActive: groupForm.isActive,
        });
      }
    },
    onSuccess: async () => {
      setGroupModalVisible(false);
      setGroupForm(initialGroupForm);
      await queryClient.invalidateQueries({ queryKey: ["compliance-config", shopId, frequency] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to save compliance group.");
    },
  });

  const itemSaveMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error("No shop selected.");
      if (!itemForm.complianceCheckGroupId) throw new Error("Select a group.");
      if (!itemForm.itemName.trim()) throw new Error("Item name is required.");

      if (itemForm.id) {
        await updateComplianceCheckItem(itemForm.id, {
          complianceCheckGroupId: itemForm.complianceCheckGroupId,
          itemName: itemForm.itemName.trim(),
          description: itemForm.description.trim() || undefined,
          isRequired: itemForm.isRequired,
          isActive: itemForm.isActive,
        });
      } else {
        await createComplianceCheckItem({
          shopId,
          complianceCheckGroupId: itemForm.complianceCheckGroupId,
          itemName: itemForm.itemName.trim(),
          description: itemForm.description.trim() || undefined,
          isRequired: itemForm.isRequired,
          isActive: itemForm.isActive,
        });
      }
    },
    onSuccess: async () => {
      setItemModalVisible(false);
      setItemForm(initialItemForm);
      await queryClient.invalidateQueries({ queryKey: ["compliance-config", shopId, frequency] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to save compliance item.");
    },
  });

  async function onReorderGroups(nextGroups: ComplianceCheckGroup[]) {
    if (!shopId) return;
    setGroups(nextGroups);
    try {
      await reorderComplianceCheckGroups({
        shopId,
        frequency,
        orderedGroupIds: nextGroups.map((group) => group.id),
      });
      await queryClient.invalidateQueries({ queryKey: ["compliance-config", shopId, frequency] });
    } catch (error: any) {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to reorder groups.");
      setGroups(normalizeGroups(configQuery.data ?? []));
    }
  }

  async function onReorderItems(nextItems: ComplianceCheckItem[]) {
    if (!shopId || !activeGroup) return;
    const normalized = nextItems.map((item, index) => ({ ...item, displayOrder: index + 1 }));
    setGroups((previous) =>
      previous.map((group) => (group.id === activeGroup.id ? { ...group, items: normalized } : group))
    );

    try {
      await reorderComplianceCheckItems({
        shopId,
        complianceCheckGroupId: activeGroup.id,
        orderedItemIds: normalized.map((item) => item.id),
      });
      await queryClient.invalidateQueries({ queryKey: ["compliance-config", shopId, frequency] });
    } catch (error: any) {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to reorder items.");
      setGroups(normalizeGroups(configQuery.data ?? []));
    }
  }

  function openCreateGroup() {
    setGroupForm({ ...initialGroupForm, frequency });
    setGroupModalVisible(true);
  }

  function openEditGroup(group: ComplianceCheckGroup) {
    setGroupForm({
      id: group.id,
      frequency: group.frequency,
      groupName: group.groupName,
      description: group.description ?? "",
      isActive: group.isActive,
    });
    setGroupModalVisible(true);
  }

  function openCreateItem(targetGroupId?: string) {
    setItemForm({
      ...initialItemForm,
      complianceCheckGroupId: targetGroupId ?? activeGroup?.id ?? groups[0]?.id ?? "",
    });
    setItemModalVisible(true);
  }

  function openEditItem(item: ComplianceCheckItem) {
    setItemForm({
      id: item.id,
      complianceCheckGroupId: item.complianceCheckGroupId,
      itemName: item.itemName,
      description: item.description ?? "",
      isRequired: item.isRequired,
      isActive: item.isActive,
    });
    setItemModalVisible(true);
  }

  if (!shopId) {
    return (
      <ScreenContainer>
        <View style={ui.card}>
          <Text style={styles.pageTitle}>Compliance Setup</Text>
          <Text style={styles.meta}>Select a shop to configure compliance groups and items.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <NestableScrollContainer contentContainerStyle={styles.content}>
        <View style={[ui.card, styles.cfgHeroCard]}>
          <View style={styles.cfgHeroTop}>
            <View style={styles.cfgHeroIcon}>
              <Ionicons name="shield-checkmark-outline" size={20} color={appTheme.colors.primary} />
            </View>
            <View style={styles.cfgHeroText}>
              <Text style={styles.pageTitle}>Compliance Setup</Text>
              <Text style={styles.cfgHeroSubtitle}>Organise your checks into groups for each schedule.</Text>
            </View>
          </View>

          <View style={styles.cfgStatRow}>
            <View style={styles.cfgStatTile}>
              <Text style={styles.cfgStatValue}>{totals.groups}</Text>
              <Text style={styles.cfgStatLabel}>Groups</Text>
            </View>
            <View style={styles.cfgStatTile}>
              <Text style={styles.cfgStatValue}>{totals.items}</Text>
              <Text style={styles.cfgStatLabel}>Items</Text>
            </View>
            <View style={styles.cfgStatTile}>
              <Text style={styles.cfgStatValue}>{totals.activeGroups}</Text>
              <Text style={styles.cfgStatLabel}>Active</Text>
            </View>
          </View>

          <View style={styles.cfgSegment}>
            {frequencyOptions.map((option) => {
              const selected = frequency === option;
              return (
                <Pressable
                  key={option}
                  style={[styles.cfgSegmentItem, selected ? styles.cfgSegmentItemActive : null]}
                  onPress={() => setFrequency(option)}
                >
                  <Text style={[styles.cfgSegmentText, selected ? styles.cfgSegmentTextActive : null]}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.cfgActionRow}>
          <Pressable style={styles.cfgPrimaryAction} onPress={openCreateGroup}>
            <Ionicons name="add" size={18} color={appTheme.colors.onPrimary} />
            <Text style={styles.cfgPrimaryActionText}>New Group</Text>
          </Pressable>
          <Pressable
            style={[styles.cfgGhostAction, !groups.length ? styles.cfgActionDisabled : null]}
            onPress={() => openCreateItem()}
            disabled={!groups.length}
          >
            <Ionicons name="add-circle-outline" size={18} color={appTheme.colors.primary} />
            <Text style={styles.cfgGhostActionText}>New Item</Text>
          </Pressable>
        </View>

        <View style={styles.cfgHintRow}>
          <Ionicons name="reorder-three-outline" size={14} color={appTheme.colors.textSubtle} />
          <Text style={styles.cfgHintText}>Long-press the drag handle to reorder groups and items.</Text>
        </View>

        {configQuery.isLoading ? (
          <View style={{ gap: appTheme.spacing.xs }}>
            <Skeleton height={92} radius={appTheme.radius.md} />
            <Skeleton height={92} radius={appTheme.radius.md} />
          </View>
        ) : groups.length === 0 ? (
          <View style={[ui.card, styles.cfgEmptyCard]}>
            <View style={styles.cfgEmptyIcon}>
              <Ionicons name="folder-open-outline" size={26} color={appTheme.colors.textSubtle} />
            </View>
            <Text style={styles.cfgEmptyTitle}>No groups for {frequency.toLowerCase()} checks</Text>
            <Text style={styles.cfgEmptySubtitle}>Create your first group to start adding compliance items.</Text>
            <Pressable style={styles.cfgPrimaryAction} onPress={openCreateGroup}>
              <Ionicons name="add" size={18} color={appTheme.colors.onPrimary} />
              <Text style={styles.cfgPrimaryActionText}>New Group</Text>
            </Pressable>
          </View>
        ) : (
          <NestableDraggableFlatList
            data={groups}
            keyExtractor={(group) => group.id}
            scrollEnabled={false}
            activationDistance={12}
            containerStyle={styles.groupRows}
            onDragEnd={({ data }) => {
              void onReorderGroups(data);
            }}
            renderItem={({ item, drag, isActive }) => {
              const selected = item.id === selectedGroupId;
              return (
                <Pressable
                  onPress={() => setSelectedGroupId(item.id)}
                  style={[
                    styles.cfgGroupCard,
                    selected ? styles.cfgGroupCardActive : null,
                    isActive ? styles.dragActiveCard : null,
                  ]}
                >
                  <View style={styles.cfgGroupHead}>
                    <View style={[styles.cfgGroupIcon, selected ? styles.cfgGroupIconActive : null]}>
                      <Ionicons
                        name={selected ? "folder-open" : "folder-outline"}
                        size={16}
                        color={appTheme.colors.primary}
                      />
                    </View>
                    <View style={styles.cfgGroupHeadText}>
                      <Text style={styles.cfgGroupName} numberOfLines={1}>{item.groupName}</Text>
                      <Text style={styles.cfgGroupMeta}>
                        {item.items.length} {item.items.length === 1 ? "item" : "items"}
                      </Text>
                    </View>
                    <StatusBadge label={item.isActive ? "Active" : "Inactive"} tone={item.isActive ? "success" : "warning"} />
                  </View>

                  {item.description ? <Text style={styles.cfgGroupDesc} numberOfLines={2}>{item.description}</Text> : null}

                  <View style={styles.cfgGroupActions}>
                    <Pressable style={styles.cfgIconChip} onPress={() => openEditGroup(item)} hitSlop={6}>
                      <Ionicons name="create-outline" size={15} color={appTheme.colors.text} />
                      <Text style={styles.cfgIconChipText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      style={styles.cfgIconChip}
                      onPress={() => {
                        setSelectedGroupId(item.id);
                        openCreateItem(item.id);
                      }}
                      hitSlop={6}
                    >
                      <Ionicons name="add" size={15} color={appTheme.colors.primary} />
                      <Text style={[styles.cfgIconChipText, styles.cfgIconChipTextBrand]}>Item</Text>
                    </Pressable>
                    <Pressable style={styles.cfgDragChip} onLongPress={drag} delayLongPress={120} hitSlop={6}>
                      <Ionicons name="reorder-three-outline" size={16} color={appTheme.colors.textSubtle} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            }}
          />
        )}

        {activeGroup ? (
          <View style={[ui.card, styles.cfgItemsCard]}>
            <SectionHeader
              title={activeGroup.groupName}
              subtitle="Items in this group"
              icon="list-outline"
              right={<StatusBadge label={`${activeGroup.items.length}`} tone="neutral" />}
            />
            {activeGroup.items.length === 0 ? (
              <View style={styles.cfgItemsEmpty}>
                <Text style={styles.cfgEmptySubtitle}>No items yet. Add the first check for this group.</Text>
                <Pressable style={styles.cfgGhostAction} onPress={() => openCreateItem(activeGroup.id)}>
                  <Ionicons name="add-circle-outline" size={18} color={appTheme.colors.primary} />
                  <Text style={styles.cfgGhostActionText}>New Item</Text>
                </Pressable>
              </View>
            ) : (
              <NestableDraggableFlatList
                data={activeGroup.items}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                activationDistance={12}
                containerStyle={styles.groupRows}
                onDragEnd={({ data }) => {
                  void onReorderItems(data);
                }}
                renderItem={({ item, drag, isActive }) => (
                  <View style={[styles.cfgItemRow, isActive ? styles.dragActiveCard : null]}>
                    <View style={styles.cfgItemMain}>
                      <View style={styles.cfgItemTitleRow}>
                        <Text style={styles.itemTitle} numberOfLines={1}>{item.itemName}</Text>
                        {item.isRequired ? (
                          <View style={styles.cfgRequiredPill}>
                            <Text style={styles.cfgRequiredPillText}>Required</Text>
                          </View>
                        ) : null}
                        {!item.isActive ? (
                          <View style={styles.cfgInactivePill}>
                            <Text style={styles.cfgInactivePillText}>Inactive</Text>
                          </View>
                        ) : null}
                      </View>
                      {item.description ? <Text style={styles.cfgGroupMeta} numberOfLines={2}>{item.description}</Text> : null}
                    </View>
                    <Pressable style={styles.cfgItemIconButton} onPress={() => openEditItem(item)} hitSlop={6}>
                      <Ionicons name="create-outline" size={16} color={appTheme.colors.text} />
                    </Pressable>
                    <Pressable style={styles.cfgItemIconButton} onLongPress={drag} delayLongPress={120} hitSlop={6}>
                      <Ionicons name="reorder-three-outline" size={18} color={appTheme.colors.textSubtle} />
                    </Pressable>
                  </View>
                )}
              />
            )}
          </View>
        ) : null}
      </NestableScrollContainer>

      <Modal visible={groupModalVisible} transparent animationType="fade" onRequestClose={() => setGroupModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <ModalBackdropBlur />
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.content}>
              <SectionHeader
                title={groupForm.id ? "Edit Group" : "New Group"}
                subtitle="A group bundles related compliance checks."
                icon="folder-outline"
              />
              <Text style={styles.cfgFormLabel}>Schedule</Text>
              <View style={styles.cfgSegment}>
                {frequencyOptions.map((option) => {
                  const selected = groupForm.frequency === option;
                  return (
                    <Pressable
                      key={option}
                      style={[styles.cfgSegmentItem, selected ? styles.cfgSegmentItemActive : null]}
                      onPress={() => setGroupForm((previous) => ({ ...previous, frequency: option }))}
                    >
                      <Text style={[styles.cfgSegmentText, selected ? styles.cfgSegmentTextActive : null]}>{option}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <FloatingLabelInput
                label="Group name"
                value={groupForm.groupName}
                onChangeText={(value) => setGroupForm((previous) => ({ ...previous, groupName: value }))}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                value={groupForm.description}
                onChangeText={(value) => setGroupForm((previous) => ({ ...previous, description: value }))}
                placeholder="Description (optional)"
                placeholderTextColor={appTheme.colors.textSubtle}
                multiline
              />
              <View style={styles.cfgSwitchRow}>
                <View style={styles.cfgSwitchText}>
                  <Text style={styles.cfgSwitchLabel}>Active</Text>
                  <Text style={styles.cfgSwitchHint}>Inactive groups are hidden from daily checks.</Text>
                </View>
                <Switch
                  value={groupForm.isActive}
                  onValueChange={(value) => setGroupForm((previous) => ({ ...previous, isActive: value }))}
                  trackColor={{ false: appTheme.colors.borderStrong, true: appTheme.colors.primary }}
                  thumbColor={appTheme.colors.onPrimary}
                />
              </View>
              <View style={styles.cfgModalActions}>
                <Pressable style={styles.cfgModalCancel} onPress={() => setGroupModalVisible(false)}>
                  <Text style={styles.cfgModalCancelText}>Cancel</Text>
                </Pressable>
                <View style={styles.cfgModalSave}>
                  <PrimaryButton
                    label={groupSaveMutation.isPending ? "Saving..." : "Save Group"}
                    onPress={() => groupSaveMutation.mutate()}
                    disabled={groupSaveMutation.isPending}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={itemModalVisible} transparent animationType="fade" onRequestClose={() => setItemModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <ModalBackdropBlur />
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.content}>
              <SectionHeader
                title={itemForm.id ? "Edit Item" : "New Item"}
                subtitle="A single check staff complete during a shift."
                icon="checkmark-circle-outline"
              />
              <Text style={styles.cfgFormLabel}>Group</Text>
              <View style={styles.chipRow}>
                {groups.map((group) => {
                  const selected = itemForm.complianceCheckGroupId === group.id;
                  return (
                    <Pressable
                      key={group.id}
                      style={[styles.choiceChip, selected ? styles.choiceChipSelected : null]}
                      onPress={() => setItemForm((previous) => ({ ...previous, complianceCheckGroupId: group.id }))}
                    >
                      <Text style={[styles.choiceChipText, selected ? styles.choiceChipTextSelected : null]}>{group.groupName}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <FloatingLabelInput
                label="Item name"
                value={itemForm.itemName}
                onChangeText={(value) => setItemForm((previous) => ({ ...previous, itemName: value }))}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                value={itemForm.description}
                onChangeText={(value) => setItemForm((previous) => ({ ...previous, description: value }))}
                placeholder="Description (optional)"
                placeholderTextColor={appTheme.colors.textSubtle}
                multiline
              />
              <View style={styles.cfgSwitchRow}>
                <View style={styles.cfgSwitchText}>
                  <Text style={styles.cfgSwitchLabel}>Required</Text>
                  <Text style={styles.cfgSwitchHint}>Staff must complete this check.</Text>
                </View>
                <Switch
                  value={itemForm.isRequired}
                  onValueChange={(value) => setItemForm((previous) => ({ ...previous, isRequired: value }))}
                  trackColor={{ false: appTheme.colors.borderStrong, true: appTheme.colors.primary }}
                  thumbColor={appTheme.colors.onPrimary}
                />
              </View>
              <View style={styles.cfgSwitchRow}>
                <View style={styles.cfgSwitchText}>
                  <Text style={styles.cfgSwitchLabel}>Active</Text>
                  <Text style={styles.cfgSwitchHint}>Inactive items are hidden from daily checks.</Text>
                </View>
                <Switch
                  value={itemForm.isActive}
                  onValueChange={(value) => setItemForm((previous) => ({ ...previous, isActive: value }))}
                  trackColor={{ false: appTheme.colors.borderStrong, true: appTheme.colors.primary }}
                  thumbColor={appTheme.colors.onPrimary}
                />
              </View>
              <View style={styles.cfgModalActions}>
                <Pressable style={styles.cfgModalCancel} onPress={() => setItemModalVisible(false)}>
                  <Text style={styles.cfgModalCancelText}>Cancel</Text>
                </Pressable>
                <View style={styles.cfgModalSave}>
                  <PrimaryButton
                    label={itemSaveMutation.isPending ? "Saving..." : "Save Item"}
                    onPress={() => itemSaveMutation.mutate()}
                    disabled={itemSaveMutation.isPending}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

export function ComplianceActionsScreen() {
  const queryClient = useQueryClient();
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(formatDateValue(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)));
  const [toDate, setToDate] = useState(formatDateValue(today));
  const [openOnly, setOpenOnly] = useState(true);
  const [closeActionState, setCloseActionState] = useState<CloseActionState>(null);
  const [closeNotes, setCloseNotes] = useState("");

  const actionsQuery = useQuery({
    queryKey: ["compliance-actions", shopId, fromDate, toDate, openOnly],
    queryFn: () => getComplianceActionReport(shopId as string, fromDate, toDate, openOnly),
    enabled: Boolean(shopId),
  });

  const closeActionMutation = useMutation({
    mutationFn: async (input: { entryId: string; closedOutNotes?: string }) => {
      if (!shopId) throw new Error("No shop selected.");
      return closeComplianceCheckAction({
        shopId,
        entryId: input.entryId,
        closedOutNotes: input.closedOutNotes,
      });
    },
    onSuccess: async () => {
      setCloseActionState(null);
      setCloseNotes("");
      await queryClient.invalidateQueries({ queryKey: ["compliance-actions", shopId, fromDate, toDate, openOnly] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to close action.");
    },
  });

  function openCloseAction(row: ComplianceActionReportRow) {
    setCloseActionState({ entryId: row.entryId, itemName: row.itemName });
    setCloseNotes("");
  }

  if (!shopId) {
    return (
      <ScreenContainer>
        <View style={ui.card}>
          <Text style={styles.pageTitle}>Compliance Action Report</Text>
          <Text style={styles.meta}>Select a shop to view action report.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={ui.card}>
          <Text style={styles.pageTitle}>Compliance Action Report</Text>
          <Text style={styles.meta}>Track non-compliant checks and close-out actions.</Text>
          <View style={styles.row}>
            <DateTimeField style={{ flex: 1 }} mode="date" value={fromDate} onChange={setFromDate} />
            <DateTimeField style={{ flex: 1 }} mode="date" value={toDate} onChange={setToDate} />
          </View>
          <Pressable style={styles.toggleRow} onPress={() => setOpenOnly((previous) => !previous)}>
            <Text style={styles.toggleLabel}>Open Actions Only</Text>
            <Text style={styles.toggleValue}>{openOnly ? "Yes" : "No"}</Text>
          </Pressable>
        </View>

        {actionsQuery.isLoading ? <Text style={styles.meta}>Loading action report...</Text> : null}
        {(actionsQuery.data ?? []).map((row) => (
          <View key={row.entryId} style={ui.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.itemTitle}>{row.itemName}</Text>
              {/* <StatusBadge label={row.isActionClosedOut ? "Closed" : "Open"} tone={row.isActionClosedOut ? "success" : "warning"} /> */}
            </View>
            <Text style={styles.meta}>Group: {row.groupName}</Text>
            <Text style={styles.meta}>Frequency: {row.frequency}</Text>
            <Text style={styles.meta}>Period: {row.periodLabel || formatDay(row.periodDate)}</Text>
            <Text style={styles.meta}>
              Checked by: {row.checkedByName ?? "-"} at {formatDateTime(row.checkedOn)}
            </Text>
            {row.notes ? <Text style={styles.meta}>Notes: {row.notes}</Text> : null}
            {row.actionRequired ? <Text style={styles.meta}>Action Required: {row.actionRequired}</Text> : null}
            {row.isActionClosedOut ? (
              <>
                <Text style={styles.meta}>
                  Closed by: {row.closedOutByName ?? "-"} at {formatDateTime(row.closedOutOn)}
                </Text>
                {row.closedOutNotes ? <Text style={styles.meta}>Close Notes: {row.closedOutNotes}</Text> : null}
              </>
            ) : (
              <Pressable style={styles.secondaryButton} onPress={() => openCloseAction(row)}>
                <Text style={styles.secondaryButtonText}>Close Action</Text>
              </Pressable>
            )}
          </View>
        ))}
        {(actionsQuery.data ?? []).length === 0 && !actionsQuery.isLoading ? (
          <View style={ui.card}>
            <Text style={styles.meta}>No action rows found for selected filters.</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={Boolean(closeActionState)} transparent animationType="fade" onRequestClose={() => setCloseActionState(null)}>
        <View style={styles.modalBackdrop}>
          <ModalBackdropBlur />
          <View style={styles.modalCard}>
            <Text style={styles.itemTitle}>Close Action</Text>
            {closeActionState ? <Text style={styles.meta}>{closeActionState.itemName}</Text> : null}
            <TextInput
              style={[styles.input, styles.textArea]}
              value={closeNotes}
              onChangeText={setCloseNotes}
              placeholder="Close-out notes"
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
            />
            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => setCloseActionState(null)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  if (!closeActionState) return;
                  closeActionMutation.mutate({
                    entryId: closeActionState.entryId,
                    closedOutNotes: closeNotes.trim() || undefined,
                  });
                }}
              >
                <Text style={styles.secondaryButtonText}>Close Action</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
  },
  frequencyStickyWrap: {
    backgroundColor: appTheme.colors.background,
  },
  frequencyStickyCard: {
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
  },
  pageTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 22,
    lineHeight: 27,
  },
  heroCard: {
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surfaceTintAlt,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  heroHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  heroActionsWrap: {
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.borderSoft,
    paddingTop: appTheme.spacing.xs,
    gap: 6,
  },
  actionsLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summaryRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  summaryTile: {
    flex: 1,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingVertical: appTheme.spacing.xs,
    alignItems: "center",
    gap: 2,
  },
  summaryValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 18,
    lineHeight: 22,
  },
  summaryLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 11,
    lineHeight: 14,
  },
  fieldLabel: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  groupTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 20,
    flex: 1,
  },
  groupRows: {
    gap: appTheme.spacing.xs,
  },
  itemCard: {
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  itemCardAccent: {
    width: 4,
  },
  itemCardAccentPending: {
    backgroundColor: appTheme.colors.borderSoft,
  },
  itemCardAccentCompliant: {
    backgroundColor: appTheme.colors.primary,
  },
  itemCardAccentNonCompliant: {
    backgroundColor: appTheme.colors.danger,
  },
  itemCardAccentNotApplicable: {
    backgroundColor: appTheme.colors.textSubtle,
  },
  itemCardContent: {
    flex: 1,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 10,
    gap: 8,
  },
  itemActionIconRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  iconActionButton: {
    width: 36,
    height: 36,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  iconActionButtonFilled: {
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  iconActionButtonWarningFilled: {
    backgroundColor: appTheme.colors.surfaceWarningSoft,
  },
  iconActionButtonInfoFilled: {
    backgroundColor: appTheme.colors.surfaceInfoSoft,
  },
  // Tiny coloured dot in the top-right corner of an action button to show that content
  // has been entered without taking up another row of text.
  iconActionDot: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: appTheme.colors.primary,
  },
  iconActionDotWarning: {
    backgroundColor: appTheme.colors.warning,
  },
  iconActionCountBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: appTheme.colors.info,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActionCountBadgeText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 12,
  },
  checkedByPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surface,
    maxWidth: 160,
  },
  checkedByPillText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 11,
    lineHeight: 13,
    flexShrink: 1,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
  groupHeaderRow: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSoft,
    paddingBottom: 6,
    marginBottom: 2,
  },
  itemHeaderRow: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSoft,
    paddingBottom: 6,
  },
  itemTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 19,
    flex: 1,
  },
  checkedByInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  checkedByInlineMetaText: {
    flex: 1,
    color: appTheme.colors.textSubtle,
    fontSize: 11,
    lineHeight: 13,
  },
  checkedByInlineEditButton: {
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  checkedByInlineEditButtonText: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 12,
    textDecorationLine: "underline",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  quickFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
  },
  quickFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dailyDateNavRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  dailyDateNavButton: {
    width: 32,
    height: 32,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  dailyDateNavButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 18,
  },
  resultChoiceRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    justifyContent: "space-between",
    width: "100%",
  },
  choiceChip: {
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  monthChoiceChip: {
    minWidth: 58,
    alignItems: "center",
  },
  resultChoiceChip: {
    width: "24%",
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: "24%",
    minWidth: 0,
    minHeight: 34,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: appTheme.colors.borderStrong,
    paddingHorizontal: 4,
    paddingVertical: 5,
    overflow: "hidden",
  },
  resultChoiceChipCompliant: {
    backgroundColor: appTheme.colors.surfaceSuccessSoft,
    borderColor: appTheme.colors.borderSuccessSoft,
  },
  resultChoiceChipNonCompliant: {
    backgroundColor: appTheme.colors.surfaceDangerSoft,
    borderColor: appTheme.colors.borderDangerSoft,
  },
  resultChoiceChipNotApplicable: {
    backgroundColor: appTheme.colors.surfaceWarningSoft,
    borderColor: appTheme.colors.borderWarningSoft,
  },
  resultChoiceChipPending: {
    backgroundColor: appTheme.colors.surfaceNeutralSoft,
    borderColor: appTheme.colors.borderStrong,
  },
  choiceChipSelected: {
    backgroundColor: appTheme.colors.primary,
  },
  resultChoiceChipCompliantSelected: {
    backgroundColor: appTheme.colors.success,
    borderColor: appTheme.colors.success,
  },
  resultChoiceChipNonCompliantSelected: {
    backgroundColor: appTheme.colors.danger,
    borderColor: appTheme.colors.danger,
  },
  resultChoiceChipNotApplicableSelected: {
    backgroundColor: appTheme.colors.warning,
    borderColor: appTheme.colors.warning,
  },
  resultChoiceChipPendingSelected: {
    backgroundColor: appTheme.colors.primary,
    borderColor: appTheme.colors.primary,
  },
  choiceChipText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
  },
  resultChoiceChipText: {
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  choiceChipTextSelected: {
    color: appTheme.colors.onPrimary,
  },
  resultChoiceChipTextCompliant: {
    color: appTheme.colors.textSuccessStrong,
  },
  resultChoiceChipTextNonCompliant: {
    color: appTheme.colors.danger,
  },
  resultChoiceChipTextNotApplicable: {
    color: appTheme.colors.textWarningStrong,
  },
  resultChoiceChipTextPending: {
    color: appTheme.colors.textMuted,
  },
  resultChoiceChipTextCompliantSelected: {
    color: appTheme.colors.textOnDark,
  },
  resultChoiceChipTextNonCompliantSelected: {
    color: appTheme.colors.textOnDark,
  },
  resultChoiceChipTextNotApplicableSelected: {
    color: appTheme.colors.textOnDark,
  },
  resultChoiceChipTextPendingSelected: {
    color: appTheme.colors.onPrimary,
  },
  noteButton: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceInfoMuted,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  noteActionButton: {
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  noteButtonWarning: {
    backgroundColor: appTheme.colors.surfaceWarningMuted,
  },
  noteButtonDanger: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderDangerSoft,
    backgroundColor: appTheme.colors.surfaceDangerSoft,
  },
  noteButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
  },
  noteActionButtonText: {
    fontSize: 12,
    lineHeight: 15,
  },
  modalActionRow: {
    flexWrap: "nowrap",
  },
  modalActionButton: {
    flex: 1,
    minHeight: 44,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalActionButtonText: {
    fontSize: 13,
    lineHeight: 16,
  },
  secondaryButton: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintSoft,
    paddingHorizontal: 11,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  secondaryButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  dragHandleButton: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintAlt,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  toggleRow: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  toggleLabel: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 16,
    flex: 1,
  },
  toggleValue: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  input: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    color: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    fontSize: 14,
    fontFamily: appTheme.fonts.body,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  periodPickerSection: {
    gap: appTheme.spacing.xs,
  },
  reportSection: {
    marginTop: appTheme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.borderSoft,
    paddingTop: appTheme.spacing.xs,
    gap: appTheme.spacing.xs,
  },
  reportButtonRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  periodGroupCardTight: {
    marginHorizontal: -appTheme.spacing.xs,
  },
  monthYearPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
  monthYearValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 20,
    minWidth: 56,
    textAlign: "center",
  },
  metaLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  inlineWarningText: {
    color: appTheme.colors.textWarningStrong,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  inlineAttachmentPanel: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTint,
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: appTheme.spacing.xs,
    gap: appTheme.spacing.xs,
  },
  complianceAttachmentList: {
    gap: appTheme.spacing.xs,
  },
  complianceAttachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: appTheme.spacing.xs,
  },
  complianceAttachmentPreviewImage: {
    width: 44,
    height: 44,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
  },
  complianceAttachmentFileIcon: {
    width: 44,
    height: 44,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  complianceAttachmentFileIconText: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 12,
  },
  complianceAttachmentImageBadge: {
    width: 44,
    height: 44,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceSuccessMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  complianceAttachmentImageBadgeText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 12,
  },
  complianceAttachmentMeta: {
    flex: 1,
    gap: 2,
  },
  complianceAttachmentFileName: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  complianceAttachmentActionStack: {
    gap: 6,
    alignItems: "flex-end",
  },
  complianceAttachmentDownloadButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  complianceAttachmentDownloadButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
  },
  complianceAttachmentViewButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceSuccessAlt,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  complianceAttachmentViewButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
  },
  complianceAttachmentNoPreviewBadge: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  complianceAttachmentNoPreviewBadgeText: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 12,
  },
  complianceAttachmentRemoveButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  complianceAttachmentRemoveButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
  },
  complianceAttachmentActionRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  complianceAttachmentActionButton: {
    flex: 1,
    flexDirection: "row",
    minHeight: 38,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintSoft,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: appTheme.spacing.sm,
  },
  complianceAttachmentActionButtonDanger: {
    backgroundColor: appTheme.colors.danger,
  },
  complianceAttachmentActionButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  complianceAttachmentActionButtonTextDanger: {
    color: appTheme.colors.onPrimary,
  },
  attachmentPreviewBackdrop: {
    flex: 1,
    backgroundColor: appTheme.colors.previewBackdrop,
  },
  attachmentPreviewHeader: {
    paddingTop: 18,
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  attachmentPreviewTitle: {
    flex: 1,
    color: appTheme.colors.previewText,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  attachmentPreviewHeaderActions: {
    flexDirection: "row",
    gap: 8,
  },
  attachmentPreviewHeaderButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.previewBorder,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.previewSurface,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  attachmentPreviewHeaderButtonText: {
    color: appTheme.colors.previewText,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  attachmentPreviewEmptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  attachmentPreviewEmptyText: {
    color: appTheme.colors.previewTextMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
    lineHeight: 18,
    textAlign: "center",
  },
  attachmentPreviewModalImage: {
    flex: 1,
    width: "100%",
    backgroundColor: appTheme.colors.previewBackdrop,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: appTheme.colors.overlay,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.md,
  },
  modalCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.lg,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.xs,
    maxHeight: "88%",
  },
  dragActiveCard: {
    opacity: 0.94,
  },

  // --- Compliance Setup (config screen) ---
  cfgHeroCard: {
    gap: appTheme.spacing.sm,
  },
  cfgHeroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  cfgHeroIcon: {
    width: 42,
    height: 42,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  cfgHeroText: {
    flex: 1,
    gap: 2,
  },
  cfgHeroSubtitle: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 17,
  },
  cfgStatRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  cfgStatTile: {
    flex: 1,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTint,
    paddingVertical: appTheme.spacing.sm,
    alignItems: "center",
    gap: 2,
  },
  cfgStatValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 20,
    lineHeight: 24,
  },
  cfgStatLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  cfgSegment: {
    flexDirection: "row",
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radius.pill,
    padding: 3,
    gap: 2,
  },
  cfgSegmentItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: appTheme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  cfgSegmentItemActive: {
    backgroundColor: appTheme.colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cfgSegmentText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  cfgSegmentTextActive: {
    color: appTheme.colors.text,
  },
  cfgActionRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  cfgPrimaryAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.primary,
  },
  cfgPrimaryActionText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  cfgGhostAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  cfgGhostActionText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  cfgActionDisabled: {
    opacity: 0.45,
  },
  cfgHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2,
  },
  cfgHintText: {
    flex: 1,
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  cfgEmptyCard: {
    alignItems: "center",
    gap: appTheme.spacing.xs,
    paddingVertical: appTheme.spacing.md,
  },
  cfgEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceMuted,
    marginBottom: 2,
  },
  cfgEmptyTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 19,
    textAlign: "center",
  },
  cfgEmptySubtitle: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  cfgGroupCard: {
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surface,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: 8,
  },
  cfgGroupCardActive: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  cfgGroupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  cfgGroupIcon: {
    width: 32,
    height: 32,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  cfgGroupIconActive: {
    backgroundColor: appTheme.colors.surface,
  },
  cfgGroupHeadText: {
    flex: 1,
    gap: 1,
  },
  cfgGroupName: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 20,
  },
  cfgGroupMeta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  cfgGroupDesc: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  cfgGroupActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.borderSoft,
  },
  cfgIconChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  cfgIconChipText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  cfgIconChipTextBrand: {
    color: appTheme.colors.primary,
  },
  cfgDragChip: {
    marginLeft: "auto",
    width: 34,
    height: 30,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  cfgItemsCard: {
    gap: appTheme.spacing.sm,
  },
  cfgItemsEmpty: {
    alignItems: "center",
    gap: appTheme.spacing.xs,
    paddingVertical: appTheme.spacing.sm,
  },
  cfgItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 10,
  },
  cfgItemMain: {
    flex: 1,
    gap: 2,
  },
  cfgItemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  cfgRequiredPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  cfgRequiredPillText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 13,
  },
  cfgInactivePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceWarningSoft,
  },
  cfgInactivePillText: {
    color: appTheme.colors.warning,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 13,
  },
  cfgItemIconButton: {
    width: 36,
    height: 36,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surface,
  },
  cfgFormLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  cfgSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 10,
  },
  cfgSwitchText: {
    flex: 1,
    gap: 2,
  },
  cfgSwitchLabel: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  cfgSwitchHint: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  cfgModalActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    marginTop: 2,
  },
  cfgModalCancel: {
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: 12,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  cfgModalCancelText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  cfgModalSave: {
    flex: 1,
  },
});
