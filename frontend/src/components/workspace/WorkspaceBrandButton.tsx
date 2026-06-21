import clsx from "clsx";
import { useEffect, useRef } from "react";
import { useStore } from "../../store/useStore";
import { useWorkspaceOverlayStore } from "../../store/useWorkspaceOverlayStore";
import { workspaceLabel } from "../../store/useWorkspacesStore";
import WorkspaceAddButton from "./WorkspaceAddButton";

export default function WorkspaceBrandButton() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const panelOpen = useWorkspaceOverlayStore((s) => s.panelOpen);
  const togglePanel = useWorkspaceOverlayStore((s) => s.togglePanel);
  const closeQuickMenu = useWorkspaceOverlayStore((s) => s.closeQuickMenu);
  const setAnchorEl = useWorkspaceOverlayStore((s) => s.setAnchorEl);
  const workspaceName = workspaceLabel(activeRoomId);

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
        className="app-chrome-row__workspace-brand"
        onClick={() => {
          closeQuickMenu();
          togglePanel();
        }}
        title="Changer de serveur"
        aria-label={`Serveur actif — ${workspaceName}`}
        aria-expanded={panelOpen}
        aria-haspopup="dialog"
      >
        <span className="app-chrome-row__workspace-brand__name">{workspaceName}</span>
      </button>
      <WorkspaceAddButton />
    </div>
  );
}
