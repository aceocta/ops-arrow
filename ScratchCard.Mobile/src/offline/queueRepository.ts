import { getDatabase } from "../storage/sqlite";
import { OfflineShiftQueueItem } from "../types/models";
import { SyncStatus } from "../types/enums";

export async function enqueueOfflineShiftClose(
  shiftId: string,
  shopId: string,
  payload: unknown
): Promise<string> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = createLocalId();

  await db.runAsync(
    `INSERT INTO offline_shift_queue (id, shift_id, shop_id, payload_json, sync_status, created_on, updated_on)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, shiftId, shopId, JSON.stringify(payload), SyncStatus.PendingSync, now, now]
  );

  return id;
}

export async function listOfflineQueue(): Promise<OfflineShiftQueueItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<OfflineShiftQueueItem>(
    `SELECT
      id,
      shift_id as shiftId,
      shop_id as shopId,
      payload_json as payloadJson,
      sync_status as syncStatus,
      created_on as createdOn,
      updated_on as updatedOn,
      error
    FROM offline_shift_queue
    ORDER BY created_on ASC`
  );

  return rows;
}

export async function setQueueItemStatus(
  id: string,
  status: SyncStatus,
  error?: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE offline_shift_queue
     SET sync_status = ?, error = ?, updated_on = ?
     WHERE id = ?`,
    [status, error ?? null, new Date().toISOString(), id]
  );
}

export async function deleteQueueItem(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM offline_shift_queue WHERE id = ?`, [id]);
}

function createLocalId() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}
