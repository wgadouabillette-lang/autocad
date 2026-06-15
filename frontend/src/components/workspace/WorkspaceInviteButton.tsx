import clsx from "clsx";
import { Check, UserPlus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { buildWorkspaceJoinUrl } from "../../lib/workspaceInvite";
import { useStore } from "../../store/useStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";

export default function WorkspaceInviteButton() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const findWorkspace = useWorkspacesStore((s) => s.findWorkspace);
  const isOwner = useWorkspacesStore((s) => s.isWorkspaceOwner(activeRoomId));

  const workspace = findWorkspace(activeRoomId);
  const workspaceId = workspace?.id ?? activeRoomId;
  const workspaceName = workspace?.name ?? "ce serveur";
  const inviteLink = useMemo(() => buildWorkspaceJoinUrl(workspaceId), [workspaceId]);

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!isOwner) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [inviteLink, isOwner]);

  if (!isOwner) return null;

  return (
    <button
      type="button"
      className={clsx(
        "header-chrome-control",
        "header-chrome-circle",
        copied && "is-active",
      )}
      onClick={() => void handleCopy()}
      title={copied ? "Lien copié" : `Copier le lien d'invitation — ${workspaceName}`}
      aria-label={copied ? "Lien d'invitation copié" : `Copier le lien d'invitation pour ${workspaceName}`}
    >
      {copied ? (
        <Check size={13} strokeWidth={2.5} className="header-chrome-circle__icon" aria-hidden />
      ) : (
        <UserPlus size={13} strokeWidth={2.25} className="header-chrome-circle__icon" aria-hidden />
      )}
    </button>
  );
}
