import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { ArrowLeft, ArrowUpRight, Check, Crown, Plus, UsersRound, X } from "lucide-react";
import {
  LOCAL_USER_ID,
  serverRoleLabel,
  type ServerRole,
  type Workspace,
} from "../../lib/workspaces";
import { ownedWorkspaceLimitMessage } from "../../lib/subscriptionPlans";
import { useAuthStore } from "../../store/useAuthStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";
import { useStore } from "../../store/useStore";
import { useWorkspaceOverlayStore } from "../../store/useWorkspaceOverlayStore";
import WorkspaceIcon from "./WorkspaceIcon";

type OverlayView = "list" | "create" | "join";

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
        <WorkspaceIcon
          workspace={workspace}
          className="workspace-overlay__row-icon workspace-overlay__row-icon--server"
        />
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
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const switchWorkspace = useStore((s) => s.switchWorkspace);
  const openSettingsPage = useStore((s) => s.openSettingsPage);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const memberships = useWorkspacesStore((s) => s.memberships);
  const customServers = useWorkspacesStore((s) => s.customServers);
  const roleIn = useWorkspacesStore((s) => s.roleIn);
  const canUserCreateWorkspace = useWorkspacesStore((s) => s.canUserCreateWorkspace);
  const createWorkspace = useWorkspacesStore((s) => s.createWorkspace);
  const requestJoinWorkspace = useWorkspacesStore((s) => s.requestJoinWorkspace);
  const respondJoinRequest = useWorkspacesStore((s) => s.respondJoinRequest);
  const incomingJoinRequests = useWorkspacesStore((s) => s.incomingJoinRequests);

  const [view, setView] = useState<OverlayView>("list");
  const [draftName, setDraftName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSent, setJoinSent] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [respondBusyUid, setRespondBusyUid] = useState<string | null>(null);

  const ownerUserId = firebaseUid ?? LOCAL_USER_ID;

  const joined = useMemo(
    () => useWorkspacesStore.getState().joinedWorkspaces(ownerUserId),
    [memberships, customServers, ownerUserId],
  );

  const canCreate = canUserCreateWorkspace(ownerUserId);
  const workspaceLimitHint = ownedWorkspaceLimitMessage(subscriptionPlan, billingManaged);

  useEffect(() => {
    if (!panelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (view !== "list") {
          setView("list");
          return;
        }
        closePanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelOpen, closePanel, view]);

  useEffect(() => {
    if (panelOpen) return;
    setView("list");
    setDraftName("");
    setJoinId("");
    setJoinBusy(false);
    setJoinError(null);
    setJoinSent(false);
    setCreateError(null);
  }, [panelOpen]);

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
      selectWorkspace(id);
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

  const onRespond = async (
    requesterUid: string,
    accept: boolean,
    requester?: { requesterName: string; requesterEmail: string },
  ) => {
    if (respondBusyUid) return;
    setRespondBusyUid(requesterUid);
    try {
      await respondJoinRequest(activeRoomId, requesterUid, accept, requester);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Impossible de répondre à la demande.";
      window.alert(message);
    } finally {
      setRespondBusyUid(null);
    }
  };

  const showIncoming =
    roleIn(activeRoomId, ownerUserId) === "owner" && incomingJoinRequests.length > 0;

  return createPortal(
    <div className="workspace-modal" role="dialog" aria-modal="true" aria-label="Choisir un serveur">
      <button
        type="button"
        className="workspace-modal__backdrop"
        aria-label="Fermer la sélection de serveur"
        onClick={closePanel}
      />
      <div className="workspace-modal__card">
        <button
          type="button"
          className="workspace-modal__close"
          onClick={closePanel}
          aria-label="Fermer"
        >
          <X size={18} aria-hidden />
        </button>

        {view === "list" ? (
          <>
            <header className="workspace-modal__header">
              <h2 className="workspace-modal__title">Serveurs</h2>
            </header>

            <div className="workspace-modal__scroll">
              {joined.length > 0 ? (
                <ul className="workspace-overlay__list">
                  {joined.map((workspace) => {
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
              ) : (
                <p className="workspace-modal__empty">
                  Vous n'avez encore rejoint aucun serveur.
                </p>
              )}

              {showIncoming && (
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
                          onClick={() =>
                            void onRespond(request.requesterUid, true, {
                              requesterName: request.requesterName,
                              requesterEmail: request.requesterEmail,
                            })
                          }
                          aria-label={`Accepter ${request.requesterName}`}
                        >
                          <Check size={14} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="workspace-overlay__create-btn"
                          disabled={respondBusyUid === request.requesterUid}
                          onClick={() =>
                            void onRespond(request.requesterUid, false, {
                              requesterName: request.requesterName,
                              requesterEmail: request.requesterEmail,
                            })
                          }
                          aria-label={`Refuser ${request.requesterName}`}
                        >
                          <X size={14} aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="workspace-modal__footer">
              <button
                type="button"
                className="workspace-modal__cta workspace-modal__cta--secondary"
                onClick={() => setView("join")}
                aria-label="Rejoindre un serveur"
              >
                <UsersRound size={16} aria-hidden />
                Rejoindre
              </button>
              <button
                type="button"
                className="workspace-modal__cta workspace-modal__cta--primary"
                onClick={() => setView("create")}
                aria-label="Créer un serveur"
              >
                <Plus size={16} aria-hidden />
                Créer
              </button>
            </div>
          </>
        ) : (
          <>
            <header className="workspace-modal__header workspace-modal__header--with-back">
              <button
                type="button"
                className="workspace-modal__back"
                onClick={() => setView("list")}
              >
                <ArrowLeft size={16} aria-hidden />
                Retour
              </button>
              <h2 className="workspace-modal__title">
                {view === "create" ? "Créer un serveur" : "Rejoindre un serveur"}
              </h2>
            </header>

            <div className={clsx("workspace-modal__scroll", "workspace-modal__scroll--form")}>
              {view === "create" ? (
                <form className="workspace-modal__form" onSubmit={onCreate}>
                  <input
                    id="workspace-create-name"
                    type="text"
                    className="workspace-modal__input"
                    placeholder="Nom du serveur…"
                    value={draftName}
                    disabled={!canCreate}
                    autoFocus
                    onChange={(e) => {
                      setDraftName(e.target.value);
                      setCreateError(null);
                    }}
                  />
                  {createError ? (
                    <p className="workspace-modal__error">{createError}</p>
                  ) : null}
                  {!canCreate ? (
                    <button
                      type="button"
                      className="workspace-modal__upgrade"
                      onClick={() => {
                        closePanel();
                        setSettingsTab("usage");
                        openSettingsPage();
                      }}
                      title={workspaceLimitHint}
                    >
                      Passer à Pro
                      <ArrowUpRight size={14} aria-hidden />
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    className="workspace-modal__cta workspace-modal__cta--primary"
                    disabled={!canCreate || !draftName.trim()}
                  >
                    <Plus size={16} aria-hidden />
                    Créer le serveur
                  </button>
                </form>
              ) : (
                <form
                  className="workspace-modal__form"
                  onSubmit={(e) => void onRequestJoin(e)}
                >
                  <input
                    type="text"
                    className="workspace-modal__input"
                    placeholder="Lien ou identifiant du serveur…"
                    value={joinId}
                    disabled={joinBusy}
                    autoFocus
                    onChange={(e) => {
                      setJoinId(e.target.value);
                      setJoinError(null);
                      setJoinSent(false);
                    }}
                  />
                  {joinError ? (
                    <p className="workspace-modal__error">{joinError}</p>
                  ) : null}
                  {joinSent ? (
                    <p className="workspace-modal__success">Demande envoyée.</p>
                  ) : null}
                  <button
                    type="submit"
                    className="workspace-modal__cta workspace-modal__cta--primary"
                    disabled={joinBusy || !joinId.trim()}
                  >
                    <UsersRound size={16} aria-hidden />
                    Envoyer la demande
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
