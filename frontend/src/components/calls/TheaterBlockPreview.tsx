import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  buildTheaterAudienceSeats,
  stageParticipants,
  theaterPreviewBenches,
  THEATER_BENCH_SEAT_COUNT,
  THEATER_PREVIEW_SPEAKER_SLOTS,
  type TheaterParticipant,
  type TheaterState,
} from "../../lib/theater";
import { usePersonLabel } from "../../lib/participantLabel";
import { useCallsStore } from "../../store/useCallsStore";
import UserAvatar from "../UserAvatar";

interface TheaterBlockPreviewProps {
  theater: TheaterState;
}

function PreviewSeat({ participant }: { participant: TheaterParticipant | null }) {
  const labelOf = usePersonLabel();
  if (!participant) {
    return <span className="theater-block-preview__seat theater-block-preview__seat--empty" aria-hidden />;
  }

  const name = labelOf(participant.name, participant.isLocal);
  return (
    <UserAvatar
      userId={participant.id}
      name={name}
      photoURL={participant.photoURL}
      isLocal={participant.isLocal}
      className="theater-block-preview__seat"
      title={name}
    />
  );
}

export default function TheaterBlockPreview({ theater }: TheaterBlockPreviewProps) {
  const { t } = useTranslation();
  const labelOf = usePersonLabel();
  const speakingByParticipant = useCallsStore((s) => s.speakingByParticipant);
  const speakers = stageParticipants(theater);
  const speakerSlots = Array.from(
    { length: THEATER_PREVIEW_SPEAKER_SLOTS },
    (_, index) => speakers[index] ?? null,
  );
  const benches = theaterPreviewBenches(
    buildTheaterAudienceSeats(theater.audience, theater.audienceSeatByUserId ?? {}),
  );

  return (
    <div className="theater-block-preview" aria-hidden>
      <div className="theater-block-preview__stage" aria-label={t("calls.speakersAria")}>
        {speakerSlots.map((speaker, index) =>
          speaker ? (
            <div
              key={speaker.id}
              className={clsx(
                "theater-block-preview__speaker",
                speakingByParticipant[speaker.id] && "theater-block-preview__speaker--speaking",
              )}
              title={labelOf(speaker.name, speaker.isLocal)}
            >
              <UserAvatar
                userId={speaker.id}
                name={labelOf(speaker.name, speaker.isLocal)}
                photoURL={speaker.photoURL}
                isLocal={speaker.isLocal}
                className="theater-block-preview__speaker-avatar"
              />
            </div>
          ) : (
            <div
              key={`speaker-empty-${index}`}
              className="theater-block-preview__speaker theater-block-preview__speaker--empty"
            />
          ),
        )}
      </div>

      <div className="theater-block-preview__benches" aria-label={t("calls.audienceAria")}>
        {benches.map((seats, benchIndex) => (
          <div key={`bench-${benchIndex}`} className="theater-block-preview__bench">
            {Array.from({ length: THEATER_BENCH_SEAT_COUNT }, (_, seatIndex) => (
              <PreviewSeat
                key={`${benchIndex}-${seatIndex}`}
                participant={seats[seatIndex] ?? null}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
