import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { useBilling } from "../../hooks/useBilling";
import { resolveClientLocale } from "../../lib/billingCurrency";
import { isMarketingPreview } from "../../lib/marketingPreview";
import {
  dismissNotesFullscreenPromo,
  isNotesFullscreenPromoDismissed,
  notesEditorDraftHasContent,
  plainTextFromNoteHtml,
  shouldHideNotesFullscreenPromoForBilling,
  subscribeNotesEditorDraft,
} from "../../lib/notesFullscreenPromo";
import { useRecapStore } from "../../store/useRecapStore";
import { useHandoffStore } from "../../store/useHandoffStore";
import { useStore } from "../../store/useStore";

function notesPromoCopy() {
  const fr = resolveClientLocale().toLowerCase().startsWith("fr");
  if (fr) {
    return {
      title: "Notes automatiques",
      body: "Passez à Pro pour des notes automatiques avec l'Assistance IA.",
      cta: "Passer à Pro",
      aria: "Passer à Pro pour des notes automatiques",
      dismiss: "Masquer la promotion",
    };
  }
  return {
    title: "Automatic notes",
    body: "Upgrade to Pro for automatic notes with AI Assistance.",
    cta: "Upgrade to Pro",
    aria: "Upgrade to Pro for automatic notes",
    dismiss: "Hide promotion",
  };
}

/**
 * Mini Pro promo in the right margin of fullscreen Notes.
 * Hidden for personal Pro / billingManaged, workspace notes access, live note
 * content, recap/handoff, marketing preview, or dismiss cooldown.
 */
export default function NotesFullscreenPromo() {
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const recapGenerating = useRecapStore((s) => s.generating);
  const noteHandoffOpen = useHandoffStore((s) => s.noteHandoffOpen);
  const activeManualNoteId = useStore((s) => s.activeManualNoteId);
  const chatSessions = useStore((s) => s.chatSessions);
  const openSettingsTab = useStore((s) => s.openSettingsTab);
  const { config } = useBilling();
  const [dismissed, setDismissed] = useState(() => isNotesFullscreenPromoDismissed());
  const noteHasContent = useSyncExternalStore(
    subscribeNotesEditorDraft,
    notesEditorDraftHasContent,
    () => false,
  );
  const copy = notesPromoCopy();
  const asideRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const promo = asideRef.current;
    if (!promo) return;
    const panel = promo.closest(".chat-panel");
    if (!(panel instanceof HTMLElement)) return;

    const syncTop = () => {
      const title = panel.querySelector(".manual-notes-panel__title-input");
      if (!(title instanceof HTMLElement)) {
        promo.style.removeProperty("top");
        return;
      }
      const panelRect = panel.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      promo.style.top = `${Math.max(0, titleRect.top - panelRect.top)}px`;
    };

    syncTop();
    const observer = new ResizeObserver(syncTop);
    observer.observe(panel);
    const title = panel.querySelector(".manual-notes-panel__title-input");
    if (title instanceof HTMLElement) observer.observe(title);
    window.addEventListener("resize", syncTop);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncTop);
    };
  }, []);

  if (isMarketingPreview()) return null;
  if (dismissed) return null;
  const savedNote = activeManualNoteId
    ? chatSessions.find((session) => session.id === activeManualNoteId)
    : null;
  const savedHasContent = notesEditorDraftHasContent({
    title: savedNote?.manualNoteTitle ?? "",
    bodyPlain: plainTextFromNoteHtml(
      savedNote?.manualNoteBody ?? savedNote?.messages?.[0]?.text ?? "",
    ),
  });
  if (noteHasContent || savedHasContent) return null;
  if (recapGenerating || noteHandoffOpen) return null;
  if (
    shouldHideNotesFullscreenPromoForBilling({
      subscriptionPlan,
      billingManaged,
      workspaceEnterpriseActive,
      configBillingManaged: config?.billingManaged,
    })
  ) {
    return null;
  }

  const handleDismiss = () => {
    dismissNotesFullscreenPromo();
    setDismissed(true);
  };

  return (
    <aside ref={asideRef} className="notes-fullscreen-promo" aria-label={copy.aria}>
      <div className="notes-fullscreen-promo__card">
        <div className="notes-fullscreen-promo__footer">
          <p className="notes-fullscreen-promo__title">{copy.title}</p>
          <p className="notes-fullscreen-promo__body">{copy.body}</p>
          <button
            type="button"
            className="notes-fullscreen-promo__cta"
            onClick={() => openSettingsTab("usage")}
          >
            <span>{copy.cta}</span>
            <ArrowUpRight size={12} strokeWidth={2.25} aria-hidden />
          </button>
        </div>
        <button
          type="button"
          className="notes-fullscreen-promo__dismiss"
          aria-label={copy.dismiss}
          title={copy.dismiss}
          onClick={handleDismiss}
        >
          <X size={10} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </aside>
  );
}
