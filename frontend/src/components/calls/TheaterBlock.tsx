import clsx from "clsx";
import { Users } from "lucide-react";
import { countTheaterParticipants, type TheaterState } from "../../lib/theater";
import { useCallsStore } from "../../store/useCallsStore";
import CallBlockCard from "./CallBlockCard";
import TheaterBlockPreview from "./TheaterBlockPreview";

interface TheaterBlockProps {
  index?: number;
  theater: TheaterState;
  onOpen: () => void;
  layout?: "default" | "center";
}

function speakerIsSpeaking(
  speakingByParticipant: Record<string, boolean>,
  speakerId: string,
  isLocal?: boolean,
): boolean {
  if (speakingByParticipant[speakerId]) return true;
  if (isLocal && speakingByParticipant.local) return true;
  return false;
}

export default function TheaterBlock({
  index = 0,
  theater,
  onOpen,
  layout = "default",
}: TheaterBlockProps) {
  const speakingByParticipant = useCallsStore((s) => s.speakingByParticipant);
  const connected = countTheaterParticipants(theater);
  const liveStroke =
    theater.audience.length > 0 &&
    theater.speakers.some((speaker) =>
      speakerIsSpeaking(speakingByParticipant, speaker.id, speaker.isLocal),
    );

  return (
    <CallBlockCard
      className={clsx(
        "call-block",
        "call-block--cascade",
        "call-block--clickable",
        "call-block--theater",
        liveStroke && "call-block--theater-live",
        layout === "center" && "call-block--center-slot",
      )}
      style={{ animationDelay: `${index * 20}ms` }}
      title="Théâtre"
      participants={[]}
      showActivity={false}
      trailing={
        <span className="call-block__hint call-block__hint--theater" aria-hidden>
          <Users size={14} />
          <span className="call-block__hint-count">{connected}</span>
        </span>
      }
      body={<TheaterBlockPreview theater={theater} />}
      onMainClick={onOpen}
      mainAriaLabel={
        connected > 0
          ? `Ouvrir le théâtre vocal — ${connected} personne${connected > 1 ? "s" : ""}`
          : "Ouvrir le théâtre vocal"
      }
    />
  );
}
