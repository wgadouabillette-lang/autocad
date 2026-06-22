import { loadUserDirectoryByUid } from "./firebase/userData";
import type { MentionablePerson } from "./promptPeopleMentions";
import { parsePeopleMentionsFromText } from "./promptPeopleMentions";
import { sendGmailMessage, type GmailSendAttachment } from "./connectorsApi";

export const MAIL_SKILL_TEMPLATE = `/mail`;

export interface MailPromptDraft {
  recipients: string;
  subject: string;
  body: string;
  attachmentNames: string[];
}

export interface MailSkillResult {
  ok: boolean;
  summary: string;
  recipientCount: number;
  error?: string;
  needsGmailReconnect?: boolean;
}

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isLikelyEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim().toLowerCase());
}

function dedupeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of emails) {
    const lower = email.trim().toLowerCase();
    if (!lower || seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
}

/** Raw email addresses typed in the recipients field (outside @mentions). */
export function parseRawEmailsFromRecipients(
  text: string,
  people: MentionablePerson[],
): string[] {
  let remainder = text;
  for (const target of people) {
    const re = new RegExp(`@${escapeRegex(target.mention)}(?=\\s|,|;|$)`, "gi");
    remainder = remainder.replace(re, " ");
  }

  const emails: string[] = [];
  for (const token of remainder.split(/[,;\s]+/)) {
    const cleaned = token.trim().replace(/^[<([{'"]+|[>)}'"]+$/g, "");
    if (isLikelyEmail(cleaned)) {
      emails.push(cleaned.toLowerCase());
    }
  }
  return dedupeEmails(emails);
}

/** Resolve @mentioned people to email addresses via userDirectory (uid → email). */
export async function resolveMentionEmails(
  mentions: MentionablePerson[],
): Promise<{ emails: string[]; unresolved: string[] }> {
  const emails: string[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();

  for (const target of mentions) {
    const person = target.person;
    const id = person.id.trim();
    const handle = person.handle.trim();

    if (id.startsWith("email:")) {
      const email = id.slice("email:".length).trim().toLowerCase();
      if (isLikelyEmail(email) && !seen.has(email)) {
        seen.add(email);
        emails.push(email);
      } else {
        unresolved.push(person.name);
      }
      continue;
    }

    if (isLikelyEmail(handle)) {
      const email = handle.toLowerCase();
      if (!seen.has(email)) {
        seen.add(email);
        emails.push(email);
      }
      continue;
    }

    const directory = await loadUserDirectoryByUid(id).catch(() => null);
    const email = directory?.email?.trim().toLowerCase() ?? "";
    if (email && isLikelyEmail(email) && !seen.has(email)) {
      seen.add(email);
      emails.push(email);
    } else {
      unresolved.push(person.name);
    }
  }

  return { emails, unresolved };
}

export function createDefaultMailDraft(): MailPromptDraft {
  return {
    recipients: "",
    subject: "",
    body: "",
    attachmentNames: [],
  };
}

export function isMailDraftReady(
  draft: MailPromptDraft,
  people: MentionablePerson[],
): boolean {
  const mentions = parsePeopleMentionsFromText(draft.recipients, people);
  const rawEmails = parseRawEmailsFromRecipients(draft.recipients, people);
  if (mentions.length === 0 && rawEmails.length === 0) return false;
  return draft.body.trim().length > 0;
}

export function buildMailDisplayText(
  draft: MailPromptDraft,
  people: MentionablePerson[],
): string {
  const mentions = parsePeopleMentionsFromText(draft.recipients, people);
  const rawEmails = parseRawEmailsFromRecipients(draft.recipients, people);
  const mentionLabels = mentions.map((m) => `@${m.mention}`).join(" ");
  const recipientLabel = [mentionLabels, rawEmails.join(", ")].filter(Boolean).join(" · ");
  const subject = draft.subject.trim() || "(Sans objet)";
  const attachmentSuffix =
    draft.attachmentNames.length > 0
      ? ` · ${draft.attachmentNames.length} fichier(s)`
      : "";
  return `/mail ${recipientLabel} · ${subject}${attachmentSuffix}`;
}

async function filesToAttachments(files: File[]): Promise<GmailSendAttachment[]> {
  const out: GmailSendAttachment[] = [];
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    out.push({
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      contentBase64: btoa(binary),
    });
  }
  return out;
}

export async function runMailSkill(input: {
  draft: MailPromptDraft;
  people: MentionablePerson[];
  attachments: File[];
}): Promise<MailSkillResult> {
  const { draft, people, attachments } = input;
  const body = draft.body.trim();
  if (!body) {
    return { ok: false, summary: "", recipientCount: 0, error: "Le message est vide." };
  }

  const mentions = parsePeopleMentionsFromText(draft.recipients, people);
  const rawEmails = parseRawEmailsFromRecipients(draft.recipients, people);
  const { emails: mentionEmails, unresolved } = await resolveMentionEmails(mentions);
  const emails = dedupeEmails([...mentionEmails, ...rawEmails]);

  if (unresolved.length > 0) {
    const names = unresolved.join(", ");
    return {
      ok: false,
      summary: "",
      recipientCount: 0,
      error: `Aucune adresse email pour : ${names}. Ajoutez une adresse email directement ou choisissez un autre destinataire.`,
    };
  }
  if (emails.length === 0) {
    return {
      ok: false,
      summary: "",
      recipientCount: 0,
      error: "Ajoutez au moins un destinataire (@nom ou adresse email).",
    };
  }

  try {
    const attachmentPayload =
      attachments.length > 0 ? await filesToAttachments(attachments) : undefined;
    const result = await sendGmailMessage({
      to: emails,
      subject: draft.subject.trim(),
      body,
      attachments: attachmentPayload,
    });

    const recipientLabel = emails.join(", ");
    return {
      ok: true,
      summary: `Email envoyé à **${recipientLabel}** depuis votre compte Gmail connecté.`,
      recipientCount: result.recipients?.length ?? emails.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible d'envoyer l'email.";
    const needsReconnect =
      message.includes("gmail_send_scope_required") ||
      message.includes("send permission") ||
      message.includes("insufficient");
    return {
      ok: false,
      summary: "",
      recipientCount: 0,
      error: needsReconnect
        ? "Reconnectez Gmail dans Paramètres → Plugins pour autoriser l'envoi d'emails."
        : message,
      needsGmailReconnect: needsReconnect,
    };
  }
}
