/** Workspace = serveur Discord : espace indépendant avec propriétaire et membres. */
export type ServerRole = "owner" | "member";

export const LOCAL_USER_ID = "local";

/** Anciens workspaces publics de démo — retirés, isolés par compte. */
export const LEGACY_PUBLIC_WORKSPACE_IDS = new Set([
  "forma",
  "studio-lumen",
  "weekend-build",
  "design-lab",
  "product-sync",
]);

export interface Workspace {
  id: string;
  name: string;
  accent: string;
  iconURL?: string | null;
  ownerId: string;
  ownerName: string;
  createdAt: number;
}

export interface ServerMembership {
  workspaceId: string;
  userId: string;
  role: ServerRole;
  joinedAt: number;
}

/** Anciens identifiants (salons texte / sous-groupes) — conservés pour migration locale. */
export const LEGACY_WORKSPACE_IDS: Record<string, string> = {
  general: "forma",
  annonces: "forma",
  random: "forma",
  "grp-equipe": "studio-lumen",
  "grp-projet": "weekend-build",
};

const ACCENT_PALETTE = [
  "#5865f2",
  "#57f287",
  "#fee75c",
  "#eb459e",
  "#ed4245",
  "#f47fff",
  "#00a8fc",
];

export function normalizeWorkspaceId(id: string): string {
  return LEGACY_WORKSPACE_IDS[id] ?? id;
}

export function isLegacyPublicWorkspaceId(id: string): boolean {
  return LEGACY_PUBLIC_WORKSPACE_IDS.has(normalizeWorkspaceId(id));
}

export function workspaceInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "WS";
}

export function pickWorkspaceAccent(index: number): string {
  return ACCENT_PALETTE[index % ACCENT_PALETTE.length];
}

export function defaultPersonalWorkspaceName(ownerName: string): string {
  const trimmed = ownerName.trim();
  if (!trimmed || trimmed.toLowerCase() === "vous") return "Mon workspace";
  return `Workspace de ${trimmed}`;
}

export function serverRoleLabel(role: ServerRole): string {
  return role === "owner" ? "Propriétaire" : "Membre";
}

export function canManageWorkspace(role: ServerRole | null): boolean {
  return role === "owner";
}
