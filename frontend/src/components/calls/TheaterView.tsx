import { MessageSquare, Mic, Undo2 } from "lucide-react";
import {
  buildTheaterAudienceSeats,
  pendingHandRaises,
  stageParticipants,
  theaterAudienceBenchesFromSeats,
  type TheaterState,
} from "../../lib/theater";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";
import TheaterAudienceBench from "./TheaterAudienceBench";
import TheaterSpeakerCard from "./TheaterSpeakerCard";

interface TheaterViewProps {
  workspaceId: string;
  theater: TheaterState;
}

export default function TheaterView({ workspaceId, theater }: TheaterViewProps) {
  const acceptHandRaise = useCallsStore((s) => s.acceptHandRaise);
  const declineHandRaise = useCallsStore((s) => s.declineHandRaise);
  const promoteOwnerToTheaterSpeaker = useCallsStore((s) => s.promoteOwnerToTheaterSpeaker);
  const returnToTheaterBackstage = useCallsStore((s) => s.returnToTheaterBackstage);
  const moveLocalTheaterSeat = useCallsStore((s) => s.moveLocalTheaterSeat);
  const openTheaterChatPanel = useStore((s) => s.openTheaterChatPanel);
  const isOwner = useWorkspacesStore((s) => s.isWorkspaceOwner(workspaceId));

  const stage = stageParticipants(theater);
  const handQueue = pendingHandRaises(theater);
  const isSpeaker = theater.localRole === "speaker";
  const localRole = theater.localRole;
  const onStage = localRole === "speaker" || localRole === "question";
  const inTheater = localRole !== null;
  const showOwnerPromote = isOwner && localRole === "audience";
  const audienceSeats = buildTheaterAudienceSeats(
    theater.audience,
    theater.audienceSeatByUserId ?? {},
  );
  const audienceBenches = theaterAudienceBenchesFromSeats(audienceSeats);
  const canPickSeat = localRole === "audience";
  const handRaisedByUserId = new Set(
    handQueue.map((request) => request.userId),
  );
  const handRaiseRequestByUserId = Object.fromEntries(
    handQueue.map((request) => [request.userId, request.id] as const),
  );
  const questionSlotFree = !theater.question;

  return (
    <div className="theater-view">
      <section className="theater-view__stage" aria-label="Intervenants">
        <div className="theater-view__stage-grid">
          {stage.length === 0 ? (
            <div className="theater-speaker-card theater-speaker-card--placeholder" aria-hidden />
          ) : (
            stage.map((participant) => (
              <TheaterSpeakerCard
                key={participant.id}
                participant={participant}
                workspaceId={workspaceId}
                isOwner={isOwner && participant.isLocal && participant.role === "speaker"}
              />
            ))
          )}
        </div>
      </section>

      <div className="theater-view__controls">
        {isSpeaker && handQueue.length > 0 && (
          <div className="theater-view__hand-queue">
            <p className="theater-view__hand-queue-title">
              Mains levées ({handQueue.length})
            </p>
            <ul className="theater-view__hand-queue-list">
              {handQueue.map((request) => (
                <li key={request.id} className="theater-view__hand-queue-item">
                  <span>{request.userName}</span>
                  <div className="theater-view__hand-queue-actions">
                    <button
                      type="button"
                      className="theater-view__hand-decline"
                      onClick={() => declineHandRaise(workspaceId, request.id)}
                    >
                      Refuser
                    </button>
                    <button
                      type="button"
                      className="theater-view__hand-accept"
                      onClick={() => acceptHandRaise(workspaceId, request.id)}
                      disabled={!!theater.question}
                    >
                      Appeler
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {inTheater ? (
          <div className="theater-view__stage-actions" role="toolbar" aria-label="Actions scène">
            {showOwnerPromote ? (
              <button
                type="button"
                className="theater-view__stage-action theater-view__stage-action--primary"
                onClick={() => promoteOwnerToTheaterSpeaker(workspaceId)}
                title="Monter sur scène en tant qu'intervenant"
              >
                <Mic size={14} aria-hidden />
                Monter sur scène
              </button>
            ) : null}
            {onStage ? (
              <button
                type="button"
                className="theater-view__stage-action"
                onClick={() => returnToTheaterBackstage(workspaceId)}
                title="Retour coulisses"
              >
                <Undo2 size={14} aria-hidden />
                Retour coulisses
              </button>
            ) : null}
            <button
              type="button"
              className="theater-view__stage-action theater-view__stage-action--primary"
              onClick={() => openTheaterChatPanel()}
              title="Poser une question dans le chat du théâtre"
            >
              <MessageSquare size={14} aria-hidden />
              Question au chat
            </button>
          </div>
        ) : (
          <div className="theater-view__divider" role="separator" aria-hidden />
        )}
      </div>

      <section className="theater-view__audience" aria-label="Spectateurs">
        <div className="theater-view__audience-benches">
          {audienceBenches.map((bench, index) => (
            <TheaterAudienceBench
              key={`bench-${index}`}
              benchIndex={index}
              seats={bench}
              workspaceId={workspaceId}
              handRaisedByUserId={handRaisedByUserId}
              handRaiseRequestByUserId={handRaiseRequestByUserId}
              canPickSeat={canPickSeat}
              canAcceptHandRaise={isSpeaker}
              questionSlotFree={questionSlotFree}
              onPickSeat={(seatIndex) => moveLocalTheaterSeat(workspaceId, seatIndex)}
              onAcceptHandRaise={(requestId) => acceptHandRaise(workspaceId, requestId)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
