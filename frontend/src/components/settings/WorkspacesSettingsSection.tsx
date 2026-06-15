import clsx from "clsx";
import { Check, Copy, Crown, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  fetchSharedWorkspace,
  watchPendingJoinRequests,
  type WorkspaceJoinRequestDoc,
} from "../../lib/firebase/workspaceRegistry";
import { buildWorkspaceJoinUrl } from "../../lib/workspaceInvite";
import {
  LOCAL_USER_ID,
  serverRoleLabel,
  workspaceInitials,
  type ServerRole,
  type Workspace,
} from "../../lib/workspaces";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";

interface IncomingRequestRow {
  workspaceId: string;
  workspaceName: string;
  request: WorkspaceJoinRequestDoc;
}

function WorkspacePickerRow({
  workspace,
  role,
  active,
  copied,
  onSelect,
  onCopyLink,
}: {
  workspace: Workspace;
  role: ServerRole;
  active: boolean;
  copied: boolean;
  onSelect: (id: string) => void;
  onCopyLink: (id: string) => void;
}) {
  return (
    <li
      className={clsx(
        "settings-workspaces-list__row",
        "settings-workspaces-list__row--static",
        active && "settings-workspaces-list__row--active",
      )}
    >
      <button
        type="button"
        className="settings-workspaces-list__select"
        onClick={() => onSelect(workspace.id)}
        aria-current={active ? "true" : undefined}
      >
        <span
          className="settings-workspaces-list__icon"
          style={{ backgroundColor: workspace.accent }}
          aria-hidden
        >
          {workspaceInitials(workspace.name)}
        </span>
        <span className="settings-workspaces-list__main">
          <span className="settings-workspaces-list__name">{workspace.name}</span>
          <span className="settings-workspaces-list__meta">
            {serverRoleLabel(role)}
            {active ? " · Actif" : ""}
          </span>
        </span>
        {role === "owner" ? (
          <Crown size={12} className="shrink-0 text-amber-300/90" aria-hidden />
        ) : null}
      </button>
      {role === "owner" ? (
        <button
          type="button"
          className={clsx(
            "settings-workspaces-list__copy",
            copied && "settings-workspaces-list__copy--done",
          )}
          onClick={() => onCopyLink(workspace.id)}
          aria-label={
            copied
              ? `Lien copié pour ${workspace.name}`
              : `Copier le lien d'invitation pour ${workspace.name}`
          }
        >
          {copied ? (
            <>
              <Check size={12} strokeWidth={2.5} aria-hidden />
              Copié
            </>
          ) : (
            <>
              <Copy size={12} strokeWidth={2.25} aria-hidden />
              Copier
            </>
          )}
        </button>
      ) : null}
    </li>
  );
}

