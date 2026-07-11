import {
  onValue,
  ref,
  remove,
  set,
  update,
  type Unsubscribe,
} from "firebase/database";
import { rtdb } from "./client";

export type VoiceKnockStatus = "pending" | "accepted" | "declined" | "ejected";

export interface VoiceKnockDoc {
  id: string;
  workspaceId: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  status: VoiceKnockStatus;
  createdAt?: number;
  respondedAt?: number;
}

function knockId(fromUid: string, toUid: string): string {
  return `${fromUid}_${toUid}`;
}

function knockPath(workspaceId: string, id: string) {
  return `voiceKnocks/${workspaceId}/${id}`;
}

function knocksPath(workspaceId: string) {
  return `voiceKnocks/${workspaceId}`;
}

export async function sendVoiceKnock(
  workspaceId: string,
  fromUid: string,
  fromName: string,
  toUid: string,
): Promise<string> {
  const id = knockId(fromUid, toUid);
  await set(ref(rtdb, knockPath(workspaceId, id)), {
    id,
    workspaceId,
    fromUid,
    fromName: fromName.trim() || "Membre",
    toUid,
    status: "pending",
    createdAt: Date.now(),
  });
  return id;
}

export async function respondVoiceKnock(
  workspaceId: string,
  fromUid: string,
  toUid: string,
  accept: boolean,
): Promise<void> {
  await update(ref(rtdb, knockPath(workspaceId, knockId(fromUid, toUid))), {
    status: accept ? "accepted" : "declined",
    respondedAt: Date.now(),
  });
}

export async function cancelVoiceKnock(
  workspaceId: string,
  fromUid: string,
  toUid: string,
): Promise<void> {
  await respondVoiceKnock(workspaceId, fromUid, toUid, false);
}

export async function sendVoiceEject(
  workspaceId: string,
  hostUid: string,
  hostName: string,
  remoteUid: string,
): Promise<void> {
  const id = `eject_${hostUid}_${remoteUid}`;
  await set(ref(rtdb, knockPath(workspaceId, id)), {
    id,
    workspaceId,
    fromUid: hostUid,
    fromName: hostName.trim() || "Membre",
    toUid: remoteUid,
    status: "ejected",
    createdAt: Date.now(),
  });
}

function watchKnocksCollection(
  workspaceId: string,
  onChange: (knocks: VoiceKnockDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onValue(
    ref(rtdb, knocksPath(workspaceId)),
    (snap) => {
      const value = snap.val() as Record<string, VoiceKnockDoc> | null;
      if (!value) {
        onChange([]);
        return;
      }
      onChange(Object.values(value));
    },
    (error) => {
      onError?.(error);
    },
  );
}

export function watchVoiceEjects(
  workspaceId: string,
  localUid: string,
  onEject: (knock: VoiceKnockDoc) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!workspaceId || !localUid) {
    return () => {};
  }

  const seen = new Set<string>();
  return watchKnocksCollection(
    workspaceId,
    (knocks) => {
      for (const knock of knocks) {
        if (knock.status !== "ejected" || knock.toUid !== localUid) continue;
        const key = knock.id || `${knock.fromUid}_${knock.toUid}_${knock.createdAt ?? 0}`;
        if (seen.has(key)) continue;
        seen.add(key);
        onEject(knock);
        void remove(ref(rtdb, knockPath(workspaceId, knock.id))).catch(() => {});
      }
    },
    onError,
  );
}

export function watchVoiceKnocks(
  workspaceId: string,
  localUid: string,
  onChange: (knocks: VoiceKnockDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!workspaceId || !localUid) {
    onChange([]);
    return () => {};
  }

  return watchKnocksCollection(
    workspaceId,
    (knocks) => {
      onChange(
        knocks.filter(
          (knock) =>
            knock.status === "pending" &&
            (knock.fromUid === localUid || knock.toUid === localUid),
        ),
      );
    },
    onError,
  );
}

export function watchVoiceKnockResponses(
  workspaceId: string,
  localUid: string,
  onChange: (knocks: VoiceKnockDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!workspaceId || !localUid) {
    onChange([]);
    return () => {};
  }

  return watchKnocksCollection(
    workspaceId,
    (knocks) => {
      onChange(
        knocks.filter(
          (knock) =>
            knock.fromUid === localUid &&
            (knock.status === "accepted" || knock.status === "declined"),
        ),
      );
    },
    onError,
  );
}
