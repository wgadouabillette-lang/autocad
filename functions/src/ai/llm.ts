import type { LlmKeySet, LlmProvider } from "./keys";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmResult {
  message: string | null;
  error: string | null;
  rateLimited: boolean;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
}

const XAI_BASE = process.env.XAI_API_BASE ?? "https://api.x.ai/v1";
const OPENAI_BASE = process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1";

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500) || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function openAiCompatChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  messages: ChatMessage[],
): Promise<LlmResult> {
  const payload = {
    model,
    messages: [{ role: "system", content: system }, ...messages],
    temperature: 0.4,
  };
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await readErrorBody(response);
    return {
      message: null,
      error: detail,
      rateLimited: response.status === 402 || response.status === 429,
      inputTokens: 0,
      outputTokens: 0,
      modelId: model,
    };
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  const usage = data.usage ?? {};
  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  if (!text) {
    return {
      message: null,
      error: "Empty AI response.",
      rateLimited: false,
      inputTokens: Math.max(0, inputTokens),
      outputTokens: Math.max(0, outputTokens),
      modelId: model,
    };
  }
  return {
    message: text,
    error: null,
    rateLimited: false,
    inputTokens: Math.max(0, inputTokens),
    outputTokens: Math.max(0, outputTokens),
    modelId: model,
  };
}

async function anthropicChat(
  apiKey: string,
  model: string,
  system: string,
  messages: ChatMessage[],
): Promise<LlmResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages,
    }),
  });
  if (!response.ok) {
    const detail = await readErrorBody(response);
    return {
      message: null,
      error: detail,
      rateLimited: response.status === 402 || response.status === 429,
      inputTokens: 0,
      outputTokens: 0,
      modelId: model,
    };
  }
  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text =
    data.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("")
      .trim() ?? "";
  const inputTokens = Math.max(0, Number(data.usage?.input_tokens ?? 0));
  const outputTokens = Math.max(0, Number(data.usage?.output_tokens ?? 0));
  if (!text) {
    return {
      message: null,
      error: "Empty AI response.",
      rateLimited: false,
      inputTokens,
      outputTokens,
      modelId: model,
    };
  }
  return {
    message: text,
    error: null,
    rateLimited: false,
    inputTokens,
    outputTokens,
    modelId: model,
  };
}

export async function completeChatText(input: {
  keys: LlmKeySet;
  provider: LlmProvider;
  model: string;
  system: string;
  history: ChatMessage[];
  userPrompt: string;
}): Promise<LlmResult> {
  const messages: ChatMessage[] = [
    ...input.history.filter((m) => m.content.trim()),
    { role: "user", content: input.userPrompt.trim() },
  ];

  if (input.provider === "xai") {
    return openAiCompatChat(XAI_BASE, input.keys.xai, input.model, input.system, messages);
  }
  if (input.provider === "openai") {
    return openAiCompatChat(OPENAI_BASE, input.keys.openai, input.model, input.system, messages);
  }
  return anthropicChat(input.keys.anthropic, input.model, input.system, messages);
}
