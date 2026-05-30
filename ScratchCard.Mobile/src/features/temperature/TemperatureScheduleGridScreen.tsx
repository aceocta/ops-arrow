import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { getTemperatureScheduleGrid } from "../../api/temperatureLogsApi";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TemperatureScheduleCellState, TemperatureScheduleGridCell } from "../../types/models";
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
  Late: "⚠",
  Missed: "✗",
  Upcoming: "–",
};

function stateStyle(state: TemperatureScheduleCellState) {
  switch (state) {
    case "OnTime":
      return { wrap: styles.cellOnTime, text: styles.cellOnTimeText };
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

  // Default range = last 7 days.
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 6);

  const gridQuery = useQuery({
    queryKey: ["temperature-schedule-grid", shopId, isoDate(start), isoDate(today)],
    queryFn: () =>
      getTemperatureScheduleGrid({
        shopId: shopId as string,
        from: isoDate(start),
        to: isoDate(today),
      }),
    enabled: Boolean(shopId),
  });

  const grid = gridQuery.data;
  const cellsByKey = React.useMemo(() => {
    const map = new Map<string, TemperatureScheduleGridCell>();
    if (grid) {
      for (const cell of grid.cells) {
        map.set(`${cell.date}|${cell.unitId}|${cell.scheduleId}`, cell);
      }
    }
    return map;
  }, [grid]);

  if (gridQuery.isLoading) {
    return (
      <ScreenContainer>
        <Text style={ui.bodyText}>Loading…</Text>
      </ScreenContainer>
    );
  }

  if (!grid || grid.slots.length === 0) {
    return (
      <ScreenContainer>
        <View style={ui.card}>
          <Text style={ui.sectionTitle}>Schedule report</Text>
          <Text style={ui.bodyText}>
            No scheduled checks configured yet. Set them up in Temperature Schedule (Shop Configuration).
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const dates: string[] = [];
  for (let d = new Date(`${grid.from}T00:00:00`); d <= new Date(`${grid.to}T00:00:00`); d.setDate(d.getDate() + 1)) {
    dates.push(isoDate(d));
  }

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Summary</Text>
        <View style={styles.legendRow}>
          <Text style={[styles.legendItem, styles.cellOnTimeText]}>✓ On time · {grid.onTimeCount}</Text>
          <Text style={[styles.legendItem, styles.cellLateText]}>⚠ Late · {grid.lateCount}</Text>
          <Text style={[styles.legendItem, styles.cellMissedText]}>✗ Missed · {grid.missedCount}</Text>
        </View>
      </View>

      {grid.units.map((unit) => {
        const applicableSlots = grid.slots.filter((s) => !s.unitId || s.unitId === unit.unitId);
        if (applicableSlots.length === 0) return null;
        return (
          <View key={unit.unitId} style={ui.card}>
            <Text style={ui.sectionTitle}>{unit.unitName}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={styles.headerRow}>
                  <View style={[styles.dateCol, styles.headerCell]}>
                    <Text style={styles.headerText}>Day</Text>
                  </View>
                  {applicableSlots.map((slot) => (
                    <View key={slot.scheduleId} style={[styles.slotCol, styles.headerCell]}>
                      <Text style={styles.headerText} numberOfLines={1}>{slot.label}</Text>
                      <Text style={styles.headerSubText}>{shortTime(slot.expectedTime)}</Text>
                    </View>
                  ))}
                </View>
                {dates.map((date) => (
                  <View key={date} style={styles.bodyRow}>
                    <View style={[styles.dateCol, styles.bodyCell]}>
                      <Text style={styles.dateText}>{shortDate(date)}</Text>
                    </View>
                    {applicableSlots.map((slot) => {
                      const cell = cellsByKey.get(`${date}|${unit.unitId}|${slot.scheduleId}`);
                      const state = cell?.state ?? "Upcoming";
                      const styleSet = stateStyle(state);
                      return (
                        <View key={slot.scheduleId} style={[styles.slotCol, styles.bodyCell, styleSet.wrap]}>
                          <Text style={[styles.cellGlyph, styleSet.text]}>{STATE_GLYPH[state]}</Text>
                          {cell?.readingTime ? (
                            <Text style={styles.cellMeta} numberOfLines={1}>
                              {shortTime(cell.readingTime)}
                              {cell.temperatureCelsius != null ? ` · ${cell.temperatureCelsius.toFixed(1)}°` : ""}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        );
      })}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendItem: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 17 },
  headerRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: appTheme.colors.borderSoft },
  bodyRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: appTheme.colors.borderSoft },
  dateCol: { width: 96 },
  slotCol: { width: 88 },
  headerCell: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  bodyCell: {
    paddingHorizontal: 6,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  headerText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 15 },
  headerSubText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 11, lineHeight: 13 },
  dateText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 15, textAlign: "center" },
  cellOnTime: { backgroundColor: appTheme.colors.surfaceSuccessMuted },
  cellLate: { backgroundColor: appTheme.colors.surfaceWarningSoft },
  cellMissed: { backgroundColor: appTheme.colors.surfaceDangerSoft },
  cellUpcoming: { backgroundColor: appTheme.colors.surface },
  cellGlyph: { fontFamily: appTheme.fonts.bodyMedium, fontSize: 15, lineHeight: 18 },
  cellOnTimeText: { color: appTheme.colors.success },
  cellLateText: { color: appTheme.colors.warning },
  cellMissedText: { color: appTheme.colors.danger },
  cellUpcomingText: { color: appTheme.colors.textSubtle },
  cellMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 10, lineHeight: 12 },
});
