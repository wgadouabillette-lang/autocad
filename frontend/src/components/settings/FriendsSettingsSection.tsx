import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { usePeopleStore } from "../../store/usePeopleStore";

export default function FriendsSettingsSection() {
  const friends = usePeopleStore((s) => s.friends);
  const sendFriendRequest = usePeopleStore((s) => s.sendFriendRequest);

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
