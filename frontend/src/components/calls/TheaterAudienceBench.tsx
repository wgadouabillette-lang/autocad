import { THEATER_BENCH_SEAT_COUNT, type TheaterParticipant } from "../../lib/theater";
import { useCallsStore } from "../../store/useCallsStore";
import TheaterParticipantTile from "./TheaterParticipantTile";

interface TheaterAudienceBenchProps {
  benchIndex: number;
  seats: Array<TheaterParticipant | null>;
  workspaceId: string;
  handRaisedByUserId: Set<string>;
  handRaiseRequestByUserId: Record<string, string>;
  canPickSeat: boolean;
  canAcceptHandRaise: boolean;
  questionSlotFree: boolean;
  onPickSeat: (globalSeatIndex: number) => void;
  onAcceptHandRaise: (requestId: string) => void;
}

export default function TheaterAudienceBench({
  benchIndex,
  seats,
  workspaceId,
  handRaisedByUserId,
  handRaiseRequestByUserId,
  canPickSeat,
  canAcceptHandRaise,
  questionSlotFree,
  onPickSeat,
  onAcceptHandRaise,
}: TheaterAudienceBenchProps) {
  const localMuted = useCallsStore((s) => s.muted);
  const mutedByParticipant = useCallsStore((s) => s.mutedByParticipant);

  const participantMuted = (participant: TheaterParticipant) =>
    participant.isLocal ? localMuted : mutedByParticipant[participant.id] === true;

  return (
    <article className="theater-bench" aria-label={`Banc ${benchIndex + 1}`}>
      <div className="theater-bench__seats">
        {Array.from({ length: THEATER_BENCH_SEAT_COUNT }, (_, seatIndex) => {
          const participant = seats[seatIndex] ?? null;
          const globalSeatIndex = benchIndex * THEATER_BENCH_SEAT_COUNT + seatIndex;

          if (!participant) {
            if (canPickSeat) {
              return (
                <div key={`empty-${benchIndex}-${seatIndex}`} className="theater-bench__seat">
                  <button
                    type="button"
                    className="theater-bench__seat--empty theater-bench__seat--pickable"
                    onClick={() => onPickSeat(globalSeatIndex)}
                    title="S'installer ici"
                    aria-label="S'installer ici"
                  />
                </div>
              );
            }

            return (
              <div key={`empty-${benchIndex}-${seatIndex}`} className="theater-bench__seat">
                <div className="theater-bench__seat--empty" aria-hidden />
              </div>
            );
          }

          const isHandRaised = handRaisedByUserId.has(participant.id);
          const requestId = handRaiseRequestByUserId[participant.id];
          const promotable = canAcceptHandRaise && isHandRaised && !!requestId;

          return (
            <div key={participant.id} className="theater-bench__seat">
              <TheaterParticipantTile
                participant={participant}
                workspaceId={workspaceId}
                handRaised={isHandRaised}
                muted={participantMuted(participant)}
                seat
                onAcceptHandRaise={
                  promotable ? () => onAcceptHandRaise(requestId) : undefined
                }
                canAcceptHandRaise={questionSlotFree}
              />
            </div>
          );
        })}
      </div>
    </article>
  );
}
