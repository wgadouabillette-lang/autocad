import {
  onDisconnect,
  onValue,
  ref,
  remove,
  set,
  type Unsubscribe,
} from "firebase/database";
import type { ChatTypingScope } from "../chatTypingScope";
import { chatTypingScopeKey } from "../chatTypingScope";
import { rtdb } from "./client";
import { ensureWorkspaceRtdbAcl } from "./workspaceRtdbAcl";
import { ensureGroupRtdbAcl } from "./groupRtdbAcl";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./client";
import { partnerUidFromChatId } from "./friendChats";

async function ensureTypingAcl(scope: ChatTypingScope): Promise<void> {
  if (scope.kind === "theater" || scope.kind === "workspace-channel") {
    await ensureWorkspaceRtdbAcl(scope.workspaceId);
  } else if (scope.kind === "group") {
    await ensureGroupRtdbAcl(scope.groupId);
  } else if (scope.kind === "friend") {
    const me = auth.currentUser?.uid;
    if (!me) return;
    const other = partnerUidFromChatId(scope.chatId, me);
    if (!other) return;
    const ensure = httpsCallable<{ otherUid: string }, { ok: boolean }>(
      functions,
      "ensureFriendship",
    );
    await ensure({ otherUid: other });
  }
}

export interface CloudChatTyper {
  userId: string;
  name: string;
  photoURL: string | null;
  updatedAt: number;
}

const TYPING_STALE_MS = 5_000;
const armedTypingDisconnect = new Set<string>();

function typingPath(scope: ChatTypingScope, uid?: string) {
  switch (scope.kind) {
    case "theater": {
      const base = `typing/theater/${scope.workspaceId.trim().toLowerCase()}`;
      return uid ? `${base}/${uid}` : base;
    }
    case "friend": {
      const base = `typing/friend/${scope.chatId}`;
      return uid ? `${base}/${uid}` : base;
    }
    case "group": {
      const base = `typing/group/${scope.groupId}`;
      return uid ? `${base}/${uid}` : base;
    }
    case "workspace-channel": {
      const base = `typing/channel/${scope.workspaceId}/${scope.channelId}`;
      return uid ? `${base}/${uid}` : base;
    }
  }
}

function typingDisconnectKey(scope: ChatTypingScope, uid: string) {
  return `${chatTypingScopeKey(scope)}/${uid}`;
}

async function armTypingDisconnect(scope: ChatTypingScope, uid: string): Promise<void> {
  const key = typingDisconnectKey(scope, uid);
  if (armedTypingDisconnect.has(key)) return;
  armedTypingDisconnect.add(key);
  try {
    await onDisconnect(ref(rtdb, typingPath(scope, uid))).remove();
  } catch {
    armedTypingDisconnect.delete(key);
  }
}

function mapTypingEntry(uid: string, raw: unknown): CloudChatTyper | null {
  const data = (raw ?? {}) as Record<string, unknown>;
  const updatedAt =
    typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : Date.now();
  if (Date.now() - updatedAt > TYPING_STALE_MS) return null;

  return {
    userId: uid,
    name: typeof data.authorName === "string" ? data.authorName : "Membre",
    photoURL: typeof data.authorPhotoURL === "string" ? data.authorPhotoURL : null,
    updatedAt,
  };
}

export async function setChatTyping(
  scope: ChatTypingScope,
  uid: string,
  authorName: string,
  authorPhotoURL: string | null,
): Promise<void> {
  if (!uid) return;

  await ensureTypingAcl(scope);
  await set(ref(rtdb, typingPath(scope, uid)), {
    authorUid: uid,
    authorName: authorName.trim() || "Membre",
    authorPhotoURL,
    updatedAt: Date.now(),
  });
  await armTypingDisconnect(scope, uid);
}

export async function clearChatTyping(scope: ChatTypingScope, uid: string): Promise<void> {
  if (!uid) return;
  armedTypingDisconnect.delete(typingDisconnectKey(scope, uid));
  try {
    await remove(ref(rtdb, typingPath(scope, uid)));
  } catch {
    // Déjà supprimé ou indisponible.
  }
}

export function watchChatTyping(
  scope: ChatTypingScope,
  onChange: (typers: CloudChatTyper[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  let unsub: Unsubscribe | null = null;
  let cancelled = false;

  void ensureTypingAcl(scope)
    .then(() => {
      if (cancelled) return;
      unsub = onValue(
        ref(rtdb, typingPath(scope)),
        (snap) => {
          const value = snap.val() as Record<string, unknown> | null;
          if (!value) {
            onChange([]);
            return;
          }
          const typers = Object.entries(value)
            .map(([uid, data]) => mapTypingEntry(uid, data))
            .filter((typer): typer is CloudChatTyper => typer !== null);
          onChange(typers);
        },
        (error) => {
          onError?.(error);
        },
      );
    })
    .catch((error) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    });

  return () => {
    cancelled = true;
    unsub?.();
  };
}

export { TYPING_STALE_MS };
