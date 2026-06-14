import { HttpsError } from "firebase-functions/v2/https";
import { hasAnyLlmKey, loadLlmKeys, pickProvider } from "./keys";
import { completeChatText, type ChatMessage } from "./llm";
import { resolveChatModel, resolveProviderForModel } from "./models";

const CHAT_SYSTEM = `You are a helpful assistant in a team workspace.
Reply naturally and conversationally in the same language as the user.
Keep answers concise and friendly.
Do not mention CAD, 3D modeling, or generating models unless the user explicitly asks about them.
Do not return JSON — plain text only.

Structure every reply with clear Markdown hierarchy:
- Use ## for main sections and ### for subsections (short, descriptive titles).
- Use bullet lists (- item) or numbered lists (1. item) for steps and options.
- Use **bold** for key terms; keep body text in normal paragraphs.
- Separate major sections with a blank line. Never dump a single wall of text.

When the user @mentions people to message them in parallel, acknowledge the request in your visible reply,
then append a dispatch block on its own lines:

[DISPATCH]
@handle: personalized message for that person
[/DISPATCH]

Use one @handle: line per recipient. Handles are lowercase (e.g. @marie.dupont).
The dispatch block is stripped from the chat UI — only the lines inside are sent as direct messages.`;

export interface AiChatRequest {
  prompt?: string;
  ai_model?: string;
  messages?: Array<{ role?: string; content?: string }>;
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
  const history = parseHistory(data.messages);

  if (!prompt) {
    return {
      message: "Say something and I'll reply.",
      source: "rules",
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

  const modelId = resolveChatModel(aiModel, prompt, keys);
  const provider = resolveProviderForModel(modelId, keys) ?? pickProvider(keys);
  if (!provider) {
    return {
      message: rulesReply(prompt),
      source: "rules",
      ai_model_fallback: false,
      effective_ai_model: aiModel,
    };
  }

  const result = await completeChatText({
    keys,
    provider,
    model: modelId,
    system: CHAT_SYSTEM,
    history,
    userPrompt: prompt,
  });

  if (result.message) {
    return {
      message: result.message,
      source: provider,
      ai_model_fallback: false,
      effective_ai_model: aiModel,
    };
  }

  if (result.rateLimited && aiModel !== "auto") {
    const fallbackModel = resolveChatModel("auto", prompt, keys);
    const fallbackProvider =
      resolveProviderForModel(fallbackModel, keys) ?? pickProvider(keys);
    if (fallbackProvider) {
      const retry = await completeChatText({
        keys,
        provider: fallbackProvider,
        model: fallbackModel,
        system: CHAT_SYSTEM,
        history,
        userPrompt: prompt,
      });
      if (retry.message) {
        return {
          message: `*(Modèle Auto — limite atteinte sur le modèle choisi.)*\n\n${retry.message}`,
          source: fallbackProvider,
          ai_model_fallback: true,
          effective_ai_model: "auto",
        };
      }
    }
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
