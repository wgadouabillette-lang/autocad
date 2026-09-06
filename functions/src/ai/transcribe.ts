import { HttpsError } from "firebase-functions/v2/https";
import { loadLlmKeys } from "./keys";

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export interface TranscribeRequest {
  audioBase64?: string;
  mimeType?: string;
  filename?: string;
}

function safeFilename(raw: unknown, mimeType: string): string {
  if (typeof raw === "string") {
    const base = raw.split(/[/\\]/).pop()?.trim() ?? "";
    if (/^[\w.-]+\.(webm|wav|mp3|mp4|m4a|ogg|mpeg|mpga)$/i.test(base)) {
      return base;
    }
  }
  const lower = mimeType.toLowerCase();
  if (lower.includes("wav")) return "chunk.wav";
  if (lower.includes("mp4") || lower.includes("m4a")) return "chunk.m4a";
  if (lower.includes("ogg")) return "chunk.ogg";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "chunk.mp3";
  return "chunk.webm";
}

export async function runAiTranscribe(
  uid: string,
  data: TranscribeRequest,
): Promise<{ text: string }> {
  const keys = await loadLlmKeys(uid);
  if (!keys.openai) {
    throw new HttpsError(
      "failed-precondition",
      "Transcription indisponible (service).",
    );
  }

  const audioBase64 = typeof data.audioBase64 === "string" ? data.audioBase64.trim() : "";
  if (!audioBase64) {
    throw new HttpsError("invalid-argument", "Audio manquant.");
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(audioBase64, "base64");
  } catch {
    throw new HttpsError("invalid-argument", "Audio invalide.");
  }
  if (!buffer.length) {
    throw new HttpsError("invalid-argument", "Audio vide.");
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new HttpsError("invalid-argument", "Audio trop volumineux.");
  }

  const mimeType =
    typeof data.mimeType === "string" && data.mimeType.trim()
      ? data.mimeType.trim()
      : "audio/webm";
  const filename = safeFilename(data.filename, mimeType);

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
  form.append("model", "whisper-1");

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${keys.openai}` },
      body: form,
    });
  } catch {
    throw new HttpsError("unavailable", "Transcription indisponible (réseau).");
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new HttpsError("failed-precondition", "Transcription indisponible (service).");
    }
    throw new HttpsError("unavailable", "Transcription indisponible (réseau).");
  }

  const payload = (await response.json()) as { text?: unknown };
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  return { text };
}
