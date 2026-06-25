import type { ChatMessage } from "./llm";

export function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

export function resolveTokenCounts(input: {
  system?: string;
  history?: ChatMessage[];
  userPrompt?: string;
  responseText?: string;
  inputTokens: number;
  outputTokens: number;
}): { inputTokens: number; outputTokens: number } {
  let { inputTokens, outputTokens } = input;

  if (inputTokens <= 0 && outputTokens <= 0 && input.responseText) {
    const inputText = [
      input.system ?? "",
      ...(input.history ?? []).map((m) => m.content),
      input.userPrompt ?? "",
    ].join("\n");
    inputTokens = estimateTokensFromText(inputText);
    outputTokens = estimateTokensFromText(input.responseText);
  } else {
    if (inputTokens <= 0 && outputTokens > 0) {
      inputTokens = Math.max(1, Math.round(outputTokens * 0.5));
    }
    if (outputTokens <= 0 && input.responseText) {
      outputTokens = estimateTokensFromText(input.responseText);
    }
  }

  return { inputTokens, outputTokens };
}
