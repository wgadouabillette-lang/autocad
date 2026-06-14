import clsx from "clsx";
import { ArrowUpRight, Check, Copy, Link2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { avatarColor, userInitials } from "../../lib/calls";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useStore } from "../../store/useStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";

const MENU_WIDTH = 320;
const INVITE_BASE_URL = "https://lyte.app/join";

interface MenuPosition {
  top: number;
  left: number;
}

function buildInviteLink(workspaceId: string): string {
  const url = new URL(INVITE_BASE_URL);
  url.searchParams.set("workspace", workspaceId);
  return url.toString();
}

function buildFriendInviteMessage(workspaceName: string, link: string): string {
  return `Rejoins-moi sur le serveur « ${workspaceName} » : ${link}`;
}

export default function WorkspaceInviteButton() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const findWorkspace = useWorkspacesStore((s) => s.findWorkspace);
  const friends = usePeopleStore((s) => s.friends);
  const sendMessage = usePeopleStore((s) => s.sendMessage);

  const workspace = findWorkspace(activeRoomId);
  const workspaceName = workspace?.name ?? "ce serveur";
  const inviteLink = useMemo(
    () => buildInviteLink(workspace?.id ?? activeRoomId),
    [workspace?.id, activeRoomId],
  );

  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const buttonRef = useRef<HTMLButtonElement>(null);

  const sortedFriends = useMemo(
    () => [...friends].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [friends],
  );

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const gap = 15;
    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8));
    setMenuPos({ top: rect.bottom + gap, left });
  }, []);

  useEffect(() => {
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
    setInvitedIds(new Set());
    setLinkCopied(false);
  }, [open]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // fallback : sélection manuelle
      setLinkCopied(false);
    }
  }, [inviteLink]);

  const handleInviteFriend = useCallback(
    (friendId: string) => {
      const threadId = `friend-${friendId}`;
      sendMessage(threadId, buildFriendInviteMessage(workspaceName, inviteLink));
      setInvitedIds((prev) => {
        const next = new Set(prev);
        next.add(friendId);
        return next;
      });
    },
    [sendMessage, workspaceName, inviteLink],
  );

  const menu =
    open && menuPos
      ? createPortal(
          <>
            <button
              type="button"
              className="workspace-invite__backdrop"
              aria-label="Fermer"
              onClick={() => setOpen(false)}
            />
            <div
              className="workspace-invite__menu top-overlay--popup-left"
              style={{ top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
              role="dialog"
              aria-label={`Inviter dans ${workspaceName}`}
            >
              <header className="workspace-invite__header">
                <p className="workspace-invite__eyebrow">Inviter dans</p>
                <p className="workspace-invite__title" title={workspaceName}>
                  {workspaceName}
                </p>
              </header>

              <section className="workspace-invite__section">
                {sortedFriends.length === 0 ? (
                  <p className="workspace-invite__empty">
                    Ajoutez des amis depuis les paramètres pour les inviter directement.
                  </p>
                ) : (
                  <ul className="workspace-invite__friends">
                    {sortedFriends.map((friend) => {
                      const invited = invitedIds.has(friend.id);
                      return (
                        <li key={friend.id} className="workspace-invite__friend">
                          <div className="workspace-invite__friend-main">
                            <span
                              className="workspace-invite__avatar"
                              style={{ backgroundColor: avatarColor(friend.id) }}
                              aria-hidden
                            >
                              {userInitials(friend.name)}
                            </span>
                            <span className="workspace-invite__friend-name">{friend.name}</span>
                          </div>
                          <button
                            type="button"
                            className={clsx(
                              "workspace-invite__friend-action",
                              invited && "workspace-invite__friend-action--done",
                            )}
                            onClick={() => handleInviteFriend(friend.id)}
                            disabled={invited}
                          >
                            {invited ? (
                              <>
                                Envoyé
                                <Check size={11} strokeWidth={2.5} className="shrink-0 opacity-80" aria-hidden />
                              </>
                            ) : (
                              <>
                                Inviter
                                <ArrowUpRight size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
                              </>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="workspace-invite__section">
                <div className="workspace-invite__section-head">
                  <Link2 size={12} strokeWidth={2.25} aria-hidden />
                  <span>Lien d'invitation</span>
                </div>
                <div className="workspace-invite__link-row">
                  <input
                    type="text"
                    className="workspace-invite__link-input"
                    value={inviteLink}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                    aria-label="Lien d'invitation"
                  />
                  <button
                    type="button"
                    className={clsx(
                      "workspace-invite__friend-action",
                      linkCopied && "workspace-invite__friend-action--done",
                    )}
                    onClick={handleCopyLink}
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
              </section>
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
          "header-chrome-control",
          "header-chrome-circle",
          open && "is-active",
        )}
        onClick={() => setOpen((value) => !value)}
        title={`Inviter dans ${workspaceName}`}
        aria-label={`Inviter dans ${workspaceName}`}
        aria-expanded={open}
      >
        <UserPlus
          size={13}
          strokeWidth={2.25}
          className="header-chrome-circle__icon"
          aria-hidden
        />
      </button>
      {menu}
    </>
  );
}
