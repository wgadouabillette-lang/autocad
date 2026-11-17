import clsx from "clsx";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isFormaDesktopMac, isFormaDesktopWindows } from "../../lib/formaDesktop";
import { useStore } from "../../store/useStore";
import HeaderDirectCallButton from "./HeaderDirectCallButton";
import HeaderUpgradeButton from "./HeaderUpgradeButton";
import HeaderInviteButton from "../workspace/HeaderInviteButton";
import WorkspaceSwitcherButton from "../workspace/WorkspaceSwitcherButton";

/** Switcher workspace + paramètres du header principal. */
export default function PanelToolbarButtons() {
  const { t } = useTranslation();
  const openSettingsPage = useStore((s) => s.openSettingsPage);
  const activePage = useStore((s) => s.activePage);
  const settingsOpen = activePage === "settings";
  const inviteInToolbar = isFormaDesktopMac() || isFormaDesktopWindows();

  return (
    <div className="header-toolbar-actions">
      <HeaderUpgradeButton />
      <HeaderDirectCallButton />
      <WorkspaceSwitcherButton />
      {inviteInToolbar ? <HeaderInviteButton /> : null}
      <button
        type="button"
        className={clsx("toolbar-btn", settingsOpen && "is-active")}
        onClick={() => openSettingsPage()}
        aria-label={t("bar.settings")}
        aria-pressed={settingsOpen}
        title={t("bar.settings")}
      >
        <Settings size={14} strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}
