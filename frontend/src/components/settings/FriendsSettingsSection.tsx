import { useEffect, useMemo, useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { resolvePersonPhotoURL } from "../../lib/peopleChat";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useStore } from "../../store/useStore";
import { useWorkspacePresenceStore } from "../../store/useWorkspacePresenceStore";
import UserAvatar from "../UserAvatar";

export default function FriendsSettingsSection() {
  const friends = usePeopleStore((s) => s.friends);
  const personPhotoByUserId = usePeopleStore((s) => s.personPhotoByUserId);
  const hydratePersonPhotos = usePeopleStore((s) => s.hydratePersonPhotos);
  const sendFriendRequest = usePeopleStore((s) => s.sendFriendRequest);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const membersByWorkspace = useWorkspacePresenceStore((s) => s.membersByWorkspace);

  const photoLookup = useMemo(
    () => ({ preferredWorkspaceId: activeRoomId, photoCache: personPhotoByUserId }),
    [activeRoomId, personPhotoByUserId],
  );

  useEffect(() => {
    if (friends.length === 0) return;
    void hydratePersonPhotos(friends.map((friend) => friend.id));
  }, [friends, hydratePersonPhotos]);

  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSent(false);
    setSending(true);
    try {
      const result = await sendFriendRequest(handle);
      if (!result.ok) {
        setError(result.error ?? "Impossible d'envoyer la demande.");
        return;
      }
      setHandle("");
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="settings-section settings-section--card">
      <h3 className="settings-section__label">Amis</h3>
      <p className="settings-section__hint">
        Ajoutez des amis par email. Les collègues restent limités au workspace actif.
      </p>

      <form onSubmit={onSubmit} className="settings-section__inline-form">
        <input
          type="text"
          className="input min-w-0 flex-1"
          placeholder="Adresse email"
          value={handle}
          disabled={sending}
          onChange={(e) => {
            setHandle(e.target.value);
            setError(null);
            setSent(false);
          }}
        />
        <button type="submit" className="btn shrink-0 gap-1.5" disabled={!handle.trim() || sending}>
          <UserPlus size={14} aria-hidden />
          {sending ? "Ajout…" : "Ajouter"}
        </button>
      </form>
      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
      {sent && (
        <p className="mt-2 text-[11px] text-muted-400">Demande d&apos;ami envoyée.</p>
      )}

      {friends.length === 0 ? (
        <p className="settings-section__meta mt-4">Aucun ami pour le moment.</p>
      ) : (
        <ul className="settings-friends-list mt-4 border-t border-ink-700 pt-4">
          {friends.map((friend) => (
            <li key={friend.id} className="settings-friends-list__row">
              <UserAvatar
                userId={friend.id}
                name={friend.name}
                photoURL={resolvePersonPhotoURL(friend.id, membersByWorkspace, photoLookup)}
                className="settings-friends-list__avatar"
              />
              <span className="settings-friends-list__main">
                <span className="settings-friends-list__name">{friend.name}</span>
                <span className="settings-friends-list__meta">@{friend.handle}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
