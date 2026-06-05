import React from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RouteProp, useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { useAuth } from "../../auth/AuthContext";
import { getTemperatureScheduleGrid, listTemperatureReadings } from "../../api/temperatureLogsApi";
import { sendReportEmail } from "../../api/reportsApi";
import { DateTimeField, formatDateValue, parseDateValue } from "../../components/DateTimeField";
import { DateRangeQuickPicks } from "../../components/DateRangeQuickPicks";
import { LoadingState } from "../../components/LoadingState";
import { ReportActionButton } from "../../components/ReportActionButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { toastError } from "../../components/toast";
import { buildTemperatureRangeReportHtml } from "./temperatureReportUtils";
import {
  TemperatureReading,
  TemperatureScheduleCellState,
  TemperatureScheduleGrid,
  TemperatureScheduleGridCell,
} from "../../types/models";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shortDate(value: string) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function shortTime(value?: string) {
  return value ? value.slice(0, 5) : "";
}

const STATE_GLYPH: Record<TemperatureScheduleCellState, string> = {
  OnTime: "✓",
  Early: "«",
  Late: "⚠",
  Missed: "✗",
  Upcoming: "–",
};

function stateStyle(state: TemperatureScheduleCellState) {
  switch (state) {
    case "OnTime":
      return { wrap: styles.cellOnTime, text: styles.cellOnTimeText };
    case "Early":
      return { wrap: styles.cellEarly, text: styles.cellEarlyText };
    case "Late":
      return { wrap: styles.cellLate, text: styles.cellLateText };
    case "Missed":
      return { wrap: styles.cellMissed, text: styles.cellMissedText };
    default:
      return { wrap: styles.cellUpcoming, text: styles.cellUpcomingText };
  }
}

export function TemperatureScheduleGridScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const route = useRoute<RouteProp<MainStackParamList, "TemperatureScheduleGrid">>();

  // Date filter — opens on the range passed in (e.g. from the dashboard), else the last 7 days.
  const [fromDate, setFromDate] = React.useState(() => {
    if (route.params?.from) return route.params.from;
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return formatDateValue(d);
  });
  const [toDate, setToDate] = React.useState(() => route.params?.to ?? formatDateValue(new Date()));

  const rangeIsValid = React.useMemo(() => {
    const f = parseDateValue(fromDate);
    const t = parseDateValue(toDate);
    return Boolean(f && t && f.getTime() <= t.getTime());
  }, [fromDate, toDate]);

  const gridQuery = useQuery({
    queryKey: ["temperature-schedule-grid", shopId, fromDate, toDate],
    queryFn: () => getTemperatureScheduleGrid({ shopId: shopId as string, from: fromDate, to: toDate }),
    enabled: Boolean(shopId) && rangeIsValid,
  });
  const grid = gridQuery.data;

  const setToday = () => {
    const v = formatDateValue(new Date());
    setFromDate(v);
    setToDate(v);
  };
  const setLastDays = (days: number) => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - (days - 1));
    setFromDate(formatDateValue(from));
    setToDate(formatDateValue(to));
  };

  return (
    <ScreenContainer>
      <View style={[ui.card, styles.compactCard]}>
        <DateRangeQuickPicks from={fromDate} to={toDate} onSelect={(f, t) => { setFromDate(f); setToDate(t); }} style={{ marginBottom: 8 }} />
        <View style={styles.rangeRow}>
          <DateTimeField style={{ flex: 1 }} mode="date" value={fromDate} onChange={setFromDate} maximumDate={new Date()} />
          <DateTimeField style={{ flex: 1 }} mode="date" value={toDate} onChange={setToDate} maximumDate={new Date()} />
        </View>
        <View style={styles.quickRow}>
          <Pressable style={styles.quickBtn} onPress={setToday}>
            <Text style={styles.quickBtnText}>Today</Text>
          </Pressable>
          <Pressable style={styles.quickBtn} onPress={() => setLastDays(7)}>
            <Text style={styles.quickBtnText}>7 days</Text>
          </Pressable>
          <Pressable style={styles.quickBtn} onPress={() => setLastDays(30)}>
            <Text style={styles.quickBtnText}>30 days</Text>
          </Pressable>
        </View>
        {!rangeIsValid ? (
          <Text style={styles.warning}>From date must be on or before To date.</Text>
        ) : null}
      </View>

      {!rangeIsValid ? null : gridQuery.isLoading ? (
        <LoadingState />
      ) : !grid || grid.slots.length === 0 ? (
        <View style={ui.card}>
          <Text style={ui.bodyText}>
            No scheduled checks for this range. Set them up in Temperature Schedule (Shop Configuration).
          </Text>
        </View>
      ) : (
        <ScheduleGridReport grid={grid} />
      )}
    </ScreenContainer>
  );
}

