import { HttpsError } from "firebase-functions/v2/https";
import { hasAnyLlmKey, loadLlmKeys, type LlmProvider } from "./keys";
import { completeChatText, type ChatMessage, type LlmResult } from "./llm";
import { chatProviderAttempts } from "./models";
import { checkUsageGate, hasEnterpriseWorkspaceAccess, getUserSubscriptionState, trackLlmResult } from "./usage";
import {
  buildNoteHtmlSystem,
  buildChatSystem,
  CHAT_USER_FORMAT_REMINDER,
} from "./chatSystemPrompt";

export interface AiChatRequest {
  prompt?: string;
  ai_model?: string;
  messages?: Array<{ role?: string; content?: string }>;
  chat_instructions?: string;
  workspace_id?: string;
  output_format?: "chat_markdown" | "note_html";
}

export interface AiChatResponse {
  message: string;
  source: string;
  ai_model_fallback: boolean;
  effective_ai_model: string;
}

function rulesReply(prompt: string): string {
  const low = prompt.trim().toLowerCase();
  if (["hey", "hi", "hello", "yo", "salut", "bonjour", "coucou", "hola"].includes(low)) {
    return "Salut ! Comment puis-je t'aider ?";
  }
  if (["thanks", "thank you", "merci", "thx"].includes(low)) {
    return "Avec plaisir !";
  }
  if (["bye", "goodbye", "à bientôt", "a bientot", "au revoir"].includes(low)) {
    return "À bientôt !";
  }
  return (
    "Je suis en **mode hors-ligne** pour l'instant — aucune clé API LLM n'est configurée côté serveur.\n\n" +
    "Ajoutez une clé xAI, OpenAI ou Anthropic dans les réglages Plugins, ou configurez les secrets " +
    "Cloud Functions (`XAI_API_KEY`, etc.)."
  );
}

const PROVIDER_LABEL: Record<LlmProvider, string> = {
  xai: "xAI",
  openai: "OpenAI",
  anthropic: "Anthropic",
};

function creditsExhaustedReply(providers: LlmProvider[]): string {
  const names = providers.map((provider) => PROVIDER_LABEL[provider]).join(", ");
  return (
    `Les comptes **${names}** n'ont plus de crédit.\n\n` +
    "Ajoute du crédit sur au moins un de ces comptes pour relancer l'assistant."
  );
}

const FREE_PLAN_UPGRADE = "[Passer au plan Pro](forma://upgrade-pro)";

function freePlanReply(prompt: string): string {
  const low = prompt.trim().toLowerCase();
  if (["hey", "hi", "hello", "yo", "salut", "bonjour", "coucou", "hola"].includes(low)) {
    return `Salut ! L'assistant IA est réservé au plan **Pro**.\n\n${FREE_PLAN_UPGRADE}`;
  }
  if (["thanks", "thank you", "merci", "thx"].includes(low)) {
    return "Avec plaisir !";
  }
  if (["bye", "goodbye", "à bientôt", "a bientot", "au revoir"].includes(low)) {
    return "À bientôt !";
  }
  return (
    "L'assistant IA n'est pas inclus dans le plan **Gratuit**.\n\n" +
    "Le plan gratuit inclut le workspace, les appels et la messagerie entre amis — " +
    "sans chat IA, Agent ni Render.\n\n" +
    FREE_PLAN_UPGRADE
  );
}

async function hasAiBillingAccess(uid: string, workspaceId?: string): Promise<boolean> {
  const personal = (await getUserSubscriptionState(uid)).plan === "pro";
  if (personal) return true;
  return hasEnterpriseWorkspaceAccess(uid, workspaceId);
}

function parseHistory(raw: AiChatRequest["messages"]): ChatMessage[] {
  const history: ChatMessage[] = [];
  for (const item of raw ?? []) {
    const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : null;
    const content = typeof item?.content === "string" ? item.content.trim() : "";
    if (role && content) history.push({ role, content });
  }
  return history;
}

