import type { CallUser } from "./calls";
import type { Person } from "./peopleChat";
import type { PeopleThread } from "./peopleChat";
import { filterPromptActions, type PromptActionDef } from "./promptActions";

export interface MentionablePerson {
  person: Person;
  section: "workspace" | "friends" | "colleagues";
  mention: string;
}

export type MentionMenuItem =
  | { kind: "person"; target: MentionablePerson }
  | { kind: "action"; action: PromptActionDef };

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function personFromParticipant(user: CallUser): Person | undefined {
  if (user.isLocal) return undefined;
  return {
    id: user.id,
    name: user.name,
    handle: user.id,
  };
}

export function mentionablePeopleForWorkspace(
  workspaceId: string,
  friends: Person[],
  colleagueThreads: PeopleThread[],
  callParticipants: CallUser[] = [],
  workspaceMembers: Person[] = [],
): MentionablePerson[] {
  const seen = new Set<string>();
  const out: MentionablePerson[] = [];

  const push = (person: Person, section: MentionablePerson["section"]) => {
    if (seen.has(person.id)) return;
    seen.add(person.id);
    out.push({ person, section, mention: person.handle });
  };

  for (const friend of friends) push(friend, "friends");
  for (const member of workspaceMembers) push(member, "workspace");
  for (const thread of colleagueThreads) {
    const person: Person = {
      id: thread.personId,
      name: thread.personName,
      handle: thread.personId,
    };
    push(person, "colleagues");
  }
  for (const user of callParticipants) {
    const person = personFromParticipant(user);
    if (person) push(person, "colleagues");
  }

  const sectionOrder: Record<MentionablePerson["section"], number> = {
    workspace: 0,
    colleagues: 1,
    friends: 2,
  };
  return out.sort((a, b) => {
    const sectionDiff = sectionOrder[a.section] - sectionOrder[b.section];
    if (sectionDiff !== 0) return sectionDiff;
    return a.person.name.localeCompare(b.person.name, "fr");
  });
}

export function filterMentionMenu(
  query: string,
  people: MentionablePerson[],
): MentionMenuItem[] {
  const q = query.trim().toLowerCase();
  const items: MentionMenuItem[] = [];

  for (const target of people) {
    if (
      !q ||
      target.mention.toLowerCase().includes(q) ||
      target.person.name.toLowerCase().includes(q)
    ) {
      items.push({ kind: "person", target });
    }
  }

  for (const action of filterPromptActions(query)) {
    items.push({ kind: "action", action });
  }

  return items.slice(0, 10);
}

export function personMentionToken(mention: string) {
  return `@${mention} `;
}

export function parsePeopleMentionsFromText(
  text: string,
  people: MentionablePerson[],
): MentionablePerson[] {
  const found: MentionablePerson[] = [];
  const seen = new Set<string>();

  for (const target of people) {
    const re = new RegExp(`@${escapeRegex(target.mention)}(?=\\s|$)`, "i");
    if (re.test(text) && !seen.has(target.person.id)) {
      seen.add(target.person.id);
      found.push(target);
    }
  }

  return found;
}

/** Retire les tokens @handle du texte utilisateur pour en déduire l'intention d'envoi. */
export function stripPeopleMentionTokens(text: string, people: MentionablePerson[]): string {
  let out = text;
  for (const target of people) {
    const re = new RegExp(`@${escapeRegex(target.mention)}(?=\\s|$)`, "gi");
    out = out.replace(re, "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

export function peopleHandlesForHighlight(people: MentionablePerson[]): string[] {
  return [...new Set(people.map((p) => p.mention))];
}

export function augmentPromptWithRecipients(
  prompt: string,
  mentions: MentionablePerson[],
): string {
  if (mentions.length === 0) return prompt;
  const list = mentions.map((m) => `${m.person.name} (@${m.mention})`).join(", ");
  return (
    `${prompt}\n\n` +
    `[Destinataires mentionnés : ${list}. ` +
    `Réponds d'abord à l'utilisateur, puis termine par un bloc :\n` +
    `[DISPATCH]\n@handle: message à envoyer\n[/DISPATCH]\n` +
    `avec une ligne par destinataire (@${mentions.map((m) => m.mention).join(", @")}).]`
  );
}

const DISPATCH_BLOCK_RE = /\[DISPATCH\]([\s\S]*?)\[\/DISPATCH\]/i;

export function parseDispatchBlock(assistantText: string): Record<string, string> {
  const match = assistantText.match(DISPATCH_BLOCK_RE);
  if (!match) return {};

  const out: Record<string, string> = {};
  for (const line of match[1].trim().split("\n")) {
    const parsed = line.match(/^@([a-z0-9._]+):\s*(.+)$/i);
    if (parsed) out[parsed[1].toLowerCase()] = parsed[2].trim();
  }
  return out;
}

export function stripDispatchBlock(text: string): string {
  return text.replace(DISPATCH_BLOCK_RE, "").trim();
}

export function resolvePersonThreadId(
  target: MentionablePerson,
  workspaceId: string,
  ensureColleagueThread: (
    workspaceId: string,
    personId: string,
    personName: string,
  ) => string,
): string {
  if (target.section === "friends") return `friend-${target.person.id}`;
  return ensureColleagueThread(workspaceId, target.person.id, target.person.name);
}

export function dispatchMessagesToMentionedPeople(opts: {
  userPrompt: string;
  assistantMessage: string;
  mentions: MentionablePerson[];
  workspaceId: string;
  sendMessage: (threadId: string, text: string) => void;
  ensureColleagueThread: (
    workspaceId: string,
    personId: string,
    personName: string,
  ) => string;
}): boolean {
  const { mentions } = opts;
  if (mentions.length === 0) return false;

  const dispatch = parseDispatchBlock(opts.assistantMessage);
  const fallback = stripPeopleMentionTokens(opts.userPrompt, mentions);
  const genericFallback =
    stripDispatchBlock(opts.assistantMessage) || opts.assistantMessage;

  for (const target of mentions) {
    const handle = target.mention.toLowerCase();
    const text =
      dispatch[handle] ??
      dispatch[target.person.handle.toLowerCase()] ??
      (fallback || genericFallback);
    if (!text.trim()) continue;

    const threadId = resolvePersonThreadId(
      target,
      opts.workspaceId,
      opts.ensureColleagueThread,
    );
    opts.sendMessage(threadId, text);
  }

  return true;
}
