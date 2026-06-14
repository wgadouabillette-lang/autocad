import { createPortal } from "react-dom";
import { incomingHandRaise, type TheaterState } from "../../lib/theater";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";

interface HandRaiseOverlayProps {
  theater: TheaterState;
}

/** Modal pour les intervenants qui reçoivent une main levée. */
export default function HandRaiseOverlay({ theater }: HandRaiseOverlayProps) {
  const workspaceId = useStore((s) => s.activeRoomId);
  const acceptHandRaise = useCallsStore((s) => s.acceptHandRaise);
  const declineHandRaise = useCallsStore((s) => s.declineHandRaise);

  const incoming = incomingHandRaise(theater);
  if (!incoming) return null;

  return createPortal(
    <>
      <div className="join-knock__backdrop" aria-hidden />
      <div
        className="join-knock"
        role="dialog"
        aria-live="polite"
        aria-label={`${incoming.userName} lève la main`}
      >
        <div className="join-knock__icon" aria-hidden>
          <span className="join-knock__hand" />
        </div>

        <p className="join-knock__title">
          <span className="join-knock__name">{incoming.userName}</span> lève la main pour poser
          une question
        </p>

        <p className="join-knock__hint">
          Accepter pour l&apos;emmener sur scène le temps de sa question.
        </p>

        <div className="join-knock__actions join-knock__actions--split">
          <button
            type="button"
            className="join-knock__btn"
            onClick={() => declineHandRaise(workspaceId, incoming.id)}
          >
            Refuser
          </button>
          <button
            type="button"
            className="join-knock__btn"
            onClick={() => acceptHandRaise(workspaceId, incoming.id)}
            disabled={!!theater.question}
          >
            Appeler
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
