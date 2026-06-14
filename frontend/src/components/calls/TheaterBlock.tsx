import clsx from "clsx";
import { Presentation, Users } from "lucide-react";
import { stageParticipants, type TheaterState } from "../../lib/theater";
import CallBlockCard from "./CallBlockCard";

interface TheaterBlockProps {
  index?: number;
  theater: TheaterState;
  onOpen: () => void;
  layout?: "default" | "center";
}

export default function TheaterBlock({
  index = 0,
  theater,
  onOpen,
  layout = "default",
}: TheaterBlockProps) {
  const speakers = stageParticipants(theater);
  const audienceCount = theater.audience.length;

  return (
    <CallBlockCard
      className={clsx(
        "call-block",
        "call-block--cascade",
        "call-block--clickable",
        layout === "center" && "call-block--center-slot",
      )}
      style={{ animationDelay: `${index * 20}ms` }}
      title="Théâtre"
      participants={speakers}
      participantLayout="theater"
      audienceParticipants={theater.audience}
      showActivity={false}
      trailing={
        <span className="call-block__hint call-block__hint--theater" aria-hidden>
          <Users size={14} />
          <span className="call-block__hint-count">{audienceCount}</span>
        </span>
      }
      onMainClick={onOpen}
      mainAriaLabel="Ouvrir le théâtre vocal"
    />
  );
}
