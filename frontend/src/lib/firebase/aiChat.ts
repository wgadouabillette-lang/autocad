import { httpsCallable } from "firebase/functions";
import type { ChatResponse } from "../types";
import { functions } from "./client";

export interface AiChatPayload {
  prompt: string;
  ai_model: string;
  messages: { role: string; content: string }[];
  chat_instructions?: string;
  workspace_id?: string;
}

export async function callAiChat(payload: AiChatPayload): Promise<ChatResponse> {
  const callable = httpsCallable<AiChatPayload, ChatResponse>(functions, "aiChat");
  const result = await callable(payload);
  const data = result.data;
  return {
    message: data.message,
    source: data.source ?? "llm",
    ai_model_fallback: Boolean(data.ai_model_fallback),
    effective_ai_model: data.effective_ai_model ?? payload.ai_model,
  };
}

export async function fetchAiHealth(): Promise<{
  llm: boolean;
  user_keys: boolean;
  platform_keys: boolean;
}> {
  const callable = httpsCallable(functions, "aiHealth");
  const result = await callable({});
  return result.data as {
    llm: boolean;
    user_keys: boolean;
    platform_keys: boolean;
  };
}
