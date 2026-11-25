import { Cast, Users, Video, type LucideIcon } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";
import { useWorkspacePresenceStore } from "../../store/useWorkspacePresenceStore";

export type CallOccupancyIconKind = "people" | "camera" | "broadcast";

export function callOccupancyIconKind(input: {
  participants: ReadonlyArray<{ id: string; isLocal?: boolean }>;
  cameraOn: boolean;
  screenSharing: boolean;
  localUid: string | null;
  mediaByUid: Record<string, { camera?: boolean; screenSharing?: boolean } | undefined>;
}): CallOccupancyIconKind {
  let broadcast = false;
  for (const participant of input.participants) {
    const isLocal =
      participant.isLocal === true ||
      participant.id === "local" ||
      (input.localUid != null && participant.id === input.localUid);
    const media = isLocal
      ? { camera: input.cameraOn, screenSharing: input.screenSharing }
      : input.mediaByUid[participant.id];
    if (media?.camera) return "camera";
    if (media?.screenSharing) broadcast = true;
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
  const workspaceId = useStore((s) => s.activeRoomId);
  const localUid = useAuthStore((s) => s.firebaseUid);
  const cameraOn = useCallsStore((s) => s.cameraOn);
  const screenSharing = useCallsStore((s) => s.screenSharing);
  const members = useWorkspacePresenceStore((s) => s.membersByWorkspace[workspaceId]);
  const mediaByUid: Record<string, { camera?: boolean; screenSharing?: boolean } | undefined> = {};
  if (members) {
    for (const [uid, entry] of Object.entries(members)) {
      mediaByUid[uid] = entry.voice;
    }
  }
  const kind = callOccupancyIconKind({
    participants,
    cameraOn,
    screenSharing,
    localUid,
    mediaByUid,
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
