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

/** Clés LLM configurées au niveau plateforme (secrets Functions / Secret Manager). */
export function platformKeyStatus(): Record<LlmProvider, boolean> {
  const keys = platformKeys();
  return {
    xai: Boolean(keys.xai),
    openai: Boolean(keys.openai),
    anthropic: Boolean(keys.anthropic),
  };
}

const LLM_PROVIDERS: LlmProvider[] = ["xai", "openai", "anthropic"];

/**
 * One document per provider.
 * `users/{uid}/private/apiKeys` is a document path (even segment count), so it
 * cannot be queried as a collection. Keys live one level deeper.
 */
export function userApiKeysCollectionPath(uid: string): string {
  return `users/${uid}/private/apiKeys/providers`;
}

export function userApiKeyDocPath(uid: string, provider: string): string {
  return `${userApiKeysCollectionPath(uid)}/${provider}`;
}

/** User keys override platform keys per provider (same rule as the Python backend). */
export async function loadLlmKeys(uid: string): Promise<LlmKeySet> {
  const merged = platformKeys();
  const db = getFirestore();
  try {
    const snap = await db.collection(userApiKeysCollectionPath(uid)).get();
    for (const doc of snap.docs) {
      const provider = doc.id as LlmProvider;
      if (!LLM_PROVIDERS.includes(provider)) continue;
      const apiKey = trimKey(doc.data()?.apiKey);
      if (apiKey) merged[provider] = apiKey;
    }
  } catch (error) {
    console.warn("User API key lookup failed; using platform keys", error);
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
