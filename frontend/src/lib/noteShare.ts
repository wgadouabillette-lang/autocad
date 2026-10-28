import { loadUserDirectoryByUid } from "./firebase/userData";
import { sendGmailMessage, type GmailSendAttachment } from "./connectorsApi";
import { plainTextFromNoteHtml } from "./notesFullscreenPromo";
import { sanitizeNoteHtml } from "./sanitizeHtml";

const SHARE_BLOCK_RE = /\[SHARE\]([\s\S]*?)\[\/SHARE\]/i;
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const MAX_NOTES_IN_PROMPT = 30;
const NOTE_EXCERPT_CHARS = 600;
const MAX_ATTACHMENTS = 10;

export interface NoteShareSource {
  id: string;
  title: string;
  kind?: string;
  updatedAt: number;
  manualNoteTitle?: string;
  manualNoteBody?: string;
  messages?: { text?: string }[];
}

export interface NoteShareColleague {
  id: string;
  name: string;
}

export interface OwnedNoteFile {
  id: string;
  title: string;
  bodyHtml: string;
  plain: string;
  updatedAt: number;
}

export interface NoteShareRequest {
  noteTokens: string[];
  colleagueTokens: string[];
  subject: string;
}

const emailCache = new Map<string, string | null>();

function noteTitle(source: NoteShareSource): string {
  const title = source.manualNoteTitle?.trim() || source.title.trim();
  return title || "Note";
}

function noteHtml(source: NoteShareSource): string {
  return (source.manualNoteBody ?? source.messages?.[0]?.text ?? "").trim();
}

