import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { countTheaterParticipants, type TheaterState } from "../../lib/theater";
import CallBlockCard from "./CallBlockCard";
import CallOccupancyHint from "./CallOccupancyHint";
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
  const { t } = useTranslation();
  const connected = countTheaterParticipants(theater);

  return (
    <CallBlockCard
      className={clsx(
        "call-block",
        "call-block--clickable",
        "call-block--theater",
        connected > 0 && "call-block--local",
        layout === "center" && "call-block--center-slot",
      )}
      title={t("calls.theater")}
      participants={[]}
      showActivity={false}
      trailing={
        <CallOccupancyHint count={connected} participants={theater.speakers} />
      }
      body={<TheaterBlockPreview theater={theater} />}
      onMainClick={onOpen}
      mainAriaLabel={
        connected > 0
          ? t("calls.openTheaterCount", { count: connected })
          : t("calls.openTheater")
      }
    />
  );
}
