import clsx from "clsx";
import { CircleHelp, Settings } from "lucide-react";
import { useState } from "react";
import { useStore } from "../../store/useStore";
import SupportTicketOverlay from "../support/SupportTicketOverlay";

/** Boutons support + paramètres du header principal. */
export default function PanelToolbarButtons() {
  const openSettingsPage = useStore((s) => s.openSettingsPage);
  const activePage = useStore((s) => s.activePage);
  const settingsOpen = activePage === "settings";
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <>
      <div className="header-toolbar-actions">
        <button
          type="button"
          className={clsx("toolbar-btn", supportOpen && "is-active")}
          onClick={() => setSupportOpen(true)}
          aria-label="Contacter le support"
          aria-haspopup="dialog"
          aria-expanded={supportOpen}
          title="Support"
        >
          <CircleHelp size={14} strokeWidth={2.25} aria-hidden />
        </button>
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
      {supportOpen ? <SupportTicketOverlay onClose={() => setSupportOpen(false)} /> : null}
    </>
  );
}
