import clsx from "clsx";
import { Shuffle } from "lucide-react";
import { useEffect, useRef } from "react";
import { useWorkspaceOverlayStore } from "../../store/useWorkspaceOverlayStore";
import { workspaceLabel, useWorkspacesStore } from "../../store/useWorkspacesStore";
import { useStore } from "../../store/useStore";

/** Bouton workspace — icône double flèche, sélecteur à gauche du header. */
export default function WorkspaceBrandButton() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const panelOpen = useWorkspaceOverlayStore((s) => s.panelOpen);
  const togglePanel = useWorkspaceOverlayStore((s) => s.togglePanel);
  const closeQuickMenu = useWorkspaceOverlayStore((s) => s.closeQuickMenu);
  const setAnchorEl = useWorkspaceOverlayStore((s) => s.setAnchorEl);
  const workspace = useWorkspacesStore((s) => s.findWorkspace(activeRoomId));
  const workspaceName = workspace?.name ?? workspaceLabel(activeRoomId);

  useEffect(() => {
    setAnchorEl(buttonRef.current);
    return () => setAnchorEl(null);
  }, [setAnchorEl]);

  return (
    <div
      className={clsx(
        "app-chrome-row__workspace-brand-group",
        panelOpen && "is-open",
      )}
    >
      <button
        ref={buttonRef}
        type="button"
        className={clsx("workspace-switcher-capsule", "toolbar-btn", panelOpen && "is-active")}
        onClick={() => {
          closeQuickMenu();
          togglePanel();
        }}
        title={workspaceName}
        aria-label={`Serveur actif — ${workspaceName}`}
        aria-expanded={panelOpen}
        aria-haspopup="dialog"
      >
        <Shuffle size={14} strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}
