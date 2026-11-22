import { Cast, Users, Video, type LucideIcon } from "lucide-react";
import type { RemoteParticipantStreams } from "../../lib/webrtc/workspaceVoiceRtc";
import { useCallsStore } from "../../store/useCallsStore";

export type CallOccupancyIconKind = "people" | "camera" | "broadcast";

function liveVideo(stream: MediaStream | null | undefined): boolean {
  return (
    stream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled) ??
    false
  );
}

export function callOccupancyIconKind(input: {
  participants: ReadonlyArray<{ id: string; isLocal?: boolean }>;
  cameraOn: boolean;
  screenSharing: boolean;
  remoteMediaByUid: Record<string, RemoteParticipantStreams>;
}): CallOccupancyIconKind {
  let broadcast = false;
  const localHere = input.participants.some((participant) => participant.isLocal);
  if (localHere) {
    if (input.cameraOn) return "camera";
    if (input.screenSharing) broadcast = true;
  }

  for (const participant of input.participants) {
    if (participant.isLocal || participant.id === "local") continue;
    const media = input.remoteMediaByUid[participant.id];
    if (!media) continue;
    if (liveVideo(media.cameraStream)) return "camera";
    if (liveVideo(media.screenStream)) broadcast = true;
  }

  return broadcast ? "broadcast" : "people";
}

const ICONS: Record<CallOccupancyIconKind, LucideIcon> = {
  people: Users,
  camera: Video,
  broadcast: Cast,
};

interface CallOccupancyHintProps {
  count?: number;
  participants: ReadonlyArray<{ id: string; isLocal?: boolean }>;
  /** Salon privé : pas d'icône de nombre, seulement caméra ou diffusion. */
  mediaOnly?: boolean;
}

export default function CallOccupancyHint({
  count = 0,
  participants,
  mediaOnly = false,
}: CallOccupancyHintProps) {
  const cameraOn = useCallsStore((s) => s.cameraOn);
  const screenSharing = useCallsStore((s) => s.screenSharing);
  const remoteMediaByUid = useCallsStore((s) => s.remoteMediaByUid);
  const kind = callOccupancyIconKind({
    participants,
    cameraOn,
    screenSharing,
    remoteMediaByUid,
  });
  if (mediaOnly && kind === "people") return null;
  const Icon = ICONS[kind];

  return (
    <span className="call-block__hint call-block__hint--theater" aria-hidden>
      <Icon size={14} />
      {mediaOnly ? null : <span className="call-block__hint-count">{count}</span>}
    </span>
  );
}
