import {
  deleteRecordingFromStorage,
  downloadRecordingFromStorage,
  uploadRecordingToStorage,
} from "./firebase/recordingStorage";
import { auth } from "./firebase/client";

const DB_NAME = "forma-recordings";
const STORE_NAME = "blobs";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponible."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function readRecordingBlobFromIdb(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onerror = () => reject(request.error ?? new Error("Lecture impossible."));
    request.onsuccess = () => {
      db.close();
      resolve((request.result as Blob | undefined) ?? null);
    };
  });
}

async function writeRecordingBlobToIdb(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Échec de sauvegarde."));
    tx.objectStore(STORE_NAME).put(blob, id);
  });
}

async function removeRecordingBlobFromIdb(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Suppression impossible."));
    tx.objectStore(STORE_NAME).delete(id);
  });
}

/** Cache local + cloud (si connecté). L'échec cloud n'empêche pas la sauvegarde locale. */
export async function persistRecordingBlob(id: string, blob: Blob): Promise<void> {
  await writeRecordingBlobToIdb(id, blob);
  const uid = auth.currentUser?.uid;
  if (uid) {
    void uploadRecordingToStorage(uid, id, blob).catch((error) => {
      console.error("[recording] cloud upload failed", error);
    });
  }
}

/** IndexedDB d'abord, puis Firebase Storage pour le même compte. */
export async function loadRecordingBlob(id: string): Promise<Blob | null> {
  const local = await readRecordingBlobFromIdb(id);
  if (local && local.size > 0) return local;

  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const remote = await downloadRecordingFromStorage(uid, id);
  if (!remote || remote.size === 0) return null;

  await writeRecordingBlobToIdb(id, remote).catch(() => {});
  return remote;
}

export async function deleteRecordingBlob(id: string): Promise<void> {
  await removeRecordingBlobFromIdb(id);
  const uid = auth.currentUser?.uid;
  if (uid) {
    await deleteRecordingFromStorage(uid, id);
  }
}

/** Compat — écriture locale uniquement (notes IA, follow-up, etc.). */
export async function saveRecordingBlob(id: string, blob: Blob): Promise<void> {
  await writeRecordingBlobToIdb(id, blob);
}
