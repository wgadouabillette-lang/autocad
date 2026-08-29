/** Dismiss / reappear schedule for the fullscreen Notes Pro promo. */

import { hasAiNotesAccess } from "./subscriptionPlans";

const STORAGE_KEY = "forma-notes-fullscreen-promo-dismissed-at";

/** After dismiss, hide until this cooldown elapses (then the promo may show again). */
export const NOTES_FULLSCREEN_PROMO_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function isNotesFullscreenPromoDismissed(now = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt) || dismissedAt <= 0) return false;
    return now - dismissedAt < NOTES_FULLSCREEN_PROMO_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function dismissNotesFullscreenPromo(now = Date.now()): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    // ignore quota / private mode
  }
}

export function clearNotesFullscreenPromoDismissal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export type NotesEditorDraft = {
  title: string;
  bodyPlain: string;
};

let notesEditorDraft: NotesEditorDraft = { title: "", bodyPlain: "" };
const notesEditorDraftListeners = new Set<() => void>();

export function plainTextFromNoteHtml(html: string): string {
  if (!html) return "";
  if (typeof document === "undefined") {
    return html.replace(/<[^>]+>/g, " ");
  }
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.innerText || tmp.textContent || "";
}

/** True once the user has typed any character in the title or body (not waiting for save). */
export function notesEditorDraftHasContent(draft: NotesEditorDraft = notesEditorDraft): boolean {
  if (draft.title.length > 0) return true;
  const body = draft.bodyPlain.replace(/\u00a0/g, " ").replace(/\n/g, "");
  return body.length > 0;
}

export function getNotesEditorDraft(): NotesEditorDraft {
  return notesEditorDraft;
}

export function subscribeNotesEditorDraft(onStoreChange: () => void): () => void {
  notesEditorDraftListeners.add(onStoreChange);
  return () => {
    notesEditorDraftListeners.delete(onStoreChange);
  };
}

export function publishNotesEditorDraft(next: NotesEditorDraft): void {
  if (next.title === notesEditorDraft.title && next.bodyPlain === notesEditorDraft.bodyPlain) {
    return;
  }
  notesEditorDraft = next;
  notesEditorDraftListeners.forEach((listener) => listener());
}

export function clearNotesEditorDraft(): void {
  publishNotesEditorDraft({ title: "", bodyPlain: "" });
}

/**
 * Personal Pro / Stripe payer / workspace notes access — never show the upgrade block.
 * `hasAiNotesAccess` alone missed payers whose `subscriptionPlan` or `billingManaged`
 * was stale; hide if either personal-Pro signal is set.
 */
export function shouldHideNotesFullscreenPromoForBilling(input: {
  subscriptionPlan: unknown;
  billingManaged: unknown;
  workspaceEnterpriseActive?: unknown;
  configBillingManaged?: unknown;
}): boolean {
  if (input.subscriptionPlan === "pro") return true;
  if (input.billingManaged === true) return true;
  if (input.configBillingManaged === true) return true;
  return hasAiNotesAccess(
    input.subscriptionPlan === "pro" ? "pro" : "free",
    input.billingManaged === true,
    input.workspaceEnterpriseActive === true,
  );
}

/** Mount only on the fullscreen Notes tab editor — not history, recordings, or follow-up. */
export function isNotesEditorPromoSurface(input: {
  isMobileLayout: boolean;
  chatPanelExpanded: boolean;
  chatPanelMode: string;
  showChatHistory: boolean;
  showRecordingPlayback: boolean;
}): boolean {
  return (
    !input.isMobileLayout &&
    input.chatPanelExpanded &&
    input.chatPanelMode === "ai-notes" &&
    !input.showChatHistory &&
    !input.showRecordingPlayback
  );
}
