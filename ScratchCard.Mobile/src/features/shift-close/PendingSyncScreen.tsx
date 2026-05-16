import React from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { StatusBadge } from "../../components/StatusBadge";
import { listOfflineQueue } from "../../offline/queueRepository";
import { syncPendingShiftCloseQueue } from "../../offline/syncService";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

export function PendingSyncScreen() {
  const queueQuery = useQuery({
    queryKey: ["offline-queue"],
    queryFn: listOfflineQueue,
  });

  async function onRetrySync() {
    await syncPendingShiftCloseQueue();
    await queueQuery.refetch();
    Alert.alert("Sync complete", "Pending queue processed.");
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StatusBadge label={`${queueQuery.data?.length ?? 0} queued`} tone="warning" />
      </View>

      <PrimaryButton label="Retry Sync" onPress={onRetrySync} />

      <FlatList
        data={queueQuery.data ?? []}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[ui.card, styles.card]}>
            <Text style={styles.bold}>Shift: {item.shiftId}</Text>
            <Text style={styles.meta}>Status: {item.syncStatus}</Text>
            <Text style={styles.meta}>Created: {item.createdOn}</Text>
            {item.error ? <Text style={styles.error}>Error: {item.error}</Text> : null}
          </View>
        )}
      />
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
