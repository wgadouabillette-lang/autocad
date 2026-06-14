/** Workspace = serveur Discord : espace indépendant avec propriétaire et membres. */
export type ServerRole = "owner" | "member";

export const LOCAL_USER_ID = "local";

export interface Workspace {
  id: string;
  name: string;
  accent: string;
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

/** Serveurs publics — rejoignables en tant que membre. */
export const PUBLIC_SERVERS: Workspace[] = [
  {
    id: "forma",
    name: "Lyte HQ",
    accent: "#5865f2",
    ownerId: "forma-team",
    ownerName: "Lyte Team",
    createdAt: 0,
  },
  {
    id: "studio-lumen",
    name: "Studio Lumen",
    accent: "#57f287",
    ownerId: "studio-lumen-team",
    ownerName: "Studio Lumen",
    createdAt: 0,
  },
  {
    id: "weekend-build",
    name: "Weekend Build",
    accent: "#fee75c",
    ownerId: "weekend-build-team",
    ownerName: "Weekend Build",
    createdAt: 0,
  },
  {
    id: "design-lab",
    name: "Design Lab",
    accent: "#eb459e",
    ownerId: "design-lab-team",
    ownerName: "Design Lab",
    createdAt: 0,
  },
  {
    id: "product-sync",
    name: "Product Sync",
    accent: "#00a8fc",
    ownerId: "product-sync-team",
    ownerName: "Product Sync",
    createdAt: 0,
  },
];

export const DEFAULT_WORKSPACE_ID = PUBLIC_SERVERS[0].id;

/** Anciens identifiants (salons texte / sous-groupes) → serveurs. */
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

export function serverRoleLabel(role: ServerRole): string {
  return role === "owner" ? "Propriétaire" : "Membre";
}

export function canManageWorkspace(role: ServerRole | null): boolean {
  return role === "owner";
}
