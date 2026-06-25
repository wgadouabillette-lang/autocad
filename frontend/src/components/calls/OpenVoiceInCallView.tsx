import type { OpenVoiceChannel } from "../../lib/calls";
import { useStore } from "../../store/useStore";
import VoiceParticipantsInCallGrid from "./VoiceParticipantsInCallGrid";

interface OpenVoiceInCallViewProps {
  channelId: string;
  openChannels: OpenVoiceChannel[];
}

export default function OpenVoiceInCallView({
  channelId,
  openChannels,
}: OpenVoiceInCallViewProps) {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const channel = openChannels.find((entry) => entry.id === channelId);
  if (!channel) return null;

  return (
    <VoiceParticipantsInCallGrid
      workspaceId={activeRoomId}
      participants={channel.participants}
      ariaLabel="Participants du salon vocal"
      showHandRaise
      enableSpotlight
    />
  );
}
