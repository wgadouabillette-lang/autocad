const INVITE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Identifiant unique partageable pour rejoindre un workspace (ex. ws-k7m2p9xq). */
export function generateWorkspaceInviteId(): string {
  let suffix = "";
  for (let i = 0; i < 8; i += 1) {
    suffix += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return `ws-${suffix}`;
}

export function isWorkspaceInviteId(id: string): boolean {
  return /^ws-[a-z2-9]{8}$/.test(id.trim().toLowerCase());
}

/** Extrait l'identifiant depuis un code brut ou un lien d'invitation. */
export function parseWorkspaceInviteInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const fromParam = url.searchParams.get("workspace")?.trim();
    if (fromParam) return fromParam.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1]?.trim();
    if (last && (isWorkspaceInviteId(last) || last.includes("-"))) {
      return last.toLowerCase();
    }
  } catch {
    // Pas une URL — on traite la valeur telle quelle.
  }

  return trimmed.toLowerCase();
}

export function buildWorkspaceJoinUrl(workspaceId: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("workspace", workspaceId.trim().toLowerCase());
  return url.toString();
}
