import clsx from "clsx";
import { Settings } from "lucide-react";
import { useStore } from "../../store/useStore";

/** Bouton paramètres du header principal. */
export default function PanelToolbarButtons() {
  const openSettingsPage = useStore((s) => s.openSettingsPage);
  const activePage = useStore((s) => s.activePage);
  const settingsOpen = activePage === "settings";

  return (
    <div className="header-toolbar-actions">
      <button
        type="button"
        className={clsx("toolbar-btn", settingsOpen && "is-active")}
        onClick={() => openSettingsPage()}
        aria-label="Paramètres"
        aria-pressed={settingsOpen}
        title="Paramètres"
      >
        <Settings size={14} strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}
