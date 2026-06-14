import { httpsCallable } from "firebase/functions";
import { functions } from "./client";

export type ApiKeyProvider = "xai" | "openai" | "anthropic";

export interface ApiKeyProviderStatus {
  configured: boolean;
  keyPreview?: string;
}

export async function fetchApiKeyStatus(): Promise<Record<ApiKeyProvider, ApiKeyProviderStatus>> {
  const callable = httpsCallable(functions, "getUserApiKeyStatus");
  const result = await callable({});
  const providers = (result.data as { providers?: Record<string, ApiKeyProviderStatus> }).providers;
  return {
    xai: providers?.xai ?? { configured: false },
    openai: providers?.openai ?? { configured: false },
    anthropic: providers?.anthropic ?? { configured: false },
  };
}

export async function saveApiKey(provider: ApiKeyProvider, apiKey: string): Promise<void> {
  const callable = httpsCallable(functions, "setUserApiKey");
  await callable({ provider, apiKey });
}

export async function deleteApiKey(provider: ApiKeyProvider): Promise<void> {
  const callable = httpsCallable(functions, "deleteUserApiKey");
  await callable({ provider });
}