type SelectedCell = {
  date: string;
  unitName: string;
  slotLabel: string;
  expectedTime: string;
  cell?: TemperatureScheduleGridCell;
  reading?: TemperatureReading;
};

function ScheduleGridReport({ grid }: { grid: TemperatureScheduleGrid }) {
  const { activeShopId, activeShop, profile } = useAuth();
  const [selected, setSelected] = React.useState<SelectedCell | null>(null);
  const [emailing, setEmailing] = React.useState(false);

  const cellsByKey = React.useMemo(() => {
    const map = new Map<string, TemperatureScheduleGridCell>();
    for (const cell of grid.cells) {
      map.set(`${cell.date}|${cell.unitId}|${cell.scheduleId}`, cell);
    }
    return map;
  }, [grid]);

  // Full reading rows for the visible range, so a tapped cell can show every detail
  // (min/max range, who checked it, action taken, notes…) the grid summary omits.
  const readingsQuery = useQuery({
    queryKey: ["temperature-readings-for-grid", activeShopId, grid.from, grid.to],
    queryFn: () => listTemperatureReadings(activeShopId as string, grid.from, grid.to),
    enabled: Boolean(activeShopId),
  });
  const readings = readingsQuery.data ?? [];
  const readingsById = React.useMemo(() => {
    const map = new Map<string, TemperatureReading>();
    for (const r of readings) map.set(r.id, r);
    return map;
  }, [readings]);

  // Print / share / email reuse the full readings report so the exported PDF carries every
  // detail (deviation, who checked it, action, notes), grouped by date & unit.
  const buildHtml = () =>
    buildTemperatureRangeReportHtml({
      shopName: activeShop?.shopName ?? "-",
      from: grid.from,
      to: grid.to,
      generatedOn: new Date().toISOString(),
      readings,
    });

  const printReport = async () => {
    try {
      await Print.printAsync({ html: buildHtml(), width: 792, height: 612, orientation: Print.Orientation.landscape });
    } catch (error: any) {
      toastError(error?.message ?? "Unable to open print dialog.");
    }
  };

  const shareReport = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html: buildHtml(), width: 792, height: 612 });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Share unavailable", "Sharing is not available on this device.");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Temperature Report ${grid.from} to ${grid.to}`,
        UTI: "com.adobe.pdf",
      });
    } catch (error: any) {
      toastError(error?.message ?? "Unable to generate or share PDF.");
    }
  };

  const emailReport = async () => {
    try {
      setEmailing(true);
      const { uri } = await Print.printToFileAsync({ html: buildHtml(), width: 792, height: 612 });
      const attachmentBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const outOfRange = readings.filter((r) => r.isOutOfRange).length;
      const inRange = readings.length - outOfRange;
      await sendReportEmail({
        recipientEmail: profile?.email,
        subject: `Temperature Report (${grid.from} to ${grid.to})`,
        body: `Please find attached the Temperature Report for ${grid.from} to ${grid.to}. In range: ${inRange}. Out of range: ${outOfRange}.`,
        isBodyHtml: false,
        attachmentFileName: `temperature-report-${grid.from}-to-${grid.to}.pdf`,
        attachmentBase64,
      });
      Alert.alert("Email sent", `Report has been sent to ${profile?.email ?? "your inbox"}.`);
    } catch (error: any) {
      toastError(error?.response?.data?.message ?? error?.message ?? "Unable to send report email.");
    } finally {
      setEmailing(false);
    }
  };

  const actionsDisabled = readingsQuery.isLoading || readings.length === 0;

  const dates: string[] = [];
  for (let d = new Date(`${grid.from}T00:00:00`); d <= new Date(`${grid.to}T00:00:00`); d.setDate(d.getDate() + 1)) {
    dates.push(isoDate(d));
  }

  // Distinct slot columns (e.g. AM / PM), de-duplicated by label + time so a schedule shared
  // across units shows as a single column. Ordered by time of day.
  const slotColumns: { label: string; expectedTime: string }[] = [];
  const seenSlot = new Set<string>();
  for (const s of [...grid.slots].sort((a, b) => a.expectedTime.localeCompare(b.expectedTime))) {
    const key = `${s.label}|${s.expectedTime}`;
    if (seenSlot.has(key)) continue;
    seenSlot.add(key);
    slotColumns.push({ label: s.label, expectedTime: s.expectedTime });
  }

  // Resolve the schedule that backs a given column for a given unit (handles per-unit schedules).
  const scheduleIdFor = (col: { label: string; expectedTime: string }, unitId: string) =>
    grid.slots.find(
      (s) => s.label === col.label && s.expectedTime === col.expectedTime && (!s.unitId || s.unitId === unitId),
    )?.scheduleId;

  const datesWidth = dates.length * slotColumns.length * SLOT_W;

  // Range indicator tallies — only readings that were actually taken count.
  let inRangeCount = 0;
  let outOfRangeCount = 0;
  for (const c of grid.cells) {
    if (c.temperatureCelsius == null) continue;
    if (c.isOutOfRange) outOfRangeCount += 1;
    else inRangeCount += 1;
  }

  return (
    <>
      <View style={[ui.card, styles.compactCard]}>
        <View style={styles.legendRow}>
          <Text style={[styles.legendItem, styles.cellOnTimeText]}>✓ {grid.onTimeCount}</Text>
          <Text style={[styles.legendItem, styles.cellEarlyText]}>« {grid.earlyCount}</Text>
          <Text style={[styles.legendItem, styles.cellLateText]}>⚠ {grid.lateCount}</Text>
          <Text style={[styles.legendItem, styles.cellMissedText]}>✗ {grid.missedCount}</Text>
          <Text style={[styles.legendItem, styles.inRangeText]}>● In {inRangeCount}</Text>
          <Text style={[styles.legendItem, styles.outOfRangeText]}>▲ Out {outOfRangeCount}</Text>
        </View>
        <View style={styles.actionRow}>
          <ReportActionButton icon="print-outline" label="Print" onPress={() => void printReport()} disabled={actionsDisabled} />
          <ReportActionButton
            icon="mail-outline"
            label={emailing ? "Sending…" : "Email"}
            onPress={() => void emailReport()}
            disabled={actionsDisabled || emailing}
          />
          <ReportActionButton icon="share-social-outline" label="Share" onPress={() => void shareReport()} disabled={actionsDisabled} />
        </View>
      </View>

      <View style={styles.detailSection}>
        <Text style={ui.sectionTitle}>Detail · {shortDate(grid.from)} – {shortDate(grid.to)}</Text>
        <View style={styles.tableRow}>
          {/* Fixed unit column (units as rows). */}
          <View style={styles.unitCol}>
            <View style={[styles.unitCell, styles.cornerCell]}>
              <Text style={styles.headerText}>Unit</Text>
            </View>
            {grid.units.map((unit) => (
              <View key={unit.unitId} style={[styles.unitCell, styles.unitBodyCell]}>
                <Text style={styles.unitText} numberOfLines={2}>{unit.displayOrder ? `${unit.displayOrder}. ` : ""}{unit.unitName}</Text>
              </View>
            ))}
          </View>

          {/* Scrollable dates × slots grid. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={{ width: datesWidth }}>
              {/* Header line 1: dates. */}
              <View style={styles.headerLine}>
                {dates.map((date) => (
                  <View key={date} style={[styles.dateHeaderCell, { width: slotColumns.length * SLOT_W }]}>
                    <Text style={styles.headerText} numberOfLines={1}>{shortDate(date)}</Text>
                  </View>
                ))}
              </View>
              {/* Header line 2: AM / PM slots under each date. */}
              <View style={styles.headerLine}>
                {dates.map((date) =>
                  slotColumns.map((col, i) => (
                    <View key={`${date}|${col.label}|${i}`} style={[styles.slotHeaderCell, i === 0 && styles.dateDivider]}>
                      <Text style={styles.headerText} numberOfLines={1}>{col.label}</Text>
                      <Text style={styles.headerSubText}>{shortTime(col.expectedTime)}</Text>
                    </View>
                  )),
                )}
              </View>
              {/* Body: one row per unit. */}
              {grid.units.map((unit) => (
                <View key={unit.unitId} style={styles.gridBodyRow}>
                  {dates.map((date) =>
                    slotColumns.map((col, i) => {
                      const scheduleId = scheduleIdFor(col, unit.unitId);
                      if (!scheduleId) {
                        return (
                          <View key={`${date}|${col.label}|${i}`} style={[styles.gridCell, i === 0 && styles.dateDivider]} />
                        );
                      }
                      const cell = cellsByKey.get(`${date}|${unit.unitId}|${scheduleId}`);
                      const state = cell?.state ?? "Upcoming";
                      const styleSet = stateStyle(state);
                      return (
                        <Pressable
                          key={`${date}|${col.label}|${i}`}
                          style={[styles.gridCell, i === 0 && styles.dateDivider, styleSet.wrap]}
                          onPress={() =>
                            setSelected({
                              date,
                              unitName: unit.unitName,
                              slotLabel: col.label,
                              expectedTime: col.expectedTime,
                              cell,
                              reading: cell?.readingId ? readingsById.get(cell.readingId) : undefined,
                            })
                          }
                        >
                          <Text style={[styles.cellGlyph, styleSet.text]}>{STATE_GLYPH[state]}</Text>
                          {cell?.readingTime ? (
                            <Text style={styles.cellMeta} numberOfLines={1}>{shortTime(cell.readingTime)}</Text>
                          ) : null}
                          {cell?.temperatureCelsius != null ? (
                            <Text
                              style={[styles.cellTemp, cell.isOutOfRange ? styles.outOfRangeText : styles.inRangeText]}
                              numberOfLines={1}
                            >
                              {cell.isOutOfRange ? "▲ " : "● "}
                              {cell.temperatureCelsius.toFixed(1)}°
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    }),
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>

      <CellDetailModal selected={selected} onClose={() => setSelected(null)} />
    </>
  );
}

const STATE_LABEL: Record<TemperatureScheduleCellState, string> = {
  OnTime: "On time",
  Early: "Early",
  Late: "Late",
  Missed: "Missed",
  Upcoming: "Upcoming",
};

function fullDate(value: string) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function DetailRow({ label, value, danger }: { label: string; value?: string | null; danger?: boolean }) {
  if (value == null || value === "") return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, danger ? styles.outOfRangeText : null]}>{value}</Text>
    </View>
  );
}

// How far a reading falls outside its allowed band (null when within range).
function rangeDeviation(reading: TemperatureReading) {
  if (reading.temperatureCelsius > reading.maxTemperatureCelsius) {
    return { dir: "above max" as const, amount: reading.temperatureCelsius - reading.maxTemperatureCelsius };
  }
  if (reading.temperatureCelsius < reading.minTemperatureCelsius) {
    return { dir: "below min" as const, amount: reading.minTemperatureCelsius - reading.temperatureCelsius };
  }
  return null;
}

function CellDetailModal({ selected, onClose }: { selected: SelectedCell | null; onClose: () => void }) {
  const reading = selected?.reading;
  const cell = selected?.cell;
  const state = cell?.state ?? "Upcoming";
  const styleSet = stateStyle(state);

  return (
    <Modal visible={selected != null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        {/* Inner press is swallowed so tapping the card doesn't dismiss. */}
        <Pressable style={styles.modalCard} onPress={() => {}}>
          {selected ? (
            <>
              <Text style={styles.modalTitle}>{selected.unitName}</Text>
              <Text style={styles.modalSubtitle}>
                {fullDate(selected.date)} · {selected.slotLabel} ({shortTime(selected.expectedTime)})
              </Text>

              <View style={[styles.statusPill, styleSet.wrap]}>
                <Text style={[styles.statusPillText, styleSet.text]}>
                  {STATE_GLYPH[state]} {STATE_LABEL[state]}
                </Text>
              </View>

              <ScrollView style={styles.modalBody}>
                {reading ? (
                  <>
                    <DetailRow label="Reading time" value={shortTime(reading.readingTime)} />
                    <DetailRow label="Temperature" value={`${reading.temperatureCelsius.toFixed(1)} °C`} />
                    <DetailRow
                      label="Allowed range"
                      value={`${reading.minTemperatureCelsius.toFixed(1)} – ${reading.maxTemperatureCelsius.toFixed(1)} °C`}
                    />
                    <DetailRow
                      label="Status"
                      value={reading.isOutOfRange ? "Out of range" : "In range"}
                      danger={reading.isOutOfRange}
                    />
                    {(() => {
                      const dev = rangeDeviation(reading);
                      return dev ? (
                        <DetailRow label="Out by" value={`${dev.amount.toFixed(1)} °C ${dev.dir}`} danger />
                      ) : null;
                    })()}
                    <DetailRow label="Equipment" value={reading.equipmentType} />
                    <DetailRow label="Checked by" value={reading.recordedByName ?? reading.checkedByInitials} />
                    <DetailRow
                      label="Recorded on"
                      value={reading.recordedOn ? new Date(reading.recordedOn).toLocaleString() : undefined}
                    />
                    <DetailRow label="On schedule" value={reading.isLateForSchedule ? "Late" : "On time"} />
                    <DetailRow label="Action taken" value={reading.actionTaken} />
                    <DetailRow label="Notes" value={reading.notes} />
                  </>
                ) : cell?.readingTime ? (
                  <>
                    <DetailRow label="Reading time" value={shortTime(cell.readingTime)} />
                    {cell.temperatureCelsius != null ? (
                      <DetailRow label="Temperature" value={`${cell.temperatureCelsius.toFixed(1)} °C`} />
                    ) : null}
                    <DetailRow label="Status" value={cell.isOutOfRange ? "Out of range" : "In range"} />
                    <Text style={styles.modalNote}>Loading full details…</Text>
                  </>
                ) : (
                  <Text style={styles.modalNote}>
                    No reading was recorded for this scheduled check{state === "Missed" ? " — it was missed." : "."}
                  </Text>
                )}
              </ScrollView>

              <Pressable style={styles.modalClose} onPress={onClose}>
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const SLOT_W = 70;
const UNIT_W = 104;
const ROW_H = 56;
const DATE_HEADER_H = 24;
const SLOT_HEADER_H = 30;

const styles = StyleSheet.create({
  compactCard: { padding: appTheme.spacing.sm, gap: appTheme.spacing.xs },
  rangeRow: { flexDirection: "row", gap: appTheme.spacing.xs },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: appTheme.spacing.xs },
  quickBtn: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  quickBtnText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 15 },
  warning: { color: appTheme.colors.warning, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 16, marginTop: 6 },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  actionRow: { flexDirection: "row", gap: appTheme.spacing.xs },
  legendItem: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 17 },
  detailSection: { gap: 4, marginTop: appTheme.spacing.sm },
  // Framed like the temperature-log scheduled-check table: thin border + rounded corners, clipping
  // the inner hairline cell borders so it reads as a clean grid.
  tableRow: {
    flexDirection: "row",
    marginTop: 8,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    borderRadius: appTheme.radius.sm,
    overflow: "hidden",
    backgroundColor: appTheme.colors.surface,
  },
  // Fixed left column listing the units (one per row).
  unitCol: { width: UNIT_W, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: appTheme.colors.borderSoft },
  unitCell: {
    width: UNIT_W,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 14,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appTheme.colors.borderSoft,
  },
  cornerCell: {
    height: DATE_HEADER_H + SLOT_HEADER_H,
    backgroundColor: appTheme.colors.surfaceMuted,
    justifyContent: "center",
  },
  unitBodyCell: { height: ROW_H },
  unitText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 15 },
  // Two-line header: dates on top, AM/PM slots beneath.
  headerLine: { flexDirection: "row" },
  dateHeaderCell: {
    height: DATE_HEADER_H,
    paddingHorizontal: 4,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appTheme.colors.borderSoft,
  },
  slotHeaderCell: {
    width: SLOT_W,
    height: SLOT_HEADER_H,
    paddingHorizontal: 4,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appTheme.colors.borderSoft,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: appTheme.colors.borderSoft,
  },
  gridBodyRow: { flexDirection: "row", height: ROW_H },
  gridCell: {
    width: SLOT_W,
    height: ROW_H,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appTheme.colors.borderSoft,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: appTheme.colors.borderSoft,
  },
  // Vertical separator between consecutive dates (drawn on the first slot of each date).
  dateDivider: { borderLeftWidth: 1, borderLeftColor: appTheme.colors.borderSoft },
  headerText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 15 },
  headerSubText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 11, lineHeight: 13 },
  cellOnTime: { backgroundColor: appTheme.colors.surfaceSuccessMuted },
  cellEarly: { backgroundColor: appTheme.colors.surfaceWarningSoft },
  cellLate: { backgroundColor: appTheme.colors.surfaceWarningSoft },
  cellMissed: { backgroundColor: appTheme.colors.surfaceDangerSoft },
  cellUpcoming: { backgroundColor: appTheme.colors.surface },
  cellGlyph: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 15, lineHeight: 18 },
  cellOnTimeText: { color: appTheme.colors.success },
  cellEarlyText: { color: appTheme.colors.warning },
  cellLateText: { color: appTheme.colors.warning },
  cellMissedText: { color: appTheme.colors.danger },
  cellUpcomingText: { color: appTheme.colors.textSubtle },
  cellMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 10, lineHeight: 12 },
  cellTemp: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, lineHeight: 13 },
  inRangeText: { color: appTheme.colors.success },
  outOfRangeText: { color: appTheme.colors.danger },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: appTheme.spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.md,
    padding: appTheme.spacing.lg,
    gap: 6,
  },
  modalTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 18, lineHeight: 23 },
  modalSubtitle: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  statusPillText: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 17 },
  modalBody: { maxHeight: 360, marginTop: 8 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSoft,
  },
  detailLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
  detailValue: {
    flex: 1,
    textAlign: "right",
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  modalNote: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18, paddingVertical: 8 },
  modalClose: {
    marginTop: 12,
    alignSelf: "flex-end",
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  modalCloseText: { color: appTheme.colors.surface, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
});
