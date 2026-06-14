import type { LucideIcon } from "lucide-react";

export type PromptActionId = string;

export interface PromptActionDef {
  id: PromptActionId;
  /** Texte inséré après @ */
  mention: string;
  label: string;
  description: string;
  icon: LucideIcon;
  requiresImage: boolean;
}

export const PROMPT_ACTIONS: PromptActionDef[] = [];

export function promptActionById(id: PromptActionId): PromptActionDef | undefined {
  return PROMPT_ACTIONS.find((a) => a.id === id);
}

export function promptActionFromText(text: string): PromptActionDef | null {
  for (const action of PROMPT_ACTIONS) {
    const re = new RegExp(`@${action.mention}(?:\\s|$)`, "i");
    if (re.test(text)) return action;
  }
  return null;
}

export function filterPromptActions(query: string): PromptActionDef[] {
  const q = query.toLowerCase();
  return PROMPT_ACTIONS.filter(
    (a) =>
      a.mention.toLowerCase().includes(q) ||
      a.label.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q),
  );
}
