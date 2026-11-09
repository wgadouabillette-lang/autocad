import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { useWorkspaceUpgradeStore } from "../../store/useWorkspaceUpgradeStore";

interface InviteSeatPromptState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useInviteSeatPromptStore = create<InviteSeatPromptState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

export default function InviteSeatPrompt() {
  const { t } = useTranslation();
  const open = useInviteSeatPromptStore((s) => s.open);
  const hide = useInviteSeatPromptStore((s) => s.hide);
  const openUpgrade = useWorkspaceUpgradeStore((s) => s.openUpgrade);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hide, open]);

  if (!open) return null;

  return createPortal(
    <div
      className="seat-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-seat-title"
      aria-describedby="invite-seat-subtitle"
    >
      <div className="seat-gate__backdrop" onClick={hide} />
      <div className="seat-gate__card seat-gate__card--invite-seats">
        <div className="seat-gate__invite-copy">
          <h2 id="invite-seat-title" className="seat-gate__title">
            {t("onboarding.inviteSeats.title")}
          </h2>
          <p id="invite-seat-subtitle" className="seat-gate__subtitle">
            {t("onboarding.inviteSeats.subtitle")}
          </p>
        </div>
        <button
          type="button"
          className="seat-gate__pay"
          onClick={() => {
            hide();
            openUpgrade();
          }}
        >
          {t("onboarding.inviteSeats.buyMore")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
