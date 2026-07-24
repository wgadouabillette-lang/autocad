import clsx from "clsx";
import {
  buildTheaterAudienceSeats,
  stageParticipants,
  theaterPreviewBenches,
  THEATER_BENCH_SEAT_COUNT,
  THEATER_PREVIEW_SPEAKER_SLOTS,
  type TheaterParticipant,
  type TheaterState,
} from "../../lib/theater";
import { useCallsStore } from "../../store/useCallsStore";
import UserAvatar from "../UserAvatar";

interface TheaterBlockPreviewProps {
  theater: TheaterState;
}

function PreviewSeat({ participant }: { participant: TheaterParticipant | null }) {
  if (!participant) {
    return <span className="theater-block-preview__seat theater-block-preview__seat--empty" aria-hidden />;
  }

  return (
    <UserAvatar
      userId={participant.id}
      name={participant.name}
      photoURL={participant.photoURL}
      isLocal={participant.isLocal}
      className="theater-block-preview__seat"
      title={participant.name}
    />
  );
}

export default function TheaterBlockPreview({ theater }: TheaterBlockPreviewProps) {
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
      <div className="theater-block-preview__stage" aria-label="Intervenants">
        {speakerSlots.map((speaker, index) =>
          speaker ? (
            <div
              key={speaker.id}
              className={clsx(
                "theater-block-preview__speaker",
                speakingByParticipant[speaker.id] && "theater-block-preview__speaker--speaking",
              )}
              title={speaker.name}
            >
              <UserAvatar
                userId={speaker.id}
                name={speaker.name}
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

      <div className="theater-block-preview__benches" aria-label="Spectateurs">
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
