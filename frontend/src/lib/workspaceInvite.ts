const INVITE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const PUBLIC_APP_JOIN_ORIGIN = "https://meetra.cc";

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

function inviteIdFromPathParts(parts: string[]): string {
  const last = parts[parts.length - 1]?.trim().toLowerCase() ?? "";
  if (last && (isWorkspaceInviteId(last) || last.includes("-"))) return last;
  return "";
}

/** Extrait l'identifiant depuis un code brut ou un lien d'invitation. */
export function parseWorkspaceInviteInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const fromParam = url.searchParams.get("workspace")?.trim();
    if (fromParam) return fromParam.toLowerCase();
    const hostAndPath =
      url.protocol === "meetra:"
        ? `${url.hostname}${url.pathname}`
        : url.pathname;
    const fromPath = inviteIdFromPathParts(hostAndPath.split("/").filter(Boolean));
    if (fromPath) return fromPath;
  } catch {
    const queryMatch = /[?&]workspace=([^&#]+)/i.exec(trimmed);
    if (queryMatch?.[1]) {
      try {
        return decodeURIComponent(queryMatch[1]).trim().toLowerCase();
      } catch {
        return queryMatch[1].trim().toLowerCase();
      }
    }
  }

  return trimmed.toLowerCase();
}

/** Public join URL — never 127.0.0.1 from packaged Electron. */
export function buildWorkspaceJoinUrl(workspaceId: string): string {
  const id = workspaceId.trim().toLowerCase();
  const configured = import.meta.env.VITE_FORMA_PUBLIC_ORIGIN?.trim().replace(/\/$/, "");
  const origin = configured || PUBLIC_APP_JOIN_ORIGIN;
  return `${origin}/app/?workspace=${encodeURIComponent(id)}`;
}
