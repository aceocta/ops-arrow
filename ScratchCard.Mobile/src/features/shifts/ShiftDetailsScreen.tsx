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
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <View style={styles.headerRow}>
            <Text style={styles.shiftName}>{shift?.shiftName ?? "Shift Details"}</Text>
          <Text style={styles.meta}>{businessDay?.businessDate ?? "-"}</Text>

            <StatusBadge label={shift?.status ?? "-"} tone={getShiftTone(shift?.status)} />
          </View>
          {/* <Text style={styles.meta}>Shift ID: {shiftId}</Text> */}
          {/* <Text style={styles.meta}>Business Date: {businessDay?.businessDate ?? "-"}</Text> */}
          {/* {businessDay?.status ? (
            <View style={styles.statusRow}>
              <Text style={styles.meta}>Business Day Status</Text>
              <StatusBadge label={businessDay.status} tone={getBusinessDayTone(businessDay.status)} />
            </View>
          ) : null} */}
          <Text style={styles.meta}>Start: {shift?.startTime ? new Date(shift.startTime).toLocaleString() : "-"}</Text>
          <Text style={styles.meta}>End: {shift?.endTime ? new Date(shift.endTime).toLocaleString() : "Open"}</Text>
          {/* <Text style={styles.meta}>Duration: {formatDuration(shift?.startTime, shift?.endTime)}</Text>
          <Text style={styles.meta}>Sync Status: {shift?.syncStatus ?? "-"}</Text>
          {shiftQuery.isFetching ? <Text style={styles.meta}>Loading shift details...</Text> : null} */}
        </View>

        <View style={ui.card}>
          <Text style={styles.sectionTitle}>Shift Summary</Text>
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
              <Text style={styles.kpiValue}>£ {totals.totalSalesAmount.toFixed(2)}</Text>
            </View>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Remaining</Text>
              <Text style={styles.kpiValue}>{totals.totalRemainingTickets}</Text>
            </View>
          </View>
          {/* <Text style={styles.meta}>Flagged for Review: {totals.flaggedCount}</Text> */}
          {salesQuery.isFetching ? <Text style={styles.meta}>Loading shift sales entries...</Text> : null}
        </View>

           <View style={ui.card}>
          <Text style={styles.sectionTitle}>Sales Entries</Text>
          {!salesQuery.isFetching && entries.length === 0 ? (
            <Text style={styles.meta}>No sales entries found for this shift yet.</Text>
          ) : null}
          {entries.map((entry) => (
            <View key={entry.id} style={[styles.entryCard, entry.isFlaggedForReview ? styles.entryCardFlagged : null]}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryTitle}>Pack {entry.packNumber}</Text>
                <StatusBadge label={entry.entryMethod} tone={entry.isFlaggedForReview ? "warning" : "neutral"} />
              </View>
              <View style={styles.entryPairRow}>
                <View style={styles.entryPairItem}>
                  <Text style={styles.entryPairLabel}>Opening</Text>
                  <Text style={styles.entryPairValue}>{entry.openingSerialNumber}</Text>
                </View>
                <View style={styles.entryPairItem}>
                  <Text style={styles.entryPairLabel}>Closing</Text>
                  <Text style={styles.entryPairValue}>{entry.closingSerialNumber}</Text>
                </View>
              </View>
              <View style={styles.entryPairRow}>
                <View style={styles.entryPairItem}>
                  <Text style={styles.entryPairLabel}>Sold Qty</Text>
                  <Text style={styles.entryPairValue}>{entry.soldQuantity}</Text>
                </View>
                <View style={styles.entryPairItem}>
                  <Text style={styles.entryPairLabel}>Sales Amount</Text>
                  <Text style={styles.entryPairValue}>£ {Number(entry.salesAmount).toFixed(2)}</Text>
                </View>
              </View>
              <View style={styles.entryPairRow}>
                <View style={styles.entryPairItem}>
                  <Text style={styles.entryPairLabel}>Ticket Price</Text>
                  <Text style={styles.entryPairValue}>£ {Number(entry.ticketPrice).toFixed(2)}</Text>
                </View>
                <View style={styles.entryPairItem}>
                  <Text style={styles.entryPairLabel}>Remaining</Text>
                  <Text style={styles.entryPairValue}>{entry.remainingTickets}</Text>
                </View>
              </View>
              {entry.originalScannedSerialNumber ? <Text style={styles.meta}>Scanned: {entry.originalScannedSerialNumber}</Text> : null}
            </View>
          ))}
        </View>

        <View style={ui.card}>
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
          {/* {!canCloseShift ? <Text style={styles.meta}>Close Shift is available only when shift is Open or Reopened.</Text> : null} */}
          {/* <Pressable
            style={[styles.actionButton, styles.actionButtonNeutral]}
            onPress={() => navigation.navigate("ShiftReconciliation", { shiftId })}
          >
            <Text style={styles.actionButtonTextNeutral}>Shift Reconciliation</Text>
          </Pressable> */}
        </View>

     
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  shiftName: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 20,
    lineHeight: 24,
    flexShrink: 1,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 17,
    lineHeight: 22,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  kpiTile: {
    width: "48.5%",
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 2,
  },
  kpiLabel: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  kpiValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  actionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  actionButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.primaryPressed,
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.primary,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  actionButtonNeutral: {
    borderColor: appTheme.colors.borderStrong,
    backgroundColor: appTheme.colors.surfaceMuted,
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
  actionButtonTextNeutral: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceMuted,
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
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
    gap: 8,
  },
  entryCardFlagged: {
    borderColor: appTheme.colors.warning,
    backgroundColor: "#FFF6EA",
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
  entryPairRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: appTheme.spacing.sm,
  },
  entryPairItem: {
    flex: 1,
    gap: 2,
  },
  entryPairLabel: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  entryPairValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
});
