import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { getBusinessDay } from "../../api/businessDaysApi";
import { getShift, getShiftSales } from "../../api/shiftsApi";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { ShiftStatus } from "../../types/enums";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<MainStackParamList, "ShiftDetails">;

function getShiftTone(status?: ShiftStatus): "neutral" | "warning" | "danger" | "success" {
  if (!status) return "neutral";
  if (status === ShiftStatus.Open) return "success";
  if (status === ShiftStatus.Reopened) return "warning";
  if (status === ShiftStatus.Closed || status === ShiftStatus.Approved) return "neutral";
  return "neutral";
}

function getBusinessDayTone(status?: string): "neutral" | "warning" | "danger" | "success" {
  if (!status) return "neutral";
  if (status === "Closed") return "success";
  if (status === "ReadyToClose") return "warning";
  if (status === "Reopened") return "danger";
  return "neutral";
}

function formatDuration(startTime?: string, endTime?: string) {
  if (!startTime) return "-";
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "-";
  }

  const elapsedMinutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

function formatCurrency(value: number) {
  return `\u00A3 ${value.toFixed(2)}`;
}

export function ShiftDetailsScreen({ route, navigation }: Props) {
  const { shiftId, shopId: routeShopId } = route.params;

  const shiftQuery = useQuery({
    queryKey: ["shift", shiftId],
    queryFn: () => getShift(shiftId),
  });

  const businessDayQuery = useQuery({
    queryKey: ["business-day", shiftQuery.data?.businessDayId],
    queryFn: () => getBusinessDay(shiftQuery.data?.businessDayId as string),
    enabled: Boolean(shiftQuery.data?.businessDayId),
  });

  const salesQuery = useQuery({
    queryKey: ["shift-sales", shiftId],
    queryFn: () => getShiftSales(shiftId),
  });

  const entries = salesQuery.data ?? [];
  const totals = useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        acc.totalSoldQuantity += Number(entry.soldQuantity ?? 0);
        acc.totalSalesAmount += Number(entry.salesAmount ?? 0);
        acc.totalRemainingTickets += Number(entry.remainingTickets ?? 0);
        if (entry.isFlaggedForReview) {
          acc.flaggedCount += 1;
        }
        return acc;
      },
      { totalSoldQuantity: 0, totalSalesAmount: 0, totalRemainingTickets: 0, flaggedCount: 0 },
    );
  }, [entries]);

  const shift = shiftQuery.data;
  const businessDay = businessDayQuery.data;
  const canCloseShift = shift?.status === ShiftStatus.Open || shift?.status === ShiftStatus.Reopened;
  const closeShiftShopId = shift?.shopId ?? routeShopId;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.pageContent}>
        <View style={[ui.card, styles.summaryCard]}>
          <View style={styles.headerRow}>
            <View style={styles.headingBlock}>
              <Text style={styles.headerEyebrow}>Shift Details</Text>
              <Text style={styles.shiftName}>{shift?.shiftName ?? "Shift"}</Text>
            </View>
            <StatusBadge label={shift?.status ?? "-"} tone={getShiftTone(shift?.status)} />
          </View>
          <View style={styles.badgeRow}>
            <Text style={styles.businessDate}>{businessDay?.businessDate ?? "-"}</Text>
            {businessDay?.status ? (
              <StatusBadge label={`Day ${businessDay.status}`} tone={getBusinessDayTone(businessDay.status)} />
            ) : null}
          </View>
          <View style={styles.infoGrid}>
            <View style={styles.infoTile}>
              <Text style={styles.infoLabel}>Start</Text>
              <Text style={styles.infoValue}>{shift?.startTime ? new Date(shift.startTime).toLocaleString() : "-"}</Text>
            </View>
            <View style={styles.infoTile}>
              <Text style={styles.infoLabel}>End</Text>
              <Text style={styles.infoValue}>{shift?.endTime ? new Date(shift.endTime).toLocaleString() : "Open"}</Text>
            </View>
            <View style={styles.infoTile}>
              <Text style={styles.infoLabel}>Duration</Text>
              <Text style={styles.infoValue}>{formatDuration(shift?.startTime, shift?.endTime)}</Text>
            </View>
            <View style={styles.infoTile}>
              <Text style={styles.infoLabel}>Sync</Text>
              <Text style={styles.infoValue}>{shift?.syncStatus ?? "-"}</Text>
            </View>
          </View>
        </View>

        <View style={[ui.card, styles.summaryCard]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Shift Summary</Text>
            {totals.flaggedCount > 0 ? (
              <StatusBadge label={`${totals.flaggedCount} flagged`} tone="warning" />
            ) : null}
          </View>
          <View style={styles.kpiGrid}>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Entries</Text>
              <Text style={styles.kpiValue}>{entries.length}</Text>
            </View>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Sold Qty</Text>
              <Text style={styles.kpiValue}>{totals.totalSoldQuantity}</Text>
            </View>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Sales</Text>
              <Text style={styles.kpiValue}>{formatCurrency(totals.totalSalesAmount)}</Text>
            </View>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Remaining</Text>
              <Text style={styles.kpiValue}>{totals.totalRemainingTickets}</Text>
            </View>
          </View>
          {salesQuery.isFetching ? <Text style={styles.meta}>Loading...</Text> : null}
        </View>

        <View style={[ui.card, styles.summaryCard]}>
          <Text style={styles.sectionTitle}>Sales Entries</Text>
          {!salesQuery.isFetching && entries.length === 0 ? (
            <Text style={styles.meta}>No entries for this shift.</Text>
          ) : null}
          {entries.map((entry) => (
            <View key={entry.id} style={[styles.entryCard, entry.isFlaggedForReview ? styles.entryCardFlagged : null]}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryTitle}>Pack {entry.packNumber}</Text>
                <StatusBadge label={entry.entryMethod} tone={entry.isFlaggedForReview ? "warning" : "neutral"} />
              </View>
              <View style={styles.entryStatsGrid}>
                <View style={styles.entryStatTile}>
                  <Text style={styles.entryPairLabel}>Opening</Text>
                  <Text style={styles.entryPairValue}>{entry.openingSerialNumber}</Text>
                </View>
                <View style={styles.entryStatTile}>
                  <Text style={styles.entryPairLabel}>Closing</Text>
                  <Text style={styles.entryPairValue}>{entry.closingSerialNumber}</Text>
                </View>
                <View style={styles.entryStatTile}>
                  <Text style={styles.entryPairLabel}>Sold Qty</Text>
                  <Text style={styles.entryPairValue}>{entry.soldQuantity}</Text>
                </View>
                <View style={styles.entryStatTile}>
                  <Text style={styles.entryPairLabel}>Sales</Text>
                  <Text style={styles.entryPairValue}>{formatCurrency(Number(entry.salesAmount))}</Text>
                </View>
                <View style={styles.entryStatTile}>
                  <Text style={styles.entryPairLabel}>Ticket Price</Text>
                  <Text style={styles.entryPairValue}>{formatCurrency(Number(entry.ticketPrice))}</Text>
                </View>
                <View style={styles.entryStatTile}>
                  <Text style={styles.entryPairLabel}>Remaining</Text>
                  <Text style={styles.entryPairValue}>{entry.remainingTickets}</Text>
                </View>
              </View>
              {entry.originalScannedSerialNumber ? (
                <Text style={styles.meta}>Scanned: {entry.originalScannedSerialNumber}</Text>
              ) : null}
            </View>
          ))}
        </View>

        <View style={[ui.card, styles.summaryCard]}>
          <View style={styles.actionHeader}>
            <Text style={styles.sectionTitle}>Actions</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={salesQuery.isFetching ? "Refreshing sales entries" : "Refresh shift details"}
              style={[styles.iconButton, salesQuery.isFetching ? styles.iconButtonDisabled : null]}
              onPress={() => {
                void shiftQuery.refetch();
                void businessDayQuery.refetch();
                void salesQuery.refetch();
              }}
              disabled={salesQuery.isFetching}
            >
              <Text style={styles.iconGlyph}>{salesQuery.isFetching ? "*" : "\u21BB"}</Text>
            </Pressable>
          </View>
          <Pressable
            style={[styles.actionButton, (!canCloseShift || !closeShiftShopId) ? styles.actionButtonDisabled : null]}
            onPress={() => navigation.navigate("ShiftClose", { shiftId, shopId: closeShiftShopId })}
            disabled={!canCloseShift || !closeShiftShopId}
          >
            <Text style={styles.actionButtonText}>Close Shift</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
const styles = StyleSheet.create({
  pageContent: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
  },
  summaryCard: {
    gap: appTheme.spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: appTheme.spacing.sm,
  },
  headingBlock: {
    flex: 1,
    gap: 2,
  },
  headerEyebrow: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  shiftName: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 22,
    lineHeight: 27,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
  businessDate: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  infoTile: {
    width: "48.8%",
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#F4F8FF",
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 2,
  },
  infoLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  infoValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 18,
    lineHeight: 23,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  kpiTile: {
    width: "48.8%",
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#EEF3FB",
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: 3,
  },
  kpiLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  kpiValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 16,
    lineHeight: 20,
  },
  actionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  actionButton: {
    borderWidth: 0,
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F2FA",
  },
  iconButtonDisabled: {
    opacity: 0.55,
  },
  iconGlyph: {
    color: appTheme.colors.primary,
    fontSize: 18,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  entryCard: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#F6F9FF",
    padding: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
  },
  entryCardFlagged: {
    backgroundColor: "#FFF4E9",
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  entryTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 1,
  },
  entryStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  entryStatTile: {
    width: "48.8%",
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 2,
  },
  entryPairLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  entryPairValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
});
