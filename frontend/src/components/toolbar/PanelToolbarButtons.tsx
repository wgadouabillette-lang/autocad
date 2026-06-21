import clsx from "clsx";
import { Settings } from "lucide-react";
import { useStore } from "../../store/useStore";

/** Bouton paramètres circulaire dans le header principal. */
export default function PanelToolbarButtons() {
  const openSettingsPage = useStore((s) => s.openSettingsPage);
  const activePage = useStore((s) => s.activePage);
  const settingsOpen = activePage === "settings";

  return (
    <button
      type="button"
      className={clsx(
        "header-chrome-control",
        "header-chrome-circle",
        settingsOpen && "is-active",
      )}
      onClick={() => openSettingsPage()}
      title="Paramètres"
      aria-label="Paramètres"
      aria-pressed={settingsOpen}
    >
      <Settings size={13} strokeWidth={2.25} className="header-chrome-circle__icon" aria-hidden />
    </button>
  );
}
