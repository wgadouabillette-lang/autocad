import clsx from "clsx";
import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import { buildWorkspaceJoinUrl, workspaceInviteHint } from "../../lib/workspaceInvite";

interface WorkspaceInviteIdBlockProps {
  workspaceId: string;
  workspaceName?: string;
  variant?: "settings" | "menu";
  showLink?: boolean;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export default function WorkspaceInviteIdBlock({
  workspaceId,
  workspaceName,
  variant = "settings",
  showLink = true,
}: WorkspaceInviteIdBlockProps) {
  const joinUrl = buildWorkspaceJoinUrl(workspaceId);
  const [idCopied, setIdCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyId = useCallback(async () => {
    const ok = await copyText(workspaceId);
    if (!ok) return;
    setIdCopied(true);
    window.setTimeout(() => setIdCopied(false), 2000);
  }, [workspaceId]);

  const handleCopyLink = useCallback(async () => {
    const ok = await copyText(joinUrl);
    if (!ok) return;
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2000);
  }, [joinUrl]);

  const rowClass =
    variant === "menu" ? "workspace-invite__link-row" : "settings-workspace-invite__row";
  const inputClass =
    variant === "menu" ? "workspace-invite__link-input" : "settings-workspace-invite__input";
  const actionClass =
    variant === "menu"
      ? clsx("workspace-invite__friend-action", idCopied && "workspace-invite__friend-action--done")
      : clsx("settings-workspace-invite__copy", idCopied && "settings-workspace-invite__copy--done");

  return (
    <div className={variant === "settings" ? "settings-workspace-invite" : undefined}>
      <p className={variant === "settings" ? "settings-section__hint" : "workspace-invite__section-head"}>
        {variant === "settings" ? (
          <>
            Identifiant à partager
            {workspaceName ? (
              <>
                {" "}
                pour <span className="text-muted-200">{workspaceName}</span>
              </>
            ) : null}
            .
          </>
        ) : (
          "Identifiant à partager"
        )}
      </p>
      <div className={rowClass}>
        <input
          type="text"
          className={inputClass}
          value={workspaceId}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          aria-label="Identifiant du workspace"
        />
        <button
          type="button"
          className={actionClass}
          onClick={() => void handleCopyId()}
          aria-label={idCopied ? "Identifiant copié" : "Copier l'identifiant"}
        >
          {idCopied ? (
            <>
              Copié
              <Check size={11} strokeWidth={2.5} className="shrink-0 opacity-80" aria-hidden />
            </>
          ) : (
            <>
              Copier
              <Copy size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
            </>
          )}
        </button>
      </div>
      {showLink ? (
        <>
          <p
            className={
              variant === "settings"
                ? "settings-section__hint mt-3"
                : "workspace-invite__section-head mt-3"
            }
          >
            Lien d&apos;invitation
          </p>
          <div className={rowClass}>
            <input
              type="text"
              className={inputClass}
              value={joinUrl}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              aria-label="Lien d'invitation"
            />
            <button
              type="button"
              className={
                variant === "menu"
                  ? clsx(
                      "workspace-invite__friend-action",
                      linkCopied && "workspace-invite__friend-action--done",
                    )
                  : clsx(
                      "settings-workspace-invite__copy",
                      linkCopied && "settings-workspace-invite__copy--done",
                    )
              }
              onClick={() => void handleCopyLink()}
              aria-label={linkCopied ? "Lien copié" : "Copier le lien"}
            >
              {linkCopied ? (
                <>
                  Copié
                  <Check size={11} strokeWidth={2.5} className="shrink-0 opacity-80" aria-hidden />
                </>
              ) : (
                <>
                  Copier
                  <Copy size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
                </>
              )}
            </button>
          </div>
        </>
      ) : null}
      {variant === "settings" ? (
        <p className="settings-section__meta mt-2">{workspaceInviteHint(workspaceId)}</p>
      ) : null}
    </div>
  );
}
