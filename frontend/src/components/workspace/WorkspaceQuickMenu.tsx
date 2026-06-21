import { useCallback, useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowUpRight, ChevronRight, Plus, UsersRound } from "lucide-react";
import { LOCAL_USER_ID } from "../../lib/workspaces";
import {
  ownedWorkspaceLimitMessage,
} from "../../lib/subscriptionPlans";
import { useAuthStore } from "../../store/useAuthStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";
import { useStore } from "../../store/useStore";
import { useWorkspaceOverlayStore } from "../../store/useWorkspaceOverlayStore";

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

export default function WorkspaceQuickMenu() {
  const quickMenuOpen = useWorkspaceOverlayStore((s) => s.quickMenuOpen);
  const quickMenuAnchorEl = useWorkspaceOverlayStore((s) => s.quickMenuAnchorEl);
  const quickMenuView = useWorkspaceOverlayStore((s) => s.quickMenuView);
  const closeQuickMenu = useWorkspaceOverlayStore((s) => s.closeQuickMenu);
  const setQuickMenuView = useWorkspaceOverlayStore((s) => s.setQuickMenuView);
  const switchWorkspace = useStore((s) => s.switchWorkspace);
  const userDisplayName = useStore((s) => s.userDisplayName);
  const userEmail = useStore((s) => s.userEmail);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const openSettingsPage = useStore((s) => s.openSettingsPage);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const canUserCreateWorkspace = useWorkspacesStore((s) => s.canUserCreateWorkspace);
  const createWorkspace = useWorkspacesStore((s) => s.createWorkspace);
  const requestJoinWorkspace = useWorkspacesStore((s) => s.requestJoinWorkspace);

  const [draftName, setDraftName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSent, setJoinSent] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<DropdownPosition | null>(null);

  const ownerUserId = firebaseUid ?? LOCAL_USER_ID;
  const canCreate = canUserCreateWorkspace(ownerUserId);
  const workspaceLimitHint = ownedWorkspaceLimitMessage(subscriptionPlan, billingManaged);

  const updateDropdownPosition = useCallback(() => {
    if (!quickMenuAnchorEl) {
      setDropdownPos(null);
      return;
    }
    const rect = quickMenuAnchorEl.getBoundingClientRect();
    const width = 240;
    let left = rect.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    setDropdownPos({
      top: rect.bottom + 8,
      left,
      width,
    });
  }, [quickMenuAnchorEl]);

  useLayoutEffect(() => {
    if (!quickMenuOpen) {
      setDropdownPos(null);
      return;
    }
    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [quickMenuOpen, updateDropdownPosition]);

  useEffect(() => {
    if (!quickMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (quickMenuView !== "menu") {
          setQuickMenuView("menu");
          return;
        }
        closeQuickMenu();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [quickMenuOpen, quickMenuView, closeQuickMenu, setQuickMenuView]);

  useEffect(() => {
    if (!quickMenuOpen) {
      setDraftName("");
      setJoinId("");
      setJoinBusy(false);
      setJoinError(null);
      setJoinSent(false);
      setCreateError(null);
    }
  }, [quickMenuOpen]);

  if (!quickMenuOpen || !dropdownPos) return null;

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!draftName.trim()) return;
    if (!canCreate) {
      setCreateError(workspaceLimitHint);
      return;
    }
    try {
      const id = createWorkspace(draftName, userDisplayName, ownerUserId);
      setDraftName("");
      void useAuthStore.getState().syncWorkspacesToCloud();
      switchWorkspace(id);
      closeQuickMenu();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Création impossible.");
    }
  };

  const onRequestJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (joinBusy || !joinId.trim()) return;
    if (!firebaseUid) {
      setJoinError("Connectez-vous pour rejoindre un workspace.");
      return;
    }
    setJoinBusy(true);
    setJoinError(null);
    setJoinSent(false);
    try {
      await requestJoinWorkspace(joinId, {
        uid: firebaseUid,
        displayName: userDisplayName,
        email: userEmail,
      });
      setJoinSent(true);
      setJoinId("");
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "Demande impossible.");
    } finally {
      setJoinBusy(false);
    }
  };

  return createPortal(
    <>
      <button
        type="button"
        className="workspace-switcher__backdrop"
        aria-label="Fermer le menu workspace"
        onClick={closeQuickMenu}
      />
      <div
        className="workspace-quick-menu"
        style={{
          top: dropdownPos.top,
          left: dropdownPos.left,
          width: dropdownPos.width,
        }}
        role="menu"
        aria-label="Workspace"
      >
        {quickMenuView === "menu" ? (
          <>
            <button
              type="button"
              className="workspace-quick-menu__item"
              role="menuitem"
              onClick={() => setQuickMenuView("create")}
            >
              <span className="workspace-quick-menu__item-main">
                <span className="workspace-quick-menu__item-icon" aria-hidden>
                  <Plus size={14} />
                </span>
                <span className="workspace-quick-menu__item-label">Créer un workspace</span>
              </span>
              <ChevronRight size={14} className="workspace-quick-menu__item-chevron" aria-hidden />
            </button>
            <button
              type="button"
              className="workspace-quick-menu__item"
              role="menuitem"
              onClick={() => setQuickMenuView("join")}
            >
              <span className="workspace-quick-menu__item-main">
                <span className="workspace-quick-menu__item-icon" aria-hidden>
                  <UsersRound size={14} />
                </span>
                <span className="workspace-quick-menu__item-label">Rejoindre un workspace</span>
              </span>
              <ChevronRight size={14} className="workspace-quick-menu__item-chevron" aria-hidden />
            </button>
          </>
        ) : (
          <div className="workspace-quick-menu__panel">
            <button
              type="button"
              className="workspace-quick-menu__back"
              onClick={() => setQuickMenuView("menu")}
            >
              <ArrowLeft size={14} aria-hidden />
              Retour
            </button>

            {quickMenuView === "create" ? (
              <form className="workspace-overlay__create" onSubmit={onCreate}>
                <label className="workspace-overlay__create-label" htmlFor="workspace-quick-create-name">
                  Créer un workspace
                </label>
                <p className="workspace-overlay__create-label text-muted-500">{workspaceLimitHint}</p>
                <div className="workspace-overlay__create-row">
                  <input
                    id="workspace-quick-create-name"
                    type="text"
                    className="workspace-overlay__create-input"
                    placeholder="Nom du workspace…"
                    value={draftName}
                    disabled={!canCreate}
                    onChange={(e) => {
                      setDraftName(e.target.value);
                      setCreateError(null);
                    }}
                  />
                  <button
                    type="submit"
                    className="workspace-overlay__create-btn"
                    disabled={!canCreate || !draftName.trim()}
                  >
                    <Plus size={14} aria-hidden />
                    Créer
                  </button>
                </div>
                {createError ? (
                  <p className="workspace-overlay__create-label text-red-400">{createError}</p>
                ) : null}
                {!canCreate ? (
                  <button
                    type="button"
                    className="workspace-switcher-dropdown__upgrade"
                    onClick={() => {
                      closeQuickMenu();
                      setSettingsTab("usage");
                      openSettingsPage();
                    }}
                  >
                    Passer à Pro
                    <ArrowUpRight size={12} aria-hidden />
                  </button>
                ) : null}
              </form>
            ) : (
              <form className="workspace-overlay__create" onSubmit={(e) => void onRequestJoin(e)}>
                <label className="workspace-overlay__create-label" htmlFor="workspace-quick-join-id">
                  Rejoindre un workspace
                </label>
                <div className="workspace-overlay__create-row">
                  <input
                    id="workspace-quick-join-id"
                    type="text"
                    className="workspace-overlay__create-input"
                    placeholder="Lien ou identifiant…"
                    value={joinId}
                    disabled={joinBusy}
                    onChange={(e) => {
                      setJoinId(e.target.value);
                      setJoinError(null);
                      setJoinSent(false);
                    }}
                  />
                  <button
                    type="submit"
                    className="workspace-overlay__create-btn"
                    disabled={joinBusy || !joinId.trim()}
                  >
                    Demander
                  </button>
                </div>
                {joinError ? (
                  <p className="workspace-overlay__create-label text-red-400">{joinError}</p>
                ) : null}
                {joinSent ? (
                  <p className="workspace-overlay__create-label text-emerald-400">
                    Demande envoyée. Vous serez notifié si le propriétaire accepte.
                  </p>
                ) : null}
              </form>
            )}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
