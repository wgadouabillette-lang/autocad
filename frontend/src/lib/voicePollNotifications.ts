import { inCallParticipants } from "./calls";
import { workspaceMembers } from "./workspaceMembers";
import type { VoicePoll } from "./voicePoll";
import { useCallsStore } from "../store/useCallsStore";
import { useNotificationsStore } from "../store/useNotificationsStore";
import { useVoicePollStore } from "../store/useVoicePollStore";

function pollBody(poll: VoicePoll): string {
  return poll.subtitle ? `${poll.question} — ${poll.subtitle}` : poll.question;
}

function groupPollTargets(workspaceId: string): { id: string; name: string }[] {
  const callsState = useCallsStore.getState();
  const roomCalls = callsState.callsByRoom[workspaceId];
  const localInCall = callsState.isLocalInCall(workspaceId);
  const localOpenChannelId = callsState.localOpenChannelByRoom[workspaceId] ?? null;

  if (roomCalls && localInCall) {
    const inCall = inCallParticipants(
      roomCalls.blocks ?? [],
      roomCalls.openChannels ?? [],
      localInCall,
      localOpenChannelId,
    ).filter((participant) => !participant.isLocal);

    if (inCall.length > 0) return inCall;
  }

  return workspaceMembers(workspaceId);
}

export function notifyWorkspaceOfPoll(poll: VoicePoll): void {
  const push = useNotificationsStore.getState().push;
  const ingestPoll = useVoicePollStore.getState().ingestPoll;
  const body = pollBody(poll);
  const targets = groupPollTargets(poll.workspaceId);
  const names = targets.map((target) => target.name);

  ingestPoll(poll);

  push({
    kind: "poll",
    category: "Sondage",
    title: "Sondage publié au groupe",
    pollWorkspaceId: poll.workspaceId,
    pollSnapshot: poll,
    body:
      names.length > 0
        ? `${body} · ${names.length} membre${names.length > 1 ? "s" : ""} notifié${names.length > 1 ? "s" : ""} (${names.join(", ")})`
        : body,
  });

  for (const target of targets) {
    push({
      kind: "poll",
      category: "Sondage",
      title: `${poll.createdByName} a lancé un sondage`,
      pollWorkspaceId: poll.workspaceId,
      pollSnapshot: poll,
      body: `${target.name} · ${body}`,
    });
  }
}
