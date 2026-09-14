import { api } from "./api";
import { audioBlobToWav } from "./audioWav";
import { callAiTranscribe } from "./firebase/aiTranscribe";
import { hasFormaDesktop } from "./formaDesktop";

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
  const prepared = await audioBlobToWav(blob).catch(() => blob);
  const filename = filenameFor(prepared);
  const mimeType = prepared.type || blob.type || "audio/wav";

  const viaBackend = () => api.transcribeChunk(prepared, filename);
  const viaCloud = async () => {
    const audioBase64 = await blobToBase64(prepared);
    const result = await callAiTranscribe({
      audioBase64,
      mimeType,
      filename,
    });
    return result.text;
  };

  if (hasFormaDesktop()) {
    try {
      return await viaBackend();
    } catch {
      return viaCloud();
    }
  }

  try {
    return await viaCloud();
  } catch (error) {
    try {
      return await viaBackend();
    } catch (fallbackError) {
      throw fallbackError instanceof Error ? fallbackError : error;
    }
  }
}
