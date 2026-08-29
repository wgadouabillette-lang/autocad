import { api } from "./api";
import { callAiTranscribe } from "./firebase/aiTranscribe";

function filenameFor(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes("wav")) return "chunk.wav";
  if (type.includes("mp4") || type.includes("m4a")) return "chunk.m4a";
  if (type.includes("ogg")) return "chunk.ogg";
  if (type.includes("mpeg") || type.includes("mp3")) return "chunk.mp3";
  return "chunk.webm";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Lecture audio impossible."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Lecture audio impossible."));
    reader.readAsDataURL(blob);
  });
}

export async function transcribeLiveAudioChunk(blob: Blob): Promise<string> {
  const filename = filenameFor(blob);
  try {
    const audioBase64 = await blobToBase64(blob);
    const result = await callAiTranscribe({
      audioBase64,
      mimeType: blob.type || "audio/webm",
      filename,
    });
    return result.text;
  } catch (error) {
    if (import.meta.env.DEV) {
      try {
        return await api.transcribeChunk(blob, filename);
      } catch {
        /* keep the Cloud Function error */
      }
    }
    throw error;
  }
}
