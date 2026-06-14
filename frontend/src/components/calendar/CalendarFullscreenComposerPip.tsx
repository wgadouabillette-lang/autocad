import { useStore } from "../../store/useStore";
import { useCalendarOverlayStore } from "../../store/useCalendarOverlayStore";
import CalendarEventComposer from "./CalendarEventComposer";

export default function CalendarFullscreenComposerPip() {
  const chatPanelExpanded = useStore((s) => s.chatPanelExpanded);
  const chatPanelLeaveAnimating = useStore((s) => s.chatPanelLeaveAnimating);
  const chatPanelMode = useStore((s) => s.chatPanelMode);
  const composerOpen = useCalendarOverlayStore((s) => s.composerOpen);

  const isOverlay = chatPanelExpanded || chatPanelLeaveAnimating;
  const visible = isOverlay && chatPanelMode === "calendar" && composerOpen;
  if (!visible) return null;

  return (
    <div className="calendar-fullscreen-composer-pip" aria-label="Créer un événement">
      <div className="calendar-fullscreen-composer-pip__morph">
        <CalendarEventComposer />
      </div>
    </div>
  );
}
