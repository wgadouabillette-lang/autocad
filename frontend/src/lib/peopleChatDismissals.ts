const STORAGE_PREFIX = "forma-dismissed-threads:";

function storageKey(localUid: string): string {
  return `${STORAGE_PREFIX}${localUid}`;
}

function readSet(localUid: string): Set<string> {
  if (!localUid) return new Set();
  try {
    const raw = localStorage.getItem(storageKey(localUid));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id) => typeof id === "string" && id.length > 0));
  } catch {
    return new Set();
  }
}

function writeSet(localUid: string, ids: Set<string>): void {
  if (!localUid) return;
  try {
    localStorage.setItem(storageKey(localUid), JSON.stringify([...ids]));
  } catch {
    // ignore quota / private mode
  }
}

export function getDismissedThreadIds(localUid: string): string[] {
  return [...readSet(localUid)];
}

export function dismissThreadId(localUid: string, threadId: string): void {
  if (!localUid || !threadId) return;
  const ids = readSet(localUid);
  ids.add(threadId);
  writeSet(localUid, ids);
}

export function clearDismissedThreads(localUid: string): void {
  if (!localUid) return;
  try {
    localStorage.removeItem(storageKey(localUid));
  } catch {
    // ignore
  }
}
