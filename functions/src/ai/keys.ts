import { getFirestore } from "firebase-admin/firestore";

export type LlmProvider = "xai" | "openai" | "anthropic";

export interface LlmKeySet {
  xai: string;
  openai: string;
  anthropic: string;
}

function trimKey(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function platformKeys(): LlmKeySet {
  return {
    xai: trimKey(process.env.XAI_API_KEY),
    openai: trimKey(process.env.OPENAI_API_KEY),
    anthropic: trimKey(process.env.ANTHROPIC_API_KEY),
  };
}

/** User keys override platform keys per provider (same rule as the Python backend). */
export async function loadLlmKeys(uid: string): Promise<LlmKeySet> {
  const merged = platformKeys();
  const db = getFirestore();
  const snap = await db.collection(`users/${uid}/private/apiKeys`).get();
  for (const doc of snap.docs) {
    const provider = doc.id as LlmProvider;
    if (provider !== "xai" && provider !== "openai" && provider !== "anthropic") continue;
    const apiKey = trimKey(doc.data()?.apiKey);
    if (apiKey) merged[provider] = apiKey;
  }
  return merged;
}

export function hasAnyLlmKey(keys: LlmKeySet): boolean {
  return Boolean(keys.xai || keys.openai || keys.anthropic);
}

export function pickProvider(keys: LlmKeySet, preferred?: LlmProvider | null): LlmProvider | null {
  if (preferred && keys[preferred]) return preferred;
  if (keys.xai) return "xai";
  if (keys.openai) return "openai";
  if (keys.anthropic) return "anthropic";
  return null;
}
