import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { storage } from "./client";

const MAX_RECORDING_BYTES = 512 * 1024 * 1024;

function recordingRef(uid: string, recordingId: string) {
  return ref(storage, `users/${uid}/recordings/${recordingId}.webm`);
}

export async function uploadRecordingToStorage(
  uid: string,
  recordingId: string,
  blob: Blob,
): Promise<void> {
  await uploadBytes(recordingRef(uid, recordingId), blob, {
    contentType: blob.type || "video/webm",
  });
}

export async function downloadRecordingFromStorage(
  uid: string,
  recordingId: string,
): Promise<Blob | null> {
  try {
    const bytes = await getBytes(recordingRef(uid, recordingId), MAX_RECORDING_BYTES);
    return new Blob([bytes], { type: "video/webm" });
  } catch {
    return null;
  }
}

export async function deleteRecordingFromStorage(
  uid: string,
  recordingId: string,
): Promise<void> {
  try {
    await deleteObject(recordingRef(uid, recordingId));
  } catch {
    // Rien à supprimer côté cloud.
  }
}