export function listOwnedNoteFiles(sources: NoteShareSource[]): OwnedNoteFile[] {
  const byId = new Map<string, NoteShareSource>();
  for (const source of sources) {
    if (source.kind !== "note") continue;
    const current = byId.get(source.id);
    if (!current || source.updatedAt >= current.updatedAt) byId.set(source.id, source);
  }

  const files: OwnedNoteFile[] = [];
  for (const source of byId.values()) {
    const bodyHtml = noteHtml(source);
    const plain = plainTextFromNoteHtml(bodyHtml).replace(/\s+/g, " ").trim();
    if (!plain && !noteTitle(source)) continue;
    if (!plain && noteTitle(source) === "Note") continue;
    files.push({
      id: source.id,
      title: noteTitle(source),
      bodyHtml,
      plain,
      updatedAt: source.updatedAt,
    });
  }
  return files.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function collectNoteShareColleagues(input: {
  localUserId: string;
  threads: { personId: string; personName: string }[];
  roster: Record<string, { displayName: string }>;
}): NoteShareColleague[] {
  const seen = new Set<string>();
  const out: NoteShareColleague[] = [];
  const push = (id: string, name: string) => {
    const trimmed = id.trim();
    if (!trimmed || trimmed === input.localUserId || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push({ id: trimmed, name: name.trim() || "Collègue" });
  };
  for (const thread of input.threads) push(thread.personId, thread.personName);
  for (const [id, entry] of Object.entries(input.roster)) push(id, entry.displayName);
  return out.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

async function emailForColleague(person: NoteShareColleague): Promise<string | null> {
  if (person.id.startsWith("email:")) {
    const email = person.id.slice("email:".length).trim().toLowerCase();
    return EMAIL_RE.test(email) ? email : null;
  }
  if (EMAIL_RE.test(person.id)) return person.id.toLowerCase();
  if (emailCache.has(person.id)) return emailCache.get(person.id) ?? null;
  const directory = await loadUserDirectoryByUid(person.id).catch(() => null);
  const email = directory?.email?.trim().toLowerCase() ?? "";
  const value = EMAIL_RE.test(email) ? email : null;
  emailCache.set(person.id, value);
  return value;
}

function excerpt(plain: string): string {
  const clean = plain.replace(/\s+/g, " ").trim();
  if (clean.length <= NOTE_EXCERPT_CHARS) return clean;
  return `${clean.slice(0, NOTE_EXCERPT_CHARS).trim()}…`;
}

export async function buildNoteSharePrompt(input: {
  sources: NoteShareSource[];
  colleagues: NoteShareColleague[];
  gmailConnected: boolean;
}): Promise<string> {
  const notes = listOwnedNoteFiles(input.sources);
  const shown = notes.slice(0, MAX_NOTES_IN_PROMPT);
  const hidden = notes.length - shown.length;
  const resolved = await Promise.all(
    input.colleagues.map(async (person) => ({
      person,
      email: await emailForColleague(person),
    })),
  );

  const noteLines =
    shown.length === 0
      ? ["(aucune note enregistrée)"]
      : shown.map(
          (note) =>
            `- id: ${note.id} | titre: ${note.title} | extrait: ${excerpt(note.plain) || "(vide)"}`,
        );
  if (hidden > 0) {
    noteLines.push(
      `- ${hidden} note(s) plus ancienne(s), non listées. Demande laquelle si le titre n'est pas ci-dessus.`,
    );
  }

  const colleagueLines =
    resolved.length === 0
      ? ["(aucun collègue)"]
      : resolved.map(
          ({ person, email }) =>
            `- id: ${person.id} | nom: ${person.name} | email: ${email ?? "inconnue"}`,
        );

  return [
    "Notes que l'utilisateur possède. Ce sont les seuls fichiers qu'il peut partager. N'invente aucun fichier.",
    ...noteLines,
    "",
    "Collègues de l'utilisateur. Ce sont les seules personnes qui peuvent recevoir ces notes par email. N'invente aucune personne ni aucune adresse.",
    ...colleagueLines,
    "",
    `Gmail: ${input.gmailConnected ? "connecté" : "non connecté"}.`,
    "Si Gmail n'est pas connecté, dis-le et n'ajoute pas de bloc SHARE.",
    "Quand l'utilisateur demande de partager ou d'envoyer une ou plusieurs de ces notes à un ou plusieurs de ces collègues :",
    "si le fichier ou le collègue est ambigu ou absent, demande lequel et n'ajoute pas de bloc.",
    "S'il parle de toutes ses notes, écris notes: all. S'il parle de tous ses collègues, écris to: all.",
    "Sinon confirme brièvement dans la langue de l'utilisateur, puis ajoute :",
    "[SHARE]",
    "notes: ids exacts, séparés par des virgules, ou all",
    "to: ids exacts des collègues, séparés par des virgules, ou all",
    "subject: objet court",
    "[/SHARE]",
    "L'application joint les vrais fichiers et envoie l'email tout de suite.",
    "N'utilise pas gmail.send pour ces notes. Ne recopie pas le contenu de la note dans la réponse.",
    "Si une consigne demande du Markdown, ajoute quand même le bloc SHARE quand l'envoi est prêt.",
  ].join("\n");
}

function noteMentioned(text: string, note: OwnedNoteFile, notes: OwnedNoteFile[]): boolean {
  const lowered = text.toLowerCase();
  const title = note.title.toLowerCase();
  if (title.length >= 3 && lowered.includes(title)) return true;
  const words = title.split(/\s+/).filter((word) => word.length >= 4);
  return words.some((word) => {
    if (!lowered.includes(word)) return false;
    return notes.filter((item) => item.title.toLowerCase().includes(word)).length === 1;
  });
}

function colleagueMentioned(
  text: string,
  person: NoteShareColleague,
  colleagues: NoteShareColleague[],
): boolean {
  const lowered = text.toLowerCase();
  const name = person.name.toLowerCase();
  if (name.length >= 3 && lowered.includes(name)) return true;
  const first = name.split(/\s+/)[0] ?? "";
  if (first.length < 3) return false;
  const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`\\b${escaped}\\b`, "i").test(text)) return false;
  return colleagues.filter((item) => item.name.toLowerCase().split(/\s+/)[0] === first).length === 1;
}

/** Envoi direct quand la demande nomme déjà les notes et les collègues. */
export function resolveDirectNoteShare(
  text: string,
  notes: OwnedNoteFile[],
  colleagues: NoteShareColleague[],
  activeNoteId?: string | null,
): { action: "send"; request: NoteShareRequest } | { action: "ask" } | null {
  const share =
    /\b(partage|partager|envoie|envoyer|envoi|e-?mail|transmets|transmettre)\b/i.test(text) &&
    /\b(notes?|fichiers?)\b/i.test(text);
  if (!share) return null;

  const namedNotes = notes.filter((note) => noteMentioned(text, note, notes));
  const wantsAllNotes =
    /\b(toutes?(?:\s+les|\s+mes)?\s+notes|all notes|my notes)\b/i.test(text) ||
    /\bmes notes\b(?=\s+(?:avec|à|a|aux|to|for)\b)/i.test(text);
  const wantsOpenNote = /\b(cette note|la note ouverte|this note|the open note)\b/i.test(text);
  let noteTokens: string[] | null = null;
  if (namedNotes.length > 0) noteTokens = namedNotes.map((note) => note.id);
  else if (wantsOpenNote && activeNoteId && notes.some((note) => note.id === activeNoteId)) {
    noteTokens = [activeNoteId];
  } else if (wantsAllNotes) noteTokens = ["all"];
  else if (/\b(ma note|la note|my note|the note)\b/i.test(text) && notes.length === 1) {
    noteTokens = ["all"];
  }

  const namedPeople = colleagues.filter((person) => colleagueMentioned(text, person, colleagues));
  let colleagueTokens: string[] | null = null;
  if (namedPeople.length > 0) colleagueTokens = namedPeople.map((person) => person.id);
  else if (/\b(coll[eè]gues?|coworkers?|tout le monde|everyone)\b/i.test(text)) colleagueTokens = ["all"];

  if (!noteTokens || !colleagueTokens) return { action: "ask" };
  return {
    action: "send",
    request: { noteTokens, colleagueTokens, subject: "" },
  };
}

export function stripNoteShareBlock(text: string): string {
  return text.replace(SHARE_BLOCK_RE, "").trim();
}

function parseFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([a-z]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    fields[match[1]!.toLowerCase()] = (match[2] ?? "").trim();
  }
  return fields;
}

