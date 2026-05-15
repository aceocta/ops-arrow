import { getDatabase } from "../storage/sqlite";
import { OfflineChecklistQueueItem } from "../types/models";
import { SyncStatus } from "../types/enums";

export async function enqueueOfflineChecklistCompletion(payload: {
  shopId: string;
  businessDate: string;
  shiftId?: string;
  checklistTaskId: string;
  isCompleted: boolean;
  notes?: string;
}): Promise<string> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = createLocalId();

  await db.runAsync(
    `INSERT INTO offline_checklist_queue (
      id,
      shop_id,
      business_date,
      shift_id,
      checklist_task_id,
      payload_json,
      sync_status,
      error,
      created_on,
      updated_on
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      payload.shopId,
      payload.businessDate,
      payload.shiftId ?? null,
      payload.checklistTaskId,
      JSON.stringify(payload),
      SyncStatus.PendingSync,
      null,
      now,
      now,
    ]
  );

  return id;
}

export async function listOfflineChecklistQueue(): Promise<OfflineChecklistQueueItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<OfflineChecklistQueueItem>(
    `SELECT
      id,
      shop_id as shopId,
      business_date as businessDate,
      shift_id as shiftId,
      checklist_task_id as checklistTaskId,
      payload_json as payloadJson,
      sync_status as syncStatus,
      created_on as createdOn,
      updated_on as updatedOn,
      error
    FROM offline_checklist_queue
    ORDER BY created_on ASC`
  );

  return rows;
}

export async function setChecklistQueueItemStatus(id: string, status: SyncStatus, error?: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE offline_checklist_queue
     SET sync_status = ?, error = ?, updated_on = ?
     WHERE id = ?`,
    [status, error ?? null, new Date().toISOString(), id]
  );
}

export async function deleteChecklistQueueItem(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM offline_checklist_queue WHERE id = ?`, [id]);
}

function createLocalId() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

