import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import clsx from "clsx";

/** Aperçu design : création de groupe figée. Remettre à false pour le comportement réel. */
export const PREVIEW_CREATE_GROUP: boolean = false;

export function useCreateGroupDesignPreview(): void {
  useEffect(() => {
    if (!PREVIEW_CREATE_GROUP) return;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(<CreateGroupChatPreview />);
    return () => {
      root.unmount();
      host.remove();
    };
  }, [PREVIEW_CREATE_GROUP]);
}

function CreateGroupChatPreview() {
  const workspaceId = useStore((s) => s.activeRoomId);
  return <CreateGroupChatOverlay workspaceId={workspaceId} onClose={() => {}} />;
}
import { useAuthStore } from "../../store/useAuthStore";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useStore } from "../../store/useStore";
import UserAvatar from "../UserAvatar";
import { useWorkspacePresenceStore } from "../../store/useWorkspacePresenceStore";
import { buildEligibleGroupChatMembers, collectAllWorkspaceMembers, resolvePersonPhotoURL } from "../../lib/peopleChat";

interface CreateGroupChatOverlayProps {
  workspaceId: string;
  onClose: () => void;
  onCreated?: (threadId: string) => void;
}

export default function CreateGroupChatOverlay({
  workspaceId,
  onClose,
  onCreated,
}: CreateGroupChatOverlayProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const localName = useStore((s) => s.userDisplayName);
  const friends = usePeopleStore((s) => s.friends);
  const createGroupChat = usePeopleStore((s) => s.createGroupChat);
  const membersByWorkspace = useWorkspacePresenceStore((s) => s.membersByWorkspace);
  const personPhotoByUserId = usePeopleStore((s) => s.personPhotoByUserId);

  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.id)), [friends]);

  const eligibleMembers = useMemo(
    () =>
      buildEligibleGroupChatMembers({
        friends,
        workspaceMembers: collectAllWorkspaceMembers(membersByWorkspace),
        localUserId: firebaseUid,
      }),
    [friends, membersByWorkspace, firebaseUid],
  );

  const photoLookup = useMemo(
    () => ({ preferredWorkspaceId: workspaceId, photoCache: personPhotoByUserId }),
    [workspaceId, personPhotoByUserId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const toggleMember = (memberId: string) => {
    setSelectedIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId],
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (PREVIEW_CREATE_GROUP || busy) return;
    setError(null);
    setBusy(true);
    const result = await createGroupChat(name, selectedIds);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Impossible de créer le groupe.");
      return;
    }
    if (result.threadId) onCreated?.(result.threadId);
    onClose();
  };

  return createPortal(
    <>
      <button
        type="button"
        className="join-knock__backdrop"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        className="join-knock group-chat-create-overlay"
        role="dialog"
        aria-labelledby="group-chat-create-title"
      >
        <div className="group-chat-create-overlay__faces" aria-hidden>
          <UserAvatar
            userId={firebaseUid || "local"}
            name={localName || "Vous"}
            isLocal
            className="group-chat-create-overlay__face"
            style={{ zIndex: selectedIds.length + 1 }}
          />
          {selectedIds.map((memberId, index) => {
            const member = eligibleMembers.find((entry) => entry.id === memberId);
            return (
              <UserAvatar
                key={memberId}
                userId={memberId}
                name={member?.name || "Membre"}
                photoURL={resolvePersonPhotoURL(memberId, membersByWorkspace, photoLookup)}
                className="group-chat-create-overlay__face"
                style={{ zIndex: selectedIds.length - index }}
              />
            );
          })}
        </div>

        <form className="group-chat-create-overlay__form" onSubmit={handleSubmit}>
          <input
            ref={nameRef}
            id="group-chat-create-title"
            type="text"
            className="group-chat-create-overlay__title"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New Group Title"
            aria-label="New Group Title"
            maxLength={80}
            autoComplete="off"
          />

          {eligibleMembers.length === 0 ? (
            <p className="group-chat-create-overlay__empty">
              Aucun contact éligible. Ajoutez des amis ou rejoignez un workspace avec d&apos;autres
              membres.
            </p>
          ) : (
            <ul className="group-chat-create-overlay__members">
              {eligibleMembers.map((member) => {
                const selected = selectedIds.includes(member.id);
                const isFriend = friendIds.has(member.id);
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      className={clsx(
                        "group-chat-create-overlay__member",
                        selected && "group-chat-create-overlay__member--selected",
                      )}
                      onClick={() => toggleMember(member.id)}
                      aria-pressed={selected}
                    >
                      <UserAvatar
                        userId={member.id}
                        name={member.name}
                        photoURL={resolvePersonPhotoURL(
                          member.id,
                          membersByWorkspace,
                          photoLookup,
                        )}
                        className="group-chat-create-overlay__avatar"
                      />
                      <span className="group-chat-create-overlay__member-meta">
                        <span className="group-chat-create-overlay__member-name">{member.name}</span>
                        <span className="group-chat-create-overlay__member-kind">
                          {isFriend ? "Ami" : "Workspace"}
                        </span>
                      </span>
                      <span className="group-chat-create-overlay__check" aria-hidden>
                        {selected ? "✓" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error ? <p className="group-chat-create-overlay__error">{error}</p> : null}

          <div className="join-knock__actions join-knock__actions--split">
            <button type="button" className="join-knock__btn" onClick={onClose}>
              Annuler
            </button>
            <button
              type="submit"
              className="join-knock__btn"
              disabled={
                busy ||
                !name.trim() ||
                selectedIds.length === 0 ||
                !firebaseUid ||
                eligibleMembers.length === 0
              }
            >
              {busy ? "Création…" : "Créer le groupe"}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}
