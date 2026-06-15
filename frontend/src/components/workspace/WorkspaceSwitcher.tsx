/** Sélecteur de workspace — conservé pour une réintégration ultérieure (non monté dans le header). */
import clsx from "clsx";
import { Crown, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  LOCAL_USER_ID,
  serverRoleLabel,
  workspaceInitials,
  type ServerRole,
  type Workspace,
} from "../../lib/workspaces";
import { useAuthStore } from "../../store/useAuthStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";
import { useStore } from "../../store/useStore";

function WorkspaceTab({
  workspace,
  role,
  active,
  onSelect,
}: {
  workspace: Workspace;
  role: ServerRole;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const initials = workspaceInitials(workspace.name);
  const title = `${workspace.name} — ${serverRoleLabel(role)}`;

  return (
    <button
      type="button"
      className={clsx(
        "app-chrome-row__workspace-btn",
        active && "app-chrome-row__workspace-btn--active",
      )}
      onClick={() => onSelect(workspace.id)}
      title={title}
      aria-label={title}
      aria-current={active ? "true" : undefined}
    >
      <span
        className="app-chrome-row__workspace-icon"
        style={{ backgroundColor: workspace.accent }}
        aria-hidden
      >
        {initials}
      </span>
      <span className="truncate">{workspace.name}</span>
      {role === "owner" && (
        <Crown size={10} strokeWidth={2.25} className="shrink-0 text-amber-300/90" aria-hidden />
      )}
    </button>
  );
}

export default function WorkspaceSwitcher() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const userDisplayName = useStore((s) => s.userDisplayName);
  const userEmail = useStore((s) => s.userEmail);
  const setActiveRoom = useStore((s) => s.setActiveRoom);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const memberships = useWorkspacesStore((s) => s.memberships);
  const customServers = useWorkspacesStore((s) => s.customServers);
  const roleIn = useWorkspacesStore((s) => s.roleIn);
  const createWorkspace = useWorkspacesStore((s) => s.createWorkspace);
  const requestJoinWorkspace = useWorkspacesStore((s) => s.requestJoinWorkspace);

  const ownerUserId = firebaseUid ?? LOCAL_USER_ID;

  const workspaces = useMemo(
    () => useWorkspacesStore.getState().joinedWorkspaces(ownerUserId),
    [memberships, customServers, ownerUserId],
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSent, setJoinSent] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateMenuPosition = useCallback(() => {
    const button = menuButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = 280;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    setMenuPos({ top: rect.bottom + 6, left });
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    const onLayout = () => updateMenuPosition();
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [menuOpen, updateMenuPosition]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(t);
    };
  }, [menuOpen]);

  const onCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!draftName.trim()) return;
    const id = createWorkspace(draftName, userDisplayName, ownerUserId);
    setDraftName("");
    setMenuOpen(false);
    void useAuthStore.getState().syncWorkspacesToCloud();
    setActiveRoom(id);
  };

  const onRequestJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (joinBusy || !joinId.trim() || !firebaseUid) return;
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

  const actionMenu =
    menuOpen && menuPos
      ? createPortal(
          <>
            <button
              type="button"
              className="app-chrome-row__workspace-create-backdrop"
              aria-label="Fermer"
              onClick={() => setMenuOpen(false)}
            />
            <div
              className="app-chrome-row__workspace-menu"
              style={{ top: menuPos.top, left: menuPos.left }}
              role="dialog"
              aria-label="Créer ou rejoindre un serveur"
            >
              <form className="app-chrome-row__workspace-menu-section" onSubmit={onCreate}>
                <p className="app-chrome-row__workspace-menu-title">Créer un serveur</p>
                <p className="app-chrome-row__workspace-menu-hint">
                  Vous en serez le propriétaire.
                </p>
                <div className="app-chrome-row__workspace-create-row">
                  <input
                    ref={inputRef}
                    id="header-workspace-create"
                    type="text"
                    className="app-chrome-row__workspace-create-input"
                    placeholder="Nom du serveur…"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="app-chrome-row__workspace-create-btn"
                    disabled={!draftName.trim()}
                  >
                    <Plus size={14} aria-hidden />
                    Créer
                  </button>
                </div>
              </form>

              <form
                className="app-chrome-row__workspace-menu-section"
                onSubmit={(e) => void onRequestJoin(e)}
              >
                <p className="app-chrome-row__workspace-menu-title">Rejoindre un serveur</p>
                <p className="app-chrome-row__workspace-menu-hint">
                  Demandez l&apos;accès avec l&apos;identifiant du workspace.
                </p>
                <div className="app-chrome-row__workspace-create-row">
                  <input
                    type="text"
                    className="app-chrome-row__workspace-create-input"
                    placeholder="Identifiant…"
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
                    className="app-chrome-row__workspace-create-btn"
                    disabled={joinBusy || !joinId.trim()}
                  >
                    Demander
                  </button>
                </div>
                {joinError ? (
                  <p className="app-chrome-row__workspace-menu-hint text-red-400">{joinError}</p>
                ) : null}
                {joinSent ? (
                  <p className="app-chrome-row__workspace-menu-hint text-emerald-400">
                    Demande envoyée au propriétaire.
                  </p>
                ) : null}
              </form>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <nav className="app-chrome-row__workspaces" aria-label="Serveurs">
      <div className="app-chrome-row__workspaces-track">
        {workspaces.map((workspace) => {
          const role = roleIn(workspace.id, ownerUserId);
          if (!role) return null;
          return (
            <WorkspaceTab
              key={workspace.id}
              workspace={workspace}
              role={role}
              active={activeRoomId === workspace.id}
              onSelect={setActiveRoom}
            />
          );
        })}
        <button
          ref={menuButtonRef}
          type="button"
          className={clsx(
            "app-chrome-row__workspace-btn app-chrome-row__workspace-btn--add",
            menuOpen && "app-chrome-row__workspace-btn--active",
          )}
          title="Créer ou rejoindre un serveur"
          aria-label="Créer ou rejoindre un serveur"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Plus size={13} strokeWidth={2.25} aria-hidden />
        </button>
      </div>
      {actionMenu}
    </nav>
  );
}
