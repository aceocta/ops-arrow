import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getTemperatureDailyLog } from "../../api/temperatureLogsApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue, parseDateValue } from "../../components/DateTimeField";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function formatTemperature(value: number) {
  return `${value.toFixed(1)} C`;
}

function shiftDate(value: string, days: number) {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return value;
  }

  parsed.setDate(parsed.getDate() + days);
  return formatDateValue(parsed);
}

export function TemperatureLogsByDayScreen() {
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;
  const [selectedDate, setSelectedDate] = useState(formatDateValue(new Date()));

  const dailyLogQuery = useQuery({
    queryKey: ["temperature-daily-log-view", shopId, selectedDate],
    queryFn: () => getTemperatureDailyLog(shopId as string, selectedDate),
    enabled: Boolean(shopId) && selectedDate.length === 10,
  });

  const dailyUnitLogs = dailyLogQuery.data?.units ?? [];
  const totalReadings = useMemo(
    () => dailyUnitLogs.reduce((count, unitLog) => count + unitLog.readings.length, 0),
    [dailyUnitLogs]
  );
  const outOfRangeCount = useMemo(
    () =>
      dailyUnitLogs.reduce(
        (count, unitLog) => count + unitLog.readings.filter((reading) => reading.isOutOfRange).length,
        0
      ),
    [dailyUnitLogs]
  );

  return (
    <ScreenContainer>
      {/* <View style={styles.hero}>
        <Text style={styles.heroTitle}>Temperature Logs by Day</Text>
        <Text style={styles.heroSubtitle}>Shop: {activeShop?.shopName ?? "-"}</Text>
        <Text style={styles.heroNote}>Pick a date to view all unit readings, notes, and corrective actions.</Text>
      </View> */}

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Select Date</Text>
        <View style={styles.dateRow}>
          <Pressable
            style={styles.dayButton}
            onPress={() => setSelectedDate((current) => shiftDate(current, -1))}
            accessibilityRole="button"
          >
            <Text style={styles.dayButtonText}>Prev</Text>
          </Pressable>
          <DateTimeField style={{ flex: 1 }} mode="date" value={selectedDate} onChange={setSelectedDate} />
          <Pressable
            style={styles.dayButton}
            onPress={() => setSelectedDate((current) => shiftDate(current, 1))}
            accessibilityRole="button"
          >
            <Text style={styles.dayButtonText}>Next</Text>
          </Pressable>
        </View>
        <Text style={styles.meta}>
          {dailyLogQuery.isLoading
            ? "Loading logs..."
            : `${dailyUnitLogs.length} units | ${totalReadings} readings | ${outOfRangeCount} out of range`}
        </Text>
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Daily Logs</Text>
        {!dailyLogQuery.isLoading && dailyUnitLogs.length === 0 ? (
          <Text style={styles.meta}>No temperature logs found for this date.</Text>
        ) : null}

        {dailyUnitLogs.map((unitLog) => (
          <View key={unitLog.unit.id} style={styles.unitCard}>
            <View style={styles.unitHeader}>
              <View style={styles.unitIdentity}>
                <Text style={styles.unitName}>{unitLog.unit.unitName}</Text>
                <Text style={styles.meta}>
                  {unitLog.unit.equipmentType}
                  {unitLog.unit.location ? ` | ${unitLog.unit.location}` : ""}
                </Text>
              </View>
              <Text style={styles.range}>
                {formatTemperature(unitLog.unit.minTemperatureCelsius)} to {formatTemperature(unitLog.unit.maxTemperatureCelsius)}
              </Text>
            </View>

            {unitLog.readings.length === 0 ? (
              <Text style={styles.meta}>No readings for this unit.</Text>
            ) : (
              unitLog.readings.map((reading) => (
                <View key={reading.id} style={styles.readingRow}>
                  <View style={styles.readingTop}>
                    <Text style={styles.readingTime}>{reading.readingTime || "--:--"}</Text>
                    <Text style={styles.readingTemp}>{formatTemperature(Number(reading.temperatureCelsius))}</Text>
                    <StatusBadge
                      label={reading.isOutOfRange ? "Out of range" : "In range"}
                      tone={reading.isOutOfRange ? "danger" : "success"}
                    />
                  </View>
                  <Text style={styles.meta}>Initial: {reading.checkedByInitials || "-"}</Text>
                  {reading.actionTaken ? <Text style={styles.meta}>Action: {reading.actionTaken}</Text> : null}
                  {reading.notes ? <Text style={styles.meta}>Notes: {reading.notes}</Text> : null}
                </View>
              ))
            )}
          </View>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.primaryPressed,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.xs,
  },
  heroTitle: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.heading,
    fontSize: 20,
    lineHeight: 24,
  },
  heroSubtitle: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  heroNote: {
    color: appTheme.colors.textOnDark,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 17,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  dayButton: {
    minWidth: 58,
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  dayButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  unitCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
  },
  unitHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  unitIdentity: {
    flex: 1,
    gap: 2,
  },
  unitName: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  range: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "right",
  },
  readingRow: {
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.border,
    paddingTop: appTheme.spacing.xs,
    gap: 2,
  },
  readingTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  readingTime: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  readingTemp: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
    flex: 1,
    textAlign: "center",
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
});

