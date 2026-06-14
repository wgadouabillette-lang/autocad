import { useEffect } from "react";
import { isPollExpired, type VoicePoll } from "../lib/voicePoll";
import { useVoicePollStore } from "../store/useVoicePollStore";

/** S'abonne correctement à activePollByWorkspace (évite le piège getActivePoll dans un sélecteur). */
export function useActiveVoicePoll(workspaceId: string): VoicePoll | null {
  const poll = useVoicePollStore((s) => s.activePollByWorkspace[workspaceId] ?? null);
  const expirePoll = useVoicePollStore((s) => s.expirePoll);

  useEffect(() => {
    if (poll && isPollExpired(poll)) {
      expirePoll(workspaceId);
    }
  }, [poll, workspaceId, expirePoll]);

  if (!poll || isPollExpired(poll)) return null;
  return poll;
}