function splitTokens(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseNoteShareBlock(text: string): NoteShareRequest | null {
  const match = text.match(SHARE_BLOCK_RE);
  if (!match?.[1]) return null;
  const fields = parseFields(match[1]);
  const noteTokens = splitTokens(fields.notes ?? "");
  const colleagueTokens = splitTokens(fields.to ?? "");
  if (noteTokens.length === 0 || colleagueTokens.length === 0) return null;
  return {
    noteTokens,
    colleagueTokens,
    subject: fields.subject?.trim() ?? "",
  };
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function resolveNotes(tokens: string[], notes: OwnedNoteFile[]): { notes: OwnedNoteFile[]; error?: string } {
  if (tokens.length === 1 && tokens[0]!.toLowerCase() === "all") {
    return { notes };
  }
  const picked: OwnedNoteFile[] = [];
  for (const token of tokens) {
    const exact = notes.find((note) => note.id === token);
    if (exact) {
      picked.push(exact);
      continue;
    }
    const lowered = token.toLowerCase();
    const byTitle = notes.filter((note) => note.title.toLowerCase() === lowered);
    if (byTitle.length === 1) {
      picked.push(byTitle[0]!);
      continue;
    }
    if (byTitle.length > 1) {
      return { notes: [], error: `Plusieurs notes s'appellent « ${token} ».` };
    }
    return { notes: [], error: `Je n'ai pas cette note : « ${token} ».` };
  }
  return { notes: uniqueBy(picked, (note) => note.id) };
}

function resolveColleagues(
  tokens: string[],
  colleagues: NoteShareColleague[],
): { colleagues: NoteShareColleague[]; error?: string } {
  if (tokens.length === 1 && tokens[0]!.toLowerCase() === "all") {
    return { colleagues };
  }
  const picked: NoteShareColleague[] = [];
  for (const token of tokens) {
    const lowered = token.toLowerCase().replace(/^@/, "");
    const exact = colleagues.find(
      (person) => person.id === token || person.id.toLowerCase() === lowered,
    );
    if (exact) {
      picked.push(exact);
      continue;
    }
    const byName = colleagues.filter((person) => {
      const name = person.name.toLowerCase();
      if (name === lowered) return true;
      return lowered.length >= 3 && name.includes(lowered);
    });
    const uniqueNames = uniqueBy(byName, (person) => person.id);
    if (uniqueNames.length === 1) {
      picked.push(uniqueNames[0]!);
      continue;
    }
    if (uniqueNames.length > 1) {
      return { colleagues: [], error: `Plusieurs collègues correspondent à « ${token} ».` };
    }
    return { colleagues: [], error: `« ${token} » n'est pas un collègue.` };
  }
  return { colleagues: uniqueBy(picked, (person) => person.id) };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function noteFileHtml(title: string, bodyHtml: string): string {
  const body = sanitizeNoteHtml(bodyHtml).trim() || `<p>${escapeHtml(plainTextFromNoteHtml(bodyHtml))}</p>`;
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;
}

function fileName(title: string, used: Set<string>): string {
  const base = title.replace(/[^\w.\- ]+/g, " ").trim().slice(0, 80) || "note";
  let name = `${base}.html`;
  let index = 2;
  while (used.has(name.toLowerCase())) {
    name = `${base}-${index}.html`;
    index += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function attachmentFromHtml(filename: string, html: string): GmailSendAttachment {
  const bytes = new TextEncoder().encode(html);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return {
    filename,
    mimeType: "text/html; charset=utf-8",
    contentBase64: btoa(binary),
  };
}

export async function deliverOwnedNotesByEmail(input: {
  request: NoteShareRequest;
  sources: NoteShareSource[];
  colleagues: NoteShareColleague[];
  gmailConnected: boolean;
}): Promise<{ ok: boolean; message: string }> {
  if (!input.gmailConnected) {
    return {
      ok: false,
      message: "Gmail n'est pas connecté. Reconnecte-le dans Paramètres → Connectors pour envoyer les notes.",
    };
  }

  const owned = listOwnedNoteFiles(input.sources);
  if (owned.length === 0) {
    return { ok: false, message: "Tu n'as aucune note enregistrée à envoyer." };
  }
  const notes = resolveNotes(input.request.noteTokens, owned);
  if (notes.error || notes.notes.length === 0) {
    return { ok: false, message: notes.error || "Aucune note à envoyer." };
  }
  const people = resolveColleagues(input.request.colleagueTokens, input.colleagues);
  if (people.error || people.colleagues.length === 0) {
    return { ok: false, message: people.error || "Aucun collègue à qui envoyer la note." };
  }

  const addressed = await Promise.all(
    people.colleagues.map(async (person) => ({
      person,
      email: await emailForColleague(person),
    })),
  );
  const recipients = uniqueBy(
    addressed.filter((entry): entry is { person: NoteShareColleague; email: string } => !!entry.email),
    (entry) => entry.email,
  );
  const missing = addressed.filter((entry) => !entry.email).map((entry) => entry.person.name);
  if (recipients.length === 0) {
    return {
      ok: false,
      message: `Aucune adresse email pour ${missing.join(", ")}.`,
    };
  }

  const attached = notes.notes.slice(0, MAX_ATTACHMENTS);
  const skipped = notes.notes.slice(MAX_ATTACHMENTS);
  const usedNames = new Set<string>();
  const attachments = attached.map((note) =>
    attachmentFromHtml(fileName(note.title, usedNames), noteFileHtml(note.title, note.bodyHtml)),
  );
  const titles = attached.map((note) => note.title).join(", ");
  const names = recipients.map((entry) => entry.person.name).join(", ");
  const subject = input.request.subject.trim() || `Notes : ${titles}`;
  const body = [`Voici ${attached.length > 1 ? "les notes" : "la note"} en pièce jointe :`, ...attached.map((note) => `- ${note.title}`)].join(
    "\n",
  );

  try {
    await sendGmailMessage({
      to: recipients.map((entry) => entry.email),
      subject,
      body,
      attachments,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Impossible d'envoyer l'email.";
    if (detail.includes("gmail_send_scope_required") || detail.includes("insufficient")) {
      return {
        ok: false,
        message: "Reconnecte Gmail dans Paramètres → Connectors pour autoriser l'envoi.",
      };
    }
    return { ok: false, message: detail };
  }

  const extra = [
    missing.length ? `Sans adresse : ${missing.join(", ")}.` : "",
    skipped.length ? `${skipped.length} note(s) en trop n'ont pas été jointes.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    ok: true,
    message: `Notes envoyées à ${names} : ${titles}.${extra ? ` ${extra}` : ""}`,
  };
}
