import clsx from "clsx";
import { Check, Copy, UserPlus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { copyTextToClipboard } from "../../lib/clipboard";
import { buildWorkspaceJoinUrl } from "../../lib/workspaceInvite";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useStore } from "../../store/useStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";
import UserAvatar from "../UserAvatar";

const MENU_WIDTH = 280;

interface MenuPosition {
  top: number;
  left: number;
}

export default function HeaderInviteButton() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const inviteMemberByEmail = useWorkspacesStore((s) => s.inviteMemberByEmail);
  const findWorkspace = useWorkspacesStore((s) => s.findWorkspace);
  const canManageInvites = useWorkspacesStore((s) => s.canManageWorkspaceInvites(activeRoomId));
  const friends = usePeopleStore((s) => s.friends);
  const personPhotoByUserId = usePeopleStore((s) => s.personPhotoByUserId);

  const workspace = findWorkspace(activeRoomId);
  const workspaceId = workspace?.id ?? activeRoomId;
  const workspaceName = workspace?.name ?? "ce workspace";
  const inviteLink = useMemo(() => buildWorkspaceJoinUrl(workspaceId), [workspaceId]);

  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const gap = 8;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8));
    const top = rect.bottom + gap;
    setMenuPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
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
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) return;
    setError(null);
    setSendingId(null);
  }, [open]);

  const onCopyLink = useCallback(async () => {
    const ok = await copyTextToClipboard(inviteLink);
    if (!ok) {
      setError("Impossible de copier le lien.");
      return;
    }
    setError(null);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [inviteLink]);

  const onInviteFriend = useCallback(
    async (friendId: string, handle: string) => {
      if (sendingId) return;
      setSendingId(friendId);
      setError(null);
      setSentId(null);
      try {
        const result = await inviteMemberByEmail(activeRoomId, handle);
        if (!result.ok) {
          setError(result.error ?? "Impossible d'envoyer l'invitation.");
          return;
        }
        setSentId(friendId);
      } finally {
        setSendingId(null);
      }
    },
    [activeRoomId, inviteMemberByEmail, sendingId],
  );

  if (!canManageInvites) return null;

  const menu =
    open && menuPos
      ? createPortal(
          <>
            <button
              type="button"
              className="header-invite-menu__backdrop"
              aria-label="Fermer"
              onClick={() => setOpen(false)}
            />
            <div
              className="header-invite-menu"
              style={{
                top: menuPos.top,
                left: menuPos.left,
                width: MENU_WIDTH,
              }}
              role="dialog"
              aria-label="Inviter au workspace"
            >
              <p className="header-invite-menu__title">Inviter au workspace</p>
              <p className="header-invite-menu__hint">
                Invitez un ami, ou copiez le lien pour rejoindre {workspaceName}.
              </p>
              {friends.length > 0 ? (
                <ul className="header-invite-menu__friends">
                  {friends.map((friend) => {
                    const handle = friend.handle.trim();
                    const canInvite = handle.includes("@");
                    const invited = sentId === friend.id;
                    return (
                      <li key={friend.id}>
                        <button
                          type="button"
                          className="header-invite-menu__friend"
                          disabled={!canInvite || sendingId === friend.id || invited}
                          onClick={() => void onInviteFriend(friend.id, handle)}
                        >
                          <UserAvatar
                            userId={friend.id}
                            name={friend.name}
                            photoURL={personPhotoByUserId[friend.id]}
                            className="header-invite-menu__avatar"
                          />
                          <span className="header-invite-menu__friend-copy">
                            <span className="header-invite-menu__friend-name">{friend.name}</span>
                            <span className="header-invite-menu__friend-handle">
                              {canInvite ? handle : "Email indisponible"}
                            </span>
                          </span>
                          <span className="header-invite-menu__friend-action">
                            {invited ? "Envoyé" : sendingId === friend.id ? "…" : "Inviter"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="header-invite-menu__hint">
                  Aucun ami pour l&apos;instant. Copiez le lien ci-dessous.
                </p>
              )}
              <button type="button" className="header-invite-menu__copy" onClick={() => void onCopyLink()}>
                {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                {copied ? "Lien copié" : "Copier le lien d'invitation"}
              </button>
              {error ? <p className="header-invite-menu__error">{error}</p> : null}
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={clsx(
          "workspace-switcher-capsule",
          "toolbar-btn",
          "header-invite-btn",
          open && "is-active",
        )}
        onClick={() => setOpen((value) => !value)}
        title={`Inviter à ${workspaceName}`}
        aria-label={`Inviter à ${workspaceName}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <UserPlus size={14} strokeWidth={2.25} aria-hidden />
      </button>
      {menu}
    </>
  );
}
