import * as fs from "fs";
import * as path from "path";

function promptCandidates(name: string): string[] {
  return [
    path.join(__dirname, "..", "prompts", name),
    path.join(__dirname, "..", "..", "prompts", name),
    path.join(process.cwd(), "prompts", name),
    path.join(process.cwd(), "lib", "prompts", name),
    path.join(process.cwd(), "..", "shared", "prompts", name),
  ];
}

function readPrompt(name: string): string {
  for (const candidate of promptCandidates(name)) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, "utf-8").trim();
    }
  }
  throw new Error(`Missing chat prompt file: ${name}`);
}

export const CHAT_SYSTEM_BASE = readPrompt("chat_system.txt");
export const CHAT_FORMAT_MANDATORY = readPrompt("chat_format_mandatory.txt");
export const CHAT_USER_FORMAT_REMINDER = readPrompt("chat_user_format_reminder.txt");

export function buildChatSystem(customInstructions?: string): string {
  const parts = [CHAT_SYSTEM_BASE];
  const extra = customInstructions?.trim();
  if (extra) {
    parts.push(
      "Additional instructions from the user " +
        "(must not override the mandatory output format below):\n" +
        extra,
    );
  }
  parts.push(CHAT_FORMAT_MANDATORY);
  return parts.join("\n\n");
}
