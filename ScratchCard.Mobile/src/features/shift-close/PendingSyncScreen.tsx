import React from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { StatusBadge } from "../../components/StatusBadge";
import { listOfflineQueue } from "../../offline/queueRepository";
import { syncPendingShiftCloseQueue } from "../../offline/syncService";

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
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.bold}>Shift: {item.shiftId}</Text>
            <Text>Status: {item.syncStatus}</Text>
            <Text>Created: {item.createdOn}</Text>
            {item.error ? <Text style={styles.error}>Error: {item.error}</Text> : null}
          </View>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "700", color: "#0B1E24" },
  card: {
    backgroundColor: "white",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E1E4",
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  bold: { fontWeight: "700" },
  error: { color: "#BA2D2D" },
});
