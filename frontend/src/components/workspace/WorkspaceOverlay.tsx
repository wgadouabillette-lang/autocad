import { useMemo, useState, type FormEvent } from "react";
import clsx from "clsx";
import { Check, Crown, LayoutGrid, Plus, X } from "lucide-react";
import {
  LOCAL_USER_ID,
  serverRoleLabel,
  workspaceInitials,
  type ServerRole,
  type Workspace,
} from "../../lib/workspaces";
import { useAuthStore } from "../../store/useAuthStore";
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
  const userEmail = useStore((s) => s.userEmail);
  const switchWorkspace = useStore((s) => s.switchWorkspace);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const memberships = useWorkspacesStore((s) => s.memberships);
  const customServers = useWorkspacesStore((s) => s.customServers);
  const roleIn = useWorkspacesStore((s) => s.roleIn);
  const createWorkspace = useWorkspacesStore((s) => s.createWorkspace);
  const requestJoinWorkspace = useWorkspacesStore((s) => s.requestJoinWorkspace);
  const respondJoinRequest = useWorkspacesStore((s) => s.respondJoinRequest);
  const pendingJoinRequests = useWorkspacesStore((s) => s.pendingJoinRequests);
  const incomingJoinRequests = useWorkspacesStore((s) => s.incomingJoinRequests);

  const [draftName, setDraftName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSent, setJoinSent] = useState(false);
  const [respondBusyUid, setRespondBusyUid] = useState<string | null>(null);

  const ownerUserId = firebaseUid ?? LOCAL_USER_ID;

  const joined = useMemo(
    () => useWorkspacesStore.getState().joinedWorkspaces(ownerUserId),
    [memberships, customServers, ownerUserId],
  );

  if (!panelOpen) return null;

  const selectWorkspace = (id: string) => {
    if (id === activeRoomId) {
      closePanel();
      return;
    }
    switchWorkspace(id);
    closePanel();
  };

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!draftName.trim()) return;
    const id = createWorkspace(draftName, userDisplayName, ownerUserId);
    setDraftName("");
    void useAuthStore.getState().syncWorkspacesToCloud();
    selectWorkspace(id);
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

  const onRespond = async (requesterUid: string, accept: boolean) => {
    if (respondBusyUid) return;
    setRespondBusyUid(requesterUid);
    try {
      await respondJoinRequest(activeRoomId, requesterUid, accept);
    } finally {
      setRespondBusyUid(null);
    }
  };

  const owned = joined.filter((server) => roleIn(server.id, ownerUserId) === "owner");
  const memberOf = joined.filter((server) => roleIn(server.id, ownerUserId) === "member");
  const showIncoming =
    roleIn(activeRoomId, ownerUserId) === "owner" && incomingJoinRequests.length > 0;

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
                  const role = roleIn(workspace.id, ownerUserId);
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
                  const role = roleIn(workspace.id, ownerUserId);
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

          {showIncoming && (
            <section className="workspace-overlay__section">
              <h4 className="workspace-overlay__section-title">Demandes en attente</h4>
              <ul className="workspace-overlay__list">
                {incomingJoinRequests.map((request) => (
                  <li key={request.requesterUid} className="workspace-overlay__row">
                    <span className="min-w-0 flex-1 text-left">
                      <span className="workspace-overlay__row-name">
                        {request.requesterName}
                      </span>
                      <span className="workspace-overlay__row-address">
                        {request.requesterEmail}
                      </span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="workspace-overlay__create-btn"
                        disabled={respondBusyUid === request.requesterUid}
                        onClick={() => void onRespond(request.requesterUid, true)}
                        aria-label={`Accepter ${request.requesterName}`}
                      >
                        <Check size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="workspace-overlay__create-btn"
                        disabled={respondBusyUid === request.requesterUid}
                        onClick={() => void onRespond(request.requesterUid, false)}
                        aria-label={`Refuser ${request.requesterName}`}
                      >
                        <X size={14} aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="workspace-overlay__section">
            <h4 className="workspace-overlay__section-title">Rejoindre un serveur</h4>
            <form className="workspace-overlay__create" onSubmit={(e) => void onRequestJoin(e)}>
              <p className="workspace-overlay__create-label">
                Entrez l&apos;identifiant partagé par le propriétaire.
              </p>
              <div className="workspace-overlay__create-row">
                <input
                  type="text"
                  className="workspace-overlay__create-input"
                  placeholder="ws-k7m2p9xq"
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
              {pendingJoinRequests.length > 0 ? (
                <p className="workspace-overlay__create-label text-muted-500">
                  En attente : {pendingJoinRequests.join(", ")}
                </p>
              ) : null}
            </form>
          </section>
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
