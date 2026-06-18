import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Users } from "lucide-react";
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
    if (busy) return;
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
        <div className="group-chat-create-overlay__icon" aria-hidden>
          <Users size={24} strokeWidth={1.75} />
        </div>

        <p id="group-chat-create-title" className="join-knock__title">
          Nouveau groupe
        </p>
        <p className="join-knock__hint">
          Ajoutez vos amis ou des personnes avec qui vous partagez un workspace.
        </p>

        <form className="group-chat-create-overlay__form" onSubmit={handleSubmit}>
          <label className="group-chat-create-overlay__label" htmlFor="group-chat-name">
            Nom du groupe
          </label>
          <input
            ref={nameRef}
            id="group-chat-name"
            type="text"
            className="group-chat-create-overlay__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Équipe produit, Projet Acme…"
            maxLength={80}
            autoComplete="off"
          />

          <p className="group-chat-create-overlay__label">Membres</p>
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

          <div className="group-chat-create-overlay__actions">
            <button type="button" className="group-chat-create-overlay__ghost" onClick={onClose}>
              Annuler
            </button>
            <button
              type="submit"
              className="group-chat-create-overlay__submit"
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
