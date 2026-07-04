import { useEffect, useMemo, useRef, useState } from "react";
import { chatTypingScopeKey, type ChatTypingScope } from "../lib/chatTypingScope";
import {
  clearChatTyping,
  setChatTyping,
  watchChatTyping,
  type CloudChatTyper,
} from "../lib/firebase/chatTyping";
import { useAuthStore } from "../store/useAuthStore";
import { useStore } from "../store/useStore";

export interface ChatTyper {
  userId: string;
  name: string;
  photoURL: string | null;
  isLocal: boolean;
}

export function useChatTyping(
  scope: ChatTypingScope | null,
  draft: string,
  enabled = true,
): ChatTyper[] {
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userDisplayName = useStore((s) => s.userDisplayName);
  const photoURL = useStore((s) => s.photoURL);
  const [remoteTypers, setRemoteTypers] = useState<CloudChatTyper[]>([]);
  const syncTimerRef = useRef<number | null>(null);
  const isTypingRef = useRef(false);
  const scopeKey = chatTypingScopeKey(scope);

  const localName = userDisplayName?.trim() || "Vous";
  const isDrafting = draft.trim().length > 0;

  useEffect(() => {
    if (!enabled || !isAuthenticated || !firebaseUid || !scope) {
      setRemoteTypers([]);
      return;
    }

    return watchChatTyping(
      scope,
      (typers) => setRemoteTypers(typers),
      (error) => console.error(`Chat typing ${scopeKey} unavailable`, error),
    );
  }, [enabled, firebaseUid, isAuthenticated, scope, scopeKey]);

  useEffect(() => {
    if (!enabled || !isAuthenticated || !firebaseUid || !scope) return;

    const clearRemote = () => {
      isTypingRef.current = false;
      void clearChatTyping(scope, firebaseUid);
    };

    if (!isDrafting) {
      if (syncTimerRef.current !== null) {
        window.clearInterval(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      if (isTypingRef.current) clearRemote();
      return;
    }

    const pushTyping = () => {
      isTypingRef.current = true;
      void setChatTyping(scope, firebaseUid, localName, photoURL).catch((error) => {
        console.error("Chat typing update failed", error);
      });
    };

    pushTyping();
    syncTimerRef.current = window.setInterval(pushTyping, 2_000);

    return () => {
      if (syncTimerRef.current !== null) {
        window.clearInterval(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      clearRemote();
    };
  }, [enabled, firebaseUid, isAuthenticated, isDrafting, localName, photoURL, scope, scopeKey]);

  return useMemo(() => {
    const typers: ChatTyper[] = [];

    if (isDrafting) {
      typers.push({
        userId: firebaseUid ?? "local",
        name: localName,
        photoURL: photoURL ?? null,
        isLocal: true,
      });
    }

    for (const typer of remoteTypers) {
      if (isDrafting && typer.userId === firebaseUid) continue;
      typers.push({
        userId: typer.userId,
        name: typer.name,
        photoURL: typer.photoURL,
        isLocal: typer.userId === firebaseUid,
      });
    }

    return typers;
  }, [firebaseUid, isDrafting, localName, photoURL, remoteTypers]);
}

export function clearChatTypingNow(scope: ChatTypingScope | null, uid: string | null) {
  if (!scope || !uid) return;
  void clearChatTyping(scope, uid);
}
