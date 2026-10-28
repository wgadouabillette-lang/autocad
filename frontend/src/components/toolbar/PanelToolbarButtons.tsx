import clsx from "clsx";
import { Settings } from "lucide-react";
import { landingLabel } from "../../lib/marketingPreview";
import { isFormaDesktopMac } from "../../lib/formaDesktop";
import { useStore } from "../../store/useStore";
import HeaderInviteButton from "../workspace/HeaderInviteButton";
import WorkspaceSwitcherButton from "../workspace/WorkspaceSwitcherButton";

/** Switcher workspace + paramètres du header principal. */
export default function PanelToolbarButtons() {
  const openSettingsPage = useStore((s) => s.openSettingsPage);
  const activePage = useStore((s) => s.activePage);
  const settingsOpen = activePage === "settings";
  const macDesktop = isFormaDesktopMac();

  return (
    <div className="header-toolbar-actions">
      <WorkspaceSwitcherButton />
      {macDesktop ? <HeaderInviteButton /> : null}
      <button
        type="button"
        className={clsx("toolbar-btn", settingsOpen && "is-active")}
        onClick={() => openSettingsPage()}
        aria-label={landingLabel("Settings", "Paramètres")}
        aria-pressed={settingsOpen}
        title={landingLabel("Settings", "Paramètres")}
      >
        <Settings size={14} strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}