export async function runAiChat(uid: string, data: AiChatRequest): Promise<AiChatResponse> {
  const prompt = typeof data.prompt === "string" ? data.prompt.trim() : "";
  const aiModel = typeof data.ai_model === "string" ? data.ai_model : "auto";
  const chatInstructions =
    typeof data.chat_instructions === "string" ? data.chat_instructions : "";
  const noteHtmlMode = data.output_format === "note_html";
  const chatSystem = noteHtmlMode
    ? buildNoteHtmlSystem()
    : buildChatSystem(chatInstructions);
  const history = parseHistory(data.messages);
  const userPrompt = noteHtmlMode
    ? prompt
    : `${prompt}${CHAT_USER_FORMAT_REMINDER}`;

  const workspaceId =
    typeof data.workspace_id === "string" ? data.workspace_id.trim().toLowerCase() : "";

  if (!prompt) {
    return {
      message: "Say something and I'll reply.",
      source: "rules",
      ai_model_fallback: false,
      effective_ai_model: aiModel,
    };
  }

  const aiAllowed = await hasAiBillingAccess(uid, workspaceId || undefined);
  if (!aiAllowed) {
    return {
      message: freePlanReply(prompt),
      source: "free_plan",
      ai_model_fallback: false,
      effective_ai_model: aiModel,
    };
  }

  const usageGate = await checkUsageGate(uid, workspaceId || undefined);
  if (usageGate) {
    return {
      message: usageGate,
      source: "quota",
      ai_model_fallback: false,
      effective_ai_model: aiModel,
    };
  }

  const keys = await loadLlmKeys(uid);
  if (!hasAnyLlmKey(keys)) {
    return {
      message: rulesReply(prompt),
      source: "rules",
      ai_model_fallback: false,
      effective_ai_model: aiModel,
    };
  }

  const attempts = chatProviderAttempts(aiModel, prompt, keys);
  if (attempts.length === 0) {
    return {
      message: rulesReply(prompt),
      source: "rules",
      ai_model_fallback: false,
      effective_ai_model: aiModel,
    };
  }

  const exhausted: LlmProvider[] = [];
  let lastError: string | null = null;

  for (const attempt of attempts) {
    const result = await completeChatText({
      keys,
      provider: attempt.provider,
      model: attempt.model,
      system: chatSystem,
      history,
      userPrompt,
    }).catch((err: unknown): LlmResult => {
      console.error("completeChatText failed", attempt.provider, err);
      return {
        message: null,
        error: String(err),
        rateLimited: false,
        inputTokens: 0,
        outputTokens: 0,
        modelId: attempt.model,
      };
    });

    if (result.message) {
      await trackLlmResult(uid, attempt.model, result, workspaceId || undefined, {
        system: chatSystem,
        history,
        userPrompt,
      });
      return {
        message: result.message,
        source: attempt.provider,
        ai_model_fallback: exhausted.length > 0,
        effective_ai_model: attempt.model,
      };
    }

    if (result.rateLimited) {
      exhausted.push(attempt.provider);
      console.warn(`LLM credit exhausted for ${attempt.provider}`);
      continue;
    }

    lastError = result.error;
    console.error(`LLM call failed for ${attempt.provider}`, result.error);
  }

  if (exhausted.length === attempts.length) {
    return {
      message: creditsExhaustedReply(exhausted),
      source: "rules",
      ai_model_fallback: false,
      effective_ai_model: aiModel,
    };
  }

  if (lastError) {
    console.error("AI chat stopped after a provider error", lastError);
    return {
      message: "Le modèle n'a pas pu répondre. Réessaie dans un instant.",
      source: "rules",
      ai_model_fallback: false,
      effective_ai_model: aiModel,
    };
  }

  return {
    message: rulesReply(prompt),
    source: "rules",
    ai_model_fallback: false,
    effective_ai_model: aiModel,
  };
}

export function assertAuthenticated(uid: string | undefined): asserts uid is string {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
}
