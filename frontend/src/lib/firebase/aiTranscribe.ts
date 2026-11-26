import { httpsCallable } from "firebase/functions";
import { functions } from "./client";

export interface AiTranscribePayload {
  audioBase64: string;
  mimeType?: string;
  filename?: string;
  language?: string;
  prompt?: string;
}

export async function callAiTranscribe(
  payload: AiTranscribePayload,
): Promise<{ text: string; language?: string }> {
  const callable = httpsCallable<
    AiTranscribePayload,
    { text?: string; language?: string }
  >(functions, "aiTranscribe");
  const result = await callable(payload);
  const text = typeof result.data?.text === "string" ? result.data.text.trim() : "";
  const language =
    typeof result.data?.language === "string" && /^[a-z]{2}$/i.test(result.data.language.trim())
      ? result.data.language.trim().toLowerCase()
      : undefined;
  return { text, language };
}
