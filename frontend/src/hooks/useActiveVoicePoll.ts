import { useEffect } from "react";
import { isPollExpired, shouldShowPollToUser, type VoicePoll } from "../lib/voicePoll";
import { useAuthStore } from "../store/useAuthStore";
import { useVoicePollStore } from "../store/useVoicePollStore";

/** S'abonne correctement à activePollByWorkspace (évite le piège getActivePoll dans un sélecteur). */
export function useActiveVoicePoll(workspaceId: string): VoicePoll | null {
  const poll = useVoicePollStore((s) => s.activePollByWorkspace[workspaceId] ?? null);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const expirePoll = useVoicePollStore((s) => s.expirePoll);
  const closeVotePanel = useVoicePollStore((s) => s.closeVotePanel);

  useEffect(() => {
    if (poll && isPollExpired(poll)) {
      expirePoll(workspaceId);
    }
  }, [poll, workspaceId, expirePoll]);

  useEffect(() => {
    if (!poll || !firebaseUid) return;
    if (shouldShowPollToUser(poll, firebaseUid)) return;
    closeVotePanel(workspaceId);
  }, [poll, firebaseUid, workspaceId, closeVotePanel]);

  if (!poll || isPollExpired(poll)) return null;
  if (!shouldShowPollToUser(poll, firebaseUid)) return null;
  return poll;
}
