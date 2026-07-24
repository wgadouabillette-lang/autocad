/** Efface les données locales liées à un compte après suppression. */

const LOCAL_STORAGE_PREFIXES = [
  "forma-user-preferences",
  "forma-server-memberships",
  "forma-pending-join-requests",
  "forma-deleted-workspaces",
  "forma-notifications:",
  "forma-notifications-seen:",
  "forma-friend-chat-read:",
  "forma-friend-chat-tab-seen:",
  "forma-meeting-reminders-fired:",
  "forma-spotify-player-config",
  "forma-email-for-sign-in",
  "forma-connector-oauth-result",
];

function clearMatchingLocalStorage(): void {
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (LOCAL_STORAGE_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix))) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    window.localStorage.removeItem(key);
  }
}

function clearRecordingsIdb(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase("forma-recordings");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearLocalAccountData(): Promise<void> {
  clearMatchingLocalStorage();
  await clearRecordingsIdb();
}
