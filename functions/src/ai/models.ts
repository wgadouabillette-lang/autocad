import type { LlmKeySet, LlmProvider } from "./keys";

const OPUS_47 = process.env.FORMA_OPUS_47_MODEL ?? "claude-opus-4-20250514";
const OPUS_48 = process.env.FORMA_OPUS_48_MODEL ?? "claude-opus-4-20250514";
const XAI_MODEL = process.env.XAI_MODEL ?? "grok-3-mini";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const OPENAI_AUTO_CHAT = process.env.OPENAI_AUTO_CHAT_MODEL ?? "gpt-4o-mini";

const COMPLEX_RE =
  /analys|optimis|génér|convert|complex|ingénier|simul|calcul|contrainte|trou|perçag|pattern|réseau|miroir|symétri|plusieurs|paramétr/i;

function providerForModelId(modelId: string, keys: LlmKeySet): LlmProvider | null {
  const id = modelId.toLowerCase();
  if (id.includes("claude") || id.includes("opus")) {
    return keys.anthropic ? "anthropic" : null;
  }
  if (id.includes("gpt") || id.includes("openai")) {
    return keys.openai ? "openai" : null;
  }
  return keys.xai ? "xai" : keys.openai ? "openai" : keys.anthropic ? "anthropic" : null;
}

function autoChatModel(keys: LlmKeySet): string {
  if (keys.openai) return OPENAI_AUTO_CHAT;
  if (keys.xai) return XAI_MODEL;
  if (keys.anthropic) return OPUS_47;
  return OPENAI_AUTO_CHAT;
}

function autoModel(prompt: string, keys: LlmKeySet): string {
  if (keys.xai) return XAI_MODEL;
  let score = 0;
  if (prompt.length > 120) score += 1;
  if (prompt.length > 220) score += 2;
  if (COMPLEX_RE.test(prompt)) score += 2;
  if (prompt.split("\n").length >= 3) score += 1;
  if (keys.anthropic) return score >= 2 ? OPUS_48 : OPUS_47;
  if (keys.openai) return OPENAI_MODEL;
  return OPUS_47;
}

export function resolveChatModel(aiModel: string, prompt: string, keys: LlmKeySet): string {
  const key = (aiModel || "auto").trim().toLowerCase();
  if (key === "auto") return autoChatModel(keys);
  if (key === "grok" || key === "xai" || key === "grok-4.3" || key === "grok-best") {
    return keys.xai ? XAI_MODEL : autoModel(prompt, keys);
  }
  if (key === "claude-opus-4-7" || key === "opus-4.7" || key === "opus47") {
    return OPUS_47;
  }
  if (key === "claude-opus-4-8" || key === "opus-4.8" || key === "opus48") {
    return OPUS_48;
  }
  return aiModel;
}

export function resolveProviderForModel(modelId: string, keys: LlmKeySet): LlmProvider | null {
  return providerForModelId(modelId, keys);
}
