import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type { PendingAction } from "./types";

interface OfflineQueueSchema extends DBSchema {
  pendingActions: {
    key: string;
    value: PendingAction;
    indexes: { sequence: number };
  };
}

const DB_NAME = "odograph-offline-queue";
const DB_VERSION = 1;
const STORE_NAME = "pendingActions";

let dbPromise: Promise<IDBPDatabase<OfflineQueueSchema>> | null = null;

function openQueueDb(): Promise<IDBPDatabase<OfflineQueueSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineQueueSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("sequence", "sequence");
      },
    });
  }
  return dbPromise;
}

export async function putPendingAction(action: PendingAction): Promise<void> {
  const db = await openQueueDb();
  await db.put(STORE_NAME, action);
}

export async function deletePendingAction(id: string): Promise<void> {
  const db = await openQueueDb();
  await db.delete(STORE_NAME, id);
}

/** In `sequence` order — the total order the drain loop replays in (data-model.md). */
export async function getAllPendingActionsInOrder(): Promise<PendingAction[]> {
  const db = await openQueueDb();
  return db.getAllFromIndex(STORE_NAME, "sequence");
}
