import { useState } from "react";
import DeletePeopleChatOverlay from "../chat/DeletePeopleChatOverlay";
import { deleteAccount } from "../../lib/accountApi";
import { clearLocalAccountData } from "../../lib/clearLocalAccountData";
import { useAuthStore } from "../../store/useAuthStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";

export default function DeleteAccountSettingsSection() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const signOut = useAuthStore((s) => s.signOut);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) return null;

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      await clearLocalAccountData();
      useWorkspacesStore.getState().resetLocalMemberships();
      await signOut();
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
      setBusy(false);
    }
  };

  return (
    <>
      <div className="settings-section__stack">
        {error ? <p className="settings-section__hint text-red-400">{error}</p> : null}
        <button
          type="button"
          className="settings-option settings-option--danger"
          disabled={busy}
          onClick={() => {
            setError(null);
            setConfirmOpen(true);
          }}
        >
          <span className="settings-option__title">Supprimer mon compte</span>
          <span className="settings-option__subtitle">
            Efface définitivement le profil, les workspaces, chats, connecteurs et la facturation
            liés à ce compte.
          </span>
        </button>
      </div>
      {confirmOpen ? (
        <DeletePeopleChatOverlay
          title="Supprimer votre compte ?"
          hint="Cette action est irréversible. Votre profil, vos workspaces, conversations, enregistrements, connecteurs et abonnement liés à ce compte seront définitivement supprimés."
          confirmLabel="Supprimer définitivement"
          busy={busy}
          onConfirm={() => void handleConfirm()}
          onCancel={() => {
            if (!busy) setConfirmOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
