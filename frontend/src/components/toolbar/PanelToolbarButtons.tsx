import clsx from "clsx";
import { Settings } from "lucide-react";
import { ChromeSignetLabel, signetHostClassName } from "../../components/chrome/ChromeSignetLabel";
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
        signetHostClassName("inward-end"),
        settingsOpen && "is-active",
      )}
      onClick={() => openSettingsPage()}
      aria-label="Paramètres"
      aria-pressed={settingsOpen}
    >
      <ChromeSignetLabel label="Paramètres" placement="below" />
      <Settings size={13} strokeWidth={2.25} className="header-chrome-circle__icon" aria-hidden />
    </button>
  );
}
