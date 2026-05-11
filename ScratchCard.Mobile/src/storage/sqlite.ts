import * as SQLite from "expo-sqlite";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function init(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS offline_shift_queue (
      id TEXT PRIMARY KEY NOT NULL,
      shift_id TEXT NOT NULL,
      shop_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      sync_status TEXT NOT NULL,
      error TEXT,
      created_on TEXT NOT NULL,
      updated_on TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_shift_draft (
      shift_id TEXT PRIMARY KEY NOT NULL,
      payload_json TEXT NOT NULL,
      created_on TEXT NOT NULL,
      updated_on TEXT NOT NULL
    );
  `);
}

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("scratchcard.db").then(async (db) => {
      await init(db);
      return db;
    });
  }

  return databasePromise;
}
