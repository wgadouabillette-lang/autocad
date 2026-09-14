import { HttpsError } from "firebase-functions/v2/https";
import { loadLlmKeys } from "./keys";

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const OPENAI_STT_URL = "https://api.openai.com/v1/audio/transcriptions";
const XAI_STT_URL = "https://api.x.ai/v1/stt";

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

function transcriptText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const text = (payload as { text?: unknown }).text;
  return typeof text === "string" ? text.trim() : "";
}

async function transcribeOpenAi(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  apiKey: string,
): Promise<Response> {
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
  return fetch(OPENAI_STT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
}

async function transcribeXai(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  apiKey: string,
  includeModel = true,
): Promise<Response> {
  const form = new FormData();
  if (includeModel) form.append("model", "grok-stt");
  form.append("language", "fr");
  form.append("format", "true");
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
  return fetch(XAI_STT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
}

export async function runAiTranscribe(
  uid: string,
  data: TranscribeRequest,
): Promise<{ text: string }> {
  const keys = await loadLlmKeys(uid);
  if (!keys.openai && !keys.xai) {
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

  const attempts: Array<{
    name: "openai" | "xai";
    run: () => Promise<Response>;
  }> = [];
  if (keys.xai) {
    attempts.push({
      name: "xai",
      run: () => transcribeXai(buffer, mimeType, filename, keys.xai),
    });
  }
  if (keys.openai) {
    attempts.push({
      name: "openai",
      run: () => transcribeOpenAi(buffer, mimeType, filename, keys.openai),
    });
  }

  let lastKind: "service" | "network" = "network";
  for (const attempt of attempts) {
    let response: Response;
    try {
      response = await attempt.run();
    } catch {
      lastKind = "network";
      continue;
    }
    if (response.ok) {
      return { text: transcriptText(await response.json()) };
    }
    if (attempt.name === "xai" && response.status === 400) {
      try {
        const retry = await transcribeXai(buffer, mimeType, filename, keys.xai, false);
        if (retry.ok) {
          return { text: transcriptText(await retry.json()) };
        }
        response = retry;
      } catch {
        lastKind = "network";
        continue;
      }
    }
    lastKind = response.status === 401 || response.status === 403 ? "service" : "network";
  }

  throw new HttpsError(
    lastKind === "service" ? "failed-precondition" : "unavailable",
    lastKind === "service"
      ? "Transcription indisponible (service)."
      : "Transcription indisponible (réseau).",
  );
}
