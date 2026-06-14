import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import { useStore } from "../../store/useStore";

/** Capsule profil / paramètres dans le header principal. */
export default function PanelToolbarButtons() {
  const openSettingsPage = useStore((s) => s.openSettingsPage);
  const activePage = useStore((s) => s.activePage);
  const userDisplayName = useStore((s) => s.userDisplayName);
  const settingsOpen = activePage === "settings";

  return (
    <button
      type="button"
      className={clsx(
        "header-chrome-control",
        "header-profile-capsule",
        settingsOpen && "is-active",
      )}
      onClick={() => openSettingsPage()}
      title="Paramètres"
      aria-label={`Paramètres — ${userDisplayName}`}
      aria-pressed={settingsOpen}
    >
      <span className="header-profile-capsule__name">{userDisplayName}</span>
      <ArrowUpRight
        size={12}
        strokeWidth={2.25}
        className="header-profile-capsule__arrow"
        aria-hidden
      />
    </button>
  );
}
