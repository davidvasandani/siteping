import type { RecordingMetadata, RecordingSession } from "./model.js";

const DATABASE = "siteping-recordings";
const VERSION = 1;
const RECORDINGS = "recordings";
const SESSIONS = "sessions";

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error("IndexedDB request failed."));
  });
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
  });
}

export function openRecordingDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, VERSION);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      if (!db.objectStoreNames.contains(RECORDINGS)) {
        const store = db.createObjectStore(RECORDINGS, { keyPath: "feedbackId" });
        store.createIndex("projectName", "projectName", { unique: false });
      }
      if (!db.objectStoreNames.contains(SESSIONS)) db.createObjectStore(SESSIONS, { keyPath: "id" });
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error ?? new Error("SitePing could not open recording storage."));
  });
}

export async function getAllRecordings(): Promise<RecordingMetadata[]> {
  const db = await openRecordingDatabase();
  try {
    return (await request(db.transaction(RECORDINGS).objectStore(RECORDINGS).getAll())) as RecordingMetadata[];
  } finally {
    db.close();
  }
}

export async function putRecording(recording: RecordingMetadata): Promise<void> {
  const db = await openRecordingDatabase();
  try {
    const transaction = db.transaction(RECORDINGS, "readwrite");
    transaction.objectStore(RECORDINGS).put(recording);
    await complete(transaction);
  } finally {
    db.close();
  }
}

export async function deleteRecording(feedbackId: string): Promise<void> {
  const db = await openRecordingDatabase();
  try {
    const transaction = db.transaction(RECORDINGS, "readwrite");
    transaction.objectStore(RECORDINGS).delete(feedbackId);
    await complete(transaction);
  } finally {
    db.close();
  }
}

export async function deleteProjectRecordings(projectName: string): Promise<void> {
  const db = await openRecordingDatabase();
  try {
    const transaction = db.transaction(RECORDINGS, "readwrite");
    const index = transaction.objectStore(RECORDINGS).index("projectName");
    const cursor = index.openKeyCursor(IDBKeyRange.only(projectName));
    cursor.onsuccess = () => {
      const found = cursor.result;
      if (!found) return;
      transaction.objectStore(RECORDINGS).delete(found.primaryKey);
      found.continue();
    };
    await complete(transaction);
  } finally {
    db.close();
  }
}

export async function setActiveSession(session: RecordingSession | null): Promise<void> {
  const db = await openRecordingDatabase();
  try {
    const transaction = db.transaction(SESSIONS, "readwrite");
    const store = transaction.objectStore(SESSIONS);
    if (session) store.put({ id: "active", ...session });
    else store.delete("active");
    await complete(transaction);
  } finally {
    db.close();
  }
}
