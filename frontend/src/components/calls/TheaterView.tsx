import clsx from "clsx";
import { MessageSquare, Undo2 } from "lucide-react";
import {
  pendingHandRaises,
  stageParticipants,
  type TheaterState,
} from "../../lib/theater";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";
import TheaterParticipantTile from "./TheaterParticipantTile";
import TheaterSpeakerCard from "./TheaterSpeakerCard";

interface TheaterViewProps {
  workspaceId: string;
  theater: TheaterState;
}

export default function TheaterView({ workspaceId, theater }: TheaterViewProps) {
  const acceptHandRaise = useCallsStore((s) => s.acceptHandRaise);
  const declineHandRaise = useCallsStore((s) => s.declineHandRaise);
  const endQuestion = useCallsStore((s) => s.endQuestion);
  const openTheaterChatPanel = useStore((s) => s.openTheaterChatPanel);

  const stage = stageParticipants(theater);
  const handQueue = pendingHandRaises(theater);
  const isSpeaker = theater.localRole === "speaker";
  const localRole = theater.localRole;
  const onStageAsQuestion = localRole === "question";
  const canUseStageActions = localRole === "audience" || localRole === "question";

  return (
    <div className="theater-view">
      <div className="theater-view__stage-grid" aria-label="Intervenants">
        {stage.map((participant) => (
          <TheaterSpeakerCard
            key={participant.id}
            participant={participant}
            workspaceId={workspaceId}
          />
        ))}
      </div>

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

      {canUseStageActions ? (
        <div className="theater-view__stage-actions" role="toolbar" aria-label="Actions scène">
          <button
            type="button"
            className="theater-view__stage-action"
            onClick={() => endQuestion(workspaceId)}
            disabled={!onStageAsQuestion}
            title="Retour coulisses"
          >
            <Undo2 size={14} aria-hidden />
            Retour coulisses
          </button>
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

      <section className="theater-view__audience" aria-label="Spectateurs">
        <p className="theater-view__section-label">Spectateurs</p>
        <div
          className={clsx(
            "theater-view__audience-grid",
            theater.audience.length === 0 && "theater-view__audience-grid--empty",
          )}
        >
          {theater.audience.length === 0 ? (
            <p className="theater-view__empty">Aucun spectateur pour l&apos;instant</p>
          ) : (
            theater.audience.map((participant) => {
              const handRaised = handQueue.some((r) => r.userId === participant.id);
              return (
                <TheaterParticipantTile
                  key={participant.id}
                  participant={participant}
                  workspaceId={workspaceId}
                  handRaised={handRaised}
                  muted
                />
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
