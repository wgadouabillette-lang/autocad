import clsx from "clsx";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { participantHasHandRaised, type CallUser } from "../../lib/calls";
import {
  resolveCallParticipantVideoDisplay,
  type CallParticipantVideoDisplay,
} from "../../lib/callMediaFeeds";
import {
  voiceParticipantGridLayout,
  voiceParticipantTilePlacement,
} from "../../lib/voiceParticipantLayout";
import { useCallsStore } from "../../store/useCallsStore";
import type { RemoteParticipantStreams } from "../../lib/webrtc/workspaceVoiceRtc";
import VoiceParticipantTile from "./VoiceParticipantTile";

interface VoiceParticipantsInCallGridProps {
  workspaceId: string;
  participants: CallUser[];
  ariaLabel?: string;
  showHandRaise?: boolean;
  /** Permet d'agrandir caméra / partage d'écran (salons vocaux uniquement). */
  enableSpotlight?: boolean;
}

interface ParticipantMediaContext {
  cameraOn: boolean;
  screenSharing: boolean;
  localStream: MediaStream | null;
  screenShareStream: MediaStream | null;
  remoteMediaByUid: Record<string, RemoteParticipantStreams>;
}

function resolveParticipantVideo(
  participant: CallUser,
  media: ParticipantMediaContext,
): CallParticipantVideoDisplay {
  const remoteMedia = media.remoteMediaByUid[participant.id];
  return resolveCallParticipantVideoDisplay({
    isLocal: !!participant.isLocal,
    cameraOn: media.cameraOn,
    screenSharing: media.screenSharing,
    localStream: media.localStream,
    screenShareStream: media.screenShareStream,
    remoteMedia,
  });
}

function participantHasActiveVideo(
  participant: CallUser,
  media: ParticipantMediaContext,
): boolean {
  return !!resolveParticipantVideo(participant, media).stream;
}

interface ParticipantTileProps {
  participant: CallUser;
  workspaceId: string;
  media: ParticipantMediaContext;
  speaking: boolean;
  handRaised: boolean;
  muted?: boolean;
  fill?: boolean;
  shape?: "fill" | "wide" | "square";
  style?: CSSProperties;
  onActivate?: () => void;
  activateTitle?: string;
  showExpandHint?: boolean;
  strip?: boolean;
  stage?: boolean;
}

function ParticipantTile({
  participant,
  workspaceId,
  media,
  speaking,
  handRaised,
  muted,
  fill,
  shape,
  style,
  onActivate,
  activateTitle,
  showExpandHint,
  strip,
  stage,
}: ParticipantTileProps) {
  const remoteMedia = media.remoteMediaByUid[participant.id];
  const { stream: videoStream } = resolveParticipantVideo(participant, media);

  return (
    <VoiceParticipantTile
      participant={participant}
      workspaceId={workspaceId}
      speaking={speaking}
      handRaised={handRaised}
      muted={muted}
      fill={fill}
      shape={shape}
      style={style}
      videoStream={videoStream}
      audioStream={participant.isLocal ? null : remoteMedia?.audioStream ?? null}
      onActivate={onActivate}
      activateTitle={activateTitle}
      showExpandHint={showExpandHint}
      strip={strip}
      stage={stage}
    />
  );
}

