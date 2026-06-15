import clsx from "clsx";
import { participantHasHandRaised, type CallUser } from "../../lib/calls";
import { participantVideoStream } from "../../lib/webrtc/workspaceVoiceRtc";
import {
  voiceParticipantGridLayout,
  voiceParticipantTilePlacement,
} from "../../lib/voiceParticipantLayout";
import { useCallsStore } from "../../store/useCallsStore";
import VoiceParticipantTile from "./VoiceParticipantTile";

interface VoiceParticipantsInCallGridProps {
  workspaceId: string;
  participants: CallUser[];
  ariaLabel?: string;
  showHandRaise?: boolean;
}

export default function VoiceParticipantsInCallGrid({
  workspaceId,
  participants,
  ariaLabel = "Participants de l'appel vocal",
  showHandRaise = false,
}: VoiceParticipantsInCallGridProps) {
  const speakingByParticipant = useCallsStore((s) => s.speakingByParticipant);
  const cameraOn = useCallsStore((s) => s.cameraOn);
  const screenSharing = useCallsStore((s) => s.screenSharing);
  const localStream = useCallsStore((s) => s.localStream);
  const screenShareStream = useCallsStore((s) => s.screenShareStream);
  const remoteMediaByUid = useCallsStore((s) => s.remoteMediaByUid);
  const muteOthers = useCallsStore((s) => s.muteOthers);
  const handRaises = useCallsStore((s) => s.callsByRoom[workspaceId]?.handRaises ?? []);

  const participantCount = participants.length;
  const layout = voiceParticipantGridLayout(participantCount);
  const soloWithMedia = participantCount === 1 && !!(cameraOn || screenSharing);

  const localVideoStream =
    screenSharing && screenShareStream
      ? screenShareStream
      : cameraOn && localStream
        ? localStream
        : null;

  return (
    <div className="open-voice-in-call">
      <div
        className={clsx(
          "open-voice-in-call__grid",
          layout.gridClass,
          soloWithMedia && "open-voice-in-call__grid--solo-media",
          layout.useFlexibleRows && "open-voice-in-call__grid--auto-rows",
        )}
        style={
          layout.useFlexibleRows
            ? undefined
            : { gridTemplateRows: `repeat(${layout.rowCount}, minmax(0, 1fr))` }
        }
        aria-label={ariaLabel}
      >
        {participants.map((participant, index) => {
          const remoteMedia = remoteMediaByUid[participant.id];
          return (
          <VoiceParticipantTile
            key={participant.id}
            participant={participant}
            workspaceId={workspaceId}
            speaking={speakingByParticipant[participant.id] ?? false}
            handRaised={
              showHandRaise && participantHasHandRaised(handRaises, participant.id)
            }
            fill
            shape={layout.tileShape}
            style={voiceParticipantTilePlacement(participantCount, index)}
            videoStream={
              participant.isLocal
                ? localVideoStream
                : participantVideoStream(remoteMedia)
            }
            audioStream={participant.isLocal ? null : remoteMedia?.audioStream ?? null}
            audioMuted={muteOthers}
          />
          );
        })}
      </div>
    </div>
  );
}
