import { useState, type FormEvent } from "react";
import clsx from "clsx";
import { Check, UserPlus, X } from "lucide-react";
import { usePeopleStore } from "../../store/usePeopleStore";

export default function FriendsSettingsSection() {
  const friends = usePeopleStore((s) => s.friends);
  const friendRequests = usePeopleStore((s) => s.friendRequests);
  const sendFriendRequest = usePeopleStore((s) => s.sendFriendRequest);
  const acceptFriendRequest = usePeopleStore((s) => s.acceptFriendRequest);
  const declineFriendRequest = usePeopleStore((s) => s.declineFriendRequest);

  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [requestActionBusy, setRequestActionBusy] = useState<string | null>(null);

  const incoming = friendRequests.filter((r) => r.status === "pending" && !r.outgoing);
  const outgoing = friendRequests.filter((r) => r.status === "pending" && r.outgoing);

  async function handleAccept(requestId: string) {
    setRequestActionBusy(requestId);
    try {
      await acceptFriendRequest(requestId);
    } finally {
      setRequestActionBusy(null);
    }
  }

  async function handleDecline(requestId: string) {
    setRequestActionBusy(requestId);
    try {
      await declineFriendRequest(requestId);
    } finally {
      setRequestActionBusy(null);
    }
  }

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
    <section className="settings-section">
      <h3 className="settings-section__label">Ajouter un ami</h3>
      <p className="settings-section__hint">
        Les collègues restent limités au workspace actif.
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

      {incoming.length > 0 && (
        <div className="settings-subsection">
          <h4 className="settings-subsection__label">Demandes reçues</h4>
          <ul className="mt-2 flex flex-col gap-1.5">
            {incoming.map((req) => (
              <li
                key={req.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5"
              >
                <span className="min-w-0 text-sm text-muted-100">{req.from.name}</span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="toolbar-btn text-muted-300 hover:text-muted-100"
                    title="Accepter"
                    aria-label={`Accepter ${req.from.name}`}
                    disabled={requestActionBusy === req.id}
                    onClick={() => void handleAccept(req.id)}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn text-muted-400 hover:text-red-300"
                    title="Refuser"
                    aria-label={`Refuser ${req.from.name}`}
                    disabled={requestActionBusy === req.id}
                    onClick={() => void handleDecline(req.id)}
                  >
                    <X size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="settings-subsection">
          <h4 className="settings-subsection__label">En attente</h4>
          <ul className="mt-2 flex flex-col gap-1.5">
            {outgoing.map((req) => (
              <li
                key={req.id}
                className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-muted-400"
              >
                {req.from.name}
                <span className="ml-2 text-[11px] text-muted-500">— envoyée</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="settings-subsection">
        <h4 className="settings-subsection__label">Vos amis</h4>
        {friends.length === 0 ? (
          <p className="mt-2 text-[11px] text-muted-500">Aucun ami pour le moment.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {friends.map((friend) => (
              <li
                key={friend.id}
                className={clsx(
                  "rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-muted-200",
                )}
              >
                {friend.name}
                <span className="ml-2 text-[11px] text-muted-500">@{friend.handle}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
