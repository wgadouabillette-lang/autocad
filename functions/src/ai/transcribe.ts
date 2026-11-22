import { HttpsError } from "firebase-functions/v2/https";
import { loadLlmKeys } from "./keys";

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const OPENAI_STT_URL = "https://api.openai.com/v1/audio/transcriptions";
const XAI_STT_URL = "https://api.x.ai/v1/stt";

export interface TranscribeRequest {
  audioBase64?: string;
  mimeType?: string;
  filename?: string;
  language?: string;
}

function languageCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim().toLowerCase();
  if (raw.length >= 2 && /^[a-z]{2}/.test(raw)) return raw.slice(0, 2);
  return undefined;
}

function appendLanguage(form: FormData, language: string | undefined): void {
  if (language) form.append("language", language);
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
  language?: string,
): Promise<Response> {
  const form = new FormData();
  form.append("model", "whisper-1");
  appendLanguage(form, language);
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
  language?: string,
  includeModel = true,
): Promise<Response> {
  const form = new FormData();
  if (includeModel) form.append("model", "grok-stt");
  appendLanguage(form, language);
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
  const language = languageCode(data.language);

  const attempts: Array<{
    name: "openai" | "xai";
    run: () => Promise<Response>;
  }> = [];
  if (keys.xai) {
    attempts.push({
      name: "xai",
      run: () => transcribeXai(buffer, mimeType, filename, keys.xai, language),
    });
  }
  if (keys.openai) {
    attempts.push({
      name: "openai",
      run: () => transcribeOpenAi(buffer, mimeType, filename, keys.openai, language),
    });
  }

  let lastKind: "service" | "network" = "network";
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const isLast = index === attempts.length - 1;
    let response: Response;
    try {
      response = await attempt.run();
      if (attempt.name === "xai" && response.status === 400) {
        response = await transcribeXai(buffer, mimeType, filename, keys.xai, language, false);
      }
    } catch {
      lastKind = "network";
      continue;
    }
    if (response.ok) {
      let text = "";
      try {
        text = transcriptText(await response.json());
      } catch {
        lastKind = "network";
        continue;
      }
      if (text || isLast) return { text };
      continue;
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
