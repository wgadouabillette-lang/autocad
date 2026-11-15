import { useEffect } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { Trans, useTranslation } from "react-i18next";
import { usePersonLabel } from "../../lib/participantLabel";
import { incomingHandRaise, type TheaterState } from "../../lib/theater";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";

/** Aperçu design : main levée figée. Remettre à false pour le comportement réel. */
export const PREVIEW_HAND_RAISE: boolean = false;

const PREVIEW_HAND_RAISE_NAME = "Camille";

export function useHandRaiseDesignPreview(): void {
  useEffect(() => {
    if (!PREVIEW_HAND_RAISE) return;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(<HandRaisePreview />);
    return () => {
      root.unmount();
      host.remove();
    };
  }, []);
}

function HandRaisePreview() {
  const { t } = useTranslation();
  return createPortal(
    <>
      <div className="join-knock__backdrop" aria-hidden />
      <div
        className="join-knock"
        role="dialog"
        aria-live="polite"
        aria-label={t("calls.handRaiseAria", { name: PREVIEW_HAND_RAISE_NAME })}
      >
        <div className="join-knock__icon" aria-hidden>
          <span className="join-knock__hand" />
        </div>

        <p className="join-knock__title">
          <Trans
            i18nKey="calls.handRaiseQuestion"
            values={{ name: PREVIEW_HAND_RAISE_NAME }}
            components={{ name: <span className="join-knock__name" /> }}
          />
        </p>

        <p className="join-knock__hint">{t("calls.handRaiseHint")}</p>

        <div className="join-knock__actions join-knock__actions--split">
          <button type="button" className="join-knock__btn">
            {t("calls.decline")}
          </button>
          <button type="button" className="join-knock__btn">
            {t("calls.bringOnStage")}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

interface HandRaiseOverlayProps {
  theater: TheaterState;
}

/** Modal pour les intervenants qui reçoivent une main levée. */
export default function HandRaiseOverlay({ theater }: HandRaiseOverlayProps) {
  const { t } = useTranslation();
  const labelOf = usePersonLabel();
  const workspaceId = useStore((s) => s.activeRoomId);
  const acceptHandRaise = useCallsStore((s) => s.acceptHandRaise);
  const declineHandRaise = useCallsStore((s) => s.declineHandRaise);

  const incoming = incomingHandRaise(theater);
  if (PREVIEW_HAND_RAISE || !incoming) return null;
  const raiserName = labelOf(incoming.userName, false);

  return createPortal(
    <>
      <div className="join-knock__backdrop" aria-hidden />
      <div
        className="join-knock"
        role="dialog"
        aria-live="polite"
        aria-label={t("calls.handRaiseAria", { name: raiserName })}
      >
        <div className="join-knock__icon" aria-hidden>
          <span className="join-knock__hand" />
        </div>

        <p className="join-knock__title">
          <Trans
            i18nKey="calls.handRaiseQuestion"
            values={{ name: raiserName }}
            components={{ name: <span className="join-knock__name" /> }}
          />
        </p>

        <p className="join-knock__hint">{t("calls.handRaiseHint")}</p>

        <div className="join-knock__actions join-knock__actions--split">
          <button
            type="button"
            className="join-knock__btn"
            onClick={() => declineHandRaise(workspaceId, incoming.id)}
          >
            {t("calls.decline")}
          </button>
          <button
            type="button"
            className="join-knock__btn"
            onClick={() => acceptHandRaise(workspaceId, incoming.id)}
            disabled={!!theater.question}
          >
            {t("calls.bringOnStage")}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
