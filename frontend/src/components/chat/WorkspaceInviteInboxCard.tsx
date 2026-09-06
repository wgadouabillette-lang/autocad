import { useState } from "react";
import { Users } from "lucide-react";
import { useNotificationsStore } from "../../store/useNotificationsStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";

interface WorkspaceInviteInboxCardProps {
  workspaceId: string;
  workspaceName?: string;
  senderName: string;
  mine?: boolean;
}

export default function WorkspaceInviteInboxCard({
  workspaceId,
  workspaceName,
  senderName,
  mine = false,
}: WorkspaceInviteInboxCardProps) {
  const acceptWorkspaceInvite = useWorkspacesStore((s) => s.acceptWorkspaceInvite);
  const removeNotification = useNotificationsStore((s) => s.removeNotification);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "joined" | "gone">("idle");
  const [error, setError] = useState<string | null>(null);

  const title = workspaceName?.trim() || "Workspace";

  const handleJoin = async () => {
    if (mine || busy || status !== "idle") return;
    setBusy(true);
    setError(null);
    try {
      await acceptWorkspaceInvite(workspaceId);
      removeNotification(`workspace-invite-${workspaceId}`);
      setStatus("joined");
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim() ? err.message : "Impossible de rejoindre.";
      if (/introuvable|déjà traité|deja traite/i.test(message)) {
        setStatus("gone");
        removeNotification(`workspace-invite-${workspaceId}`);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="workspace-invite-inbox-card">
      <div className="workspace-invite-inbox-card__icon" aria-hidden>
        <Users size={14} />
      </div>
      <div className="workspace-invite-inbox-card__body">
        <p className="workspace-invite-inbox-card__title">
          {mine ? "Invitation envoyée" : `${senderName} vous invite`}
        </p>
        <p className="workspace-invite-inbox-card__subtitle">{title}</p>
        {mine ? (
          <span className="workspace-invite-inbox-card__status">En attente</span>
        ) : status === "joined" ? (
          <span className="workspace-invite-inbox-card__status">Rejoint</span>
        ) : status === "gone" ? (
          <span className="workspace-invite-inbox-card__status">Déjà traité</span>
        ) : (
          <button
            type="button"
            className="workspace-invite-inbox-card__join"
            disabled={busy}
            onClick={() => void handleJoin()}
          >
            {busy ? "…" : "Rejoindre"}
          </button>
        )}
        {error ? <p className="workspace-invite-inbox-card__error">{error}</p> : null}
      </div>
    </div>
  );
}
