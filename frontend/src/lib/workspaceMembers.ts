export interface WorkspaceMember {
  id: string;
  name: string;
}

/** Anciens personnages fictifs — exclus partout, jamais persistés. */
export const LEGACY_MOCK_MEMBER_IDS = new Set([
  "alice",
  "bob",
  "diana",
  "sara",
  "marc",
  "tom",
  "yu",
  "emma",
  "leo",
  "nina",
  "alex",
  "camille",
  "jules",
  "mina",
  "oscar",
  "priya",
  "hugo",
  "ines",
  "lucas",
  "marie",
]);

/** Membres réels uniquement — pas de personnages fictifs pré-remplis. */
export const WORKSPACE_MEMBERS: Record<string, WorkspaceMember[]> = {};

export function isLegacyMockMemberId(userId: string): boolean {
  return LEGACY_MOCK_MEMBER_IDS.has(userId);
}

export function workspaceMembers(workspaceId: string): WorkspaceMember[] {
  return (WORKSPACE_MEMBERS[workspaceId] ?? []).filter(
    (member) => !isLegacyMockMemberId(member.id),
  );
}
