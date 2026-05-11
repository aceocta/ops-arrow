import { getDatabase } from "../storage/sqlite";

export async function saveShiftDraft(shiftId: string, payload: unknown) {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO local_shift_draft (shift_id, payload_json, created_on, updated_on)
     VALUES (?, COALESCE((SELECT payload_json FROM local_shift_draft WHERE shift_id = ?), ?), ?, ?);`,
    [shiftId, shiftId, JSON.stringify(payload), now, now]
  );
}

export async function getShiftDraft<T>(shiftId: string): Promise<T | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload_json: string }>(
    `SELECT payload_json FROM local_shift_draft WHERE shift_id = ?`,
    [shiftId]
  );

  if (!row?.payload_json) {
    return null;
  }

  return JSON.parse(row.payload_json) as T;
}

export async function clearShiftDraft(shiftId: string) {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM local_shift_draft WHERE shift_id = ?`, [shiftId]);
}
