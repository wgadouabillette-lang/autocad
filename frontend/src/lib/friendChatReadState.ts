const STORAGE_PREFIX = "forma-friend-chat-read:";
const TAB_SEEN_PREFIX = "forma-friend-chat-tab-seen:";

function storageKey(localUid: string): string {
  return `${STORAGE_PREFIX}${localUid}`;
}

function tabSeenKey(localUid: string): string {
  return `${TAB_SEEN_PREFIX}${localUid}`;
}

export function getFriendsTabSeenAt(localUid: string): number {
  if (!localUid) return 0;
  try {
    const raw = localStorage.getItem(tabSeenKey(localUid));
    if (!raw) return 0;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function setFriendsTabSeenAt(localUid: string, ts: number): void {
  if (!localUid) return;
  try {
    localStorage.setItem(tabSeenKey(localUid), String(ts));
  } catch {
    // ignore quota / private mode
  }
}

function readMap(localUid: string): Record<string, number> {
  if (!localUid) return {};
  try {
    const raw = localStorage.getItem(storageKey(localUid));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeMap(localUid: string, map: Record<string, number>): void {
  if (!localUid) return;
  try {
    localStorage.setItem(storageKey(localUid), JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

export function getLastReadAt(localUid: string, partnerId: string): number {
  if (!localUid || !partnerId) return 0;
  const map = readMap(localUid);
  const value = map[partnerId];
  return typeof value === "number" ? value : 0;
}

export function setLastReadAt(
  localUid: string,
  partnerId: string,
  timestamp: number,
): void {
  if (!localUid || !partnerId) return;
  const map = readMap(localUid);
  const current = typeof map[partnerId] === "number" ? map[partnerId] : 0;
  if (timestamp <= current) return;
  map[partnerId] = timestamp;
  writeMap(localUid, map);
}

export function clearReadState(localUid: string): void {
  if (!localUid) return;
  try {
    localStorage.removeItem(storageKey(localUid));
  } catch {
    // ignore
  }
}
