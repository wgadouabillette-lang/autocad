import clsx from "clsx";
import { useEffect, useMemo, useRef } from "react";
import { buildCallMediaFeeds, selectPipFeeds, type CallMediaFeed } from "../../lib/callMediaFeeds";
import { avatarColor, inCallParticipants, userInitials } from "../../lib/calls";
import { buildRemoteMediaFeeds } from "../../lib/webrtc/workspaceVoiceRtc";
import VoiceMuteBadge from "../calls/VoiceMuteBadge";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";

function PipMediaTile({
  feed,
  speaking,
  muted,
}: {
  feed: CallMediaFeed;
  speaking: boolean;
  muted: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = feed.stream;
  }, [feed.stream]);

  const label =
    feed.kind === "screen"
      ? feed.isLocal
        ? "Partage d'écran"
        : `${feed.participantName} · écran`
      : feed.isLocal
        ? "Votre caméra"
        : feed.participantName;

  return (
    <div
      className={clsx(
        "chat-fullscreen-media-pip__item",
        feed.kind === "camera" && "chat-fullscreen-media-pip__item--camera",
        feed.kind === "screen" && "chat-fullscreen-media-pip__item--screen",
        speaking && "chat-fullscreen-media-pip__item--speaking",
      )}
      aria-label={label}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="chat-fullscreen-media-pip__media"
      />
      <span className="chat-fullscreen-media-pip__label">{label}</span>
      {muted && <VoiceMuteBadge />}
    </div>
  );
}

export default function ChatFullscreenMediaPip() {
  const chatPanelExpanded = useStore((s) => s.chatPanelExpanded);
  const activeRoomId = useStore((s) => s.activeRoomId);

  const viewMode = useCallsStore((s) => s.getCallsViewMode(activeRoomId));
  const inBlockCall = useCallsStore((s) => s.isLocalInCall(activeRoomId));
  const inTheaterCall = useCallsStore((s) => s.isLocalInTheaterCall(activeRoomId));
  const screenSharing = useCallsStore((s) => s.screenSharing);
  const screenShareStream = useCallsStore((s) => s.screenShareStream);
  const cameraOn = useCallsStore((s) => s.cameraOn);
  const localStream = useCallsStore((s) => s.localStream);
  const remoteMediaByUid = useCallsStore((s) => s.remoteMediaByUid);
  const roomCalls = useCallsStore((s) => s.callsByRoom[activeRoomId]);
  const localOpenChannelId = useCallsStore((s) => s.localOpenChannelByRoom[activeRoomId]);
  const lastSpokeAtByParticipant = useCallsStore((s) => s.lastSpokeAtByParticipant);
  const speakingByParticipant = useCallsStore((s) => s.speakingByParticipant);
  const muted = useCallsStore((s) => s.muted);

  const inCall = viewMode === "theater" ? inTheaterCall : inBlockCall;

  const feeds = useMemo(() => {
    const participantNames: Record<string, string> = {};
    if (roomCalls && inBlockCall) {
      for (const participant of inCallParticipants(
        roomCalls.blocks,
        roomCalls.openChannels,
        inBlockCall,
        localOpenChannelId ?? null,
      )) {
        if (!participant.isLocal) {
          participantNames[participant.id] = participant.name;
        }
      }
    }
    const remoteFeeds: CallMediaFeed[] = buildRemoteMediaFeeds(
      remoteMediaByUid,
      participantNames,
    ).map((feed) => ({
      ...feed,
      avatarColor: avatarColor(feed.participantId),
      initials: userInitials(feed.participantName),
    }));
    const allFeeds = buildCallMediaFeeds({
      cameraOn,
      screenSharing,
      localStream,
      screenShareStream,
      remoteFeeds,
    });
    return selectPipFeeds(allFeeds, lastSpokeAtByParticipant);
  }, [
    cameraOn,
    screenSharing,
    localStream,
    screenShareStream,
    lastSpokeAtByParticipant,
    remoteMediaByUid,
    roomCalls,
    inBlockCall,
    localOpenChannelId,
  ]);

  const visible = chatPanelExpanded && inCall && feeds.length > 0;

  if (!visible) return null;

  return (
    <div className="chat-fullscreen-media-pip-stack" aria-label="Aperçus média de l'appel">
      {feeds.map((feed) => (
        <PipMediaTile
          key={feed.feedId}
          feed={feed}
          speaking={speakingByParticipant[feed.participantId] ?? false}
          muted={feed.isLocal && muted}
        />
      ))}
    </div>
  );
}
