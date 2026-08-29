import { httpsCallable } from "firebase/functions";
import { functions } from "./client";

export interface AiTranscribePayload {
  audioBase64: string;
  mimeType?: string;
  filename?: string;
}

export async function callAiTranscribe(
  payload: AiTranscribePayload,
): Promise<{ text: string }> {
  const callable = httpsCallable<AiTranscribePayload, { text?: string }>(
    functions,
    "aiTranscribe",
  );
  const result = await callable(payload);
  const text = typeof result.data?.text === "string" ? result.data.text.trim() : "";
  return { text };
}
