import NetInfo from "@react-native-community/netinfo";
import { syncOfflineShiftClose } from "../api/shiftsApi";
import { SyncStatus } from "../types/enums";
import {
  deleteQueueItem,
  listOfflineQueue,
  setQueueItemStatus,
} from "./queueRepository";

let syncing = false;

export async function syncPendingShiftCloseQueue() {
  if (syncing) {
    return;
  }

  syncing = true;
  try {
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      return;
    }

    const queue = await listOfflineQueue();
    for (const item of queue) {
      try {
        await setQueueItemStatus(item.id, SyncStatus.Syncing);
        const payload = JSON.parse(item.payloadJson);
        await syncOfflineShiftClose(payload);
        await deleteQueueItem(item.id);
      } catch (error) {
        const status = isConflict(error) ? SyncStatus.Conflict : SyncStatus.SyncFailed;
        await setQueueItemStatus(item.id, status, errorMessage(error));
      }
    }
  } finally {
    syncing = false;
  }
}

export function subscribeAutoSync() {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      void syncPendingShiftCloseQueue();
    }
  });
}

function isConflict(error: unknown) {
  const status = (error as any)?.response?.status;
  const code = (error as any)?.response?.data?.code;
  return status === 409 || code === "offline_sync_conflict";
}

function errorMessage(error: unknown) {
  return (error as any)?.response?.data?.message ?? "Sync failed";
}
