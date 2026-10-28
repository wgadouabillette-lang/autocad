import { resolveMentionEmails } from "./mailSkill";
import type { MentionablePerson } from "./promptPeopleMentions";
import { parsePeopleMentionsFromText } from "./promptPeopleMentions";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function isMailSendRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 4000) return false;
  if (/(?:^|\s)\/mail\b/i.test(trimmed)) return false;
  if (/^(comment|how|pourquoi|why|c'est quoi|qu'est-ce)\b/i.test(trimmed)) return false;
  if (
    /\b(reçu|recu|received|inbox|boîte|boite|lire|lu)\b/i.test(trimmed) &&
    !/\b(envoy\w*|envoi\w*|send|écri\w*|ecri\w*|write|mailer)\b/i.test(trimmed)
  ) {
    return false;
  }
  const hasMail = /\b(e-?mails?|courriels?|gmail|mails?)\b/i.test(trimmed);
  if (!hasMail) return false;
  const hasSend =
    /\b(envoy\w*|envoi\w*|écri\w*|ecri\w*|send|write|mailer|expédi\w*|expedi\w*|rédige\w*|redige\w*|balance)\b/i.test(
      trimmed,
    );
  const hasTarget = /(?:^|\s)(?:à|a|to|pour|for)\s+\S+/i.test(trimmed);
  return hasSend || hasTarget;
}