export default function VoiceParticipantsInCallGrid({
  workspaceId,
  participants,
  ariaLabel = "Participants de l'appel vocal",
  showHandRaise = true,
  enableSpotlight = false,
}: VoiceParticipantsInCallGridProps) {
  const [spotlightParticipantId, setSpotlightParticipantId] = useState<string | null>(null);

  const speakingByParticipant = useCallsStore((s) => s.speakingByParticipant);
  const mutedByParticipant = useCallsStore((s) => s.mutedByParticipant);
  const cameraOn = useCallsStore((s) => s.cameraOn);
  const screenSharing = useCallsStore((s) => s.screenSharing);
  const localStream = useCallsStore((s) => s.localStream);
  const screenShareStream = useCallsStore((s) => s.screenShareStream);
  const remoteMediaByUid = useCallsStore((s) => s.remoteMediaByUid);
  const handRaises = useCallsStore((s) => s.callsByRoom[workspaceId]?.handRaises ?? []);

  const media = useMemo<ParticipantMediaContext>(
    () => ({
      cameraOn,
      screenSharing,
      localStream,
      screenShareStream,
      remoteMediaByUid,
    }),
    [cameraOn, screenSharing, localStream, screenShareStream, remoteMediaByUid],
  );

  const participantIds = useMemo(
    () => participants.map((participant) => participant.id).join(","),
    [participants],
  );

  useEffect(() => {
    if (!spotlightParticipantId) return;
    if (!participants.some((participant) => participant.id === spotlightParticipantId)) {
      setSpotlightParticipantId(null);
    }
  }, [participantIds, participants, spotlightParticipantId]);

  useEffect(() => {
    if (!spotlightParticipantId) return;
    const spotlighted = participants.find((participant) => participant.id === spotlightParticipantId);
    if (!spotlighted || !participantHasActiveVideo(spotlighted, media)) {
      setSpotlightParticipantId(null);
    }
  }, [media, participants, spotlightParticipantId]);

  const tilePropsFor = (participant: CallUser) => ({
    speaking: speakingByParticipant[participant.id] ?? false,
    handRaised: showHandRaise && participantHasHandRaised(handRaises, participant.id),
    muted: participant.isLocal ? undefined : mutedByParticipant[participant.id] === true,
  });

  if (enableSpotlight && spotlightParticipantId) {
    const spotlightParticipant = participants.find(
      (participant) => participant.id === spotlightParticipantId,
    );
    if (spotlightParticipant) {
      const stripParticipants = participants.filter(
        (participant) => participant.id !== spotlightParticipantId,
      );

      return (
        <div className="open-voice-in-call open-voice-in-call--spotlight">
          <div className="open-voice-spotlight__stack">
            {stripParticipants.length > 0 ? (
              <div
                className="open-voice-spotlight__strip"
                aria-label="Autres participants"
              >
                {stripParticipants.map((participant) => (
                  <ParticipantTile
                    key={participant.id}
                    participant={participant}
                    workspaceId={workspaceId}
                    media={media}
                    {...tilePropsFor(participant)}
                    strip
                    onActivate={() => setSpotlightParticipantId(participant.id)}
                    activateTitle={`Voir ${participant.name}`}
                  />
                ))}
              </div>
            ) : null}
            <div className="open-voice-spotlight__stage">
              <ParticipantTile
                participant={spotlightParticipant}
                workspaceId={workspaceId}
                media={media}
                {...tilePropsFor(spotlightParticipant)}
                stage
                onActivate={() => setSpotlightParticipantId(null)}
                activateTitle="Réduire"
              />
            </div>
          </div>
        </div>
      );
    }
  }

  const participantCount = participants.length;
  const layout = voiceParticipantGridLayout(participantCount);
  const soloLayout = participantCount === 1;

  return (
    <div className="open-voice-in-call">
      <div
        className={clsx(
          "open-voice-in-call__grid",
          layout.gridClass,
          soloLayout && "open-voice-in-call__grid--solo-media",
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
          const hasVideo = participantHasActiveVideo(participant, media);
          const canSpotlight = enableSpotlight && hasVideo;

          return (
            <ParticipantTile
              key={participant.id}
              participant={participant}
              workspaceId={workspaceId}
              media={media}
              {...tilePropsFor(participant)}
              fill
              shape={layout.tileShape}
              style={voiceParticipantTilePlacement(participantCount, index)}
              onActivate={
                canSpotlight ? () => setSpotlightParticipantId(participant.id) : undefined
              }
              activateTitle={canSpotlight ? `Agrandir ${participant.name}` : undefined}
              showExpandHint={canSpotlight}
            />
          );
        })}
      </div>
    </div>
  );
}