export default function WorkspacesSettingsSection() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const userDisplayName = useStore((s) => s.userDisplayName);
  const userEmail = useStore((s) => s.userEmail);
  const switchWorkspace = useStore((s) => s.switchWorkspace);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);

  const memberships = useWorkspacesStore((s) => s.memberships);
  const customServers = useWorkspacesStore((s) => s.customServers);
  const roleIn = useWorkspacesStore((s) => s.roleIn);
  const requestJoinWorkspace = useWorkspacesStore((s) => s.requestJoinWorkspace);
  const respondJoinRequest = useWorkspacesStore((s) => s.respondJoinRequest);
  const pendingJoinRequests = useWorkspacesStore((s) => s.pendingJoinRequests);
  const pendingInviteWorkspaceId = useWorkspacesStore((s) => s.pendingInviteWorkspaceId);

  const ownerUserId = firebaseUid ?? LOCAL_USER_ID;

  const joined = useMemo(
    () => useWorkspacesStore.getState().joinedWorkspaces(ownerUserId),
    [memberships, customServers, ownerUserId],
  );

  const owned = useMemo(
    () => joined.filter((workspace) => roleIn(workspace.id, ownerUserId) === "owner"),
    [joined, roleIn, ownerUserId],
  );

  const [incomingRequests, setIncomingRequests] = useState<IncomingRequestRow[]>([]);
  const [pendingLabels, setPendingLabels] = useState<Record<string, string>>({});
  const [joinId, setJoinId] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSent, setJoinSent] = useState(false);
  const [respondBusyKey, setRespondBusyKey] = useState<string | null>(null);
  const [copiedWorkspaceId, setCopiedWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingInviteWorkspaceId) return;
    setJoinId(buildWorkspaceJoinUrl(pendingInviteWorkspaceId));
    useWorkspacesStore.getState().setPendingInviteWorkspaceId(null);
  }, [pendingInviteWorkspaceId]);

  useEffect(() => {
    if (!firebaseUid || owned.length === 0) {
      setIncomingRequests([]);
      return;
    }

    const byWorkspace = new Map<string, WorkspaceJoinRequestDoc[]>();
    const unsubs = owned.map((workspace) =>
      watchPendingJoinRequests(
        workspace.id,
        (requests) => {
          byWorkspace.set(workspace.id, requests);
          const rows: IncomingRequestRow[] = [];
          for (const ws of owned) {
            const pending = byWorkspace.get(ws.id) ?? [];
            for (const request of pending) {
              rows.push({
                workspaceId: ws.id,
                workspaceName: ws.name,
                request,
              });
            }
          }
          setIncomingRequests(rows);
        },
        () => {
          byWorkspace.delete(workspace.id);
        },
      ),
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [firebaseUid, owned]);

  useEffect(() => {
    if (pendingJoinRequests.length === 0) {
      setPendingLabels({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        pendingJoinRequests.map(async (workspaceId) => {
          const local = useWorkspacesStore.getState().findWorkspace(workspaceId);
          if (local) {
            next[workspaceId] = local.name;
            return;
          }
          const shared = await fetchSharedWorkspace(workspaceId);
          next[workspaceId] = shared?.name ?? workspaceId;
        }),
      );
      if (!cancelled) setPendingLabels(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingJoinRequests]);

  const onCopyInviteLink = useCallback(async (workspaceId: string) => {
    try {
      await navigator.clipboard.writeText(buildWorkspaceJoinUrl(workspaceId));
      setCopiedWorkspaceId(workspaceId);
      window.setTimeout(() => {
        setCopiedWorkspaceId((current) => (current === workspaceId ? null : current));
      }, 2000);
    } catch {
      setCopiedWorkspaceId(null);
    }
  }, []);

  const onRequestJoin = async (event: FormEvent) => {
    event.preventDefault();
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
    workspaceId: string,
    requesterUid: string,
    accept: boolean,
    requester?: { requesterName: string; requesterEmail: string },
  ) => {
    const key = `${workspaceId}:${requesterUid}`;
    if (respondBusyKey) return;
    setRespondBusyKey(key);
    try {
      await respondJoinRequest(workspaceId, requesterUid, accept, requester);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Impossible de répondre à la demande.";
      window.alert(message);
    } finally {
      setRespondBusyKey(null);
    }
  };

  return (
    <div className="settings-workspaces">
      {incomingRequests.length > 0 && (
        <section className="settings-section settings-section--card">
          <h3 className="settings-section__label">Invitations reçues</h3>
          <p className="settings-section__hint">
            Des personnes souhaitent rejoindre vos workspaces.
          </p>
          <ul className="settings-workspaces-list mt-4">
            {incomingRequests.map(({ workspaceId, workspaceName, request }) => {
              const key = `${workspaceId}:${request.requesterUid}`;
              return (
                <li key={key} className="settings-workspaces-list__row settings-workspaces-list__row--static">
                  <span className="settings-workspaces-list__main">
                    <span className="settings-workspaces-list__name">{request.requesterName}</span>
                    <span className="settings-workspaces-list__meta">
                      {request.requesterEmail} · {workspaceName}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="settings-workspaces-list__action settings-workspaces-list__action--accept"
                      disabled={respondBusyKey === key}
                      onClick={() =>
                        void onRespond(workspaceId, request.requesterUid, true, {
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
                      className="settings-workspaces-list__action"
                      disabled={respondBusyKey === key}
                      onClick={() =>
                        void onRespond(workspaceId, request.requesterUid, false, {
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
              );
            })}
          </ul>
        </section>
      )}

      {pendingJoinRequests.length > 0 && (
        <section className="settings-section settings-section--card">
          <h3 className="settings-section__label">Demandes envoyées</h3>
          <p className="settings-section__hint">
            En attente de validation par le propriétaire.
          </p>
          <ul className="settings-workspaces-list mt-4">
            {pendingJoinRequests.map((workspaceId) => (
              <li
                key={workspaceId}
                className="settings-workspaces-list__row settings-workspaces-list__row--static"
              >
                <span className="settings-workspaces-list__main">
                  <span className="settings-workspaces-list__name">
                    {pendingLabels[workspaceId] ?? workspaceId}
                  </span>
                  <span className="settings-workspaces-list__meta">En attente</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="settings-section settings-section--card">
        <h3 className="settings-section__label">Mes workspaces</h3>
        <p className="settings-section__hint">
          Cliquez sur un workspace pour basculer dessus. Propriétaires : bouton Copier à droite
          pour partager le lien d&apos;invitation.
        </p>
        {joined.length === 0 ? (
          <p className="settings-section__meta mt-4">Aucun workspace pour le moment.</p>
        ) : (
          <ul className="settings-workspaces-list mt-4">
            {joined.map((workspace) => {
              const role = roleIn(workspace.id, ownerUserId);
              if (!role) return null;
              return (
                <WorkspacePickerRow
                  key={workspace.id}
                  workspace={workspace}
                  role={role}
                  active={activeRoomId === workspace.id}
                  copied={copiedWorkspaceId === workspace.id}
                  onSelect={switchWorkspace}
                  onCopyLink={(id) => void onCopyInviteLink(id)}
                />
              );
            })}
          </ul>
        )}
      </section>

      <section className="settings-section settings-section--card">
        <h3 className="settings-section__label">Rejoindre un workspace</h3>
        <p className="settings-section__hint">
          Collez le lien d&apos;invitation reçu d&apos;un collègue.
        </p>
        <form onSubmit={(event) => void onRequestJoin(event)} className="settings-section__inline-form mt-3">
          <input
            type="text"
            className="input min-w-0 flex-1"
            placeholder="https://…?workspace=ws-…"
            value={joinId}
            disabled={joinBusy}
            onChange={(event) => {
              setJoinId(event.target.value);
              setJoinError(null);
              setJoinSent(false);
            }}
          />
          <button type="submit" className="btn shrink-0" disabled={joinBusy || !joinId.trim()}>
            {joinBusy ? "Envoi…" : "Demander"}
          </button>
        </form>
        {joinError ? <p className="mt-2 text-[11px] text-red-300">{joinError}</p> : null}
        {joinSent ? (
          <p className="mt-2 text-[11px] text-emerald-400">
            Demande envoyée. Vous serez notifié si le propriétaire accepte.
          </p>
        ) : null}
      </section>
    </div>
  );
}