function explicitSubject(text: string): string | null {
  const match = text.match(
    /\b(?:objet|subject|au sujet de|concernant|about)\s*[:\-]?\s+([^,.\n!?]+)/i,
  );
  const value = match?.[1]?.trim().replace(/^(?:de|du|des|d'|the)\s+/i, "");
  if (!value || value.length < 2) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function rawTarget(text: string): string | null {
  const mailAt = text.search(/\b(e-?mails?|courriels?|gmail)\b/i);
  const slice = mailAt >= 0 ? text.slice(mailAt) : text;
  const match = slice.match(/(?:^|\s)(?:à|a|to|pour|for)\s+(.+)/i);
  if (!match?.[1]) return null;
  let value =
    match[1].split(
      /\b(?:objet|subject|au sujet|concernant|about|pour lui|pour leur|afin de|disant|dis[- ]lui)\b/i,
    )[0] ?? "";
  value = value.replace(/[?.!].*$/, "").trim();
  value = value.replace(/^(?:un|une|le|la|les|the|an)\s+/i, "");
  const cleaned = value.split(/\s+/).filter(Boolean).slice(0, 4).join(" ").replace(/[,:;]+$/g, "").trim();
  if (!cleaned || /^(e-?mail|courriel|gmail|mail|moi|me|lui|propos)$/i.test(cleaned)) return null;
  return cleaned;
}

function peopleNamedInText(text: string, people: MentionablePerson[]): MentionablePerson[] {
  const fromMentions = parsePeopleMentionsFromText(text, people);
  const seen = new Set(fromMentions.map((entry) => entry.person.id));
  const found = [...fromMentions];
  const plain = normalize(text);

  for (const target of people) {
    if (seen.has(target.person.id)) continue;
    const full = normalize(target.person.name).trim();
    const first = full.split(/\s+/)[0] ?? "";
    const handle = normalize(target.mention).replace(/^@/, "");
    const candidates = [full, handle].filter((name) => name.length >= 2);
    if (first.length >= 3) candidates.push(first);
    const hit = candidates.some((name) =>
      new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escapeRegex(name)}(?!@)(?=$|[^\\p{L}\\p{N}_])`, "iu").test(plain),
    );
    if (!hit) continue;
    seen.add(target.person.id);
    found.push(target);
  }

  return found;
}

export interface MailSendDraft {
  to: string[];
  subject: string;
  body: string;
  /** Adresses affichées sur la carte. */
  label: string;
}

export interface MailChatTurn {
  role: string;
  text: string;
  source?: string;
  calendarAdd?: unknown;
  mailSend?: unknown;
}

const EMAIL_TEST = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const SUBJECT_DECLINE_RE =
  /^(?:rien|aucun(?:e)?(?:\s+(?:objet|titre))?|pas d['’]objet|sans objet|sans titre|no subject|pas de titre)$/i;

function mentionsSelf(text: string): boolean {
  if (/\b(moi-même|moi meme|myself|nous-mêmes?|nous memes?)\b/i.test(text)) return true;
  if (/(?:^|\s)(?:à|a|pour|to)\s+(moi|me|myself)\b/i.test(text)) return true;
  if (
    /\b(?:envoie[z]?-moi|envoie[z]?\s+moi)\b/i.test(text) &&
    !/(?:^|\s)(?:à|a|to|pour)\s+(?!moi\b|me\b|myself\b)\S+/i.test(text)
  ) {
    return true;
  }
  return false;
}

function isRecipientOnly(line: string, people: MentionablePerson[]): boolean {
  const trimmed = line.trim().replace(/[?.!]+$/g, "");
  if (!trimmed || trimmed.length > 80) return false;
  if (/^(?:moi|me|myself|moi-même|moi meme|nous-mêmes?|nous memes?)$/i.test(trimmed)) return true;
  if (EMAIL_TEST.test(trimmed) && trimmed.split(/\s+/).length === 1) return true;
  const withoutPrep = trimmed.replace(/^(?:à|to|pour|for)\s+/i, "");
  const named = peopleNamedInText(trimmed, people);
  if (named.length === 1) {
    const target = named[0]!;
    const full = normalize(target.person.name);
    const first = full.split(/\s+/)[0] ?? "";
    const plain = normalize(withoutPrep);
    if (plain === full || plain === first || plain === normalize(target.mention.replace(/^@/, ""))) return true;
  }
  return /^(?:à|to|pour|for)\s+\S+$/i.test(trimmed);
}

function subjectFromLine(line: string): string | null {
  const match = line.trim().match(/^(?:objet|sujet|subject|titre|title)\s*[:\-]?\s+(.+)/i);
  const value = match?.[1]?.trim().replace(/[?.!]+$/g, "");
  if (!value || value.length < 2) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function explicitBody(text: string): string | null {
  const patterns = [
    /\b(?:disant que|pour (?:lui |leur |te |me )?dire que|dis[- ]lui que|dis[- ]leur que|pour dire que)\s+([^\n]+)/i,
    /\b(?:contenu|message|corps|body)\s*[:\-]\s*([^\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const value = match[1]
      .replace(/\b(?:objet|sujet|subject|titre|title)\s*[:\-][\s\S]*$/i, "")
      .trim();
    if (value.length >= 2) return value;
  }
  return null;
}

function generatedSubject(body: string): string {
  const sentence = body.split(/[\n.!?]/)[0]?.trim() || body.trim();
  const clean = sentence.replace(/\s+/g, " ");
  const clipped = clean.length > 70 ? `${clean.slice(0, 67).trim()}…` : clean;
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}

function joinAsk(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

function mailAsk(missingAddress: boolean, missingBody: boolean, looseName: string | null): string {
  const missing: string[] = [];
  if (missingAddress) missing.push(looseName ? `l'adresse email de ${looseName}` : "à qui");
  if (missingBody) missing.push("le contenu");
  if (missing.length > 0) missing.push("l'objet");
  if (missingAddress && missingBody && !looseName) {
    return "C'est pour qui, quel est le contenu, et quel objet ?";
  }
  if (looseName && missingAddress) {
    const rest = missing.filter((part) => part !== `l'adresse email de ${looseName}`);
    if (rest.length === 0) return `Je n'ai pas l'adresse de ${looseName}. Quel email ?`;
    return `Je n'ai pas l'adresse de ${looseName}. Il me faut aussi ${joinAsk(rest)}.`;
  }
  if (missing.length === 1 && missing[0] === "le contenu") return "Quel est le contenu du mail ?";
  if (missing.length === 1 && missing[0] === "à qui") return "C'est pour qui ?";
  return `Il me faut encore ${joinAsk(missing)}.`;
}

/** Les réponses suivantes complètent le même envoi, jusqu'à la carte Send. */
export function mailFollowUpText(prior: MailChatTurn[], current: string): string {
  if (/\bvolume\b/i.test(current)) return current;
  if (
    /\b(calendrier|calendar|agenda|horaire|rendez-vous|rdv)\b/i.test(current) &&
    !isMailSendRequest(current)
  ) {
    return current;
  }
  if (/\b(joue|jouer|play)\b/i.test(current) && !isMailSendRequest(current)) return current;
  let anchor = -1;
  for (let index = prior.length - 1; index >= 0; index -= 1) {
    const message = prior[index];
    if (message?.mailSend || message?.calendarAdd) break;
    if (message?.role === "assistant" && message.source === "play-skill") break;
    if (
      message?.role === "user" &&
      /\b(calendrier|calendar|agenda|horaire|rendez-vous)\b/i.test(message.text) &&
      !isMailSendRequest(message.text)
    ) {
      break;
    }
    if (message?.role === "user" && isMailSendRequest(message.text)) {
      anchor = index;
      break;
    }
  }
  if (anchor < 0) return current;
  if (isMailSendRequest(current) && explicitBody(current) && (mentionsSelf(current) || EMAIL_TEST.test(current))) {
    return current;
  }
  const parts = [prior[anchor]!.text];
  for (let index = anchor + 1; index < prior.length; index += 1) {
    const message = prior[index];
    if (message?.role === "user" && message.text.trim()) parts.push(message.text.trim());
  }
  parts.push(current.trim());
  return parts.join("\n");
}

export function formatMailSendPrompt(draft: MailSendDraft): string {
  const same = draft.subject.trim().toLowerCase() === draft.body.trim().toLowerCase();
  const lead = `Envoyer « ${draft.subject} » à ${draft.label} ?`;
  return same ? lead : `${lead}\n\n${draft.body}`;
}

export async function resolveMailSend(
  text: string,
  people: MentionablePerson[],
  selfEmail: string,
): Promise<MailSendDraft | { ask: string } | null> {
  if (!isMailSendRequest(text)) return null;

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const emails = Array.from(text.matchAll(EMAIL_RE), (match) => match[0].toLowerCase());
  const matched = peopleNamedInText(text, people);
  const self = mentionsSelf(text);
  let subject = explicitSubject(text);
  let subjectDeclined = false;
  const bodyParts: string[] = [];
  const stated = explicitBody(text);
  if (stated) bodyParts.push(stated);

  for (const line of lines) {
    if (line === lines[0] && isMailSendRequest(line)) continue;
    if (SUBJECT_DECLINE_RE.test(line)) {
      subjectDeclined = true;
      continue;
    }
    const lineSubject = subjectFromLine(line);
    if (lineSubject) {
      subject = lineSubject;
      continue;
    }
    if (isRecipientOnly(line, people)) continue;
    if (stated && stated.includes(line)) continue;
    bodyParts.push(line);
  }

  const body = bodyParts.join("\n").trim();
  const looseName = matched.length === 0 && emails.length === 0 && !self ? rawTarget(text) : null;
  const hasAddress = matched.length > 0 || emails.length > 0 || self;
  if (!body || !hasAddress) {
    return { ask: mailAsk(!hasAddress, !body, looseName) };
  }

  const { emails: mentionEmails, unresolved } = await resolveMentionEmails(matched);
  const to: string[] = [];
  const seen = new Set<string>();
  const push = (email: string) => {
    const value = email.trim().toLowerCase();
    if (!value || seen.has(value)) return;
    seen.add(value);
    to.push(value);
  };
  if (self && selfEmail.trim()) push(selfEmail);
  for (const email of mentionEmails) push(email);
  for (const email of emails) push(email);

  if (unresolved.length > 0 || (self && !selfEmail.trim() && to.length === 0)) {
    if (unresolved.length > 0) {
      return { ask: `Je n'ai pas l'adresse de ${unresolved.join(" et ")}. Quel email ?` };
    }
    return { ask: "Je n'ai pas ton adresse email." };
  }
  if (to.length === 0) {
    return { ask: mailAsk(true, false, looseName) };
  }

  const finalSubject = subject && !subjectDeclined ? subject : generatedSubject(body);
  return {
    to,
    subject: finalSubject,
    body,
    label: to.join(", "),
  };
}
