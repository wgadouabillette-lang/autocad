import clsx from "clsx";
import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useWorkspaceOverlayStore } from "../../store/useWorkspaceOverlayStore";

export default function WorkspaceAddButton() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const quickMenuOpen = useWorkspaceOverlayStore((s) => s.quickMenuOpen);
  const toggleQuickMenu = useWorkspaceOverlayStore((s) => s.toggleQuickMenu);
  const setQuickMenuAnchorEl = useWorkspaceOverlayStore((s) => s.setQuickMenuAnchorEl);

  useEffect(() => {
    setQuickMenuAnchorEl(buttonRef.current);
    return () => setQuickMenuAnchorEl(null);
  }, [setQuickMenuAnchorEl]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={clsx(
        "app-chrome-row__workspace-brand__add",
        quickMenuOpen && "is-open",
      )}
      onClick={(event) => {
        event.stopPropagation();
        toggleQuickMenu();
      }}
      title="Créer ou rejoindre un workspace"
      aria-label="Créer ou rejoindre un workspace"
      aria-expanded={quickMenuOpen}
      aria-haspopup="menu"
    >
      <Plus size={14} strokeWidth={2.25} aria-hidden />
    </button>
  );
}
