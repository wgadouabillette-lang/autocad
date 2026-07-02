import type { Person } from "./peopleChat";

export type WorkspaceBroadcastMention = "here" | "everyone";

export interface WorkspaceChannelMentionMember {
  person: Person;
  mention: string;
}

export const WORKSPACE_BROADCAST_MENTIONS = [
  {
    id: "here" as const,
    mention: "here",
    label: "@here",
    description: "Notifier les personnes en ligne",
  },
  {
    id: "everyone" as const,
    mention: "everyone",
    label: "@everyone",
    description: "Notifier tout le workspace",
  },
];

export type WorkspaceChannelMentionMenuItem =
  | { kind: "person"; target: WorkspaceChannelMentionMember }
  | { kind: "broadcast"; broadcast: (typeof WORKSPACE_BROADCAST_MENTIONS)[number] };

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function workspaceMembersForMentions(
  membersByWorkspace: Record<string, Record<string, { displayName: string }>>,
  workspaceId: string,
  localUserId?: string | null,
): WorkspaceChannelMentionMember[] {
  const members = membersByWorkspace[workspaceId] ?? {};
  return Object.entries(members)
    .filter(([id]) => id && id !== localUserId)
    .map(([id, entry]) => ({
      person: { id, name: entry.displayName.trim() || "Membre", handle: id },
      mention: id,
    }))
    .sort((a, b) => a.person.name.localeCompare(b.person.name, "fr"));
}

export function filterWorkspaceChannelMentionMenu(
  query: string,
  members: WorkspaceChannelMentionMember[],
): WorkspaceChannelMentionMenuItem[] {
  const q = query.trim().toLowerCase();
  const items: WorkspaceChannelMentionMenuItem[] = [];

  for (const broadcast of WORKSPACE_BROADCAST_MENTIONS) {
    if (
      !q ||
      broadcast.mention.includes(q) ||
      broadcast.label.toLowerCase().includes(q) ||
      broadcast.description.toLowerCase().includes(q)
    ) {
      items.push({ kind: "broadcast", broadcast });
    }
  }

  for (const target of members) {
    if (
      !q ||
      target.mention.toLowerCase().includes(q) ||
      target.person.name.toLowerCase().includes(q)
    ) {
      items.push({ kind: "person", target });
    }
  }

  return items.slice(0, 10);
}

export interface ParsedWorkspaceChannelMentions {
  mentionedUids: string[];
  broadcast: WorkspaceBroadcastMention | null;
}

export function parseWorkspaceChannelMentions(
  text: string,
  members: WorkspaceChannelMentionMember[],
): ParsedWorkspaceChannelMentions {
  const mentionedUids: string[] = [];
  const seen = new Set<string>();

  for (const target of members) {
    const re = new RegExp(`@${escapeRegex(target.mention)}(?=\\s|$)`, "i");
    if (re.test(text) && !seen.has(target.person.id)) {
      seen.add(target.person.id);
      mentionedUids.push(target.person.id);
    }
  }

  let broadcast: WorkspaceBroadcastMention | null = null;
  if (/@everyone(?=\s|$)/i.test(text)) broadcast = "everyone";
  else if (/@here(?=\s|$)/i.test(text)) broadcast = "here";

  return { mentionedUids, broadcast };
}

export function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { start: at, query };
}

export function mentionHandlesForWorkspaceChannel(
  members: WorkspaceChannelMentionMember[],
): string[] {
  return [...new Set([...members.map((member) => member.mention), "here", "everyone"])];
}

export function userShouldNotifyForWorkspaceMention(opts: {
  uid: string;
  authorUid: string;
  mentionedUids: string[];
  broadcast: WorkspaceBroadcastMention | null;
  workspaceId: string;
  isOnline: (workspaceId: string, userId: string) => boolean;
}): boolean {
  const { uid, authorUid, mentionedUids, broadcast, workspaceId, isOnline } = opts;
  if (uid === authorUid) return false;
  if (mentionedUids.includes(uid)) return true;
  if (broadcast === "everyone") return true;
  if (broadcast === "here") return isOnline(workspaceId, uid);
  return false;
}
