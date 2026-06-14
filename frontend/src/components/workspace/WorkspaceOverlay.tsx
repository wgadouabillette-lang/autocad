import { useMemo, useState, type FormEvent } from "react";
import clsx from "clsx";
import { Crown, LayoutGrid, Plus } from "lucide-react";
import {
  serverRoleLabel,
  workspaceInitials,
  type ServerRole,
  type Workspace,
} from "../../lib/workspaces";
import { useWorkspacesStore, workspaceLabel } from "../../store/useWorkspacesStore";
import { useStore } from "../../store/useStore";
import { useWorkspaceOverlayStore } from "../../store/useWorkspaceOverlayStore";

function WorkspaceRow({
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
  return (
    <li>
      <button
        type="button"
        className={clsx(
          "workspace-overlay__row",
          active && "workspace-overlay__row--active",
        )}
        onClick={() => onSelect(workspace.id)}
        aria-current={active ? "true" : undefined}
      >
        <span
          className="workspace-overlay__row-icon workspace-overlay__row-icon--server"
          style={{ backgroundColor: workspace.accent }}
          aria-hidden
        >
          {workspaceInitials(workspace.name)}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="workspace-overlay__row-name">{workspace.name}</span>
          <span className="workspace-overlay__row-address">{serverRoleLabel(role)}</span>
        </span>
        {role === "owner" ? (
          <Crown size={12} className="shrink-0 text-amber-300/90" aria-hidden />
        ) : active ? (
          <span className="workspace-overlay__row-badge">Actif</span>
        ) : null}
      </button>
    </li>
  );
}

export default function WorkspaceOverlay() {
  const panelOpen = useWorkspaceOverlayStore((s) => s.panelOpen);
  const closePanel = useWorkspaceOverlayStore((s) => s.closePanel);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const userDisplayName = useStore((s) => s.userDisplayName);
  const setActiveRoom = useStore((s) => s.setActiveRoom);
  const memberships = useWorkspacesStore((s) => s.memberships);
  const customServers = useWorkspacesStore((s) => s.customServers);
  const roleIn = useWorkspacesStore((s) => s.roleIn);
  const createWorkspace = useWorkspacesStore((s) => s.createWorkspace);
  const joinWorkspace = useWorkspacesStore((s) => s.joinWorkspace);

  const [draftName, setDraftName] = useState("");

  const joined = useMemo(
    () => useWorkspacesStore.getState().joinedWorkspaces(),
    [memberships, customServers],
  );
  const joinable = useMemo(
    () => useWorkspacesStore.getState().discoverableServers(),
    [memberships, customServers],
  );

  if (!panelOpen) return null;

  const selectWorkspace = (id: string) => {
    setActiveRoom(id);
    closePanel();
  };

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!draftName.trim()) return;
    const id = createWorkspace(draftName, userDisplayName);
    setDraftName("");
    selectWorkspace(id);
  };

  const owned = joined.filter((server) => roleIn(server.id) === "owner");
  const memberOf = joined.filter((server) => roleIn(server.id) === "member");

  return (
    <>
      <button
        type="button"
        className="bottom-overlay__backdrop bottom-overlay__backdrop--left"
        aria-label="Fermer la sélection de serveur"
        onClick={closePanel}
      />
      <div
        className="bottom-overlay bottom-overlay--compact bottom-overlay--popup-left bottom-overlay--workspace"
        role="dialog"
        aria-label="Choisir un serveur"
      >
        <div className="bottom-overlay__header">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <LayoutGrid size={16} className="shrink-0 text-muted-400" aria-hidden />
            <div className="min-w-0">
              <h3 className="bottom-overlay__title">Serveurs</h3>
              <p className="bottom-overlay__subtitle truncate">
                {workspaceLabel(activeRoomId)}
              </p>
            </div>
          </div>
        </div>

        <div className="workspace-overlay__body">
          {owned.length > 0 && (
            <section className="workspace-overlay__section">
              <h4 className="workspace-overlay__section-title">Mes serveurs</h4>
              <ul className="workspace-overlay__list">
                {owned.map((workspace) => {
                  const role = roleIn(workspace.id);
                  if (!role) return null;
                  return (
                    <WorkspaceRow
                      key={workspace.id}
                      workspace={workspace}
                      role={role}
                      active={activeRoomId === workspace.id}
                      onSelect={selectWorkspace}
                    />
                  );
                })}
              </ul>
            </section>
          )}

          {memberOf.length > 0 && (
            <section className="workspace-overlay__section">
              <h4 className="workspace-overlay__section-title">Serveurs rejoints</h4>
              <ul className="workspace-overlay__list">
                {memberOf.map((workspace) => {
                  const role = roleIn(workspace.id);
                  if (!role) return null;
                  return (
                    <WorkspaceRow
                      key={workspace.id}
                      workspace={workspace}
                      role={role}
                      active={activeRoomId === workspace.id}
                      onSelect={selectWorkspace}
                    />
                  );
                })}
              </ul>
            </section>
          )}

          {joinable.length > 0 && (
            <section className="workspace-overlay__section">
              <h4 className="workspace-overlay__section-title">Découvrir</h4>
              <ul className="workspace-overlay__list">
                {joinable.map((workspace) => (
                  <li key={workspace.id}>
                    <button
                      type="button"
                      className="workspace-overlay__row"
                      onClick={() => {
                        joinWorkspace(workspace.id);
                        selectWorkspace(workspace.id);
                      }}
                    >
                      <span
                        className="workspace-overlay__row-icon workspace-overlay__row-icon--server"
                        style={{ backgroundColor: workspace.accent }}
                        aria-hidden
                      >
                        {workspaceInitials(workspace.name)}
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="workspace-overlay__row-name">{workspace.name}</span>
                        <span className="workspace-overlay__row-address">
                          Propriétaire · {workspace.ownerName}
                        </span>
                      </span>
                      <span className="workspace-overlay__row-badge workspace-overlay__row-badge--join">
                        Rejoindre
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <form className="workspace-overlay__create" onSubmit={onCreate}>
          <label className="workspace-overlay__create-label" htmlFor="workspace-create-name">
            Créer un serveur
          </label>
          <div className="workspace-overlay__create-row">
            <input
              id="workspace-create-name"
              type="text"
              className="workspace-overlay__create-input"
              placeholder="Nom du serveur…"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
            <button
              type="submit"
              className="workspace-overlay__create-btn"
              disabled={!draftName.trim()}
            >
              <Plus size={14} aria-hidden />
              Créer
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
