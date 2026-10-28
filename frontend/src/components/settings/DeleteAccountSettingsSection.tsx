import { useState } from "react";
import DeletePeopleChatOverlay from "../chat/DeletePeopleChatOverlay";
import { deleteAccount } from "../../lib/accountApi";
import { clearLocalAccountData } from "../../lib/clearLocalAccountData";
import { useAuthStore } from "../../store/useAuthStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";
import SettingsFieldRow from "./SettingsFieldRow";

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
      <section className="settings-preferences__group">
        <h3 className="settings-preferences__title">Compte</h3>
        <div className="settings-field-list">
          <SettingsFieldRow
            label="Supprimer mon compte"
            description="Efface définitivement le profil, les workspaces, chats, connecteurs et la facturation liés à ce compte."
            error={error}
            controlClassName="settings-field-row__control--end"
          >
            <button
              type="button"
              className="btn text-red-300"
              disabled={busy}
              onClick={() => {
                setError(null);
                setConfirmOpen(true);
              }}
            >
              {busy ? "Suppression…" : "Supprimer"}
            </button>
          </SettingsFieldRow>
        </div>
      </section>
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
