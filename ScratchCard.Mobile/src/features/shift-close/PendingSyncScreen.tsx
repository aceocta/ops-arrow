import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "../../components/EmptyState";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { StatusBadge } from "../../components/StatusBadge";
import { toastError, toastInfo, toastSuccess, toastWarning } from "../../components/toast";
import { listOfflineQueue } from "../../offline/queueRepository";
import { syncPendingShiftCloseQueue } from "../../offline/syncService";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { humanizeStatus } from "../../utils/statusLabels";

function formatQueuedTime(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("en-GB");
}

export function PendingSyncScreen() {
  const [isSyncing, setIsSyncing] = useState(false);
  const queueQuery = useQuery({
    queryKey: ["offline-queue"],
    queryFn: listOfflineQueue,
  });

  const items = queueQuery.data ?? [];

  async function onRetrySync() {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        toastError("You're offline. Reconnect to sync the queue.");
        return;
      }

      // Successfully-synced items are removed from the queue; anything left afterwards failed. Compare
      // the queue length before/after so we report what actually happened instead of a blanket success.
      const before = items.length;
      await syncPendingShiftCloseQueue();
      const refreshed = await queueQuery.refetch();
      const after = refreshed.data?.length ?? 0;
      const synced = Math.max(0, before - after);

      if (before === 0) {
        toastInfo("Nothing to sync.");
      } else if (after === 0) {
        toastSuccess(`Sync complete. ${synced} item${synced === 1 ? "" : "s"} synced.`);
      } else if (synced > 0) {
        toastWarning(`${synced} synced, ${after} still pending. Check the errors below.`);
      } else {
        toastError(`Couldn't sync ${after} item${after === 1 ? "" : "s"}. Check the errors below.`);
      }
    } finally {
      setIsSyncing(false);
    }
  }

  if (!queueQuery.isLoading && items.length === 0) {
    return (
      <ScreenContainer>
        <EmptyState
          icon="checkmark-done-outline"
          title="Everything is synced"
          message="There are no shift closes waiting to upload."
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StatusBadge label={`${items.length} queued`} tone="warning" />
      </View>

      <PrimaryButton label={isSyncing ? "Syncing…" : "Sync now"} onPress={onRetrySync} loading={isSyncing} />

      {/* Rendered inline (not a FlatList) so it scrolls with ScreenContainer's ScrollView — a nested
          vertical VirtualizedList warns and breaks windowing. The offline queue is small. */}
      <View style={styles.listContent}>
        {items.map((item) => (
          <View key={item.id} style={[ui.card, styles.card]}>
            <Text style={styles.bold}>Reference: {item.shiftId}</Text>
            <Text style={styles.meta}>Status: {humanizeStatus(item.syncStatus)}</Text>
            <Text style={styles.meta}>Queued: {formatQueuedTime(item.createdOn)}</Text>
            {item.error ? <Text style={styles.error}>Error: {item.error}</Text> : null}
          </View>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  listContent: {
    paddingTop: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
    gap: appTheme.spacing.sm,
  },
  card: {
    gap: 4,
  },
  bold: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  error: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
});
