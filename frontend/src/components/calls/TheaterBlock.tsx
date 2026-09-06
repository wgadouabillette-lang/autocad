import clsx from "clsx";
import { Users } from "lucide-react";
import { countTheaterParticipants, type TheaterState } from "../../lib/theater";
import CallBlockCard from "./CallBlockCard";
import TheaterBlockPreview from "./TheaterBlockPreview";

interface TheaterBlockProps {
  theater: TheaterState;
  onOpen: () => void;
  layout?: "default" | "center";
}

export default function TheaterBlock({
  theater,
  onOpen,
  layout = "default",
}: TheaterBlockProps) {
  const connected = countTheaterParticipants(theater);

  return (
    <CallBlockCard
      className={clsx(
        "call-block",
        "call-block--clickable",
        "call-block--theater",
        layout === "center" && "call-block--center-slot",
      )}
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
