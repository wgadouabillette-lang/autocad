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

const WHISPER_LANGUAGE_CODES: Record<string, string> = {
  afrikaans: "af",
  arabic: "ar",
  armenian: "hy",
  azerbaijani: "az",
  belarusian: "be",
  bengali: "bn",
  bosnian: "bs",
  bulgarian: "bg",
  catalan: "ca",
  chinese: "zh",
  croatian: "hr",
  czech: "cs",
  danish: "da",
  dutch: "nl",
  english: "en",
  estonian: "et",
  finnish: "fi",
  french: "fr",
  german: "de",
  greek: "el",
  hebrew: "he",
  hindi: "hi",
  hungarian: "hu",
  indonesian: "id",
  italian: "it",
  japanese: "ja",
  korean: "ko",
  latvian: "lv",
  lithuanian: "lt",
  malay: "ms",
  norwegian: "no",
  persian: "fa",
  polish: "pl",
  portuguese: "pt",
  romanian: "ro",
  russian: "ru",
  serbian: "sr",
  slovak: "sk",
  slovenian: "sl",
  spanish: "es",
  swedish: "sv",
  thai: "th",
  turkish: "tr",
  ukrainian: "uk",
  vietnamese: "vi",
};

function detectedLanguage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim().toLowerCase().replace(/_/g, "-");
  if (!raw) return undefined;
  if (WHISPER_LANGUAGE_CODES[raw]) return WHISPER_LANGUAGE_CODES[raw];
  const head = raw.split("-")[0] ?? "";
  if (WHISPER_LANGUAGE_CODES[head]) return WHISPER_LANGUAGE_CODES[head];
  if (/^[a-z]{2}$/.test(head)) return head;
  return undefined;
}

function transcriptPayload(payload: unknown): { text: string; language?: string } {
  if (!payload || typeof payload !== "object") return { text: "" };
  const record = payload as { text?: unknown; language?: unknown };
  const text = typeof record.text === "string" ? record.text.trim() : "";
  return { text, language: detectedLanguage(record.language) };
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
  if (!language) form.append("response_format", "verbose_json");
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
  if (language) form.append("format", "true");
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
): Promise<{ text: string; language?: string }> {
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
      let parsed = { text: "", language: undefined as string | undefined };
      try {
        parsed = transcriptPayload(await response.json());
      } catch {
        lastKind = "network";
        continue;
      }
      if (parsed.text || isLast) {
        if (
          parsed.text &&
          !language &&
          !parsed.language &&
          keys.openai &&
          attempt.name !== "openai"
        ) {
          try {
            const detect = await transcribeOpenAi(
              buffer,
              mimeType,
              filename,
              keys.openai,
            );
            if (detect.ok) {
              const alt = transcriptPayload(await detect.json());
              if (alt.language) {
                return { text: alt.text || parsed.text, language: alt.language };
              }
            }
          } catch {
            // Keep the transcript we already have.
          }
        }
        return { text: parsed.text, language: parsed.language ?? language };
      }
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
