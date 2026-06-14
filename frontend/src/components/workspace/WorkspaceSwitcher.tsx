/** Sélecteur de workspace — conservé pour une réintégration ultérieure (non monté dans le header). */
import clsx from "clsx";
import { Crown, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  serverRoleLabel,
  workspaceInitials,
  type ServerRole,
  type Workspace,
} from "../../lib/workspaces";
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
  const setActiveRoom = useStore((s) => s.setActiveRoom);
  const memberships = useWorkspacesStore((s) => s.memberships);
  const customServers = useWorkspacesStore((s) => s.customServers);
  const roleIn = useWorkspacesStore((s) => s.roleIn);
  const createWorkspace = useWorkspacesStore((s) => s.createWorkspace);
  const joinWorkspace = useWorkspacesStore((s) => s.joinWorkspace);

  const workspaces = useMemo(
    () => useWorkspacesStore.getState().joinedWorkspaces(),
    [memberships, customServers],
  );
  const joinable = useMemo(
    () => useWorkspacesStore.getState().discoverableServers(),
    [memberships, customServers],
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
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
    const id = createWorkspace(draftName, userDisplayName);
    setDraftName("");
    setMenuOpen(false);
    setActiveRoom(id);
  };

  const onJoin = (workspaceId: string) => {
    if (!joinWorkspace(workspaceId)) return;
    setMenuOpen(false);
    setActiveRoom(workspaceId);
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

              {joinable.length > 0 && (
                <div className="app-chrome-row__workspace-menu-section">
                  <p className="app-chrome-row__workspace-menu-title">Rejoindre un serveur</p>
                  <p className="app-chrome-row__workspace-menu-hint">
                    Rejoignez en tant que membre.
                  </p>
                  <ul className="app-chrome-row__workspace-join-list">
                    {joinable.map((server) => (
                      <li key={server.id}>
                        <button
                          type="button"
                          className="app-chrome-row__workspace-join-row"
                          onClick={() => onJoin(server.id)}
                        >
                          <span
                            className="app-chrome-row__workspace-icon"
                            style={{ backgroundColor: server.accent }}
                            aria-hidden
                          >
                            {workspaceInitials(server.name)}
                          </span>
                          <span className="min-w-0 flex-1 text-left">
                            <span className="block truncate text-[11px] font-medium text-muted-100">
                              {server.name}
                            </span>
                            <span className="block truncate text-[10px] text-muted-500">
                              Propriétaire · {server.ownerName}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <nav className="app-chrome-row__workspaces" aria-label="Serveurs">
      <div className="app-chrome-row__workspaces-track">
        {workspaces.map((workspace) => {
          const role = roleIn(workspace.id);
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
