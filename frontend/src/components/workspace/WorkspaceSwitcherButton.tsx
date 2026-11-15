import clsx from "clsx";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceOverlayStore } from "../../store/useWorkspaceOverlayStore";
import { workspaceLabel, useWorkspacesStore } from "../../store/useWorkspacesStore";
import { useStore } from "../../store/useStore";

/** Capsule switcher workspace — à gauche du badge Pro. */
export default function WorkspaceSwitcherButton() {
  const { t } = useTranslation();
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
    <button
      ref={buttonRef}
      type="button"
      className={clsx("workspace-switcher-capsule", "toolbar-btn", panelOpen && "is-active")}
      onClick={() => {
        closeQuickMenu();
        togglePanel();
      }}
      title={workspaceName}
      aria-label={t("bar.switchWorkspace", { name: workspaceName })}
      aria-expanded={panelOpen}
      aria-haspopup="dialog"
    >
      <span className="header-toolbar-actions__label">Workspace</span>
    </button>
  );
}
